import client from './client'
import { users, roles, mockResponse, PERMISSIONS } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function login(username, password) {
  if (USE_MOCK) {
    const user = users.find((u) => u.username === username)
    if (!user || password !== 'test1234') {
      const err = new Error('Invalid credentials')
      err.response = { status: 401, data: { detail: 'Invalid credentials' } }
      throw err
    }
    const permissions = PERMISSIONS[user.role.name] || {}
    const tokenPayload = {
      access_token: `mock_access_${user.id}`,
      refresh_token: `mock_refresh_${user.id}`,
      token_type: 'bearer',
      expires_in: 3600,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role.name,
        permissions,
      },
    }
    return mockResponse(tokenPayload)
  }
  return client.post('/auth/login', { username, password })
}

export async function refresh(refreshToken) {
  if (USE_MOCK) {
    return mockResponse({ access_token: 'mock_refreshed_token', expires_in: 3600 })
  }
  return client.post('/auth/refresh', { refresh_token: refreshToken })
}

export async function logout() {
  if (USE_MOCK) {
    return mockResponse(null, 'Logged out')
  }
  return client.post('/auth/logout')
}
