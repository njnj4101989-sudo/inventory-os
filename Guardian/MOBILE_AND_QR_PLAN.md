# Mobile-First UI + QR Scan Integration Plan

## Status: Ready to start. Created S102 (2026-04-02).

---

## Part A: Mobile-First UI (10 tasks)

All admin pages currently use desktop sidebar layout. On mobile (<768px), sidebar blocks the viewport and tables overflow. Goal: make Orders + Returns fully usable on mobile for QR scan workflows.

### A1. Responsive Sidebar — hamburger menu on mobile
- Layout.jsx + Sidebar.jsx: Auto-hide sidebar below `md` (768px)
- Add hamburger toggle button in a mobile top bar
- Slide-out drawer with backdrop overlay
- Close on nav click + backdrop click
- Desktop sidebar unchanged
- **Files:** Layout.jsx, Sidebar.jsx

### A2. Mobile top bar for admin roles
- Layout.jsx: Sticky top bar (visible only below md) with hamburger, logo, notification bell
- Match MobileLayout header style
- Adjust main content padding-top on mobile
- **Files:** Layout.jsx

### A3. DataTable mobile card view
- DataTable.jsx: Below md, render rows as stacked cards instead of table rows
- Each card shows key columns as label:value pairs
- Add `mobileRender` prop — each page defines its own card layout
- Desktop table unchanged
- **Files:** DataTable.jsx

### A4. OrdersPage — list view mobile cards
- Configure DataTable mobile card view for orders
- Card: Order No (bold), Customer, Date, Status badge, Total, Item count
- KPI strip: 2-col grid on mobile
- Filter tabs: horizontal scroll
- Search + filters: stack vertically
- **Files:** OrdersPage.jsx

### A5. OrdersPage — create/edit form mobile UX
- Line items: replace 10-column table with card-based layout below md
- Each card: Design (full width), Color + Size (2-col), Stock + Pipeline (badges), Qty + Price (2-col), Total + delete
- Scan QR button prominent at top
- Totals section: full width on mobile
- **Files:** OrdersPage.jsx

### A6. OrdersPage — detail overlay mobile UX
- Items table → stacked cards on mobile
- Shipment history cards: full width stacked
- Action buttons: full width stacked
- Ship modal: fields stack vertically
- **Files:** OrdersPage.jsx

### A7. ReturnsPage — list view mobile cards
- Configure DataTable mobile card view for returns
- Supplier returns card: RN number, Supplier, Status, Type, Date, Amount
- Sales returns card: SRN number, Customer, Status, Date, Amount
- Tab switcher: horizontal scroll
- KPI strip: 2-col on mobile
- **Files:** ReturnsPage.jsx

### A8. ReturnsPage — create forms mobile UX
- Both supplier + sales return create overlays
- Line items table → card-based layout below md
- Supplier return card: Roll/SKU code, Qty/Weight, Price, Reason, Scan button
- Sales return card: SKU code, Qty, Price, Reason, Scan button
- Scan QR prominent
- **Files:** ReturnsPage.jsx

### A9. ReturnsPage — detail overlays mobile UX
- Info cards stack on mobile
- Items table → stacked cards
- Status timeline: vertical on mobile
- Action buttons: full width stacked
- **Files:** ReturnsPage.jsx

### A10. Touch polish + viewport test
- All tap targets min 44px (WCAG)
- touch-action: manipulation on interactive elements
- safe-area-inset-bottom on overlays
- Verify scan QR → camera → back to form on mobile Chrome
- Test at 375px (iPhone SE), 390px (iPhone 14), 412px (Android)
- Fix overflow-x scrolling issues

---

## Part B: QR Scan on Challan Workflows (4 tasks)

QR scanning exists on ScanPage, OrdersPage, ReturnsPage. Missing on Challans (daily VA workflow) and Lots.

### B1. Job Challan create — scan roll QR to add rolls
- ChallansPage.jsx: Add "Scan QR" button on Job Challan create form
- Scan roll QR → extract roll_code → find in loaded rolls → auto-add to challan roll list
- If roll already in list → highlight/flash (don't duplicate)
- Same CameraScanner pattern as OrdersPage
- **Files:** ChallansPage.jsx

### B2. Batch Challan create — scan batch QR to add batches
- ChallansPage.jsx: Add "Scan QR" button on Batch Challan create form
- Scan batch QR → extract batch_code → find in loaded batches → auto-add to challan batch list
- If batch already in list → highlight/flash
- **Files:** ChallansPage.jsx

### B3. QR code on Job Challan print
- JobChallan.jsx (print component): Add QR code encoding challan URL `/scan/challan/JC-XXXX`
- Position: top-right corner of print layout
- Size: 80px (smaller than roll label QR)
- Optional: needs backend passport endpoint `GET /job-challans/passport/{challan_no}` if scan-to-view is wanted
- **Files:** JobChallan.jsx

### B4. QR code on Batch Challan print
- BatchChallan.jsx (print component): Add QR code encoding challan URL
- Same pattern as B3
- **Files:** BatchChallan.jsx

---

## Part C: Future (not now)

- C1. Scan QR on Lot create → adds roll to picker (LotsPage.jsx)
- C2. QR on Invoice print (customer-facing)
- C3. Continuous scan mode with beep feedback (OrdersPage)
- C4. Server-side SKU search when SKUs exceed 2000+

---

## Build Order Recommendation

1. **A1 + A2** first (sidebar fix unlocks all mobile pages)
2. **A3** (DataTable cards — reusable foundation)
3. **A5 + B1** together (Order form + Challan form — both use scan)
4. **A4 + A6** (Order list + detail mobile)
5. **B2 + A8** (Batch challan scan + Return form mobile)
6. **A7 + A9** (Return list + detail mobile)
7. **B3 + B4** (QR on challan prints)
8. **A10** (final polish + test)

Each step is a clean checkpoint — session can pause after any.
