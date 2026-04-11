/**
 * Thermal roll label — Option A "Boarding Pass" (S109).
 * Returns { hero, qrValue, rows } — wrapper composes chrome.
 * Scan → /scan/roll/{roll_code}
 */
export default function buildRollLabel(roll, appBaseUrl) {
  const rollCode = roll?.roll_code || ''
  const qrValue = `${appBaseUrl || window.location.origin}/scan/roll/${encodeURIComponent(rollCode)}`

  const fmt = (n) => (n != null ? parseFloat(n).toFixed(1) : '—')
  const dateStr = roll?.supplier_invoice_date
    ? new Date(roll.supplier_invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : roll?.received_at
    ? new Date(roll.received_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'

  return {
    hero: roll?.enhanced_roll_code || rollCode || '—',
    qrValue,
    rows: [
      { k: 'WT',  v: `${fmt(roll?.total_weight)} ${roll?.unit || 'kg'}` },
      { k: 'SR',  v: roll?.sr_no || '—' },
      { k: 'INV', v: roll?.supplier_invoice_no || '—' },
      { k: 'DT',  v: dateStr },
      { k: 'FAB', v: roll?.fabric?.name || roll?.fabric_name || '—' },
      { k: 'COL', v: roll?.color?.name || roll?.color_name || '—' },
    ],
  }
}
