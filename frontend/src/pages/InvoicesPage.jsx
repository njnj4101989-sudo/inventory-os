import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useReactToPrint } from 'react-to-print'
import { getInvoices, getInvoice, markPaid, cancelInvoice, createInvoice, createInvoiceFromOrder, updateInvoice } from '../api/invoices'
import { getSalesReturns, getSalesReturn } from '../api/salesReturns'
import { getReturnNotes, getReturnNote } from '../api/returns'
import DebitNotePrint from '../components/common/DebitNotePrint'
import { getSKUs } from '../api/skus'
import { getAllCustomers } from '../api/customers'
import { getCompany } from '../api/company'
import CreditNotePrint from '../components/common/CreditNotePrint'
import FilterSelect from '../components/common/FilterSelect'
import { colorHex, loadColorMap } from '../utils/colorUtils'
import DataTable from '../components/common/DataTable'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'
import SearchInput from '../components/common/SearchInput'
import { useAuth } from '../hooks/useAuth'
import useQuickMaster from '../hooks/useQuickMaster'
import QuickMasterModal from '../components/common/QuickMasterModal'

/* ── Module-level helpers ── */

const VA_COLORS = {
  EMB: { bg: 'bg-purple-100', text: 'text-purple-700' },
  DYE: { bg: 'bg-amber-100', text: 'text-amber-700' },
  DPT: { bg: 'bg-sky-100', text: 'text-sky-700' },
  HWK: { bg: 'bg-rose-100', text: 'text-rose-700' },
  SQN: { bg: 'bg-pink-100', text: 'text-pink-700' },
  BTC: { bg: 'bg-teal-100', text: 'text-teal-700' },
}
const DEFAULT_VA = { bg: 'bg-gray-100', text: 'text-gray-700' }

function parseSKU(code) {
  if (!code) return { base: '', vas: [] }
  const plusIdx = code.indexOf('+')
  const basePart = plusIdx > -1 ? code.slice(0, plusIdx) : code
  const vas = plusIdx > -1 ? code.slice(plusIdx + 1).split('+').filter(Boolean) : []
  return { base: basePart, vas }
}

function SKUCodeDisplay({ code }) {
  const { base, vas } = parseSKU(code)
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className="font-semibold text-gray-800">{base}</span>
      {vas.map(va => {
        const c = VA_COLORS[va] || DEFAULT_VA
        return <span key={va} className={`rounded px-1 py-0.5 typo-badge leading-none ${c.bg} ${c.text}`}>+{va}</span>
      })}
    </span>
  )
}

const KPI_COLORS = {
  slate: 'from-slate-500 to-slate-600',
  amber: 'from-amber-500 to-amber-600',
  green: 'from-green-500 to-green-600',
  emerald: 'from-emerald-500 to-emerald-600',
  red: 'from-red-500 to-red-600',
  blue: 'from-blue-500 to-blue-600',
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

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtCurrency = (v) => `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/* ── DataTable columns ── */

const COLUMNS = [
  { key: 'invoice_number', label: 'Invoice #', render: (val) => <span className="font-semibold text-emerald-700">{val}</span> },
  { key: 'customer_name', label: 'Customer', render: (val) => val || <span className="text-gray-400">—</span> },
  { key: 'order', label: 'Type', render: (val) => val ? (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 typo-badge bg-blue-100 text-blue-700">{val.order_number}</span>
  ) : (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 typo-badge bg-purple-100 text-purple-700">Direct</span>
  )},
  { key: 'total_amount', label: 'Total', render: (val) => <span className="font-bold">{fmtCurrency(val)}</span> },
  { key: 'due_date', label: 'Due', render: (val) => val ? fmtDate(val + 'T00:00:00') : <span className="text-gray-300">—</span> },
  { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
  { key: 'issued_at', label: 'Issued', render: (val) => fmtDate(val) },
]

const TABS = [
  { key: '', label: 'All' },
  { key: 'issued', label: 'Unpaid' },
  { key: 'paid', label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' },
]

const GST_OPTIONS = [
  { value: '0', label: '0%' }, { value: '5', label: '5%' },
  { value: '12', label: '12%' }, { value: '18', label: '18%' }, { value: '28', label: '28%' },
]

export default function InvoicesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { company } = useAuth()
  const [invoicesList, setInvoicesList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Company full data (with bank details)
  const [companyFull, setCompanyFull] = useState(null)

  // Create mode
  const [createMode, setCreateMode] = useState(false)
  const [customers, setCustomers] = useState([])
  const [allSKUs, setAllSKUs] = useState([])
  const [invForm, setInvForm] = useState({ customer_id: '', gst_percent: '0', discount_amount: '', payment_terms: '', place_of_supply: '', notes: '' })
  const [invItems, setInvItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [isDirty, setIsDirty] = useState(false)
  const [showDiscard, setShowDiscard] = useState(false)

  // Quick master for customer Shift+M
  const { quickMasterType, quickMasterOpen, closeQuickMaster, onMasterCreated } = useQuickMaster(
    (type, newItem) => {
      if (type === 'customer') {
        setCustomers(prev => [...prev, newItem])
        setInvForm(f => ({ ...f, customer_id: newItem.id }))
      }
    }
  )

  // Detail overlay
  const [detailInvoice, setDetailInvoice] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actioning, setActioning] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  // Credit Notes tab
  const [viewMode, setViewMode] = useState(searchParams.get('tab') || 'invoices') // invoices | credit_notes
  const [cnList, setCnList] = useState([])
  const [cnTotal, setCnTotal] = useState(0)
  const [cnPage, setCnPage] = useState(1)
  const [cnPages, setCnPages] = useState(1)
  const [cnSearch, setCnSearch] = useState('')
  const [cnLoading, setCnLoading] = useState(false)
  const [cnDetail, setCnDetail] = useState(null)
  const [cnDetailLoading, setCnDetailLoading] = useState(false)
  const [printCreditNote, setPrintCreditNote] = useState(null)

  // Debit Notes tab
  const [dnList, setDnList] = useState([])
  const [dnTotal, setDnTotal] = useState(0)
  const [dnPage, setDnPage] = useState(1)
  const [dnPages, setDnPages] = useState(1)
  const [dnSearch, setDnSearch] = useState('')
  const [dnLoading, setDnLoading] = useState(false)
  const [dnDetail, setDnDetail] = useState(null)
  const [dnDetailLoading, setDnDetailLoading] = useState(false)
  const [printDebitNote, setPrintDebitNote] = useState(null)

  // Print overlay
  const [printInvoice, setPrintInvoice] = useState(null)
  const printRef = useRef(null)

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: printInvoice ? `Invoice-${printInvoice.invoice_number}` : 'Invoice',
    pageStyle: `
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #000; }
      tr { page-break-inside: avoid; }
      thead { display: table-header-group; }
    `,
  })

  useEffect(() => { loadColorMap() }, [])
  useEffect(() => { getCompany().then(r => setCompanyFull(r.data?.data || r.data)).catch(() => {}) }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getInvoices({ page, page_size: 20, status: statusFilter || undefined, search: search || undefined })
      setInvoicesList(res.data.data)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load invoices')
    } finally { setLoading(false) }
  }, [page, statusFilter, search])

  useEffect(() => { fetchData() }, [fetchData])

  /* ── Credit notes fetch ── */
  const fetchCreditNotes = useCallback(async () => {
    setCnLoading(true)
    try {
      const res = await getSalesReturns({ page: cnPage, page_size: 20, status: 'closed', search: cnSearch || undefined })
      const items = (res.data?.data || []).filter(sr => sr.credit_note_no)
      setCnList(items)
      setCnTotal(res.data?.total || 0)
      setCnPages(res.data?.pages || 1)
    } catch { setCnList([]) }
    finally { setCnLoading(false) }
  }, [cnPage, cnSearch])

  useEffect(() => { if (viewMode === 'credit_notes') fetchCreditNotes() }, [viewMode, fetchCreditNotes])

  /* ── Debit notes fetch ── */
  const fetchDebitNotes = useCallback(async () => {
    setDnLoading(true)
    try {
      const res = await getReturnNotes({ page: dnPage, page_size: 20, status: 'closed', search: dnSearch || undefined })
      const items = (res.data?.data || []).filter(rn => rn.debit_note_no)
      setDnList(items)
      setDnTotal(res.data?.total || 0)
      setDnPages(res.data?.pages || 1)
    } catch { setDnList([]) }
    finally { setDnLoading(false) }
  }, [dnPage, dnSearch])

  useEffect(() => { if (viewMode === 'debit_notes') fetchDebitNotes() }, [viewMode, fetchDebitNotes])

  /* ── Deep-link: ?open=<invoiceId> → auto-open detail ── */
  useEffect(() => {
    const openId = searchParams.get('open')
    if (!openId) return
    searchParams.delete('open')
    setSearchParams(searchParams, { replace: true })
    ;(async () => {
      setDetailLoading(true)
      try {
        const res = await getInvoice(openId)
        setDetailInvoice(res.data.data || res.data)
      } catch { /* ignore — invoice may not exist */ }
      finally { setDetailLoading(false) }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const all = invoicesList
    const unpaid = all.filter(i => i.status === 'issued')
    const paid = all.filter(i => i.status === 'paid')
    const cancelled = all.filter(i => i.status === 'cancelled')
    const today = new Date().toISOString().slice(0, 7)
    const overdue = all.filter(i => i.status === 'issued' && i.due_date && new Date(i.due_date + 'T00:00:00') < new Date())
    const thisMonth = all.filter(i => i.issued_at && i.issued_at.slice(0, 7) === today && i.status !== 'cancelled')
    return {
      total: all.length,
      unpaidCount: unpaid.length,
      unpaidAmt: unpaid.reduce((s, i) => s + (i.total_amount || 0), 0),
      paidCount: paid.length,
      paidAmt: paid.reduce((s, i) => s + (i.total_amount || 0), 0),
      cancelledCount: cancelled.length,
      overdueCount: overdue.length,
      monthRevenue: thisMonth.reduce((s, i) => s + (i.total_amount || 0), 0),
    }
  }, [invoicesList])

  /* ── Row click → detail overlay ── */
  const handleRowClick = async (row) => {
    setDetailLoading(true)
    setDetailInvoice(row)
    try {
      const res = await getInvoice(row.id)
      setDetailInvoice(res.data.data || res.data)
    } catch { /* fallback to list data */ } finally { setDetailLoading(false) }
  }

  /* ── CN row click ── */
  const handleCnRowClick = async (row) => {
    setCnDetailLoading(true)
    setCnDetail(row)
    try {
      const res = await getSalesReturn(row.id)
      setCnDetail(res.data?.data || res.data)
    } catch { /* fallback */ }
    finally { setCnDetailLoading(false) }
  }

  /* ── DN row click ── */
  const handleDnRowClick = async (row) => {
    setDnDetailLoading(true)
    setDnDetail(row)
    try {
      const res = await getReturnNote(row.id)
      setDnDetail(res.data?.data || res.data)
    } catch { /* fallback */ }
    finally { setDnDetailLoading(false) }
  }

  /* ── Mark paid ── */
  const handleMarkPaid = async () => {
    setActioning(true)
    try { await markPaid(detailInvoice.id); setDetailInvoice(null); fetchData() }
    catch (err) { setError(err.response?.data?.detail || 'Failed to mark paid') }
    finally { setActioning(false) }
  }

  /* ── Cancel invoice ── */
  const handleCancelInvoice = async () => {
    setActioning(true)
    try { await cancelInvoice(detailInvoice.id); setDetailInvoice(null); setConfirmCancel(false); fetchData() }
    catch (err) { setError(err.response?.data?.detail || 'Failed to cancel') }
    finally { setActioning(false) }
  }

  /* ── Create standalone invoice ── */
  const openCreate = async () => {
    setCreateMode(true)
    setInvForm({ customer_id: '', gst_percent: '0', discount_amount: '', payment_terms: '', place_of_supply: '', notes: '' })
    setInvItems([{ sku_id: '', quantity: 1, unit_price: 0 }])
    setFormError(null)
    setIsDirty(false)
    try {
      const [skuRes, custRes] = await Promise.all([getSKUs({ is_active: true, page_size: 0 }), getAllCustomers()])
      setAllSKUs(skuRes.data.data || [])
      setCustomers(custRes.data.data || [])
    } catch { setAllSKUs([]); setCustomers([]) }
  }

  const closeCreate = () => {
    if (isDirty) { setShowDiscard(true); return }
    setCreateMode(false)
  }

  const handleCreateInvoice = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const validItems = invItems.filter(it => it.sku_id && it.quantity > 0)
      if (!validItems.length) { setFormError('Add at least one item'); setSaving(false); return }
      if (!invForm.customer_id) { setFormError('Select a customer'); setSaving(false); return }
      const cust = customers.find(c => c.id === invForm.customer_id)
      await createInvoice({
        customer_id: invForm.customer_id,
        customer_name: cust?.name || null,
        customer_phone: cust?.phone || null,
        customer_address: cust?.city ? `${cust.city}${cust.state ? ', ' + cust.state : ''}` : null,
        gst_percent: parseFloat(invForm.gst_percent) || 0,
        discount_amount: parseFloat(invForm.discount_amount) || 0,
        payment_terms: invForm.payment_terms?.trim() || null,
        place_of_supply: invForm.place_of_supply?.trim() || null,
        items: validItems.map(it => ({ sku_id: it.sku_id, quantity: it.quantity, unit_price: it.unit_price })),
        notes: invForm.notes?.trim() || null,
      })
      setCreateMode(false)
      setIsDirty(false)
      fetchData()
    } catch (err) { setFormError(err.response?.data?.detail || 'Failed to create invoice') }
    finally { setSaving(false) }
  }

  const addInvItem = () => { setInvItems(prev => [...prev, { sku_id: '', quantity: 1, unit_price: 0 }]); setIsDirty(true) }
  const removeInvItem = (i) => { setInvItems(prev => prev.filter((_, idx) => idx !== i)); setIsDirty(true) }
  const updateInvItem = (i, field, val) => { setInvItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it)); setIsDirty(true) }

  /* ── Keyboard shortcuts for create mode ── */
  useEffect(() => {
    if (!createMode) return
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleCreateInvoice() }
      if (e.key === 'Escape') { if (quickMasterOpen) return; e.preventDefault(); closeCreate() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createMode, isDirty, invForm, invItems, quickMasterOpen])

  /* ── Open print overlay ── */
  const openPrint = () => { const inv = detailInvoice; setDetailInvoice(null); setPrintInvoice(inv) }

  const co = companyFull || company || {}

  /* ═══════════════════════ DEBIT NOTE PRINT ═══════════════════════ */
  if (printDebitNote) return <DebitNotePrint note={printDebitNote} company={co} onClose={() => setPrintDebitNote(null)} />

  /* ═══════════════════════ DEBIT NOTE DETAIL ═══════════════════════ */
  if (dnDetail) {
    const dn = dnDetail
    const isRoll = dn.return_type === 'roll_return'
    const gstPct = dn.gst_percent || 0
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-auto">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="typo-modal-title text-white leading-tight">{dn.debit_note_no}</h1>
            <p className="text-xs text-emerald-100">Debit Note &middot; Against {dn.return_note_no}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setPrintDebitNote(dn); setDnDetail(null) }}
              className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors">Print</button>
            <button onClick={() => setDnDetail(null)}
              className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors">Close</button>
          </div>
        </div>

        {dnDetailLoading ? (
          <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>
        ) : (
          <div className="flex-1 p-4 max-w-5xl mx-auto w-full space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Debit To (Supplier)</p>
                <p className="typo-data">{dn.supplier?.name || '—'}</p>
                {dn.supplier?.phone && <p className="text-xs text-gray-600 mt-0.5">Phone: {dn.supplier.phone}</p>}
                {dn.supplier?.gst_no && <p className="text-xs text-gray-600 mt-0.5 font-medium">GSTIN: {dn.supplier.gst_no}</p>}
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Reference</p>
                <p className="typo-data">{dn.return_note_no}</p>
                <p className="text-xs text-gray-600 mt-0.5">{isRoll ? 'Roll Return' : 'SKU Return'}</p>
                {dn.dispatch_date && <p className="text-xs text-gray-600 mt-0.5">Dispatched: {fmtDate(dn.dispatch_date)}</p>}
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Debit Amount</p>
                <p className="typo-kpi-sm text-emerald-600">{fmtCurrency(dn.total_amount)}</p>
                {gstPct > 0 && <p className="text-xs text-gray-600 mt-0.5">GST {gstPct}% (₹{(dn.tax_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })})</p>}
              </div>
            </div>

            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-3 py-2 typo-th">#</th>
                    {isRoll ? (<>
                      <th className="text-left px-3 py-2 typo-th">Roll Code</th>
                      <th className="text-left px-3 py-2 typo-th">Fabric</th>
                      <th className="text-left px-3 py-2 typo-th">Color</th>
                      <th className="text-right px-3 py-2 typo-th">Weight</th>
                    </>) : (<>
                      <th className="text-left px-3 py-2 typo-th">SKU</th>
                      <th className="text-left px-3 py-2 typo-th">Description</th>
                      <th className="text-left px-3 py-2 typo-th">Size</th>
                      <th className="text-right px-3 py-2 typo-th">Qty</th>
                    </>)}
                    <th className="text-right px-3 py-2 typo-th">Rate</th>
                    <th className="text-right px-3 py-2 typo-th">Amount</th>
                    <th className="text-left px-3 py-2 typo-th">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {dn.items?.map((item, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2 typo-td-secondary">{i + 1}</td>
                      {isRoll ? (<>
                        <td className="px-3 py-2 typo-td font-semibold">{item.roll?.roll_code || '—'}</td>
                        <td className="px-3 py-2 typo-td-secondary">{item.roll?.fabric_type || '—'}</td>
                        <td className="px-3 py-2 typo-td-secondary">{item.roll?.color?.name || '—'}</td>
                        <td className="px-3 py-2 typo-td text-right font-semibold">{item.weight || '—'}</td>
                      </>) : (<>
                        <td className="px-3 py-2 typo-td font-semibold">{item.sku?.sku_code || '—'}</td>
                        <td className="px-3 py-2 typo-td-secondary">{item.sku?.product_name || '—'}</td>
                        <td className="px-3 py-2 typo-td font-semibold">{item.sku?.size || '—'}</td>
                        <td className="px-3 py-2 typo-td text-right font-semibold">{item.quantity}</td>
                      </>)}
                      <td className="px-3 py-2 typo-td-secondary text-right">{fmtCurrency(item.unit_price)}</td>
                      <td className="px-3 py-2 typo-td text-right font-semibold">{fmtCurrency(item.amount)}</td>
                      <td className="px-3 py-2 typo-td-secondary">{item.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <div className="w-64 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-semibold">{fmtCurrency(dn.subtotal)}</span></div>
                {gstPct > 0 && (<>
                  <div className="flex justify-between"><span className="text-gray-500">CGST ({gstPct / 2}%)</span><span>{fmtCurrency((dn.tax_amount || 0) / 2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">SGST ({gstPct / 2}%)</span><span>{fmtCurrency((dn.tax_amount || 0) / 2)}</span></div>
                </>)}
                <div className="flex justify-between pt-1 border-t-2 border-emerald-600 font-bold text-base"><span>Debit Amount</span><span>{fmtCurrency(dn.total_amount)}</span></div>
              </div>
            </div>

            {dn.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800"><strong>Notes:</strong> {dn.notes}</div>
            )}
          </div>
        )}
      </div>
    )
  }

  /* ═══════════════════════ CREDIT NOTE PRINT ═══════════════════════ */
  if (printCreditNote) return <CreditNotePrint salesReturn={printCreditNote} company={co} onClose={() => setPrintCreditNote(null)} />

  /* ═══════════════════════ CREDIT NOTE DETAIL ═══════════════════════ */
  if (cnDetail) {
    const cn = cnDetail
    const gstPct = cn.gst_percent || 0
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-auto">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="typo-modal-title text-white leading-tight">{cn.credit_note_no}</h1>
            <p className="text-xs text-emerald-100">Credit Note &middot; Against {cn.srn_no}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setPrintCreditNote(cn); setCnDetail(null) }}
              className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors">Print</button>
            <button onClick={() => setCnDetail(null)}
              className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors">Close</button>
          </div>
        </div>

        {cnDetailLoading ? (
          <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>
        ) : (
          <div className="flex-1 p-4 max-w-5xl mx-auto w-full space-y-3">
            {/* Info cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Credit To</p>
                <p className="typo-data">{cn.customer?.name || '—'}</p>
                {cn.customer?.phone && <p className="text-xs text-gray-600 mt-0.5">Phone: {cn.customer.phone}</p>}
                {cn.customer?.gst_no && <p className="text-xs text-gray-600 mt-0.5 font-medium">GSTIN: {cn.customer.gst_no}</p>}
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Reference</p>
                <p className="typo-data">{cn.srn_no}</p>
                {cn.order && <p className="text-xs text-gray-600 mt-0.5">Order: {cn.order.order_number}</p>}
                <p className="text-xs text-gray-600 mt-0.5">Return Date: {fmtDate(cn.return_date)}</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Amount</p>
                <p className="typo-kpi-sm text-emerald-600">{fmtCurrency(cn.total_amount)}</p>
                {gstPct > 0 && <p className="text-xs text-gray-600 mt-0.5">GST {gstPct}% (₹{((cn.tax_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })})</p>}
              </div>
            </div>

            {/* Items table */}
            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-3 py-2 typo-th">#</th>
                    <th className="text-left px-3 py-2 typo-th">SKU</th>
                    <th className="text-left px-3 py-2 typo-th">Description</th>
                    <th className="text-left px-3 py-2 typo-th">Size</th>
                    <th className="text-right px-3 py-2 typo-th">Qty</th>
                    <th className="text-right px-3 py-2 typo-th">Rate</th>
                    <th className="text-right px-3 py-2 typo-th">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {cn.items?.map((item, i) => {
                    const qty = item.quantity_restocked || item.quantity_returned || 0
                    const price = item.unit_price || item.order_item?.unit_price || 0
                    return (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 typo-td-secondary">{i + 1}</td>
                        <td className="px-3 py-2 typo-td font-semibold">{item.sku?.sku_code || '—'}</td>
                        <td className="px-3 py-2 typo-td-secondary">{item.sku?.product_name || '—'}</td>
                        <td className="px-3 py-2 typo-td font-semibold">{item.sku?.size || '—'}</td>
                        <td className="px-3 py-2 typo-td text-right font-semibold">{qty}</td>
                        <td className="px-3 py-2 typo-td-secondary text-right">{fmtCurrency(price)}</td>
                        <td className="px-3 py-2 typo-td text-right font-semibold">{fmtCurrency(qty * price)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-semibold">{fmtCurrency(cn.subtotal)}</span></div>
                {gstPct > 0 && (<>
                  <div className="flex justify-between"><span className="text-gray-500">CGST ({gstPct / 2}%)</span><span>{fmtCurrency((cn.tax_amount || 0) / 2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">SGST ({gstPct / 2}%)</span><span>{fmtCurrency((cn.tax_amount || 0) / 2)}</span></div>
                </>)}
                <div className="flex justify-between pt-1 border-t-2 border-emerald-600 font-bold text-base"><span>Credit Amount</span><span>{fmtCurrency(cn.total_amount)}</span></div>
              </div>
            </div>

            {cn.reason_summary && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800"><strong>Reason:</strong> {cn.reason_summary}</div>
            )}
          </div>
        )}
      </div>
    )
  }

  /* ═══════════════════════ PRINT OVERLAY ═══════════════════════ */
  // Amount in words (Indian numbering)
  const amountInWords = (num) => {
    if (!num || num === 0) return 'Zero'
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
    const convert = (n) => {
      if (n === 0) return ''
      if (n < 20) return ones[n] + ' '
      if (n < 100) return tens[Math.floor(n / 10)] + ' ' + ones[n % 10] + ' '
      if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred ' + convert(n % 100)
      if (n < 100000) return convert(Math.floor(n / 1000)) + 'Thousand ' + convert(n % 1000)
      if (n < 10000000) return convert(Math.floor(n / 100000)) + 'Lakh ' + convert(n % 100000)
      return convert(Math.floor(n / 10000000)) + 'Crore ' + convert(n % 10000000)
    }
    const rupees = Math.floor(num)
    const paise = Math.round((num - rupees) * 100)
    let result = 'Rupees ' + convert(rupees).trim()
    if (paise > 0) result += ' and ' + convert(paise).trim() + ' Paise'
    return result + ' Only'
  }

  if (printInvoice) {
    const inv = printInvoice
    const isIGST = inv.place_of_supply && co.state_code && inv.place_of_supply !== co.state_code
    const totalQty = (inv.items || []).reduce((s, it) => s + (it.quantity || 0), 0)
    const itemCount = inv.items?.length || 0
    const padCount = Math.max(0, 20 - itemCount)

    const IS = {
      th: { padding: '3px 5px', fontSize: '7.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1.5px solid #000', borderRight: '1px solid #ccc', background: '#f0f0f0', color: '#000' },
      thLast: { padding: '3px 5px', fontSize: '7.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1.5px solid #000', background: '#f0f0f0', color: '#000' },
      td: { padding: '2px 5px', fontSize: '10px', borderBottom: '1px solid #ccc', borderRight: '1px solid #ccc' },
      tdLast: { padding: '2px 5px', fontSize: '10px', borderBottom: '1px solid #ccc' },
      secLabel: { fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 3px' },
    }

    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center overflow-auto py-4">
        <div className="w-full max-w-[220mm] mb-3 flex items-center justify-between bg-white rounded-xl px-5 py-3 shadow-lg mx-4">
          <span className="font-semibold text-gray-800">Invoice {inv.invoice_number}</span>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="rounded-lg bg-emerald-600 text-white px-4 py-2 typo-btn-sm hover:bg-emerald-700 transition-colors">Print</button>
            <button onClick={() => setPrintInvoice(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">Close</button>
          </div>
        </div>

        <div ref={printRef} style={{ width: '210mm', background: '#fff', padding: '12mm', fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", color: '#000', fontSize: '10px', lineHeight: '1.4' }} className="shadow-2xl rounded-lg mb-6">

          {/* ═══ HEADER ═══ */}
          <div style={{ borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, letterSpacing: '-0.3px' }}>TAX INVOICE</h1>
              <p style={{ fontSize: '13px', fontWeight: 700, margin: '2px 0 0' }}>{co.name || 'Company'}</p>
              {co.address && <p style={{ fontSize: '10px', margin: '1px 0 0' }}>{co.address}{co.city ? `, ${co.city}` : ''}{co.state ? `, ${co.state}` : ''}{co.pin_code ? ` - ${co.pin_code}` : ''}</p>}
              {co.gst_no && <p style={{ fontSize: '10px', margin: '1px 0 0' }}>GSTIN: <strong>{co.gst_no}</strong>{co.state_code ? ` | State: ${co.state_code}` : ''}</p>}
              {(co.phone || co.email) && <p style={{ fontSize: '10px', margin: '1px 0 0' }}>{co.phone ? `Ph: ${co.phone}` : ''}{co.email ? ` | ${co.email}` : ''}</p>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>{inv.invoice_number}</p>
              <p style={{ fontSize: '10px', margin: '2px 0' }}>Date: {fmtDate(inv.issued_at)}</p>
              <p style={{ fontSize: '10px', margin: '1px 0' }}>{inv.order?.order_number ? `Order: ${inv.order.order_number}` : 'Direct Sale'}{inv.shipment?.shipment_no ? ` · ${inv.shipment.shipment_no}` : ''}</p>
              {inv.due_date && <p style={{ fontSize: '10px', margin: '1px 0' }}>Due: {fmtDate(inv.due_date + 'T00:00:00')}</p>}
            </div>
          </div>

          {/* ═══ BILL TO + DISPATCH ═══ */}
          <div style={{ display: 'flex', border: '1px solid #000', marginBottom: '10px' }}>
            <div style={{ flex: 1, padding: '6px 8px', borderRight: '1px solid #000' }}>
              <p style={IS.secLabel}>Bill To</p>
              <p style={{ fontSize: '12px', fontWeight: 700, margin: 0 }}>{inv.customer_name || '—'}</p>
              {inv.customer_phone && <p style={{ fontSize: '10px', margin: '1px 0 0' }}>Ph: {inv.customer_phone}</p>}
              {inv.customer_address && <p style={{ fontSize: '10px', margin: '1px 0 0' }}>{inv.customer_address}</p>}
              {inv.customer_gst_no && <p style={{ fontSize: '10px', fontWeight: 600, margin: '1px 0 0' }}>GSTIN: {inv.customer_gst_no}</p>}
              {inv.place_of_supply && <p style={{ fontSize: '10px', margin: '1px 0 0' }}>Place of Supply: {inv.place_of_supply}</p>}
            </div>
            <div style={{ flex: 1, padding: '6px 8px' }}>
              <p style={IS.secLabel}>Dispatch & Transport</p>
              {inv.transport_detail && <p style={{ fontSize: '10px', margin: '1px 0' }}>Transport: <strong>{inv.transport_detail.name}</strong></p>}
              {inv.lr_number && <p style={{ fontSize: '10px', margin: '1px 0' }}>L.R. No.: <strong>{inv.lr_number}</strong>{inv.lr_date ? ` | Date: ${fmtDate(inv.lr_date + 'T00:00:00')}` : ''}</p>}
              {inv.broker && <p style={{ fontSize: '10px', margin: '1px 0' }}>Broker: <strong>{inv.broker.name}</strong></p>}
              {inv.payment_terms && <p style={{ fontSize: '10px', margin: '1px 0' }}>Terms: {inv.payment_terms}</p>}
              {!inv.transport_detail && !inv.lr_number && !inv.broker && <p style={{ fontSize: '10px', margin: '1px 0' }}>—</p>}
            </div>
          </div>

          {/* Notes */}
          {inv.notes && (
            <div style={{ border: '1px solid #000', padding: '4px 8px', marginBottom: '10px', fontSize: '10px' }}>
              <strong>Notes:</strong> {inv.notes}
            </div>
          )}

          {/* ═══ LINE ITEMS ═══ */}
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginBottom: '0' }}>
            <thead>
              <tr>
                <th style={{ ...IS.th, width: '24px', textAlign: 'center' }}>#</th>
                <th style={{ ...IS.th, textAlign: 'left' }}>SKU Code</th>
                <th style={{ ...IS.th, textAlign: 'left', width: '14%' }}>Color</th>
                <th style={{ ...IS.th, textAlign: 'center', width: '8%' }}>Size</th>
                <th style={{ ...IS.th, textAlign: 'left', width: '10%' }}>HSN</th>
                <th style={{ ...IS.th, textAlign: 'right', width: '7%' }}>Qty</th>
                <th style={{ ...IS.th, textAlign: 'right', width: '10%' }}>Rate</th>
                <th style={{ ...IS.thLast, textAlign: 'right', width: '12%' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.items?.map((item, i) => (
                <tr key={i} style={{ pageBreakInside: 'avoid' }}>
                  <td style={{ ...IS.td, textAlign: 'center', fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ ...IS.td, fontWeight: 600 }}>{item.sku?.sku_code || '—'}</td>
                  <td style={{ ...IS.td }}>{item.sku?.color || '—'}</td>
                  <td style={{ ...IS.td, textAlign: 'center', fontWeight: 600 }}>{item.sku?.size || '—'}</td>
                  <td style={{ ...IS.td, fontSize: '9px' }}>{item.hsn_code || '—'}</td>
                  <td style={{ ...IS.td, textAlign: 'right', fontWeight: 700 }}>{item.quantity}</td>
                  <td style={{ ...IS.td, textAlign: 'right' }}>{fmtCurrency(item.unit_price)}</td>
                  <td style={{ ...IS.tdLast, textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(item.total_price)}</td>
                </tr>
              ))}
              {/* Pad empty rows to fill page */}
              {padCount > 0 && Array.from({ length: padCount }).map((_, i) => (
                <tr key={`pad-${i}`}>
                  <td style={{ ...IS.td, textAlign: 'center', color: '#ccc', fontSize: '9px' }}>{itemCount + i + 1}</td>
                  <td style={IS.td}></td>
                  <td style={IS.td}></td>
                  <td style={IS.td}></td>
                  <td style={IS.td}></td>
                  <td style={IS.td}></td>
                  <td style={IS.td}></td>
                  <td style={IS.tdLast}></td>
                </tr>
              ))}
              {/* Total qty row */}
              <tr style={{ borderTop: '1.5px solid #000' }}>
                <td colSpan={5} style={{ padding: '3px 5px', fontSize: '9px', fontWeight: 800, textAlign: 'right', borderRight: '1px solid #ccc' }}>TOTAL</td>
                <td style={{ padding: '3px 5px', fontSize: '10px', fontWeight: 800, textAlign: 'right', borderRight: '1px solid #ccc' }}>{totalQty}</td>
                <td style={{ padding: '3px 5px', borderRight: '1px solid #ccc' }}></td>
                <td style={{ padding: '3px 5px', fontSize: '10px', fontWeight: 800, textAlign: 'right' }}>{fmtCurrency(inv.subtotal)}</td>
              </tr>
            </tbody>
          </table>

          {/* ═══ FOOTER BLOCK ═══ */}
          <div>
            {/* ═══ TAX + GRAND TOTAL ═══ */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', marginBottom: '6px' }}>
              <table style={{ borderCollapse: 'collapse', border: '1px solid #000', width: '240px' }}>
                <tbody>
                  {(inv.discount_amount || 0) > 0 && (
                    <tr>
                      <td style={{ padding: '2px 6px', fontSize: '10px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>Discount</td>
                      <td style={{ padding: '2px 6px', fontSize: '10px', textAlign: 'right', borderBottom: '1px solid #000' }}>-{fmtCurrency(inv.discount_amount)}</td>
                    </tr>
                  )}
                  {(inv.gst_percent || 0) > 0 && (isIGST ? (
                    <tr>
                      <td style={{ padding: '2px 6px', fontSize: '10px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>IGST ({inv.gst_percent}%)</td>
                      <td style={{ padding: '2px 6px', fontSize: '10px', textAlign: 'right', borderBottom: '1px solid #000' }}>{fmtCurrency(inv.tax_amount)}</td>
                    </tr>
                  ) : (<>
                    <tr>
                      <td style={{ padding: '2px 6px', fontSize: '10px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>CGST ({(inv.gst_percent || 0) / 2}%)</td>
                      <td style={{ padding: '2px 6px', fontSize: '10px', textAlign: 'right', borderBottom: '1px solid #000' }}>{fmtCurrency((inv.tax_amount || 0) / 2)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 6px', fontSize: '10px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>SGST ({(inv.gst_percent || 0) / 2}%)</td>
                      <td style={{ padding: '2px 6px', fontSize: '10px', textAlign: 'right', borderBottom: '1px solid #000' }}>{fmtCurrency((inv.tax_amount || 0) / 2)}</td>
                    </tr>
                  </>))}
                  <tr>
                    <td style={{ padding: '4px 6px', fontSize: '11px', fontWeight: 800, borderRight: '1px solid #000' }}>Grand Total</td>
                    <td style={{ padding: '4px 6px', fontSize: '11px', fontWeight: 800, textAlign: 'right' }}>{fmtCurrency(inv.total_amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ═══ AMOUNT IN WORDS ═══ */}
            <div style={{ border: '1px solid #000', padding: '4px 8px', marginBottom: '8px', fontSize: '10px' }}>
              <strong>Amount in Words:</strong> {amountInWords(inv.total_amount)}
            </div>

            {/* ═══ BANK DETAILS ═══ */}
            {co.bank_name && (
              <div style={{ border: '1px solid #000', padding: '4px 8px', marginBottom: '8px' }}>
                <p style={IS.secLabel}>Bank Details</p>
                <p style={{ fontSize: '10px', margin: '1px 0' }}>Bank: <strong>{co.bank_name}</strong>{co.bank_branch ? ` | Branch: ${co.bank_branch}` : ''}</p>
                {co.bank_account && <p style={{ fontSize: '10px', margin: '1px 0' }}>A/C No: <strong>{co.bank_account}</strong></p>}
                {co.bank_ifsc && <p style={{ fontSize: '10px', margin: '1px 0' }}>IFSC: <strong>{co.bank_ifsc}</strong></p>}
              </div>
            )}

            {/* ═══ TERMS + E&OE ═══ */}
            <div style={{ fontSize: '8px', marginBottom: '8px', lineHeight: '1.5' }}>
              <p style={{ margin: 0 }}><strong>Terms & Conditions:</strong></p>
              <p style={{ margin: '1px 0' }}>1. Goods once sold will not be taken back or exchanged.</p>
              <p style={{ margin: '1px 0' }}>2. Subject to Surat jurisdiction only.</p>
              <p style={{ margin: '1px 0' }}>3. E. & O.E. (Errors and Omissions Excepted)</p>
            </div>

            {/* ═══ SIGNATURES ═══ */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '20px', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ borderBottom: '1px solid #000', height: '30px', marginBottom: '4px' }}></div>
                <p style={{ fontSize: '9px', fontWeight: 600, margin: 0 }}>Customer Signature</p>
              </div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, margin: '0 0 20px' }}>For {co.name || 'Company'}</p>
                <div style={{ borderBottom: '1px solid #000', height: '0', marginBottom: '4px' }}></div>
                <p style={{ fontSize: '9px', fontWeight: 600, margin: 0 }}>Authorized Signatory</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ═══════════════════════ DETAIL OVERLAY ═══════════════════════ */
  if (detailInvoice) {
    const inv = detailInvoice
    const isIGST = inv.place_of_supply && co.state_code && inv.place_of_supply !== co.state_code
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-auto">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="typo-modal-title text-white leading-tight">{inv.invoice_number}</h1>
            <p className="text-xs text-emerald-100">{inv.order?.order_number ? `Order ${inv.order.order_number}` : 'Direct Sale'} · <StatusBadge status={inv.status} /></p>
          </div>
          <div className="flex gap-2">
            <button onClick={openPrint} className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors">Print</button>
            <button onClick={() => setDetailInvoice(null)} className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors">Close</button>
          </div>
        </div>

        {detailLoading ? (
          <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>
        ) : (
          <div className="flex-1 p-4 max-w-5xl mx-auto w-full space-y-3">
            {/* 6 info cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Bill To</p>
                <p className="typo-data">{inv.customer_name || '—'}</p>
                {inv.customer_phone && <p className="text-xs text-gray-600 mt-0.5">Phone: {inv.customer_phone}</p>}
                {inv.customer_address && <p className="text-xs text-gray-600 mt-0.5">{inv.customer_address}</p>}
                {inv.customer_gst_no && <p className="text-xs text-gray-600 mt-0.5 font-medium">GST: {inv.customer_gst_no}</p>}
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Invoice Info</p>
                <div className="grid grid-cols-2 gap-1 text-xs mt-0.5">
                  <div><span className="text-gray-500">Issued:</span> <span className="font-medium">{fmtDate(inv.issued_at)}</span></div>
                  <div><span className="text-gray-500">Status:</span> <StatusBadge status={inv.status} /></div>
                  <div><span className="text-gray-500">Type:</span> <span className="font-medium">{inv.order ? 'From Order' : 'Direct Sale'}{inv.shipment ? ` · ${inv.shipment.shipment_no}` : ''}</span></div>
                  {inv.paid_at && <div><span className="text-gray-500">Paid:</span> <span className="font-medium text-green-600">{fmtDate(inv.paid_at)}</span></div>}
                </div>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Payment</p>
                <div className="text-xs mt-0.5 space-y-0.5">
                  <div><span className="text-gray-500">Due:</span> <span className="font-medium">{inv.due_date ? fmtDate(inv.due_date + 'T00:00:00') : '—'}</span></div>
                  {inv.payment_terms && <div><span className="text-gray-500">Terms:</span> <span className="font-medium">{inv.payment_terms}</span></div>}
                  {inv.place_of_supply && <div><span className="text-gray-500">Place of Supply:</span> <span className="font-medium">{inv.place_of_supply}</span></div>}
                </div>
              </div>
              {(inv.transport_detail || inv.lr_number || inv.broker) && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Transport / Broker</p>
                  <div className="text-xs mt-0.5 space-y-0.5">
                    {inv.transport_detail && (
                      <div><span className="text-gray-500">Transport:</span> <span className="font-medium">{inv.transport_detail.name}{inv.transport_detail.gst_no ? ` — GST: ${inv.transport_detail.gst_no}` : ''}</span></div>
                    )}
                    {inv.lr_number && (
                      <div><span className="text-gray-500">L.R. No. / Date:</span> <span className="font-medium">{inv.lr_number}{inv.lr_date ? ` — ${new Date(inv.lr_date).toLocaleDateString('en-IN')}` : ''}</span></div>
                    )}
                    {inv.broker && (
                      <div><span className="text-gray-500">Broker:</span> <span className="font-medium">{inv.broker.name}</span></div>
                    )}
                  </div>
                </div>
              )}
              {inv.order && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Linked Order</p>
                  <button onClick={() => { setDetailInvoice(null); navigate(`/orders?open=${inv.order.id}`) }} className="text-emerald-700 font-semibold text-sm hover:underline mt-0.5">
                    {inv.order.order_number} →
                  </button>
                </div>
              )}
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Financial Summary</p>
                <div className="text-xs mt-0.5 space-y-0.5">
                  <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{fmtCurrency(inv.subtotal)}</span></div>
                  {(inv.discount_amount || 0) > 0 && <div className="flex justify-between"><span className="text-green-600">Discount</span><span className="text-green-600">-{fmtCurrency(inv.discount_amount)}</span></div>}
                  <div className="flex justify-between"><span className="text-gray-500">Tax ({inv.gst_percent || 0}%)</span><span>{fmtCurrency(inv.tax_amount)}</span></div>
                  <div className="flex justify-between font-bold border-t border-emerald-300 pt-0.5"><span>Total</span><span>{fmtCurrency(inv.total_amount)}</span></div>
                </div>
              </div>
              {inv.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2">
                  <p className="typo-label-sm">Notes</p>
                  <p className="text-xs text-amber-800 mt-0.5">{inv.notes}</p>
                </div>
              )}
            </div>

            {/* Line items */}
            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr className="text-left text-gray-600 typo-th">
                    <th className="px-2 py-1.5">#</th>
                    <th className="px-2 py-1.5">HSN</th>
                    <th className="px-2 py-1.5">SKU</th>
                    <th className="px-2 py-1.5">Color</th>
                    <th className="px-2 py-1.5">Size</th>
                    <th className="px-2 py-1.5 text-right">Qty</th>
                    <th className="px-2 py-1.5 text-right">Rate</th>
                    <th className="px-2 py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {inv.items?.map((item, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                      <td className="px-2 py-1.5 text-gray-500">{item.hsn_code || '—'}</td>
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
                      <td className="px-2 py-1.5 text-right">{fmtCurrency(item.unit_price)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">{fmtCurrency(item.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bank details */}
            {co.bank_name && (
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Bank Details</p>
                <p className="text-xs mt-0.5">{co.bank_name} — A/C: {co.bank_account || '—'}</p>
                <p className="text-xs text-gray-500">IFSC: {co.bank_ifsc || '—'}{co.bank_branch ? ` · Branch: ${co.bank_branch}` : ''}</p>
              </div>
            )}

            {/* Actions */}
            {inv.status === 'issued' && (
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button onClick={() => setConfirmCancel(true)} disabled={actioning}
                  className="rounded border border-red-300 text-red-600 px-4 py-1.5 typo-btn-sm hover:bg-red-50 disabled:opacity-50 transition-colors">
                  Cancel Invoice
                </button>
                <button onClick={handleMarkPaid} disabled={actioning}
                  className="rounded bg-green-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {actioning ? 'Processing...' : 'Mark as Paid'}
                </button>
              </div>
            )}

            {/* Cancel confirmation */}
            {confirmCancel && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
                <div className="bg-white rounded-xl shadow-2xl px-6 py-5 max-w-sm w-full mx-4 space-y-3">
                  <h3 className="typo-data text-red-700">Cancel this invoice?</h3>
                  <p className="text-xs text-gray-500">This will reverse the ledger entry{!inv.order_id ? ' and restore stock' : ''}. This cannot be undone.</p>
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setConfirmCancel(false)} className="rounded border border-gray-300 px-4 py-1.5 typo-btn-sm text-gray-700 hover:bg-gray-50">Keep</button>
                    <button onClick={handleCancelInvoice} disabled={actioning}
                      className="rounded bg-red-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-red-700 disabled:opacity-50">
                      {actioning ? 'Cancelling...' : 'Yes, Cancel'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  /* ═══════════════════════ LIST VIEW ═══════════════════════ */
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="typo-page-title">Invoices</h1>
          <p className="mt-1 typo-caption">Track billing and payment status</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Category toggle */}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            {[{ key: 'invoices', label: 'Invoices' }, { key: 'credit_notes', label: 'Credit Notes' }, { key: 'debit_notes', label: 'Debit Notes' }].map(t => (
              <button key={t.key} onClick={() => setViewMode(t.key)}
                className={`px-3 py-1.5 typo-btn-sm transition-colors ${viewMode === t.key ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <button onClick={openCreate}
            className="rounded-lg bg-emerald-600 text-white px-4 py-2 typo-btn-sm hover:bg-emerald-700 shadow-sm transition-colors flex items-center gap-1.5">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New Invoice
          </button>
        </div>
      </div>

      {viewMode === 'invoices' ? (<>
        {/* KPI strip — 6 cards */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <KPICard label="Total" value={kpis.total} color="slate" />
          <KPICard label="Unpaid" value={kpis.unpaidCount} sub={fmtCurrency(kpis.unpaidAmt)} color="amber" />
          <KPICard label="Paid" value={kpis.paidCount} sub={fmtCurrency(kpis.paidAmt)} color="green" />
          <KPICard label="Cancelled" value={kpis.cancelledCount} color="red" />
          <KPICard label="Overdue" value={kpis.overdueCount} color="amber" />
          <KPICard label="This Month" value={fmtCurrency(kpis.monthRevenue)} color="emerald" />
        </div>

        {/* Tabs + search */}
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            {TABS.map(t => (
              <button key={t.key} onClick={() => { setStatusFilter(t.key); setPage(1) }}
                className={`rounded-full px-3 py-1 typo-btn-sm transition-colors ${statusFilter === t.key ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="ml-auto w-64">
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search invoices..." />
          </div>
        </div>

        {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

        <div className="mt-4">
          <DataTable columns={COLUMNS} data={invoicesList} loading={loading} onRowClick={handleRowClick} emptyText="No invoices found." />
          <Pagination page={page} pages={pages} total={total} onChange={setPage} />
        </div>
      </>) : viewMode === 'credit_notes' ? (<>
        {/* Credit Notes view */}
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <div className="ml-auto w-64">
            <SearchInput value={cnSearch} onChange={(v) => { setCnSearch(v); setCnPage(1) }} placeholder="Search credit notes..." />
          </div>
        </div>

        <div className="mt-4">
          <DataTable
            columns={[
              { key: 'credit_note_no', label: 'CN No.', render: (v) => <span className="font-semibold">{v}</span> },
              { key: 'srn_no', label: 'Return No.' },
              { key: 'customer', label: 'Customer', render: (v) => v?.name || '—' },
              { key: 'gst_percent', label: 'GST %', render: (v) => `${v || 0}%` },
              { key: 'subtotal', label: 'Subtotal', render: (v) => fmtCurrency(v) },
              { key: 'tax_amount', label: 'Tax', render: (v) => fmtCurrency(v) },
              { key: 'total_amount', label: 'Credit Amount', render: (v) => <span className="font-semibold text-emerald-600">{fmtCurrency(v)}</span> },
              { key: 'return_date', label: 'Date', render: (v) => fmtDate(v) },
            ]}
            data={cnList}
            loading={cnLoading}
            onRowClick={handleCnRowClick}
            emptyText="No credit notes found."
          />
          <Pagination page={cnPage} pages={cnPages} total={cnTotal} onChange={setCnPage} />
        </div>
      </>) : viewMode === 'debit_notes' ? (<>
        {/* Debit Notes view */}
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <div className="ml-auto w-64">
            <SearchInput value={dnSearch} onChange={(v) => { setDnSearch(v); setDnPage(1) }} placeholder="Search debit notes..." />
          </div>
        </div>

        <div className="mt-4">
          <DataTable
            columns={[
              { key: 'debit_note_no', label: 'DN No.', render: (v) => <span className="font-semibold">{v}</span> },
              { key: 'return_note_no', label: 'Return No.' },
              { key: 'supplier', label: 'Supplier', render: (v) => v?.name || '—' },
              { key: 'return_type', label: 'Type', render: (v) => v === 'roll_return' ? 'Roll' : 'SKU' },
              { key: 'gst_percent', label: 'GST %', render: (v) => `${v || 0}%` },
              { key: 'subtotal', label: 'Subtotal', render: (v) => fmtCurrency(v) },
              { key: 'tax_amount', label: 'Tax', render: (v) => fmtCurrency(v) },
              { key: 'total_amount', label: 'Debit Amount', render: (v) => <span className="font-semibold text-emerald-600">{fmtCurrency(v)}</span> },
              { key: 'return_date', label: 'Date', render: (v) => fmtDate(v) },
            ]}
            data={dnList}
            loading={dnLoading}
            onRowClick={handleDnRowClick}
            emptyText="No debit notes found."
          />
          <Pagination page={dnPage} pages={dnPages} total={dnTotal} onChange={setDnPage} />
        </div>
      </>) : null}

      {/* ═══════════════════════ CREATE OVERLAY ═══════════════════════ */}
      {createMode && (() => {
        const subtotal = invItems.reduce((s, it) => s + (it.quantity * it.unit_price || 0), 0)
        const discount = parseFloat(invForm.discount_amount) || 0
        const taxable = subtotal - discount
        const gstPct = parseFloat(invForm.gst_percent) || 0
        const gstAmt = Math.round(taxable * gstPct / 100 * 100) / 100
        const grandTotal = taxable + gstAmt
        return (
          <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-white shadow-sm">
              <div className="flex items-center gap-3">
                <button onClick={closeCreate} className="rounded-lg p-1.5 hover:bg-white/20 transition-colors">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div>
                  <h2 className="text-lg font-bold tracking-tight">New Invoice</h2>
                  <p className="text-xs text-emerald-100">Direct sale &mdash; no order required</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {invItems.some(it => it.sku_id) && (
                  <div className="hidden sm:flex items-center gap-2">
                    <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">{invItems.filter(it => it.sku_id).length} items</span>
                    <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">{fmtCurrency(grandTotal)}</span>
                  </div>
                )}
                <span className="hidden sm:inline text-xs text-emerald-200">Ctrl+S to save</span>
                <button onClick={closeCreate} className="rounded-lg border border-white/30 px-3 py-1.5 text-sm hover:bg-white/20 transition-colors">Cancel</button>
                <button onClick={handleCreateInvoice} disabled={saving}
                  className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors">
                  {saving ? 'Saving...' : `Create Invoice (${invItems.filter(it => it.sku_id).length})`}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {formError && <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />}

              {/* Invoice details */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-end gap-0 border-b border-gray-200 bg-gray-50 rounded-t-xl">
                  <div className="px-3 py-2 flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Invoice Details</span>
                    <span className="text-[10px] text-gray-300">&middot;</span>
                    <span className="text-[10px] text-gray-400"><kbd className="px-1 py-0.5 font-mono bg-gray-100 border border-gray-200 rounded text-[9px]">Shift+M</kbd> quick-add master</span>
                  </div>
                </div>
                <div className="px-4 py-3 grid grid-cols-3 md:grid-cols-6 gap-2">
                  <div className="col-span-2">
                    <label className="typo-label-sm">Customer <span className="text-red-500">*</span></label>
                    <FilterSelect autoFocus searchable full data-master="customer" value={invForm.customer_id}
                      onChange={v => {
                        setInvForm(f => ({ ...f, customer_id: v }))
                        const cust = customers.find(c => c.id === v)
                        if (cust?.due_days) setInvForm(f => ({ ...f, payment_terms: `Net ${cust.due_days}` }))
                        if (cust?.state_code) setInvForm(f => ({ ...f, place_of_supply: cust.state_code }))
                        setIsDirty(true)
                      }}
                      options={[{ value: '', label: 'Select customer...' }, ...customers.map(c => ({ value: c.id, label: `${c.name}${c.phone ? ` — ${c.phone}` : ''}` }))]} />
                  </div>
                  <div>
                    <label className="typo-label-sm">GST %</label>
                    <FilterSelect full value={invForm.gst_percent}
                      onChange={v => { setInvForm(f => ({ ...f, gst_percent: v })); setIsDirty(true) }}
                      options={GST_OPTIONS} />
                  </div>
                  <div>
                    <label className="typo-label-sm">Discount (₹)</label>
                    <input type="number" min="0" step="0.01" className="typo-input-sm"
                      value={invForm.discount_amount}
                      onChange={e => { setInvForm(f => ({ ...f, discount_amount: e.target.value })); setIsDirty(true) }}
                      placeholder="0.00" />
                  </div>
                  <div>
                    <label className="typo-label-sm">Payment Terms</label>
                    <input type="text" className="typo-input-sm"
                      value={invForm.payment_terms}
                      onChange={e => { setInvForm(f => ({ ...f, payment_terms: e.target.value })); setIsDirty(true) }}
                      placeholder="e.g. Net 30" />
                  </div>
                  <div>
                    <label className="typo-label-sm">Place of Supply</label>
                    <input type="text" className="typo-input-sm"
                      value={invForm.place_of_supply}
                      onChange={e => { setInvForm(f => ({ ...f, place_of_supply: e.target.value })); setIsDirty(true) }}
                      placeholder="State code" />
                  </div>
                </div>
              </div>

              {/* Line items */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Line Items</span>
                  <button onClick={addInvItem} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 typo-btn-sm text-white hover:bg-emerald-700 shadow-sm transition-colors">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Add Row
                  </button>
                </div>
                <div className="px-4 py-3">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-emerald-600">
                      <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider w-[45%] border-r border-emerald-500">SKU</th>
                      <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider w-[15%] border-r border-emerald-500">Qty</th>
                      <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider w-[18%] border-r border-emerald-500">Rate (₹)</th>
                      <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider w-[15%] border-r border-emerald-500">Amount</th>
                      <th className="px-2 py-2 w-[7%]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invItems.map((item, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/50">
                          <td className="px-2 py-1.5">
                            <FilterSelect searchable full value={item.sku_id}
                              onChange={v => {
                                const sku = allSKUs.find(s => s.id === v)
                                updateInvItem(i, 'sku_id', v)
                                if (sku?.selling_price || sku?.base_price || sku?.sale_rate) updateInvItem(i, 'unit_price', sku.sale_rate || sku.selling_price || sku.base_price)
                              }}
                              options={[{ value: '', label: 'Select SKU...' }, ...allSKUs.map(s => ({
                                value: s.id,
                                label: `${s.sku_code} — Stock: ${s.stock?.available_qty ?? s.available_qty ?? '?'}`,
                              }))]} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min="1" className="typo-input-sm w-full text-right"
                              value={item.quantity} onChange={e => updateInvItem(i, 'quantity', parseInt(e.target.value) || 0)} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min="0" step="0.01" className="typo-input-sm w-full text-right"
                              value={item.unit_price} onChange={e => updateInvItem(i, 'unit_price', parseFloat(e.target.value) || 0)} />
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold">{fmtCurrency(item.quantity * item.unit_price)}</td>
                          <td className="px-2 py-1.5 text-center">
                            {invItems.length > 1 && (
                              <button onClick={() => removeInvItem(i)} className="text-red-400 hover:text-red-600 transition-colors">
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            )}
                          </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="mt-3 flex justify-end">
                  <div className="w-56 space-y-1.5 border-t border-gray-200 pt-2">
                    <div className="flex justify-between typo-td"><span>Subtotal</span><span>{fmtCurrency(subtotal)}</span></div>
                    {discount > 0 && <div className="flex justify-between typo-td-secondary"><span className="text-green-600">Discount</span><span className="text-green-600">-{fmtCurrency(discount)}</span></div>}
                    {gstPct > 0 && (<>
                      <div className="flex justify-between typo-td-secondary"><span>CGST ({gstPct / 2}%)</span><span>{fmtCurrency(gstAmt / 2)}</span></div>
                      <div className="flex justify-between typo-td-secondary"><span>SGST ({gstPct / 2}%)</span><span>{fmtCurrency(gstAmt / 2)}</span></div>
                    </>)}
                    <div className="flex justify-between typo-data text-base border-t border-gray-200 pt-2"><span>Grand Total</span><span>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                  </div>
                </div>
                </div>
              </div>

              {/* Notes */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden px-4 py-3">
                <h4 className="typo-label-sm mb-2">Notes</h4>
                <textarea className="typo-input-sm w-full h-20 resize-none" placeholder="Optional notes..."
                  value={invForm.notes || ''} onChange={e => { setInvForm(f => ({ ...f, notes: e.target.value })); setIsDirty(true) }} />
              </div>
            </div>

            {/* Keyboard shortcuts bar */}
            <div className="flex-shrink-0 border-t bg-white px-6 py-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Tab</kbd> Next field</span>
                <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Ctrl+S</kbd> Save</span>
                <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Esc</kbd> Close</span>
              </div>
            </div>

            {/* Discard confirmation */}
            {showDiscard && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
                <div className="bg-white rounded-xl shadow-2xl px-6 py-5 max-w-sm w-full mx-4 space-y-3">
                  <h3 className="typo-data">Unsaved changes</h3>
                  <p className="text-xs text-gray-500">You have unsaved invoice data. Discard changes?</p>
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setShowDiscard(false)} className="rounded border border-gray-300 px-4 py-1.5 typo-btn-sm text-gray-700 hover:bg-gray-50">Keep Editing</button>
                    <button onClick={() => { setShowDiscard(false); setCreateMode(false); setIsDirty(false) }}
                      className="rounded bg-red-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-red-700">Discard</button>
                  </div>
                </div>
              </div>
            )}
            <QuickMasterModal type={quickMasterType} open={quickMasterOpen} onClose={closeQuickMaster} onCreated={onMasterCreated} />
          </div>
        )
      })()}
    </div>
  )
}
