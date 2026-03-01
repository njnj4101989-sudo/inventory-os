import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const { login, isAuthenticated, role } = useAuth()
  const navigate = useNavigate()

  // If already logged in, redirect
  if (isAuthenticated) {
    navigate(getLandingPath(role), { replace: true })
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(username, password)
      navigate(getLandingPath(user.role), { replace: true })
    } catch (err) {
      if (err.response?.data?.detail) {
        setError(err.response.data.detail)
      } else if (err.code === 'ERR_NETWORK' || !err.response) {
        setError('Cannot reach server. If using tunnel, wait 30s and retry.')
      } else {
        setError(`Login failed (${err.response?.status || 'unknown'}). Check connection.`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary-600">Inventory-OS</h1>
          <p className="mt-1 text-sm text-gray-500">Textile Inventory Management</p>
        </div>

        {/* Login Card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-xl bg-white p-8 shadow-lg"
        >
          <h2 className="mb-6 text-lg font-semibold text-gray-800">Sign in</h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
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
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="Enter password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          {/* Dev hint */}
          <p className="mt-4 text-center text-xs text-gray-400">
            Login: admin / test1234 (or supervisor, tailor1, checker1, billing)
          </p>
        </form>
      </div>
    </div>
  )
}
