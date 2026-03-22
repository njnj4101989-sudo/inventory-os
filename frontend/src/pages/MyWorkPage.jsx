import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getMyBatches } from '../api/mobile'
import { startBatch, submitBatch } from '../api/batches'
import { useOfflineQueue } from '../hooks/useOfflineQueue'

const STATUS_ORDER = { in_progress: 0, assigned: 1, submitted: 2 }

async function executeOfflineAction(type, payload) {
  if (type === 'start_batch') return startBatch(payload.id)
  if (type === 'submit_batch') return submitBatch(payload.id)
}

function daysAgo(iso) {
  if (!iso) return null
  const diff = (Date.now() - new Date(iso).getTime()) / 86400000
  if (diff < 1) return 'today'
  const d = Math.floor(diff)
  return `${d}d ago`
}

export default function MyWorkPage() {
  const navigate = useNavigate()
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const { enqueue, pendingCount, isOnline } = useOfflineQueue(executeOfflineAction)

  const { user: currentUser } = useAuth()

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
  const inProgress = sorted.filter((b) => b.status === 'in_progress')
  const assigned = sorted.filter((b) => b.status === 'assigned')
  const submitted = sorted.filter((b) => b.status === 'submitted')
  const totalPieces = batches.reduce((s, b) => s + (b.piece_count || b.quantity || 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="px-4 py-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="typo-section-title text-gray-900">
            Hi, {currentUser.full_name?.split(' ')[0] || 'Tailor'}
          </h1>
          <p className="typo-caption mt-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
              {pendingCount} queued
            </span>
          )}
          <button
            onClick={fetchBatches}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:bg-gray-200 transition-colors"
            aria-label="Refresh"
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/60 px-3 py-3 text-center border border-blue-100">
          <div className="flex items-center justify-center gap-1.5">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="typo-kpi text-blue-700">{assigned.length}</span>
          </div>
          <div className="typo-kpi-label text-blue-500 mt-0.5">To Start</div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-amber-50 to-yellow-100/60 px-3 py-3 text-center border border-amber-100">
          <div className="flex items-center justify-center gap-1.5">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="typo-kpi text-amber-700">{inProgress.length}</span>
          </div>
          <div className="typo-kpi-label text-amber-500 mt-0.5">Stitching</div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/60 px-3 py-3 text-center border border-purple-100">
          <div className="flex items-center justify-center gap-1.5">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="typo-kpi text-purple-700">{submitted.length}</span>
          </div>
          <div className="typo-kpi-label text-purple-500 mt-0.5">Submitted</div>
        </div>
      </div>

      {/* Summary line */}
      {batches.length > 0 && (
        <p className="text-xs text-gray-400 mb-4">
          {batches.length} batch{batches.length !== 1 ? 'es' : ''} &middot; {totalPieces} total pieces
        </p>
      )}

      {batches.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8H3m2 8H3m10-10V4m0 16v-2" />
            </svg>
          </div>
          <p className="typo-data">No batches yet</p>
          <p className="typo-body text-gray-400 mt-1">Scan a batch QR to claim work</p>
          <button
            onClick={() => navigate('/scan')}
            className="mt-4 px-5 py-2.5 bg-primary-600 text-white typo-btn rounded-xl hover:bg-primary-700 transition-colors"
          >
            Open Scanner
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Stitching Now */}
          {inProgress.length > 0 && (
            <BatchGroup
              title="Stitching Now"
              count={inProgress.length}
              color="text-amber-700 bg-amber-50"
              batches={inProgress}
              actionLoading={actionLoading}
              onStart={handleStart}
              onSubmit={handleSubmit}
              onTap={(b) => navigate(`/scan/batch/${encodeURIComponent(b.batch_code)}`)}
            />
          )}

          {/* Ready to Start */}
          {assigned.length > 0 && (
            <BatchGroup
              title="Ready to Start"
              count={assigned.length}
              color="text-blue-700 bg-blue-50"
              batches={assigned}
              actionLoading={actionLoading}
              onStart={handleStart}
              onSubmit={handleSubmit}
              onTap={(b) => navigate(`/scan/batch/${encodeURIComponent(b.batch_code)}`)}
            />
          )}

          {/* Submitted */}
          {submitted.length > 0 && (
            <BatchGroup
              title="Awaiting QC"
              count={submitted.length}
              color="text-purple-700 bg-purple-50"
              batches={submitted}
              actionLoading={actionLoading}
              onStart={handleStart}
              onSubmit={handleSubmit}
              onTap={(b) => navigate(`/scan/batch/${encodeURIComponent(b.batch_code)}`)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function BatchGroup({ title, count, color, batches, actionLoading, onStart, onSubmit, onTap }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`typo-badge uppercase tracking-wide px-2 py-0.5 rounded-md ${color}`}>{title}</span>
        <span className="text-xs text-gray-400">{count}</span>
      </div>
      <div className="space-y-2.5">
        {batches.map((batch) => (
          <BatchCard
            key={batch.id}
            batch={batch}
            actionLoading={actionLoading}
            onStart={onStart}
            onSubmit={onSubmit}
            onTap={onTap}
          />
        ))}
      </div>
    </div>
  )
}

function BatchCard({ batch, actionLoading, onStart, onSubmit, onTap }) {
  const isLoading = actionLoading === batch.id
  const pieces = batch.piece_count || batch.quantity || 0
  const colors = batch.color_breakdown || {}
  const colorEntries = Object.entries(colors)
  const assigned = daysAgo(batch.assigned_at)
  const design = batch.design_no || '—'
  const lotCode = batch.lot?.lot_code

  return (
    <div
      onClick={() => onTap(batch)}
      className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden active:bg-gray-50 cursor-pointer transition-colors"
    >
      <div className="p-3.5">
        {/* Top row: code + size + action */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono typo-data text-gray-900">{batch.batch_code}</span>
              {batch.size && (
                <span className="inline-flex items-center bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5 text-xs font-bold text-emerald-700">
                  {batch.size}
                </span>
              )}
              <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Design + Lot + Pieces */}
            <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
              {design && <span className="typo-body">Design {design}</span>}
              {lotCode && <span>{lotCode}</span>}
              <span className="typo-data">{pieces} pcs</span>
            </div>
          </div>

          {/* Action button */}
          <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {batch.status === 'assigned' && (
              <button
                onClick={() => onStart(batch.id)}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white typo-btn-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isLoading ? 'Starting...' : 'Start'}
              </button>
            )}
            {batch.status === 'in_progress' && (
              <button
                onClick={() => onSubmit(batch.id)}
                disabled={isLoading}
                className="px-4 py-2 bg-purple-600 text-white typo-btn-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {isLoading ? '...' : 'Submit QC'}
              </button>
            )}
            {batch.status === 'submitted' && (
              <span className="px-3 py-2 bg-gray-100 text-gray-400 text-[10px] font-medium rounded-lg">
                Awaiting QC
              </span>
            )}
          </div>
        </div>

        {/* Color chips */}
        {colorEntries.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {colorEntries.map(([color, qty]) => (
              <span key={color} className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-[10px]">
                <span className="text-gray-600">{color}</span>
                <span className="font-bold text-gray-800">{qty}</span>
              </span>
            ))}
          </div>
        )}

        {/* Bottom row: VA alert + assigned time */}
        <div className="flex items-center justify-between mt-2">
          {batch.has_pending_va && batch.pending_va?.length > 0 ? (
            <div className="flex items-center gap-1 text-amber-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="text-[10px] font-semibold">
                Out for {batch.pending_va.map((v) => v.short_code).join(', ')}
              </span>
            </div>
          ) : (
            <div />
          )}
          {assigned && (
            <span className="text-[10px] text-gray-400">
              Assigned {assigned}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
