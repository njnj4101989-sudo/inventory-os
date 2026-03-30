import { useEffect, useState, useCallback } from 'react'
import { getSummary, getEnhancedDashboard } from '../api/dashboard'
import { useNotifications } from '../context/NotificationContext'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorAlert from '../components/common/ErrorAlert'

// ── KPI Card — matches Orders/Invoices/Returns gradient pattern ──
const KPI_COLORS = {
  slate: 'from-slate-500 to-slate-600',
  amber: 'from-amber-500 to-amber-600',
  blue: 'from-blue-500 to-blue-600',
  green: 'from-green-500 to-green-600',
  emerald: 'from-emerald-500 to-emerald-600',
  purple: 'from-purple-500 to-purple-600',
  red: 'from-red-500 to-red-600',
  orange: 'from-orange-500 to-orange-600',
  cyan: 'from-cyan-500 to-cyan-600',
}

function KPICard({ label, value, sub, color = 'slate' }) {
  return (
    <div className={`rounded-lg bg-gradient-to-br ${KPI_COLORS[color] || KPI_COLORS.slate} p-2.5 text-white shadow-sm`}>
      <p className="typo-kpi-label text-white/85">{label}</p>
      <p className="mt-0.5 text-xl font-bold leading-tight">{value}</p>
      {sub && <p className="typo-caption text-white/75">{sub}</p>}
    </div>
  )
}

// ── Semicircle Gauge ─────────────────────────────────
function Gauge({ value, max, level, label, detail }) {
  const pct = Math.min(value / max * 100, 100)
  const angle = (pct / 100) * 180
  const COLORS = {
    normal: { stroke: '#10b981', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
    busy: { stroke: '#f59e0b', badge: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
    overloaded: { stroke: '#ef4444', badge: 'bg-red-50 text-red-700 ring-red-600/20' },
    low: { stroke: '#6b7280', badge: 'bg-gray-50 text-gray-600 ring-gray-600/20' },
  }
  const c = COLORS[level] || COLORS.normal
  const LEVEL_LABELS = { normal: 'Normal', busy: 'Busy', overloaded: 'Overloaded', low: 'Low' }

  const r = 60, cx = 70, cy = 70
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
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="#e5e7eb" strokeWidth="12" strokeLinecap="round" />
        {pct > 0 && (
          <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none" stroke={c.stroke} strokeWidth="12" strokeLinecap="round"
            style={{ transition: 'all 0.8s ease-out' }} />
        )}
        <text x={cx} y={cy - 8} textAnchor="middle" className="fill-gray-900"
          style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
          {typeof value === 'number' && max === 100 ? `${value}%` : value}
        </text>
      </svg>
      <p className="typo-data mt-1">{label}</p>
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 typo-badge ring-1 ring-inset mt-1 ${c.badge}`}>
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
    critical: { bg: 'bg-red-50 border-red-300', title: 'text-red-900', msg: 'text-red-800', dot: 'bg-red-500' },
    warning: { bg: 'bg-amber-50 border-amber-300', title: 'text-amber-900', msg: 'text-amber-800', dot: 'bg-amber-500' },
    info: { bg: 'bg-blue-50 border-blue-300', title: 'text-blue-900', msg: 'text-blue-800', dot: 'bg-blue-500' },
  }

  return (
    <div className="space-y-2">
      {alerts.map((a, i) => {
        const s = SEVERITY[a.severity] || SEVERITY.info
        return (
          <div key={i} className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${s.bg}`}>
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${s.dot}`} />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${s.dot}`} />
            </span>
            <div className="flex-1 min-w-0">
              <span className={`text-sm font-bold ${s.title}`}>{a.title}</span>
              <span className={`ml-2 text-sm font-semibold ${s.msg}`}>{a.message}</span>
            </div>
            <span className={`flex-shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${s.dot} text-white`}>
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
          <p className="text-xs font-medium text-gray-600 mt-0.5">7-day trend</p>
        </div>
        <div className="text-right">
          <p className="typo-kpi-sm text-emerald-600">{'\u20B9'}{monthRevenue.toLocaleString()}</p>
          <p className="text-xs font-medium text-gray-600">This month</p>
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
                  className={`w-full max-w-[32px] rounded-t-md transition-all duration-500 ${isToday ? 'bg-emerald-500' : 'bg-emerald-300 hover:bg-emerald-400'}`}
                  style={{ height: `${h}%`, minHeight: '4px' }}
                  title={`${d.day_label}: \u20B9${d.amount.toLocaleString()}`}
                />
              </div>
              <span className={isToday ? 'typo-kpi-label text-emerald-700' : 'typo-kpi-label'}>{d.day_label}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
        <span className="text-sm font-bold text-gray-800">Today</span>
        <span className="text-sm font-bold text-emerald-600">{'\u20B9'}{todayRevenue.toLocaleString()}</span>
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
          <span className="text-sm font-semibold text-gray-700">Paid</span>
          <span className="text-sm font-bold text-emerald-600">{'\u20B9'}{data.paid.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="text-sm font-semibold text-gray-700">Pending</span>
          <span className="text-sm font-bold text-amber-600">{'\u20B9'}{data.pending.toLocaleString()}</span>
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
          <p className="mt-1 text-sm font-medium text-gray-600">Real-time overview of your textile operations</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
          <span className="text-xs font-medium text-emerald-600">Live</span>
        </div>
      </div>

      {/* Smart Alerts */}
      {enhanced?.alerts?.length > 0 && (
        <div className="mt-4">
          <AlertBar alerts={enhanced.alerts} />
        </div>
      )}

      {/* Top KPIs — gradient cards matching Orders/Invoices/Returns */}
      <div className="mt-6 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <KPICard label="Active Orders" value={s.orders.pending + s.orders.processing}
          sub={`${s.orders.pending} pending`} color="blue" />
        <KPICard label="Rolls" value={s.rolls.total}
          sub={`${s.rolls.with_remaining} with stock`} color="purple" />
        <KPICard label="Ready Stock" value={`${s.ready_stock_pieces} pcs`}
          sub={`${s.batches?.packed || 0} packed`} color="emerald" />
        <KPICard label="Shipped Today" value={s.orders.shipped_today}
          sub="Orders dispatched" color="green" />
        <KPICard label="Out at VA" value={(s.rolls_out_house || 0) + (s.batches_out_house || 0)}
          sub={`${s.rolls_out_house || 0}R + ${s.batches_out_house || 0}B`} color="orange" />
        <KPICard label="Returns" value={s.returns?.this_month || 0}
          sub={`${s.returns?.draft || 0} draft`} color="amber" />
      </div>

      {/* Revenue Trend + Invoice Split */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <RevenueTrend
            data={enhanced?.revenue_trend}
            todayRevenue={s.revenue_today}
            monthRevenue={s.revenue_month}
          />
        </div>
        <div className="lg:col-span-2">
          <InvoiceSplit data={enhanced?.invoice_split} />
        </div>
      </div>

      {/* Operational Health Gauges */}
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

      {/* Batch Pipeline */}
      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="typo-section-title">Batch Pipeline</h2>
          <div className="flex gap-3">
            <span className="flex items-center gap-1 text-xs font-semibold text-gray-600"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Checked today: {s.batches.checked_today || 0}</span>
            <span className="flex items-center gap-1 text-xs font-semibold text-gray-600"><span className="h-2 w-2 rounded-full bg-green-500" /> Packed today: {s.batches.packed_today || 0}</span>
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
                <p className={`text-2xl font-bold tracking-tight ${stage.accent}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{stage.value}</p>
                <p className={`typo-kpi-label mt-1 ${stage.accent}`}>{stage.label}</p>
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

      {/* Bottom row: Lots + Inventory detail */}
      <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KPICard label="Active Lots" value={s.lots?.total || 0}
          sub={`${s.lots?.open || 0} open, ${s.lots?.distributed || 0} dist`} color="cyan" />
        <KPICard label="Low Stock SKUs" value={s.inventory.low_stock_skus}
          sub={`of ${s.inventory.total_skus} total`} color={s.inventory.low_stock_skus > 0 ? 'red' : 'emerald'} />
        <KPICard label="Revenue Today" value={`\u20B9${s.revenue_today.toLocaleString()}`}
          sub="Invoices paid" color="green" />
        <KPICard label="Revenue Month" value={`\u20B9${s.revenue_month.toLocaleString()}`}
          sub="This month total" color="emerald" />
      </div>
    </div>
  )
}
