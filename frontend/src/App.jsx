import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import ProtectedRoute from './routes/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import routes from './routes/routes'

const ScanPage = lazy(() => import('./pages/ScanPage'))

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
        <Route path="/scan" element={<ScanPage />} />

        {/* Protected — Layout shell with sidebar + header */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {routes.map((route) => (
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

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
