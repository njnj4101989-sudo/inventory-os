# STEP 1: SYSTEM OVERVIEW
## Inventory-OS | Production-Grade Textile Inventory System

**Version:** 1.0
**Status:** Approved
**Date:** 2026-02-07

---

## 1.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OFFICE / FACTORY LAN                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│    ┌─────────────┐         ┌─────────────────────────────────────────┐     │
│    │   MOBILE    │         │         EDGE SERVER (Office PC)         │     │
│    │   DEVICES   │◄───────►│  ┌─────────────┐    ┌──────────────┐   │     │
│    │             │  Wi-Fi  │  │   FastAPI   │    │  PostgreSQL  │   │     │
│    │ • Supervisor│   LAN   │  │   Backend   │◄──►│   Local DB   │   │     │
│    │ • Tailor    │         │  └─────────────┘    └──────────────┘   │     │
│    │ • Checker   │         │         │                              │     │
│    └─────────────┘         │         │ Async (when online)          │     │
│                            │         ▼                              │     │
│    ┌─────────────┐         │  ┌─────────────┐                       │     │
│    │  WEB APPS   │◄───────►│  │ Sync Worker │───────────────────────┼─────┼──► SUPABASE
│    │             │   LAN   │  └─────────────┘      Backup Only      │     │    (Cloud)
│    │ • Admin     │         │                                        │     │
│    │ • Supervisor│         └────────────────────────────────────────┘     │
│    │ • Billing   │                                                        │
│    └─────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ REST API (via tunnel/VPN)
                                        ▼
                              ┌─────────────────┐
                              │  drsblouse.com  │
                              │  (E-commerce)   │
                              └─────────────────┘
```

---

## 1.2 Component Breakdown

| Component | Technology | Location | Purpose |
|-----------|------------|----------|---------|
| **Edge Server** | FastAPI + PostgreSQL | Office PC (LAN) | Primary backend, all business logic |
| **Web App** | React | Served from Edge | Admin, Supervisor, Billing dashboards |
| **Mobile App** | Android APK | Phones on Wi-Fi | Supervisor (floor), Tailor, Checker |
| **Cloud Backup** | Supabase | Internet | Daily backup, disaster recovery |
| **E-commerce API** | REST endpoints | Edge Server | Stock check, reserve, confirm for drsblouse.com |

---

## 1.3 Tech Stack (Locked)

| Layer | Technology | Reason |
|-------|------------|--------|
| Backend | FastAPI (Python) | Async, fast, type-safe |
| Local DB | PostgreSQL | Robust, ACID, event sourcing friendly |
| Cloud | Supabase | Backup/restore, free tier, PostgreSQL compatible |
| Web Frontend | React | Component-based, wide ecosystem |
| Mobile | Android (Kotlin/React Native) | Single APK, role-based |
| Deployment | Docker Compose | Easy local deployment |
| Tunnel | Cloudflare Tunnel | Secure e-commerce access |

---

## 1.4 Role Matrix

| Role | Web | Mobile | Key Actions |
|------|-----|--------|-------------|
| **Admin** | ✅ | ❌ | User mgmt, config, full reports |
| **Supervisor** | ✅ | ✅ | Stock-in, cutting, batch creation, assignment |
| **Tailor** | ❌ | ✅ | Scan QR, view work, submit completion |
| **Checker** | ❌ | ✅ | Scan QR, inspect, approve/reject |
| **Billing** | ✅ | ❌ | Invoices, e-commerce orders |

---

## 1.5 Production Flow

```
[1] STOCK-IN (Supervisor - Web/Mobile)
    │
    │ Event: STOCK_IN (raw_material)
    │ Creates: Roll record with qty (meters/length)
    ▼
[2] CUTTING (Supervisor - Web)
    │
    │ Event: STOCK_OUT (raw_material) - deduct from roll
    │ Creates: Cut pieces linked to roll(s)
    ▼
[3] BATCH CREATION (Supervisor - Web)
    │
    │ Creates: Batch record (status: CREATED)
    │ Generates: Batch QR Code
    │ Links: Cut pieces → Batch → SKU
    ▼
[4] ASSIGNMENT (Supervisor - Web/Mobile)
    │
    │ Updates: Batch status → ASSIGNED
    │ Links: Batch → Tailor
    ▼
[5] STITCHING (Tailor - Mobile)
    │
    │ Scan QR → View batch details
    │ Updates: Batch status → IN_PROGRESS
    │ On completion: Batch status → SUBMITTED
    ▼
[6] QC CHECK (Checker - Mobile)
    │
    │ Scan QR → Inspect batch
    │ Approve → Batch status → COMPLETED
    │ Reject  → Batch status → ASSIGNED (back to tailor)
    ▼
[7] FINISHED GOODS (System - Auto)
    │
    │ Event: STOCK_IN (finished_goods)
    │ SKU inventory increased
    │ Batch tags ready for printing
    ▼
[8] SALE / ORDER (Billing - Web / E-commerce API)
    │
    │ Event: RESERVE (order placed)
    │ Event: STOCK_OUT (order shipped)
    │ Event: RELEASE (order cancelled)
    │ Event: RETURN (goods returned)
    ▼
[9] INVOICE (Billing - Web)
    │
    │ Generate invoice with QR
    │ Print invoice
    │ Link to dispatched batches (internal)
```

---

## 1.6 SKU Strategy

**Format:** `[PRODUCT]-[COLOR]-[SIZE]`

```
Examples:
├── BLS-RED-M    → Blouse, Red, Medium
├── KRT-BLU-L    → Kurta, Blue, Large
├── DRS-WHT-FS   → Dress, White, Free Size
```

- SKU identifies **product type** (not individual pieces)
- All identical items share same SKU
- Individual tracking via **Batch ID**
- System auto-generates SKU from supervisor input

---

## 1.7 Inventory Event Model

| Event | Trigger | Effect on Stock |
|-------|---------|-----------------|
| `STOCK_IN` | Roll received / Batch completed | +qty |
| `STOCK_OUT` | Roll cut / Order shipped | -qty |
| `RESERVE` | Order placed | -available, +reserved |
| `RELEASE` | Order cancelled | +available, -reserved |
| `RETURN` | Goods returned | +qty |
| `LOSS` | Damage / theft | -qty (with reason) |

**Golden Rule:** Stock quantity is ALWAYS computed from events. Never edited directly.

---

## 1.8 Inventory State (Computed)

```
SKU: BLS-RED-M
├── Total Qty: 150
├── Available: 120
├── Reserved: 30 (held for orders)
│
└── Source Batches:
    ├── BATCH-0012 → 50 pcs (Completed: 2024-02-01)
    ├── BATCH-0018 → 60 pcs (Completed: 2024-02-05)
    └── BATCH-0023 → 40 pcs (Completed: 2024-02-07)

When order ships → System auto-picks from oldest batch (FIFO)
User never manually selects batch
```

---

## 1.9 Roll → Batch Relationship (Flexible)

```
┌─────────────┐          ┌─────────────┐
│   Roll A    │────────▶│   Batch 1   │   (1 Roll → 1 Batch)
└─────────────┘          └─────────────┘

┌─────────────┐          ┌─────────────┐
│   Roll B    │────┬────▶│   Batch 2   │   (1 Roll → Many Batches)
└─────────────┘    │     └─────────────┘
                   └────▶┌─────────────┐
                         │   Batch 3   │
                         └─────────────┘

┌─────────────┐
│   Roll C    │────┬────▶┌─────────────┐
└─────────────┘    │     │   Batch 4   │   (Many Rolls → 1 Batch)
┌─────────────┐    │     └─────────────┘
│   Roll D    │────┘
└─────────────┘
```

Tracked via `batch_roll_consumption` junction table.

---

## 1.10 Offline & Failure Strategy

### Mobile Offline Handling

```
┌─────────────────────────────────────────────────────────────┐
│ MOBILE APP (Tailor/Checker)                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Action Queue]                                             │
│  ├── Scan batch ABC → Status: IN_PROGRESS (pending sync)   │
│  ├── Submit batch ABC → Status: SUBMITTED (pending sync)   │
│  └── ...                                                    │
│                                                             │
│  When Wi-Fi restored:                                       │
│  └── Auto-sync queue → Edge Server                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Edge Server Failure Recovery

| Scenario | Recovery |
|----------|----------|
| Power loss | PostgreSQL WAL ensures no data loss on restart |
| PC crash | Restore from Supabase backup to new PC |
| DB corruption | Point-in-time recovery from cloud backup |
| Internet down | System continues normally (local-first) |

### Cloud Sync Strategy

```
┌─────────────────────────────────────────────────────────────┐
│ SYNC WORKER (Background)                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Every 24 hours (or manual trigger):                        │
│  1. Create encrypted PostgreSQL dump                        │
│  2. Upload to Supabase Storage                              │
│  3. Retain last 7 backups                                   │
│                                                             │
│  On restore:                                                │
│  1. Download latest backup from Supabase                    │
│  2. Decrypt and restore to PostgreSQL                       │
│  3. Verify integrity                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 1.11 E-commerce Integration (drsblouse.com)

### API Endpoints Exposed

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/external/stock/{sku}` | GET | Check available qty |
| `/api/v1/external/reserve` | POST | Hold stock for order |
| `/api/v1/external/confirm` | POST | Confirm reserved stock (ship) |
| `/api/v1/external/release` | POST | Release reserved stock (cancel) |
| `/api/v1/external/return` | POST | Return stock to inventory |

### Connection Method

| Method | Setup | Best For |
|--------|-------|----------|
| **Cloudflare Tunnel** | Zero-trust tunnel to edge | Simple, secure (Recommended) |
| VPN | Site-to-site VPN | If already have VPN infra |
| Polling via Supabase | E-commerce polls cloud | Fallback if tunnel fails |

---

## 1.12 Security Model

| Layer | Mechanism |
|-------|-----------|
| API Auth | JWT tokens (role-based) |
| Mobile Auth | JWT + device fingerprint |
| External API | API Key + IP whitelist |
| Data at rest | PostgreSQL encryption |
| Backup | AES-256 encrypted before upload |
| Network | LAN only (no public exposure except tunnel) |

---

## 1.13 Deployment Topology

```
EDGE SERVER (Office PC - Windows/Linux)
├── Docker Compose
│   ├── fastapi-backend (port 8000)
│   ├── postgresql (port 5432)
│   ├── nginx (port 80/443) - serves React app
│   └── cloudflared (tunnel for e-commerce)
│
├── Backup Scripts
│   ├── daily-backup.sh
│   └── restore.sh
│
└── Mobile APK
    └── Distributed via local file share or QR download link
```

---

## 1.14 Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Availability | 99% (local system) |
| Recovery Time | < 2 hours (from cloud backup) |
| Data Loss Tolerance | < 24 hours (backup frequency) |
| Concurrent Users | 20 (mobile + web) |
| Response Time | < 500ms (local network) |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-07 | Initial approved version |

---

**Next:** STEP 2 - Data Model Design
