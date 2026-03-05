# Inventory-OS — Project Session Log

## Quick Resume: Say "continue project" to pick up where we left off.

### Start Here
1. `uvicorn app.main:app --reload --port 8000`
2. `cd frontend && npm run dev` → http://localhost:5173
3. **Production:** `https://inventory.drsblouse.com` (Vercel ✅) + `https://api-inventory.drsblouse.com` (AWS EC2 ✅)
4. Login: `admin` → `/dashboard` | `tailor1` → `/my-work` | `checker1` → `/qc-queue`

---

## Document Directory

| Document | Purpose | When to Read |
|----------|---------|-------------|
| `CLAUDE.md` | Session log, project state, architecture | Every session start |
| `guardian.md` | Protocols, rules, coding standards | Before any coding |
| `API_REFERENCE.md` | **THE** source of truth for API shapes | Before any frontend↔backend work |
| `STEP1_SYSTEM_OVERVIEW.md` | Role matrix, production flow | Architecture decisions |
| `STEP2_DATA_MODEL.md` | 24 tables, columns, types, FKs | Model/migration changes |
| `STEP3_EVENT_CONTRACTS.md` | Events, side effects, 7-state batch machine | Business logic |
| `STEP4_API_CONTRACTS.md` | Endpoint paths, auth, permissions | Route/controller work |
| `STEP5_FOLDER_STRUCTURE.md` | File placement, layer rules | New file creation |
| `STEP6_EXECUTION_PLAN.md` | Phase breakdown, task dependencies | Planning |
| `AWS_DEPLOYMENT.md` | Hybrid deploy plan (Vercel + EC2 + RDS) | Deployment day |

**Quick lookup:** API shapes → `API_REFERENCE.md` | Table columns → `STEP2` | Events → `STEP3` | Endpoints → `STEP4` | Roles → `STEP1 §1.4` | Batch state machine → `STEP3 §3.4` | Deploy → `AWS_DEPLOYMENT.md`

---

## Current State (Session 64 — 2026-03-06)

### S64: Phase 4 Production Readiness — ALL 9 Fixes Deployed

**Backend audit COMPLETE.** 4 phases, 59 findings, 58 fixed, 1 deferred (rate limiting).
Full details: `Guardian/BACKEND_AUDIT_PLAN.md` ✅ COMPLETED

- P4-1: Strong 64-char JWT_SECRET on EC2
- P4-2: DB credentials redacted from public repo → stored in local `credentials.md`
- P4-3: Swagger/ReDoc/OpenAPI disabled in production (`APP_ENV=production`)
- P4-4: `pool_pre_ping=True` + `pool_recycle=1800` on PostgreSQL
- P4-5: CORS — only `https://inventory.drsblouse.com` (removed localhost)
- P4-6: Nginx security headers (HSTS, nosniff, DENY, XSS)
- P4-7: Nginx `client_max_body_size 5m`
- P4-8: Structured logging with timestamp format
- P4-9: Rate limiting — DEFERRED (future: `slowapi`)
- P4-10: `asyncio.get_running_loop()` replaces deprecated `get_event_loop()`

**Commit:** `cd42ae5` | Deployed + smoke tested

---

## Previous Sessions (S59–S63) — Backend Audit Sprint

- **S63:** Phase 3 Data Flow — 9 fixes (FOR UPDATE race protection, remaining_weight CHECK, lot state machine, code generator locking)
- **S62:** Phase 2 Query Optimization — 14 fixes (N+1 elimination, GROUP BY, batch fetches, ~50% fewer DB round-trips)
- **S61:** Phase 1 DB Structure — 26 fixes (indexes, CHECK constraints, ondelete rules) + deployed to prod
- **S60:** Bulk stock-in + supplier invoices endpoints + mock vs real audit (zero mismatches) + Phase 1 audit
- **S59:** Stock-in bug blitz — 7 bugs fixed (page_size override root cause, NaN weight, orphan rolls) + compact ERP UI

---

## Previous State (Session 58 — 2026-03-05)

### S58: Quick Master (Shift+M) — Inline Master Create from Any Form

- `useQuickMaster` hook + `QuickMasterModal` component
- Integrated in: RollsPage, LotsPage, SendForVAModal
- Protocol 8 added to guardian.md

---

## Previous State (Session 56 — 2026-03-04)

### S56: C4+C7 — AWS Backend LIVE + Production CORS

**Full stack now in production.**

- **C7 CORS:** Removed `trycloudflare.com` regex (security), added `https://inventory.drsblouse.com`
- **C4 EC2:** `t3.micro` (free tier), Ubuntu 22.04, Elastic IP `43.204.66.254`
  - SSH: `ssh -i drs-inventory-key.pem ubuntu@43.204.66.254`
  - Key file: `C:\Users\HP\drs-inventory-key.pem`
  - Gunicorn: 2 UvicornWorkers, systemd managed (`sudo systemctl restart fastapi`)
  - Nginx: reverse proxy + SSE support (`proxy_buffering off`)
  - SSL: Let's Encrypt, auto-renews, expires 2026-06-01
- **C4 RDS:** `db.t3.micro` PostgreSQL 16.6, encrypted, EC2-only access
  - Endpoint: `[see EC2 .env]`
  - DB: `drs_inventory`, User: `postgres`, Pass: `[see EC2 .env]`
  - 24 tables, seeded: 5 roles, 5 users, 5 product types, 30 colors, 10 VAs
- **Fix:** `Base.created_at` → `DateTime(timezone=True)` for asyncpg compatibility
- **Fix:** Mobile login failure — password `autoCapitalize="off"` on LoginPage
- **Fix:** Service worker 5s timeout → changed `/api/` from `NetworkFirst(5s)` to `NetworkOnly`
- **DNS:** GoDaddy A record `api-inventory` → `43.204.66.254` (propagated)
- **IAM:** User `Nitish` with EC2/RDS/VPC FullAccess + Vercel policy
- **Repo:** Made public for EC2 git clone

---

## Previous State (Session 55 — 2026-03-04)

### S55: C5 Vercel Frontend Deploy — LIVE

- CLAUDE.md optimized: 44K → 12K chars (72% reduction)
- Vercel project `inventory-os` created (same account as `fashion-ecommerce`/`drsblouse.com`)
- Env vars: `VITE_API_URL=https://api-inventory.drsblouse.com/api/v1`, `VITE_USE_MOCK=false`
- GoDaddy CNAME: `inventory` → `cname.vercel-dns.com`
- **https://inventory.drsblouse.com** — LIVE, SSL active, login page rendering
- Auto-deploy on push to `main` (Vercel built-in)
- Vercel CLI authenticated for future domain/project management

---

## Previous State (Session 54 — 2026-03-03)

### S54: Batch VA Tracking — "Out for VA" Tab + Challan Print

**Zero backend changes.** All data from existing endpoints.

- **BatchChallan.jsx (New):** A4 print component mirroring `JobChallan.jsx` — title "BATCH CHALLAN", CSS prefix `bc-`, columns: # / Batch Code / Size / Pieces / Phase
- **SendForVAModal.jsx:** +`onPrintChallan` prop — auto-opens print overlay after successful `createBatchChallan()`
- **BatchesPage.jsx "Out for VA" tab:**
  - Permission-gated (`canSendVA || canReceiveVA`), amber active state
  - VA color map: 10 entries (EMB=purple, DYE=amber, DPT=sky, HWK=rose, SQN=pink, BTC=teal, HST=orange, BTN=indigo, LCW=lime, FIN=gray)
  - State: `batchChallansData`, `bcLoading`, `bcVAFilter`, `bcProcessorFilter`, `bcSearch`, `showBatchChallan`, `batchChallanData`
  - Fetch: `getBatchChallans({ status: 'sent', page_size: 200 })` on tab switch
  - 4 KPIs: Challans Out / Total Pieces / Processors / Overdue >14d
  - Filter bar: VA Type + Processor + Search + Clear
  - 3-col challan cards with Print + Receive buttons, days-out badges
  - Print chaining: SendForVAModal → auto-opens BatchChallan after send
  - `visibleTabs` via `useMemo` (TABS + conditional VA tab)
- **Batch Passport:** Already complete (ScanPage lines 381-434)

**Files:** 1 created (BatchChallan.jsx), 2 modified (SendForVAModal.jsx, BatchesPage.jsx). **Build: 0 errors.**

---

## Phase Tracker

**PHASE A (S1-42):** Full stack scaffold + 14 pages + QR system + lots + batches + print + PWA + mobile — ALL COMPLETE

**PHASE B (S46-52):** Page Overhauls — ALL COMPLETE
- S46: Per-Color QC + SKU Auto-Gen | S47: SKU Detail + Color Master | S48: Orders + Invoices overhaul
- S49: Order Create Picker + Typography + Keyboard | S50: KPI Typography + Dashboard Grid + Sidebar
- S51: Invoice-to-Lot Shortcut (A+B+C) | S52: Roll Picker Group By

**PHASE B-VA (S43-45, S54):** Batch VA + Packing — ALL COMPLETE
- S43: Backend (BatchChallan + BatchProcessing models, 7-state machine, 6 endpoints)
- S44: Frontend (VA modals, permission system upgrade)
- S45: Testing + docs (dashboard KPIs, E2E audit, batch passport print)
- S54: Out for VA tab + BatchChallan print + next-number preview

**PHASE C: Deploy**

| # | Step | Status |
|---|------|--------|
| C1 | SQLite → PostgreSQL migration code | ✅ S53 |
| C2 | SSE backend — EventBus + streaming endpoint | ✅ S53 |
| C3 | SSE frontend — Toast + Bell + Notifications | ✅ S53 |
| C4 | AWS EC2 + RDS setup | ✅ S56 — `api-inventory.drsblouse.com` LIVE |
| C5 | Vercel frontend deploy + GoDaddy DNS | ✅ S55 — `inventory.drsblouse.com` LIVE |
| C6 | CI/CD GitHub Actions | ✅ S57 — backend auto-deploy on push, Vercel handles frontend |
| C7 | CORS production config | ✅ S56 — removed trycloudflare, added production origin |

**NICE-TO-HAVE (post-deploy):** Free size support | Feriwala (waste) | Reports enrichment | Thermal ZPL templates

---

## Key Architecture Decisions

### Batch System (S43-46)
- **7-state machine:** created → assigned → in_progress → submitted → checked → packing → packed
- **VA guard:** Can't submit/pack if BatchProcessing has `status='sent'`
- **Garment VA:** `BatchProcessing` (pieces) mirrors `RollProcessing` (kg). `BatchChallan` (BC-xxx) mirrors `JobChallan` (JC-xxx)
- **Packing:** Light — fields on Batch (packed_by, packed_at, pack_reference). `packed` fires `ready_stock_in`
- **Permissions:** 4 batch permissions configurable from Roles page. Backend: `require_permission()`. Frontend: `perms.batch_*`
- **`applicable_to`** on value_additions: `roll` / `garment` / `both`
- **Per-color QC:** `color_qc` JSON on Batch. Falls back to flat `approved_qty/rejected_qty`
- **SKU auto-gen at pack:** `find_or_create()` SKU = `{product_type}-{design}-{color}-{size}+{VA1}+{VA2}` → fire `ready_stock_in` per color
- **`product_type` on Lot:** BLS/KRT/SAR/DRS/OTH → flows lot → batch → SKU code

### Weight System (3 fields on Roll)
- `total_weight` — original supplier weight, **IMMUTABLE** after stock-in
- `current_weight` — post-VA weight (mutated by receive/update processing)
- `remaining_weight` — available for cutting/lots (mutated by send/receive/lot creation)
- Partial send: `weight_before` = amount sent (not full weight). Roll stays `in_stock` if `remaining_weight > 0`
- `JobChallanCreate.rolls` = `list[{roll_id, weight_to_send}]`

### Lot System
- Statuses: open → cutting → distributed (forward-only)
- Fields: `standard_palla_weight`, `standard_palla_meter`, `default_size_pattern` (JSON)
- `POST /lots/{id}/distribute` auto-creates batches from size pattern. `sku_id` nullable on batches
- Lot create overlay: full-page `fixed inset-0 z-50`, emerald gradient header

### QR & Scan System
- **Static QR, Dynamic Passport** — QR printed once, scan shows live DB data
- `/scan/roll/:roll_code` — PUBLIC, Roll Passport | `/scan/batch/:batch_code` — PUBLIC, Batch Passport
- `enhanced_roll_code` = `roll_code` + received VA short codes (computed, never stored)
- `effective_sku` = `BLS-101-Pink-M+EMB+SQN` (computed from base_sku + received VAs)
- QR sizes: 130px (print), 160px (screen scan)
- Scanner: Native `BarcodeDetector` on mobile Chrome 83+, `html5-qrcode` desktop fallback

### Value Additions
- `RollProcessing.value_addition_id` — REQUIRED FK (process_type removed S26)
- 10 seed VAs: EMB, DYE, DPT, HWK, SQN, BTC (roll/both) + HST, BTN, LCW, FIN (garment)
- Color map: EMB=purple, DYE=amber, DPT=sky, HWK=rose, SQN=pink, BTC=teal
- Job Challans: `POST /job-challans` atomic (creates challan + sends all rolls). Auto-sequential JC-001+

### PWA + Mobile (S38)
- Dual layout: Tailor/Checker → `MobileLayout` (bottom tabs), Admin/Supervisor/Billing → `Layout` (sidebar)
- BottomNav: 3 tabs — Scan / My Work (or QC Queue) / Profile
- Offline queue: `useOfflineQueue` hook, localStorage-persisted, auto-syncs on reconnect
- Production CORS: `https://inventory.drsblouse.com` only

### UI Patterns
- **Print:** `react-to-print` + `useReactToPrint({ contentRef })` + fixed overlay `z-50`, A4 inline styles
- **Typography:** Inter font (400-800), `.typo-label`/`.typo-data` CSS classes, DataTable `<th>` text-gray-600
- **Roll code:** `{SrNo}-{Fabric3}-{Color5/ColorNo}-{Seq}` (Sr. No. = internal filing serial)
- **SKU pattern:** `ProductType-DesignNo-Color-Size` (e.g. `BLS-101-Red-M`)
- **Response shapes:** All FK UUIDs return nested objects. Authority: `mock.js → API_REFERENCE.md → backend`

### SSE Real-Time (S53)
- Backend: `event_bus.py` singleton → `asyncio.Queue` per client → `GET /events/stream?token=<jwt>`
- Frontend: `NotificationContext.jsx` (EventSource + exponential backoff), `Toast.jsx`, `NotificationBell.jsx`
- 10 emit calls across 6 services. 30s heartbeat. Nginx: `proxy_buffering off; proxy_read_timeout 86400;`

### AWS Deployment (S42)
- **Frontend:** Vercel (free forever) — `vercel.json` SPA rewrites + `allowedHosts`
- **Backend:** AWS EC2 t2.micro + Nginx + Gunicorn + FastAPI (free 12 months)
- **Database:** AWS RDS PostgreSQL db.t3.micro (free 12 months)
- **Cost:** ₹0 year 1, ~₹2,300/mo after. Guide: `Guardian/AWS_DEPLOYMENT.md`

### PostgreSQL Migration (S53)
- SQLite for dev, PostgreSQL on AWS RDS only. `psycopg2-binary` for Alembic sync
- Seeds cleaned: removed Suppliers/SKUs/Fabrics (add from Masters page). Kept ProductTypes/Colors/VAs
- Old migrations deleted. Fresh `alembic revision --autogenerate` on deploy target
- `DATABASE_URL`: `sqlite+aiosqlite:///./inventory_os.db` → `postgresql+asyncpg://user:pass@host:5432/inventory_os`

---

## Session History (Compressed)

| Session | What | Key Changes |
|---------|------|-------------|
| S1-6 | Full Stack Scaffold | 22 models, 19 schemas, 15 services, 14 pages, auth, layout |
| S7-8 | Users & Roles + LOT entity | SKU pattern, weight-based rolls |
| S9-14 | UI Polish + Backend Integration | Suppliers, Rolls 3-tab, challan stock-in, invoice detail, filters |
| S15-20 | Backend Complete + Integration | All 13 services implemented, master data, API_REFERENCE created |
| S21-26 | QR Phase 1+2 | Labels, ScanPage, CameraScanner, ValueAddition model, enhanced_roll_code |
| S27-30 | Weight System + Job Challans | 3-weight system, partial sends, atomic bulk send |
| S31-37 | Lots + Batches + Print | Lot redesign, cutting sheet, distribution, BatchesPage, Inter typography |
| S38-42 | Mobile + Deploy Prep | PWA, dual layout, offline queue, native BarcodeDetector, AWS decision |
| S43-45 | Batch VA + Packing | 2 models, 7-state machine, 6 endpoints, VA modals, permission system, E2E audit |
| S46 | Per-Color QC + SKU Auto-Gen | color_qc on Batch, product_type on Lot, pack→auto-SKU, ready_stock_in fix |
| S47 | SKU Detail + Color Master | GET /skus/{id} with source_batches, colorUtils.js shared utility |
| S48 | Orders + Invoices Overhaul | Full rewrite both pages, design-grid create, A4 print invoice, OrderForm deleted |
| S49 | Order Picker + Typography + Keyboard | Picker pattern, .typo-label/.typo-data, full keyboard nav (Ctrl+S/Esc/Tab/Enter/Delete) |
| S50 | KPI Typography + Dashboard + Sidebar | 8 pages KPI uplift, 4+4 dashboard grid, sidebar sections (Commerce→Production→Setup) |
| S51 | Invoice-to-Lot Shortcut | LotsPage preselect receiver, Shift+Click in invoice, Create Lot button, multi-design dialog |
| S52 | Roll Picker Group By | 4 modes (Sr.No/Fabric/Color/Supplier), dynamic badges, compact dropdown |
| S53 | PostgreSQL + SSE Notifications | C1: PG migration code, C2: EventBus + SSE endpoint, C3: Toast + Bell + NotificationContext |
| S54 | Batch VA Tracking | Out for VA tab, BatchChallan print, next-number preview, onPrintChallan prop |
| S55 | Vercel Frontend Deploy | CLAUDE.md optimized (44K→12K), Vercel project + env vars + GoDaddy CNAME, `inventory.drsblouse.com` LIVE |
| S56 | AWS Backend Deploy + Mobile Fixes | C4+C7: EC2+RDS+Nginx+SSL+CORS. 3 fixes: DateTime(tz), password autoCapitalize, SW 5s timeout. Full stack LIVE |
| S57 | Roll Delete + Stock-In Edit + SSE Refresh | DELETE /rolls/{id}, partial stockInBulk, SSE token auto-refresh, batch eager loading |
| S58 | Quick Master (Shift+M) | Inline create from any form dropdown — useQuickMaster hook + QuickMasterModal + Protocol 8 |
| S59 | Stock-In Bug Blitz | 7 bugs fixed: page_size override (root cause), NaN weight, rIdx, [object Object], Ctrl+S, color reorder, orphan rolls. Invoice search + grouping collision. Compact ERP UI. Next: mock vs real audit + backend invoice layer |
| S60 | Backend Invoice Layer + DB Audit | Bulk stock-in + supplier invoices endpoints. Mock vs real audit (zero mismatches). Phase 1 DB audit: 26 findings |
| S61 | Phase 1 DB Fix + Phase 2 Audit | Fixed all 26 DB findings (indexes, checks, ondelete). Deployed to prod. Phase 2 query audit: 14 findings |
| S62 | Phase 2 Query Fixes | All 14 query findings fixed. Zero logic changes. ~50% fewer DB round-trips across dashboard, rolls, batches, lots, orders, inventory |
| S63 | Phase 3 Data Flow Integrity | 9 fixes: FOR UPDATE race protection, remaining_weight CHECK, lot state machine, code generator locking |
| S64 | Phase 4 Production Readiness | 9 fixes: Swagger disabled, strong JWT, CORS hardened, Nginx headers, structured logging, pool_pre_ping |

**Backend audit COMPLETE (S60-S64).** 4 phases, 59 findings, 58 fixed, 1 deferred. See `BACKEND_AUDIT_PLAN.md`.

---

## Key Credentials
- **Mock login:** admin1/supervisor1/tailor1/checker1/billing1 — password: `test1234`
- **Real DB login:** admin/supervisor/billing/tailor1/checker1 — password: `test1234`
- **Mock switch:** `VITE_USE_MOCK=true` in frontend `.env`

---

## Project Structure
```
inventory-os/
├── Guardian/           ← Docs (CLAUDE.md, guardian.md, API_REFERENCE.md, STEP1-6, AWS_DEPLOYMENT.md)
├── backend/app/        ← FastAPI (models/24, schemas/20, services/16, api/17, core/, tasks/)
├── frontend/src/       ← React+Tailwind (api/17, pages/14+Login, components/, context/, hooks/)
└── mobile/             ← Phase 6C (future)
```
