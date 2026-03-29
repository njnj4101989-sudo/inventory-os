import client from './client'

export async function getSalesReturns(params = {}) {
  return client.get('/sales-returns', { params })
}

export async function getSalesReturn(id) {
  return client.get(`/sales-returns/${id}`)
}

export async function getNextSalesReturnNumber() {
  return client.get('/sales-returns/next-number')
}

export async function createSalesReturn(data) {
  return client.post('/sales-returns', data)
}

export async function updateSalesReturn(id, data) {
  return client.patch(`/sales-returns/${id}`, data)
}

export async function receiveSalesReturn(id) {
  return client.post(`/sales-returns/${id}/receive`)
}

export async function inspectSalesReturn(id, data) {
  return client.post(`/sales-returns/${id}/inspect`, data)
}

export async function restockSalesReturn(id) {
  return client.post(`/sales-returns/${id}/restock`)
}

export async function closeSalesReturn(id) {
  return client.post(`/sales-returns/${id}/close`)
}

export async function cancelSalesReturn(id) {
  return client.post(`/sales-returns/${id}/cancel`)
}
