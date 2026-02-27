import { useState, useEffect, useCallback } from 'react'
import { useOnlineStatus } from './useOnlineStatus'

const QUEUE_KEY = 'offline_action_queue'

function loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

/**
 * Offline action queue — enqueue actions when offline, auto-sync when reconnected.
 *
 * Each action: { id, type, payload, timestamp }
 * Executor: async function that receives (type, payload) and calls the real API.
 *
 * Conflict resolution:
 *   400/409 → drop action (batch already transitioned)
 *   500/network → keep in queue for retry
 */
export function useOfflineQueue(executor) {
  const isOnline = useOnlineStatus()
  const [queue, setQueue] = useState(loadQueue)
  const [syncing, setSyncing] = useState(false)

  // Persist queue to localStorage
  useEffect(() => {
    saveQueue(queue)
  }, [queue])

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && queue.length > 0 && !syncing) {
      syncQueue()
    }
  }, [isOnline])

  const enqueue = useCallback((type, payload) => {
    const action = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type,
      payload,
      timestamp: new Date().toISOString(),
    }
    setQueue((prev) => [...prev, action])
    return action.id
  }, [])

  const syncQueue = useCallback(async () => {
    if (syncing) return
    setSyncing(true)

    const currentQueue = loadQueue()
    const remaining = []

    for (const action of currentQueue) {
      try {
        await executor(action.type, action.payload)
        // Success — action processed, don't keep
      } catch (err) {
        const status = err?.response?.status
        if (status === 400 || status === 409) {
          // Conflict/bad request — batch already transitioned, drop it
          continue
        }
        // 500 or network error — keep for retry
        remaining.push(action)
      }
    }

    setQueue(remaining)
    saveQueue(remaining)
    setSyncing(false)
  }, [executor, syncing])

  const clearQueue = useCallback(() => {
    setQueue([])
    saveQueue([])
  }, [])

  return {
    queue,
    pendingCount: queue.length,
    enqueue,
    syncQueue,
    clearQueue,
    syncing,
    isOnline,
  }
}
