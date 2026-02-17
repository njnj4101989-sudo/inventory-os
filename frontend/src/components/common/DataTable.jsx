import { useState, Fragment } from 'react'

/**
 * Reusable sortable data table.
 *
 * Props:
 *  columns        — [{ key, label, sortable?, render? }]
 *  data           — row array
 *  loading        — show skeleton rows
 *  onRowClick     — (row) => void
 *  emptyText      — shown when data is empty
 *  expandedRows   — Set of row IDs that are currently expanded
 *  onToggleExpand — (rowId) => void — toggle expand for a row
 *  renderExpanded — (row) => JSX — content shown in expanded sub-row
 */
export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  onRowClick,
  emptyText = 'No data found.',
  expandedRows,
  onToggleExpand,
  renderExpanded,
}) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = a[sortKey] ?? ''
        const bv = b[sortKey] ?? ''
        const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? cmp : -cmp
      })
    : data

  const hasExpand = expandedRows && onToggleExpand && renderExpanded
  const allCols = hasExpand ? [{ key: '__expand', label: '', sortable: false }, ...columns] : columns

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {allCols.map((col, ci) => (
              <th
                key={col.key + ci}
                className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 ${
                  col.sortable !== false ? 'cursor-pointer select-none hover:text-gray-700' : ''
                } ${col.key === '__expand' ? 'w-10' : ''}`}
                onClick={() => col.sortable !== false && handleSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable !== false && sortKey === col.key && (
                    <svg className="h-3 w-3" viewBox="0 0 10 10" fill="currentColor">
                      {sortDir === 'asc' ? (
                        <path d="M5 2L9 8H1L5 2Z" />
                      ) : (
                        <path d="M5 8L1 2H9L5 8Z" />
                      )}
                    </svg>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {allCols.map((col, ci) => (
                  <td key={col.key + ci} className="px-4 py-3">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
                  </td>
                ))}
              </tr>
            ))
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={allCols.length} className="px-4 py-8 text-center text-sm text-gray-400">
                {emptyText}
              </td>
            </tr>
          ) : (
            sorted.map((row, idx) => {
              const rowId = row.id || idx
              const isExpanded = hasExpand && expandedRows.has(rowId)
              return (
                <Fragment key={rowId}>
                  <tr
                    onClick={() => onRowClick?.(row)}
                    className={`transition-colors ${
                      onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''
                    } ${isExpanded ? 'bg-purple-50/40' : ''}`}
                  >
                    {hasExpand && (
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleExpand(rowId) }}
                          className="inline-flex items-center justify-center h-6 w-6 rounded-full hover:bg-gray-200 transition-colors text-gray-400 hover:text-gray-600"
                        >
                          <svg className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                        {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                  {isExpanded && (
                    <tr key={rowId + '-expanded'} className="bg-purple-50/30">
                      <td colSpan={allCols.length} className="px-0 py-0">
                        {renderExpanded(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
