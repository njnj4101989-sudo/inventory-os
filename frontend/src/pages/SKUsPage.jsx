import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { getSKUs, getSKU, createSKU, updateSKU, purchaseStock, getPurchaseInvoices, getSKUCostHistory, getSKUOpenDemand, createSKUOpeningStock, getSKUsGrouped, getSKUSummary } from '../api/skus'
import { adjust, getEvents } from '../api/inventory'
import { getSuppliers } from '../api/suppliers'
import { getAllProductTypes, getAllColors, getAllDesigns } from '../api/masters'
import { colorHex, loadColorMap } from '../utils/colorUtils'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import ErrorAlert from '../components/common/ErrorAlert'
import StatusBadge from '../components/common/StatusBadge'
import FilterSelect from '../components/common/FilterSelect'
import SKULabelSheet from '../components/common/SKULabelSheet'
import ThermalLabelSheet from '../components/common/thermal/ThermalLabelSheet'
import useQuickMaster from '../hooks/useQuickMaster'
import QuickMasterModal from '../components/common/QuickMasterModal'

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

function SKUCodeDisplay({ code }) {
  const { base, vas } = parseSKU(code)
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className="typo-data">{base}</span>
      {vas.map(va => {
        const c = VA_COLORS[va] || DEFAULT_VA
        return <span key={va} className={`rounded px-1 py-0.5 text-[10px] font-bold leading-none ${c.bg} ${c.text}`}>+{va}</span>
      })}
    </span>
  )
}

function StockIndicator({ stock }) {
  if (!stock) return <span className="typo-caption">—</span>
  const { total_qty, available_qty, reserved_qty } = stock
  const isOut = available_qty <= 0 && total_qty === 0
  const isLow = available_qty > 0 && total_qty > 0 && (available_qty / total_qty) < 0.3
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`w-1.5 h-1.5 rounded-full ${isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-green-500'}`} />
      <span className="typo-data">{available_qty}</span>
      <span className="typo-caption">/ {total_qty}</span>
      {reserved_qty > 0 && <span className="text-amber-600 text-xs font-medium">({reserved_qty} res)</span>}
    </div>
  )
}

const SKU_COLUMNS = [
  { key: 'sku_code', label: 'SKU Code', render: (val) => <SKUCodeDisplay code={val} /> },
  { key: 'color', label: 'Color', render: (val) => val ? (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: colorHex(val) }} />
      <span className="typo-td">{val}</span>
    </span>
  ) : '—' },
  { key: 'size', label: 'Size', render: (val) => <span className="typo-data">{val || '—'}</span> },
  { key: 'product_type', label: 'Type', render: (val) => <span className="typo-td-secondary">{val}</span> },
  { key: 'sale_rate', label: 'Sale Rate', render: (_, row) => {
    const p = parseFloat(row?.sale_rate || row?.mrp || row?.base_price || 0)
    return p > 0 ? <span className="typo-td">₹{p.toLocaleString('en-IN')}</span> : <span className="typo-caption">Set rate</span>
  } },
  { key: 'stock', label: 'Stock', render: (val) => <StockIndicator stock={val} /> },
  { key: 'is_active', label: 'Status', render: (val) => <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${val ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{val ? 'Active' : 'Inactive'}</span> },
]

const PURCHASE_COLUMNS = [
  { key: 'invoice_no', label: 'Invoice No.', render: (val) => <span className="typo-data">{val || '—'}</span> },
  { key: 'supplier', label: 'Supplier', render: (val) => <span className="typo-td">{val?.name || '—'}</span> },
  { key: 'invoice_date', label: 'Date', render: (val) => val ? <span className="typo-td">{new Date(val).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</span> : '—' },
  { key: 'type', label: 'Type', render: () => (
    <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
      Item Purchase
    </span>
  ) },
  { key: 'item_count', label: 'Items', render: (val) => <span className="typo-data">{val}</span> },
  { key: 'total_amount', label: 'Amount', render: (val) => <span className="typo-data">₹{parseFloat(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span> },
  { key: 'sr_no', label: 'Sr. No.', render: (val) => <span className="typo-td-secondary">{val || '—'}</span> },
]

function SkippedRow({ skipped, onAdjust }) {
  const [qty, setQty] = useState('')
  const [saving, setSaving] = useState(false)
  if (skipped.adjusted) {
    const isNeg = skipped.adjusted_qty < 0
    return (
      <tr className="border-b border-gray-100 bg-green-50">
        <td className="px-3 py-2 typo-data">{skipped.sku_code}</td>
        <td className="px-3 py-2 text-right typo-td">{skipped.existing_qty}</td>
        <td className={`px-3 py-2 text-right typo-data ${isNeg ? 'text-red-600' : 'text-green-700'}`}>{isNeg ? '' : '+'}{skipped.adjusted_qty}</td>
        <td className="px-3 py-2 text-center"><span className="text-green-600 text-xs font-semibold">Adjusted</span></td>
      </tr>
    )
  }
  const parsed = parseInt(qty)
  const isValid = qty !== '' && !isNaN(parsed) && parsed !== 0
  return (
    <tr className="border-b border-gray-100">
      <td className="px-3 py-2 typo-data">{skipped.sku_code}</td>
      <td className="px-3 py-2 text-right typo-td">{skipped.existing_qty}</td>
      <td className="px-3 py-2 text-right">
        <input type="number" value={qty} onChange={e => setQty(e.target.value)}
          className="typo-input-sm text-right w-20" placeholder="±qty" />
      </td>
      <td className="px-3 py-2 text-center">
        <button onClick={async () => { setSaving(true); await onAdjust(skipped, qty); setSaving(false) }}
          disabled={saving || !isValid}
          className="rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors">
          {saving ? '...' : 'Adjust'}
        </button>
      </td>
    </tr>
  )
}

const SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'Free']
const EMPTY_LINE = { product_type: 'FBL', design_no: '', design_id: null, color: '', color_id: null, size: 'S', qty: '', unit_price: '' }
const EMPTY_OPENING = { product_type: 'FBL', design_no: '', design_id: null, color: '', color_id: null, size: 'S', qty: '', unit_cost: '', sale_rate: '', mrp: '' }

export default function SKUsPage() {
  const [activeTab, setActiveTab] = useState('skus')

  // SKU list state — server returns design groups (one row per design, nested SKUs inside)
  const [skuGroups, setSkuGroups] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterType, setFilterType] = useState('')
  const [filterStock, setFilterStock] = useState('')
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  // Global KPIs — fetched separately so they reflect the whole dataset, not just current page
  const [summary, setSummary] = useState({ total_skus: 0, in_stock_skus: 0, total_pieces: 0, auto_generated: 0 })

  // Purchase invoices state
  const [purchaseInvoices, setPurchaseInvoices] = useState([])
  const [piTotal, setPiTotal] = useState(0)
  const [piPage, setPiPage] = useState(1)
  const [piPages, setPiPages] = useState(1)
  const [piLoading, setPiLoading] = useState(false)

  // Masters
  const [suppliers, setSuppliers] = useState([])
  const [productTypes, setProductTypes] = useState([])
  const [colors, setColors] = useState([])
  const [designs, setDesigns] = useState([])

  // Shift+M Quick Master
  const refreshDesigns = useCallback(() => {
    getAllDesigns().then(res => setDesigns(res.data.data || res.data || [])).catch(() => {})
  }, [])

  const handleQuickMasterCreated = useCallback((masterType, newItem) => {
    if (masterType === 'design' && newItem?.id) {
      refreshDesigns()
    }
  }, [refreshDesigns])

  const { quickMasterType, quickMasterOpen, closeQuickMaster, onMasterCreated } = useQuickMaster(handleQuickMasterCreated)

  // Purchase overlay
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [purchaseHeader, setPurchaseHeader] = useState({ supplier_id: '', invoice_no: '', challan_no: '', invoice_date: '', sr_no: '', gst_percent: '0', notes: '' })
  const [purchaseLines, setPurchaseLines] = useState([{ ...EMPTY_LINE }])
  const [purchaseSaving, setPurchaseSaving] = useState(false)
  const [purchaseError, setPurchaseError] = useState(null)

  // Detail overlay
  const [detailSKU, setDetailSKU] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editFields, setEditFields] = useState({})
  const [savingDetail, setSavingDetail] = useState(false)
  const [detailError, setDetailError] = useState(null)

  // SKU label print
  const [printSkus, setPrintSkus] = useState(null)
  const [thermalSkus, setThermalSkus] = useState(null)

  // Purchase invoice detail
  const [piDetail, setPiDetail] = useState(null)

  // Opening stock overlay
  const [openingOpen, setOpeningOpen] = useState(false)
  const [openingLines, setOpeningLines] = useState([{ ...EMPTY_OPENING }])
  const [openingSaving, setOpeningSaving] = useState(false)
  const [openingError, setOpeningError] = useState(null)
  const [openingResult, setOpeningResult] = useState(null)
  const [allSkuCodes, setAllSkuCodes] = useState(new Map())

  const fetchSKUs = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await getSKUsGrouped({
        page,
        page_size: 25,
        search: search || undefined,
        product_type: filterType || undefined,
        stock_status: filterStock || undefined,
      })
      setSkuGroups(res.data.data); setTotal(res.data.total); setPages(res.data.pages)
    } catch (err) { setError(err.response?.data?.detail || 'Failed to load SKUs') }
    finally { setLoading(false) }
  }, [page, search, filterType, filterStock])

  const fetchSummary = useCallback(async () => {
    try {
      const res = await getSKUSummary()
      setSummary(res.data.data)
    } catch { /* KPIs are non-critical; keep defaults on failure */ }
  }, [])

  const fetchPurchaseInvoices = useCallback(async () => {
    setPiLoading(true)
    try {
      const res = await getPurchaseInvoices({ page: piPage, page_size: 20 })
      setPurchaseInvoices(res.data.data); setPiTotal(res.data.total); setPiPages(res.data.pages)
    } catch (err) { console.error('Failed to load purchase invoices', err) }
    finally { setPiLoading(false) }
  }, [piPage])

  useEffect(() => { loadColorMap() }, [])
  useEffect(() => { fetchSKUs() }, [fetchSKUs])
  useEffect(() => { fetchSummary() }, [fetchSummary])
  useEffect(() => { if (activeTab === 'purchases') fetchPurchaseInvoices() }, [activeTab, fetchPurchaseInvoices])
  // Reset to page 1 when filters change — avoids landing on an empty page
  useEffect(() => { setPage(1) }, [search, filterType, filterStock])

  // Detail overlay shortcut: Ctrl/Cmd+P opens thermal label print (default) — A4 remains a manual click
  useEffect(() => {
    if (!detailSKU || printSkus || thermalSkus) return
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        setThermalSkus([detailSKU])
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [detailSKU, printSkus, thermalSkus])

  // Load masters for purchase form
  useEffect(() => {
    async function loadMasters() {
      try {
        const [supRes, ptRes, colRes, desRes] = await Promise.all([
          getSuppliers({ is_active: true }),
          getAllProductTypes(),
          getAllColors(),
          getAllDesigns(),
        ])
        setSuppliers((supRes.data.data || supRes.data || []).filter(s => s.is_active !== false))
        setProductTypes(ptRes.data.data || ptRes.data || [])
        setColors(colRes.data.data || colRes.data || [])
        setDesigns(desRes.data.data || desRes.data || [])
      } catch (err) { console.error('Failed to load masters', err) }
    }
    loadMasters()
  }, [])

  // Server returns pre-grouped rows — no client-side filtering/grouping needed
  const groupedSKUs = skuGroups

  const toggleGroup = useCallback((designKey) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(designKey) ? next.delete(designKey) : next.add(designKey)
      return next
    })
  }, [])

  const [costHistory, setCostHistory] = useState(null)
  const [skuEvents, setSkuEvents] = useState([])
  const [openDemand, setOpenDemand] = useState(null)

  // SKU detail
  const openDetail = async (row) => {
    setDetailLoading(true); setDetailError(null); setCostHistory(null); setSkuEvents([]); setOpenDemand(null)
    try {
      const [skuRes, costRes, evtRes, demandRes] = await Promise.all([
        getSKU(row.id),
        getSKUCostHistory(row.id).catch(() => null),
        getEvents(row.id, { page_size: 0 }).catch(() => null),
        getSKUOpenDemand(row.id).catch(() => null),
      ])
      const sku = skuRes.data.data || skuRes.data
      setDetailSKU(sku)
      setEditFields({
        color: sku.color || '', color_id: sku.color_id || '', size: sku.size || '',
        design_id: sku.design_id || '',
        base_price: sku.base_price ?? '', description: sku.description || '',
        hsn_code: sku.hsn_code || '', gst_percent: sku.gst_percent ?? '',
        mrp: sku.mrp ?? '', sale_rate: sku.sale_rate ?? '', unit: sku.unit || '',
        stitching_cost: sku.stitching_cost ?? '', other_cost: sku.other_cost ?? '',
      })
      if (costRes) setCostHistory(costRes.data.data)
      if (evtRes) setSkuEvents(evtRes.data.data || [])
      if (demandRes) setOpenDemand(demandRes.data.data)
    } catch (err) { setError(err.response?.data?.detail || 'Failed to load SKU') }
    finally { setDetailLoading(false) }
  }

  const handleSaveDetail = async () => {
    if (!detailSKU) return
    setSavingDetail(true); setDetailError(null)
    try {
      const payload = {
        base_price: editFields.base_price !== '' ? parseFloat(editFields.base_price) : null,
        description: editFields.description || null,
        hsn_code: editFields.hsn_code || null,
        gst_percent: editFields.gst_percent !== '' ? parseFloat(editFields.gst_percent) : null,
        mrp: editFields.mrp !== '' ? parseFloat(editFields.mrp) : null,
        sale_rate: editFields.sale_rate !== '' ? parseFloat(editFields.sale_rate) : null,
        stitching_cost: editFields.stitching_cost !== '' ? parseFloat(editFields.stitching_cost) : null,
        other_cost: editFields.other_cost !== '' ? parseFloat(editFields.other_cost) : null,
        unit: editFields.unit || null,
      }
      // Include identity fields only if changed
      if (detailSKU.is_identity_editable) {
        if (editFields.color && editFields.color !== detailSKU.color) payload.color = editFields.color
        if (editFields.color_id && editFields.color_id !== detailSKU.color_id) payload.color_id = editFields.color_id
        if (editFields.size && editFields.size !== detailSKU.size) payload.size = editFields.size
        if (editFields.design_id && editFields.design_id !== detailSKU.design_id) payload.design_id = editFields.design_id
      }
      const res = await updateSKU(detailSKU.id, payload)
      setDetailSKU(prev => ({ ...prev, ...(res.data.data || res.data) }))
      fetchSKUs()
    } catch (err) { setDetailError(err.response?.data?.detail || 'Failed to save') }
    finally { setSavingDetail(false) }
  }

  // Purchase overlay
  const openPurchase = () => {
    setPurchaseHeader({ supplier_id: '', invoice_no: '', challan_no: '', invoice_date: '', sr_no: '', gst_percent: '0', notes: '' })
    setPurchaseLines([{ ...EMPTY_LINE }])
    setPurchaseError(null)
    setPurchaseOpen(true)
  }

  const updateLine = (idx, field, value) => {
    setPurchaseLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }
  const addLine = () => {
    setPurchaseLines(prev => [...prev, { ...EMPTY_LINE }])
    // Focus color input of new row after render (design is now FilterSelect)
    setTimeout(() => {
      const rows = document.querySelectorAll('[data-purchase-row]')
      const lastRow = rows[rows.length - 1]
      if (lastRow) {
        const colorInput = lastRow.querySelector('input[data-field="color"]')
        if (colorInput) colorInput.focus()
      }
    }, 50)
  }
  const removeLine = (idx) => setPurchaseLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const purchaseSubtotal = useMemo(() => {
    return purchaseLines.reduce((sum, l) => {
      const qty = parseInt(l.qty) || 0
      const price = parseFloat(l.unit_price) || 0
      return sum + qty * price
    }, 0)
  }, [purchaseLines])

  const purchaseGstAmt = useMemo(() => {
    const gst = parseFloat(purchaseHeader.gst_percent) || 0
    return Math.round(purchaseSubtotal * gst / 100 * 100) / 100
  }, [purchaseSubtotal, purchaseHeader.gst_percent])

  const handlePurchaseSubmit = async () => {
    const validLines = purchaseLines.filter(l => (l.design_no || l.design_id) && (l.color || l.color_id) && l.size && parseInt(l.qty) > 0 && parseFloat(l.unit_price) > 0)
    if (!purchaseHeader.supplier_id) { setPurchaseError('Select a supplier'); return }
    if (validLines.length === 0) { setPurchaseError('Add at least one valid line item'); return }

    setPurchaseSaving(true); setPurchaseError(null)
    try {
      await purchaseStock({
        supplier_id: purchaseHeader.supplier_id,
        invoice_no: purchaseHeader.invoice_no || null,
        challan_no: purchaseHeader.challan_no || null,
        invoice_date: purchaseHeader.invoice_date || null,
        sr_no: purchaseHeader.sr_no || null,
        gst_percent: parseFloat(purchaseHeader.gst_percent) || 0,
        notes: purchaseHeader.notes || null,
        line_items: validLines.map(l => ({
          product_type: l.product_type,
          design_no: l.design_no,
          design_id: l.design_id || null,
          color: l.color,
          color_id: l.color_id || null,
          size: l.size,
          qty: parseInt(l.qty),
          unit_price: parseFloat(l.unit_price),
        })),
      })
      // Build SKU list for label printing
      const newSkus = validLines.map(l => ({
        sku_code: `${l.product_type}-${l.design_no}-${l.color}-${l.size}`,
        product_name: `Design ${l.design_no}`,
        color: l.color,
        size: l.size,
        base_price: parseFloat(l.unit_price),
      }))
      setPurchaseOpen(false)
      setPrintSkus(newSkus)
      fetchSKUs()
      if (activeTab === 'purchases') fetchPurchaseInvoices()
    } catch (err) { setPurchaseError(err.response?.data?.detail || 'Failed to save purchase') }
    finally { setPurchaseSaving(false) }
  }

  // ── Opening Stock Overlay ──
  const openOpening = async () => {
    setOpeningLines([{ ...EMPTY_OPENING }])
    setOpeningError(null)
    setOpeningResult(null)
    setOpeningOpen(true)
    // Fetch all SKUs for live badge matching
    try {
      const res = await getSKUs({ page_size: 0 })
      const list = res.data.data || []
      const map = new Map()
      list.forEach(s => map.set(s.sku_code, { id: s.id, total_qty: s.stock?.total_qty || 0 }))
      setAllSkuCodes(map)
    } catch { /* ignore */ }
  }

  const updateOpeningLine = (idx, field, value) => {
    setOpeningLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  const addOpeningLine = () => {
    setOpeningLines(prev => [...prev, { ...EMPTY_OPENING }])
    setTimeout(() => {
      const rows = document.querySelectorAll('[data-opening-row]')
      const last = rows[rows.length - 1]
      if (last) { const f = last.querySelector('[data-field="design_no"]'); if (f) f.focus() }
    }, 50)
  }

  const removeOpeningLine = (idx) => setOpeningLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const getSkuStatus = useCallback((line) => {
    if ((!line.design_no && !line.design_id) || !line.color) return null
    const code = `${line.product_type}-${line.design_no}-${line.color}-${line.size}`
    const existing = allSkuCodes.get(code)
    if (!existing) return { type: 'new', label: 'New', cls: 'bg-green-100 text-green-700' }
    if (existing.total_qty > 0) return { type: 'has_stock', label: `Has ${existing.total_qty} pcs`, cls: 'bg-amber-100 text-amber-700' }
    return { type: 'exists', label: 'Exists', cls: 'bg-blue-100 text-blue-700' }
  }, [allSkuCodes])

  const handleOpeningSubmit = async () => {
    const validLines = openingLines.filter(l => (l.design_no || l.design_id) && (l.color || l.color_id) && parseInt(l.qty) > 0)
    if (validLines.length === 0) { setOpeningError('Add at least one valid row (design, color, qty)'); return }
    setOpeningSaving(true); setOpeningError(null)
    try {
      const res = await createSKUOpeningStock({
        line_items: validLines.map(l => ({
          product_type: l.product_type,
          design_no: l.design_no,
          design_id: l.design_id || null,
          color: l.color,
          color_id: l.color_id || null,
          size: l.size,
          qty: parseInt(l.qty),
          unit_cost: l.unit_cost ? parseFloat(l.unit_cost) : null,
          sale_rate: l.sale_rate ? parseFloat(l.sale_rate) : null,
          mrp: l.mrp ? parseFloat(l.mrp) : null,
        })),
      })
      const data = res.data.data || res.data
      if (data.skipped && data.skipped.length > 0) {
        setOpeningResult(data)
      } else {
        setOpeningOpen(false)
        fetchSKUs()
      }
      if (data.created > 0) fetchSKUs()
    } catch (err) { setOpeningError(err.response?.data?.detail || 'Opening stock entry failed') }
    finally { setOpeningSaving(false) }
  }

  const handleAdjustSkipped = async (skipped, adjustQty) => {
    const parsed = parseInt(adjustQty)
    if (!adjustQty || isNaN(parsed) || parsed === 0) return
    try {
      await adjust({
        sku_id: skipped.sku_id,
        event_type: 'adjustment',
        item_type: 'finished_goods',
        quantity: parsed,
        reason: parsed < 0 ? 'Opening stock correction (reduce excess)' : 'Opening stock adjustment',
      })
      setOpeningResult(prev => ({
        ...prev,
        skipped: prev.skipped.map(s => s.sku_id === skipped.sku_id ? { ...s, adjusted: true, adjusted_qty: parsed } : s),
      }))
      fetchSKUs()
    } catch (err) {
      const d = err.response?.data?.detail
      setOpeningError(typeof d === 'string' ? d : Array.isArray(d) ? d.map(e => e.msg || e).join(', ') : 'Adjust failed')
    }
  }

  const ptOptions = productTypes.map(pt => ({ value: pt.code, label: `${pt.code} — ${pt.name}` }))

  // ── Opening Stock Overlay ──
  if (openingOpen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white px-6 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => { setOpeningOpen(false); setOpeningError(null); setOpeningResult(null) }} className="rounded-lg p-1.5 hover:bg-white/10 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div>
              <h2 className="text-lg font-bold">Opening Stock Entry</h2>
              <p className="text-amber-100 text-xs">Create SKUs + enter existing inventory for Day 1 setup</p>
            </div>
          </div>
          {!openingResult && (
            <button onClick={handleOpeningSubmit} disabled={openingSaving}
              className="rounded-lg bg-white/20 hover:bg-white/30 px-5 py-2 typo-btn-sm text-white transition-colors disabled:opacity-50">
              {openingSaving ? 'Saving...' : 'Save Opening Stock'}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {openingError && <ErrorAlert message={openingError} onDismiss={() => setOpeningError(null)} />}

          {/* Post-submit results */}
          {openingResult && (
            <div className="space-y-3">
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                <p className="typo-data text-green-700">{openingResult.message}</p>
              </div>

              {openingResult.skipped.length > 0 && (
                <div className="bg-white rounded-lg border border-amber-200 px-4 py-3">
                  <h3 className="typo-card-title text-amber-700 mb-3">Skipped — Already Have Opening Stock</h3>
                  <p className="typo-caption mb-3">These SKUs already had opening stock. You can adjust their quantity below.</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-amber-50">
                        <th className="px-3 py-2 text-left typo-th">SKU Code</th>
                        <th className="px-3 py-2 text-right typo-th">Current Qty</th>
                        <th className="px-3 py-2 text-right typo-th">Add Qty</th>
                        <th className="px-3 py-2 text-center typo-th">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openingResult.skipped.map((s) => (
                        <SkippedRow key={s.sku_id} skipped={s} onAdjust={handleAdjustSkipped} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={() => { setOpeningOpen(false); setOpeningResult(null); fetchSKUs() }}
                  className="rounded-lg bg-emerald-600 px-5 py-2 typo-btn-sm text-white hover:bg-emerald-700 transition-colors">
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Entry form — hidden after submit */}
          {!openingResult && (
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="typo-card-title">SKU Line Items</h3>
                <button onClick={addOpeningLine} className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 typo-btn-sm text-white hover:bg-amber-700 shadow-sm transition-colors">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add Row
                </button>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-amber-600">
                      <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider w-8 border-r border-amber-500">#</th>
                      <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider border-r border-amber-500">Type</th>
                      <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider border-r border-amber-500">Design No.</th>
                      <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider border-r border-amber-500">Color</th>
                      <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider border-r border-amber-500">Size</th>
                      <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider border-r border-amber-500">Qty</th>
                      <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider border-r border-amber-500">Sale Rate</th>
                      <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider border-r border-amber-500">MRP</th>
                      <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider border-r border-amber-500">Unit Cost</th>
                      <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase tracking-wider border-r border-amber-500">Status</th>
                      <th className="px-1 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {openingLines.map((line, idx) => {
                      const status = getSkuStatus(line)
                      return (
                        <tr key={idx} data-opening-row className="border-b border-gray-100 hover:bg-gray-50/50">
                          <td className="px-2 py-1.5 typo-td-secondary">{idx + 1}</td>
                          <td className="px-2 py-1.5">
                            <FilterSelect full autoFocus={idx === 0} value={line.product_type} onChange={v => updateOpeningLine(idx, 'product_type', v)}
                              options={ptOptions.length ? ptOptions : [{ value: 'FBL', label: 'FBL' }, { value: 'SBL', label: 'SBL' }, { value: 'LHG', label: 'LHG' }, { value: 'SAR', label: 'SAR' }]} />
                          </td>
                          <td className="px-2 py-1.5">
                            <FilterSelect full searchable value={line.design_id || ''}
                              onChange={v => {
                                const sel = designs.find(d => d.id === v)
                                updateOpeningLine(idx, 'design_id', v || null)
                                updateOpeningLine(idx, 'design_no', sel?.design_no || '')
                              }}
                              options={designs.map(d => ({ value: d.id, label: d.design_no }))}
                              data-master="design"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <FilterSelect full searchable value={line.color_id || ''}
                              onChange={v => {
                                const sel = colors.find(c => c.id === v)
                                updateOpeningLine(idx, 'color_id', v || null)
                                updateOpeningLine(idx, 'color', sel?.name || '')
                              }}
                              options={colors.map(c => ({ value: c.id, label: c.name }))}
                              data-master="color"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <FilterSelect full className="min-w-[70px]" value={line.size} onChange={v => updateOpeningLine(idx, 'size', v)}
                              options={SIZES.map(s => ({ value: s, label: s }))} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input data-field="qty" type="number" className="typo-input-sm text-right" value={line.qty} onChange={e => updateOpeningLine(idx, 'qty', e.target.value)} placeholder="0" min="1"
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const next = e.target.closest('tr').querySelector('[data-field="sale_rate"]'); if (next) next.focus() } }} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input data-field="sale_rate" type="number" className="typo-input-sm text-right" value={line.sale_rate} onChange={e => updateOpeningLine(idx, 'sale_rate', e.target.value)} placeholder="₹/pc" min="0" step="0.01"
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const next = e.target.closest('tr').querySelector('[data-field="mrp"]'); if (next) next.focus() } }} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input data-field="mrp" type="number" className="typo-input-sm text-right" value={line.mrp} onChange={e => updateOpeningLine(idx, 'mrp', e.target.value)} placeholder="₹/pc" min="0" step="0.01"
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const next = e.target.closest('tr').querySelector('[data-field="unit_cost"]'); if (next) next.focus() } }} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input data-field="unit_cost" type="number" className="typo-input-sm text-right" value={line.unit_cost} onChange={e => updateOpeningLine(idx, 'unit_cost', e.target.value)} placeholder="₹/pc" min="0" step="0.01"
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (idx === openingLines.length - 1) addOpeningLine(); else { const nextRow = e.target.closest('tr').nextElementSibling; if (nextRow) { const next = nextRow.querySelector('[data-field="design_no"]'); if (next) next.focus() } } } }} />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {status && (
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.cls}`}>{status.label}</span>
                            )}
                          </td>
                          <td className="px-1 py-1.5">
                            {openingLines.length > 1 && (
                              <button onClick={() => removeOpeningLine(idx)} className="text-gray-400 hover:text-red-500 transition-colors p-0.5">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                <p className="text-sm text-amber-700">
                  <strong>Opening Stock</strong> is for Day 1 setup — enter existing finished goods. SKUs are auto-created if they don't exist.
                  Unit cost is optional but recommended for accurate closing stock valuation. SKUs that already have opening stock will be skipped with an option to adjust.
                </p>
              </div>
            </div>
          )}
        </div>
        <QuickMasterModal type={quickMasterType} open={quickMasterOpen} onClose={closeQuickMaster} onCreated={onMasterCreated} />
      </div>
    )
  }

  // ── Purchase Overlay ──
  if (purchaseOpen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => { setPurchaseOpen(false); setPurchaseError(null) }} className="rounded-lg p-1.5 hover:bg-white/10 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div>
              <h2 className="text-lg font-bold">Purchase Ready Stock</h2>
              <p className="text-emerald-100 text-xs">Buy finished goods from supplier — creates SKUs + updates inventory</p>
            </div>
          </div>
          <button onClick={handlePurchaseSubmit} disabled={purchaseSaving}
            className="rounded-lg bg-white/20 hover:bg-white/30 px-5 py-2 typo-btn-sm text-white transition-colors disabled:opacity-50">
            {purchaseSaving ? 'Saving...' : 'Save & Stock In'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {purchaseError && <ErrorAlert message={purchaseError} onDismiss={() => setPurchaseError(null)} />}

          {/* Invoice Header */}
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <h3 className="typo-card-title mb-3">Invoice Details</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="sm:col-span-2">
                <label className="typo-label-sm">Supplier <span className="typo-required">*</span></label>
                <FilterSelect autoFocus searchable full value={purchaseHeader.supplier_id} onChange={v => setPurchaseHeader(p => ({ ...p, supplier_id: v }))}
                  options={[{ value: '', label: 'Select supplier...' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]} />
              </div>
              <div>
                <label className="typo-label-sm">Invoice No.</label>
                <input className="typo-input-sm" value={purchaseHeader.invoice_no} onChange={e => setPurchaseHeader(p => ({ ...p, invoice_no: e.target.value }))} placeholder="e.g. INV-001" />
              </div>
              <div>
                <label className="typo-label-sm">Challan No.</label>
                <input className="typo-input-sm" value={purchaseHeader.challan_no} onChange={e => setPurchaseHeader(p => ({ ...p, challan_no: e.target.value }))} placeholder="Optional" />
              </div>
              <div>
                <label className="typo-label-sm">Invoice Date</label>
                <input type="date" className="typo-input-sm" value={purchaseHeader.invoice_date} onChange={e => setPurchaseHeader(p => ({ ...p, invoice_date: e.target.value }))} />
              </div>
              <div>
                <label className="typo-label-sm">Sr. No.</label>
                <input className="typo-input-sm" value={purchaseHeader.sr_no} onChange={e => setPurchaseHeader(p => ({ ...p, sr_no: e.target.value }))} placeholder="Filing serial" />
              </div>
              <div>
                <label className="typo-label-sm">GST %</label>
                <FilterSelect full value={purchaseHeader.gst_percent} onChange={v => setPurchaseHeader(p => ({ ...p, gst_percent: v }))}
                  options={[{ value: '0', label: '0%' }, { value: '5', label: '5%' }, { value: '12', label: '12%' }, { value: '18', label: '18%' }, { value: '28', label: '28%' }]} />
              </div>
              <div>
                <label className="typo-label-sm">Notes</label>
                <input className="typo-input-sm" value={purchaseHeader.notes} onChange={e => setPurchaseHeader(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="typo-card-title">Line Items</h3>
              <button onClick={addLine} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 typo-btn-sm text-white hover:bg-emerald-700 shadow-sm transition-colors">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add Row
              </button>
            </div>
            <p className="typo-caption mb-3">
              Unit Price = cost per piece. Updates this SKU's <span className="font-semibold text-gray-600">Last Cost</span> (pricing reference). Valuation uses the weighted average across all purchases — history is preserved, nothing overwritten.
            </p>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-emerald-600">
                    <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider w-8 border-r border-emerald-500">#</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider border-r border-emerald-500">Type</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider border-r border-emerald-500">Design No.</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider border-r border-emerald-500">Color</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider border-r border-emerald-500">Size</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider border-r border-emerald-500">Qty</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider border-r border-emerald-500">Unit Price</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider border-r border-emerald-500">Total</th>
                    <th className="px-1 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseLines.map((line, idx) => {
                    const lineTotal = (parseInt(line.qty) || 0) * (parseFloat(line.unit_price) || 0)
                    return (
                      <tr key={idx} data-purchase-row className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="px-2 py-1.5 typo-td-secondary">{idx + 1}</td>
                        <td className="px-2 py-1.5">
                          <FilterSelect full value={line.product_type} onChange={v => updateLine(idx, 'product_type', v)}
                            options={ptOptions.length ? ptOptions : [{ value: 'FBL', label: 'FBL' }, { value: 'SBL', label: 'SBL' }, { value: 'LHG', label: 'LHG' }, { value: 'SAR', label: 'SAR' }]} />
                        </td>
                        <td className="px-2 py-1.5">
                          <FilterSelect full searchable value={line.design_id || ''}
                            onChange={v => {
                              const sel = designs.find(d => d.id === v)
                              updateLine(idx, 'design_id', v || null)
                              updateLine(idx, 'design_no', sel?.design_no || '')
                            }}
                            options={designs.map(d => ({ value: d.id, label: d.design_no }))}
                            data-master="design"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <FilterSelect full searchable value={line.color_id || ''}
                            onChange={v => {
                              const sel = colors.find(c => c.id === v)
                              updateLine(idx, 'color_id', v || null)
                              updateLine(idx, 'color', sel?.name || '')
                            }}
                            options={colors.map(c => ({ value: c.id, label: c.name }))}
                            data-master="color"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <FilterSelect full className="min-w-[70px]" value={line.size} onChange={v => updateLine(idx, 'size', v)}
                            options={SIZES.map(s => ({ value: s, label: s }))} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input data-field="qty" type="number" className="typo-input-sm text-right" value={line.qty} onChange={e => updateLine(idx, 'qty', e.target.value)} placeholder="0" min="1"
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const next = e.target.closest('tr').querySelector('[data-field="unit_price"]'); if (next) next.focus() } }} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input data-field="unit_price" type="number" className="typo-input-sm text-right" value={line.unit_price} onChange={e => updateLine(idx, 'unit_price', e.target.value)} placeholder="0.00" min="0" step="0.01"
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (idx === purchaseLines.length - 1) addLine(); else { const nextRow = e.target.closest('tr').nextElementSibling; if (nextRow) { const next = nextRow.querySelector('[data-field="design_no"]'); if (next) next.focus() } } } }} />
                        </td>
                        <td className="px-2 py-1.5 text-right typo-data">
                          {lineTotal > 0 ? `₹${lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className="px-1 py-1.5">
                          {purchaseLines.length > 1 && (
                            <button onClick={() => removeLine(idx)} className="text-gray-400 hover:text-red-500 transition-colors p-0.5">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-3 flex justify-end">
              <div className="w-56 space-y-1.5 border-t border-gray-200 pt-2">
                <div className="flex justify-between typo-td"><span>Subtotal</span><span>₹{purchaseSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between typo-td-secondary"><span>GST ({purchaseHeader.gst_percent}%)</span><span>₹{purchaseGstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between typo-data text-base border-t border-gray-200 pt-2"><span>Grand Total</span><span>₹{(purchaseSubtotal + purchaseGstAmt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              </div>
            </div>
          </div>
        </div>
        <QuickMasterModal type={quickMasterType} open={quickMasterOpen} onClose={closeQuickMaster} onCreated={onMasterCreated} />
      </div>
    )
  }

  // ── SKU Detail Overlay ──
  if (detailSKU) {
    const parsed = parseSKU(detailSKU.sku_code)
    const stock = detailSKU.stock || { total_qty: 0, available_qty: 0, reserved_qty: 0 }
    const batches = detailSKU.source_batches || []

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 text-white px-6 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => { setDetailSKU(null); setDetailError(null) }} className="rounded-lg p-1.5 hover:bg-white/10 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight">{parsed.base}</span>
                {parsed.vas.map(va => <span key={va} className="rounded px-1.5 py-0.5 text-xs font-bold bg-white/20">+{va}</span>)}
              </div>
              <span className="text-emerald-100 text-xs">{detailSKU.product_name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPrintSkus([detailSKU])}
              title="Print SKU label (A4)"
              className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/30 transition-colors flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              A4
            </button>
            <button onClick={() => setThermalSkus([detailSKU])}
              title="Print SKU label (54×40mm thermal — Ctrl+P)"
              className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/30 transition-colors flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" /></svg>
              Thermal
            </button>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${detailSKU.is_active ? 'bg-emerald-500/20 text-emerald-100' : 'bg-gray-500/20 text-gray-200'}`}>
              {detailSKU.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {detailError && <ErrorAlert message={detailError} onDismiss={() => setDetailError(null)} />}

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Stock', value: stock.total_qty, color: 'emerald' },
              { label: 'Available', value: stock.available_qty, color: 'green' },
              { label: 'Reserved', value: stock.reserved_qty, color: 'amber' },
              { label: 'Color', value: parsed.color, color: 'purple' },
              { label: 'Size', value: parsed.size || '—', color: 'gray' },
              { label: 'Type', value: parsed.type, color: 'gray' },
            ].map(k => (
              <div key={k.label} className="rounded-lg border bg-white px-3 py-2.5">
                <div className="typo-kpi-sm">{k.value}</div>
                <div className="typo-kpi-label mt-0.5">{k.label}</div>
              </div>
            ))}
          </div>

          {/* Identity editor — color, size (guarded by shipped status) */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="typo-card-title">SKU Identity</h3>
              {!detailSKU.is_identity_editable ? (
                <span className="typo-badge bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-lg">
                  Locked — shipped orders exist
                </span>
              ) : (
                <button onClick={handleSaveDetail} disabled={savingDetail}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 typo-btn-sm text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-colors">
                  {savingDetail ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="typo-label-sm">Design</label>
                {detailSKU.is_identity_editable ? (
                  <FilterSelect full searchable value={editFields.design_id}
                    onChange={v => setEditFields(p => ({ ...p, design_id: v }))}
                    options={[{ value: '', label: 'Select design...' }, ...designs.map(d => ({ value: d.id, label: d.design_no }))]} />
                ) : (
                  <div className="typo-input bg-gray-50 text-gray-500 cursor-not-allowed">{parsed.design}</div>
                )}
              </div>
              <div>
                <label className="typo-label-sm">Color</label>
                {detailSKU.is_identity_editable ? (
                  <FilterSelect full searchable value={editFields.color_id}
                    onChange={v => {
                      const sel = colors.find(c => c.id === v)
                      setEditFields(p => ({ ...p, color_id: v, color: sel?.name || p.color }))
                    }}
                    options={[{ value: '', label: 'Select color...' }, ...colors.map(c => ({ value: c.id, label: c.name }))]} />
                ) : (
                  <div className="typo-input bg-gray-50 text-gray-500 cursor-not-allowed">{parsed.color}</div>
                )}
              </div>
              <div>
                <label className="typo-label-sm">Size</label>
                {detailSKU.is_identity_editable ? (
                  <FilterSelect full value={editFields.size}
                    onChange={v => setEditFields(p => ({ ...p, size: v }))}
                    options={[{ value: '', label: 'Select size...' }, ...['XS','S','M','L','XL','XXL','3XL','4XL','Free'].map(s => ({ value: s, label: s }))]} />
                ) : (
                  <div className="typo-input bg-gray-50 text-gray-500 cursor-not-allowed">{parsed.size}</div>
                )}
              </div>
              <div>
                <label className="typo-label-sm">SKU Code</label>
                <div className="typo-input bg-gray-50 text-gray-500 cursor-not-allowed">{detailSKU.sku_code}</div>
                {(() => {
                  const newDesign = editFields.design_id !== detailSKU.design_id ? designs.find(d => d.id === editFields.design_id)?.design_no : null
                  const changed = editFields.color !== detailSKU.color || editFields.size !== detailSKU.size || newDesign
                  if (!detailSKU.is_identity_editable || !changed) return null
                  return <p className="text-xs text-emerald-600 mt-1">→ {parsed.type}-{newDesign || parsed.design}-{editFields.color}-{editFields.size}</p>
                })()}
              </div>
            </div>
          </div>

          {/* Pricing editor */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="typo-card-title">Pricing, Tax & Details</h3>
              <button onClick={handleSaveDetail} disabled={savingDetail}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 typo-btn-sm text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-colors">
                {savingDetail ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { key: 'base_price', label: 'Last Cost (₹)', type: 'number', placeholder: '0.00', hint: 'Latest stock-in cost — pricing reference' },
                { key: 'mrp', label: 'MRP (₹)', type: 'number', placeholder: '0.00' },
                { key: 'sale_rate', label: 'Sale Rate (₹)', type: 'number', placeholder: '0.00' },
                { key: 'stitching_cost', label: 'Stitching Cost/pc (₹)', type: 'number', placeholder: '0.00' },
                { key: 'other_cost', label: 'Other Cost/pc (₹)', type: 'number', placeholder: '0.00' },
                { key: 'hsn_code', label: 'HSN Code', type: 'text', placeholder: 'e.g. 6206' },
              ].map(f => (
                <div key={f.key}>
                  <label className="typo-label-sm">{f.label}</label>
                  <input type={f.type} className="typo-input" value={editFields[f.key]} onChange={e => setEditFields(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                  {f.key === 'base_price' && costHistory && costHistory.wac_per_piece > 0 && (
                    <div className="typo-caption mt-1">
                      Avg Cost (WAC): <span className="font-semibold text-emerald-700">₹{costHistory.wac_per_piece.toFixed(2)}</span>
                      <span className="text-gray-400"> · used for valuation</span>
                    </div>
                  )}
                  {f.key === 'base_price' && f.hint && (!costHistory || !(costHistory.wac_per_piece > 0)) && (
                    <div className="typo-caption mt-1 text-gray-400">{f.hint}</div>
                  )}
                </div>
              ))}
              <div>
                <label className="typo-label-sm">GST %</label>
                <FilterSelect full value={String(editFields.gst_percent)} onChange={v => setEditFields(p => ({ ...p, gst_percent: v }))}
                  options={[{ value: '', label: 'Select' }, { value: '0', label: '0%' }, { value: '5', label: '5%' }, { value: '12', label: '12%' }, { value: '18', label: '18%' }, { value: '28', label: '28%' }]} />
              </div>
              <div>
                <label className="typo-label-sm">Unit</label>
                <FilterSelect full value={editFields.unit} onChange={v => setEditFields(p => ({ ...p, unit: v }))}
                  options={[{ value: '', label: 'Select' }, { value: 'pcs', label: 'Pieces' }, { value: 'meters', label: 'Meters' }, { value: 'kg', label: 'Kg' }]} />
              </div>
              <div className="sm:col-span-2">
                <label className="typo-label-sm">Description</label>
                <input className="typo-input" value={editFields.description} onChange={e => setEditFields(p => ({ ...p, description: e.target.value }))} placeholder="Product description..." />
              </div>
            </div>
          </div>

          {/* Batch-wise Cost History */}
          {costHistory && costHistory.batches && costHistory.batches.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="typo-card-title">Cost History <span className="text-gray-400 font-normal">({costHistory.total_batches} batch{costHistory.total_batches !== 1 ? 'es' : ''}, {costHistory.total_pieces} pcs)</span></h3>
                {costHistory.wac_per_piece > 0 && (
                  <span className="typo-badge bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg">
                    WAC: {'\u20B9'}{costHistory.wac_per_piece.toFixed(2)}/pc
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500 border-b">
                      <th className="px-3 py-2 font-medium">Batch</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium text-right">Pcs</th>
                      <th className="px-3 py-2 font-medium text-right">Material</th>
                      <th className="px-3 py-2 font-medium text-right">Roll VA</th>
                      <th className="px-3 py-2 font-medium text-right">Stitching</th>
                      <th className="px-3 py-2 font-medium text-right">Batch VA</th>
                      <th className="px-3 py-2 font-medium text-right">Other</th>
                      <th className="px-3 py-2 font-medium text-right">Cost/pc</th>
                      <th className="px-3 py-2 font-medium text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costHistory.batches.map((b, i) => {
                      const z = 'text-gray-300'
                      const cv = (v) => v > 0 ? `\u20B9${v.toFixed(2)}` : <span className={z}>0</span>
                      return (
                        <tr key={i} className={`border-b last:border-0 hover:bg-gray-50 ${b.rate_pending ? 'bg-amber-50/50' : ''}`}>
                          <td className="px-3 py-2 font-semibold text-emerald-600">{b.batch_code}</td>
                          <td className="px-3 py-2 text-gray-500">{b.date ? new Date(b.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
                          <td className="px-3 py-2 text-right">{b.pieces}</td>
                          <td className="px-3 py-2 text-right">{cv(b.material_cost)}</td>
                          <td className="px-3 py-2 text-right">{cv(b.roll_va_cost)}</td>
                          <td className="px-3 py-2 text-right">
                            {b.rate_pending
                              ? <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">Pending</span>
                              : cv(b.stitching_cost)
                            }
                          </td>
                          <td className="px-3 py-2 text-right">{cv(b.batch_va_cost)}</td>
                          <td className="px-3 py-2 text-right">{cv(b.other_cost)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{b.rate_pending ? <span className="text-amber-500">—</span> : `\u20B9${b.total_cost_per_piece.toFixed(2)}`}</td>
                          <td className="px-3 py-2 text-right font-medium text-emerald-700">{b.rate_pending ? <span className="text-amber-500">—</span> : `\u20B9${b.line_total.toLocaleString('en-IN')}`}</td>
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-gray-300 font-bold text-sm">
                      <td className="px-3 py-2" colSpan={2}>WAC (Weighted Average)</td>
                      <td className="px-3 py-2 text-right">{costHistory.total_pieces}</td>
                      <td className="px-3 py-2 text-right" colSpan={5}></td>
                      <td className="px-3 py-2 text-right text-emerald-700">{'\u20B9'}{costHistory.wac_per_piece.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{'\u20B9'}{costHistory.total_cost.toLocaleString('en-IN')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                <p className="text-xs text-gray-500">
                  <strong>Cost/pc</strong> = Material + Roll VA + Stitching + Batch VA + Other.
                  Stitching &amp; Other rates read from SKU at pack time.
                  {costHistory.current_stitching_cost != null && <> Current stitching: <strong>{'\u20B9'}{costHistory.current_stitching_cost}</strong>/pc.</>}
                  {costHistory.current_other_cost != null && <> Other: <strong>{'\u20B9'}{costHistory.current_other_cost}</strong>/pc.</>}
                </p>
              </div>
            </div>
          )}

          {/* Source Batches */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="typo-card-title mb-3">Source Batches <span className="text-gray-400 font-normal">({batches.length})</span></h3>
            {batches.length === 0 ? (
              <p className="typo-empty italic">No linked batches — this SKU was created manually or via purchase.</p>
            ) : (
              <div className="space-y-2">
                {batches.map(b => (
                  <div key={b.id} className="rounded-lg border border-gray-200 p-3 hover:border-gray-300 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="typo-data">{b.batch_code}</span>
                        <StatusBadge status={b.status} />
                        {b.size && <span className="typo-badge bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{b.size}</span>}
                      </div>
                      <span className="typo-caption">{b.piece_count} pcs</span>
                    </div>
                    {b.lot && <div className="typo-caption">Lot: <span className="font-medium text-gray-700">{b.lot.lot_code}</span> · Design: <span className="font-medium text-gray-700">{b.design_no}</span></div>}
                    {b.tailor && <div className="typo-caption">Tailor: <span className="font-medium text-gray-700">{b.tailor.full_name}</span></div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Open Demand */}
          {openDemand && openDemand.orders && openDemand.orders.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="typo-card-title mb-3">
                Open Demand <span className="text-gray-400 font-normal">({openDemand.total_orders} order{openDemand.total_orders !== 1 ? 's' : ''} · {openDemand.total_outstanding} pc{openDemand.total_outstanding !== 1 ? 's' : ''} outstanding)</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left border-b">
                      <th className="px-3 py-2 typo-th">Order</th>
                      <th className="px-3 py-2 typo-th">Date</th>
                      <th className="px-3 py-2 typo-th">Customer</th>
                      <th className="px-3 py-2 typo-th">Status</th>
                      <th className="px-3 py-2 typo-th text-right">Ordered</th>
                      <th className="px-3 py-2 typo-th text-right">Shipped</th>
                      <th className="px-3 py-2 typo-th text-right">Short</th>
                      <th className="px-3 py-2 typo-th text-right">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openDemand.orders.map((d) => (
                      <tr key={d.order_id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <a href={`/orders?open=${d.order_id}`} className="font-medium text-emerald-700 hover:text-emerald-900 hover:underline">{d.order_number}</a>
                        </td>
                        <td className="px-3 py-2 typo-td-secondary">{d.order_date ? new Date(d.order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</td>
                        <td className="px-3 py-2 typo-td">{d.customer_name}</td>
                        <td className="px-3 py-2"><StatusBadge status={d.status} /></td>
                        <td className="px-3 py-2 text-right typo-td">{d.ordered_qty}</td>
                        <td className="px-3 py-2 text-right typo-td-secondary">{d.fulfilled_qty}</td>
                        <td className={`px-3 py-2 text-right ${d.short_qty > 0 ? 'text-red-600 font-semibold' : 'typo-td-secondary'}`}>{d.short_qty}</td>
                        <td className="px-3 py-2 text-right font-semibold text-amber-600">{d.outstanding_qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Inventory History */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="typo-card-title mb-3">Inventory History <span className="text-gray-400 font-normal">({skuEvents.length})</span></h3>
            {skuEvents.length === 0 ? (
              <p className="typo-empty italic">No inventory events recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left border-b">
                      <th className="px-3 py-2 typo-th">Date</th>
                      <th className="px-3 py-2 typo-th">Event</th>
                      <th className="px-3 py-2 typo-th">Source</th>
                      <th className="px-3 py-2 typo-th">Reference</th>
                      <th className="px-3 py-2 typo-th text-right">Qty</th>
                      <th className="px-3 py-2 typo-th text-right">Cost/pc</th>
                      <th className="px-3 py-2 typo-th">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skuEvents.map((evt) => {
                      const isIn = evt.event_type === 'adjustment' ? evt.quantity > 0 : ['stock_in', 'return', 'ready_stock_in', 'opening_stock'].includes(evt.event_type)
                      const evtLabel = {
                        opening_stock: 'Opening Stock',
                        ready_stock_in: 'Stock In',
                        stock_in: 'Stock In',
                        stock_out: 'Stock Out',
                        loss: 'Loss',
                        return: 'Return',
                        adjustment: 'Adjustment',
                      }[evt.event_type] || evt.event_type
                      const evtColor = {
                        opening_stock: 'bg-amber-100 text-amber-700',
                        ready_stock_in: 'bg-green-100 text-green-700',
                        stock_in: 'bg-green-100 text-green-700',
                        stock_out: 'bg-red-100 text-red-700',
                        loss: 'bg-red-100 text-red-700',
                        return: 'bg-blue-100 text-blue-700',
                        adjustment: 'bg-purple-100 text-purple-700',
                      }[evt.event_type] || 'bg-gray-100 text-gray-700'
                      const sourceLabel = {
                        opening_stock: 'Day 1 Entry',
                        purchase_item: 'Purchase',
                        shipment: 'Shipment',
                        manual_adjustment: 'Manual',
                        batch_pack: 'Batch Pack',
                      }[evt.reference_type] || evt.reference_type || '—'
                      const unitCost = evt.metadata?.unit_cost
                      const ref = evt.reference
                      const refDeepLink = ref?.kind === 'shipment' && ref?.order_id
                        ? `/orders?open=${ref.order_id}`
                        : ref?.kind === 'batch' && ref?.batch_id
                        ? `/batches?open=${ref.batch_id}`
                        : null
                      return (
                        <tr key={evt.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-3 py-2 typo-td-secondary">{evt.performed_at ? new Date(evt.performed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${evtColor}`}>{evtLabel}</span>
                          </td>
                          <td className="px-3 py-2 typo-td">{sourceLabel}</td>
                          <td className="px-3 py-2 typo-td">
                            {ref ? (
                              <div className="flex flex-col">
                                {refDeepLink ? (
                                  <a href={refDeepLink} className="font-medium text-emerald-700 hover:text-emerald-900 hover:underline">{ref.code}</a>
                                ) : (
                                  <span className="font-medium text-gray-800">{ref.code}</span>
                                )}
                                {ref.extra && <span className="text-[11px] text-gray-500">{ref.extra}</span>}
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className={`px-3 py-2 text-right font-semibold ${isIn ? 'text-green-600' : 'text-red-600'}`}>
                            {isIn ? '+' : '−'}{Math.abs(evt.quantity)}
                          </td>
                          <td className="px-3 py-2 text-right typo-td-secondary">{unitCost ? `₹${parseFloat(unitCost).toFixed(2)}` : '—'}</td>
                          <td className="px-3 py-2 typo-td-secondary">{evt.performed_by?.full_name || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        {/* Print overlays nested inside detail so ESC/Close returns here, not the list */}
        {printSkus && (
          <SKULabelSheet skus={printSkus} onClose={() => setPrintSkus(null)} />
        )}
        {thermalSkus && (
          <ThermalLabelSheet
            type="sku"
            items={thermalSkus}
            onClose={() => setThermalSkus(null)}
          />
        )}
      </div>
    )
  }

  // ── Purchase Invoice Detail ──
  if (piDetail) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 text-white px-6 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => setPiDetail(null)} className="rounded-lg p-1.5 hover:bg-white/10 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
              <h2 className="text-lg font-bold">Purchase Invoice {piDetail.invoice_no || ''}</h2>
              <p className="text-emerald-100 text-xs">{piDetail.supplier?.name || 'Unknown'} · {piDetail.item_count} items</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Invoice No.', value: piDetail.invoice_no || '—' },
              { label: 'Challan No.', value: piDetail.challan_no || '—' },
              { label: 'Date', value: piDetail.invoice_date ? new Date(piDetail.invoice_date).toLocaleDateString('en-IN') : '—' },
              { label: 'Total Amount', value: `₹${parseFloat(piDetail.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
            ].map(k => (
              <div key={k.label} className="rounded-lg border bg-white px-3 py-2.5">
                <div className="typo-kpi-sm">{k.value}</div>
                <div className="typo-kpi-label mt-0.5">{k.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="typo-section-title mb-3">Purchased Items</h3>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="typo-th text-left py-2">SKU Code</th>
                  <th className="typo-th text-left py-2">Color</th>
                  <th className="typo-th text-left py-2">Size</th>
                  <th className="typo-th text-right py-2">Qty</th>
                  <th className="typo-th text-right py-2">Unit Price</th>
                  <th className="typo-th text-right py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {(piDetail.items || []).map((item, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 typo-data">{item.sku_code}</td>
                    <td className="py-2 typo-td">{item.color}</td>
                    <td className="py-2 typo-td">{item.size}</td>
                    <td className="py-2 typo-td text-right">{item.quantity}</td>
                    <td className="py-2 typo-td text-right">₹{parseFloat(item.unit_price).toLocaleString('en-IN')}</td>
                    <td className="py-2 typo-data text-right">₹{parseFloat(item.total_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // ── Main List View ──
  const TABS = [
    { key: 'skus', label: 'All SKUs' },
    { key: 'cost_breakdown', label: 'Cost Breakdown' },
    { key: 'purchases', label: 'Purchase Invoices' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="typo-page-title">Finished Goods</h1>
          <p className="mt-0.5 typo-caption">SKUs are auto-generated when batches are packed</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openOpening} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 typo-btn-sm text-amber-700 hover:bg-amber-100 transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
            Opening Stock
          </button>
          <button onClick={openPurchase} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 typo-btn-sm text-white hover:bg-emerald-700 shadow-sm transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Purchase Ready Stock
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total SKUs', value: summary.total_skus.toLocaleString('en-IN'), cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          { label: 'In Stock', value: summary.in_stock_skus.toLocaleString('en-IN'), cls: 'bg-green-50 border-green-200 text-green-700' },
          { label: 'Total Pieces', value: summary.total_pieces.toLocaleString('en-IN'), cls: 'bg-purple-50 border-purple-200 text-purple-700' },
          { label: 'Auto-Generated', value: summary.auto_generated.toLocaleString('en-IN'), cls: 'bg-teal-50 border-teal-200 text-teal-700' },
        ].map(k => (
          <div key={k.label} className={`rounded-lg border px-4 py-3 ${k.cls}`}>
            <div className="typo-kpi-sm">{k.value}</div>
            <div className="typo-kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="mt-5 flex gap-6 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`pb-2.5 typo-tab transition-colors ${activeTab === t.key ? 'border-b-2 border-emerald-600 text-emerald-700 font-bold' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'skus' && (
        <>
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <div className="w-64">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search SKU code, color, size..." />
            </div>
            <FilterSelect value={filterType} onChange={setFilterType}
              options={[{ value: '', label: 'All Types' }, ...productTypes.map(t => ({ value: t.code, label: t.code }))]} />
            <FilterSelect value={filterStock} onChange={setFilterStock}
              options={[{ value: '', label: 'All Stock' }, { value: 'in_stock', label: 'In Stock' }, { value: 'out_of_stock', label: 'Out of Stock' }]} />
            {(filterType || filterStock) && (
              <button onClick={() => { setFilterType(''); setFilterStock('') }} className="typo-caption hover:text-gray-700 underline">Clear</button>
            )}
          </div>

          {error && <div className="mt-3"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

          <div className="mt-3">
            {loading ? (
              <div className="flex items-center justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" /></div>
            ) : groupedSKUs.length === 0 ? (
              <div className="text-center py-12 typo-empty">No SKUs found. Pack batches to auto-generate SKUs.</div>
            ) : (
              <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="bg-emerald-600 text-white text-left">
                      <th className="px-3 py-2.5 font-semibold w-10"></th>
                      <th className="px-3 py-2.5 font-semibold w-[25%]">Design</th>
                      <th className="px-3 py-2.5 font-semibold w-[18%]">Colors</th>
                      <th className="px-3 py-2.5 font-semibold w-[14%]">Sizes</th>
                      <th className="px-3 py-2.5 font-semibold w-[8%]">Type</th>
                      <th className="px-3 py-2.5 font-semibold w-[12%]">Sale Rate</th>
                      <th className="px-3 py-2.5 font-semibold w-[15%]">Stock</th>
                      <th className="px-3 py-2.5 font-semibold w-[8%] text-right">SKUs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedSKUs.map((group) => {
                      const isExpanded = expandedGroups.has(group.design_key)
                      return (
                        <Fragment key={group.design_key}>
                          <tr onClick={() => toggleGroup(group.design_key)}
                            className={`border-b border-gray-100 cursor-pointer transition-colors ${isExpanded ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                            <td className="px-3 py-2.5 text-center">
                              <svg className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </td>
                            <td className="px-3 py-2.5 typo-data font-bold text-emerald-700">{group.design_key}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1 flex-wrap">
                                {group.colors.slice(0, 6).map(c => (
                                  <span key={c} className="w-4 h-4 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: colorHex(c) }} title={c} />
                                ))}
                                {group.colors.length > 6 && <span className="typo-caption">+{group.colors.length - 6}</span>}
                                <span className="typo-caption ml-1">({group.colors.length})</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 typo-td">{group.sizes.join(', ')}</td>
                            <td className="px-3 py-2.5 typo-td-secondary">{group.product_type}</td>
                            <td className="px-3 py-2.5 typo-td">
                              {group.price_min > 0
                                ? group.price_min === group.price_max
                                  ? `₹${group.price_min.toLocaleString('en-IN')}`
                                  : `₹${group.price_min.toLocaleString('en-IN')} – ₹${group.price_max.toLocaleString('en-IN')}`
                                : <span className="typo-caption">Not set</span>}
                            </td>
                            <td className="px-3 py-2.5">
                              <StockIndicator stock={{ total_qty: group.total_qty, available_qty: group.available_qty, reserved_qty: group.reserved_qty }} />
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <span className="inline-flex items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{group.sku_count}</span>
                            </td>
                          </tr>
                          {isExpanded && group.skus.map((sku, sIdx) => (
                            <tr key={sku.id} onClick={() => openDetail(sku)}
                              className={`border-b border-gray-50 cursor-pointer transition-colors hover:bg-emerald-50/40 ${sIdx % 2 === 0 ? 'bg-gray-50/50' : 'bg-white'}`}>
                              <td className="px-3 py-2"></td>
                              <td className="px-3 py-2 pl-8 typo-td">{sku.sku_code}</td>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: colorHex(sku.color) }} />
                                  <span className="typo-td">{sku.color}</span>
                                </span>
                              </td>
                              <td className="px-3 py-2 typo-data">{sku.size}</td>
                              <td className="px-3 py-2 typo-td-secondary">{sku.product_type}</td>
                              <td className="px-3 py-2 typo-td">{(() => {
                                const p = parseFloat(sku.sale_rate || sku.mrp || sku.base_price || 0)
                                return p > 0 ? `₹${p.toLocaleString('en-IN')}` : <span className="typo-caption">Set rate</span>
                              })()}</td>
                              <td className="px-3 py-2"><StockIndicator stock={sku.stock} /></td>
                              <td className="px-3 py-2 text-right">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${sku.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{sku.is_active ? 'Active' : 'Inactive'}</span>
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={page} pages={pages} total={total} onChange={setPage} />
          </div>
        </>
      )}

      {activeTab === 'cost_breakdown' && (
        <div className="mt-4">
          <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
            {/* Info header */}
            <div className="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600">
              <h3 className="text-white font-bold">SKU Cost Breakdown</h3>
              <p className="text-emerald-100 text-xs mt-0.5">Cost per piece = Material + Roll VA + Stitching + Batch VA + Other</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500 border-b">
                    <th className="px-3 py-3 w-10"></th>
                    <th className="px-3 py-3 typo-th w-[20%]">Design / SKU</th>
                    <th className="px-3 py-3 typo-th w-[6%]">Type</th>
                    <th className="px-3 py-3 typo-th w-[9%] text-right">Material</th>
                    <th className="px-3 py-3 typo-th w-[8%] text-right">Roll VA</th>
                    <th className="px-3 py-3 typo-th w-[9%] text-right">Stitching</th>
                    <th className="px-3 py-3 typo-th w-[8%] text-right">Batch VA</th>
                    <th className="px-3 py-3 typo-th w-[8%] text-right">Other</th>
                    <th className="px-3 py-3 typo-th w-[10%] text-right">Cost/pc</th>
                    <th className="px-3 py-3 typo-th w-[10%] text-right">Sale Rate</th>
                    <th className="px-3 py-3 typo-th w-[8%] text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedSKUs.map((group) => {
                    const isExp = expandedGroups.has(group.design_key)
                    const avgCost = group.skus.length ? group.skus.reduce((s, sk) => s + parseFloat(sk.base_price || 0), 0) / group.skus.length : 0
                    return (
                      <Fragment key={group.design_key}>
                        <tr onClick={() => toggleGroup(group.design_key)}
                          className={`border-b border-gray-100 cursor-pointer transition-colors ${isExp ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-3 py-2.5 text-center">
                            <svg className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isExp ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </td>
                          <td className="px-3 py-2.5 typo-data font-bold text-emerald-700 truncate">{group.design_key} <span className="text-gray-400 font-normal text-xs">({group.sku_count} SKUs)</span></td>
                          <td className="px-3 py-2.5 typo-td-secondary">{group.product_type}</td>
                          <td className="px-3 py-2.5"></td>
                          <td className="px-3 py-2.5"></td>
                          <td className="px-3 py-2.5 text-right typo-caption" title={`${group.colors.length} colors × ${group.sizes.length} sizes`}>{group.colors.length}c × {group.sizes.length}s</td>
                          <td className="px-3 py-2.5"></td>
                          <td className="px-3 py-2.5"></td>
                          <td className="px-3 py-2.5 text-right typo-td font-semibold">{avgCost > 0 ? `₹${avgCost.toFixed(2)}` : '—'}</td>
                          <td className="px-3 py-2.5"></td>
                          <td className="px-3 py-2.5"></td>
                        </tr>
                        {isExp && group.skus.map((s, sIdx) => {
                          const bp = parseFloat(s.base_price || 0)
                          const stitch = parseFloat(s.stitching_cost || 0)
                          const oth = parseFloat(s.other_cost || 0)
                          const sr = parseFloat(s.sale_rate || 0)
                          const mat = bp > 0 ? Math.max(0, bp - stitch - oth) : 0
                          const mgn = sr > 0 && bp > 0 ? Math.round(((sr - bp) / sr) * 100) : null
                          const fR = (v) => v > 0 ? `₹${v.toFixed(2)}` : '₹0'
                          const zs = 'text-gray-300'
                          return (
                            <tr key={s.id} className={`border-b border-gray-50 hover:bg-emerald-50/40 ${sIdx % 2 === 0 ? 'bg-gray-50/50' : 'bg-white'}`}>
                              <td className="px-3 py-2"></td>
                              <td className="px-3 py-2 pl-8 font-semibold text-emerald-600">{s.sku_code}</td>
                              <td className="px-3 py-2 typo-td-secondary">{s.product_type}</td>
                              <td className={`px-3 py-2 text-right ${mat === 0 ? zs : ''}`}>{fR(mat)}</td>
                              <td className={`px-3 py-2 text-right ${zs}`}>{fR(0)}</td>
                              <td className={`px-3 py-2 text-right ${stitch === 0 ? zs : ''}`}>{fR(stitch)}</td>
                              <td className={`px-3 py-2 text-right ${zs}`}>{fR(0)}</td>
                              <td className={`px-3 py-2 text-right ${oth === 0 ? zs : ''}`}>{fR(oth)}</td>
                              <td className="px-3 py-2 text-right font-semibold">{bp > 0 ? fR(bp) : <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Not set</span>}</td>
                              <td className={`px-3 py-2 text-right ${sr === 0 ? zs : ''}`}>{fR(sr)}</td>
                              <td className="px-3 py-2 text-right">
                                {mgn !== null
                                  ? <span className={`font-medium ${mgn >= 30 ? 'text-emerald-600' : mgn >= 15 ? 'text-amber-600' : 'text-red-600'}`}>{mgn}%</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {groupedSKUs.length === 0 && <p className="typo-empty py-8 text-center">No SKUs found.</p>}
          </div>
          <Pagination page={page} pages={pages} total={total} onChange={setPage} />

          {/* Formula note */}
          <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
            <p className="text-xs font-semibold text-gray-600 mb-1">Cost Formula (per piece)</p>
            <p className="text-xs text-gray-500">
              <strong>Total Cost</strong> = Material (fabric weight &times; rate / pieces) + Roll VA (embroidery, dying) + Stitching (tailor charges) + Batch VA (handstitch, buttons) + Other (thread, lining, packing, misc)
            </p>
            <p className="text-xs text-gray-400 mt-1">Material &amp; VA costs auto-computed at pack time from lot&rarr;roll chain and challan records. Stitching &amp; Other are set per SKU — edit on SKU detail to update.</p>
          </div>
        </div>
      )}

      {activeTab === 'purchases' && (
        <div className="mt-4">
          <DataTable columns={PURCHASE_COLUMNS} data={purchaseInvoices} loading={piLoading} onRowClick={(row) => setPiDetail(row)}
            emptyText="No purchase invoices yet. Use 'Purchase Ready Stock' to buy finished goods." />
          <Pagination page={piPage} pages={piPages} total={piTotal} onChange={setPiPage} />
        </div>
      )}

      {/* SKU Label Print Sheet (A4) */}
      {printSkus && (
        <SKULabelSheet skus={printSkus} onClose={() => setPrintSkus(null)} />
      )}
      {/* SKU Label Print Sheet (thermal 54x40mm) */}
      {thermalSkus && (
        <ThermalLabelSheet
          type="sku"
          items={thermalSkus}
          onClose={() => setThermalSkus(null)}
        />
      )}

      <QuickMasterModal type={quickMasterType} open={quickMasterOpen} onClose={closeQuickMaster} onCreated={onMasterCreated} />
    </div>
  )
}
