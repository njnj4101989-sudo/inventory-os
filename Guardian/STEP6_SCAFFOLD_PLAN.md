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

## 6.4 Phase 6B — Web Frontend Scaffold (Summary)

**Tech:** React 18 | Vite | TailwindCSS | Axios
**Target:** Runnable app — `npm run dev`

| # | Task | Description |
|---|------|-------------|
| 6B-1 | Project setup | Vite + React + Tailwind + dependencies |
| 6B-2 | API client | Axios instance, interceptors, JWT refresh |
| 6B-3 | Auth context | AuthContext, useAuth hook, login/logout |
| 6B-4 | Layout | Sidebar (role-filtered), Header, Layout shell |
| 6B-5 | Routes | Route config, ProtectedRoute guard |
| 6B-6 | Common components | DataTable, Modal, StatusBadge, SearchInput, Pagination |
| 6B-7 | Pages (Admin) | DashboardPage, UsersPage |
| 6B-8 | Pages (Supervisor) | RollsPage, SKUsPage, BatchesPage, SuppliersPage |
| 6B-9 | Pages (Billing) | OrdersPage, InvoicesPage, ReportsPage |
| 6B-10 | Pages (Detail) | BatchDetailPage, OrderDetailPage, InventoryPage |
| 6B-11 | Forms | RollForm, SKUForm, BatchForm, OrderForm, UserForm |

### 6B Completion Criteria

```
✅ npm run dev serves app on localhost
✅ Login page → auth → dashboard redirect
✅ Role-based sidebar (admin sees all, tailor sees nothing)
✅ All pages render with placeholder data
✅ API client wired to backend base URL
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
