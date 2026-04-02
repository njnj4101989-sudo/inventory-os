/**
 * Shared color lookup — uses Color master (hex_code) with hash fallback.
 * Call loadColorMap() once at app/page init; colorHex() works synchronously after.
 */
import { getAllColors } from '../api/masters'

let _map = null // { lowercase_name → hex }
let _promise = null

/** Fetch color master once and cache. Safe to call multiple times. */
export function loadColorMap() {
  if (_map) return Promise.resolve(_map)
  if (_promise) return _promise
  _promise = getAllColors()
    .then(res => {
      const list = res.data?.data || res.data || []
      _map = {}
      for (const c of list) {
        if (c.hex_code) {
          _map[c.name.toLowerCase()] = c.hex_code
        }
      }
      return _map
    })
    .catch(() => {
      _map = {}
      return _map
    })
  return _promise
}

/** Resolve color name → hex. Uses master map, then hash fallback. */
export function colorHex(name) {
  if (!name) return '#9ca3af'
  const lower = name.toLowerCase()

  // Exact match from master
  if (_map?.[lower]) return _map[lower]

  // Normalize — strip spaces/dots/hyphens for fuzzy match
  const norm = lower.replace(/[\s.\-_]/g, '')
  if (_map) {
    for (const [key, hex] of Object.entries(_map)) {
      const normKey = key.replace(/[\s.\-_]/g, '')
      if (norm === normKey) return hex
      if (norm.includes(normKey) || normKey.includes(norm)) return hex
    }
  }

  // Hash fallback for unmapped colors
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 55%, 55%)`
}
