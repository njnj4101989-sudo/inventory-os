import { useState, useEffect, useCallback } from 'react'
import { getPendingChecks } from '../api/mobile'
import { checkBatch } from '../api/batches'
import StatusBadge from '../components/common/StatusBadge'
import { useOfflineQueue } from '../hooks/useOfflineQueue'

async function executeOfflineAction(type, payload) {
  if (type === 'check_batch') return checkBatch(payload.id, payload.data)
}

export default function QCQueuePage() {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const { enqueue, pendingCount, isOnline } = useOfflineQueue(executeOfflineAction)

  useEffect(() => { fetchQueue() }, [])

  async function fetchQueue() {
    setLoading(true)
    try {
      const res = await getPendingChecks()
      const data = res?.data?.data || res?.data || []
      setBatches(Array.isArray(data) ? data : [])
    } catch { setBatches([]) }
    finally { setLoading(false) }
  }

  async function handleCheck(id, data) {
    if (!isOnline) {
      enqueue('check_batch', { id, data })
      // Optimistic remove from queue
      setBatches((prev) => prev.filter((b) => b.id !== id))
      setExpanded(null)
      return
    }
    setActionLoading(id)
    try {
      await checkBatch(id, data)
      setExpanded(null)
      await fetchQueue()
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to check batch')
    } finally { setActionLoading(null) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="px-4 py-5 pb-24">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-bold text-gray-900">QC Queue</h1>
        {pendingCount > 0 && (
          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
            {pendingCount} queued
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-5">
        {batches.length} batch{batches.length !== 1 ? 'es' : ''} awaiting check
      </p>

      {batches.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="font-medium">All caught up!</p>
          <p className="text-sm mt-1">No batches awaiting quality check</p>
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((batch) => (
            <QCCard
              key={batch.id}
              batch={batch}
              isExpanded={expanded === batch.id}
              onToggle={() => setExpanded(expanded === batch.id ? null : batch.id)}
              onCheck={handleCheck}
              isLoading={actionLoading === batch.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function QCCard({ batch, isExpanded, onToggle, onCheck, isLoading }) {
  const [approved, setApproved] = useState('')
  const [rejected, setRejected] = useState('')
  const [reason, setReason] = useState('')

  const total = batch.piece_count || batch.quantity || 0

  function handleApprovedChange(val) {
    const num = parseInt(val) || 0
    setApproved(val)
    setRejected(String(Math.max(0, total - num)))
  }

  function handleRejectedChange(val) {
    const num = parseInt(val) || 0
    setRejected(val)
    setApproved(String(Math.max(0, total - num)))
  }

  function handleSubmitCheck() {
    const a = parseInt(approved) || 0
    const r = parseInt(rejected) || 0
    if (a + r !== total) {
      alert(`Approved + Rejected must equal ${total}`)
      return
    }
    if (r > 0 && !reason.trim()) {
      alert('Please provide a rejection reason')
      return
    }
    onCheck(batch.id, {
      approved_qty: a,
      rejected_qty: r,
      rejection_reason: r > 0 ? reason.trim() : null,
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header — tap to expand */}
      <button onClick={onToggle} className="w-full px-4 py-3.5 flex items-center justify-between text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-gray-900">{batch.batch_code}</span>
            {batch.size && (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5">
                {batch.size}
              </span>
            )}
            <span className="text-xs text-gray-500">{total} pcs</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {batch.tailor && (
              <span className="text-xs font-medium text-primary-700">
                <svg className="w-3 h-3 inline mr-0.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                {batch.tailor.full_name}
              </span>
            )}
            {batch.lot && (
              <span className="text-xs text-gray-400">Lot {batch.lot.lot_code} &middot; Design {batch.lot.design_no}</span>
            )}
          </div>
        </div>
        <svg className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded check form */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Approved</label>
              <input
                type="number"
                min="0"
                max={total}
                value={approved}
                onChange={(e) => handleApprovedChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Rejected</label>
              <input
                type="number"
                min="0"
                max={total}
                value={rejected}
                onChange={(e) => handleRejectedChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500"
                placeholder="0"
              />
            </div>
          </div>

          {(parseInt(approved) || 0) + (parseInt(rejected) || 0) !== total && approved !== '' && (
            <p className="text-xs text-red-500 mb-2">Total must equal {total}</p>
          )}

          {parseInt(rejected) > 0 && (
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">Rejection Reason</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500"
                placeholder="e.g. Stitching defects"
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSubmitCheck}
              disabled={isLoading}
              className="flex-1 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Checking...' : 'Submit Check'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
