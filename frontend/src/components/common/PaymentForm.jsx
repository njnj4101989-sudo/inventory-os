import { useState, useEffect } from 'react'

/**
 * Shared payment-recording form. Used by:
 *  - LedgerPanel (party-side, ad-hoc receipt against a customer/supplier)
 *  - InvoicesPage Mark-as-Paid modal (invoice-side, full receipt)
 *
 * Fields collected: amount, payment_date, payment_mode (cash/neft/upi/cheque),
 * reference_no (UTR/cheque#), TDS toggle + section + rate (supplier/VA side),
 * TCS toggle + section + rate (customer side), notes.
 *
 * Props
 *   value                 — controlled form state object
 *   onChange(nextValue)   — emits whole next form state on every edit
 *   partyType             — 'customer' | 'supplier' | 'va_party' (drives TDS vs TCS panel)
 *   amountReadOnly        — when true, amount field is disabled (e.g. invoice's full total)
 *   amountHelper          — small text rendered under the amount input (e.g. "Invoice total — full payment")
 *   error                 — optional inline error to render at the top
 */

export const PAYMENT_MODES = [
  { value: 'neft', label: 'NEFT/RTGS' },
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
]

export const TDS_SECTIONS = [
  { value: '194C', label: '194C — Job Work (1%/2%)' },
  { value: '194H', label: '194H — Brokerage (5%)' },
  { value: '194J', label: '194J — Professional (10%)' },
]

export const TCS_SECTIONS = [
  { value: '206C(1H)', label: '206C(1H) — Sale >50L (0.1%)' },
]

export function emptyPaymentForm() {
  return {
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'neft',
    reference_no: '',
    notes: '',
    tds_applicable: false,
    tds_rate: '',
    tds_section: '',
    tcs_applicable: false,
    tcs_rate: '',
    tcs_section: '',
  }
}

export default function PaymentForm({ value, onChange, partyType, amountReadOnly = false, amountHelper, error }) {
  const showTDS = partyType !== 'customer' // supplier/VA — we deduct TDS
  const showTCS = partyType === 'customer'  // customer — we charge TCS on >50L
  const [touched, setTouched] = useState(false)

  // Reset toggles when party type changes (avoid stale TDS on customer flow etc.)
  useEffect(() => {
    if (showTDS && value.tcs_applicable) onChange({ ...value, tcs_applicable: false, tcs_rate: '', tcs_section: '' })
    if (showTCS && value.tds_applicable) onChange({ ...value, tds_applicable: false, tds_rate: '', tds_section: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyType])

  const set = (patch) => { setTouched(true); onChange({ ...value, ...patch }) }

  return (
    <div className="space-y-2">
      {error && <p className="typo-caption text-red-600">{error}</p>}

      {/* Row 1 — amount, date, mode, ref */}
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="typo-label-sm">Amount <span className="text-red-500">*</span></label>
          <input type="number" min="0" step="0.01"
            value={value.amount}
            onChange={(e) => set({ amount: e.target.value })}
            disabled={amountReadOnly}
            className={`typo-input-sm ${amountReadOnly ? 'bg-gray-100 cursor-not-allowed text-gray-700' : ''}`}
            placeholder="0.00" />
          {amountHelper && <p className="typo-caption mt-0.5 text-gray-500">{amountHelper}</p>}
        </div>
        <div>
          <label className="typo-label-sm">Date <span className="text-red-500">*</span></label>
          <input type="date"
            value={value.payment_date}
            onChange={(e) => set({ payment_date: e.target.value })}
            className="typo-input-sm" />
        </div>
        <div>
          <label className="typo-label-sm">Mode</label>
          <select
            value={value.payment_mode || ''}
            onChange={(e) => set({ payment_mode: e.target.value })}
            className="typo-input-sm">
            {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="typo-label-sm">Ref No.</label>
          <input type="text"
            value={value.reference_no}
            onChange={(e) => set({ reference_no: e.target.value })}
            className="typo-input-sm" placeholder="UTR / Cheque #" />
        </div>
      </div>

      {/* Row 2 — TDS / TCS conditional */}
      {(showTDS || showTCS) && (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          {showTDS && (
            <>
              <label className="flex items-center gap-1.5 typo-btn-sm text-gray-700 cursor-pointer">
                <input type="checkbox"
                  checked={value.tds_applicable}
                  onChange={(e) => set({ tds_applicable: e.target.checked })} />
                TDS <span className="typo-caption">(deducted by {partyType === 'supplier' ? 'us' : 'us'})</span>
              </label>
              {value.tds_applicable && (
                <>
                  <select value={value.tds_section}
                    onChange={(e) => set({ tds_section: e.target.value })}
                    className="typo-input-sm !w-auto">
                    <option value="">Section</option>
                    {TDS_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <input type="number" min="0" step="0.01"
                    value={value.tds_rate}
                    onChange={(e) => set({ tds_rate: e.target.value })}
                    className="typo-input-sm !w-auto" placeholder="Rate %" />
                </>
              )}
            </>
          )}
          {showTCS && (
            <>
              <label className="flex items-center gap-1.5 typo-btn-sm text-gray-700 cursor-pointer">
                <input type="checkbox"
                  checked={value.tcs_applicable}
                  onChange={(e) => set({ tcs_applicable: e.target.checked })} />
                TCS <span className="typo-caption">(deducted by customer)</span>
              </label>
              {value.tcs_applicable && (
                <>
                  <select value={value.tcs_section}
                    onChange={(e) => set({ tcs_section: e.target.value })}
                    className="typo-input-sm !w-auto">
                    <option value="">Section</option>
                    {TCS_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <input type="number" min="0" step="0.01"
                    value={value.tcs_rate}
                    onChange={(e) => set({ tcs_rate: e.target.value })}
                    className="typo-input-sm !w-auto" placeholder="Rate %" />
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Row 3 — notes */}
      <div>
        <label className="typo-label-sm">Notes</label>
        <input type="text"
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
          className="typo-input-sm" placeholder="Optional — narration / cheque date / bank notes" />
      </div>
    </div>
  )
}
