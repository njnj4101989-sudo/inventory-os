import client from './client'
import {
  dashboardSummary, tailorPerformance, inventoryMovement,
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
    return mockResponse(tailorPerformance)
  }
  return client.get('/dashboard/tailor-performance', { params })
}

export async function getMovement(params = {}) {
  if (USE_MOCK) {
    return mockResponse(inventoryMovement)
  }
  return client.get('/dashboard/inventory-movement', { params })
}
