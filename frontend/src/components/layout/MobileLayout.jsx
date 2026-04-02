import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import OfflineBanner from '../common/OfflineBanner'
import InstallBanner from '../common/InstallBanner'
import { useAuth } from '../../hooks/useAuth'
import NotificationBell from '../common/NotificationBell'

const ADMIN_ROLES = ['admin', 'supervisor', 'billing']

export default function MobileLayout() {
  const { user, role, company, fy } = useAuth()
  const isAdminSide = ADMIN_ROLES.includes(role)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Compact header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-sm">
            <span className="text-[9px] font-black text-white tracking-tighter">IO</span>
          </div>
          <div className="flex flex-col">
            <span className="typo-data text-gray-900 leading-tight">
              {isAdminSide && company ? company.name : 'Inventory-OS'}
            </span>
            {isAdminSide && fy && (
              <span className="typo-caption text-emerald-600 leading-tight">{fy.code}</span>
            )}
          </div>
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
