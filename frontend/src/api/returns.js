import client from './client'

export async function getReturnNotes(params = {}) {
  return client.get('/return-notes', { params })
}

export async function getReturnNote(id) {
  return client.get(`/return-notes/${id}`)
}

export async function getNextReturnNoteNumber() {
  return client.get('/return-notes/next-number')
}

export async function createReturnNote(data) {
  return client.post('/return-notes', data)
}

export async function updateReturnNote(id, data) {
  return client.patch(`/return-notes/${id}`, data)
}

export async function approveReturnNote(id) {
  return client.post(`/return-notes/${id}/approve`)
}

export async function dispatchReturnNote(id) {
  return client.post(`/return-notes/${id}/dispatch`)
}

export async function acknowledgeReturnNote(id) {
  return client.post(`/return-notes/${id}/acknowledge`)
}

export async function closeReturnNote(id) {
  return client.post(`/return-notes/${id}/close`)
}

export async function cancelReturnNote(id) {
  return client.post(`/return-notes/${id}/cancel`)
}
