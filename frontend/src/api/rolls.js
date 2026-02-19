import client from './client'
import { rolls, suppliers, fabrics as mockFabrics, colors as mockColors, rollProcessing, mockPaginated, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// ── Roll code generator: {Challan}-{FabricCode}-{ColorCode}-{Seq} ──
// Uses pre-resolved codes from master data. Falls back to name-based shortening.
function resolveFabricCode(fabricName) {
  if (!fabricName) return 'UNK'
  const match = mockFabrics.find((f) => f.name.toLowerCase() === fabricName.toLowerCase())
  if (match) return match.code
  // Fallback: first 3 consonants
  const clean = fabricName.replace(/[^a-zA-Z]/g, '').toUpperCase()
  const consonants = clean.replace(/[AEIOU]/g, '')
  return (consonants.length >= 3 ? consonants.slice(0, 3) : clean.slice(0, 3))
}
function resolveColorCode(colorName) {
  if (!colorName) return 'UNK'
  const match = mockColors.find((c) => c.name.toLowerCase() === colorName.toLowerCase())
  if (match) return match.code
  return colorName.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 5)
}
function generateRollCode(challanNo, fabricType, color, fabricCode, colorCode, colorNo) {
  const challan = (challanNo || '').trim() || 'NOINV'
  const fc = fabricCode || resolveFabricCode(fabricType)
  let cc = colorCode || resolveColorCode(color)
  if (colorNo) cc = `${cc}/${String(colorNo).padStart(2, '0')}`
  const prefix = `${challan}-${fc}-${cc}-`
  let max = 0
  for (const r of rolls) {
    if (r.roll_code.startsWith(prefix)) {
      const last = r.roll_code.split('-').pop()
      const num = parseInt(last, 10)
      if (num > max) max = num
    }
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`
}

export async function getRolls(params = {}) {
  if (USE_MOCK) {
    let filtered = [...rolls]
    if (params.fabric_type) {
      const q = params.fabric_type.toLowerCase()
      filtered = filtered.filter((r) =>
        r.fabric_type.toLowerCase().includes(q) ||
        r.color.toLowerCase().includes(q) ||
        r.roll_code.toLowerCase().includes(q) ||
        (r.supplier_invoice_no || '').toLowerCase().includes(q)
      )
    }
    if (params.color) filtered = filtered.filter((r) => r.color === params.color)
    if (params.has_remaining) filtered = filtered.filter((r) => r.remaining_weight > 0)
    if (params.fully_consumed) filtered = filtered.filter((r) => r.remaining_weight <= 0)
    if (params.status) filtered = filtered.filter((r) => (r.status || 'in_stock') === params.status)
    if (params.supplier_id) filtered = filtered.filter((r) => r.supplier?.id === params.supplier_id)
    if (params.fabric_filter) filtered = filtered.filter((r) => r.fabric_type === params.fabric_filter)
    if (params.value_addition_id === 'none') {
      filtered = filtered.filter((r) => !r.processing_logs || r.processing_logs.length === 0)
    } else if (params.value_addition_id) {
      filtered = filtered.filter((r) => r.processing_logs?.some((l) => l.value_addition_id === params.value_addition_id))
    }
    return mockPaginated(filtered, params.page, params.page_size)
  }
  return client.get('/rolls', { params })
}

export async function stockIn(data) {
  if (USE_MOCK) {
    const nextCode = generateRollCode(data.sr_no, data.fabric_type, data.color, data.fabric_code, data.color_code, data.color_no)
    const sup = suppliers.find((s) => s.id === data.supplier_id)
    const newRoll = {
      id: crypto.randomUUID(),
      roll_code: nextCode,
      ...data,
      remaining_weight: data.total_weight || 0,
      current_weight: data.total_weight || 0,
      status: 'in_stock',
      processing_logs: [],
      supplier: sup ? { id: sup.id, name: sup.name } : null,
      received_by_user: { id: '00000000-0000-4000-a000-000000000002', full_name: 'Ravi Kumar' },
      received_at: new Date().toISOString(),
    }
    rolls.push(newRoll)
    return mockResponse({ roll: newRoll, event: { id: crypto.randomUUID() } }, 'Roll stocked in')
  }
  return client.post('/rolls', data)
}

/**
 * Bulk stock-in: shared invoice header + array of rolls.
 * Backend currently accepts one roll at a time, so we loop.
 * Returns array of results.
 */
export async function stockInBulk(header, rollEntries) {
  const results = []
  for (const entry of rollEntries) {
    const payload = {
      fabric_type: entry.fabric_type,
      color: entry.color,
      total_weight: entry.unit === 'kg' ? parseFloat(entry.quantity) : (entry.weight ? parseFloat(entry.weight) : 0),
      unit: entry.unit,
      cost_per_unit: entry.cost_per_unit ? parseFloat(entry.cost_per_unit) : null,
      total_length: entry.unit === 'meters' ? parseFloat(entry.quantity) : (entry.length ? parseFloat(entry.length) : null),
      supplier_id: header.supplier_id || null,
      supplier_invoice_no: header.supplier_invoice_no || null,
      supplier_challan_no: header.supplier_challan_no || null,
      supplier_invoice_date: header.supplier_invoice_date || null,
      sr_no: header.sr_no || null,
      panna: entry.panna ? parseFloat(entry.panna) : null,
      gsm: entry.gsm ? parseFloat(entry.gsm) : null,
      notes: entry.notes || null,
      fabric_code: entry.fabric_code || null,
      color_code: entry.color_code || null,
      color_no: entry.color_no || null,
    }
    const res = await stockIn(payload)
    results.push(res)
  }
  return results
}

/**
 * Get rolls grouped by supplier_invoice_no.
 * Returns array of invoice objects with aggregated data + nested rolls.
 */
export async function getInvoices(params = {}) {
  if (USE_MOCK) {
    const grouped = {}
    for (const r of rolls) {
      const key = r.supplier_invoice_no || `NO-INV-${r.id}`
      if (!grouped[key]) {
        grouped[key] = {
          invoice_no: r.supplier_invoice_no || null,
          challan_no: r.supplier_challan_no || null,
          invoice_date: r.supplier_invoice_date || null,
          sr_no: r.sr_no || null,
          supplier: r.supplier,
          rolls: [],
          roll_count: 0,
          total_weight: 0,
          total_length: 0,
          total_value: 0,
          received_at: r.received_at,
        }
      }
      const inv = grouped[key]
      inv.rolls.push(r)
      inv.roll_count++
      inv.total_weight += parseFloat(r.total_weight) || 0
      if (r.total_length) inv.total_length += parseFloat(r.total_length)
      inv.total_value += (parseFloat(r.total_weight) || 0) * (parseFloat(r.cost_per_unit) || 0)
      // Use earliest received_at
      if (r.received_at < inv.received_at) inv.received_at = r.received_at
    }
    let invoices = Object.values(grouped).sort((a, b) => b.received_at.localeCompare(a.received_at))
    if (params.search) {
      const q = params.search.toLowerCase()
      invoices = invoices.filter((inv) =>
        (inv.invoice_no || '').toLowerCase().includes(q) ||
        (inv.challan_no || '').toLowerCase().includes(q) ||
        (inv.sr_no || '').toLowerCase().includes(q) ||
        (inv.supplier?.name || '').toLowerCase().includes(q) ||
        inv.rolls.some((r) => r.fabric_type.toLowerCase().includes(q) || r.color.toLowerCase().includes(q))
      )
    }
    return mockPaginated(invoices, params.page, params.page_size)
  }
  // Real API — backend would need a grouped endpoint; fallback to client-side grouping
  const res = await client.get('/rolls', { params: { page_size: 500, ...params } })
  const allRolls = res.data.data
  const grouped = {}
  for (const r of allRolls) {
    const key = r.supplier_invoice_no || `NO-INV-${r.id}`
    if (!grouped[key]) {
      grouped[key] = {
        invoice_no: r.supplier_invoice_no || null,
        challan_no: r.supplier_challan_no || null,
        invoice_date: r.supplier_invoice_date || null,
        sr_no: r.sr_no || null,
        supplier: r.supplier,
        rolls: [],
        roll_count: 0,
        total_weight: 0,
        total_length: 0,
        total_value: 0,
        received_at: r.received_at,
      }
    }
    const inv = grouped[key]
    inv.rolls.push(r)
    inv.roll_count++
    inv.total_weight += parseFloat(r.total_weight) || 0
    if (r.total_length) inv.total_length += parseFloat(r.total_length)
    inv.total_value += (parseFloat(r.total_weight) || 0) * (parseFloat(r.cost_per_unit) || 0)
  }
  const invoices = Object.values(grouped).sort((a, b) => b.received_at.localeCompare(a.received_at))
  return { data: { data: invoices, total: invoices.length, page: 1, pages: 1 } }
}

/**
 * Public passport — full chain for a roll. No auth required.
 * Used by /scan/roll/:rollCode page (QR scan landing).
 */
export async function getRollPassport(rollCode) {
  if (USE_MOCK) {
    const roll = rolls.find((r) => r.roll_code === rollCode)
    if (!roll) throw { response: { data: { detail: `Roll '${rollCode}' not found` } } }
    // Build a passport-shaped response from mock data
    const passport = {
      ...roll,
      lots: [],
      batches: [],
      orders: [],
      effective_sku: null,
    }
    return mockResponse(passport)
  }
  // Public endpoint — no auth header needed (backend has no auth dependency)
  return client.get(`/rolls/${encodeURIComponent(rollCode)}/passport`)
}

export async function getRoll(id) {
  if (USE_MOCK) {
    const roll = rolls.find((r) => r.id === id)
    return mockResponse({ ...roll, consumption_history: [] })
  }
  return client.get(`/rolls/${id}`)
}

export async function updateRoll(id, data) {
  if (USE_MOCK) {
    const idx = rolls.findIndex((r) => r.id === id)
    if (idx === -1) throw { response: { data: { detail: 'Roll not found' } } }
    const roll = rolls[idx]
    if (roll.remaining_weight < roll.current_weight) {
      throw { response: { data: { detail: 'Cannot edit a roll that has already been consumed' } } }
    }
    Object.assign(roll, data)
    if (data.total_weight != null) {
      roll.remaining_weight = data.total_weight
      roll.current_weight = data.total_weight
    }
    if (data.supplier_id) {
      const sup = suppliers.find((s) => s.id === data.supplier_id)
      roll.supplier = sup ? { id: sup.id, name: sup.name } : roll.supplier
    }
    return mockResponse(roll, 'Roll updated')
  }
  return client.patch(`/rolls/${id}`, data)
}

// ── Processing ──

export async function getProcessingRolls() {
  if (USE_MOCK) {
    const processing = rolls.filter((r) => r.status === 'sent_for_processing')
    return mockResponse(processing)
  }
  return client.get('/rolls', { params: { status: 'sent_for_processing' } })
}

export async function sendForProcessing(rollId, data) {
  if (USE_MOCK) {
    const roll = rolls.find((r) => r.id === rollId)
    if (!roll) throw { response: { data: { detail: 'Roll not found' } } }
    if (roll.status !== 'in_stock') throw { response: { data: { detail: 'Roll must be in_stock to send for processing' } } }
    const log = {
      id: crypto.randomUUID(),
      roll_id: rollId,
      value_addition_id: data.value_addition_id,
      value_addition: { id: data.value_addition_id, name: 'Value Addition', short_code: 'VA' },
      vendor_name: data.vendor_name,
      vendor_phone: data.vendor_phone || null,
      sent_date: data.sent_date,
      received_date: null,
      weight_before: roll.current_weight,
      weight_after: null,
      length_before: roll.total_length,
      length_after: null,
      processing_cost: null,
      status: 'sent',
      notes: data.notes || null,
    }
    roll.status = 'sent_for_processing'
    roll.processing_logs = [...(roll.processing_logs || []), log]
    rollProcessing.push(log)
    return mockResponse(log, 'Roll sent for processing')
  }
  return client.post(`/rolls/${rollId}/processing`, data)
}

export async function updateProcessingLog(rollId, processingId, data) {
  if (USE_MOCK) {
    const roll = rolls.find((r) => r.id === rollId)
    if (!roll) throw { response: { data: { detail: 'Roll not found' } } }
    const log = (roll.processing_logs || []).find((p) => p.id === processingId)
    if (!log) throw { response: { data: { detail: 'Processing log not found' } } }
    // Apply partial updates
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && v !== null) log[k] = typeof v === 'string' && !isNaN(v) && k !== 'notes' && k !== 'vendor_name' && k !== 'vendor_phone' && k !== 'value_addition_id' ? parseFloat(v) : v
    }
    return mockResponse(roll, 'Processing log updated')
  }
  return client.patch(`/rolls/${rollId}/processing/${processingId}/edit`, data)
}

export async function receiveFromProcessing(rollId, processingId, data) {
  if (USE_MOCK) {
    const roll = rolls.find((r) => r.id === rollId)
    if (!roll) throw { response: { data: { detail: 'Roll not found' } } }
    const log = (roll.processing_logs || []).find((p) => p.id === processingId)
    if (!log) throw { response: { data: { detail: 'Processing log not found' } } }
    log.received_date = data.received_date
    log.weight_after = parseFloat(data.weight_after)
    log.length_after = data.length_after ? parseFloat(data.length_after) : null
    log.processing_cost = data.processing_cost ? parseFloat(data.processing_cost) : null
    log.status = 'received'
    if (data.notes) log.notes = (log.notes ? log.notes + ' | ' : '') + data.notes
    // Update current weight (total_weight stays immutable — original supplier weight)
    roll.current_weight = log.weight_after
    roll.remaining_weight = log.weight_after
    if (log.length_after) roll.total_length = log.length_after
    // Add processing cost to roll cost
    if (log.processing_cost && roll.cost_per_unit) {
      roll.cost_per_unit = parseFloat(roll.cost_per_unit) + (log.processing_cost / log.weight_after)
    }
    roll.status = 'in_stock'
    return mockResponse(log, 'Roll received from processing')
  }
  return client.patch(`/rolls/${rollId}/processing/${processingId}`, data)
}
