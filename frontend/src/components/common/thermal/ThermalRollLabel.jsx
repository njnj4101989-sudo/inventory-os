/**
 * Thermal roll label — Option A "Boarding Pass" + Smart Minimal (S109).
 * Returns { hero (top strip), qrValue, rows } — wrapper composes chrome.
 * Scan → /scan/roll/{roll_code}
 *
 * Design philosophy: roll code already encodes {SrNo-Fabric-Color-Seq}, so
 * SR/FAB/COL rows are pure redundancy. Instead: huge weight/length as visual
 * hero (primary production metric) + INV/DT rows (unique-to-the-label fields).
 * Unit auto-adapts: kg or m depending on roll.unit. Hero stacks number + unit
 * so "24.8 kg" doesn't overflow at 18pt.
 */
export default function buildRollLabel(roll, appBaseUrl) {
  const rollCode = roll?.roll_code || ''
  const qrValue = `${appBaseUrl || window.location.origin}/scan/roll/${encodeURIComponent(rollCode)}`

  const weight = roll?.total_weight
  const unit = roll?.unit || 'kg'
  const fmtWeight = (n) => (n != null ? parseFloat(n).toFixed(1) : '—')

  const dateStr = roll?.supplier_invoice_date
    ? new Date(roll.supplier_invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    : roll?.received_at
    ? new Date(roll.received_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    : '—'

  return {
    hero: roll?.enhanced_roll_code || rollCode || '—',
    qrValue,
    rows: [
      { hero: fmtWeight(weight), heroUnit: unit },
      { k: 'SR',  v: roll?.sr_no || '—' },
      { k: 'INV', v: roll?.supplier_invoice_no || '—' },
      { k: 'DT',  v: dateStr },
    ],
  }
}
