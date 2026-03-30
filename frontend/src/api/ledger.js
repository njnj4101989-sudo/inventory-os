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

export async function createOpeningBalance(data, force = false) {
  return client.post(`/ledger/opening-balance?force=${force}`, data)
}

export async function createOpeningBalanceBulk(data) {
  return client.post('/ledger/opening-balance/bulk', data)
}

export async function getOpeningBalanceStatus() {
  return client.get('/ledger/opening-balance/status')
}

export async function getPartyConfirmation(partyType, partyId) {
  return client.get(`/ledger/party-confirmation/${partyType}/${partyId}`)
}
