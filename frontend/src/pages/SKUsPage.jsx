import { useState, useEffect, useCallback, useMemo } from 'react'
import { getSKUs, createSKU, updateSKU } from '../api/skus'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import ErrorAlert from '../components/common/ErrorAlert'
import SKUForm from '../components/forms/SKUForm'

const VA_COLORS = {
  EMB: { bg: 'bg-purple-100', text: 'text-purple-700' },
  DYE: { bg: 'bg-amber-100', text: 'text-amber-700' },
  DPT: { bg: 'bg-sky-100', text: 'text-sky-700' },
  HWK: { bg: 'bg-rose-100', text: 'text-rose-700' },
  SQN: { bg: 'bg-pink-100', text: 'text-pink-700' },
  BTC: { bg: 'bg-teal-100', text: 'text-teal-700' },
  HST: { bg: 'bg-orange-100', text: 'text-orange-700' },
  BTN: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  LCW: { bg: 'bg-lime-100', text: 'text-lime-700' },
  FIN: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
}
const DEFAULT_VA = { bg: 'bg-gray-100', text: 'text-gray-700' }

/** Parse SKU code: BLS-702-Red-XL+EMB+BTN → {base, vas} */
function parseSKU(code) {
  if (!code) return { base: '', design: '', color: '', size: '', vas: [] }
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

function SKUCodeDisplay({ code }) {
  const { base, vas } = parseSKU(code)
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className="font-semibold text-gray-800">{base}</span>
      {vas.map(va => {
        const c = VA_COLORS[va] || DEFAULT_VA
        return <span key={va} className={`rounded px-1 py-0.5 text-[10px] font-bold leading-none ${c.bg} ${c.text}`}>+{va}</span>
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
  const [filterStock, setFilterStock] = useState('')  // '' | 'in_stock' | 'out_of_stock'

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

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

  useEffect(() => { fetchData() }, [fetchData])

  // Client-side filtering for type + stock status
  const filteredSKUs = useMemo(() => {
    let list = skus
    if (filterType) list = list.filter(s => s.product_type === filterType)
    if (filterStock === 'in_stock') list = list.filter(s => s.stock && s.stock.available_qty > 0)
    if (filterStock === 'out_of_stock') list = list.filter(s => !s.stock || s.stock.available_qty <= 0)
    return list
  }, [skus, filterType, filterStock])

  // KPIs
  const kpis = useMemo(() => {
    const totalSKUs = skus.length
    const inStock = skus.filter(s => s.stock && s.stock.available_qty > 0).length
    const totalPieces = skus.reduce((s, sku) => s + (sku.stock?.total_qty || 0), 0)
    const autoGenerated = skus.filter(s => (s.sku_code || '').includes('+')).length
    return { totalSKUs, inStock, totalPieces, autoGenerated }
  }, [skus])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    const parts = (row.sku_code || '').split('-')
    const designNo = parts.length >= 2 ? parts[1] : ''
    setForm({
      product_type: row.product_type,
      design_no: designNo,
      product_name: row.product_name,
      color: row.color,
      size: row.size,
      description: row.description || '',
      base_price: row.base_price ?? '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        ...form,
        base_price: form.base_price ? parseFloat(form.base_price) : null,
      }
      if (editing) {
        await updateSKU(editing.id, payload)
      } else {
        await createSKU(payload)
      }
      setModalOpen(false)
      fetchData()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to save SKU')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Finished Goods</h1>
          <p className="mt-1 text-sm text-gray-500">SKUs are auto-generated when batches are packed</p>
        </div>
        <button onClick={openCreate} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          + Manual SKU
        </button>
      </div>

      {/* KPI Strip */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Total SKUs" value={kpis.totalSKUs} color="blue" />
        <KPICard label="In Stock" value={kpis.inStock} color="green" />
        <KPICard label="Total Pieces" value={kpis.totalPieces.toLocaleString('en-IN')} color="purple" />
        <KPICard label="Auto-Generated" value={kpis.autoGenerated} color="emerald" />
      </div>

      {/* Info banner */}
      <div className="mt-4 flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5">
        <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-xs text-blue-700">
          SKUs with <span className="font-semibold">+EMB</span>, <span className="font-semibold">+BTN</span> etc. are auto-created at pack time from per-color QC data. Set prices here for billing.
        </span>
      </div>

      {/* Filters */}
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
        <DataTable columns={COLUMNS} data={filteredSKUs} loading={loading} onRowClick={openEdit}
          emptyText="No SKUs found. Pack batches to auto-generate SKUs." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit SKU' : 'Create SKU (Manual)'}
        actions={
          <>
            <button onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
          </>
        }
      >
        <SKUForm form={form} onChange={setForm} editing={!!editing}
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

const COLOR_HEX = {
  red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308', pink: '#ec4899',
  purple: '#a855f7', orange: '#f97316', black: '#1f2937', white: '#e5e7eb', brown: '#92400e',
  navy: '#1e3a5f', maroon: '#7f1d1d', beige: '#d4c5a9', cream: '#fffdd0', grey: '#9ca3af', gray: '#9ca3af',
  sky: '#38bdf8', teal: '#14b8a6', coral: '#f87171', peach: '#fda4af', olive: '#84cc16', gold: '#ca8a04',
}

function colorHex(name) {
  if (!name) return '#9ca3af'
  const lower = name.toLowerCase()
  for (const [key, hex] of Object.entries(COLOR_HEX)) {
    if (lower.includes(key)) return hex
  }
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 55%, 55%)`
}
