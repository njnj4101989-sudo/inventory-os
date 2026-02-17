# Guardian: Full-Stack Code Guardian Protocol

Guardian ensures **naming consistency**, **data-flow correctness**, and **cross-module integrity** across frontend, backend, database, and API layers.

---

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

## Key Architecture Decisions (Quick Reference)

| Decision | Value |
|----------|-------|
| Response envelope | `{ success, data, message }` |
| Pagination | `{ data: [...], total, page, pages }` |
| Auth tokens | localStorage: `access_token`, `refresh_token`, `user` |
| Mock switch | `VITE_USE_MOCK=true` in `.env` |
| SKU pattern | `ProductType-DesignNo-Color-Size` (e.g. `BLS-101-Red-M`) |
| Roll code | `{SrNo}-{Fabric3}-{Color5}-{Seq}` (e.g. `1-COT-GREEN-01`) |
| Weight unit | kg (primary), meters (optional) |
| LOT model | Groups rolls for cutting; no SKU at lot level |
| Batch source | Created from LOT (lot_id FK), not directly from rolls |
| DB (dev) | SQLite + aiosqlite |
| DB (prod) | PostgreSQL + asyncpg (future) |
| CORS origins | `http://localhost:3000`, `http://localhost:5173` (in backend `.env`) |
| Favicon | Inline SVG emoji in `index.html` (no file needed) |












## 📊 Latest Project Snapshot
_Last sync: 2026-02-17 23:03:37_
```
{
  "summary": "Project has 13 tracked code files (~5174 lines total).",
  "recent_files": [
    "CLAUDE.md (180 lines)",
    "guardian.md (196 lines)",
    "project-context.json (17 lines)",
    "API_REFERENCE.md (904 lines)",
    ".claude\\settings.local.json (43 lines)"
  ],
  "language_breakdown": {
    ".md": 10,
    ".py": 1,
    ".json": 2
  },
  "total_lines": 5174,
  "last_updated": "2026-02-17 23:03:37"
}
```