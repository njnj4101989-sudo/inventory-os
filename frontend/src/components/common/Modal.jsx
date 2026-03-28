import { useEffect, useRef } from 'react'

/**
 * Overlay dialog.
 */
export default function Modal({ open, onClose, title, children, actions, wide = false, extraWide = false }) {
  const bodyRef = useRef(null)
  const overlayRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key !== 'Escape') return
      // Only handle ESC if focus is inside THIS modal (innermost wins)
      if (!overlayRef.current?.contains(document.activeElement)) return
      e.stopImmediatePropagation()
      e.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [open, onClose])

  // Auto-focus first input/select/textarea on open
  useEffect(() => {
    if (!open || !bodyRef.current) return
    const timer = setTimeout(() => {
      const el = bodyRef.current.querySelector('input:not([type="hidden"]):not([type="checkbox"]), select, textarea')
      if (el) el.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [open])

  if (!open) return null

  const maxW = extraWide ? 'max-w-6xl' : wide ? 'max-w-2xl' : 'max-w-md'

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50" style={{ overflowY: 'auto' }}>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      {/* Centering wrapper — min-h so it centers when small, scrolls when big */}
      <div style={{ display: 'flex', minHeight: '100%', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className={`relative z-10 w-full ${maxW} flex flex-col rounded-xl bg-white shadow-xl`}>
          {/* Header — hidden when title is falsy (allows custom header in body) */}
          {title ? (
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-2 shrink-0">
              <h3 className="typo-modal-title">{title}</h3>
              <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : null}

          {/* Body */}
          <div ref={bodyRef} className={`px-6 ${title ? 'py-4' : 'py-0'}`}>{children}</div>

          {/* Footer */}
          {actions && (
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 shrink-0">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
