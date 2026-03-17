import { useState, useEffect, useCallback } from 'react'
import { getTailorPerf, getMovement, getProductionReport, getFinancialReport } from '../api/dashboard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorAlert from '../components/common/ErrorAlert'

// ── Tab config ────────────────────────────────────────
const TABS = [
  { key: 'production', label: 'Production', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
  { key: 'inventory', label: 'Inventory', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { key: 'financial', label: 'Financial', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
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
      {label && <span className="text-xs text-gray-500 w-20 text-right flex-shrink-0">{label}</span>}
      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-12">{value}</span>
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
                  <td className="py-3 font-semibold text-primary-600">{lot.lot_code}</td>
                  <td className="py-3">{lot.design_no}</td>
                  <td className="py-3 text-gray-500 text-xs">{new Date(lot.lot_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                  <td className="py-3">{lot.rolls_used}</td>
                  <td className="py-3">
                    <span className="font-medium">{lot.weight_used.toFixed(1)}</span>
                    <span className="text-gray-400 text-xs"> / {lot.total_weight.toFixed(1)}</span>
                  </td>
                  <td className="py-3">
                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
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
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
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
function InventoryTab({ data }) {
  if (!data || data.length === 0) return <p className="text-sm text-gray-500 py-8 text-center">No inventory movement data.</p>

  const totals = data.reduce((acc, r) => ({
    stock_in: acc.stock_in + r.stock_in,
    stock_out: acc.stock_out + r.stock_out,
    returns: acc.returns + r.returns,
    losses: acc.losses + r.losses,
    net: acc.net + r.net_change,
  }), { stock_in: 0, stock_out: 0, returns: 0, losses: 0, net: 0 })

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Stock In" value={`+${totals.stock_in}`} sub="Total incoming pieces"
          color="bg-emerald-500" icon="M7 11l5-5m0 0l5 5m-5-5v12" />
        <KpiCard label="Stock Out" value={`-${totals.stock_out}`} sub="Total shipped / consumed"
          color="bg-red-500" icon="M17 13l-5 5m0 0l-5-5m5 5V6" />
        <KpiCard label="Returns" value={totals.returns} sub="Pieces returned"
          color="bg-amber-500" icon="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        <KpiCard label="Net Change" value={totals.net >= 0 ? `+${totals.net}` : totals.net}
          sub={totals.net >= 0 ? 'Stock increased' : 'Stock decreased'}
          color={totals.net >= 0 ? 'bg-blue-500' : 'bg-red-500'}
          icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </div>

      {/* Movement Table */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="typo-section-title mb-4">SKU-wise Movement</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">SKU</th>
                <th className="pb-3 font-medium">Product</th>
                <th className="pb-3 font-medium">Period</th>
                <th className="pb-3 font-medium">Opening</th>
                <th className="pb-3 font-medium text-emerald-600">Stock In</th>
                <th className="pb-3 font-medium text-red-600">Stock Out</th>
                <th className="pb-3 font-medium">Returns</th>
                <th className="pb-3 font-medium">Losses</th>
                <th className="pb-3 font-medium">Net</th>
                <th className="pb-3 font-medium">Closing</th>
                <th className="pb-3 font-medium">Turnover</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3 font-semibold text-gray-800">{row.sku_code}</td>
                  <td className="py-3 text-gray-500 text-xs">{row.product_name}</td>
                  <td className="py-3 text-gray-400 text-xs">
                    {new Date(row.period.from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    {' — '}
                    {new Date(row.period.to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="py-3 font-medium">{row.opening_stock}</td>
                  <td className="py-3 text-emerald-600 font-medium">+{row.stock_in}</td>
                  <td className="py-3 text-red-600 font-medium">-{row.stock_out}</td>
                  <td className="py-3">{row.returns}</td>
                  <td className="py-3">{row.losses > 0 ? <span className="text-red-500">{row.losses}</span> : '0'}</td>
                  <td className="py-3">
                    <span className={`font-semibold ${row.net_change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {row.net_change >= 0 ? '+' : ''}{row.net_change}
                    </span>
                  </td>
                  <td className="py-3 font-bold text-gray-900">{row.closing_stock}</td>
                  <td className="py-3">
                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      row.turnover_rate > 0.3
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                        : row.turnover_rate > 0.1
                          ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
                          : 'bg-gray-50 text-gray-600 ring-gray-600/20'
                    }`}>
                      {(row.turnover_rate * 100).toFixed(0)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-gray-800">
                <td className="py-3" colSpan={3}>Totals</td>
                <td className="py-3">{data.reduce((s, r) => s + r.opening_stock, 0)}</td>
                <td className="py-3 text-emerald-600">+{totals.stock_in}</td>
                <td className="py-3 text-red-600">-{totals.stock_out}</td>
                <td className="py-3">{totals.returns}</td>
                <td className="py-3">{totals.losses}</td>
                <td className="py-3">
                  <span className={totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {totals.net >= 0 ? '+' : ''}{totals.net}
                  </span>
                </td>
                <td className="py-3">{data.reduce((s, r) => s + r.closing_stock, 0)}</td>
                <td className="py-3">—</td>
              </tr>
            </tfoot>
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
                  <td className="py-3 font-semibold text-gray-800">{row.sku_code}</td>
                  <td className="py-3 text-gray-500 text-xs">{row.product_name}</td>
                  <td className="py-3 font-medium">{row.units_sold}</td>
                  <td className="py-3">{'\u20B9'}{row.avg_price.toLocaleString()}</td>
                  <td className="py-3 font-semibold text-emerald-600">{'\u20B9'}{row.revenue.toLocaleString()}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((row.revenue / maxRevenue) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-10">{Math.round((row.revenue / s.total_revenue) * 100)}%</span>
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
                  <span className="text-sm text-gray-700">{item.category}</span>
                  <span className="text-sm font-semibold text-gray-900">{'\u20B9'}{item.amount.toLocaleString()} <span className="text-xs text-gray-400">({item.pct}%)</span></span>
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
  if (!data || data.length === 0) return <p className="text-sm text-gray-500 py-8 text-center">No tailor performance data.</p>

  const maxPieces = Math.max(...data.map((t) => t.pieces_completed), 1)
  const avgRejection = data.length > 0 ? (data.reduce((s, t) => s + t.rejection_rate, 0) / data.length).toFixed(1) : 0
  const totalPieces = data.reduce((s, t) => s + t.pieces_completed, 0)
  const topTailor = [...data].sort((a, b) => b.efficiency_score - a.efficiency_score)[0]

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active Tailors" value={data.length} sub={`${data.filter((t) => t.current_batch).length} currently working`}
          color="bg-blue-500" icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        <KpiCard label="Total Pieces" value={totalPieces.toLocaleString()} sub={`${data.reduce((s, t) => s + t.batches_completed, 0)} batches completed`}
          color="bg-purple-500" icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        <KpiCard label="Avg Rejection" value={`${avgRejection}%`} sub={parseFloat(avgRejection) <= 3 ? 'Within acceptable range' : 'Needs attention'}
          color={parseFloat(avgRejection) <= 3 ? 'bg-emerald-500' : 'bg-amber-500'} icon="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        <KpiCard label="Top Performer" value={topTailor?.tailor?.full_name || '—'} sub={`Score: ${topTailor?.efficiency_score || 0}/100`}
          color="bg-emerald-500" icon="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </div>

      {/* Tailor Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((t, i) => {
          const rejColor = t.rejection_rate > 5 ? 'text-red-600' : t.rejection_rate > 3 ? 'text-amber-600' : 'text-emerald-600'
          const effColor = t.efficiency_score >= 90 ? 'bg-emerald-500' : t.efficiency_score >= 70 ? 'bg-amber-500' : 'bg-red-500'
          return (
            <div key={i} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700 font-bold text-sm">
                  {t.tailor.full_name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{t.tailor.full_name}</p>
                  <p className="text-xs text-gray-500">{t.speciality}</p>
                </div>
                {t.current_batch && (
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                    Active
                  </span>
                )}
              </div>

              {/* Efficiency bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="typo-data-label">Efficiency Score</span>
                  <span className="typo-data">{t.efficiency_score}/100</span>
                </div>
                <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${effColor}`} style={{ width: `${t.efficiency_score}%` }} />
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                <div>
                  <p className="typo-data-label">Batches</p>
                  <p className="typo-data">{t.batches_completed}</p>
                </div>
                <div>
                  <p className="typo-data-label">Pieces</p>
                  <p className="typo-data">{t.pieces_completed.toLocaleString()}</p>
                </div>
                <div>
                  <p className="typo-data-label">Avg Days</p>
                  <p className="typo-data">{t.avg_completion_days}d</p>
                </div>
                <div>
                  <p className="typo-data-label">Rejection</p>
                  <p className={`typo-data ${rejColor}`}>{t.rejection_rate}%</p>
                </div>
              </div>

              {/* Pieces bar */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <HBar value={t.pieces_completed} max={maxPieces} color="bg-primary-500" label="Output" />
              </div>
            </div>
          )
        })}
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
  const [movementData, setMovementData] = useState([])
  const [financialData, setFinancialData] = useState(null)
  const [tailorData, setTailorData] = useState([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = { period }
      if (activeTab === 'production') {
        const res = await getProductionReport(params)
        setProductionData(res.data.data)
      } else if (activeTab === 'inventory') {
        const res = await getMovement(params)
        setMovementData(res.data.data)
      } else if (activeTab === 'financial') {
        const res = await getFinancialReport(params)
        setFinancialData(res.data.data)
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
          <p className="mt-1 typo-caption">Production metrics, inventory analysis, financial summaries, and tailor performance</p>
        </div>
      </div>

      {/* Tab Bar + Period Selector */}
      <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
        {/* Tabs */}
        <div className="flex rounded-xl bg-gray-100 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
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
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                period === p.key
                  ? 'bg-primary-600 text-white shadow-sm'
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
            {activeTab === 'inventory' && <InventoryTab data={movementData} />}
            {activeTab === 'financial' && <FinancialTab data={financialData} />}
            {activeTab === 'tailor' && <TailorTab data={tailorData} />}
          </>
        )}
      </div>
    </div>
  )
}
