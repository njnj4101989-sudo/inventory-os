import client from './client'
import { roles, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getRoles() {
  if (USE_MOCK) {
    return mockResponse(roles)
  }
  return client.get('/roles')
}
