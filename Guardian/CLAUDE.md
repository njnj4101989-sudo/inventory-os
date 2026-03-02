# Inventory-OS — Project Session Log

## Quick Resume: Say "continue project" to pick up where we left off.

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

## Current State (Session 45 — 2026-03-03)

### Start Here
1. `uvicorn app.main:app --reload --port 8000`
2. `cd frontend && npm run dev` → test at http://localhost:5173
3. **Production (planned):** `https://inventory.drsblouse.com` (Vercel) + `https://api-inventory.drsblouse.com` (AWS EC2)
4. Login as `admin` → `/dashboard` | `tailor1` → `/my-work` | `checker1` → `/qc-queue`

### Batch VA + Packing — COMPLETE (S43-S45)

All 31 tasks verified against source code. Spec file deleted — content merged into STEP2/STEP3/API_REFERENCE.

**S43 (Backend):** BatchChallan + BatchProcessing models, migration `b1c2d3e4f5a6`, batch_challan_service, batch_service rewrite (VA guards, 7-state machine, packing flow, ready_stock_in event), 4 new batch-challan endpoints, 2 new batch endpoints, 4 new garment VA seeds (HST/BTN/LCW/FIN), applicable_to on VAs.

**S44 (Frontend):** batchChallans.js API + SendForVAModal + ReceiveFromVAModal. StatusBadge 7 states. MastersPage applicable_to badges/filter/form. ScanPage VA timeline + out-house alert + Ready for Packing + Mark Packed. BatchesPage VA send/receive + KPIs. Permission system upgrade: 4 new permissions (`batch_send_va/receive_va/ready_packing/pack`), backend `require_role` → `require_permission`, frontend `userRole ===` → `perms.batch_*`.

**S45 (Testing + Docs):** Dashboard 3 out-house KPIs + 7-state pipeline + checked/packed today. Batch passport print (react-to-print). E2E audit (14 steps, no gaps). Mobile flow audit. Mock data fix (UPPERCASE→lowercase, +processing_logs, +has_pending_va). Docs updated: API_REFERENCE (permissions), STEP2 (24 tables), STEP3 (7-state + VA guards + READY_STOCK_IN). Build: 0 errors.

---

### PENDING — Next Session (S46)

**PHASE B: Page Overhauls**

| # | Task | Effort |
|---|------|--------|
| 1 | SKUs page — align to API_REFERENCE.md §6 | Medium |
| 2 | Orders page — align to API_REFERENCE.md §10 | Medium |
| 3 | Invoices page — align to API_REFERENCE.md §11 | Medium |

**PHASE C: Deploy**

| # | Step | Guide |
|---|------|-------|
| 4 | SQLite → PostgreSQL migration code | `AWS_DEPLOYMENT.md` Step 4 |
| 5 | AWS EC2 + RDS setup | `AWS_DEPLOYMENT.md` Steps 1-3 |
| 6 | Vercel frontend deploy + GoDaddy DNS | `AWS_DEPLOYMENT.md` Steps 5-6 |
| 7 | CI/CD GitHub Actions | `AWS_DEPLOYMENT.md` Step 7 |
| 8 | CORS production config | Remove `trycloudflare.com`, add fixed domain |

**NICE-TO-HAVE (post-deploy):**

| # | Task |
|---|------|
| 9 | "Free" size support in size pattern |
| 10 | Feriwala (waste disposition) |
| 11 | Reports page enrichment |
| 12 | Thermal printer ZPL templates |

---

## Key Architecture Decisions

### Batch VA + Packing (S43-S45)
- **7-state batch machine:** created → assigned → in_progress → submitted → checked → packing → packed (`completed` renamed to `checked`)
- **VA guard:** Can't submit/pack if BatchProcessing records have `status='sent'` — blocks transitions when pieces are at VA vendor
- **Garment VA:** `BatchProcessing` model (mirrors RollProcessing but tracks pieces not weight). `BatchChallan` (BC-001, BC-002...) mirrors JobChallan
- **Packing:** Light — fields on Batch (packed_by, packed_at, pack_reference). `packed` status fires `ready_stock_in` inventory event
- **Permission system:** 4 new permissions configurable from Roles page. Backend: `require_permission()`. Frontend: `perms.batch_*`
- **`applicable_to`** on value_additions: `roll` / `garment` / `both` — filters VA dropdown per pipeline

### PWA + Mobile Layout (S38)
- **Dual layout:** Tailor/Checker get `MobileLayout` (compact header + bottom tabs), Admin/Supervisor/Billing get `Layout` (sidebar)
- **Role-based routing:** `LoginPage` redirects based on `user.role`; `ProtectedRoute` falls back to role-appropriate landing
- **BottomNav:** 3 tabs — Scan / My Work (or QC Queue) / Profile
- **Offline queue:** `useOfflineQueue` hook — localStorage-persisted, auto-syncs on reconnect
- **PWA caching:** Workbox — precache static, CacheFirst fonts, NetworkFirst API (5s timeout)
- **Touch UX:** `touch-action: manipulation` (no 300ms delay), `safe-area-pb` for notched phones

### CameraScanner Architecture (S41)
- **Mobile (Chrome Android 83+):** `BarcodeDetector.detect(videoElement)` — hardware GPU/DSP, scan loop 60ms, near-instant
- **Desktop fallback:** `html5-qrcode` lazy-loaded. `qrbox: 250×250`, `fps: 15`
- **UI:** Full-viewport camera, CSS corner brackets, header/footer float via `z-20`
- **Contract:** `onScan(string)` + `onClose()`
- **CORS for dev tunnels:** `allow_origin_regex=r"https://.*\.trycloudflare\.com"` in `main.py` — **remove for production**

### Weight System (3 fields on Roll)
- `total_weight` — original supplier weight, **IMMUTABLE** after stock-in
- `current_weight` — latest weight after value additions (mutated by receive/update processing)
- `remaining_weight` — available for cutting/lots (mutated by send/receive/lot creation)
- `send_for_processing` captures `current_weight` as `weight_before` (not total_weight)

### Partial Weight Send (S30)
- `weight_before` on processing log = partial amount sent (not full roll weight)
- Roll stays `in_stock` if `remaining_weight > 0` after send
- On receive: `remaining_weight += weight_after`, `current_weight += (weight_after - weight_before)`
- `JobChallanCreate.rolls` = `list[{roll_id, weight_to_send}]` (not `list[UUID]`)

### Lot System
- Statuses: open → cutting → distributed (forward-only)
- Fields: `standard_palla_weight`, `standard_palla_meter`, `default_size_pattern` (JSON)
- Custom `LOT_STATUS_COLORS` constant (open=emerald, cutting=blue, distributed=purple)
- Lot create overlay: full-page `fixed inset-0 z-50`, emerald gradient header

### Lot Distribution → Batch Auto-Creation (S35)
- `POST /lots/{id}/distribute` auto-creates N batches from `default_size_pattern`
- Each batch: `size`, `piece_count=total_pallas`, `qr_code_data=/scan/batch/{code}`
- Lot status → 'distributed'. `sku_id` nullable on batches (linked later for billing)
- `GET /batches/passport/{batch_code}` — public, no auth
- `POST /batches/claim/{batch_code}` — tailor role, sets status=assigned

### BatchesPage — Lot-Grouped Cards (S36, updated S44)
- Pipeline KPIs: 7 states (Created / Assigned / In Progress / Submitted / Checked / Packing / Packed)
- Smart tabs: All / Unclaimed / In Production / In Review / Done
- VA send/receive buttons (permission-gated) + out-for-VA count + ready stock count

### QR & Scan System
- **Static QR, Dynamic Passport** — QR printed once, scan shows live DB data
- `/scan/roll/:roll_code` — PUBLIC, Roll Passport (origin→VA→lot→batch→order)
- `/scan/batch/:batch_code` — PUBLIC, Batch Passport (+ VA timeline + out-house alert)
- `enhanced_roll_code` = `roll_code` + received VA short codes (computed, never stored)
- `effective_sku` = `BLS-101-Pink-M+EMB+SQN` (computed from base_sku + received VAs)
- QR sizes: 130px (print labels), 160px (screen-to-screen scan)

### Value Additions
- `RollProcessing.value_addition_id` — REQUIRED FK (process_type removed in S26)
- 10 seed VAs: EMB, DYE, DPT, HWK, SQN, BTC (roll/both) + HST, BTN, LCW, FIN (garment)
- Color map: EMB=purple, DYE=amber, DPT=sky, HWK=rose, SQN=pink, BTC=teal

### Job Challans (Roll VA)
- `POST /job-challans` — creates challan + sends all rolls atomically
- Auto-sequential `challan_no` (JC-001, JC-002...)
- `RollProcessing.job_challan_id` FK links logs to challans

### Typography System (S37)
- **Inter** from Google Fonts (400-800 weights)
- Tailwind `fontFamily.sans` overridden → all text classes render Inter
- Print: `'Inter', 'Segoe UI', Arial, sans-serif`
- Font swap: change index.html URL + index.css var + tailwind.config.js + 4 print pageStyle strings

### Roll Code Pattern
- `{SrNo}-{Fabric3}-{Color5/ColorNo}-{Seq}` (e.g. `1-COT-GREEN/01-01`)
- Sr. No. = internal filing serial written on physical supplier invoice

### Print Components Pattern
- All use `react-to-print` + `useReactToPrint({ contentRef })` + fixed overlay `z-50`
- A4 container, inline styles for print compatibility
- Files: `LabelSheet.jsx`, `BatchLabelSheet.jsx`, `JobChallan.jsx`, `CuttingSheet.jsx`
- Close modal before opening print overlay (both use z-50)

### Backend Response Shapes (S21)
- All FK UUIDs return nested objects: `created_by_user: {id, full_name}`, `tailor: {id, full_name}`
- Use `selectinload()` on relationships for nested objects
- Authority chain: `mock.js → API_REFERENCE.md → backend services`

### AWS Deployment Decision (S42)
- **Frontend:** Vercel (free forever) — `vercel.json` SPA rewrites + `allowedHosts` configured
- **Backend:** AWS EC2 t2.micro + Nginx + Gunicorn + FastAPI (free 12 months)
- **Database:** AWS RDS PostgreSQL db.t3.micro (free 12 months)
- **Cost:** ₹0 year 1, ~₹2,300/mo after. Cloudflare tunnel abandoned.
- **Guide:** `Guardian/AWS_DEPLOYMENT.md`

---

## QR Phase 3 — Future

- ZPL template for Zebra thermal printers
- Finished garment label with full chain QR
- Hardware: TSC TE200 thermal printer (~₹8,000)

---

## Session History (Compressed)

### Phase 6A+6B (S1-6) — Full Stack Scaffold
- Backend: 22 ORM models, Alembic, 19 schemas, 15 services, 16 routers, seeds, Dockerfile
- Frontend: Vite+React+Tailwind, 15 API modules (client+mock), 14 pages, auth, layout

### S7-14: Feature Evolution + UI Overhaul
- S7: Users & Roles, supplier invoices, SKU pattern (`ProductType-DesignNo-Color-Size`)
- S8: LOT entity, weight-based rolls (`total_weight`/`remaining_weight`)
- S9-10: UI polish, InventoryPage/ReportsPage overhauls
- S11-12: Supplier upgrade (+6 fields), Rolls 3-tab layout, roll detail modal
- S13: Challan-style stock-in (full-page overlay, keyboard-driven, design groups)
- S14: Invoice detail challan view, filter toolbars

### S15-20: Backend Implementation + Integration
- S15: All 13 services fully implemented (zero stubs)
- S16: Frontend↔Backend gap audit (7 fixes)
- S17: Master Data (ProductType, Color, Fabric) — 3 models, 12 endpoints, MastersPage
- S18: `API_REFERENCE.md` created, dashboard fixes, Protocol 6 added
- S19: `roll_service._to_response()` — 5 API shape mismatches fixed
- S20: Processed & Returned enriched table, Edit Processing Log (full-stack)

### S21-37: QR System + Lots + Batches + Print
- S22: Challan keyboard fixes, Sr. No. + Challan No., roll code pattern
- S24: QR Phase 1 — LabelSheet, QRLabel, ScanPage, CameraScanner, roll passport
- S25-26: QR Phase 2 — ValueAddition model, enhanced_roll_code, `process_type` → `value_addition_id`
- S27: `current_weight` column (3-weight system)
- S28-29: QR reprint + Job Challan model + atomic bulk send
- S30: Partial weight send for VA processing
- S31-33: Lot page redesign — cutting sheet overlay, VA-colored roll picker, lot detail overlay
- S34: Lot status filter bug fix (`LotFilterParams`)
- S35: Lot distribution → batch auto-creation + batch QR + tailor claim
- S36: BatchesPage — lot-grouped card view, pipeline KPIs, smart tabs
- S37: Global typography (Inter font + CSS vars)

### S38-42: Mobile + Deployment Prep
- S38: PWA + Mobile Tailor/Checker Workflow (13 new files, 9 modified, dual layout, offline queue)
- S39: QR scanner migration + mobile fixes (login autoCapitalize, clickable batch cards, 160px QR)
- S40: Vercel + Cloudflare deployment prep (vercel.json, allowedHosts)
- S41: Native BarcodeDetector on mobile + html5-qrcode desktop fallback + CORS wildcard + batch passport cleanup
- S42: AWS hybrid architecture decision. Cloudflare tunnel abandoned. Full frontend audit. `AWS_DEPLOYMENT.md` created.

### S43-45: Batch VA + Packing (complete)
- S43: Backend — 2 new models (BatchChallan, BatchProcessing), migration, services, 6 new endpoints, 4 garment VA seeds
- S44: Frontend — VA modals, 7-state UI, permission system upgrade (4 new permissions, `require_role` → `require_permission`)
- S45: Testing + docs — dashboard KPIs, batch passport print, E2E audit (no gaps), mock data fixes, STEP2/STEP3/API_REFERENCE updated

**Real backend active:** `VITE_USE_MOCK=false` — all data from SQLite via FastAPI

---

## Key Credentials
- **Mock login:** admin1/supervisor1/tailor1/checker1/billing1 — password: `test1234`
- **Real DB login:** admin/supervisor/billing/tailor1/checker1 — password: `test1234`
- **Mock switch:** `VITE_USE_MOCK=true` in frontend `.env`

---

## SQLite → PostgreSQL Migration

**Current:** SQLite (dev) | **Target:** PostgreSQL (AWS RDS)

1. Change `DATABASE_URL`: `sqlite+aiosqlite:///./inventory_os.db` → `postgresql+asyncpg://user:pass@host:5432/inventory_os`
2. Optional: JSON → JSONB (role.py, inventory_event.py)
3. Re-generate: `rm inventory_os.db && rm migrations/versions/*.py && alembic revision --autogenerate -m "initial" && alembic upgrade head`

---

## Project Structure
```
inventory-os/
├── Guardian/           ← Docs (CLAUDE.md, guardian.md, API_REFERENCE.md, STEP1-6, AWS_DEPLOYMENT.md)
├── backend/app/        ← FastAPI (models/24, schemas/20, services/16, api/17, core/, tasks/)
├── frontend/src/       ← React+Tailwind (api/17, pages/14+Login, components/, context/, hooks/)
└── mobile/             ← Phase 6C (future)
```
