import { useEffect, useMemo, useState } from 'react'
import FilterSelect from '../common/FilterSelect'
import PaymentForm, { emptyPaymentForm } from '../common/PaymentForm'
import {
  getOnAccountBalance,
  getOpenInvoicesForCustomer,
  recordPayment,
} from '../../api/paymentReceipts'

/**
 * Tally-style bill-wise receipt voucher form.
 *
 * Single customer per receipt → loads open invoices → user enters gross
 * amount → allocates with checkboxes / [Auto] FIFO / [Full] per-row →
 * residue lands as on-account credit.
 *
 * Props
 *   customers           — array { id, name, city, phone } for picker
 *   defaultCustomerId   — preselect (when launched from invoice "Mark as Paid")
 *   defaultInvoiceId    — preselect single invoice + lock-in (Mark-as-Paid)
 *   defaultAmount       — preselect gross amount (Mark-as-Paid: outstanding)
 *   onSuccess(receipt)  — fires after POST resolves
 *   onCancel()
 */
const fmt = (v) =>
  `₹${(Number(v) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export default function RecordPaymentForm({
  customers = [],
  defaultCustomerId = '',
  defaultInvoiceId = null,
  defaultAmount = '',
  onSuccess,
  onCancel,
}) {
  const [customerId, setCustomerId] = useState(defaultCustomerId)
  const [openInvoices, setOpenInvoices] = useState([])
  const [onAccountBal, setOnAccountBal] = useState(0)
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [payment, setPayment] = useState(() => ({
    ...emptyPaymentForm(),
    payment_mode: 'neft',
    amount: defaultAmount || '',
  }))
  const [allocations, setAllocations] = useState({}) // { invoice_id: amount_string }
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Fetch open invoices on customer change
  useEffect(() => {
    let cancelled = false
    if (!customerId) {
      setOpenInvoices([])
      setOnAccountBal(0)
      setAllocations({})
      return
    }
    setLoadingInvoices(true)
    Promise.all([
      getOpenInvoicesForCustomer(customerId),
      getOnAccountBalance(customerId),
    ])
      .then(([invRes, oaRes]) => {
        if (cancelled) return
        const opens = invRes.data?.data || []
        setOpenInvoices(opens)
        setOnAccountBal(Number(oaRes.data?.data?.balance || 0))

        // Lock in default invoice (Mark-as-Paid path)
        if (defaultInvoiceId) {
          const target = opens.find((iv) => iv.id === defaultInvoiceId)
          if (target) {
            setAllocations({
              [defaultInvoiceId]: target.outstanding_amount.toFixed(2),
            })
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOpenInvoices([])
          setOnAccountBal(0)
        }
      })
      .finally(() => !cancelled && setLoadingInvoices(false))
    return () => {
      cancelled = true
    }
  }, [customerId, defaultInvoiceId])

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

  const customerOptions = useMemo(
    () => [
      { value: '', label: 'Select customer (Shift+M to create)' },
      ...customers.map((c) => ({
        value: c.id,
        label: `${c.name}${c.city ? ` — ${c.city}` : ''}${c.phone ? ` (${c.phone})` : ''}`,
      })),
    ],
    [customers],
  )

  // Allocation helpers
  function setAllocation(invId, amount) {
    setAllocations((prev) => {
      const next = { ...prev }
      if (amount === '' || amount === null) delete next[invId]
      else next[invId] = amount
      return next
    })
  }
  function setFullForRow(inv) {
    const remaining = round2(allocatable - (totalAllocated - (Number(allocations[inv.id]) || 0)))
    const target = Math.min(inv.outstanding_amount, Math.max(0, remaining))
    if (target <= 0) return
    setAllocation(inv.id, target.toFixed(2))
  }
  function autoAllocateFifo() {
    if (allocatable <= 0) return
    let pool = allocatable
    const next = {}
    for (const inv of openInvoices) {
      if (pool <= 0.005) break
      const apply = Math.min(inv.outstanding_amount, pool)
      next[inv.id] = round2(apply).toFixed(2)
      pool = round2(pool - apply)
    }
    setAllocations(next)
  }
  function clearAll() {
    setAllocations({})
  }

  async function submit() {
    setError('')
    if (!customerId) return setError('Select a customer')
    if (!grossAmount || grossAmount <= 0) return setError('Enter a positive amount')
    if (overAllocated)
      return setError(
        `Allocations (${fmt(totalAllocated)}) exceed allocatable (${fmt(allocatable)})`,
      )

    const payload = {
      party_type: 'customer',
      party_id: customerId,
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
        .map(([invoice_id, amount_applied]) => ({
          invoice_id,
          amount_applied: Number(amount_applied),
        })),
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

  const lockedInvoice = !!defaultInvoiceId

  return (
    <div className="space-y-3">
      {/* Customer + on-account chip */}
      <div className="grid grid-cols-3 gap-2 items-end">
        <div className="col-span-2">
          <label className="typo-label-sm">
            Customer <span className="text-red-500">*</span>
          </label>
          <FilterSelect
            autoFocus
            searchable
            full
            data-master="customer"
            value={customerId}
            onChange={setCustomerId}
            options={customerOptions}
            disabled={lockedInvoice}
          />
        </div>
        <div className="text-right">
          {customerId && onAccountBal > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-sky-50 border border-sky-200 typo-data text-sky-700">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              On-account: <strong>{fmt(onAccountBal)}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Receipt details — reuse PaymentForm */}
      <div className="border border-gray-200 rounded-md p-3">
        <PaymentForm
          value={payment}
          onChange={setPayment}
          partyType="customer"
          error=""
        />
      </div>

      {/* Allocation table */}
      {customerId && (
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className="typo-card-title">Allocate to invoices</span>
              <span className="typo-caption text-gray-500">
                {openInvoices.length} open · FIFO oldest first
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={autoAllocateFifo}
                disabled={allocatable <= 0 || openInvoices.length === 0}
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

          {loadingInvoices ? (
            <div className="px-3 py-6 typo-empty text-center">Loading open invoices…</div>
          ) : openInvoices.length === 0 ? (
            <div className="px-3 py-6 typo-empty text-center">
              No open invoices for this customer.
            </div>
          ) : (
            <div className="max-h-72 overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="typo-th px-2 py-1.5 text-left w-8"></th>
                    <th className="typo-th px-2 py-1.5 text-left">Invoice</th>
                    <th className="typo-th px-2 py-1.5 text-left">Date</th>
                    <th className="typo-th px-2 py-1.5 text-right">Total</th>
                    <th className="typo-th px-2 py-1.5 text-right">Paid</th>
                    <th className="typo-th px-2 py-1.5 text-right">Outstanding</th>
                    <th className="typo-th px-2 py-1.5 text-right w-32">Apply</th>
                    <th className="typo-th px-2 py-1.5 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {openInvoices.map((inv) => {
                    const checked = allocations[inv.id] !== undefined
                    return (
                      <tr key={inv.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) setFullForRow(inv)
                              else setAllocation(inv.id, '')
                            }}
                            disabled={lockedInvoice && inv.id !== defaultInvoiceId}
                          />
                        </td>
                        <td className="typo-td px-2 py-1">
                          <span className="font-mono">{inv.invoice_number}</span>
                          {inv.status === 'partially_paid' && (
                            <span className="ml-1 px-1 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 typo-caption">
                              partial
                            </span>
                          )}
                        </td>
                        <td className="typo-td-secondary px-2 py-1">
                          {inv.issued_at
                            ? new Date(inv.issued_at).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                              })
                            : '—'}
                        </td>
                        <td className="typo-td px-2 py-1 text-right tabular-nums">
                          {fmt(inv.total_amount)}
                        </td>
                        <td className="typo-td-secondary px-2 py-1 text-right tabular-nums">
                          {fmt(inv.amount_paid)}
                        </td>
                        <td className="typo-td px-2 py-1 text-right tabular-nums font-medium">
                          {fmt(inv.outstanding_amount)}
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={allocations[inv.id] ?? ''}
                            onChange={(e) => setAllocation(inv.id, e.target.value)}
                            placeholder="0.00"
                            className="typo-input-sm text-right tabular-nums"
                            disabled={lockedInvoice && inv.id !== defaultInvoiceId}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => setFullForRow(inv)}
                            disabled={lockedInvoice && inv.id !== defaultInvoiceId}
                            className="typo-caption text-emerald-700 hover:text-emerald-900 disabled:opacity-40"
                            title="Apply outstanding"
                          >
                            Full
                          </button>
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
                {residue >= 0 ? 'On Account' : 'Over by'}{' '}
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
          disabled={submitting || !customerId || !grossAmount || overAllocated}
          className="typo-btn-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded"
        >
          {submitting ? 'Recording…' : `Record Receipt — ${fmt(grossAmount)}`}
        </button>
      </div>
    </div>
  )
}
