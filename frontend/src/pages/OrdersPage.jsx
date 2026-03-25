import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getOrders, getOrder, createOrder, shipOrder, cancelOrder } from '../api/orders'
import { getSKUs } from '../api/skus'
import { getAllCustomers, createCustomer } from '../api/customers'
import { colorHex, loadColorMap } from '../utils/colorUtils'
import DataTable from '../components/common/DataTable'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'
import SearchInput from '../components/common/SearchInput'
import QuickMasterModal from '../components/common/QuickMasterModal'
import OrderPrint from '../components/common/OrderPrint'
import FilterSelect from '../components/common/FilterSelect'
import useQuickMaster from '../hooks/useQuickMaster'
import { useAuth } from '../hooks/useAuth'

/* ── Module-level helpers (re-declared, not imported cross-page) ── */

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

function parseSKU(code) {
  if (!code) return { base: '', type: '', design: '', color: '', size: '', vas: [] }
  const plusIdx = code.indexOf('+')
  const basePart = plusIdx > -1 ? code.slice(0, plusIdx) : code
  const vas = plusIdx > -1 ? code.slice(plusIdx + 1).split('+').filter(Boolean) : []
  const parts = basePart.split('-')
  return { base: basePart, type: parts[0] || '', design: parts[1] || '', color: parts[2] || '', size: parts[3] || '', vas }
}

function SKUCodeDisplay({ code, large }) {
  const { base, vas } = parseSKU(code)
  return (
    <span className={`inline-flex items-center gap-1 flex-wrap ${large ? '' : ''}`}>
      <span className={`typo-data ${large ? 'text-lg' : ''}`}>{base}</span>
      {vas.map(va => {
        const c = VA_COLORS[va] || DEFAULT_VA
        return <span key={va} className={`rounded px-1 py-0.5 typo-badge leading-none ${c.bg} ${c.text}`}>+{va}</span>
      })}
    </span>
  )
}

const SOURCE_COLORS = {
  web: 'bg-blue-100 text-blue-700',
  ecommerce: 'bg-purple-100 text-purple-700',
  walk_in: 'bg-green-100 text-green-700',
}

const KPI_COLORS = {
  slate: 'from-slate-500 to-slate-600',
  amber: 'from-amber-500 to-amber-600',
  blue: 'from-blue-500 to-blue-600',
  green: 'from-green-500 to-green-600',
  emerald: 'from-emerald-500 to-emerald-600',
}

function KPICard({ label, value, sub, color = 'slate' }) {
  return (
    <div className={`rounded-lg bg-gradient-to-br ${KPI_COLORS[color] || KPI_COLORS.slate} p-2.5 text-white shadow-sm`}>
      <p className="typo-kpi-label text-white/85">{label}</p>
      <p className="mt-0.5 text-xl font-bold leading-tight">{value}</p>
      {sub && <p className="typo-caption text-white/75">{sub}</p>}
    </div>
  )
}

function GridCell({ available, qty, onChange, onKeyDown, 'data-grid-row': gridRow, 'data-grid-col': gridCol }) {
  const hasStock = available > 0
  return (
    <div className="flex flex-col items-center gap-0">
      <input
        type="number"
        min="0"
        max={available}
        value={qty || ''}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        onKeyDown={onKeyDown}
        data-qty="true"
        data-grid-row={gridRow}
        data-grid-col={gridCol}
        className={`w-14 rounded border text-center text-xs py-0.5 focus:outline-none focus:ring-1 ${
          qty > 0
            ? qty > available ? 'border-red-400 focus:ring-red-400 bg-red-50' : 'border-emerald-400 focus:ring-emerald-400 bg-emerald-50'
            : 'border-gray-200 focus:ring-gray-300'
        }`}
        placeholder="0"
      />
      <span className={`typo-caption leading-tight ${hasStock ? 'text-green-600' : 'text-red-400'}`}>
        {available}
      </span>
    </div>
  )
}

/* ── DataTable columns ── */

const COLUMNS = [
  { key: 'order_number', label: 'Order #', render: (val) => <span className="font-semibold text-emerald-700">{val}</span> },
  { key: 'customer_name', label: 'Customer', render: (val, row) => row.customer?.name || val || <span className="text-gray-400">Walk-in</span> },
  {
    key: 'source', label: 'Source',
    render: (val) => (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 typo-badge ${SOURCE_COLORS[val] || 'bg-gray-100 text-gray-600'}`}>
        {val}
      </span>
    ),
  },
  { key: 'items', label: 'SKUs', render: (val) => <span className="font-medium">{val?.length || 0}</span> },
  {
    key: 'total_amount', label: 'Total',
    render: (val) => <span className="font-semibold">₹{(val || 0).toLocaleString('en-IN')}</span>,
  },
  { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
  {
    key: 'created_at', label: 'Date',
    render: (val) => val ? new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
  },
]

const TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'returned', label: 'Returned' },
]

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'web', label: 'Web' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'walk_in', label: 'Walk-in' },
]

export default function OrdersPage() {
  const { company } = useAuth()
  const [ordersList, setOrdersList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Detail overlay
  const [detailOrder, setDetailOrder] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actioning, setActioning] = useState(false)
  const [printOrder, setPrintOrder] = useState(null)

  // Create overlay
  const [createMode, setCreateMode] = useState(false)
  const [allSKUs, setAllSKUs] = useState([])
  const [skuLoading, setSKULoading] = useState(false)
  const [gridQty, setGridQty] = useState({})    // { sku_id: qty }
  const [gridPrice, setGridPrice] = useState({}) // { designKey: price }
  const [customerForm, setCustomerForm] = useState({ customer_id: '', source: 'web', notes: '' })
  const [customers, setCustomers] = useState([])
  const [designSearch, setDesignSearch] = useState('')
  const [selectedDesigns, setSelectedDesigns] = useState(new Set()) // design keys added to order
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false) // discard confirmation bar
  const [deleteConfirmKey, setDeleteConfirmKey] = useState(null) // design key pending deletion
  const nameRef = useRef(null)

  // Quick master for customer Shift+M
  const { quickMasterType, quickMasterOpen, closeQuickMaster, onMasterCreated } = useQuickMaster(
    (type, newItem) => {
      if (type === 'customer') {
        setCustomers(prev => [...prev, newItem])
        setCustomerForm(f => ({ ...f, customer_id: newItem.id }))
      }
    }
  )

  /* ── Dirty detection ── */
  const isDirty = useMemo(() => {
    if (customerForm.customer_id) return true
    if (customerForm.notes.trim()) return true
    if (selectedDesigns.size > 0) return true
    if (Object.values(gridQty).some(q => q > 0)) return true
    return false
  }, [customerForm, selectedDesigns, gridQty])

  /* ── Safe close — confirm if dirty ── */
  const requestClose = useCallback(() => {
    if (!isDirty) { setCreateMode(false); return }
    setConfirmDiscard(true)
  }, [isDirty])

  const confirmAndClose = useCallback(() => {
    setConfirmDiscard(false)
    setCreateMode(false)
  }, [])

  const cancelDiscard = useCallback(() => {
    setConfirmDiscard(false)
  }, [])

  /* ── Confirm/cancel design deletion ── */
  const confirmDeleteDesign = useCallback(() => {
    if (!deleteConfirmKey) return
    const removedKey = deleteConfirmKey
    setDeleteConfirmKey(null)
    removeDesign(removedKey)
    // After removal, focus the next design's first cell or the picker search
    setTimeout(() => {
      const nextCell = document.querySelector('[data-design-block] [data-qty]')
      if (nextCell) { nextCell.focus() }
      else { document.querySelector('[data-design-search] input')?.focus() }
    }, 60)
  }, [deleteConfirmKey])

  const cancelDeleteDesign = useCallback(() => {
    setDeleteConfirmKey(null)
  }, [])

  /* ── Global keyboard: Ctrl+S, Escape ── */
  useEffect(() => {
    if (!createMode) return
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !saving) {
        e.preventDefault()
        handleCreate()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        // Dismiss innermost dialog first
        if (deleteConfirmKey) { cancelDeleteDesign(); return }
        if (confirmDiscard) { cancelDiscard(); return }
        requestClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createMode, saving, confirmDiscard, deleteConfirmKey, requestClose, cancelDiscard, cancelDeleteDesign])

  /* ── Auto-focus Name field on overlay open ── */
  useEffect(() => {
    if (createMode && !skuLoading) {
      setTimeout(() => nameRef.current?.focus(), 100)
    }
  }, [createMode, skuLoading])

  /* ── Grid cell keyboard navigation ── */
  const handleGridKeyDown = useCallback((e) => {
    // Delete key → ask to remove this design
    if (e.key === 'Delete') {
      const blockKey = e.target.closest('[data-design-block]')?.dataset.designBlock
      if (blockKey) setDeleteConfirmKey(blockKey)
      return
    }

    if (e.key !== 'Enter' && e.key !== 'Tab') return
    if (e.shiftKey) return // let Shift+Tab work naturally (backward)

    e.preventDefault()
    const grid = e.target.closest('[data-design-grid]')
    if (!grid) return

    // All qty inputs in this grid, in DOM order (handles gaps from missing SKUs)
    const cells = [...grid.querySelectorAll('[data-qty]')]
    const idx = cells.indexOf(e.target)

    if (idx < cells.length - 1) {
      // Next cell within this design
      cells[idx + 1].focus()
      cells[idx + 1].select()
    } else {
      // End of this design → jump to next design block's first cell
      const currentBlock = grid.closest('[data-design-block]')
      const allBlocks = [...document.querySelectorAll('[data-design-block]')]
      const blockIdx = allBlocks.indexOf(currentBlock)
      if (blockIdx < allBlocks.length - 1) {
        const nextFirst = allBlocks[blockIdx + 1].querySelector('[data-qty]')
        if (nextFirst) { nextFirst.focus(); nextFirst.select(); nextFirst.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
      }
      // Last design, last cell → focus Create button
      document.querySelector('[data-create-btn]')?.focus()
    }
  }, [])

  /* ── Customer field Enter → advance ── */
  const handleCustomerKeyDown = useCallback((e, fieldName) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const fields = ['customer_id', 'source', 'notes']
    const idx = fields.indexOf(fieldName)
    if (idx < fields.length - 1) {
      const nextField = document.querySelector(`[data-customer-field="${fields[idx + 1]}"]`)
      nextField?.focus()
    } else {
      // Last customer field → focus design search
      document.querySelector('[data-design-search] input')?.focus()
    }
  }, [])

  useEffect(() => { loadColorMap() }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getOrders({
        page, page_size: 20,
        status: statusFilter || undefined,
        source: sourceFilter || undefined,
        search: search || undefined,
      })
      setOrdersList(res.data.data)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, sourceFilter, search])

  useEffect(() => { fetchData() }, [fetchData])

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const all = ordersList
    const pending = all.filter(o => o.status === 'pending').length
    const processing = all.filter(o => o.status === 'processing').length
    const today = new Date().toDateString()
    const shippedToday = all.filter(o => o.status === 'shipped' && o.created_at && new Date(o.created_at).toDateString() === today).length
    const revenue = all.reduce((s, o) => s + (o.total_amount || 0), 0)
    return { total: all.length, pending, processing, shippedToday, revenue }
  }, [ordersList])

  /* ── Row click → detail overlay ── */
  const handleRowClick = async (row) => {
    setDetailLoading(true)
    setDetailOrder(row)
    try {
      const res = await getOrder(row.id)
      setDetailOrder(res.data.data || res.data)
    } catch {
      // fallback to list data
    } finally {
      setDetailLoading(false)
    }
  }

  /* ── Ship / Cancel actions ── */
  const handleAction = async (type) => {
    setActioning(true)
    try {
      if (type === 'ship') await shipOrder(detailOrder.id)
      if (type === 'cancel') await cancelOrder(detailOrder.id)
      setDetailOrder(null)
      fetchData()
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to ${type} order`)
    } finally {
      setActioning(false)
    }
  }

  /* ── Create overlay: load SKUs ── */
  const openCreate = async () => {
    setCreateMode(true)
    setSKULoading(true)
    setGridQty({})
    setGridPrice({})
    setCustomerForm({ customer_id: '', source: 'web', notes: '' })
    setDesignSearch('')
    setSelectedDesigns(new Set())
    setFormError(null)
    try {
      const [skuRes, custRes] = await Promise.all([
        getSKUs({ is_active: true, page_size: 500 }),
        getAllCustomers(),
      ])
      setAllSKUs(skuRes.data.data || [])
      setCustomers(custRes.data.data || [])
    } catch {
      setAllSKUs([])
      setCustomers([])
    } finally {
      setSKULoading(false)
    }
  }

  /* ── Design groups for grid ── */
  const designGroups = useMemo(() => {
    const groups = {}
    for (const sku of allSKUs) {
      const p = parseSKU(sku.sku_code)
      const key = `${p.type}-${p.design}`
      if (!key || key === '-') continue
      if (!groups[key]) groups[key] = { key, type: p.type, design: p.design, colors: new Set(), sizes: new Set(), skus: [] }
      groups[key].colors.add(p.color)
      groups[key].sizes.add(p.size)
      groups[key].skus.push({ ...sku, _parsed: p })
    }
    // Convert sets
    return Object.values(groups).map(g => ({
      ...g,
      colors: [...g.colors].sort(),
      sizes: [...g.sizes].sort((a, b) => {
        const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'Free']
        return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b))
      }),
    }))
  }, [allSKUs])


  /* ── Grid helpers ── */
  const findSKU = (group, color, size) => {
    return group.skus.find(s => s._parsed.color === color && s._parsed.size === size)
  }

  const setQty = (skuId, qty) => {
    setGridQty(prev => ({ ...prev, [skuId]: qty > 0 ? qty : 0 }))
  }

  const setPrice = (designKey, price) => {
    setGridPrice(prev => ({ ...prev, [designKey]: price }))
  }

  const addDesign = (key) => {
    setSelectedDesigns(prev => new Set([...prev, key]))
  }

  const removeDesign = (key) => {
    setSelectedDesigns(prev => { const next = new Set(prev); next.delete(key); return next })
    // Clear qty for all SKUs in this design group
    const group = designGroups.find(g => g.key === key)
    if (group) {
      setGridQty(prev => {
        const next = { ...prev }
        for (const sku of group.skus) delete next[sku.id]
        return next
      })
    }
  }

  const selectedGroups = useMemo(() => {
    return designGroups.filter(g => selectedDesigns.has(g.key))
  }, [designGroups, selectedDesigns])

  const pickerGroups = useMemo(() => {
    if (!designSearch) return designGroups
    const q = designSearch.toLowerCase()
    return designGroups.filter(g => g.key.toLowerCase().includes(q) || g.design.toLowerCase().includes(q))
  }, [designGroups, designSearch])

  /* ── Create submit ── */
  const handleCreate = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const items = []
      for (const [skuId, qty] of Object.entries(gridQty)) {
        if (qty <= 0) continue
        const sku = allSKUs.find(s => s.id === skuId)
        if (!sku) continue
        const p = parseSKU(sku.sku_code)
        const designKey = `${p.type}-${p.design}`
        const price = parseFloat(gridPrice[designKey]) || sku.base_price || 0
        items.push({ sku_id: skuId, quantity: qty, unit_price: price })
      }
      if (!items.length) { setFormError('Add at least one item'); setSaving(false); return }
      if (!customerForm.customer_id) { setFormError('Please select a customer'); setSaving(false); return }

      const cust = customers.find(c => c.id === customerForm.customer_id)
      await createOrder({
        source: customerForm.source,
        customer_id: customerForm.customer_id,
        customer_name: cust?.name || null,
        customer_phone: cust?.phone || null,
        customer_address: cust?.city ? `${cust.city}${cust.state ? ', ' + cust.state : ''}` : null,
        notes: customerForm.notes.trim() || null,
        items,
      })
      setCreateMode(false)
      fetchData()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to create order')
    } finally {
      setSaving(false)
    }
  }

  const totalItems = Object.values(gridQty).reduce((s, q) => s + (q > 0 ? q : 0), 0)
  const grandTotal = useMemo(() => {
    let sum = 0
    for (const [skuId, qty] of Object.entries(gridQty)) {
      if (qty <= 0) continue
      const sku = allSKUs.find(s => s.id === skuId)
      if (!sku) continue
      const p = parseSKU(sku.sku_code)
      const designKey = `${p.type}-${p.design}`
      const price = parseFloat(gridPrice[designKey]) || sku.base_price || 0
      sum += qty * price
    }
    return sum
  }, [gridQty, gridPrice, allSKUs])

  /* ═══════════════════════ DETAIL OVERLAY ═══════════════════════ */
  if (detailOrder) {
    const o = detailOrder
    const canAct = o.status === 'pending' || o.status === 'processing'
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="typo-modal-title text-white leading-tight">{o.customer?.name || o.customer_name || 'Walk-in'}</h1>
            <p className="text-xs opacity-80">{o.order_number} &middot; <StatusBadge status={o.status} /></p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setPrintOrder(detailOrder); setDetailOrder(null) }} className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print
            </button>
            <button onClick={() => setDetailOrder(null)} className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors">Close</button>
          </div>
        </div>

        {detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : (
          <div className="flex-1 p-4 max-w-5xl mx-auto w-full space-y-3">
            {/* Customer info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Phone</p>
                <p className="typo-body">{o.customer?.phone || o.customer_phone || '—'}</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Source</p>
                <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 typo-badge ${SOURCE_COLORS[o.source] || 'bg-gray-100 text-gray-600'}`}>{o.source}</span>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Date</p>
                <p className="typo-body">{o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Address</p>
                <p className="typo-body">{o.customer_address || o.customer?.city || '—'}</p>
              </div>
            </div>

            {o.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                <span className="font-semibold">Notes:</span> {o.notes}
              </div>
            )}

            {o.external_order_ref && (
              <div className="bg-purple-50 border border-purple-200 rounded p-2 text-xs text-purple-800">
                <span className="font-semibold">External Ref:</span> {o.external_order_ref}
              </div>
            )}

            {/* Items table */}
            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 typo-th">SKU</th>
                    <th className="px-2 py-1.5 typo-th">Color</th>
                    <th className="px-2 py-1.5 typo-th">Size</th>
                    <th className="px-2 py-1.5 typo-th text-right">Qty</th>
                    <th className="px-2 py-1.5 typo-th text-right">Price</th>
                    <th className="px-2 py-1.5 typo-th text-right">Total</th>
                    <th className="px-2 py-1.5 typo-th text-right">Fulfilled</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {o.items?.map((item, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5"><SKUCodeDisplay code={item.sku?.sku_code} /></td>
                      <td className="px-2 py-1.5">
                        {item.sku?.color ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-full border border-gray-200" style={{ backgroundColor: colorHex(item.sku.color) }} />
                            <span>{item.sku.color}</span>
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-1.5 font-semibold">{item.sku?.size || '—'}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{item.quantity}</td>
                      <td className="px-2 py-1.5 text-right">₹{(item.unit_price || 0).toLocaleString('en-IN')}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">₹{(item.total_price || 0).toLocaleString('en-IN')}</td>
                      <td className="px-2 py-1.5 text-right">
                        <span className={item.fulfilled_qty >= item.quantity ? 'text-green-600 font-semibold' : 'text-gray-500'}>
                          {item.fulfilled_qty || 0}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Grand total */}
            <div className="flex justify-end">
              <div className="bg-gray-50 rounded px-4 py-2 text-right">
                <span className="typo-caption">Grand Total</span>
                <p className="typo-kpi-sm text-gray-800">₹{(o.total_amount || 0).toLocaleString('en-IN')}</p>
              </div>
            </div>

            {/* Actions */}
            {canAct && (
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button onClick={() => handleAction('cancel')} disabled={actioning}
                  className="rounded border border-red-300 text-red-600 px-4 py-1.5 typo-btn-sm hover:bg-red-50 disabled:opacity-50 transition-colors">
                  {actioning ? 'Processing...' : 'Cancel Order'}
                </button>
                <button onClick={() => handleAction('ship')} disabled={actioning}
                  className="rounded bg-green-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {actioning ? 'Processing...' : 'Ship Order'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  /* ═══════════════════════ CREATE OVERLAY ═══════════════════════ */
  if (createMode) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-hidden">
        {/* ── Discard confirmation bar ── */}
        {confirmDiscard && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-2xl px-6 py-5 max-w-sm w-full mx-4 space-y-3">
              <h3 className="typo-data">Discard this order?</h3>
              <p className="text-xs text-gray-500">
                You have <span className="font-semibold text-gray-700">{totalItems}</span> item{totalItems !== 1 ? 's' : ''} across <span className="font-semibold text-gray-700">{selectedDesigns.size}</span> design{selectedDesigns.size !== 1 ? 's' : ''}. This cannot be undone.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={confirmAndClose}
                  className="rounded border border-red-300 text-red-600 px-4 py-1.5 typo-btn-sm hover:bg-red-50 transition-colors">
                  Discard
                </button>
                <button onClick={cancelDiscard} autoFocus
                  className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 transition-colors">
                  Keep Editing
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="typo-modal-title text-white leading-tight">New Order</h1>
            <p className="text-xs opacity-80">Pick designs &middot; set qty per color &times; size</p>
          </div>
          <div className="flex gap-2">
            <button onClick={requestClose} className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={saving || totalItems === 0}
              className="rounded bg-white text-emerald-700 px-4 py-1.5 typo-btn-sm hover:bg-emerald-50 disabled:opacity-50 transition-colors">
              {saving ? 'Creating...' : 'Create Order'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 pb-16">
          {formError && <div className="mb-2"><ErrorAlert message={formError} onDismiss={() => setFormError(null)} /></div>}

          {/* Customer section */}
          <div className="bg-gray-50 rounded-lg p-3 mb-3">
            <h3 className="typo-card-title mb-2">Customer Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div className="md:col-span-2">
                <label className="typo-label-sm">Customer *</label>
                <select ref={nameRef} value={customerForm.customer_id}
                  data-customer-field="customer_id"
                  data-master="customer"
                  onChange={(e) => setCustomerForm(f => ({ ...f, customer_id: e.target.value }))}
                  onKeyDown={(e) => handleCustomerKeyDown(e, 'customer_id')}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  <option value="">Select customer (Shift+M to create)</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ''}{c.phone ? ` (${c.phone})` : ''}</option>
                  ))}
                </select>
              </div>
              {customerForm.customer_id && (() => {
                const c = customers.find(cu => cu.id === customerForm.customer_id)
                return c ? (
                  <div className="flex items-center gap-3 text-xs text-gray-600 md:col-span-1">
                    <div>
                      {c.phone && <p>{c.phone}</p>}
                      {c.gst_no && <p className="typo-caption">{c.gst_no}</p>}
                    </div>
                  </div>
                ) : null
              })()}
              <div>
                <label className="typo-label-sm">Source</label>
                <select value={customerForm.source}
                  data-customer-field="source"
                  onChange={(e) => setCustomerForm(f => ({ ...f, source: e.target.value }))}
                  onKeyDown={(e) => handleCustomerKeyDown(e, 'source')}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  <option value="web">Web</option>
                  <option value="ecommerce">E-commerce</option>
                  <option value="walk_in">Walk-in</option>
                </select>
              </div>
              <div>
                <label className="typo-label-sm">Notes</label>
                <input type="text" value={customerForm.notes}
                  data-customer-field="notes"
                  onChange={(e) => setCustomerForm(f => ({ ...f, notes: e.target.value }))}
                  onKeyDown={(e) => handleCustomerKeyDown(e, 'notes')}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="Optional notes" />
              </div>
            </div>
          </div>

          {skuLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : allSKUs.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              No active SKUs found. Pack batches first to auto-generate SKUs.
            </div>
          ) : (
            <>
              {/* ── Design Picker ── */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="typo-card-title">Select Designs</h3>
                  <span className="typo-caption">{designGroups.length} designs available</span>
                </div>
                <div className="mb-2" data-design-search>
                  <SearchInput value={designSearch} onChange={setDesignSearch} placeholder="Search by design number (e.g. 101, 702)..." />
                </div>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50/50 p-2">
                  {pickerGroups.length === 0 ? (
                    <p className="text-center py-6 text-gray-400 text-sm">No designs match your search.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {pickerGroups.map(group => {
                        const isSelected = selectedDesigns.has(group.key)
                        const firstSku = group.skus[0]
                        const defaultPrice = firstSku?.base_price || 0
                        const totalStock = group.skus.reduce((s, sku) => s + (sku.stock?.available_qty || 0), 0)
                        return (
                          <button
                            key={group.key}
                            onClick={() => !isSelected && addDesign(group.key)}
                            disabled={isSelected}
                            className={`rounded-lg border p-2.5 text-left transition-all ${
                              isSelected
                                ? 'border-emerald-300 bg-emerald-50/60 opacity-60 cursor-default'
                                : 'border-gray-200 bg-white hover:border-emerald-400 hover:shadow-sm cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="typo-data">{group.key}</span>
                              {isSelected && (
                                <span className="typo-badge text-emerald-600 bg-emerald-100 rounded px-1.5 py-0.5">Added</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="typo-caption">{group.colors.length}c &middot; {group.sizes.length}s</span>
                              {defaultPrice > 0 && <span className="typo-caption">&middot; ₹{defaultPrice}</span>}
                              <span className={`typo-caption font-medium ${totalStock > 0 ? 'text-green-600' : 'text-red-400'}`}>&middot; {totalStock} in stock</span>
                            </div>
                            {firstSku?._parsed.vas.length > 0 && (
                              <div className="flex gap-1 mt-1">
                                {firstSku._parsed.vas.map(va => {
                                  const c = VA_COLORS[va] || DEFAULT_VA
                                  return <span key={va} className={`rounded px-1 py-0.5 typo-badge leading-none ${c.bg} ${c.text}`}>+{va}</span>
                                })}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Selected Designs — color×size grids ── */}
              {selectedGroups.length > 0 && (
                <div className="space-y-3">
                  <h3 className="typo-card-title">Order Items ({selectedGroups.length} design{selectedGroups.length > 1 ? 's' : ''})</h3>
                  {selectedGroups.map(group => {
                    const groupSubtotal = group.skus.reduce((s, sku) => {
                      const qty = gridQty[sku.id] || 0
                      const p = parseSKU(sku.sku_code)
                      const designKey = `${p.type}-${p.design}`
                      const price = parseFloat(gridPrice[designKey]) || sku.base_price || 0
                      return s + qty * price
                    }, 0)
                    const groupQty = group.skus.reduce((s, sku) => s + (gridQty[sku.id] || 0), 0)
                    const firstSku = group.skus[0]
                    const defaultPrice = firstSku?.base_price || 0

                    return (
                      <div key={group.key} className="border rounded-lg overflow-hidden" data-design-block={group.key}>
                        {/* Design header — inline delete confirmation or normal */}
                        {deleteConfirmKey === group.key ? (
                          <div className="bg-red-50 border-b border-red-200 px-3 py-2 flex items-center justify-between">
                            <span className="typo-btn-sm text-red-700">Remove <span className="font-bold">{group.key}</span>{groupQty > 0 ? ` (${groupQty} items)` : ''}?</span>
                            <div className="flex items-center gap-2">
                              <button onClick={confirmDeleteDesign}
                                className="rounded border border-red-300 text-red-600 px-3 py-1 typo-btn-sm hover:bg-red-100 transition-colors">
                                Remove
                              </button>
                              <button onClick={cancelDeleteDesign} autoFocus
                                className="rounded bg-gray-600 text-white px-3 py-1 typo-btn-sm hover:bg-gray-700 transition-colors">
                                Keep
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-gray-50 px-3 py-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="typo-data">{group.key}</span>
                              <span className="typo-caption">{group.colors.length}c &middot; {group.sizes.length}s</span>
                              {group.skus[0]?._parsed.vas.length > 0 && (
                                <span className="flex gap-1">
                                  {group.skus[0]._parsed.vas.map(va => {
                                    const c = VA_COLORS[va] || DEFAULT_VA
                                    return <span key={va} className={`rounded px-1 py-0.5 typo-badge ${c.bg} ${c.text}`}>+{va}</span>
                                  })}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1">
                                <label className="typo-label-sm mb-0">₹/pc</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  data-price-input="true"
                                  tabIndex={-1}
                                  value={gridPrice[group.key] ?? (defaultPrice || '')}
                                  onChange={(e) => setPrice(group.key, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Delete') { setDeleteConfirmKey(group.key); return }
                                    if (e.key !== 'Enter' && e.key !== 'Tab') return
                                    if (e.shiftKey) return
                                    e.preventDefault()
                                    const block = e.target.closest('[data-design-block]')
                                    const firstCell = block?.querySelector('[data-qty]')
                                    if (firstCell) { firstCell.focus(); firstCell.select() }
                                  }}
                                  className="w-20 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-right focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  placeholder="₹"
                                />
                              </div>
                              {groupQty > 0 && (
                                <span className="typo-btn-sm text-emerald-700">{groupQty}pcs ₹{groupSubtotal.toLocaleString('en-IN')}</span>
                              )}
                              <button onClick={() => setDeleteConfirmKey(group.key)} tabIndex={-1}
                                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="Remove design (Del)">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Grid: colors × sizes */}
                        <div className="overflow-x-auto" data-design-grid={group.key}>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-white">
                                <th className="px-2 py-1 text-left typo-th w-28">Color</th>
                                {group.sizes.map(size => (
                                  <th key={size} className="px-1 py-1 text-center typo-th">{size}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {group.colors.map((color, cIdx) => (
                                <tr key={color} className="hover:bg-gray-50/50">
                                  <td className="px-2 py-1">
                                    <span className="inline-flex items-center gap-1">
                                      <span className="w-2.5 h-2.5 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: colorHex(color) }} />
                                      <span className="text-xs font-medium">{color}</span>
                                    </span>
                                  </td>
                                  {group.sizes.map((size, sIdx) => {
                                    const sku = findSKU(group, color, size)
                                    if (!sku) return <td key={size} className="px-1 py-1 text-center text-gray-300 typo-caption">—</td>
                                    const avail = sku.stock?.available_qty || 0
                                    return (
                                      <td key={size} className="px-1 py-1 text-center">
                                        <GridCell available={avail} qty={gridQty[sku.id] || 0} onChange={(q) => setQty(sku.id, q)}
                                          onKeyDown={handleGridKeyDown}
                                          data-grid-row={cIdx} data-grid-col={sIdx} />
                                      </td>
                                    )
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {selectedGroups.length === 0 && (
                <div className="text-center py-8 text-gray-400 border-2 border-dashed rounded-lg mt-2">
                  <p className="text-sm">Click a design card above to add it to the order</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Sticky footer */}
        <div className="flex-shrink-0 border-t bg-white px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-xs text-gray-600">
                <span className="font-semibold text-gray-800">{selectedDesigns.size}</span> design{selectedDesigns.size !== 1 ? 's' : ''} &middot; <span className="font-semibold text-gray-800">{totalItems}</span> items
              </div>
              <div className="hidden md:flex items-center gap-3 typo-caption">
                <span><kbd className="rounded border border-gray-300 bg-gray-50 px-1 py-0.5 text-[10px] font-mono">Tab</kbd> Next cell</span>
                <span><kbd className="rounded border border-gray-300 bg-gray-50 px-1 py-0.5 text-[10px] font-mono">Del</kbd> Remove design</span>
                <span><kbd className="rounded border border-gray-300 bg-gray-50 px-1 py-0.5 text-[10px] font-mono">Ctrl+S</kbd> Save</span>
                <span><kbd className="rounded border border-gray-300 bg-gray-50 px-1 py-0.5 text-[10px] font-mono">Esc</kbd> Close</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-base font-bold text-gray-800">₹{grandTotal.toLocaleString('en-IN')}</span>
              <button onClick={requestClose} className="rounded border border-gray-300 px-3 py-1.5 typo-btn-sm text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={saving || totalItems === 0} data-create-btn
                className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {saving ? 'Creating...' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
        <QuickMasterModal type={quickMasterType} open={quickMasterOpen} onClose={closeQuickMaster} onCreated={onMasterCreated} />
      </div>
    )
  }

  /* ═══════════════════════ LIST VIEW ═══════════════════════ */
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="typo-page-title">Orders</h1>
          <p className="mt-1 typo-caption">Manage customer orders and fulfillment</p>
        </div>
        <button onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 typo-btn-sm text-white hover:bg-emerald-700 shadow-sm transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New Order
        </button>
      </div>

      {/* KPI strip */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
        <KPICard label="Total Orders" value={kpis.total} color="slate" />
        <KPICard label="Pending" value={kpis.pending} color="amber" />
        <KPICard label="Processing" value={kpis.processing} color="blue" />
        <KPICard label="Shipped Today" value={kpis.shippedToday} color="green" />
        <KPICard label="Revenue" value={`₹${kpis.revenue.toLocaleString('en-IN')}`} color="emerald" />
      </div>

      {/* Tab pills + filters */}
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setStatusFilter(t.key); setPage(1) }}
              className={`rounded-full px-3 py-1 typo-btn-sm transition-colors ${
                statusFilter === t.key ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <FilterSelect value={sourceFilter} onChange={(v) => { setSourceFilter(v); setPage(1) }}
          options={SOURCE_OPTIONS} />
        <div className="ml-auto w-64">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search orders..." />
        </div>
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      <div className="mt-4">
        <DataTable columns={COLUMNS} data={ordersList} loading={loading} onRowClick={handleRowClick} emptyText="No orders found." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      <QuickMasterModal type={quickMasterType} open={quickMasterOpen} onClose={closeQuickMaster} onCreated={onMasterCreated} />

      {/* Order Print Overlay */}
      {printOrder && <OrderPrint order={printOrder} companyName={company?.name} onClose={() => setPrintOrder(null)} />}
    </div>
  )
}
