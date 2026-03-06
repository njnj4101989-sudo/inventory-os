import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { getBatch, checkBatch, readyForPacking, packBatch, updateBatch } from '../api/batches'
import StatusBadge from '../components/common/StatusBadge'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorAlert from '../components/common/ErrorAlert'
import BatchLabelSheet from '../components/common/BatchLabelSheet'
import { useNotifications } from '../context/NotificationContext'

const STEPS = [
  { key: 'created_at', label: 'Created', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
  { key: 'assigned_at', label: 'Assigned', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { key: 'started_at', label: 'Stitching', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { key: 'submitted_at', label: 'Submitted', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'checked_at', label: 'Checked', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { key: '_packing', label: 'Packing', statusMatch: 'packing', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { key: 'packed_at', label: 'Packed', icon: 'M5 13l4 4L19 7' },
]

const VA_ST = {
  sent: { dot: 'bg-amber-400', text: 'text-amber-700', bg: 'bg-amber-50', label: 'Out' },
  received: { dot: 'bg-green-400', text: 'text-green-700', bg: 'bg-green-50', label: 'Back' },
}

function dur(from, to) {
  if (!from || !to) return null
  const ms = new Date(to) - new Date(from)
  if (ms < 0) return null
  const m = Math.floor(ms / 60000)
  if (m < 1) return `${Math.floor(ms / 1000)}s`
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' +
    d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function BatchDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [batch, setBatch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { lastEvent } = useNotifications()
  const [labelBatches, setLabelBatches] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [packRef, setPackRef] = useState('')
  const [showQCForm, setShowQCForm] = useState(false)
  const [qcApproved, setQcApproved] = useState('')
  const [qcRejected, setQcRejected] = useState('')
  const [qcReason, setQcReason] = useState('')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState('')

  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}') } catch { return {} } })()
  const perms = currentUser.permissions || {}
  const isAdminOrSuper = ['admin', 'supervisor'].includes(currentUser.role)

  const fetchBatch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getBatch(id)
      setBatch(res.data.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load batch')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchBatch() }, [fetchBatch])

  const handleReadyForPacking = async () => {
    setActionLoading(true)
    try {
      await readyForPacking(batch.id)
      fetchBatch()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to mark ready for packing')
    } finally { setActionLoading(false) }
  }

  const handlePackBatch = async () => {
    setActionLoading(true)
    try {
      await packBatch(batch.id, { pack_reference: packRef.trim() || null })
      setPackRef('')
      fetchBatch()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to mark as packed')
    } finally { setActionLoading(false) }
  }

  const handleCheckBatch = async () => {
    const a = parseInt(qcApproved) || 0
    const r = parseInt(qcRejected) || 0
    if (a + r === 0) return
    setActionLoading(true)
    try {
      await checkBatch(batch.id, {
        approved_qty: a,
        rejected_qty: r,
        rejection_reason: r > 0 ? qcReason.trim() || null : null,
      })
      setShowQCForm(false)
      setQcApproved('')
      setQcRejected('')
      setQcReason('')
      fetchBatch()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to check batch')
    } finally { setActionLoading(false) }
  }

  const handleSaveNotes = async () => {
    setActionLoading(true)
    try {
      await updateBatch(batch.id, { notes: notesValue.trim() || null })
      setEditingNotes(false)
      fetchBatch()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update notes')
    } finally { setActionLoading(false) }
  }

  useEffect(() => {
    if (!lastEvent) return
    const ev = ['batch_claimed', 'batch_submitted', 'batch_checked', 'batch_packed', 'va_sent', 'va_received']
    if (ev.includes(lastEvent.type)) fetchBatch()
  }, [lastEvent, fetchBatch])

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" text="Loading batch..." /></div>
  if (error) return <ErrorAlert message={error} />
  if (!batch) return <ErrorAlert message="Batch not found" />

  const pieces = batch.piece_count ?? batch.quantity ?? 0
  const approved = batch.approved_qty ?? 0
  const rejected = batch.rejected_qty ?? 0
  const pct = pieces > 0 ? Math.round((approved / pieces) * 100) : null
  const tailor = batch.assignment?.tailor?.full_name || null
  const lot = batch.lot
  const logs = batch.processing_logs || []
  const colorQC = batch.color_qc || null

  // VA logs grouped by phase
  const vaByPhase = {}
  logs.forEach((l) => { const p = l.phase || 'stitching'; (vaByPhase[p] = vaByPhase[p] || []).push(l) })

  // Build timeline nodes: interleave STEPS with VA diamonds
  const timelineNodes = []
  STEPS.forEach((step, i) => {
    timelineNodes.push({ type: 'step', step, stepIndex: i })
    if (step.key === 'started_at' && vaByPhase['stitching']?.length) {
      vaByPhase['stitching'].forEach((log) => timelineNodes.push({ type: 'va', log }))
    }
    if (step.key === 'checked_at') {
      ;[...(vaByPhase['post_qc'] || [])].forEach((log) => timelineNodes.push({ type: 'va', log }))
    }
  })
  const gridCols = { gridTemplateColumns: `repeat(${timelineNodes.length}, minmax(0, 1fr))` }

  const stepDone = (step) => {
    if (step.statusMatch) return batch.status === 'packing' || !!batch.packed_at
    return !!batch[step.key]
  }
  const stepActive = (step, i) => {
    if (step.statusMatch) return batch.status === 'packing'
    if (!batch[step.key]) return false
    const next = STEPS[i + 1]
    return next ? !stepDone(next) : false
  }

  return (
    <div className="space-y-3">

      {/* ── Row 1: Header ── */}
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs">
        <button onClick={() => navigate('/batches')} className="text-gray-400 hover:text-primary-600 transition-colors">Batches</button>
        <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <span className="text-gray-600 font-medium">{batch.batch_code}</span>
      </div>
      <div className="flex items-center gap-3">
        <h1 className="typo-page-title text-gray-900">{batch.batch_code}</h1>
        <StatusBadge status={batch.status} />
        <span className="text-sm text-gray-500">
          {lot ? `${lot.lot_code} · Design ${lot.design_no}` : batch.sku ? batch.sku.sku_code : ''}
        </span>
        {batch.size && <span className="rounded-md bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700 ring-1 ring-inset ring-primary-200">{batch.size}</span>}
        {lot?.product_type && <span className="text-xs text-gray-400">{lot.product_type}</span>}
        <div className="flex-1" />
        <button onClick={() => setLabelBatches([batch])}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print
        </button>
      </div>

      {/* ── Action Bar: QC Check ── */}
      {(perms.batch_check || isAdminOrSuper) && batch.status === 'submitted' && (
        <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3">
          {!showQCForm ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="typo-data text-indigo-800">Batch submitted for QC</p>
                <p className="text-[11px] text-indigo-600 mt-0.5">{pieces} pieces from {tailor || 'tailor'}</p>
              </div>
              <button onClick={() => { setShowQCForm(true); setQcApproved(String(pieces)); setQcRejected('0') }}
                className="rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 text-sm font-semibold transition-colors">
                QC Check
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="typo-data text-indigo-800">Quality Check — {pieces} pieces total</p>
                <button onClick={() => setShowQCForm(false)} className="text-xs text-indigo-400 hover:text-indigo-600">Cancel</button>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="typo-label text-indigo-600 mb-1 block">Approved</label>
                  <input type="number" min="0" max={pieces} value={qcApproved}
                    onChange={(e) => { setQcApproved(e.target.value); setQcRejected(String(pieces - (parseInt(e.target.value) || 0))) }}
                    className="w-full rounded-lg border border-indigo-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div className="flex-1">
                  <label className="typo-label text-indigo-600 mb-1 block">Rejected</label>
                  <input type="number" min="0" max={pieces} value={qcRejected}
                    onChange={(e) => { setQcRejected(e.target.value); setQcApproved(String(pieces - (parseInt(e.target.value) || 0))) }}
                    className="w-full rounded-lg border border-indigo-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                {parseInt(qcRejected) > 0 && (
                  <div className="flex-[2]">
                    <label className="typo-label text-red-500 mb-1 block">Rejection Reason</label>
                    <input type="text" value={qcReason} onChange={(e) => setQcReason(e.target.value)}
                      placeholder="e.g. Stitching defect, loose thread"
                      className="w-full rounded-lg border border-red-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                  </div>
                )}
                <button onClick={handleCheckBatch} disabled={actionLoading || (parseInt(qcApproved) || 0) + (parseInt(qcRejected) || 0) === 0}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-1.5 text-sm font-semibold disabled:opacity-50 transition-colors whitespace-nowrap">
                  {actionLoading ? 'Saving...' : 'Submit QC'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Action Bar (packing workflow) ── */}
      {(perms.batch_ready_packing || isAdminOrSuper) && batch.status === 'checked' && !batch.has_pending_va && (
        <div className="rounded-lg bg-orange-50 border border-orange-200 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="typo-data text-orange-800">QC Complete — Ready for packing?</p>
            <p className="text-[11px] text-orange-600 mt-0.5">{pieces} pieces checked ({approved} approved, {rejected} rejected)</p>
          </div>
          <button onClick={handleReadyForPacking} disabled={actionLoading}
            className="rounded-lg bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors">
            {actionLoading ? 'Processing...' : 'Ready for Packing'}
          </button>
        </div>
      )}

      {(perms.batch_pack || isAdminOrSuper) && batch.status === 'packing' && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="typo-data text-green-800">Batch is ready — Confirm packing</p>
            <p className="text-[11px] text-green-600 mt-0.5">{pieces} pieces to pack</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="text" value={packRef} onChange={(e) => setPackRef(e.target.value)}
              placeholder="Pack reference (optional)"
              className="rounded-lg border border-green-300 px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-green-400" />
            <button onClick={handlePackBatch} disabled={actionLoading}
              className="rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors whitespace-nowrap">
              {actionLoading ? 'Packing...' : 'Mark as Packed'}
            </button>
          </div>
        </div>
      )}

      {/* ── Row 2: Stat Bar (compact) ── */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-lg bg-white border border-gray-100 px-3 py-2">
          <p className="typo-label">Pieces</p>
          <p className="typo-kpi text-gray-900">{pieces}</p>
        </div>
        <div className="rounded-lg bg-white border border-gray-100 px-3 py-2">
          <p className="typo-label">Approved</p>
          <p className="typo-kpi text-green-600">{approved} {pct !== null && <span className="text-xs font-normal text-gray-400">{pct}%</span>}</p>
        </div>
        <div className="rounded-lg bg-white border border-gray-100 px-3 py-2">
          <p className="typo-label">Rejected</p>
          <p className={`typo-kpi ${rejected > 0 ? 'text-red-600' : 'text-gray-300'}`}>{rejected}</p>
          {batch.rejection_reason && <p className="text-[9px] text-red-400 truncate">{batch.rejection_reason}</p>}
        </div>
        <div className="rounded-lg bg-white border border-gray-100 px-3 py-2">
          <p className="typo-label">Tailor</p>
          <p className="typo-data truncate">{tailor || <span className="text-gray-300">—</span>}</p>
        </div>
      </div>

      {/* ── Row 3: Journey (horizontal stepper) ── */}
      <div className="rounded-lg bg-white border border-gray-100 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50">
          <h2 className="typo-section-title">Batch Journey</h2>
        </div>
        <div className="px-4 py-4">
          {/* Horizontal dots + connecting lines (dynamic: steps + VA diamonds) */}
          <div className="grid items-center" style={gridCols}>
            {timelineNodes.map((node, i) => {
              const done = node.type === 'va' ? node.log.status === 'received' : stepDone(node.step)
              const active = node.type === 'va' ? node.log.status === 'sent' : stepActive(node.step, node.stepIndex)
              const isLast = i === timelineNodes.length - 1
              const nextNode = timelineNodes[i + 1]
              const nextDone = nextNode ? (nextNode.type === 'va' ? nextNode.log.status === 'received' : stepDone(nextNode.step)) : false
              const lineColor = done && nextDone ? 'bg-primary-400' : done ? 'bg-gradient-to-r from-primary-400 to-gray-200' : 'bg-gray-200'

              if (node.type === 'va') {
                const log = node.log
                const received = log.status === 'received'
                return (
                  <div key={`va-${log.id}`} className="flex items-center justify-center relative group">
                    <div className={`w-5 h-5 rotate-45 rounded-[3px] flex items-center justify-center border-2 transition-all shrink-0 z-10 ${
                      received ? 'border-green-400 bg-green-500' :
                      'border-amber-400 bg-amber-50 shadow-[0_0_0_3px_rgba(251,191,36,0.15)]'
                    }`}>
                      {received ? (
                        <svg className="w-2.5 h-2.5 text-white -rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="relative flex h-1.5 w-1.5 -rotate-45">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
                        </span>
                      )}
                    </div>
                    {!isLast && (
                      <div className={`absolute top-1/2 h-0.5 -translate-y-1/2 ${lineColor}`} style={{ left: '50%', width: '100%' }} />
                    )}
                    {/* Hover tooltip */}
                    <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-150 z-30 pointer-events-none">
                      <div className="bg-white rounded-lg shadow-lg border border-gray-200 px-3 py-2.5 w-48 text-left">
                        <p className="text-xs font-bold text-gray-900">{log.value_addition?.name || '—'}</p>
                        <div className="h-px bg-gray-100 my-1.5" />
                        <div className="space-y-1 text-[11px]">
                          {log.processor_name && <p className="text-gray-600"><span className="text-gray-400">Processor: </span>{log.processor_name}</p>}
                          {log.challan_no && <p className="text-gray-600"><span className="text-gray-400">Challan: </span>{log.challan_no}</p>}
                          <p className="text-gray-600"><span className="text-gray-400">Pieces: </span>{log.pieces_sent} sent{log.pieces_received != null ? `, ${log.pieces_received} back` : ''}</p>
                          {log.sent_date && <p className="text-gray-600"><span className="text-gray-400">Sent: </span>{fmtDate(log.sent_date)}</p>}
                          {log.received_date && <p className="text-gray-600"><span className="text-gray-400">Back: </span>{fmtDate(log.received_date)}</p>}
                          {log.cost != null && <p className="text-gray-600"><span className="text-gray-400">Cost: </span>{parseFloat(log.cost).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</p>}
                        </div>
                        <div className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          received ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${received ? 'bg-green-500' : 'bg-amber-500'}`} />
                          {received ? 'Returned' : 'Sent — Pending'}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }

              const step = node.step
              return (
                <div key={step.key} className="flex items-center justify-center relative">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all shrink-0 z-10 ${
                    active ? 'border-amber-400 bg-amber-50 shadow-[0_0_0_4px_rgba(251,191,36,0.15)]' :
                    done ? 'border-primary-500 bg-primary-600' : 'border-gray-200 bg-white'
                  }`}>
                    {done && !active ? (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    ) : active ? (
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                      </span>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d={step.icon} />
                      </svg>
                    )}
                  </div>
                  {!isLast && (
                    <div className={`absolute top-1/2 h-0.5 -translate-y-1/2 ${lineColor}`} style={{ left: '50%', width: '100%' }} />
                  )}
                </div>
              )
            })}
          </div>

          {/* Labels row */}
          <div className="grid mt-1.5" style={gridCols}>
            {timelineNodes.map((node) => {
              if (node.type === 'va') {
                const sc = node.log.value_addition?.short_code || '?'
                const received = node.log.status === 'received'
                return (
                  <div key={`va-lbl-${node.log.id}`} className="text-center">
                    <span className={`text-[9px] font-bold ${received ? 'text-green-600' : 'text-amber-600'}`}>{sc}</span>
                  </div>
                )
              }
              const done = stepDone(node.step)
              const active = stepActive(node.step, node.stepIndex)
              return (
                <div key={node.step.key} className="text-center">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                    active ? 'text-amber-700' : done ? 'text-gray-700' : 'text-gray-400'
                  }`}>{node.step.label}</span>
                </div>
              )
            })}
          </div>

          {/* Detail boxes row */}
          <div className="grid gap-1 mt-2" style={gridCols}>
            {timelineNodes.map((node) => {
              if (node.type === 'va') return <div key={`va-box-${node.log.id}`} />

              const step = node.step
              const i = node.stepIndex
              const done = stepDone(step)
              const active = stepActive(step, i)
              const ts = step.statusMatch ? null : batch[step.key]
              const prevTs = i > 0 ? batch[STEPS[i - 1].key] : null
              const elapsed = ts && prevTs ? dur(prevTs, ts) : null

              let ctx = ''
              if (step.key === 'created_at' && batch.created_by_user) ctx = batch.created_by_user.full_name
              if (step.key === 'assigned_at' && tailor) ctx = tailor
              if (step.key === 'checked_at' && done) {
                ctx = `${approved}✓ ${rejected}✗`
                if (batch.checked_by) ctx += ` · ${batch.checked_by.full_name}`
              }
              if (step.key === 'packed_at' && batch.packed_by) {
                ctx = batch.packed_by.full_name
                if (batch.pack_reference) ctx += ` · ${batch.pack_reference}`
              }

              return (
                <div key={step.key}
                  className={`rounded-lg px-2 py-2 min-h-[56px] overflow-hidden ${
                    active ? 'bg-amber-50 ring-1 ring-amber-200' :
                    done ? 'bg-gray-50 border border-gray-100' : ''
                  }`}>
                  {(done || active) && (
                    <>
                      <p className={`typo-code text-[11px] leading-snug truncate ${active ? 'text-amber-700 font-medium' : 'text-gray-600'}`}>
                        {ts ? fmtDate(ts) : active ? 'In progress...' : ''}
                      </p>
                      {ctx && <p className="text-[11px] text-gray-700 font-medium leading-snug truncate mt-0.5">{ctx}</p>}
                      {elapsed && (
                        <span className="inline-block typo-code text-[10px] text-gray-500 bg-white rounded px-1.5 py-px border border-gray-100 mt-1">{elapsed}</span>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Row 4: Two-column bottom — Left: Lot + Color QC + Details | Right: QR ── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-3">

        {/* Left column */}
        <div className="space-y-3">

          {/* Lot Origin */}
          {lot && (
            <div className="rounded-lg bg-white border border-gray-100 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="typo-section-title">Lot Origin</h3>
                <button onClick={() => navigate('/lots')} className="text-[10px] text-primary-600 hover:text-primary-700 font-medium">View Lots &rarr;</button>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-gray-400">Lot: </span>
                  <span className="typo-data font-bold">{lot.lot_code}</span>
                </div>
                <div>
                  <span className="text-gray-400">Design: </span>
                  <span className="typo-data">{lot.design_no}</span>
                </div>
                <div>
                  <span className="text-gray-400">Type: </span>
                  <span className="typo-data">{lot.product_type || 'BLS'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Total: </span>
                  <span className="typo-data">{lot.total_pieces} pcs</span>
                </div>
                <div>
                  <span className="text-gray-400">Status: </span>
                  <span className="typo-data capitalize">{lot.status}</span>
                </div>
              </div>
            </div>
          )}

          {/* Color QC */}
          {colorQC && Object.keys(colorQC).length > 0 && (
            <div className="rounded-lg bg-white border border-gray-100 px-4 py-3">
              <h3 className="typo-section-title mb-2">Color-wise QC</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                {Object.entries(colorQC).map(([color, qc]) => {
                  const tot = (qc.approved || 0) + (qc.rejected || 0)
                  const p = tot > 0 ? Math.round(((qc.approved || 0) / tot) * 100) : 0
                  return (
                    <div key={color} className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-600 w-14 truncate">{color}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full rounded-full ${p >= 90 ? 'bg-green-500' : p >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${p}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-500 w-16 text-right">
                        <span className="font-semibold text-green-600">{qc.approved || 0}</span>/{tot}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Color Breakdown chips */}
          {batch.color_breakdown && Object.keys(batch.color_breakdown).length > 0 && (
            <div className="rounded-lg bg-white border border-gray-100 px-4 py-3">
              <h3 className="typo-section-title mb-2">Color Breakdown</h3>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(batch.color_breakdown).map(([color, qty]) => (
                  <span key={color} className="inline-flex items-center gap-1 rounded-full bg-gray-50 border border-gray-200 px-2 py-0.5 text-[11px]">
                    <span className="text-gray-600">{color}</span>
                    <span className="font-bold text-gray-900">{qty}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Details */}
          <div className="rounded-lg bg-white border border-gray-100 px-4 py-3">
            <h3 className="typo-section-title mb-2">Details</h3>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <div><span className="text-gray-400">Created: </span><span className="text-gray-700">{batch.created_by_user?.full_name || '—'}</span></div>
              {batch.checked_by && <div><span className="text-gray-400">Checked: </span><span className="text-gray-700">{batch.checked_by.full_name}</span></div>}
              {batch.packed_by && <div><span className="text-gray-400">Packed: </span><span className="text-gray-700">{batch.packed_by.full_name}</span></div>}
              {batch.pack_reference && <div><span className="text-gray-400">Pack Ref: </span><span className="text-gray-700">{batch.pack_reference}</span></div>}
            </div>
            {/* Notes — view / edit */}
            {editingNotes ? (
              <div className="mt-2 space-y-1.5">
                <textarea value={notesValue} onChange={(e) => setNotesValue(e.target.value)}
                  rows={2} placeholder="Add notes about this batch..."
                  className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditingNotes(false)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
                  <button onClick={handleSaveNotes} disabled={actionLoading}
                    className="rounded bg-primary-600 text-white text-xs px-3 py-1 font-medium hover:bg-primary-700 disabled:opacity-50">
                    {actionLoading ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex items-start gap-2">
                {batch.notes ? (
                  <p className="flex-1 text-xs text-gray-600 bg-gray-50 rounded px-2.5 py-1.5">{batch.notes}</p>
                ) : (
                  <p className="flex-1 text-xs text-gray-400 italic">No notes</p>
                )}
                <button onClick={() => { setNotesValue(batch.notes || ''); setEditingNotes(true) }}
                  className="text-[10px] text-primary-600 hover:text-primary-700 font-medium shrink-0">
                  {batch.notes ? 'Edit' : 'Add Note'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right column — QR */}
        <div className="rounded-lg bg-white border border-gray-100 flex flex-col items-center justify-center p-4">
          <QRCodeSVG
            value={`${window.location.origin}/scan/batch/${encodeURIComponent(batch.batch_code)}`}
            size={160} level="H" includeMargin={true}
          />
          <p className="mt-1 typo-label">Scan to view</p>
          <p className="typo-data font-bold mt-1">{batch.batch_code}</p>
          {batch.size && <p className="text-xs text-primary-600 font-bold">{batch.size}</p>}
        </div>
      </div>

      {/* Batch Label Sheet (reprint) */}
      {labelBatches && (
        <BatchLabelSheet
          batches={labelBatches}
          lotCode={lot?.lot_code || '—'}
          designNo={lot?.design_no || '—'}
          lotDate={lot?.lot_date || batch.created_at || ''}
          onClose={() => setLabelBatches(null)}
        />
      )}
    </div>
  )
}
