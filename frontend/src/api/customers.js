import client from './client'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getCustomers(params = {}) {
  if (USE_MOCK) return { data: { data: [], total: 0, page: 1, pages: 1 } }
  return client.get('/customers', { params })
}

export async function getAllCustomers() {
  if (USE_MOCK) return { data: { data: [] } }
  return client.get('/customers/all')
}

export async function createCustomer(data) {
  if (USE_MOCK) {
    const obj = { id: crypto.randomUUID(), ...data, is_active: true, created_at: new Date().toISOString() }
    return { data: { success: true, data: obj, message: 'Customer created' } }
  }
  return client.post('/customers', data)
}

export async function updateCustomer(id, data) {
  if (USE_MOCK) return { data: { success: true, data: { id, ...data }, message: 'Customer updated' } }
  return client.patch(`/customers/${id}`, data)
}
