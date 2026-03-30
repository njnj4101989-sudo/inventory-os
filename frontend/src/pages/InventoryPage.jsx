import { useState, useEffect, useCallback } from 'react'
import { getInventory, getEvents, adjust, reconcile } from '../api/inventory'
import { getInventorySummary, getRawMaterialSummary, getWIPSummary } from '../api/dashboard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'
import SearchInput from '../components/common/SearchInput'
import FilterSelect from '../components/common/FilterSelect'

// ── Stock health helpers ──────────────────────────────
function stockLevel(available, total) {
  if (total === 0) return 'none'
  const pct = (available / total) * 100
  if (pct <= 0) return 'critical'
  if (pct < 25) return 'low'
  if (pct < 60) return 'moderate'
  return 'healthy'
}

const LEVEL_CONFIG = {
  healthy:  { bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', label: 'Healthy' },
  moderate: { bar: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 ring-amber-600/20',     label: 'Moderate' },
  low:      { bar: 'bg-orange-500',  badge: 'bg-orange-50 text-orange-700 ring-orange-600/20',   label: 'Low' },
  critical: { bar: 'bg-red-500',     badge: 'bg-red-50 text-red-700 ring-red-600/20',            label: 'Critical' },
  none:     { bar: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-500 ring-gray-600/20',         label: 'No Stock' },
}

const STOCK_FILTERS = [
  { key: '', label: 'All' },
  { key: 'healthy', label: 'Healthy' },
  { key: 'low', label: 'Low Stock' },
  { key: 'critical', label: 'Out of Stock' },
]

const PRODUCT_TYPES = [
  { key: '', label: 'All Types' },
  { key: 'FBL', label: 'Fancy Blouse (FBL)' },
  { key: 'SBL', label: 'Stretchable Blouse (SBL)' },
  { key: 'LHG', label: 'Lehenga (LHG)' },
  { key: 'SAR', label: 'Saree (SAR)' },
]

// ── Table columns ─────────────────────────────────────
const COLUMNS = [
  {
    key: 'sku',
    label: 'SKU Code',
    render: (val) => (
      <div>
        <span className="font-semibold text-gray-900">{val?.sku_code}</span>
        <p className="text-xs text-gray-500 mt-0.5">{val?.product_name}</p>
      </div>
    ),
  },
  {
    key: '_health',
    label: 'Stock Health',
    render: (_, row) => {
      const level = stockLevel(row.available_qty, row.total_qty)
      const cfg = LEVEL_CONFIG[level]
      const pct = row.total_qty > 0 ? Math.round((row.available_qty / row.total_qty) * 100) : 0
      return (
        <div className="min-w-[140px]">
          <div className="flex items-center justify-between mb-1">
            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 typo-badge ring-1 ring-inset ${cfg.badge}`}>
              {cfg.label}
            </span>
            <span className="text-xs text-gray-500">{pct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${cfg.bar}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )
    },
  },
  {
    key: 'total_qty',
    label: 'Total',
    render: (val) => <span className="font-semibold text-gray-900">{val.toLocaleString()}</span>,
  },
  {
    key: 'available_qty',
    label: 'Available',
    render: (val) => <span className="text-emerald-600 font-semibold">{val.toLocaleString()}</span>,
  },
  {
    key: 'reserved_qty',
    label: 'Reserved',
    render: (val) => val > 0
      ? <span className="text-amber-600 font-medium">{val.toLocaleString()}</span>
      : <span className="text-gray-400">0</span>,
  },
  {
    key: '_value',
    label: 'Inventory Value',
    render: (_, row) => {
      const price = row.sku?.base_price || 0
      const value = row.available_qty * price
      return (
        <div>
          <span className="font-semibold text-gray-900">{'\u20B9'}{value.toLocaleString()}</span>
          <p className="text-xs text-gray-400">@{'\u20B9'}{price}/pc</p>
        </div>
      )
    },
  },
  {
    key: 'last_updated',
    label: 'Updated',
    render: (val) => val ? (
      <span className="text-xs text-gray-500">{new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
    ) : '—',
  },
]

const EVENT_COLUMNS = [
  { key: 'event_type', label: 'Type', render: (val) => <StatusBadge status={val} /> },
  { key: 'item_type', label: 'Item', render: (val) => <span className="capitalize text-xs">{val?.replace('_', ' ')}</span> },
  { key: 'quantity', label: 'Qty', render: (val) => <span className="font-semibold">{val}</span> },
  { key: 'performed_by', label: 'By', render: (val) => val?.full_name || '—' },
  {
    key: 'performed_at', label: 'When',
    render: (val) => val ? new Date(val).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—',
  },
]

// ── KPI Card Component ────────────────────────────────
function KpiCard({ label, value, sub, icon, color }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="typo-kpi-label">{label}</p>
          <p className="mt-1 typo-kpi">{value}</p>
          {sub && <p className="mt-1 typo-caption">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
          </svg>
        </div>
      </div>
    </div>
  )
}

// ── Inventory Tab Config ─────────────────────────────
const INV_TABS = [
  { key: 'finished', label: 'Finished Goods', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { key: 'raw', label: 'Raw Material', icon: 'M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7l8-4 8 4M4 7l8 4 8-4' },
  { key: 'wip', label: 'Work in Progress', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
]

// ── Raw Material Tab ─────────────────────────────────
function RawMaterialTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRawMaterialSummary()
      .then(res => setData(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" text="Loading raw material..." /></div>
  if (!data) return <p className="typo-empty py-8 text-center">Failed to load raw material data.</p>

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Total Rolls" value={data.total_rolls} sub={`${data.rolls_in_stock} in stock`}
          icon="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7" color="bg-blue-500" />
        <KpiCard label="Total Weight" value={`${data.total_weight_kg.toLocaleString()} kg`} sub={`In stock: ${data.weight_in_stock.toLocaleString()} kg`}
          icon="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l3 9a5.002 5.002 0 006.001 0M18 7l-3 9m0-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" color="bg-emerald-500" />
        <KpiCard label="At VA" value={data.rolls_at_va} sub={`${data.weight_at_va.toLocaleString()} kg`}
          icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" color="bg-amber-500" />
        <KpiCard label="In Cutting" value={data.rolls_in_cutting} sub={`${data.remnant_rolls} remnants`}
          icon="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" color="bg-purple-500" />
        <KpiCard label="Inventory Value" value={`\u20B9${data.total_value.toLocaleString()}`} sub="Remaining stock value"
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" color="bg-violet-500" />
      </div>

      {/* By Fabric */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-4">By Fabric Type</h3>
        {data.by_fabric.length === 0
          ? <p className="typo-empty py-4 text-center">No roll data.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Fabric</th>
                    <th className="pb-3 font-medium">Rolls</th>
                    <th className="pb-3 font-medium">Weight (kg)</th>
                    <th className="pb-3 font-medium">Value</th>
                    <th className="pb-3 font-medium">In Stock</th>
                    <th className="pb-3 font-medium">At VA</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_fabric.map((r, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 font-semibold">{r.fabric_type}</td>
                      <td className="py-3">{r.roll_count}</td>
                      <td className="py-3 font-medium">{r.total_weight.toFixed(1)}</td>
                      <td className="py-3 text-emerald-600 font-medium">{'\u20B9'}{r.value.toLocaleString()}</td>
                      <td className="py-3">{r.in_stock}</td>
                      <td className="py-3">{r.at_va > 0 ? <span className="text-amber-600">{r.at_va}</span> : '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* By Supplier */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-4">By Supplier</h3>
        {data.by_supplier.length === 0
          ? <p className="typo-empty py-4 text-center">No supplier data.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Supplier</th>
                    <th className="pb-3 font-medium">Rolls</th>
                    <th className="pb-3 font-medium">Weight (kg)</th>
                    <th className="pb-3 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_supplier.map((r, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 font-semibold">{r.supplier_name}</td>
                      <td className="py-3">{r.roll_count}</td>
                      <td className="py-3 font-medium">{r.total_weight.toFixed(1)}</td>
                      <td className="py-3 text-emerald-600 font-medium">{'\u20B9'}{r.value.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  )
}

// ── WIP Tab ──────────────────────────────────────────
function WIPTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getWIPSummary()
      .then(res => setData(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" text="Loading WIP data..." /></div>
  if (!data) return <p className="typo-empty py-8 text-center">Failed to load WIP data.</p>

  const PIPELINE = ['created', 'assigned', 'in_progress', 'submitted', 'checked', 'packing']
  const PIPE_COLORS = {
    created: 'bg-gray-100 text-gray-700',
    assigned: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-indigo-100 text-indigo-700',
    submitted: 'bg-purple-100 text-purple-700',
    checked: 'bg-emerald-100 text-emerald-700',
    packing: 'bg-amber-100 text-amber-700',
  }
  const PIPE_LABELS = {
    created: 'Created', assigned: 'Assigned', in_progress: 'In Progress',
    submitted: 'Submitted', checked: 'Checked', packing: 'Packing',
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Batches in Pipeline" value={data.total_batches} sub={`${data.total_pieces} pieces total`}
          icon="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" color="bg-blue-500" />
        <KpiCard label="Total Pieces" value={data.total_pieces.toLocaleString()} sub="Across all stages"
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" color="bg-purple-500" />
        <KpiCard label="At VA Vendor" value={`${data.batches_at_va} batches`} sub={`${data.pieces_at_va} pieces out`}
          icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" color="bg-amber-500" />
        <KpiCard label="Avg Days in Pipeline" value={`${data.avg_days_in_pipeline}d`}
          sub={data.avg_days_in_pipeline <= 7 ? 'Healthy pace' : 'Consider follow-up'}
          icon="M13 10V3L4 14h7v7l9-11h-7z"
          color={data.avg_days_in_pipeline <= 7 ? 'bg-emerald-500' : 'bg-red-500'} />
      </div>

      {/* Pipeline Stages */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-4">Production Pipeline</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {PIPELINE.map((stage) => {
            const s = data.by_status[stage] || { count: 0, pieces: 0 }
            return (
              <div key={stage} className={`rounded-lg p-4 text-center ${PIPE_COLORS[stage]}`}>
                <p className="typo-kpi-label">{PIPE_LABELS[stage]}</p>
                <p className="typo-kpi mt-1">{s.count}</p>
                <p className="typo-caption mt-1">{s.pieces} pcs</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* By Product Type + By Tailor side-by-side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="typo-section-title mb-4">By Product Type</h3>
          {data.by_product_type.length === 0
            ? <p className="typo-empty py-4 text-center">No WIP data.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Product Type</th>
                    <th className="pb-3 font-medium">Batches</th>
                    <th className="pb-3 font-medium">Pieces</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_product_type.map((r, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 font-semibold">{r.product_type}</td>
                      <td className="py-3">{r.batch_count}</td>
                      <td className="py-3 font-medium">{r.piece_count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="typo-section-title mb-4">By Tailor</h3>
          {data.by_tailor.length === 0
            ? <p className="typo-empty py-4 text-center">No assigned batches.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Tailor</th>
                    <th className="pb-3 font-medium">Batches</th>
                    <th className="pb-3 font-medium">Pieces</th>
                    <th className="pb-3 font-medium">Active</th>
                    <th className="pb-3 font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_tailor.map((r, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 font-semibold">{r.tailor_name}</td>
                      <td className="py-3">{r.batch_count}</td>
                      <td className="py-3 font-medium">{r.piece_count.toLocaleString()}</td>
                      <td className="py-3">{r.in_progress > 0 ? <span className="text-indigo-600">{r.in_progress}</span> : '0'}</td>
                      <td className="py-3">{r.submitted > 0 ? <span className="text-purple-600">{r.submitted}</span> : '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  )
}

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState('finished')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [stockStatus, setStockStatus] = useState('')
  const [productType, setProductType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Summary KPIs
  const [kpi, setKpi] = useState(null)

  // Events modal
  const [eventsOpen, setEventsOpen] = useState(false)
  const [selectedSku, setSelectedSku] = useState(null)
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)

  // Adjust modal
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustForm, setAdjustForm] = useState({ sku_id: '', event_type: 'ADJUSTMENT', quantity: '', reason: '' })
  const [adjusting, setAdjusting] = useState(false)
  const [adjustError, setAdjustError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getInventory({
        page, page_size: 20,
        sku_code: search || undefined,
        stock_status: stockStatus || undefined,
        product_type: productType || undefined,
      })
      setItems(res.data.data)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }, [page, search, stockStatus, productType])

  useEffect(() => { fetchData() }, [fetchData])

  // Fetch KPIs once
  useEffect(() => {
    getInventorySummary()
      .then((res) => setKpi(res.data.data))
      .catch((e) => console.error('Failed to load inventory KPI:', e.message))
  }, [])

  const handleRowClick = async (row) => {
    setSelectedSku(row.sku)
    setEventsOpen(true)
    setEventsLoading(true)
    try {
      const res = await getEvents(row.sku.id)
      setEvents(res.data.data)
    } catch {
      setEvents([])
    } finally {
      setEventsLoading(false)
    }
  }

  const handleAdjust = async () => {
    setAdjusting(true)
    setAdjustError(null)
    try {
      const res = await adjust({
        sku_id: adjustForm.sku_id || items[0]?.sku?.id,
        event_type: adjustForm.event_type,
        quantity: parseInt(adjustForm.quantity),
        reason: adjustForm.reason,
      })
      setAdjustOpen(false)
      setAdjustForm({ sku_id: '', event_type: 'ADJUSTMENT', quantity: '', reason: '' })
      setSuccessMsg(res.data.message)
      fetchData()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setAdjustError(err.response?.data?.detail || 'Adjustment failed')
    } finally {
      setAdjusting(false)
    }
  }

  const handleReconcile = async () => {
    try {
      const res = await reconcile()
      setSuccessMsg(res.data.message)
      fetchData()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Reconciliation failed')
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="typo-page-title">Inventory</h1>
          <p className="mt-1 typo-caption">Real-time stock levels, health tracking, and adjustments</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReconcile} className="rounded-lg border border-gray-300 px-4 py-2 typo-btn-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reconcile
            </span>
          </button>
          <button onClick={() => { setAdjustError(null); setAdjustOpen(true) }} className="rounded-lg bg-emerald-600 px-4 py-2 typo-btn-sm text-white hover:bg-emerald-700 transition-colors">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Adjust Stock
            </span>
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="mt-6 flex gap-6 border-b border-gray-200">
        {INV_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-1.5 pb-2.5 typo-tab border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Raw Material Tab */}
      {activeTab === 'raw' && <div className="mt-6"><RawMaterialTab /></div>}

      {/* WIP Tab */}
      {activeTab === 'wip' && <div className="mt-6"><WIPTab /></div>}

      {/* Finished Goods Tab (original content) */}
      {activeTab !== 'finished' ? null : <>

      {/* KPI Cards */}
      {kpi && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total Pieces"
            value={kpi.total_pieces.toLocaleString()}
            sub={`Across ${kpi.total_skus} SKUs`}
            icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            color="bg-blue-500"
          />
          <KpiCard
            label="Available"
            value={kpi.available_pieces.toLocaleString()}
            sub={`${Math.round((kpi.available_pieces / kpi.total_pieces) * 100)}% of total stock`}
            icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            color="bg-emerald-500"
          />
          <KpiCard
            label="Reserved"
            value={kpi.reserved_pieces.toLocaleString()}
            sub={`${kpi.low_stock_count} low stock alerts`}
            icon="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            color="bg-amber-500"
          />
          <KpiCard
            label="Inventory Value"
            value={`\u20B9${kpi.total_inventory_value.toLocaleString()}`}
            sub={`Avg \u20B9${Math.round(kpi.total_inventory_value / kpi.total_skus).toLocaleString()}/SKU`}
            icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            color="bg-violet-500"
          />
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="mt-6 flex items-center gap-3 flex-wrap rounded-xl bg-white p-4 shadow-sm border border-gray-100">
        {/* Stock Status Pills */}
        <div className="flex gap-1.5">
          {STOCK_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => { setStockStatus(f.key); setPage(1) }}
              className={`rounded-full px-3 py-1.5 typo-btn-sm transition-all ${
                stockStatus === f.key
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-gray-200" />

        {/* Product Type Dropdown */}
        <FilterSelect value={productType} onChange={(v) => { setProductType(v); setPage(1) }}
          options={PRODUCT_TYPES.map(t => ({ value: t.key, label: t.label }))} />

        <div className="ml-auto w-64">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search SKU or product..." />
        </div>
      </div>

      {/* Status Messages */}
      {successMsg && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {successMsg}
        </div>
      )}
      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      {/* Data Table */}
      <div className="mt-4">
        <DataTable columns={COLUMNS} data={items} loading={loading} onRowClick={handleRowClick} emptyText="No inventory data matching filters." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      </>}

      {/* Events Modal */}
      <Modal
        open={eventsOpen}
        onClose={() => setEventsOpen(false)}
        title={selectedSku ? `Stock Events — ${selectedSku.sku_code}` : 'Inventory Events'}
        wide
        actions={
          <button onClick={() => setEventsOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 typo-btn-sm text-gray-600 hover:bg-gray-50">Close</button>
        }
      >
        {eventsLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8">
            <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="mt-2 text-sm text-gray-500">No events recorded for this SKU.</p>
          </div>
        ) : (
          <DataTable columns={EVENT_COLUMNS} data={events} emptyText="No events." />
        )}
      </Modal>

      {/* Adjust Modal */}
      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Adjust Stock"
        actions={
          <>
            <button onClick={() => setAdjustOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 typo-btn-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleAdjust} disabled={adjusting || !adjustForm.sku_id || !adjustForm.quantity}
              className="rounded-lg bg-emerald-600 px-4 py-2 typo-btn-sm text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {adjusting ? 'Applying...' : 'Apply Adjustment'}
            </button>
          </>
        }
      >
        {adjustError && <div className="mb-4"><ErrorAlert message={adjustError} onDismiss={() => setAdjustError(null)} /></div>}
        <div className="space-y-4">
          <div>
            <label className="typo-label">SKU</label>
            <select value={adjustForm.sku_id} onChange={(e) => setAdjustForm((f) => ({ ...f, sku_id: e.target.value }))}
              className="typo-input">
              <option value="">Select SKU</option>
              {items.map((inv) => (
                <option key={inv.sku.id} value={inv.sku.id}>{inv.sku.sku_code} — {inv.sku.product_name} (avail: {inv.available_qty})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="typo-label">Event Type</label>
            <select value={adjustForm.event_type} onChange={(e) => setAdjustForm((f) => ({ ...f, event_type: e.target.value }))}
              className="typo-input">
              <option value="ADJUSTMENT">Adjustment (+/-)</option>
              <option value="LOSS">Loss (shrinkage/damage)</option>
              <option value="RETURN">Return (from customer)</option>
            </select>
          </div>
          <div>
            <label className="typo-label">Quantity</label>
            <input type="number" value={adjustForm.quantity} onChange={(e) => setAdjustForm((f) => ({ ...f, quantity: e.target.value }))}
              className="typo-input"
              placeholder="Positive to add, negative to remove" />
          </div>
          <div>
            <label className="typo-label">Reason</label>
            <textarea value={adjustForm.reason} onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))} rows={2}
              className="typo-input"
              placeholder="Reason for this adjustment..." />
          </div>
        </div>
      </Modal>
    </div>
  )
}
