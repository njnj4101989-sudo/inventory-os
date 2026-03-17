import { useOnlineStatus } from '../../hooks/useOnlineStatus'

export default function OfflineBanner() {
  const isOnline = useOnlineStatus()

  if (isOnline) return null

  return (
    <div className="bg-amber-500 text-white typo-btn-sm text-center py-1.5 px-4">
      You are offline — actions will sync when reconnected
    </div>
  )
}
