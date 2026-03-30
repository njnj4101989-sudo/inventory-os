import client from './client'
import { inventory, inventoryEvents, mockPaginated, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getInventory(params = {}) {
  if (USE_MOCK) {
    let filtered = [...inventory]
    if (params.sku_code) {
      const q = params.sku_code.toLowerCase()
      filtered = filtered.filter((i) =>
        i.sku.sku_code.toLowerCase().includes(q) ||
        i.sku.product_name.toLowerCase().includes(q)
      )
    }
    if (params.product_type) {
      filtered = filtered.filter((i) => i.sku.sku_code.startsWith(params.product_type + '-'))
    }
    if (params.stock_status === 'low') {
      filtered = filtered.filter((i) => {
        const pct = i.total_qty > 0 ? (i.available_qty / i.total_qty) * 100 : 0
        return pct > 0 && pct < 60
      })
    } else if (params.stock_status === 'critical') {
      filtered = filtered.filter((i) => i.available_qty <= 0 || i.total_qty === 0)
    } else if (params.stock_status === 'healthy') {
      filtered = filtered.filter((i) => {
        const pct = i.total_qty > 0 ? (i.available_qty / i.total_qty) * 100 : 0
        return pct >= 60
      })
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
      `Stock adjusted: ${data.quantity} pieces (${data.event_type})`
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

export async function createOpeningStock(data) {
  return client.post('/inventory/opening-stock', data)
}

// ── Stock Verification ────────────────────────────────
export async function getVerifications(params = {}) {
  return client.get('/inventory/verifications', { params })
}

export async function createVerification(data) {
  return client.post('/inventory/verifications', data)
}

export async function getVerification(id) {
  return client.get(`/inventory/verifications/${id}`)
}

export async function updateVerificationCounts(id, data) {
  return client.post(`/inventory/verifications/${id}/counts`, data)
}

export async function completeVerification(id) {
  return client.post(`/inventory/verifications/${id}/complete`)
}

export async function approveVerification(id) {
  return client.post(`/inventory/verifications/${id}/approve`)
}
