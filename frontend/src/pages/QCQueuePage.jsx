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
  const total = batch.piece_count || batch.quantity || 0
  const colors = batch.color_breakdown || {}
  const hasColors = Object.keys(colors).length > 0
  const totalPallas = Object.values(colors).reduce((s, v) => s + v, 0)

  // Reject-only state: [{color, qty, reason}]
  const [rejects, setRejects] = useState([])
  const [showRejectMode, setShowRejectMode] = useState(false)
  // Legacy flat state (no color_breakdown)
  const [flatApproved, setFlatApproved] = useState('')
  const [flatRejected, setFlatRejected] = useState('')
  const [flatReason, setFlatReason] = useState('')

  // Colors available to reject (not already in rejects list)
  const availableColors = Object.keys(colors).filter(
    (c) => !rejects.some((r) => r.color === c)
  )

  function expectedForColor(color) {
    if (!totalPallas || !colors[color]) return 0
    return Math.round(total * colors[color] / totalPallas)
  }

  function totalRejected() {
    return rejects.reduce((s, r) => s + (parseInt(r.qty) || 0), 0)
  }

  function addReject() {
    if (availableColors.length === 0) return
    setRejects((prev) => [...prev, { color: availableColors[0], qty: '1', reason: '' }])
  }

  function updateReject(idx, field, value) {
    setRejects((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  function removeReject(idx) {
    setRejects((prev) => prev.filter((_, i) => i !== idx))
  }

  function buildColorQC(allPass) {
    // Build color_qc dict from color_breakdown
    const colorQC = {}
    for (const [color, pallas] of Object.entries(colors)) {
      const expected = expectedForColor(color)
      colorQC[color] = { approved: expected, rejected: 0, reason: '' }
    }
    if (!allPass) {
      // Apply rejects
      for (const r of rejects) {
        const rej = parseInt(r.qty) || 0
        if (rej > 0 && colorQC[r.color]) {
          const exp = colorQC[r.color].approved + colorQC[r.color].rejected
          const actualRej = Math.min(rej, exp)
          colorQC[r.color].rejected = actualRej
          colorQC[r.color].approved = exp - actualRej
          if (r.reason.trim()) colorQC[r.color].reason = r.reason.trim()
        }
      }
    }
    return colorQC
  }

  function handleAllPass() {
    if (!hasColors) {
      // Legacy flat — all approved
      onCheck(batch.id, { approved_qty: total, rejected_qty: 0, rejection_reason: null })
      return
    }
    onCheck(batch.id, { color_qc: buildColorQC(true) })
  }

  function handleSubmitRejects() {
    if (!hasColors) {
      // Legacy flat
      const a = parseInt(flatApproved) || 0
      const r = parseInt(flatRejected) || 0
      if (a + r !== total) { alert(`Approved + Rejected must equal ${total}`); return }
      if (r > 0 && !flatReason.trim()) { alert('Please provide a rejection reason'); return }
      onCheck(batch.id, { approved_qty: a, rejected_qty: r, rejection_reason: r > 0 ? flatReason.trim() : null })
      return
    }
    // Validate rejects
    const rej = totalRejected()
    if (rej === 0) { alert('Add at least one reject or use All Pass'); return }
    if (rej > total) { alert(`Total rejected (${rej}) exceeds batch quantity (${total})`); return }
    for (const r of rejects) {
      const rQty = parseInt(r.qty) || 0
      if (rQty <= 0) { alert(`Enter rejected qty for ${r.color}`); return }
      if (!r.reason.trim()) { alert(`Enter reason for ${r.color}`); return }
      const exp = expectedForColor(r.color)
      if (rQty > exp) { alert(`${r.color}: rejected (${rQty}) exceeds expected (${exp})`); return }
    }
    onCheck(batch.id, { color_qc: buildColorQC(false) })
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
          {hasColors && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {Object.entries(colors).map(([color, pallas]) => (
                <span key={color} className="text-[10px] font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                  {color} <span className="text-gray-400">x{pallas}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <svg className={`w-5 h-5 text-gray-400 transition-transform shrink-0 ml-2 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded check form */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100">
          {/* All Pass button */}
          <button
            onClick={handleAllPass}
            disabled={isLoading || showRejectMode}
            className="w-full py-3 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 disabled:opacity-40 transition-colors mb-3 flex items-center justify-center gap-2"
          >
            {isLoading && !showRejectMode ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            )}
            All Pass ({total}/{total})
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-gray-200" />
            <button
              onClick={() => setShowRejectMode(!showRejectMode)}
              className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
            >
              {showRejectMode ? 'Cancel rejects' : 'Mark rejects'}
            </button>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {showRejectMode && (
            <>
              {hasColors ? (
                /* Per-color reject mode */
                <div className="space-y-2 mb-3">
                  {rejects.map((r, idx) => (
                    <div key={idx} className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg p-2.5">
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <select
                            value={r.color}
                            onChange={(e) => updateReject(idx, 'color', e.target.value)}
                            className="flex-1 rounded-lg border border-red-200 px-2 py-1.5 text-sm bg-white focus:border-red-400 focus:ring-1 focus:ring-red-400"
                          >
                            {/* Current color + available colors */}
                            <option value={r.color}>{r.color} (x{colors[r.color] || 0})</option>
                            {availableColors.filter((c) => c !== r.color).map((c) => (
                              <option key={c} value={c}>{c} (x{colors[c]})</option>
                            ))}
                          </select>
                          <div className="w-16">
                            <input
                              type="number"
                              min="1"
                              max={expectedForColor(r.color)}
                              value={r.qty}
                              onChange={(e) => updateReject(idx, 'qty', e.target.value)}
                              className="w-full rounded-lg border border-red-200 px-2 py-1.5 text-sm text-center focus:border-red-400 focus:ring-1 focus:ring-red-400"
                              placeholder="qty"
                            />
                          </div>
                          <button onClick={() => removeReject(idx)} className="text-red-400 hover:text-red-600 p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                        <input
                          type="text"
                          value={r.reason}
                          onChange={(e) => updateReject(idx, 'reason', e.target.value)}
                          className="w-full rounded-lg border border-red-200 px-2 py-1.5 text-xs bg-white focus:border-red-400 focus:ring-1 focus:ring-red-400"
                          placeholder="Reason (e.g. stitching defect)"
                        />
                      </div>
                    </div>
                  ))}

                  {availableColors.length > 0 && (
                    <button
                      onClick={addReject}
                      className="w-full py-2 border-2 border-dashed border-red-200 text-red-500 text-xs font-semibold rounded-lg hover:border-red-300 hover:bg-red-50 transition-colors"
                    >
                      + Add rejected color
                    </button>
                  )}

                  {rejects.length > 0 && (
                    <div className="flex justify-between text-xs font-medium px-1 pt-1">
                      <span className="text-green-700">Approved: {total - totalRejected()}</span>
                      <span className="text-red-600">Rejected: {totalRejected()}</span>
                    </div>
                  )}

                  <button
                    onClick={handleSubmitRejects}
                    disabled={isLoading || rejects.length === 0}
                    className="w-full py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? 'Checking...' : `Submit (${total - totalRejected()} pass, ${totalRejected()} reject)`}
                  </button>
                </div>
              ) : (
                /* Legacy flat mode — no color_breakdown */
                <div className="space-y-3 mb-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Approved</label>
                      <input type="number" min="0" max={total} value={flatApproved}
                        onChange={(e) => { const v = e.target.value; setFlatApproved(v); setFlatRejected(String(Math.max(0, total - (parseInt(v) || 0)))) }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Rejected</label>
                      <input type="number" min="0" max={total} value={flatRejected}
                        onChange={(e) => { const v = e.target.value; setFlatRejected(v); setFlatApproved(String(Math.max(0, total - (parseInt(v) || 0)))) }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500" placeholder="0" />
                    </div>
                  </div>
                  {parseInt(flatRejected) > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Rejection Reason</label>
                      <input type="text" value={flatReason} onChange={(e) => setFlatReason(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Stitching defects" />
                    </div>
                  )}
                  <button onClick={handleSubmitRejects} disabled={isLoading}
                    className="w-full py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                    {isLoading ? 'Checking...' : 'Submit Check'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
