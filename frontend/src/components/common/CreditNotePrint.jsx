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
  const additional = Number(sr.additional_amount) || 0
  const taxAmt = Number(sr.tax_amount) || 0
  const total = Number(sr.total_amount) || 0
  const taxableValue = subtotal - discount + additional

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
          @page's 10mm is the physical margin. The top-half container is
          exactly 138.5mm tall so the cut line lands at 148.5mm (A4 midpoint). */}
      <div ref={printRef} style={{ width: '210mm', minHeight: '297mm', background: '#fff', padding: 0, fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", color: '#1f2937', fontSize: '13px', lineHeight: '1.5' }}>

        {/* TOP HALF — full width, no margin, no overflow clip.
            Height pinned so the cut band sits at A4 midpoint. */}
        <div style={{ height: '138.5mm', display: 'flex', flexDirection: 'column', padding: '4mm' }}>

          {/* Header strip — larger CN title, date/number stacked right */}
          <div style={{ borderBottom: '3px solid #059669', paddingBottom: '8px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <h1 style={{ fontSize: '30px', fontWeight: 800, color: '#059669', margin: 0, letterSpacing: '-0.5px', lineHeight: 1 }}>CREDIT NOTE</h1>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '20px', fontWeight: 800, color: '#1f2937', margin: 0, lineHeight: 1 }}>{sr.credit_note_no}</p>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0' }}>Date: {fmtDate(sr.restocked_date || sr.return_date || sr.created_at)}</p>
            </div>
          </div>

          {/* Supplier / Recipient — side by side, bigger body text */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
            <div style={{ background: '#f9fafb', borderRadius: '4px', padding: '8px 10px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>From (Supplier)</p>
              <p style={{ fontSize: '14px', fontWeight: 800, margin: 0 }}>{co.name || '—'}</p>
              {co.address && <p style={{ fontSize: '12px', color: '#374151', margin: '2px 0 0' }}>{co.address}{co.city ? `, ${co.city}` : ''}{co.state ? `, ${co.state}` : ''}{co.pin_code ? ` - ${co.pin_code}` : ''}</p>}
              {co.gst_no && <p style={{ fontSize: '12px', fontWeight: 600, margin: '2px 0 0' }}>GSTIN: <span style={{ color: '#059669' }}>{co.gst_no}</span>{co.state_code ? ` | State: ${co.state_code}` : ''}</p>}
              {co.phone && <p style={{ fontSize: '12px', color: '#374151', margin: '2px 0 0' }}>Phone: {co.phone}</p>}
            </div>
            <div style={{ background: '#f9fafb', borderRadius: '4px', padding: '8px 10px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>To (Recipient)</p>
              <p style={{ fontSize: '14px', fontWeight: 800, margin: 0 }}>{sr.customer?.name || '—'}</p>
              {sr.customer?.city && <p style={{ fontSize: '12px', color: '#374151', margin: '2px 0 0' }}>{sr.customer.city}{sr.customer.state ? `, ${sr.customer.state}` : ''}</p>}
              {sr.customer?.gst_no && <p style={{ fontSize: '12px', fontWeight: 600, margin: '2px 0 0' }}>GSTIN: <span style={{ color: '#059669' }}>{sr.customer.gst_no}</span></p>}
              {sr.customer?.phone && <p style={{ fontSize: '12px', color: '#374151', margin: '2px 0 0' }}>Phone: {sr.customer.phone}</p>}
            </div>
          </div>

          {/* Reference block — invoice + reason, full width */}
          <div style={{ border: '1px dashed #9ca3af', borderRadius: '4px', padding: '8px 12px', marginBottom: '8px' }}>
            <table style={{ width: '100%', fontSize: '13px' }}>
              <tbody>
                {originalInvNo && (
                  <tr>
                    <td style={{ color: '#6b7280', padding: '2px 8px 2px 0', width: '22%', fontWeight: 600 }}>Original Invoice:</td>
                    <td style={{ fontWeight: 800, color: '#059669' }}>{originalInvNo}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ color: '#6b7280', padding: '2px 8px 2px 0', fontWeight: 600 }}>Sales Return:</td>
                  <td style={{ fontWeight: 700 }}>{sr.srn_no}</td>
                </tr>
                {sr.order && (
                  <tr>
                    <td style={{ color: '#6b7280', padding: '2px 8px 2px 0', fontWeight: 600 }}>Order:</td>
                    <td style={{ fontWeight: 700 }}>{sr.order.order_number}</td>
                  </tr>
                )}
                {sr.reason_summary && (
                  <tr>
                    <td style={{ color: '#6b7280', padding: '2px 8px 2px 0', verticalAlign: 'top', fontWeight: 600 }}>Reason:</td>
                    <td style={{ fontStyle: 'italic', color: '#374151' }}>{sr.reason_summary}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tax breakup — the document's main focus. Larger type. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
            <div>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Amount in Words</p>
              <p style={{ fontSize: '13px', fontWeight: 600, fontStyle: 'italic', padding: '8px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', margin: 0, color: '#065f46' }}>
                {numberToWordsIN(total)}
              </p>
            </div>
            <div style={{ border: '2px solid #059669', borderRadius: '4px', padding: '6px 12px', background: '#f0fdf4' }}>
              <table style={{ width: '100%', fontSize: '13px' }}>
                <tbody>
                  <tr>
                    <td style={{ color: '#374151', padding: '2px 0' }}>Taxable Value</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtCurrency(taxableValue)}</td>
                  </tr>
                  {discount > 0 && (
                    <tr>
                      <td style={{ color: '#d97706', padding: '2px 0' }}>(Discount applied)</td>
                      <td style={{ textAlign: 'right', color: '#d97706', fontWeight: 600 }}>-{fmtCurrency(discount)}</td>
                    </tr>
                  )}
                  {additional > 0 && (
                    <tr>
                      <td style={{ color: '#2563eb', padding: '2px 0' }}>(Additional)</td>
                      <td style={{ textAlign: 'right', color: '#2563eb', fontWeight: 600 }}>+{fmtCurrency(additional)}</td>
                    </tr>
                  )}
                  {gstPct > 0 && (
                    <>
                      <tr>
                        <td style={{ color: '#374151', padding: '2px 0' }}>CGST ({gstPct / 2}%)</td>
                        <td style={{ textAlign: 'right' }}>{fmtCurrency(taxAmt / 2)}</td>
                      </tr>
                      <tr>
                        <td style={{ color: '#374151', padding: '2px 0' }}>SGST ({gstPct / 2}%)</td>
                        <td style={{ textAlign: 'right' }}>{fmtCurrency(taxAmt / 2)}</td>
                      </tr>
                    </>
                  )}
                  <tr style={{ borderTop: '2px solid #059669' }}>
                    <td style={{ fontSize: '15px', fontWeight: 800, color: '#059669', padding: '5px 0 0' }}>TOTAL CREDIT</td>
                    <td style={{ fontSize: '17px', fontWeight: 800, color: '#059669', textAlign: 'right', padding: '5px 0 0' }}>{fmtCurrency(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Flex-grow pushes bottom strip to the end of the top half */}
          <div style={{ flex: '1 1 auto' }} />

          {/* Bottom strip — hint + bank + signature, all in footer row */}
          <div style={{ fontSize: '12px', color: '#374151', marginBottom: '6px', fontStyle: 'italic' }}>
            For itemized goods received + condition notes, refer to Sales Return <strong style={{ color: '#059669' }}>{sr.srn_no}</strong>.
          </div>
          {co.bank_name && (
            <div style={{ fontSize: '12px', color: '#374151', marginBottom: '6px' }}>
              <strong style={{ color: '#1f2937' }}>Refund A/C:</strong> {co.bank_name} · A/C <strong>{co.bank_account || '—'}</strong> · IFSC <strong>{co.bank_ifsc || '—'}</strong>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '6px', borderTop: '1px solid #d1d5db' }}>
            <div style={{ fontSize: '10px', color: '#9ca3af', maxWidth: '55%' }}>
              Computer-generated. Per GST Rule 53(1A), original invoice reference is binding for credit note validity.
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '140px', borderBottom: '1px solid #6b7280', marginBottom: '3px', height: '20px' }}>&nbsp;</div>
              <p style={{ fontSize: '11px', color: '#1f2937', margin: 0, fontWeight: 700 }}>Authorised Signatory</p>
              <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>{co.name || 'Supplier'}</p>
            </div>
          </div>
        </div>
        {/* END TOP HALF (138.5mm) */}

        {/* Tear line sits exactly at the middle of the A4 (148.5mm from top).
            Top half = CN content (above). Bottom half = blank for counterfoil. */}
        <div style={{ height: '10mm', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#9ca3af', padding: '0 10mm' }}>
          <span style={{ flex: 1, borderTop: '1px dashed #d1d5db' }}></span>
          <span style={{ fontStyle: 'italic', whiteSpace: 'nowrap' }}>✂ cut here — bottom half for counterfoil / filing</span>
          <span style={{ flex: 1, borderTop: '1px dashed #d1d5db' }}></span>
        </div>
      </div>
    </div>
  )
}
