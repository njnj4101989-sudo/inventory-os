import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

function getLandingPath(role) {
  if (role === 'tailor') return '/my-work'
  if (role === 'checker') return '/qc-queue'
  return '/dashboard'
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)

  // Company picker state
  const [showPicker, setShowPicker] = useState(false)
  const [pickerCompanies, setPickerCompanies] = useState([])
  const [selectedCompanyId, setSelectedCompanyId] = useState(null)

  const { login, selectCompany, isAuthenticated, role, company } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)
    window.addEventListener('keydown', handler)
    window.addEventListener('keyup', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('keyup', handler)
    }
  }, [])

  // If already logged in with company context, redirect
  if (isAuthenticated && company) {
    return <Navigate to={getLandingPath(role)} replace />
  }

  // Logged in but no companies at all — admin setup mode
  if (isAuthenticated && !company && !showPicker) {
    return <Navigate to="/settings" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(username, password)
      if (result._needsCompanySelect) {
        // Multi-company user — show picker
        setPickerCompanies(result._companies || [])
        setSelectedCompanyId(result._companies?.find((c) => c.is_default)?.id || result._companies?.[0]?.id)
        setShowPicker(true)
      } else if (result._noCompany) {
        // No company exists — redirect admin to Settings to create one
        navigate('/settings', { replace: true })
      } else {
        navigate(getLandingPath(result.role), { replace: true })
      }
    } catch (err) {
      if (err.response?.data?.detail) {
        setError(err.response.data.detail)
      } else if (err.code === 'ERR_NETWORK' || !err.response) {
        setError('Cannot reach server. Check connection and retry.')
      } else {
        setError(`Login failed (${err.response?.status || 'unknown'}).`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCompanySelect = async () => {
    if (!selectedCompanyId || loading) return
    setError('')
    setLoading(true)
    try {
      await selectCompany(selectedCompanyId)
      navigate(getLandingPath(role), { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to select company. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // --- Company Picker View ---
  if (showPicker) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-primary-600">Inventory-OS</h1>
            <p className="mt-1 text-sm text-gray-500">Select your workspace</p>
          </div>

          <form className="rounded-xl bg-white p-8 shadow-lg" onSubmit={(e) => { e.preventDefault(); handleCompanySelect() }}
            onKeyDown={(e) => {
              if (!pickerCompanies.length) return
              const idx = pickerCompanies.findIndex((c) => c.id === selectedCompanyId)
              let nextIdx = -1
              if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault()
                nextIdx = (idx + 1) % pickerCompanies.length
              } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault()
                nextIdx = (idx - 1 + pickerCompanies.length) % pickerCompanies.length
              }
              if (nextIdx >= 0) {
                setSelectedCompanyId(pickerCompanies[nextIdx].id)
                // Focus moves via the ref callback on re-render
              }
            }}
          >
            <h2 className="mb-2 text-lg font-semibold text-gray-800">Choose Company</h2>
            <p className="mb-6 text-sm text-gray-500">You have access to multiple companies</p>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <div className="space-y-2">
              {pickerCompanies.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  ref={c.id === selectedCompanyId ? (el) => { if (el) requestAnimationFrame(() => el.focus()) } : undefined}
                  onClick={() => setSelectedCompanyId(c.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleCompanySelect() } }}
                  className={`w-full flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all ${
                    selectedCompanyId === c.id
                      ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold ${
                    selectedCompanyId === c.id
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-900">{c.name}</div>
                    <div className="text-xs text-gray-500">{c.slug}</div>
                  </div>
                  {c.is_default && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      Default
                    </span>
                  )}
                  {selectedCompanyId === c.id && (
                    <svg className="h-5 w-5 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || !selectedCompanyId}
              className="mt-6 w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Loading...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // --- Login Form View ---
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary-600">Inventory-OS</h1>
          <p className="mt-1 text-sm text-gray-500">Textile Inventory Management</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl bg-white p-8 shadow-lg">
          <h2 className="mb-6 text-lg font-semibold text-gray-800">Sign in</h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                required
                autoFocus
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="e.g. admin"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="current-password"
                  spellCheck={false}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                      <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.092 1.092a4 4 0 00-5.558-5.558z" clipRule="evenodd" />
                      <path d="M10.748 13.93l2.523 2.523A9.987 9.987 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 014.09 5.12l2.109 2.11a4 4 0 005.549 5.55z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                      <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </div>
              {capsLock && (
                <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                    <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm.75-10.25a.75.75 0 00-1.5 0v4.5a.75.75 0 001.5 0v-4.5zM8 12a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  CapsLock is ON
                </p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          <p className="mt-4 text-center text-xs text-gray-400">
            Login: admin / test1234 (or supervisor, tailor1, checker1, billing)
          </p>
        </form>
      </div>
    </div>
  )
}
