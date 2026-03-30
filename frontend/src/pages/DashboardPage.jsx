import { useEffect, useState, useCallback } from 'react'
import { getSummary, getEnhancedDashboard } from '../api/dashboard'
import { useNotifications } from '../context/NotificationContext'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorAlert from '../components/common/ErrorAlert'

// ── Semicircle Gauge ─────────────────────────────────
function Gauge({ value, max, level, label, detail }) {
  const pct = Math.min(value / max * 100, 100)
  const angle = (pct / 100) * 180
  const COLORS = {
    normal: { stroke: '#10b981', bg: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700' },
    busy: { stroke: '#f59e0b', bg: 'text-amber-600', badge: 'bg-amber-50 text-amber-700' },
    overloaded: { stroke: '#ef4444', bg: 'text-red-600', badge: 'bg-red-50 text-red-700' },
    low: { stroke: '#6b7280', bg: 'text-gray-500', badge: 'bg-gray-50 text-gray-600' },
  }
  const c = COLORS[level] || COLORS.normal
  const LEVEL_LABELS = { normal: 'Normal', busy: 'Busy', overloaded: 'Overloaded', low: 'Low' }

  // SVG arc for semicircle
  const r = 60
  const cx = 70
  const cy = 70
  const startAngle = Math.PI
  const endAngle = startAngle + (angle * Math.PI / 180)
  const x1 = cx + r * Math.cos(startAngle)
  const y1 = cy + r * Math.sin(startAngle)
  const x2 = cx + r * Math.cos(endAngle)
  const y2 = cy + r * Math.sin(endAngle)
  const largeArc = angle > 180 ? 1 : 0

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 text-center">
      <svg viewBox="0 0 140 85" className="w-full max-w-[180px] mx-auto">
        {/* Background arc */}
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="#e5e7eb" strokeWidth="12" strokeLinecap="round" />
        {/* Value arc */}
        {pct > 0 && (
          <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none" stroke={c.stroke} strokeWidth="12" strokeLinecap="round"
            style={{ transition: 'all 0.8s ease-out' }} />
        )}
        {/* Center value */}
        <text x={cx} y={cy - 8} textAnchor="middle" className="fill-gray-900" style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
          {typeof value === 'number' && max === 100 ? `${value}%` : value}
        </text>
      </svg>
      <p className="typo-data mt-1">{label}</p>
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 typo-badge mt-1 ${c.badge}`}>
        {LEVEL_LABELS[level]}
      </span>
      {detail && <p className="typo-caption mt-1">{detail}</p>}
    </div>
  )
}

// ── Alert Bar ────────────────────────────────────────
function AlertBar({ alerts }) {
  if (!alerts || alerts.length === 0) return null

  const SEVERITY = {
    critical: { bg: 'bg-red-50 border-red-200', text: 'text-red-800', icon: 'text-red-500', dot: 'bg-red-500' },
    warning: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', icon: 'text-amber-500', dot: 'bg-amber-500' },
    info: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', icon: 'text-blue-500', dot: 'bg-blue-500' },
  }

  return (
    <div className="space-y-2">
      {alerts.map((a, i) => {
        const s = SEVERITY[a.severity] || SEVERITY.info
        return (
          <div key={i} className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${s.bg}`}>
            <span className={`relative flex h-2.5 w-2.5 flex-shrink-0`}>
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${s.dot}`} />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${s.dot}`} />
            </span>
            <div className="flex-1 min-w-0">
              <span className={`typo-data ${s.text}`}>{a.title}</span>
              <span className={`ml-2 typo-caption ${s.text} opacity-80`}>{a.message}</span>
            </div>
            <span className={`flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 typo-badge ${s.dot} text-white`}>
              {a.count}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Mini Bar Chart (7-day revenue) ───────────────────
function RevenueTrend({ data, todayRevenue, monthRevenue }) {
  if (!data || data.length === 0) return null
  const maxAmt = Math.max(...data.map(d => d.amount), 1)

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="typo-section-title">Revenue</h2>
          <p className="typo-caption mt-0.5">7-day trend</p>
        </div>
        <div className="text-right">
          <p className="typo-kpi text-emerald-600">{'\u20B9'}{monthRevenue.toLocaleString()}</p>
          <p className="typo-caption">This month</p>
        </div>
      </div>
      <div className="flex items-end gap-2 h-32">
        {data.map((d, i) => {
          const h = maxAmt > 0 ? Math.max((d.amount / maxAmt) * 100, 3) : 3
          const isToday = i === data.length - 1
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
              <span className="typo-kpi-label">
                {d.amount > 0 ? `\u20B9${(d.amount / 1000).toFixed(d.amount >= 1000 ? 0 : 1)}k` : ''}
              </span>
              <div className="w-full flex justify-center">
                <div
                  className={`w-full max-w-[32px] rounded-t-md transition-all duration-500 ${isToday ? 'bg-emerald-500' : 'bg-emerald-200 hover:bg-emerald-300'}`}
                  style={{ height: `${h}%`, minHeight: '4px' }}
                  title={`${d.day_label}: \u20B9${d.amount.toLocaleString()}`}
                />
              </div>
              <span className={`typo-kpi-label ${isToday ? 'text-emerald-700' : ''}`}>{d.day_label}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
        <span className="typo-data-label">Today</span>
        <span className="typo-data text-emerald-600">{'\u20B9'}{todayRevenue.toLocaleString()}</span>
      </div>
    </div>
  )
}

// ── Invoice Split Bar ────────────────────────────────
function InvoiceSplit({ data }) {
  if (!data || data.total === 0) return null
  const paidPct = Math.round(data.paid / data.total * 100)

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
      <h2 className="typo-section-title mb-3">Invoice Collection</h2>
      <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden flex">
        <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${paidPct}%` }} />
        <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${100 - paidPct}%` }} />
      </div>
      <div className="mt-3 flex justify-between">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-emerald-500" />
          <span className="typo-data-label">Paid</span>
          <span className="typo-data text-emerald-600">{'\u20B9'}{data.paid.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="typo-data-label">Pending</span>
          <span className="typo-data text-amber-600">{'\u20B9'}{data.pending.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}

// ── KPI Card ─────────────────────────────────────────
function KpiCard({ label, value, sub, icon, color }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="typo-kpi-label">{label}</p>
          <p className="mt-1 typo-kpi">{value}</p>
          {sub && <p className="mt-1 typo-caption">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
          </svg>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  MAIN DASHBOARD
// ═══════════════════════════════════════════════════════
export default function DashboardPage() {
  const [summary, setSummary] = useState(null)
  const [enhanced, setEnhanced] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { lastEvent } = useNotifications()

  const fetchDashboard = useCallback(async () => {
    try {
      const [sumRes, enhRes] = await Promise.all([
        getSummary(),
        getEnhancedDashboard().catch(() => ({ data: { data: null } })),
      ])
      setSummary(sumRes.data.data)
      setEnhanced(enhRes.data.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])
  useEffect(() => { if (lastEvent) fetchDashboard() }, [lastEvent, fetchDashboard])

  if (loading) return <LoadingSpinner text="Loading dashboard..." />
  if (error) return <ErrorAlert message={error} />

  const s = summary

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="typo-page-title">Dashboard</h1>
          <p className="mt-1 typo-caption">Real-time overview of your textile operations</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
          <span className="typo-caption text-emerald-600">Live</span>
        </div>
      </div>

      {/* Smart Alerts */}
      {enhanced?.alerts?.length > 0 && (
        <div className="mt-4">
          <AlertBar alerts={enhanced.alerts} />
        </div>
      )}

      {/* Top KPIs — 2x2 grid on mobile, 4 cols on desktop */}
      <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active Orders" value={s.orders.pending + s.orders.processing}
          sub={`${s.orders.pending} pending, ${s.orders.shipped_today} shipped today`}
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          color="bg-blue-500" />
        <KpiCard label="Rolls" value={s.rolls.total}
          sub={`${s.rolls.with_remaining} with stock, ${s.rolls_out_house} at VA`}
          icon="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7l8-4 8 4"
          color="bg-purple-500" />
        <KpiCard label="Ready Stock" value={`${s.ready_stock_pieces} pcs`}
          sub={`${s.batches?.packed || 0} batches packed`}
          icon="M5 13l4 4L19 7"
          color="bg-emerald-500" />
        <KpiCard label="Returns" value={s.returns?.this_month || 0}
          sub={`${s.returns?.draft || 0} draft, ${s.returns?.active || 0} active`}
          icon="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
          color="bg-amber-500" />
      </div>

      {/* Revenue Trend + Gauges row */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Revenue chart — takes 3 cols */}
        <div className="lg:col-span-3">
          <RevenueTrend
            data={enhanced?.revenue_trend}
            todayRevenue={s.revenue_today}
            monthRevenue={s.revenue_month}
          />
        </div>
        {/* Invoice Split — takes 2 cols */}
        <div className="lg:col-span-2">
          <InvoiceSplit data={enhanced?.invoice_split} />
        </div>
      </div>

      {/* Production Gauges — 3 meters */}
      {enhanced?.gauges && (
        <div className="mt-6">
          <h2 className="typo-section-title mb-4">Operational Health</h2>
          <div className="grid gap-4 grid-cols-3">
            <Gauge {...enhanced.gauges.lot_load} />
            <Gauge {...enhanced.gauges.tailor_util} />
            <Gauge {...enhanced.gauges.qc_throughput} />
          </div>
        </div>
      )}

      {/* Batch Pipeline — enhanced with arrows + piece counts */}
      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="typo-section-title">Batch Pipeline</h2>
          <div className="flex gap-3 typo-caption">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Checked today: {s.batches.checked_today || 0}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Packed today: {s.batches.packed_today || 0}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {[
            { label: 'Created', value: s.batches.created, bg: 'bg-gray-100', accent: 'text-gray-700' },
            { label: 'Assigned', value: s.batches.assigned, bg: 'bg-blue-100', accent: 'text-blue-700' },
            { label: 'In Progress', value: s.batches.in_progress, bg: 'bg-indigo-100', accent: 'text-indigo-700' },
            { label: 'Submitted', value: s.batches.submitted, bg: 'bg-purple-100', accent: 'text-purple-700' },
            { label: 'Checked', value: s.batches.checked || 0, bg: 'bg-emerald-100', accent: 'text-emerald-700' },
            { label: 'Packing', value: s.batches.packing || 0, bg: 'bg-amber-100', accent: 'text-amber-700' },
            { label: 'Packed', value: s.batches.packed || 0, bg: 'bg-green-100', accent: 'text-green-700' },
          ].map((stage, i, arr) => (
            <div key={stage.label} className="flex items-center flex-1">
              <div className={`flex-1 rounded-lg p-3 text-center ${stage.bg} ${stage.value > 0 ? 'ring-1 ring-inset ring-black/5' : ''}`}>
                <p className={`typo-kpi ${stage.accent}`}>{stage.value}</p>
                <p className="typo-kpi-label mt-1">{stage.label}</p>
              </div>
              {i < arr.length - 1 && (
                <svg className="h-4 w-4 text-gray-300 flex-shrink-0 mx-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom row: Out-House + Lots + Inventory */}
      <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Rolls Out-House" value={s.rolls_out_house || 0}
          sub="At VA vendor"
          icon="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          color="bg-orange-500" />
        <KpiCard label="Batches Out-House" value={s.batches_out_house || 0}
          sub="Garments at VA"
          icon="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          color="bg-red-500" />
        <KpiCard label="Active Lots" value={s.lots?.total || 0}
          sub={`${s.lots?.open || 0} open, ${s.lots?.distributed || 0} distributed`}
          icon="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 0 3 3 0 004.243 0zm0-5.758a3 3 0 10-4.243 0 3 3 0 004.243 0z"
          color="bg-cyan-500" />
        <KpiCard label="Inventory" value={`${s.inventory.total_skus} SKUs`}
          sub={s.inventory.low_stock_skus > 0 ? `${s.inventory.low_stock_skus} low stock` : 'Stock healthy'}
          icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          color={s.inventory.low_stock_skus > 0 ? 'bg-red-500' : 'bg-emerald-500'} />
      </div>
    </div>
  )
}
