import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import QRLabel from './QRLabel'

/**
 * A4 label sheet — 8 labels per page (2 columns × 4 rows).
 * Opens as a full-screen overlay with a print button.
 * Uses react-to-print → browser print dialog → A4 sticker paper.
 */
export default function LabelSheet({ rolls, onClose }) {
  const sheetRef = useRef(null)

  const handlePrint = useReactToPrint({
    contentRef: sheetRef,
    documentTitle: `Roll-Labels-${new Date().toLocaleDateString('en-IN')}`,
    pageStyle: `
      @page {
        size: A4 portrait;
        margin: 8mm;
      }
      * { box-sizing: border-box; }
      .print-sheet {
        width: 100%;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 3mm;
        padding: 0;
        margin: 0;
        background: #fff;
      }
      .qr-label {
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
      .qr-label__qr { flex-shrink: 0; }
      .qr-label__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .qr-label__code { font-size: 10pt; font-weight: 800; color: #0f172a; margin-bottom: 4px; word-break: break-all; letter-spacing: 0.2px; }
      .qr-label__row { display: flex; gap: 4px; align-items: baseline; line-height: 1.4; }
      .qr-label__key { font-size: 7pt; font-weight: 700; color: #475569; min-width: 36px; text-transform: uppercase; letter-spacing: 0.4px; flex-shrink: 0; }
      .qr-label__val { font-size: 9pt; font-weight: 600; color: #0f172a; word-break: break-word; }
      .qr-label__val--sm { font-size: 8.5pt; font-weight: 600; }
    `,
  })

  if (!rolls || rolls.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-start overflow-y-auto py-6">
      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 mb-4 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Print Roll Labels</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {rolls.length} label{rolls.length !== 1 ? 's' : ''} • A4 sticker paper • 3 per row • ~24 per page
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Labels
          </button>
        </div>
      </div>

      {/* A4 preview — 3 cols, content-height only */}
      <div
        ref={sheetRef}
        className="print-sheet bg-white shadow-2xl rounded-lg"
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
        {rolls.map((roll) => (
          <QRLabel key={roll.id || roll.roll_code} roll={roll} />
        ))}
      </div>

      {/* Label styles — screen preview (print styles are in pageStyle above) */}
      <style>{`
        .qr-label {
          display: flex;
          flex-direction: row;
          gap: 5px;
          border: 1px dashed #cbd5e1;
          border-radius: 5px;
          padding: 7px;
          box-sizing: border-box;
          background: #fff;
          font-family: 'Segoe UI', Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          text-rendering: optimizeLegibility;
        }
        .qr-label__qr {
          flex-shrink: 0;
        }
        .qr-label__info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .qr-label__code {
          font-size: 11px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: 0.2px;
          margin-bottom: 4px;
          word-break: break-all;
          -webkit-font-smoothing: antialiased;
        }
        .qr-label__row {
          display: flex;
          gap: 4px;
          align-items: baseline;
          line-height: 1.4;
        }
        .qr-label__key {
          font-size: 8px;
          font-weight: 700;
          color: #475569;
          min-width: 36px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          flex-shrink: 0;
          -webkit-font-smoothing: antialiased;
        }
        .qr-label__val {
          font-size: 10px;
          font-weight: 600;
          color: #0f172a;
          word-break: break-word;
          -webkit-font-smoothing: antialiased;
        }
        .qr-label__val--sm {
          font-size: 9.5px;
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}
