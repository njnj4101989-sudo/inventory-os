# Guardian: Full-Stack Code Guardian Protocol

Guardian ensures **naming consistency**, **data-flow correctness**, and **cross-module integrity** across frontend, backend, database, and API layers.

---

## Agent Loading
When user says "Load agent: {name}":
1. Read `{project_root}/.claude/agents/{name}.md` — if exists, use it (project override)
2. Otherwise read `~/.claude/agents/{name}.md` (global)
3. Always read `~/.claude/agents/base.md` alongside
4. Confirm activation and wait for task

Available agents: frontend, backend, database, ml-vision, devops, docs

## Activation Protocol (Read This When User Says "activate guardian")

**Step 1:** Read `CLAUDE.md` → current state, what's blocking, what's next
**Step 2:** Read `API_REFERENCE.md` → if task involves frontend↔backend work
**Step 3:** Read this file (`guardian.md`) → protocols, component props, architecture
**Step 4:** Read STEP docs → ONLY if task specifically needs them (on-demand)
**Step 5:** Check `MEMORY.md` → lessons learned, don't repeat past mistakes

**Where to READ from:** `Guardian/*.md` for specs, `frontend/src/api/mock.js` for ground truth shapes, `frontend/src/components/common/*.jsx` for component prop signatures
**Where to WRITE to:** `CLAUDE.md` for session updates, `MEMORY.md` for new lessons, `API_REFERENCE.md` if API shapes change, `guardian.md` if new protocols/component props discovered

---

## Document Inventory (What We Have — Don't Re-scan!)

| File | Location | Purpose | Tokens (~) |
|------|----------|---------|-----------|
| `CLAUDE.md` | `Guardian/` | Session log, current state, project structure | ~2K |
| `guardian.md` | `Guardian/` | THIS file — protocols, rules, component props, coding standards | ~3K |
| `API_REFERENCE.md` | `Guardian/` | **Single source of truth** for all API shapes (from mock.js) | ~6K |
| `STEP1_SYSTEM_OVERVIEW.md` | `Guardian/` | Roles, production flow, deployment topology | ~4K |
| `STEP2_DATA_MODEL.md` | `Guardian/` | 20 tables, columns, types, FKs, ER diagram (v1.1) | ~5K |
| `STEP3_EVENT_CONTRACTS.md` | `Guardian/` | Events, side effects, state machine, idempotency | ~4K |
| `STEP4_API_CONTRACTS.md` | `Guardian/` | Endpoint paths, auth, permissions (v1.1) | ~6K |
| `STEP5_FOLDER_STRUCTURE.md` | `Guardian/` | File placement rules, layer architecture | ~4K |
| `STEP6_EXECUTION_PLAN.md` | `Guardian/` | Phase breakdown, task dependencies, 6B plan | ~3K |
| `AWS_DEPLOYMENT.md` | `Guardian/` | Hybrid deploy plan (Vercel + EC2 + RDS) — step-by-step | ~3K |
| ~~`BATCH_VA_PACKING_SPEC.md`~~ | Deleted (S45) | Merged into STEP2/STEP3/API_REFERENCE — spec complete | — |
| `mock.js` | `frontend/src/api/` | Mock data store — the ground truth for field shapes | ~5K |
| `MEMORY.md` | `.claude/projects/.../memory/` | Auto-memory — key patterns, lessons learned | ~2K |

### Document Priority (read order for new sessions)
1. **CLAUDE.md** — current state + what's next (ALWAYS first)
2. **API_REFERENCE.md** — before ANY frontend↔backend work
3. **guardian.md** — before any coding (protocols + component props)
4. **STEP docs** — only when the specific task requires them (on-demand)

### Key Rule: API_REFERENCE.md > STEP4
`STEP4_API_CONTRACTS.md` was the original design. `API_REFERENCE.md` reflects the ACTUAL shapes the frontend uses (extracted from mock.js). When they conflict, **API_REFERENCE.md wins**.

---

## Protocol 1: Memory Enforcement

**Before doing ANYTHING (editing, creating files, making changes):**
1. **STOP** — Don't immediately start editing
2. **THINK** — Which protocol applies? Which doc do I need?
3. **PLAN** — How to do this efficiently? (replace_all? Batch edits?)
4. **EXECUTE** — Do it right the first time

**Self-check questions before every response:**
- Did I check the relevant doc first?
- Am I about to repeat a past mistake? (check MEMORY.md lessons)
- Is there a more efficient way?
- Am I guessing field names or prop names? (→ read the source file)

---

## Protocol 2: Token Efficiency

**Before making ANY edits:**
1. Can I use `replace_all=true` instead of multiple individual edits?
2. Can I combine related changes into one operation?
3. Did I grep to count occurrences FIRST?

**Patterns:**
- 15+ matches of same text → `replace_all=true`
- 2-3 unique contexts → targeted edits
- Session limit: ~200K tokens. Every wasted edit costs real money.

---

## Protocol 3: Documentation Discipline

**Existing docs (USE THESE — never create new .md files):**

| Doc | What to WRITE here |
|-----|-------------------|
| `CLAUDE.md` | Session summaries, current state, blocking issues, what's next |
| `guardian.md` | New protocols, component prop updates, architecture decisions |
| `API_REFERENCE.md` | API shape changes (when mock.js or backend changes) |
| `MEMORY.md` | New lessons learned, cross-session patterns |

**Forbidden:** Creating `FEATURE_NAME_COMPLETE.md`, `SESSION_XX_SUMMARY.md`, or any new .md without explicit user request.

**After EVERY session:** Update `CLAUDE.md` current state + session history. Update `MEMORY.md` if new lessons discovered.

---

## Protocol 4: Zero-Assumption Model Access

**Before writing ANY code that accesses model fields, schemas, or database columns:**
1. **READ the model/schema file FIRST**
2. **VERIFY exact field names from source**
3. **NEVER assume** based on similar models, common patterns, or "what makes sense"
4. **For API responses** → check `API_REFERENCE.md` Appendix C (nested objects)

---

## Protocol 5: Frontend↔Backend Alignment

**The authoritative flow:**
```
mock.js (ground truth) → API_REFERENCE.md (documented) → backend services (must match)
```

**Before modifying any backend service response shape:**
1. Read `API_REFERENCE.md` for the exact shape the frontend expects
2. Check Appendix C — nested objects that backend MUST return (not flat IDs)
3. Verify with `mock.js` if anything seems ambiguous

**Before modifying any frontend API module:**
1. Check if backend already returns the needed shape
2. If adding new fields, update `mock.js` AND `API_REFERENCE.md` together

---

## Protocol 6: Component Props (READ before using ANY component!)

**Before using ANY shared component, check its ACTUAL prop signature here — don't guess.**

### Common Components (`frontend/src/components/common/`)

| Component | Props | NOT this |
|-----------|-------|----------|
| `Modal` | `open`, `onClose`, `title`, `children`, `actions`, `wide`, `extraWide` | ~~isOpen~~, ~~footer~~ |
| `DataTable` | `columns`, `data`, `loading`, `onRowClick`, `emptyText`, `expandedRows`, `onToggleExpand`, `renderExpanded` | |
| `SearchInput` | `value`, `onChange`, `placeholder` | |
| `Pagination` | `page`, `pages`, `total`, `onChange` | |
| `FilterSelect` | `value`, `onChange`, `options` (`[{value,label}]`), `full` (form mode), `className` | ~~native `<select>`~~ |
| `StatusBadge` | `status`, `label` | |
| `ErrorAlert` | `message`, `onDismiss` | |
| `LoadingSpinner` | `size` (`sm`/`md`/`lg`), `text` | |

**FilterSelect usage:**
```jsx
// Filter bar (compact, emerald tint when active):
<FilterSelect value={filter} onChange={setFilter} options={[{value:'',label:'All'}, ...]} />

// Form field (full width, neutral, matches typo-input):
<FilterSelect full value={form.role} onChange={v => set('role', v)} options={[...]} />

// NEVER use native <select> for dropdowns — always use FilterSelect
```

**When creating a new page that uses Modal:**
```jsx
// CORRECT:
<Modal open={showModal} onClose={closeModal} title="..." actions={<>buttons</>}>

// WRONG (will silently fail — modal never opens):
<Modal isOpen={showModal} onClose={closeModal} title="..." footer={<>buttons</>}>
```

---

## Protocol 7: QR/Barcode System

> **Read this before ANY work on: QR generation, label printing, camera scan, Roll Passport, Value Additions, effective SKU**

### Core Architecture: Static QR, Dynamic Data

```
QR Code = static identifier (printed once, never changes)
Passport Page = live data from DB (evolves as roll progresses)
```

- **Roll QR** encodes: `roll_code` only (e.g., `1-COT-PINK/07-01`)
- **Batch QR** encodes: `batch_code` only (e.g., `BAT-001`) — field `Batch.qr_code_data` ALREADY EXISTS
- Scanning opens `/scan/roll/{roll_code}` or `/scan/batch/{batch_code}` — app fetches live data
- **No reprinting needed** as roll progresses through stages

### Effective SKU Formula (computed, NEVER stored)

```
effective_sku = base_sku_code + "+" + value_addition_codes (only status='received', in order)

Example:
  base:               BLS-101-Pink-M
  + Embroidery (EMB): BLS-101-Pink-M+EMB
  + Sequin (SQN):     BLS-101-Pink-M+EMB+SQN
```

**Rule:** Only completed value additions (`status = 'received'`) count in effective_sku.

### Value Addition vs Regular Processing

| Type | Examples | Shows in effective_sku? |
|------|----------|------------------------|
| Value Addition (has short_code) | Embroidery, Dying, Digital Print, Handwork, Sequin, Batik | ✅ YES |
| Regular Processing | Washing, ironing, folding, quality check | ❌ NO |

### Value Addition Short Codes (Seed Data)

| Name | Short Code | SKU Suffix |
|------|-----------|-----------|
| Embroidery | EMB | `+EMB` |
| Dying | DYE | `+DYE` |
| Digital Print | DPT | `+DPT` |
| Handwork | HWK | `+HWK` |
| Sequin Work | SQN | `+SQN` |
| Batik | BTC | `+BTC` |

### Roll Passport — What One Scan Shows

```
Roll: 1-COT-PINK/07-01
├── Origin
│   ├── Supplier: Ratan Fabrics | Invoice: INV-001 | Challan: CH-001 | Sr. No.: 1
│   ├── Date: 15-Feb-2026 | Fabric: Cotton | Color: Pink (07) | Weight: 45.5 kg
├── Value Additions (from processing_logs with value_addition_id)
│   ├── [EMB] Embroidery → Sonu Works → 10-Feb to 15-Feb → ₹2,500 ✅
│   └── [SQN] Sequin → Raju Works → 16-Feb → In Progress ⏳
├── Lot: LOT-001 (Cut: 20-Feb | Weight Used: 10.5 kg | Waste: 0.5 kg | 200 pcs)
├── Batch: BAT-001 | Tailor: Ramesh Kumar | Status: Stitching
├── Order: ORD-001 | Fashion Hub | 50 pcs
└── Effective SKU: BLS-101-Pink-M+EMB (SQN pending — not in sku until returned)
```

### Scan URL Pattern

| URL | Shows |
|-----|-------|
| `/scan/roll/{roll_code}` | Roll Passport (full chain) — ✅ Live |
| `/scan/batch/{batch_code}` | Batch Passport + tailor claim — ✅ Live |

### Label Layout (A4 — 8 per page)

```
┌────────────────────────────────────┐
│  ██████████████  Roll: 1-COT-PINK/07-01  │
│  ██  QR CODE ██  Fabric: Cotton | Color: Pink (07) │
│  ██████████████  Wt: 45.5 kg | Date: 18-Feb-2026   │
│                  Supplier: Ratan Fabrics            │
│                  Inv: INV-001 | Sr.No: 1            │
└────────────────────────────────────┘
```

### Phase Rollout

| Phase | What | Status |
|-------|------|--------|
| 1 | Roll QR gen + A4 print + mobile camera scan + Roll Passport page | ✅ S24 |
| 2 | ValueAddition master + enhanced_roll_code + effective_sku | ✅ S25-26 |
| 3 | Batch QR + batch passport + tailor claim | ✅ S35 |
| 4 | Thermal ZPL (Zebra) + finished garment label | 🔮 Future |

### Libraries

| Library | Purpose | Install |
|---------|---------|---------|
| `qrcode.react` | QR generation in browser | `npm i qrcode.react` |
| `react-to-print` | Browser print trigger | `npm i react-to-print` |
| `html5-qrcode` | Camera scan (mobile PWA) | `npm i html5-qrcode` |

### Key Rules (do not break these)

1. **NEVER store `effective_sku`** — always compute: base_sku + completed value addition codes
2. **Roll QR printed once** after stock-in — never reprinted (data evolves in DB, not QR)
3. **Value additions in effective_sku ONLY when `status = 'received'`** — not while sent
4. **`process_type` is REMOVED** — `value_addition_id` is the ONLY required FK on RollProcessing (Session 26)
5. **`Batch.qr_code_data` already exists** — populate it when batch is created (Phase 3)
6. **Mobile scan works in-browser** — `html5-qrcode` uses device camera, no app install needed
7. **`/scan/*` routes are PUBLIC** — no auth required (workers on floor scan without logging in)

---

## Key Architecture Decisions (Quick Reference)

| Decision | Value |
|----------|-------|
| Response envelope | `{ success, data, message }` |
| Pagination | `{ data: [...], total, page, pages }` |
| Auth tokens | HttpOnly cookies (`access_token` path=/, `refresh_token` path=/api/v1/auth). NO localStorage for auth. |
| Mock switch | `VITE_USE_MOCK=true` in `.env` |
| SKU pattern | `ProductType-DesignNo-Color-Size` (e.g. `BLS-101-Red-M`) |
| Roll code | `{SrNo}-{Fabric3}-{Color5/ColorNo}-{Seq}` (e.g. `1-COT-GREEN/01-01`) |
| Weight unit | kg (primary), meters (optional) |
| LOT model | Groups rolls for cutting; no SKU at lot level |
| Batch source | Created from LOT (lot_id FK), not directly from rolls |
| DB (dev) | PostgreSQL 18.3 local (`inventory_dev`) |
| DB (prod) | PostgreSQL 16.6 AWS RDS |
| CORS origins | `http://localhost:3000`, `http://localhost:5173` (in backend `.env`) |
| Favicon | Inline SVG emoji in `index.html` (no file needed) |
| Quick Master | `Shift+M` on any `<select data-master="...">` opens inline create modal |

---

## Protocol 8: Quick Master (Shift+M)

> **Read this before ANY work on: master data dropdowns, stock-in forms, lot create, VA send modals**

### How It Works
- User focuses a `<select>` with `data-master` attribute
- Presses `Shift+M` -> `useQuickMaster` hook reads the attribute
- `QuickMasterModal` opens with the right form fields
- On save: calls existing create API, refreshes master list, auto-selects new item
- Focus returns to the original field
- If no `data-master` on focused element -> silent no-op

### Files
| File | Purpose |
|------|---------|
| `hooks/useQuickMaster.js` | Hook: keydown listener, reads `data-master`, manages modal state |
| `components/common/QuickMasterModal.jsx` | Config-driven modal, calls existing create APIs |

### Supported Master Types
| `data-master` value | Create API | Required Fields |
|---------------------|-----------|-----------------|
| `color` | `createColor()` | name, code (max 5) |
| `fabric` | `createFabric()` | name, code (max 3) |
| `supplier` | `createSupplier()` | name (+ optional phone, city) |
| `product_type` | `createProductType()` | name, code (3 chars) |
| `value_addition` | `createValueAddition()` | name, short_code (3-4), applicable_to |
| `va_party` | `createVAParty()` | name (+ optional phone, city) |

### Where It's Integrated
| Page | Fields with `data-master` |
|------|--------------------------|
| `RollsPage.jsx` | supplier, fabric, color, value_addition (x3: single send, edit, bulk send) |
| `LotsPage.jsx` | product_type |
| `SendForVAModal.jsx` | value_addition |

### Rules
1. Only add `data-master` to CREATE/EDIT form selects, NOT filter dropdowns
2. After create: refresh master list + auto-select new item + re-focus field
3. No `data-master` = silent no-op (no error, no toast)
4. QuickMasterModal shares API functions with MastersPage (single source of truth)

---

## Protocol 9: Multi-Tenant Alembic Migrations

> **Read this before writing ANY Alembic migration that touches tenant tables (rolls, lots, batches, orders, invoices, challans, masters, etc.)**

### Architecture

- **Public tables** (5): `users`, `roles`, `companies`, `user_companies`, `token_blacklist` — live in `public` schema, have `schema="public"` in model
- **Tenant tables** (28): everything else — live in `co_{slug}` schemas (e.g., `co_drs_blouse`)
- **Alembic default**: runs against public schema only. It does NOT auto-iterate tenant schemas.

### How New Companies Get Their Schema

`create_tenant_tables()` in `database.py` → calls `Base.metadata.create_all()` → reads **model definitions**.
So model files ARE the source of truth for new companies. Any constraint, index, or ondelete added to a model automatically applies to new companies.

### How Existing Companies Get Schema Changes

Alembic migrations must **explicitly iterate** tenant schemas using `tenant_utils.py`.

**File:** `backend/migrations/tenant_utils.py`

```python
from migrations.tenant_utils import get_tenant_schemas, col_exists, constraint_exists, index_exists
```

**Helpers available:**
| Function | Purpose |
|----------|---------|
| `get_tenant_schemas(conn)` | Returns list of `co_*` schema names |
| `col_exists(conn, schema, table, column)` | Check if column exists before adding |
| `constraint_exists(conn, schema, name)` | Check if constraint exists before adding |
| `index_exists(conn, schema, name)` | Check if index exists before adding |

### Migration Template (copy-paste for tenant table changes)

```python
from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists

def upgrade():
    conn = op.get_bind()

    # Public schema changes (if any)
    # conn.execute(text('ALTER TABLE public.users ADD COLUMN ...'))

    # Tenant schema changes
    for s in get_tenant_schemas(conn):
        if not col_exists(conn, s, 'rolls', 'new_column'):
            conn.execute(text(f'ALTER TABLE {s}.rolls ADD COLUMN new_column VARCHAR(50)'))
```

### Rules

1. **ALWAYS update the model file AND write a migration** — model for new companies, migration for existing
2. **ALWAYS use schema-qualified table names** in migrations: `{schema}.{table}`, NOT bare `{table}`
3. **ALWAYS use `col_exists` / `constraint_exists` guards** — makes migrations idempotent (safe to re-run)
4. **NEVER use Alembic's `op.add_column()` for tenant tables** — it doesn't know about tenant schemas. Use raw SQL via `conn.execute(text(...))`
5. **Check actual `__tablename__`** in models before writing SQL — e.g., it's `batch_roll_consumption` (singular), NOT `batch_roll_consumptions`

---

## Protocol 10: Global Typography System (S79)

> **Read this before ANY UI work. Source of truth: `frontend/src/index.css`**

**24 `.typo-*` classes control ALL typography across 47 files. Change `index.css` → entire app updates.**

### Quick Reference

| Page/Layout | Form | Table | KPI/Data | Controls |
|-------------|------|-------|----------|----------|
| `typo-page-title` | `typo-label` | `typo-th` | `typo-kpi` | `typo-btn` |
| `typo-section-title` | `typo-label-sm` | `typo-td` | `typo-kpi-sm` | `typo-btn-sm` |
| `typo-card-title` | `typo-input` | `typo-td-secondary` | `typo-kpi-label` | `typo-badge` |
| `typo-modal-title` | `typo-input-sm` | | `typo-data` | `typo-tab` |
| `typo-body` | | | `typo-data-label` | `typo-nav` |
| `typo-caption` / `typo-empty` | | | | `typo-nav-section` |

### Rules

1. **No raw Tailwind typography** — use `typo-*` classes, not `text-sm font-medium text-gray-700`
2. **No per-file constants** — no `const LABEL = ...` or `const INPUT_CLS = ...`
3. **Colored KPIs** — `typo-kpi-sm` (no color) + color class: `className="typo-kpi-sm text-amber-600"`
4. **Block vs inline** — `typo-label` has `block mb-1`. For inline labels use `typo-data-label`
5. **Print exempt** — JobChallan, BatchChallan, CuttingSheet, LabelSheet keep inline `style={{}}`
6. **Emerald theme** — all focus rings, active tabs, primary buttons, filter pills use `emerald-600`. No `primary-600` / `blue` for UI chrome.
7. **No native `<select>`** for dropdowns — use `FilterSelect` component (`full` prop for forms, default for filters)
8. **Tabs** — emerald underline style: `border-b-2 border-emerald-600 text-emerald-700` + `typo-tab`. No pill/segment tabs.
9. **Buttons** — primary: `bg-emerald-600 typo-btn-sm text-white hover:bg-emerald-700 shadow-sm`. Secondary: `border border-gray-300 typo-btn-sm text-gray-700 hover:bg-gray-50`
10. **Inputs** — `typo-input` (forms) or `typo-input-sm` (compact/filters). Focus: emerald ring (built into the class).
11. **Modal headers** — `title=""` + custom emerald gradient div inside body: `bg-gradient-to-r from-emerald-600 to-teal-600`
12. **On dark backgrounds** — never use `typo-caption`/`typo-kpi-label` (they have gray baked in). Use explicit `text-emerald-100` or `text-white`.






































































































































































## 📊 Latest Project Snapshot
_Last sync: 2026-03-26 11:32:10_
```
{
  "summary": "Project has 17 tracked code files (~8757 lines total).",
  "recent_files": [
    "guardian.md (624 lines)",
    "project-context.json (17 lines)",
    "CLAUDE.md (531 lines)",
    ".claude\\settings.local.json (115 lines)",
    "API_REFERENCE.md (2057 lines)"
  ],
  "language_breakdown": {
    ".md": 14,
    ".py": 1,
    ".json": 2
  },
  "total_lines": 8757,
  "last_updated": "2026-03-26 11:32:10"
}
```