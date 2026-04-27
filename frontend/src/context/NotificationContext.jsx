import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { getBaseUrl } from '../api/client'
import { useAuth } from '../hooks/useAuth'

const NotificationContext = createContext(null)

const MAX_NOTIFICATIONS = 50

// Map every backend event_type to (a) a friendly message, (b) a colour for
// the toast/bell pill, and (c) a deep-link route. Anything missing here
// falls through to raw event_type text on the toast — keep the three maps
// in sync. Source of truth for events: `grep -rn "event_bus.emit" backend/app`.
const EVENT_MESSAGES = {
  // Rolls — single + bulk + opening stock + VA
  roll_stocked_in: (p) => `${p.roll_code || 'Roll'} stocked in${p.weight ? ` (${p.weight} kg)` : ''}${p.supplier ? ` from ${p.supplier}` : ''}`,
  bulk_stock_in: (p) => `${p.count || 0} roll${p.count === 1 ? '' : 's'} stocked in${p.supplier_invoice_no ? ` · invoice ${p.supplier_invoice_no}` : ''}${p.sr_no ? ` · sr ${p.sr_no}` : ''}`,
  rolls_opening_stock: (p) => {
    const parts = []
    if (p.in_stock) parts.push(`${p.in_stock} in godown`)
    if (p.at_va) parts.push(`${p.at_va} at VA`)
    return `${p.count || 0} opening-stock roll${p.count === 1 ? '' : 's'} added${parts.length ? ` (${parts.join(' · ')})` : ''}`
  },
  va_sent: (p) => `${p.type === 'garment' ? 'Garment' : 'Roll'} VA sent to ${p.vendor || 'vendor'}${p.challan_no ? ` (${p.challan_no})` : ''}`,
  va_received: (p) => p.challan_no
    ? `VA received from ${p.vendor || 'vendor'} (${p.challan_no})`
    : `VA received — ${p.roll_code || ''} ${p.va_name || ''}`.trim(),
  va_cancelled: (p) => `${p.type === 'garment' ? 'Garment' : 'Roll'} VA cancelled${p.challan_no ? ` (${p.challan_no})` : ''}${p.vendor ? ` · ${p.vendor}` : ''}`,

  // Lots
  lot_distributed: (p) => `Lot ${p.lot_code} distributed → ${p.batch_count} batches`,

  // Batches
  batch_claimed: (p) => `Batch ${p.batch_code} claimed`,
  batch_unclaimed: (p) => `Batch ${p.batch_code} unclaimed`,
  batch_submitted: (p) => `Batch ${p.batch_code} submitted for QC`,
  batch_checked: (p) => `Batch ${p.batch_code} checked — ${p.approved || 0} approved, ${p.rejected || 0} rejected`,
  batch_packed: (p) => `Batch ${p.batch_code} packed`,

  // Purchase Returns (return notes — supplier-side)
  return_created: (p) => `Return Note ${p.return_note_no || ''} created${p.supplier ? ` · ${p.supplier}` : ''}`,
  return_approved: (p) => `Return Note ${p.return_note_no || ''} approved`,
  return_dispatched: (p) => `Return Note ${p.return_note_no || ''} dispatched${p.supplier ? ` to ${p.supplier}` : ''}`,
  return_acknowledged: (p) => `Return Note ${p.return_note_no || ''} acknowledged${p.supplier ? ` by ${p.supplier}` : ''}`,
  return_closed: (p) => `Return Note ${p.return_note_no || ''} closed`,
  return_cancelled: (p) => `Return Note ${p.return_note_no || ''} cancelled`,

  // Sales Returns (customer-side)
  sales_return_created: (p) => `Sales Return ${p.srn_no || ''} created${p.customer ? ` · ${p.customer}` : ''}`,
  sales_return_received: (p) => `Sales Return ${p.srn_no || ''} received${p.customer ? ` from ${p.customer}` : ''}`,
  sales_return_inspected: (p) => `Sales Return ${p.srn_no || ''} inspected`,
  sales_return_restocked: (p) => `Sales Return ${p.srn_no || ''} restocked`,
  sales_return_closed: (p) => `Sales Return ${p.srn_no || ''} closed`,
  sales_return_cancelled: (p) => `Sales Return ${p.srn_no || ''} cancelled`,
}

const EVENT_COLORS = {
  // green = successful inbound / completion
  roll_stocked_in: 'green',
  bulk_stock_in: 'green',
  rolls_opening_stock: 'green',
  batch_packed: 'green',
  return_closed: 'green',
  return_approved: 'green',
  sales_return_restocked: 'green',
  sales_return_closed: 'green',
  // blue = state transition / handover
  batch_claimed: 'blue',
  batch_submitted: 'blue',
  return_created: 'blue',
  return_dispatched: 'blue',
  return_acknowledged: 'blue',
  sales_return_created: 'blue',
  sales_return_received: 'blue',
  sales_return_inspected: 'blue',
  // amber = QC / warning / outbound to VA / cancel
  batch_checked: 'amber',
  batch_unclaimed: 'amber',
  va_sent: 'amber',
  va_received: 'amber',
  va_cancelled: 'amber',
  return_cancelled: 'amber',
  sales_return_cancelled: 'amber',
  // purple = lot
  lot_distributed: 'purple',
}

const EVENT_ROUTES = {
  // Rolls land on /rolls (default tab is "All Rolls"; opening-stock + bulk also belong here)
  roll_stocked_in: '/rolls',
  bulk_stock_in: '/rolls?tab=purchases',
  rolls_opening_stock: '/rolls',
  // VA lifecycle
  va_sent: '/challans',
  va_received: '/rolls',
  va_cancelled: '/challans',
  // Lots / Batches
  lot_distributed: '/lots',
  batch_claimed: '/batches',
  batch_unclaimed: '/batches',
  batch_submitted: '/batches',
  batch_checked: '/batches',
  batch_packed: '/batches',
  // Returns (purchase + sales)
  return_created: '/returns?tab=purchase',
  return_approved: '/returns?tab=purchase',
  return_dispatched: '/returns?tab=purchase',
  return_acknowledged: '/returns?tab=purchase',
  return_closed: '/returns?tab=purchase',
  return_cancelled: '/returns?tab=purchase',
  sales_return_created: '/returns?tab=sales',
  sales_return_received: '/returns?tab=sales',
  sales_return_inspected: '/returns?tab=sales',
  sales_return_restocked: '/returns?tab=sales',
  sales_return_closed: '/returns?tab=sales',
  sales_return_cancelled: '/returns?tab=sales',
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const [toasts, setToasts] = useState([])
  const [lastEvent, setLastEvent] = useState(null)
  const eventSourceRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const backoffRef = useRef(1000)
  const { isAuthenticated } = useAuth()

  const addNotification = useCallback((event) => {
    const msgFn = EVENT_MESSAGES[event.type]
    // Fallback: humanize unknown snake_case event_type so we never show
    // raw "bulk_stock_in" text again. Real fix is to add the event to the
    // EVENT_MESSAGES map above; this just keeps the UX presentable.
    const humanized = String(event.type || 'event')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
    const message = msgFn ? msgFn(event.payload || {}) : humanized
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
    setLastEvent({ type: event.type, payload: event.payload, actor_id: event.actor_id, ts: Date.now() })

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

  // SSE connection — cookies auto-sent by browser (no token query param)
  useEffect(() => {
    if (!isAuthenticated) return

    let stopped = false

    const connect = () => {
      if (stopped) return

      const baseUrl = getBaseUrl()
      const url = `${baseUrl}/events/stream`
      const es = new EventSource(url, { withCredentials: true })
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

    connect()

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
  }, [isAuthenticated, addNotification])

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
