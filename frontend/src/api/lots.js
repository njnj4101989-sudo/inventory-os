import client from './client'
import { lots, rolls, mockPaginated, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getLots(params = {}) {
  if (USE_MOCK) {
    let filtered = [...lots]
    if (params.status) filtered = filtered.filter((l) => l.status === params.status)
    if (params.design_no) filtered = filtered.filter((l) =>
      (l.designs || []).some((d) => d.design_no === params.design_no)
    )
    return mockPaginated(filtered, params.page, params.page_size)
  }
  return client.get('/lots', { params })
}

export async function getLot(id) {
  if (USE_MOCK) {
    const lot = lots.find((l) => l.id === id)
    return mockResponse(lot)
  }
  return client.get(`/lots/${id}`)
}

export async function createLot(data) {
  if (USE_MOCK) {
    const pt = (data.product_type || 'FBL').toUpperCase()
    const prefix = `LT-${pt}-`
    const existing = lots.filter((l) => l.lot_code.startsWith(prefix)).length
    const nextCode = `${prefix}${String(existing + 1).padStart(4, '0')}`

    const designs = data.designs || []
    const piecesPerPalla = designs.reduce((s, d) => s + Object.values(d.size_pattern || {}).reduce((a, v) => a + v, 0), 0)

    const lotRolls = (data.rolls || []).map((r) => {
      const roll = rolls.find((rl) => rl.id === r.roll_id)
      const remaining = roll ? parseFloat(roll.remaining_weight) : 0
      const numPallas = Math.floor(remaining / r.palla_weight)
      const weightUsed = +(numPallas * r.palla_weight).toFixed(3)
      const wasteWeight = +(remaining - weightUsed).toFixed(3)
      const piecesFromRoll = numPallas * piecesPerPalla

      if (roll) {
        roll.remaining_weight = wasteWeight
        if (wasteWeight <= 0) roll.status = 'in_cutting'
      }

      return {
        id: crypto.randomUUID(),
        roll_id: r.roll_id,
        roll_code: roll ? roll.roll_code : 'ROLL-XXXX',
        color: roll ? roll.color : '',
        roll_weight: roll ? roll.total_weight : 0,
        palla_weight: r.palla_weight,
        num_pallas: numPallas,
        weight_used: weightUsed,
        waste_weight: wasteWeight,
        size_pattern: r.size_pattern || null,
        pieces_from_roll: piecesFromRoll,
      }
    })

    const totalPallas = lotRolls.reduce((s, r) => s + r.num_pallas, 0)
    const totalPieces = totalPallas * piecesPerPalla
    const totalWeight = lotRolls.reduce((s, r) => s + r.weight_used, 0)

    const newLot = {
      id: crypto.randomUUID(),
      lot_code: nextCode,
      lot_date: data.lot_date,
      product_type: pt,
      standard_palla_weight: data.standard_palla_weight,
      standard_palla_meter: data.standard_palla_meter || null,
      designs: designs,
      pieces_per_palla: piecesPerPalla,
      total_pallas: totalPallas,
      total_pieces: totalPieces,
      total_weight: +totalWeight.toFixed(3),
      status: 'open',
      created_by_user: { id: '00000000-0000-4000-a000-000000000002', full_name: 'Ravi Kumar' },
      lot_rolls: lotRolls,
      created_at: new Date().toISOString(),
      notes: data.notes || null,
    }
    lots.push(newLot)
    return mockResponse(newLot, 'Lot created')
  }
  return client.post('/lots', data)
}

export async function updateLot(id, data) {
  if (USE_MOCK) {
    const lot = lots.find((l) => l.id === id)
    if (lot) Object.assign(lot, data)
    return mockResponse(lot, 'Lot updated')
  }
  return client.patch(`/lots/${id}`, data)
}
