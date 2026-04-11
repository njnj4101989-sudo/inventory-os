import { useRef, useEffect } from 'react'
import { useReactToPrint } from 'react-to-print'
import { QRCodeSVG } from 'qrcode.react'
import buildRollLabel from './ThermalRollLabel'
import buildBatchLabel from './ThermalBatchLabel'
import buildSkuLabel from './ThermalSKULabel'

// Physical label dimensions (mm) — TSC TTP-345 thermal printer.
// Single-up 54×40mm landscape. To go 2-up later: set LABELS_PER_ROW=2,
// HORIZONTAL_GAP_MM to the measured gap, and register new stock in the driver.
const LABEL_W_MM = 54
const LABEL_H_MM = 40
const LABELS_PER_ROW = 1
const HORIZONTAL_GAP_MM = 0
const PAGE_W_MM = LABEL_W_MM * LABELS_PER_ROW + HORIZONTAL_GAP_MM * (LABELS_PER_ROW - 1)

// Vertical brand text — change here, applies to every label type.
const VLEFT_TEXT = 'DRS BLOUSE'
const VRIGHT_TEXT = 'SCAN TO VIEW'
const BOT_TEXT = 'drsblouse.com'

const BUILDERS = {
  roll: (item) => buildRollLabel(item),
  batch: (item, meta) => buildBatchLabel(item, meta),
  sku: (item) => buildSkuLabel(item),
}

const TITLES = {
  roll: 'Print Roll Labels — Thermal',
  batch: 'Print Batch Labels — Thermal',
  sku: 'Print SKU Labels — Thermal',
}

/**
 * Shared thermal label print overlay (Option A "Boarding Pass" layout).
 *
 * Layout (54×40mm):
 *   ┌──────────────────────────────────────────┐
 *   │         HERO CODE (top strip, 4mm)       │
 *   ├──────────────────────────────────────────┤
 *   │ D  ┌────────┐  WT  24.8 kg            S  │
 *   │ R  │        │  SR  2                  C  │
 *   │ S  │   QR   │  INV 12                 A  │
 *   │    │  32mm  │  DT  04 Apr 26          N  │
 *   │ ↕  │        │  FAB Cotton             ↕  │
 *   │    └────────┘  COL Black                 │
 *   ├──────────────────────────────────────────┤
 *   │       drsblouse.com  (bot strip, 4mm)    │
 *   └──────────────────────────────────────────┘
 *
 * Props:
 *   type:  'roll' | 'batch' | 'sku'
 *   items: array of records
 *   meta:  optional — batch needs {lotCode, designNo, lotDate}
 *   onClose: close callback
 */
export default function ThermalLabelSheet({ type, items, meta, onClose }) {
  const sheetRef = useRef(null)

  const handlePrint = useReactToPrint({
    contentRef: sheetRef,
    documentTitle: `${type}-thermal-${new Date().toLocaleDateString('en-IN')}`,
    pageStyle: `
      @page {
        size: ${PAGE_W_MM}mm ${LABEL_H_MM}mm;
        margin: 0;
      }
      html, body { margin: 0; padding: 0; background: #fff; }
      * { box-sizing: border-box; }
      .thermal-sheet { margin: 0; padding: 0; }
      .thermal-page {
        width: ${PAGE_W_MM}mm;
        height: ${LABEL_H_MM}mm;
        display: grid;
        grid-template-columns: repeat(${LABELS_PER_ROW}, ${LABEL_W_MM}mm);
        column-gap: ${HORIZONTAL_GAP_MM}mm;
        page-break-after: always;
        page-break-inside: avoid;
        break-after: page;
        break-inside: avoid;
        margin: 0;
        padding: 0;
      }
      .thermal-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      .thermal-label {
        width: ${LABEL_W_MM}mm;
        height: ${LABEL_H_MM}mm;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        color: #000;
        background: #fff;
        font-family: 'Arial', 'Helvetica', sans-serif;
        overflow: hidden;
      }
      .thermal-label__top {
        width: 100%;
        height: 4mm;
        padding: 0 1.5mm;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 8pt;
        font-weight: 900;
        line-height: 1;
        color: #000;
        border-bottom: 0.25mm solid #000;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: 0.1mm;
      }
      .thermal-label__middle {
        width: 100%;
        height: 32mm;
        display: flex;
        flex-direction: row;
        align-items: stretch;
      }
      .thermal-label__vleft,
      .thermal-label__vright {
        width: 2.5mm;
        height: 32mm;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 5.5pt;
        font-weight: 900;
        letter-spacing: 0.3mm;
        text-transform: uppercase;
        color: #000;
        white-space: nowrap;
        overflow: hidden;
      }
      .thermal-label__vleft {
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        border-right: 0.2mm solid #000;
      }
      .thermal-label__vright {
        writing-mode: vertical-rl;
        border-left: 0.2mm solid #000;
      }
      .thermal-label__qr {
        flex-shrink: 0;
        width: 32mm;
        height: 32mm;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }
      .thermal-label__qr svg {
        width: 32mm !important;
        height: 32mm !important;
        display: block;
      }
      .thermal-label__data {
        flex: 1;
        min-width: 0;
        padding: 1mm 0.6mm 1mm 0.8mm;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 0.4mm;
        overflow: hidden;
      }
      .thermal-label__row {
        display: flex;
        align-items: baseline;
        gap: 0.8mm;
        font-size: 6.2pt;
        font-weight: 700;
        line-height: 1.1;
        color: #000;
        white-space: nowrap;
        overflow: hidden;
      }
      .thermal-label__row--emph {
        font-size: 7.5pt;
        font-weight: 900;
      }
      .thermal-label__key {
        font-weight: 700;
        flex-shrink: 0;
        color: #000;
        text-transform: uppercase;
        min-width: 5mm;
      }
      .thermal-label__val {
        font-weight: 900;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #000;
      }
      .thermal-label__val--full {
        min-width: 0;
        text-align: left;
      }
      .thermal-label__bot {
        width: 100%;
        height: 4mm;
        padding: 0 1.5mm;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 5.5pt;
        font-weight: 700;
        letter-spacing: 0.3mm;
        color: #000;
        border-top: 0.25mm solid #000;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-transform: uppercase;
      }
    `,
  })

  // Keyboard shortcuts: ESC closes, Ctrl/Cmd+P triggers print
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose?.() }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); handlePrint?.() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, handlePrint])

  if (!items || items.length === 0) return null
  const builder = BUILDERS[type]
  if (!builder) return null

  // Chunk items into pages of LABELS_PER_ROW for page-break control
  const pages = []
  for (let i = 0; i < items.length; i += LABELS_PER_ROW) {
    pages.push(items.slice(i, i + LABELS_PER_ROW))
  }

  const renderLabel = (item) => {
    const data = builder(item, meta || {})
    return (
      <>
        <div className="thermal-label__top">{data.hero}</div>
        <div className="thermal-label__middle">
          <div className="thermal-label__vleft">{VLEFT_TEXT}</div>
          <div className="thermal-label__qr">
            <QRCodeSVG value={data.qrValue} size={256} level="H" includeMargin={false} />
          </div>
          <div className="thermal-label__data">
            {data.rows.map((r, idx) => (
              <div
                key={idx}
                className={`thermal-label__row${r.emph ? ' thermal-label__row--emph' : ''}`}
              >
                {r.k != null && <span className="thermal-label__key">{r.k}</span>}
                <span className={`thermal-label__val${r.k == null ? ' thermal-label__val--full' : ''}`}>{r.v}</span>
              </div>
            ))}
          </div>
          <div className="thermal-label__vright">{VRIGHT_TEXT}</div>
        </div>
        <div className="thermal-label__bot">{BOT_TEXT}</div>
      </>
    )
  }

  return (
    <div className="fixed inset-0 z-[55] bg-black/60 flex flex-col items-center justify-start overflow-y-auto py-6">
      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 mb-4 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{TITLES[type] || 'Print Thermal Labels'}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {items.length} label{items.length !== 1 ? 's' : ''} &middot; {LABEL_W_MM}&times;{LABEL_H_MM}mm &middot; TSC TTP-345
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
            className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
            Print Thermal
          </button>
        </div>
      </div>

      {/* Thermal pages — one per physical label row (preview) */}
      <div ref={sheetRef} className="thermal-sheet">
        {pages.map((row, pageIdx) => (
          <div key={pageIdx} className="thermal-page shadow-lg">
            {row.map((item, i) => (
              <div key={item?.id || item?.roll_code || item?.batch_code || item?.sku_code || i} className="thermal-label">
                {renderLabel(item)}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Screen preview CSS — mirrors print styles so the preview matches the output */}
      <style>{`
        .thermal-sheet { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .thermal-page {
          width: ${PAGE_W_MM}mm;
          height: ${LABEL_H_MM}mm;
          display: grid;
          grid-template-columns: repeat(${LABELS_PER_ROW}, ${LABEL_W_MM}mm);
          column-gap: ${HORIZONTAL_GAP_MM}mm;
          background: #fff;
          border-radius: 2px;
        }
        .thermal-label {
          width: ${LABEL_W_MM}mm;
          height: ${LABEL_H_MM}mm;
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          color: #000;
          background: #fff;
          font-family: 'Arial', 'Helvetica', sans-serif;
          overflow: hidden;
        }
        .thermal-label__top {
          width: 100%;
          height: 4mm;
          padding: 0 1.5mm;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 8pt;
          font-weight: 900;
          line-height: 1;
          color: #000;
          border-bottom: 0.25mm solid #000;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          letter-spacing: 0.1mm;
          box-sizing: border-box;
        }
        .thermal-label__middle {
          width: 100%;
          height: 32mm;
          display: flex;
          flex-direction: row;
          align-items: stretch;
        }
        .thermal-label__vleft,
        .thermal-label__vright {
          width: 2.5mm;
          height: 32mm;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 5.5pt;
          font-weight: 900;
          letter-spacing: 0.3mm;
          text-transform: uppercase;
          color: #000;
          white-space: nowrap;
          overflow: hidden;
          box-sizing: border-box;
        }
        .thermal-label__vleft {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          border-right: 0.2mm solid #000;
        }
        .thermal-label__vright {
          writing-mode: vertical-rl;
          border-left: 0.2mm solid #000;
        }
        .thermal-label__qr {
          flex-shrink: 0;
          width: 32mm;
          height: 32mm;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }
        .thermal-label__qr svg {
          width: 32mm !important;
          height: 32mm !important;
          display: block;
        }
        .thermal-label__data {
          flex: 1;
          min-width: 0;
          padding: 1mm 0.6mm 1mm 0.8mm;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 0.4mm;
          overflow: hidden;
        }
        .thermal-label__row {
          display: flex;
          align-items: baseline;
          gap: 0.8mm;
          font-size: 6.2pt;
          font-weight: 700;
          line-height: 1.1;
          color: #000;
          white-space: nowrap;
          overflow: hidden;
        }
        .thermal-label__row--emph {
          font-size: 7.5pt;
          font-weight: 900;
        }
        .thermal-label__key {
          font-weight: 700;
          flex-shrink: 0;
          color: #000;
          text-transform: uppercase;
          min-width: 5mm;
        }
        .thermal-label__val {
          font-weight: 900;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #000;
        }
        .thermal-label__val--full {
          min-width: 0;
          text-align: left;
        }
        .thermal-label__bot {
          width: 100%;
          height: 4mm;
          padding: 0 1.5mm;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 5.5pt;
          font-weight: 700;
          letter-spacing: 0.3mm;
          color: #000;
          border-top: 0.25mm solid #000;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-transform: uppercase;
          box-sizing: border-box;
        }
      `}</style>
    </div>
  )
}
