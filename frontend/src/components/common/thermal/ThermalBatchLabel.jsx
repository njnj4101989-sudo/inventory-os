/**
 * Thermal batch label — Option A "Boarding Pass" (S109).
 * Returns { hero, qrValue, rows } — wrapper composes chrome.
 * Scan → /scan/batch/{batch_code}
 */
export default function buildBatchLabel(batch, meta, appBaseUrl) {
  const batchCode = batch?.batch_code || ''
  const qrValue = `${appBaseUrl || window.location.origin}/scan/batch/${encodeURIComponent(batchCode)}`

  const { lotCode, designNo, lotDate } = meta || {}
  const dateStr = lotDate
    ? new Date(lotDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'

  return {
    hero: batchCode || '—',
    qrValue,
    rows: [
      { k: 'LOT',  v: lotCode || '—' },
      { k: 'DES',  v: designNo || batch?.design_no || '—' },
      { k: 'COL',  v: batch?.color?.name || batch?.color_name || '—' },
      { k: 'SIZE', v: batch?.size || '—', emph: true },
      { k: 'QTY',  v: batch?.total_qty || batch?.quantity || '—' },
      { k: 'DT',   v: dateStr },
    ],
  }
}
