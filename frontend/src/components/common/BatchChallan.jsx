import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'

/**
 * Batch Challan — A4 print document for sending batches to VA vendor.
 * Full-screen overlay with print button, follows JobChallan pattern.
 */
export default function BatchChallan({ challan, onClose }) {
  const challanRef = useRef(null)

  // Destructure from API response shape (single source of truth)
  const batchItems = challan?.batch_items || []
  const vaName = challan?.value_addition?.name || '—'
  const vaShortCode = challan?.value_addition?.short_code || '—'
  const vaPartyName = challan?.va_party?.name || '—'
  const sentDate = challan?.sent_date || ''
  const notes = challan?.notes || ''

  const now = new Date()
  const challanNo = challan?.challan_no || `BC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`

  const handlePrint = useReactToPrint({
    contentRef: challanRef,
    documentTitle: `Batch-Challan-${challanNo}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 15mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .bc-page { width: 100%; }
    `,
  })

  const totalPieces = (batchItems || []).reduce((s, item) => s + (item.pieces_sent || 0), 0)
  const dateStr = sentDate
    ? new Date(sentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'

  if (!batchItems || batchItems.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-start overflow-y-auto py-6">
      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 mb-4 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Batch Challan</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {challanNo} &bull; {batchItems.length} batch{batchItems.length !== 1 ? 'es' : ''} &bull; {vaName} ({vaShortCode})
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
      <div ref={challanRef} className="bc-page bg-white shadow-2xl rounded-lg" style={{ width: '210mm', minHeight: '280mm', padding: '15mm', boxSizing: 'border-box' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #111', paddingBottom: '10px', marginBottom: '12px' }}>
          <h1 style={{ fontSize: '18pt', fontWeight: 800, margin: '0 0 2px', letterSpacing: '1px' }}>BATCH CHALLAN</h1>
          <p style={{ fontSize: '9pt', color: '#555', margin: 0 }}>INVENTORY-OS</p>
        </div>

        {/* Meta: Processor + Challan info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '10pt' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ fontSize: '8pt', fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: '0.5px' }}>To</div>
            <div style={{ fontWeight: 700, fontSize: '12pt' }}>{vaPartyName}</div>
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

        {/* Batches table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
          <thead>
            <tr>
              <th style={{ background: '#222', color: '#fff', fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 8px', textAlign: 'center', width: '30px' }}>#</th>
              <th style={{ background: '#222', color: '#fff', fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 8px', textAlign: 'left' }}>Batch Code</th>
              <th style={{ background: '#222', color: '#fff', fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 8px', textAlign: 'left' }}>Size</th>
              <th style={{ background: '#222', color: '#fff', fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 8px', textAlign: 'right' }}>Pieces</th>
              <th style={{ background: '#222', color: '#fff', fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 8px', textAlign: 'left' }}>Phase</th>
            </tr>
          </thead>
          <tbody>
            {batchItems.map((item, i) => (
              <tr key={item.id || i} style={{ background: i % 2 === 1 ? '#fafafa' : '#fff' }}>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd', textAlign: 'center', fontWeight: 600, color: '#666' }}>{i + 1}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd', fontWeight: 700 }}>{item.batch?.batch_code || '—'}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{item.batch?.size || '—'}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 700 }}>{item.pieces_sent || 0}</td>
                <td style={{ fontSize: '10pt', padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{item.phase === 'post_qc' ? 'Post-QC' : 'Stitching'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #111', paddingTop: '8px', marginBottom: '14px', fontSize: '11pt', fontWeight: 800 }}>
          <span>Total Batches: {batchItems.length}</span>
          <span>Total Pieces: {totalPieces}</span>
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
