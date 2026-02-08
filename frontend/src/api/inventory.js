import client from './client'
import { inventory, inventoryEvents, mockPaginated, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getInventory(params = {}) {
  if (USE_MOCK) {
    let filtered = [...inventory]
    if (params.sku_code) {
      filtered = filtered.filter((i) => i.sku.sku_code === params.sku_code)
    }
    if (params.low_stock) {
      filtered = filtered.filter((i) => i.available_qty < 20)
    }
    return mockPaginated(filtered, params.page, params.page_size)
  }
  return client.get('/inventory', { params })
}

export async function getEvents(skuId, params = {}) {
  if (USE_MOCK) {
    return mockPaginated(inventoryEvents, params.page, params.page_size)
  }
  return client.get(`/inventory/${skuId}/events`, { params })
}

export async function adjust(data) {
  if (USE_MOCK) {
    return mockResponse(
      { event: { id: crypto.randomUUID() }, inventory: inventory[0] },
      `Stock adjusted: -${data.quantity} pieces (${data.event_type})`
    )
  }
  return client.post('/inventory/adjust', data)
}

export async function reconcile() {
  if (USE_MOCK) {
    return mockResponse(
      { skus_checked: 3, mismatches_found: 0, mismatches_fixed: 0 },
      'Reconciliation complete. No mismatches.'
    )
  }
  return client.post('/inventory/reconcile')
}
