import client from './client'
import { productTypes, colors, fabrics, valueAdditions, vaParties, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// ── Product Types ───────────────────────────────────────

export async function getProductTypes() {
  if (USE_MOCK) return mockResponse(productTypes)
  return client.get('/masters/product-types')
}

export async function getAllProductTypes() {
  if (USE_MOCK) return mockResponse(productTypes.filter((p) => p.is_active))
  return client.get('/masters/product-types/all')
}

export async function createProductType(data) {
  if (USE_MOCK) {
    const exists = productTypes.find((p) => p.code === data.code.toUpperCase())
    if (exists) throw { response: { data: { detail: `Product type '${data.code}' already exists` } } }
    const obj = { id: crypto.randomUUID(), code: data.code.toUpperCase(), name: data.name, description: data.description || null, is_active: true }
    productTypes.push(obj)
    return mockResponse(obj, 'Product type created')
  }
  return client.post('/masters/product-types', data)
}

export async function updateProductType(id, data) {
  if (USE_MOCK) {
    const obj = productTypes.find((p) => p.id === id)
    if (!obj) throw { response: { data: { detail: 'Product type not found' } } }
    if (data.name != null) obj.name = data.name
    if (data.description != null) obj.description = data.description
    if (data.is_active != null) obj.is_active = data.is_active
    return mockResponse(obj, 'Product type updated')
  }
  return client.patch(`/masters/product-types/${id}`, data)
}

// ── Colors ──────────────────────────────────────────────

export async function getColors() {
  if (USE_MOCK) return mockResponse(colors)
  return client.get('/masters/colors')
}

export async function getAllColors() {
  if (USE_MOCK) return mockResponse(colors.filter((c) => c.is_active))
  return client.get('/masters/colors/all')
}

export async function createColor(data) {
  if (USE_MOCK) {
    const code = data.code.toUpperCase().slice(0, 5)
    const exists = colors.find((c) => c.code === code)
    if (exists) throw { response: { data: { detail: `Color code '${code}' already exists` } } }
    const obj = { id: crypto.randomUUID(), name: data.name, code, hex_code: data.hex_code || null, is_active: true }
    colors.push(obj)
    return mockResponse(obj, 'Color created')
  }
  return client.post('/masters/colors', data)
}

export async function updateColor(id, data) {
  if (USE_MOCK) {
    const obj = colors.find((c) => c.id === id)
    if (!obj) throw { response: { data: { detail: 'Color not found' } } }
    if (data.name != null) obj.name = data.name
    if (data.hex_code != null) obj.hex_code = data.hex_code
    if (data.is_active != null) obj.is_active = data.is_active
    return mockResponse(obj, 'Color updated')
  }
  return client.patch(`/masters/colors/${id}`, data)
}

// ── Fabrics ─────────────────────────────────────────────

export async function getFabrics() {
  if (USE_MOCK) return mockResponse(fabrics)
  return client.get('/masters/fabrics')
}

export async function getAllFabrics() {
  if (USE_MOCK) return mockResponse(fabrics.filter((f) => f.is_active))
  return client.get('/masters/fabrics/all')
}

export async function createFabric(data) {
  if (USE_MOCK) {
    const code = data.code.toUpperCase().slice(0, 3)
    const exists = fabrics.find((f) => f.code === code)
    if (exists) throw { response: { data: { detail: `Fabric code '${code}' already exists` } } }
    const obj = { id: crypto.randomUUID(), name: data.name, code, description: data.description || null, is_active: true }
    fabrics.push(obj)
    return mockResponse(obj, 'Fabric created')
  }
  return client.post('/masters/fabrics', data)
}

export async function updateFabric(id, data) {
  if (USE_MOCK) {
    const obj = fabrics.find((f) => f.id === id)
    if (!obj) throw { response: { data: { detail: 'Fabric not found' } } }
    if (data.name != null) obj.name = data.name
    if (data.description != null) obj.description = data.description
    if (data.is_active != null) obj.is_active = data.is_active
    return mockResponse(obj, 'Fabric updated')
  }
  return client.patch(`/masters/fabrics/${id}`, data)
}

// ── Value Additions ────────────────────────────────────

export async function getValueAdditions() {
  if (USE_MOCK) return mockResponse(valueAdditions)
  return client.get('/masters/value-additions')
}

export async function getAllValueAdditions() {
  if (USE_MOCK) return mockResponse(valueAdditions.filter((va) => va.is_active))
  return client.get('/masters/value-additions/all')
}

export async function createValueAddition(data) {
  if (USE_MOCK) {
    const code = data.short_code.toUpperCase().slice(0, 4)
    const exists = valueAdditions.find((va) => va.short_code === code)
    if (exists) throw { response: { data: { detail: `Value addition '${code}' already exists` } } }
    const obj = { id: crypto.randomUUID(), name: data.name, short_code: code, description: data.description || null, is_active: true }
    valueAdditions.push(obj)
    return mockResponse(obj, 'Value addition created')
  }
  return client.post('/masters/value-additions', data)
}

export async function updateValueAddition(id, data) {
  if (USE_MOCK) {
    const obj = valueAdditions.find((va) => va.id === id)
    if (!obj) throw { response: { data: { detail: 'Value addition not found' } } }
    if (data.name != null) obj.name = data.name
    if (data.short_code != null) obj.short_code = data.short_code.toUpperCase().slice(0, 4)
    if (data.description != null) obj.description = data.description
    if (data.is_active != null) obj.is_active = data.is_active
    return mockResponse(obj, 'Value addition updated')
  }
  return client.patch(`/masters/value-additions/${id}`, data)
}

// ── VA Parties ────────────────────────────────────────

export async function getVAParties() {
  if (USE_MOCK) return mockResponse(vaParties)
  return client.get('/masters/va-parties')
}

export async function getAllVAParties() {
  if (USE_MOCK) return mockResponse(vaParties.filter((p) => p.is_active))
  return client.get('/masters/va-parties/all')
}

export async function createVAParty(data) {
  if (USE_MOCK) {
    const obj = { id: crypto.randomUUID(), name: data.name, phone: data.phone || null, city: data.city || null, gst_no: data.gst_no || null, hsn_code: data.hsn_code || null, is_active: true }
    vaParties.push(obj)
    return mockResponse(obj, 'VA Party created')
  }
  return client.post('/masters/va-parties', data)
}

export async function updateVAParty(id, data) {
  if (USE_MOCK) {
    const obj = vaParties.find((p) => p.id === id)
    if (!obj) throw { response: { data: { detail: 'VA Party not found' } } }
    if (data.name != null) obj.name = data.name
    if (data.phone != null) obj.phone = data.phone
    if (data.city != null) obj.city = data.city
    if (data.gst_no != null) obj.gst_no = data.gst_no
    if (data.hsn_code != null) obj.hsn_code = data.hsn_code
    if (data.is_active != null) obj.is_active = data.is_active
    return mockResponse(obj, 'VA Party updated')
  }
  return client.patch(`/masters/va-parties/${id}`, data)
}
