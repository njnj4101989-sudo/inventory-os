import { useState, useEffect, useCallback } from 'react'
import { getInventory, getEvents, adjust, reconcile } from '../api/inventory'
import { getInventorySummary } from '../api/dashboard'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'
import SearchInput from '../components/common/SearchInput'

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
  { key: 'BLS', label: 'Blouse (BLS)' },
  { key: 'KRT', label: 'Kurta (KRT)' },
  { key: 'SAR', label: 'Saree (SAR)' },
  { key: 'DRS', label: 'Dress (DRS)' },
  { key: 'OTH', label: 'Other (OTH)' },
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
            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.badge}`}>
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

export default function InventoryPage() {
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
          <button onClick={handleReconcile} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reconcile
            </span>
          </button>
          <button onClick={() => { setAdjustError(null); setAdjustOpen(true) }} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Adjust Stock
            </span>
          </button>
        </div>
      </div>

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
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                stockStatus === f.key
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-gray-200" />

        {/* Product Type Dropdown */}
        <select
          value={productType}
          onChange={(e) => { setProductType(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {PRODUCT_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>

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

      {/* Events Modal */}
      <Modal
        open={eventsOpen}
        onClose={() => setEventsOpen(false)}
        title={selectedSku ? `Stock Events — ${selectedSku.sku_code}` : 'Inventory Events'}
        wide
        actions={
          <button onClick={() => setEventsOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Close</button>
        }
      >
        {eventsLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
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
            <button onClick={() => setAdjustOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleAdjust} disabled={adjusting || !adjustForm.sku_id || !adjustForm.quantity}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 transition-colors">
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
              <option value="">Select SKU</option>
              {items.map((inv) => (
                <option key={inv.sku.id} value={inv.sku.id}>{inv.sku.sku_code} — {inv.sku.product_name} (avail: {inv.available_qty})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="typo-label">Event Type</label>
            <select value={adjustForm.event_type} onChange={(e) => setAdjustForm((f) => ({ ...f, event_type: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
              <option value="ADJUSTMENT">Adjustment (+/-)</option>
              <option value="LOSS">Loss (shrinkage/damage)</option>
              <option value="RETURN">Return (from customer)</option>
            </select>
          </div>
          <div>
            <label className="typo-label">Quantity</label>
            <input type="number" value={adjustForm.quantity} onChange={(e) => setAdjustForm((f) => ({ ...f, quantity: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="Positive to add, negative to remove" />
          </div>
          <div>
            <label className="typo-label">Reason</label>
            <textarea value={adjustForm.reason} onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))} rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="Reason for this adjustment..." />
          </div>
        </div>
      </Modal>
    </div>
  )
}
