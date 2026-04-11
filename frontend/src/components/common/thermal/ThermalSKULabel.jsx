/**
 * Thermal SKU label — Option A "Boarding Pass" (S109).
 * Returns { hero, qrValue, rows } — wrapper composes chrome.
 * Scan → /scan/sku/{sku_code}
 */
export default function buildSkuLabel(sku, appBaseUrl) {
  const skuCode = sku?.sku_code || ''
  const qrValue = `${appBaseUrl || window.location.origin}/scan/sku/${encodeURIComponent(skuCode)}`

  const priceValue = sku?.mrp || sku?.sale_rate || sku?.base_price
  const priceLabel = sku?.mrp ? 'MRP' : 'RATE'
  const fmtPrice = (v) => (v ? `₹${parseFloat(v).toLocaleString('en-IN')}` : '—')

  const rows = [
    { k: 'DES',  v: sku?.design_no || sku?.design?.design_no || '—' },
    { k: 'COL',  v: sku?.color || sku?.color_name || '—' },
    { k: 'SIZE', v: sku?.size || '—', emph: true },
    { k: 'TYPE', v: sku?.product_type || '—' },
  ]
  if (priceValue) rows.push({ k: priceLabel, v: fmtPrice(priceValue) })
  if (sku?.product_name) rows.push({ k: null, v: sku.product_name })

  return {
    hero: skuCode || '—',
    qrValue,
    rows: rows.slice(0, 6),
  }
}
