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

export async function createSKUOpeningStock(data) {
  if (USE_MOCK) {
    return mockResponse({ created: data.line_items?.length || 0, skipped: [], results: [], message: 'Mock opening stock' })
  }
  return client.post('/skus/opening-stock', data)
}

export async function getPurchaseInvoices(params = {}) {
  if (USE_MOCK) {
    return mockPaginated([], params.page, params.page_size)
  }
  return client.get('/skus/purchase-invoices', { params })
}

export async function getSKUPassport(skuCode) {
  return client.get(`/skus/passport/${encodeURIComponent(skuCode)}`)
}

export async function stockCheck(skuIds, orderId = null) {
  if (USE_MOCK) {
    const map = {}
    for (const id of skuIds) {
      const sku = skus.find(s => s.id === id)
      map[id] = sku?.stock?.available_qty || 0
    }
    return mockResponse(map)
  }
  const body = { sku_ids: skuIds }
  if (orderId) body.order_id = orderId
  return client.post('/skus/stock-check', body)
}

export async function getSKUByCode(skuCode) {
  return client.get(`/skus/by-code/${encodeURIComponent(skuCode)}`)
}

export async function getSKUCostHistory(skuId) {
  return client.get(`/skus/${skuId}/cost-history`)
}

export async function getSKUOpenDemand(skuId) {
  return client.get(`/skus/${skuId}/open-demand`)
}

export async function getSKUsGrouped(params = {}) {
  if (USE_MOCK) {
    // Bucket mock SKUs by (product_type, design_no) parsed from sku_code
    const byKey = new Map()
    for (const s of skus) {
      const parts = (s.sku_code || '').split('-')
      const d = parts[1] || ''
      const key = `${s.product_type}-${d}`
      if (!byKey.has(key)) byKey.set(key, { design_key: key, product_type: s.product_type, design_no: d, skus: [] })
      byKey.get(key).skus.push(s)
    }
    const groups = [...byKey.values()].map((g) => {
      const colors = [...new Set(g.skus.map((s) => s.color))]
      const sizes = [...new Set(g.skus.map((s) => s.size))]
      const prices = g.skus.map((s) => parseFloat(s.base_price || 0)).filter((p) => p > 0)
      return {
        ...g,
        sku_count: g.skus.length,
        colors,
        sizes,
        price_min: prices.length ? Math.min(...prices) : 0,
        price_max: prices.length ? Math.max(...prices) : 0,
        total_qty: g.skus.reduce((s, x) => s + (x.stock?.total_qty || 0), 0),
        available_qty: g.skus.reduce((s, x) => s + (x.stock?.available_qty || 0), 0),
        reserved_qty: g.skus.reduce((s, x) => s + (x.stock?.reserved_qty || 0), 0),
      }
    })
    return mockPaginated(groups, params.page, params.page_size)
  }
  return client.get('/skus/grouped', { params })
}

export async function getSKUSummary() {
  if (USE_MOCK) {
    const total = skus.length
    const inStock = skus.filter((s) => s.stock && s.stock.available_qty > 0).length
    const pieces = skus.reduce((sum, s) => sum + (s.stock?.total_qty || 0), 0)
    const auto = skus.filter((s) => (s.sku_code || '').includes('+')).length
    return mockResponse({ total_skus: total, in_stock_skus: inStock, total_pieces: pieces, auto_generated: auto })
  }
  return client.get('/skus/summary')
}
