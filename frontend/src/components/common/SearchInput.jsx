import { useState, useEffect, useRef } from 'react'

/**
 * Debounced search input with clear button.
 *
 * Props:
 *  value      — controlled value
 *  onChange   — (debouncedValue) => void
 *  placeholder
 *  delay      — debounce ms (default 300)
 */
export default function SearchInput({
  value = '',
  onChange,
  placeholder = 'Search...',
  delay = 300,
}) {
  const [local, setLocal] = useState(value)
  const timerRef = useRef(null)

  // Sync external value changes
  useEffect(() => {
    setLocal(value)
  }, [value])

  const handleChange = (e) => {
    const val = e.target.value
    setLocal(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onChange?.(val), delay)
  }

  const handleClear = () => {
    setLocal('')
    clearTimeout(timerRef.current)
    onChange?.('')
  }

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  return (
    <div className="relative">
      {/* Search icon */}
      <svg
        className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>

      <input
        type="text"
        value={local}
        onChange={handleChange}
        placeholder={placeholder}
        className="typo-input-sm pl-8 pr-8"
      />

      {/* Clear button */}
      {local && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
