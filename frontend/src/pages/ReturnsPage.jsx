import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getReturnNotes, getReturnNote, createReturnNote, approveReturnNote, dispatchReturnNote, acknowledgeReturnNote, closeReturnNote, cancelReturnNote } from '../api/returns'
import { getSalesReturns, getSalesReturn, createSalesReturn, receiveSalesReturn, inspectSalesReturn, restockSalesReturn, closeSalesReturn, cancelSalesReturn } from '../api/salesReturns'
import { getSuppliers } from '../api/suppliers'
import { getAllTransports } from '../api/transports'
import { getOrders } from '../api/orders'
import { getAllCustomers } from '../api/customers'
import { getSKUs } from '../api/skus'
import DataTable from '../components/common/DataTable'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'
import SearchInput from '../components/common/SearchInput'
import FilterSelect from '../components/common/FilterSelect'
import Modal from '../components/common/Modal'

/* ── Supplier Returns constants ── */
const SUPPLIER_TABS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'approved', label: 'Approved' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'closed', label: 'Closed' },
  { key: 'cancelled', label: 'Cancelled' },
]

const TYPE_TABS = [
  { key: '', label: 'All Types' },
  { key: 'roll_return', label: 'Roll Returns' },
  { key: 'sku_return', label: 'SKU Returns' },
]

const REASON_OPTIONS = [
  { value: '', label: 'Select reason' },
  { value: 'defective', label: 'Defective' },
  { value: 'excess', label: 'Excess Stock' },
  { value: 'wrong_material', label: 'Wrong Material' },
  { value: 'damaged_in_transit', label: 'Damaged in Transit' },
  { value: 'quality_reject', label: 'Quality Reject' },
  { value: 'other', label: 'Other' },
]

/* ── Sales Returns constants ── */
const SALES_TABS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'received', label: 'Received' },
  { key: 'inspected', label: 'Inspected' },
  { key: 'restocked', label: 'Restocked' },
  { key: 'closed', label: 'Closed' },
  { key: 'cancelled', label: 'Cancelled' },
]

const SALES_REASON_OPTIONS = [
  { value: '', label: 'Select reason' },
  { value: 'defective', label: 'Defective' },
  { value: 'wrong_item', label: 'Wrong Item' },
  { value: 'size_mismatch', label: 'Size Mismatch' },
  { value: 'color_mismatch', label: 'Color Mismatch' },
  { value: 'damaged_in_transit', label: 'Damaged in Transit' },
  { value: 'customer_changed_mind', label: 'Customer Changed Mind' },
  { value: 'other', label: 'Other' },
]

const CONDITION_OPTIONS = [
  { value: 'good', label: 'Good — Restock' },
  { value: 'damaged', label: 'Damaged — Write Off' },
  { value: 'rejected', label: 'Rejected' },
]

const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtCurrency = (v) => `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const KPI_COLORS = {
  slate: 'from-slate-500 to-slate-600',
  amber: 'from-amber-500 to-amber-600',
  green: 'from-green-500 to-green-600',
  emerald: 'from-emerald-500 to-emerald-600',
  red: 'from-red-500 to-red-600',
  blue: 'from-blue-500 to-blue-600',
  orange: 'from-orange-500 to-orange-600',
  purple: 'from-purple-500 to-purple-600',
  teal: 'from-teal-500 to-teal-600',
}

function KPICard({ label, value, sub, color = 'slate' }) {
  return (
    <div className={`rounded-lg bg-gradient-to-br ${KPI_COLORS[color] || KPI_COLORS.slate} p-2.5 text-white shadow-sm`}>
      <p className="typo-label-sm tracking-wide text-white/85">{label}</p>
      <p className="mt-0.5 text-xl font-bold leading-tight">{value}</p>
      {sub && <p className="typo-caption text-white/75">{sub}</p>}
    </div>
  )
}

/* ── Supplier Returns columns ── */
const SUPPLIER_COLUMNS = [
  { key: 'return_note_no', label: 'Return #', render: (val) => <span className="font-semibold text-emerald-700">{val}</span> },
  { key: 'return_type', label: 'Type', render: (val) => (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 typo-badge ${val === 'roll_return' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
      {val === 'roll_return' ? 'Roll' : 'SKU'}
    </span>
  )},
  { key: 'supplier', label: 'Supplier', render: (val) => val?.name || '—' },
  { key: 'total_amount', label: 'Amount', render: (val) => fmtCurrency(val) },
  { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
  { key: 'return_date', label: 'Date', render: (val) => fmtDate(val) },
]

/* ── Sales Returns columns ── */
const SALES_COLUMNS = [
  { key: 'srn_no', label: 'SRN #', render: (val) => <span className="font-semibold text-emerald-700">{val}</span> },
  { key: 'customer', label: 'Customer', render: (val) => val?.name || '—' },
  { key: 'order', label: 'Order', render: (val) => val?.order_number || '—' },
  { key: 'items', label: 'Items', render: (val) => val?.length || 0 },
  { key: 'total_amount', label: 'Amount', render: (val) => fmtCurrency(val) },
  { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
  { key: 'return_date', label: 'Date', render: (val) => fmtDate(val) },
]

export default function ReturnsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [category, setCategory] = useState(searchParams.get('tab') || 'supplier')

  // ── Shared state ──
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Detail overlay
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actioning, setActioning] = useState(false)

  // Supplier create mode
  const [createMode, setCreateMode] = useState(false)
  const [suppliers, setSuppliers] = useState([])
  const [transports, setTransports] = useState([])
  const [form, setForm] = useState({ return_type: 'roll_return', supplier_id: '', transport_id: '', lr_number: '', notes: '' })
  const [formItems, setFormItems] = useState([{ roll_id: '', sku_id: '', quantity: 1, weight: '', unit_price: '', reason: '', notes: '' }])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  // Sales return create mode
  const [salesCreateMode, setSalesCreateMode] = useState(false)
  const [customers, setCustomers] = useState([])
  const [skus, setSkus] = useState([])
  const [orders, setOrders] = useState([])
  const [customerOrders, setCustomerOrders] = useState([])
  const [salesForm, setSalesForm] = useState({ customer_id: '', order_id: '', transport_id: '', lr_number: '', lr_date: '', reason_summary: '' })
  const [salesItems, setSalesItems] = useState([])
  const [salesSaving, setSalesSaving] = useState(false)
  const [salesFormError, setSalesFormError] = useState(null)

  // Sales return inspect mode (inline in detail)
  const [inspectMode, setInspectMode] = useState(false)
  const [inspectItems, setInspectItems] = useState([])
  const [inspectNotes, setInspectNotes] = useState('')

  // Confirm cancel
  const [confirmCancel, setConfirmCancel] = useState(false)

  // Deep-link: ?open=<id> or ?create=1&customer=X&order=Y
  useEffect(() => {
    const openId = searchParams.get('open')
    const createFlag = searchParams.get('create')
    const cat = searchParams.get('tab') || 'supplier'
    setCategory(cat)

    if (openId && cat === 'sales') {
      setDetailLoading(true)
      setDetail({ id: openId })
      getSalesReturn(openId).then(res => setDetail(res.data?.data || res.data)).catch(() => {}).finally(() => setDetailLoading(false))
    } else if (createFlag === '1' && cat === 'sales') {
      const prefillCustomer = searchParams.get('customer') || ''
      const prefillOrder = searchParams.get('order') || ''
      openSalesCreate(prefillCustomer, prefillOrder)
    }
  }, [])

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let res
      if (category === 'supplier') {
        res = await getReturnNotes({
          page, page_size: 20,
          status: statusFilter || undefined,
          return_type: typeFilter || undefined,
          search: search || undefined,
        })
      } else {
        res = await getSalesReturns({
          page, page_size: 20,
          status: statusFilter || undefined,
          search: search || undefined,
        })
      }
      const d = res.data?.data || res.data
      if (Array.isArray(d)) {
        setList(d)
        setTotal(res.data?.total || d.length)
        setPages(res.data?.pages || 1)
      } else {
        setList(d?.data || [])
        setTotal(d?.total || 0)
        setPages(d?.pages || 1)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load returns')
    } finally { setLoading(false) }
  }, [page, statusFilter, typeFilter, search, category])

  useEffect(() => { fetchData() }, [fetchData])

  const switchCategory = (cat) => {
    setCategory(cat)
    setStatusFilter('')
    setTypeFilter('')
    setSearch('')
    setPage(1)
    setDetail(null)
    setSearchParams(cat === 'supplier' ? {} : { tab: cat })
  }

  /* ═══════════════════════════ SUPPLIER RETURNS LOGIC ═══════════════════════════ */

  const supplierKpis = useMemo(() => {
    if (category !== 'supplier') return {}
    const all = list
    return {
      total: all.length,
      draftCount: all.filter(n => n.status === 'draft').length,
      approvedCount: all.filter(n => n.status === 'approved').length,
      dispatchedCount: all.filter(n => n.status === 'dispatched').length,
      closedCount: all.filter(n => n.status === 'closed').length,
      totalAmt: all.filter(n => n.status !== 'cancelled').reduce((s, n) => s + (n.total_amount || 0), 0),
    }
  }, [list, category])

  const handleSupplierRowClick = async (row) => {
    setDetailLoading(true)
    setDetail(row)
    try {
      const res = await getReturnNote(row.id)
      setDetail(res.data?.data || res.data)
    } catch { /* fallback to list data */ }
    finally { setDetailLoading(false) }
  }

  const handleSupplierAction = async (action) => {
    setActioning(true)
    try {
      const fns = { approve: approveReturnNote, dispatch: dispatchReturnNote, acknowledge: acknowledgeReturnNote, close: closeReturnNote, cancel: cancelReturnNote }
      const fn = fns[action]
      if (!fn) return
      const res = await fn(detail.id)
      setDetail(res.data?.data || res.data)
      fetchData()
      if (action === 'cancel') setConfirmCancel(false)
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to ${action}`)
    } finally { setActioning(false) }
  }

  const openSupplierCreate = async () => {
    setCreateMode(true)
    setFormError(null)
    setForm({ return_type: 'roll_return', supplier_id: '', transport_id: '', lr_number: '', notes: '' })
    setFormItems([{ roll_id: '', sku_id: '', quantity: 1, weight: '', unit_price: '', reason: '', notes: '' }])
    try {
      const [supRes, transRes] = await Promise.all([getSuppliers({ is_active: true }), getAllTransports()])
      setSuppliers(supRes.data?.data || [])
      setTransports(transRes.data?.data || [])
    } catch {}
  }

  const addItem = () => setFormItems(prev => [...prev, { roll_id: '', sku_id: '', quantity: 1, weight: '', unit_price: '', reason: '', notes: '' }])
  const removeItem = (idx) => setFormItems(prev => prev.filter((_, i) => i !== idx))
  const updateItem = (idx, field, value) => setFormItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))

  const handleSupplierCreate = async () => {
    if (!form.supplier_id) { setFormError('Select a supplier'); return }
    if (formItems.length === 0) { setFormError('Add at least one item'); return }

    setSaving(true)
    setFormError(null)
    try {
      await createReturnNote({
        return_type: form.return_type,
        supplier_id: form.supplier_id,
        return_date: new Date().toISOString().split('T')[0],
        transport_id: form.transport_id || null,
        lr_number: form.lr_number?.trim() || null,
        notes: form.notes?.trim() || null,
        items: formItems.map(item => ({
          roll_id: item.roll_id || null,
          sku_id: item.sku_id || null,
          quantity: parseInt(item.quantity) || 1,
          weight: item.weight ? parseFloat(item.weight) : null,
          unit_price: item.unit_price ? parseFloat(item.unit_price) : null,
          reason: item.reason || null,
          notes: item.notes?.trim() || null,
        })),
      })
      setCreateMode(false)
      fetchData()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to create return note')
    } finally { setSaving(false) }
  }

  /* ═══════════════════════════ SALES RETURNS LOGIC ═══════════════════════════ */

  const salesKpis = useMemo(() => {
    if (category !== 'sales') return {}
    const all = list
    return {
      total: all.length,
      draftCount: all.filter(n => n.status === 'draft').length,
      receivedCount: all.filter(n => n.status === 'received').length,
      inspectedCount: all.filter(n => n.status === 'inspected').length,
      restockedCount: all.filter(n => n.status === 'restocked').length,
      closedCount: all.filter(n => n.status === 'closed').length,
      totalAmt: all.filter(n => n.status !== 'cancelled').reduce((s, n) => s + (n.total_amount || 0), 0),
    }
  }, [list, category])

  const handleSalesRowClick = async (row) => {
    setDetailLoading(true)
    setDetail(row)
    setInspectMode(false)
    try {
      const res = await getSalesReturn(row.id)
      setDetail(res.data?.data || res.data)
    } catch { /* fallback to list data */ }
    finally { setDetailLoading(false) }
  }

  const handleSalesAction = async (action) => {
    setActioning(true)
    try {
      const fns = { receive: receiveSalesReturn, restock: restockSalesReturn, close: closeSalesReturn, cancel: cancelSalesReturn }
      const fn = fns[action]
      if (!fn) return
      const res = await fn(detail.id)
      setDetail(res.data?.data || res.data)
      fetchData()
      if (action === 'cancel') setConfirmCancel(false)
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to ${action}`)
    } finally { setActioning(false) }
  }

  const openSalesCreate = async (prefillCustomerId, prefillOrderId) => {
    setSalesCreateMode(true)
    setSalesFormError(null)
    setSalesForm({ customer_id: prefillCustomerId || '', order_id: prefillOrderId || '', transport_id: '', lr_number: '', lr_date: '', reason_summary: '' })
    setSalesItems([])
    setCustomerOrders([])
    try {
      const [custRes, transRes, skuRes] = await Promise.all([
        getAllCustomers(),
        getAllTransports(),
        getSKUs({ page_size: 500 }),
      ])
      setCustomers(custRes.data?.data || [])
      setTransports(transRes.data?.data || [])
      const skuData = skuRes.data?.data || skuRes.data
      setSkus(Array.isArray(skuData) ? skuData : skuData?.data || [])

      // If pre-filling, load customer's orders
      if (prefillCustomerId) {
        const ordRes = await getOrders({ page_size: 200 })
        const ordData = ordRes.data?.data || ordRes.data
        const ordList = Array.isArray(ordData) ? ordData : ordData?.data || []
        const custOrds = ordList.filter(o =>
          o.customer_id === prefillCustomerId &&
          ['shipped', 'partially_shipped', 'delivered', 'partially_returned'].includes(o.status)
        )
        setCustomerOrders(custOrds)

        // If order pre-filled, auto-load items
        if (prefillOrderId) {
          const order = custOrds.find(o => o.id === prefillOrderId)
          if (order?.items) {
            setSalesItems(order.items
              .map(oi => {
                const maxReturn = (oi.fulfilled_qty || 0) - (oi.returned_qty || 0)
                return {
                  order_item_id: oi.id, sku_id: oi.sku?.id || '', sku_code: oi.sku?.sku_code || '',
                  color: oi.sku?.color || '', size: oi.sku?.size || '',
                  fulfilled: oi.fulfilled_qty || 0, already_returned: oi.returned_qty || 0,
                  max_qty: maxReturn, qty: maxReturn, unit_price: oi.unit_price || '',
                  reason: '', checked: maxReturn > 0, fromOrder: true,
                }
              })
              .filter(it => it.max_qty > 0)
            )
          }
        }
      }
    } catch {}
  }

  const handleCustomerSelect = async (custId) => {
    setSalesForm(f => ({ ...f, customer_id: custId, order_id: '' }))
    setSalesItems([])
    setCustomerOrders([])
    if (!custId) return
    try {
      const ordRes = await getOrders({ page_size: 200 })
      const ordData = ordRes.data?.data || ordRes.data
      const ordList = Array.isArray(ordData) ? ordData : ordData?.data || []
      const custOrds = ordList.filter(o =>
        o.customer_id === custId &&
        ['shipped', 'partially_shipped', 'delivered', 'partially_returned'].includes(o.status)
      )
      setCustomerOrders(custOrds)
    } catch {}
  }

  const handleOrderSelect = (orderId) => {
    setSalesForm(f => ({ ...f, order_id: orderId }))
    if (!orderId) { setSalesItems([]); return }
    const order = customerOrders.find(o => o.id === orderId)
    if (!order || !order.items) { setSalesItems([]); return }
    setSalesItems(order.items
      .map(oi => {
        const maxReturn = (oi.fulfilled_qty || 0) - (oi.returned_qty || 0)
        return {
          order_item_id: oi.id, sku_id: oi.sku?.id || '', sku_code: oi.sku?.sku_code || '',
          color: oi.sku?.color || '', size: oi.sku?.size || '',
          fulfilled: oi.fulfilled_qty || 0, already_returned: oi.returned_qty || 0,
          max_qty: maxReturn, qty: maxReturn, unit_price: oi.unit_price || '',
          reason: '', checked: maxReturn > 0, fromOrder: true,
        }
      })
      .filter(it => it.max_qty > 0)
    )
  }

  const addManualItem = () => setSalesItems(prev => [...prev, {
    order_item_id: null, sku_id: '', sku_code: '', color: '', size: '',
    fulfilled: 0, already_returned: 0, max_qty: 0, qty: 1, unit_price: '',
    reason: '', checked: true, fromOrder: false,
  }])

  const removeManualItem = (idx) => setSalesItems(prev => prev.filter((_, i) => i !== idx))

  const handleSalesCreate = async () => {
    if (!salesForm.customer_id) { setSalesFormError('Select a customer'); return }
    const checkedItems = salesItems.filter(it => it.checked && it.qty > 0)
    if (checkedItems.length === 0) { setSalesFormError('Add at least one item to return'); return }

    setSalesSaving(true)
    setSalesFormError(null)
    try {
      await createSalesReturn({
        customer_id: salesForm.customer_id,
        order_id: salesForm.order_id || null,
        return_date: new Date().toISOString().split('T')[0],
        transport_id: salesForm.transport_id || null,
        lr_number: salesForm.lr_number?.trim() || null,
        lr_date: salesForm.lr_date || null,
        reason_summary: salesForm.reason_summary?.trim() || null,
        items: checkedItems.map(it => ({
          sku_id: it.sku_id,
          quantity_returned: it.qty,
          order_item_id: it.order_item_id || null,
          unit_price: it.unit_price ? parseFloat(it.unit_price) : null,
          reason: it.reason || null,
        })),
      })
      setSalesCreateMode(false)
      fetchData()
    } catch (err) {
      setSalesFormError(err.response?.data?.detail || 'Failed to create sales return')
    } finally { setSalesSaving(false) }
  }

  // Inspect handlers
  const startInspect = () => {
    setInspectMode(true)
    setInspectItems((detail.items || []).map(item => ({
      item_id: item.id,
      condition: item.condition === 'pending' ? 'good' : item.condition,
      quantity_restocked: item.quantity_returned,
      quantity_damaged: 0,
      notes: item.notes || '',
    })))
    setInspectNotes(detail.qc_notes || '')
  }

  const handleInspectSubmit = async () => {
    setActioning(true)
    try {
      const res = await inspectSalesReturn(detail.id, {
        items: inspectItems,
        qc_notes: inspectNotes.trim() || null,
      })
      setDetail(res.data?.data || res.data)
      setInspectMode(false)
      fetchData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Inspection failed')
    } finally { setActioning(false) }
  }

  /* ═══════════════════════════ SALES RETURN DETAIL ═══════════════════════════ */
  if (detail && category === 'sales') {
    const sr = detail
    const statusFlow = ['draft', 'received', 'inspected', 'restocked', 'closed']
    const currentIdx = statusFlow.indexOf(sr.status)

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-auto">
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="typo-modal-title text-white leading-tight">{sr.srn_no}</h1>
            <p className="text-xs opacity-80">
              Sales Return &middot; <StatusBadge status={sr.status} />
              {sr.credit_note_no && <span className="ml-2 bg-white/20 rounded px-1.5 py-0.5 text-xs">{sr.credit_note_no}</span>}
            </p>
          </div>
          <button onClick={() => { setDetail(null); setInspectMode(false); setSearchParams(category === 'supplier' ? {} : { tab: category }) }}
            className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors">Close</button>
        </div>

        {detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : (
          <div className="flex-1 p-4 max-w-5xl mx-auto w-full space-y-3">
            {/* Status timeline */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {statusFlow.map((s, i) => (
                <div key={s} className="flex items-center">
                  <div className={`rounded-full px-2.5 py-0.5 typo-badge capitalize whitespace-nowrap ${
                    i <= currentIdx ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'
                  }`}>{s}</div>
                  {i < statusFlow.length - 1 && <div className={`w-6 h-0.5 ${i < currentIdx ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
                </div>
              ))}
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Customer</p>
                <p className="typo-body">{sr.customer?.name || '—'}</p>
                {sr.customer?.phone && <p className="typo-caption">{sr.customer.phone}</p>}
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Order</p>
                <p className="typo-body font-semibold text-emerald-700">{sr.order?.order_number || '—'}</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Return Date</p>
                <p className="typo-body">{fmtDate(sr.return_date)}</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Total Amount</p>
                <p className="typo-body font-semibold">{fmtCurrency(sr.total_amount)}</p>
              </div>
              {sr.transport && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Transport</p>
                  <p className="typo-body">{sr.transport.name}</p>
                </div>
              )}
              {sr.lr_number && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">L.R. Number</p>
                  <p className="typo-body">{sr.lr_number}</p>
                </div>
              )}
              {sr.received_date && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Received</p>
                  <p className="typo-body">{fmtDate(sr.received_date)}</p>
                  {sr.received_by_user && <p className="typo-caption">{sr.received_by_user.full_name}</p>}
                </div>
              )}
              {sr.inspected_date && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Inspected</p>
                  <p className="typo-body">{fmtDate(sr.inspected_date)}</p>
                  {sr.inspected_by_user && <p className="typo-caption">{sr.inspected_by_user.full_name}</p>}
                </div>
              )}
              {sr.restocked_date && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Restocked</p>
                  <p className="typo-body">{fmtDate(sr.restocked_date)}</p>
                </div>
              )}
              {sr.credit_note_no && (
                <div className="bg-green-50 rounded p-2">
                  <p className="typo-label-sm">Credit Note</p>
                  <p className="typo-body font-semibold text-green-700">{sr.credit_note_no}</p>
                </div>
              )}
            </div>

            {sr.reason_summary && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                <span className="font-semibold">Reason:</span> {sr.reason_summary}
              </div>
            )}
            {sr.qc_notes && (
              <div className="bg-purple-50 border border-purple-200 rounded p-2 text-xs text-purple-800">
                <span className="font-semibold">QC Notes:</span> {sr.qc_notes}
              </div>
            )}

            {/* Inspect mode — inline QC form */}
            {inspectMode ? (
              <div className="border-2 border-purple-300 rounded-lg p-3 space-y-3 bg-purple-50/30">
                <div className="flex items-center justify-between">
                  <h3 className="typo-section-title text-purple-700">QC Inspection</h3>
                  <button onClick={() => setInspectMode(false)} className="text-gray-500 hover:text-gray-700 typo-btn-sm">Cancel</button>
                </div>
                <div className="border rounded overflow-hidden bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr className="text-left">
                        <th className="px-2 py-1.5 typo-th">SKU</th>
                        <th className="px-2 py-1.5 typo-th text-right">Returned</th>
                        <th className="px-2 py-1.5 typo-th">Condition</th>
                        <th className="px-2 py-1.5 typo-th text-right">Restock</th>
                        <th className="px-2 py-1.5 typo-th text-right">Damaged</th>
                        <th className="px-2 py-1.5 typo-th">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {inspectItems.map((insp, idx) => {
                        const srcItem = (sr.items || [])[idx]
                        return (
                          <tr key={insp.item_id}>
                            <td className="px-2 py-1.5 font-semibold">{srcItem?.sku?.sku_code || '—'}</td>
                            <td className="px-2 py-1.5 text-right">{srcItem?.quantity_returned || 0}</td>
                            <td className="px-2 py-1.5">
                              <FilterSelect full value={insp.condition}
                                onChange={v => {
                                  setInspectItems(prev => prev.map((it, i) => {
                                    if (i !== idx) return it
                                    const qty = srcItem?.quantity_returned || 0
                                    if (v === 'good') return { ...it, condition: v, quantity_restocked: qty, quantity_damaged: 0 }
                                    if (v === 'damaged' || v === 'rejected') return { ...it, condition: v, quantity_restocked: 0, quantity_damaged: qty }
                                    return { ...it, condition: v }
                                  }))
                                }}
                                options={CONDITION_OPTIONS} />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" className="typo-input-sm w-16 text-right" min={0}
                                max={srcItem?.quantity_returned || 0}
                                value={insp.quantity_restocked}
                                onChange={e => {
                                  const v = Math.max(0, Math.min(parseInt(e.target.value) || 0, srcItem?.quantity_returned || 0))
                                  setInspectItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity_restocked: v, quantity_damaged: (srcItem?.quantity_returned || 0) - v } : it))
                                }} />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" className="typo-input-sm w-16 text-right" min={0}
                                max={srcItem?.quantity_returned || 0}
                                value={insp.quantity_damaged}
                                onChange={e => {
                                  const v = Math.max(0, Math.min(parseInt(e.target.value) || 0, srcItem?.quantity_returned || 0))
                                  setInspectItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity_damaged: v, quantity_restocked: (srcItem?.quantity_returned || 0) - v } : it))
                                }} />
                            </td>
                            <td className="px-2 py-1.5">
                              <input className="typo-input-sm w-full" placeholder="Notes"
                                value={insp.notes}
                                onChange={e => setInspectItems(prev => prev.map((it, i) => i === idx ? { ...it, notes: e.target.value } : it))} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div>
                  <label className="typo-label">QC Notes</label>
                  <textarea className="typo-input w-full" rows={2} value={inspectNotes} onChange={e => setInspectNotes(e.target.value)} placeholder="Overall QC observations..." />
                </div>
                <div className="flex justify-end">
                  <button onClick={handleInspectSubmit} disabled={actioning}
                    className="rounded bg-purple-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-purple-700 disabled:opacity-50">
                    {actioning ? 'Submitting...' : 'Submit Inspection'}
                  </button>
                </div>
              </div>
            ) : (
              /* Items table (read-only) */
              <div className="border rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr className="text-left">
                      <th className="px-2 py-1.5 typo-th">#</th>
                      <th className="px-2 py-1.5 typo-th">SKU</th>
                      <th className="px-2 py-1.5 typo-th text-right">Returned</th>
                      <th className="px-2 py-1.5 typo-th text-right">Restocked</th>
                      <th className="px-2 py-1.5 typo-th text-right">Damaged</th>
                      <th className="px-2 py-1.5 typo-th">Condition</th>
                      <th className="px-2 py-1.5 typo-th">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(sr.items || []).map((item, i) => (
                      <tr key={item.id || i} className="hover:bg-gray-50">
                        <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                        <td className="px-2 py-1.5">
                          <span className="font-semibold">{item.sku?.sku_code || '—'}</span>
                          {item.sku?.color && <span className="text-gray-400 ml-1">· {item.sku.color}</span>}
                          {item.sku?.size && <span className="text-gray-400 ml-1">· {item.sku.size}</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold">{item.quantity_returned}</td>
                        <td className="px-2 py-1.5 text-right">
                          {item.quantity_restocked > 0 && <span className="text-green-600 font-semibold">{item.quantity_restocked}</span>}
                          {item.quantity_restocked === 0 && <span className="text-gray-300">0</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {item.quantity_damaged > 0 && <span className="text-red-600 font-semibold">{item.quantity_damaged}</span>}
                          {item.quantity_damaged === 0 && <span className="text-gray-300">0</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          <StatusBadge status={item.condition} />
                        </td>
                        <td className="px-2 py-1.5">
                          {item.reason && (
                            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 typo-badge bg-orange-100 text-orange-700 capitalize">
                              {item.reason.replace(/_/g, ' ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Actions */}
            {!inspectMode && (
              <div className="flex justify-end gap-2 pt-3 border-t">
                {sr.status === 'draft' && (
                  <>
                    <button onClick={() => setConfirmCancel(true)} disabled={actioning}
                      className="rounded border border-red-300 text-red-600 px-4 py-1.5 typo-btn-sm hover:bg-red-50 disabled:opacity-50 transition-colors">
                      Cancel
                    </button>
                    <button onClick={() => handleSalesAction('receive')} disabled={actioning}
                      className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                      {actioning ? 'Processing...' : 'Mark Received'}
                    </button>
                  </>
                )}
                {sr.status === 'received' && (
                  <>
                    <button onClick={() => setConfirmCancel(true)} disabled={actioning}
                      className="rounded border border-red-300 text-red-600 px-4 py-1.5 typo-btn-sm hover:bg-red-50 disabled:opacity-50 transition-colors">
                      Cancel
                    </button>
                    <button onClick={startInspect} disabled={actioning}
                      className="rounded bg-purple-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-purple-700 disabled:opacity-50 transition-colors">
                      Inspect Items
                    </button>
                  </>
                )}
                {sr.status === 'inspected' && (
                  <button onClick={() => handleSalesAction('restock')} disabled={actioning}
                    className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {actioning ? 'Processing...' : 'Restock Items'}
                  </button>
                )}
                {sr.status === 'restocked' && (
                  <button onClick={() => handleSalesAction('close')} disabled={actioning}
                    className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {actioning ? 'Processing...' : 'Close & Generate Credit Note'}
                  </button>
                )}
              </div>
            )}

            {/* Cancel confirmation */}
            <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel Sales Return" actions={
              <>
                <button onClick={() => setConfirmCancel(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 typo-btn-sm text-gray-600 hover:bg-gray-50">No, Keep</button>
                <button onClick={() => handleSalesAction('cancel')} disabled={actioning}
                  className="rounded-lg bg-red-600 px-4 py-1.5 typo-btn-sm text-white hover:bg-red-700 disabled:opacity-50">
                  {actioning ? 'Cancelling...' : 'Yes, Cancel'}
                </button>
              </>
            }>
              <p className="typo-body">Cancel sales return <span className="font-semibold">{sr.srn_no}</span>? This will reverse the returned qty reservation on the order.</p>
            </Modal>
          </div>
        )}
      </div>
    )
  }

  /* ═══════════════════════════ SUPPLIER RETURN DETAIL ═══════════════════════════ */
  if (detail && category === 'supplier') {
    const n = detail
    const statusFlow = ['draft', 'approved', 'dispatched', 'acknowledged', 'closed']
    const currentIdx = statusFlow.indexOf(n.status)

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-auto">
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="typo-modal-title text-white leading-tight">{n.return_note_no}</h1>
            <p className="text-xs opacity-80">
              {n.return_type === 'roll_return' ? 'Roll Return' : 'SKU Return'} &middot; <StatusBadge status={n.status} />
            </p>
          </div>
          <button onClick={() => setDetail(null)} className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors">Close</button>
        </div>

        {detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : (
          <div className="flex-1 p-4 max-w-5xl mx-auto w-full space-y-3">
            {/* Status timeline */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {statusFlow.map((s, i) => (
                <div key={s} className="flex items-center">
                  <div className={`rounded-full px-2.5 py-0.5 typo-badge capitalize whitespace-nowrap ${
                    i <= currentIdx ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'
                  }`}>{s}</div>
                  {i < statusFlow.length - 1 && <div className={`w-6 h-0.5 ${i < currentIdx ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
                </div>
              ))}
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Supplier</p>
                <p className="typo-body">{n.supplier?.name || '—'}</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Return Date</p>
                <p className="typo-body">{fmtDate(n.return_date)}</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Total Amount</p>
                <p className="typo-body font-semibold">{fmtCurrency(n.total_amount)}</p>
              </div>
              {n.transport && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Transport</p>
                  <p className="typo-body">{n.transport.name}</p>
                </div>
              )}
              {n.lr_number && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">L.R. Number</p>
                  <p className="typo-body">{n.lr_number}</p>
                </div>
              )}
              {n.dispatch_date && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Dispatched</p>
                  <p className="typo-body">{fmtDate(n.dispatch_date)}</p>
                </div>
              )}
              {n.approved_by_user && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Approved By</p>
                  <p className="typo-body">{n.approved_by_user.full_name}</p>
                </div>
              )}
            </div>

            {n.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                <span className="font-semibold">Notes:</span> {n.notes}
              </div>
            )}

            {/* Items table */}
            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 typo-th">#</th>
                    <th className="px-2 py-1.5 typo-th">{n.return_type === 'roll_return' ? 'Roll' : 'SKU'}</th>
                    <th className="px-2 py-1.5 typo-th text-right">{n.return_type === 'roll_return' ? 'Weight' : 'Qty'}</th>
                    <th className="px-2 py-1.5 typo-th text-right">Unit Price</th>
                    <th className="px-2 py-1.5 typo-th text-right">Amount</th>
                    <th className="px-2 py-1.5 typo-th">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(n.items || []).map((item, i) => (
                    <tr key={item.id || i} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                      <td className="px-2 py-1.5 font-semibold">
                        {item.roll ? item.roll.roll_code : item.sku ? item.sku.sku_code : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {n.return_type === 'roll_return'
                          ? (item.weight ? `${item.weight} kg` : '—')
                          : item.quantity
                        }
                      </td>
                      <td className="px-2 py-1.5 text-right">{item.unit_price ? fmtCurrency(item.unit_price) : '—'}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">{item.amount ? fmtCurrency(item.amount) : '—'}</td>
                      <td className="px-2 py-1.5">
                        {item.reason && (
                          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 typo-badge bg-orange-100 text-orange-700 capitalize">
                            {item.reason.replace(/_/g, ' ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t">
              {n.status === 'draft' && (
                <>
                  <button onClick={() => setConfirmCancel(true)} disabled={actioning}
                    className="rounded border border-red-300 text-red-600 px-4 py-1.5 typo-btn-sm hover:bg-red-50 disabled:opacity-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={() => handleSupplierAction('approve')} disabled={actioning}
                    className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {actioning ? 'Processing...' : 'Approve'}
                  </button>
                </>
              )}
              {n.status === 'approved' && (
                <>
                  <button onClick={() => setConfirmCancel(true)} disabled={actioning}
                    className="rounded border border-red-300 text-red-600 px-4 py-1.5 typo-btn-sm hover:bg-red-50 disabled:opacity-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={() => handleSupplierAction('dispatch')} disabled={actioning}
                    className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {actioning ? 'Processing...' : 'Mark Dispatched'}
                  </button>
                </>
              )}
              {n.status === 'dispatched' && (
                <>
                  <button onClick={() => handleSupplierAction('acknowledge')} disabled={actioning}
                    className="rounded border border-gray-300 text-gray-700 px-4 py-1.5 typo-btn-sm hover:bg-gray-50 disabled:opacity-50 transition-colors">
                    {actioning ? 'Processing...' : 'Acknowledge'}
                  </button>
                  <button onClick={() => handleSupplierAction('close')} disabled={actioning}
                    className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {actioning ? 'Processing...' : 'Close & Debit Supplier'}
                  </button>
                </>
              )}
              {n.status === 'acknowledged' && (
                <button onClick={() => handleSupplierAction('close')} disabled={actioning}
                  className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {actioning ? 'Processing...' : 'Close & Debit Supplier'}
                </button>
              )}
            </div>

            {/* Cancel confirmation */}
            <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel Return Note" actions={
              <>
                <button onClick={() => setConfirmCancel(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 typo-btn-sm text-gray-600 hover:bg-gray-50">No, Keep</button>
                <button onClick={() => handleSupplierAction('cancel')} disabled={actioning}
                  className="rounded-lg bg-red-600 px-4 py-1.5 typo-btn-sm text-white hover:bg-red-700 disabled:opacity-50">
                  {actioning ? 'Cancelling...' : 'Yes, Cancel'}
                </button>
              </>
            }>
              <p className="typo-body">Cancel return note <span className="font-semibold">{n.return_note_no}</span>? This cannot be undone.</p>
            </Modal>
          </div>
        )}
      </div>
    )
  }

  /* ═══════════════════════════ SUPPLIER CREATE OVERLAY ═══════════════════════════ */
  if (createMode) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setCreateMode(false)} className="rounded-lg p-1.5 hover:bg-white/20 transition-colors">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h2 className="text-lg font-bold tracking-tight">New Return Note</h2>
              <p className="text-xs text-emerald-100">Supplier return &mdash; rolls or SKUs</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">{formItems.length} items</span>
            <button onClick={() => setCreateMode(false)} className="rounded-lg border border-white/30 px-3 py-1.5 text-sm hover:bg-white/20 transition-colors">Cancel</button>
            <button onClick={handleSupplierCreate} disabled={saving}
              className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors">
              {saving ? 'Creating...' : 'Create Return Note'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {formError && <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />}

          {/* Return Details card */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-end gap-0 border-b border-gray-200 bg-gray-50">
              <div className="px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Return Details</span>
              </div>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="typo-label-sm">RETURN TYPE</label>
                <FilterSelect full value={form.return_type}
                  onChange={v => setForm(f => ({ ...f, return_type: v }))}
                  options={[{ value: 'roll_return', label: 'Roll Return' }, { value: 'sku_return', label: 'SKU Return' }]} />
              </div>
              <div>
                <label className="typo-label-sm">SUPPLIER *</label>
                <FilterSelect searchable full value={form.supplier_id}
                  onChange={v => setForm(f => ({ ...f, supplier_id: v }))}
                  options={[{ value: '', label: 'Select Supplier' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]} />
              </div>
              <div>
                <label className="typo-label-sm">TRANSPORT</label>
                <FilterSelect searchable full value={form.transport_id}
                  onChange={v => setForm(f => ({ ...f, transport_id: v }))}
                  options={[{ value: '', label: 'Select Transport' }, ...transports.map(t => ({ value: t.id, label: t.name }))]} />
              </div>
              <div>
                <label className="typo-label-sm">L.R. NUMBER</label>
                <input className="typo-input" value={form.lr_number} onChange={e => setForm(f => ({ ...f, lr_number: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
          </div>

          {/* Line Items card */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Line Items ({formItems.length} items)</span>
              <button onClick={addItem} className="rounded-lg bg-emerald-600 text-white px-3 py-1 text-xs font-semibold hover:bg-emerald-700 transition-colors">+ Add Row</button>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-emerald-600">
                  <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider w-[5%] border-r border-emerald-500">#</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider w-[35%] border-r border-emerald-500">{form.return_type === 'roll_return' ? 'Roll ID' : 'SKU ID'}</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider w-[15%] border-r border-emerald-500">{form.return_type === 'roll_return' ? 'Weight (kg)' : 'Qty'}</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider w-[15%] border-r border-emerald-500">Rate (₹)</th>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider w-[25%] border-r border-emerald-500">Reason</th>
                  <th className="px-2 py-2 text-xs font-semibold text-white uppercase tracking-wider w-[5%]"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {formItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-2 py-2 text-gray-400">{idx + 1}</td>
                    <td className="px-2 py-2">
                      <input className="typo-input-sm w-full"
                        placeholder={form.return_type === 'roll_return' ? 'Paste roll UUID' : 'Paste SKU UUID'}
                        value={form.return_type === 'roll_return' ? item.roll_id : item.sku_id}
                        onChange={e => updateItem(idx, form.return_type === 'roll_return' ? 'roll_id' : 'sku_id', e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" className="typo-input-sm w-full text-right"
                        value={form.return_type === 'roll_return' ? item.weight : item.quantity}
                        onChange={e => updateItem(idx, form.return_type === 'roll_return' ? 'weight' : 'quantity', e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" className="typo-input-sm w-full text-right" placeholder="0"
                        value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} />
                    </td>
                    <td className="px-2 py-2">
                      <select className="typo-input-sm w-full" value={item.reason}
                        onChange={e => updateItem(idx, 'reason', e.target.value)}>
                        {REASON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-center">
                      {formItems.length > 1 && (
                        <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Notes card */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-end gap-0 border-b border-gray-200 bg-gray-50">
              <div className="px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Notes</span>
              </div>
            </div>
            <div className="px-4 py-3">
              <textarea className="typo-input w-full" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ═══════════════════════════ SALES RETURN CREATE OVERLAY ═══════════════════════════ */
  if (salesCreateMode) {
    const hasOrderItems = salesItems.some(si => si.fromOrder)
    const checkedCount = salesItems.filter(i => i.checked).reduce((s, i) => s + i.qty, 0)
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setSalesCreateMode(false)} className="rounded-lg p-1.5 hover:bg-white/20 transition-colors">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h2 className="text-lg font-bold tracking-tight">New Sales Return</h2>
              <p className="text-xs text-emerald-100">Customer return {salesForm.order_id ? '— linked to order' : '— standalone'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {checkedCount > 0 && <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">{checkedCount} pcs</span>}
            <button onClick={() => setSalesCreateMode(false)} className="rounded-lg border border-white/30 px-3 py-1.5 text-sm hover:bg-white/20 transition-colors">Cancel</button>
            <button onClick={handleSalesCreate} disabled={salesSaving || checkedCount === 0}
              className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors">
              {salesSaving ? 'Creating...' : `Create Sales Return (${checkedCount})`}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {salesFormError && <ErrorAlert message={salesFormError} onDismiss={() => setSalesFormError(null)} />}

          {/* Return Details card */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-end gap-0 border-b border-gray-200 bg-gray-50">
              <div className="px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Return Details</span>
              </div>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="typo-label-sm">CUSTOMER *</label>
                <FilterSelect searchable full value={salesForm.customer_id}
                  onChange={handleCustomerSelect}
                  options={[{ value: '', label: 'Select customer...' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} />
              </div>
              <div>
                <label className="typo-label-sm">ORDER (OPTIONAL)</label>
                <FilterSelect searchable full value={salesForm.order_id}
                  onChange={handleOrderSelect}
                  options={[{ value: '', label: 'No order link' }, ...customerOrders.map(o => ({
                    value: o.id, label: `${o.order_number} (${o.status})`,
                  }))]} />
              </div>
              <div>
                <label className="typo-label-sm">TRANSPORT</label>
                <FilterSelect searchable full value={salesForm.transport_id}
                  onChange={v => setSalesForm(f => ({ ...f, transport_id: v }))}
                  options={[{ value: '', label: 'Select Transport' }, ...transports.map(t => ({ value: t.id, label: t.name }))]} />
              </div>
              <div>
                <label className="typo-label-sm">L.R. NUMBER</label>
                <input className="typo-input" value={salesForm.lr_number} onChange={e => setSalesForm(f => ({ ...f, lr_number: e.target.value }))} placeholder="Optional" />
              </div>
              <div>
                <label className="typo-label-sm">L.R. DATE</label>
                <input type="date" className="typo-input" value={salesForm.lr_date} onChange={e => setSalesForm(f => ({ ...f, lr_date: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="typo-label-sm">REASON SUMMARY</label>
                <input className="typo-input" value={salesForm.reason_summary} onChange={e => setSalesForm(f => ({ ...f, reason_summary: e.target.value }))} placeholder="Brief reason for return" />
              </div>
            </div>
          </div>

          {/* Line Items card */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Line Items ({salesItems.filter(i => i.checked).length} items)</span>
              {!hasOrderItems && (
                <button onClick={addManualItem} className="rounded-lg bg-emerald-600 text-white px-3 py-1 text-xs font-semibold hover:bg-emerald-700 transition-colors">+ Add Row</button>
              )}
            </div>

            {salesItems.length > 0 ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-emerald-600">
                    <th className="px-2 py-2 text-xs font-semibold text-white uppercase tracking-wider w-[4%] border-r border-emerald-500"></th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider border-r border-emerald-500">{hasOrderItems ? 'SKU' : 'SKU'}</th>
                    {hasOrderItems && <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider w-[10%] border-r border-emerald-500">Fulfilled</th>}
                    {hasOrderItems && <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider w-[10%] border-r border-emerald-500">Returned</th>}
                    {hasOrderItems && <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider w-[10%] border-r border-emerald-500">Max</th>}
                    <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider w-[10%] border-r border-emerald-500">Qty</th>
                    {!hasOrderItems && <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider w-[12%] border-r border-emerald-500">Rate (₹)</th>}
                    <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider w-[20%] border-r border-emerald-500">Reason</th>
                    {!hasOrderItems && <th className="px-2 py-2 text-xs font-semibold text-white uppercase tracking-wider w-[5%]"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {salesItems.map((si, idx) => (
                    <tr key={si.order_item_id || idx} className={`hover:bg-gray-50 ${!si.checked ? 'opacity-40' : ''}`}>
                      <td className="px-2 py-2">
                        <input type="checkbox" checked={si.checked}
                          onChange={e => setSalesItems(prev => prev.map((it, i) => i === idx ? { ...it, checked: e.target.checked } : it))} />
                      </td>
                      <td className="px-2 py-2">
                        {si.fromOrder ? (
                          <span className="font-semibold">{si.sku_code}{si.color ? ` · ${si.color}` : ''}{si.size ? ` · ${si.size}` : ''}</span>
                        ) : (
                          <FilterSelect searchable full value={si.sku_id}
                            onChange={v => {
                              const sku = skus.find(s => s.id === v)
                              setSalesItems(prev => prev.map((it, i) => i === idx ? {
                                ...it, sku_id: v, sku_code: sku?.sku_code || '', color: sku?.color || '', size: sku?.size || '',
                              } : it))
                            }}
                            options={[{ value: '', label: 'Select SKU...' }, ...skus.map(s => ({ value: s.id, label: `${s.sku_code} · ${s.color} · ${s.size}` }))]} />
                        )}
                      </td>
                      {hasOrderItems && <td className="px-2 py-2 text-right">{si.fulfilled}</td>}
                      {hasOrderItems && <td className="px-2 py-2 text-right text-orange-600">{si.already_returned || 0}</td>}
                      {hasOrderItems && <td className="px-2 py-2 text-right font-semibold">{si.max_qty}</td>}
                      <td className="px-2 py-2">
                        <input type="number" className="typo-input-sm w-16 text-right" min={1}
                          max={si.fromOrder ? si.max_qty : undefined}
                          value={si.qty}
                          onChange={e => {
                            const v = Math.max(1, parseInt(e.target.value) || 1)
                            const capped = si.fromOrder ? Math.min(v, si.max_qty) : v
                            setSalesItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: capped } : it))
                          }} />
                      </td>
                      {!hasOrderItems && (
                        <td className="px-2 py-2">
                          <input type="number" className="typo-input-sm w-full text-right" placeholder="0"
                            value={si.unit_price}
                            onChange={e => setSalesItems(prev => prev.map((it, i) => i === idx ? { ...it, unit_price: e.target.value } : it))} />
                        </td>
                      )}
                      <td className="px-2 py-2">
                        <FilterSelect full value={si.reason}
                          onChange={v => setSalesItems(prev => prev.map((it, i) => i === idx ? { ...it, reason: v } : it))}
                          options={SALES_REASON_OPTIONS} />
                      </td>
                      {!hasOrderItems && (
                        <td className="px-2 py-2 text-center">
                          {salesItems.length > 1 && (
                            <button onClick={() => removeManualItem(idx)} className="text-red-400 hover:text-red-600">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-8 text-center text-xs text-gray-400">
                {salesForm.customer_id && !salesForm.order_id
                  ? 'Click "+ Add Row" to add SKU items for this return.'
                  : salesForm.order_id
                    ? 'No returnable items — all items have been fully returned or none fulfilled.'
                    : 'Select a customer to get started.'}
              </div>
            )}
          </div>

          {/* Notes card */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-end gap-0 border-b border-gray-200 bg-gray-50">
              <div className="px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Notes</span>
              </div>
            </div>
            <div className="px-4 py-3">
              <textarea className="typo-input w-full" rows={2} value={salesForm.reason_summary} onChange={e => setSalesForm(f => ({ ...f, reason_summary: e.target.value }))} placeholder="Optional notes..." />
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ═══════════════════════════ LIST VIEW ═══════════════════════════ */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="typo-page-title">Returns</h1>
          <p className="typo-caption">{category === 'supplier' ? 'Supplier return notes — rolls & SKUs' : 'Customer sale returns'}</p>
        </div>
        <button onClick={category === 'supplier' ? openSupplierCreate : openSalesCreate}
          className="rounded bg-emerald-600 text-white px-4 py-2 typo-btn-sm hover:bg-emerald-700 shadow-sm flex items-center gap-1.5">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {category === 'supplier' ? 'New Return' : 'New Sales Return'}
        </button>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {/* Category tabs */}
      <div className="flex gap-1 border-b pb-0">
        {[{ key: 'supplier', label: 'Supplier Returns' }, { key: 'sales', label: 'Sales Returns' }].map(tab => (
          <button key={tab.key} onClick={() => switchCategory(tab.key)}
            className={`px-4 py-2 typo-tab transition-colors border-b-2 ${
              category === tab.key
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      {category === 'supplier' ? (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <KPICard label="Total" value={supplierKpis.total} color="slate" />
          <KPICard label="Draft" value={supplierKpis.draftCount} color="amber" />
          <KPICard label="Approved" value={supplierKpis.approvedCount} color="blue" />
          <KPICard label="Dispatched" value={supplierKpis.dispatchedCount} color="orange" />
          <KPICard label="Closed" value={supplierKpis.closedCount} color="green" />
          <KPICard label="Value" value={fmtCurrency(supplierKpis.totalAmt)} color="emerald" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          <KPICard label="Total" value={salesKpis.total} color="slate" />
          <KPICard label="Draft" value={salesKpis.draftCount} color="amber" />
          <KPICard label="Received" value={salesKpis.receivedCount} color="blue" />
          <KPICard label="Inspected" value={salesKpis.inspectedCount} color="purple" />
          <KPICard label="Restocked" value={salesKpis.restockedCount} color="teal" />
          <KPICard label="Closed" value={salesKpis.closedCount} color="green" />
          <KPICard label="Value" value={fmtCurrency(salesKpis.totalAmt)} color="emerald" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(category === 'supplier' ? SUPPLIER_TABS : SALES_TABS).map(tab => (
            <button key={tab.key} onClick={() => { setStatusFilter(tab.key); setPage(1) }}
              className={`px-2.5 py-1 rounded-full typo-tab transition-colors ${
                statusFilter === tab.key
                  ? 'border-b-2 border-emerald-600 text-emerald-700 bg-emerald-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
        {category === 'supplier' && (
          <div className="flex gap-1 ml-2">
            {TYPE_TABS.map(tab => (
              <button key={tab.key} onClick={() => { setTypeFilter(tab.key); setPage(1) }}
                className={`px-2.5 py-1 rounded-full typo-tab transition-colors ${
                  typeFilter === tab.key
                    ? 'border-b-2 border-blue-600 text-blue-700 bg-blue-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto w-56">
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search returns..." />
        </div>
      </div>

      <div className="mt-4">
        <DataTable
          columns={category === 'supplier' ? SUPPLIER_COLUMNS : SALES_COLUMNS}
          data={list}
          loading={loading}
          onRowClick={category === 'supplier' ? handleSupplierRowClick : handleSalesRowClick}
          emptyText={category === 'supplier' ? 'No return notes found.' : 'No sales returns found.'}
        />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>
    </div>
  )
}
