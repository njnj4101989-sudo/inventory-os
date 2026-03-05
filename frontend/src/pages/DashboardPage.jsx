import { useEffect, useState, useCallback } from 'react'
import { getSummary } from '../api/dashboard'
import { useNotifications } from '../context/NotificationContext'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorAlert from '../components/common/ErrorAlert'

const CARDS = [
  {
    key: 'rolls',
    label: 'Rolls',
    icon: 'M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3M4 7h16M9 11h6',
    color: 'bg-blue-500',
    format: (d) => `${d.total} total, ${d.with_remaining} with stock`,
    value: (d) => d.total,
  },
  {
    key: 'batches',
    label: 'Batches',
    icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
    color: 'bg-purple-500',
    format: (d) => `${d.in_progress} active, ${d.checked_today || 0} checked today`,
    value: (d) => d.created + d.assigned + d.in_progress + d.submitted,
  },
  {
    key: 'orders',
    label: 'Orders',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    color: 'bg-amber-500',
    format: (d) => `${d.pending} pending, ${d.shipped_today} shipped today`,
    value: (d) => d.pending + d.processing,
  },
  {
    key: 'revenue',
    label: 'Revenue',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    color: 'bg-green-500',
    format: (d, s) => `Today: ₹${s.revenue_today.toLocaleString()}`,
    value: (_, s) => `₹${s.revenue_month.toLocaleString()}`,
    subLabel: 'This month',
  },
]

const OUT_HOUSE_CARDS = [
  {
    key: 'rolls_out',
    label: 'Rolls Out-House',
    icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
    color: 'bg-orange-500',
    value: (s) => s.rolls_out_house || 0,
    format: (s) => 'Rolls at VA vendor',
  },
  {
    key: 'batches_out',
    label: 'Batches Out-House',
    icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
    color: 'bg-red-500',
    value: (s) => s.batches_out_house || 0,
    format: (s) => 'Batches at VA vendor',
  },
  {
    key: 'ready_stock',
    label: 'Ready Stock',
    icon: 'M5 13l4 4L19 7',
    color: 'bg-emerald-500',
    value: (s) => s.ready_stock_pieces || 0,
    format: (s) => `${s.batches?.packed || 0} batches packed`,
  },
  {
    key: 'lots',
    label: 'Active Lots',
    icon: 'M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 0 3 3 0 004.243 0zm0-5.758a3 3 0 10-4.243 0 3 3 0 004.243 0z',
    color: 'bg-cyan-500',
    value: (s) => s.lots?.total || 0,
    format: (s) => `${s.lots?.open || 0} open, ${s.lots?.distributed || 0} distributed`,
  },
]

export default function DashboardPage() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { lastEvent } = useNotifications()

  const fetchDashboard = useCallback(() => {
    getSummary()
      .then((res) => setSummary(res.data.data))
      .catch((err) => setError(err.response?.data?.detail || 'Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  // Auto-refresh dashboard on any SSE event
  useEffect(() => {
    if (!lastEvent) return
    fetchDashboard()
  }, [lastEvent, fetchDashboard])

  if (loading) return <LoadingSpinner text="Loading dashboard..." />
  if (error) return <ErrorAlert message={error} />

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">Overview of your textile inventory operations</p>

      {/* Summary Cards */}
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((card) => {
          const sectionData = card.key === 'revenue' ? null : summary[card.key]
          return (
            <div key={card.key} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.color} text-white`}>
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={card.icon} />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{card.subLabel || card.label}</p>
                  <p className="text-xl font-bold text-gray-800">
                    {card.value(sectionData, summary)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-gray-400">
                {card.format(sectionData, summary)}
              </p>
            </div>
          )
        })}
      </div>

      {/* Out-House & Ready Stock */}
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {OUT_HOUSE_CARDS.map((card) => (
          <div key={card.key} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.color} text-white`}>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={card.icon} />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-xl font-bold text-gray-800">{card.value(summary)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-400">{card.format(summary)}</p>
          </div>
        ))}
      </div>

      {/* Batch Pipeline — 7 states */}
      <div className="mt-8 rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800">Batch Pipeline</h2>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {[
            { label: 'Created', value: summary.batches.created, bg: 'bg-gray-100', accent: 'text-gray-800', muted: 'text-gray-500' },
            { label: 'Assigned', value: summary.batches.assigned, bg: 'bg-blue-100', accent: 'text-blue-800', muted: 'text-blue-600' },
            { label: 'In Progress', value: summary.batches.in_progress, bg: 'bg-yellow-100', accent: 'text-yellow-800', muted: 'text-yellow-600' },
            { label: 'Submitted', value: summary.batches.submitted, bg: 'bg-purple-100', accent: 'text-purple-800', muted: 'text-purple-600' },
            { label: 'Checked', value: summary.batches.checked || 0, bg: 'bg-indigo-100', accent: 'text-indigo-800', muted: 'text-indigo-600' },
            { label: 'Packing', value: summary.batches.packing || 0, bg: 'bg-orange-100', accent: 'text-orange-800', muted: 'text-orange-600' },
            { label: 'Packed', value: summary.batches.packed || 0, bg: 'bg-green-100', accent: 'text-green-800', muted: 'text-green-600' },
          ].map((stage) => (
            <div key={stage.label} className={`rounded-lg p-3 text-center ${stage.bg}`}>
              <p className={`text-2xl font-bold tabular-nums ${stage.accent}`}>{stage.value}</p>
              <p className={`mt-1 text-[11px] font-semibold uppercase tracking-wide ${stage.muted}`}>{stage.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-gray-400">
          <span>Checked today: {summary.batches.checked_today || 0}</span>
          <span>Packed today: {summary.batches.packed_today || 0}</span>
        </div>
      </div>

      {/* Inventory + Orders side-by-side */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Inventory</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Total SKUs</span>
              <span className="font-semibold text-gray-800">{summary.inventory.total_skus}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Low Stock SKUs</span>
              <span className={`font-semibold ${summary.inventory.low_stock_skus > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {summary.inventory.low_stock_skus}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Revenue</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Today</span>
              <span className="font-semibold text-gray-800">₹{summary.revenue_today.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">This Month</span>
              <span className="font-semibold text-gray-800">₹{summary.revenue_month.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
