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
