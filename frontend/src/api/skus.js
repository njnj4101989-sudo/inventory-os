import client from './client'
import { skus, mockPaginated, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getSKUs(params = {}) {
  if (USE_MOCK) {
    let filtered = [...skus]
    if (params.product_type) filtered = filtered.filter((s) => s.product_type === params.product_type)
    if (params.color) filtered = filtered.filter((s) => s.color === params.color)
    if (params.size) filtered = filtered.filter((s) => s.size === params.size)
    if (params.is_active !== undefined) filtered = filtered.filter((s) => s.is_active === params.is_active)
    if (params.search) {
      const q = params.search.toLowerCase()
      filtered = filtered.filter(
        (s) => s.sku_code.toLowerCase().includes(q) || s.product_name.toLowerCase().includes(q)
      )
    }
    return mockPaginated(filtered, params.page, params.page_size)
  }
  return client.get('/skus', { params })
}

export async function createSKU(data) {
  if (USE_MOCK) {
    const code = `${data.product_name?.split(' ')[1] || '999'}-${data.color}-${data.size}`
    const newSku = {
      id: crypto.randomUUID(),
      sku_code: code,
      ...data,
      is_active: true,
      stock: { total_qty: 0, available_qty: 0, reserved_qty: 0 },
    }
    skus.push(newSku)
    return mockResponse(newSku, 'SKU created')
  }
  return client.post('/skus', data)
}

export async function updateSKU(id, data) {
  if (USE_MOCK) {
    const sku = skus.find((s) => s.id === id)
    if (sku) Object.assign(sku, data)
    return mockResponse(sku, 'SKU updated')
  }
  return client.patch(`/skus/${id}`, data)
}
