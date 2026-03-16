import client from './client'

export async function getLedger(partyType, partyId, params = {}) {
  return client.get('/ledger', {
    params: { party_type: partyType, party_id: partyId, ...params },
  })
}

export async function getPartyBalance(partyType, partyId) {
  return client.get('/ledger/balance', {
    params: { party_type: partyType, party_id: partyId },
  })
}

export async function getAllBalances(partyType) {
  return client.get('/ledger/balances', {
    params: { party_type: partyType },
  })
}

export async function recordPayment(data) {
  return client.post('/ledger/payment', data)
}
