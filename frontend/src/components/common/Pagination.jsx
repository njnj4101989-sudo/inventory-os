/**
 * Page controls: prev/next + page numbers.
 *
 * Props:
 *  page     — current page (1-based)
 *  pages    — total pages
 *  total    — total items (displayed as info)
 *  onChange — (newPage) => void
 */
export default function Pagination({ page = 1, pages = 1, total, onChange }) {
  if (pages <= 1) return null

  // Build visible page numbers (show max 5 around current)
  const getRange = () => {
    const range = []
    let start = Math.max(1, page - 2)
    let end = Math.min(pages, start + 4)
    start = Math.max(1, end - 4)
    for (let i = start; i <= end; i++) range.push(i)
    return range
  }

  const pageNums = getRange()

  return (
    <div className="flex items-center justify-between py-3">
      {/* Info */}
      <span className="typo-caption">
        Page {page} of {pages}
        {total !== undefined && ` (${total} items)`}
      </span>

      {/* Controls */}
      <div className="flex items-center gap-1">
        {/* Prev */}
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="rounded-lg border border-gray-300 px-3 py-1.5 typo-btn-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Prev
        </button>

        {/* Page numbers */}
        {pageNums[0] > 1 && (
          <>
            <button onClick={() => onChange(1)} className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">1</button>
            {pageNums[0] > 2 && <span className="px-1 text-gray-400">...</span>}
          </>
        )}
        {pageNums.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`rounded-lg px-3 py-1.5 typo-btn-sm ${
              p === page
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {p}
          </button>
        ))}
        {pageNums[pageNums.length - 1] < pages && (
          <>
            {pageNums[pageNums.length - 1] < pages - 1 && <span className="px-1 text-gray-400">...</span>}
            <button onClick={() => onChange(pages)} className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">{pages}</button>
          </>
        )}

        {/* Next */}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          className="rounded-lg border border-gray-300 px-3 py-1.5 typo-btn-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  )
}
