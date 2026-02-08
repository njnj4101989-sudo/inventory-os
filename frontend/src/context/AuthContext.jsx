import { createContext, useState, useEffect, useCallback } from 'react'
import { login as apiLogin, logout as apiLogout } from '../api/auth'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore session from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('access_token')
    const storedUser = localStorage.getItem('user')
    if (storedToken && storedUser) {
      try {
        setToken(storedToken)
        setUser(JSON.parse(storedUser))
      } catch {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')
      }
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (username, password) => {
    const response = await apiLogin(username, password)
    const payload = response.data.data

    localStorage.setItem('access_token', payload.access_token)
    localStorage.setItem('refresh_token', payload.refresh_token)
    localStorage.setItem('user', JSON.stringify(payload.user))

    setToken(payload.access_token)
    setUser(payload.user)

    return payload.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } catch {
      // Ignore logout API errors — clear local state regardless
    }
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
  }, [])

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    isAuthenticated: !!token,
    role: user?.role || null,
    permissions: user?.permissions || {},
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
