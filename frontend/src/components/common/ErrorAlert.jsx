/**
 * Red error banner with dismiss button.
 *
 * Props:
 *  message   — error text
 *  onDismiss — () => void (optional, shows X button if provided)
 */
export default function ErrorAlert({ message, onDismiss }) {
  if (!message) return null

  return (
    <div className="flex items-start gap-3 rounded-lg bg-red-50 px-4 py-3">
      <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="flex-1 text-sm text-red-700">{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 rounded p-0.5 text-red-400 hover:text-red-600"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
