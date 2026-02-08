import { lazy } from 'react'

// Lazy-load all pages — code-split per route
const DashboardPage    = lazy(() => import('../pages/DashboardPage'))
const UsersPage        = lazy(() => import('../pages/UsersPage'))
const SuppliersPage    = lazy(() => import('../pages/SuppliersPage'))
const RollsPage        = lazy(() => import('../pages/RollsPage'))
const SKUsPage         = lazy(() => import('../pages/SKUsPage'))
const BatchesPage      = lazy(() => import('../pages/BatchesPage'))
const BatchDetailPage  = lazy(() => import('../pages/BatchDetailPage'))
const InventoryPage    = lazy(() => import('../pages/InventoryPage'))
const OrdersPage       = lazy(() => import('../pages/OrdersPage'))
const InvoicesPage     = lazy(() => import('../pages/InvoicesPage'))
const ReportsPage      = lazy(() => import('../pages/ReportsPage'))

/**
 * Route config — each entry maps a path to a component + allowed roles.
 * ProtectedRoute reads `requiredRoles` to enforce RBAC.
 */
const routes = [
  { path: 'dashboard',        element: DashboardPage,    requiredRoles: ['admin', 'supervisor', 'billing'] },
  { path: 'users',            element: UsersPage,        requiredRoles: ['admin'] },
  { path: 'suppliers',        element: SuppliersPage,    requiredRoles: ['admin', 'supervisor'] },
  { path: 'rolls',            element: RollsPage,        requiredRoles: ['admin', 'supervisor'] },
  { path: 'skus',             element: SKUsPage,         requiredRoles: ['admin', 'supervisor'] },
  { path: 'batches',          element: BatchesPage,      requiredRoles: ['admin', 'supervisor'] },
  { path: 'batches/:id',      element: BatchDetailPage,  requiredRoles: ['admin', 'supervisor'] },
  { path: 'inventory',        element: InventoryPage,    requiredRoles: ['admin', 'supervisor', 'billing'] },
  { path: 'orders',           element: OrdersPage,       requiredRoles: ['admin', 'billing'] },
  { path: 'invoices',         element: InvoicesPage,     requiredRoles: ['admin', 'billing'] },
  { path: 'reports',          element: ReportsPage,      requiredRoles: ['admin', 'supervisor', 'billing'] },
]

export default routes
