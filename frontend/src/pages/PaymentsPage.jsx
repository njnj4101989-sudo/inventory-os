import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useReactToPrint } from 'react-to-print'
import {
  cancelPaymentReceipt,
  getPaymentReceipts,
  getPaymentReceipt,
} from '../api/paymentReceipts'
import { getAllCustomers } from '../api/customers'
import { getSuppliers } from '../api/suppliers'
import { getAllVAParties } from '../api/masters'
import { getCompany } from '../api/company'
import DataTable from '../components/common/DataTable'
import Pagination from '../components/common/Pagination'
import ErrorAlert from '../components/common/ErrorAlert'
import SearchInput from '../components/common/SearchInput'
import FilterSelect from '../components/common/FilterSelect'
import RecordPaymentForm from '../components/payments/RecordPaymentForm'
import ReceiptVoucherPrint from '../components/common/ReceiptVoucherPrint'
import useQuickMaster from '../hooks/useQuickMaster'
import QuickMasterModal from '../components/common/QuickMasterModal'

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

const fmtCurrency = (v) =>
  `₹${(Number(v) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const KPI_COLORS = {
  emerald: 'from-emerald-500 to-emerald-600',
  sky: 'from-sky-500 to-sky-600',
  amber: 'from-amber-500 to-amber-600',
  slate: 'from-slate-500 to-slate-600',
}

function KPICard({ label, value, sub, color = 'slate' }) {
  return (
    <div
      className={`rounded-lg bg-gradient-to-br ${KPI_COLORS[color] || KPI_COLORS.slate} p-2.5 text-white shadow-sm`}
    >
      <p className="typo-label-sm tracking-wide text-white/85">{label}</p>
      <p className="mt-0.5 text-xl font-bold leading-tight">{value}</p>
      {sub && <p className="typo-caption text-white/75">{sub}</p>}
    </div>
  )
}

const MODES = [
  { value: '', label: 'All modes' },
  { value: 'neft', label: 'NEFT/RTGS' },
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
]

const TABS = [
  { id: 'customer', label: 'Customer Receipts', kind: 'in' },
  { id: 'supplier', label: 'Supplier Payments', kind: 'out' },
  { id: 'va_party', label: 'VA Payments', kind: 'out' },
]

const TAB_LABELS = {
  customer: { party: 'Customer', recordCta: '+ Record Receipt', headerSub: 'Multi-invoice allocation supported', kpiVerb: 'Received', avgLabel: 'Avg Receipt', columnLabel: 'Customer' },
  supplier: { party: 'Supplier', recordCta: '+ Record Payment', headerSub: 'Bill-wise allocation against supplier invoices', kpiVerb: 'Paid', avgLabel: 'Avg Payment', columnLabel: 'Supplier' },
  va_party: { party: 'VA Party', recordCta: '+ Record Payment', headerSub: 'Bill-wise allocation against VA challans', kpiVerb: 'Paid', avgLabel: 'Avg Payment', columnLabel: 'VA Party' },
}

function StatusPill({ receipt }) {
  if (receipt.status === 'cancelled') {
    return (
      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 typo-badge bg-rose-100 text-rose-700">
        Cancelled
      </span>
    )
  }
  if (Number(receipt.on_account_amount) > 0.005) {
    return (
      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 typo-badge bg-sky-100 text-sky-700">
        On-Account {fmtCurrency(receipt.on_account_amount)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 typo-badge bg-emerald-100 text-emerald-700">
      Allocated
    </span>
  )
}

const CANCEL_REASONS = [
  { value: 'wrong_customer', label: 'Wrong customer' },
  { value: 'wrong_amount', label: 'Wrong amount' },
  { value: 'duplicate', label: 'Duplicate entry' },
  { value: 'bounced_cheque', label: 'Bounced cheque' },
  { value: 'payment_reversed', label: 'Payment reversed (UPI/transfer failed)' },
  { value: 'data_entry_error', label: 'Data entry error' },
  { value: 'other', label: 'Other' },
]

const billTypeChip = (bt) => {
  if (bt === 'invoice') return null
  const map = {
    supplier_invoice: 'bg-amber-50 text-amber-700 border-amber-200',
    job_challan: 'bg-purple-50 text-purple-700 border-purple-200',
    batch_challan: 'bg-pink-50 text-pink-700 border-pink-200',
  }
  const labelMap = {
    supplier_invoice: 'SI',
    job_challan: 'roll',
    batch_challan: 'garment',
  }
  const cls = map[bt] || 'bg-gray-50 text-gray-700 border-gray-200'
  return (
    <span className={`ml-1 px-1 py-0.5 rounded border typo-caption ${cls}`}>
      {labelMap[bt] || bt}
    </span>
  )
}

const allocationDeepLink = (bt, billId) => {
  if (bt === 'invoice') return `/invoices?open=${billId}`
  if (bt === 'supplier_invoice') return `/rolls?si=${billId}` // SI list is on RollsPage tab
  if (bt === 'job_challan' || bt === 'batch_challan') return `/challans?open=${billId}`
  return null
}

export default function PaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'customer'
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.id === initialTab) ? initialTab : 'customer',
  )

  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState('')
  const [partyFilter, setPartyFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active') // S126
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // S126 cancel state
  const [cancelModal, setCancelModal] = useState(null) // receipt being cancelled
  const [cancelReason, setCancelReason] = useState('')
  const [cancelNotes, setCancelNotes] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState(null)

  const [customers, setCustomers] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [vaParties, setVaParties] = useState([])
  const [companyFull, setCompanyFull] = useState(null)

  const [createMode, setCreateMode] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [printReceipt, setPrintReceipt] = useState(null)
  const printRef = useRef(null)

  const partiesByTab = useMemo(
    () => ({ customer: customers, supplier: suppliers, va_party: vaParties }),
    [customers, suppliers, vaParties],
  )
  const currentParties = partiesByTab[activeTab] || []
  const labels = TAB_LABELS[activeTab]

  const { quickMasterType, quickMasterOpen, closeQuickMaster, onMasterCreated } = useQuickMaster(
    (type, newItem) => {
      if (type === 'customer') setCustomers((prev) => [...prev, newItem])
      else if (type === 'supplier') setSuppliers((prev) => [...prev, newItem])
      else if (type === 'va-party' || type === 'va_party')
        setVaParties((prev) => [...prev, newItem])
    },
  )

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: printReceipt ? `Receipt-${printReceipt.receipt_no}` : 'Receipt',
    pageStyle: `
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #000; }
    `,
  })

  // Load parties + company once
  useEffect(() => {
    getAllCustomers().then((r) => setCustomers(r.data?.data || [])).catch(() => {})
    getSuppliers({ page_size: 0 })
      .then((r) => setSuppliers(r.data?.data || []))
      .catch(() => {})
    getAllVAParties()
      .then((r) => setVaParties(r.data?.data || []))
      .catch(() => {})
    getCompany()
      .then((r) => setCompanyFull(r.data?.data || r.data))
      .catch(() => {})
  }, [])

  // Reset filters + page when tab switches
  useEffect(() => {
    setPartyFilter('')
    setSearch('')
    setModeFilter('')
    setStatusFilter('active')
    setDateFrom('')
    setDateTo('')
    setPage(1)
    // Persist tab on URL
    if (searchParams.get('tab') !== activeTab) {
      const sp = new URLSearchParams(searchParams)
      sp.set('tab', activeTab)
      setSearchParams(sp, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // Fetch list
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {
        page,
        page_size: 20,
        party_type: activeTab,
        search: search || undefined,
        payment_mode: modeFilter || undefined,
        party_id: partyFilter || undefined,
        status: statusFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }
      const res = await getPaymentReceipts(params)
      setList(res.data?.data || [])
      setTotal(res.data?.total || 0)
      setPages(res.data?.pages || 1)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load receipts')
    } finally {
      setLoading(false)
    }
  }, [activeTab, page, search, modeFilter, partyFilter, statusFilter, dateFrom, dateTo])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Deep-link ?open=<id>
  useEffect(() => {
    const openId = searchParams.get('open')
    if (!openId) return
    searchParams.delete('open')
    setSearchParams(searchParams, { replace: true })
    ;(async () => {
      setDetailLoading(true)
      try {
        const res = await getPaymentReceipt(openId)
        const det = res.data?.data || res.data
        if (det?.party_type && det.party_type !== activeTab) {
          setActiveTab(det.party_type)
        }
        setDetail(det)
      } catch {
        /* ignore */
      } finally {
        setDetailLoading(false)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // KPIs derived from current page
  const kpis = useMemo(() => {
    const all = list
    const totalAmt = all.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const onAccount = all.reduce((s, r) => s + (Number(r.on_account_amount) || 0), 0)
    const withResidue = all.filter((r) => Number(r.on_account_amount) > 0.005).length
    const avg = all.length > 0 ? totalAmt / all.length : 0
    return { count: all.length, totalAmt, onAccount, withResidue, avg }
  }, [list])

  const onRowClick = async (row) => {
    setDetailLoading(true)
    setDetail(row)
    try {
      const res = await getPaymentReceipt(row.id)
      setDetail(res.data?.data || res.data)
    } catch {
      /* fallback */
    } finally {
      setDetailLoading(false)
    }
  }

  const onCreateSuccess = () => {
    setCreateMode(false)
    fetchData()
  }

  const submitCancel = async () => {
    if (!cancelModal) return
    if (!cancelReason) {
      setCancelError('Pick a reason')
      return
    }
    setCancelling(true)
    setCancelError(null)
    try {
      const res = await cancelPaymentReceipt(cancelModal.id, {
        cancel_reason: cancelReason,
        cancel_notes: cancelNotes || null,
      })
      const updated = res.data?.data || res.data
      setCancelModal(null)
      setDetail(updated)
      fetchData()
    } catch (err) {
      setCancelError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          'Failed to cancel receipt',
      )
    } finally {
      setCancelling(false)
    }
  }

  const openPrint = () => {
    if (!detail) return
    setPrintReceipt(detail)
    setTimeout(() => handlePrint(), 50)
  }

  const COLUMNS = useMemo(
    () => [
      {
        key: 'receipt_no',
        label: 'Receipt #',
        render: (val) => <span className="font-semibold text-emerald-700">{val}</span>,
      },
      { key: 'payment_date', label: 'Date', render: (val) => fmtDate(val) },
      {
        key: 'party',
        label: labels.columnLabel,
        render: (val) =>
          val?.name ? val.name : <span className="text-gray-400">—</span>,
      },
      {
        key: 'payment_mode',
        label: 'Mode',
        render: (val) => (
          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 typo-badge bg-gray-100 text-gray-700 uppercase">
            {val}
          </span>
        ),
      },
      {
        key: 'reference_no',
        label: 'Ref',
        render: (val) => val || <span className="text-gray-300">—</span>,
      },
      {
        key: 'amount',
        label: 'Amount',
        render: (val) => <span className="font-bold tabular-nums">{fmtCurrency(val)}</span>,
      },
      {
        key: 'allocated_amount',
        label: 'Allocated',
        render: (val) => <span className="tabular-nums">{fmtCurrency(val)}</span>,
      },
      {
        key: 'on_account_amount',
        label: activeTab === 'customer' ? 'On-Account' : 'Advance',
        render: (val) =>
          Number(val) > 0.005 ? (
            <span className="tabular-nums text-sky-700 font-medium">{fmtCurrency(val)}</span>
          ) : (
            <span className="tabular-nums text-gray-300">—</span>
          ),
      },
      {
        key: '__status',
        label: 'Status',
        render: (_v, row) => <StatusPill receipt={row} />,
      },
    ],
    [activeTab, labels.columnLabel],
  )

  // ── Detail overlay ──
  if (detail) {
    const detailPtype = detail.party_type || activeTab
    const detailLabels = TAB_LABELS[detailPtype] || labels
    return (
      <>
        <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-auto">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
            <div>
              <h1 className="typo-modal-title text-white leading-tight">{detail.receipt_no}</h1>
              <p className="text-xs text-emerald-100">
                {detail.party?.name || detailLabels.party} · {fmtDate(detail.payment_date)} · {detail.payment_mode?.toUpperCase()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={openPrint}
                className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30"
              >
                Print Receipt
              </button>
              {detail.status === 'active' && (
                <button
                  onClick={() => {
                    setCancelReason('')
                    setCancelNotes('')
                    setCancelError(null)
                    setCancelModal(detail)
                  }}
                  className="rounded bg-rose-500/90 px-3 py-1.5 typo-btn-sm hover:bg-rose-500"
                >
                  Cancel Receipt
                </button>
              )}
              <button
                onClick={() => setDetail(null)}
                className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30"
              >
                Close
              </button>
            </div>
          </div>

          {detailLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : (
            <div className="flex-1 p-4 max-w-5xl mx-auto w-full space-y-3">
              {/* S126 — cancelled banner */}
              {detail.status === 'cancelled' && (
                <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 flex items-start gap-2">
                  <svg className="w-4 h-4 mt-0.5 text-rose-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1 typo-data text-rose-800">
                    <span className="font-semibold">Cancelled</span>
                    {detail.cancel_reason && (
                      <span className="ml-2 text-rose-700">
                        ({CANCEL_REASONS.find((r) => r.value === detail.cancel_reason)?.label || detail.cancel_reason})
                      </span>
                    )}
                    <span className="ml-2 text-rose-600">· {fmtDate(detail.cancelled_at)}</span>
                    {detail.cancelled_by_name && (
                      <span className="ml-2 text-rose-600">· by {detail.cancelled_by_name}</span>
                    )}
                    {detail.cancel_notes && (
                      <p className="mt-1 italic text-rose-700">"{detail.cancel_notes}"</p>
                    )}
                    <p className="mt-1 typo-caption text-rose-600">All allocations have been reversed and a compensating ledger entry has been posted.</p>
                  </div>
                </div>
              )}

              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Gross</p>
                  <p className="typo-kpi-sm tabular-nums">{fmtCurrency(detail.amount)}</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">
                    Net {detailPtype === 'customer' ? 'Received' : 'Paid'}
                  </p>
                  <p className="typo-kpi-sm tabular-nums">{fmtCurrency(detail.net_amount)}</p>
                  {(Number(detail.tds_amount) > 0 || Number(detail.tcs_amount) > 0) && (
                    <p className="typo-caption text-gray-500">
                      {Number(detail.tds_amount) > 0 && `TDS −${fmtCurrency(detail.tds_amount)}`}
                      {Number(detail.tds_amount) > 0 && Number(detail.tcs_amount) > 0 && ' · '}
                      {Number(detail.tcs_amount) > 0 && `TCS +${fmtCurrency(detail.tcs_amount)}`}
                    </p>
                  )}
                </div>
                <div className="bg-emerald-50 rounded p-2">
                  <p className="typo-label-sm text-emerald-700">Allocated</p>
                  <p className="typo-kpi-sm tabular-nums text-emerald-700">
                    {fmtCurrency(detail.allocated_amount)}
                  </p>
                </div>
                <div className="bg-sky-50 rounded p-2">
                  <p className="typo-label-sm text-sky-700">
                    {detailPtype === 'customer' ? 'On-Account' : 'Advance'}
                  </p>
                  <p className="typo-kpi-sm tabular-nums text-sky-700">
                    {fmtCurrency(detail.on_account_amount)}
                  </p>
                </div>
              </div>

              {/* Party + meta */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">
                    {detailPtype === 'customer' ? 'Received From' : 'Paid To'}
                  </p>
                  <p className="typo-data">{detail.party?.name || '—'}</p>
                  {detail.party?.phone && (
                    <p className="text-xs text-gray-600 mt-0.5">Phone: {detail.party.phone}</p>
                  )}
                  {detail.party?.gst_no && (
                    <p className="text-xs text-gray-600 mt-0.5 font-medium">
                      GST: {detail.party.gst_no}
                    </p>
                  )}
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Receipt Info</p>
                  <div className="grid grid-cols-2 gap-1 text-xs mt-0.5">
                    <div>
                      <span className="text-gray-500">Mode:</span>{' '}
                      <span className="font-medium uppercase">{detail.payment_mode}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Date:</span>{' '}
                      <span className="font-medium">{fmtDate(detail.payment_date)}</span>
                    </div>
                    {detail.reference_no && (
                      <div className="col-span-2">
                        <span className="text-gray-500">Ref:</span>{' '}
                        <span className="font-mono">{detail.reference_no}</span>
                      </div>
                    )}
                    {detail.notes && (
                      <div className="col-span-2 italic text-gray-600">"{detail.notes}"</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Allocations */}
              <div className="border border-gray-200 rounded">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <span className="typo-card-title">Bill-wise Allocations</span>
                  <span className="typo-caption text-gray-500">
                    {(detail.allocations || []).length} bill
                    {(detail.allocations || []).length !== 1 ? 's' : ''}
                  </span>
                </div>
                {(detail.allocations || []).length === 0 ? (
                  <div className="px-3 py-6 typo-empty text-center">
                    Fully {detailPtype === 'customer' ? 'on-account' : 'advance'} — no bill allocations.
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="typo-th px-3 py-1.5 text-left">Bill</th>
                        <th className="typo-th px-3 py-1.5 text-right">Amount Applied</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.allocations || []).map((a) => {
                        const link = allocationDeepLink(a.bill_type, a.bill_id)
                        const code = a.bill_no || a.bill_id
                        return (
                          <tr key={a.id} className="border-t border-gray-100">
                            <td className="typo-td px-3 py-1.5">
                              {link ? (
                                <a
                                  href={link}
                                  className="font-mono text-emerald-700 hover:underline"
                                >
                                  {code}
                                </a>
                              ) : (
                                <span className="font-mono">{code}</span>
                              )}
                              {billTypeChip(a.bill_type)}
                            </td>
                            <td className="typo-td px-3 py-1.5 text-right tabular-nums font-medium">
                              {fmtCurrency(a.amount_applied)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>

        {printReceipt && (
          <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
            <ReceiptVoucherPrint
              ref={printRef}
              receipt={printReceipt}
              company={companyFull}
            />
          </div>
        )}

        {/* S126 — Cancel modal */}
        {cancelModal && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget && !cancelling) setCancelModal(null)
            }}
          >
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-rose-600 to-rose-500 text-white flex items-center justify-between">
                <div>
                  <h3 className="typo-modal-title text-white">Cancel Receipt {cancelModal.receipt_no}</h3>
                  <p className="typo-caption text-rose-100">
                    Reverses all allocations + posts a compensating ledger entry
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !cancelling && setCancelModal(null)}
                  className="rounded bg-white/20 px-2 py-1 typo-btn-sm hover:bg-white/30"
                  disabled={cancelling}
                >
                  Close
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="rounded bg-rose-50 border border-rose-200 px-3 py-2 typo-caption text-rose-700">
                  This is reversible only by recording a fresh receipt — the original row stays in the audit log marked as cancelled.
                </div>
                <div>
                  <label className="typo-label-sm">
                    Reason <span className="text-red-500">*</span>
                  </label>
                  <FilterSelect
                    value={cancelReason}
                    onChange={setCancelReason}
                    options={[{ value: '', label: 'Select reason…' }, ...CANCEL_REASONS]}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="typo-label-sm">Notes (optional)</label>
                  <textarea
                    rows={3}
                    value={cancelNotes}
                    onChange={(e) => setCancelNotes(e.target.value)}
                    placeholder="Add any extra context for the audit log…"
                    className="typo-input-sm w-full resize-none"
                  />
                </div>
                {cancelError && (
                  <div className="rounded bg-rose-50 border border-rose-200 px-3 py-2 typo-data text-rose-700">
                    {cancelError}
                  </div>
                )}
              </div>
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => !cancelling && setCancelModal(null)}
                  disabled={cancelling}
                  className="typo-btn-sm border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded"
                >
                  Keep Receipt
                </button>
                <button
                  type="button"
                  onClick={submitCancel}
                  disabled={cancelling || !cancelReason}
                  className="typo-btn-sm bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 px-3 py-1.5 rounded"
                >
                  {cancelling ? 'Cancelling…' : 'Confirm Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // ── Create overlay ──
  if (createMode) {
    return (
      <>
        <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-auto">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
            <div>
              <h1 className="typo-modal-title text-white leading-tight">
                {labels.recordCta.replace('+ ', '')}
              </h1>
              <p className="text-xs text-emerald-100">{labels.headerSub}</p>
            </div>
            <button
              onClick={() => setCreateMode(false)}
              className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30"
            >
              Close
            </button>
          </div>
          <div className="flex-1 p-4 max-w-5xl mx-auto w-full">
            <RecordPaymentForm
              partyType={activeTab}
              parties={currentParties}
              onSuccess={onCreateSuccess}
              onCancel={() => setCreateMode(false)}
            />
          </div>
        </div>
        <QuickMasterModal
          open={quickMasterOpen}
          type={quickMasterType}
          onClose={closeQuickMaster}
          onCreated={onMasterCreated}
        />
      </>
    )
  }

  // ── List ──
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="typo-page-title">Payments</h1>
          <p className="mt-1 typo-caption">Bill-wise receipts &amp; payouts · Tally-style allocation</p>
        </div>
        <button
          onClick={() => setCreateMode(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white typo-btn px-3 py-2 rounded shadow-sm"
        >
          {labels.recordCta}
        </button>
      </div>

      {/* Tabs — match ReportsPage style */}
      <div className="flex gap-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`inline-flex items-center gap-1.5 pb-2.5 typo-tab border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KPICard
          label="Receipts (page)"
          value={kpis.count}
          sub={`${total} total in FY`}
          color="slate"
        />
        <KPICard label={`Total ${labels.kpiVerb}`} value={fmtCurrency(kpis.totalAmt)} color="emerald" />
        <KPICard
          label={activeTab === 'customer' ? 'On-Account' : 'Advance'}
          value={fmtCurrency(kpis.onAccount)}
          sub={`${kpis.withResidue} receipt(s)`}
          color="sky"
        />
        <KPICard label={labels.avgLabel} value={fmtCurrency(kpis.avg)} color="amber" />
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
        <div className="md:col-span-2">
          <label className="typo-label-sm">Search</label>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(1)
            }}
            placeholder="Receipt# or Ref#"
          />
        </div>
        <div className="md:col-span-2">
          <label className="typo-label-sm">{labels.columnLabel}</label>
          <FilterSelect
            searchable
            value={partyFilter}
            onChange={(v) => {
              setPartyFilter(v)
              setPage(1)
            }}
            options={[
              { value: '', label: `All ${labels.columnLabel.toLowerCase()}s` },
              ...currentParties.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
        <div>
          <label className="typo-label-sm">Mode</label>
          <FilterSelect value={modeFilter} onChange={(v) => { setModeFilter(v); setPage(1) }} options={MODES} />
        </div>
        <div>
          <label className="typo-label-sm">Status</label>
          <FilterSelect
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1) }}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        <div>
          <label className="typo-label-sm">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
            className="typo-input-sm"
          />
        </div>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      <DataTable
        columns={COLUMNS}
        data={list}
        loading={loading}
        emptyText={`No ${activeTab.replace('_', ' ')} payments yet — record your first one.`}
        onRowClick={onRowClick}
      />

      {pages > 1 && (
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      )}

      <QuickMasterModal
        open={quickMasterOpen}
        type={quickMasterType}
        onClose={closeQuickMaster}
        onCreated={onMasterCreated}
      />
    </div>
  )
}
