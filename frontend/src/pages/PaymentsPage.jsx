import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useReactToPrint } from 'react-to-print'
import {
  getPaymentReceipts,
  getPaymentReceipt,
} from '../api/paymentReceipts'
import { getAllCustomers } from '../api/customers'
import { getCompany } from '../api/company'
import DataTable from '../components/common/DataTable'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
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

function StatusPill({ receipt }) {
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

const COLUMNS = [
  {
    key: 'receipt_no',
    label: 'Receipt #',
    render: (val) => <span className="font-semibold text-emerald-700">{val}</span>,
  },
  {
    key: 'payment_date',
    label: 'Date',
    render: (val) => fmtDate(val),
  },
  {
    key: 'party',
    label: 'Customer',
    render: (val) => (val?.name ? val.name : <span className="text-gray-400">—</span>),
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
    label: 'On-Account',
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
]

export default function PaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState('')
  const [partyFilter, setPartyFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [customers, setCustomers] = useState([])
  const [companyFull, setCompanyFull] = useState(null)

  const [createMode, setCreateMode] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [printReceipt, setPrintReceipt] = useState(null)
  const printRef = useRef(null)

  const { quickMasterType, quickMasterOpen, closeQuickMaster, onMasterCreated } = useQuickMaster(
    (type, newItem) => {
      if (type === 'customer') {
        setCustomers((prev) => [...prev, newItem])
      }
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

  // Load customers + company once
  useEffect(() => {
    getAllCustomers().then((r) => setCustomers(r.data?.data || [])).catch(() => {})
    getCompany()
      .then((r) => setCompanyFull(r.data?.data || r.data))
      .catch(() => {})
  }, [])

  // Fetch list
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {
        page,
        page_size: 20,
        search: search || undefined,
        payment_mode: modeFilter || undefined,
        party_id: partyFilter || undefined,
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
  }, [page, search, modeFilter, partyFilter, dateFrom, dateTo])

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
        setDetail(res.data?.data || res.data)
      } catch {
        /* ignore */
      } finally {
        setDetailLoading(false)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // KPIs derived from current page (server-side total when needed later)
  const kpis = useMemo(() => {
    const all = list
    const totalReceived = all.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const onAccount = all.reduce((s, r) => s + (Number(r.on_account_amount) || 0), 0)
    const withResidue = all.filter((r) => Number(r.on_account_amount) > 0.005).length
    const avg = all.length > 0 ? totalReceived / all.length : 0
    return { count: all.length, totalReceived, onAccount, withResidue, avg }
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

  const openPrint = () => {
    if (!detail) return
    setPrintReceipt(detail)
    setTimeout(() => handlePrint(), 50)
  }

  // ── Detail overlay ──
  if (detail) {
    return (
      <>
        <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-auto">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
            <div>
              <h1 className="typo-modal-title text-white leading-tight">{detail.receipt_no}</h1>
              <p className="text-xs text-emerald-100">
                {detail.party?.name || 'Customer'} · {fmtDate(detail.payment_date)} · {detail.payment_mode?.toUpperCase()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={openPrint}
                className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30"
              >
                Print Receipt
              </button>
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
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Gross</p>
                  <p className="typo-kpi-sm tabular-nums">{fmtCurrency(detail.amount)}</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Net Received</p>
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
                  <p className="typo-label-sm text-sky-700">On-Account</p>
                  <p className="typo-kpi-sm tabular-nums text-sky-700">
                    {fmtCurrency(detail.on_account_amount)}
                  </p>
                </div>
              </div>

              {/* Customer + meta */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Received From</p>
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
                    {(detail.allocations || []).length} invoice
                    {(detail.allocations || []).length !== 1 ? 's' : ''}
                  </span>
                </div>
                {(detail.allocations || []).length === 0 ? (
                  <div className="px-3 py-6 typo-empty text-center">
                    Fully on-account — no invoice allocations.
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="typo-th px-3 py-1.5 text-left">Invoice</th>
                        <th className="typo-th px-3 py-1.5 text-right">Amount Applied</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.allocations || []).map((a) => (
                        <tr key={a.id} className="border-t border-gray-100">
                          <td className="typo-td px-3 py-1.5">
                            <a
                              href={`/invoices?open=${a.invoice_id}`}
                              className="font-mono text-emerald-700 hover:underline"
                            >
                              {a.invoice_number || a.invoice_id}
                            </a>
                          </td>
                          <td className="typo-td px-3 py-1.5 text-right tabular-nums font-medium">
                            {fmtCurrency(a.amount_applied)}
                          </td>
                        </tr>
                      ))}
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
              <h1 className="typo-modal-title text-white leading-tight">Record Payment</h1>
              <p className="text-xs text-emerald-100">
                Customer payment — multi-invoice allocation supported
              </p>
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
              customers={customers}
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
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="typo-page-title">Payments</h1>
          <p className="typo-caption text-gray-500">
            Bill-wise receipts · Tally-style allocation
          </p>
        </div>
        <button
          onClick={() => setCreateMode(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white typo-btn px-3 py-2 rounded shadow-sm"
        >
          + Record Payment
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KPICard
          label="Receipts (page)"
          value={kpis.count}
          sub={`${total} total in FY`}
          color="slate"
        />
        <KPICard label="Total Received" value={fmtCurrency(kpis.totalReceived)} color="emerald" />
        <KPICard label="On-Account" value={fmtCurrency(kpis.onAccount)} sub={`${kpis.withResidue} receipt(s)`} color="sky" />
        <KPICard label="Avg Receipt" value={fmtCurrency(kpis.avg)} color="amber" />
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
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
          <label className="typo-label-sm">Customer</label>
          <FilterSelect
            searchable
            value={partyFilter}
            onChange={(v) => {
              setPartyFilter(v)
              setPage(1)
            }}
            options={[
              { value: '', label: 'All customers' },
              ...customers.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
        <div>
          <label className="typo-label-sm">Mode</label>
          <FilterSelect value={modeFilter} onChange={(v) => { setModeFilter(v); setPage(1) }} options={MODES} />
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
        emptyText="No receipts yet — record your first customer payment."
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
