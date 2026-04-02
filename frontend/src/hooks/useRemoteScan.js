import { useEffect, useRef } from 'react'
import { useNotifications } from '../context/NotificationContext'
import { useAuth } from './useAuth'

/**
 * Listen for remote_scan SSE events from the same user (phone → desktop).
 * Calls `onScan({ code, entity_type, entity_data })` when a matching scan arrives.
 *
 * Usage in OrdersPage, ChallansPage, ReturnsPage:
 *   useRemoteScan((scan) => { addItemToForm(scan) })
 */
export function useRemoteScan(onScan) {
  const { lastEvent } = useNotifications()
  const { user } = useAuth()
  const callbackRef = useRef(onScan)
  callbackRef.current = onScan

  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'remote_scan') return
    if (!lastEvent.payload) return
    // Only act on scans from the same user (phone → desktop)
    if (lastEvent.actor_id && user?.id && lastEvent.actor_id !== String(user.id)) return

    callbackRef.current(lastEvent.payload)
  }, [lastEvent, user?.id])
}
