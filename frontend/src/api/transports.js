import client from './client'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getTransports(params = {}) {
  if (USE_MOCK) return { data: { data: [], total: 0, page: 1, pages: 1 } }
  return client.get('/transports', { params })
}

export async function getAllTransports() {
  if (USE_MOCK) return { data: { data: [] } }
  return client.get('/transports/all')
}

export async function createTransport(data) {
  if (USE_MOCK) {
    const obj = { id: crypto.randomUUID(), ...data, is_active: true, created_at: new Date().toISOString() }
    return { data: { success: true, data: obj, message: 'Transport created' } }
  }
  return client.post('/transports', data)
}

export async function updateTransport(id, data) {
  if (USE_MOCK) return { data: { success: true, data: { id, ...data }, message: 'Transport updated' } }
  return client.patch(`/transports/${id}`, data)
}
