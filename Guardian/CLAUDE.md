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
| `STEP2_DATA_MODEL.md` | 22 tables, columns, types, FKs | Model/migration changes |
| `STEP3_EVENT_CONTRACTS.md` | Events, side effects, state machine | Business logic |
| `STEP4_API_CONTRACTS.md` | Endpoint paths, auth, permissions | Route/controller work |
| `STEP5_FOLDER_STRUCTURE.md` | File placement, layer rules | New file creation |
| `STEP6_EXECUTION_PLAN.md` | Phase breakdown, task dependencies | Planning |

**Quick lookup:** API shapes → `API_REFERENCE.md` | Table columns → `STEP2` | Events → `STEP3` | Endpoints → `STEP4` | Roles → `STEP1 §1.4` | Batch state machine → `STEP3 §3.4`

---

## Current State (Session 39 — 2026-02-27)

### Start Here
1. `uvicorn app.main:app --reload --port 8000`
2. `cd frontend && npm run dev` → test at http://localhost:5173
3. Login as `tailor1` → should land on `/my-work` (mobile layout + bottom tabs)
4. Login as `checker1` → should land on `/qc-queue`
5. Login as `admin` → should land on `/dashboard` (desktop sidebar unchanged)
6. Cloudflare tunnel: `cloudflared tunnel --url http://localhost:5173` → phone testing

### Session 39 — COMPLETE: QR Scanner Migration + Mobile Fixes

| # | What | Status |
|---|------|--------|
| 1 | QR scanner: `html5-qrcode` → `@yudiel/react-qr-scanner@2.5.1` | DONE |
| 2 | Self-host zxing WASM (`public/zxing_reader.wasm`) — jsdelivr CDN fails on mobile | DONE |
| 3 | Camera: 1920×1080 + `focusMode: continuous` for better detection | DONE |
| 4 | QR sizes: 88→130px (print labels), 160px (BatchDetailPage on-screen scan) | DONE |
| 5 | BatchDetailPage: 160px scannable QR in summary grid (5-col, row-span-2) | DONE |
| 6 | LoginPage: `autoCapitalize=off` + `toLowerCase()` — phone keyboard fix | DONE |
| 7 | MyWorkPage: batch cards clickable → navigates to Batch Passport | DONE |

**Key findings:**
- `@yudiel/react-qr-scanner` uses `zxing-wasm` (not native BarcodeDetector). WASM loads from jsdelivr CDN by default — **silently fails** on mobile/tunnel. Fix: `setZXingModuleOverrides({ locateFile })` + copy WASM to `public/`
- Screen-to-screen QR scanning: 160px + `level="H"` + `includeMargin` = minimum for reliable detection at 30-50cm. 130px sufficient for printed labels
- Phone keyboards autocapitalize usernames → `autoCapitalize="off"` + forced `toLowerCase()` on LoginPage

### PENDING — Next Session (S40)
1. **SKUs page overhaul** — align to API_REFERENCE.md §6
2. **Orders/Invoices page overhauls** — align to API_REFERENCE.md §10/§11
3. **"Free" size support** — confirm if needed in size pattern
4. **Feriwala (waste disposition)** — deferred, add when client requests
5. **QR detection quality** — test with printed labels (should be much better than screen-to-screen)
6. **Windows firewall** — needs admin `netsh` rule for LAN access on 5173

### Files Created in S39 (1)
| File | Purpose |
|------|---------|
| `frontend/public/zxing_reader.wasm` | Self-hosted WASM for QR scanner (940KB) |

### Files Modified in S39 (5)
| File | Changes |
|------|---------|
| `frontend/src/components/common/CameraScanner.jsx` | Full rewrite: html5-qrcode → @yudiel/react-qr-scanner + WASM self-host |
| `frontend/src/components/common/BatchQRLabel.jsx` | QR size 88→130px, level M→H, includeMargin |
| `frontend/src/components/common/QRLabel.jsx` | QR size 88→130px, level M→H, includeMargin |
| `frontend/src/pages/BatchDetailPage.jsx` | 160px scannable QR in summary grid + QRCodeSVG import |
| `frontend/src/pages/MyWorkPage.jsx` | Batch cards clickable → Batch Passport, stopPropagation on buttons |
| `frontend/src/pages/LoginPage.jsx` | autoCapitalize=off + toLowerCase() for mobile keyboards |

### Files Created (S38 — 13)
| File | Purpose |
|------|---------|
| `frontend/src/api/mobile.js` | getMyBatches, getPendingChecks |
| `frontend/src/components/layout/MobileLayout.jsx` | Mobile shell + bottom tabs |
| `frontend/src/components/layout/BottomNav.jsx` | Bottom tab navigation |
| `frontend/src/components/common/OfflineBanner.jsx` | Offline indicator |
| `frontend/src/components/common/InstallBanner.jsx` | PWA install prompt |
| `frontend/src/pages/MyWorkPage.jsx` | Tailor dashboard |
| `frontend/src/pages/QCQueuePage.jsx` | Checker dashboard |
| `frontend/src/pages/ProfilePage.jsx` | Mobile profile/logout |
| `frontend/src/hooks/useOnlineStatus.js` | Online/offline detection |
| `frontend/src/hooks/useOfflineQueue.js` | Action queue + sync |
| `frontend/src/hooks/useInstallPrompt.js` | PWA install prompt hook |
| `frontend/public/icons/icon-192.png` | PWA icon |
| `frontend/public/icons/icon-512.png` | PWA icon |

### Files Modified (9)
| File | Changes |
|------|---------|
| `frontend/package.json` | +vite-plugin-pwa |
| `frontend/vite.config.js` | PWA plugin + Workbox |
| `frontend/index.html` | Meta tags (theme-color, apple-touch-icon, viewport-fit) |
| `frontend/src/index.css` | safe-area-pb, touch-action |
| `frontend/src/App.jsx` | Dual layout (MobileLayout for tailor/checker) + DefaultRedirect |
| `frontend/src/routes/ProtectedRoute.jsx` | Role-aware fallback |
| `frontend/src/pages/LoginPage.jsx` | Role-based redirect |
| `frontend/src/api/batches.js` | +startBatch, submitBatch, checkBatch |
| `frontend/src/pages/ScanPage.jsx` | Role-aware action buttons |

### Backend (NO changes needed)
All endpoints already exist and are tested: `POST /batches/{id}/start`, `/submit`, `/check`, `GET /mobile/my-batches`, `/mobile/pending-checks`

### After S39 — Next Up
1. **SKUs page overhaul** — align to API_REFERENCE.md §6
2. **Orders/Invoices page overhauls** — align to API_REFERENCE.md §10/§11
3. **"Free" size support** — confirm if needed in size pattern
4. **Feriwala (waste disposition)** — deferred, add when client requests

### What's Done
- **Phase 6A (Backend):** 22 models, 19 schemas, 15 services, 16 routers, 83+ endpoints
- **Phase 6B (Frontend):** 14 feature pages, 137+ modules, 0 build errors
- **QR/Print Phase 1+2:** Roll QR, batch QR, value additions, enhanced roll codes
- **S22:** Challan keyboard fixes, Sr. No. + Challan No. fields, roll code = `{SrNo}-Fabric-Color-Seq`
- **S24:** QR Phase 1 — LabelSheet, QRLabel, ScanPage, CameraScanner, roll passport endpoint
- **S25:** QR Phase 2 — ValueAddition model, enhanced_roll_code, VA CRUD, Masters tab
- **S26:** `process_type` removed → `value_addition_id` required on all processing logs
- **S27:** `current_weight` column — separates original supplier weight from post-VA weight
- **S28:** QR reprint (3 access points) + bulk send + Job Challan A4 print component
- **S29:** Job Challan DB model + auto `challan_no` + atomic bulk send endpoint
- **S30:** Partial weight send for VA processing (roll stays in_stock if partial)
- **S31:** Lot page redesign — challan-style cutting sheet overlay, VA-colored roll picker
- **S32:** `standard_palla_meter` field (full-stack) + lot overlay UX tightening
- **S33:** Lot detail full-page overlay (edit/status/print) + roll picker filters + CuttingSheet.jsx
- **S34:** Lot status filter bug fix (`LotFilterParams` — 3 backend files)
- **S35:** Lot distribution → batch auto-creation + batch QR + tailor claim
- **S36:** BatchesPage redesign — lot-grouped card view, pipeline KPIs, smart tabs
- **S37:** Global typography (Inter font + CSS vars) + batch label PCS field removed
- **S38:** PWA + Mobile Tailor/Checker Workflow (7 phases)
- **S39:** QR scanner migration (html5-qrcode → @yudiel/react-qr-scanner) + WASM self-host + mobile fixes (login autocapitalize, clickable batch cards, scannable QR on BatchDetailPage)
- **Real backend active:** `VITE_USE_MOCK=false` — all data from SQLite via FastAPI

---

## Key Architecture Decisions

### PWA + Mobile Layout (S38)
- **Dual layout:** Tailor/Checker get `MobileLayout` (compact header + bottom tabs), Admin/Supervisor/Billing get `Layout` (sidebar)
- **Role-based routing:** `LoginPage` redirects based on `user.role`; `ProtectedRoute` falls back to role-appropriate landing
- **BottomNav:** 3 tabs — Scan / My Work (or QC Queue) / Profile. Scan tab navigates to `/scan` (standalone, full-screen camera)
- **Offline queue:** `useOfflineQueue` hook — localStorage-persisted, auto-syncs on reconnect, optimistic local updates
- **Conflict resolution:** 400/409 → drop action (already transitioned); 500/network → retry
- **PWA caching:** Workbox — precache static assets, CacheFirst Google Fonts, NetworkFirst API (5s timeout), StaleWhileRevalidate batch passports
- **Install prompt:** `useInstallPrompt` captures `beforeinstallprompt`, shows `InstallBanner` in MobileLayout, dismisses for session
- **Touch UX:** `touch-action: manipulation` (no 300ms delay), `safe-area-pb` for notched phones

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
- `LotFilterParams`: `status` + `design_no` filters
- Custom `LOT_STATUS_COLORS` constant (open=emerald, cutting=blue, distributed=purple)
- Lot create overlay: full-page `fixed inset-0 z-50`, emerald gradient header

### Lot Distribution → Batch Auto-Creation (S35)
- `POST /lots/{id}/distribute` auto-creates N batches from `default_size_pattern`
- Each batch: `size`, `piece_count=total_pallas`, `qr_code_data=/scan/batch/{code}`
- Lot status → 'distributed'. `sku_id` nullable on batches (linked later for billing)
- `GET /batches/passport/{batch_code}` — public, no auth
- `POST /batches/claim/{batch_code}` — tailor role, sets status=assigned

### BatchesPage — Lot-Grouped Cards (S36)
- Pipeline KPIs: Created / Assigned / In Progress / Submitted / Completed
- Smart tabs: All / Unclaimed / In Production / In Review / Done (lot-level states)
- Lot workflow: Unclaimed (all created) → In Production (any assigned/in_progress) → In Review (any submitted) → Done (all completed)
- `BatchFilterParams`: `status`, `lot_id`, `sku_id`, `size`

### QR & Scan System
- **Static QR, Dynamic Passport** — QR printed once, scan shows live DB data
- `/scan/roll/:roll_code` — PUBLIC, Roll Passport (origin→VA→lot→batch→order)
- `/scan/batch/:batch_code` — PUBLIC, Batch Passport
- `enhanced_roll_code` = `roll_code` + received VA short codes (computed, never stored)
- `effective_sku` = `BLS-101-Pink-M+EMB+SQN` (computed from base_sku + received VAs)

### Value Additions
- `RollProcessing.value_addition_id` — REQUIRED FK (process_type removed in S26)
- 6 seed VAs: EMB, DYE, DPT, HWK, SQN, BTC
- Color map: EMB=purple, DYE=amber, DPT=sky, HWK=rose, SQN=pink, BTC=teal

### Job Challans
- `POST /job-challans` — creates challan + sends all rolls atomically
- Auto-sequential `challan_no` (JC-001, JC-002...)
- `RollProcessing.job_challan_id` FK links logs to challans

### Typography System (S37)
- **Inter** from Google Fonts (400-800 weights)
- CSS vars: `--font-family-primary`, `--font-family-print`, `--font-family-mono`
- Tailwind `fontFamily.sans` overridden → all text classes render Inter
- Print `pageStyle`: `'Inter', 'Segoe UI', Arial, sans-serif` (can't use CSS vars in iframe)
- Screen `<style>` blocks: `var(--font-family-print, ...)` with fallback
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

### S21-37: See "What's Done" above

---

## Key Credentials
- **Mock login:** admin1/supervisor1/tailor1/checker1/billing1 — password: `test1234`
- **Real DB login:** admin/supervisor/billing/tailor1/checker1 — password: `test1234`
- **Mock switch:** `VITE_USE_MOCK=true` in frontend `.env`

---

## SQLite → PostgreSQL Migration

**Current:** SQLite (dev) | **Target:** PostgreSQL / Supabase

1. Change `DATABASE_URL`: `sqlite+aiosqlite:///./inventory_os.db` → `postgresql+asyncpg://user:pass@host:5432/inventory_os`
2. Optional: JSON → JSONB (role.py, inventory_event.py)
3. Re-generate: `rm inventory_os.db && rm migrations/versions/*.py && alembic revision --autogenerate -m "initial" && alembic upgrade head`
4. Supabase: `postgresql+asyncpg://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`

---

## Project Structure
```
inventory-os/
├── Guardian/           ← Docs (CLAUDE.md, guardian.md, API_REFERENCE.md, STEP1-6)
├── backend/app/        ← FastAPI (models/22, schemas/19, services/15, api/16, core/, tasks/)
├── frontend/src/       ← React+Tailwind (api/15, pages/14+Login, components/, context/, hooks/)
└── mobile/             ← Phase 6C (future)
```
