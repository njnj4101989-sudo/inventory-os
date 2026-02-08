import client from './client'
import { users, mockPaginated, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getUsers(params = {}) {
  if (USE_MOCK) {
    let filtered = [...users]
    if (params.role) filtered = filtered.filter((u) => u.role.name === params.role)
    if (params.is_active !== undefined) filtered = filtered.filter((u) => u.is_active === params.is_active)
    if (params.search) {
      const s = params.search.toLowerCase()
      filtered = filtered.filter(
        (u) => u.username.toLowerCase().includes(s) || u.full_name.toLowerCase().includes(s)
      )
    }
    return mockPaginated(filtered, params.page, params.page_size)
  }
  return client.get('/users', { params })
}

export async function createUser(data) {
  if (USE_MOCK) {
    const newUser = {
      id: crypto.randomUUID(),
      ...data,
      role: { id: data.role_id, name: 'supervisor' },
      is_active: true,
      created_at: new Date().toISOString(),
    }
    users.push(newUser)
    return mockResponse(newUser, 'User created')
  }
  return client.post('/users', data)
}

export async function updateUser(id, data) {
  if (USE_MOCK) {
    const user = users.find((u) => u.id === id)
    if (user) Object.assign(user, data)
    return mockResponse(user, 'User updated')
  }
  return client.patch(`/users/${id}`, data)
}
