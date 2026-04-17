import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getOrders, getOrder, createOrder, updateOrder, shipOrder, cancelOrder, updateShipping, updateShipment, getNextOrderNumber } from '../api/orders'
import { getSKUs, getSKUByCode, stockCheck } from '../api/skus'
import { getAllCustomers, createCustomer } from '../api/customers'
import { getAllBrokers } from '../api/brokers'
import { getAllTransports } from '../api/transports'
import { colorHex, loadColorMap } from '../utils/colorUtils'
import DataTable from '../components/common/DataTable'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'
import SearchInput from '../components/common/SearchInput'
import QuickMasterModal from '../components/common/QuickMasterModal'
import { useScanPair } from '../hooks/useScanPair'
import OrderPrint from '../components/common/OrderPrint'
import FilterSelect from '../components/common/FilterSelect'
import Modal from '../components/common/Modal'
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

function KPICard({ label, value, sub, color = 'slate', onClick, active = false }) {
  const base = `rounded-lg bg-gradient-to-br ${KPI_COLORS[color] || KPI_COLORS.slate} p-2.5 text-white shadow-sm`
  const interactive = onClick ? 'cursor-pointer transition-all hover:shadow-md hover:brightness-105' : ''
  const ring = active ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-50' : ''
  const cls = `${base} ${interactive} ${ring}`.trim().replace(/\s+/g, ' ')
  const props = onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } } : {}
  return (
    <div className={cls} {...props}>
      <p className="typo-kpi-label text-white/85">{label}</p>
      <p className="mt-0.5 text-xl font-bold leading-tight">{value}</p>
      {sub && <p className="typo-caption text-white/75">{sub}</p>}
    </div>
  )
}

/* GridCell removed — replaced by flat line-items table */

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
  { key: 'items', label: 'SKUs', render: (val, row) => (
    <span className="font-medium inline-flex items-center gap-1">
      {val?.length || 0}
      {row.has_shortage && <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Has shortage" />}
    </span>
  )},
  {
    key: 'total_amount', label: 'Total',
    render: (val) => <span className="font-semibold">₹{(val || 0).toLocaleString('en-IN')}</span>,
  },
  { key: 'status', label: 'Status', render: (val, row) => {
    const missingLR = (val === 'shipped' || val === 'partially_shipped') &&
      row.shipments?.some(s => !s.lr_number)
    return (
      <span className="inline-flex items-center gap-1">
        <StatusBadge status={val} />
        {missingLR && <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" title="Shipment missing L.R." />}
      </span>
    )
  }},
  {
    key: 'created_at', label: 'Date',
    render: (val) => val ? new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
  },
]

const TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'partially_shipped', label: 'Partial Ship' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'partially_returned', label: 'Partial Return' },
  { key: 'returned', label: 'Returned' },
  { key: 'cancelled', label: 'Cancelled' },
]

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'web', label: 'Web' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'walk_in', label: 'Walk-in' },
]

export default function OrdersPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { company } = useAuth()
  const [ordersList, setOrdersList] = useState([])
  const [allOrders, setAllOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [search, setSearch] = useState('')
  const [shortageOnly, setShortageOnly] = useState(false)
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
  const [orderLines, setOrderLines] = useState([]) // [{ design_key, color, size, sku_id, qty, price }]
  const [nextOrderNo, setNextOrderNo] = useState('')
  const [customerForm, setCustomerForm] = useState({ customer_id: '', source: 'web', notes: '', order_date: new Date().toISOString().split('T')[0], broker_id: '', transport_id: '', gst_percent: '0', discount_amount: '' })
  const [customers, setCustomers] = useState([])
  const [brokers, setBrokers] = useState([])
  const [transports, setTransports] = useState([])
  const [shipModalOpen, setShipModalOpen] = useState(false)
  const [shipForm, setShipForm] = useState({ transport_id: '', lr_number: '', lr_date: '', eway_bill_no: '', eway_bill_date: '' })
  const [shipItems, setShipItems] = useState([]) // [{order_item_id, sku_code, max_qty, qty, checked}]
  const [updateShipMode, setUpdateShipMode] = useState(false)
  const [updateShipmentId, setUpdateShipmentId] = useState(null) // shipment ID when updating a specific shipment
  const [shipError, setShipError] = useState(null)
  // Return modal
  // Return modal removed — now navigates to ReturnsPage
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false) // discard confirmation bar
  const [editMode, setEditMode] = useState(false)
  const [editingOrderId, setEditingOrderId] = useState(null)
  // POS scan mode
  const [scanMode, setScanMode] = useState(false)
  const [scanInput, setScanInput] = useState('')
  const [scanStatus, setScanStatus] = useState(null) // { type: 'added'|'duplicate'|'error', message: string, rowIdx?: number }
  const [flashRowIdx, setFlashRowIdx] = useState(null)
  const scanInputRef = useRef(null)

  // Quick master for customer Shift+M
  const { quickMasterType, quickMasterOpen, closeQuickMaster, onMasterCreated } = useQuickMaster(
    (type, newItem) => {
      if (type === 'customer') {
        setCustomers(prev => [...prev, newItem])
        setCustomerForm(f => ({ ...f, customer_id: newItem.id }))
      }
      if (type === 'broker') {
        setBrokers(prev => [...prev, newItem])
        setCustomerForm(f => ({ ...f, broker_id: newItem.id }))
      }
      if (type === 'transport') {
        setTransports(prev => [...prev, newItem])
        if (shipModalOpen) {
          setShipForm(f => ({ ...f, transport_id: newItem.id }))
        } else {
          setCustomerForm(f => ({ ...f, transport_id: newItem.id }))
        }
      }
    }
  )

  /* ── Dirty detection ── */
  const isDirty = useMemo(() => {
    if (customerForm.customer_id) return true
    if (customerForm.notes.trim()) return true
    if (orderLines.some(l => l.sku_id || (l.design_key && l.color && l.size))) return true
    return false
  }, [customerForm, orderLines])

  /* ── Safe close — confirm if dirty ── */
  const requestClose = useCallback(() => {
    if (!isDirty) { setCreateMode(false); return }
    setConfirmDiscard(true)
  }, [isDirty])

  const confirmAndClose = useCallback(() => {
    setConfirmDiscard(false)
    setCreateMode(false)
    setEditMode(false)
    setEditingOrderId(null)
  }, [])

  const cancelDiscard = useCallback(() => {
    setConfirmDiscard(false)
  }, [])

  /* ── Line helpers ── */
  const addOrderLine = useCallback(() => {
    setOrderLines(prev => [...prev, { design_key: '', color: '', size: '', sku_id: null, qty: 0, price: 0, item_id: null }])
  }, [])

  const updateOrderLine = useCallback((idx, field, value) => {
    setOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }, [])

  const removeOrderLine = useCallback((idx) => {
    setOrderLines(prev => prev.filter((_, i) => i !== idx))
  }, [])

  /* ── Flash row helper ── */
  const flashRow = useCallback((idx) => {
    setFlashRowIdx(idx)
    setTimeout(() => setFlashRowIdx(null), 1500)
  }, [])

  /* ── Keep a ref to orderLines for stale-closure-safe duplicate check ── */
  const orderLinesRef = useRef(orderLines)
  orderLinesRef.current = orderLines

  /* ── Add SKU line (shared by scan + POS type) ── */
  const addSKULine = useCallback((sku, parsed, source) => {
    const lines = orderLinesRef.current
    const existingIdx = lines.findIndex(l => l.sku_id === sku.id)
    if (existingIdx !== -1) {
      setScanStatus({ type: 'duplicate', message: `${sku.sku_code} already in order — row ${existingIdx + 1}` })
      flashRow(existingIdx)
      setTimeout(() => setScanStatus(null), 3000)
      return
    }
    const newLine = {
      design_key: `${parsed.type}-${parsed.design}`,
      color: parsed.color,
      size: parsed.size,
      sku_id: sku.id,
      qty: 1,
      price: sku.sale_rate || sku.mrp || sku.base_price || 0,
      item_id: null,
    }
    setOrderLines(prev => {
      const emptyIdx = prev.findIndex(l => !l.sku_id && !l.design_key)
      if (emptyIdx !== -1) {
        flashRow(emptyIdx)
        return prev.map((l, i) => i === emptyIdx ? newLine : l)
      }
      flashRow(prev.length)
      return [...prev, newLine]
    })
    setScanStatus({ type: 'added', message: `${sku.sku_code} added${source === 'phone' ? ' via phone' : ''}` })
    setTimeout(() => setScanStatus(null), 2500)
  }, [flashRow])

  /* ── QR Scan → add SKU line ── */
  const handleScanResult = useCallback((rawValue, source = 'scan') => {
    const skuMatch = rawValue.match(/\/scan\/sku\/([^/?\s]+)/)
    const code = skuMatch ? decodeURIComponent(skuMatch[1]) : rawValue.trim()
    if (!code) return

    const parsed = parseSKU(code)
    const foundSku = allSKUs.find(s => s.sku_code === code)

    if (foundSku) {
      addSKULine(foundSku, parsed, source)
    } else {
      getSKUByCode(code).then(res => {
        const sku = res.data?.data
        if (!sku) {
          setScanStatus({ type: 'error', message: `SKU not found: ${code}` })
          setTimeout(() => setScanStatus(null), 3000)
          return
        }
        const p = parseSKU(sku.sku_code)
        setAllSKUs(prev => [...prev, sku])
        addSKULine(sku, p, source)
      }).catch((err) => {
        const isNetwork = !err.response && (err.code === 'ERR_NETWORK' || err.message === 'Network Error' || !navigator.onLine)
        setScanStatus({ type: 'error', message: isNetwork ? 'Connection error — check internet' : `SKU not found: ${code}` })
        setTimeout(() => setScanStatus(null), 4000)
      })
    }
  }, [allSKUs])

  /* ── WebSocket scan pairing (phone → desktop) ── */
  const { phoneConnected } = useScanPair({
    role: 'desktop',
    enabled: createMode && scanMode,
    onScan: useCallback((data) => {
      if (data.code) handleScanResult(data.code, 'phone')
    }, [handleScanResult]),
  })

  /* ── Global keyboard: Ctrl+S, Escape ── */
  useEffect(() => {
    if (!createMode) return
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !saving) {
        e.preventDefault()
        handleCreate()
      }
      if (e.key === 'Escape') {
        if (quickMasterOpen || shipModalOpen) return
        e.preventDefault()
        if (scanMode) { setScanMode(false); setScanInput(''); setScanStatus(null); return }
        if (confirmDiscard) { cancelDiscard(); return }
        requestClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createMode, saving, confirmDiscard, requestClose, cancelDiscard, quickMasterOpen, shipModalOpen, scanMode])

  /* ── Detail overlay shortcuts: Ctrl+P → Print Order (confirmation) ── */
  useEffect(() => {
    if (!detailOrder || printOrder) return
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        setPrintOrder({ order: detailOrder, mode: 'confirmation' })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [detailOrder, printOrder])

  /* ── POS mode: handle SKU input submit ── */
  const handlePOSSubmit = useCallback((code) => {
    if (!code.trim()) return
    handleScanResult(code.trim(), 'type')
    setScanInput('')
    // Re-focus the search input for next scan
    setTimeout(() => {
      const input = scanInputRef.current?.querySelector('input')
      if (input) { input.focus(); input.value = '' }
    }, 50)
  }, [handleScanResult])

  /* ── POS mode: SKU options for searchable dropdown ── */
  const skuSearchOptions = useMemo(() => {
    return allSKUs.map(s => ({
      value: s.sku_code,
      label: `${s.sku_code}${s.stock?.available_qty != null ? ` (${s.stock.available_qty} avail)` : ''}`,
    }))
  }, [allSKUs])

  /* ── Auto-focus Customer field on overlay open ── */
  useEffect(() => {
    if (createMode && !skuLoading) {
      setTimeout(() => {
        const el = document.querySelector('button[data-master="customer"]')
        if (el) el.focus()
      }, 150)
    }
  }, [createMode, skuLoading])

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

  // Full (unfiltered) list for KPI aggregates — server-total accurate, pagination-independent.
  const fetchAllForKpis = useCallback(async () => {
    try {
      const res = await getOrders({ page_size: 0 })
      setAllOrders(res.data.data || [])
    } catch {
      setAllOrders([])
    }
  }, [])
  useEffect(() => { fetchAllForKpis() }, [fetchAllForKpis])

  /* ── Deep-link: ?open=<orderId> → auto-open detail ── */
  useEffect(() => {
    const openId = searchParams.get('open')
    if (!openId) return
    searchParams.delete('open')
    setSearchParams(searchParams, { replace: true })
    ;(async () => {
      setDetailLoading(true)
      try {
        const res = await getOrder(openId)
        setDetailOrder(res.data.data || res.data)
      } catch { /* ignore */ }
      finally { setDetailLoading(false) }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── KPIs (derived from full unfiltered list, not paginated page) ── */
  const kpis = useMemo(() => {
    const all = allOrders
    const pending = all.filter(o => o.status === 'pending').length
    const processing = all.filter(o => o.status === 'processing').length
    const today = new Date().toDateString()
    const shippedToday = all.filter(o => o.status === 'shipped' && o.created_at && new Date(o.created_at).toDateString() === today).length
    const revenue = all.reduce((s, o) => s + (o.total_amount || 0), 0)
    const withShortage = all.filter(o => o.has_shortage).length
    return { total: all.length, pending, processing, shippedToday, revenue, withShortage }
  }, [allOrders])

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

  /* ── Ship / Cancel / Update Shipment actions ── */
  const handleAction = async (type, shipment = null) => {
    if (type === 'ship') {
      if (transports.length === 0) {
        getAllTransports().then(r => setTransports(r.data?.data || [])).catch(() => {})
      }
      setUpdateShipMode(false)
      setUpdateShipmentId(null)

      // Fetch current stock levels — single bulk query
      let stockMap = {}
      const skuIds = (detailOrder.items || []).map(i => i.sku?.id).filter(Boolean)
      try {
        const res = await stockCheck(skuIds, detailOrder.id)
        stockMap = res.data?.data || res.data || {}
      } catch { /* proceed with 0 stock fallback */ }

      // Build ship items — cap qty at available stock
      const items = (detailOrder.items || [])
        .map(item => {
          const remaining = item.quantity - (item.fulfilled_qty || 0)
          if (remaining <= 0) return null
          const available = stockMap[item.sku?.id] || 0
          const shipQty = Math.min(remaining, available)
          return {
            order_item_id: item.id,
            sku_id: item.sku?.id,
            sku_code: item.sku?.sku_code || '—',
            color: item.sku?.color,
            size: item.sku?.size,
            max_qty: remaining,
            available,
            qty: shipQty,
            checked: shipQty > 0,
          }
        })
        .filter(Boolean)
      setShipItems(items)
      setShipForm({
        transport_id: detailOrder.transport_id || '',
        lr_number: '',
        lr_date: new Date().toISOString().split('T')[0],
        eway_bill_no: '',
        eway_bill_date: '',
      })
      setShipError(null)
      setShipModalOpen(true)
      return
    }
    if (type === 'update_shipment' && shipment) {
      if (transports.length === 0) {
        getAllTransports().then(r => setTransports(r.data?.data || [])).catch(() => {})
      }
      setUpdateShipMode(true)
      setUpdateShipmentId(shipment.id)
      setShipItems([])
      setShipForm({
        transport_id: shipment.transport_id || '',
        lr_number: shipment.lr_number || '',
        lr_date: shipment.lr_date ? shipment.lr_date.split('T')[0] : '',
        eway_bill_no: shipment.eway_bill_no || '',
        eway_bill_date: shipment.eway_bill_date ? shipment.eway_bill_date.split('T')[0] : '',
      })
      setShipError(null)
      setShipModalOpen(true)
      return
    }
    setActioning(true)
    try {
      if (type === 'cancel') await cancelOrder(detailOrder.id)
      setDetailOrder(null)
      fetchData()
      fetchAllForKpis()
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to ${type} order`)
    } finally {
      setActioning(false)
    }
  }

  const handleShipConfirm = async () => {
    setActioning(true)
    setShipError(null)
    try {
      const transportPayload = {
        transport_id: shipForm.transport_id || null,
        lr_number: shipForm.lr_number?.trim() || null,
        lr_date: shipForm.lr_date || null,
        eway_bill_no: shipForm.eway_bill_no?.trim() || null,
        eway_bill_date: shipForm.eway_bill_date || null,
      }
      if (updateShipMode && updateShipmentId) {
        // Update specific shipment details
        await updateShipment(updateShipmentId, transportPayload)
        // Refresh order detail
        const res = await getOrder(detailOrder.id)
        setDetailOrder(res.data?.data || res.data)
      } else {
        // Ship items — build payload with items[]
        const checkedItems = shipItems.filter(si => si.checked && si.qty > 0)
        if (!checkedItems.length) {
          setShipError('Select at least one item to ship')
          setActioning(false)
          return
        }
        const payload = {
          ...transportPayload,
          items: checkedItems.map(si => ({
            order_item_id: si.order_item_id,
            quantity: si.qty,
          })),
        }
        await shipOrder(detailOrder.id, payload)
        // Refresh order detail (may still be partially_shipped)
        try {
          const res = await getOrder(detailOrder.id)
          setDetailOrder(res.data?.data || res.data)
        } catch {
          setDetailOrder(null)
        }
      }
      setShipModalOpen(false)
      fetchData()
      fetchAllForKpis()
    } catch (err) {
      setShipError(err.response?.data?.detail || (updateShipMode ? 'Failed to update shipment' : 'Failed to ship order'))
    } finally {
      setActioning(false)
    }
  }

  /* ── Return action ── */
  const handleReturnAction = () => {
    // Navigate to ReturnsPage with customer + order pre-fill
    const custId = detailOrder.customer_id || ''
    const ordId = detailOrder.id || ''
    navigate(`/returns?tab=sales&create=1&customer=${custId}&order=${ordId}`)
  }

  /* ── Create overlay: load SKUs ── */
  const openCreate = async () => {
    setCreateMode(true)
    setSKULoading(true)
    setOrderLines([{ design_key: '', color: '', size: '', sku_id: null, qty: 0, price: 0 }])
    setNextOrderNo('')
    setCustomerForm({ customer_id: '', source: 'web', notes: '', order_date: new Date().toISOString().split('T')[0], broker_id: '', transport_id: '', gst_percent: '0', discount_amount: '' })
    setFormError(null)
    try {
      const [skuRes, custRes, numRes, brokersRes, transportsRes] = await Promise.all([
        getSKUs({ is_active: true, page_size: 0 }),
        getAllCustomers(),
        getNextOrderNumber().catch(() => ({ data: { data: { next_number: '' } } })),
        getAllBrokers().catch(() => ({ data: { data: [] } })),
        getAllTransports().catch(() => ({ data: { data: [] } })),
      ])
      setAllSKUs(skuRes.data.data || [])
      setCustomers(custRes.data.data || [])
      setNextOrderNo(numRes.data?.data?.next_number || numRes.data?.next_number || '')
      setBrokers(brokersRes.data?.data || [])
      setTransports(transportsRes.data?.data || [])
    } catch {
      setAllSKUs([])
      setCustomers([])
    } finally {
      setSKULoading(false)
    }
  }

  /* ── Edit overlay: prefill from existing order ── */
  const openEdit = async (order) => {
    setEditMode(true)
    setEditingOrderId(order.id)
    setCreateMode(true)
    setSKULoading(true)
    setNextOrderNo(order.order_number)
    setCustomerForm({
      customer_id: order.customer_id || '',
      source: order.source || 'web',
      notes: order.notes || '',
      order_date: order.order_date || new Date().toISOString().split('T')[0],
      broker_id: order.broker_id || '',
      transport_id: order.transport_id || '',
      gst_percent: String(order.gst_percent ?? '0'),
      discount_amount: order.discount_amount ? String(order.discount_amount) : '',
    })
    setFormError(null)
    try {
      const [skuRes, custRes, brokersRes, transportsRes] = await Promise.all([
        getSKUs({ is_active: true, page_size: 0 }),
        getAllCustomers(),
        getAllBrokers().catch(() => ({ data: { data: [] } })),
        getAllTransports().catch(() => ({ data: { data: [] } })),
      ])
      const skuList = skuRes.data.data || []
      setAllSKUs(skuList)
      setCustomers(custRes.data.data || [])
      setBrokers(brokersRes.data?.data || [])
      setTransports(transportsRes.data?.data || [])

      // Map existing order items to orderLines format
      const lines = (order.items || []).map(item => {
        const code = item.sku?.sku_code || ''
        const parsed = parseSKU(code)
        const designKey = parsed.type && parsed.design ? `${parsed.type}-${parsed.design}` : ''
        return {
          item_id: item.id,
          design_key: designKey,
          color: parsed.color || item.sku?.color || '',
          size: parsed.size || item.sku?.size || '',
          sku_id: item.sku?.id || null,
          qty: item.quantity,
          price: parseFloat(item.unit_price) || 0,
        }
      })
      setOrderLines(lines.length > 0 ? lines : [{ design_key: '', color: '', size: '', sku_id: null, qty: 0, price: 0 }])
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


  /* ── Design option builders for FilterSelect ── */
  const designOptions = useMemo(() => {
    return [{ value: '', label: 'Select design...' }, ...designGroups.map(g => {
      const totalStock = g.skus.reduce((s, sku) => s + (sku.stock?.available_qty || 0), 0)
      return { value: g.key, label: `${g.key} — ${g.colors.length}c · ${g.sizes.length}s · ${totalStock} in stock` }
    })]
  }, [designGroups])

  const getColorsForDesign = useCallback((designKey, size) => {
    const group = designGroups.find(g => g.key === designKey)
    if (!group) return [{ value: '', label: 'Select color...' }]
    // If size is picked, filter colors that have a SKU for that design+size
    const colors = size
      ? group.colors.filter(c => group.skus.some(s => s._parsed.color === c && s._parsed.size === size))
      : group.colors
    return [{ value: '', label: 'Select color...' }, ...colors.map(c => ({ value: c, label: c }))]
  }, [designGroups])

  const getSizesForDesign = useCallback((designKey, color) => {
    const group = designGroups.find(g => g.key === designKey)
    if (!group) return [{ value: '', label: 'Select size...' }]
    // If color is picked, filter sizes that have a SKU for that design+color
    const sizes = color
      ? group.sizes.filter(sz => group.skus.some(s => s._parsed.color === color && s._parsed.size === sz))
      : group.sizes
    return [{ value: '', label: 'Select size...' }, ...sizes.map(s => ({ value: s, label: s }))]
  }, [designGroups])

  /* ── Resolve SKU from line's design_key + color + size ── */
  const resolveLineSKU = useCallback((line) => {
    if (!line.design_key || !line.color || !line.size) return null
    const group = designGroups.find(g => g.key === line.design_key)
    if (!group) return null
    return group.skus.find(s => s._parsed.color === line.color && s._parsed.size === line.size) || null
  }, [designGroups])

  /* ── Create submit ── */
  const handleCreate = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const items = orderLines
        .filter(l => l.qty > 0)
        .map(l => {
          const skuId = l.sku_id || resolveLineSKU(l)?.id || null
          if (!skuId) return null
          const mapped = { sku_id: skuId, quantity: l.qty, unit_price: l.price || 0 }
          if (editMode && l.item_id) mapped.id = l.item_id
          return mapped
        })
        .filter(Boolean)
      if (!items.length) {
        const withQty = orderLines.filter(l => l.qty > 0)
        if (withQty.length > 0) {
          setFormError('Please select Design, Color, and Size for all items')
        } else {
          setFormError('Add at least one item with qty > 0')
        }
        setSaving(false); return
      }
      if (!customerForm.customer_id) { setFormError('Please select a customer'); setSaving(false); return }

      const cust = customers.find(c => c.id === customerForm.customer_id)
      const payload = {
        customer_id: customerForm.customer_id,
        customer_name: cust?.name || null,
        customer_phone: cust?.phone || null,
        customer_address: cust?.city ? `${cust.city}${cust.state ? ', ' + cust.state : ''}` : null,
        order_date: customerForm.order_date || null,
        broker_id: customerForm.broker_id || null,
        transport_id: customerForm.transport_id || null,
        gst_percent: parseFloat(customerForm.gst_percent) || 0,
        discount_amount: parseFloat(customerForm.discount_amount) || 0,
        notes: customerForm.notes.trim() || null,
        items,
      }

      if (editMode && editingOrderId) {
        await updateOrder(editingOrderId, payload)
      } else {
        payload.source = customerForm.source
        await createOrder(payload)
      }
      setCreateMode(false)
      setEditMode(false)
      setEditingOrderId(null)
      fetchData()
      fetchAllForKpis()
    } catch (err) {
      setFormError(err.response?.data?.detail || (editMode ? 'Failed to update order' : 'Failed to create order'))
    } finally {
      setSaving(false)
    }
  }

  const totalItems = useMemo(() => orderLines.reduce((s, l) => s + (l.qty > 0 ? l.qty : 0), 0), [orderLines])
  const grandTotal = useMemo(() => orderLines.reduce((s, l) => s + (l.qty > 0 ? l.qty * (l.price || 0) : 0), 0), [orderLines])

  /* ═══════════════════════ ORDER PRINT OVERLAY ═══════════════════════ */
  /* Must come BEFORE the detail overlay so Close on print returns to detail, not list. */
  if (printOrder) {
    return (
      <OrderPrint
        order={printOrder.order || printOrder}
        mode={printOrder.mode || 'confirmation'}
        companyName={company?.name}
        company={company}
        onClose={() => setPrintOrder(null)}
      />
    )
  }

  /* ═══════════════════════ DETAIL OVERLAY ═══════════════════════ */
  if (detailOrder) {
    const o = detailOrder
    const canAct = o.status === 'pending' || o.status === 'processing' || o.status === 'partially_shipped'
    const canReturn = ['shipped', 'partially_shipped', 'delivered', 'partially_returned'].includes(o.status)
      && o.items?.some(item => ((item.fulfilled_qty || 0) - (item.returned_qty || 0)) > 0)
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="typo-modal-title text-white leading-tight">{o.customer?.name || o.customer_name || 'Walk-in'}</h1>
            <p className="text-xs opacity-80">{o.order_number} &middot; <StatusBadge status={o.status} /></p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPrintOrder({ order: detailOrder, mode: 'confirmation' })} className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print Order
            </button>
            <button onClick={() => setPrintOrder({ order: detailOrder, mode: 'picksheet' })} className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
              Pick Sheet
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
                <p className="typo-label-sm">Order Date</p>
                <p className="typo-body">{o.order_date ? new Date(o.order_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Address</p>
                <p className="typo-body">{o.customer_address || o.customer?.city || '—'}</p>
              </div>
              {(o.broker?.name || o.broker_name) && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Broker</p>
                  <p className="typo-body">{o.broker?.name || o.broker_name}</p>
                </div>
              )}
              {(o.transport_detail?.name || o.transport) && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Transport</p>
                  <p className="typo-body">{o.transport_detail?.name || o.transport}</p>
                </div>
              )}
              {o.lr_number && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">L.R. No.</p>
                  <p className="typo-body">{o.lr_number}{o.lr_date ? ` (${new Date(o.lr_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })})` : ''}</p>
                </div>
              )}
              {o.eway_bill_no && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">E-Way Bill</p>
                  <p className="typo-body">{o.eway_bill_no}{o.eway_bill_date ? ` (${new Date(o.eway_bill_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })})` : ''}</p>
                </div>
              )}
              {(o.gst_percent || 0) > 0 && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">GST</p>
                  <p className="typo-body">{o.gst_percent}%</p>
                </div>
              )}
              {o.customer?.gst_no && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Customer GST</p>
                  <p className="typo-body">{o.customer.gst_no}</p>
                </div>
              )}
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

            {o.has_shortage && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800 flex items-center gap-1.5">
                <svg className="h-4 w-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                <span><span className="font-semibold">Shortage:</span> Some items exceed available stock — partial reservation applied.</span>
              </div>
            )}

            {/* Per-shipment missing details banner */}
            {o.shipments?.some(s => !s.lr_number || !s.eway_bill_no) && (
              <div className="bg-orange-50 border border-orange-200 rounded p-2 text-xs text-orange-800 flex items-center gap-1.5">
                <svg className="h-4 w-4 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                <span><span className="font-semibold">Pending:</span> Some shipments are missing L.R. or E-Way Bill details — update from shipment history below.</span>
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
                    <th className="px-2 py-1.5 typo-th text-right">Returned</th>
                    <th className="px-2 py-1.5 typo-th text-right">Short</th>
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
                        {(item.fulfilled_qty || 0) >= item.quantity
                          ? <span className="text-green-600 font-semibold">{item.fulfilled_qty}</span>
                          : (item.fulfilled_qty || 0) > 0
                            ? <span className="text-amber-600 font-semibold">{item.fulfilled_qty}<span className="text-gray-400 font-normal">/{item.quantity}</span></span>
                            : <span className="text-gray-400">0</span>
                        }
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {(item.returned_qty || 0) > 0
                          ? <span className="text-orange-600 font-semibold">{item.returned_qty}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {(item.short_qty || 0) > 0
                          ? <span className="text-amber-600 font-semibold">{item.short_qty}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Order totals */}
            {(() => {
              const sub = o.total_amount || 0
              const disc = o.discount_amount || 0
              const taxable = sub - disc
              const gst = o.gst_percent || 0
              const gstAmt = taxable * gst / 100
              return (
                <div className="flex justify-end">
                  <div className="w-56 space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="font-medium">₹{sub.toLocaleString('en-IN')}</span>
                    </div>
                    {disc > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-green-600">Discount</span>
                        <span className="text-green-600">-₹{disc.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {gst > 0 && <>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">CGST ({gst / 2}%)</span>
                        <span>₹{(gstAmt / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">SGST ({gst / 2}%)</span>
                        <span>₹{(gstAmt / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </>}
                    <div className="flex justify-between pt-1.5 border-t border-emerald-600 mt-1">
                      <span className="typo-data-label">Grand Total</span>
                      <span className="typo-kpi-sm text-gray-800">₹{(taxable + gstAmt).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Actions */}
            {(canAct || canReturn) && (
              <div className="flex justify-end gap-2 pt-3 border-t">
                {(o.status === 'pending' || o.status === 'processing') && (
                  <>
                    <button onClick={() => handleAction('cancel')} disabled={actioning}
                      className="rounded border border-red-300 text-red-600 px-4 py-1.5 typo-btn-sm hover:bg-red-50 disabled:opacity-50 transition-colors">
                      {actioning ? 'Processing...' : 'Cancel Order'}
                    </button>
                    <button onClick={() => { setDetailOrder(null); openEdit(o) }}
                      className="rounded border border-emerald-300 text-emerald-700 px-4 py-1.5 typo-btn-sm hover:bg-emerald-50 transition-colors">
                      Edit Order
                    </button>
                  </>
                )}
                {canReturn && (
                  <button onClick={handleReturnAction} disabled={actioning}
                    className="rounded border border-orange-300 text-orange-600 px-4 py-1.5 typo-btn-sm hover:bg-orange-50 disabled:opacity-50 transition-colors">
                    Create Sales Return
                  </button>
                )}
                {canAct && (
                  <button onClick={() => handleAction('ship')} disabled={actioning}
                    className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {actioning ? 'Processing...' : o.status === 'partially_shipped' ? 'Ship More' : 'Ship Items'}
                  </button>
                )}
              </div>
            )}

            {/* Ship / Update Shipment Modal */}
            <Modal open={shipModalOpen} onClose={() => setShipModalOpen(false)} title={updateShipMode ? 'Update Shipment Details' : 'Ship Items'} wide actions={
              <>
                <button onClick={() => setShipModalOpen(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 typo-btn-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={handleShipConfirm} disabled={actioning}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 typo-btn-sm text-white hover:bg-emerald-700 disabled:opacity-50">
                  {actioning ? (updateShipMode ? 'Saving...' : 'Shipping...') : (updateShipMode ? 'Save' : `Ship ${shipItems.filter(si => si.checked).reduce((s, si) => s + si.qty, 0)} pcs`)}
                </button>
              </>
            }>
              {shipError && <ErrorAlert message={shipError} onDismiss={() => setShipError(null)} />}

              {/* Item qty pickers — only for new ship, not update */}
              {!updateShipMode && shipItems.length > 0 && (
                <div className="mb-3">
                  <p className="typo-label-sm mb-1.5">Items to Ship</p>
                  <div className="border rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-1.5 typo-th w-8"></th>
                          <th className="px-2 py-1.5 typo-th text-left">SKU</th>
                          <th className="px-2 py-1.5 typo-th text-left">Color</th>
                          <th className="px-2 py-1.5 typo-th text-left">Size</th>
                          <th className="px-2 py-1.5 typo-th text-right">Ordered</th>
                          <th className="px-2 py-1.5 typo-th text-right">In Stock</th>
                          <th className="px-2 py-1.5 typo-th text-right">Ship Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {shipItems.map((si, idx) => (
                          <tr key={si.order_item_id} className={si.checked ? '' : 'opacity-40'}>
                            <td className="px-2 py-1.5 text-center">
                              <input type="checkbox" checked={si.checked}
                                disabled={si.available <= 0}
                                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                onChange={e => setShipItems(prev => prev.map((s, i) => i === idx ? { ...s, checked: e.target.checked } : s))} />
                            </td>
                            <td className="px-2 py-1.5"><SKUCodeDisplay code={si.sku_code} /></td>
                            <td className="px-2 py-1.5">
                              {si.color ? <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border border-gray-200" style={{ backgroundColor: colorHex(si.color) }} />{si.color}</span> : '—'}
                            </td>
                            <td className="px-2 py-1.5 font-semibold">{si.size || '—'}</td>
                            <td className="px-2 py-1.5 text-right text-gray-500">{si.max_qty}</td>
                            <td className="px-2 py-1.5 text-right">
                              <span className={`font-medium ${si.available > 0 ? 'text-green-600' : 'text-red-400'}`}>{si.available}</span>
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {si.available > 0 ? (
                                <input type="number" min={1} max={Math.min(si.max_qty, si.available)}
                                  className="typo-input-sm w-16 text-right"
                                  value={si.qty}
                                  disabled={!si.checked}
                                  onChange={e => {
                                    const v = Math.min(Math.max(1, parseInt(e.target.value) || 0), Math.min(si.max_qty, si.available))
                                    setShipItems(prev => prev.map((s, i) => i === idx ? { ...s, qty: v } : s))
                                  }} />
                              ) : (
                                <span className="text-red-400 font-medium">No stock</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {shipItems.every(si => si.available <= 0) && (
                      <p className="text-center py-2 text-xs text-red-500 font-medium">No stock available for any items — cannot ship.</p>
                    )}
                  </div>
                </div>
              )}

              <p className="typo-caption bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
                {updateShipMode ? 'Update transport details for this shipment.' : 'Transport details are optional — can be added 1-3 days after shipment.'}
              </p>
              <div className="space-y-3">
                <div>
                  <label className="typo-label-sm">Transport</label>
                  <FilterSelect searchable full data-master="transport"
                    value={shipForm.transport_id}
                    onChange={v => setShipForm(f => ({ ...f, transport_id: v }))}
                    options={[{ value: '', label: 'Select Transport (Shift+M to create)' }, ...transports.map(t => ({ value: t.id, label: t.name }))]} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="typo-label-sm">L.R. Number</label>
                    <input className="typo-input-sm" value={shipForm.lr_number}
                      onChange={e => setShipForm(f => ({ ...f, lr_number: e.target.value }))}
                      placeholder="Bilti / lorry receipt no." />
                  </div>
                  <div>
                    <label className="typo-label-sm">L.R. Date</label>
                    <input type="date" className="typo-input-sm" value={shipForm.lr_date}
                      onChange={e => setShipForm(f => ({ ...f, lr_date: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="typo-label-sm">E-Way Bill No.</label>
                    <input className="typo-input-sm" value={shipForm.eway_bill_no}
                      onChange={e => setShipForm(f => ({ ...f, eway_bill_no: e.target.value }))}
                      placeholder="e.g. 1234 5678 9012" />
                  </div>
                  <div>
                    <label className="typo-label-sm">E-Way Bill Date</label>
                    <input type="date" className="typo-input-sm" value={shipForm.eway_bill_date}
                      onChange={e => setShipForm(f => ({ ...f, eway_bill_date: e.target.value }))} />
                  </div>
                </div>
              </div>
            </Modal>

            {/* Shipment History */}
            {o.shipments?.length > 0 && (
              <div className="pt-3 border-t space-y-2">
                <p className="typo-label-sm">Shipments ({o.shipments.length})</p>
                {o.shipments.map(shp => {
                  const missingDetails = !shp.lr_number || !shp.eway_bill_no
                  return (
                    <div key={shp.id} className={`border rounded-lg p-3 ${missingDetails ? 'border-orange-200 bg-orange-50/30' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="typo-data font-semibold text-emerald-700">{shp.shipment_no}</span>
                            <span className="typo-caption">{shp.shipped_at ? new Date(shp.shipped_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
                            {missingDetails && <span className="w-2 h-2 rounded-full bg-orange-400" title="Missing L.R. or E-Way Bill" />}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {shp.items?.map(si => (
                              <span key={si.id} className="inline-flex items-center gap-1 rounded bg-white border border-gray-200 px-1.5 py-0.5 text-[10px]">
                                <span className="font-medium">{si.sku?.sku_code || '—'}</span>
                                <span className="text-gray-400">×</span>
                                <span className="font-semibold">{si.quantity}</span>
                              </span>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-500">
                            {shp.transport?.name && <span>Transport: <span className="font-medium text-gray-700">{shp.transport.name}</span></span>}
                            {shp.lr_number && <span>LR: <span className="font-medium text-gray-700">{shp.lr_number}</span></span>}
                            {shp.eway_bill_no && <span>E-Way: <span className="font-medium text-gray-700">{shp.eway_bill_no}</span></span>}
                            {shp.invoice && <span>Invoice: <span className="font-medium text-emerald-700">{shp.invoice.invoice_number}</span></span>}
                          </div>
                        </div>
                        <button onClick={() => handleAction('update_shipment', shp)}
                          className="rounded border border-gray-300 text-gray-600 px-2.5 py-1 typo-btn-sm hover:bg-gray-100 transition-colors whitespace-nowrap flex-shrink-0">
                          {missingDetails ? 'Add Details' : 'Edit'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Sales Returns linked to this order */}
            {o.sales_returns?.length > 0 && (
              <div className="pt-3 border-t space-y-2">
                <p className="typo-label-sm">Sales Returns ({o.sales_returns.length})</p>
                {o.sales_returns.map(sr => (
                  <div key={sr.id} className="border rounded-lg p-3 border-gray-200 bg-gray-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="typo-data font-semibold text-emerald-700">{sr.srn_no}</span>
                          <StatusBadge status={sr.status} />
                          {sr.credit_note_no && <span className="typo-badge bg-green-100 text-green-700 rounded-full px-2 py-0.5">{sr.credit_note_no}</span>}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-500">
                          {sr.return_date && <span>Date: <span className="font-medium text-gray-700">{new Date(sr.return_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span></span>}
                          {sr.total_amount > 0 && <span>Amount: <span className="font-medium text-gray-700">₹{sr.total_amount.toLocaleString('en-IN')}</span></span>}
                          {sr.item_count > 0 && <span>{sr.item_count} items</span>}
                        </div>
                      </div>
                      <button onClick={() => navigate(`/returns?tab=sales&open=${sr.id}`)}
                        className="rounded border border-gray-300 text-gray-600 px-2.5 py-1 typo-btn-sm hover:bg-gray-100 transition-colors whitespace-nowrap flex-shrink-0">
                        View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Invoice summary for shipped orders */}
            {o.invoices?.length > 0 && (
              <div className="flex items-center justify-between pt-3 border-t">
                <div className="text-xs text-gray-500">
                  {o.invoices.length === 1 ? 'Invoice generated' : `${o.invoices.length} invoices generated`}
                </div>
                <button onClick={() => navigate(`/invoices?open=${o.invoices[0].id}`)}
                  className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 transition-colors flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
                  {o.invoices[0].invoice_number}
                </button>
              </div>
            )}
          </div>
        )}
        <QuickMasterModal type={quickMasterType} open={quickMasterOpen} onClose={closeQuickMaster} onCreated={onMasterCreated} />
      </div>
    )
  }

  /* ═══════════════════════ CREATE OVERLAY ═══════════════════════ */
  if (createMode) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 overflow-hidden">
        {/* ── Discard confirmation bar ── */}
        {confirmDiscard && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-2xl px-6 py-5 max-w-sm w-full mx-4 space-y-3">
              <h3 className="typo-data">Discard this order?</h3>
              <p className="text-xs text-gray-500">
                You have <span className="font-semibold text-gray-700">{orderLines.filter(l => l.sku_id).length}</span> item{orderLines.filter(l => l.sku_id).length !== 1 ? 's' : ''} in this order. This cannot be undone.
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
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={requestClose} className="rounded-lg p-1.5 hover:bg-white/20 transition-colors">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h2 className="text-lg font-bold tracking-tight">{editMode ? `Edit Order — ${nextOrderNo}` : 'New Order'}</h2>
              <p className="text-xs text-emerald-100">{editMode ? 'Update items, qty, or details' : 'Pick designs \u00b7 set qty per color \u00d7 size'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {totalItems > 0 && (
              <div className="hidden sm:flex items-center gap-2">
                <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">{orderLines.filter(l => l.sku_id).length} items</span>
                <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">{totalItems} pcs</span>
                <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">₹{grandTotal.toLocaleString('en-IN')}</span>
              </div>
            )}
            <span className="hidden sm:inline text-xs text-emerald-200">Ctrl+S to save</span>
            <button onClick={requestClose} className="rounded-lg border border-white/30 px-3 py-1.5 text-sm hover:bg-white/20 transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={saving || totalItems === 0}
              className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors">
              {saving ? (editMode ? 'Saving...' : 'Creating...') : (editMode ? `Save Changes (${totalItems})` : `Create Order (${totalItems})`)}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {formError && <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />}

          {/* Order Details — same layout as Purchase form */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-end gap-0 border-b border-gray-200 bg-gray-50">
              <div className="px-3 py-2 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Order Details</span>
                <span className="text-[10px] text-gray-300">&middot;</span>
                <span className="text-[10px] text-gray-400"><kbd className="px-1 py-0.5 font-mono bg-gray-100 border border-gray-200 rounded text-[9px]">Shift+M</kbd> quick-add master</span>
              </div>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="sm:col-span-2">
                <label className="typo-label-sm">Customer <span className="text-red-500">*</span></label>
                <FilterSelect autoFocus searchable full value={customerForm.customer_id}
                  data-master="customer"
                  onChange={(v) => setCustomerForm(f => ({ ...f, customer_id: v }))}
                  options={[{ value: '', label: 'Select customer (Shift+M to create)' }, ...customers.map(c => ({ value: c.id, label: `${c.name}${c.city ? ` — ${c.city}` : ''}${c.phone ? ` (${c.phone})` : ''}` }))]} />
              </div>
              <div>
                <label className="typo-label-sm">Order No.</label>
                <input className="typo-input-sm bg-gray-50 text-gray-500" value={nextOrderNo} readOnly placeholder="Auto-generated" />
              </div>
              <div>
                <label className="typo-label-sm">Order Date</label>
                <input type="date" className="typo-input-sm" value={customerForm.order_date}
                  onChange={(e) => setCustomerForm(f => ({ ...f, order_date: e.target.value }))} />
              </div>
              <div>
                <label className="typo-label-sm">Source</label>
                <FilterSelect full value={customerForm.source}
                  onChange={(v) => setCustomerForm(f => ({ ...f, source: v }))}
                  options={[{ value: 'web', label: 'Web' }, { value: 'ecommerce', label: 'E-commerce' }, { value: 'walk_in', label: 'Walk-in' }]} />
              </div>
              <div>
                <label className="typo-label-sm">Broker</label>
                <FilterSelect searchable full data-master="broker"
                  value={customerForm.broker_id}
                  onChange={(v) => setCustomerForm(f => ({ ...f, broker_id: v }))}
                  options={[{ value: '', label: 'Select Broker' }, ...brokers.map(b => ({ value: b.id, label: b.name }))]} />
              </div>
              <div>
                <label className="typo-label-sm">Transport</label>
                <FilterSelect searchable full data-master="transport"
                  value={customerForm.transport_id}
                  onChange={(v) => setCustomerForm(f => ({ ...f, transport_id: v }))}
                  options={[{ value: '', label: 'Select Transport' }, ...transports.map(t => ({ value: t.id, label: t.name }))]} />
              </div>
              <div>
                <label className="typo-label-sm">GST %</label>
                <FilterSelect full value={customerForm.gst_percent || '0'}
                  onChange={(v) => setCustomerForm(f => ({ ...f, gst_percent: v }))}
                  options={[{ value: '0', label: '0%' }, { value: '5', label: '5%' }, { value: '12', label: '12%' }, { value: '18', label: '18%' }, { value: '28', label: '28%' }]} />
              </div>
            </div>
            {customerForm.customer_id && (() => {
              const c = customers.find(cu => cu.id === customerForm.customer_id)
              return c ? (
                <div className="px-4 pb-3 flex items-center gap-4 text-xs text-gray-500 bg-gray-50/50 border-t border-gray-100 -mt-px">
                  <div className="flex items-center gap-4 px-3 py-1.5">
                    {c.phone && <span className="inline-flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>{c.phone}</span>}
                    {c.gst_no && <span className="inline-flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>GST: {c.gst_no}</span>}
                    {c.city && <span className="inline-flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>{c.city}</span>}
                  </div>
                </div>
              ) : null
            })()}
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
              {/* ── Line Items — inline row-based ── */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Line Items ({orderLines.filter(l => l.sku_id).length} items)</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setScanMode(m => !m); setScanInput(''); setScanStatus(null) }}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 typo-btn-sm shadow-sm transition-colors ${scanMode ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-emerald-600 text-emerald-700 hover:bg-emerald-50'}`}>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                      {scanMode ? 'Scanning Active' : 'Scan from Phone'}
                    </button>
                    <button onClick={addOrderLine} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 typo-btn-sm text-white hover:bg-emerald-700 shadow-sm transition-colors">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      Add Row
                    </button>
                  </div>
                </div>

                {/* ── POS Scan Bar ── */}
                {scanMode && (
                  <div className="border-b border-gray-200 bg-emerald-50/50 px-4 py-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 relative" ref={scanInputRef}>
                        <FilterSelect
                          searchable
                          autoFocus
                          full
                          value=""
                          onChange={(code) => { if (code) handlePOSSubmit(code) }}
                          options={[{ value: '', label: 'Type or scan SKU code...' }, ...skuSearchOptions]}
                        />
                      </div>
                      <button onClick={() => { setScanMode(false); setScanInput(''); setScanStatus(null) }}
                        className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>

                    {/* Status indicator */}
                    <div className="flex items-center gap-2 min-h-[20px]">
                      {scanStatus ? (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          scanStatus.type === 'added' ? 'text-emerald-600' :
                          scanStatus.type === 'duplicate' ? 'text-amber-600' :
                          'text-red-500'
                        }`}>
                          {scanStatus.type === 'added' && (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          )}
                          {scanStatus.type === 'duplicate' && (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          )}
                          {scanStatus.type === 'error' && (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          )}
                          {scanStatus.message}
                        </span>
                      ) : phoneConnected ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                          <span className="relative flex h-2 w-2">
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          Phone connected — ready to scan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                          </span>
                          Phone not connected — open Gun mode on phone
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <table className="w-full table-fixed">
                  <thead>
                    <tr className="bg-emerald-600">
                      <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider w-[3%] border-r border-emerald-500">#</th>
                      <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider w-[20%] border-r border-emerald-500">Design</th>
                      <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider w-[13%] border-r border-emerald-500">Color</th>
                      <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider w-[12%] border-r border-emerald-500">Size</th>
                      <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase tracking-wider w-[8%] border-r border-emerald-500">Stock</th>
                      <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase tracking-wider w-[8%] border-r border-emerald-500">Pipeline</th>
                      <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase tracking-wider w-[10%] border-r border-emerald-500">Qty</th>
                      <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase tracking-wider w-[10%] border-r border-emerald-500">Price (₹)</th>
                      <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider w-[12%] border-r border-emerald-500">Total</th>
                      <th className="px-1 py-2 w-[4%]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderLines.map((line, idx) => {
                      const sku = resolveLineSKU(line)
                      const avail = sku?.stock?.available_qty || 0
                      const pipeQty = sku?.stock?.pipeline_qty || 0
                      const lineTotal = line.qty * (line.price || 0)
                      const isShort = line.qty > 0 && line.qty > avail
                      return (
                        <tr key={idx} className={`border-b border-gray-100 hover:bg-gray-50/50 ${idx % 2 === 1 ? 'bg-gray-50/30' : ''} ${flashRowIdx === idx ? 'animate-flash-row' : ''}`}>
                          <td className="px-2 py-1.5 typo-td-secondary">{idx + 1}</td>
                          <td className="px-2 py-1.5">
                            <FilterSelect full searchable value={line.design_key}
                              onChange={v => {
                                const group = designGroups.find(g => g.key === v)
                                const firstSku = group?.skus[0]
                                const defaultPrice = firstSku ? (firstSku.sale_rate || firstSku.mrp || firstSku.base_price || 0) : 0
                                updateOrderLine(idx, 'design_key', v)
                                updateOrderLine(idx, 'color', '')
                                updateOrderLine(idx, 'size', '')
                                updateOrderLine(idx, 'sku_id', null)
                                updateOrderLine(idx, 'price', defaultPrice)
                                // Reset color/size so user picks fresh
                                setOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, design_key: v, color: '', size: '', sku_id: null, price: defaultPrice } : l))
                              }}
                              options={designOptions} />
                          </td>
                          <td className="px-2 py-1.5">
                            <FilterSelect full value={line.color}
                              onChange={v => {
                                const cur = orderLinesRef.current
                                const group = designGroups.find(g => g.key === cur[idx].design_key)
                                const foundSku = cur[idx].size && group ? group.skus.find(s => s._parsed.color === v && s._parsed.size === cur[idx].size) : null
                                if (foundSku) {
                                  const dupeIdx = cur.findIndex((l, i) => i !== idx && l.sku_id === foundSku.id)
                                  if (dupeIdx !== -1) {
                                    setScanStatus({ type: 'duplicate', message: `${foundSku.sku_code} already in order — row ${dupeIdx + 1}` })
                                    flashRow(dupeIdx)
                                    setTimeout(() => setScanStatus(null), 3000)
                                    setOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, color: v, sku_id: null } : l))
                                    return
                                  }
                                }
                                setOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, color: v, sku_id: foundSku?.id || null, price: foundSku ? (l.price || foundSku.sale_rate || foundSku.mrp || foundSku.base_price || 0) : l.price } : l))
                              }}
                              options={getColorsForDesign(line.design_key, line.size)} />
                          </td>
                          <td className="px-2 py-1.5">
                            <FilterSelect full value={line.size}
                              onChange={v => {
                                const cur = orderLinesRef.current
                                const group = designGroups.find(g => g.key === cur[idx].design_key)
                                const foundSku = cur[idx].color && group ? group.skus.find(s => s._parsed.color === cur[idx].color && s._parsed.size === v) : null
                                if (foundSku) {
                                  const dupeIdx = cur.findIndex((l, i) => i !== idx && l.sku_id === foundSku.id)
                                  if (dupeIdx !== -1) {
                                    setScanStatus({ type: 'duplicate', message: `${foundSku.sku_code} already in order — row ${dupeIdx + 1}` })
                                    flashRow(dupeIdx)
                                    setTimeout(() => setScanStatus(null), 3000)
                                    setOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, size: v, sku_id: null } : l))
                                    return
                                  }
                                }
                                setOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, size: v, sku_id: foundSku?.id || null, price: foundSku ? (l.price || foundSku.sale_rate || foundSku.mrp || foundSku.base_price || 0) : l.price } : l))
                              }}
                              options={getSizesForDesign(line.design_key, line.color)} />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {sku ? <span className={`text-xs font-medium ${avail > 0 ? 'text-green-600' : 'text-red-400'}`}>{avail}</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {sku && pipeQty > 0 ? <span className="text-xs font-medium text-blue-500">+{pipeQty}</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <div className="inline-flex flex-col items-center">
                              <input type="number" min="0" data-qty="true"
                                value={line.qty || ''} onChange={(e) => updateOrderLine(idx, 'qty', parseInt(e.target.value) || 0)}
                                className={`w-20 rounded border text-center text-xs px-2 py-1 focus:outline-none focus:ring-1 ${
                                  line.qty > 0
                                    ? isShort ? 'border-amber-400 focus:ring-amber-400 bg-amber-50' : 'border-emerald-400 focus:ring-emerald-400 bg-emerald-50'
                                    : 'border-gray-200 focus:ring-gray-300'
                                }`}
                                placeholder="0" disabled={!sku} />
                              {isShort && <span className="text-[10px] text-amber-600 font-semibold mt-0.5">{line.qty - avail} short</span>}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input type="number" min="0" step="0.01"
                              value={line.price || ''}
                              onChange={(e) => updateOrderLine(idx, 'price', parseFloat(e.target.value) || 0)}
                              className="w-20 rounded border border-gray-200 text-center text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                              placeholder="₹" disabled={!sku} />
                          </td>
                          <td className="px-2 py-1.5 text-right text-xs font-semibold">
                            {lineTotal > 0 ? `₹${lineTotal.toLocaleString('en-IN')}` : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-1 py-1.5">
                            {orderLines.length > 1 && (
                              <button onClick={() => removeOrderLine(idx)} tabIndex={-1}
                                className="text-gray-400 hover:text-red-500 transition-colors p-0.5">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="px-4 py-3 flex justify-end border-t border-gray-200">
                  <div className="w-56 space-y-1.5">
                    <div className="flex justify-between typo-td"><span>Subtotal</span><span>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                    <div className="flex justify-between items-center typo-td-secondary">
                      <span>Discount</span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400">₹</span>
                        <input type="number" min="0" step="0.01" className="typo-input-sm w-24 text-right"
                          value={customerForm.discount_amount}
                          onChange={(e) => setCustomerForm(f => ({ ...f, discount_amount: e.target.value }))}
                          placeholder="0.00" />
                      </div>
                    </div>
                    {(() => {
                      const gstPct = parseFloat(customerForm.gst_percent) || 0
                      const discountAmt = parseFloat(customerForm.discount_amount) || 0
                      const taxable = grandTotal - discountAmt
                      const gstAmt = Math.round(taxable * gstPct / 100 * 100) / 100
                      return (<>
                        {gstPct > 0 && (<>
                          <div className="flex justify-between typo-td-secondary"><span>CGST ({gstPct / 2}%)</span><span>₹{(gstAmt / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                          <div className="flex justify-between typo-td-secondary"><span>SGST ({gstPct / 2}%)</span><span>₹{(gstAmt / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                        </>)}
                        <div className="flex justify-between typo-data text-base border-t border-gray-200 pt-2"><span>Grand Total</span><span>₹{(taxable + gstAmt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                      </>)
                    })()}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden px-4 py-3">
                <h4 className="typo-label-sm mb-2">Notes</h4>
                <textarea className="typo-input-sm w-full h-20 resize-none" value={customerForm.notes}
                  onChange={(e) => setCustomerForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Remarks..." />
              </div>
            </>
          )}
        </div>

        {/* Keyboard shortcuts bar */}
        <div className="flex-shrink-0 border-t bg-white px-6 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
            <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Tab</kbd> Next field</span>
            <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Ctrl+S</kbd> Save</span>
            <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Esc</kbd> Close</span>
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
      <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-2">
        <KPICard label="Total Orders" value={kpis.total} color="slate"
          onClick={() => {
            setStatusFilter(''); setSourceFilter(''); setSearch(''); setShortageOnly(false); setPage(1)
          }} />
        <KPICard label="Pending" value={kpis.pending} color="amber" />
        <KPICard label="Processing" value={kpis.processing} color="blue" />
        <KPICard label="Shipped Today" value={kpis.shippedToday} color="green" />
        <KPICard label="With Shortage" value={kpis.withShortage} color="amber"
          active={shortageOnly}
          onClick={() => {
            const next = !shortageOnly
            setShortageOnly(next)
            if (next) { setStatusFilter(''); setSourceFilter(''); setSearch(''); setPage(1) }
          }} />
        <KPICard label="Revenue" value={`₹${kpis.revenue.toLocaleString('en-IN')}`} color="emerald" />
      </div>

      {/* Tab pills + filters */}
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setStatusFilter(t.key); setShortageOnly(false); setPage(1) }}
              className={`rounded-full px-3 py-1 typo-btn-sm transition-colors ${
                statusFilter === t.key && !shortageOnly ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <FilterSelect value={sourceFilter} onChange={(v) => { setSourceFilter(v); setShortageOnly(false); setPage(1) }}
          options={SOURCE_OPTIONS} />
        <div className="ml-auto w-64">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setShortageOnly(false); setPage(1) }} placeholder="Search orders..." />
        </div>
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      <div className="mt-4">
        <DataTable
          columns={COLUMNS}
          data={shortageOnly ? allOrders.filter(o => o.has_shortage) : ordersList}
          loading={loading}
          onRowClick={handleRowClick}
          emptyText={shortageOnly ? 'No orders with shortage.' : 'No orders found.'}
        />
        {!shortageOnly && <Pagination page={page} pages={pages} total={total} onChange={setPage} />}
      </div>

      <QuickMasterModal type={quickMasterType} open={quickMasterOpen} onClose={closeQuickMaster} onCreated={onMasterCreated} />
      {/* Order Print Overlay is handled via the early return at the top of render (so Close returns to detail, not list) */}
    </div>
  )
}
