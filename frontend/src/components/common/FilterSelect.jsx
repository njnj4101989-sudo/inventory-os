import { useState, useRef, useEffect, useCallback } from 'react'

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
export default function FilterSelect({ value, onChange, options = [], full = false, searchable = false, autoFocus = false, className = '', ...rest }) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [search, setSearch] = useState('')
  const ref = useRef(null)
  const btnRef = useRef(null)
  const listRef = useRef(null)
  const searchRef = useRef(null)
  const typeBuffer = useRef('')
  const typeTimer = useRef(null)

  const selected = options.find(o => o.value === value)

  // Filtered options for searchable mode
  const filteredOptions = searchable && search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (autoFocus && btnRef.current) {
      const t = setTimeout(() => btnRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [autoFocus])

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && highlight >= 0 && listRef.current) {
      const item = listRef.current.children[highlight]
      if (item) item.scrollIntoView({ block: 'nearest' })
    }
  }, [highlight, open])

  // Reset highlight + search when opening
  useEffect(() => {
    if (open) {
      setSearch('')
      const idx = options.findIndex(o => o.value === value)
      setHighlight(idx >= 0 ? idx : 0)
      if (searchable) setTimeout(() => searchRef.current?.focus(), 0)
    }
  }, [open])

  const closeAndRefocus = useCallback(() => {
    setOpen(false)
    setSearch('')
    if (searchable) setTimeout(() => btnRef.current?.focus(), 0)
  }, [searchable])

  const handleKey = useCallback((e) => {
    if (e.key === 'Escape') {
      closeAndRefocus()
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (open && highlight >= 0 && filteredOptions[highlight]) {
        onChange(filteredOptions[highlight].value)
        closeAndRefocus()
      } else {
        setOpen(v => !v)
      }
      return
    }

    if (e.key === ' ' && !searchable) {
      e.preventDefault()
      if (open && highlight >= 0 && filteredOptions[highlight]) {
        onChange(filteredOptions[highlight].value)
        setOpen(false)
      } else {
        setOpen(v => !v)
      }
      return
    }

    // Arrow keys
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setHighlight(h => Math.min(h + 1, filteredOptions.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setHighlight(h => Math.max(h - 1, 0))
      return
    }

    // Tab — select current and move to next field
    if (e.key === 'Tab' && open && highlight >= 0 && filteredOptions[highlight]) {
      onChange(filteredOptions[highlight].value)
      setOpen(false)
      setSearch('')
      // Refocus button so Tab moves to the next field naturally
      if (searchable) btnRef.current?.focus()
      return // let default Tab behavior proceed
    }

    // Type-ahead for non-searchable mode
    if (!searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      clearTimeout(typeTimer.current)
      typeBuffer.current += e.key.toLowerCase()
      typeTimer.current = setTimeout(() => { typeBuffer.current = '' }, 500)

      const match = options.findIndex(o =>
        o.label.toLowerCase().startsWith(typeBuffer.current)
      )
      if (match >= 0) {
        setHighlight(match)
        if (!open) {
          onChange(options[match].value)
        }
      }
    }
  }, [open, highlight, options, filteredOptions, onChange, searchable, closeAndRefocus])

  return (
    <div ref={ref} className={`relative ${className}`} {...rest}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        onKeyDown={!searchable || !open ? handleKey : undefined}
        {...(rest['data-master'] ? { 'data-master': rest['data-master'] } : {})}
        className={`inline-flex items-center justify-between gap-1.5 rounded border text-sm font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 ${
          full ? 'w-full rounded-lg px-2 py-1' : 'px-2 py-1'
        } ${
          open
            ? 'border-emerald-500 ring-1 ring-emerald-500 bg-white text-gray-800'
            : value
              ? full ? 'border-gray-300 bg-white text-gray-800' : 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
        } ${searchable && open ? 'hidden' : ''}`}
      >
        <span className="truncate">{selected?.label || '—'}</span>
        <svg className={`h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {searchable && open && (
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setHighlight(0) }}
          onKeyDown={handleKey}
          {...(rest['data-master'] ? { 'data-master': rest['data-master'] } : {})}
          placeholder={selected?.label || 'Type to search...'}
          className={`rounded border text-sm font-medium border-emerald-500 ring-1 ring-emerald-500 bg-white text-gray-800 ${
            full ? 'w-full rounded-lg px-2 py-1' : 'w-full px-2 py-1'
          }`}
        />
      )}

      {open && (
        <div ref={listRef} className="absolute left-0 top-full z-50 mt-1 min-w-full max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-0.5">
          {filteredOptions.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-gray-400">No matches</div>
          ) : filteredOptions.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); closeAndRefocus() }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-left px-2 py-1 text-sm truncate transition-colors ${
                i === highlight
                  ? 'bg-emerald-50 text-emerald-700 font-semibold'
                  : opt.value === value
                    ? 'bg-gray-50 text-gray-800 font-medium'
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
