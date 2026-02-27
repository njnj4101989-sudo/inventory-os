import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import MobileLayout from './components/layout/MobileLayout'
import ProtectedRoute from './routes/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import { useAuth } from './hooks/useAuth'
import routes from './routes/routes'

const ScanPage = lazy(() => import('./pages/ScanPage'))

function DefaultRedirect() {
  const { role, isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (role === 'tailor') return <Navigate to="/my-work" replace />
  if (role === 'checker') return <Navigate to="/qc-queue" replace />
  return <Navigate to="/dashboard" replace />
}

const MOBILE_ROLES = ['tailor', 'checker']

function App() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      }
    >
      <Routes>
        {/* Public — no auth required */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/scan/roll/:rollCode" element={<ScanPage />} />
        <Route path="/scan/batch/:batchCode" element={<ScanPage />} />
        <Route path="/scan" element={<ScanPage />} />

        {/* Mobile layout — tailor/checker get bottom tabs */}
        <Route
          element={
            <ProtectedRoute requiredRoles={MOBILE_ROLES}>
              <MobileLayout />
            </ProtectedRoute>
          }
        >
          {routes
            .filter((r) => ['my-work', 'qc-queue', 'profile'].includes(r.path))
            .map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={
                  <ProtectedRoute requiredRoles={route.requiredRoles}>
                    <route.element />
                  </ProtectedRoute>
                }
              />
            ))}
        </Route>

        {/* Desktop layout — admin/supervisor/billing get sidebar */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {routes
            .filter((r) => !['my-work', 'qc-queue', 'profile'].includes(r.path))
            .map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={
                  <ProtectedRoute requiredRoles={route.requiredRoles}>
                    <route.element />
                  </ProtectedRoute>
                }
              />
            ))}
        </Route>

        {/* Fallback — role-aware */}
        <Route path="*" element={<DefaultRedirect />} />
      </Routes>
    </Suspense>
  )
}

export default App
