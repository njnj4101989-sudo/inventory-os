/**
 * Thermal batch label — Option A "Boarding Pass" (S109).
 * Returns { hero, qrValue, rows } — wrapper composes chrome.
 * Scan → /scan/batch/{batch_code}
 *
 * Batch model has flat design_no/size/quantity fields. Color is multi-valued
 * via color_breakdown JSON ({ Red: 10, Blue: 20, ... }) — show joined keys,
 * or "MIX (n)" if too many. Date format is "DD Mon" (no year).
 */
export default function buildBatchLabel(batch, meta, appBaseUrl) {
  const batchCode = batch?.batch_code || ''
  const qrValue = `${appBaseUrl || window.location.origin}/scan/batch/${encodeURIComponent(batchCode)}`

  const { lotCode, designNo, lotDate } = meta || {}
  const dateStr = lotDate
    ? new Date(lotDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    : '—'

  // Summarise color_breakdown: { Red: 10, Blue: 20 } → "Red/Blue" or "MIX (4)"
  let colorSummary = '—'
  const cb = batch?.color_breakdown
  if (cb && typeof cb === 'object') {
    const keys = Object.keys(cb)
    if (keys.length === 1) colorSummary = keys[0]
    else if (keys.length >= 2 && keys.length <= 3) colorSummary = keys.join('/')
    else if (keys.length > 3) colorSummary = `MIX (${keys.length})`
  }

  return {
    hero: batchCode || '—',
    qrValue,
    rows: [
      { k: 'LOT',  v: lotCode || '—' },
      { k: 'DES',  v: designNo || batch?.design_no || '—' },
      { k: 'COL',  v: colorSummary },
      { k: 'SIZE', v: batch?.size || '—', emph: true },
      { k: 'QTY',  v: batch?.quantity ?? '—' },
      { k: 'DT',   v: dateStr },
    ],
  }
}
