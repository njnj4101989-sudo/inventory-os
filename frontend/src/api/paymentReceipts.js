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

export async function cancelPaymentReceipt(id, data) {
  if (USE_MOCK) {
    const r = paymentReceipts.find((row) => row.id === id)
    if (!r) return mockResponse(null, 'Receipt not found')
    if (r.status === 'cancelled') return mockResponse(r, 'Already cancelled')
    // Reverse mock invoice amount_paid + status
    if (r.party_type === 'customer') {
      for (const a of r.allocations || []) {
        const inv = invoices.find((iv) => iv.id === a.bill_id)
        if (!inv) continue
        const paidNow = Math.max(0, (Number(inv.amount_paid) || 0) - (Number(a.amount_applied) || 0))
        inv.amount_paid = paidNow
        const total = Number(inv.total_amount) || 0
        if (paidNow <= 0.005) {
          inv.status = 'issued'
          inv.paid_at = null
        } else if (paidNow < total - 0.005) {
          inv.status = 'partially_paid'
          inv.paid_at = null
        }
        inv.outstanding_amount = Math.max(0, total - paidNow)
      }
    }
    r.status = 'cancelled'
    r.cancel_reason = data.cancel_reason
    r.cancel_notes = data.cancel_notes || null
    r.cancelled_at = new Date().toISOString()
    return mockResponse(r, 'Receipt cancelled')
  }
  return client.post(`/payment-receipts/${id}/cancel`, data)
}

export async function recordPayment(data) {
  if (USE_MOCK) {
    const next = `PAY-${String(paymentReceipts.length + 1).padStart(4, '0')}`
    const allocations = (data.allocations || []).map((a) => {
      const inv = invoices.find((iv) => iv.id === a.bill_id)
      return {
        id: crypto.randomUUID(),
        bill_type: a.bill_type,
        bill_id: a.bill_id,
        bill_no: inv?.invoice_number || null,
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
    if (data.party_type === 'customer') {
      for (const a of allocations) {
        const inv = invoices.find((iv) => iv.id === a.bill_id)
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
    }
    return mockResponse(newR, 'Payment recorded')
  }
  return client.post('/payment-receipts', data)
}

// ── Open bills (polymorphic — works for customer/supplier/va_party) ────────

export async function getOpenBillsForParty(partyType, partyId) {
  if (USE_MOCK) {
    if (partyType === 'customer') {
      const open = invoices
        .filter(
          (inv) =>
            inv.order?.customer_id === partyId ||
            inv.customer_id === partyId,
        )
        .filter((inv) => inv.status === 'issued' || inv.status === 'partially_paid')
        .map((inv) => ({
          bill_type: 'invoice',
          bill_id: inv.id,
          bill_no: inv.invoice_number,
          bill_date: (inv.issued_at || '').slice(0, 10) || null,
          due_date: inv.due_date,
          total_amount: Number(inv.total_amount) || 0,
          amount_paid: Number(inv.amount_paid) || 0,
          outstanding_amount:
            (Number(inv.total_amount) || 0) - (Number(inv.amount_paid) || 0),
          status: inv.status,
        }))
        .filter((row) => row.outstanding_amount > 0.005)
        .sort((a, b) => (a.bill_date || '').localeCompare(b.bill_date || ''))
      return mockResponse(open)
    }
    return mockResponse([])
  }
  if (partyType === 'customer') {
    return client.get(`/customers/${partyId}/open-invoices`)
  }
  if (partyType === 'supplier') {
    return client.get(`/suppliers/${partyId}/open-bills`)
  }
  if (partyType === 'va_party') {
    return client.get(`/masters/va-parties/${partyId}/open-bills`)
  }
  throw new Error(`Unsupported party_type: ${partyType}`)
}

// Back-compat alias for the original signature (LedgerPanel etc).
export const getOpenInvoicesForCustomer = (customerId) =>
  getOpenBillsForParty('customer', customerId)

export async function getOnAccountBalance(partyType, partyId) {
  // Back-compat: callers used to pass just (customerId).
  if (partyId === undefined) {
    partyId = partyType
    partyType = 'customer'
  }
  if (USE_MOCK) {
    const total = paymentReceipts
      .filter((r) => r.party_type === partyType && r.party_id === partyId)
      .reduce((s, r) => s + (Number(r.on_account_amount) || 0), 0)
    return mockResponse({ party_type: partyType, party_id: partyId, balance: total })
  }
  if (partyType === 'customer') {
    return client.get(`/customers/${partyId}/on-account-balance`)
  }
  if (partyType === 'supplier') {
    return client.get(`/suppliers/${partyId}/on-account-balance`)
  }
  if (partyType === 'va_party') {
    return client.get(`/masters/va-parties/${partyId}/on-account-balance`)
  }
  throw new Error(`Unsupported party_type: ${partyType}`)
}
