import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { getBaseUrl } from '../api/client'

const NotificationContext = createContext(null)

const MAX_NOTIFICATIONS = 50

const EVENT_MESSAGES = {
  roll_stocked_in: (p) => `${p.roll_code || 'Roll'} stocked in (${p.weight ? p.weight + ' kg' : ''}${p.supplier ? ' from ' + p.supplier : ''})`,
  batch_claimed: (p) => `Batch ${p.batch_code} claimed`,
  batch_submitted: (p) => `Batch ${p.batch_code} submitted for QC`,
  batch_checked: (p) => `Batch ${p.batch_code} checked — ${p.approved || 0} approved, ${p.rejected || 0} rejected`,
  batch_packed: (p) => `Batch ${p.batch_code} packed`,
  lot_distributed: (p) => `Lot ${p.lot_code} distributed → ${p.batch_count} batches`,
  va_sent: (p) => `${p.type === 'garment' ? 'Garment' : 'Roll'} VA sent to ${p.vendor || 'vendor'} (${p.challan_no})`,
  va_received: (p) => p.challan_no
    ? `VA received from ${p.vendor || 'vendor'} (${p.challan_no})`
    : `VA received — ${p.roll_code || ''} ${p.va_name || ''}`,
}

const EVENT_COLORS = {
  roll_stocked_in: 'green',
  batch_claimed: 'blue',
  batch_submitted: 'blue',
  batch_checked: 'amber',
  batch_packed: 'green',
  lot_distributed: 'purple',
  va_sent: 'amber',
  va_received: 'amber',
}

const EVENT_ROUTES = {
  roll_stocked_in: '/rolls',
  batch_claimed: '/batches',
  batch_submitted: '/batches',
  batch_checked: '/batches',
  batch_packed: '/batches',
  lot_distributed: '/lots',
  va_sent: '/batches',
  va_received: '/rolls',
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const [toasts, setToasts] = useState([])
  const [lastEvent, setLastEvent] = useState(null)
  const eventSourceRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const backoffRef = useRef(1000)

  const addNotification = useCallback((event) => {
    const msgFn = EVENT_MESSAGES[event.type]
    const message = msgFn ? msgFn(event.payload || {}) : `${event.type}`
    const notification = {
      id: Date.now() + Math.random(),
      type: event.type,
      message,
      actor: event.actor || 'System',
      timestamp: event.ts || new Date().toISOString(),
      read: false,
      color: EVENT_COLORS[event.type] || 'gray',
      route: EVENT_ROUTES[event.type] || null,
    }

    setNotifications((prev) => [notification, ...prev].slice(0, MAX_NOTIFICATIONS))
    setLastEvent({ type: event.type, payload: event.payload, ts: Date.now() })

    // Add toast (auto-dismiss 5s)
    setToasts((prev) => [...prev, notification].slice(-3))
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== notification.id))
    }, 5000)
  }, [])

  const markRead = useCallback((id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  // SSE connection with automatic token refresh
  useEffect(() => {
    let stopped = false

    const decodeExp = (token) => {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        return payload.exp ? payload.exp * 1000 : Infinity
      } catch { return 0 }
    }

    // Read fresh token from localStorage, refresh if expired
    const getValidToken = async () => {
      const token = localStorage.getItem('access_token')
      if (!token) return null

      if (decodeExp(token) > Date.now()) return token

      // Token expired — try refresh
      const refreshToken = localStorage.getItem('refresh_token')
      if (!refreshToken) return null

      try {
        const baseUrl = getBaseUrl()
        const { data } = await axios.post(`${baseUrl}/auth/refresh`, {
          refresh_token: refreshToken,
        })
        const newToken = data.data?.access_token || data.access_token
        if (!newToken) return null
        localStorage.setItem('access_token', newToken)
        return newToken
      } catch {
        // Refresh failed — session is dead, clean up
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')
        return null
      }
    }

    const connect = async () => {
      if (stopped) return

      const token = await getValidToken()
      if (!token || stopped) return // logged out or session expired

      const baseUrl = getBaseUrl()
      const url = `${baseUrl}/events/stream?token=${encodeURIComponent(token)}`
      const es = new EventSource(url)
      eventSourceRef.current = es

      es.onopen = () => {
        backoffRef.current = 1000
      }

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)
          if (event.error) return
          addNotification(event)
        } catch {
          // heartbeat or malformed — ignore
        }
      }

      es.onerror = () => {
        es.close()
        eventSourceRef.current = null
        if (stopped) return
        const delay = Math.min(backoffRef.current, 30000)
        backoffRef.current = delay * 2
        reconnectTimeoutRef.current = setTimeout(connect, delay)
      }
    }

    // Only start if we have a token
    if (localStorage.getItem('access_token')) {
      connect()
    }

    return () => {
      stopped = true
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [addNotification])

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        toasts,
        unreadCount,
        lastEvent,
        addNotification,
        markRead,
        markAllRead,
        clearAll,
        dismissToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
