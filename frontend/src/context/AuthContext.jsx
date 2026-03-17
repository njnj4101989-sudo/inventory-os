import { createContext, useState, useEffect, useCallback } from 'react'
import { login as apiLogin, logout as apiLogout, getMe, selectCompany as apiSelectCompany } from '../api/auth'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [companies, setCompanies] = useState([])
  const [fy, setFy] = useState(null)
  const [fys, setFys] = useState([])
  const [needsCompanySelect, setNeedsCompanySelect] = useState(false)
  const [loading, setLoading] = useState(true)

  // Restore session on mount — /auth/me is the single source of truth
  useEffect(() => {
    let cancelled = false

    async function checkSession() {
      try {
        const response = await getMe()
        const data = response.data.data
        if (!cancelled) {
          setUser(data)
          setCompany(data.company || null)
          setFy(data.fy || null)
        }
      } catch {
        // No valid cookie — not logged in
        if (!cancelled) {
          setUser(null)
          setCompany(null)
          setFy(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    checkSession()
    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (username, password) => {
    const response = await apiLogin(username, password)
    const data = response.data.data

    setUser(data.user)
    setCompanies(data.companies || [])
    setFys(data.fys || [])

    if (data.needs_company_select) {
      setNeedsCompanySelect(true)
      setCompany(null)
      setFy(null)
      return { ...data.user, _needsCompanySelect: true, _companies: data.companies }
    }

    // Single company — auto-selected (or 0 companies — admin setup)
    setCompany(data.company || null)
    setFy(data.fy || null)
    return { ...data.user, _noCompany: !data.company }
  }, [])

  const selectCompany = useCallback(async (companyId, fyId = null) => {
    const response = await apiSelectCompany(companyId, fyId)
    const data = response.data.data

    setUser(data.user)
    setCompany(data.company)
    setCompanies(data.companies || [])
    setFy(data.fy)
    setFys(data.fys || [])
    setNeedsCompanySelect(false)

    return data
  }, [])

  const logout = useCallback(async () => {
    try { await apiLogout() } catch { /* ignore */ }
    setUser(null)
    setCompany(null)
    setCompanies([])
    setFy(null)
    setFys([])
    setNeedsCompanySelect(false)
  }, [])

  const value = {
    user,
    loading,
    login,
    logout,
    selectCompany,
    isAuthenticated: !!user,
    role: user?.role || null,
    roleDisplayName: user?.role_display_name || user?.role || null,
    permissions: user?.permissions || {},
    company,
    companies,
    fy,
    fys,
    needsCompanySelect,
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
