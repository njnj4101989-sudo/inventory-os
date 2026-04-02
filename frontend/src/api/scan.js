import client from './client'

export async function remoteScan(code) {
  return client.post('/scan/remote', { code })
}
