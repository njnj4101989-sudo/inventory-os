import { useState, useEffect, useCallback, useMemo } from 'react'
import { getSKUs, getSKU, createSKU, updateSKU, purchaseStock, getPurchaseInvoices, getSKUCostHistory, createSKUOpeningStock } from '../api/skus'
import { adjust, getEvents } from '../api/inventory'
import { getSuppliers } from '../api/suppliers'
import { getAllProductTypes, getAllColors } from '../api/masters'
import { colorHex, loadColorMap } from '../utils/colorUtils'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import ErrorAlert from '../components/common/ErrorAlert'
import StatusBadge from '../components/common/StatusBadge'
import FilterSelect from '../components/common/FilterSelect'
import SKULabelSheet from '../components/common/SKULabelSheet'

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
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-green-500'}`} />
        <span className="typo-data">{available_qty}</span>
        <span className="typo-caption">/ {total_qty}</span>
      </div>
      {reserved_qty > 0 && <span className="text-yellow-600 text-[10px]">{reserved_qty} reserved</span>}
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
  { key: 'base_price', label: 'Price', render: (val) => val && val > 0 ? <span className="typo-td">₹{parseFloat(val).toLocaleString('en-IN')}</span> : <span className="typo-caption">Set price</span> },
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
    return (
      <tr className="border-b border-gray-100 bg-green-50">
        <td className="px-3 py-2 typo-data">{skipped.sku_code}</td>
        <td className="px-3 py-2 text-right typo-td">{skipped.existing_qty}</td>
        <td className="px-3 py-2 text-right typo-data text-green-700">+{skipped.adjusted_qty}</td>
        <td className="px-3 py-2 text-center"><span className="text-green-600 text-xs font-semibold">Adjusted</span></td>
      </tr>
    )
  }
  return (
    <tr className="border-b border-gray-100">
      <td className="px-3 py-2 typo-data">{skipped.sku_code}</td>
      <td className="px-3 py-2 text-right typo-td">{skipped.existing_qty}</td>
      <td className="px-3 py-2 text-right">
        <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
          className="typo-input-sm text-right w-20" placeholder="0" />
      </td>
      <td className="px-3 py-2 text-center">
        <button onClick={async () => { setSaving(true); await onAdjust(skipped, qty); setSaving(false) }}
          disabled={saving || !qty || parseInt(qty) <= 0}
          className="rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors">
          {saving ? '...' : 'Adjust'}
        </button>
      </td>
    </tr>
  )
}

const SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'Free']
const EMPTY_LINE = { product_type: 'FBL', design_no: '', color: '', size: 'S', qty: '', unit_price: '' }
const EMPTY_OPENING = { product_type: 'FBL', design_no: '', color: '', size: 'S', qty: '', unit_cost: '' }

export default function SKUsPage() {
  const [activeTab, setActiveTab] = useState('skus')

  // SKU list state
  const [skus, setSKUs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterType, setFilterType] = useState('')
  const [filterStock, setFilterStock] = useState('')

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
      const res = await getSKUs({ page, page_size: 50, search: search || undefined })
      setSKUs(res.data.data); setTotal(res.data.total); setPages(res.data.pages)
    } catch (err) { setError(err.response?.data?.detail || 'Failed to load SKUs') }
    finally { setLoading(false) }
  }, [page, search])

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
  useEffect(() => { if (activeTab === 'purchases') fetchPurchaseInvoices() }, [activeTab, fetchPurchaseInvoices])

  // Load masters for purchase form
  useEffect(() => {
    async function loadMasters() {
      try {
        const [supRes, ptRes, colRes] = await Promise.all([
          getSuppliers({ is_active: true }),
          getAllProductTypes(),
          getAllColors(),
        ])
        setSuppliers((supRes.data.data || supRes.data || []).filter(s => s.is_active !== false))
        setProductTypes(ptRes.data.data || ptRes.data || [])
        setColors(colRes.data.data || colRes.data || [])
      } catch (err) { console.error('Failed to load masters', err) }
    }
    loadMasters()
  }, [])

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

  const [costHistory, setCostHistory] = useState(null)
  const [skuEvents, setSkuEvents] = useState([])

  // SKU detail
  const openDetail = async (row) => {
    setDetailLoading(true); setDetailError(null); setCostHistory(null); setSkuEvents([])
    try {
      const [skuRes, costRes, evtRes] = await Promise.all([
        getSKU(row.id),
        getSKUCostHistory(row.id).catch(() => null),
        getEvents(row.id, { page_size: 100 }).catch(() => null),
      ])
      const sku = skuRes.data.data || skuRes.data
      setDetailSKU(sku)
      setEditFields({
        base_price: sku.base_price ?? '', description: sku.description || '',
        hsn_code: sku.hsn_code || '', gst_percent: sku.gst_percent ?? '',
        mrp: sku.mrp ?? '', sale_rate: sku.sale_rate ?? '', unit: sku.unit || '',
        stitching_cost: sku.stitching_cost ?? '', other_cost: sku.other_cost ?? '',
      })
      if (costRes) setCostHistory(costRes.data.data)
      if (evtRes) setSkuEvents(evtRes.data.data || [])
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
    // Focus design_no input of new row after render
    setTimeout(() => {
      const rows = document.querySelectorAll('[data-purchase-row]')
      const lastRow = rows[rows.length - 1]
      if (lastRow) {
        const designInput = lastRow.querySelector('input[data-field="design_no"]')
        if (designInput) designInput.focus()
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
    const validLines = purchaseLines.filter(l => l.design_no && l.color && l.size && parseInt(l.qty) > 0 && parseFloat(l.unit_price) > 0)
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
          color: l.color,
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
      const res = await getSKUs({ page_size: 9999 })
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
    if (!line.design_no || !line.color) return null
    const code = `${line.product_type}-${line.design_no}-${line.color}-${line.size}`
    const existing = allSkuCodes.get(code)
    if (!existing) return { type: 'new', label: 'New', cls: 'bg-green-100 text-green-700' }
    if (existing.total_qty > 0) return { type: 'has_stock', label: `Has ${existing.total_qty} pcs`, cls: 'bg-amber-100 text-amber-700' }
    return { type: 'exists', label: 'Exists', cls: 'bg-blue-100 text-blue-700' }
  }, [allSkuCodes])

  const handleOpeningSubmit = async () => {
    const validLines = openingLines.filter(l => l.design_no && l.color && parseInt(l.qty) > 0)
    if (validLines.length === 0) { setOpeningError('Add at least one valid row (design, color, qty)'); return }
    setOpeningSaving(true); setOpeningError(null)
    try {
      const res = await createSKUOpeningStock({
        line_items: validLines.map(l => ({
          product_type: l.product_type,
          design_no: l.design_no,
          color: l.color,
          size: l.size,
          qty: parseInt(l.qty),
          unit_cost: l.unit_cost ? parseFloat(l.unit_cost) : null,
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
    if (!adjustQty || parseInt(adjustQty) <= 0) return
    try {
      await adjust({
        sku_id: skipped.sku_id,
        event_type: 'adjustment',
        quantity: parseInt(adjustQty),
        reason: 'Opening stock adjustment',
      })
      setOpeningResult(prev => ({
        ...prev,
        skipped: prev.skipped.map(s => s.sku_id === skipped.sku_id ? { ...s, adjusted: true, adjusted_qty: parseInt(adjustQty) } : s),
      }))
      fetchSKUs()
    } catch (err) { setOpeningError(err.response?.data?.detail || 'Adjust failed') }
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
                            <FilterSelect full value={line.product_type} onChange={v => updateOpeningLine(idx, 'product_type', v)}
                              options={ptOptions.length ? ptOptions : [{ value: 'FBL', label: 'FBL' }, { value: 'SBL', label: 'SBL' }, { value: 'LHG', label: 'LHG' }, { value: 'SAR', label: 'SAR' }]} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input data-field="design_no" data-master="design" className="typo-input-sm" value={line.design_no} onChange={e => updateOpeningLine(idx, 'design_no', e.target.value)}
                              placeholder="e.g. 702" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const next = e.target.closest('tr').querySelector('[data-field="color"]'); if (next) next.focus() } }} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input data-field="color" className="typo-input-sm" value={line.color} onChange={e => updateOpeningLine(idx, 'color', e.target.value)} placeholder="e.g. Red"
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const next = e.target.closest('tr').querySelector('[data-field="qty"]'); if (next) next.focus() } }} />
                          </td>
                          <td className="px-2 py-1.5">
                            <FilterSelect full className="min-w-[70px]" value={line.size} onChange={v => updateOpeningLine(idx, 'size', v)}
                              options={SIZES.map(s => ({ value: s, label: s }))} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input data-field="qty" type="number" className="typo-input-sm text-right" value={line.qty} onChange={e => updateOpeningLine(idx, 'qty', e.target.value)} placeholder="0" min="1"
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="typo-card-title">Line Items</h3>
              <button onClick={addLine} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 typo-btn-sm text-white hover:bg-emerald-700 shadow-sm transition-colors">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add Row
              </button>
            </div>

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
                          <input data-field="design_no" data-master="design" className="typo-input-sm" value={line.design_no} onChange={e => updateLine(idx, 'design_no', e.target.value)}
                            placeholder="e.g. 702" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const next = e.target.closest('tr').querySelector('[data-field="color"]'); if (next) next.focus() } }} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input data-field="color" className="typo-input-sm" value={line.color} onChange={e => updateLine(idx, 'color', e.target.value)} placeholder="e.g. Red"
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const next = e.target.closest('tr').querySelector('[data-field="qty"]'); if (next) next.focus() } }} />
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
            <button onClick={() => { setPrintSkus([detailSKU]); setDetailSKU(null) }}
              className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/30 transition-colors flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print Label
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
                { key: 'base_price', label: 'Base Price (₹)', type: 'number', placeholder: '0.00' },
                { key: 'mrp', label: 'MRP (₹)', type: 'number', placeholder: '0.00' },
                { key: 'sale_rate', label: 'Sale Rate (₹)', type: 'number', placeholder: '0.00' },
                { key: 'stitching_cost', label: 'Stitching Cost/pc (₹)', type: 'number', placeholder: '0.00' },
                { key: 'other_cost', label: 'Other Cost/pc (₹)', type: 'number', placeholder: '0.00' },
                { key: 'hsn_code', label: 'HSN Code', type: 'text', placeholder: 'e.g. 6206' },
              ].map(f => (
                <div key={f.key}>
                  <label className="typo-label-sm">{f.label}</label>
                  <input type={f.type} className="typo-input" value={editFields[f.key]} onChange={e => setEditFields(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
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
                      <th className="px-3 py-2 font-medium text-right">Total/pc</th>
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

          {/* Inventory History */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="typo-card-title mb-3">Inventory History <span className="text-gray-400 font-normal">({skuEvents.length})</span></h3>
            {skuEvents.length === 0 ? (
              <p className="typo-empty italic">No inventory events recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500 border-b">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Event</th>
                      <th className="px-3 py-2 font-medium">Source</th>
                      <th className="px-3 py-2 font-medium text-right">Qty</th>
                      <th className="px-3 py-2 font-medium text-right">Cost/pc</th>
                      <th className="px-3 py-2 font-medium">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skuEvents.map((evt) => {
                      const isIn = ['stock_in', 'return', 'ready_stock_in', 'opening_stock', 'adjustment'].includes(evt.event_type)
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
                      return (
                        <tr key={evt.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-500">{evt.performed_at ? new Date(evt.performed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${evtColor}`}>{evtLabel}</span>
                          </td>
                          <td className="px-3 py-2 text-gray-600">{sourceLabel}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${isIn ? 'text-green-600' : 'text-red-600'}`}>
                            {isIn ? '+' : '−'}{evt.quantity}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">{unitCost ? `₹${parseFloat(unitCost).toFixed(2)}` : '—'}</td>
                          <td className="px-3 py-2 text-gray-500">{evt.performed_by?.full_name || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
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
          { label: 'Total SKUs', value: kpis.totalSKUs, cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          { label: 'In Stock', value: kpis.inStock, cls: 'bg-green-50 border-green-200 text-green-700' },
          { label: 'Total Pieces', value: kpis.totalPieces.toLocaleString('en-IN'), cls: 'bg-purple-50 border-purple-200 text-purple-700' },
          { label: 'Auto-Generated', value: kpis.autoGenerated, cls: 'bg-teal-50 border-teal-200 text-teal-700' },
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
            <DataTable columns={SKU_COLUMNS} data={filteredSKUs} loading={loading || detailLoading} onRowClick={openDetail}
              emptyText="No SKUs found. Pack batches to auto-generate SKUs." />
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500 border-b">
                    <th className="px-4 py-3 font-medium">SKU Code</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium text-right">Material</th>
                    <th className="px-4 py-3 font-medium text-right">Roll VA</th>
                    <th className="px-4 py-3 font-medium text-right">Stitching</th>
                    <th className="px-4 py-3 font-medium text-right">Batch VA</th>
                    <th className="px-4 py-3 font-medium text-right">Other</th>
                    <th className="px-4 py-3 font-medium text-right">Total Cost/pc</th>
                    <th className="px-4 py-3 font-medium text-right">Sale Rate</th>
                    <th className="px-4 py-3 font-medium text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSKUs.map((row) => {
                    const s = row
                    const bp = s.base_price || 0
                    const stitch = s.stitching_cost || 0
                    const other = s.other_cost || 0
                    const sr = s.sale_rate || 0
                    // Material approximation: base_price - stitching - other (when no event breakdown)
                    const material = bp > 0 ? Math.max(0, bp - stitch - other) : 0
                    const margin = sr > 0 && bp > 0 ? Math.round(((sr - bp) / sr) * 100) : null
                    const fmtR = (v) => v > 0 ? `\u20B9${v.toFixed(2)}` : '\u20B90'
                    const zeroStyle = 'text-gray-300'
                    return (
                      <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-semibold text-emerald-600">{s.sku_code}</td>
                        <td className="px-4 py-2.5">{s.product_type}</td>
                        <td className={`px-4 py-2.5 text-right ${material === 0 ? zeroStyle : ''}`}>{fmtR(material)}</td>
                        <td className={`px-4 py-2.5 text-right ${zeroStyle}`}>{fmtR(0)}</td>
                        <td className={`px-4 py-2.5 text-right ${stitch === 0 ? zeroStyle : ''}`}>{fmtR(stitch)}</td>
                        <td className={`px-4 py-2.5 text-right ${zeroStyle}`}>{fmtR(0)}</td>
                        <td className={`px-4 py-2.5 text-right ${other === 0 ? zeroStyle : ''}`}>{fmtR(other)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{bp > 0 ? fmtR(bp) : <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Not set</span>}</td>
                        <td className={`px-4 py-2.5 text-right ${sr === 0 ? zeroStyle : ''}`}>{fmtR(sr)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {margin !== null
                            ? <span className={`font-medium ${margin >= 30 ? 'text-emerald-600' : margin >= 15 ? 'text-amber-600' : 'text-red-600'}`}>{margin}%</span>
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filteredSKUs.length === 0 && <p className="typo-empty py-8 text-center">No SKUs found.</p>}
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

      {/* SKU Label Print Sheet */}
      {printSkus && (
        <SKULabelSheet skus={printSkus} onClose={() => setPrintSkus(null)} />
      )}
    </div>
  )
}
