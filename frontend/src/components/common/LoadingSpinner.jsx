/**
 * Centered loading spinner.
 *
 * Props:
 *  size — 'sm' | 'md' | 'lg' (default 'md')
 *  text — optional loading text
 */
export default function LoadingSpinner({ size = 'md', text }) {
  const sizes = {
    sm: 'h-5 w-5 border-2',
    md: 'h-8 w-8 border-4',
    lg: 'h-12 w-12 border-4',
  }

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div
        className={`animate-spin rounded-full border-primary-600 border-t-transparent ${sizes[size]}`}
      />
      {text && <p className="mt-3 text-sm text-gray-500">{text}</p>}
    </div>
  )
}
