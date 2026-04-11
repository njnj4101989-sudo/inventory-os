import { QRCodeSVG } from 'qrcode.react'

/**
 * Thermal roll label content (inner only — wrapper div is ThermalLabelSheet).
 * Target size: 54x40mm, QR 20x20mm, text 32x40mm.
 * Scan -> /scan/roll/{roll_code}
 */
export default function ThermalRollLabel({ roll, appBaseUrl }) {
  const rollCode = roll?.roll_code || ''
  const scanUrl = `${appBaseUrl || window.location.origin}/scan/roll/${encodeURIComponent(rollCode)}`

  const fmt = (n) => (n != null ? parseFloat(n).toFixed(1) : '—')
  const dateStr = roll?.supplier_invoice_date
    ? new Date(roll.supplier_invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : roll?.received_at
    ? new Date(roll.received_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'

  return (
    <>
      <div className="thermal-label__qr">
        <QRCodeSVG value={scanUrl} size={200} level="H" includeMargin={false} />
      </div>
      <div className="thermal-label__info">
        <div className="thermal-label__code">{roll?.enhanced_roll_code || rollCode}</div>
        <div className="thermal-label__row">
          <span className="thermal-label__key">Wt</span>
          <span className="thermal-label__val">{fmt(roll?.total_weight)} {roll?.unit || 'kg'}</span>
        </div>
        <div className="thermal-label__row">
          <span className="thermal-label__key">Sr</span>
          <span className="thermal-label__val">{roll?.sr_no || '—'}</span>
        </div>
        <div className="thermal-label__row">
          <span className="thermal-label__key">Inv</span>
          <span className="thermal-label__val">{roll?.supplier_invoice_no || '—'}</span>
        </div>
        <div className="thermal-label__row">
          <span className="thermal-label__key">Date</span>
          <span className="thermal-label__val">{dateStr}</span>
        </div>
      </div>
    </>
  )
}
