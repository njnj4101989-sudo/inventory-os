import { useState, useContext, useMemo } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { AuthContext } from '../../context/AuthContext'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const { fy, permissions } = useContext(AuthContext)
  const navigate = useNavigate()

  const fyExpired = useMemo(() => {
    if (!fy?.end_date) return false
    const endDate = new Date(fy.end_date + 'T23:59:59')
    return new Date() > endDate
  }, [fy?.end_date])

  const isAdmin = permissions?.user_manage

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      {/* Main content area — shifts based on sidebar width */}
      <div
        className={`transition-all duration-300 ${
          collapsed ? 'ml-16' : 'ml-60'
        }`}
      >
        <Header />

        {fyExpired && (
          <div className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 lg:mx-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-amber-600 text-lg leading-none">&#9888;</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">
                  Financial Year {fy?.code} ended on {fy?.end_date}
                </p>
                <p className="mt-0.5 text-sm text-amber-700">
                  Please close the current year and start a new financial year from Settings to reset serial numbers and carry forward balances.
                </p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => navigate('/settings')}
                  className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
                >
                  Go to Settings
                </button>
              )}
            </div>
          </div>
        )}

        <main className="px-4 py-3 lg:px-5 lg:py-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
