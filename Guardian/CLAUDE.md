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
| `AWS_DEPLOYMENT.md` | Hybrid deploy plan (Vercel + EC2 + RDS) | Deployment day |
| `BATCH_VA_PACKING_SPEC.md` | Garment VA + packing + ready stock spec | Before S43-S45 coding |

**Quick lookup:** API shapes → `API_REFERENCE.md` | Table columns → `STEP2` | Events → `STEP3` | Endpoints → `STEP4` | Roles → `STEP1 §1.4` | Batch state machine → `BATCH_VA_PACKING_SPEC.md §2` | Deploy → `AWS_DEPLOYMENT.md`

---

## Current State (Session 44 — 2026-03-03)

### Session 44 — Batch VA + Packing Frontend + Permission System Upgrade

| # | What | Status |
|---|------|--------|
| 1 | `batchChallans.js` — API module (create, list, get, receive) with mock store | DONE |
| 2 | `batches.js` — added `readyForPacking()`, `packBatch()` + mock: `completed→checked` | DONE |
| 3 | StatusBadge — 7 batch states (checked, packing, packed) both cases | DONE |
| 4 | MastersPage — `applicable_to` column badge (Roll=purple, Garment=green, Both=blue) + filter tabs + dropdown in form | DONE |
| 5 | ScanPage — VA timeline, out-house alert, Ready for Packing + Mark Packed buttons | DONE |
| 6 | `SendForVAModal.jsx` — select batches, VA type, vendor, pieces | DONE |
| 7 | `ReceiveFromVAModal.jsx` — select pending challan, enter pieces + cost | DONE |
| 8 | BatchesPage — 7-state KPIs, VA send/receive buttons, out-for-VA + ready-stock badges, VA modals integrated | DONE |
| 9 | **Permission system upgrade** — 4 new permissions (`batch_send_va`, `batch_receive_va`, `batch_ready_packing`, `batch_pack`) | DONE |
| 10 | Backend routes switched from `require_role` → `require_permission` (batch_challans + batches) | DONE |
| 11 | Frontend switched from hardcoded role checks → permission-based (`perms.batch_pack` etc.) | DONE |
| 12 | Mock.js PERMISSIONS updated with 4 new keys for all roles | DONE |
| 13 | Build verified — 0 errors | DONE |

**S44 Permission System Changes:**
- `permissions.py`: +4 constants (`PERM_BATCH_SEND_VA/RECEIVE_VA/READY_PACKING/PACK`) + updated `ALL_PERMISSIONS` + `ROLE_PERMISSIONS` defaults
- Default grants: admin + supervisor get all 4; checker gets `batch_ready_packing`; tailor gets none
- **All manageable from Roles page** — admin can toggle any permission for any role
- Backend: `batch_challans.py` switched from `require_role("admin","supervisor")` → `require_permission("batch_send_va"/"batch_receive_va")`
- Backend: `batches.py` ready-for-packing → `require_permission("batch_ready_packing")`, pack → `require_permission("batch_pack")`
- Frontend: ScanPage uses `perms.batch_start/submit/check/ready_packing/pack` instead of `userRole === 'tailor'` etc.
- Frontend: BatchesPage uses `perms.batch_send_va/receive_va` instead of `isSupervisorOrAdmin`

**S44 Files created:**
| File | Purpose |
|------|---------|
| `frontend/src/api/batchChallans.js` | Batch challan CRUD + mock store |
| `frontend/src/components/batches/SendForVAModal.jsx` | Send batches for VA — batch picker + VA type + vendor |
| `frontend/src/components/batches/ReceiveFromVAModal.jsx` | Receive from VA — challan picker + pieces + cost |

**S44 Files modified:**
| File | Changes |
|------|---------|
| `backend/app/core/permissions.py` | +4 permission constants, updated ALL_PERMISSIONS + ROLE_PERMISSIONS |
| `backend/app/api/batch_challans.py` | `require_role` → `require_permission` (4 endpoints) |
| `backend/app/api/batches.py` | `require_role` → `require_permission` (ready-for-packing, pack) |
| `frontend/src/api/mock.js` | PERMISSIONS dict +4 keys for admin/supervisor/checker |
| `frontend/src/api/batches.js` | +readyForPacking, +packBatch, completed→checked in mock |
| `frontend/src/components/common/StatusBadge.jsx` | +checked/packing/packed colors (both cases) |
| `frontend/src/pages/MastersPage.jsx` | applicable_to badge + filter tabs + dropdown in VA form |
| `frontend/src/pages/ScanPage.jsx` | VA timeline, out-house alert, 2 new buttons, permission-based checks |
| `frontend/src/pages/BatchesPage.jsx` | 7-state pipeline, VA buttons, modals, permission-based |

---

## Previous State (Session 43 — 2026-03-03)

### Start Here
1. `uvicorn app.main:app --reload --port 8000`
2. `cd frontend && npm run dev` → test at http://localhost:5173
3. **Production (planned):** `https://inventory.drsblouse.com` (Vercel) + `https://api-inventory.drsblouse.com` (AWS EC2)
4. Login as `admin` → `/dashboard` | `tailor1` → `/my-work` | `checker1` → `/qc-queue`

### Session 43 — Batch VA + Packing Backend Complete

| # | What | Status |
|---|------|--------|
| 1 | Alembic migration `b1c2d3e4f5a6` — batch_challans + batch_processing tables, packing cols on batches, applicable_to on value_additions, completed→checked status migration | DONE |
| 2 | Seeded 4 new garment VAs (HST, BTN, LCW, FIN) + updated existing 6 VA applicable_to values | DONE |
| 3 | `batch_challan_service.py` — create, receive, list, get (mirrors JobChallanService) | DONE |
| 4 | `batch_service.py` full rewrite — VA guards on submit/packing, check→checked (not completed), ready_for_packing, pack_batch with ready_stock_in event, processing_logs in _to_response, has_pending_va, location filter, enhanced scan_batch_qr with role-aware actions | DONE |
| 5 | `batch_challans.py` router — 4 endpoints (create, list, get, receive) with supervisor/admin role gate | DONE |
| 6 | `batches.py` router — +ready-for-packing, +pack endpoints | DONE |
| 7 | `router.py` — registered batch_challans router | DONE |
| 8 | Server startup test — clean import, all 16 batch routes registered | DONE |

**S43 Files created:**
| File | Purpose |
|------|---------|
| `backend/migrations/versions/b1c2d3e4f5a6_batch_va_packing_tables_and_columns.py` | Migration: 2 new tables + batch cols + VA applicable_to + status migration |
| `backend/app/services/batch_challan_service.py` | BatchChallan CRUD: create/receive/list/get |
| `backend/app/api/batch_challans.py` | 4 REST endpoints for batch challans |

**S43 Files modified:**
| File | Changes |
|------|---------|
| `backend/app/services/batch_service.py` | Full rewrite: VA guards, 7-state machine, packing flow, processing_logs in response |
| `backend/app/api/batches.py` | +ready-for-packing, +pack endpoints, +require_role import, +BatchPack import |
| `backend/app/api/router.py` | +batch_challans router registration |

### Session 42 — AWS Decision + Production Roadmap (previous)

**Key decisions:**
- Vercel frontend = free forever, zero maintenance, already has `vercel.json` SPA rewrites
- AWS backend = EC2 t2.micro (free 12mo) + RDS PostgreSQL db.t3.micro (free 12mo)
- Cloudflare tunnel dropped — cert.pem issue irrelevant now
- Cost after year 1: ~₹2,300/mo (EC2 + RDS only, frontend stays free)
- Deploy doc: `Guardian/AWS_DEPLOYMENT.md`

### Production Roadmap — Complete Before Deploy

**PHASE A: Batch VA + Packing (S43-S45) — spec: `BATCH_VA_PACKING_SPEC.md`**

| # | Task | Session | Effort |
|---|------|---------|--------|
| 1 | Backend: BatchChallan + BatchProcessing models, migrations, services, endpoints | S43 | Large |
| 2 | Backend: Enhanced batch states (7), VA guards, packing flow, ready stock event | S43 | Medium |
| 3 | Frontend: VA modals, packing buttons, batch passport timeline, in/out-house filters | S44 | Large |
| 4 | E2E testing: full pipeline stock-in → VA → lot → batch → VA → QC → VA → pack → ready stock | S45 | Medium |

**PHASE B: Page Overhauls**

| # | Task | Effort |
|---|------|--------|
| 5 | SKUs page — align to API_REFERENCE.md §6 | Medium |
| 6 | Orders page — align to API_REFERENCE.md §10 | Medium |
| 7 | Invoices page — align to API_REFERENCE.md §11 | Medium |

**PHASE C: Deploy**

| # | Step | Guide |
|---|------|-------|
| 8 | SQLite → PostgreSQL migration code | `AWS_DEPLOYMENT.md` Step 4 |
| 9 | AWS EC2 + RDS setup | `AWS_DEPLOYMENT.md` Steps 1-3 |
| 10 | Vercel frontend deploy + GoDaddy DNS | `AWS_DEPLOYMENT.md` Steps 5-6 |
| 11 | CI/CD GitHub Actions | `AWS_DEPLOYMENT.md` Step 7 |
| 12 | CORS production config | Remove `trycloudflare.com`, add fixed domain |

**NICE-TO-HAVE (post-deploy):**

| # | Task |
|---|------|
| 13 | "Free" size support in size pattern |
| 14 | Feriwala (waste disposition) |
| 15 | Reports page enrichment |
| 16 | Thermal printer ZPL templates |

### Session 41 — Native BarcodeDetector + CORS fix + Batch Passport Cleanup

| # | What | Status |
|---|------|--------|
| 1 | Package swap: `@yudiel/react-qr-scanner` → `html5-qrcode` | DONE |
| 2 | Delete `frontend/public/zxing_reader.wasm` (940KB) | DONE |
| 3 | CameraScanner: native `BarcodeDetector` API on mobile (Chrome 83+) | DONE |
| 4 | CameraScanner: `html5-qrcode` lazy-loaded as desktop fallback | DONE |
| 5 | Fix double camera view (html5-qrcode video stacking issue) | DONE |
| 6 | CORS: `allow_origin_regex` for `*.trycloudflare.com` (dev testing) | DONE |
| 7 | LoginPage: show real error (network/CORS/status) not generic "Invalid credentials" | DONE |
| 8 | Batch passport: remove colors section, single clean details card | DONE |

**CameraScanner architecture (final):**
- **Mobile (Chrome Android 83+):** `BarcodeDetector.detect(videoElement)` directly — no canvas, no library, hardware GPU/DSP decoding. Scan loop every 60ms. Near-instant detection.
- **Desktop (no BarcodeDetector):** `html5-qrcode` lazy-loaded via `import()`. `qrbox: 250×250`, `fps: 15`, `disableFlip: true`. Library's `#qr-shaded-region` hidden via CSS (we draw our own corner brackets).
- **UI:** Full-viewport camera (`position: absolute; object-fit: cover`), CSS corner brackets via radial gradient + border elements, header/footer float on top via `z-20`.
- **Contract unchanged:** `onScan(string)` + `onClose()`

**CORS for tunnel testing:**
- `backend/app/main.py`: `allow_origin_regex=r"https://.*\.trycloudflare\.com"` — any quick tunnel URL auto-allowed. **Remove for production.**
- Tunnel warm-up: new URLs take 30-60s to propagate to all Cloudflare edge nodes. Phone may fail initially — this is Cloudflare, not our code.

**Batch passport redesign:**
- Removed: Colors section (redundant — every batch from a lot has same 17-20 colors), separate Assignment section, separate Lot Details section
- Single details card: Design No., Lot, Date, Pieces, Tailor, Assigned date
- Action buttons unchanged (Claim / Start Work / Submit QC / QC Check)

**Files modified (4):**
| File | Changes |
|------|---------|
| `frontend/src/components/common/CameraScanner.jsx` | Full rewrite: native BarcodeDetector + html5-qrcode fallback |
| `frontend/src/pages/ScanPage.jsx` | Batch passport: remove colors, clean layout |
| `frontend/src/pages/LoginPage.jsx` | Real error messages instead of generic "Invalid credentials" |
| `backend/app/main.py` | `allow_origin_regex` for trycloudflare.com |

**Files deleted (1):** `frontend/public/zxing_reader.wasm`
**Package changes:** `-@yudiel/react-qr-scanner`, `+html5-qrcode` (kept as desktop fallback)

### Session 40 — Vercel + Cloudflare Named Tunnel Deployment Prep

| # | What | Status |
|---|------|--------|
| 1 | `frontend/vercel.json` — SPA rewrites for React Router | DONE |
| 2 | `frontend/vite.config.js` — add `inventory.drsblouse.com` to allowedHosts | DONE |
| 3 | `.env.production` already in root `.gitignore` — no change needed | DONE |
| 4 | Build verified — 0 errors | DONE |
| 5 | Cloudflare account created (`drssurat1008@gmail.com`) | DONE |
| 6 | `drsblouse.com` added to Cloudflare (Free plan, nameservers NOT changed) | DONE |
| 7 | `cloudflared` CLI installed (v2025.8.1) | DONE |
| 8 | `cloudflared tunnel login` — cert.pem not saving | BLOCKED |

**BLOCKER: `cert.pem` not saved after `cloudflared tunnel login`**
- Clicked Authorize in browser but cert.pem not written to `~/.cloudflared/`
- Likely cause: Git Bash callback issue. **Try from Windows CMD:** `cloudflared.exe tunnel login`
- Alternative: Zero Trust dashboard → Tunnels (stuck on payment page, try incognito/disable ad blocker)

**Resume checklist (next session):**
1. Fix `cloudflared tunnel login` — run from **Windows CMD** (not Git Bash): `cloudflared.exe tunnel login`
2. After cert.pem saves: `cloudflared tunnel create inventory-api` → get UUID
3. Create `~/.cloudflared/config.yml` pointing to `localhost:8000`
4. Test: `cloudflared tunnel run inventory-api` → verify `https://<UUID>.cfargotunnel.com/api/v1/health`
5. Vercel: Import repo → root dir = `frontend` → set `VITE_API_URL` = tunnel URL
6. GoDaddy: CNAME `inventory` → `cname.vercel-dns.com`
7. Vercel: Add custom domain `inventory.drsblouse.com`
8. Backend `.env`: Add Vercel URL + custom domain to `ALLOWED_ORIGINS`
9. Auto-start: `start-inventory.bat` in Windows Startup folder
10. Backup: Task Scheduler daily SQLite copy

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

### PENDING — Next Session (S44)
1. **Batch VA + Packing — Frontend** → `BATCH_VA_PACKING_SPEC.md` §10 tasks 15-25
   - Masters page: applicable_to badge + filter + form field
   - Status colors/labels updated for 7 states
   - Batch passport: VA timeline + out-house alert + Ready for Packing + Mark Packed buttons
   - Send for VA modal + Receive from VA modal
   - BatchesPage: in-house/out-house filter + VA indicators
   - Dashboard: out-house KPIs + ready stock count
   - API module: batchChallans.js + mock data
   - Update batches.js API (new endpoints)
2. **Session 45:** E2E testing + polish (tasks 26-31)
3. **Then:** SKUs / Orders / Invoices page overhauls
4. **Then:** AWS deployment (`AWS_DEPLOYMENT.md`)

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

### After S39 — Completed in S40-S42
- S40: Vercel + Cloudflare deployment prep (vercel.json, allowedHosts)
- S41: Native BarcodeDetector + CORS + batch passport cleanup
- S42: AWS hybrid architecture decision + production roadmap + full audit

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
- **S40:** Vercel + Cloudflare Named Tunnel deployment prep (vercel.json SPA rewrites, allowedHosts config)
- **S41:** Native BarcodeDetector on mobile (instant QR scanning) + html5-qrcode desktop fallback + CORS wildcard for tunnel testing + batch passport cleanup (removed colors, single details card)
- **S42:** AWS hybrid architecture decision (Vercel frontend + EC2/RDS backend). Cloudflare tunnel abandoned. Full frontend audit (14 pages functional, 17 API modules, zero stubs). Production roadmap defined. `AWS_DEPLOYMENT.md` created.
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
