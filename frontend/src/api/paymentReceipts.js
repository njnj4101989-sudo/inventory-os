import client from './client'
import { invoices, paymentReceipts, mockPaginated, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getPaymentReceipts(params = {}) {
  if (USE_MOCK) {
    let filtered = [...paymentReceipts]
    if (params.party_type) filtered = filtered.filter((r) => r.party_type === params.party_type)
    if (params.party_id) filtered = filtered.filter((r) => r.party_id === params.party_id)
    if (params.payment_mode) filtered = filtered.filter((r) => r.payment_mode === params.payment_mode)
    if (params.search) {
      const q = params.search.toLowerCase()
      filtered = filtered.filter(
        (r) =>
          r.receipt_no.toLowerCase().includes(q) ||
          (r.reference_no || '').toLowerCase().includes(q),
      )
    }
    return mockPaginated(filtered, params.page, params.page_size)
  }
  return client.get('/payment-receipts', { params })
}

export async function getPaymentReceipt(id) {
  if (USE_MOCK) {
    const r = paymentReceipts.find((row) => row.id === id)
    return mockResponse(r)
  }
  return client.get(`/payment-receipts/${id}`)
}

export async function recordPayment(data) {
  if (USE_MOCK) {
    const next = `PAY-${String(paymentReceipts.length + 1).padStart(4, '0')}`
    const allocations = (data.allocations || []).map((a) => {
      const inv = invoices.find((iv) => iv.id === a.invoice_id)
      return {
        id: crypto.randomUUID(),
        invoice_id: a.invoice_id,
        invoice_number: inv?.invoice_number || null,
        amount_applied: Number(a.amount_applied) || 0,
      }
    })
    const tds = data.tds_applicable && data.tds_rate
      ? Math.round((Number(data.amount) * Number(data.tds_rate)) / 100 * 100) / 100
      : 0
    const tcs = data.tcs_applicable && data.tcs_rate
      ? Math.round((Number(data.amount) * Number(data.tcs_rate)) / 100 * 100) / 100
      : 0
    const allocated = allocations.reduce((s, a) => s + a.amount_applied, 0)
    const allocatable = Number(data.amount) - tds + tcs
    const onAccount = Math.max(0, allocatable - allocated)
    const newR = {
      id: crypto.randomUUID(),
      receipt_no: next,
      ...data,
      tds_amount: tds,
      tcs_amount: tcs,
      allocated_amount: allocated,
      net_amount: allocatable,
      on_account_amount: onAccount,
      allocations,
      created_at: new Date().toISOString(),
    }
    paymentReceipts.push(newR)
    // Bump invoice.amount_paid + status in mock
    for (const a of allocations) {
      const inv = invoices.find((iv) => iv.id === a.invoice_id)
      if (!inv) continue
      const paidNow = (Number(inv.amount_paid) || 0) + a.amount_applied
      inv.amount_paid = paidNow
      const total = Number(inv.total_amount) || 0
      if (paidNow + 0.005 >= total) {
        inv.status = 'paid'
        inv.paid_at = new Date().toISOString()
      } else {
        inv.status = 'partially_paid'
      }
      inv.outstanding_amount = Math.max(0, total - paidNow)
    }
    return mockResponse(newR, 'Payment recorded')
  }
  return client.post('/payment-receipts', data)
}

export async function getOpenInvoicesForCustomer(customerId) {
  if (USE_MOCK) {
    const open = invoices
      .filter(
        (inv) =>
          inv.order?.customer_id === customerId ||
          inv.customer_id === customerId,
      )
      .filter((inv) => inv.status === 'issued' || inv.status === 'partially_paid')
      .map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        issued_at: inv.issued_at,
        due_date: inv.due_date,
        total_amount: Number(inv.total_amount) || 0,
        amount_paid: Number(inv.amount_paid) || 0,
        outstanding_amount:
          (Number(inv.total_amount) || 0) - (Number(inv.amount_paid) || 0),
        status: inv.status,
      }))
      .filter((row) => row.outstanding_amount > 0.005)
      .sort((a, b) => (a.issued_at || '').localeCompare(b.issued_at || ''))
    return mockResponse(open)
  }
  return client.get(`/customers/${customerId}/open-invoices`)
}

export async function getOnAccountBalance(customerId) {
  if (USE_MOCK) {
    const total = paymentReceipts
      .filter((r) => r.party_type === 'customer' && r.party_id === customerId)
      .reduce((s, r) => s + (Number(r.on_account_amount) || 0), 0)
    return mockResponse({
      party_type: 'customer',
      party_id: customerId,
      balance: total,
    })
  }
  return client.get(`/customers/${customerId}/on-account-balance`)
}
