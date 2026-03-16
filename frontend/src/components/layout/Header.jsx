import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import NotificationBell from '../common/NotificationBell'

const ROLE_COLORS = {
  admin:      'bg-red-100 text-red-700',
  supervisor: 'bg-blue-100 text-blue-700',
  billing:    'bg-green-100 text-green-700',
  tailor:     'bg-yellow-100 text-yellow-700',
  checker:    'bg-purple-100 text-purple-700',
}

export default function Header() {
  const { user, role, roleDisplayName, logout, company, companies, fy, fys, selectCompany } = useAuth()
  const [showCompanyMenu, setShowCompanyMenu] = useState(false)
  const [showFyMenu, setShowFyMenu] = useState(false)
  const [switching, setSwitching] = useState(false)
  const companyRef = useRef(null)
  const fyRef = useRef(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (companyRef.current && !companyRef.current.contains(e.target)) setShowCompanyMenu(false)
      if (fyRef.current && !fyRef.current.contains(e.target)) setShowFyMenu(false)
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
      window.location.reload() // full reload to clear all cached data
    } catch {
      // silently fail — user stays on current company
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

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-6">
      {/* Left — Company + FY */}
      <div className="flex items-center gap-2">
        {company ? (
          <>
            {/* Company badge/switcher */}
            <div className="relative" ref={companyRef}>
              <button
                onClick={() => hasMultipleCompanies && setShowCompanyMenu((v) => !v)}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors ${
                  hasMultipleCompanies
                    ? 'hover:bg-gray-100 cursor-pointer'
                    : 'cursor-default'
                } ${switching ? 'opacity-50' : ''}`}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary-600 to-primary-700 text-[11px] font-bold text-white shadow-sm">
                  {company.name?.charAt(0)?.toUpperCase() || 'C'}
                </div>
                <span className="text-sm font-semibold text-gray-800 max-w-[140px] truncate">
                  {company.name}
                </span>
                {hasMultipleCompanies && (
                  <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>

              {/* Company dropdown */}
              {showCompanyMenu && (
                <div className="absolute left-0 top-full mt-1 w-64 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl z-50">
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Switch Company</p>
                  {companies.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleCompanySwitch(c.id)}
                      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                        c.id === company.id
                          ? 'bg-primary-50 text-primary-700'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold ${
                        c.id === company.id
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                      </div>
                      {c.id === company.id && (
                        <svg className="h-4 w-4 text-primary-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* FY badge/switcher */}
            {fy && (
              <div className="relative" ref={fyRef}>
                <button
                  onClick={() => hasMultipleFys && setShowFyMenu((v) => !v)}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                    hasMultipleFys
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 cursor-pointer'
                      : 'border-indigo-200 bg-indigo-50 text-indigo-700 cursor-default'
                  } ${switching ? 'opacity-50' : ''}`}
                >
                  {fy.code}
                  {hasMultipleFys && (
                    <svg className="ml-1 -mr-0.5 inline h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </button>

                {showFyMenu && (
                  <div className="absolute left-0 top-full mt-1 w-48 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl z-50">
                    <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Financial Year</p>
                    {fys.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => handleFySwitch(f.id)}
                        className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          f.id === fy.id
                            ? 'bg-indigo-50 text-indigo-700 font-semibold'
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <span>{f.code}</span>
                        <div className="flex items-center gap-1.5">
                          {f.status === 'closed' && (
                            <span className="text-[10px] text-gray-400">Closed</span>
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
          <span className="text-sm text-gray-500">Textile Inventory Management</span>
        )}
      </div>

      {/* Right — notifications, role, user, logout */}
      <div className="flex items-center gap-3">
        <NotificationBell />

        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
            ROLE_COLORS[role] || 'bg-gray-100 text-gray-700'
          }`}
        >
          {roleDisplayName}
        </span>

        <span className="hidden sm:inline text-sm font-medium text-gray-700">
          {user?.full_name}
        </span>

        <button
          onClick={logout}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  )
}
