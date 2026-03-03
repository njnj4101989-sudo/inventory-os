import { useState, useEffect, useCallback, useMemo } from 'react'
import { getSKUs, getSKU, createSKU, updateSKU } from '../api/skus'
import { colorHex, loadColorMap } from '../utils/colorUtils'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import ErrorAlert from '../components/common/ErrorAlert'
import StatusBadge from '../components/common/StatusBadge'
import SKUForm from '../components/forms/SKUForm'

const VA_COLORS = {
  EMB: { bg: 'bg-purple-100', text: 'text-purple-700', dot: '#a855f7' },
  DYE: { bg: 'bg-amber-100', text: 'text-amber-700', dot: '#d97706' },
  DPT: { bg: 'bg-sky-100', text: 'text-sky-700', dot: '#0284c7' },
  HWK: { bg: 'bg-rose-100', text: 'text-rose-700', dot: '#e11d48' },
  SQN: { bg: 'bg-pink-100', text: 'text-pink-700', dot: '#ec4899' },
  BTC: { bg: 'bg-teal-100', text: 'text-teal-700', dot: '#14b8a6' },
  HST: { bg: 'bg-orange-100', text: 'text-orange-700', dot: '#ea580c' },
  BTN: { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: '#4f46e5' },
  LCW: { bg: 'bg-lime-100', text: 'text-lime-700', dot: '#65a30d' },
  FIN: { bg: 'bg-cyan-100', text: 'text-cyan-700', dot: '#0891b2' },
}
const DEFAULT_VA = { bg: 'bg-gray-100', text: 'text-gray-700', dot: '#9ca3af' }

/** Parse SKU code: BLS-702-Red-XL+EMB+BTN → {base, vas} */
function parseSKU(code) {
  if (!code) return { base: '', type: '', design: '', color: '', size: '', vas: [] }
  const plusIdx = code.indexOf('+')
  const basePart = plusIdx > -1 ? code.slice(0, plusIdx) : code
  const vas = plusIdx > -1 ? code.slice(plusIdx + 1).split('+').filter(Boolean) : []
  const parts = basePart.split('-')
  return {
    base: basePart,
    type: parts[0] || '',
    design: parts[1] || '',
    color: parts[2] || '',
    size: parts[3] || '',
    vas,
  }
}

function SKUCodeDisplay({ code, large }) {
  const { base, vas } = parseSKU(code)
  return (
    <span className={`inline-flex items-center gap-1 flex-wrap ${large ? '' : ''}`}>
      <span className={`font-semibold text-gray-800 ${large ? 'text-lg' : ''}`}>{base}</span>
      {vas.map(va => {
        const c = VA_COLORS[va] || DEFAULT_VA
        return <span key={va} className={`rounded px-1 py-0.5 ${large ? 'text-xs' : 'text-[10px]'} font-bold leading-none ${c.bg} ${c.text}`}>+{va}</span>
      })}
    </span>
  )
}

function StockIndicator({ stock }) {
  if (!stock) return <span className="text-gray-400 text-xs">—</span>
  const { total_qty, available_qty, reserved_qty } = stock
  const isOut = available_qty <= 0 && total_qty === 0
  const isLow = available_qty > 0 && total_qty > 0 && (available_qty / total_qty) < 0.3
  return (
    <div className="text-xs space-y-0.5">
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-green-500'}`} />
        <span className="font-semibold text-gray-800">{available_qty}</span>
        <span className="text-gray-400">/ {total_qty}</span>
      </div>
      {reserved_qty > 0 && (
        <span className="text-yellow-600 text-[10px]">{reserved_qty} reserved</span>
      )}
    </div>
  )
}

const COLUMNS = [
  {
    key: 'sku_code', label: 'SKU Code',
    render: (val) => <SKUCodeDisplay code={val} />,
  },
  {
    key: 'color', label: 'Color',
    render: (val) => val ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0"
          style={{ backgroundColor: colorHex(val) }} />
        <span className="text-sm">{val}</span>
      </span>
    ) : '—',
  },
  { key: 'size', label: 'Size', render: (val) => val ? <span className="font-semibold">{val}</span> : '—' },
  { key: 'product_type', label: 'Type', render: (val) => <span className="text-xs font-medium text-gray-500">{val}</span> },
  {
    key: 'base_price', label: 'Price',
    render: (val) => val && val > 0 ? (
      <span className="font-medium">₹{parseFloat(val).toLocaleString('en-IN')}</span>
    ) : (
      <span className="text-gray-400 text-xs">Set price</span>
    ),
  },
  {
    key: 'stock', label: 'Stock',
    render: (val) => <StockIndicator stock={val} />,
  },
  {
    key: 'is_active', label: 'Status',
    render: (val) => (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
        val ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}>
        {val ? 'Active' : 'Inactive'}
      </span>
    ),
  },
]

const PRODUCT_TYPES = ['BLS', 'KRT', 'SAR', 'DRS', 'OTH']
const EMPTY_FORM = { product_type: 'BLS', design_no: '', product_name: '', color: '', size: '', description: '', base_price: '' }

export default function SKUsPage() {
  const [skus, setSKUs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters
  const [filterType, setFilterType] = useState('')
  const [filterStock, setFilterStock] = useState('')

  // Create modal (manual SKU only)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  // Detail overlay
  const [detailSKU, setDetailSKU] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editPrice, setEditPrice] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [savingDetail, setSavingDetail] = useState(false)
  const [detailError, setDetailError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getSKUs({ page, page_size: 50, search: search || undefined })
      setSKUs(res.data.data)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load SKUs')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { loadColorMap() }, [])
  useEffect(() => { fetchData() }, [fetchData])

  const filteredSKUs = useMemo(() => {
    let list = skus
    if (filterType) list = list.filter(s => s.product_type === filterType)
    if (filterStock === 'in_stock') list = list.filter(s => s.stock && s.stock.available_qty > 0)
    if (filterStock === 'out_of_stock') list = list.filter(s => !s.stock || s.stock.available_qty <= 0)
    return list
  }, [skus, filterType, filterStock])

  const kpis = useMemo(() => {
    const totalSKUs = skus.length
    const inStock = skus.filter(s => s.stock && s.stock.available_qty > 0).length
    const totalPieces = skus.reduce((s, sku) => s + (sku.stock?.total_qty || 0), 0)
    const autoGenerated = skus.filter(s => (s.sku_code || '').includes('+')).length
    return { totalSKUs, inStock, totalPieces, autoGenerated }
  }, [skus])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  const openDetail = async (row) => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const res = await getSKU(row.id)
      const sku = res.data.data || res.data
      setDetailSKU(sku)
      setEditPrice(sku.base_price ?? '')
      setEditDesc(sku.description || '')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load SKU details')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleCreate = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const payload = { ...form, base_price: form.base_price ? parseFloat(form.base_price) : null }
      await createSKU(payload)
      setModalOpen(false)
      fetchData()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to create SKU')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveDetail = async () => {
    if (!detailSKU) return
    setSavingDetail(true)
    setDetailError(null)
    try {
      const payload = {
        base_price: editPrice !== '' ? parseFloat(editPrice) : null,
        description: editDesc || null,
      }
      const res = await updateSKU(detailSKU.id, payload)
      const updated = res.data.data || res.data
      setDetailSKU(prev => ({ ...prev, ...updated }))
      fetchData()
    } catch (err) {
      setDetailError(err.response?.data?.detail || 'Failed to save')
    } finally {
      setSavingDetail(false)
    }
  }

  const closeDetail = () => {
    setDetailSKU(null)
    setDetailError(null)
  }

  // ── Detail Overlay ──
  if (detailSKU) {
    const parsed = parseSKU(detailSKU.sku_code)
    const stock = detailSKU.stock || { total_qty: 0, available_qty: 0, reserved_qty: 0 }
    const isAutoGen = parsed.vas.length > 0
    const batches = detailSKU.source_batches || []
    const hasChanged = (editPrice !== '' ? parseFloat(editPrice) : null) !== (detailSKU.base_price || null)
      || (editDesc || '') !== (detailSKU.description || '')

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-700 to-primary-600 text-white px-6 py-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-4">
            <button onClick={closeDetail} className="rounded-lg p-1.5 hover:bg-white/10 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight">{parsed.base}</span>
                {parsed.vas.map(va => {
                  const c = VA_COLORS[va] || DEFAULT_VA
                  return <span key={va} className="rounded px-1.5 py-0.5 text-xs font-bold bg-white/20">+{va}</span>
                })}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-primary-100 text-xs">
                <span>{detailSKU.product_name}</span>
                {isAutoGen && <span className="bg-white/15 rounded px-1.5 py-0.5 text-[10px]">Auto-generated</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              detailSKU.is_active ? 'bg-green-500/20 text-green-100' : 'bg-gray-500/20 text-gray-200'
            }`}>
              {detailSKU.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {detailError && <ErrorAlert message={detailError} onDismiss={() => setDetailError(null)} />}

          {/* Stock + Info KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <StockKPI label="Total Stock" value={stock.total_qty} color="blue" />
            <StockKPI label="Available" value={stock.available_qty} color="green" />
            <StockKPI label="Reserved" value={stock.reserved_qty} color="amber" />
            <StockKPI label="Color" value={parsed.color} color="purple" icon={
              <span className="w-3 h-3 rounded-full border border-gray-200 inline-block" style={{ backgroundColor: colorHex(parsed.color) }} />
            } />
            <StockKPI label="Size" value={parsed.size || '—'} color="gray" />
            <StockKPI label="Type" value={parsed.type} color="gray" />
          </div>

          {/* Price + Description Editors */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Pricing & Description</h3>
              {hasChanged && (
                <button onClick={handleSaveDetail} disabled={savingDetail}
                  className="rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50 transition-colors">
                  {savingDetail ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Base Price (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                    placeholder="0.00" min="0" step="0.01"
                    className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)}
                  placeholder="Product description..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500" />
              </div>
            </div>
          </div>

          {/* Source Batches */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Source Batches <span className="text-gray-400 font-normal">({batches.length})</span>
            </h3>
            {batches.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No linked batches — this SKU was created manually.</p>
            ) : (
              <div className="space-y-3">
                {batches.map(b => (
                  <BatchCard key={b.id} batch={b} />
                ))}
              </div>
            )}
          </div>

          {/* Color QC Breakdown (aggregate from all batches) */}
          {batches.some(b => b.color_qc) && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Per-Color QC Breakdown</h3>
              <ColorQCTable batches={batches} />
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── List View ──
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Finished Goods</h1>
          <p className="mt-1 text-sm text-gray-500">SKUs are auto-generated when batches are packed</p>
        </div>
        <button onClick={openCreate} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          + Manual SKU
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Total SKUs" value={kpis.totalSKUs} color="blue" />
        <KPICard label="In Stock" value={kpis.inStock} color="green" />
        <KPICard label="Total Pieces" value={kpis.totalPieces.toLocaleString('en-IN')} color="purple" />
        <KPICard label="Auto-Generated" value={kpis.autoGenerated} color="emerald" />
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5">
        <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-xs text-blue-700">
          SKUs with <span className="font-semibold">+EMB</span>, <span className="font-semibold">+BTN</span> etc. are auto-created at pack time from per-color QC data. Set prices here for billing.
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <div className="w-64">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search SKU code, color, size..." />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500">
          <option value="">All Types</option>
          {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterStock} onChange={e => setFilterStock(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500">
          <option value="">All Stock</option>
          <option value="in_stock">In Stock</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>
        {(filterType || filterStock) && (
          <button onClick={() => { setFilterType(''); setFilterStock('') }}
            className="text-xs text-gray-500 hover:text-gray-700 underline">
            Clear filters
          </button>
        )}
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      <div className="mt-4">
        <DataTable columns={COLUMNS} data={filteredSKUs} loading={loading || detailLoading} onRowClick={openDetail}
          emptyText="No SKUs found. Pack batches to auto-generate SKUs." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create SKU (Manual)"
        actions={
          <>
            <button onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleCreate} disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create'}
            </button>
          </>
        }
      >
        <SKUForm form={form} onChange={setForm} editing={false}
          error={formError} onDismissError={() => setFormError(null)} />
      </Modal>
    </div>
  )
}

// ── Helper components (defined outside to avoid re-render issues) ──

const KPI_COLORS = {
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  green: 'bg-green-50 border-green-200 text-green-700',
  purple: 'bg-purple-50 border-purple-200 text-purple-700',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
}

function KPICard({ label, value, color }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${KPI_COLORS[color] || KPI_COLORS.blue}`}>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs opacity-75">{label}</div>
    </div>
  )
}

const STOCK_KPI_COLORS = {
  blue: 'border-blue-200 text-blue-700',
  green: 'border-green-200 text-green-700',
  amber: 'border-amber-200 text-amber-700',
  purple: 'border-purple-200 text-purple-700',
  gray: 'border-gray-200 text-gray-600',
}

function StockKPI({ label, value, color, icon }) {
  return (
    <div className={`rounded-lg border bg-white px-3 py-2.5 ${STOCK_KPI_COLORS[color] || STOCK_KPI_COLORS.gray}`}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-lg font-bold">{value}</span>
      </div>
      <div className="text-[11px] uppercase tracking-wide opacity-60 mt-0.5">{label}</div>
    </div>
  )
}

function BatchCard({ batch }) {
  const b = batch
  const vaLogs = (b.processing_logs || []).filter(p => p.value_addition)
  return (
    <div className="rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-800">{b.batch_code}</span>
          <StatusBadge status={b.status} />
          {b.size && <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-medium">{b.size}</span>}
        </div>
        <span className="text-xs text-gray-400">{b.piece_count} pcs</span>
      </div>

      {/* Lot info */}
      {b.lot && (
        <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
          <span>Lot: <span className="font-medium text-gray-700">{b.lot.lot_code}</span></span>
          <span>Design: <span className="font-medium text-gray-700">{b.lot.design_no}</span></span>
        </div>
      )}

      {/* Tailor + Pack info */}
      <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
        {b.tailor && <span>Tailor: <span className="font-medium text-gray-700">{b.tailor.full_name}</span></span>}
        {b.packed_at && <span>Packed: <span className="font-medium text-gray-700">{new Date(b.packed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></span>}
      </div>

      {/* QC summary */}
      {(b.approved_qty != null || b.rejected_qty != null) && (
        <div className="flex items-center gap-3 text-xs mb-2">
          {b.approved_qty != null && <span className="text-green-600">Approved: {b.approved_qty}</span>}
          {b.rejected_qty != null && b.rejected_qty > 0 && <span className="text-red-600">Rejected: {b.rejected_qty}</span>}
        </div>
      )}

      {/* VA Processing */}
      {vaLogs.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Value Additions</div>
          <div className="flex flex-wrap gap-1.5">
            {vaLogs.map(p => {
              const va = p.value_addition
              const c = VA_COLORS[va?.short_code] || DEFAULT_VA
              return (
                <div key={p.id} className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${c.bg} ${c.text}`}>
                  <span className="font-bold">{va?.short_code || '?'}</span>
                  <span className="opacity-70">{va?.name}</span>
                  {p.status === 'received' ? (
                    <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  ) : (
                    <span className="text-[10px] opacity-60">({p.status})</span>
                  )}
                  {p.cost != null && <span className="opacity-60">₹{p.cost}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ColorQCTable({ batches }) {
  // Aggregate color_qc from all batches
  const aggr = {}
  for (const b of batches) {
    if (!b.color_qc) continue
    for (const [color, data] of Object.entries(b.color_qc)) {
      if (!aggr[color]) aggr[color] = { expected: 0, approved: 0, rejected: 0, reasons: [] }
      aggr[color].expected += data.expected || 0
      aggr[color].approved += data.approved || 0
      aggr[color].rejected += data.rejected || 0
      if (data.reason) aggr[color].reasons.push(data.reason)
    }
  }
  const colors = Object.entries(aggr)
  if (colors.length === 0) return <p className="text-sm text-gray-400 italic">No per-color QC data.</p>

  const totals = colors.reduce((t, [, d]) => ({
    expected: t.expected + d.expected,
    approved: t.approved + d.approved,
    rejected: t.rejected + d.rejected,
  }), { expected: 0, approved: 0, rejected: 0 })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
            <th className="text-left py-2 pr-3">Color</th>
            <th className="text-right py-2 px-3">Expected</th>
            <th className="text-right py-2 px-3">Approved</th>
            <th className="text-right py-2 px-3">Rejected</th>
            <th className="text-left py-2 pl-3">Reason</th>
          </tr>
        </thead>
        <tbody>
          {colors.map(([color, d]) => (
            <tr key={color} className="border-b border-gray-50">
              <td className="py-2 pr-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full border border-gray-200" style={{ backgroundColor: colorHex(color) }} />
                  <span className="font-medium">{color}</span>
                </span>
              </td>
              <td className="text-right py-2 px-3 text-gray-600">{d.expected}</td>
              <td className="text-right py-2 px-3 text-green-600 font-medium">{d.approved}</td>
              <td className="text-right py-2 px-3 text-red-600 font-medium">{d.rejected}</td>
              <td className="py-2 pl-3 text-xs text-gray-400 truncate max-w-[200px]">
                {[...new Set(d.reasons)].join('; ') || '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 font-semibold text-xs">
            <td className="py-2 pr-3">Total</td>
            <td className="text-right py-2 px-3">{totals.expected}</td>
            <td className="text-right py-2 px-3 text-green-700">{totals.approved}</td>
            <td className="text-right py-2 px-3 text-red-700">{totals.rejected}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

