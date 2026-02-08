import client from './client'
import { batches, mockPaginated, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getBatches(params = {}) {
  if (USE_MOCK) {
    let filtered = [...batches]
    if (params.status) filtered = filtered.filter((b) => b.status === params.status)
    if (params.sku_id) filtered = filtered.filter((b) => b.sku.id === params.sku_id)
    return mockPaginated(filtered, params.page, params.page_size)
  }
  return client.get('/batches', { params })
}

export async function createBatch(data) {
  if (USE_MOCK) {
    const nextCode = `BATCH-${String(batches.length + 1).padStart(4, '0')}`
    const totalPieces = (data.rolls || []).reduce((sum, r) => sum + r.pieces_cut, 0)
    const newBatch = {
      id: crypto.randomUUID(),
      batch_code: nextCode,
      sku: { id: data.sku_id, sku_code: 'BLS-101-Red-M', product_name: 'Design 101 Red Medium' },
      quantity: totalPieces,
      status: 'CREATED',
      qr_code_data: `https://inv.local/batch/${crypto.randomUUID()}`,
      created_by_user: { id: '00000000-0000-4000-a000-000000000002', full_name: 'Ravi Kumar' },
      assignment: null,
      rolls_used: (data.rolls || []).map((r) => ({
        roll_code: 'ROLL-XXXX', pieces_cut: r.pieces_cut, length_used: r.length_used,
      })),
      created_at: new Date().toISOString(),
      assigned_at: null, started_at: null, submitted_at: null,
      checked_at: null, completed_at: null,
      approved_qty: null, rejected_qty: null, rejection_reason: null,
      notes: data.notes || null,
    }
    batches.push(newBatch)
    return mockResponse({ batch: newBatch, events: [] }, 'Batch created')
  }
  return client.post('/batches', data)
}

export async function assignBatch(id, tailorId) {
  if (USE_MOCK) {
    const batch = batches.find((b) => b.id === id)
    if (batch) {
      batch.status = 'ASSIGNED'
      batch.assigned_at = new Date().toISOString()
      batch.assignment = {
        tailor: { id: tailorId, full_name: 'Amit Singh' },
        assigned_at: batch.assigned_at,
      }
    }
    return mockResponse({ batch, assignment: batch?.assignment }, 'Batch assigned')
  }
  return client.post(`/batches/${id}/assign`, { tailor_id: tailorId })
}

export async function getBatch(id) {
  if (USE_MOCK) {
    const batch = batches.find((b) => b.id === id)
    return mockResponse(batch)
  }
  return client.get(`/batches/${id}`)
}
