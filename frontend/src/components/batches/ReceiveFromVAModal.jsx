import { useState, useEffect } from 'react'
import Modal from '../common/Modal'
import ErrorAlert from '../common/ErrorAlert'
import { getBatchChallans, receiveBatchChallan } from '../../api/batchChallans'

export default function ReceiveFromVAModal({ open, onClose, onSuccess }) {
  const [challans, setChallans] = useState([])
  const [selectedChallan, setSelectedChallan] = useState(null)
  const [receiveData, setReceiveData] = useState({})
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [loadingChallans, setLoadingChallans] = useState(false)

  useEffect(() => {
    if (open) {
      setSelectedChallan(null)
      setReceiveData({})
      setNotes('')
      setError(null)
      fetchChallans()
    }
  }, [open])

  async function fetchChallans() {
    setLoadingChallans(true)
    try {
      const res = await getBatchChallans({ page: 1, page_size: 100 })
      const all = res.data?.data || []
      // Only show pending challans (status='sent')
      setChallans(all.filter((c) => c.status === 'sent'))
    } catch (err) {
      setError('Failed to load challans')
    } finally {
      setLoadingChallans(false)
    }
  }

  const selectChallan = (challan) => {
    setSelectedChallan(challan)
    const defaults = {}
    ;(challan.batch_items || []).forEach((item) => {
      defaults[item.batch?.id || item.id] = {
        pieces_received: item.pieces_sent,
        cost: '',
      }
    })
    setReceiveData(defaults)
  }

  const updateItem = (batchId, field, value) => {
    setReceiveData((prev) => ({
      ...prev,
      [batchId]: { ...prev[batchId], [field]: value },
    }))
  }

  const totalCost = Object.values(receiveData).reduce((s, d) => s + (parseFloat(d.cost) || 0), 0)

  const handleSubmit = async () => {
    if (!selectedChallan) { setError('Select a challan first'); return }

    const batchEntries = Object.entries(receiveData).map(([batch_id, data]) => ({
      batch_id,
      pieces_received: parseInt(data.pieces_received) || 0,
      cost: parseFloat(data.cost) || null,
    }))

    if (batchEntries.some((e) => e.pieces_received <= 0)) {
      setError('All pieces received must be > 0')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await receiveBatchChallan(selectedChallan.id, {
        batches: batchEntries,
        notes: notes.trim() || null,
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to receive batch challan')
    } finally {
      setSaving(false)
    }
  }

  const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Receive Batches from VA"
      wide
      actions={
        <>
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !selectedChallan}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            {saving ? 'Receiving...' : `Receive${totalCost > 0 ? ` (₹${totalCost.toLocaleString('en-IN')})` : ''}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        {/* Challan selector */}
        {!selectedChallan ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Pending Challan</label>
            {loadingChallans ? (
              <p className="text-sm text-gray-400">Loading challans...</p>
            ) : challans.length === 0 ? (
              <p className="text-sm text-gray-400">No pending batch challans</p>
            ) : (
              <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {challans.map((c) => (
                  <button key={c.id} onClick={() => selectChallan(c)}
                    className="w-full text-left px-4 py-3 hover:bg-primary-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono font-semibold text-gray-800">{c.challan_no}</span>
                        {c.value_addition && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">+{c.value_addition.short_code}</span>
                        )}
                      </div>
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Sent</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3">
                      <span>{c.va_party?.name}</span>
                      <span>{c.total_pieces} pcs</span>
                      <span>{(c.batch_items || []).length} batches</span>
                      {c.sent_date && <span>Sent: {new Date(c.sent_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Selected challan header */}
            <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="font-mono font-semibold text-gray-800">{selectedChallan.challan_no}</span>
                <span className="ml-2 text-sm text-gray-500">{selectedChallan.va_party?.name}</span>
                {selectedChallan.value_addition && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
                    +{selectedChallan.value_addition.short_code}
                  </span>
                )}
              </div>
              <button onClick={() => setSelectedChallan(null)} className="text-xs text-primary-600 hover:text-primary-800">Change</button>
            </div>

            {/* Batch items — enter received pieces + cost */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Batch Items</label>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500">
                      <th className="text-left py-2 pl-3">Batch</th>
                      <th className="text-center py-2">Sent</th>
                      <th className="text-center py-2">Received</th>
                      <th className="text-right py-2 pr-3">Cost (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(selectedChallan.batch_items || []).map((item) => {
                      const batchId = item.batch?.id || item.id
                      const data = receiveData[batchId] || {}
                      return (
                        <tr key={batchId}>
                          <td className="py-2 pl-3">
                            <span className="font-mono font-semibold text-gray-800 text-xs">{item.batch?.batch_code || '—'}</span>
                            {item.batch?.size && <span className="ml-1.5 text-xs bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded font-bold">{item.batch.size}</span>}
                          </td>
                          <td className="py-2 text-center text-gray-600">{item.pieces_sent}</td>
                          <td className="py-2 text-center">
                            <input type="number" min="0" max={item.pieces_sent}
                              value={data.pieces_received ?? item.pieces_sent}
                              onChange={(e) => updateItem(batchId, 'pieces_received', e.target.value)}
                              className="w-16 rounded border border-gray-300 px-2 py-1 text-xs text-center" />
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <input type="number" min="0" step="0.01"
                              value={data.cost || ''}
                              onChange={(e) => updateItem(batchId, 'cost', e.target.value)}
                              placeholder="0"
                              className="w-20 rounded border border-gray-300 px-2 py-1 text-xs text-right" />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes" className={INPUT} />
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
