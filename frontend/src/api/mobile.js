import client from './client'
import { batches, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getMyBatches() {
  if (USE_MOCK) {
    // Simulate tailor's assigned/in_progress/submitted batches
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const mine = batches.filter(
      (b) =>
        b.assignment?.tailor?.id === user.id &&
        ['assigned', 'in_progress', 'submitted'].includes(b.status)
    )
    return mockResponse(mine)
  }
  return client.get('/mobile/my-batches')
}

export async function getPendingChecks() {
  if (USE_MOCK) {
    const pending = batches.filter((b) => b.status === 'submitted')
    return mockResponse(pending)
  }
  return client.get('/mobile/pending-checks')
}
