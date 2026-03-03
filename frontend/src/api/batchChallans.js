import client from './client'
import { mockResponse, mockPaginated } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// In-memory mock store
const mockBatchChallans = []
let mockSeq = 0

export async function createBatchChallan(data) {
  if (USE_MOCK) {
    mockSeq++
    const challan = {
      id: crypto.randomUUID(),
      challan_no: `BC-${String(mockSeq).padStart(3, '0')}`,
      processor_name: data.processor_name,
      value_addition: data._vaObj || null,
      total_pieces: (data.batches || []).reduce((s, b) => s + (b.pieces_to_send || 0), 0),
      total_cost: null,
      status: 'sent',
      sent_date: new Date().toISOString(),
      received_date: null,
      notes: data.notes || null,
      created_by_user: { id: '00000000-0000-4000-a000-000000000002', full_name: 'Ravi Kumar' },
      created_at: new Date().toISOString(),
      batch_items: (data.batches || []).map((b) => ({
        id: crypto.randomUUID(),
        batch: data._batchMap?.[b.batch_id] || { id: b.batch_id, batch_code: '—', size: null },
        pieces_sent: b.pieces_to_send,
        pieces_received: null,
        cost: null,
        status: 'sent',
        phase: data._phase || 'stitching',
      })),
    }
    mockBatchChallans.push(challan)
    return mockResponse(challan, 'Batch challan created')
  }
  const { _vaObj, _batchMap, _phase, ...apiPayload } = data
  return client.post('/batch-challans', apiPayload)
}

export async function getNextBCNumber() {
  if (USE_MOCK) {
    return mockResponse({ next_challan_no: `BC-${String(mockSeq + 1).padStart(3, '0')}` })
  }
  return client.get('/batch-challans/next-number')
}

export async function getBatchChallans(params = {}) {
  if (USE_MOCK) {
    return mockPaginated(mockBatchChallans, params.page, params.page_size)
  }
  return client.get('/batch-challans', { params })
}

export async function getBatchChallan(id) {
  if (USE_MOCK) {
    const challan = mockBatchChallans.find((c) => c.id === id)
    if (!challan) throw { response: { data: { detail: 'Batch challan not found' } } }
    return mockResponse(challan)
  }
  return client.get(`/batch-challans/${id}`)
}

export async function receiveBatchChallan(id, data) {
  if (USE_MOCK) {
    const challan = mockBatchChallans.find((c) => c.id === id)
    if (!challan) throw { response: { data: { detail: 'Batch challan not found' } } }
    if (challan.status === 'received') throw { response: { data: { detail: 'Challan already received' } } }
    let totalCost = 0
    for (const entry of (data.batches || [])) {
      const item = challan.batch_items.find((i) => i.batch?.id === entry.batch_id)
      if (item) {
        item.pieces_received = entry.pieces_received
        item.cost = entry.cost || null
        item.status = 'received'
        totalCost += entry.cost || 0
      }
    }
    challan.status = 'received'
    challan.received_date = new Date().toISOString()
    challan.total_cost = totalCost || null
    if (data.notes) challan.notes = data.notes
    return mockResponse(challan, 'Batch challan received')
  }
  return client.post(`/batch-challans/${id}/receive`, data)
}
