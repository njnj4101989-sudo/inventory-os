import { QRCodeSVG } from 'qrcode.react'

/**
 * Single roll label — renders one sticker.
 * Sized for ~9.5cm × 5.5cm (A4 — 8 per page).
 * QR encodes the roll_code. Scan → /scan/roll/{roll_code}
 */
export default function QRLabel({ roll, appBaseUrl }) {
  const rollCode = roll?.roll_code || ''
  // QR encodes the full scan URL so any QR app opens the passport directly
  const scanUrl = `${appBaseUrl || window.location.origin}/scan/roll/${encodeURIComponent(rollCode)}`

  const fmt = (n) => (n != null ? parseFloat(n).toFixed(1) : '—')
  const dateStr = roll?.supplier_invoice_date
    ? new Date(roll.supplier_invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : roll?.received_at
    ? new Date(roll.received_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'

  return (
    <div className="qr-label">
      {/* QR Code */}
      <div className="qr-label__qr">
        <QRCodeSVG
          value={scanUrl}
          size={130}
          level="H"
          includeMargin={true}
        />
      </div>

      {/* Roll details */}
      <div className="qr-label__info">
        <div className="qr-label__code">{roll?.enhanced_roll_code || rollCode}</div>

        <div className="qr-label__row">
          <span className="qr-label__key">Weight</span>
          <span className="qr-label__val">{fmt(roll?.total_weight)} {roll?.unit || 'kg'}</span>
        </div>
        <div className="qr-label__row">
          <span className="qr-label__key">Supplier</span>
          <span className="qr-label__val qr-label__val--sm">{roll?.supplier?.name || '—'}</span>
        </div>
        <div className="qr-label__row">
          <span className="qr-label__key">Date</span>
          <span className="qr-label__val">{dateStr}</span>
        </div>
      </div>
    </div>
  )
}
