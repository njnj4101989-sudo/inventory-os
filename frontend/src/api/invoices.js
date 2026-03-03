import client from './client'
import { invoices, mockPaginated, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getInvoices(params = {}) {
  if (USE_MOCK) {
    let filtered = [...invoices]
    if (params.status) filtered = filtered.filter((inv) => inv.status === params.status)
    if (params.search) {
      const q = params.search.toLowerCase()
      filtered = filtered.filter(
        (inv) => inv.invoice_number.toLowerCase().includes(q) ||
                 (inv.order?.customer_name && inv.order.customer_name.toLowerCase().includes(q))
      )
    }
    return mockPaginated(filtered, params.page, params.page_size)
  }
  return client.get('/invoices', { params })
}

export async function getInvoice(id) {
  if (USE_MOCK) {
    const invoice = invoices.find((inv) => inv.id === id)
    return mockResponse(invoice)
  }
  return client.get(`/invoices/${id}`)
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
