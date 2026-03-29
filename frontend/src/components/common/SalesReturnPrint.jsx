import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtCurrency = (v) => `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const CONDITION_LABEL = { pending: 'Pending', good: 'Good', damaged: 'Damaged', rejected: 'Rejected' }

/**
 * SalesReturnPrint — A4 customer sales return document.
 * Props: salesReturn (SalesReturnResponse), company (full company object), onClose
 */
export default function SalesReturnPrint({ salesReturn, company, onClose }) {
  const printRef = useRef(null)
  const sr = salesReturn || {}
  const co = company || {}

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `SalesReturn-${sr.srn_no}`,
    pageStyle: `@page { size: A4 portrait; margin: 15mm; } * { box-sizing: border-box; } body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center overflow-auto">
      {/* Toolbar */}
      <div className="w-full max-w-[220mm] mt-4 mb-3 flex items-center justify-between bg-white rounded-xl px-5 py-3 shadow-lg">
        <span className="font-semibold text-gray-800">Sales Return {sr.srn_no}</span>
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
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#059669', margin: 0, letterSpacing: '-0.5px' }}>SALES RETURN</h1>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '4px 0 0' }}>{co.name || 'Company'}</p>
            {co.address && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>{co.address}{co.city ? `, ${co.city}` : ''}{co.state ? `, ${co.state}` : ''}{co.pin_code ? ` - ${co.pin_code}` : ''}</p>}
            {co.gst_no && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>GSTIN: {co.gst_no}</p>}
            {co.phone && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>Phone: {co.phone}{co.email ? ` | ${co.email}` : ''}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '13px', fontWeight: 600 }}>{sr.srn_no}</p>
            <p style={{ fontSize: '11px', color: '#6b7280' }}>Date: {fmtDate(sr.return_date || sr.created_at)}</p>
            {sr.order && <p style={{ fontSize: '11px', color: '#6b7280' }}>Order: {sr.order.order_number}</p>}
            {sr.credit_note_no && <p style={{ fontSize: '11px', fontWeight: 600, color: '#059669' }}>Credit Note: {sr.credit_note_no}</p>}
            <p style={{ display: 'inline-block', marginTop: '4px', padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: sr.status === 'closed' ? '#dcfce7' : sr.status === 'cancelled' ? '#fee2e2' : '#fef3c7', color: sr.status === 'closed' ? '#166534' : sr.status === 'cancelled' ? '#991b1b' : '#92400e' }}>
              {(sr.status || 'draft').toUpperCase()}
            </p>
          </div>
        </div>

        {/* Customer + Return Info */}
        <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
          <div style={{ flex: 1, background: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>Customer</p>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{sr.customer?.name || '—'}</p>
            {sr.customer?.phone && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>Phone: {sr.customer.phone}</p>}
            {sr.customer?.city && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>{sr.customer.city}{sr.customer.state ? `, ${sr.customer.state}` : ''}</p>}
            {sr.customer?.gst_no && <p style={{ fontSize: '11px', fontWeight: 600, margin: '2px 0 0' }}>GSTIN: {sr.customer.gst_no}</p>}
          </div>
          <div style={{ flex: 1, background: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>Return Details</p>
            {sr.reason_summary && <p style={{ fontSize: '12px', margin: '2px 0' }}>Reason: <strong>{sr.reason_summary}</strong></p>}
            {sr.transport && <p style={{ fontSize: '12px', margin: '2px 0' }}>Transport: <strong>{sr.transport.name}</strong></p>}
            {sr.lr_number && <p style={{ fontSize: '12px', margin: '2px 0' }}>L.R. No.: <strong>{sr.lr_number}</strong>{sr.lr_date ? ` | Date: ${fmtDate(sr.lr_date)}` : ''}</p>}
            {sr.received_date && <p style={{ fontSize: '12px', margin: '2px 0' }}>Received: {fmtDate(sr.received_date)}{sr.received_by_user ? ` by ${sr.received_by_user.full_name}` : ''}</p>}
            {sr.inspected_date && <p style={{ fontSize: '12px', margin: '2px 0' }}>Inspected: {fmtDate(sr.inspected_date)}{sr.inspected_by_user ? ` by ${sr.inspected_by_user.full_name}` : ''}</p>}
          </div>
        </div>

        {/* QC Notes */}
        {sr.qc_notes && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '8px 12px', marginBottom: '16px', fontSize: '11px', color: '#1e40af' }}>
            <strong>QC Notes:</strong> {sr.qc_notes}
          </div>
        )}

        {/* Line items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              {['#', 'SKU Code', 'Description', 'Size', 'Returned', 'Restocked', 'Damaged', 'Condition', 'Reason'].map(h => (
                <th key={h} style={{ padding: '8px 6px', textAlign: ['Returned', 'Restocked', 'Damaged'].includes(h) ? 'right' : 'left', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sr.items?.map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 6px', color: '#9ca3af' }}>{i + 1}</td>
                <td style={{ padding: '8px 6px', fontWeight: 600 }}>{item.sku?.sku_code || '—'}</td>
                <td style={{ padding: '8px 6px', color: '#6b7280' }}>{item.sku?.product_name || '—'}</td>
                <td style={{ padding: '8px 6px', fontWeight: 600 }}>{item.sku?.size || '—'}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{item.quantity_returned}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right', color: item.quantity_restocked > 0 ? '#166534' : '#6b7280' }}>{item.quantity_restocked}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right', color: item.quantity_damaged > 0 ? '#dc2626' : '#6b7280' }}>{item.quantity_damaged}</td>
                <td style={{ padding: '8px 6px', fontSize: '11px' }}>
                  <span style={{ padding: '1px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: item.condition === 'good' ? '#dcfce7' : item.condition === 'damaged' ? '#fee2e2' : item.condition === 'rejected' ? '#fce7f3' : '#f3f4f6', color: item.condition === 'good' ? '#166534' : item.condition === 'damaged' ? '#dc2626' : item.condition === 'rejected' ? '#be185d' : '#6b7280' }}>
                    {CONDITION_LABEL[item.condition] || item.condition || '—'}
                  </span>
                </td>
                <td style={{ padding: '8px 6px', color: '#6b7280', fontSize: '11px' }}>{item.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '280px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid #059669', fontSize: '16px', fontWeight: 800 }}>
              <span>Total Value</span>
              <span>{fmtCurrency(sr.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>This is a computer-generated sales return document.</p>
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
