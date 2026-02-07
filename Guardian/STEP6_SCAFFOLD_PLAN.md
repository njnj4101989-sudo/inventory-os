# STEP 6: SCAFFOLD PLAN
## Inventory-OS | Production-Grade Textile Inventory System

**Version:** 1.0
**Status:** Draft
**Date:** 2026-02-07

---

## 6.1 Prerequisites

```
ALL DESIGN DOCUMENTS APPROVED:
✅ STEP 1 — System Overview (architecture, tech stack, roles, production flow)
✅ STEP 2 — Data Model (14 tables, ER diagram, constraints, indexes)
✅ STEP 3 — Event Contracts (8 events, 3 state machines, idempotency rules)
✅ STEP 4 — API Contracts (46 endpoints, auth, RBAC, error codes)
✅ STEP 5 — Folder Structure (~144 files, layer separation, Docker layout)

NO CODE IS WRITTEN UNTIL STEP 6 DOCUMENT IS APPROVED.
```

---

## 6.2 Scaffold Phases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SCAFFOLDING ROADMAP                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Phase 6A: BACKEND ──────────────────────────────────────────────────────  │
│  │  Foundation. Everything depends on this.                                │
│  │  Deliverable: Runnable FastAPI server with DB, models, APIs             │
│  │                                                                         │
│  Phase 6B: WEB FRONTEND ─────────────────────────────────────────────────  │
│  │  Consumes backend API.                                                  │
│  │  Deliverable: Runnable React app with all pages + role-based nav        │
│  │                                                                         │
│  Phase 6C: MOBILE APP ───────────────────────────────────────────────────  │
│  │  Consumes same API. Offline-first.                                      │
│  │  Deliverable: Buildable Android APK with QR scan + tailor/checker flow  │
│  │                                                                         │
│  Phase 6D: INFRA & DEVOPS ───────────────────────────────────────────────  │
│     Wraps everything for deployment.                                       │
│     Deliverable: docker-compose up → entire system running                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6.3 Phase 6A — Backend Scaffold (Detailed)

**Tech:** Python 3.11+ | FastAPI | SQLAlchemy 2.0 (async) | Alembic | PostgreSQL 16
**Target:** Runnable server — `uvicorn app.main:app --reload`

### 6A Tasks Breakdown

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 6A-1 | **Project setup** — requirements.txt, .env.example, alembic.ini, config.py | 5 files | — |
| 6A-2 | **Database setup** — engine, session factory, base model | 2 files | 6A-1 |
| 6A-3 | **ORM Models** — all 15 SQLAlchemy models | 16 files (15 + __init__) | 6A-2 |
| 6A-4 | **Alembic migration** — initial migration from models | 2 files | 6A-3 |
| 6A-5 | **Pydantic schemas** — all request/response schemas | 15 files | 6A-3 |
| 6A-6 | **Core utilities** — security (JWT), permissions, exceptions, code generator | 6 files | 6A-1 |
| 6A-7 | **Dependencies** — get_db, get_current_user, require_permission | 1 file | 6A-6 |
| 6A-8 | **Service layer** — all 12 service files (business logic) | 13 files | 6A-3, 6A-5, 6A-6 |
| 6A-9 | **API routes** — all 13 route files + main router | 14 files | 6A-7, 6A-8 |
| 6A-10 | **App entry** — main.py (FastAPI app, CORS, lifespan, router mount) | 1 file | 6A-9 |
| 6A-11 | **Background tasks** — reservation expiry, backup sync | 3 files | 6A-8 |
| 6A-12 | **Seed scripts** — roles, test users, sample data | 4 files | 6A-3 |
| 6A-13 | **Dockerfile** — backend container | 1 file | 6A-10 |

**Total: ~83 files | 13 tasks | Sequential with parallelism where possible**

### 6A Dependency Graph

```
6A-1 (Project Setup)
  ├──► 6A-2 (Database)
  │      └──► 6A-3 (Models)
  │             ├──► 6A-4 (Migration)
  │             ├──► 6A-5 (Schemas)
  │             └──► 6A-12 (Seeds)
  │
  └──► 6A-6 (Core Utils)
         └──► 6A-7 (Dependencies)

6A-3 + 6A-5 + 6A-6 ──► 6A-8 (Services)
6A-7 + 6A-8 ──► 6A-9 (Routes)
6A-9 ──► 6A-10 (Main App)
6A-8 ──► 6A-11 (Background Tasks)
6A-10 ──► 6A-13 (Dockerfile)
```

### 6A Completion Criteria

```
✅ uvicorn app.main:app runs without errors
✅ All 15 models mapped to DB tables
✅ Alembic migration creates all tables
✅ All 46 API routes registered (returning stubs/placeholders)
✅ JWT auth working (login → get token → use token)
✅ RBAC enforced on protected routes
✅ Seed script populates roles + test users
✅ Health check endpoint responds
```

---

## 6.4 Phase 6B — Web Frontend Scaffold (Detailed)

**Tech:** React 18 | Vite | TailwindCSS | Axios | React Router 6
**Target:** Runnable app — `npm run dev` → localhost:5173
**Location:** `inventory-os/frontend/`
**Data:** Mock data layer (backend APIs are stubs) — flip one flag to switch to real APIs later

### Web Roles (3 of 5 have web access)

| Role | Web Access | Sidebar Menu Items |
|------|:---:|---|
| Admin | Yes | Dashboard, Users, Roles, Suppliers, Rolls, SKUs, Batches, Inventory, Orders, Invoices, Reports |
| Supervisor | Yes | Dashboard, Suppliers, Rolls, SKUs, Batches, Inventory, Reports |
| Billing | Yes | Dashboard, Orders, Invoices, Reports |
| Tailor | No | Mobile only |
| Checker | No | Mobile only |

### 6B Tasks Breakdown

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 6B-1 | **Project setup** — Vite + React + Tailwind + Axios + Router | 7 files | — |
| 6B-2 | **API client + mock layer** — Axios instance, JWT interceptor, mock data store, 11 API modules | 13 files | 6B-1 |
| 6B-3 | **Auth context + hooks** — AuthContext, useAuth, useApi hooks | 3 files | 6B-2 |
| 6B-4 | **Layout components** — Sidebar (role-filtered), Header, Layout shell | 3 files | 6B-3 |
| 6B-5 | **Routes + protection** — Route config, ProtectedRoute guard | 2 files | 6B-4 |
| 6B-6 | **Common components** — DataTable, Modal, StatusBadge, SearchInput, Pagination, Spinner, Alert | 7 files | 6B-1 |
| 6B-7 | **Pages (Admin)** — DashboardPage, UsersPage | 2 files | 6B-5, 6B-6 |
| 6B-8 | **Pages (Supervisor)** — RollsPage, SKUsPage, BatchesPage, SuppliersPage | 4 files | 6B-5, 6B-6 |
| 6B-9 | **Pages (Billing)** — OrdersPage, InvoicesPage, ReportsPage | 3 files | 6B-5, 6B-6 |
| 6B-10 | **Pages (Detail)** — BatchDetailPage, InventoryPage | 2 files | 6B-5, 6B-6 |
| 6B-11 | **Form components** — UserForm, RollForm, SKUForm, BatchForm, OrderForm | 5 files | 6B-6 |

**Total: ~45 files | 11 tasks**

### 6B Dependency Graph

```
6B-1 (Project Setup)
  ├──► 6B-2 (API Client + Mocks)
  │      └──► 6B-3 (Auth Context)
  │             └──► 6B-4 (Layout)
  │                    └──► 6B-5 (Routes)
  │
  └──► 6B-6 (Common Components)

6B-5 + 6B-6 ──► 6B-7  (Admin Pages)
6B-5 + 6B-6 ──► 6B-8  (Supervisor Pages)
6B-5 + 6B-6 ──► 6B-9  (Billing Pages)
6B-5 + 6B-6 ──► 6B-10 (Detail Pages)
6B-6         ──► 6B-11 (Forms)
```

### 6B Task Details

#### 6B-1: Project Setup (7 files)
```
frontend/
├── package.json            ← React 18, Vite, Tailwind, Axios, React Router 6
├── vite.config.js          ← Dev server config (proxy /api → backend:8000)
├── tailwind.config.js      ← Theme: blue-600 primary, gray sidebar
├── postcss.config.js       ← PostCSS + Tailwind + Autoprefixer
├── index.html              ← Vite entry HTML
├── .env.example            ← VITE_API_URL, VITE_USE_MOCK=true
└── src/
    ├── main.jsx            ← React entry (render App)
    └── App.jsx             ← Root component (shell)
```
**Verify:** `npm run dev` serves on localhost:5173

#### 6B-2: API Client + Mock Layer (13 files)
```
src/api/
├── client.js          ← Axios instance, base URL, JWT header interceptor, 401 refresh
├── mock.js            ← Mock data store: 5 users, 2 suppliers, 4 rolls, 3 SKUs,
│                         3 batches, 3 orders, 2 invoices, dashboard stats
│                         Returns Promise with 200ms delay (simulates network)
├── auth.js            ← login(), refresh(), logout()
├── users.js           ← getUsers(), createUser(), updateUser()
├── roles.js           ← getRoles()
├── suppliers.js       ← getSuppliers(), createSupplier(), updateSupplier()
├── rolls.js           ← getRolls(), stockIn(), getRoll()
├── skus.js            ← getSKUs(), createSKU(), updateSKU()
├── batches.js         ← getBatches(), createBatch(), assignBatch(), getBatch()
├── inventory.js       ← getInventory(), getEvents(), adjust(), reconcile()
├── orders.js          ← getOrders(), createOrder(), shipOrder(), cancelOrder()
├── invoices.js        ← getInvoices(), markPaid(), downloadPDF()
└── dashboard.js       ← getSummary(), getTailorPerf(), getMovement()
```
**Mock switch:** `const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'`
**To go live:** Set `VITE_USE_MOCK=false` + `VITE_API_URL=http://localhost:8000/api/v1`

#### 6B-3: Auth Context + Hooks (3 files)
```
src/context/AuthContext.jsx   ← Provider: user, token, role, permissions state
src/hooks/useAuth.js          ← login(), logout(), isAuthenticated, user, role
src/hooks/useApi.js           ← Generic hook: { data, loading, error, refetch }
```

#### 6B-4: Layout Components (3 files)
```
src/components/layout/
├── Sidebar.jsx        ← Navigation menu filtered by user.role
│                         Admin: 11 items | Supervisor: 7 | Billing: 4
├── Header.jsx         ← Top bar: user name, role badge, logout button
└── Layout.jsx         ← Page shell: Sidebar + Header + <Outlet/>
```

#### 6B-5: Routes + Protection (2 files)
```
src/routes/
├── routes.js             ← Route config array: { path, component, requiredRoles[] }
└── ProtectedRoute.jsx    ← Checks isAuthenticated + role in requiredRoles
                             No auth → redirect /login
                             Wrong role → redirect /dashboard
```

#### 6B-6: Common Components (7 files)
```
src/components/common/
├── DataTable.jsx         ← Sortable columns, row click, loading state
├── Modal.jsx             ← Overlay dialog: title, body, close, action buttons
├── StatusBadge.jsx       ← Color-coded: green=active, yellow=pending, red=rejected
├── SearchInput.jsx       ← Debounced search with clear button
├── Pagination.jsx        ← Page controls: prev/next, page numbers
├── LoadingSpinner.jsx    ← Centered spinner
└── ErrorAlert.jsx        ← Red error banner with dismiss
```

#### 6B-7: Admin Pages (2 files)
```
src/pages/
├── DashboardPage.jsx     ← 4 summary cards (rolls, batches, orders, revenue)
│                            + recent activity list
└── UsersPage.jsx         ← User table (DataTable) + create/edit modal (UserForm)
                             Admin only (user_manage permission)
```

#### 6B-8: Supervisor Pages (4 files)
```
src/pages/
├── SuppliersPage.jsx     ← Supplier table + create/edit modal
├── RollsPage.jsx         ← Roll table + stock-in button → RollForm modal
├── SKUsPage.jsx          ← SKU table + create/edit → SKUForm modal
└── BatchesPage.jsx       ← Batch table + create → BatchForm + assign to tailor
```

#### 6B-9: Billing Pages (3 files)
```
src/pages/
├── OrdersPage.jsx        ← Order table + create → OrderForm + ship/cancel/return
├── InvoicesPage.jsx      ← Invoice table + mark paid + PDF download placeholder
└── ReportsPage.jsx       ← Tailor performance table + inventory movement table
```

#### 6B-10: Detail Pages (2 files)
```
src/pages/
├── BatchDetailPage.jsx   ← Batch timeline (CREATED→...→COMPLETED) + rolls used + QR
└── InventoryPage.jsx     ← Stock levels table + event log + adjust modal
```

#### 6B-11: Form Components (5 files)
```
src/components/forms/
├── UserForm.jsx          ← username, full_name, phone, role select
├── RollForm.jsx          ← fabric_type, color, total_length, cost, supplier select
├── SKUForm.jsx           ← DesignNo, product_name, color, size, price
├── BatchForm.jsx         ← SKU select, roll select, pieces_cut, cut_length, notes
└── OrderForm.jsx         ← source, customer_name, customer_phone, items[]{sku, qty}
```

### 6B Folder Structure (Complete)

```
frontend/
├── public/
│   └── index.html
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── api/              (13 files — client + mock + 11 modules)
│   ├── context/          (1 file — AuthContext)
│   ├── hooks/            (2 files — useAuth, useApi)
│   ├── components/
│   │   ├── layout/       (3 files — Sidebar, Header, Layout)
│   │   ├── common/       (7 files — DataTable, Modal, Badge, etc.)
│   │   └── forms/        (5 files — User, Roll, SKU, Batch, Order)
│   ├── pages/            (13 files — Login + 12 feature pages)
│   ├── routes/           (2 files — config + ProtectedRoute)
│   └── utils/            (3 files — constants, formatters, validators)
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example
└── Dockerfile
```

### 6B Completion Criteria

```
✅ npm run dev serves app on localhost:5173
✅ Login page → enter admin/test1234 → redirects to Dashboard
✅ Role-based sidebar (admin=11 items, supervisor=7, billing=4)
✅ All 13 pages render with mock data
✅ Create forms work (add row to mock data store)
✅ ProtectedRoute blocks unauthorized roles
✅ API client ready to switch from mock to real (one env flag)
✅ Responsive layout (sidebar collapsible on mobile)
```

---

## 6.5 Phase 6C — Mobile App Scaffold (Summary)

**Tech:** Kotlin | Jetpack Compose | Retrofit | Room | WorkManager
**Target:** Buildable APK — `./gradlew assembleDebug`

| # | Task | Description |
|---|------|-------------|
| 6C-1 | Project setup | Android Studio project, dependencies |
| 6C-2 | API client | Retrofit instance, auth interceptor |
| 6C-3 | Local DB | Room database, DAOs, action queue |
| 6C-4 | Auth flow | Login screen, token manager |
| 6C-5 | Tailor screens | My Batches, Batch Detail, Start/Submit |
| 6C-6 | Checker screens | Pending Checks, Check Batch (approve/reject) |
| 6C-7 | QR Scanner | Camera-based QR code scanner |
| 6C-8 | Offline sync | SyncWorker, NetworkMonitor, queue processing |

### 6C Completion Criteria

```
✅ APK builds and installs on device
✅ Login → role-based screen routing
✅ QR scanner opens camera and reads codes
✅ Offline action queue stores pending actions
✅ Sync triggers on connectivity restore
```

---

## 6.6 Phase 6D — Infra & DevOps Scaffold (Summary)

**Tech:** Docker Compose | Nginx | Cloudflare Tunnel | Bash scripts
**Target:** `docker-compose up` → full system running

| # | Task | Description |
|---|------|-------------|
| 6D-1 | docker-compose.yml | All 4 services (postgres, backend, nginx, cloudflared) |
| 6D-2 | nginx.conf | Serve web, proxy /api, SSL optional |
| 6D-3 | Cloudflare tunnel | Config for external API exposure |
| 6D-4 | Backup script | pg_dump → encrypt → upload to Supabase |
| 6D-5 | Restore script | Download → decrypt → pg_restore |
| 6D-6 | Setup script | First-run automation |
| 6D-7 | Crontab | Scheduled backup + reservation expiry |

### 6D Completion Criteria

```
✅ docker-compose up starts all services
✅ http://localhost serves web app
✅ http://localhost/api/v1/health returns OK
✅ backup.sh creates encrypted dump
✅ restore.sh restores from backup
```

---

## 6.7 Full Scaffold Summary

| Phase | Files | Depends On | Deliverable |
|-------|-------|------------|-------------|
| 6A Backend | ~83 | — | Running API server |
| 6B Web | ~45 | 6A (API contract) | Running web dashboard |
| 6C Mobile | ~30 | 6A (API contract) | Buildable APK |
| 6D Infra | ~8 | 6A, 6B | docker-compose up |
| **Total** | **~166** | | **Full system skeleton** |

---

## 6.8 Scaffold Rules

```
1. SKELETON FIRST — every file exists with correct imports and structure
2. STUBS SECOND — endpoints return mock/placeholder responses
3. LOGIC THIRD — fill in real business logic (post-scaffold phase)
4. Each phase produces a RUNNABLE artifact (server, app, APK, compose)
5. No phase starts until previous phase is approved
6. Follow folder structure from STEP 5 exactly
7. Follow API contracts from STEP 4 exactly
8. Follow data model from STEP 2 exactly
9. Follow event contracts from STEP 3 exactly
```

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-07 | Initial draft |

---

**Next:** Begin Phase 6A — Backend Scaffold (task-by-task execution)
