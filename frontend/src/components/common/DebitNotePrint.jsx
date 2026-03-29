import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtCurrency = (v) => `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * DebitNotePrint — A4 GST-compliant debit note document.
 * Generated from a closed ReturnNote (supplier return) with debit_note_no.
 * Props: note (ReturnNoteResponse with debit_note_no), company (full company object), onClose
 */
export default function DebitNotePrint({ note, company, onClose }) {
  const printRef = useRef(null)
  const rn = note || {}
  const co = company || {}

  const gstPct = rn.gst_percent || 0
  const subtotal = rn.subtotal || 0
  const taxAmt = rn.tax_amount || 0
  const total = rn.total_amount || 0

  const isRollReturn = rn.return_type === 'roll_return'
  const returnTypeLabel = isRollReturn ? 'Roll Return' : 'SKU Return'

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `DebitNote-${rn.debit_note_no}`,
    pageStyle: `@page { size: A4 portrait; margin: 15mm; } * { box-sizing: border-box; } body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
  })

  const rollHeaders = ['#', 'Roll Code', 'Fabric', 'Color', 'Weight', 'Rate', 'Amount']
  const skuHeaders = ['#', 'SKU Code', 'Description', 'Size', 'Qty', 'Rate', 'Amount']
  const headers = isRollReturn ? rollHeaders : skuHeaders
  const rightAligned = ['Weight', 'Rate', 'Amount', 'Qty']

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center overflow-auto">
      {/* Toolbar */}
      <div className="w-full max-w-[220mm] mt-4 mb-3 flex items-center justify-between bg-white rounded-xl px-5 py-3 shadow-lg">
        <span className="font-semibold text-gray-800">Debit Note {rn.debit_note_no}</span>
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
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#059669', margin: 0, letterSpacing: '-0.5px' }}>DEBIT NOTE</h1>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '4px 0 0' }}>{co.name || 'Company'}</p>
            {co.address && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>{co.address}{co.city ? `, ${co.city}` : ''}{co.state ? `, ${co.state}` : ''}{co.pin_code ? ` - ${co.pin_code}` : ''}</p>}
            {co.gst_no && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>GSTIN: {co.gst_no}{co.state_code ? ` | State: ${co.state_code}` : ''}</p>}
            {co.phone && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>Phone: {co.phone}{co.email ? ` | ${co.email}` : ''}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '13px', fontWeight: 600 }}>{rn.debit_note_no}</p>
            <p style={{ fontSize: '11px', color: '#6b7280' }}>Date: {fmtDate(rn.dispatch_date || rn.return_date || rn.created_at)}</p>
            <p style={{ fontSize: '11px', color: '#6b7280' }}>Against: {rn.return_note_no}</p>
            <p style={{ fontSize: '11px', color: '#6b7280' }}>{returnTypeLabel}</p>
          </div>
        </div>

        {/* Supplier info + Reference */}
        <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
          <div style={{ flex: 1, background: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>Debit To (Supplier)</p>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{rn.supplier?.name || '—'}</p>
            {rn.supplier?.phone && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>Phone: {rn.supplier.phone}</p>}
            {rn.supplier?.city && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>{rn.supplier.city}{rn.supplier.state ? `, ${rn.supplier.state}` : ''}</p>}
            {rn.supplier?.gst_no && <p style={{ fontSize: '11px', fontWeight: 600, margin: '2px 0 0' }}>GSTIN: {rn.supplier.gst_no}</p>}
          </div>
          <div style={{ flex: 1, background: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>Reference</p>
            <p style={{ fontSize: '12px', margin: '2px 0' }}>Return Note: <strong>{rn.return_note_no}</strong></p>
            <p style={{ fontSize: '12px', margin: '2px 0' }}>Type: <strong>{returnTypeLabel}</strong></p>
            {rn.dispatch_date && <p style={{ fontSize: '12px', margin: '2px 0' }}>Dispatch Date: {fmtDate(rn.dispatch_date)}</p>}
            <p style={{ fontSize: '12px', margin: '2px 0' }}>Return Date: {fmtDate(rn.return_date)}</p>
          </div>
        </div>

        {/* Line items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              {headers.map(h => (
                <th key={h} style={{ padding: '8px 6px', textAlign: rightAligned.includes(h) ? 'right' : 'left', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rn.items?.map((item, i) => {
              if (isRollReturn) {
                const weight = item.weight || 0
                const rate = item.unit_price || 0
                const amt = item.amount || weight * rate
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 6px', color: '#9ca3af' }}>{i + 1}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{item.roll?.roll_code || '—'}</td>
                    <td style={{ padding: '8px 6px', color: '#6b7280' }}>{item.roll?.fabric?.name || item.roll?.fabric_name || '—'}</td>
                    <td style={{ padding: '8px 6px', color: '#6b7280' }}>{item.roll?.color?.name || item.roll?.color_name || '—'}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{weight.toFixed(2)} kg</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtCurrency(rate)}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(amt)}</td>
                  </tr>
                )
              } else {
                const qty = item.quantity || 0
                const rate = item.unit_price || 0
                const amt = item.amount || qty * rate
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 6px', color: '#9ca3af' }}>{i + 1}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{item.sku?.sku_code || '—'}</td>
                    <td style={{ padding: '8px 6px', color: '#6b7280' }}>{item.sku?.product_name || '—'}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{item.sku?.size || '—'}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{qty}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtCurrency(rate)}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(amt)}</td>
                  </tr>
                )
              }
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
              <span>Debit Amount</span>
              <span>{fmtCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>This is a computer-generated debit note.</p>
          </div>
          <div style={{ display: 'flex', gap: '60px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '130px', borderBottom: '1px solid #d1d5db', marginBottom: '4px' }}>&nbsp;</div>
              <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>Supplier Signature</p>
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
