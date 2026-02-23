import client from './client'
import { batches, lots, mockPaginated, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function distributeLot(lotId) {
  if (USE_MOCK) {
    const lot = lots.find((l) => l.id === lotId)
    if (!lot) throw { response: { data: { detail: 'Lot not found' } } }
    if (lot.status !== 'cutting') throw { response: { data: { detail: `Lot must be in 'cutting' status` } } }

    const pattern = lot.default_size_pattern || {}
    const colorBreakdown = {}
    ;(lot.lot_rolls || []).forEach((lr) => {
      const color = lr.color || 'Unknown'
      colorBreakdown[color] = (colorBreakdown[color] || 0) + (lr.num_pallas || 0)
    })

    let seq = batches.length
    const created = []
    for (const [size, count] of Object.entries(pattern)) {
      for (let i = 0; i < (parseInt(count) || 0); i++) {
        seq++
        const batchCode = `BATCH-${String(seq).padStart(4, '0')}`
        const b = {
          id: crypto.randomUUID(),
          batch_code: batchCode,
          size,
          lot: { id: lot.id, lot_code: lot.lot_code, design_no: lot.design_no, total_pieces: lot.total_pieces, status: 'distributed' },
          sku: null,
          quantity: lot.total_pallas || 0,
          piece_count: lot.total_pallas || 0,
          color_breakdown: colorBreakdown,
          status: 'created',
          qr_code_data: `/scan/batch/${batchCode}`,
          created_by_user: { id: '00000000-0000-4000-a000-000000000002', full_name: 'Ravi Kumar' },
          assignment: null,
          rolls_used: [],
          created_at: new Date().toISOString(),
          assigned_at: null, started_at: null, submitted_at: null,
          checked_at: null, completed_at: null,
          approved_qty: null, rejected_qty: null, rejection_reason: null,
          notes: null,
        }
        batches.push(b)
        created.push(b)
      }
    }
    lot.status = 'distributed'

    return mockResponse({
      lot_id: lot.id,
      lot_code: lot.lot_code,
      design_no: lot.design_no,
      lot_date: lot.lot_date,
      batches_created: created.length,
      batches: created,
    }, 'Lot distributed')
  }
  return client.post(`/lots/${lotId}/distribute`)
}

export async function getBatchPassport(batchCode) {
  if (USE_MOCK) {
    const batch = batches.find((b) => b.batch_code === batchCode)
    if (!batch) throw { response: { data: { detail: `Batch '${batchCode}' not found` } } }
    const resp = { ...batch }
    if (batch.lot) {
      resp.design_no = batch.lot.design_no
      resp.lot_date = batch.lot.lot_date || null
      resp.default_size_pattern = null
    }
    return mockResponse(resp)
  }
  return client.get(`/batches/passport/${encodeURIComponent(batchCode)}`)
}

export async function claimBatch(batchCode) {
  if (USE_MOCK) {
    const batch = batches.find((b) => b.batch_code === batchCode)
    if (!batch) throw { response: { data: { detail: `Batch '${batchCode}' not found` } } }
    if (batch.status !== 'created') throw { response: { data: { detail: `Cannot claim batch in '${batch.status}' status` } } }
    batch.status = 'assigned'
    batch.assigned_at = new Date().toISOString()
    batch.assignment = {
      tailor: { id: '00000000-0000-4000-a000-000000000003', full_name: 'Amit Singh' },
      assigned_at: batch.assigned_at,
    }
    return mockResponse(batch, 'Batch claimed')
  }
  return client.post(`/batches/claim/${encodeURIComponent(batchCode)}`)
}

export async function getBatches(params = {}) {
  if (USE_MOCK) {
    let filtered = [...batches]
    if (params.status) filtered = filtered.filter((b) => b.status === params.status)
    if (params.sku_id) filtered = filtered.filter((b) => b.sku.id === params.sku_id)
    if (params.lot_id) filtered = filtered.filter((b) => b.lot?.id === params.lot_id)
    return mockPaginated(filtered, params.page, params.page_size)
  }
  return client.get('/batches', { params })
}

export async function createBatch(data) {
  if (USE_MOCK) {
    const nextCode = `BATCH-${String(batches.length + 1).padStart(4, '0')}`
    const lot = lots.find((l) => l.id === data.lot_id)
    const newBatch = {
      id: crypto.randomUUID(),
      batch_code: nextCode,
      lot: lot ? { id: lot.id, lot_code: lot.lot_code, design_no: lot.design_no, total_pieces: lot.total_pieces, status: lot.status } : null,
      sku: lot ? lot.sku : { id: data.sku_id, sku_code: 'SKU', product_name: 'Product' },
      quantity: data.piece_count,
      piece_count: data.piece_count,
      color_breakdown: data.color_breakdown || null,
      status: 'CREATED',
      qr_code_data: `https://inv.local/batch/${crypto.randomUUID()}`,
      created_by_user: { id: '00000000-0000-4000-a000-000000000002', full_name: 'Ravi Kumar' },
      assignment: null,
      rolls_used: [],
      created_at: new Date().toISOString(),
      assigned_at: null, started_at: null, submitted_at: null,
      checked_at: null, completed_at: null,
      approved_qty: null, rejected_qty: null, rejection_reason: null,
      notes: data.notes || null,
    }
    batches.push(newBatch)
    return mockResponse({ batch: newBatch }, 'Batch created')
  }
  return client.post('/batches', data)
}

export async function assignBatch(id, tailorId) {
  if (USE_MOCK) {
    const batch = batches.find((b) => b.id === id)
    if (batch) {
      batch.status = 'ASSIGNED'
      batch.assigned_at = new Date().toISOString()
      batch.assignment = {
        tailor: { id: tailorId, full_name: 'Amit Singh' },
        assigned_at: batch.assigned_at,
      }
    }
    return mockResponse({ batch, assignment: batch?.assignment }, 'Batch assigned')
  }
  return client.post(`/batches/${id}/assign`, { tailor_id: tailorId })
}

export async function getBatch(id) {
  if (USE_MOCK) {
    const batch = batches.find((b) => b.id === id)
    return mockResponse(batch)
  }
  return client.get(`/batches/${id}`)
}
