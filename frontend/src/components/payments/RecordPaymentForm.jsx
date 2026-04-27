import { useEffect, useMemo, useState } from 'react'
import FilterSelect from '../common/FilterSelect'
import PaymentForm, { emptyPaymentForm } from '../common/PaymentForm'
import {
  getOnAccountBalance,
  getOpenBillsForParty,
  recordPayment,
} from '../../api/paymentReceipts'

/**
 * Polymorphic Tally-style bill-wise receipt voucher form.
 *
 * Picks one party (customer / supplier / va_party), loads their open bills
 * (invoices / supplier_invoices / job+batch challans), allocates with
 * checkboxes / [Auto] FIFO / [Full] per-row → residue lands as on-account
 * credit.
 *
 * Props
 *   partyType            — 'customer' | 'supplier' | 'va_party'
 *   parties              — array { id, name, city, phone } for picker
 *   defaultPartyId       — preselect (when launched from a detail page)
 *   defaultBillType      — preselect single bill (Mark-as-Paid / future)
 *   defaultBillId
 *   defaultAmount        — preselect gross amount
 *   onSuccess(receipt)
 *   onCancel()
 */

const PARTY_LABELS = {
  customer: { single: 'Customer', billSingle: 'Invoice', billPlural: 'invoices', verb: 'received' },
  supplier: { single: 'Supplier', billSingle: 'Bill', billPlural: 'bills', verb: 'paid' },
  va_party: { single: 'VA Party', billSingle: 'Challan', billPlural: 'challans', verb: 'paid' },
}

const billKey = (b) => `${b.bill_type}:${b.bill_id}`

const fmt = (v) =>
  `₹${(Number(v) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export default function RecordPaymentForm({
  partyType = 'customer',
  parties = [],
  defaultPartyId = '',
  defaultBillType = null,
  defaultBillId = null,
  defaultAmount = '',
  onSuccess,
  onCancel,
}) {
  const labels = PARTY_LABELS[partyType] || PARTY_LABELS.customer

  const [partyId, setPartyId] = useState(defaultPartyId)
  const [openBills, setOpenBills] = useState([])
  const [onAccountBal, setOnAccountBal] = useState(0)
  const [loadingBills, setLoadingBills] = useState(false)
  const [payment, setPayment] = useState(() => ({
    ...emptyPaymentForm(),
    payment_mode: 'neft',
    amount: defaultAmount || '',
  }))
  const [allocations, setAllocations] = useState({}) // { 'bill_type:bill_id': amount_string }
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Fetch open bills on party change
  useEffect(() => {
    let cancelled = false
    if (!partyId) {
      setOpenBills([])
      setOnAccountBal(0)
      setAllocations({})
      return
    }
    setLoadingBills(true)
    Promise.all([
      getOpenBillsForParty(partyType, partyId),
      getOnAccountBalance(partyType, partyId),
    ])
      .then(([billsRes, oaRes]) => {
        if (cancelled) return
        const opens = billsRes.data?.data || []
        setOpenBills(opens)
        setOnAccountBal(Number(oaRes.data?.data?.balance || 0))

        if (defaultBillType && defaultBillId) {
          const target = opens.find(
            (b) => b.bill_type === defaultBillType && b.bill_id === defaultBillId,
          )
          if (target) {
            setAllocations({
              [billKey(target)]: target.outstanding_amount.toFixed(2),
            })
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOpenBills([])
          setOnAccountBal(0)
        }
      })
      .finally(() => !cancelled && setLoadingBills(false))
    return () => {
      cancelled = true
    }
  }, [partyType, partyId, defaultBillType, defaultBillId])

  // Math
  const grossAmount = round2(payment.amount)
  const tdsAmount = useMemo(() => {
    if (!payment.tds_applicable || !payment.tds_rate) return 0
    return round2((grossAmount * Number(payment.tds_rate)) / 100)
  }, [grossAmount, payment.tds_applicable, payment.tds_rate])
  const tcsAmount = useMemo(() => {
    if (!payment.tcs_applicable || !payment.tcs_rate) return 0
    return round2((grossAmount * Number(payment.tcs_rate)) / 100)
  }, [grossAmount, payment.tcs_applicable, payment.tcs_rate])
  const allocatable = round2(grossAmount - tdsAmount + tcsAmount)
  const totalAllocated = useMemo(
    () =>
      round2(
        Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0),
      ),
    [allocations],
  )
  const residue = round2(allocatable - totalAllocated)
  const overAllocated = totalAllocated > allocatable + 0.005
  const fullyAllocated = Math.abs(residue) < 0.005

  const partyOptions = useMemo(
    () => [
      { value: '', label: `Select ${labels.single.toLowerCase()} (Shift+M to create)` },
      ...parties.map((p) => ({
        value: p.id,
        label: `${p.name}${p.city ? ` — ${p.city}` : ''}${p.phone ? ` (${p.phone})` : ''}`,
      })),
    ],
    [parties, labels.single],
  )

  // Allocation helpers
  function setAllocation(key, amount) {
    setAllocations((prev) => {
      const next = { ...prev }
      if (amount === '' || amount === null) delete next[key]
      else next[key] = amount
      return next
    })
  }
  function setFullForRow(bill) {
    const k = billKey(bill)
    const remaining = round2(
      allocatable - (totalAllocated - (Number(allocations[k]) || 0)),
    )
    const target = Math.min(bill.outstanding_amount, Math.max(0, remaining))
    if (target <= 0) return
    setAllocation(k, target.toFixed(2))
  }
  function autoAllocateFifo() {
    if (allocatable <= 0) return
    let pool = allocatable
    const next = {}
    for (const bill of openBills) {
      if (pool <= 0.005) break
      const apply = Math.min(bill.outstanding_amount, pool)
      next[billKey(bill)] = round2(apply).toFixed(2)
      pool = round2(pool - apply)
    }
    setAllocations(next)
  }
  function clearAll() {
    setAllocations({})
  }

  async function submit() {
    setError('')
    if (!partyId) return setError(`Select a ${labels.single.toLowerCase()}`)
    if (!grossAmount || grossAmount <= 0) return setError('Enter a positive amount')
    if (overAllocated)
      return setError(
        `Allocations (${fmt(totalAllocated)}) exceed allocatable (${fmt(allocatable)})`,
      )

    const payload = {
      party_type: partyType,
      party_id: partyId,
      payment_date: payment.payment_date,
      payment_mode: payment.payment_mode || 'cash',
      reference_no: payment.reference_no || null,
      amount: grossAmount,
      tds_applicable: !!payment.tds_applicable,
      tds_rate: payment.tds_rate ? Number(payment.tds_rate) : null,
      tds_section: payment.tds_section || null,
      tcs_applicable: !!payment.tcs_applicable,
      tcs_rate: payment.tcs_rate ? Number(payment.tcs_rate) : null,
      tcs_section: payment.tcs_section || null,
      allocations: Object.entries(allocations)
        .filter(([, v]) => Number(v) > 0)
        .map(([key, amount_applied]) => {
          const [bt, bid] = key.split(':')
          return { bill_type: bt, bill_id: bid, amount_applied: Number(amount_applied) }
        }),
      notes: payment.notes || null,
    }

    setSubmitting(true)
    try {
      const res = await recordPayment(payload)
      onSuccess?.(res.data?.data)
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to record payment'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const lockedBill = !!(defaultBillType && defaultBillId)
  const isCustomer = partyType === 'customer'
  const onAccountLabel = isCustomer ? 'On-account credit' : 'Advance with party'

  return (
    <div className="space-y-3">
      {/* Party + on-account chip */}
      <div className="grid grid-cols-3 gap-2 items-end">
        <div className="col-span-2">
          <label className="typo-label-sm">
            {labels.single} <span className="text-red-500">*</span>
          </label>
          <FilterSelect
            autoFocus
            searchable
            full
            data-master={partyType === 'va_party' ? 'va-party' : partyType}
            value={partyId}
            onChange={setPartyId}
            options={partyOptions}
            disabled={lockedBill}
          />
        </div>
        <div className="text-right">
          {partyId && onAccountBal > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-sky-50 border border-sky-200 typo-data text-sky-700">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {onAccountLabel}: <strong>{fmt(onAccountBal)}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Receipt details — reuse PaymentForm */}
      <div className="border border-gray-200 rounded-md p-3">
        <PaymentForm
          value={payment}
          onChange={setPayment}
          partyType={partyType}
          error=""
        />
      </div>

      {/* Allocation table */}
      {partyId && (
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className="typo-card-title">Allocate to {labels.billPlural}</span>
              <span className="typo-caption text-gray-500">
                {openBills.length} open · FIFO oldest first
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={autoAllocateFifo}
                disabled={allocatable <= 0 || openBills.length === 0}
                className="typo-btn-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 px-2 py-1 rounded"
              >
                Auto FIFO
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="typo-btn-sm border border-gray-300 text-gray-700 hover:bg-gray-50 px-2 py-1 rounded"
              >
                Clear
              </button>
            </div>
          </div>

          {loadingBills ? (
            <div className="px-3 py-6 typo-empty text-center">Loading open {labels.billPlural}…</div>
          ) : openBills.length === 0 ? (
            <div className="px-3 py-6 typo-empty text-center">
              No open {labels.billPlural} for this {labels.single.toLowerCase()}.
            </div>
          ) : (
            <div className="max-h-72 overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="typo-th px-2 py-1.5 text-left w-8"></th>
                    <th className="typo-th px-2 py-1.5 text-left">{labels.billSingle}</th>
                    <th className="typo-th px-2 py-1.5 text-left">Date</th>
                    <th className="typo-th px-2 py-1.5 text-right">Total</th>
                    <th className="typo-th px-2 py-1.5 text-right">Paid</th>
                    <th className="typo-th px-2 py-1.5 text-right">Outstanding</th>
                    <th className="typo-th px-2 py-1.5 text-right w-32">Apply</th>
                    <th className="typo-th px-2 py-1.5 w-14"></th>
                    <th className="typo-th px-2 py-1.5 text-left w-28">After</th>
                  </tr>
                </thead>
                <tbody>
                  {openBills.map((bill) => {
                    const k = billKey(bill)
                    const checked = allocations[k] !== undefined
                    const applied = Number(allocations[k]) || 0
                    const remainingAfter = round2(bill.outstanding_amount - applied)
                    const settles = applied > 0 && remainingAfter <= 0.005
                    const isPartial = applied > 0 && remainingAfter > 0.005
                    const isLockedRow =
                      lockedBill &&
                      !(bill.bill_type === defaultBillType && bill.bill_id === defaultBillId)
                    return (
                      <tr key={k} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) setFullForRow(bill)
                              else setAllocation(k, '')
                            }}
                            disabled={isLockedRow}
                          />
                        </td>
                        <td className="typo-td px-2 py-1">
                          <span className="font-mono">{bill.bill_no}</span>
                          {bill.status === 'partially_paid' && (
                            <span className="ml-1 px-1 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 typo-caption">
                              partial
                            </span>
                          )}
                          {bill.bill_type === 'job_challan' && (
                            <span className="ml-1 px-1 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 typo-caption">
                              roll
                            </span>
                          )}
                          {bill.bill_type === 'batch_challan' && (
                            <span className="ml-1 px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 typo-caption">
                              garment
                            </span>
                          )}
                        </td>
                        <td className="typo-td-secondary px-2 py-1">
                          {bill.bill_date
                            ? new Date(bill.bill_date).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                              })
                            : '—'}
                        </td>
                        <td className="typo-td px-2 py-1 text-right tabular-nums">
                          {fmt(bill.total_amount)}
                        </td>
                        <td className="typo-td-secondary px-2 py-1 text-right tabular-nums">
                          {fmt(bill.amount_paid)}
                        </td>
                        <td className="typo-td px-2 py-1 text-right tabular-nums font-medium">
                          {fmt(bill.outstanding_amount)}
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={allocations[k] ?? ''}
                            onChange={(e) => setAllocation(k, e.target.value)}
                            placeholder="0.00"
                            className="typo-input-sm text-right tabular-nums"
                            disabled={isLockedRow}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => setFullForRow(bill)}
                            disabled={isLockedRow}
                            className="typo-caption px-1.5 py-0.5 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-emerald-700 hover:border-emerald-300 disabled:opacity-40"
                            title="Fill with full outstanding"
                          >
                            Max
                          </button>
                        </td>
                        <td className="px-2 py-1 typo-caption">
                          {settles ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                              Settles
                            </span>
                          ) : isPartial ? (
                            <span className="text-sky-700 tabular-nums">
                              {fmt(remainingAfter)} left
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Live counter footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-gray-50 border-t border-gray-200">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 typo-data">
              <span className="text-gray-500">
                Allocatable <strong className="text-gray-900 tabular-nums">{fmt(allocatable)}</strong>
              </span>
              <span
                className={`tabular-nums ${
                  overAllocated
                    ? 'text-rose-600'
                    : fullyAllocated
                      ? 'text-emerald-700'
                      : 'text-gray-700'
                }`}
              >
                Allocated <strong>{fmt(totalAllocated)}</strong>
              </span>
              <span
                className={`tabular-nums ${
                  residue > 0.005
                    ? 'text-sky-700'
                    : residue < -0.005
                      ? 'text-rose-600'
                      : 'text-gray-500'
                }`}
              >
                {residue >= 0 ? (isCustomer ? 'On Account' : 'Advance') : 'Over by'}{' '}
                <strong>{fmt(Math.abs(residue))}</strong>
              </span>
              {(tdsAmount > 0 || tcsAmount > 0) && (
                <span className="typo-caption text-gray-500">
                  {tdsAmount > 0 && `TDS −${fmt(tdsAmount)}`}
                  {tdsAmount > 0 && tcsAmount > 0 && ' · '}
                  {tcsAmount > 0 && `TCS +${fmt(tcsAmount)}`}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded bg-rose-50 border border-rose-200 typo-data text-rose-700">
          {error}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="typo-btn-sm border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !partyId || !grossAmount || overAllocated}
          className="typo-btn-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded"
        >
          {submitting ? 'Recording…' : `Record ${isCustomer ? 'Receipt' : 'Payment'} — ${fmt(grossAmount)}`}
        </button>
      </div>
    </div>
  )
}
