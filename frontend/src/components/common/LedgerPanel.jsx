import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLedger, getPartyBalance, recordPayment } from '../../api/ledger'
import { getOnAccountBalance } from '../../api/paymentReceipts'
import PaymentForm, { emptyPaymentForm } from './PaymentForm'

// Map a ledger entry's reference_type + reference_id to a deep-link URL.
// Returns null when the entry has no navigable source document.
function deepLinkFor(entry) {
  if (!entry?.reference_id || !entry?.reference_type) return null
  const t = entry.reference_type
  const id = entry.reference_id
  if (t === 'invoice' || t === 'invoice_cancel') return `/invoices?open=${id}`
  if (t === 'sales_return') return `/returns?tab=sales&open=${id}`
  if (t === 'purchase_invoice' || t === 'supplier_invoice') return `/rolls?tab=purchases&open=${id}`
  if (t === 'return_note') return `/returns?tab=purchase&open=${id}`
  if (t === 'job_challan' || t === 'challan') return `/challans?open=${id}`
  // S123: receipt-level entry (on-account residue, TDS/TCS) → open receipt detail
  if (t === 'payment_receipt') return `/payments?open=${id}`
  // S123: payment_allocation reference_id is the allocation row, not the
  // receipt — we can't deep-link to that without a backend lookup. The
  // description already contains the linked invoice number, so we render a
  // textual INV-XXXX hyperlink in the description renderer instead.
  return null
}

// Render description with embedded INV-XXXX as a clickable link (S123 — for
// payment_allocation rows where deepLinkFor returns null).
function renderDescriptionWithInvLinks(description, navigate, onClose) {
  if (!description) return null
  const re = /\b(INV-\d{3,})\b/g
  const parts = []
  let last = 0
  let m
  while ((m = re.exec(description)) !== null) {
    if (m.index > last) parts.push(description.slice(last, m.index))
    const inv = m[1]
    parts.push(
      <button
        key={`${inv}-${m.index}`}
        type="button"
        onClick={(ev) => {
          ev.stopPropagation()
          onClose?.()
          navigate(`/invoices?open=${inv}`)
        }}
        className="text-emerald-700 hover:text-emerald-900 hover:underline font-mono"
      >
        {inv}
      </button>,
    )
    last = m.index + inv.length
  }
  if (last < description.length) parts.push(description.slice(last))
  return parts
}

const ENTRY_COLORS = {
  opening: 'bg-blue-50 text-blue-700',
  invoice: 'bg-emerald-50 text-emerald-700',
  challan: 'bg-amber-50 text-amber-700',
  payment: 'bg-green-50 text-green-700',
  tds: 'bg-orange-50 text-orange-700',
  tcs: 'bg-purple-50 text-purple-700',
  adjustment: 'bg-gray-50 text-gray-600',
}

function fmt(n) {
  if (n == null || n === 0) return ''
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function LedgerPanel({ open, onClose, partyType, partyId, partyName }) {
  const navigate = useNavigate()
  const [entries, setEntries] = useState([])
  const [balance, setBalance] = useState(null)
  const [onAccount, setOnAccount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showPayment, setShowPayment] = useState(false)
  const [payForm, setPayForm] = useState(emptyPaymentForm())
  const [saving, setSaving] = useState(false)
  const [payError, setPayError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!partyType || !partyId) return
    setLoading(true)
    try {
      const [ledgerRes, balRes] = await Promise.all([
        getLedger(partyType, partyId, { page_size: 0 }),
        getPartyBalance(partyType, partyId),
      ])
      setEntries(ledgerRes.data.data?.data || [])
      setBalance(balRes.data.data)
      // S123: pull on-account residue for customers (other party types defer to v2)
      if (partyType === 'customer') {
        try {
          const oaRes = await getOnAccountBalance(partyId)
          setOnAccount(Number(oaRes.data?.data?.balance || 0))
        } catch {
          setOnAccount(0)
        }
      } else {
        setOnAccount(0)
      }
    } catch {
      setEntries([])
      setBalance(null)
      setOnAccount(0)
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
      setPayForm(emptyPaymentForm())
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

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-4xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-white flex items-center justify-between shrink-0">
          <div>
            <h2 className="typo-modal-title text-white">{partyName}</h2>
            <p className="typo-badge text-emerald-100 capitalize">{partyType.replace('_', ' ')} Ledger</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPayment(true)}
              className="rounded bg-white/20 px-3 py-1 typo-btn-sm hover:bg-white/30">
              Record Payment
            </button>
            <button onClick={onClose} className="rounded bg-white/20 px-2 py-1 typo-btn-sm hover:bg-white/30">✕</button>
          </div>
        </div>

        {/* Balance summary */}
        {balance && (
          <div className="px-4 py-2 bg-gray-50 border-b flex items-center flex-wrap gap-x-4 gap-y-1 typo-caption shrink-0">
            <span className="text-gray-500">Debit: <strong className="typo-data text-gray-800">₹{fmt(balance.total_debit)}</strong></span>
            <span className="text-gray-500">Credit: <strong className="typo-data text-gray-800">₹{fmt(balance.total_credit)}</strong></span>
            <span className={`typo-data ${balance.balance_type === 'cr' ? 'text-red-600' : 'text-green-600'}`}>
              {partyType === 'customer' ? 'Outstanding' : 'Balance'}: ₹{fmt(balance.balance)} {balance.balance_type.toUpperCase()}
            </span>
            {partyType === 'customer' && onAccount > 0.005 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 border border-sky-200 typo-data text-sky-700">
                On-Account: <strong>₹{fmt(onAccount)}</strong>
              </span>
            )}
          </div>
        )}

        {/* Payment form (inline) */}
        {showPayment && (
          <div className="px-4 py-3 bg-emerald-50 border-b shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="typo-badge text-emerald-800">Record Payment</h3>
              <button onClick={() => setShowPayment(false)} className="typo-btn-sm text-gray-500 hover:text-gray-700">Cancel</button>
            </div>
            <PaymentForm value={payForm} onChange={setPayForm} partyType={partyType} error={payError} />
            <div className="flex justify-end pt-1">
              <button onClick={handlePayment} disabled={saving}
                className="rounded bg-emerald-600 text-white px-3 py-1 typo-btn-sm hover:bg-emerald-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Payment'}
              </button>
            </div>
          </div>
        )}

        {/* Ledger table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 typo-empty">No ledger entries yet</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="bg-emerald-600 sticky top-0">
                <tr>
                  <th className="typo-th text-left px-4 py-2.5 text-white border-r border-emerald-500 w-24">Date</th>
                  <th className="typo-th text-left px-4 py-2.5 text-white border-r border-emerald-500">Particular</th>
                  <th className="typo-th text-right px-4 py-2.5 text-white border-r border-emerald-500 w-32">Debit</th>
                  <th className="typo-th text-right px-4 py-2.5 text-white border-r border-emerald-500 w-32">Credit</th>
                  <th className="typo-th text-right px-4 py-2.5 text-white w-40">Balance</th>
                </tr>
              </thead>
              <tbody>
                {withBalance.map((e, i) => (
                  <tr key={e.id} className={`border-b border-gray-100 hover:bg-emerald-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-4 py-2 typo-td text-gray-500 whitespace-nowrap border-r border-gray-100">
                      {new Date(e.entry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-4 py-2 border-r border-gray-100">
                      <div className="flex items-start gap-2">
                        <span className={`inline-block shrink-0 rounded px-1.5 py-0.5 typo-badge mt-0.5 ${ENTRY_COLORS[e.entry_type] || 'bg-gray-100 text-gray-600'}`}>
                          {e.entry_type.charAt(0).toUpperCase() + e.entry_type.slice(1)}
                        </span>
                        {(() => {
                          const href = deepLinkFor(e)
                          if (href) {
                            return (
                              <button
                                onClick={() => { onClose?.(); navigate(href) }}
                                className="typo-td text-emerald-700 hover:text-emerald-900 hover:underline text-left"
                                title="Open source document"
                              >
                                {e.description}
                              </button>
                            )
                          }
                          // payment_allocation has no direct deep-link, but its
                          // description carries INV-XXXX inline — render those
                          // as click-throughs to the invoice detail.
                          if (e.reference_type === 'payment_allocation') {
                            return (
                              <span className="typo-td text-gray-800">
                                {renderDescriptionWithInvLinks(e.description, navigate, onClose)}
                              </span>
                            )
                          }
                          return <span className="typo-td text-gray-800">{e.description}</span>
                        })()}
                      </div>
                      {e.notes && <p className="typo-caption mt-0.5">{e.notes}</p>}
                    </td>
                    <td className="px-4 py-2 text-right typo-td tabular-nums border-r border-gray-100">{fmt(e.debit)}</td>
                    <td className="px-4 py-2 text-right typo-td tabular-nums border-r border-gray-100">{fmt(e.credit)}</td>
                    <td className={`px-4 py-2 text-right typo-data whitespace-nowrap tabular-nums ${e.running >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      ₹{fmt(Math.abs(e.running))} {e.running >= 0 ? (partyType === 'customer' ? 'Dr' : 'Cr') : (partyType === 'customer' ? 'Cr' : 'Dr')}
                    </td>
                  </tr>
                ))}
              </tbody>
              {balance && (
                <tfoot className="bg-emerald-50 border-t-2 border-emerald-200 sticky bottom-0">
                  <tr>
                    <td className="px-4 py-2.5 typo-data border-r border-emerald-200" colSpan={2}>Totals</td>
                    <td className="px-4 py-2.5 text-right typo-data tabular-nums border-r border-emerald-200">₹{fmt(balance.total_debit)}</td>
                    <td className="px-4 py-2.5 text-right typo-data tabular-nums border-r border-emerald-200">₹{fmt(balance.total_credit)}</td>
                    <td className={`px-4 py-2.5 text-right typo-data tabular-nums whitespace-nowrap ${balance.balance_type === 'cr' ? 'text-red-600' : 'text-green-600'}`}>
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
