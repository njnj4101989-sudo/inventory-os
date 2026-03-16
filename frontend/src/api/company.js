import client from './client'

// Companies (multi-company)
export async function getCompanies() {
  return client.get('/companies')
}

export async function createNewCompany(data) {
  return client.post('/companies', data)
}

// Company (current — settings profile)
export async function getCompany() {
  return client.get('/company')
}

export async function updateCompany(data) {
  return client.patch('/company', data)
}

// Financial Years
export async function getFinancialYears() {
  return client.get('/financial-years')
}

export async function getCurrentFY() {
  return client.get('/financial-years/current')
}

export async function createFinancialYear(data) {
  return client.post('/financial-years', data)
}

export async function updateFinancialYear(id, data) {
  return client.patch(`/financial-years/${id}`, data)
}

export async function deleteFinancialYear(id) {
  return client.delete(`/financial-years/${id}`)
}

export async function closeFYPreview(fyId) {
  return client.get(`/financial-years/${fyId}/close-preview`)
}

export async function closeFY(fyId, data) {
  return client.post(`/financial-years/${fyId}/close`, data)
}
