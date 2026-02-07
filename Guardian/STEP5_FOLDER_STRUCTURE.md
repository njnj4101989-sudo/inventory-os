# STEP 5: FOLDER STRUCTURE
## Inventory-OS | Production-Grade Textile Inventory System

**Version:** 1.0
**Status:** Draft
**Date:** 2026-02-07

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
│   │   ├── models/                   # SQLAlchemy ORM models (1 file per table)
│   │   │   ├── __init__.py           # Export all models
│   │   │   ├── role.py               # Role model
│   │   │   ├── user.py               # User model
│   │   │   ├── supplier.py           # Supplier model
│   │   │   ├── roll.py               # Roll model
│   │   │   ├── sku.py                # SKU model
│   │   │   ├── batch.py              # Batch model
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
│   │   ├── schemas/                  # Pydantic request/response schemas
│   │   │   ├── __init__.py
│   │   │   ├── auth.py               # LoginRequest, TokenResponse
│   │   │   ├── user.py               # UserCreate, UserUpdate, UserResponse
│   │   │   ├── role.py               # RoleResponse
│   │   │   ├── supplier.py           # SupplierCreate, SupplierResponse
│   │   │   ├── roll.py               # RollCreate (stock-in), RollResponse
│   │   │   ├── sku.py                # SKUCreate, SKUResponse
│   │   │   ├── batch.py              # BatchCreate, BatchAssign, BatchCheck, BatchResponse
│   │   │   ├── inventory.py          # InventoryResponse, AdjustRequest, EventResponse
│   │   │   ├── order.py              # OrderCreate, OrderResponse, ShipRequest
│   │   │   ├── invoice.py            # InvoiceResponse
│   │   │   ├── dashboard.py          # SummaryResponse, PerformanceResponse
│   │   │   ├── mobile.py             # ScanRequest, ScanResponse, MyBatchResponse
│   │   │   ├── external.py           # ReserveRequest, ConfirmRequest, StockResponse
│   │   │   └── common.py             # PaginatedResponse, ErrorResponse, SuccessResponse
│   │   │
│   │   ├── api/                      # Route handlers (thin — call services)
│   │   │   ├── __init__.py
│   │   │   ├── router.py             # Main router — includes all sub-routers
│   │   │   ├── auth.py               # /api/v1/auth/*
│   │   │   ├── users.py              # /api/v1/users/*
│   │   │   ├── roles.py              # /api/v1/roles/*
│   │   │   ├── suppliers.py          # /api/v1/suppliers/*
│   │   │   ├── rolls.py              # /api/v1/rolls/*
│   │   │   ├── skus.py               # /api/v1/skus/*
│   │   │   ├── batches.py            # /api/v1/batches/*
│   │   │   ├── inventory.py          # /api/v1/inventory/*
│   │   │   ├── orders.py             # /api/v1/orders/*
│   │   │   ├── invoices.py           # /api/v1/invoices/*
│   │   │   ├── dashboard.py          # /api/v1/dashboard/*
│   │   │   ├── mobile.py             # /api/v1/mobile/*
│   │   │   └── external.py           # /api/v1/external/*
│   │   │
│   │   ├── services/                 # Business logic (all logic lives here)
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py       # Login, token generation, refresh
│   │   │   ├── user_service.py       # User CRUD
│   │   │   ├── supplier_service.py   # Supplier CRUD
│   │   │   ├── roll_service.py       # Stock-in, roll queries
│   │   │   ├── sku_service.py        # SKU CRUD, auto-code generation
│   │   │   ├── batch_service.py      # Batch lifecycle (create, assign, start, submit, check)
│   │   │   ├── inventory_service.py  # Event processing, state computation, reconciliation
│   │   │   ├── order_service.py      # Order lifecycle (create, ship, cancel, return)
│   │   │   ├── invoice_service.py    # Invoice generation, PDF
│   │   │   ├── reservation_service.py # Reserve, confirm, release, expiry
│   │   │   ├── dashboard_service.py  # Stats, reports, aggregations
│   │   │   └── qr_service.py         # QR code generation
│   │   │
│   │   ├── core/                     # Cross-cutting concerns
│   │   │   ├── __init__.py
│   │   │   ├── security.py           # JWT encode/decode, password hashing
│   │   │   ├── permissions.py        # RBAC decorator/dependency
│   │   │   ├── exceptions.py         # Custom exception classes
│   │   │   ├── error_handlers.py     # Global exception handlers
│   │   │   └── code_generator.py     # Sequential code generators (ROLL-XXXX, BATCH-XXXX, etc.)
│   │   │
│   │   └── tasks/                    # Background tasks
│   │       ├── __init__.py
│   │       ├── reservation_expiry.py # Auto-expire stale reservations
│   │       └── backup_sync.py        # Supabase backup worker
│   │
│   ├── migrations/                   # Alembic database migrations
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/                 # Migration files (auto-generated)
│   │       └── .gitkeep
│   │
│   ├── tests/                        # Backend tests
│   │   ├── __init__.py
│   │   ├── conftest.py               # Fixtures (test DB, test client, auth tokens)
│   │   ├── test_auth.py
│   │   ├── test_users.py
│   │   ├── test_rolls.py
│   │   ├── test_skus.py
│   │   ├── test_batches.py
│   │   ├── test_inventory.py
│   │   ├── test_orders.py
│   │   ├── test_invoices.py
│   │   └── test_external.py
│   │
│   ├── seeds/                        # Seed data for development
│   │   ├── seed_roles.py             # 5 default roles with permissions
│   │   ├── seed_users.py             # Test users (1 per role)
│   │   └── seed_data.py              # Sample suppliers, rolls, SKUs
│   │
│   ├── alembic.ini                   # Alembic config
│   ├── requirements.txt              # Python dependencies
│   ├── Dockerfile                    # Backend container
│   └── .env.example                  # Environment template
│
├── web/                              # React Web Frontend
│   ├── public/
│   │   ├── index.html
│   │   ├── favicon.ico
│   │   └── manifest.json
│   │
│   ├── src/
│   │   ├── main.jsx                  # React entry point
│   │   ├── App.jsx                   # Root component, router setup
│   │   │
│   │   ├── api/                      # API client layer
│   │   │   ├── client.js             # Axios instance, interceptors, base URL
│   │   │   ├── auth.js               # login(), refresh(), logout()
│   │   │   ├── users.js              # getUsers(), createUser(), updateUser()
│   │   │   ├── suppliers.js          # getSuppliers(), createSupplier()
│   │   │   ├── rolls.js              # getRolls(), stockIn()
│   │   │   ├── skus.js               # getSKUs(), createSKU()
│   │   │   ├── batches.js            # getBatches(), createBatch(), assignBatch()
│   │   │   ├── inventory.js          # getInventory(), getEvents(), adjust()
│   │   │   ├── orders.js             # getOrders(), createOrder(), shipOrder()
│   │   │   ├── invoices.js           # getInvoices(), markPaid(), downloadPDF()
│   │   │   └── dashboard.js          # getSummary(), getTailorPerf(), getMovement()
│   │   │
│   │   ├── hooks/                    # Custom React hooks
│   │   │   ├── useAuth.js            # Auth state, login/logout actions
│   │   │   ├── useApi.js             # Generic fetch hook (loading, error, data)
│   │   │   └── usePagination.js      # Pagination state
│   │   │
│   │   ├── context/                  # React context providers
│   │   │   └── AuthContext.jsx        # Auth provider (token, user, role)
│   │   │
│   │   ├── pages/                    # Full page components (1 per route)
│   │   │   ├── LoginPage.jsx
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── UsersPage.jsx         # Admin only
│   │   │   ├── SuppliersPage.jsx
│   │   │   ├── RollsPage.jsx         # Stock-in + roll list
│   │   │   ├── SKUsPage.jsx
│   │   │   ├── BatchesPage.jsx       # Create + assign + status tracking
│   │   │   ├── BatchDetailPage.jsx   # Single batch timeline view
│   │   │   ├── InventoryPage.jsx     # Stock levels + events log
│   │   │   ├── OrdersPage.jsx        # Order list + create + actions
│   │   │   ├── OrderDetailPage.jsx   # Single order view
│   │   │   ├── InvoicesPage.jsx
│   │   │   └── ReportsPage.jsx       # Tailor perf, inventory movement
│   │   │
│   │   ├── components/               # Reusable UI components
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.jsx       # Navigation sidebar (role-based menu)
│   │   │   │   ├── Header.jsx        # Top bar (user info, logout)
│   │   │   │   └── Layout.jsx        # Page shell (sidebar + header + content)
│   │   │   │
│   │   │   ├── common/
│   │   │   │   ├── DataTable.jsx     # Sortable, paginated table
│   │   │   │   ├── Modal.jsx         # Reusable modal dialog
│   │   │   │   ├── StatusBadge.jsx   # Colored badge for status values
│   │   │   │   ├── SearchInput.jsx   # Debounced search field
│   │   │   │   ├── Pagination.jsx    # Page navigation
│   │   │   │   ├── LoadingSpinner.jsx
│   │   │   │   └── ErrorAlert.jsx
│   │   │   │
│   │   │   └── forms/
│   │   │       ├── RollForm.jsx      # Stock-in form
│   │   │       ├── SKUForm.jsx       # Create/edit SKU
│   │   │       ├── BatchForm.jsx     # Create batch (select rolls, cut)
│   │   │       ├── OrderForm.jsx     # Create order (select SKUs, qty)
│   │   │       └── UserForm.jsx      # Create/edit user
│   │   │
│   │   ├── routes/                   # Route definitions + guards
│   │   │   ├── routes.js             # Route config array
│   │   │   └── ProtectedRoute.jsx    # Role-based route guard
│   │   │
│   │   └── utils/                    # Utilities
│   │       ├── constants.js          # Status values, role names, etc.
│   │       ├── formatters.js         # Date, currency, number formatters
│   │       └── validators.js         # Client-side form validation
│   │
│   ├── package.json
│   ├── vite.config.js                # Vite bundler config
│   ├── tailwind.config.js            # TailwindCSS config
│   ├── postcss.config.js
│   ├── Dockerfile                    # Web container (nginx serves build)
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
├── docs/                             # Project Documentation (Steps 1-6)
│   ├── STEP1_SYSTEM_OVERVIEW.md
│   ├── STEP2_DATA_MODEL.md
│   ├── STEP3_EVENT_CONTRACTS.md
│   ├── STEP4_API_CONTRACTS.md
│   ├── STEP5_FOLDER_STRUCTURE.md     # THIS FILE
│   └── STEP6_SCAFFOLD_LOG.md         # Will log scaffolding progress
│
├── guardian.md                       # Guardian agent protocols
├── project-context.json              # Project snapshot for AI context
├── README.md                         # Project README
├── .gitignore                        # Git ignore rules
└── .env.example                      # Root-level env template (points to backend/.env)
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
| `core/code_generator.py` | `next_roll_code()`, `next_batch_code()`, `next_sku_code()` |
| `services/inventory_service.py` | Event processing pipeline (validate → insert → update state) |

### Web Critical Files

| File | Purpose |
|------|---------|
| `api/client.js` | Axios with `baseURL`, JWT interceptor, 401 → refresh logic |
| `context/AuthContext.jsx` | Stores token + user + role, provides login/logout |
| `routes/ProtectedRoute.jsx` | Redirects to login if no token, blocks by role |
| `components/layout/Sidebar.jsx` | Menu items filtered by `user.role` |

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
web/dist/
web/.env

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

| Layer | Folders | Files (approx) |
|-------|---------|-----------------|
| Backend | 10 | ~55 |
| Web Frontend | 10 | ~45 |
| Mobile | 10 | ~30 |
| Infra | 4 | ~8 |
| Docs | 1 | 6 |
| **Total** | **35** | **~144** |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-07 | Initial draft |

---

**Next:** STEP 6 - Scaffolding (only after Steps 3, 4, 5 approved)
