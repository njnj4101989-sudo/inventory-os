import { useEffect, useRef, useState, useCallback } from 'react'
import { getWsUrl } from '../api/client'
import { useAuth } from './useAuth'

/**
 * WebSocket scan pairing — phone ↔ desktop real-time connection.
 *
 * @param {Object} opts
 * @param {'phone'|'desktop'} opts.role — which side this client is
 * @param {boolean} opts.enabled — connect when true, disconnect when false
 * @param {(data: object) => void} [opts.onScan] — called when a scan arrives (desktop only)
 *
 * @returns {{ connected: boolean, phoneConnected: boolean, send: (data) => void }}
 */
export function useScanPair({ role, enabled, onScan }) {
  const { isAuthenticated } = useAuth()
  const [connected, setConnected] = useState(false)
  const [phoneConnected, setPhoneConnected] = useState(false)
  const wsRef = useRef(null)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan
  const backoffRef = useRef(1000)
  const reconnectRef = useRef(null)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  useEffect(() => {
    if (!enabled || !isAuthenticated) {
      // Clean up if disabled
      if (wsRef.current) {
        wsRef.current.close(1000, 'disabled')
        wsRef.current = null
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
      setConnected(false)
      setPhoneConnected(false)
      return
    }

    let stopped = false

    const connect = () => {
      if (stopped) return

      const url = `${getWsUrl()}/scan/ws/pair?role=${role}`
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        backoffRef.current = 1000
        setConnected(true)
      }

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)

          if (data.type === 'presence') {
            if ('phone' in data) setPhoneConnected(data.phone === 'connected')
          }

          if (data.type === 'scan' && onScanRef.current) {
            onScanRef.current(data)
          }
        } catch {
          // malformed message — ignore
        }
      }

      ws.onclose = (e) => {
        wsRef.current = null
        setConnected(false)
        setPhoneConnected(false)

        // Don't reconnect if intentionally stopped or auth closed us
        if (stopped || e.code === 4001 || e.code === 1000) return

        // Reconnect with backoff
        if (enabledRef.current) {
          const delay = Math.min(backoffRef.current, 15000)
          backoffRef.current = delay * 2
          reconnectRef.current = setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {
        // onclose will fire after this — reconnect handled there
      }
    }

    connect()

    return () => {
      stopped = true
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'cleanup')
        wsRef.current = null
      }
      setConnected(false)
      setPhoneConnected(false)
    }
  }, [enabled, isAuthenticated, role])

  return { connected, phoneConnected, send }
}
