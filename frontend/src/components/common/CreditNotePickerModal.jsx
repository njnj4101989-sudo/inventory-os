import { useState, useEffect } from 'react'

/**
 * CreditNotePickerModal — choose between Fast-track and Full-QC workflow
 * before landing in the Credit Note form.
 *
 * Industry pattern: NetSuite RMA / SAP Return Authorization. One entry
 * point, one label ("Create Credit Note"), workflow picked inside.
 *
 * Usage:
 *   <CreditNotePickerModal
 *     open={pickerOpen}
 *     onClose={() => setPickerOpen(false)}
 *     onPick={(workflow) => {
 *       if (workflow === 'fast_track') openFastTrackCNForm()
 *       else navigate(`/returns?tab=sales&create=true&invoice_id=${id}`)
 *     }}
 *     fastTrackAvailable={true}   // disable fast-track if no invoice in context
 *     fastTrackDisabledReason="Order has no invoice yet"
 *   />
 */
export default function CreditNotePickerModal({
  open,
  onClose,
  onPick,
  title = 'Create Credit Note',
  subtitle,
  fastTrackAvailable = true,
  fastTrackDisabledReason = null,
}) {
  // Default selection: fast-track if available, else with_qc
  const [choice, setChoice] = useState(fastTrackAvailable ? 'fast_track' : 'with_qc')

  useEffect(() => {
    if (open) setChoice(fastTrackAvailable ? 'fast_track' : 'with_qc')
  }, [open, fastTrackAvailable])

  if (!open) return null

  const handleContinue = () => {
    onPick?.(choice)
  }

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4">
        <div className="px-6 py-4 border-b">
          <h3 className="typo-modal-title text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>

        <div className="p-6 space-y-3">
          <p className="typo-label text-gray-700">How will the goods be handled?</p>

          {/* Fast-track card */}
          <label className={`block rounded-lg border-2 transition-all cursor-pointer ${
            !fastTrackAvailable
              ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
              : choice === 'fast_track'
              ? 'border-emerald-500 bg-emerald-50 shadow-sm'
              : 'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/40'
          }`}>
            <div className="flex items-start gap-3 p-4">
              <input
                type="radio"
                name="cn-workflow"
                value="fast_track"
                checked={choice === 'fast_track'}
                disabled={!fastTrackAvailable}
                onChange={() => setChoice('fast_track')}
                className="mt-1 h-4 w-4"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none">⚡</span>
                  <span className="typo-data text-gray-900">Fast-track</span>
                  <span className="typo-badge bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">1-click</span>
                </div>
                <p className="typo-caption mt-1 text-gray-600 leading-snug">
                  Financial adjustment, or goods already handled. Closes immediately with
                  a <strong>CN-XXXX</strong> number and credits the customer's ledger.
                </p>
                {!fastTrackAvailable && fastTrackDisabledReason && (
                  <p className="typo-caption mt-1 text-amber-700 font-medium">{fastTrackDisabledReason}</p>
                )}
              </div>
            </div>
          </label>

          {/* With-QC card */}
          <label className={`block rounded-lg border-2 transition-all cursor-pointer ${
            choice === 'with_qc'
              ? 'border-amber-500 bg-amber-50 shadow-sm'
              : 'border-gray-200 hover:border-amber-300 hover:bg-amber-50/40'
          }`}>
            <div className="flex items-start gap-3 p-4">
              <input
                type="radio"
                name="cn-workflow"
                value="with_qc"
                checked={choice === 'with_qc'}
                onChange={() => setChoice('with_qc')}
                className="mt-1 h-4 w-4"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none">🔍</span>
                  <span className="typo-data text-gray-900">With physical inspection</span>
                  <span className="typo-badge bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">5-step</span>
                </div>
                <p className="typo-caption mt-1 text-gray-600 leading-snug">
                  Goods coming back over time. QC per item, damage tracking, partial restock.
                  Ends with a <strong>CN-XXXX</strong> after inspection closes.
                </p>
                <p className="typo-caption mt-1 text-gray-500">
                  Flow: draft → received → inspected → restocked → closed
                </p>
              </div>
            </div>
          </label>
        </div>

        <div className="px-6 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose}
            className="rounded border border-gray-300 px-4 py-1.5 typo-btn-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleContinue}
            className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700">
            Continue →
          </button>
        </div>
      </div>
    </div>
  )
}
