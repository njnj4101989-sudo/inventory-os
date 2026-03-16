import { useState, useEffect, useCallback } from 'react'
import { getLedger, getPartyBalance, recordPayment } from '../../api/ledger'

const ENTRY_COLORS = {
  opening: 'bg-blue-50 text-blue-700',
  invoice: 'bg-emerald-50 text-emerald-700',
  challan: 'bg-amber-50 text-amber-700',
  payment: 'bg-green-50 text-green-700',
  tds: 'bg-orange-50 text-orange-700',
  tcs: 'bg-purple-50 text-purple-700',
  adjustment: 'bg-gray-50 text-gray-600',
}

const PAYMENT_MODES = [
  { value: 'neft', label: 'NEFT/RTGS' },
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
]

const TDS_SECTIONS = [
  { value: '194C', label: '194C — Job Work (1%/2%)' },
  { value: '194H', label: '194H — Brokerage (5%)' },
  { value: '194J', label: '194J — Professional (10%)' },
]

const TCS_SECTIONS = [
  { value: '206C(1H)', label: '206C(1H) — Sale >50L (0.1%)' },
]

function fmt(n) {
  if (n == null || n === 0) return ''
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function LedgerPanel({ open, onClose, partyType, partyId, partyName }) {
  const [entries, setEntries] = useState([])
  const [balance, setBalance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showPayment, setShowPayment] = useState(false)
  const [payForm, setPayForm] = useState({
    amount: '', payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'neft', reference_no: '', notes: '',
    tds_applicable: false, tds_rate: '', tds_section: '',
    tcs_applicable: false, tcs_rate: '', tcs_section: '',
  })
  const [saving, setSaving] = useState(false)
  const [payError, setPayError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!partyType || !partyId) return
    setLoading(true)
    try {
      const [ledgerRes, balRes] = await Promise.all([
        getLedger(partyType, partyId, { page_size: 200 }),
        getPartyBalance(partyType, partyId),
      ])
      setEntries(ledgerRes.data.data?.data || [])
      setBalance(balRes.data.data)
    } catch {
      setEntries([])
      setBalance(null)
    } finally {
      setLoading(false)
    }
  }, [partyType, partyId])

  useEffect(() => {
    if (open) fetchData()
  }, [open, fetchData])

  const handlePayment = async () => {
    if (!payForm.amount || Number(payForm.amount) <= 0) {
      setPayError('Enter a valid amount')
      return
    }
    setSaving(true)
    setPayError(null)
    try {
      await recordPayment({
        party_type: partyType,
        party_id: partyId,
        amount: Number(payForm.amount),
        payment_date: payForm.payment_date,
        payment_mode: payForm.payment_mode || null,
        reference_no: payForm.reference_no || null,
        tds_applicable: payForm.tds_applicable,
        tds_rate: payForm.tds_applicable && payForm.tds_rate ? Number(payForm.tds_rate) : null,
        tds_section: payForm.tds_applicable ? payForm.tds_section || null : null,
        tcs_applicable: payForm.tcs_applicable,
        tcs_rate: payForm.tcs_applicable && payForm.tcs_rate ? Number(payForm.tcs_rate) : null,
        tcs_section: payForm.tcs_applicable ? payForm.tcs_section || null : null,
        notes: payForm.notes || null,
      })
      setShowPayment(false)
      setPayForm({
        amount: '', payment_date: new Date().toISOString().split('T')[0],
        payment_mode: 'neft', reference_no: '', notes: '',
        tds_applicable: false, tds_rate: '', tds_section: '',
        tcs_applicable: false, tcs_rate: '', tcs_section: '',
      })
      fetchData()
    } catch (err) {
      setPayError(err.response?.data?.detail || 'Payment failed')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  // Running balance
  let running = 0
  const withBalance = entries.map((e) => {
    if (partyType === 'customer') {
      running += Number(e.debit) - Number(e.credit)
    } else {
      running += Number(e.credit) - Number(e.debit)
    }
    return { ...e, running }
  })

  const isCustomer = partyType === 'customer'
  const showTDS = !isCustomer
  const showTCS = isCustomer

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-2xl bg-white shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-700 to-primary-600 px-4 py-3 text-white flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold">{partyName}</h2>
            <p className="text-xs opacity-80">{partyType.replace('_', ' ')} Ledger</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPayment(true)}
              className="rounded bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30">
              Record Payment
            </button>
            <button onClick={onClose} className="rounded bg-white/20 px-2 py-1 text-xs hover:bg-white/30">✕</button>
          </div>
        </div>

        {/* Balance summary */}
        {balance && (
          <div className="px-4 py-2 bg-gray-50 border-b flex items-center gap-4 text-xs shrink-0">
            <span className="text-gray-500">Debit: <strong className="text-gray-800">₹{fmt(balance.total_debit)}</strong></span>
            <span className="text-gray-500">Credit: <strong className="text-gray-800">₹{fmt(balance.total_credit)}</strong></span>
            <span className={`font-bold ${balance.balance_type === 'cr' ? 'text-red-600' : 'text-green-600'}`}>
              Balance: ₹{fmt(balance.balance)} {balance.balance_type.toUpperCase()}
            </span>
          </div>
        )}

        {/* Payment form (inline) */}
        {showPayment && (
          <div className="px-4 py-3 bg-emerald-50 border-b shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-emerald-800">Record Payment</h3>
              <button onClick={() => setShowPayment(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
            </div>
            {payError && <p className="text-xs text-red-600">{payError}</p>}
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] uppercase text-gray-500 font-semibold">Amount *</label>
                <input type="number" value={payForm.amount} onChange={(e) => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-[10px] uppercase text-gray-500 font-semibold">Date *</label>
                <input type="date" value={payForm.payment_date} onChange={(e) => setPayForm(f => ({ ...f, payment_date: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="block text-[10px] uppercase text-gray-500 font-semibold">Mode</label>
                <select value={payForm.payment_mode} onChange={(e) => setPayForm(f => ({ ...f, payment_mode: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs">
                  {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase text-gray-500 font-semibold">Ref No.</label>
                <input type="text" value={payForm.reference_no} onChange={(e) => setPayForm(f => ({ ...f, reference_no: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="UTR / Cheque #" />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 items-end">
              {showTDS && (
                <>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={payForm.tds_applicable} onChange={(e) => setPayForm(f => ({ ...f, tds_applicable: e.target.checked }))} />
                    TDS
                  </label>
                  {payForm.tds_applicable && (
                    <>
                      <select value={payForm.tds_section} onChange={(e) => setPayForm(f => ({ ...f, tds_section: e.target.value }))}
                        className="rounded border border-gray-300 px-2 py-1 text-xs">
                        <option value="">Section</option>
                        {TDS_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      <input type="number" value={payForm.tds_rate} onChange={(e) => setPayForm(f => ({ ...f, tds_rate: e.target.value }))}
                        className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Rate %" />
                    </>
                  )}
                </>
              )}
              {showTCS && (
                <>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={payForm.tcs_applicable} onChange={(e) => setPayForm(f => ({ ...f, tcs_applicable: e.target.checked }))} />
                    TCS
                  </label>
                  {payForm.tcs_applicable && (
                    <>
                      <select value={payForm.tcs_section} onChange={(e) => setPayForm(f => ({ ...f, tcs_section: e.target.value }))}
                        className="rounded border border-gray-300 px-2 py-1 text-xs">
                        <option value="">Section</option>
                        {TCS_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      <input type="number" value={payForm.tcs_rate} onChange={(e) => setPayForm(f => ({ ...f, tcs_rate: e.target.value }))}
                        className="rounded border border-gray-300 px-2 py-1 text-xs" placeholder="Rate %" />
                    </>
                  )}
                </>
              )}
              <button onClick={handlePayment} disabled={saving}
                className="rounded bg-emerald-600 text-white px-3 py-1 text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 col-start-4">
                {saving ? 'Saving...' : 'Save Payment'}
              </button>
            </div>
          </div>
        )}

        {/* Ledger table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No ledger entries yet</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold">Date</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold">Particular</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-semibold">Debit</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-semibold">Credit</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {withBalance.map((e) => (
                  <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">
                      {new Date(e.entry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold mr-1 ${ENTRY_COLORS[e.entry_type] || 'bg-gray-100 text-gray-600'}`}>
                        {e.entry_type.toUpperCase()}
                      </span>
                      <span className="text-gray-800">{e.description}</span>
                      {e.notes && <p className="text-[10px] text-gray-400 mt-0.5">{e.notes}</p>}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium text-gray-800">{fmt(e.debit)}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-gray-800">{fmt(e.credit)}</td>
                    <td className={`px-3 py-1.5 text-right font-bold ${e.running >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      ₹{fmt(Math.abs(e.running))} {e.running >= 0 ? (partyType === 'customer' ? 'Dr' : 'Cr') : (partyType === 'customer' ? 'Cr' : 'Dr')}
                    </td>
                  </tr>
                ))}
              </tbody>
              {balance && (
                <tfoot className="bg-gray-50 font-bold">
                  <tr>
                    <td className="px-3 py-2" colSpan={2}>Totals</td>
                    <td className="px-3 py-2 text-right">₹{fmt(balance.total_debit)}</td>
                    <td className="px-3 py-2 text-right">₹{fmt(balance.total_credit)}</td>
                    <td className={`px-3 py-2 text-right ${balance.balance_type === 'cr' ? 'text-red-600' : 'text-green-600'}`}>
                      ₹{fmt(balance.balance)} {balance.balance_type.toUpperCase()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
