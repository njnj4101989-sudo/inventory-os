import { QRCodeSVG } from 'qrcode.react'

/**
 * Thermal batch label content (inner only — wrapper div is ThermalLabelSheet).
 * Target size: 54x40mm, QR 20x20mm, text 32x40mm.
 * Size field rendered large (dominant). Scan -> /scan/batch/{batch_code}
 */
export default function ThermalBatchLabel({ batch, lotCode, designNo, lotDate, appBaseUrl }) {
  const batchCode = batch?.batch_code || ''
  const scanUrl = `${appBaseUrl || window.location.origin}/scan/batch/${encodeURIComponent(batchCode)}`

  const dateStr = lotDate
    ? new Date(lotDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'

  return (
    <>
      <div className="thermal-label__qr">
        <QRCodeSVG value={scanUrl} size={200} level="H" includeMargin={false} />
      </div>
      <div className="thermal-label__info">
        <div className="thermal-label__code">{batchCode}</div>
        <div className="thermal-label__big">{batch?.size || '—'}</div>
        <div className="thermal-label__row">
          <span className="thermal-label__key">Lot</span>
          <span className="thermal-label__val">{lotCode || '—'}</span>
        </div>
        <div className="thermal-label__row">
          <span className="thermal-label__key">Des</span>
          <span className="thermal-label__val">{designNo || '—'}</span>
        </div>
        <div className="thermal-label__row">
          <span className="thermal-label__key">Date</span>
          <span className="thermal-label__val">{dateStr}</span>
        </div>
      </div>
    </>
  )
}
