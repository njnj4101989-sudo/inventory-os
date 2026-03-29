import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useReactToPrint } from 'react-to-print'
import { QRCodeSVG } from 'qrcode.react'
import { getRollPassport } from '../api/rolls'
import { getBatchPassport, claimBatch, startBatch, submitBatch, checkBatch, readyForPacking, packBatch } from '../api/batches'
import { getSKUPassport } from '../api/skus'
import { colorHex, loadColorMap } from '../utils/colorUtils'
import CameraScanner from '../components/common/CameraScanner'

/**
 * Public Passport page — /scan/roll/:rollCode OR /scan/batch/:batchCode
 * No auth required for viewing. Workers scan QR on roll/batch → see full chain.
 * Tailors can claim batches if logged in.
 */
export default function ScanPage() {
  const { rollCode, batchCode, skuCode } = useParams()
  const navigate = useNavigate()

  const [passport, setPassport] = useState(null)
  const [batchPassport, setBatchPassport] = useState(null)
  const [skuPassport, setSkuPassport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showScanner, setShowScanner] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimSuccess, setClaimSuccess] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionSuccess, setActionSuccess] = useState(null)
  const [checkForm, setCheckForm] = useState({ approved: '', rejected: '', reason: '' })
  const [rejects, setRejects] = useState([]) // [{color, qty, reason}]
  const [showRejectMode, setShowRejectMode] = useState(false)
  const [packRef, setPackRef] = useState('')
  const passportPrintRef = useRef(null)

  const handlePrintPassport = useReactToPrint({
    contentRef: passportPrintRef,
    documentTitle: `Batch-Passport-${batchCode || 'unknown'}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    `,
  })

  const { user: currentUser, isAuthenticated: isLoggedIn, role: userRole, permissions: perms } = useAuth()

  useEffect(() => { loadColorMap() }, [])
  useEffect(() => {
    if (rollCode) {
      fetchRollPassport(rollCode)
    } else if (batchCode) {
      fetchBatchPassport(batchCode)
    } else if (skuCode) {
      fetchSKUPassport(skuCode)
    } else {
      setShowScanner(true)
      setLoading(false)
    }
  }, [rollCode, batchCode, skuCode])

  const handlePassportError = (err, itemLabel) => {
    if (err?.response?.status === 401) {
      setError('LOGIN_REQUIRED')
    } else {
      setError(err?.response?.data?.detail || `${itemLabel} not found`)
    }
  }

  async function fetchRollPassport(code) {
    setLoading(true); setError(null); setBatchPassport(null); setSkuPassport(null)
    try {
      const res = await getRollPassport(code)
      const data = res?.data?.data || res?.data || res
      setPassport(data)
    } catch (err) {
      handlePassportError(err, `Roll "${code}"`)
    } finally { setLoading(false) }
  }

  async function fetchBatchPassport(code) {
    setLoading(true); setError(null); setPassport(null); setSkuPassport(null); setClaimSuccess(false)
    try {
      const res = await getBatchPassport(code)
      const data = res?.data?.data || res?.data || res
      setBatchPassport(data)
      setRejects([])
      setShowRejectMode(false)
    } catch (err) {
      handlePassportError(err, `Batch "${code}"`)
    } finally { setLoading(false) }
  }

  async function fetchSKUPassport(code) {
    setLoading(true); setError(null); setPassport(null); setBatchPassport(null)
    try {
      const res = await getSKUPassport(code)
      const data = res?.data?.data || res?.data || res
      setSkuPassport(data)
    } catch (err) {
      handlePassportError(err, `SKU "${code}"`)
    } finally { setLoading(false) }
  }

  async function handleClaim() {
    if (!batchCode || !batchPassport) return
    setClaiming(true)
    try {
      await claimBatch(batchCode)
      setClaimSuccess(true)
      // Refresh passport
      await fetchBatchPassport(batchCode)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to claim batch')
    } finally { setClaiming(false) }
  }

  async function handleStartBatch() {
    if (!batchPassport) return
    setActionLoading(true); setActionSuccess(null)
    try {
      await startBatch(batchPassport.id)
      setActionSuccess('Batch started!')
      await fetchBatchPassport(batchCode)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to start batch')
    } finally { setActionLoading(false) }
  }

  async function handleSubmitBatch() {
    if (!batchPassport) return
    setActionLoading(true); setActionSuccess(null)
    try {
      await submitBatch(batchPassport.id)
      setActionSuccess('Submitted for QC!')
      await fetchBatchPassport(batchCode)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to submit batch')
    } finally { setActionLoading(false) }
  }

  function scanExpectedForColor(color) {
    if (!batchPassport?.color_breakdown) return 0
    const colors = batchPassport.color_breakdown
    const total = batchPassport.piece_count || batchPassport.quantity || 0
    const totalPallas = Object.values(colors).reduce((s, v) => s + v, 0)
    if (!totalPallas || !colors[color]) return 0
    return Math.round(total * colors[color] / totalPallas)
  }

  function scanBuildColorQC(allPass) {
    const colors = batchPassport.color_breakdown || {}
    const colorQC = {}
    for (const color of Object.keys(colors)) {
      const expected = scanExpectedForColor(color)
      colorQC[color] = { approved: expected, rejected: 0 }
    }
    if (!allPass) {
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

  async function handleAllPassBatch() {
    if (!batchPassport) return
    const hasColors = batchPassport.color_breakdown && Object.keys(batchPassport.color_breakdown).length > 0
    setActionLoading(true); setActionSuccess(null)
    try {
      if (hasColors) {
        await checkBatch(batchPassport.id, { color_qc: scanBuildColorQC(true) })
      } else {
        const total = batchPassport.piece_count || batchPassport.quantity || 0
        await checkBatch(batchPassport.id, { approved_qty: total, rejected_qty: 0, rejection_reason: null })
      }
      setActionSuccess('Batch approved!')
      await fetchBatchPassport(batchCode)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to check batch')
    } finally { setActionLoading(false) }
  }

  async function handleSubmitRejectsBatch() {
    if (!batchPassport) return
    const total = batchPassport.piece_count || batchPassport.quantity || 0
    const hasColors = batchPassport.color_breakdown && Object.keys(batchPassport.color_breakdown).length > 0

    if (hasColors) {
      const rej = rejects.reduce((s, r) => s + (parseInt(r.qty) || 0), 0)
      if (rej === 0) { setError('Add at least one reject or use All Pass'); return }
      if (rej > total) { setError(`Total rejected (${rej}) exceeds batch quantity (${total})`); return }
      for (const r of rejects) {
        const rQty = parseInt(r.qty) || 0
        if (rQty <= 0) { setError(`Enter rejected qty for ${r.color}`); return }
        if (!r.reason.trim()) { setError(`Enter reason for ${r.color}`); return }
        const exp = scanExpectedForColor(r.color)
        if (rQty > exp) { setError(`${r.color}: rejected (${rQty}) exceeds expected (${exp})`); return }
      }
      setActionLoading(true); setActionSuccess(null)
      try {
        await checkBatch(batchPassport.id, { color_qc: scanBuildColorQC(false) })
        setActionSuccess(`Checked: ${total - rej} pass, ${rej} reject`)
        await fetchBatchPassport(batchCode)
      } catch (err) {
        setError(err?.response?.data?.detail || 'Failed to check batch')
      } finally { setActionLoading(false) }
    } else {
      // Legacy flat mode
      const a = parseInt(checkForm.approved) || 0
      const r = parseInt(checkForm.rejected) || 0
      if (a + r !== total) { setError(`Approved + Rejected must equal ${total}`); return }
      if (r > 0 && !checkForm.reason.trim()) { setError('Please provide a rejection reason'); return }
      setActionLoading(true); setActionSuccess(null)
      try {
        await checkBatch(batchPassport.id, { approved_qty: a, rejected_qty: r, rejection_reason: r > 0 ? checkForm.reason.trim() : null })
        setActionSuccess(a > 0 ? 'Batch approved!' : 'Batch rejected — returned to tailor')
        await fetchBatchPassport(batchCode)
      } catch (err) {
        setError(err?.response?.data?.detail || 'Failed to check batch')
      } finally { setActionLoading(false) }
    }
  }

  async function handleReadyForPacking() {
    if (!batchPassport) return
    setActionLoading(true); setActionSuccess(null)
    try {
      await readyForPacking(batchPassport.id)
      setActionSuccess('Marked ready for packing!')
      await fetchBatchPassport(batchCode)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to mark ready for packing')
    } finally { setActionLoading(false) }
  }

  async function handlePackBatch() {
    if (!batchPassport) return
    setActionLoading(true); setActionSuccess(null)
    try {
      await packBatch(batchPassport.id, { pack_reference: packRef.trim() || null })
      setActionSuccess('Batch packed! Ready stock added.')
      await fetchBatchPassport(batchCode)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to pack batch')
    } finally { setActionLoading(false) }
  }

  function handleScan(decodedText) {
    setShowScanner(false)
    // Detect SKU, batch, or roll URL
    const skuMatch = decodedText.match(/\/scan\/sku\/([^/?\s]+)/)
    if (skuMatch) {
      navigate(`/scan/sku/${encodeURIComponent(decodeURIComponent(skuMatch[1]))}`)
      return
    }
    const batchMatch = decodedText.match(/\/scan\/batch\/([^/?\s]+)/)
    if (batchMatch) {
      navigate(`/scan/batch/${encodeURIComponent(batchMatch[1])}`)
      return
    }
    const rollMatch = decodedText.match(/\/scan\/roll\/([^/?\s]+)/)
    const code = rollMatch ? decodeURIComponent(rollMatch[1]) : decodedText.trim()
    navigate(`/scan/roll/${encodeURIComponent(code)}`)
  }

  const statusColor = {
    in_stock: 'bg-green-100 text-green-700',
    sent_for_processing: 'bg-yellow-100 text-yellow-700',
    in_cutting: 'bg-blue-100 text-blue-700',
    remnant: 'bg-amber-100 text-amber-700',
  }

  const batchStatusColor = {
    created: 'bg-gray-100 text-gray-600',
    assigned: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    submitted: 'bg-purple-100 text-purple-700',
    checked: 'bg-emerald-100 text-emerald-700',
    packing: 'bg-orange-100 text-orange-700',
    packed: 'bg-green-100 text-green-700',
    CREATED: 'bg-gray-100 text-gray-600',
    ASSIGNED: 'bg-blue-100 text-blue-700',
    STARTED: 'bg-yellow-100 text-yellow-700',
    SUBMITTED: 'bg-purple-100 text-purple-700',
    CHECKED: 'bg-emerald-100 text-emerald-700',
    PACKING: 'bg-orange-100 text-orange-700',
    PACKED: 'bg-green-100 text-green-700',
  }

  const pageTitle = batchCode ? 'Batch Passport' : 'Roll Passport'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-3 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              if (window.history.length > 1) navigate(-1)
              else {
                const r = currentUser.role
                navigate(r === 'tailor' ? '/my-work' : r === 'checker' ? '/qc-queue' : '/dashboard', { replace: true })
              }
            }}
            className="p-1.5 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 active:bg-gray-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${batchCode ? 'bg-emerald-600' : 'bg-blue-600'}`}>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <span className="typo-data text-gray-900">{pageTitle}</span>
        </div>
        <div className="flex items-center gap-2">
          {batchPassport && (
            <button
              onClick={handlePrintPassport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
          )}
          <button
            onClick={() => setShowScanner(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-medium rounded-lg hover:opacity-90 ${batchCode ? 'bg-emerald-600' : 'bg-blue-600'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8H3m2 8H3m10-10V4m0 16v-2" />
            </svg>
            Scan QR
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Loading passport...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          error === 'LOGIN_REQUIRED' ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center mt-8">
              <h3 className="typo-data text-amber-800 mb-1">Login Required</h3>
              <p className="text-amber-600 text-sm">Please log in to view item details.</p>
              <a href={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}
                className="mt-4 inline-block px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
                Go to Login
              </a>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center mt-8">
              <h3 className="typo-data text-red-800 mb-1">Not Found</h3>
              <p className="text-red-600 text-sm">{error}</p>
              <button onClick={() => { setError(null); setShowScanner(true) }}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
                Scan Again
              </button>
            </div>
          )
        )}

        {/* No code — prompt to scan */}
        {!loading && !error && !passport && !batchPassport && !skuPassport && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8H3m2 8H3m10-10V4m0 16v-2" />
              </svg>
            </div>
            <div>
              <h3 className="typo-data text-gray-900">Scan a QR Code</h3>
              <p className="text-gray-500 text-sm mt-1">Point your camera at the QR label on any roll or batch</p>
            </div>
            <button onClick={() => setShowScanner(true)}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
              Open Camera
            </button>
          </div>
        )}

        {/* ═══════ BATCH PASSPORT ═══════ */}
        {!loading && !error && batchPassport && (
          <div className="space-y-4" ref={passportPrintRef}>
            {/* Batch identity card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h1 className="typo-section-title text-gray-900 font-mono">{batchPassport.batch_code}</h1>
                  {batchPassport.size && (
                    <div className="mt-2 inline-flex items-center gap-2 bg-emerald-50 border-2 border-emerald-200 rounded-xl px-4 py-2">
                      <span className="text-xs font-bold text-emerald-600 uppercase">Size</span>
                      <span className="text-2xl font-black text-emerald-700">{batchPassport.size}</span>
                    </div>
                  )}
                  <div className="mt-2">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${batchStatusColor[batchPassport.status] || 'bg-gray-100 text-gray-600'}`}>
                      {batchPassport.status?.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <QRCodeSVG value={window.location.href} size={64} level="M" includeMargin={false} />
                </div>
              </div>
            </div>

            {/* Batch details — single card with everything the tailor needs */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <InfoRow label="Design No." value={batchPassport.design_no} />
              <InfoRow label="Lot" value={batchPassport.lot?.lot_code} />
              <InfoRow label="Date" value={batchPassport.lot_date
                ? new Date(batchPassport.lot_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : null} />
              <InfoRow label="Pieces" value={batchPassport.piece_count} />
              <InfoRow label="Tailor" value={batchPassport.assignments?.[0]?.tailor?.full_name || batchPassport.assignment?.tailor?.full_name} />
              {batchPassport.assigned_at && (
                <InfoRow label="Assigned" value={new Date(batchPassport.assigned_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
              )}
            </div>

            {/* Out-house VA alert */}
            {batchPassport.has_pending_va && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <p className="typo-data text-amber-800">Out-House -- VA Pending</p>
                  {(batchPassport.processing_logs || []).filter((l) => l.status === 'sent').map((log, i) => (
                    <p key={i} className="text-xs text-amber-600 mt-0.5">
                      {log.pieces_sent} pcs at {log.va_party?.name || 'vendor'} ({log.value_addition?.short_code})
                      {log.sent_date && ` since ${new Date(log.sent_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* VA Processing Timeline */}
            {(batchPassport.processing_logs || []).length > 0 && (
              <Section title="Value Additions" icon="✨">
                {batchPassport.processing_logs.map((log, i) => (
                  <div key={log.id || i} className="py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {log.value_addition && (
                          <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">+{log.value_addition.short_code}</span>
                        )}
                        <span className="typo-body text-gray-900">{log.value_addition?.name || '—'}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          log.phase === 'post_qc' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-500'
                        }`}>
                          {log.phase === 'post_qc' ? 'Post-QC' : 'Stitching'}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        log.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {log.status === 'received' ? 'Returned' : 'Sent'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                      <span>{log.va_party?.name}</span>
                      {log.challan_no && <span>{log.challan_no}</span>}
                      <span>{log.pieces_sent} pcs sent</span>
                      {log.pieces_received != null && <span>{log.pieces_received} pcs back</span>}
                      {log.sent_date && <span>Sent: {new Date(log.sent_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>}
                      {log.received_date && <span>Back: {new Date(log.received_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>}
                      {log.cost != null && <span>Cost: ₹{parseFloat(log.cost).toLocaleString('en-IN')}</span>}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {/* Action buttons — role-aware (hidden in print) */}
            <div className="no-print space-y-4">
              {actionSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <div className="text-emerald-700 font-semibold text-sm">{actionSuccess}</div>
                </div>
              )}

              {/* Claim (tailor + created) */}
              {batchPassport.status === 'created' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center">
                  {claimSuccess ? (
                    <div className="text-emerald-700 font-semibold">Batch claimed successfully!</div>
                  ) : isLoggedIn ? (
                    <button onClick={handleClaim} disabled={claiming}
                      className="w-full py-3 bg-emerald-600 text-white rounded-xl typo-btn hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                      {claiming ? 'Claiming...' : 'Claim This Batch'}
                    </button>
                  ) : (
                    <div>
                      <p className="text-gray-500 text-sm mb-3">Login to claim this batch</p>
                      <a href="/login" className="inline-block px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                        Login to Claim
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Start Work (batch_start permission + assigned) */}
              {perms.batch_start && batchPassport.status === 'assigned' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <button onClick={handleStartBatch} disabled={actionLoading}
                    className="w-full py-3 bg-blue-600 text-white rounded-xl typo-btn hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {actionLoading ? 'Starting...' : 'Start Work'}
                  </button>
                </div>
              )}

              {/* Submit for QC (batch_submit permission + in_progress) */}
              {perms.batch_submit && batchPassport.status === 'in_progress' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <button onClick={handleSubmitBatch} disabled={actionLoading}
                    className="w-full py-3 bg-purple-600 text-white rounded-xl typo-btn hover:bg-purple-700 disabled:opacity-50 transition-colors">
                    {actionLoading ? 'Submitting...' : 'Submit for QC'}
                  </button>
                </div>
              )}

              {/* QC Check (batch_check permission + submitted) */}
              {perms.batch_check && batchPassport.status === 'submitted' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <h3 className="typo-card-title mb-3">Quality Check</h3>

                  {(() => {
                    const scanColors = batchPassport.color_breakdown || {}
                    const scanHasColors = Object.keys(scanColors).length > 0
                    const scanTotal = batchPassport.piece_count || batchPassport.quantity || 0
                    const scanTotalRej = rejects.reduce((s, r) => s + (parseInt(r.qty) || 0), 0)
                    const scanAvailColors = Object.keys(scanColors).filter(c => !rejects.some(r => r.color === c))

                    return (
                      <>
                        {/* All Pass button */}
                        <button
                          onClick={handleAllPassBatch}
                          disabled={actionLoading || showRejectMode}
                          className="w-full py-3 bg-green-600 text-white typo-btn rounded-xl hover:bg-green-700 disabled:opacity-40 transition-colors mb-3 flex items-center justify-center gap-2"
                        >
                          {actionLoading && !showRejectMode ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                          )}
                          All Pass ({scanTotal}/{scanTotal})
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
                            {scanHasColors ? (
                              <div className="space-y-2 mb-3">
                                {/* Color chips showing breakdown */}
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {Object.entries(scanColors).map(([color, pallas]) => (
                                    <span key={color} className="text-[10px] font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                                      <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: colorHex(color) }} />
                                      {color} <span className="text-gray-400">x{pallas}</span>
                                    </span>
                                  ))}
                                </div>

                                {rejects.map((r, idx) => (
                                  <div key={idx} className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg p-2.5">
                                    <div className="flex-1 space-y-2">
                                      <div className="flex gap-2">
                                        <select
                                          value={r.color}
                                          onChange={(e) => setRejects(prev => prev.map((x, i) => i === idx ? { ...x, color: e.target.value } : x))}
                                          className="flex-1 rounded-lg border border-red-200 px-2 py-1.5 text-sm bg-white focus:border-red-400 focus:ring-1 focus:ring-red-400"
                                        >
                                          <option value={r.color}>{r.color} (x{scanColors[r.color] || 0})</option>
                                          {scanAvailColors.filter(c => c !== r.color).map(c => (
                                            <option key={c} value={c}>{c} (x{scanColors[c]})</option>
                                          ))}
                                        </select>
                                        <div className="w-16">
                                          <input type="number" min="1" max={scanExpectedForColor(r.color)}
                                            value={r.qty}
                                            onChange={(e) => setRejects(prev => prev.map((x, i) => i === idx ? { ...x, qty: e.target.value } : x))}
                                            className="w-full rounded-lg border border-red-200 px-2 py-1.5 text-sm text-center focus:border-red-400 focus:ring-1 focus:ring-red-400"
                                            placeholder="qty" />
                                        </div>
                                        <button onClick={() => setRejects(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 p-1">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                      </div>
                                      <input type="text" value={r.reason}
                                        onChange={(e) => setRejects(prev => prev.map((x, i) => i === idx ? { ...x, reason: e.target.value } : x))}
                                        className="w-full rounded-lg border border-red-200 px-2 py-1.5 text-xs bg-white focus:border-red-400 focus:ring-1 focus:ring-red-400"
                                        placeholder="Reason (e.g. stitching defect)" />
                                    </div>
                                  </div>
                                ))}

                                {scanAvailColors.length > 0 && (
                                  <button
                                    onClick={() => setRejects(prev => [...prev, { color: scanAvailColors[0], qty: '1', reason: '' }])}
                                    className="w-full py-2 border-2 border-dashed border-red-200 text-red-500 text-xs font-semibold rounded-lg hover:border-red-300 hover:bg-red-50 transition-colors"
                                  >
                                    + Add rejected color
                                  </button>
                                )}

                                {rejects.length > 0 && (
                                  <div className="flex justify-between text-xs font-medium px-1 pt-1">
                                    <span className="text-green-700">Approved: {scanTotal - scanTotalRej}</span>
                                    <span className="text-red-600">Rejected: {scanTotalRej}</span>
                                  </div>
                                )}

                                <button onClick={handleSubmitRejectsBatch} disabled={actionLoading || rejects.length === 0}
                                  className="w-full py-3 bg-red-600 text-white typo-btn rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors">
                                  {actionLoading ? 'Checking...' : `Submit (${scanTotal - scanTotalRej} pass, ${scanTotalRej} reject)`}
                                </button>
                              </div>
                            ) : (
                              /* Legacy flat QC form (no color breakdown) */
                              <div className="space-y-3 mb-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="typo-label-sm">Approved</label>
                                    <input type="number" min="0" value={checkForm.approved}
                                      onChange={(e) => { const v = e.target.value; setCheckForm(f => ({ ...f, approved: v, rejected: String(Math.max(0, scanTotal - (parseInt(v) || 0))) })) }}
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500" placeholder="0" />
                                  </div>
                                  <div>
                                    <label className="typo-label-sm">Rejected</label>
                                    <input type="number" min="0" value={checkForm.rejected}
                                      onChange={(e) => { const v = e.target.value; setCheckForm(f => ({ ...f, rejected: v, approved: String(Math.max(0, scanTotal - (parseInt(v) || 0))) })) }}
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500" placeholder="0" />
                                  </div>
                                </div>
                                {parseInt(checkForm.rejected) > 0 && (
                                  <div>
                                    <label className="typo-label-sm">Rejection Reason</label>
                                    <input type="text" value={checkForm.reason} onChange={(e) => setCheckForm(f => ({ ...f, reason: e.target.value }))}
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Stitching defects" />
                                  </div>
                                )}
                                <button onClick={handleSubmitRejectsBatch} disabled={actionLoading}
                                  className="w-full py-3 bg-red-600 text-white typo-btn rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors">
                                  {actionLoading ? 'Checking...' : 'Submit Check'}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}

              {/* Ready for Packing (batch_ready_packing permission + checked + no pending VA) */}
              {perms.batch_ready_packing && batchPassport.status === 'checked' && !batchPassport.has_pending_va && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <button onClick={handleReadyForPacking} disabled={actionLoading}
                    className="w-full py-3 bg-orange-500 text-white rounded-xl typo-btn hover:bg-orange-600 disabled:opacity-50 transition-colors">
                    {actionLoading ? 'Processing...' : 'Ready for Packing'}
                  </button>
                </div>
              )}

              {/* Mark Packed (batch_pack permission + packing) */}
              {perms.batch_pack && batchPassport.status === 'packing' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <h3 className="typo-card-title mb-3">Confirm Packing</h3>
                  <div className="mb-3">
                    <label className="typo-label-sm">Box / Bundle Reference (optional)</label>
                    <input type="text" value={packRef} onChange={(e) => setPackRef(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
                      placeholder="e.g. BOX-A12" />
                  </div>
                  <button onClick={handlePackBatch} disabled={actionLoading}
                    className="w-full py-3 bg-green-600 text-white rounded-xl typo-btn hover:bg-green-700 disabled:opacity-50 transition-colors">
                    {actionLoading ? 'Packing...' : 'Mark as Packed'}
                  </button>
                </div>
              )}
            </div>

            {/* Packed info (show in print too) */}
            {batchPassport.status === 'packed' && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <div className="typo-data text-green-700">Packed & Ready Stock</div>
                {batchPassport.pack_reference && (
                  <p className="text-xs text-green-600 mt-1">Box: {batchPassport.pack_reference}</p>
                )}
                {batchPassport.packed_at && (
                  <p className="text-xs text-green-500 mt-0.5">
                    {new Date(batchPassport.packed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            )}

            {/* Footer */}
            <p className="text-center text-xs text-gray-400 pb-4">
              Inventory-OS • Scan QR to see latest status
            </p>
          </div>
        )}

        {/* ═══════ ROLL PASSPORT ═══════ */}
        {!loading && !error && passport && (
          <div className="space-y-4">
            {/* Roll identity card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h1 className="typo-section-title text-gray-900 font-mono break-all">
                    {passport.enhanced_roll_code || passport.roll_code}
                  </h1>
                  {passport.effective_sku && (
                    <div className="mt-1 inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.243 3.03a1 1 0 01.727 1.213L9.53 6h2.94l.56-2.243a1 1 0 111.94.486L14.53 6H17a1 1 0 110 2h-2.97l-1 4H15a1 1 0 110 2h-2.47l-.56 2.242a1 1 0 11-1.94-.485L10.47 14H7.53l-.56 2.242a1 1 0 11-1.94-.485L5.47 14H3a1 1 0 110-2h2.97l1-4H5a1 1 0 110-2h2.47l.56-2.243a1 1 0 011.213-.727zM9.03 8l-1 4h2.938l1-4H9.031z" />
                      </svg>
                      {passport.effective_sku}
                    </div>
                  )}
                  <span className={`mt-2 inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor[passport.status] || 'bg-gray-100 text-gray-600'}`}>
                    {passport.status?.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex-shrink-0">
                  <QRCodeSVG value={window.location.href} size={64} level="M" includeMargin={false} />
                </div>
              </div>

              {/* Key metrics */}
              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100">
                <Metric label="Fabric" value={passport.fabric_type} />
                <Metric label="Color" value={`${passport.color}${passport.color_no ? ` (${String(passport.color_no).padStart(2,'0')})` : ''}`} />
                <Metric label="Orig. Weight" value={`${parseFloat(passport.total_weight || 0).toFixed(1)} ${passport.unit || 'kg'}`} />
                {passport.current_weight && Math.abs(parseFloat(passport.current_weight) - parseFloat(passport.total_weight)) >= 0.01 && (
                  <Metric label="Current Wt." value={`${parseFloat(passport.current_weight).toFixed(1)} ${passport.unit || 'kg'}`} />
                )}
                <Metric label="Remaining" value={`${parseFloat(passport.remaining_weight || 0).toFixed(1)} ${passport.unit || 'kg'}`} />
                {passport.panna && <Metric label="Panna" value={passport.panna} />}
                {passport.gsm && <Metric label="GSM" value={passport.gsm} />}
              </div>
            </div>

            {/* Origin */}
            <Section title="Origin" icon="📦">
              <InfoRow label="Supplier" value={passport.supplier?.name} />
              <InfoRow label="Invoice" value={passport.supplier_invoice_no} />
              <InfoRow label="Challan" value={passport.supplier_challan_no} />
              <InfoRow label="Sr. No." value={passport.sr_no} />
              <InfoRow label="Date" value={passport.supplier_invoice_date
                ? new Date(passport.supplier_invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : null} />
              <InfoRow label="Received by" value={passport.received_by_user?.full_name} />
            </Section>

            {/* Value Additions */}
            {passport.value_additions?.length > 0 && (
              <Section title="Value Additions" icon="✨">
                {passport.value_additions.map((log, i) => (
                  <div key={log.id || i} className="py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">+{log.short_code}</span>
                        <span className="typo-body text-gray-900">{log.name}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        log.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {log.status === 'received' ? 'Returned' : 'Sent'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                      <span>{log.va_party?.name}</span>
                      {log.sent_date && <span>Sent: {log.sent_date}</span>}
                      {log.received_date && <span>Returned: {log.received_date}</span>}
                      {log.processing_cost && <span>Cost: ₹{parseFloat(log.processing_cost).toLocaleString('en-IN')}</span>}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {/* Fallback: processing_logs if passport has no value_additions split (mock mode) */}
            {!passport.value_additions && passport.processing_logs?.length > 0 && (
              <Section title="Value Additions" icon="✨">
                {passport.processing_logs.map((log, i) => (
                  <div key={log.id || i} className="py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {log.value_addition && <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">+{log.value_addition.short_code}</span>}
                        <span className="typo-body text-gray-900">{log.value_addition?.name || '—'}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        log.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {log.status === 'received' ? 'Returned' : 'Sent'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                      <span>{log.va_party?.name}</span>
                      {log.sent_date && <span>Sent: {log.sent_date}</span>}
                      {log.received_date && <span>Returned: {log.received_date}</span>}
                      {log.processing_cost && <span>Cost: ₹{parseFloat(log.processing_cost).toLocaleString('en-IN')}</span>}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {/* Lots */}
            {passport.lots?.length > 0 && (
              <Section title="Cutting Lots" icon="✂️">
                {passport.lots.map((lot, i) => (
                  <div key={lot.id || i} className="py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="typo-data text-gray-900 font-mono">{lot.lot_code}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        lot.status === 'distributed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>{lot.status}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                      {lot.lot_date && <span>{new Date(lot.lot_date).toLocaleDateString('en-IN')}</span>}
                      {lot.weight_used != null && <span>Used: {parseFloat(lot.weight_used).toFixed(1)} kg</span>}
                      {lot.pieces_from_roll != null && <span>Pieces: {lot.pieces_from_roll}</span>}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {/* Batches */}
            {passport.batches?.length > 0 && (
              <Section title="Stitching Batches" icon="🧵">
                {passport.batches.map((batch, i) => (
                  <div key={batch.id || i} className="py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="typo-data text-gray-900 font-mono">{batch.batch_code}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${batchStatusColor[batch.status] || 'bg-gray-100 text-gray-600'}`}>
                        {batch.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                      {batch.effective_sku && (
                        <span className="font-medium text-indigo-600">{batch.effective_sku}</span>
                      )}
                      {batch.quantity && <span>Qty: {batch.quantity}</span>}
                      {batch.tailor && <span>Tailor: {batch.tailor.full_name}</span>}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {/* Orders */}
            {passport.orders?.length > 0 && (
              <Section title="Orders" icon="📋">
                {passport.orders.map((order, i) => (
                  <InfoRow key={order.id || i} label={order.order_number} value={order.customer_name} />
                ))}
              </Section>
            )}

            {/* Footer note */}
            <p className="text-center text-xs text-gray-400 pb-4">
              Inventory-OS • Scan QR to see latest status
            </p>
          </div>
        )}
      </div>

      {/* ── SKU Passport ── */}
      {skuPassport && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
            {/* SKU Identity Card */}
            <div className="rounded-xl overflow-hidden shadow-lg border border-emerald-200">
              <div className="bg-gradient-to-br from-emerald-600 to-teal-600 px-5 py-4 text-white">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-emerald-100 text-[10px] font-semibold uppercase tracking-wider">Finished Good</p>
                    <h2 className="text-xl font-bold tracking-tight mt-0.5">{skuPassport.sku_code}</h2>
                    <p className="text-emerald-100 text-sm mt-0.5">{skuPassport.product_name}</p>
                  </div>
                  <QRCodeSVG value={`${window.location.origin}/scan/sku/${encodeURIComponent(skuPassport.sku_code)}`} size={64} level="H" bgColor="transparent" fgColor="#fff" />
                </div>
              </div>
              <div className="bg-white px-5 py-3 grid grid-cols-3 gap-3 text-center border-t">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Color</p>
                  <p className="text-sm font-bold text-gray-900">{skuPassport.color || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Size</p>
                  <p className="text-sm font-bold text-gray-900">{skuPassport.size || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Price</p>
                  <p className="text-sm font-bold text-gray-900">{skuPassport.base_price ? `₹${skuPassport.base_price}` : '—'}</p>
                </div>
              </div>
            </div>

            {/* Stock Info */}
            {skuPassport.stock && (
              <Section title="Inventory">
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: 'Total', val: skuPassport.stock.total_qty, color: 'text-gray-900' },
                    { label: 'Available', val: skuPassport.stock.available_qty, color: 'text-green-600' },
                    { label: 'Reserved', val: skuPassport.stock.reserved_qty, color: 'text-amber-600' },
                    { label: 'Pipeline', val: skuPassport.stock.pipeline_qty || 0, color: 'text-blue-600' },
                  ].map(s => (
                    <div key={s.label}>
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">{s.label}</p>
                      <p className={`text-lg font-bold ${s.color}`}>{s.val}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Source Breakdown */}
            {skuPassport.source_breakdown && (
              <Section title="Source Breakdown">
                <div className="grid grid-cols-2 gap-2">
                  <InfoRow label="From Production" value={`${skuPassport.source_breakdown.production_qty} pcs`} />
                  <InfoRow label="From Purchase" value={`${skuPassport.source_breakdown.purchase_qty} pcs`} />
                  <InfoRow label="Returned" value={`${skuPassport.source_breakdown.returned_qty} pcs`} />
                  <InfoRow label="Sold" value={`${skuPassport.source_breakdown.sold_qty} pcs`} />
                </div>
              </Section>
            )}

            {/* Production Chain */}
            {skuPassport.source_batches?.length > 0 && (
              <Section title={`Production History (${skuPassport.source_batches.length} batches)`}>
                <div className="space-y-2">
                  {skuPassport.source_batches.map(b => (
                    <div key={b.id} className="border rounded-lg p-2.5 bg-gray-50/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-700">{b.batch_code}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${b.status === 'packed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{b.status}</span>
                      </div>
                      {b.lot && <InfoRow label="Lot" value={b.lot.lot_code} />}
                      {b.size && <InfoRow label="Size" value={b.size} />}
                      {b.approved_qty > 0 && <InfoRow label="Approved" value={`${b.approved_qty} pcs`} />}
                      {b.tailor && <InfoRow label="Tailor" value={b.tailor.full_name} />}
                      {b.processing_logs?.length > 0 && (
                        <div className="mt-1 pt-1 border-t border-gray-200">
                          <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Value Additions</p>
                          {b.processing_logs.filter(p => p.value_addition).map(p => (
                            <div key={p.id} className="flex items-center justify-between text-xs py-0.5">
                              <span className="font-medium">{p.value_addition.name} <span className="text-gray-400">({p.value_addition.short_code})</span></span>
                              <span className={`font-semibold ${p.status === 'received' ? 'text-green-600' : 'text-orange-500'}`}>{p.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Purchase History */}
            {skuPassport.purchase_invoices?.length > 0 && (
              <Section title={`Purchase History (${skuPassport.purchase_invoices.length} invoices)`}>
                <div className="space-y-1.5">
                  {skuPassport.purchase_invoices.map(pi => (
                    <div key={pi.id} className="flex items-center justify-between text-xs border rounded p-2 bg-gray-50/50">
                      <span className="font-semibold">{pi.invoice_no || '—'}</span>
                      <span className="text-gray-500">{pi.invoice_date || '—'}</span>
                      <span className="font-bold">₹{(pi.total_amount || 0).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <p className="text-center text-xs text-gray-400 pb-4">
              Inventory-OS • SKU Passport
            </p>
          </div>
        </div>
      )}

      {/* Camera scanner overlay */}
      {showScanner && (
        <CameraScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}


// ── Small reusable sub-components (defined outside to avoid focus loss) ──

function Section({ title, icon, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <h3 className="typo-th mb-3 flex items-center gap-1.5">
        <span>{icon}</span> {title}
      </h3>
      {children}
    </div>
  )
}

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex items-baseline gap-2 py-1 border-b border-gray-50 last:border-0">
      <span className="typo-data-label w-24 flex-shrink-0">{label}</span>
      <span className="typo-body text-gray-900">{value}</span>
    </div>
  )
}

function Metric({ label, value }) {
  if (!value) return null
  return (
    <div className="text-center">
      <div className="typo-data text-gray-900">{value}</div>
      <div className="typo-caption mt-0.5">{label}</div>
    </div>
  )
}
