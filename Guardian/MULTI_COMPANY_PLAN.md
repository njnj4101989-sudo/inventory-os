# Multi-Company + FY-at-Login Implementation Plan

> **Decision:** Schema-per-company (PostgreSQL schemas)
> **Decided:** 2026-03-16 (Session 75)
> **Scope:** 3-4 sessions estimated

---

## Architecture Overview

```
PostgreSQL DB: drs_inventory
│
├── public schema (shared — global data)
│   ├── companies          (id, name, slug, gst_no, address, bank details...)
│   ├── users              (id, username, password, full_name, phone, is_active)
│   ├── roles              (id, name, permissions JSON)
│   └── user_companies     (user_id, company_id, is_default)
│
├── drs_blouse schema (tenant — business data)
│   ├── financial_years    (id, code, start_date, end_date, status, is_current)
│   ├── suppliers, customers, va_parties
│   ├── colors, fabrics, product_types, value_additions
│   ├── rolls, lots, batches, skus, inventory_state, inventory_events
│   ├── orders, order_items, invoices, invoice_items
│   ├── job_challans, batch_challans, roll_processing, batch_processing
│   ├── supplier_invoices, ledger_entries
│   └── (28 business tables total)
│
└── another_biz schema (tenant — completely independent)
    └── (same 28 tables, own data, own FYs, own counters)
```

---

## Phase 1: Infrastructure (Session S76)

### 1a. Local PostgreSQL via Docker

**Drop SQLite for dev.** Schema-per-company requires PostgreSQL.

```yaml
# docker-compose.yml (project root)
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev1234
      POSTGRES_DB: inventory_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

- Remove `aiosqlite` dependency, `is_postgresql()` conditionals, `batch_alter_table` workarounds
- Update `.env`: `DATABASE_URL=postgresql+asyncpg://dev:dev1234@localhost:5432/inventory_dev`
- Clean up `database.py`: single engine config (asyncpg only)

### 1b. Schema-Aware Database Layer

**`database.py` changes:**

```python
# Key concept: search_path injection per request
async def get_tenant_session(company_schema: str):
    async with async_session_factory() as session:
        await session.execute(text(f"SET search_path TO {company_schema}, public"))
        yield session
```

- `public` tables: Company, User, Role, UserCompany
- Tenant tables: everything else (28 models)
- Model base classes: `PublicBase` (schema='public') vs `TenantBase` (schema from search_path)

### 1c. Company + UserCompany Models

**Company model (already exists — move to public schema):**
- id, name, slug (unique, URL-safe), schema_name (auto-generated from slug)
- address, city, state, pin_code, gst_no, state_code, pan_no
- phone, email, logo_url
- bank_name, bank_account, bank_ifsc, bank_branch
- is_active, created_at

**UserCompany junction (NEW):**
- user_id FK → public.users
- company_id FK → public.companies
- is_default (bool) — auto-select on login
- role_id FK → public.roles (role can vary per company)

### 1d. Schema Provisioning

```python
async def create_company_schema(slug: str):
    schema = f"co_{slug}"  # e.g. co_drs_blouse
    await engine.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
    # Run all tenant migrations in new schema
    # Seed default masters (colors, fabrics, product_types, VAs)
    return schema
```

---

## Phase 2: Auth Flow Changes (Session S76-S77)

### 2a. Login Flow

```
1. POST /auth/login { username, password }
   → Authenticate against public.users
   → Fetch user's companies from public.user_companies

2. If 1 company → auto-select, return JWT with company context
   If N companies → return company list, frontend shows picker

3. POST /auth/select-company { company_id }
   → Issue JWT with: sub, username, role, permissions, company_id, company_schema, fy_id

4. Frontend stores JWT → all API calls auto-scoped
```

### 2b. JWT Payload (extended)

```json
{
  "sub": "user-uuid",
  "username": "admin",
  "role": "admin",
  "permissions": { "stock_in": true, ... },
  "company_id": "company-uuid",
  "company_schema": "co_drs_blouse",
  "company_name": "Dr's Blouse",
  "fy_id": "fy-uuid",
  "fy_code": "FY2026-27"
}
```

### 2c. Middleware — Schema Injection

```python
# dependencies.py
async def get_db(request: Request):
    company_schema = request.state.company_schema  # from JWT middleware
    async with async_session_factory() as session:
        await session.execute(text(f"SET search_path TO {company_schema}, public"))
        yield session
```

- Every service already receives `db: AsyncSession` via dependency injection
- Zero changes to service code — search_path handles scoping transparently

### 2d. FY Context

- Login response includes available FYs for selected company
- User picks FY (defaults to current)
- `fy_id` in JWT — services that need it read from token
- Header shows: `Company Name | FY 2026-27` with switcher

---

## Phase 3: Frontend Changes (Session S77)

### 3a. Login Page

```
┌─────────────────────────────────────┐
│          Inventory-OS               │
│                                     │
│  Username: [__________]             │
│  Password: [__________]             │
│                                     │
│  [Login]                            │
└─────────────────────────────────────┘
         ↓ (if multi-company)
┌─────────────────────────────────────┐
│     Select Company                  │
│                                     │
│  ○ Dr's Blouse        (default)     │
│  ○ Krishna Textiles                 │
│                                     │
│  Financial Year: [FY2026-27 ▼]      │
│                                     │
│  [Continue]                         │
└─────────────────────────────────────┘
```

### 3b. Header Bar

- Show active company name + FY badge
- Company switcher dropdown (re-issues JWT, reloads page)
- FY switcher (same)

### 3c. Settings Page Enhancement

- "Companies" tab (super-admin only): list companies, create new
- "Create Company" wizard: name, GST, address → auto-creates schema + first FY
- Existing Company Profile + Financial Years tabs work within active company

### 3d. No Other Page Changes

- No `company_id` filters anywhere
- No FY dropdowns on list pages
- Everything scoped by JWT context automatically

---

## Phase 4: Year Closing + Company Setup (Session S78)

### 4a. Year Closing Flow

```
1. Admin clicks "Close FY 2026-27" on Settings → Financial Years tab
2. Backend validates:
   - All challans received (no open JC/BC with status='sent')
   - All batches completed or cancelled
   - Ledger reconciled (optional warning)
3. Snapshot:
   - Compute closing balances for all parties (suppliers, customers, VA parties)
   - Store as `closing_snapshot` JSON on FinancialYear record
4. Create new FY:
   - FY2027-28 (start_date, end_date, is_current=true)
   - Old FY: is_current=false, status='closed', closed_by, closed_at
5. Carry forward:
   - Create opening balance ledger entries in new FY for each party
6. Reset counters:
   - Reset code generators (ORD, INV, JC, BC, LOT, BATCH) to start from 1
   - Implementation: code generators already query MAX — in new FY with no records, they start at 001
   - OR: store last_counter per entity per FY on FinancialYear record
```

### 4b. First-Time Company Setup

```
1. Fresh install → no companies exist
2. Show setup wizard: Company Name, GST, Address, Bank Details
3. On submit:
   - Create company in public.companies
   - Create schema (co_{slug})
   - Run tenant migrations
   - Seed master data (colors, fabrics, product types, VAs)
   - Create first FY (auto-detect: if month >= April → current year, else previous)
   - Link admin user to company
4. Redirect to login → auto-select single company
```

### 4c. Counter Reset Strategy

**Recommended:** Let code generators query MAX naturally. In a new FY with zero records, `MAX(order_number)` returns NULL → starts at `ORD-0001`. No explicit reset needed.

**But:** This only works if codes are FY-scoped in queries. Since we're not prefixing codes with year, we need to ensure the generator queries filter by `fy_id`:

```python
# code_generator.py — add fy_id filter
async def next_order_number(session, fy_id):
    result = await session.execute(
        select(func.max(Order.order_number))
        .where(Order.fy_id == fy_id)
    )
    # Parse and increment...
```

This is the only place `fy_id` needs explicit filtering — everywhere else it's informational.

---

## Migration Strategy

### Alembic Multi-Schema Support

```python
# migrations/env.py — modified
def run_migrations_online():
    schemas = get_all_tenant_schemas()  # from public.companies

    # 1. Run public schema migrations
    with engine.connect() as conn:
        conn.execute(text("SET search_path TO public"))
        context.configure(connection=conn, target_metadata=public_metadata)
        context.run_migrations()

    # 2. Run tenant migrations for each schema
    for schema in schemas:
        with engine.connect() as conn:
            conn.execute(text(f"SET search_path TO {schema}"))
            context.configure(connection=conn, target_metadata=tenant_metadata)
            context.run_migrations()
```

### Data Migration (existing prod data)

```
1. Current prod data is in default `public` schema
2. Create first company record
3. CREATE SCHEMA co_drs_blouse
4. Move all 28 business tables from public → co_drs_blouse
   (ALTER TABLE rolls SET SCHEMA co_drs_blouse)
5. Keep users/roles in public, add user_companies links
6. Update JWT generation to include company context
```

---

## Files to Modify

| File | Change | Phase |
|------|--------|-------|
| `docker-compose.yml` | NEW — local PostgreSQL | 1a |
| `backend/app/database.py` | Schema-aware session, drop SQLite | 1b |
| `backend/app/models/user.py` | Move to public schema, add UserCompany | 1c |
| `backend/app/models/company.py` | Move to public schema, add slug/schema_name | 1c |
| `backend/app/dependencies.py` | Inject company_schema from JWT into session | 2c |
| `backend/app/services/auth_service.py` | Company picker, FY selection, extended JWT | 2a |
| `backend/app/api/auth.py` | `/select-company` endpoint | 2a |
| `backend/app/api/company.py` | Schema provisioning on create | 1d |
| `backend/migrations/env.py` | Multi-schema migration support | 1d |
| `backend/app/core/code_generator.py` | Add fy_id filter to all 6 generators | 4c |
| `frontend/src/pages/LoginPage.jsx` | Company picker + FY selector | 3a |
| `frontend/src/components/Layout.jsx` | Company/FY badge in header | 3b |
| `frontend/src/pages/SettingsPage.jsx` | Companies tab, create wizard | 3c |
| `frontend/src/context/AuthContext.jsx` | Store company/FY in auth state | 3a |

**Zero changes to:** All 17 service files, all 14 page components (except Login/Settings/Layout), all API route files (except auth/company).

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `SET search_path` SQL injection | Use parameterized schema names, validate against `public.companies.schema_name` — never from user input |
| Alembic migration fails on one schema | Wrap in try/catch, log failures, continue others. Admin can retry failed schema |
| Existing prod data migration | One-time script: `ALTER TABLE ... SET SCHEMA`. Test on staging first |
| SQLite dev removal | Docker compose makes local PG trivial. Document in CLAUDE.md |
| Connection pool exhaustion | Schema approach uses ONE pool (not per-company). Non-issue |

---

## Session Breakdown

| Session | Scope | Deliverable |
|---------|-------|-------------|
| **S76** | Phase 1 + Phase 2a-2c | Docker PG, schema-aware DB, company model, JWT with company/FY, middleware |
| **S77** | Phase 2d + Phase 3 | FY context, login company picker, header badge, settings companies tab |
| **S78** | Phase 4 | Year closing, counter reset, first-time setup wizard, prod data migration |
| **S79** | Deploy | Run migration on prod, test multi-company, verify data isolation |
