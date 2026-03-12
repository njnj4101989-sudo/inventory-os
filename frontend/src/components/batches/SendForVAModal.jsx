import { useState, useEffect, useCallback } from 'react'
import Modal from '../common/Modal'
import ErrorAlert from '../common/ErrorAlert'
import QuickMasterModal from '../common/QuickMasterModal'
import useQuickMaster from '../../hooks/useQuickMaster'
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

  useEffect(() => {
    if (open) {
      refreshVAList()
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
        _vaObj: vaObj ? { id: vaObj.id, name: vaObj.name, short_code: vaObj.short_code } : null,
        _batchMap: batchMap,
        _phase: phase,
      })
      const challan = res.data?.data || res.data
      onSuccess?.()
      onClose()
      if (onPrintChallan && challan) {
        onPrintChallan({
          challanNo: challan.challan_no,
          batchItems: challan.batch_items || [],
          vaName: vaObj?.name || '—',
          vaShortCode: vaObj?.short_code || '—',
          vaPartyName: vaParties.find(p => p.id === vaPartyId)?.name || '—',
          sentDate: challan.sent_date || new Date().toISOString(),
          notes: challan.notes || null,
        })
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to create batch challan')
    } finally {
      setSaving(false)
    }
  }

  const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title="Send Batches for VA"
      wide
      actions={
        <>
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || selectedCount === 0}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
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
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Challan No.</div>
            <div className="font-mono font-bold text-amber-900 text-sm">{nextChallanNo}</div>
            <div className="text-[10px] text-amber-500 ml-auto">Auto-generated</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">VA Type <span className="text-red-500">*</span></label>
            <select data-master="value_addition" value={selectedVA} onChange={(e) => setSelectedVA(e.target.value)} className={INPUT}>
              <option value="">Select value addition...</option>
              {vaList.map((va) => (
                <option key={va.id} value={va.id}>{va.name} (+{va.short_code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">VA Party <span className="text-red-500">*</span></label>
            <select data-master="va_party" value={vaPartyId} onChange={(e) => setVaPartyId(e.target.value)} className={INPUT}>
              <option value="">Select VA party...</option>
              {vaParties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.city ? ` (${p.city})` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes" className={INPUT} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Batches ({eligible.length} eligible)
          </label>
          {eligible.length === 0 ? (
            <p className="text-sm text-gray-400">No batches in "In Progress" or "Checked" status</p>
          ) : (
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {eligible.map((b) => {
                const isSelected = !!selectedBatches[b.id]
                return (
                  <div key={b.id} className={`flex items-center gap-3 px-3 py-2 ${isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleBatch(b.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-mono font-semibold text-gray-800">{b.batch_code}</span>
                      {b.size && <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">{b.size}</span>}
                      <span className="ml-2 text-xs text-gray-500 capitalize">{b.status.replace(/_/g, ' ')}</span>
                    </div>
                    {isSelected && (
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-gray-500">Pcs:</label>
                        <input type="number" min="1" max={b.piece_count}
                          value={selectedBatches[b.id] || ''} onChange={(e) => setPieces(b.id, e.target.value)}
                          className="w-16 rounded border border-gray-300 px-2 py-1 text-xs text-center" />
                        <span className="text-xs text-gray-400">/ {b.piece_count}</span>
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
