import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'

/**
 * Cutting Sheet — A4 print document for a lot's cutting details.
 * Full-screen overlay with print button, follows JobChallan pattern.
 */
export default function CuttingSheet({ lot, onClose }) {
  const sheetRef = useRef(null)

  const handlePrint = useReactToPrint({
    contentRef: sheetRef,
    documentTitle: `CuttingSheet-${lot?.lot_code || 'LOT'}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 15mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      table.cs-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
      .cs-table th { background: #222; color: #fff; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 8px; text-align: left; }
      .cs-table th:first-child { width: 30px; text-align: center; }
      .cs-table td { font-size: 10pt; padding: 5px 8px; border-bottom: 1px solid #ddd; }
      .cs-table td:first-child { text-align: center; font-weight: 600; color: #666; }
      .cs-table tbody tr:nth-child(even) { background: #fafafa; }
    `,
  })

  if (!lot) return null

  const lotRolls = lot.lot_rolls || []
  const piecesPerPalla = Object.values(lot.default_size_pattern || {}).reduce((s, v) => s + (parseInt(v) || 0), 0)
  const totalWaste = lotRolls.reduce((s, r) => s + parseFloat(r.waste_weight || 0), 0)
  const colorCount = [...new Set(lotRolls.map(r => r.color).filter(Boolean))].length
  const dateStr = lot.lot_date
    ? new Date(lot.lot_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-start overflow-y-auto py-6">
      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 mb-4 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Cutting Sheet</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {lot.lot_code} &bull; Design {lot.design_no} &bull; {lotRolls.length} roll{lotRolls.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            Close
          </button>
          <button onClick={handlePrint} className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Sheet
          </button>
        </div>
      </div>

      {/* A4 Preview */}
      <div ref={sheetRef} className="bg-white shadow-2xl rounded-lg" style={{ width: '210mm', minHeight: '280mm', padding: '15mm', boxSizing: 'border-box' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #111', paddingBottom: '10px', marginBottom: '12px' }}>
          <h1 style={{ fontSize: '18pt', fontWeight: 800, margin: '0 0 2px', letterSpacing: '1px' }}>CUTTING SHEET</h1>
          <p style={{ fontSize: '9pt', color: '#555', margin: 0 }}>INVENTORY-OS</p>
        </div>

        {/* Meta: Lot info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '10pt' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ fontSize: '8pt', fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Lot No.</div>
            <div style={{ fontWeight: 700, fontSize: '14pt' }}>{lot.lot_code}</div>
            <div style={{ fontSize: '8pt', fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Design No.</div>
            <div style={{ fontWeight: 700, fontSize: '12pt' }}>{lot.design_no}</div>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ fontSize: '8pt', fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</div>
            <div style={{ fontWeight: 600 }}>{dateStr}</div>
            <div style={{ fontSize: '8pt', fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Palla Weight</div>
            <div style={{ fontWeight: 600 }}>{lot.standard_palla_weight} kg</div>
            {lot.standard_palla_meter && (
              <>
                <div style={{ fontSize: '8pt', fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Palla Meter</div>
                <div style={{ fontWeight: 600 }}>{lot.standard_palla_meter} m</div>
              </>
            )}
          </div>
        </div>

        {/* Size Pattern bar */}
        <div style={{ background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '4px', padding: '8px 12px', marginBottom: '14px', fontSize: '11pt' }}>
          <strong>Size Pattern:</strong>{' '}
          {Object.entries(lot.default_size_pattern || {}).map(([k, v]) => `${k}: ${v}`).join(' + ')}{' '}
          = <strong>{piecesPerPalla} pcs/palla</strong>
        </div>

        {/* Rolls table */}
        <table className="cs-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
          <thead>
            <tr>
              {['#', 'Roll Code', 'Color', 'Roll Wt', 'Palla Wt', 'Pallas', 'Used', 'Waste', 'Pieces'].map((h, i) => (
                <th key={h} style={{
                  background: '#222', color: '#fff', fontSize: '8pt', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 8px',
                  textAlign: i === 0 ? 'center' : i >= 3 ? 'right' : 'left',
                  width: i === 0 ? '30px' : 'auto',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lotRolls.map((lr, i) => (
              <tr key={lr.id || i} style={{ background: i % 2 === 1 ? '#fafafa' : '#fff' }}>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd', textAlign: 'center', fontWeight: 600, color: '#666' }}>{i + 1}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd', fontWeight: 700 }}>{lr.roll_code}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{lr.color}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>{parseFloat(lr.roll_weight || 0).toFixed(3)}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>{parseFloat(lr.palla_weight || 0).toFixed(3)}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 700 }}>{lr.num_pallas}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>{parseFloat(lr.weight_used || 0).toFixed(3)}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd', textAlign: 'right', color: '#b91c1c' }}>{parseFloat(lr.waste_weight || 0).toFixed(3)}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 800 }}>{lr.pieces_from_roll}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #111', paddingTop: '8px', marginBottom: '14px', fontSize: '10pt', fontWeight: 800 }}>
          <span>{colorCount} Colors &bull; {lotRolls.length} Rolls</span>
          <span>Pallas: {lot.total_pallas}</span>
          <span>Pieces: {lot.total_pieces}</span>
          <span>Weight: {parseFloat(lot.total_weight || 0).toFixed(3)} kg</span>
          <span style={{ color: '#b91c1c' }}>Waste: {totalWaste.toFixed(3)} kg</span>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase', color: '#555', marginBottom: '4px' }}>Notes</div>
          <div style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '8px 12px', minHeight: '36px', fontSize: '9pt' }}>
            {lot.notes || '—'}
          </div>
        </div>

        {/* Signatures */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px' }}>
          <div style={{ width: '40%' }}>
            <div style={{ borderBottom: '1px solid #333', marginBottom: '6px', height: '28px' }} />
            <div style={{ fontSize: '8pt', fontWeight: 600, color: '#555' }}>Supervisor (Name & Sign)</div>
          </div>
          <div style={{ width: '40%' }}>
            <div style={{ borderBottom: '1px solid #333', marginBottom: '6px', height: '28px' }} />
            <div style={{ fontSize: '8pt', fontWeight: 600, color: '#555' }}>Cutting Master (Name & Sign)</div>
          </div>
        </div>
      </div>
    </div>
  )
}
