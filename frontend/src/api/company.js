import client from './client'

// Company
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
