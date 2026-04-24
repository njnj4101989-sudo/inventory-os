import React, { useState, useEffect, useCallback } from 'react'
import { getTailorPerf, getProductionReport, getFinancialReport, getSalesReport, getAccountingReport, getVAReport, getPurchaseReport, getReturnsReport, getClosingStockReport, getInventoryPosition, downloadInventoryPositionCSV } from '../api/dashboard'
import FilterSelect from '../components/common/FilterSelect'
import SearchInput from '../components/common/SearchInput'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorAlert from '../components/common/ErrorAlert'

// ── Tab config ────────────────────────────────────────
const TABS = [
  { key: 'production', label: 'Production', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
  { key: 'sales', label: 'Sales & Orders', icon: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z' },
  { key: 'inventory', label: 'Inventory', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { key: 'financial', label: 'Financial', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'accounting', label: 'Accounting', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
  { key: 'va', label: 'VA Processing', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  { key: 'purchases', label: 'Purchases', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z' },
  { key: 'returns', label: 'Returns', icon: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6' },
  { key: 'closing_stock', label: 'Closing Stock', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'tailor', label: 'Tailor Performance', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
]

const PERIODS = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
]

// ── Shared KPI Card ───────────────────────────────────
function KpiCard({ label, value, sub, color = 'bg-blue-500', icon }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="typo-kpi-label">{label}</p>
          <p className="mt-1 typo-kpi">{value}</p>
          {sub && <p className="mt-1 typo-caption">{sub}</p>}
        </div>
        {icon && (
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Simple Bar (visual horizontal bar) ────────────────
function HBar({ value, max, color = 'bg-blue-500', label }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      {label && <span className="typo-td-secondary w-20 text-right flex-shrink-0">{label}</span>}
      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="typo-badge text-gray-700 w-12">{value}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  PRODUCTION TAB
// ═══════════════════════════════════════════════════════
function ProductionTab({ data }) {
  if (!data) return null
  const s = data.summary
  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Pieces Produced" value={s.total_pieces_produced.toLocaleString()} sub={`${s.pieces_approved} approved, ${s.pieces_rejected} rejected`}
          color="bg-blue-500" icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        <KpiCard label="Total Pallas" value={s.total_pallas} sub={`From ${s.rolls_consumed} rolls consumed`}
          color="bg-purple-500" icon="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7" />
        <KpiCard label="Fabric Used" value={`${s.total_weight_used.toFixed(1)} kg`} sub={`Waste: ${s.total_waste.toFixed(1)} kg (${s.waste_percentage}%)`}
          color={s.waste_percentage > 5 ? 'bg-red-500' : 'bg-emerald-500'} icon="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l3 9a5.002 5.002 0 006.001 0M18 7l-3 9m0-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
        <KpiCard label="Approval Rate" value={`${s.approval_rate}%`} sub={`${s.lots_created} lots created`}
          color={s.approval_rate >= 95 ? 'bg-emerald-500' : 'bg-amber-500'} icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </div>

      {/* Lot Breakdown Table */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-4">Lot-wise Production</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Lot Code</th>
                <th className="pb-3 font-medium">Design</th>
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Rolls</th>
                <th className="pb-3 font-medium">Weight (kg)</th>
                <th className="pb-3 font-medium">Waste</th>
                <th className="pb-3 font-medium">Pallas</th>
                <th className="pb-3 font-medium">Pieces</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.by_lot.map((lot, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3 font-semibold text-emerald-600">{lot.lot_code}</td>
                  <td className="py-3">{(lot.designs || []).map(d => d.design_no).join(', ') || '—'}</td>
                  <td className="py-3 text-gray-500 text-xs">{new Date(lot.lot_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                  <td className="py-3">{lot.rolls_used}</td>
                  <td className="py-3">
                    <span className="font-medium">{lot.weight_used.toFixed(1)}</span>
                    <span className="text-gray-400 text-xs"> / {lot.total_weight.toFixed(1)}</span>
                  </td>
                  <td className="py-3">
                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 typo-badge ring-1 ring-inset ${
                      lot.waste_pct > 5
                        ? 'bg-red-50 text-red-700 ring-red-600/20'
                        : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                    }`}>
                      {lot.waste_pct}%
                    </span>
                  </td>
                  <td className="py-3 font-medium">{lot.total_pallas}</td>
                  <td className="py-3 font-semibold">{lot.total_pieces}</td>
                  <td className="py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 typo-badge ${
                      lot.status === 'distributed' ? 'bg-emerald-100 text-emerald-700' :
                      lot.status === 'open' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                    }`}>{lot.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Production Trend */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-4">Daily Production (Pieces)</h3>
        <div className="space-y-2">
          {data.by_period.map((d) => (
            <HBar
              key={d.date}
              value={d.pieces}
              max={Math.max(...data.by_period.map((p) => p.pieces), 1)}
              color="bg-blue-500"
              label={new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  INVENTORY TAB
// ═══════════════════════════════════════════════════════
// ── P4.1: Ageing badge colours (< 30d green, 30-60d amber, 60-90d orange, >90d red) ──
function ageingBadgeClass(days) {
  if (days == null) return 'bg-gray-50 text-gray-500 ring-gray-400/20'
  if (days < 30) return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
  if (days < 60) return 'bg-amber-50 text-amber-700 ring-amber-600/20'
  if (days < 90) return 'bg-orange-50 text-orange-700 ring-orange-600/20'
  return 'bg-red-50 text-red-700 ring-red-600/20'
}

function formatINR(n) {
  if (n == null || isNaN(n)) return '₹0'
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

// Mute zero values — reduces visual noise across a dense table.
// `emphasizeNonZero` wraps non-zero in a color+weight class.
function zeroMuted(n, emphasizeClass = 'text-gray-900 font-medium') {
  const v = Number(n) || 0
  if (v === 0) return <span className="text-gray-300">0</span>
  return <span className={emphasizeClass}>{v}</span>
}
function zeroMutedSigned(n, sign = '+') {
  const v = Number(n) || 0
  if (v === 0) return <span className="text-gray-300">0</span>
  const color = sign === '-' ? 'text-red-600' : (v >= 0 ? 'text-emerald-600' : 'text-red-600')
  const label = sign === '-' ? `-${Math.abs(v)}` : (v >= 0 ? `+${v}` : `${v}`)
  return <span className={`font-medium ${color}`}>{label}</span>
}

// Stock status chip — priority: Out > Locked > Dead > Free.
// Returns {label, chipCls, rowCls}. rowCls applied only to actionable states
// (Out/Locked) so healthy rows stay clean.
function getStockStatus(s) {
  const closing = Number(s.closing_stock) || 0
  const available = Number(s.available_qty) || 0
  const ageing = s.ageing_days
  if (closing === 0) {
    return { label: 'Out', chipCls: 'bg-red-50 text-red-700 ring-red-600/30', rowCls: 'bg-red-50/60' }
  }
  if (available === 0) {
    return { label: 'Locked', chipCls: 'bg-amber-50 text-amber-700 ring-amber-600/30', rowCls: 'bg-amber-50/60' }
  }
  // Dead = actually stagnant (sold before, nothing in 60d). Never-sold SKUs are NOT Dead — they're new stock.
  if (ageing != null && ageing >= 60) {
    return { label: 'Dead', chipCls: 'bg-gray-100 text-gray-600 ring-gray-500/30', rowCls: '' }
  }
  return { label: 'Free', chipCls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/30', rowCls: '' }
}

function InventoryTab({ period }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters
  const [productType, setProductType] = useState('')
  const [stockStatus, setStockStatus] = useState('')
  const [minValue, setMinValue] = useState('')
  const [search, setSearch] = useState('')

  // Expanded design groups
  const [expanded, setExpanded] = useState(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = { period }
      if (productType) params.product_type = productType
      if (stockStatus) params.stock_status = stockStatus
      if (minValue) params.min_value = parseFloat(minValue)
      if (search.trim()) params.search = search.trim()
      const res = await getInventoryPosition(params)
      const payload = res.data.data
      // Client-side: augment each group with movement aggregates (parent row shows real numbers, not '—')
      if (payload?.groups) {
        payload.groups = payload.groups.map(g => ({
          ...g,
          opening_stock: g.skus.reduce((s, r) => s + (r.opening_stock || 0), 0),
          stock_in: g.skus.reduce((s, r) => s + (r.stock_in || 0), 0),
          stock_out: g.skus.reduce((s, r) => s + (r.stock_out || 0), 0),
          net_change: g.skus.reduce((s, r) => s + (r.net_change || 0), 0),
        }))
      }
      setData(payload)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load inventory position')
    } finally { setLoading(false) }
  }, [period, productType, stockStatus, minValue, search])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleGroup = (key) => setExpanded(s => {
    const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n
  })
  const expandAll = () => setExpanded(new Set((data?.groups || []).map(g => g.design_id || g.design_no)))
  const collapseAll = () => setExpanded(new Set())

  const clearFilters = () => { setProductType(''); setStockStatus(''); setMinValue(''); setSearch('') }
  const activeFilters = [productType, stockStatus, minValue, search].filter(v => v !== '' && v != null).length

  const handleCSV = () => {
    const params = { period }
    if (productType) params.product_type = productType
    if (stockStatus) params.stock_status = stockStatus
    if (minValue) params.min_value = minValue
    if (search.trim()) params.search = search.trim()
    downloadInventoryPositionCSV(params)
  }

  if (loading && !data) return <div className="py-12"><LoadingSpinner size="lg" text="Loading inventory position..." /></div>
  if (error) return <ErrorAlert message={error} onDismiss={() => setError(null)} />
  if (!data) return <p className="typo-empty py-8 text-center">No data.</p>

  const { kpis, groups, totals } = data
  const productTypeOptions = [{ value: '', label: 'All Product Types' }, ...new Set(groups.map(g => g.product_type).filter(Boolean))].map(v => typeof v === 'string' ? { value: v, label: v } : v)

  return (
    <div className="space-y-6">
      {/* ── KPI Grid: Row 1 = Period movement, Row 2 = Position (as-of-today) ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Stock In" value={`+${kpis.stock_in}`} sub="Incoming pieces"
          color="bg-emerald-500" icon="M7 11l5-5m0 0l5 5m-5-5v12" />
        <KpiCard label="Stock Out" value={`-${kpis.stock_out}`} sub="Shipped / consumed"
          color="bg-red-500" icon="M17 13l-5 5m0 0l-5-5m5 5V6" />
        <KpiCard label="Returns" value={kpis.returns} sub="Pieces returned"
          color="bg-amber-500" icon="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        <KpiCard label="Net Change" value={kpis.net_change >= 0 ? `+${kpis.net_change}` : kpis.net_change}
          sub={kpis.net_change >= 0 ? 'Stock increased' : 'Stock decreased'}
          color={kpis.net_change >= 0 ? 'bg-blue-500' : 'bg-red-500'}
          icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Inventory Value" value={formatINR(kpis.total_value_inr)} sub="Current ₹ on hand (WAC)"
          color="bg-violet-500" icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <KpiCard label="SKUs with Stock" value={kpis.skus_with_stock} sub="Active inventory"
          color="bg-emerald-600" icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        <KpiCard label="Dead SKUs" value={kpis.dead_sku_count} sub="No sale in 60d"
          color="bg-red-500" icon="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <KpiCard label="Low Stock" value={kpis.short_sku_count} sub="Available ≤ 5"
          color="bg-amber-500" icon="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </div>

      {/* ── Filter bar ── */}
      <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center gap-3">
          <FilterSelect value={productType} onChange={setProductType} options={productTypeOptions} />
          <FilterSelect value={stockStatus} onChange={setStockStatus} options={[
            { value: '', label: 'All Stock' },
            { value: 'has', label: 'Has Stock' },
            { value: 'zero', label: 'Zero Stock' },
            { value: 'negative', label: 'Negative Stock' },
          ]} />
          <input type="number" min="0" step="100" value={minValue}
            onChange={e => setMinValue(e.target.value)}
            placeholder="Min ₹ Value"
            className="typo-input-sm w-32" />
          <div className="flex-1 max-w-sm">
            <SearchInput value={search} onChange={setSearch} placeholder="Search SKU, design, color..." />
          </div>
          {activeFilters > 0 && (
            <button onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 typo-btn-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              Clear ({activeFilters})
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={expandAll} className="typo-btn-sm text-gray-500 hover:text-emerald-700 underline">Expand All</button>
            <span className="text-gray-300">·</span>
            <button onClick={collapseAll} className="typo-btn-sm text-gray-500 hover:text-emerald-700 underline">Collapse All</button>
            <button onClick={handleCSV}
              title="Download CSV"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 typo-btn-sm text-white hover:bg-emerald-700 transition-colors shadow-sm">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* ── Grouped Accordion Table ── */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="typo-section-title">Inventory Position (by Design)</h3>
          <span className="typo-caption">{groups.length} design group{groups.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="py-2 px-3 typo-th w-6"></th>
                <th className="py-2 px-3 typo-th">Design / SKU</th>
                <th className="py-2 px-3 typo-th">Product</th>
                <th className="py-2 px-3 typo-th text-right">Opening</th>
                <th className="py-2 px-3 typo-th text-right">In</th>
                <th className="py-2 px-3 typo-th text-right">Out</th>
                <th className="py-2 px-3 typo-th text-right">Net</th>
                <th className="py-2 px-3 typo-th text-right">Closing</th>
                <th className="py-2 px-3 typo-th text-right">Reserved</th>
                <th className="py-2 px-3 typo-th text-right">Available</th>
                <th className="py-2 px-3 typo-th text-right">WAC</th>
                <th className="py-2 px-3 typo-th text-right">Value (₹)</th>
                <th className="py-2 px-3 typo-th text-center">Ageing</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr><td colSpan={13} className="py-8 text-center"><span className="typo-empty">No SKUs match the current filters.</span></td></tr>
              )}
              {groups.map((g) => {
                const key = g.design_id || g.design_no
                const isOpen = expanded.has(key)
                return (
                  <React.Fragment key={key}>
                    {/* Design parent row — section-header feel with emerald accent + real aggregates */}
                    <tr onClick={() => toggleGroup(key)}
                      className={`border-b-2 border-emerald-100 ${isOpen ? 'bg-emerald-50/80' : 'bg-emerald-50/40'} hover:bg-emerald-100/60 cursor-pointer transition-colors`}>
                      <td className="py-3 px-3">
                        <svg className={`h-4 w-4 text-emerald-600 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                      <td className="py-3 px-3 typo-td font-bold text-emerald-800 text-base">{g.design_no || '—'}<span className="typo-caption ml-2 text-emerald-600">({g.sku_count} SKU{g.sku_count !== 1 ? 's' : ''})</span></td>
                      <td className="py-3 px-3"><span className="typo-badge rounded bg-white border border-emerald-200 px-2 py-0.5 text-emerald-700 font-semibold">{g.product_type || '—'}</span></td>
                      <td className="py-3 px-3 text-right tabular-nums">{zeroMuted(g.opening_stock)}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{zeroMutedSigned(g.stock_in, '+')}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{zeroMutedSigned(g.stock_out, '-')}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{zeroMutedSigned(g.net_change)}</td>
                      <td className="py-3 px-3 text-right typo-td font-bold tabular-nums">{g.total_qty}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{zeroMuted(g.reserved_qty, 'text-gray-700')}</td>
                      <td className="py-3 px-3 text-right typo-td font-bold text-emerald-700 tabular-nums">{g.available_qty}</td>
                      <td className="py-3 px-3 text-right typo-td-secondary">—</td>
                      <td className="py-3 px-3 text-right typo-td font-bold text-violet-700 tabular-nums">{formatINR(g.value_inr)}</td>
                      <td className="py-3 px-3 text-center typo-td-secondary">—</td>
                    </tr>
                    {/* SKU children — indented + zero-muted numbers + stock status chip */}
                    {isOpen && g.skus.map((s, si) => {
                      const status = getStockStatus(s)
                      const baseBg = status.rowCls || (si % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')
                      return (
                      <tr key={s.sku_id}
                        className={`border-b border-gray-100 ${baseBg} hover:bg-emerald-50/30 transition-colors`}>
                        <td className="py-2 px-3"></td>
                        <td className="py-2 px-3 pl-10 typo-td font-mono text-xs text-gray-700">
                          <span className="flex items-center gap-2">
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 typo-badge ring-1 ring-inset font-semibold ${status.chipCls}`}>{status.label}</span>
                            {s.sku_code}
                          </span>
                        </td>
                        <td className="py-2 px-3 typo-td-secondary">{s.color}{s.size ? ` · ${s.size}` : ''}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{zeroMuted(s.opening_stock)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{zeroMutedSigned(s.stock_in, '+')}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{zeroMutedSigned(s.stock_out, '-')}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{zeroMutedSigned(s.net_change)}</td>
                        <td className="py-2 px-3 text-right typo-td font-semibold tabular-nums">{s.closing_stock}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{zeroMuted(s.reserved_qty, 'text-gray-700')}</td>
                        <td className="py-2 px-3 text-right typo-td font-medium text-emerald-700 tabular-nums">{s.available_qty}</td>
                        <td className="py-2 px-3 text-right typo-td-secondary tabular-nums">{s.wac > 0 ? formatINR(s.wac) : '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{s.value_inr > 0 ? <span className="font-medium text-violet-700">{formatINR(s.value_inr)}</span> : <span className="text-gray-300">—</span>}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 typo-badge ring-1 ring-inset ${ageingBadgeClass(s.ageing_days)}`}>
                            {s.ageing_days == null ? '—' : `${s.ageing_days}d`}
                          </span>
                        </td>
                      </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
            {groups.length > 0 && (
              <tfoot>
                <tr className="bg-gray-900 text-white typo-td font-semibold">
                  <td colSpan={3} className="py-2 px-3">Totals</td>
                  <td className="py-2 px-3 text-right">{totals.opening_stock}</td>
                  <td className="py-2 px-3 text-right text-emerald-300">+{kpis.stock_in}</td>
                  <td className="py-2 px-3 text-right text-red-300">-{kpis.stock_out}</td>
                  <td className={`py-2 px-3 text-right ${kpis.net_change >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {kpis.net_change >= 0 ? '+' : ''}{kpis.net_change}
                  </td>
                  <td className="py-2 px-3 text-right">{totals.closing_stock}</td>
                  <td className="py-2 px-3 text-right">{totals.reserved_qty}</td>
                  <td className="py-2 px-3 text-right">{totals.available_qty}</td>
                  <td className="py-2 px-3 text-right">—</td>
                  <td className="py-2 px-3 text-right text-violet-200">{formatINR(totals.value_inr)}</td>
                  <td className="py-2 px-3 text-center">—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  FINANCIAL TAB
// ═══════════════════════════════════════════════════════
function FinancialTab({ data }) {
  if (!data) return null
  const s = data.summary
  const maxRevenue = Math.max(...data.revenue_by_sku.map((r) => r.revenue), 1)

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Revenue" value={`\u20B9${s.total_revenue.toLocaleString()}`} sub="From all channels"
          color="bg-emerald-500" icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <KpiCard label="Material Cost" value={`\u20B9${s.total_material_cost.toLocaleString()}`} sub="Fabric + labour"
          color="bg-red-500" icon="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        <KpiCard label="Invoices Paid" value={`\u20B9${s.invoices_paid.toLocaleString()}`} sub={`Pending: \u20B9${s.invoices_pending.toLocaleString()}`}
          color="bg-blue-500" icon="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
        <KpiCard label="Avg Order Value" value={`\u20B9${s.avg_order_value.toLocaleString()}`} sub={`Orders total: \u20B9${s.orders_total.toLocaleString()}`}
          color="bg-violet-500" icon="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </div>

      {/* Revenue by SKU */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-4">Revenue by SKU</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">SKU</th>
                <th className="pb-3 font-medium">Product</th>
                <th className="pb-3 font-medium">Units Sold</th>
                <th className="pb-3 font-medium">Avg Price</th>
                <th className="pb-3 font-medium">Revenue</th>
                <th className="pb-3 font-medium w-48">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.revenue_by_sku.map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3 typo-data">{row.sku_code}</td>
                  <td className="py-3 text-gray-500 text-xs">{row.product_name}</td>
                  <td className="py-3 font-medium">{row.units_sold}</td>
                  <td className="py-3">{'\u20B9'}{row.avg_price.toLocaleString()}</td>
                  <td className="py-3 font-semibold text-emerald-600">{'\u20B9'}{row.revenue.toLocaleString()}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((row.revenue / maxRevenue) * 100)}%` }} />
                      </div>
                      <span className="typo-caption w-10">{Math.round((row.revenue / s.total_revenue) * 100)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost Breakdown + Revenue Trend side-by-side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cost Breakdown */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="typo-section-title mb-4">Cost Breakdown</h3>
          <div className="space-y-3">
            {data.cost_breakdown.map((item, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="typo-td">{item.category}</span>
                  <span className="typo-data">{'\u20B9'}{item.amount.toLocaleString()} <span className="typo-caption">({item.pct}%)</span></span>
                </div>
                <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${
                    i === 0 ? 'bg-blue-500' : i === 1 ? 'bg-purple-500' : i === 2 ? 'bg-amber-500' : 'bg-gray-400'
                  }`} style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue Trend */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="typo-section-title mb-4">Daily Revenue</h3>
          <div className="space-y-2">
            {data.revenue_by_period.map((d) => (
              <HBar
                key={d.date}
                value={d.revenue > 0 ? `\u20B9${d.revenue.toLocaleString()}` : '—'}
                max={Math.max(...data.revenue_by_period.map((p) => p.revenue), 1)}
                color="bg-emerald-500"
                label={new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  TAILOR PERFORMANCE TAB
// ═══════════════════════════════════════════════════════
function TailorTab({ data }) {
  const [expandedTailor, setExpandedTailor] = useState(null)

  if (!data || data.length === 0) return <p className="typo-empty py-8 text-center">No tailor performance data.</p>

  const maxPieces = Math.max(...data.map((t) => t.pieces_completed), 1)
  const avgRejection = data.length > 0 ? (data.reduce((s, t) => s + t.rejection_rate, 0) / data.length).toFixed(1) : 0
  const totalPieces = data.reduce((s, t) => s + t.pieces_completed, 0)
  const totalCost = data.reduce((s, t) => s + (t.total_stitching_cost || 0), 0)

  const fmt = (v) => `\u20B9${(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  const fmtDec = (v) => `\u20B9${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active Tailors" value={data.length} sub={`${data.reduce((s, t) => s + t.batches_completed, 0)} batches completed`}
          color="bg-blue-500" icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        <KpiCard label="Total Pieces" value={totalPieces.toLocaleString()} sub={`Avg rejection: ${avgRejection}%`}
          color="bg-purple-500" icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        <KpiCard label="Total Stitching Cost" value={fmt(totalCost)} sub={`Avg ${fmtDec(totalPieces > 0 ? totalCost / totalPieces : 0)}/pc`}
          color="bg-emerald-500" icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <KpiCard label="Rate Pending" value={data.reduce((s, t) => s + (t.pending_rate_count || 0), 0)} sub="Batches without stitching rate"
          color={data.reduce((s, t) => s + (t.pending_rate_count || 0), 0) > 0 ? 'bg-amber-500' : 'bg-gray-400'} icon="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </div>

      {/* Tailor Summary Table */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="typo-section-title">Tailor-wise Summary</h3>
          <p className="typo-caption mt-0.5">Click any row to see batch-wise detail</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-500 border-b">
              <th className="px-4 py-3 font-medium">Tailor</th>
              <th className="px-4 py-3 font-medium text-right">Batches</th>
              <th className="px-4 py-3 font-medium text-right">Pieces</th>
              <th className="px-4 py-3 font-medium text-right">Avg Days</th>
              <th className="px-4 py-3 font-medium text-right">Rejection</th>
              <th className="px-4 py-3 font-medium text-right">Avg Rate/pc</th>
              <th className="px-4 py-3 font-medium text-right">Total Cost</th>
              <th className="px-4 py-3 font-medium text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((t, i) => {
              const isOpen = expandedTailor === i
              const rejColor = t.rejection_rate > 5 ? 'text-red-600' : t.rejection_rate > 3 ? 'text-amber-600' : 'text-emerald-600'
              return (
                <React.Fragment key={i}>
                  <tr onClick={() => setExpandedTailor(isOpen ? null : i)} className="border-b hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">
                          {t.tailor.full_name.split(' ').map((n) => n[0]).join('')}
                        </div>
                        <span className="font-semibold">{t.tailor.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{t.batches_completed}</td>
                    <td className="px-4 py-3 text-right font-medium">{t.pieces_completed.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{t.avg_completion_days}d</td>
                    <td className={`px-4 py-3 text-right font-medium ${rejColor}`}>{t.rejection_rate}%</td>
                    <td className="px-4 py-3 text-right">{t.avg_stitching_rate > 0 ? fmtDec(t.avg_stitching_rate) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-700">{t.total_stitching_cost > 0 ? fmt(t.total_stitching_cost) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-center">
                      {t.pending_rate_count > 0
                        ? <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{t.pending_rate_count} pending</span>
                        : <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Complete</span>
                      }
                    </td>
                  </tr>
                  {/* Expanded batch detail */}
                  {isOpen && t.batch_details && t.batch_details.length > 0 && (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <div className="bg-gray-50 px-6 py-3 border-b">
                          <p className="typo-data-label mb-2">Batch-wise Detail — {t.tailor.full_name}</p>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-gray-500">
                                <th className="pb-2 font-medium">Batch</th>
                                <th className="pb-2 font-medium">SKU / Design</th>
                                <th className="pb-2 font-medium">Size</th>
                                <th className="pb-2 font-medium text-right">Pieces</th>
                                <th className="pb-2 font-medium text-right">Rejected</th>
                                <th className="pb-2 font-medium text-right">Rate/pc</th>
                                <th className="pb-2 font-medium text-right">Cost</th>
                                <th className="pb-2 font-medium">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {t.batch_details.map((bd, j) => (
                                <tr key={j} className="border-t border-gray-200">
                                  <td className="py-1.5 font-semibold text-emerald-600">{bd.batch_code}</td>
                                  <td className="py-1.5">{bd.sku_code}</td>
                                  <td className="py-1.5">{bd.size || '—'}</td>
                                  <td className="py-1.5 text-right">{bd.pieces}</td>
                                  <td className="py-1.5 text-right">{bd.rejected > 0 ? <span className="text-red-600">{bd.rejected}</span> : '0'}</td>
                                  <td className="py-1.5 text-right">
                                    {bd.rate_pending
                                      ? <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">Rate pending</span>
                                      : fmtDec(bd.stitching_rate)
                                    }
                                  </td>
                                  <td className="py-1.5 text-right font-medium">
                                    {bd.rate_pending
                                      ? <span className="text-amber-500">—</span>
                                      : fmt(bd.stitching_cost)
                                    }
                                  </td>
                                  <td className="py-1.5 text-gray-500">{bd.completed_date ? new Date(bd.completed_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
                                </tr>
                              ))}
                              {/* Total row */}
                              <tr className="border-t-2 border-gray-300 font-bold text-xs">
                                <td className="py-1.5" colSpan={3}>Total</td>
                                <td className="py-1.5 text-right">{t.batch_details.reduce((s, b) => s + b.pieces, 0)}</td>
                                <td className="py-1.5 text-right">{t.batch_details.reduce((s, b) => s + b.rejected, 0)}</td>
                                <td className="py-1.5 text-right">{fmtDec(t.avg_stitching_rate)}</td>
                                <td className="py-1.5 text-right text-emerald-700">{fmt(t.total_stitching_cost)}</td>
                                <td />
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  SALES & ORDERS TAB
// ═══════════════════════════════════════════════════════
function SalesTab({ data }) {
  if (!data) return null
  const k = data.kpis

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Orders" value={k.total_orders} sub={`Pending: ${k.orders_by_status?.pending || 0}, Shipped: ${k.orders_by_status?.shipped || 0}`}
          color="bg-blue-500" icon="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        <KpiCard label="Total Revenue" value={`\u20B9${k.total_revenue.toLocaleString()}`} sub="From invoices (issued + paid)"
          color="bg-emerald-500" icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <KpiCard label="Avg Fulfillment" value={`${k.avg_fulfillment_days}d`} sub="Order to shipment"
          color={k.avg_fulfillment_days <= 3 ? 'bg-emerald-500' : 'bg-amber-500'} icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        <KpiCard label="Return Rate" value={`${k.return_rate_pct}%`} sub={k.return_rate_pct <= 5 ? 'Healthy' : 'Needs attention'}
          color={k.return_rate_pct <= 5 ? 'bg-emerald-500' : 'bg-red-500'} icon="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </div>

      {/* Fulfillment Funnel */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-4">Order Fulfillment Funnel</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-4">
          {[
            { label: 'Pending', val: data.fulfillment.pending, color: 'bg-gray-100 text-gray-700' },
            { label: 'Processing', val: data.fulfillment.processing, color: 'bg-blue-100 text-blue-700' },
            { label: 'Partial Ship', val: data.fulfillment.partially_shipped, color: 'bg-amber-100 text-amber-700' },
            { label: 'Shipped', val: data.fulfillment.shipped, color: 'bg-emerald-100 text-emerald-700' },
            { label: 'Delivered', val: data.fulfillment.delivered, color: 'bg-green-100 text-green-700' },
            { label: 'Cancelled', val: data.fulfillment.cancelled, color: 'bg-red-100 text-red-700' },
            { label: 'Fulfillment', val: `${data.fulfillment.fulfillment_rate_pct}%`, color: 'bg-emerald-600 text-white' },
          ].map((s) => (
            <div key={s.label} className={`rounded-lg p-3 text-center ${s.color}`}>
              <p className="typo-kpi-label">{s.label}</p>
              <p className="typo-kpi-sm mt-1">{s.val}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
          <div><p className="typo-data-label">Items Ordered</p><p className="typo-data">{data.fulfillment.items_ordered}</p></div>
          <div><p className="typo-data-label">Items Fulfilled</p><p className="typo-data text-emerald-600">{data.fulfillment.items_fulfilled}</p></div>
          <div><p className="typo-data-label">Items Returned</p><p className="typo-data text-red-600">{data.fulfillment.items_returned}</p></div>
        </div>
      </div>

      {/* Customer Ranking */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-4">Customer Ranking (by Net Revenue)</h3>
        {data.customer_ranking.length === 0
          ? <p className="typo-empty py-4 text-center">No customer orders in this period.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">#</th>
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">Orders</th>
                    <th className="pb-3 font-medium">Revenue</th>
                    <th className="pb-3 font-medium">Returns</th>
                    <th className="pb-3 font-medium">Net Revenue</th>
                    <th className="pb-3 font-medium">Avg Order</th>
                  </tr>
                </thead>
                <tbody>
                  {data.customer_ranking.map((c, i) => (
                    <tr key={c.customer_id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 text-gray-400">{i + 1}</td>
                      <td className="py-3 font-semibold">{c.customer_name}</td>
                      <td className="py-3">{c.order_count}</td>
                      <td className="py-3 text-emerald-600 font-medium">{'\u20B9'}{c.total_revenue.toLocaleString()}</td>
                      <td className="py-3 text-red-600">{c.total_returns > 0 ? `\u20B9${c.total_returns.toLocaleString()}` : '—'}</td>
                      <td className="py-3 font-bold">{'\u20B9'}{c.net_revenue.toLocaleString()}</td>
                      <td className="py-3 text-gray-500">{'\u20B9'}{c.avg_order_value.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* Broker Commission */}
      {data.broker_commission.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="typo-section-title mb-4">Broker Commission</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">Broker</th>
                  <th className="pb-3 font-medium">Orders</th>
                  <th className="pb-3 font-medium">Order Value</th>
                  <th className="pb-3 font-medium">Rate</th>
                  <th className="pb-3 font-medium">Commission Earned</th>
                </tr>
              </thead>
              <tbody>
                {data.broker_commission.map((b) => (
                  <tr key={b.broker_id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-semibold">{b.broker_name}</td>
                    <td className="py-3">{b.order_count}</td>
                    <td className="py-3">{'\u20B9'}{b.total_order_value.toLocaleString()}</td>
                    <td className="py-3">{b.commission_rate}%</td>
                    <td className="py-3 font-bold text-emerald-600">{'\u20B9'}{b.commission_earned.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  ACCOUNTING TAB
// ═══════════════════════════════════════════════════════
function AccountingTab({ data }) {
  if (!data) return null

  const recv = data.receivables
  const pay = data.payables
  const gst = data.gst_summary

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Receivable" value={`\u20B9${recv.total_receivable.toLocaleString()}`} sub={`${recv.by_customer.length} customers`}
          color="bg-blue-500" icon="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        <KpiCard label="Total Payable" value={`\u20B9${(pay.total_payable_suppliers + pay.total_payable_va).toLocaleString()}`}
          sub={`Suppliers: \u20B9${pay.total_payable_suppliers.toLocaleString()}, VA: \u20B9${pay.total_payable_va.toLocaleString()}`}
          color="bg-red-500" icon="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        <KpiCard label="Net GST Payable" value={`\u20B9${gst.net_payable.toLocaleString()}`}
          sub={`Output: \u20B9${gst.output_tax.toLocaleString()} | Input: \u20B9${gst.input_tax.toLocaleString()}`}
          color={gst.net_payable > 0 ? 'bg-amber-500' : 'bg-emerald-500'} icon="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
        <KpiCard label="Overdue Amount" value={`\u20B9${recv.overdue_amount.toLocaleString()}`}
          sub={recv.overdue_amount > 0 ? 'Action needed' : 'All clear'}
          color={recv.overdue_amount > 0 ? 'bg-red-500' : 'bg-emerald-500'} icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </div>

      {/* Receivables Aging */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-4">Outstanding Receivables (Aging)</h3>
        {/* Aging bucket bars */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {Object.entries(recv.aging_buckets).map(([bucket, amt]) => (
            <div key={bucket} className={`rounded-lg p-3 text-center ${
              bucket === '90+' ? 'bg-red-50 text-red-700' :
              bucket === '61-90' ? 'bg-orange-50 text-orange-700' :
              bucket === '31-60' ? 'bg-amber-50 text-amber-700' :
              'bg-emerald-50 text-emerald-700'
            }`}>
              <p className="typo-kpi-label">{bucket} days</p>
              <p className="typo-kpi-sm mt-1">{'\u20B9'}{amt.toLocaleString()}</p>
            </div>
          ))}
        </div>
        {recv.by_customer.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">Customer</th>
                  <th className="pb-3 font-medium">Invoices</th>
                  <th className="pb-3 font-medium">Amount</th>
                  <th className="pb-3 font-medium">Overdue</th>
                  <th className="pb-3 font-medium">Oldest Due</th>
                </tr>
              </thead>
              <tbody>
                {recv.by_customer.map((c, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-semibold">{c.customer_name}</td>
                    <td className="py-3">{c.invoice_count}</td>
                    <td className="py-3 font-medium">{'\u20B9'}{c.total_amount.toLocaleString()}</td>
                    <td className="py-3">
                      {c.overdue_amount > 0
                        ? <span className="text-red-600 font-medium">{'\u20B9'}{c.overdue_amount.toLocaleString()}</span>
                        : <span className="text-emerald-600">—</span>}
                    </td>
                    <td className="py-3 text-gray-500 text-xs">{c.oldest_due_date ? new Date(c.oldest_due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payables + GST side-by-side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Payables */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="typo-section-title mb-4">Outstanding Payables</h3>
          {pay.by_party.length === 0
            ? <p className="typo-empty py-4 text-center">No outstanding payables.</p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-3 font-medium">Party</th>
                      <th className="pb-3 font-medium">Type</th>
                      <th className="pb-3 font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pay.by_party.map((p, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-3 font-semibold">{p.party_name}</td>
                        <td className="py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 typo-badge ${
                            p.party_type === 'supplier' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>{p.party_type === 'supplier' ? 'Supplier' : 'VA Party'}</span>
                        </td>
                        <td className="py-3 font-medium">
                          <span className={p.balance_type === 'cr' ? 'text-red-600' : 'text-emerald-600'}>
                            {'\u20B9'}{p.balance.toLocaleString()} {p.balance_type.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>

        {/* GST Summary */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="typo-section-title mb-4">GST Summary</h3>
          <div className="space-y-3 mb-4">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="typo-data-label">Output Tax (Sales)</span>
              <span className="typo-data text-red-600">{'\u20B9'}{gst.output_tax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="typo-data-label">Input Tax (Purchases)</span>
              <span className="typo-data text-emerald-600">{'\u20B9'}{gst.input_tax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="typo-data font-bold">Net Payable</span>
              <span className={`typo-kpi-sm ${gst.net_payable > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {'\u20B9'}{gst.net_payable.toLocaleString()}
              </span>
            </div>
          </div>
          {gst.by_rate.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Rate</th>
                    <th className="pb-3 font-medium">Taxable</th>
                    <th className="pb-3 font-medium">CGST</th>
                    <th className="pb-3 font-medium">SGST</th>
                  </tr>
                </thead>
                <tbody>
                  {gst.by_rate.map((r, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 typo-badge ${
                          r.type === 'output' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>{r.type === 'output' ? 'Output' : 'Input'}</span>
                      </td>
                      <td className="py-3">{r.gst_percent}%</td>
                      <td className="py-3">{'\u20B9'}{r.taxable_value.toLocaleString()}</td>
                      <td className="py-3">{'\u20B9'}{r.cgst.toLocaleString()}</td>
                      <td className="py-3">{'\u20B9'}{r.sgst.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Credit / Debit Notes */}
      {data.credit_debit_notes.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="typo-section-title mb-4">Credit / Debit Notes</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">Note No</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Party</th>
                  <th className="pb-3 font-medium">Linked Return</th>
                  <th className="pb-3 font-medium">Amount</th>
                  <th className="pb-3 font-medium">GST</th>
                </tr>
              </thead>
              <tbody>
                {data.credit_debit_notes.map((n, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-semibold text-emerald-600">{n.note_no}</td>
                    <td className="py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 typo-badge ${
                        n.type === 'CN' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                      }`}>{n.type === 'CN' ? 'Credit Note' : 'Debit Note'}</span>
                    </td>
                    <td className="py-3 text-gray-500 text-xs">{n.date ? new Date(n.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
                    <td className="py-3">{n.party_name}</td>
                    <td className="py-3 text-gray-500">{n.linked_return}</td>
                    <td className="py-3 font-medium">{'\u20B9'}{n.amount.toLocaleString()}</td>
                    <td className="py-3 text-gray-500">{'\u20B9'}{n.gst.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  VA PROCESSING TAB
// ═══════════════════════════════════════════════════════
function VATab({ data }) {
  if (!data) return null
  const k = data.kpis

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total VA Spend" value={`\u20B9${k.total_va_spend.toLocaleString()}`} sub="Roll + Batch processing"
          color="bg-purple-500" icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <KpiCard label="Avg Turnaround" value={`${k.avg_turnaround_days}d`} sub="Sent to received"
          color={k.avg_turnaround_days <= 7 ? 'bg-emerald-500' : 'bg-amber-500'} icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        <KpiCard label="Damage Rate" value={`${k.damage_rate_pct}%`} sub={k.damage_rate_pct <= 2 ? 'Acceptable' : 'Needs review'}
          color={k.damage_rate_pct <= 2 ? 'bg-emerald-500' : 'bg-red-500'} icon="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        <KpiCard label="Active Challans" value={k.active_challans} sub="Sent / partially received"
          color="bg-blue-500" icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </div>

      {/* Cost by Vendor */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-4">Cost by VA Vendor</h3>
        {data.by_vendor.length === 0
          ? <p className="typo-empty py-4 text-center">No VA data in this period.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">VA Party</th>
                    <th className="pb-3 font-medium">Roll JC</th>
                    <th className="pb-3 font-medium">Batch BC</th>
                    <th className="pb-3 font-medium">Roll Cost</th>
                    <th className="pb-3 font-medium">Batch Cost</th>
                    <th className="pb-3 font-medium">Avg/kg</th>
                    <th className="pb-3 font-medium">Avg/pc</th>
                    <th className="pb-3 font-medium">Damage</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_vendor.map((v, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 font-semibold">{v.va_party_name}</td>
                      <td className="py-3">{v.roll_challans}</td>
                      <td className="py-3">{v.batch_challans}</td>
                      <td className="py-3 text-purple-600 font-medium">{v.roll_cost > 0 ? `\u20B9${v.roll_cost.toLocaleString()}` : '—'}</td>
                      <td className="py-3 text-indigo-600 font-medium">{v.batch_cost > 0 ? `\u20B9${v.batch_cost.toLocaleString()}` : '—'}</td>
                      <td className="py-3 text-gray-500">{v.avg_cost_per_kg > 0 ? `\u20B9${v.avg_cost_per_kg}` : '—'}</td>
                      <td className="py-3 text-gray-500">{v.avg_cost_per_piece > 0 ? `\u20B9${v.avg_cost_per_piece}` : '—'}</td>
                      <td className="py-3">
                        {v.damage_count > 0
                          ? <span className="text-red-600 font-medium">{v.damage_count} ({v.damage_weight > 0 ? `${v.damage_weight}kg` : `${v.damage_pieces}pcs`})</span>
                          : <span className="text-emerald-600">None</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* VA Type + Turnaround side-by-side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* By VA Type */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="typo-section-title mb-4">Cost by VA Type</h3>
          {data.by_va_type.length === 0
            ? <p className="typo-empty py-4 text-center">No VA type data.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">VA Type</th>
                    <th className="pb-3 font-medium">Code</th>
                    <th className="pb-3 font-medium">Roll JC</th>
                    <th className="pb-3 font-medium">Batch BC</th>
                    <th className="pb-3 font-medium">Total Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_va_type.map((v, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 font-semibold">{v.name}</td>
                      <td className="py-3"><span className="inline-flex items-center rounded-md bg-purple-50 px-1.5 py-0.5 typo-badge text-purple-700 ring-1 ring-inset ring-purple-700/10">{v.short_code}</span></td>
                      <td className="py-3">{v.roll_challans}</td>
                      <td className="py-3">{v.batch_challans}</td>
                      <td className="py-3 font-medium text-purple-600">{'\u20B9'}{v.total_spend.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>

        {/* Turnaround */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="typo-section-title mb-4">Turnaround Time</h3>
          {data.turnaround.length === 0
            ? <p className="typo-empty py-4 text-center">No turnaround data.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">VA Party</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Challan</th>
                    <th className="pb-3 font-medium">Avg Days</th>
                    <th className="pb-3 font-medium">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.turnaround.map((t, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 font-semibold">{t.va_party_name}</td>
                      <td className="py-3"><span className="inline-flex items-center rounded-md bg-purple-50 px-1.5 py-0.5 typo-badge text-purple-700 ring-1 ring-inset ring-purple-700/10">{t.va_type}</span></td>
                      <td className="py-3 text-gray-500 text-xs">{t.challan_type}</td>
                      <td className="py-3">
                        <span className={`font-medium ${t.avg_days > 7 ? 'text-red-600' : t.avg_days > 3 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {t.avg_days}d
                        </span>
                      </td>
                      <td className="py-3">{t.total_challans}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  PURCHASES & SUPPLIERS TAB
// ═══════════════════════════════════════════════════════
function PurchaseTab({ data }) {
  if (!data) return null
  const k = data.kpis

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Purchased" value={`\u20B9${k.total_purchased.toLocaleString()}`} sub="Fabric cost"
          color="bg-blue-500" icon="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
        <KpiCard label="Rolls Received" value={k.rolls_received} sub={`${k.suppliers_active} suppliers`}
          color="bg-emerald-500" icon="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7" />
        <KpiCard label="Active Suppliers" value={k.suppliers_active} sub="With purchases in period"
          color="bg-purple-500" icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        <KpiCard label="Avg Waste" value={`${k.avg_waste_pct}%`} sub={k.avg_waste_pct <= 5 ? 'Within target' : 'Above target'}
          color={k.avg_waste_pct <= 5 ? 'bg-emerald-500' : 'bg-red-500'} icon="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </div>

      {/* Purchase by Supplier */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-4">Purchases by Supplier</h3>
        {data.by_supplier.length === 0
          ? <p className="typo-empty py-4 text-center">No purchases in this period.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Supplier</th>
                    <th className="pb-3 font-medium">Rolls</th>
                    <th className="pb-3 font-medium">Weight (kg)</th>
                    <th className="pb-3 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_supplier.map((s, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 font-semibold">{s.supplier_name}</td>
                      <td className="py-3">{s.roll_count}</td>
                      <td className="py-3 font-medium">{s.total_weight.toFixed(1)}</td>
                      <td className="py-3 text-emerald-600 font-medium">{'\u20B9'}{s.total_value.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* Supplier Quality + Fabric Utilization side-by-side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Supplier Quality */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="typo-section-title mb-4">Supplier Quality Scorecard</h3>
          {data.supplier_quality.length === 0
            ? <p className="typo-empty py-4 text-center">No quality data.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Supplier</th>
                    <th className="pb-3 font-medium">Received</th>
                    <th className="pb-3 font-medium">Returned</th>
                    <th className="pb-3 font-medium">Damage</th>
                    <th className="pb-3 font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {data.supplier_quality.map((s, i) => {
                    const scoreColor = s.quality_score >= 95 ? 'bg-emerald-500' : s.quality_score >= 80 ? 'bg-amber-500' : 'bg-red-500'
                    return (
                      <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-3 font-semibold">{s.supplier_name}</td>
                        <td className="py-3">{s.rolls_received}</td>
                        <td className="py-3">{s.rolls_returned > 0 ? <span className="text-red-600">{s.rolls_returned}</span> : '0'}</td>
                        <td className="py-3">{s.damage_claims > 0 ? <span className="text-amber-600">{s.damage_claims}</span> : '0'}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${scoreColor}`} style={{ width: `${s.quality_score}%` }} />
                            </div>
                            <span className="typo-badge text-gray-700 w-10">{s.quality_score}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
        </div>

        {/* Fabric Utilization */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="typo-section-title mb-4">Fabric Utilization</h3>
          {data.fabric_utilization.length === 0
            ? <p className="typo-empty py-4 text-center">No fabric data.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Fabric</th>
                    <th className="pb-3 font-medium">Purchased</th>
                    <th className="pb-3 font-medium">Used</th>
                    <th className="pb-3 font-medium">Waste</th>
                    <th className="pb-3 font-medium">Waste %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fabric_utilization.map((f, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 font-semibold">{f.fabric_type}</td>
                      <td className="py-3">{f.purchased_kg} kg</td>
                      <td className="py-3 text-emerald-600 font-medium">{f.used_kg} kg</td>
                      <td className="py-3">{f.waste_kg} kg</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 typo-badge ring-1 ring-inset ${
                          f.waste_pct > 5
                            ? 'bg-red-50 text-red-700 ring-red-600/20'
                            : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                        }`}>{f.waste_pct}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  RETURNS ANALYSIS TAB
// ═══════════════════════════════════════════════════════
function ReturnsTab({ data }) {
  if (!data) return null
  const k = data.kpis

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Customer Return Rate" value={`${k.customer_return_rate_pct}%`} sub={k.customer_return_rate_pct <= 5 ? 'Healthy' : 'Needs attention'}
          color={k.customer_return_rate_pct <= 5 ? 'bg-emerald-500' : 'bg-red-500'} icon="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        <KpiCard label="Supplier Return Rate" value={`${k.supplier_return_rate_pct}%`} sub={`Debit notes: \u20B9${k.total_debit_notes.toLocaleString()}`}
          color={k.supplier_return_rate_pct <= 3 ? 'bg-emerald-500' : 'bg-amber-500'} icon="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        <KpiCard label="Recovery Rate" value={`${k.recovery_rate_pct}%`} sub={`${k.total_restocked} restocked, ${k.total_damaged} damaged`}
          color={k.recovery_rate_pct >= 80 ? 'bg-emerald-500' : 'bg-amber-500'} icon="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        <KpiCard label="Credit Notes" value={`\u20B9${k.total_credit_notes.toLocaleString()}`} sub="Issued to customers"
          color="bg-blue-500" icon="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
      </div>

      {/* Restock vs Damage visual */}
      {(k.total_restocked > 0 || k.total_damaged > 0) && (
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="typo-section-title mb-4">Restock vs Damage Breakdown</h3>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-6 w-full bg-gray-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${k.recovery_rate_pct}%` }} />
                <div className="h-full bg-red-400 transition-all" style={{ width: `${100 - k.recovery_rate_pct}%` }} />
              </div>
            </div>
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-emerald-500" /> Restocked: {k.total_restocked}</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-red-400" /> Damaged: {k.total_damaged}</span>
            </div>
          </div>
        </div>
      )}

      {/* Returns by SKU */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-4">Returns by SKU (Problem Products)</h3>
        {data.by_sku.length === 0
          ? <p className="typo-empty py-4 text-center">No customer returns in this period.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">SKU</th>
                    <th className="pb-3 font-medium">Product</th>
                    <th className="pb-3 font-medium">Sold</th>
                    <th className="pb-3 font-medium">Returned</th>
                    <th className="pb-3 font-medium">Rate</th>
                    <th className="pb-3 font-medium">Restocked</th>
                    <th className="pb-3 font-medium">Damaged</th>
                    <th className="pb-3 font-medium">Top Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_sku.map((r, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 font-semibold text-emerald-600">{r.sku_code}</td>
                      <td className="py-3 text-gray-500 text-xs">{r.product_name}</td>
                      <td className="py-3">{r.sold_qty}</td>
                      <td className="py-3 text-red-600 font-medium">{r.returned_qty}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 typo-badge ring-1 ring-inset ${
                          r.return_rate_pct > 10 ? 'bg-red-50 text-red-700 ring-red-600/20' :
                          r.return_rate_pct > 5 ? 'bg-amber-50 text-amber-700 ring-amber-600/20' :
                          'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                        }`}>{r.return_rate_pct}%</span>
                      </td>
                      <td className="py-3 text-emerald-600">{r.restocked}</td>
                      <td className="py-3">{r.damaged > 0 ? <span className="text-red-600">{r.damaged}</span> : '0'}</td>
                      <td className="py-3 text-gray-500 text-xs capitalize">{r.top_reason?.replace(/_/g, ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* By Customer + Supplier Returns side-by-side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* By Customer */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="typo-section-title mb-4">Returns by Customer</h3>
          {data.by_customer.length === 0
            ? <p className="typo-empty py-4 text-center">No customer returns.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">Orders</th>
                    <th className="pb-3 font-medium">Returns</th>
                    <th className="pb-3 font-medium">Rate</th>
                    <th className="pb-3 font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_customer.map((c, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 font-semibold">{c.customer_name}</td>
                      <td className="py-3">{c.order_count}</td>
                      <td className="py-3 text-red-600 font-medium">{c.return_count}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 typo-badge ring-1 ring-inset ${
                          c.return_rate_pct > 10 ? 'bg-red-50 text-red-700 ring-red-600/20' : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                        }`}>{c.return_rate_pct}%</span>
                      </td>
                      <td className="py-3 text-blue-600 font-medium">{'\u20B9'}{c.credit_amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>

        {/* Supplier Returns */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h3 className="typo-section-title mb-4">Supplier Returns</h3>
          {data.supplier_returns.length === 0
            ? <p className="typo-empty py-4 text-center">No supplier returns.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 font-medium">Supplier</th>
                    <th className="pb-3 font-medium">Returns</th>
                    <th className="pb-3 font-medium">Debit Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.supplier_returns.map((s, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 font-semibold">{s.supplier_name}</td>
                      <td className="py-3 text-red-600 font-medium">{s.return_count}</td>
                      <td className="py-3 text-amber-600 font-medium">{'\u20B9'}{s.debit_value.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  CLOSING STOCK VALUATION TAB
// ═══════════════════════════════════════════════════════
function ClosingStockTab({ data }) {
  if (!data) return null

  const { raw_materials: rm, work_in_progress: wip, finished_goods: fg, grand_total: gt } = data
  const fmt = (v) => `\u20B9${(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  const fmtDec = (v) => `\u20B9${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const STATUS_LABELS = {
    in_stock: 'In Godown',
    sent_for_processing: 'At VA',
    in_cutting: 'In Cutting',
    remnant: 'Remnant',
  }
  const STAGE_LABELS = {
    created: 'Created',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    submitted: 'Submitted',
    checked: 'QC Done',
    packing: 'Packing',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Closing Stock Valuation</h2>
            <p className="mt-1 text-emerald-100">As of {new Date(data.as_of_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} &middot; Weighted Average Cost (AS-2)</p>
          </div>
          <div className="text-right">
            <p className="text-emerald-100 text-sm font-medium">Total Closing Stock</p>
            <p className="text-3xl font-bold">{fmt(gt.total_closing_stock)}</p>
          </div>
        </div>
      </div>

      {/* Source indicator */}
      {data.source === 'fy_closing_snapshot' ? (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-start gap-3">
          <svg className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-sm text-emerald-800"><strong>Frozen snapshot</strong> from FY close ({data.fy_code}). These values were captured at the time of year-end closing and cannot change.</p>
        </div>
      ) : (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
          <svg className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-amber-800"><strong>Live data</strong> — shows current stock levels. For year-end closing values, this is automatically frozen when you close the financial year from Settings.</p>
        </div>
      )}

      {/* Grand Total Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Raw Materials" value={fmt(gt.raw_materials)} sub={`${rm.total_rolls} rolls, ${rm.total_weight_kg} kg`}
          color="bg-blue-500" icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        <KpiCard label="Work-in-Progress" value={fmt(gt.work_in_progress)} sub={`${wip.lots_in_cutting.count} lots + ${wip.batches_in_pipeline.total_batches} batches`}
          color="bg-amber-500" icon="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        <KpiCard label="Finished Goods" value={fmt(gt.finished_goods)} sub={`${fg.total_skus} SKUs, ${fg.total_pieces} pcs`}
          color="bg-emerald-500" icon="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </div>

      {/* ─── RAW MATERIALS ─────────────────────────────────── */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-4">Raw Materials (Rolls)</h3>

        {/* Status breakdown */}
        <div className="grid gap-3 sm:grid-cols-4 mb-6">
          {Object.entries(rm.by_status || {}).map(([status, v]) => (
            <div key={status} className="rounded-lg bg-gray-50 p-3 border border-gray-100">
              <p className="typo-data-label">{STATUS_LABELS[status] || status}</p>
              <p className="typo-kpi-sm mt-1">{v.rolls} rolls</p>
              <p className="typo-caption">{v.weight} kg &middot; {fmt(v.value)}</p>
            </div>
          ))}
        </div>

        {/* Fabric-wise table */}
        {rm.by_fabric.length > 0 && (
          <>
            <h4 className="typo-data-label mb-2 mt-4">By Fabric Type</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">Fabric</th>
                  <th className="pb-3 font-medium text-right">Rolls</th>
                  <th className="pb-3 font-medium text-right">Weight (kg)</th>
                  <th className="pb-3 font-medium text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {rm.by_fabric.map((f, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-semibold">{f.fabric_type}</td>
                    <td className="py-3 text-right">{f.rolls}</td>
                    <td className="py-3 text-right">{f.weight}</td>
                    <td className="py-3 text-right font-medium text-emerald-700">{fmt(f.value)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 font-bold">
                  <td className="py-3">Total</td>
                  <td className="py-3 text-right">{rm.total_rolls}</td>
                  <td className="py-3 text-right">{rm.total_weight_kg}</td>
                  <td className="py-3 text-right text-emerald-700">{fmt(rm.total_value)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* ─── WORK-IN-PROGRESS ──────────────────────────────── */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-1">Work-in-Progress</h3>
        <p className="typo-caption mb-4">{wip.valuation_note}</p>

        <div className="grid gap-4 sm:grid-cols-2 mb-6">
          {/* Lots in cutting */}
          <div className="rounded-lg bg-amber-50 p-4 border border-amber-100">
            <p className="typo-data-label">Lots in Cutting</p>
            <p className="typo-kpi-sm text-amber-700 mt-1">{wip.lots_in_cutting.count} lots</p>
            <p className="typo-caption">Material value: {fmt(wip.lots_in_cutting.material_value)}</p>
          </div>
          {/* Batches in pipeline */}
          <div className="rounded-lg bg-blue-50 p-4 border border-blue-100">
            <p className="typo-data-label">Batches in Pipeline</p>
            <p className="typo-kpi-sm text-blue-700 mt-1">{wip.batches_in_pipeline.total_batches} batches &middot; {wip.batches_in_pipeline.total_pieces} pcs</p>
            <p className="typo-caption">Material value: {fmt(wip.batches_in_pipeline.total_value)}</p>
          </div>
        </div>

        {/* By stage */}
        {Object.keys(wip.batches_in_pipeline.by_stage || {}).length > 0 && (
          <>
            <h4 className="typo-data-label mb-2">Batches by Stage</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">Stage</th>
                  <th className="pb-3 font-medium text-right">Batches</th>
                  <th className="pb-3 font-medium text-right">Pieces</th>
                  <th className="pb-3 font-medium text-right">Material Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(wip.batches_in_pipeline.by_stage).map(([stage, v]) => (
                  <tr key={stage} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-semibold">{STAGE_LABELS[stage] || stage}</td>
                    <td className="py-3 text-right">{v.count}</td>
                    <td className="py-3 text-right">{v.pieces}</td>
                    <td className="py-3 text-right font-medium text-amber-700">{fmt(v.material_value)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 font-bold">
                  <td className="py-3">Total WIP</td>
                  <td className="py-3 text-right">{wip.batches_in_pipeline.total_batches}</td>
                  <td className="py-3 text-right">{wip.batches_in_pipeline.total_pieces}</td>
                  <td className="py-3 text-right text-amber-700">{fmt(wip.total_value)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* ─── FINISHED GOODS ────────────────────────────────── */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-4">Finished Goods</h3>

        {/* By product type summary */}
        {fg.by_product_type.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-4 mb-6">
            {fg.by_product_type.map((pt) => (
              <div key={pt.product_type} className="rounded-lg bg-emerald-50 p-3 border border-emerald-100">
                <p className="typo-data-label">{pt.product_type}</p>
                <p className="typo-kpi-sm text-emerald-700 mt-1">{pt.skus} SKUs</p>
                <p className="typo-caption">{pt.pieces} pcs &middot; {fmt(pt.value)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Unpriced warning */}
        {fg.unpriced_skus > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 mb-4 flex items-start gap-3">
            <svg className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="font-semibold text-amber-800">{fg.unpriced_skus} SKU{fg.unpriced_skus > 1 ? 's' : ''} without cost price</p>
              <p className="text-amber-700 text-sm mt-0.5">These SKUs show {'\u20B9'}0 value because base price is not set. Go to SKUs page and fill the base price (cost price) to get accurate valuation.</p>
            </div>
          </div>
        )}

        {/* SKU detail table with 5-component cost breakdown */}
        {fg.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">SKU Code</th>
                  <th className="pb-3 font-medium text-right">Qty</th>
                  <th className="pb-3 font-medium text-right">Material</th>
                  <th className="pb-3 font-medium text-right">Roll VA</th>
                  <th className="pb-3 font-medium text-right">Stitching</th>
                  <th className="pb-3 font-medium text-right">Batch VA</th>
                  <th className="pb-3 font-medium text-right">Other</th>
                  <th className="pb-3 font-medium text-right">Total/pc</th>
                  <th className="pb-3 font-medium text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {fg.items.map((item, i) => {
                  const cb = item.cost_breakdown || {}
                  const missing = item.cost_source === 'missing'
                  const dash = <span className="text-gray-300">—</span>
                  const costCell = (v) => v > 0 ? fmtDec(v) : <span className="text-gray-300">0</span>
                  return (
                    <tr key={i} className={`border-b last:border-0 hover:bg-gray-50 ${missing ? 'bg-amber-50/50' : ''}`}>
                      <td className="py-2.5">
                        <span className="font-semibold text-emerald-600">{item.sku_code}</span>
                        {missing && <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">No cost</span>}
                      </td>
                      <td className="py-2.5 text-right">{item.total_qty}</td>
                      <td className="py-2.5 text-right">{missing ? dash : costCell(cb.material_cost)}</td>
                      <td className="py-2.5 text-right">{missing ? dash : costCell(cb.roll_va_cost)}</td>
                      <td className="py-2.5 text-right">{missing ? dash : costCell(cb.stitching_cost)}</td>
                      <td className="py-2.5 text-right">{missing ? dash : costCell(cb.batch_va_cost)}</td>
                      <td className="py-2.5 text-right">{missing ? dash : costCell(cb.other_cost)}</td>
                      <td className="py-2.5 text-right font-medium">{missing ? dash : fmtDec(item.wac_per_unit)}</td>
                      <td className="py-2.5 text-right font-medium text-emerald-700">{missing ? dash : fmt(item.value)}</td>
                    </tr>
                  )
                })}
                <tr className="border-t-2 border-gray-300 font-bold">
                  <td className="py-3">Total</td>
                  <td className="py-3 text-right">{fg.total_pieces}</td>
                  <td className="py-3 text-right" colSpan={6}></td>
                  <td className="py-3 text-right text-emerald-700">{fmt(fg.total_value)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Formula note */}
        <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
          <p className="text-xs font-semibold text-gray-600 mb-1">Cost Formula (per piece)</p>
          <p className="text-xs text-gray-500">
            <strong>Total Cost</strong> = Material (fabric weight &times; rate) + Roll VA (embroidery, dying on fabric) + Stitching (tailor charges) + Batch VA (handstitch, buttons on garment) + Other (thread, lining, packing, misc)
          </p>
          <p className="text-xs text-gray-400 mt-1">Valuation method: Weighted Average Cost (AS-2 / Ind AS 2). Material cost derived from lot&rarr;roll chain. VA costs from challan receive records. Stitching &amp; Other from SKU master.</p>
        </div>

        {fg.items.length === 0 && <p className="typo-empty py-4 text-center">No finished goods in stock.</p>}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  MAIN REPORTS PAGE
// ═══════════════════════════════════════════════════════
export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('production')
  const [period, setPeriod] = useState('30d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Data per tab
  const [productionData, setProductionData] = useState(null)
  const [salesData, setSalesData] = useState(null)
  // Inventory tab self-fetches (P4.1 — grouped by design)
  const [financialData, setFinancialData] = useState(null)
  const [accountingData, setAccountingData] = useState(null)
  const [vaData, setVaData] = useState(null)
  const [purchaseData, setPurchaseData] = useState(null)
  const [returnsData, setReturnsData] = useState(null)
  const [tailorData, setTailorData] = useState([])
  const [closingStockData, setClosingStockData] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = { period }
      if (activeTab === 'production') {
        const res = await getProductionReport(params)
        setProductionData(res.data.data)
      } else if (activeTab === 'sales') {
        const res = await getSalesReport(params)
        setSalesData(res.data.data)
      } else if (activeTab === 'inventory') {
        // InventoryTab self-fetches via getInventoryPosition (P4.1)
      } else if (activeTab === 'financial') {
        const res = await getFinancialReport(params)
        setFinancialData(res.data.data)
      } else if (activeTab === 'accounting') {
        const res = await getAccountingReport(params)
        setAccountingData(res.data.data)
      } else if (activeTab === 'va') {
        const res = await getVAReport(params)
        setVaData(res.data.data)
      } else if (activeTab === 'purchases') {
        const res = await getPurchaseReport(params)
        setPurchaseData(res.data.data)
      } else if (activeTab === 'returns') {
        const res = await getReturnsReport(params)
        setReturnsData(res.data.data)
      } else if (activeTab === 'closing_stock') {
        const res = await getClosingStockReport()
        setClosingStockData(res.data.data)
      } else if (activeTab === 'tailor') {
        const res = await getTailorPerf(params)
        setTailorData(res.data.data)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load report data')
    } finally {
      setLoading(false)
    }
  }, [activeTab, period])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="typo-page-title">Reports</h1>
          <p className="mt-1 typo-caption">Production, sales, inventory, financial, accounting, and tailor performance reports</p>
        </div>
      </div>

      {/* Tab Bar + Period Selector */}
      <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
        {/* Tabs */}
        <div className="flex gap-6 border-b border-gray-200">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 pb-2.5 typo-tab border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Period Selector */}
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-full px-3 py-1.5 typo-btn-sm transition-all ${
                period === p.key
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      {/* Content */}
      <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner size="lg" text={`Loading ${TABS.find((t) => t.key === activeTab)?.label} report...`} />
          </div>
        ) : (
          <>
            {activeTab === 'production' && <ProductionTab data={productionData} />}
            {activeTab === 'sales' && <SalesTab data={salesData} />}
            {activeTab === 'inventory' && <InventoryTab period={period} />}
            {activeTab === 'financial' && <FinancialTab data={financialData} />}
            {activeTab === 'accounting' && <AccountingTab data={accountingData} />}
            {activeTab === 'va' && <VATab data={vaData} />}
            {activeTab === 'purchases' && <PurchaseTab data={purchaseData} />}
            {activeTab === 'returns' && <ReturnsTab data={returnsData} />}
            {activeTab === 'closing_stock' && <ClosingStockTab data={closingStockData} />}
            {activeTab === 'tailor' && <TailorTab data={tailorData} />}
          </>
        )}
      </div>
    </div>
  )
}
