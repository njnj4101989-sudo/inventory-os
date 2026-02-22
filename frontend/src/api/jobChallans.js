import client from './client'
import { mockResponse, mockPaginated } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// In-memory mock store
const mockChallans = []
let mockSeq = 0

export async function createJobChallan(data) {
  if (USE_MOCK) {
    mockSeq++
    const challan = {
      id: crypto.randomUUID(),
      challan_no: `JC-${String(mockSeq).padStart(3, '0')}`,
      value_addition: data._vaObj || null,
      vendor_name: data.vendor_name,
      vendor_phone: data.vendor_phone || null,
      sent_date: data.sent_date,
      notes: data.notes || null,
      created_by_user: { id: '00000000-0000-4000-a000-000000000001', full_name: 'Nitish Admin' },
      created_at: new Date().toISOString(),
      rolls: data._rolls || [],
      total_weight: (data._rolls || []).reduce((s, r) => s + (parseFloat(r.current_weight || r.total_weight) || 0), 0),
      roll_count: (data._rolls || []).length,
    }
    mockChallans.push(challan)
    return mockResponse(challan, 'Job challan created')
  }
  return client.post('/job-challans', data)
}

export async function getJobChallans(params = {}) {
  if (USE_MOCK) {
    return mockPaginated(mockChallans, params.page, params.page_size)
  }
  return client.get('/job-challans', { params })
}

export async function getJobChallan(id) {
  if (USE_MOCK) {
    const challan = mockChallans.find((c) => c.id === id)
    if (!challan) throw { response: { data: { detail: 'Job challan not found' } } }
    return mockResponse(challan)
  }
  return client.get(`/job-challans/${id}`)
}
