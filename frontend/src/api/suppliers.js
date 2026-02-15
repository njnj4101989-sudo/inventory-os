import client from './client'
import { suppliers, mockPaginated, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getSuppliers(params = {}) {
  if (USE_MOCK) {
    let filtered = [...suppliers]
    if (params.is_active !== undefined) filtered = filtered.filter((s) => s.is_active === params.is_active)
    if (params.search) {
      const s = params.search.toLowerCase()
      filtered = filtered.filter((sup) =>
        sup.name.toLowerCase().includes(s) ||
        (sup.contact_person || '').toLowerCase().includes(s) ||
        (sup.city || '').toLowerCase().includes(s) ||
        (sup.gst_no || '').toLowerCase().includes(s)
      )
    }
    return mockPaginated(filtered, params.page, params.page_size)
  }
  return client.get('/suppliers', { params })
}

export async function createSupplier(data) {
  if (USE_MOCK) {
    const newSupplier = {
      id: crypto.randomUUID(),
      ...data,
      is_active: true,
      created_at: new Date().toISOString(),
    }
    suppliers.push(newSupplier)
    return mockResponse(newSupplier, 'Supplier created')
  }
  return client.post('/suppliers', data)
}

export async function updateSupplier(id, data) {
  if (USE_MOCK) {
    const supplier = suppliers.find((s) => s.id === id)
    if (supplier) Object.assign(supplier, data)
    return mockResponse(supplier, 'Supplier updated')
  }
  return client.patch(`/suppliers/${id}`, data)
}
