import { QRCodeSVG } from 'qrcode.react'

/**
 * Thermal SKU label content (inner only — wrapper div is ThermalLabelSheet).
 * Target size: 54x40mm, QR 20x20mm, text 32x40mm.
 * Scan -> /scan/sku/{sku_code}
 */
export default function ThermalSKULabel({ sku, appBaseUrl }) {
  const skuCode = sku?.sku_code || ''
  const scanUrl = `${appBaseUrl || window.location.origin}/scan/sku/${encodeURIComponent(skuCode)}`

  const priceValue = sku?.mrp || sku?.sale_rate || sku?.base_price
  const priceLabel = sku?.mrp ? 'MRP' : 'Rate'
  const fmtPrice = (v) => (v ? `₹${parseFloat(v).toLocaleString('en-IN')}` : null)

  return (
    <>
      <div className="thermal-label__qr">
        <QRCodeSVG value={scanUrl} size={200} level="H" includeMargin={false} />
      </div>
      <div className="thermal-label__info">
        <div className="thermal-label__code">{skuCode}</div>
        {sku?.product_name && (
          <div className="thermal-label__row">
            <span className="thermal-label__val">{sku.product_name}</span>
          </div>
        )}
        <div className="thermal-label__row">
          <span className="thermal-label__key">Color</span>
          <span className="thermal-label__val">{sku?.color || '—'}</span>
        </div>
        <div className="thermal-label__row">
          <span className="thermal-label__key">Size</span>
          <span className="thermal-label__val">{sku?.size || '—'}</span>
        </div>
        {priceValue && (
          <div className="thermal-label__row">
            <span className="thermal-label__key">{priceLabel}</span>
            <span className="thermal-label__val">{fmtPrice(priceValue)}</span>
          </div>
        )}
      </div>
    </>
  )
}
