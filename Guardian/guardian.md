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
| `StatusBadge` | `status`, `label` | |
| `ErrorAlert` | `message`, `onDismiss` | |
| `LoadingSpinner` | `size` (`sm`/`md`/`lg`), `text` | |

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
| Auth tokens | localStorage: `access_token`, `refresh_token`, `user` |
| Mock switch | `VITE_USE_MOCK=true` in `.env` |
| SKU pattern | `ProductType-DesignNo-Color-Size` (e.g. `BLS-101-Red-M`) |
| Roll code | `{SrNo}-{Fabric3}-{Color5/ColorNo}-{Seq}` (e.g. `1-COT-GREEN/01-01`) |
| Weight unit | kg (primary), meters (optional) |
| LOT model | Groups rolls for cutting; no SKU at lot level |
| Batch source | Created from LOT (lot_id FK), not directly from rolls |
| DB (dev) | SQLite + aiosqlite |
| DB (prod) | PostgreSQL + asyncpg (future) |
| CORS origins | `http://localhost:3000`, `http://localhost:5173` (in backend `.env`) |
| Favicon | Inline SVG emoji in `index.html` (no file needed) |







































































## 📊 Latest Project Snapshot
_Last sync: 2026-03-03 02:25:40_
```
{
  "summary": "Project has 14 tracked code files (~6395 lines total).",
  "recent_files": [
    "CLAUDE.md (303 lines)",
    "API_REFERENCE.md (1430 lines)",
    "STEP2_DATA_MODEL.md (614 lines)",
    "guardian.md (377 lines)",
    "project-context.json (17 lines)"
  ],
  "language_breakdown": {
    ".md": 11,
    ".py": 1,
    ".json": 2
  },
  "total_lines": 6395,
  "last_updated": "2026-03-03 02:25:40"
}
```