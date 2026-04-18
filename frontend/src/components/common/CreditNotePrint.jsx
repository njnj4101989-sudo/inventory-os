import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtCurrency = (v) => `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * CreditNotePrint — A4 GST-compliant credit note document.
 * Generated from a closed SalesReturn with credit_note_no.
 * Props: salesReturn (SalesReturnResponse with credit_note_no), company (full company object), onClose
 */
export default function CreditNotePrint({ salesReturn, company, onClose }) {
  const printRef = useRef(null)
  const sr = salesReturn || {}
  const co = company || {}

  const gstPct = sr.gst_percent || 0
  const subtotal = sr.subtotal || 0
  const discount = sr.discount_amount || 0
  const taxAmt = sr.tax_amount || 0
  const total = sr.total_amount || 0

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `CreditNote-${sr.credit_note_no}`,
    pageStyle: `@page { size: A4 portrait; margin: 15mm; } * { box-sizing: border-box; } body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center overflow-auto">
      {/* Toolbar */}
      <div className="w-full max-w-[220mm] mt-4 mb-3 flex items-center justify-between bg-white rounded-xl px-5 py-3 shadow-lg">
        <span className="font-semibold text-gray-800">Credit Note {sr.credit_note_no}</span>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="rounded-lg bg-emerald-600 text-white px-4 py-2 typo-btn-sm hover:bg-emerald-700 transition-colors">Print</button>
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">Close</button>
        </div>
      </div>

      {/* A4 Document */}
      <div ref={printRef} style={{ width: '210mm', minHeight: '297mm', background: '#fff', padding: '15mm', fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", color: '#1f2937', fontSize: '12px', lineHeight: '1.5' }}>

        {/* Header */}
        <div style={{ borderBottom: '3px solid #059669', paddingBottom: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#059669', margin: 0, letterSpacing: '-0.5px' }}>CREDIT NOTE</h1>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '4px 0 0' }}>{co.name || 'Company'}</p>
            {co.address && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>{co.address}{co.city ? `, ${co.city}` : ''}{co.state ? `, ${co.state}` : ''}{co.pin_code ? ` - ${co.pin_code}` : ''}</p>}
            {co.gst_no && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>GSTIN: {co.gst_no}{co.state_code ? ` | State: ${co.state_code}` : ''}</p>}
            {co.phone && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>Phone: {co.phone}{co.email ? ` | ${co.email}` : ''}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '13px', fontWeight: 600 }}>{sr.credit_note_no}</p>
            <p style={{ fontSize: '11px', color: '#6b7280' }}>Date: {fmtDate(sr.restocked_date || sr.return_date || sr.created_at)}</p>
            <p style={{ fontSize: '11px', color: '#6b7280' }}>Against: {sr.srn_no}</p>
            {sr.order && <p style={{ fontSize: '11px', color: '#6b7280' }}>Order: {sr.order.order_number}</p>}
          </div>
        </div>

        {/* Customer info */}
        <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
          <div style={{ flex: 1, background: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>Credit To</p>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{sr.customer?.name || '—'}</p>
            {sr.customer?.phone && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>Phone: {sr.customer.phone}</p>}
            {sr.customer?.city && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>{sr.customer.city}{sr.customer.state ? `, ${sr.customer.state}` : ''}</p>}
            {sr.customer?.gst_no && <p style={{ fontSize: '11px', fontWeight: 600, margin: '2px 0 0' }}>GSTIN: {sr.customer.gst_no}</p>}
          </div>
          <div style={{ flex: 1, background: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>Reference</p>
            <p style={{ fontSize: '12px', margin: '2px 0' }}>Sales Return: <strong>{sr.srn_no}</strong></p>
            {sr.order && <p style={{ fontSize: '12px', margin: '2px 0' }}>Order: <strong>{sr.order.order_number}</strong></p>}
            {sr.reason_summary && <p style={{ fontSize: '12px', margin: '2px 0' }}>Reason: {sr.reason_summary}</p>}
            <p style={{ fontSize: '12px', margin: '2px 0' }}>Return Date: {fmtDate(sr.return_date)}</p>
          </div>
        </div>

        {/* Line items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              {['#', 'SKU Code', 'Description', 'Size', 'Qty', 'Rate', 'Amount'].map(h => (
                <th key={h} style={{ padding: '8px 6px', textAlign: ['Qty', 'Rate', 'Amount'].includes(h) ? 'right' : 'left', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sr.items?.map((item, i) => {
              const qty = item.quantity_restocked || item.quantity_returned || 0
              const price = item.unit_price || item.order_item?.unit_price || 0
              const amt = qty * price
              return (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 6px', color: '#9ca3af' }}>{i + 1}</td>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>{item.sku?.sku_code || '—'}</td>
                  <td style={{ padding: '8px 6px', color: '#6b7280' }}>{item.sku?.product_name || '—'}</td>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>{item.sku?.size || '—'}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{qty}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtCurrency(price)}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(amt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Tax breakdown */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '280px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
              <span style={{ color: '#6b7280' }}>Subtotal</span>
              <span style={{ fontWeight: 600 }}>{fmtCurrency(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                <span style={{ color: '#f59e0b' }}>Discount</span>
                <span style={{ color: '#f59e0b' }}>-{fmtCurrency(discount)}</span>
              </div>
            )}
            {gstPct > 0 && (<>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                <span style={{ color: '#6b7280' }}>CGST ({gstPct / 2}%)</span>
                <span>{fmtCurrency(taxAmt / 2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                <span style={{ color: '#6b7280' }}>SGST ({gstPct / 2}%)</span>
                <span>{fmtCurrency(taxAmt / 2)}</span>
              </div>
            </>)}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', marginTop: '4px', borderTop: '2px solid #059669', fontSize: '16px', fontWeight: 800 }}>
              <span>Credit Amount</span>
              <span>{fmtCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Bank Details */}
        {co.bank_name && (
          <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '12px', marginTop: '24px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>Bank Details (for refund)</p>
            <p style={{ fontSize: '12px', margin: '2px 0' }}>Bank: <strong>{co.bank_name}</strong></p>
            {co.bank_account && <p style={{ fontSize: '12px', margin: '2px 0' }}>A/C No: <strong>{co.bank_account}</strong></p>}
            {co.bank_ifsc && <p style={{ fontSize: '12px', margin: '2px 0' }}>IFSC: <strong>{co.bank_ifsc}</strong>{co.bank_branch ? ` | Branch: ${co.bank_branch}` : ''}</p>}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>This is a computer-generated credit note.</p>
          </div>
          <div style={{ display: 'flex', gap: '60px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '130px', borderBottom: '1px solid #d1d5db', marginBottom: '4px' }}>&nbsp;</div>
              <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>Customer Signature</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '130px', borderBottom: '1px solid #d1d5db', marginBottom: '4px' }}>&nbsp;</div>
              <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>Authorized Signatory</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
