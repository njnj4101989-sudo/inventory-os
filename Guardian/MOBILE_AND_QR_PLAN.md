# Mobile PWA + Scanner Gun Plan

## Status: S103 IN PROGRESS (2026-04-03). Approach: Option B (Smart) + Scanner Gun.

### Approach Decision (S103)
- **Option B: Extend MobileLayout for all roles + Scanner Gun mode**
- Phone = wireless QR scanner gun, desktop = data entry form
- Viewport < 768px → MobileLayout (all roles). >= 768px → desktop Layout (admin/supervisor/billing)
- Tailor/Checker PWA unchanged (Scan/My Work or QC Queue/Profile)
- Admin/Supervisor/Billing mobile: **Scan | Activity | Profile** (3 tabs)
- Same tabs for all admin-side roles — logs track who did what
- Desktop Layout.jsx — ZERO changes
- Future: add more tabs (Orders list, etc.) only if real usage demands it

### Why Not Option C (Responsive Layout)
- Making 14 pages responsive = massive work, most never used on mobile
- Scanner gun eliminates need for mobile form creation
- Purpose-built mobile UX > responsive compromise

---

## Phase 1: Scanner Gun PWA (S103 — 8 tasks)

### T1. Viewport detection — route admin/supervisor/billing to MobileLayout on <768px
- App.jsx: useViewport hook or media query detection
- Below 768px → all roles get MobileLayout with role-aware tabs
- Above 768px → admin/supervisor/billing get desktop Layout (unchanged)
- Tailor/checker → always MobileLayout (unchanged)
- **Files:** App.jsx

### T2. BottomNav role-aware tabs — 3 tabs for admin-side roles
- BottomNav.jsx: Add tab config for admin/supervisor/billing → Scan | Activity | Profile
- Keep existing tailor (Scan/My Work/Profile) and checker (Scan/QC Queue/Profile)
- **Files:** BottomNav.jsx

### T3. Scan tab — Gun mode toggle (Passport vs Gun)
- ScanPage.jsx: Toggle between Passport (view info) and Gun (send to desktop)
- Gun mode: camera active, scan → POST /scan/remote → beep/checkmark → ready for next
- Show last scanned code, success/error feedback
- **Files:** ScanPage.jsx

### T4. Backend — POST /scan/remote endpoint + SSE event
- New endpoint: POST /scan/remote { code, context }
- Validate code exists (roll/batch/SKU), resolve entity data
- Emit SSE event { type: "remote_scan", code, entity_type, entity_data } to same user
- **Files:** api/scan.py, event_bus.py

### T5. Desktop listeners — OrdersPage/ChallansPage/ReturnsPage receive remote_scan
- Listen for remote_scan SSE event on create/edit forms
- OrdersPage: scan SKU → auto-add line item
- ChallansPage: scan roll/batch → auto-add to challan
- ReturnsPage: scan SKU/roll → auto-add to return
- Toast: "Item added via scan"
- **Files:** OrdersPage.jsx, ChallansPage.jsx, ReturnsPage.jsx, NotificationContext.jsx

### T6. Activity tab — today's scan log
- New ActivityPage.jsx: list of today's scans (timestamp, code, type, status)
- localStorage-backed, most recent first, simple card list
- **Files:** ActivityPage.jsx, App.jsx routing

### T7. MobileLayout header update for admin-side roles
- Show company name + FY badge in header for admin-side roles
- NotificationBell already present
- **Files:** MobileLayout.jsx

### T8. Test — end-to-end scan flow
- Phone scans QR → item appears on desktop form
- Test all 3 contexts (order/challan/return)
- Camera permission, beep feedback, error handling, 44px tap targets

---

## Phase 2: Mobile Card Views (Future — only if needed)

Add tabs for viewing lists on mobile:
- Orders tab → basic card list (view only, no create)
- Challans tab → basic card list
- Returns tab → basic card list
- DataTable mobileRender prop for card views

**Build only when real usage demands it.**

---

## Phase 3: QR on Prints (Future)

- B1. QR code on Job Challan print
- B2. QR code on Batch Challan print
- B3. QR on Invoice print

---

## Build Order (S103)

1. **T1 + T2** (viewport routing + tabs — unlocks mobile shell)
2. **T7** (header update for admin roles)
3. **T4** (backend endpoint — needed before gun mode)
4. **T3** (scan gun mode toggle)
5. **T5** (desktop listeners — completes the loop)
6. **T6** (activity log)
7. **T8** (end-to-end test)
