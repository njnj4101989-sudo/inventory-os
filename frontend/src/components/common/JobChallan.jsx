import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'

/**
 * Job Challan — A4 print document for sending rolls to VA vendor.
 * Full-screen overlay with print button, follows LabelSheet pattern.
 */
export default function JobChallan({ rolls, vaName, vaShortCode, vaPartyName, vaPartyPhone, sentDate, notes, challanNo: challanNoProp, onClose }) {
  const challanRef = useRef(null)

  // Use DB challan number if provided, otherwise generate client-side fallback
  const now = new Date()
  const challanNo = challanNoProp || `JC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`

  const handlePrint = useReactToPrint({
    contentRef: challanRef,
    documentTitle: `Job-Challan-${challanNo}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 15mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .jc-page { width: 100%; }
      .jc-header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 12px; }
      .jc-header h1 { font-size: 18pt; font-weight: 800; margin: 0 0 2px; letter-spacing: 1px; }
      .jc-header .jc-sub { font-size: 9pt; color: #555; margin: 0; }
      .jc-meta { display: flex; justify-content: space-between; margin-bottom: 14px; font-size: 10pt; }
      .jc-meta-left, .jc-meta-right { display: flex; flex-direction: column; gap: 3px; }
      .jc-meta-right { text-align: right; }
      .jc-label { font-weight: 700; color: #333; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; }
      .jc-value { font-weight: 600; font-size: 10pt; }
      .jc-work { background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; padding: 8px 12px; margin-bottom: 14px; font-size: 11pt; }
      .jc-work strong { font-weight: 800; }
      table.jc-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
      .jc-table th { background: #222; color: #fff; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 8px; text-align: left; }
      .jc-table th:first-child { width: 30px; text-align: center; }
      .jc-table th:last-child { text-align: right; }
      .jc-table td { font-size: 10pt; padding: 5px 8px; border-bottom: 1px solid #ddd; }
      .jc-table td:first-child { text-align: center; font-weight: 600; color: #666; }
      .jc-table td:last-child { text-align: right; font-weight: 700; }
      .jc-table tr:last-child td { border-bottom: none; }
      .jc-table tbody tr:nth-child(even) { background: #fafafa; }
      .jc-totals { display: flex; justify-content: space-between; border-top: 2px solid #111; padding-top: 8px; margin-bottom: 14px; font-size: 11pt; font-weight: 800; }
      .jc-notes { border: 1px solid #ccc; border-radius: 4px; padding: 8px 12px; margin-bottom: 24px; min-height: 36px; font-size: 9pt; }
      .jc-notes-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; color: #555; margin-bottom: 4px; }
      .jc-signatures { display: flex; justify-content: space-between; margin-top: 40px; }
      .jc-sig-block { width: 40%; }
      .jc-sig-line { border-bottom: 1px solid #333; margin-bottom: 6px; height: 28px; }
      .jc-sig-label { font-size: 8pt; font-weight: 600; color: #555; }
    `,
  })

  const totalWeight = rolls.reduce((s, r) => s + (parseFloat(r.weight_sent || r.current_weight || r.total_weight) || 0), 0)
  const dateStr = sentDate
    ? new Date(sentDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'

  if (!rolls || rolls.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-start overflow-y-auto py-6">
      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 mb-4 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Job Challan</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {challanNo} &bull; {rolls.length} roll{rolls.length !== 1 ? 's' : ''} &bull; {vaName} ({vaShortCode})
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            Close
          </button>
          <button onClick={handlePrint} className="px-5 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Challan
          </button>
        </div>
      </div>

      {/* A4 Challan Preview */}
      <div ref={challanRef} className="jc-page bg-white shadow-2xl rounded-lg" style={{ width: '210mm', minHeight: '280mm', padding: '15mm', boxSizing: 'border-box' }}>
        {/* Header */}
        <div className="jc-header" style={{ textAlign: 'center', borderBottom: '2px solid #111', paddingBottom: '10px', marginBottom: '12px' }}>
          <h1 style={{ fontSize: '18pt', fontWeight: 800, margin: '0 0 2px', letterSpacing: '1px' }}>JOB CHALLAN</h1>
          <p style={{ fontSize: '9pt', color: '#555', margin: 0 }}>INVENTORY-OS</p>
        </div>

        {/* Meta: Vendor + Challan info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '10pt' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ fontSize: '8pt', fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: '0.5px' }}>To</div>
            <div style={{ fontWeight: 700, fontSize: '12pt' }}>{vaPartyName}</div>
            {vaPartyPhone && <div style={{ color: '#555' }}>Ph: {vaPartyPhone}</div>}
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ fontSize: '8pt', fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Challan No.</div>
            <div style={{ fontWeight: 700 }}>{challanNo}</div>
            <div style={{ fontSize: '8pt', fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Date</div>
            <div style={{ fontWeight: 600 }}>{dateStr}</div>
          </div>
        </div>

        {/* Work type */}
        <div style={{ background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '4px', padding: '8px 12px', marginBottom: '14px', fontSize: '11pt' }}>
          <strong>Work:</strong> {vaName} ({vaShortCode})
        </div>

        {/* Rolls table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
          <thead>
            <tr>
              <th style={{ background: '#222', color: '#fff', fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 8px', textAlign: 'center', width: '30px' }}>#</th>
              <th style={{ background: '#222', color: '#fff', fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 8px', textAlign: 'left' }}>Roll Code</th>
              <th style={{ background: '#222', color: '#fff', fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 8px', textAlign: 'left' }}>Fabric</th>
              <th style={{ background: '#222', color: '#fff', fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 8px', textAlign: 'left' }}>Color</th>
              <th style={{ background: '#222', color: '#fff', fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 8px', textAlign: 'right' }}>Sent Wt.</th>
            </tr>
          </thead>
          <tbody>
            {rolls.map((r, i) => (
              <tr key={r.id || i} style={{ background: i % 2 === 1 ? '#fafafa' : '#fff' }}>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd', textAlign: 'center', fontWeight: 600, color: '#666' }}>{i + 1}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd', fontWeight: 700 }}>{r.enhanced_roll_code || r.roll_code}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{r.fabric_type}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{r.color}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 700 }}>{parseFloat(r.weight_sent || r.current_weight || r.total_weight).toFixed(3)} {r.unit || 'kg'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #111', paddingTop: '8px', marginBottom: '14px', fontSize: '11pt', fontWeight: 800 }}>
          <span>Total Rolls: {rolls.length}</span>
          <span>Total Weight: {totalWeight.toFixed(3)} kg</span>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase', color: '#555', marginBottom: '4px' }}>Notes</div>
          <div style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '8px 12px', minHeight: '36px', fontSize: '9pt' }}>
            {notes || '—'}
          </div>
        </div>

        {/* Signatures */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px' }}>
          <div style={{ width: '40%' }}>
            <div style={{ borderBottom: '1px solid #333', marginBottom: '6px', height: '28px' }} />
            <div style={{ fontSize: '8pt', fontWeight: 600, color: '#555' }}>Sent By (Name & Sign)</div>
          </div>
          <div style={{ width: '40%' }}>
            <div style={{ borderBottom: '1px solid #333', marginBottom: '6px', height: '28px' }} />
            <div style={{ fontSize: '8pt', fontWeight: 600, color: '#555' }}>Received By (Name & Sign)</div>
          </div>
        </div>
      </div>
    </div>
  )
}
