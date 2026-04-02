import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import MobileLayout from './components/layout/MobileLayout'
import ProtectedRoute from './routes/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import { useAuth } from './hooks/useAuth'
import { useIsMobile } from './hooks/useIsMobile'
import { NotificationProvider } from './context/NotificationContext'
import Toast from './components/common/Toast'
import routes from './routes/routes'

const ScanPage = lazy(() => import('./pages/ScanPage'))

function DefaultRedirect() {
  const { role, isAuthenticated } = useAuth()
  const isMobile = useIsMobile()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (role === 'tailor') return <Navigate to="/my-work" replace />
  if (role === 'checker') return <Navigate to="/qc-queue" replace />
  return <Navigate to={isMobile ? '/scan' : '/dashboard'} replace />
}

const MOBILE_ROLES = ['tailor', 'checker']
const MOBILE_ONLY_PATHS = ['my-work', 'qc-queue']
const ADMIN_MOBILE_PATHS = ['activity', 'profile']

function App() {
  const isMobile = useIsMobile()

  return (
    <NotificationProvider>
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
        <Route path="/scan/sku/:skuCode" element={<ScanPage />} />
        <Route path="/scan" element={<ScanPage />} />

        {/* Tailor/Checker — always MobileLayout with bottom tabs */}
        <Route
          element={
            <ProtectedRoute requiredRoles={MOBILE_ROLES}>
              <MobileLayout />
            </ProtectedRoute>
          }
        >
          {routes
            .filter((r) => [...MOBILE_ONLY_PATHS, 'profile'].includes(r.path))
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

        {/* Admin/Supervisor/Billing on MOBILE — only scan-friendly pages */}
        {isMobile && (
          <Route
            element={
              <ProtectedRoute>
                <MobileLayout />
              </ProtectedRoute>
            }
          >
            {routes
              .filter((r) => ADMIN_MOBILE_PATHS.includes(r.path))
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
        )}

        {/* Admin/Supervisor/Billing on DESKTOP — full sidebar layout */}
        {!isMobile && (
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {routes
              .filter((r) => !MOBILE_ONLY_PATHS.includes(r.path))
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
        )}

        {/* Fallback — role + viewport aware */}
        <Route path="*" element={<DefaultRedirect />} />
      </Routes>
    </Suspense>
    <Toast />
    </NotificationProvider>
  )
}

export default App
