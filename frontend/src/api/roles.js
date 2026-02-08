import client from './client'
import { roles as mockRoles, mockResponse, PERMISSIONS } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

const uid = (n) => `00000000-0000-4000-a000-00000000000${n}`
let mockIdCounter = 10

export async function getRoles() {
  if (USE_MOCK) {
    return mockResponse(mockRoles)
  }
  return client.get('/roles')
}

export async function createRole(data) {
  if (USE_MOCK) {
    const newRole = {
      id: uid(++mockIdCounter),
      name: data.name,
      display_name: data.display_name || null,
      permissions: data.permissions || {},
      user_count: 0,
    }
    mockRoles.push(newRole)
    return mockResponse(newRole)
  }
  return client.post('/roles', data)
}

export async function updateRole(id, data) {
  if (USE_MOCK) {
    const role = mockRoles.find((r) => r.id === id)
    if (role) {
      if (data.display_name !== undefined) role.display_name = data.display_name
      if (data.permissions !== undefined) role.permissions = data.permissions
    }
    return mockResponse(role)
  }
  return client.patch(`/roles/${id}`, data)
}

export async function deleteRole(id) {
  if (USE_MOCK) {
    const idx = mockRoles.findIndex((r) => r.id === id)
    if (idx !== -1) {
      if (mockRoles[idx].user_count > 0) {
        throw { response: { data: { detail: `Cannot delete role — users assigned` } } }
      }
      mockRoles.splice(idx, 1)
    }
    return mockResponse({ message: 'Role deleted' })
  }
  return client.delete(`/roles/${id}`)
}

export { PERMISSIONS }
