import { useState, useEffect } from 'react'

const STORAGE_KEY = 'scan_activity_log'

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

function getLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const all = JSON.parse(raw)
    return all.filter((e) => e.date === getToday())
  } catch {
    return []
  }
}

export default function ActivityPage() {
  const [entries, setEntries] = useState(getLog)

  useEffect(() => {
    const handler = () => setEntries(getLog())
    window.addEventListener('scan_activity_updated', handler)
    return () => window.removeEventListener('scan_activity_updated', handler)
  }, [])

  return (
    <div className="px-4 py-4">
      <h1 className="typo-page-title mb-4">Scan Activity</h1>

      {entries.length === 0 ? (
        <div className="rounded-xl bg-white border border-gray-200 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="typo-body text-gray-500">No scans today</p>
          <p className="typo-caption mt-1">Scans from Gun mode will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <div key={i} className="rounded-xl bg-white border border-gray-200 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="typo-data font-semibold">{entry.code}</p>
                <p className="typo-caption">{entry.type} &middot; {entry.time}</p>
              </div>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                entry.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}>
                {entry.status === 'sent' ? 'Sent' : 'Failed'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
