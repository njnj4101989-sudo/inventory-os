import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const NAV_ITEMS = [
  // ── Commerce (admin's daily driver)
  { section: 'Commerce', roles: ['admin', 'supervisor', 'billing'] },
  { path: '/orders',     label: 'Orders',        icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', roles: ['admin', 'billing'] },
  { path: '/invoices',   label: 'Invoices',      icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z', roles: ['admin', 'billing'] },
  { path: '/inventory',  label: 'Inventory',     icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', roles: ['admin', 'supervisor', 'billing'] },
  { path: '/reports',    label: 'Reports',       icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', roles: ['admin', 'supervisor', 'billing'] },

  // ── Production pipeline
  { section: 'Production', roles: ['admin', 'supervisor'] },
  { path: '/rolls',      label: 'Rolls',         icon: 'M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3M4 7h16M9 11h6', roles: ['admin', 'supervisor'] },
  { path: '/lots',       label: 'Lots',          icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', roles: ['admin', 'supervisor'] },
  { path: '/batches',    label: 'Batches',       icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10', roles: ['admin', 'supervisor'] },
  { path: '/challans',   label: 'Challans',      icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4', roles: ['admin', 'supervisor'] },
  { path: '/skus',       label: 'SKUs',          icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z', roles: ['admin', 'supervisor'] },

  // ── Setup (configure once)
  { section: 'Setup', roles: ['admin', 'supervisor'] },
  { path: '/parties',    label: 'Party Masters', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', roles: ['admin', 'supervisor'] },
  { path: '/masters',    label: 'Masters',       icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', roles: ['admin', 'supervisor'] },
  { path: '/users',      label: 'Users & Roles', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197', roles: ['admin'] },
  { path: '/settings',   label: 'Settings',       icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', roles: ['admin'] },

  // ── Mobile-only roles
  { path: '/my-work',    label: 'My Work',       icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', roles: ['tailor'] },
  { path: '/qc-queue',   label: 'QC Queue',      icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', roles: ['checker'] },
]

export default function Sidebar({ collapsed, onToggle }) {
  const { role } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const isHome = location.pathname === '/dashboard'

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role))

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex flex-col transition-all duration-300 ${
        collapsed ? 'w-[60px]' : 'w-52'
      }`}
      style={{
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      }}
    >
      {/* ── Brand → Dashboard ── */}
      <div className={`flex h-14 items-center border-b border-white/[0.06] ${
        collapsed ? 'justify-center px-0' : 'px-3'
      }`}>
        {collapsed ? (
          <div className="group relative flex items-center justify-center">
            <button
              onClick={() => navigate('/dashboard')}
              className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-900/40 transition-transform hover:scale-105 ${
                isHome ? 'ring-2 ring-emerald-400/50' : ''
              }`}
            >
              <span className="text-[11px] font-black text-white tracking-tighter">IO</span>
            </button>
            <span className="nav-tooltip">Dashboard</span>
          </div>
        ) : (
          <button
            onClick={() => navigate('/dashboard')}
            className={`flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/[0.06] ${
              isHome ? 'bg-white/[0.06]' : ''
            }`}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-900/40 shrink-0">
              <span className="text-[10px] font-black text-white tracking-tighter">IO</span>
            </div>
            <span className="typo-label-sm text-white tracking-tight">Inventory-OS</span>
          </button>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className={`flex-1 py-1.5 ${collapsed ? 'px-1.5 overflow-visible' : 'px-2.5 sidebar-scroll overflow-y-auto'}`}>
        {visibleItems.map((item, idx) => {
          if (item.section) {
            // Section header
            if (collapsed) {
              return (
                <div key={item.section} className="my-1.5 mx-2 border-t border-white/[0.06]" />
              )
            }
            return (
              <div key={item.section} className={`px-2 ${idx === 0 ? 'pt-0.5' : 'pt-2.5'} pb-0.5`}>
                <span className="typo-nav-section text-gray-500">
                  {item.section}
                </span>
              </div>
            )
          }

          const isActive = location.pathname === item.path

          if (collapsed) {
            // Collapsed: icon + tooltip on hover
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className="group relative flex items-center justify-center"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                    : 'text-gray-400 hover:bg-white/[0.08] hover:text-white'
                }`}>
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={item.icon} />
                  </svg>
                </div>
                {/* Tooltip */}
                <span className="nav-tooltip">{item.label}</span>
              </NavLink>
            )
          }

          // Expanded: full nav item
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className="group relative flex items-center"
            >
              {/* Active accent bar */}
              {isActive && (
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-emerald-400" />
              )}
              <div className={`flex w-full items-center gap-2 rounded-lg px-2 py-[5px] transition-all duration-200 ${
                isActive
                  ? 'bg-white/[0.1] text-white'
                  : 'text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'
              }`}>
                <div className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors shrink-0 ${
                  isActive
                    ? 'bg-emerald-600/80 text-white shadow-sm shadow-emerald-600/20'
                    : 'bg-white/[0.04] text-inherit group-hover:bg-white/[0.08]'
                }`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={item.icon} />
                  </svg>
                </div>
                <span className={`typo-nav transition-colors ${
                  isActive ? 'font-semibold text-white' : ''
                }`}>{item.label}</span>
              </div>
            </NavLink>
          )
        })}
      </nav>

      {/* ── Footer — toggle ── */}
      <div className="border-t border-white/[0.06] px-2.5 py-2">
        <button
          onClick={onToggle}
          className={`flex items-center rounded-lg transition-all duration-200 hover:bg-emerald-600/20 ${
            collapsed ? 'w-full justify-center p-1.5 text-gray-500 hover:text-emerald-400' : 'w-full gap-2 px-2 py-1.5 text-gray-500 hover:text-emerald-300'
          }`}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded bg-white/[0.06]">
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d={collapsed ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7m8 14l-7-7 7-7'} />
            </svg>
          </div>
          {!collapsed && <span className="typo-nav text-inherit">{collapsed ? 'Expand' : 'Collapse'}</span>}
        </button>
      </div>
    </aside>
  )
}
