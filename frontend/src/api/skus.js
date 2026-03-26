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

export async function getSKU(id) {
  if (USE_MOCK) {
    const sku = skus.find((s) => s.id === id)
    if (!sku) return mockResponse(null, 'SKU not found')
    // Build mock source_batches from batches that reference this SKU
    const { batches } = await import('./mock')
    const sourceBatches = batches
      .filter((b) => b.sku?.id === id)
      .map((b) => ({
        id: b.id,
        batch_code: b.batch_code,
        status: b.status,
        size: b.design_no ? b.batch_code.split('-').pop() : null,
        piece_count: b.piece_count,
        color_qc: b.color_qc,
        approved_qty: b.approved_qty,
        rejected_qty: b.rejected_qty,
        lot: b.lot ? { id: b.lot.id, lot_code: b.lot.lot_code, designs: b.lot.designs } : null,
        tailor: b.assignment?.tailor || null,
        packed_at: b.packed_at,
        processing_logs: (b.processing_logs || []).map((p) => ({
          id: p.id,
          value_addition: p.value_addition,
          status: p.status,
          pieces_sent: p.pieces_sent,
          pieces_received: p.pieces_received,
          cost: p.cost,
          phase: p.phase,
          created_at: p.sent_date,
        })),
      }))
    return mockResponse({ ...sku, source_batches: sourceBatches })
  }
  return client.get(`/skus/${id}`)
}

export async function createSKU(data) {
  if (USE_MOCK) {
    const code = `${data.product_type}-${data.design_no || '999'}-${data.color}-${data.size}`
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

export async function purchaseStock(data) {
  if (USE_MOCK) {
    return mockResponse({ invoice_id: crypto.randomUUID(), items_created: data.line_items?.length || 0 })
  }
  return client.post('/skus/purchase-stock', data)
}

export async function getPurchaseInvoices(params = {}) {
  if (USE_MOCK) {
    return mockPaginated([], params.page, params.page_size)
  }
  return client.get('/skus/purchase-invoices', { params })
}
