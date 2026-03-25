import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import NotificationBell from '../common/NotificationBell'

const ROLE_COLORS = {
  admin:      'from-red-500 to-rose-600',
  supervisor: 'from-blue-500 to-indigo-600',
  billing:    'from-emerald-500 to-green-600',
  tailor:     'from-amber-500 to-yellow-600',
  checker:    'from-violet-500 to-purple-600',
}

const ROLE_DOT = {
  admin:      'bg-red-500',
  supervisor: 'bg-blue-500',
  billing:    'bg-emerald-500',
  tailor:     'bg-amber-500',
  checker:    'bg-violet-500',
}

export default function Header() {
  const { user, role, roleDisplayName, logout, company, companies, fy, fys, selectCompany } = useAuth()
  const navigate = useNavigate()
  const [showCompanyMenu, setShowCompanyMenu] = useState(false)
  const [showFyMenu, setShowFyMenu] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [switching, setSwitching] = useState(false)
  const companyRef = useRef(null)
  const fyRef = useRef(null)
  const userRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (companyRef.current && !companyRef.current.contains(e.target)) setShowCompanyMenu(false)
      if (fyRef.current && !fyRef.current.contains(e.target)) setShowFyMenu(false)
      if (userRef.current && !userRef.current.contains(e.target)) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleCompanySwitch = async (companyId) => {
    if (switching) return
    setSwitching(true)
    setShowCompanyMenu(false)
    try {
      await selectCompany(companyId)
      window.location.reload()
    } catch {
      // silently fail
    } finally {
      setSwitching(false)
    }
  }

  const handleFySwitch = async (fyId) => {
    if (switching || !company) return
    setSwitching(true)
    setShowFyMenu(false)
    try {
      await selectCompany(company.id, fyId)
      window.location.reload()
    } catch {
      // silently fail
    } finally {
      setSwitching(false)
    }
  }

  const hasMultipleCompanies = companies && companies.length > 1
  const hasMultipleFys = fys && fys.length > 1
  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-white/90 backdrop-blur-xl px-4 lg:px-5 border-b border-gray-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
    >
      {/* ── Left: Company + FY ── */}
      <div className="flex items-center gap-2">
        {company ? (
          <>
            {/* Company switcher */}
            <div className="relative" ref={companyRef}>
              <button
                onClick={() => hasMultipleCompanies && setShowCompanyMenu((v) => !v)}
                className={`flex items-center gap-1.5 rounded-md bg-gray-100/80 px-2 py-1 max-w-[220px] transition-all ${
                  hasMultipleCompanies ? 'hover:bg-gray-200/80 cursor-pointer' : 'cursor-default'
                } ${switching ? 'opacity-50' : ''}`}
              >
                <svg className="h-3.5 w-3.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                <span className="typo-data truncate">{company.name}</span>
                {hasMultipleCompanies && (
                  <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform ${showCompanyMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>

              {showCompanyMenu && (
                <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl border border-gray-200/80 bg-white p-1.5 shadow-2xl z-50"
                  style={{ backdropFilter: 'blur(20px)' }}
                >
                  <p className="px-3 py-1.5 typo-nav-section">Switch Company</p>
                  {companies.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleCompanySwitch(c.id)}
                      className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-all ${
                        c.id === company.id
                          ? 'bg-primary-50 text-primary-700'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span className="flex-1 min-w-0 typo-nav truncate">{c.name}</span>
                      {c.id === company.id && (
                        <svg className="h-4 w-4 text-primary-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Separator dot */}
            <div className="h-1 w-1 rounded-full bg-gray-300" />

            {/* FY switcher */}
            {fy && (
              <div className="relative" ref={fyRef}>
                <button
                  onClick={() => hasMultipleFys && setShowFyMenu((v) => !v)}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 typo-badge transition-all bg-indigo-50/80 ${
                    hasMultipleFys
                      ? 'text-indigo-600 hover:bg-indigo-100 cursor-pointer'
                      : 'text-indigo-600 cursor-default'
                  } ${switching ? 'opacity-50' : ''}`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {fy.code}
                  {hasMultipleFys && (
                    <svg className={`h-3 w-3 text-indigo-400 transition-transform ${showFyMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </button>

                {showFyMenu && (
                  <div className="absolute left-0 top-full mt-1.5 w-48 rounded-xl border border-gray-200/80 bg-white p-1.5 shadow-2xl z-50">
                    <p className="px-3 py-1.5 typo-nav-section">Financial Year</p>
                    {fys.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => handleFySwitch(f.id)}
                        className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left typo-nav transition-all ${
                          f.id === fy.id
                            ? 'bg-indigo-50 text-indigo-700 font-semibold'
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <span>{f.code}</span>
                        <div className="flex items-center gap-1.5">
                          {f.status === 'closed' && (
                            <span className="typo-caption">Closed</span>
                          )}
                          {f.id === fy.id && (
                            <svg className="h-4 w-4 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <span className="typo-body text-gray-400">Textile Inventory Management</span>
        )}
      </div>

      {/* ── Right: Bell + User Avatar Menu ── */}
      <div className="flex items-center gap-2">
        <NotificationBell />

        {/* User avatar + dropdown */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setShowUserMenu((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-all hover:bg-gray-100/80"
          >
            {/* Avatar with role gradient */}
            <div className={`relative flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${
              ROLE_COLORS[role] || 'from-gray-400 to-gray-600'
            } text-[10px] font-bold text-white shadow-sm ring-2 ring-white`}>
              {initials}
              <div className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-[1.5px] border-white ${ROLE_DOT[role] || 'bg-gray-500'}`} />
            </div>
            <div className="hidden sm:block text-left">
              <div className="typo-label-sm leading-tight">{user?.full_name}</div>
              <div className="typo-caption capitalize leading-tight">{roleDisplayName}</div>
            </div>
            <svg className={`hidden sm:block h-3.5 w-3.5 text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-gray-200/80 bg-white shadow-2xl z-50 overflow-hidden">
              {/* User info card */}
              <div className={`bg-gradient-to-r ${ROLE_COLORS[role] || 'from-gray-400 to-gray-600'} px-4 py-3`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 typo-data text-white backdrop-blur-sm">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="typo-data text-white truncate">{user?.full_name}</div>
                    <div className="typo-caption text-white/70 capitalize">{roleDisplayName}</div>
                  </div>
                </div>
              </div>

              {/* Menu items */}
              <div className="p-1.5">
                <button
                  onClick={() => { setShowUserMenu(false); navigate('/settings') }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left typo-nav text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Settings
                </button>

                <div className="my-1 border-t border-gray-100" />

                <button
                  onClick={() => { setShowUserMenu(false); logout() }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left typo-nav text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
