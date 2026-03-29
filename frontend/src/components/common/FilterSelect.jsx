import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * Custom styled filter dropdown — replaces native <select> for filter bars.
 *
 * Props:
 *  value     — current selected value (string)
 *  onChange  — (value: string) => void
 *  options   — [{ value: string, label: string }]
 *  full      — full-width form mode (default false = compact filter mode)
 *  searchable — show search input instead of button (type to filter)
 *  autoFocus — focus on mount
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

  // Filtered options — searchable only shows results when typing
  const filteredOptions = searchable
    ? search
      ? options.filter(o => o.value && o.label.toLowerCase().includes(search.toLowerCase()))
      : []
    : options

  // Click outside → close
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // autoFocus
  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => {
        if (searchable) searchRef.current?.focus()
        else btnRef.current?.focus()
      }, 100)
      return () => clearTimeout(t)
    }
  }, [autoFocus, searchable])

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && highlight >= 0 && listRef.current) {
      const item = listRef.current.children[highlight]
      if (item) item.scrollIntoView({ block: 'nearest' })
    }
  }, [highlight, open])

  // Reset highlight when opening (non-searchable)
  useEffect(() => {
    if (open && !searchable) {
      const idx = options.findIndex(o => o.value === value)
      setHighlight(idx >= 0 ? idx : 0)
    }
  }, [open])

  const selectOption = useCallback((val) => {
    onChange(val)
    setOpen(false)
    setSearch('')
    // For searchable, return focus to search input; for non-searchable, button
    if (searchable) setTimeout(() => searchRef.current?.focus(), 0)
  }, [onChange, searchable])

  const handleSearchKey = useCallback((e) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setSearch('')
      searchRef.current?.blur()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (open && highlight >= 0 && filteredOptions[highlight]) {
        selectOption(filteredOptions[highlight].value)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open && search) setOpen(true)
      setHighlight(h => Math.min(h + 1, filteredOptions.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
      return
    }
    if (e.key === 'Tab' && open && highlight >= 0 && filteredOptions[highlight]) {
      selectOption(filteredOptions[highlight].value)
      return
    }
  }, [open, highlight, filteredOptions, selectOption])

  const handleBtnKey = useCallback((e) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (open && highlight >= 0 && filteredOptions[highlight]) {
        onChange(filteredOptions[highlight].value)
        setOpen(false)
      } else {
        setOpen(v => !v)
      }
      return
    }
    if (e.key === ' ') {
      e.preventDefault()
      if (open && highlight >= 0 && filteredOptions[highlight]) {
        onChange(filteredOptions[highlight].value)
        setOpen(false)
      } else {
        setOpen(v => !v)
      }
      return
    }
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
    if (e.key === 'Tab' && open && highlight >= 0 && filteredOptions[highlight]) {
      onChange(filteredOptions[highlight].value)
      setOpen(false)
      return
    }
    // Type-ahead
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      clearTimeout(typeTimer.current)
      typeBuffer.current += e.key.toLowerCase()
      typeTimer.current = setTimeout(() => { typeBuffer.current = '' }, 500)
      const match = options.findIndex(o => o.label.toLowerCase().startsWith(typeBuffer.current))
      if (match >= 0) {
        setHighlight(match)
        if (!open) onChange(options[match].value)
      }
    }
  }, [open, highlight, options, filteredOptions, onChange])

  // ─── Searchable: always show input ───
  if (searchable) {
    return (
      <div ref={ref} className={`relative ${className}`} {...rest}>
        <input
          ref={searchRef}
          type="text"
          value={open ? search : (selected?.label && selected.value ? selected.label : '')}
          onChange={e => { setSearch(e.target.value); setHighlight(0); if (!open) setOpen(true) }}
          onFocus={() => { setSearch(''); setOpen(true) }}
          onKeyDown={handleSearchKey}
          {...(rest['data-master'] ? { 'data-master': rest['data-master'] } : {})}
          placeholder={selected?.label || 'Type to search...'}
          className={`rounded border text-sm font-medium bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 ${
            full ? 'w-full rounded-lg px-2 py-1' : 'w-full px-2 py-1'
          } ${open ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-gray-300'}`}
        />
        {open && search && (
          <div ref={listRef} className="absolute left-0 top-full z-50 mt-1 min-w-full max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-0.5">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-gray-400">No matches</div>
            ) : filteredOptions.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => selectOption(opt.value)}
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

  // ─── Non-searchable: button + dropdown ───
  return (
    <div ref={ref} className={`relative ${className}`} {...rest}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        onKeyDown={handleBtnKey}
        {...(rest['data-master'] ? { 'data-master': rest['data-master'] } : {})}
        className={`inline-flex items-center justify-between gap-1.5 rounded border text-sm font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 ${
          full ? 'w-full rounded-lg px-2 py-1' : 'px-2 py-1'
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
        <div ref={listRef} className="absolute left-0 top-full z-50 mt-1 min-w-full max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-0.5">
          {filteredOptions.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-gray-400">No matches</div>
          ) : filteredOptions.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
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
