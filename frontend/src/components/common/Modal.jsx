import { useEffect } from 'react'

/**
 * Overlay dialog.
 *
 * Props:
 *  open      — boolean
 *  onClose   — () => void
 *  title     — header text
 *  children  — body content
 *  actions   — optional footer JSX (buttons)
 *  wide      — use wider max-width
 */
export default function Modal({ open, onClose, title, children, actions, wide = false }) {
  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div
        className={`relative z-10 w-full max-h-[90vh] flex flex-col rounded-xl bg-white shadow-xl ${
          wide ? 'max-w-2xl' : 'max-w-md'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {/* Footer */}
        {actions && (
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
