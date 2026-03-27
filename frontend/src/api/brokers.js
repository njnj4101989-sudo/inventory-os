import client from './client'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getBrokers(params = {}) {
  if (USE_MOCK) return { data: { data: [], total: 0, page: 1, pages: 1 } }
  return client.get('/brokers', { params })
}

export async function getAllBrokers() {
  if (USE_MOCK) return { data: { data: [] } }
  return client.get('/brokers/all')
}

export async function createBroker(data) {
  if (USE_MOCK) {
    const obj = { id: crypto.randomUUID(), ...data, is_active: true, created_at: new Date().toISOString() }
    return { data: { success: true, data: obj, message: 'Broker created' } }
  }
  return client.post('/brokers', data)
}

export async function updateBroker(id, data) {
  if (USE_MOCK) return { data: { success: true, data: { id, ...data }, message: 'Broker updated' } }
  return client.patch(`/brokers/${id}`, data)
}
