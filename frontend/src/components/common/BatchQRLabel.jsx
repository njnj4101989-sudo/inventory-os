import { QRCodeSVG } from 'qrcode.react'

/**
 * Single batch label — renders one sticker (~9.5cm × 5.5cm).
 * QR encodes the full scan URL. Scan → /scan/batch/{batch_code}
 */
export default function BatchQRLabel({ batch, lotCode, designNo, lotDate, appBaseUrl }) {
  const batchCode = batch?.batch_code || ''
  const scanUrl = `${appBaseUrl || window.location.origin}/scan/batch/${encodeURIComponent(batchCode)}`

  const dateStr = lotDate
    ? new Date(lotDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'

  return (
    <div className="batch-label">
      <div className="batch-label__qr">
        <QRCodeSVG value={scanUrl} size={88} level="M" includeMargin={false} />
      </div>
      <div className="batch-label__info">
        <div className="batch-label__code">{batchCode}</div>
        <div className="batch-label__size">{batch?.size || '—'}</div>
        <div className="batch-label__row">
          <span className="batch-label__key">Lot</span>
          <span className="batch-label__val">{lotCode || '—'}</span>
        </div>
        <div className="batch-label__row">
          <span className="batch-label__key">Design</span>
          <span className="batch-label__val">{designNo || '—'}</span>
        </div>
        <div className="batch-label__row">
          <span className="batch-label__key">Date</span>
          <span className="batch-label__val">{dateStr}</span>
        </div>
      </div>
    </div>
  )
}
