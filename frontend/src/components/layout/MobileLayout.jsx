import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import OfflineBanner from '../common/OfflineBanner'
import InstallBanner from '../common/InstallBanner'
import { useAuth } from '../../hooks/useAuth'
import NotificationBell from '../common/NotificationBell'

export default function MobileLayout() {
  const { user, role } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Compact header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <span className="typo-data text-gray-900">Inventory-OS</span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <span className="typo-caption font-medium">
            {user?.full_name}
          </span>
        </div>
      </header>

      <InstallBanner />
      <OfflineBanner />

      {/* Page content */}
      <main className="pb-20">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <BottomNav role={role} />
    </div>
  )
}
