import { useState, useRef, useEffect } from 'react'

/**
 * Custom styled filter dropdown — replaces native <select> for filter bars.
 *
 * Props:
 *  value     — current selected value (string)
 *  onChange  — (value: string) => void
 *  options   — [{ value: string, label: string }]
 *  full      — full-width form mode (default false = compact filter mode)
 *  className — optional extra classes on the wrapper
 */
export default function FilterSelect({ value, onChange, options = [], full = false, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleKey = (e) => {
    if (e.key === 'Escape') setOpen(false)
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen(v => !v)
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        onKeyDown={handleKey}
        className={`inline-flex items-center justify-between gap-1.5 rounded border text-sm font-medium transition-colors ${
          full ? 'w-full rounded-lg px-3 py-2' : 'px-2 py-1'
        } ${
          open
            ? 'border-emerald-500 ring-1 ring-emerald-500 bg-white text-gray-800'
            : value
              ? full ? 'border-gray-300 bg-white text-gray-800' : 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
        }`}
      >
        <span className="truncate">{selected?.label || '—'}</span>
        <svg className={`h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-full max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full text-left px-2.5 py-1.5 text-sm truncate transition-colors ${
                opt.value === value
                  ? 'bg-emerald-50 text-emerald-700 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
