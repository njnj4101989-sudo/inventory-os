import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMyBatches } from '../api/mobile'
import { startBatch, submitBatch } from '../api/batches'
import StatusBadge from '../components/common/StatusBadge'
import { useOfflineQueue } from '../hooks/useOfflineQueue'

const STATUS_ORDER = { in_progress: 0, assigned: 1, submitted: 2 }

async function executeOfflineAction(type, payload) {
  if (type === 'start_batch') return startBatch(payload.id)
  if (type === 'submit_batch') return submitBatch(payload.id)
}

export default function MyWorkPage() {
  const navigate = useNavigate()
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const { enqueue, pendingCount, isOnline } = useOfflineQueue(executeOfflineAction)

  useEffect(() => { fetchBatches() }, [])

  async function fetchBatches() {
    setLoading(true)
    try {
      const res = await getMyBatches()
      const data = res?.data?.data || res?.data || []
      setBatches(Array.isArray(data) ? data : [])
    } catch { setBatches([]) }
    finally { setLoading(false) }
  }

  async function handleStart(id) {
    if (!isOnline) {
      enqueue('start_batch', { id })
      // Optimistic local update
      setBatches((prev) => prev.map((b) => b.id === id ? { ...b, status: 'in_progress', started_at: new Date().toISOString() } : b))
      return
    }
    setActionLoading(id)
    try {
      await startBatch(id)
      await fetchBatches()
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to start batch')
    } finally { setActionLoading(null) }
  }

  async function handleSubmit(id) {
    if (!isOnline) {
      enqueue('submit_batch', { id })
      setBatches((prev) => prev.map((b) => b.id === id ? { ...b, status: 'submitted', submitted_at: new Date().toISOString() } : b))
      return
    }
    setActionLoading(id)
    try {
      await submitBatch(id)
      await fetchBatches()
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to submit batch')
    } finally { setActionLoading(null) }
  }

  const sorted = [...batches].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))

  const counts = {
    assigned: batches.filter((b) => b.status === 'assigned').length,
    in_progress: batches.filter((b) => b.status === 'in_progress').length,
    submitted: batches.filter((b) => b.status === 'submitted').length,
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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-gray-900">My Work</h1>
        {pendingCount > 0 && (
          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
            {pendingCount} queued
          </span>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <KPI label="To Start" value={counts.assigned} color="bg-blue-50 text-blue-700" />
        <KPI label="In Progress" value={counts.in_progress} color="bg-yellow-50 text-yellow-700" />
        <KPI label="Submitted" value={counts.submitted} color="bg-purple-50 text-purple-700" />
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p className="font-medium">No batches assigned</p>
          <p className="text-sm mt-1">Scan a batch QR to claim work</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((batch) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              actionLoading={actionLoading}
              onStart={handleStart}
              onSubmit={handleSubmit}
              onTap={(b) => navigate(`/scan/batch/${encodeURIComponent(b.batch_code)}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function KPI({ label, value, color }) {
  return (
    <div className={`rounded-xl px-3 py-3 text-center ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium mt-0.5">{label}</div>
    </div>
  )
}

function BatchCard({ batch, actionLoading, onStart, onSubmit, onTap }) {
  const isLoading = actionLoading === batch.id

  return (
    <div
      onClick={() => onTap(batch)}
      className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 active:bg-gray-50 cursor-pointer transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-mono text-sm font-bold text-gray-900">{batch.batch_code}</div>
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            {batch.size && (
              <span className="inline-flex items-center bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5 text-xs font-bold text-emerald-700">
                {batch.size}
              </span>
            )}
            <StatusBadge status={batch.status} />
          </div>
          {batch.lot && (
            <div className="text-xs text-gray-500 mt-1.5">
              {batch.lot.lot_code} &middot; {batch.lot.design_no || batch.design_no}
            </div>
          )}
          {batch.piece_count && (
            <div className="text-xs text-gray-400 mt-0.5">{batch.piece_count} pcs</div>
          )}
        </div>

        {/* Action button — stopPropagation so card tap doesn't fire */}
        <div className="flex-shrink-0">
          {batch.status === 'assigned' && (
            <button
              onClick={(e) => { e.stopPropagation(); onStart(batch.id) }}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Starting...' : 'Start Work'}
            </button>
          )}
          {batch.status === 'in_progress' && (
            <button
              onClick={(e) => { e.stopPropagation(); onSubmit(batch.id) }}
              disabled={isLoading}
              className="px-4 py-2 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Submitting...' : 'Submit for QC'}
            </button>
          )}
          {batch.status === 'submitted' && (
            <span className="px-3 py-2 bg-gray-100 text-gray-500 text-xs font-medium rounded-lg">
              Awaiting QC
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
