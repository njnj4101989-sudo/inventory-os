import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import BatchQRLabel from './BatchQRLabel'

/**
 * A4 batch label sheet — 3 columns, content-height rows.
 * Opens as a full-screen overlay with a print button.
 * Uses react-to-print → browser print dialog → A4 sticker paper.
 */
export default function BatchLabelSheet({ batches, lotCode, designNo, lotDate, onClose }) {
  const sheetRef = useRef(null)

  const handlePrint = useReactToPrint({
    contentRef: sheetRef,
    documentTitle: `Batch-Labels-${lotCode || 'LOT'}-${new Date().toLocaleDateString('en-IN')}`,
    pageStyle: `
      @page {
        size: A4 portrait;
        margin: 8mm;
      }
      * { box-sizing: border-box; }
      .batch-sheet {
        width: 100%;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 3mm;
        padding: 0;
        margin: 0;
        background: #fff;
      }
      .batch-label {
        break-inside: avoid;
        page-break-inside: avoid;
        display: flex;
        flex-direction: row;
        gap: 4px;
        border: 1px dashed #cbd5e1;
        border-radius: 4px;
        padding: 5px;
        background: #fff;
        font-family: 'Segoe UI', Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }
      .batch-label__qr { flex-shrink: 0; }
      .batch-label__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
      .batch-label__code { font-size: 9pt; font-weight: 800; color: #0f172a; letter-spacing: 0.2px; }
      .batch-label__size { font-size: 16pt; font-weight: 900; color: #059669; letter-spacing: 0.3px; margin: 1px 0; }
      .batch-label__row { display: flex; gap: 3px; align-items: baseline; line-height: 1.4; }
      .batch-label__key { font-size: 7pt; font-weight: 700; color: #475569; min-width: 30px; text-transform: uppercase; letter-spacing: 0.4px; flex-shrink: 0; }
      .batch-label__val { font-size: 8.5pt; font-weight: 600; color: #0f172a; word-break: break-word; }
    `,
  })

  if (!batches || batches.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-start overflow-y-auto py-6">
      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 mb-4 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Print Batch Labels</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {batches.length} label{batches.length !== 1 ? 's' : ''} • {lotCode} • Design {designNo} • 3 per row
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            Close
          </button>
          <button onClick={handlePrint}
            className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Labels
          </button>
        </div>
      </div>

      {/* A4 preview — 3 cols */}
      <div
        ref={sheetRef}
        className="batch-sheet bg-white shadow-2xl rounded-lg"
        style={{
          width: '210mm',
          padding: '8mm',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gridAutoRows: 'min-content',
          gap: '3mm',
          boxSizing: 'border-box',
        }}
      >
        {batches.map((batch) => (
          <BatchQRLabel
            key={batch.batch_code || batch.id}
            batch={batch}
            lotCode={lotCode}
            designNo={designNo}
            lotDate={lotDate}
          />
        ))}
      </div>

      {/* Screen preview styles */}
      <style>{`
        .batch-label {
          display: flex; flex-direction: row; gap: 5px;
          border: 1px dashed #cbd5e1; border-radius: 5px; padding: 7px;
          box-sizing: border-box; background: #fff;
          font-family: 'Segoe UI', Arial, sans-serif;
        }
        .batch-label__qr { flex-shrink: 0; }
        .batch-label__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .batch-label__code { font-size: 10px; font-weight: 800; color: #0f172a; letter-spacing: 0.2px; }
        .batch-label__size { font-size: 20px; font-weight: 900; color: #059669; margin: 1px 0; }
        .batch-label__row { display: flex; gap: 3px; align-items: baseline; line-height: 1.4; }
        .batch-label__key { font-size: 8px; font-weight: 700; color: #475569; min-width: 30px; text-transform: uppercase; letter-spacing: 0.4px; flex-shrink: 0; }
        .batch-label__val { font-size: 9.5px; font-weight: 600; color: #0f172a; word-break: break-word; }
      `}</style>
    </div>
  )
}
