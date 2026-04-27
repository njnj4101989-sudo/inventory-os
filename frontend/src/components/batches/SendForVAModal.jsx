import { useState, useEffect, useCallback, useRef } from 'react'
import Modal from '../common/Modal'
import ErrorAlert from '../common/ErrorAlert'
import QuickMasterModal from '../common/QuickMasterModal'
import useQuickMaster from '../../hooks/useQuickMaster'
import { useScanPair } from '../../hooks/useScanPair'
import { getValueAdditions, getAllVAParties } from '../../api/masters'
import { createBatchChallan, getNextBCNumber } from '../../api/batchChallans'

export default function SendForVAModal({ open, onClose, batches, onSuccess, onPrintChallan }) {
  const [vaList, setVaList] = useState([])
  const [selectedVA, setSelectedVA] = useState('')
  const [vaPartyId, setVaPartyId] = useState('')
  const [vaParties, setVaParties] = useState([])
  const [notes, setNotes] = useState('')
  const [selectedBatches, setSelectedBatches] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [nextChallanNo, setNextChallanNo] = useState('')
  const [scanMode, setScanMode] = useState(false)
  const [scanStatus, setScanStatus] = useState(null)
  // S121 — totals stack inputs (subtotal locked at receive)
  const [gstPercent, setGstPercent] = useState('')
  const [discountAmount, setDiscountAmount] = useState('')
  const [additionalAmount, setAdditionalAmount] = useState('')

  // ── Shift+M Quick Master ──
  const refreshVAList = useCallback(() => {
    getValueAdditions()
      .then((res) => {
        const all = res.data.data || res.data || []
        setVaList(all.filter((va) => va.is_active && (va.applicable_to || 'both') !== 'roll'))
      })
      .catch(() => {})
  }, [])

  const handleQuickMasterCreated = useCallback((masterType, newItem) => {
    if (masterType === 'value_addition' && newItem?.id) {
      refreshVAList()
      setTimeout(() => setSelectedVA(newItem.id), 200)
    }
    if (masterType === 'va_party' && newItem?.id) {
      getAllVAParties().then((res) => setVaParties(res.data.data || res.data || [])).catch(() => {})
      setTimeout(() => setVaPartyId(newItem.id), 200)
    }
  }, [refreshVAList])

  const { quickMasterType, quickMasterOpen, closeQuickMaster, onMasterCreated } = useQuickMaster(handleQuickMasterCreated)

  // Eligible batches: in_progress (stitching VA) or checked (post-QC VA)
  const eligible = (batches || []).filter((b) => b.status === 'in_progress' || b.status === 'checked')

  /* ── Phone scan → auto-select batch ── */
  const selectedBatchesRef = useRef(selectedBatches)
  selectedBatchesRef.current = selectedBatches
  const eligibleRef = useRef(eligible)
  eligibleRef.current = eligible

  const handlePhoneScanBatch = useCallback((rawValue) => {
    const batchMatch = rawValue.match(/\/scan\/batch\/([^/?\s]+)/)
    const code = batchMatch ? decodeURIComponent(batchMatch[1]) : rawValue.trim()
    if (!code) return

    const batch = eligibleRef.current.find(b => b.batch_code === code)
    if (!batch) {
      setScanStatus({ type: 'error', message: `Batch not eligible or not found: ${code}` })
      setTimeout(() => setScanStatus(null), 4000)
      return
    }
    if (selectedBatchesRef.current[batch.id]) {
      setScanStatus({ type: 'duplicate', message: `${code} already selected` })
      setTimeout(() => setScanStatus(null), 3000)
      return
    }
    setSelectedBatches(prev => ({ ...prev, [batch.id]: batch.piece_count || 0 }))
    setScanStatus({ type: 'added', message: `${code} added via phone` })
    setTimeout(() => setScanStatus(null), 2500)
  }, [])

  const { phoneConnected } = useScanPair({
    role: 'desktop',
    enabled: open && scanMode,
    onScan: useCallback((data) => {
      if (data.code) handlePhoneScanBatch(data.code)
    }, [handlePhoneScanBatch]),
  })

  useEffect(() => {
    if (open) {
      refreshVAList()
      setScanMode(false)
      setScanStatus(null)
      getAllVAParties()
        .then((res) => setVaParties(res.data.data || res.data || []))
        .catch(() => {})
      getNextBCNumber()
        .then((res) => setNextChallanNo(res.data?.data?.next_challan_no || res.data?.next_challan_no || ''))
        .catch(() => setNextChallanNo(''))
      // Reset form
      setSelectedVA('')
      setVaPartyId('')
      setNotes('')
      setSelectedBatches({})
      setGstPercent('')
      setDiscountAmount('')
      setAdditionalAmount('')
      setError(null)
    }
  }, [open])

  const toggleBatch = (id) => {
    setSelectedBatches((prev) => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else {
        const batch = eligible.find((b) => b.id === id)
        next[id] = batch?.piece_count || 0
      }
      return next
    })
  }

  const setPieces = (id, val) => {
    setSelectedBatches((prev) => ({ ...prev, [id]: parseInt(val) || 0 }))
  }

  const totalPieces = Object.values(selectedBatches).reduce((s, v) => s + v, 0)
  const selectedCount = Object.keys(selectedBatches).length

  const handleSubmit = async () => {
    if (!selectedVA) { setError('Select a value addition type'); return }
    if (!vaPartyId) { setError('Select a VA party'); return }
    if (selectedCount === 0) { setError('Select at least one batch'); return }
    if (totalPieces === 0) { setError('Total pieces must be greater than 0'); return }

    const vaObj = vaList.find((v) => v.id === selectedVA)
    const batchMap = {}
    eligible.forEach((b) => { batchMap[b.id] = { id: b.id, batch_code: b.batch_code, size: b.size } })

    // Determine phase from batch status
    const firstBatch = eligible.find((b) => selectedBatches[b.id])
    const phase = firstBatch?.status === 'checked' ? 'post_qc' : 'stitching'

    setSaving(true)
    setError(null)
    try {
      const res = await createBatchChallan({
        va_party_id: vaPartyId,
        value_addition_id: selectedVA,
        batches: Object.entries(selectedBatches).map(([batch_id, pieces_to_send]) => ({ batch_id, pieces_to_send })),
        notes: notes.trim() || null,
        gst_percent: gstPercent ? Number(gstPercent) : null,
        discount_amount: discountAmount ? Number(discountAmount) : null,
        additional_amount: additionalAmount ? Number(additionalAmount) : null,
        _vaObj: vaObj ? { id: vaObj.id, name: vaObj.name, short_code: vaObj.short_code } : null,
        _batchMap: batchMap,
        _phase: phase,
      })
      const challan = res.data?.data || res.data
      onSuccess?.()
      onClose()
      if (onPrintChallan && challan) {
        onPrintChallan(challan)
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to create batch challan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title="Send Batches for VA"
      wide
      actions={
        <>
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 typo-btn text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || selectedCount === 0}
            className="rounded-lg bg-primary-600 px-4 py-2 typo-btn text-white hover:bg-primary-700 disabled:opacity-50">
            {saving ? 'Sending...' : `Send ${totalPieces} pcs (${selectedCount} batches)`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        {/* Challan Number Preview */}
        {nextChallanNo && (
          <div className="flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
            <div className="typo-data-label uppercase tracking-wide text-amber-600">Challan No.</div>
            <div className="typo-data font-mono text-amber-900">{nextChallanNo}</div>
            <div className="typo-caption text-amber-500 ml-auto">Auto-generated</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="typo-label">VA Type <span className="text-red-500">*</span></label>
            <select data-master="value_addition" value={selectedVA} onChange={(e) => setSelectedVA(e.target.value)} className="typo-input">
              <option value="">Select value addition...</option>
              {vaList.map((va) => (
                <option key={va.id} value={va.id}>{va.name} (+{va.short_code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="typo-label">VA Party <span className="text-red-500">*</span></label>
            <select data-master="va_party" value={vaPartyId} onChange={(e) => setVaPartyId(e.target.value)} className="typo-input">
              <option value="">Select VA party...</option>
              {vaParties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.city ? ` (${p.city})` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="typo-label">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes" className="typo-input" />
        </div>

        {/* S121 — Vendor Charges (gst/disc/add). Subtotal is locked at receive
            from actual processing_cost; these three are header-level. */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <label className="typo-label-sm uppercase tracking-wide text-gray-600">Vendor Charges (Optional)</label>
            <span className="typo-caption text-gray-400">Subtotal locks at receive · taxable = subtotal − discount + additional</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="typo-caption text-gray-500">GST %</label>
              <input type="number" step="0.01" min="0" max="100" value={gstPercent}
                onChange={(e) => setGstPercent(e.target.value)} placeholder="0"
                className="typo-input-sm" />
            </div>
            <div>
              <label className="typo-caption text-gray-500">Discount ₹</label>
              <input type="number" step="0.01" min="0" value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)} placeholder="0"
                className="typo-input-sm" />
            </div>
            <div>
              <label className="typo-caption text-gray-500">Additional ₹</label>
              <input type="number" step="0.01" min="0" value={additionalAmount}
                onChange={(e) => setAdditionalAmount(e.target.value)} placeholder="0"
                className="typo-input-sm" />
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="typo-label">
              Select Batches ({eligible.length} eligible)
            </label>
            <button onClick={() => { setScanMode(m => !m); setScanStatus(null) }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium shadow-sm transition-colors ${scanMode ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-emerald-600 text-emerald-700 hover:bg-emerald-50'}`}>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              {scanMode ? 'Scanning' : 'Scan from Phone'}
            </button>
          </div>
          {scanMode && (
            <div className="flex items-center gap-2 mb-2 min-h-[20px]">
              {scanStatus ? (
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  scanStatus.type === 'added' ? 'text-emerald-600' : scanStatus.type === 'duplicate' ? 'text-amber-600' : 'text-red-500'
                }`}>
                  {scanStatus.type === 'added' && <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                  {scanStatus.type === 'duplicate' && <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                  {scanStatus.type === 'error' && <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                  {scanStatus.message}
                </span>
              ) : phoneConnected ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                  <span className="relative flex h-2 w-2"><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
                  Phone connected — scan batch QR
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                  </span>
                  Phone not connected — open Gun mode on phone
                </span>
              )}
            </div>
          )}
          {eligible.length === 0 ? (
            <p className="typo-empty">No batches in "In Progress" or "Checked" status</p>
          ) : (
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {eligible.map((b) => {
                const isSelected = !!selectedBatches[b.id]
                return (
                  <div key={b.id} className={`flex items-center gap-3 px-3 py-2 ${isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleBatch(b.id)}
                      className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <span className="typo-data font-mono">{b.batch_code}</span>
                      {b.size && <span className="ml-2 typo-badge bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{b.size}</span>}
                      <span className="ml-2 typo-caption capitalize">{b.status.replace(/_/g, ' ')}</span>
                    </div>
                    {isSelected && (
                      <div className="flex items-center gap-1.5">
                        <label className="typo-caption">Pcs:</label>
                        <input type="number" min="1" max={b.piece_count}
                          value={selectedBatches[b.id] || ''} onChange={(e) => setPieces(b.id, e.target.value)}
                          className="w-16 rounded border border-gray-300 px-2 py-1 text-xs text-center" />
                        <span className="typo-caption text-gray-400">/ {b.piece_count}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>

    {/* Shift+M Quick Master Create */}
    <QuickMasterModal type={quickMasterType} open={quickMasterOpen} onClose={closeQuickMaster} onCreated={onMasterCreated} />
    </>
  )
}
