import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/**
 * Route guard:
 *  - Not authenticated → redirect to /login
 *  - Authenticated but wrong role → redirect to /dashboard
 *  - Authorized → render children
 */
export default function ProtectedRoute({ requiredRoles, children }) {
  const { isAuthenticated, role, loading } = useAuth()

  if (loading) return null

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
