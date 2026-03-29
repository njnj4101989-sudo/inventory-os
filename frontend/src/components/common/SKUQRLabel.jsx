import { QRCodeSVG } from 'qrcode.react'

/**
 * Single SKU label — renders one sticker (~9.5cm x 5.5cm).
 * QR encodes the full scan URL. Scan -> /scan/sku/{sku_code}
 * Shows clean product info — NO VA codes on print.
 */
export default function SKUQRLabel({ sku, appBaseUrl }) {
  const skuCode = sku?.sku_code || ''
  const scanUrl = `${appBaseUrl || window.location.origin}/scan/sku/${encodeURIComponent(skuCode)}`

  const fmtPrice = (v) => v ? `₹${parseFloat(v).toLocaleString('en-IN')}` : '—'

  return (
    <div className="sku-label">
      <div className="sku-label__qr">
        <QRCodeSVG value={scanUrl} size={130} level="H" includeMargin={true} />
      </div>
      <div className="sku-label__info">
        <div className="sku-label__code">{skuCode}</div>
        <div className="sku-label__name">{sku?.product_name || '—'}</div>
        <div className="sku-label__row">
          <span className="sku-label__key">Color</span>
          <span className="sku-label__val">{sku?.color || '—'}</span>
        </div>
        <div className="sku-label__row">
          <span className="sku-label__key">Size</span>
          <span className="sku-label__val">{sku?.size || '—'}</span>
        </div>
        {(sku?.mrp || sku?.sale_rate || sku?.base_price) && (
          <div className="sku-label__row">
            <span className="sku-label__key">{sku?.mrp ? 'MRP' : 'Rate'}</span>
            <span className="sku-label__val">{fmtPrice(sku?.mrp || sku?.sale_rate || sku?.base_price)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
