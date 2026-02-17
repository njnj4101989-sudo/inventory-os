import client from './client'
import { invoices, mockPaginated, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getInvoices(params = {}) {
  if (USE_MOCK) {
    let filtered = [...invoices]
    if (params.status) filtered = filtered.filter((inv) => inv.status === params.status)
    return mockPaginated(filtered, params.page, params.page_size)
  }
  return client.get('/invoices', { params })
}

export async function markPaid(id) {
  if (USE_MOCK) {
    const invoice = invoices.find((inv) => inv.id === id)
    if (invoice) {
      invoice.status = 'paid'
      invoice.paid_at = new Date().toISOString()
    }
    return mockResponse(invoice, 'Invoice marked as paid')
  }
  return client.patch(`/invoices/${id}/pay`)
}

export async function downloadPDF(id) {
  if (USE_MOCK) {
    return mockResponse({ url: '#', message: 'PDF generation is a stub in mock mode' })
  }
  return client.get(`/invoices/${id}/pdf`, { responseType: 'blob' })
}
