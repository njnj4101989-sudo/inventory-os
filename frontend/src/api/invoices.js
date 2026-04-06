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

export async function getInvoiceByNo(invoiceNo) {
  if (USE_MOCK) {
    const invoice = invoices.find((inv) => inv.invoice_number === invoiceNo)
    return mockResponse(invoice)
  }
  return client.get(`/invoices/by-no/${encodeURIComponent(invoiceNo)}`)
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

export async function createInvoice(data) {
  if (USE_MOCK) {
    const nextNum = `INV-${String(invoices.length + 1).padStart(4, '0')}`
    const newInv = {
      id: crypto.randomUUID(),
      invoice_number: nextNum,
      order: null,
      ...data,
      status: 'issued',
      issued_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }
    invoices.push(newInv)
    return { data: { success: true, data: newInv } }
  }
  return client.post('/invoices', data)
}

export async function cancelInvoice(id) {
  if (USE_MOCK) {
    const invoice = invoices.find((inv) => inv.id === id)
    if (invoice) invoice.status = 'cancelled'
    return mockResponse(invoice, 'Invoice cancelled')
  }
  return client.post(`/invoices/${id}/cancel`)
}

export async function updateInvoice(id, data) {
  if (USE_MOCK) {
    const invoice = invoices.find((inv) => inv.id === id)
    if (invoice) Object.assign(invoice, data)
    return mockResponse(invoice, 'Invoice updated')
  }
  return client.patch(`/invoices/${id}`, data)
}

export async function createInvoiceFromOrder(data) {
  if (USE_MOCK) {
    return mockResponse({ id: crypto.randomUUID(), invoice_number: 'INV-MOCK', ...data }, 'Invoice created from order')
  }
  return client.post('/invoices/from-order', data)
}

export async function downloadPDF(id) {
  if (USE_MOCK) {
    return mockResponse({ url: '#', message: 'PDF generation is a stub in mock mode' })
  }
  return client.get(`/invoices/${id}/pdf`, { responseType: 'blob' })
}
