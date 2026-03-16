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
    return mockResponse({
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role.name,
        role_display_name: user.role.display_name || null,
        permissions,
      },
    })
  }
  return client.post('/auth/login', { username, password })
}

export async function getMe() {
  if (USE_MOCK) {
    const storedUser = localStorage.getItem('user')
    if (!storedUser) {
      const err = new Error('Not authenticated')
      err.response = { status: 401 }
      throw err
    }
    return mockResponse(JSON.parse(storedUser))
  }
  return client.get('/auth/me')
}

export async function refresh() {
  if (USE_MOCK) {
    return mockResponse({ expires_in: 3600 })
  }
  return client.post('/auth/refresh')
}

export async function selectCompany(companyId, fyId = null) {
  if (USE_MOCK) {
    return mockResponse({ user: JSON.parse(localStorage.getItem('user') || '{}') })
  }
  const body = { company_id: companyId }
  if (fyId) body.fy_id = fyId
  return client.post('/auth/select-company', body)
}

export async function logout() {
  if (USE_MOCK) {
    return mockResponse(null, 'Logged out')
  }
  return client.post('/auth/logout')
}
