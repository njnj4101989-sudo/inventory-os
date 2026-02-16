# STEP 5: FOLDER STRUCTURE
## Inventory-OS | Production-Grade Textile Inventory System

**Version:** 1.1
**Status:** Updated (Sessions 7-14)
**Date:** 2026-02-17

---

## 5.1 Monorepo Strategy

```
WHY MONOREPO:
- Single git repo for backend + web + mobile + infra
- Shared docs and configs in one place
- Easier CI/CD and versioning
- Small team (< 5 devs) — no need for multi-repo overhead

STRUCTURE PRINCIPLE:
- Each top-level folder is independently runnable
- No cross-folder imports (clean boundaries)
- Shared contracts live in /docs (the specs we've written)
```

---

## 5.2 Complete Folder Structure

```
inventory-os/
│
├── backend/                          # FastAPI Backend (Python)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                   # FastAPI app entry, CORS, lifespan
│   │   ├── config.py                 # Settings from .env (pydantic BaseSettings)
│   │   ├── database.py               # SQLAlchemy engine, session factory
│   │   ├── dependencies.py           # Shared FastAPI dependencies (get_db, get_current_user)
│   │   │
│   │   ├── models/                   # SQLAlchemy ORM models (1 file per table — 17 models)
│   │   │   ├── __init__.py           # Export all models
│   │   │   ├── role.py               # Role model (+display_name)
│   │   │   ├── user.py               # User model
│   │   │   ├── supplier.py           # Supplier model (+gst_no, pan_no, email, city, state, pin_code)
│   │   │   ├── roll.py               # Roll model (weight-based: total_weight/remaining_weight, status, invoice fields)
│   │   │   ├── roll_processing.py    # RollProcessing model (dyeing/washing tracking)
│   │   │   ├── lot.py                # Lot model (groups rolls for cutting, palla-based)
│   │   │   ├── lot_roll.py           # LotRoll join model (N:N roll↔lot)
│   │   │   ├── sku.py                # SKU model (BLS-101-Red-M pattern)
│   │   │   ├── batch.py              # Batch model (+lot_id, piece_count, color_breakdown)
│   │   │   ├── batch_assignment.py   # BatchAssignment model
│   │   │   ├── batch_roll_consumption.py  # BatchRollConsumption model
│   │   │   ├── inventory_event.py    # InventoryEvent model
│   │   │   ├── inventory_state.py    # InventoryState model
│   │   │   ├── reservation.py        # Reservation model
│   │   │   ├── order.py              # Order model
│   │   │   ├── order_item.py         # OrderItem model
│   │   │   ├── invoice.py            # Invoice model
│   │   │   └── invoice_item.py       # InvoiceItem model
│   │   │
│   │   ├── schemas/                  # Pydantic request/response schemas (16 files)
│   │   │   ├── __init__.py           # PaginatedParams + common exports
│   │   │   ├── auth.py               # LoginRequest, TokenResponse, UserBriefAuth
│   │   │   ├── user.py               # UserCreate, UserUpdate, UserResponse
│   │   │   ├── role.py               # RoleResponse, RoleCreate, RoleUpdate
│   │   │   ├── supplier.py           # SupplierCreate, SupplierResponse (+6 fields)
│   │   │   ├── roll.py               # RollCreate (stock-in), RollResponse (weight-based)
│   │   │   ├── sku.py                # SKUCreate, SKUResponse (ProductType-DesignNo-Color-Size)
│   │   │   ├── lot.py                # LotCreate, LotRollInput, LotResponse
│   │   │   ├── batch.py              # BatchCreate (+lot_id), BatchAssign, BatchCheck, BatchResponse
│   │   │   ├── inventory.py          # InventoryResponse, AdjustRequest, EventResponse
│   │   │   ├── order.py              # OrderCreate, OrderResponse, ReturnRequest
│   │   │   ├── invoice.py            # InvoiceResponse
│   │   │   ├── dashboard.py          # SummaryResponse, PerformanceResponse
│   │   │   ├── mobile.py             # ScanRequest, ScanResponse, MyBatchResponse
│   │   │   ├── external.py           # ReserveRequest, ConfirmRequest, StockResponse
│   │   │   └── common.py             # PaginatedResponse, ErrorResponse, SuccessResponse
│   │   │
│   │   ├── api/                      # Route handlers (thin — call services, 15 files)
│   │   │   ├── __init__.py
│   │   │   ├── router.py             # Main router — includes all 14 sub-routers
│   │   │   ├── auth.py               # /api/v1/auth/*
│   │   │   ├── users.py              # /api/v1/users/*
│   │   │   ├── roles.py              # /api/v1/roles/*
│   │   │   ├── suppliers.py          # /api/v1/suppliers/*
│   │   │   ├── rolls.py              # /api/v1/rolls/*
│   │   │   ├── skus.py               # /api/v1/skus/*
│   │   │   ├── lots.py               # /api/v1/lots/* (NEW — lot CRUD)
│   │   │   ├── batches.py            # /api/v1/batches/*
│   │   │   ├── inventory.py          # /api/v1/inventory/*
│   │   │   ├── orders.py             # /api/v1/orders/*
│   │   │   ├── invoices.py           # /api/v1/invoices/*
│   │   │   ├── dashboard.py          # /api/v1/dashboard/*
│   │   │   ├── mobile.py             # /api/v1/mobile/*
│   │   │   └── external.py           # /api/v1/external/*
│   │   │
│   │   ├── services/                 # Business logic — ALL implemented (13 files, 65+ methods)
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py       # Login, token generation, refresh
│   │   │   ├── user_service.py       # User CRUD + soft-delete
│   │   │   ├── supplier_service.py   # Supplier CRUD
│   │   │   ├── roll_service.py       # Stock-in (challan-based codes), roll queries, processing
│   │   │   ├── sku_service.py        # SKU CRUD, auto-code (ProductType-DesignNo-Color-Size)
│   │   │   ├── lot_service.py        # Lot create/update, add/remove rolls, palla calculations
│   │   │   ├── batch_service.py      # Batch lifecycle (create from lot, assign, start, submit, check)
│   │   │   ├── inventory_service.py  # Event processing, state computation, reconciliation
│   │   │   ├── order_service.py      # Order lifecycle (create, ship, cancel, return)
│   │   │   ├── invoice_service.py    # Invoice generation (auto from ship), mark paid, PDF
│   │   │   ├── reservation_service.py # Reserve, confirm, release, expiry + external API
│   │   │   ├── dashboard_service.py  # Summary, tailor performance, inventory movement
│   │   │   └── qr_service.py         # QR code generation (qrcode library)
│   │   │
│   │   ├── core/                     # Cross-cutting concerns
│   │   │   ├── __init__.py
│   │   │   ├── security.py           # JWT encode/decode, password hashing (passlib bcrypt)
│   │   │   ├── permissions.py        # RBAC matrix (16 perms × 5 roles), check/list helpers
│   │   │   ├── exceptions.py         # AppException base + 10 domain exceptions
│   │   │   ├── error_handlers.py     # Global exception handlers
│   │   │   └── code_generator.py     # Smart code generators (roll: challan-based, LOT-XXXX, BATCH-XXXX, etc.)
│   │   │
│   │   └── tasks/                    # Background tasks
│   │       ├── __init__.py
│   │       ├── reservation_expiry.py # Auto-expire stale reservations (every 15 min)
│   │       └── backup_sync.py        # Supabase backup worker (every 24h, stub for Phase 6D)
│   │
│   ├── migrations/                   # Alembic database migrations
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/                 # Migration files (auto-generated, 17 tables)
│   │
│   ├── seeds/                        # Seed data for development
│   │   ├── seed_all.py              # Runner: python -m seeds.seed_all
│   │   ├── seed_roles.py             # 5 roles with 16 permissions each
│   │   ├── seed_users.py             # 5 test users (1 per role, password: test1234)
│   │   └── seed_data.py              # 2 suppliers + 3 SKUs
│   │
│   ├── alembic.ini                   # Alembic config
│   ├── requirements.txt              # Python dependencies
│   ├── Dockerfile                    # Backend container
│   └── .env.example                  # Environment template
│
├── frontend/                         # React Web Frontend (Vite 6.4 + React 18 + Tailwind 3.4)
│   ├── index.html                    # Vite entry
│   │
│   ├── src/
│   │   ├── main.jsx                  # React entry point (AuthProvider wrapping App)
│   │   ├── App.jsx                   # Root component, router setup, Suspense
│   │   ├── index.css                 # Tailwind base/components/utilities
│   │   │
│   │   ├── api/                      # API client layer (14 files)
│   │   │   ├── client.js             # Axios instance, JWT interceptor, 401 auto-refresh queue
│   │   │   ├── mock.js               # Full mock data store (users, suppliers, rolls, lots, SKUs, batches, orders, invoices, dashboard)
│   │   │   ├── auth.js               # login(), refresh(), logout()
│   │   │   ├── users.js              # getUsers(), createUser(), updateUser()
│   │   │   ├── roles.js              # getRoles(), createRole(), updateRole(), deleteRole()
│   │   │   ├── suppliers.js          # getSuppliers(), createSupplier(), updateSupplier()
│   │   │   ├── rolls.js              # getRolls(), stockIn(), stockInBulk(), getInvoices(), generateRollCode()
│   │   │   ├── skus.js               # getSKUs(), createSKU(), updateSKU()
│   │   │   ├── lots.js               # getLots(), createLot(), updateLot()
│   │   │   ├── batches.js            # getBatches(), createBatch(), assignBatch()
│   │   │   ├── inventory.js          # getInventory(), getEvents(), adjust(), getInventorySummary()
│   │   │   ├── orders.js             # getOrders(), createOrder(), shipOrder(), cancelOrder()
│   │   │   ├── invoices.js           # getInvoices(), markPaid(), downloadPDF()
│   │   │   └── dashboard.js          # getSummary(), getTailorPerf(), getMovement(), getProductionReport(), getFinancialReport()
│   │   │
│   │   ├── hooks/                    # Custom React hooks
│   │   │   ├── useAuth.js            # Auth state consumer (from AuthContext)
│   │   │   └── useApi.js             # Generic { data, loading, error, refetch } hook
│   │   │
│   │   ├── context/                  # React context providers
│   │   │   └── AuthContext.jsx        # Auth provider (token, user, role, roleDisplayName, permissions)
│   │   │
│   │   ├── pages/                    # Full page components (13 pages)
│   │   │   ├── LoginPage.jsx         # Login form with mock hint
│   │   │   ├── DashboardPage.jsx     # 4 KPI cards, batch pipeline, inventory/revenue panels
│   │   │   ├── UsersPage.jsx         # Users + Roles tabs, role cards with permissions
│   │   │   ├── SuppliersPage.jsx     # 3-section form, GST/PAN validation, detail modal
│   │   │   ├── RollsPage.jsx         # 3-tab (By Invoice / All Rolls / In Processing), challan-style stock-in
│   │   │   ├── LotsPage.jsx          # Lot create (palla/size pattern/rolls), detail modal
│   │   │   ├── SKUsPage.jsx          # SKU CRUD with auto-code preview
│   │   │   ├── BatchesPage.jsx       # Create from lot, assign, status tracking
│   │   │   ├── BatchDetailPage.jsx   # Timeline, lot info, roll consumption
│   │   │   ├── InventoryPage.jsx     # 4 KPIs, stock health bars, multi-filter toolbar
│   │   │   ├── OrdersPage.jsx        # Order list, create, ship/cancel actions
│   │   │   ├── InvoicesPage.jsx      # Invoice list, detail, mark paid
│   │   │   └── ReportsPage.jsx       # 4-tab (Production/Inventory/Financial/Tailor), period selector
│   │   │
│   │   ├── components/               # Reusable UI components
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.jsx       # Role-filtered nav (Admin 11, Supervisor 7, Billing 4)
│   │   │   │   ├── Header.jsx        # User name, role badge (display_name), logout
│   │   │   │   └── Layout.jsx        # Sidebar + Header + Outlet shell
│   │   │   │
│   │   │   ├── common/
│   │   │   │   ├── DataTable.jsx     # Sortable columns, row click, skeleton loading
│   │   │   │   ├── Modal.jsx         # max-h-[90vh], scrollable body, wide/extraWide props
│   │   │   │   ├── StatusBadge.jsx   # 15 color mappings (batch/order/invoice/roll statuses)
│   │   │   │   ├── SearchInput.jsx   # Debounced (300ms), search icon, clear button
│   │   │   │   ├── Pagination.jsx    # Prev/Next, 5 visible pages with ellipsis
│   │   │   │   ├── LoadingSpinner.jsx # sm/md/lg with optional text
│   │   │   │   └── ErrorAlert.jsx    # Red banner, dismissible
│   │   │   │
│   │   │   └── forms/
│   │   │       ├── UserForm.jsx      # username, password, full_name, role select, phone
│   │   │       ├── RollForm.jsx      # fabric_type, color, weight, cost, supplier, invoice fields
│   │   │       ├── SKUForm.jsx       # product_type, design_no, color, size, live SKU code preview
│   │   │       ├── BatchForm.jsx     # Lot selector, piece count, color breakdown
│   │   │       └── OrderForm.jsx     # Customer info, dynamic SKU items
│   │   │
│   │   └── routes/                   # Route definitions + guards
│   │       ├── routes.js             # 12-route config with requiredRoles[], React.lazy
│   │       └── ProtectedRoute.jsx    # Auth guard: no auth → /login, wrong role → /dashboard
│   │
│   ├── package.json                  # React 18, Vite, Tailwind, Axios, React Router 6
│   ├── vite.config.js                # dev :5173, proxy /api → :8000
│   ├── tailwind.config.js            # blue-600 primary theme
│   ├── postcss.config.js
│   ├── .env                          # VITE_USE_MOCK=true (mock switch)
│   └── .env.example
│
├── mobile/                           # Android Mobile App
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── java/com/inventoryos/
│   │   │   │   ├── MainActivity.kt
│   │   │   │   ├── InventoryApp.kt           # Application class
│   │   │   │   │
│   │   │   │   ├── data/
│   │   │   │   │   ├── api/
│   │   │   │   │   │   ├── ApiClient.kt      # Retrofit instance
│   │   │   │   │   │   ├── AuthApi.kt        # Login endpoints
│   │   │   │   │   │   ├── BatchApi.kt       # Batch endpoints
│   │   │   │   │   │   └── MobileApi.kt      # Mobile-specific endpoints
│   │   │   │   │   │
│   │   │   │   │   ├── local/
│   │   │   │   │   │   ├── AppDatabase.kt    # Room DB (offline cache)
│   │   │   │   │   │   ├── BatchDao.kt       # Cached batches
│   │   │   │   │   │   └── ActionQueue.kt    # Offline action queue
│   │   │   │   │   │
│   │   │   │   │   ├── models/
│   │   │   │   │   │   ├── Batch.kt          # Batch data class
│   │   │   │   │   │   ├── User.kt           # User data class
│   │   │   │   │   │   └── QueuedAction.kt   # Offline action model
│   │   │   │   │   │
│   │   │   │   │   └── repository/
│   │   │   │   │       ├── AuthRepository.kt  # Login, token storage
│   │   │   │   │       ├── BatchRepository.kt # Batch ops (online + offline)
│   │   │   │   │       └── SyncRepository.kt  # Sync queue when online
│   │   │   │   │
│   │   │   │   ├── ui/
│   │   │   │   │   ├── login/
│   │   │   │   │   │   ├── LoginScreen.kt
│   │   │   │   │   │   └── LoginViewModel.kt
│   │   │   │   │   │
│   │   │   │   │   ├── tailor/
│   │   │   │   │   │   ├── MyBatchesScreen.kt     # Tailor's assigned batches
│   │   │   │   │   │   ├── BatchDetailScreen.kt   # View batch details
│   │   │   │   │   │   └── TailorViewModel.kt
│   │   │   │   │   │
│   │   │   │   │   ├── checker/
│   │   │   │   │   │   ├── PendingChecksScreen.kt  # Checker's pending QC
│   │   │   │   │   │   ├── CheckBatchScreen.kt     # QC form (approve/reject)
│   │   │   │   │   │   └── CheckerViewModel.kt
│   │   │   │   │   │
│   │   │   │   │   ├── scanner/
│   │   │   │   │   │   └── QRScannerScreen.kt      # Camera QR scanner
│   │   │   │   │   │
│   │   │   │   │   └── common/
│   │   │   │   │       ├── StatusBadge.kt
│   │   │   │   │       ├── LoadingIndicator.kt
│   │   │   │   │       └── OfflineBanner.kt        # Shows when offline
│   │   │   │   │
│   │   │   │   └── utils/
│   │   │   │       ├── TokenManager.kt      # JWT storage (EncryptedSharedPrefs)
│   │   │   │       ├── NetworkMonitor.kt    # Connectivity check
│   │   │   │       └── SyncWorker.kt        # WorkManager — background sync
│   │   │   │
│   │   │   ├── res/
│   │   │   │   ├── layout/                  # XML layouts (if not Compose)
│   │   │   │   ├── values/
│   │   │   │   │   ├── strings.xml
│   │   │   │   │   ├── colors.xml
│   │   │   │   │   └── themes.xml
│   │   │   │   └── drawable/
│   │   │   │
│   │   │   └── AndroidManifest.xml
│   │   │
│   │   └── build.gradle.kts
│   │
│   ├── build.gradle.kts                     # Project-level gradle
│   ├── settings.gradle.kts
│   └── gradle.properties
│
├── infra/                            # Infrastructure & DevOps
│   ├── docker/
│   │   └── docker-compose.yml        # All services (backend, postgres, nginx, cloudflared)
│   │
│   ├── nginx/
│   │   └── nginx.conf                # Reverse proxy — serves web, proxies /api to backend
│   │
│   ├── cloudflare/
│   │   └── config.yml                # Cloudflare tunnel config for e-commerce access
│   │
│   ├── scripts/
│   │   ├── setup.sh                  # First-time setup (create .env, init DB, seed)
│   │   ├── backup.sh                 # Daily PostgreSQL backup → encrypt → upload to Supabase
│   │   ├── restore.sh                # Download from Supabase → decrypt → restore
│   │   ├── seed.sh                   # Run seed scripts (roles, test users, sample data)
│   │   └── generate-apk-link.sh      # Generate LAN download link for mobile APK
│   │
│   └── cron/
│       └── crontab                   # Scheduled tasks (backup, reservation expiry)
│
├── Guardian/                         # Project Documentation + CLI launcher
│   ├── CLAUDE.md                     # Session log + project context
│   ├── guardian.md                   # Guardian agent protocols
│   ├── guardian_init.bat             # CLI launcher
│   ├── STEP1_SYSTEM_OVERVIEW.md      # Architecture, roles, production flow
│   ├── STEP2_DATA_MODEL.md           # 17 tables, ER diagram, constraints
│   ├── STEP3_EVENT_CONTRACTS.md      # Inventory events, batch state machine
│   ├── STEP4_API_CONTRACTS.md        # 50 endpoints, auth, RBAC
│   └── STEP5_FOLDER_STRUCTURE.md     # THIS FILE
│
├── .gitignore                        # Git ignore rules
└── .env.example                      # Root-level env template
```

---

## 5.3 Backend Layer Separation

```
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  REQUEST FLOW:                                                 │
│                                                                 │
│  Client → api/ (routes) → services/ (logic) → models/ (DB)    │
│                ↑                  ↑                              │
│           schemas/            core/                              │
│        (validation)     (security, errors)                      │
│                                                                 │
│  RULES:                                                        │
│  • api/ layer: THIN — parse request, call service, return      │
│  • services/ layer: ALL business logic lives here              │
│  • models/ layer: ORM only — no logic                          │
│  • schemas/ layer: Validation + serialization only             │
│  • core/ layer: Cross-cutting (auth, errors, permissions)      │
│                                                                 │
│  NEVER:                                                        │
│  • Put business logic in routes (api/)                         │
│  • Put DB queries directly in routes                           │
│  • Import models in routes (go through services)               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5.4 Web Frontend Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  DATA FLOW:                                                    │
│                                                                 │
│  pages/ → hooks/ → api/ → Backend                              │
│    ↑        ↑                                                   │
│  components/  context/                                          │
│  (UI pieces)  (auth state)                                     │
│                                                                 │
│  RULES:                                                        │
│  • pages/ — 1 page per route, composes components              │
│  • components/ — reusable, no direct API calls                 │
│  • api/ — all HTTP calls, returns parsed data                  │
│  • hooks/ — bridge between pages and api layer                 │
│  • context/ — global state (auth only, no Redux needed)        │
│                                                                 │
│  ROLE-BASED RENDERING:                                         │
│  • Sidebar menu filtered by user.role                          │
│  • ProtectedRoute checks role before rendering page            │
│  • Forms show/hide fields based on permissions                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5.5 Mobile App Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MOBILE ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  OFFLINE-FIRST PATTERN:                                        │
│                                                                 │
│  UI (Screens) → ViewModel → Repository → API / Local DB        │
│                                                                 │
│  RULES:                                                        │
│  • Repository decides: online? → API call, offline? → queue    │
│  • ActionQueue stores pending actions in Room DB               │
│  • SyncWorker (WorkManager) retries when connectivity returns  │
│  • TokenManager uses EncryptedSharedPreferences                │
│                                                                 │
│  SCREENS BY ROLE:                                              │
│  • Tailor: Login → My Batches → Scan QR → Start/Submit        │
│  • Checker: Login → Pending Checks → Scan QR → Approve/Reject │
│  • Supervisor: Login → Scan QR → Quick stock-in (optional)     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5.6 Docker Compose Services

```yaml
# infra/docker/docker-compose.yml — Service Map

services:
  postgres:       # PostgreSQL 16 — port 5432
  backend:        # FastAPI — port 8000 (depends: postgres)
  nginx:          # Nginx — port 80/443 (serves web build, proxies /api)
  cloudflared:    # Cloudflare Tunnel (exposes /api/v1/external to internet)
```

```
┌────────────────────────────────────────────────────────────────┐
│                      DOCKER NETWORK                             │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────┐     ┌──────────┐     ┌────────────┐            │
│  │  nginx   │────►│ backend  │────►│ postgresql │            │
│  │  :80     │     │  :8000   │     │   :5432    │            │
│  └────┬─────┘     └──────────┘     └────────────┘            │
│       │                │                                      │
│       │                │                                      │
│   Serves web       ┌──────────────┐                          │
│   static files     │ cloudflared  │──► Cloudflare Tunnel     │
│                    └──────────────┘    (external API only)    │
│                                                               │
└────────────────────────────────────────────────────────────────┘
```

---

## 5.7 Key File Purposes

### Backend Critical Files

| File | Purpose |
|------|---------|
| `main.py` | App init, CORS origins (LAN IPs), lifespan (startup/shutdown) |
| `config.py` | `DATABASE_URL`, `JWT_SECRET`, `API_KEY`, `BACKUP_BUCKET` from `.env` |
| `database.py` | `async_engine`, `AsyncSession`, `get_db` dependency |
| `dependencies.py` | `get_current_user`, `require_permission("stock_in")` |
| `core/security.py` | `create_access_token()`, `verify_token()`, `hash_password()` |
| `core/permissions.py` | `@require_role("supervisor")` decorator |
| `core/code_generator.py` | `next_roll_code(challan, fabric, color)`, `next_batch_code()`, `next_lot_code()`, etc. |
| `services/inventory_service.py` | Event processing pipeline (validate → insert → update state) |

### Web Critical Files

| File | Purpose |
|------|---------|
| `api/client.js` | Axios with `baseURL`, JWT interceptor, 401 → refresh queue |
| `api/mock.js` | Full mock data store — enables `VITE_USE_MOCK=true` mode |
| `context/AuthContext.jsx` | Stores token + user + role + roleDisplayName + permissions |
| `routes/ProtectedRoute.jsx` | Redirects to login if no token, blocks by role |
| `components/layout/Sidebar.jsx` | Role-filtered menu (Admin 11, Supervisor 7, Billing 4) |
| `components/common/Modal.jsx` | Overlay dialog with `wide`/`extraWide`, scrollable body |

### Infra Critical Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Single command to spin up entire system |
| `nginx.conf` | Routes `/` → web build, `/api` → backend:8000 |
| `backup.sh` | `pg_dump` → `gpg --encrypt` → `supabase storage cp` |
| `setup.sh` | First-run: create `.env`, `docker-compose up`, `alembic upgrade`, seed |

---

## 5.8 .gitignore

```
# Python
__pycache__/
*.pyc
.venv/
backend/.env

# Node
node_modules/
frontend/dist/
frontend/.env

# Android
mobile/.gradle/
mobile/app/build/
mobile/local.properties

# IDE
.vscode/
.idea/

# System
.DS_Store
Thumbs.db

# Infra
infra/docker/.env
*.gz
```

---

## 5.9 File Count Summary

| Layer | Folders | Files (approx) | Status |
|-------|---------|-----------------|--------|
| Backend | 10 | ~90 | ✅ Complete (all services implemented) |
| Web Frontend | 10 | ~55 | ✅ Complete (128 Vite modules, 0 errors) |
| Mobile | 10 | ~30 | ⏳ Phase 6C (future) |
| Infra | 4 | ~8 | ⏳ Phase 6D (future) |
| Docs | 1 | 7 | ✅ Updated (v1.1) |
| **Total** | **35** | **~190** | |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-07 | Initial draft |
| 1.1 | 2026-02-17 | Updated for Sessions 7-15: frontend/ (not web/), lot files, mock layer, 17 models, 65+ service methods, 128 Vite modules |

---

**Next:** STEP 6 - Scaffolding (only after Steps 3, 4, 5 approved)
