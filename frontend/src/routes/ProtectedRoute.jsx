import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

function getFallbackPath(role) {
  if (role === 'tailor') return '/my-work'
  if (role === 'checker') return '/qc-queue'
  return '/dashboard'
}

/**
 * Route guard:
 *  - Not authenticated → redirect to /login
 *  - Authenticated but wrong role → redirect to role-appropriate landing
 *  - Authorized → render children
 */
export default function ProtectedRoute({ requiredRoles, children }) {
  const { isAuthenticated, role, loading } = useAuth()

  if (loading) return null

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(role)) {
    return <Navigate to={getFallbackPath(role)} replace />
  }

  return children
}
