# Batch Value Addition + Packing — Feature Specification

> **Status:** APPROVED (S42 discussion). Ready for implementation.
> **Sessions needed:** S43 (backend) → S44 (frontend) → S45 (testing + polish)
> **Depends on:** Nothing — current codebase is stable, all 14 pages functional.

---

## 1. Business Context

In DRS Blouse manufacturing, after fabric rolls are cut into lots and distributed as batches to tailors, garments go through additional processing steps before they become sellable inventory:

1. **Tailor stitches** the garment
2. **Value Addition** (optional, repeatable) — garments sent to external vendor for hand-stones, lace work, button work, finishing, etc. Returns to tailor to continue stitching.
3. **QC Check** — checker inspects the finished garment
4. **Value Addition** (optional, repeatable) — post-QC finishing touches at external vendor
5. **Packing** — final step, garments packed into boxes/bundles
6. **Ready Stock** — packed garments enter inventory as sellable units

**Key business rules:**
- VA can happen **during stitching** (mid-production) AND **after QC** (finishing)
- **Multiple VA rounds** are possible (hand-stones first, then lace work)
- Each VA send generates a **Batch Challan** (physical paper sent with goods)
- **Supervisor/Admin** sends and receives VA, not tailor
- **Checker** marks "Ready for Packing" after QC
- Garments at VA vendor are **out-house** — need visibility dashboard
- Roll VA and Garment VA are **separate tables** (different units: kg vs pieces)

---

## 2. Enhanced Batch State Machine

### Before (5 states)

```
created → assigned → in_progress → submitted → completed
```

### After (7 states)

```
created → assigned → in_progress → submitted → checked → packing → packed
                                    ↩ rejected (back to in_progress)
```

| State | Who Triggers | What Happens | Can Send for VA? |
|-------|-------------|--------------|-----------------|
| `created` | System (lot distribution) | Batch exists, unclaimed | No |
| `assigned` | Tailor (QR scan claim) | Tailor owns the batch | No |
| `in_progress` | Tailor (starts work) | Stitching in progress | **Yes** (supervisor sends) |
| `submitted` | Tailor (marks done) | Awaiting QC | No |
| `checked` | Checker (QC passed) | QC approved | **Yes** (supervisor sends for finishing) |
| `packing` | Checker (marks "Ready for Packing") | Being packed | No |
| `packed` | Supervisor (confirms packed) | **Ready Stock** — inventory event fires | No |

### State Transition Rules

```
created     → assigned       Tailor claims via QR scan (or supervisor assigns)
assigned    → in_progress    Tailor starts work
in_progress → submitted      Tailor submits for QC — BLOCKED if VA pending (status='sent')
submitted   → checked        Checker approves (partial or full)
submitted   → in_progress    Checker rejects (full rejection — rework)
checked     → packing        Checker marks "Ready for Packing" — BLOCKED if VA pending
packing     → packed         Supervisor confirms packed (enters optional box reference)
```

### Guard Rails

| Transition | Blocked When | Error Message |
|------------|-------------|---------------|
| `in_progress → submitted` | Any BatchProcessing with `status='sent'` | "Cannot submit — X pieces still at VA vendor" |
| `checked → packing` | Any BatchProcessing with `status='sent'` | "Cannot pack — X pieces still at finishing vendor" |

### Migration: `completed` → `checked`

All existing batches with `status='completed'` will be migrated to `status='checked'` in the Alembic migration. Frontend references to 'completed' updated to 'checked'.

---

## 3. New Data Models

### 3.1 `batch_challans` (mirrors `job_challans`)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK | |
| `challan_no` | String(20) | Unique, Not Null | Auto-sequential: BC-001, BC-002... |
| `processor_name` | String(100) | Not Null | Vendor name (e.g., "Raju Hand-stone Works") |
| `value_addition_id` | UUID | FK → value_additions, Not Null | What VA is being done |
| `total_pieces` | Integer | Not Null | Sum of pieces across all batches in this challan |
| `total_cost` | Numeric(10,2) | Nullable | Filled on receive |
| `sent_date` | DateTime | Not Null | When sent to vendor |
| `received_date` | DateTime | Nullable | When received back |
| `status` | String(20) | Not Null | 'sent' / 'received' |
| `notes` | Text | Nullable | |
| `created_by` | UUID | FK → users, Not Null | Supervisor who created |
| `created_at` | DateTime | Not Null | Auto |

**Relationships:** Has many `BatchProcessing` records (one per batch sent on this challan).

### 3.2 `batch_processing` (mirrors `roll_processing`)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK | |
| `batch_id` | UUID | FK → batches, Not Null | Which batch |
| `batch_challan_id` | UUID | FK → batch_challans, Not Null | Which challan |
| `value_addition_id` | UUID | FK → value_additions, Not Null | What VA |
| `pieces_sent` | Integer | Not Null | How many pieces sent |
| `pieces_received` | Integer | Nullable | Filled on receive |
| `cost` | Numeric(10,2) | Nullable | Cost for this batch's pieces |
| `status` | String(20) | Not Null | 'sent' / 'received' |
| `phase` | String(20) | Not Null | 'stitching' / 'post_qc' — when in flow |
| `notes` | Text | Nullable | |
| `created_by` | UUID | FK → users, Not Null | |
| `created_at` | DateTime | Not Null | Auto |

### 3.3 Modified: `value_additions`

| Add Column | Type | Default | Notes |
|------------|------|---------|-------|
| `applicable_to` | String(20) | 'both' | 'roll' / 'garment' / 'both' |

**Updated seed data:**

| Name | Short Code | Applicable To | Existing? |
|------|-----------|---------------|-----------|
| Embroidery | EMB | both | Yes (update) |
| Dying | DYE | roll | Yes (update) |
| Digital Print | DPT | both | Yes (update) |
| Handwork | HWK | both | Yes (update) |
| Sequin Work | SQN | both | Yes (update) |
| Batik | BTC | roll | Yes (update) |
| Hand Stones | HST | garment | **New** |
| Button Work | BTN | garment | **New** |
| Lace Work | LCW | garment | **New** |
| Finishing | FIN | garment | **New** |

### 3.5 Masters Page UI — Value Additions (Single List + Badge)

**Approach:** One table, one list, zero duplication. Each VA shows an `applicable_to` badge.

```
Value Additions                          [+ Add New]
Filter: [All]  [Roll]  [Garment]  [Both]

┌──────────────────┬──────┬────────────┬─────────┐
│ Name             │ Code │ Applies To │ Actions │
├──────────────────┼──────┼────────────┼─────────┤
│ Embroidery       │ EMB  │  Both      │ ✏️  🗑️  │
│ Dying            │ DYE  │  Roll      │ ✏️  🗑️  │
│ Hand Stones      │ HST  │  Garment   │ ✏️  🗑️  │
│ ...              │      │            │         │
└──────────────────┴──────┴────────────┴─────────┘
```

**Create/Edit form — adds one field:**
```
Name:       [____________]
Short Code: [____]
Applies To: [Both ▾]     ← dropdown: Roll / Garment / Both
```

**Downstream auto-filtering:**
- Job Challan (roll VA send): shows only `applicable_to` = 'roll' or 'both'
- Batch Challan (garment VA send): shows only `applicable_to` = 'garment' or 'both'
- Masters page default: shows all with colored badge

**Badge colors:**
- Roll = purple pill
- Garment = green pill
- Both = blue pill

### 3.4 Modified: `batches`

| Add Column | Type | Constraints | Notes |
|------------|------|-------------|-------|
| `checked_by` | UUID | FK → users, Nullable | Who did QC |
| `packed_by` | UUID | FK → users, Nullable | Who packed |
| `packed_at` | DateTime | Nullable | When packed |
| `pack_reference` | String(50) | Nullable | Box/bundle label (e.g., "BOX-A12") |

| Change | From | To |
|--------|------|-----|
| Status enum | `completed` | `checked` (rename) |
| New statuses | — | `packing`, `packed` |

---

## 4. API Endpoints

### 4.1 Batch Challans (NEW — 4 endpoints)

| Method | Path | Role | Body | What |
|--------|------|------|------|------|
| `POST` | `/batch-challans` | supervisor, admin | `BatchChallanCreate` | Create challan + send batches for VA (atomic) |
| `GET` | `/batch-challans` | supervisor, admin | — | List all batch challans (with filters) |
| `GET` | `/batch-challans/{id}` | supervisor, admin | — | Single challan with all batch_processing records |
| `POST` | `/batch-challans/{id}/receive` | supervisor, admin | `BatchChallanReceive` | Receive all batches back from VA |

### 4.2 Batch State Transitions (MODIFIED — 2 new endpoints)

| Method | Path | Role | What | New? |
|--------|------|------|------|------|
| `POST` | `/batches/{id}/start` | tailor | assigned → in_progress | Existing |
| `POST` | `/batches/{id}/submit` | tailor | in_progress → submitted (+ VA guard) | **Modified** |
| `POST` | `/batches/{id}/check` | checker | submitted → checked / in_progress | **Modified** (was → completed) |
| `POST` | `/batches/{id}/ready-for-packing` | checker | checked → packing (+ VA guard) | **New** |
| `POST` | `/batches/{id}/pack` | supervisor, admin | packing → packed (+ inventory event) | **New** |

### 4.3 Batch Passport (MODIFIED)

| Method | Path | Change |
|--------|------|--------|
| `GET` | `/batches/passport/{batch_code}` | Add `processing_logs` array + `has_pending_va` boolean |

### 4.4 Schemas

**`BatchChallanCreate`:**
```python
{
    "processor_name": "Raju Hand-stone Works",
    "value_addition_id": "uuid",
    "batches": [
        { "batch_id": "uuid", "pieces_to_send": 15 },
        { "batch_id": "uuid", "pieces_to_send": 20 }
    ],
    "notes": "optional"
}
```

**`BatchChallanReceive`:**
```python
{
    "batches": [
        { "batch_id": "uuid", "pieces_received": 15, "cost": 2500.00 },
        { "batch_id": "uuid", "pieces_received": 20, "cost": 3200.00 }
    ],
    "notes": "optional"
}
```

**`BatchPackRequest`:**
```python
{
    "pack_reference": "BOX-A12"  // optional
}
```

---

## 5. In-House / Out-House Visibility

### Computed Status (not stored)

```
IN-HOUSE:  No BatchProcessing records with status='sent' for this batch
OUT-HOUSE: Has BatchProcessing record(s) with status='sent'
PARTIAL:   Some pieces out (pieces_sent < batch total), rest in-house
```

### Where It Shows

| Location | What | How |
|----------|------|-----|
| **BatchesPage** | Filter tabs: "All / In-House / Out-House" | Count pending VA records |
| **RollsPage** | Filter tabs: "All / In-House / Out-House" | Check `status='sent_for_processing'` |
| **Dashboard KPIs** | "X rolls outside / Y batches outside" | Aggregate counts |
| **Batch Passport** | Alert: "⚠ 15 pcs at Raju Hand-stones (since 3-Mar)" | From processing_logs |
| **Roll Passport** | Already shows VA status | No change needed |

### API Support

| Endpoint | Add Filter | Values |
|----------|-----------|--------|
| `GET /batches` | `location` query param | `in_house` / `out_house` / `all` (default) |
| `GET /rolls` | Already has `status` filter | `in_stock` / `sent_for_processing` |
| `GET /dashboard/summary` | Add fields | `rolls_out_count`, `batches_out_count` |

---

## 6. Packing Details

**Approach:** Light packing — fields on Batch model (no separate table).

| Field | Type | Set By | When |
|-------|------|--------|------|
| `packed_by` | FK → User | System | When supervisor clicks "Pack" |
| `packed_at` | DateTime | System | Same time |
| `pack_reference` | String(50) | Supervisor (optional) | Same time — box/bundle label |

**Flow:**
1. Checker marks batch `checked` after QC
2. If post-QC VA needed → supervisor sends for VA → receives back
3. Checker clicks "Ready for Packing" → status = `packing`
4. Supervisor clicks "Mark Packed" → enters optional box reference → status = `packed`
5. System creates `InventoryEvent(type='ready_stock_in')` → batch appears in inventory

**Future expansion (if needed):** Add `PackingRecord` model for multi-batch box tracking, warehouse locations, barcode labels per box. Not needed now.

---

## 7. Inventory Integration

When batch reaches `packed` status:

```python
# In batch_service.pack_batch():
InventoryEvent(
    event_type='ready_stock_in',
    batch_id=batch.id,
    sku_id=batch.sku_id,        # may be null if SKU not linked yet
    quantity=batch.piece_count,
    size=batch.size,
    design_no=batch.lot.design_no,
    notes=f"Packed: {batch.batch_code} | Box: {pack_reference or 'N/A'}"
)
```

**InventoryPage enhancement:** New "Ready Stock" tab showing packed batches grouped by design/size with piece counts.

---

## 8. Complete Production Flow (Visual)

```
══════════════════════════════════════════════════════════════════
  ROLL LIFECYCLE (existing — no changes)
══════════════════════════════════════════════════════════════════

  Supplier Invoice → Stock-In (rolls)
       ↓
  [Optional] Roll VA (JobChallan JC-001)
       → Sent to vendor (EMB/DYE/DPT/HWK/SQN/BTC)
       → Received back (weight updated)
       ↓
  Lot Creation (cutting — rolls consumed, pallaas calculated)
       ↓
  Lot Distribution → Batches auto-created (by size)
       ↓

══════════════════════════════════════════════════════════════════
  BATCH LIFECYCLE (enhanced — this spec)
══════════════════════════════════════════════════════════════════

  CREATED ─── batch exists, QR label printed
       ↓
  ASSIGNED ── tailor scans QR, claims batch
       ↓
  IN_PROGRESS ── tailor stitching
       │
       ├──── [VA DETOUR — repeatable] ────────────────────┐
       │     Supervisor creates BatchChallan (BC-001)      │
       │     → 15 pcs sent to "Raju Hand-stones" (HST)    │
       │     → days pass...                                │
       │     Supervisor receives back (15 pcs, ₹2,500)    │
       │     → tailor continues stitching ←────────────────┘
       │
       ↓  (BLOCKED if VA pending)
  SUBMITTED ── tailor marks "done", awaits QC
       ↓
  CHECKED ── checker QC passed
       │     (or REJECTED → back to IN_PROGRESS for rework)
       │
       ├──── [VA DETOUR — repeatable] ────────────────────┐
       │     Supervisor creates BatchChallan (BC-002)      │
       │     → 50 pcs sent to "finishing vendor" (FIN)     │
       │     → days pass...                                │
       │     Supervisor receives back (50 pcs, ₹1,000)    │
       │     ←─────────────────────────────────────────────┘
       │
       ↓  (BLOCKED if VA pending)
  PACKING ── checker marks "Ready for Packing"
       ↓
  PACKED ═══ supervisor confirms packed (optional box ref)
       ║
       ║  → InventoryEvent(type='ready_stock_in') fires
       ║  → Appears in Inventory as READY STOCK
       ║  → Available for Order fulfillment
       ╚══════════════════════════════════════════════════
```

---

## 9. UI Changes Summary

### ScanPage (Batch Passport) — Enhanced

| Current | Add |
|---------|-----|
| Claim / Start / Submit / QC buttons | + "Ready for Packing" button (checker, when checked) |
| — | + "Mark Packed" button (supervisor, when packing) |
| — | + VA history timeline (sent/received with dates, vendor, cost) |
| — | + "⚠ Out-House" alert when VA pending |
| Status badge (5 states) | Status badge (7 states + VA indicator) |

### BatchesPage — Enhanced

| Current | Add |
|---------|-----|
| Tabs: All / Unclaimed / In Production / In Review / Done | + In-House / Out-House filter |
| Pipeline KPIs (5) | + "Out for VA" count + "Ready Stock" count |
| — | + VA status indicator on batch cards |

### New Page/Modal: Batch Challan

| Component | Purpose |
|-----------|---------|
| Send for VA modal | Select batches, VA type, vendor, pieces → creates BatchChallan |
| Receive from VA modal | Select challan, enter pieces received + cost per batch |
| BatchChallanPage (optional) | List all batch challans (like JobChallan page) |

### Dashboard — Enhanced

| Add | What |
|-----|------|
| KPI card | "Rolls Out-House: X" |
| KPI card | "Batches Out-House: Y" |
| KPI card | "Ready Stock: Z pieces" |

---

## 10. Implementation Checklist

### Session 43 — Backend (Models + API)

| # | Task | Files | Status |
|---|------|-------|--------|
| 1 | Create `BatchChallan` model | `backend/app/models/batch_challan.py` | PENDING |
| 2 | Create `BatchProcessing` model | `backend/app/models/batch_processing.py` | PENDING |
| 3 | Add `applicable_to` to `ValueAddition` model | `backend/app/models/value_addition.py` | PENDING |
| 4 | Add packing fields to `Batch` model | `backend/app/models/batch.py` | PENDING |
| 5 | Alembic migration (all model changes + `completed`→`checked`) | `backend/migrations/versions/` | PENDING |
| 6 | Create `BatchChallanCreate/Response/Receive` schemas | `backend/app/schemas/batch_challan.py` | PENDING |
| 7 | Update `BatchResponse` schema (add processing_logs, has_pending_va) | `backend/app/schemas/batch.py` | PENDING |
| 8 | Create `batch_challan_service.py` (create, receive, list, get) | `backend/app/services/batch_challan_service.py` | PENDING |
| 9 | Update `batch_service.py` (VA guards, new transitions, pack) | `backend/app/services/batch_service.py` | PENDING |
| 10 | Create `batch_challans` router (4 endpoints) | `backend/app/api/batch_challans.py` | PENDING |
| 11 | Update `batches` router (2 new endpoints) | `backend/app/api/batches.py` | PENDING |
| 12 | Update batch passport endpoint (include VA logs) | `backend/app/api/batches.py` | PENDING |
| 13 | Seed new VA types (HST, BTN, LCW, FIN) | `backend/app/core/seed.py` | PENDING |
| 14 | Update existing VA seeds (`applicable_to` field) | `backend/app/core/seed.py` | PENDING |

### Session 44 — Frontend (UI)

| # | Task | Files | Status |
|---|------|-------|--------|
| 15 | Masters page: add `applicable_to` badge + filter + form field | `MastersPage.jsx` | PENDING |
| 16 | Update status colors/labels (7 states) | `StatusBadge`, `ScanPage`, `BatchesPage` | PENDING |
| 17 | Batch passport: VA timeline + out-house alert | `ScanPage.jsx` | PENDING |
| 18 | Batch passport: "Ready for Packing" + "Mark Packed" buttons | `ScanPage.jsx` | PENDING |
| 19 | Send for VA modal (select batches, VA type, vendor, pieces) | New component | PENDING |
| 20 | Receive from VA modal (challan lookup, enter received pieces + cost) | New component | PENDING |
| 21 | BatchesPage: in-house/out-house filter + VA indicators | `BatchesPage.jsx` | PENDING |
| 22 | Dashboard: out-house KPIs + ready stock count | `DashboardPage.jsx` | PENDING |
| 23 | API module: `batchChallans.js` (CRUD + receive) | `frontend/src/api/batchChallans.js` | PENDING |
| 24 | Mock data for batch challans + processing | `frontend/src/api/mock.js` | PENDING |
| 25 | Update `batches.js` API (new endpoints) | `frontend/src/api/batches.js` | PENDING |

### Session 45 — Testing + Polish

| # | Task | Files | Status |
|---|------|-------|--------|
| 26 | E2E flow test: stock-in → lot → batch → VA → QC → VA → pack → ready stock | All | PENDING |
| 27 | Mobile flow test: tailor scan → work → submit (with VA block) | Phone | PENDING |
| 28 | Batch passport print update (include VA history) | `BatchLabelSheet.jsx` | PENDING |
| 29 | Update `API_REFERENCE.md` with new endpoints/schemas | `Guardian/API_REFERENCE.md` | PENDING |
| 30 | Update `STEP2_DATA_MODEL.md` with new tables | `Guardian/STEP2_DATA_MODEL.md` | PENDING |
| 31 | Update `STEP3_EVENT_CONTRACTS.md` with new state machine | `Guardian/STEP3_EVENT_CONTRACTS.md` | PENDING |

---

## 11. Questions to Confirm Before Starting

1. ~~Who sends garments for VA?~~ **Supervisor/Admin** ✅
2. ~~Who receives garments back?~~ **Same role (Supervisor/Admin)** ✅
3. ~~Who initiates packing?~~ **Checker marks "Ready for Packing"** ✅
4. ~~Packing tracking detail level?~~ **Light — packed_by, packed_at, pack_reference on Batch** ✅
5. ~~Multiple VA during stitching?~~ **Yes, with BatchChallan each time** ✅
6. ~~Separate VA tables?~~ **Yes — roll_processing vs batch_processing** ✅
7. **New VA types to seed?** HST, BTN, LCW, FIN seeded. Masters page allows adding more anytime. ✅
8. **QC pass = auto "Ready for Packing"?** → **Separate click by checker** ✅ (gives time to flag if post-QC VA needed)
9. **Masters page UI for applicable_to?** → **Single list + colored badge + filter** ✅ (no separate sections)

**All questions resolved. Spec is LOCKED. Ready for implementation.**
