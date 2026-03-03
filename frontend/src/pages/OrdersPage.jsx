import { useState, useEffect, useCallback, useMemo } from 'react'
import { getOrders, getOrder, createOrder, shipOrder, cancelOrder } from '../api/orders'
import { getSKUs } from '../api/skus'
import { colorHex, loadColorMap } from '../utils/colorUtils'
import DataTable from '../components/common/DataTable'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'
import SearchInput from '../components/common/SearchInput'

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
      <span className={`font-semibold text-gray-800 ${large ? 'text-lg' : ''}`}>{base}</span>
      {vas.map(va => {
        const c = VA_COLORS[va] || DEFAULT_VA
        return <span key={va} className={`rounded px-1 py-0.5 ${large ? 'text-xs' : 'text-[10px]'} font-bold leading-none ${c.bg} ${c.text}`}>+{va}</span>
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
      <p className="text-[10px] font-medium opacity-80">{label}</p>
      <p className="mt-0.5 text-lg font-bold leading-tight">{value}</p>
      {sub && <p className="text-[10px] opacity-70">{sub}</p>}
    </div>
  )
}

function GridCell({ available, qty, onChange }) {
  const hasStock = available > 0
  return (
    <div className="flex flex-col items-center gap-0">
      <input
        type="number"
        min="0"
        max={available}
        value={qty || ''}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className={`w-14 rounded border text-center text-xs py-0.5 focus:outline-none focus:ring-1 ${
          qty > 0
            ? qty > available ? 'border-red-400 focus:ring-red-400 bg-red-50' : 'border-primary-400 focus:ring-primary-400 bg-primary-50'
            : 'border-gray-200 focus:ring-gray-300'
        }`}
        placeholder="0"
      />
      <span className={`text-[9px] leading-tight ${hasStock ? 'text-green-600' : 'text-red-400'}`}>
        {available}
      </span>
    </div>
  )
}

/* ── DataTable columns ── */

const COLUMNS = [
  { key: 'order_number', label: 'Order #', render: (val) => <span className="font-semibold text-primary-700">{val}</span> },
  { key: 'customer_name', label: 'Customer', render: (val) => val || <span className="text-gray-400">Walk-in</span> },
  {
    key: 'source', label: 'Source',
    render: (val) => (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SOURCE_COLORS[val] || 'bg-gray-100 text-gray-600'}`}>
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

  // Create overlay
  const [createMode, setCreateMode] = useState(false)
  const [allSKUs, setAllSKUs] = useState([])
  const [skuLoading, setSKULoading] = useState(false)
  const [gridQty, setGridQty] = useState({})    // { sku_id: qty }
  const [gridPrice, setGridPrice] = useState({}) // { designKey: price }
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', address: '', source: 'web', notes: '' })
  const [designSearch, setDesignSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

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
    setCustomerForm({ name: '', phone: '', address: '', source: 'web', notes: '' })
    setDesignSearch('')
    setFormError(null)
    try {
      const res = await getSKUs({ is_active: true, page_size: 500 })
      setAllSKUs(res.data.data || [])
    } catch {
      setAllSKUs([])
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

  const filteredGroups = useMemo(() => {
    if (!designSearch) return designGroups
    const q = designSearch.toLowerCase()
    return designGroups.filter(g => g.key.toLowerCase().includes(q) || g.design.toLowerCase().includes(q))
  }, [designGroups, designSearch])

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
      if (!customerForm.name.trim()) { setFormError('Customer name is required'); setSaving(false); return }

      await createOrder({
        source: customerForm.source,
        customer_name: customerForm.name.trim(),
        customer_phone: customerForm.phone.trim() || null,
        customer_address: customerForm.address.trim() || null,
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
        <div className="bg-gradient-to-r from-primary-700 to-primary-600 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold leading-tight">{o.customer_name || 'Walk-in'}</h1>
            <p className="text-xs opacity-80">{o.order_number} &middot; <StatusBadge status={o.status} /></p>
          </div>
          <button onClick={() => setDetailOrder(null)} className="rounded bg-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/30 transition-colors">Close</button>
        </div>

        {detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="flex-1 p-4 max-w-5xl mx-auto w-full space-y-3">
            {/* Customer info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-gray-50 rounded p-2">
                <p className="text-[9px] uppercase text-gray-400 font-semibold">Phone</p>
                <p className="text-xs font-medium text-gray-800">{o.customer_phone || '—'}</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="text-[9px] uppercase text-gray-400 font-semibold">Source</p>
                <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_COLORS[o.source] || 'bg-gray-100 text-gray-600'}`}>{o.source}</span>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="text-[9px] uppercase text-gray-400 font-semibold">Date</p>
                <p className="text-xs font-medium text-gray-800">{o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="text-[9px] uppercase text-gray-400 font-semibold">Address</p>
                <p className="text-xs font-medium text-gray-800">{o.customer_address || '—'}</p>
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
                  <tr className="text-left text-gray-500 text-[10px] uppercase">
                    <th className="px-2 py-1.5">SKU</th>
                    <th className="px-2 py-1.5">Color</th>
                    <th className="px-2 py-1.5">Size</th>
                    <th className="px-2 py-1.5 text-right">Qty</th>
                    <th className="px-2 py-1.5 text-right">Price</th>
                    <th className="px-2 py-1.5 text-right">Total</th>
                    <th className="px-2 py-1.5 text-right">Fulfilled</th>
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
                <span className="text-gray-500 text-xs">Grand Total</span>
                <p className="text-lg font-bold text-gray-800">₹{(o.total_amount || 0).toLocaleString('en-IN')}</p>
              </div>
            </div>

            {/* Actions */}
            {canAct && (
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button onClick={() => handleAction('cancel')} disabled={actioning}
                  className="rounded border border-red-300 text-red-600 px-4 py-1.5 text-xs font-medium hover:bg-red-50 disabled:opacity-50 transition-colors">
                  {actioning ? 'Processing...' : 'Cancel Order'}
                </button>
                <button onClick={() => handleAction('ship')} disabled={actioning}
                  className="rounded bg-green-600 text-white px-4 py-1.5 text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
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
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold leading-tight">New Order</h1>
            <p className="text-xs opacity-80">Design-Grid &middot; qty per color &times; size</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCreateMode(false)} className="rounded bg-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/30 transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={saving || totalItems === 0}
              className="rounded bg-white text-emerald-700 px-4 py-1.5 text-xs font-bold hover:bg-emerald-50 disabled:opacity-50 transition-colors">
              {saving ? 'Creating...' : 'Create Order'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 pb-16">
          {formError && <div className="mb-2"><ErrorAlert message={formError} onDismiss={() => setFormError(null)} /></div>}

          {/* Customer section */}
          <div className="bg-gray-50 rounded-lg p-3 mb-3">
            <h3 className="text-xs font-semibold text-gray-700 mb-2">Customer Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div>
                <label className="block text-[9px] uppercase text-gray-400 font-semibold mb-0.5">Name *</label>
                <input type="text" value={customerForm.name} onChange={(e) => setCustomerForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="Customer name" />
              </div>
              <div>
                <label className="block text-[9px] uppercase text-gray-400 font-semibold mb-0.5">Phone</label>
                <input type="text" value={customerForm.phone} onChange={(e) => setCustomerForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="9876543210" />
              </div>
              <div>
                <label className="block text-[9px] uppercase text-gray-400 font-semibold mb-0.5">Address</label>
                <input type="text" value={customerForm.address} onChange={(e) => setCustomerForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="Address" />
              </div>
              <div>
                <label className="block text-[9px] uppercase text-gray-400 font-semibold mb-0.5">Source</label>
                <select value={customerForm.source} onChange={(e) => setCustomerForm(f => ({ ...f, source: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  <option value="web">Web</option>
                  <option value="ecommerce">E-commerce</option>
                  <option value="walk_in">Walk-in</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] uppercase text-gray-400 font-semibold mb-0.5">Notes</label>
                <input type="text" value={customerForm.notes} onChange={(e) => setCustomerForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="Optional notes" />
              </div>
            </div>
          </div>

          {/* Design search */}
          <div className="mb-3">
            <SearchInput value={designSearch} onChange={setDesignSearch} placeholder="Search by design number (e.g. 101, 702)..." />
          </div>

          {skuLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              {allSKUs.length === 0 ? 'No active SKUs found. Pack batches first to auto-generate SKUs.' : 'No designs match your search.'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGroups.map(group => {
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
                  <div key={group.key} className="border rounded-lg overflow-hidden">
                    {/* Design header */}
                    <div className="bg-gray-50 px-3 py-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-800">{group.key}</span>
                        <span className="text-[10px] text-gray-400">{group.colors.length}c &middot; {group.sizes.length}s</span>
                        {group.skus[0]?._parsed.vas.length > 0 && (
                          <span className="flex gap-1">
                            {group.skus[0]._parsed.vas.map(va => {
                              const c = VA_COLORS[va] || DEFAULT_VA
                              return <span key={va} className={`rounded px-1 py-0.5 text-[10px] font-bold ${c.bg} ${c.text}`}>+{va}</span>
                            })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <label className="text-[9px] uppercase text-gray-400 font-semibold">₹/pc</label>
                          <input
                            type="number"
                            step="0.01"
                            value={gridPrice[group.key] ?? (defaultPrice || '')}
                            onChange={(e) => setPrice(group.key, e.target.value)}
                            className="w-20 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-right focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            placeholder="₹"
                          />
                        </div>
                        {groupQty > 0 && (
                          <span className="text-xs font-semibold text-emerald-700">{groupQty}pcs ₹{groupSubtotal.toLocaleString('en-IN')}</span>
                        )}
                      </div>
                    </div>

                    {/* Grid: colors × sizes */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-white">
                            <th className="px-2 py-1 text-left text-[10px] text-gray-500 font-medium w-28">Color</th>
                            {group.sizes.map(size => (
                              <th key={size} className="px-1 py-1 text-center text-[10px] text-gray-500 font-medium">{size}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {group.colors.map(color => (
                            <tr key={color} className="hover:bg-gray-50/50">
                              <td className="px-2 py-1">
                                <span className="inline-flex items-center gap-1">
                                  <span className="w-2.5 h-2.5 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: colorHex(color) }} />
                                  <span className="text-xs font-medium">{color}</span>
                                </span>
                              </td>
                              {group.sizes.map(size => {
                                const sku = findSKU(group, color, size)
                                if (!sku) return <td key={size} className="px-1 py-1 text-center text-gray-300 text-[10px]">—</td>
                                const avail = sku.stock?.available_qty || 0
                                return (
                                  <td key={size} className="px-1 py-1 text-center">
                                    <GridCell available={avail} qty={gridQty[sku.id] || 0} onChange={(q) => setQty(sku.id, q)} />
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
        </div>

        {/* Sticky footer */}
        <div className="flex-shrink-0 border-t bg-white px-4 py-2 flex items-center justify-between">
          <div className="text-xs text-gray-600">
            <span className="font-semibold text-gray-800">{totalItems}</span> items
          </div>
          <div className="flex items-center gap-3">
            <span className="text-base font-bold text-gray-800">₹{grandTotal.toLocaleString('en-IN')}</span>
            <button onClick={() => setCreateMode(false)} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={saving || totalItems === 0}
              className="rounded bg-emerald-600 text-white px-4 py-1.5 text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {saving ? 'Creating...' : 'Create Order'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ═══════════════════════ LIST VIEW ═══════════════════════ */
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Orders</h1>
          <p className="mt-1 text-sm text-gray-500">Manage customer orders and fulfillment</p>
        </div>
        <button onClick={openCreate}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
          + New Order
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
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === t.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
          {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="ml-auto w-64">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search orders..." />
        </div>
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      <div className="mt-4">
        <DataTable columns={COLUMNS} data={ordersList} loading={loading} onRowClick={handleRowClick} emptyText="No orders found." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>
    </div>
  )
}
