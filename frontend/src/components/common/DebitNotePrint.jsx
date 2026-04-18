import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtCurrency = (v) => `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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
 * DebitNotePrint — GST-compliant Debit Note summary (purchase-side mirror of CreditNote).
 *
 * A Debit Note is issued by us (the buyer) to the supplier when we reclaim
 * amount for defective/excess/wrong goods returned. It references the
 * original purchase invoice. Per GST Rule 53(1A) the legal requirements are
 * supplier/recipient GSTINs, original invoice reference, reason, tax
 * breakup, signature — NOT an itemized SKU list. The itemized goods belong
 * on the Return Note (ReturnNotePrint.jsx).
 *
 * Layout: A4 portrait, content in the TOP HALF only. Cut line at exact
 * midpoint (148.5mm). Bottom half blank for counterfoil or filing.
 *
 * Props: note (ReturnNoteResponse with debit_note_no),
 *        company (full company object), onClose
 */
export default function DebitNotePrint({ note, company, onClose }) {
  const printRef = useRef(null)
  const rn = note || {}
  const co = company || {}

  const gstPct = Number(rn.gst_percent) || 0
  const subtotal = Number(rn.subtotal) || 0
  const discount = Number(rn.discount_amount) || 0
  const taxAmt = Number(rn.tax_amount) || 0
  const total = Number(rn.total_amount) || 0
  const taxableValue = subtotal - discount

  const originalPurchaseInvNo = rn.supplier_invoice?.invoice_no || rn.supplier_invoice_no || null

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `DebitNote-${rn.debit_note_no}`,
    pageStyle: `@page { size: A4 portrait; margin: 10mm; } * { box-sizing: border-box; } body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center overflow-auto">
      {/* Toolbar */}
      <div className="w-full max-w-[220mm] mt-4 mb-3 flex items-center justify-between bg-white rounded-xl px-5 py-3 shadow-lg">
        <div>
          <span className="font-semibold text-gray-800">Debit Note {rn.debit_note_no}</span>
          <span className="ml-2 typo-caption">· half-page GST summary</span>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="rounded-lg bg-emerald-600 text-white px-4 py-2 typo-btn-sm hover:bg-emerald-700 transition-colors">Print</button>
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">Close</button>
        </div>
      </div>

      {/* A4 Document */}
      <div ref={printRef} style={{ width: '210mm', minHeight: '297mm', background: '#fff', padding: 0, fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", color: '#1f2937', fontSize: '13px', lineHeight: '1.5' }}>

        {/* TOP HALF — fixed 138.5mm so cut line lands at 148.5mm (A4 midpoint) */}
        <div style={{ height: '138.5mm', display: 'flex', flexDirection: 'column', padding: '4mm' }}>

          {/* Header */}
          <div style={{ borderBottom: '3px solid #059669', paddingBottom: '8px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <h1 style={{ fontSize: '30px', fontWeight: 800, color: '#059669', margin: 0, letterSpacing: '-0.5px', lineHeight: 1 }}>DEBIT NOTE</h1>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '20px', fontWeight: 800, color: '#1f2937', margin: 0, lineHeight: 1 }}>{rn.debit_note_no}</p>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0' }}>Date: {fmtDate(rn.dispatch_date || rn.return_date || rn.created_at)}</p>
            </div>
          </div>

          {/* From (us) / To (supplier) — purchase-side flips the direction vs CN */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
            <div style={{ background: '#f9fafb', borderRadius: '4px', padding: '8px 10px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>From (Buyer)</p>
              <p style={{ fontSize: '14px', fontWeight: 800, margin: 0 }}>{co.name || '—'}</p>
              {co.address && <p style={{ fontSize: '12px', color: '#374151', margin: '2px 0 0' }}>{co.address}{co.city ? `, ${co.city}` : ''}{co.state ? `, ${co.state}` : ''}{co.pin_code ? ` - ${co.pin_code}` : ''}</p>}
              {co.gst_no && <p style={{ fontSize: '12px', fontWeight: 600, margin: '2px 0 0' }}>GSTIN: <span style={{ color: '#059669' }}>{co.gst_no}</span>{co.state_code ? ` | State: ${co.state_code}` : ''}</p>}
              {co.phone && <p style={{ fontSize: '12px', color: '#374151', margin: '2px 0 0' }}>Phone: {co.phone}</p>}
            </div>
            <div style={{ background: '#f9fafb', borderRadius: '4px', padding: '8px 10px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>To (Supplier)</p>
              <p style={{ fontSize: '14px', fontWeight: 800, margin: 0 }}>{rn.supplier?.name || '—'}</p>
              {rn.supplier?.city && <p style={{ fontSize: '12px', color: '#374151', margin: '2px 0 0' }}>{rn.supplier.city}{rn.supplier.state ? `, ${rn.supplier.state}` : ''}</p>}
              {rn.supplier?.gst_no && <p style={{ fontSize: '12px', fontWeight: 600, margin: '2px 0 0' }}>GSTIN: <span style={{ color: '#059669' }}>{rn.supplier.gst_no}</span></p>}
              {rn.supplier?.phone && <p style={{ fontSize: '12px', color: '#374151', margin: '2px 0 0' }}>Phone: {rn.supplier.phone}</p>}
            </div>
          </div>

          {/* Reference */}
          <div style={{ border: '1px dashed #9ca3af', borderRadius: '4px', padding: '8px 12px', marginBottom: '8px' }}>
            <table style={{ width: '100%', fontSize: '13px' }}>
              <tbody>
                {originalPurchaseInvNo && (
                  <tr>
                    <td style={{ color: '#6b7280', padding: '2px 8px 2px 0', width: '22%', fontWeight: 600 }}>Purchase Invoice:</td>
                    <td style={{ fontWeight: 800, color: '#059669' }}>{originalPurchaseInvNo}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ color: '#6b7280', padding: '2px 8px 2px 0', fontWeight: 600 }}>Return Note:</td>
                  <td style={{ fontWeight: 700 }}>{rn.return_note_no}</td>
                </tr>
                <tr>
                  <td style={{ color: '#6b7280', padding: '2px 8px 2px 0', fontWeight: 600 }}>Return Type:</td>
                  <td style={{ fontWeight: 700 }}>{rn.return_type === 'roll_return' ? 'Rolls' : 'SKUs'}</td>
                </tr>
                {rn.dispatch_date && (
                  <tr>
                    <td style={{ color: '#6b7280', padding: '2px 8px 2px 0', fontWeight: 600 }}>Dispatched:</td>
                    <td>{fmtDate(rn.dispatch_date)}{rn.lr_number ? ` · LR ${rn.lr_number}` : ''}</td>
                  </tr>
                )}
                {rn.notes && (
                  <tr>
                    <td style={{ color: '#6b7280', padding: '2px 8px 2px 0', verticalAlign: 'top', fontWeight: 600 }}>Reason:</td>
                    <td style={{ fontStyle: 'italic', color: '#374151' }}>{rn.notes}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tax breakup */}
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
                      <td style={{ color: '#d97706', padding: '2px 0' }}>(Discount)</td>
                      <td style={{ textAlign: 'right', color: '#d97706', fontWeight: 600 }}>-{fmtCurrency(discount)}</td>
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
                    <td style={{ fontSize: '15px', fontWeight: 800, color: '#059669', padding: '5px 0 0' }}>TOTAL DEBIT</td>
                    <td style={{ fontSize: '17px', fontWeight: 800, color: '#059669', textAlign: 'right', padding: '5px 0 0' }}>{fmtCurrency(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ flex: '1 1 auto' }} />

          {/* Footer strip */}
          <div style={{ fontSize: '12px', color: '#374151', marginBottom: '6px', fontStyle: 'italic' }}>
            For itemized goods returned + condition notes, refer to Return Note <strong style={{ color: '#059669' }}>{rn.return_note_no}</strong>.
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '6px', borderTop: '1px solid #d1d5db' }}>
            <div style={{ fontSize: '10px', color: '#9ca3af', maxWidth: '55%' }}>
              Computer-generated. Per GST Rule 53(1A), original purchase invoice reference is binding for debit note validity.
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '140px', borderBottom: '1px solid #6b7280', marginBottom: '3px', height: '20px' }}>&nbsp;</div>
              <p style={{ fontSize: '11px', color: '#1f2937', margin: 0, fontWeight: 700 }}>Authorised Signatory</p>
              <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>{co.name || 'Buyer'}</p>
            </div>
          </div>
        </div>
        {/* END TOP HALF */}

        {/* Cut line at A4 midpoint (148.5mm) */}
        <div style={{ height: '10mm', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#9ca3af', padding: '0 10mm' }}>
          <span style={{ flex: 1, borderTop: '1px dashed #d1d5db' }}></span>
          <span style={{ fontStyle: 'italic', whiteSpace: 'nowrap' }}>✂ cut here — bottom half for counterfoil / filing</span>
          <span style={{ flex: 1, borderTop: '1px dashed #d1d5db' }}></span>
        </div>
      </div>
    </div>
  )
}
