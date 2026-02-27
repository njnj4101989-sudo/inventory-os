import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { getRollPassport } from '../api/rolls'
import { getBatchPassport, claimBatch, startBatch, submitBatch, checkBatch } from '../api/batches'
import CameraScanner from '../components/common/CameraScanner'

/**
 * Public Passport page — /scan/roll/:rollCode OR /scan/batch/:batchCode
 * No auth required for viewing. Workers scan QR on roll/batch → see full chain.
 * Tailors can claim batches if logged in.
 */
export default function ScanPage() {
  const { rollCode, batchCode } = useParams()
  const navigate = useNavigate()

  const [passport, setPassport] = useState(null)
  const [batchPassport, setBatchPassport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showScanner, setShowScanner] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimSuccess, setClaimSuccess] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionSuccess, setActionSuccess] = useState(null)
  const [checkForm, setCheckForm] = useState({ approved: '', rejected: '', reason: '' })

  const isLoggedIn = !!localStorage.getItem('access_token')
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}') } catch { return {} } })()
  const userRole = currentUser.role || null

  useEffect(() => {
    if (rollCode) {
      fetchRollPassport(rollCode)
    } else if (batchCode) {
      fetchBatchPassport(batchCode)
    } else {
      setShowScanner(true)
      setLoading(false)
    }
  }, [rollCode, batchCode])

  async function fetchRollPassport(code) {
    setLoading(true); setError(null); setBatchPassport(null)
    try {
      const res = await getRollPassport(code)
      const data = res?.data?.data || res?.data || res
      setPassport(data)
    } catch (err) {
      setError(err?.response?.data?.detail || `Roll "${code}" not found`)
    } finally { setLoading(false) }
  }

  async function fetchBatchPassport(code) {
    setLoading(true); setError(null); setPassport(null); setClaimSuccess(false)
    try {
      const res = await getBatchPassport(code)
      const data = res?.data?.data || res?.data || res
      setBatchPassport(data)
    } catch (err) {
      setError(err?.response?.data?.detail || `Batch "${code}" not found`)
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

  async function handleCheckBatch() {
    if (!batchPassport) return
    const total = batchPassport.piece_count || batchPassport.quantity || 0
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

  function handleScan(decodedText) {
    setShowScanner(false)
    // Detect batch or roll URL
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
  }

  const batchStatusColor = {
    created: 'bg-gray-100 text-gray-600',
    assigned: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    submitted: 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    CREATED: 'bg-gray-100 text-gray-600',
    ASSIGNED: 'bg-blue-100 text-blue-700',
    STARTED: 'bg-yellow-100 text-yellow-700',
    SUBMITTED: 'bg-purple-100 text-purple-700',
    COMPLETED: 'bg-green-100 text-green-700',
    APPROVED: 'bg-emerald-100 text-emerald-700',
    REJECTED: 'bg-red-100 text-red-700',
  }

  const pageTitle = batchCode ? 'Batch Passport' : 'Roll Passport'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${batchCode ? 'bg-emerald-600' : 'bg-blue-600'}`}>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900 text-sm">{pageTitle}</span>
        </div>
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
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center mt-8">
            <h3 className="font-semibold text-red-800 mb-1">Not Found</h3>
            <p className="text-red-600 text-sm">{error}</p>
            <button onClick={() => { setError(null); setShowScanner(true) }}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
              Scan Again
            </button>
          </div>
        )}

        {/* No code — prompt to scan */}
        {!loading && !error && !passport && !batchPassport && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8H3m2 8H3m10-10V4m0 16v-2" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Scan a QR Code</h3>
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
          <div className="space-y-4">
            {/* Batch identity card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg font-bold text-gray-900 font-mono">{batchPassport.batch_code}</h1>
                  {/* Size — large prominent badge */}
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

              {/* Key metrics */}
              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100">
                <Metric label="Pieces" value={batchPassport.piece_count} />
                <Metric label="Lot" value={batchPassport.lot?.lot_code} />
                <Metric label="Design" value={batchPassport.design_no || batchPassport.lot?.design_no} />
              </div>
            </div>

            {/* Color breakdown */}
            {batchPassport.color_breakdown && Object.keys(batchPassport.color_breakdown).length > 0 && (
              <Section title="Colors" icon="🎨">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(batchPassport.color_breakdown).map(([color, count]) => (
                    <div key={color} className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-1.5">
                      <span className="inline-block h-3 w-3 rounded-full border border-gray-200" style={{ backgroundColor: color.toLowerCase() }} />
                      <span className="text-sm font-medium text-gray-700">{color}</span>
                      <span className="text-xs text-gray-400">{count} pallas</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Assignment info */}
            {batchPassport.assignment && (
              <Section title="Assignment" icon="🧵">
                <InfoRow label="Tailor" value={batchPassport.assignment.tailor?.full_name} />
                <InfoRow label="Assigned" value={batchPassport.assigned_at
                  ? new Date(batchPassport.assigned_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  : null} />
              </Section>
            )}

            {/* Lot info */}
            {batchPassport.lot && (
              <Section title="Lot Details" icon="📦">
                <InfoRow label="Lot Code" value={batchPassport.lot.lot_code} />
                <InfoRow label="Design" value={batchPassport.lot.design_no || batchPassport.design_no} />
                <InfoRow label="Date" value={batchPassport.lot_date
                  ? new Date(batchPassport.lot_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  : null} />
                <InfoRow label="Total Pieces" value={batchPassport.lot.total_pieces} />
                <InfoRow label="Status" value={batchPassport.lot.status} />
              </Section>
            )}

            {/* Action buttons — role-aware */}
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
                    className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
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

            {/* Start Work (tailor + assigned) */}
            {userRole === 'tailor' && batchPassport.status === 'assigned' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <button onClick={handleStartBatch} disabled={actionLoading}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {actionLoading ? 'Starting...' : 'Start Work'}
                </button>
              </div>
            )}

            {/* Submit for QC (tailor + in_progress) */}
            {userRole === 'tailor' && batchPassport.status === 'in_progress' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <button onClick={handleSubmitBatch} disabled={actionLoading}
                  className="w-full py-3 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors">
                  {actionLoading ? 'Submitting...' : 'Submit for QC'}
                </button>
              </div>
            )}

            {/* QC Check (checker + submitted) */}
            {userRole === 'checker' && batchPassport.status === 'submitted' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Quality Check</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Approved</label>
                    <input type="number" min="0" value={checkForm.approved}
                      onChange={(e) => {
                        const v = e.target.value; const total = batchPassport.piece_count || batchPassport.quantity || 0
                        setCheckForm((f) => ({ ...f, approved: v, rejected: String(Math.max(0, total - (parseInt(v) || 0))) }))
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Rejected</label>
                    <input type="number" min="0" value={checkForm.rejected}
                      onChange={(e) => {
                        const v = e.target.value; const total = batchPassport.piece_count || batchPassport.quantity || 0
                        setCheckForm((f) => ({ ...f, rejected: v, approved: String(Math.max(0, total - (parseInt(v) || 0))) }))
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500" placeholder="0" />
                  </div>
                </div>
                {parseInt(checkForm.rejected) > 0 && (
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Rejection Reason</label>
                    <input type="text" value={checkForm.reason} onChange={(e) => setCheckForm((f) => ({ ...f, reason: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Stitching defects" />
                  </div>
                )}
                <button onClick={handleCheckBatch} disabled={actionLoading}
                  className="w-full py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {actionLoading ? 'Checking...' : 'Submit Check'}
                </button>
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
                  <h1 className="text-xl font-bold text-gray-900 font-mono break-all">
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
                        <span className="text-sm font-medium text-gray-900">{log.name}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        log.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {log.status === 'received' ? 'Returned' : 'Sent'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                      <span>{log.vendor_name}</span>
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
                        <span className="text-sm font-medium text-gray-900">{log.value_addition?.name || '—'}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        log.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {log.status === 'received' ? 'Returned' : 'Sent'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                      <span>{log.vendor_name}</span>
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
                      <span className="text-sm font-semibold text-gray-900 font-mono">{lot.lot_code}</span>
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
                      <span className="text-sm font-semibold text-gray-900 font-mono">{batch.batch_code}</span>
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
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
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
      <span className="text-xs text-gray-500 w-24 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  )
}

function Metric({ label, value }) {
  if (!value) return null
  return (
    <div className="text-center">
      <div className="text-sm font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  )
}
