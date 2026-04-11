/**
 * Thermal SKU label — Option A "Boarding Pass" + Option 2 "Smart Minimal" (S109).
 * Returns { hero, qrValue, rows } — wrapper composes chrome.
 * Scan → /scan/sku/{sku_code}
 *
 * Design philosophy: SKU code already encodes {type}-{design}-{color}-{size},
 * so we don't repeat those as rows. Instead: huge SIZE as visual hero (warehouse
 * picking) + MRP/RATE (billing). Parses size from sku_code, mirroring SKUsPage.
 */
export default function buildSkuLabel(sku, appBaseUrl) {
  const skuCode = sku?.sku_code || ''
  const qrValue = `${appBaseUrl || window.location.origin}/scan/sku/${encodeURIComponent(skuCode)}`

  // Parse size from sku_code — same pattern as SKUsPage parseSKU()
  const basePart = skuCode.indexOf('+') > -1 ? skuCode.slice(0, skuCode.indexOf('+')) : skuCode
  const parts = basePart.split('-')
  const parsedSize = sku?.size || parts[3] || ''

  const priceValue = sku?.mrp || sku?.sale_rate || sku?.base_price
  const priceLabel = sku?.mrp ? 'MRP' : 'RATE'
  const fmtPrice = (v) => (v ? `₹${parseFloat(v).toLocaleString('en-IN')}` : '—')

  const rows = []
  if (parsedSize) rows.push({ hero: parsedSize })
  if (priceValue) rows.push({ k: priceLabel, v: fmtPrice(priceValue) })

  return {
    hero: skuCode || '—',
    qrValue,
    rows,
  }
}
