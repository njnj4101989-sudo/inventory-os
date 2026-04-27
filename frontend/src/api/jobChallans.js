import client from './client'
import { mockResponse, mockPaginated, vaParties } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// In-memory mock store
const mockChallans = []
let mockSeq = 0

export async function createJobChallan(data) {
  if (USE_MOCK) {
    mockSeq++
    const rollObjs = data._rolls || []
    const rollEntries = data.rolls || []
    // Build weight_sent map from entries
    const weightMap = {}
    for (const entry of rollEntries) {
      weightMap[entry.roll_id] = entry.weight_to_send
    }
    const rollBriefs = rollObjs.map((r) => ({
      ...r,
      weight_sent: weightMap[r.id] != null ? parseFloat(weightMap[r.id]) : parseFloat(r.current_weight || r.total_weight),
    }))
    const vaParty = vaParties.find((p) => p.id === data.va_party_id) || null
    const challan = {
      id: crypto.randomUUID(),
      challan_no: `JC-${String(mockSeq).padStart(3, '0')}`,
      value_addition: data._vaObj || null,
      va_party: vaParty ? { id: vaParty.id, name: vaParty.name, phone: vaParty.phone, city: vaParty.city } : null,
      sent_date: data.sent_date,
      notes: data.notes || null,
      created_by_user: { id: '00000000-0000-4000-a000-000000000001', full_name: 'Nitish Admin' },
      created_at: new Date().toISOString(),
      rolls: rollBriefs,
      total_weight: rollBriefs.reduce((s, r) => s + (r.weight_sent || 0), 0),
      roll_count: rollBriefs.length,
      // S121 — totals stack
      gst_percent: Number(data.gst_percent || 0),
      subtotal: 0,
      discount_amount: Number(data.discount_amount || 0),
      additional_amount: Number(data.additional_amount || 0),
      taxable_amount: 0,
      tax_amount: 0,
      total_amount: 0,
    }
    mockChallans.push(challan)
    return mockResponse(challan, 'Job challan created')
  }
  // Strip internal _rolls/_vaObj from payload — only send API fields
  const { _rolls, _vaObj, ...apiPayload } = data
  return client.post('/job-challans', apiPayload)
}

export async function getNextJCNumber() {
  if (USE_MOCK) {
    return mockResponse({ next_challan_no: `JC-${String(mockSeq + 1).padStart(3, '0')}` })
  }
  return client.get('/job-challans/next-number')
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

export async function getJobChallanByNo(challanNo) {
  if (USE_MOCK) {
    const challan = mockChallans.find((c) => c.challan_no === challanNo)
    if (!challan) throw { response: { data: { detail: 'Job challan not found' } } }
    return mockResponse(challan)
  }
  return client.get(`/job-challans/by-no/${encodeURIComponent(challanNo)}`)
}

export async function updateJobChallan(id, data) {
  if (USE_MOCK) {
    const challan = mockChallans.find((c) => c.id === id)
    if (!challan) throw { response: { data: { detail: 'Job challan not found' } } }
    if (data.va_party_id !== undefined) {
      const vp = vaParties.find((p) => p.id === data.va_party_id)
      if (vp) challan.va_party = { id: vp.id, name: vp.name, phone: vp.phone, city: vp.city }
    }
    if (data.value_addition_id !== undefined) challan.value_addition_id = data.value_addition_id
    if (data.sent_date !== undefined) challan.sent_date = data.sent_date
    if (data.notes !== undefined) challan.notes = data.notes
    return mockResponse(challan, 'Job challan updated')
  }
  return client.patch(`/job-challans/${id}`, data)
}

export async function receiveJobChallan(id, data) {
  if (USE_MOCK) {
    const challan = mockChallans.find((c) => c.id === id)
    if (!challan) throw { response: { data: { detail: 'Job challan not found' } } }
    if (challan.status === 'received') throw { response: { data: { detail: 'Challan already received' } } }
    // Mark rolls as received in mock
    let anyReceived = false
    for (const entry of (data.rolls || [])) {
      anyReceived = true
      // Mock: just track that it happened
    }
    const allReceived = (data.rolls || []).length === (challan.rolls || []).length
    challan.status = allReceived ? 'received' : 'partially_received'
    challan.received_date = data.received_date || new Date().toISOString().split('T')[0]
    return mockResponse(challan, 'Job challan received')
  }
  return client.post(`/job-challans/${id}/receive`, data)
}

export async function cancelJobChallan(id) {
  if (USE_MOCK) {
    const challan = mockChallans.find((c) => c.id === id)
    if (!challan) throw { response: { data: { detail: 'Job challan not found' } } }
    if (challan.status !== 'sent') throw { response: { data: { detail: 'Only sent challans can be cancelled' } } }
    challan.status = 'cancelled'
    return mockResponse(challan, 'Job challan cancelled')
  }
  return client.post(`/job-challans/${id}/cancel`)
}
