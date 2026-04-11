import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import ThermalRollLabel from './ThermalRollLabel'
import ThermalBatchLabel from './ThermalBatchLabel'
import ThermalSKULabel from './ThermalSKULabel'

// Physical label dimensions (mm) — TSC TTP-345 thermal printer.
// Current: single-up 54x40mm. Future 2-up: set LABELS_PER_ROW=2, HORIZONTAL_GAP_MM
// to the measured gap, and ensure driver paper stock matches PAGE_W_MM × LABEL_H_MM.
const LABEL_W_MM = 54
const LABEL_H_MM = 40
const LABELS_PER_ROW = 1
const HORIZONTAL_GAP_MM = 0
const PAGE_W_MM = LABEL_W_MM * LABELS_PER_ROW + HORIZONTAL_GAP_MM * (LABELS_PER_ROW - 1)

const RENDERERS = {
  roll: (item) => <ThermalRollLabel roll={item} />,
  batch: (item, meta) => <ThermalBatchLabel batch={item} {...(meta || {})} />,
  sku: (item) => <ThermalSKULabel sku={item} />,
}

const TITLES = {
  roll: 'Print Roll Labels — Thermal',
  batch: 'Print Batch Labels — Thermal',
  sku: 'Print SKU Labels — Thermal',
}

/**
 * Shared thermal label print overlay. Renders one page per physical label row.
 * Future 2-up: change LABELS_PER_ROW at the top of this file + driver paper stock;
 * no page changes required.
 *
 * Props:
 *   type:  'roll' | 'batch' | 'sku'
 *   items: array of records (rolls / batches / skus)
 *   meta:  optional extra props passed to the label renderer (batch needs lotCode/designNo/lotDate)
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
        padding: 1.5mm;
        margin: 0;
        display: flex;
        flex-direction: row;
        gap: 1.5mm;
        align-items: flex-start;
        color: #000;
        background: #fff;
        font-family: 'Arial', 'Helvetica', sans-serif;
        overflow: hidden;
      }
      .thermal-label__qr { flex-shrink: 0; width: 20mm; height: 20mm; }
      .thermal-label__qr svg { width: 20mm !important; height: 20mm !important; display: block; }
      .thermal-label__info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.4mm;
        overflow: hidden;
      }
      .thermal-label__code {
        font-size: 8.5pt;
        font-weight: 900;
        line-height: 1.1;
        word-break: break-all;
        color: #000;
      }
      .thermal-label__big {
        font-size: 14pt;
        font-weight: 900;
        line-height: 1;
        color: #000;
      }
      .thermal-label__row {
        display: flex;
        gap: 1mm;
        font-size: 7pt;
        font-weight: 600;
        line-height: 1.2;
        color: #000;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .thermal-label__key { font-weight: 700; text-transform: uppercase; flex-shrink: 0; }
      .thermal-label__val { word-break: break-word; overflow: hidden; text-overflow: ellipsis; }
    `,
  })

  if (!items || items.length === 0) return null
  const render = RENDERERS[type]
  if (!render) return null

  // Chunk items into pages of LABELS_PER_ROW for page-break control
  const pages = []
  for (let i = 0; i < items.length; i += LABELS_PER_ROW) {
    pages.push(items.slice(i, i + LABELS_PER_ROW))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-start overflow-y-auto py-6">
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
                {render(item, meta || {})}
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
          padding: 1.5mm;
          box-sizing: border-box;
          display: flex;
          flex-direction: row;
          gap: 1.5mm;
          align-items: flex-start;
          color: #000;
          background: #fff;
          font-family: 'Arial', 'Helvetica', sans-serif;
          overflow: hidden;
        }
        .thermal-label__qr { flex-shrink: 0; width: 20mm; height: 20mm; }
        .thermal-label__qr svg { width: 20mm !important; height: 20mm !important; display: block; }
        .thermal-label__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.4mm; overflow: hidden; }
        .thermal-label__code { font-size: 8.5pt; font-weight: 900; line-height: 1.1; word-break: break-all; color: #000; }
        .thermal-label__big { font-size: 14pt; font-weight: 900; line-height: 1; color: #000; }
        .thermal-label__row { display: flex; gap: 1mm; font-size: 7pt; font-weight: 600; line-height: 1.2; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .thermal-label__key { font-weight: 700; text-transform: uppercase; flex-shrink: 0; }
        .thermal-label__val { word-break: break-word; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
    </div>
  )
}
