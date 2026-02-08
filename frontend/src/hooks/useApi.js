import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Generic data-fetching hook.
 *
 * @param {Function} apiFn  — API function that returns axios-shaped response
 * @param {any[]}    deps   — dependency array to trigger refetch
 * @param {object}   opts   — { immediate: true } to fetch on mount
 *
 * Returns { data, loading, error, refetch }
 *
 * Usage:
 *   const { data, loading, error, refetch } = useApi(() => getUsers({ page: 1 }), [page])
 *   const { data, refetch } = useApi(() => createUser(body), [], { immediate: false })
 */
export function useApi(apiFn, deps = [], opts = {}) {
  const { immediate = true } = opts

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(immediate)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const execute = useCallback(async (...args) => {
    setLoading(true)
    setError(null)
    try {
      const fn = args.length > 0 ? () => apiFn(...args) : apiFn
      const response = await fn()
      if (!mountedRef.current) return null
      const result = response.data?.data ?? response.data
      setData(result)
      return result
    } catch (err) {
      if (!mountedRef.current) return null
      const message =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        err.message ||
        'An error occurred'
      setError(message)
      throw err
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (immediate) execute()
  }, [execute, immediate])

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  return { data, loading, error, refetch: execute }
}
