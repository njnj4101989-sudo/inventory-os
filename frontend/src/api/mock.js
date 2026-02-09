// Mock data store — simulates backend responses
// All field names match backend Pydantic schemas exactly

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms))

// ── UUIDs ──────────────────────────────────────────────
const uid = (n) => `00000000-0000-4000-a000-00000000000${n}`

// ── Roles ──────────────────────────────────────────────
export const PERMISSIONS = {
  admin: {
    user_manage: true, role_manage: true, supplier_manage: true,
    stock_in: true, lot_manage: true, inventory_view: true, inventory_adjust: true,
    order_manage: true, invoice_manage: true, report_view: true,
  },
  supervisor: {
    supplier_manage: true, stock_in: true, roll_cut: true,
    lot_manage: true, batch_create: true, batch_assign: true,
    inventory_view: true, inventory_adjust: true, report_view: true,
  },
  tailor: { batch_start: true, batch_submit: true },
  checker: { batch_check: true },
  billing: {
    inventory_view: true, order_manage: true,
    invoice_manage: true, report_view: true,
  },
}

export const roles = [
  { id: uid(1), name: 'admin', display_name: null, permissions: PERMISSIONS.admin, user_count: 1 },
  { id: uid(2), name: 'supervisor', display_name: null, permissions: PERMISSIONS.supervisor, user_count: 1 },
  { id: uid(3), name: 'tailor', display_name: null, permissions: PERMISSIONS.tailor, user_count: 1 },
  { id: uid(4), name: 'checker', display_name: null, permissions: PERMISSIONS.checker, user_count: 1 },
  { id: uid(5), name: 'billing', display_name: null, permissions: PERMISSIONS.billing, user_count: 1 },
]

// ── Users ──────────────────────────────────────────────
export const users = [
  {
    id: uid(1), username: 'admin1', full_name: 'Nitish Admin',
    role: { id: uid(1), name: 'admin', display_name: null }, phone: '9999900001',
    is_active: true, created_at: '2026-02-07T08:00:00Z',
  },
  {
    id: uid(2), username: 'supervisor1', full_name: 'Ravi Kumar',
    role: { id: uid(2), name: 'supervisor', display_name: null }, phone: '9999900002',
    is_active: true, created_at: '2026-02-07T08:00:00Z',
  },
  {
    id: uid(3), username: 'tailor1', full_name: 'Amit Singh',
    role: { id: uid(3), name: 'tailor', display_name: null }, phone: '9999900003',
    is_active: true, created_at: '2026-02-07T08:00:00Z',
  },
  {
    id: uid(4), username: 'checker1', full_name: 'Suresh Checker',
    role: { id: uid(4), name: 'checker', display_name: null }, phone: '9999900004',
    is_active: true, created_at: '2026-02-07T08:00:00Z',
  },
  {
    id: uid(5), username: 'billing1', full_name: 'Priya Billing',
    role: { id: uid(5), name: 'billing', display_name: null }, phone: '9999900005',
    is_active: true, created_at: '2026-02-07T08:00:00Z',
  },
]

// ── Suppliers ──────────────────────────────────────────
export const suppliers = [
  {
    id: uid(6), name: 'Krishna Textiles',
    contact_person: 'Krishna Sharma', phone: '9876543210',
    address: 'Surat, Gujarat', is_active: true,
    created_at: '2026-02-07T08:00:00Z',
  },
  {
    id: uid(7), name: 'Lakshmi Fabrics',
    contact_person: 'Lakshmi Devi', phone: '9876543211',
    address: 'Jaipur, Rajasthan', is_active: true,
    created_at: '2026-02-07T08:30:00Z',
  },
]

// ── Rolls (weight-based) ──────────────────────────────
export const rolls = [
  {
    id: uid(8), roll_code: 'ROLL-0001', fabric_type: 'Cotton',
    color: 'Green', total_weight: 18.800, remaining_weight: 0,
    unit: 'kg', cost_per_unit: 120.0, total_length: null,
    supplier: { id: uid(6), name: 'Krishna Textiles' },
    supplier_invoice_no: 'KT-2026-0451', supplier_invoice_date: '2026-02-06',
    received_by_user: { id: uid(2), full_name: 'Ravi Kumar' },
    received_at: '2026-02-07T09:00:00Z', notes: null,
  },
  {
    id: uid(9), roll_code: 'ROLL-0002', fabric_type: 'Cotton',
    color: 'Green', total_weight: 36.920, remaining_weight: 0,
    unit: 'kg', cost_per_unit: 120.0, total_length: null,
    supplier: { id: uid(6), name: 'Krishna Textiles' },
    supplier_invoice_no: 'KT-2026-0451', supplier_invoice_date: '2026-02-06',
    received_by_user: { id: uid(2), full_name: 'Ravi Kumar' },
    received_at: '2026-02-07T09:30:00Z', notes: null,
  },
  {
    id: uid('a'), roll_code: 'ROLL-0003', fabric_type: 'Cotton',
    color: 'Red', total_weight: 28.550, remaining_weight: 0,
    unit: 'kg', cost_per_unit: 130.0, total_length: null,
    supplier: { id: uid(6), name: 'Krishna Textiles' },
    supplier_invoice_no: 'KT-2026-0452', supplier_invoice_date: '2026-02-06',
    received_by_user: { id: uid(2), full_name: 'Ravi Kumar' },
    received_at: '2026-02-07T10:00:00Z', notes: null,
  },
  {
    id: uid('b'), roll_code: 'ROLL-0004', fabric_type: 'Cotton',
    color: 'Red', total_weight: 29.000, remaining_weight: 0,
    unit: 'kg', cost_per_unit: 130.0, total_length: null,
    supplier: { id: uid(6), name: 'Krishna Textiles' },
    supplier_invoice_no: 'KT-2026-0452', supplier_invoice_date: '2026-02-06',
    received_by_user: { id: uid(2), full_name: 'Ravi Kumar' },
    received_at: '2026-02-07T10:30:00Z', notes: null,
  },
  {
    id: uid('b1'), roll_code: 'ROLL-0005', fabric_type: 'Cotton',
    color: 'Black', total_weight: 28.590, remaining_weight: 28.590,
    unit: 'kg', cost_per_unit: 125.0, total_length: null,
    supplier: { id: uid(7), name: 'Lakshmi Fabrics' },
    supplier_invoice_no: 'LF-2026-0089', supplier_invoice_date: '2026-02-07',
    received_by_user: { id: uid(2), full_name: 'Ravi Kumar' },
    received_at: '2026-02-08T09:00:00Z', notes: 'Not yet assigned to lot',
  },
  {
    id: uid('b2'), roll_code: 'ROLL-0006', fabric_type: 'Cotton',
    color: 'White', total_weight: 23.120, remaining_weight: 23.120,
    unit: 'kg', cost_per_unit: 115.0, total_length: null,
    supplier: { id: uid(7), name: 'Lakshmi Fabrics' },
    supplier_invoice_no: 'LF-2026-0090', supplier_invoice_date: '2026-02-07',
    received_by_user: { id: uid(2), full_name: 'Ravi Kumar' },
    received_at: '2026-02-08T09:30:00Z', notes: 'Not yet assigned to lot',
  },
]

// ── SKUs ───────────────────────────────────────────────
export const skus = [
  {
    id: uid('c'), sku_code: 'BLS-101-Red-M', product_type: 'BLS',
    product_name: 'Design 101 Red Medium', color: 'Red', size: 'M',
    description: 'Cotton red blouse, regular fit', base_price: 450.0,
    is_active: true,
    stock: { total_qty: 150, available_qty: 120, reserved_qty: 30 },
  },
  {
    id: uid('d'), sku_code: 'BLS-102-Blue-L', product_type: 'BLS',
    product_name: 'Design 102 Blue Large', color: 'Blue', size: 'L',
    description: 'Cotton blue blouse, comfort fit', base_price: 500.0,
    is_active: true,
    stock: { total_qty: 80, available_qty: 65, reserved_qty: 15 },
  },
  {
    id: uid('e'), sku_code: 'BLS-103-Green-S', product_type: 'BLS',
    product_name: 'Design 103 Green Small', color: 'Green', size: 'S',
    description: 'Silk green blouse, premium', base_price: 750.0,
    is_active: true,
    stock: { total_qty: 40, available_qty: 40, reserved_qty: 0 },
  },
]

// ── Lots ──────────────────────────────────────────────
export const lots = [
  {
    id: uid('d1'), lot_code: 'LOT-0001',
    lot_date: '2026-02-07',
    design_no: '702',
    standard_palla_weight: 3.60,
    default_size_pattern: { L: 2, XL: 6, XXL: 6, '3XL': 4 },
    pieces_per_palla: 18,
    total_pallas: 24,
    total_pieces: 432,
    total_weight: 113.270,
    status: 'distributed',
    created_by_user: { id: uid(2), full_name: 'Ravi Kumar' },
    lot_rolls: [
      {
        id: uid('d2'), roll_id: uid(8), roll_code: 'ROLL-0001', color: 'Green',
        roll_weight: 18.800, palla_weight: 2.860, num_pallas: 6,
        weight_used: 17.160, waste_weight: 1.640, size_pattern: null, pieces_from_roll: 108,
      },
      {
        id: uid('d3'), roll_id: uid(9), roll_code: 'ROLL-0002', color: 'Green',
        roll_weight: 36.920, palla_weight: 2.610, num_pallas: 14,
        weight_used: 36.540, waste_weight: 0.380, size_pattern: null, pieces_from_roll: 252,
      },
      {
        id: uid('d4'), roll_id: uid('a'), roll_code: 'ROLL-0003', color: 'Red',
        roll_weight: 28.550, palla_weight: 3.060, num_pallas: 9,
        weight_used: 27.540, waste_weight: 1.010, size_pattern: null, pieces_from_roll: 162,
      },
      {
        id: uid('d5'), roll_id: uid('b'), roll_code: 'ROLL-0004', color: 'Red',
        roll_weight: 29.000, palla_weight: 3.050, num_pallas: 9,
        weight_used: 27.450, waste_weight: 1.550, size_pattern: null, pieces_from_roll: 162,
      },
    ],
    created_at: '2026-02-07T10:00:00Z',
    notes: 'First lot - Design 702',
  },
]

// ── Batches (lot-based) ───────────────────────────────
export const batches = [
  {
    id: uid('f'), batch_code: 'BATCH-0001',
    lot: { id: uid('d1'), lot_code: 'LOT-0001', design_no: '702', total_pieces: 432, status: 'distributed' },
    sku: { id: uid('c'), sku_code: 'BLS-101-Red-M', product_name: 'Design 101 Red Medium' },
    quantity: 200, piece_count: 200,
    color_breakdown: { Green: 108, Red: 92 },
    status: 'COMPLETED',
    qr_code_data: `https://inv.local/batch/${uid('f')}`,
    created_by_user: { id: uid(2), full_name: 'Ravi Kumar' },
    assignment: {
      tailor: { id: uid(3), full_name: 'Amit Singh' },
      assigned_at: '2026-02-07T11:00:00Z',
    },
    rolls_used: [],
    created_at: '2026-02-07T10:00:00Z',
    assigned_at: '2026-02-07T11:00:00Z',
    started_at: '2026-02-07T12:00:00Z',
    submitted_at: '2026-02-07T16:00:00Z',
    checked_at: '2026-02-07T17:00:00Z',
    completed_at: '2026-02-07T17:00:00Z',
    approved_qty: 196, rejected_qty: 4,
    rejection_reason: 'Minor stitching defects', notes: null,
  },
  {
    id: uid('10'), batch_code: 'BATCH-0002',
    lot: { id: uid('d1'), lot_code: 'LOT-0001', design_no: '702', total_pieces: 432, status: 'distributed' },
    sku: { id: uid('c'), sku_code: 'BLS-101-Red-M', product_name: 'Design 101 Red Medium' },
    quantity: 232, piece_count: 232,
    color_breakdown: { Green: 162, Red: 70 },
    status: 'ASSIGNED',
    qr_code_data: `https://inv.local/batch/${uid('10')}`,
    created_by_user: { id: uid(2), full_name: 'Ravi Kumar' },
    assignment: {
      tailor: { id: uid(3), full_name: 'Amit Singh' },
      assigned_at: '2026-02-08T09:00:00Z',
    },
    rolls_used: [],
    created_at: '2026-02-08T08:00:00Z',
    assigned_at: '2026-02-08T09:00:00Z',
    started_at: null, submitted_at: null, checked_at: null, completed_at: null,
    approved_qty: null, rejected_qty: null, rejection_reason: null, notes: null,
  },
]

// ── Inventory State ────────────────────────────────────
export const inventory = [
  {
    sku: { id: uid('c'), sku_code: 'BLS-101-Red-M', product_name: 'Design 101 Red Medium' },
    total_qty: 150, available_qty: 120, reserved_qty: 30,
    last_updated: '2026-02-08T10:00:00Z',
  },
  {
    sku: { id: uid('d'), sku_code: 'BLS-102-Blue-L', product_name: 'Design 102 Blue Large' },
    total_qty: 80, available_qty: 65, reserved_qty: 15,
    last_updated: '2026-02-08T09:00:00Z',
  },
  {
    sku: { id: uid('e'), sku_code: 'BLS-103-Green-S', product_name: 'Design 103 Green Small' },
    total_qty: 40, available_qty: 40, reserved_qty: 0,
    last_updated: '2026-02-07T14:00:00Z',
  },
]

// ── Inventory Events ───────────────────────────────────
export const inventoryEvents = [
  {
    id: uid('12'), event_id: 'STOCK_IN_batch_f_001',
    event_type: 'STOCK_IN', item_type: 'finished_goods',
    reference_type: 'batch', reference_id: uid('f'),
    quantity: 196,
    performed_by: { id: uid(4), full_name: 'Suresh Checker' },
    performed_at: '2026-02-07T17:00:00Z',
    metadata: { batch_code: 'BATCH-0001' },
  },
  {
    id: uid('13'), event_id: 'STOCK_OUT_roll_8_001',
    event_type: 'STOCK_OUT', item_type: 'raw_material',
    reference_type: 'lot', reference_id: uid('d1'),
    quantity: 4,
    performed_by: { id: uid(2), full_name: 'Ravi Kumar' },
    performed_at: '2026-02-07T10:00:00Z',
    metadata: { lot_code: 'LOT-0001', roll_count: 4 },
  },
]

// ── Orders ─────────────────────────────────────────────
export const orders = [
  {
    id: uid('14'), order_number: 'ORD-0001', source: 'web',
    external_order_ref: null,
    customer_name: 'Priya Sharma', customer_phone: '9876543210',
    status: 'pending',
    items: [
      {
        sku: { id: uid('c'), sku_code: 'BLS-101-Red-M', product_name: 'Design 101 Red Medium' },
        quantity: 5, unit_price: 450.0, total_price: 2250.0, fulfilled_qty: 0,
      },
    ],
    total_amount: 2250.0, created_at: '2026-02-08T08:00:00Z',
  },
  {
    id: uid('15'), order_number: 'ORD-0002', source: 'ecommerce',
    external_order_ref: 'DRS-1234',
    customer_name: 'Anita Verma', customer_phone: '9876543212',
    status: 'shipped',
    items: [
      {
        sku: { id: uid('d'), sku_code: 'BLS-102-Blue-L', product_name: 'Design 102 Blue Large' },
        quantity: 3, unit_price: 500.0, total_price: 1500.0, fulfilled_qty: 3,
      },
    ],
    total_amount: 1500.0, created_at: '2026-02-07T14:00:00Z',
  },
  {
    id: uid('16'), order_number: 'ORD-0003', source: 'web',
    external_order_ref: null,
    customer_name: 'Rahul Gupta', customer_phone: '9876543213',
    status: 'processing',
    items: [
      {
        sku: { id: uid('c'), sku_code: 'BLS-101-Red-M', product_name: 'Design 101 Red Medium' },
        quantity: 10, unit_price: 450.0, total_price: 4500.0, fulfilled_qty: 0,
      },
      {
        sku: { id: uid('e'), sku_code: 'BLS-103-Green-S', product_name: 'Design 103 Green Small' },
        quantity: 5, unit_price: 750.0, total_price: 3750.0, fulfilled_qty: 0,
      },
    ],
    total_amount: 8250.0, created_at: '2026-02-08T09:00:00Z',
  },
]

// ── Invoices ───────────────────────────────────────────
export const invoices = [
  {
    id: uid('17'), invoice_number: 'INV-0001',
    order: { order_number: 'ORD-0002', customer_name: 'Anita Verma' },
    subtotal: 1500.0, tax_amount: 270.0, discount_amount: 0,
    total_amount: 1770.0, status: 'paid',
    issued_at: '2026-02-07T15:00:00Z', paid_at: '2026-02-07T16:00:00Z',
    items: [
      {
        sku: { id: uid('d'), sku_code: 'BLS-102-Blue-L', product_name: 'Design 102 Blue Large' },
        quantity: 3, unit_price: 500.0, total_price: 1500.0,
      },
    ],
  },
  {
    id: uid('18'), invoice_number: 'INV-0002',
    order: { order_number: 'ORD-0001', customer_name: 'Priya Sharma' },
    subtotal: 2250.0, tax_amount: 405.0, discount_amount: 100.0,
    total_amount: 2555.0, status: 'issued',
    issued_at: '2026-02-08T08:30:00Z', paid_at: null,
    items: [
      {
        sku: { id: uid('c'), sku_code: 'BLS-101-Red-M', product_name: 'Design 101 Red Medium' },
        quantity: 5, unit_price: 450.0, total_price: 2250.0,
      },
    ],
  },
]

// ── Dashboard Stats ────────────────────────────────────
export const dashboardSummary = {
  rolls: { total: 6, with_remaining: 2 },
  lots: { total: 1, open: 0, distributed: 1 },
  batches: { created: 0, assigned: 1, in_progress: 0, submitted: 0, completed_today: 1 },
  inventory: { total_skus: 3, low_stock_skus: 0 },
  orders: { pending: 1, processing: 1, shipped_today: 1 },
  revenue_today: 1770.0,
  revenue_month: 12500.0,
}

export const tailorPerformance = [
  {
    tailor: { id: uid(3), full_name: 'Amit Singh' },
    batches_completed: 12, pieces_completed: 580,
    avg_completion_days: 1.8, rejection_rate: 3.2,
  },
]

export const inventoryMovement = [
  {
    sku_code: 'BLS-101-Red-M',
    period: { from: '2026-02-01', to: '2026-02-08' },
    stock_in: 98, stock_out: 30, returns: 2, losses: 0,
    net_change: 70, closing_stock: 150,
  },
  {
    sku_code: 'BLS-102-Blue-L',
    period: { from: '2026-02-01', to: '2026-02-08' },
    stock_in: 80, stock_out: 15, returns: 0, losses: 0,
    net_change: 65, closing_stock: 80,
  },
]

// ── Mock Response Helper ───────────────────────────────
export function mockResponse(data, message = 'OK') {
  return delay().then(() => ({
    data: { success: true, data, message },
  }))
}

export function mockPaginated(items, page = 1, pageSize = 20) {
  const total = items.length
  const pages = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize
  const sliced = items.slice(start, start + pageSize)
  return delay().then(() => ({
    data: { success: true, data: sliced, total, page, pages },
  }))
}
