import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtCurrency = (v) => `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Number-to-words (Indian system) for the "Amount in Words" line — matches invoice print convention.
function numberToWordsIN(num) {
  const n = Math.round(Number(num) || 0)
  if (n === 0) return 'Zero Rupees Only'
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const two = (x) => x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '')
  const three = (x) => x >= 100 ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x)
  let r = n, parts = []
  const crore = Math.floor(r / 10000000); r %= 10000000
  const lakh = Math.floor(r / 100000); r %= 100000
  const thousand = Math.floor(r / 1000); r %= 1000
  const hundred = r
  if (crore) parts.push(two(crore) + ' Crore')
  if (lakh) parts.push(two(lakh) + ' Lakh')
  if (thousand) parts.push(two(thousand) + ' Thousand')
  if (hundred) parts.push(three(hundred))
  return parts.join(' ') + ' Rupees Only'
}

/**
 * CreditNotePrint — GST-compliant Credit Note summary.
 *
 * Industry-standard CN format: half-page summary with supplier/recipient
 * GST details, original invoice reference, reason, tax breakup, and signature.
 * NO itemized SKU list — that belongs on the Sales Return / Delivery Note
 * (SalesReturnPrint.jsx). Per GST Rule 53(1A) the SKU breakdown is not
 * required on the credit note itself.
 *
 * Layout: A4 portrait, content sits in the TOP HALF only. Print two CNs
 * per A4 if needed (fold at middle). Zero paper waste, matches Tally's
 * default CN voucher print.
 *
 * Props: salesReturn (SalesReturnResponse with credit_note_no),
 *        company (full company object), onClose
 */
export default function CreditNotePrint({ salesReturn, company, onClose }) {
  const printRef = useRef(null)
  const sr = salesReturn || {}
  const co = company || {}

  const gstPct = Number(sr.gst_percent) || 0
  const subtotal = Number(sr.subtotal) || 0
  const discount = Number(sr.discount_amount) || 0
  const taxAmt = Number(sr.tax_amount) || 0
  const total = Number(sr.total_amount) || 0
  const taxableValue = subtotal - discount

  const originalInvNo = sr.invoice?.invoice_number || sr.order?.invoice_number || null

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `CreditNote-${sr.credit_note_no}`,
    // @page handles the physical margin. Inner container has NO extra padding
    // so content starts at the 10mm page margin directly (not stacked).
    pageStyle: `@page { size: A4 portrait; margin: 10mm; } * { box-sizing: border-box; } body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center overflow-auto">
      {/* Toolbar */}
      <div className="w-full max-w-[220mm] mt-4 mb-3 flex items-center justify-between bg-white rounded-xl px-5 py-3 shadow-lg">
        <div>
          <span className="font-semibold text-gray-800">Credit Note {sr.credit_note_no}</span>
          <span className="ml-2 typo-caption">· half-page GST summary</span>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="rounded-lg bg-emerald-600 text-white px-4 py-2 typo-btn-sm hover:bg-emerald-700 transition-colors">Print</button>
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">Close</button>
        </div>
      </div>

      {/* A4 Document — content sits in top half only (half-page layout).
          No outer padding; @page's 10mm is the physical print margin.
          On screen, the 210mm-wide sheet sits inside the modal backdrop. */}
      <div ref={printRef} style={{ width: '210mm', minHeight: '297mm', background: '#fff', padding: 0, fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", color: '#1f2937', fontSize: '11px', lineHeight: '1.45' }}>

        {/* Top-half content card — 6mm inner padding, subtle 2mm frame from page margin */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '6mm', margin: '2mm', position: 'relative' }}>

          {/* Header strip */}
          <div style={{ borderBottom: '2px solid #059669', paddingBottom: '8px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#059669', margin: 0, letterSpacing: '-0.5px' }}>CREDIT NOTE</h1>
              <p style={{ fontSize: '10px', color: '#6b7280', margin: '2px 0 0', fontWeight: 600 }}>GST Rule 53 — Tax Document</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '16px', fontWeight: 800, color: '#1f2937', margin: 0 }}>{sr.credit_note_no}</p>
              <p style={{ fontSize: '10px', color: '#6b7280', margin: '2px 0 0' }}>Date: {fmtDate(sr.restocked_date || sr.return_date || sr.created_at)}</p>
            </div>
          </div>

          {/* Supplier / Recipient blocks — side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
            <div style={{ background: '#f9fafb', borderRadius: '4px', padding: '8px 10px' }}>
              <p style={{ fontSize: '9px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' }}>From (Supplier)</p>
              <p style={{ fontSize: '12px', fontWeight: 700, margin: 0 }}>{co.name || '—'}</p>
              {co.address && <p style={{ fontSize: '10px', color: '#6b7280', margin: '1px 0 0' }}>{co.address}{co.city ? `, ${co.city}` : ''}{co.state ? `, ${co.state}` : ''}{co.pin_code ? ` - ${co.pin_code}` : ''}</p>}
              {co.gst_no && <p style={{ fontSize: '10px', fontWeight: 600, margin: '1px 0 0' }}>GSTIN: {co.gst_no}{co.state_code ? ` | State: ${co.state_code}` : ''}</p>}
              {co.phone && <p style={{ fontSize: '10px', color: '#6b7280', margin: '1px 0 0' }}>Phone: {co.phone}</p>}
            </div>
            <div style={{ background: '#f9fafb', borderRadius: '4px', padding: '8px 10px' }}>
              <p style={{ fontSize: '9px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' }}>To (Recipient)</p>
              <p style={{ fontSize: '12px', fontWeight: 700, margin: 0 }}>{sr.customer?.name || '—'}</p>
              {sr.customer?.city && <p style={{ fontSize: '10px', color: '#6b7280', margin: '1px 0 0' }}>{sr.customer.city}{sr.customer.state ? `, ${sr.customer.state}` : ''}</p>}
              {sr.customer?.gst_no && <p style={{ fontSize: '10px', fontWeight: 600, margin: '1px 0 0' }}>GSTIN: {sr.customer.gst_no}</p>}
              {sr.customer?.phone && <p style={{ fontSize: '10px', color: '#6b7280', margin: '1px 0 0' }}>Phone: {sr.customer.phone}</p>}
            </div>
          </div>

          {/* Reference block — invoice + reason */}
          <div style={{ border: '1px dashed #d1d5db', borderRadius: '4px', padding: '8px 10px', marginBottom: '10px' }}>
            <p style={{ fontSize: '9px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Reference</p>
            <table style={{ width: '100%', fontSize: '11px' }}>
              <tbody>
                {originalInvNo && (
                  <tr>
                    <td style={{ color: '#6b7280', padding: '1px 0', width: '38%' }}>Original Invoice:</td>
                    <td style={{ fontWeight: 700, color: '#059669' }}>{originalInvNo}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ color: '#6b7280', padding: '1px 0' }}>Sales Return:</td>
                  <td style={{ fontWeight: 600 }}>{sr.srn_no}</td>
                </tr>
                {sr.order && (
                  <tr>
                    <td style={{ color: '#6b7280', padding: '1px 0' }}>Order:</td>
                    <td style={{ fontWeight: 600 }}>{sr.order.order_number}</td>
                  </tr>
                )}
                {sr.reason_summary && (
                  <tr>
                    <td style={{ color: '#6b7280', padding: '1px 0', verticalAlign: 'top' }}>Reason:</td>
                    <td style={{ fontStyle: 'italic' }}>{sr.reason_summary}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tax breakup — main focus of the CN */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
            <div>
              <p style={{ fontSize: '9px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Amount in Words</p>
              <p style={{ fontSize: '11px', fontWeight: 600, fontStyle: 'italic', padding: '6px 10px', background: '#f9fafb', borderRadius: '4px', margin: 0 }}>
                {numberToWordsIN(total)}
              </p>
            </div>
            <div style={{ border: '2px solid #059669', borderRadius: '4px', padding: '8px 10px' }}>
              <table style={{ width: '100%', fontSize: '11px' }}>
                <tbody>
                  <tr>
                    <td style={{ color: '#6b7280', padding: '1px 0' }}>Taxable Value</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(taxableValue)}</td>
                  </tr>
                  {discount > 0 && (
                    <tr>
                      <td style={{ color: '#f59e0b', padding: '1px 0' }}>(Discount applied)</td>
                      <td style={{ textAlign: 'right', color: '#f59e0b' }}>-{fmtCurrency(discount)}</td>
                    </tr>
                  )}
                  {gstPct > 0 && (
                    <>
                      <tr>
                        <td style={{ color: '#6b7280', padding: '1px 0' }}>CGST ({gstPct / 2}%)</td>
                        <td style={{ textAlign: 'right' }}>{fmtCurrency(taxAmt / 2)}</td>
                      </tr>
                      <tr>
                        <td style={{ color: '#6b7280', padding: '1px 0' }}>SGST ({gstPct / 2}%)</td>
                        <td style={{ textAlign: 'right' }}>{fmtCurrency(taxAmt / 2)}</td>
                      </tr>
                    </>
                  )}
                  <tr style={{ borderTop: '1px solid #059669' }}>
                    <td style={{ fontSize: '13px', fontWeight: 800, color: '#059669', padding: '4px 0 0' }}>TOTAL CREDIT</td>
                    <td style={{ fontSize: '14px', fontWeight: 800, color: '#059669', textAlign: 'right', padding: '4px 0 0' }}>{fmtCurrency(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Hint pointing to SalesReturn for itemized goods */}
          <p style={{ fontSize: '10px', color: '#6b7280', margin: '0 0 10px', fontStyle: 'italic' }}>
            For itemized goods received + condition notes, refer to Sales Return <strong>{sr.srn_no}</strong>.
          </p>

          {/* Bank details — short line */}
          {co.bank_name && (
            <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '10px' }}>
              <strong style={{ color: '#1f2937' }}>Refund A/C:</strong> {co.bank_name} · A/C {co.bank_account || '—'} · IFSC {co.bank_ifsc || '—'}
            </div>
          )}

          {/* Footer strip — signatures + note */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '8px', borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '9px', color: '#9ca3af' }}>
              Computer-generated document. Registered under GST Rule 53(1A).
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '150px', borderBottom: '1px solid #9ca3af', marginBottom: '3px', height: '22px' }}>&nbsp;</div>
              <p style={{ fontSize: '9px', color: '#6b7280', margin: 0, fontWeight: 600 }}>Authorised Signatory — {co.name || 'Supplier'}</p>
            </div>
          </div>
        </div>

        {/* Tear line between top (content) and bottom (blank half) — printed */}
        <div style={{ marginTop: '8mm', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', color: '#9ca3af' }}>
          <span style={{ flex: 1, borderTop: '1px dashed #d1d5db' }}></span>
          <span style={{ fontStyle: 'italic' }}>cut here — second copy / customer counterfoil can be printed on bottom half</span>
          <span style={{ flex: 1, borderTop: '1px dashed #d1d5db' }}></span>
        </div>
      </div>
    </div>
  )
}
