/**
 * Thermal SKU label — V3 Hybrid + SIZE chip (S110).
 * Returns { hero, qrValue, rows } — wrapper composes chrome.
 * Scan → /scan/sku/{sku_code}
 *
 * Layout:
 *   Top strip:  full sku_code (unchanged)
 *   Data col:   D.NO  {design_no}      ← wraps 2 lines if long
 *               MRP   ₹price           ← emph (8pt 900)
 *               [ SIZE XL ]            ← bordered chip
 *
 * design_no === product_name in DB (stored string, can be "3054" or
 * "Rang De Basanti"). Size/price are explicit SKU fields.
 */
export default function buildSkuLabel(sku, appBaseUrl) {
  const skuCode = sku?.sku_code || ''
  const qrValue = `${appBaseUrl || window.location.origin}/scan/sku/${encodeURIComponent(skuCode)}`

  const designNo = sku?.product_name || ''
  const size = sku?.size || ''

  const mrp = sku?.mrp
  const fmtPrice = (v) => (v ? `₹${parseFloat(v).toLocaleString('en-IN')}` : '—')

  const rows = []
  if (designNo) rows.push({ k: 'D.NO', v: designNo, wrap: true })
  if (mrp) rows.push({ k: 'MRP', v: fmtPrice(mrp) })
  if (size) rows.push({ chip: `SIZE ${size}` })

  return {
    hero: skuCode || '—',
    qrValue,
    rows,
  }
}
