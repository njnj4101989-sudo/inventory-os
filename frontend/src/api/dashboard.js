import client from './client'
import {
  dashboardSummary, tailorPerformance, inventoryMovement,
  productionReport, financialReport, inventorySummary,
  mockResponse,
} from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getSummary() {
  if (USE_MOCK) {
    return mockResponse(dashboardSummary)
  }
  return client.get('/dashboard/summary')
}

export async function getEnhancedDashboard() {
  return client.get('/dashboard/enhanced')
}

export async function getTailorPerf(params = {}) {
  if (USE_MOCK) {
    let data = [...tailorPerformance]
    if (params.period === '7d') {
      data = data.map((t) => ({ ...t, batches_completed: Math.ceil(t.batches_completed * 0.25) }))
    } else if (params.period === '90d') {
      data = data.map((t) => ({ ...t, batches_completed: t.batches_completed * 3 }))
    }
    return mockResponse(data)
  }
  return client.get('/dashboard/tailor-performance', { params })
}

export async function getMovement(params = {}) {
  if (USE_MOCK) {
    let data = [...inventoryMovement]
    if (params.sku_code) {
      data = data.filter((m) => m.sku_code === params.sku_code)
    }
    return mockResponse(data)
  }
  return client.get('/dashboard/inventory-movement', { params })
}

// P4.1 — Grouped inventory position with ₹ valuation, ageing, 8 KPIs
export async function getInventoryPosition(params = {}) {
  if (USE_MOCK) {
    // Mock: aggregate inventoryMovement by product_name as design
    const groupsMap = {}
    for (const r of inventoryMovement) {
      const key = r.product_name || r.sku_code
      if (!groupsMap[key]) {
        groupsMap[key] = {
          design_id: null, design_no: key, product_type: 'FBL',
          sku_count: 0, total_qty: 0, reserved_qty: 0, available_qty: 0,
          value_inr: 0, skus: [],
        }
      }
      const g = groupsMap[key]
      g.sku_count += 1
      g.total_qty += r.closing_stock
      g.available_qty += r.closing_stock
      g.value_inr += r.closing_stock * 500
      g.skus.push({
        sku_id: r.sku_code, sku_code: r.sku_code, product_name: r.product_name,
        product_type: 'FBL', color: '', size: '', design_id: null,
        opening_stock: r.opening_stock, stock_in: r.stock_in, stock_out: r.stock_out,
        returns: r.returns, losses: r.losses, net_change: r.net_change,
        closing_stock: r.closing_stock, reserved_qty: 0, available_qty: r.closing_stock,
        wac: 500, value_inr: r.closing_stock * 500, ageing_days: Math.floor(Math.random() * 120),
      })
    }
    const groups = Object.values(groupsMap).sort((a, b) => b.value_inr - a.value_inr)
    const totalIn = inventoryMovement.reduce((s, r) => s + r.stock_in, 0)
    const totalOut = inventoryMovement.reduce((s, r) => s + r.stock_out, 0)
    const totalRet = inventoryMovement.reduce((s, r) => s + r.returns, 0)
    return mockResponse({
      kpis: {
        stock_in: totalIn, stock_out: totalOut, returns: totalRet,
        net_change: totalIn + totalRet - totalOut,
        total_value_inr: groups.reduce((s, g) => s + g.value_inr, 0),
        skus_with_stock: inventoryMovement.filter(r => r.closing_stock > 0).length,
        dead_sku_count: 3, short_sku_count: 1,
      },
      groups,
      totals: {
        opening_stock: inventoryMovement.reduce((s, r) => s + r.opening_stock, 0),
        closing_stock: inventoryMovement.reduce((s, r) => s + r.closing_stock, 0),
        reserved_qty: 0,
        available_qty: inventoryMovement.reduce((s, r) => s + r.closing_stock, 0),
        value_inr: groups.reduce((s, g) => s + g.value_inr, 0),
      },
      period: { from: params.from || '', to: params.to || '' },
    })
  }
  return client.get('/dashboard/inventory-position', { params })
}

// Trigger CSV download via a temporary anchor. Uses same auth cookies.
export function downloadInventoryPositionCSV(params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.append(k, v)
  })
  const base = client.defaults.baseURL || ''
  const url = `${base}/dashboard/inventory-position.csv?${qs.toString()}`
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a); a.click(); a.remove()
}

export async function getProductionReport(params = {}) {
  if (USE_MOCK) {
    return mockResponse(productionReport)
  }
  return client.get('/dashboard/production-report', { params })
}

export async function getFinancialReport(params = {}) {
  if (USE_MOCK) {
    return mockResponse(financialReport)
  }
  return client.get('/dashboard/financial-report', { params })
}

export async function getInventorySummary() {
  if (USE_MOCK) {
    return mockResponse(inventorySummary)
  }
  return client.get('/dashboard/inventory-summary')
}

export async function getSalesReport(params = {}) {
  return client.get('/dashboard/sales-report', { params })
}

export async function getAccountingReport(params = {}) {
  return client.get('/dashboard/accounting-report', { params })
}

export async function getRawMaterialSummary() {
  return client.get('/dashboard/raw-material-summary')
}

export async function getWIPSummary() {
  return client.get('/dashboard/wip-summary')
}

export async function getVAReport(params = {}) {
  return client.get('/dashboard/va-report', { params })
}

export async function getPurchaseReport(params = {}) {
  return client.get('/dashboard/purchase-report', { params })
}

export async function getReturnsReport(params = {}) {
  return client.get('/dashboard/returns-report', { params })
}

export async function getClosingStockReport(params = {}) {
  return client.get('/dashboard/closing-stock-report', { params })
}
