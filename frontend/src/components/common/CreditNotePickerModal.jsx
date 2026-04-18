import { useState, useEffect } from 'react'

// Inline SVG icons — no extra deps, consistent with the rest of the app.
// Fast-track uses a bolt glyph; With-QC uses a clipboard-check (document inspection).
const BoltIcon = ({ className = 'h-5 w-5' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z" clipRule="evenodd" />
  </svg>
)

const ClipboardCheckIcon = ({ className = 'h-5 w-5' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path fillRule="evenodd" d="M7.502 6h7.128A3.375 3.375 0 0118 9.375v9.375a3 3 0 003-3V6.108c0-1.505-1.125-2.811-2.664-2.94a48.972 48.972 0 00-.673-.05A3 3 0 0015 1.5h-1.5a3 3 0 00-2.663 1.618c-.225.015-.45.032-.673.05C8.662 3.295 7.554 4.542 7.502 6zM13.5 3A1.5 1.5 0 0012 4.5h4.5A1.5 1.5 0 0015 3h-1.5z" clipRule="evenodd" />
    <path fillRule="evenodd" d="M3 9.375C3 8.339 3.84 7.5 4.875 7.5h9.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-9.75A1.875 1.875 0 013 20.625V9.375zm9.586 4.594a.75.75 0 00-1.172-.938l-2.476 3.096-.908-.907a.75.75 0 00-1.06 1.06l1.5 1.5a.75.75 0 001.116-.062l3-3.75z" clipRule="evenodd" />
  </svg>
)

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
          <label className={`block rounded-xl border-2 transition-all cursor-pointer group ${
            !fastTrackAvailable
              ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
              : choice === 'fast_track'
              ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-sm ring-2 ring-emerald-100'
              : 'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-sm'
          }`}>
            <div className="flex items-start gap-4 p-4">
              {/* Gradient icon tile */}
              <div className={`flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-xl transition-all ${
                !fastTrackAvailable
                  ? 'bg-gray-200 text-gray-400'
                  : choice === 'fast_track'
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 scale-105'
                  : 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow group-hover:scale-105 group-hover:shadow-emerald-500/30'
              }`}>
                <BoltIcon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
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
              <input
                type="radio"
                name="cn-workflow"
                value="fast_track"
                checked={choice === 'fast_track'}
                disabled={!fastTrackAvailable}
                onChange={() => setChoice('fast_track')}
                className="mt-1 h-4 w-4 flex-shrink-0"
              />
            </div>
          </label>

          {/* With-QC card */}
          <label className={`block rounded-xl border-2 transition-all cursor-pointer group ${
            choice === 'with_qc'
              ? 'border-amber-500 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm ring-2 ring-amber-100'
              : 'border-gray-200 hover:border-amber-300 hover:bg-amber-50/40 hover:shadow-sm'
          }`}>
            <div className="flex items-start gap-4 p-4">
              <div className={`flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-xl transition-all ${
                choice === 'with_qc'
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/30 scale-105'
                  : 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow group-hover:scale-105 group-hover:shadow-amber-500/30'
              }`}>
                <ClipboardCheckIcon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
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
              <input
                type="radio"
                name="cn-workflow"
                value="with_qc"
                checked={choice === 'with_qc'}
                onChange={() => setChoice('with_qc')}
                className="mt-1 h-4 w-4 flex-shrink-0"
              />
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
