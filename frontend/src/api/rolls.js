import client from './client'
import { rolls, mockPaginated, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getRolls(params = {}) {
  if (USE_MOCK) {
    let filtered = [...rolls]
    if (params.fabric_type) filtered = filtered.filter((r) => r.fabric_type === params.fabric_type)
    if (params.color) filtered = filtered.filter((r) => r.color === params.color)
    if (params.has_remaining) filtered = filtered.filter((r) => r.remaining_weight > 0)
    if (params.supplier_id) filtered = filtered.filter((r) => r.supplier?.id === params.supplier_id)
    return mockPaginated(filtered, params.page, params.page_size)
  }
  return client.get('/rolls', { params })
}

export async function stockIn(data) {
  if (USE_MOCK) {
    const nextCode = `ROLL-${String(rolls.length + 1).padStart(4, '0')}`
    const newRoll = {
      id: crypto.randomUUID(),
      roll_code: nextCode,
      ...data,
      remaining_weight: data.total_weight,
      supplier: { id: data.supplier_id, name: 'Krishna Textiles' },
      received_by_user: { id: '00000000-0000-4000-a000-000000000002', full_name: 'Ravi Kumar' },
      received_at: new Date().toISOString(),
      notes: data.notes || null,
    }
    rolls.push(newRoll)
    return mockResponse({ roll: newRoll, event: { id: crypto.randomUUID() } }, 'Roll stocked in')
  }
  return client.post('/rolls', data)
}

export async function getRoll(id) {
  if (USE_MOCK) {
    const roll = rolls.find((r) => r.id === id)
    return mockResponse({ ...roll, consumption_history: [] })
  }
  return client.get(`/rolls/${id}`)
}
