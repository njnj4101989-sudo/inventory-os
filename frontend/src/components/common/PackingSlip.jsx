import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'

/**
 * Packing Slip — compact A4 print document that goes inside the packed box.
 * Shows batch info, SKU, color, qty, size, QC status.
 * Full-screen overlay with print button, follows JobChallan pattern.
 */
export default function PackingSlip({ batch, companyName, onClose }) {
  const printRef = useRef(null)

  const b = batch || {}
  const lot = b.lot || {}
  const colorQC = b.color_qc || {}
  const hasColorQC = Object.keys(colorQC).length > 0

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `PackingSlip-${b.batch_code || 'Batch'}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 15mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    `,
  })

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  // Build color-wise rows from color_qc or fallback to single row
  const rows = hasColorQC
    ? Object.entries(colorQC).map(([color, qc]) => ({
        color,
        approved: qc.approved || 0,
        rejected: qc.rejected || 0,
        total: (qc.approved || 0) + (qc.rejected || 0),
      }))
    : b.approved_qty > 0
      ? [{ color: '—', approved: b.approved_qty, rejected: b.rejected_qty || 0, total: (b.approved_qty || 0) + (b.rejected_qty || 0) }]
      : []

  const totalApproved = rows.reduce((s, r) => s + r.approved, 0)
  const totalRejected = rows.reduce((s, r) => s + r.rejected, 0)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center overflow-auto">
      {/* Toolbar */}
      <div className="w-full max-w-[220mm] mt-4 mb-3 flex items-center justify-between bg-white rounded-xl px-5 py-3 shadow-lg">
        <span className="font-semibold text-gray-800">Packing Slip — {b.batch_code}</span>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700 transition-colors">
            Print
          </button>
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Close
          </button>
        </div>
      </div>

      {/* A4 printable */}
      <div ref={printRef} style={{
        width: '210mm', minHeight: '148mm', background: '#fff', padding: '15mm',
        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", color: '#1f2937',
        fontSize: '12px', lineHeight: '1.5',
      }}>
        {/* Header */}
        <div style={{ borderBottom: '3px solid #059669', paddingBottom: '10px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#059669', margin: 0 }}>PACKING SLIP</h1>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937', margin: '4px 0 0' }}>{companyName || 'DRS Blouse'}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '14px', fontWeight: 700 }}>{b.batch_code}</p>
            <p style={{ fontSize: '11px', color: '#6b7280' }}>Packed: {fmtDate(b.packed_at)}</p>
            {b.pack_reference && <p style={{ fontSize: '11px', color: '#6b7280' }}>Ref: {b.pack_reference}</p>}
          </div>
        </div>

        {/* Batch info grid */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          <div style={{ flex: 1, background: '#f9fafb', borderRadius: '8px', padding: '10px 12px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Product</p>
            <p style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 2px' }}>{b.sku?.sku_code || lot.product_type || '—'}</p>
            <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>Design: {b.design_no || lot.designs?.[0]?.design_no || '—'}</p>
            <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>Size: {b.size || '—'}</p>
          </div>
          <div style={{ flex: 1, background: '#f9fafb', borderRadius: '8px', padding: '10px 12px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Lot / Batch</p>
            <p style={{ fontSize: '11px', margin: '2px 0' }}><span style={{ fontWeight: 600 }}>Lot:</span> {lot.lot_code || '—'}</p>
            <p style={{ fontSize: '11px', margin: '2px 0' }}><span style={{ fontWeight: 600 }}>Fabric:</span> {lot.fabric_type || '—'}</p>
            {b.packed_by && <p style={{ fontSize: '11px', margin: '2px 0' }}><span style={{ fontWeight: 600 }}>Packed by:</span> {b.packed_by.full_name || '—'}</p>}
          </div>
          <div style={{ flex: 1, background: '#ecfdf5', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Total Pieces</p>
            <p style={{ fontSize: '28px', fontWeight: 800, color: '#059669', margin: 0 }}>{totalApproved}</p>
            {totalRejected > 0 && <p style={{ fontSize: '11px', color: '#dc2626', margin: '2px 0 0' }}>{totalRejected} rejected</p>}
          </div>
        </div>

        {/* Color-wise QC breakdown */}
        {rows.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>#</th>
                <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Color</th>
                <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Approved</th>
                <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Rejected</th>
                <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '7px 6px', color: '#9ca3af' }}>{i + 1}</td>
                  <td style={{ padding: '7px 6px', fontWeight: 600 }}>{r.color}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>{r.approved}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', color: r.rejected > 0 ? '#dc2626' : '#9ca3af' }}>{r.rejected}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 700 }}>{r.total}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 1 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid #1f2937' }}>
                  <td colSpan={2} style={{ padding: '8px 6px', fontWeight: 800 }}>Total</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>{totalApproved}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: totalRejected > 0 ? '#dc2626' : '#9ca3af' }}>{totalRejected}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800 }}>{totalApproved + totalRejected}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {/* Footer note */}
        <div style={{ marginTop: '24px', borderTop: '1px solid #e5e7eb', paddingTop: '10px', fontSize: '10px', color: '#9ca3af', textAlign: 'center' }}>
          This is a system-generated packing slip. Please verify contents upon receipt.
        </div>
      </div>
    </div>
  )
}
