import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getBatches } from '../api/batches'
import { getBatchChallans, getBatchChallan } from '../api/batchChallans'
import { useNotifications } from '../context/NotificationContext'
import SearchInput from '../components/common/SearchInput'
import FilterSelect from '../components/common/FilterSelect'
import BatchLabelSheet from '../components/common/BatchLabelSheet'
import BatchChallan from '../components/common/BatchChallan'
import SendForVAModal from '../components/batches/SendForVAModal'
import ReceiveFromVAModal from '../components/batches/ReceiveFromVAModal'

// ─── Status constants ───────────────────────────────────────────
const STATUS_DOT = {
  created:     'bg-gray-300',
  assigned:    'bg-blue-400',
  in_progress: 'bg-yellow-400',
  submitted:   'bg-purple-400',
  checked:     'bg-emerald-400',
  packing:     'bg-orange-400',
  packed:      'bg-green-400',
}

const STATUS_LABEL = {
  created:     'Created',
  assigned:    'Assigned',
  in_progress: 'In Progress',
  submitted:   'Submitted',
  checked:     'Checked',
  packing:     'Packing',
  packed:      'Packed',
}

const PIPELINE = ['created', 'assigned', 'in_progress', 'submitted', 'checked', 'packing', 'packed']
const PIPELINE_COLORS = {
  created:     { bg: 'bg-gray-50',    text: 'text-gray-600',    border: 'border-gray-200',    accent: 'text-gray-800' },
  assigned:    { bg: 'bg-blue-50',    text: 'text-blue-600',    border: 'border-blue-200',    accent: 'text-blue-800' },
  in_progress: { bg: 'bg-yellow-50',  text: 'text-yellow-600',  border: 'border-yellow-200',  accent: 'text-yellow-800' },
  submitted:   { bg: 'bg-purple-50',  text: 'text-purple-600',  border: 'border-purple-200',  accent: 'text-purple-800' },
  checked:     { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', accent: 'text-emerald-800' },
  packing:     { bg: 'bg-orange-50',  text: 'text-orange-600',  border: 'border-orange-200',  accent: 'text-orange-800' },
  packed:      { bg: 'bg-green-50',   text: 'text-green-600',   border: 'border-green-200',   accent: 'text-green-800' },
}

const TABS = [
  { key: 'all',          label: 'All' },
  { key: 'unclaimed',    label: 'Unclaimed' },
  { key: 'in_production',label: 'In Production' },
  { key: 'in_review',    label: 'In Review' },
  { key: 'done',         label: 'Done' },
]

const VA_COLORS = {
  EMB: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  DYE: { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-300' },
  DPT: { bg: 'bg-sky-100',    text: 'text-sky-700',    border: 'border-sky-300' },
  HWK: { bg: 'bg-rose-100',   text: 'text-rose-700',   border: 'border-rose-300' },
  SQN: { bg: 'bg-pink-100',   text: 'text-pink-700',   border: 'border-pink-300' },
  BTC: { bg: 'bg-teal-100',   text: 'text-teal-700',   border: 'border-teal-300' },
  HST: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  BTN: { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-300' },
  LCW: { bg: 'bg-lime-100',   text: 'text-lime-700',   border: 'border-lime-300' },
  FIN: { bg: 'bg-gray-100',   text: 'text-gray-700',   border: 'border-gray-300' },
}

// ─── Lot workflow state from batch statuses ────────────────────
function getLotWorkflowState(batches) {
  if (!batches || batches.length === 0) return 'unclaimed'
  const statuses = batches.map((b) => b.status)
  if (statuses.every((s) => s === 'created')) return 'unclaimed'
  if (statuses.every((s) => s === 'packed' || s === 'checked' || s === 'packing')) return 'done'
  if (statuses.some((s) => s === 'submitted')) return 'in_review'
  return 'in_production'
}

// ─── Module-level helper components ─────────────────────────────

function StatusDot({ status }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_DOT[status] || 'bg-gray-300'}`} title={STATUS_LABEL[status] || status} />
}

function SizeBreakdown({ batches }) {
  const sizeGroups = useMemo(() => {
    const groups = {}
    batches.forEach((b) => {
      const sz = b.size || '—'
      if (!groups[sz]) groups[sz] = []
      groups[sz].push(b)
    })
    return Object.entries(groups)
  }, [batches])

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {sizeGroups.map(([size, items]) => (
        <div key={size} className="flex items-center gap-1">
          <span className="font-bold text-gray-700">{size}</span>
          <span className="text-gray-400">({items.length})</span>
          <div className="flex gap-0.5 ml-0.5">
            {items.map((b) => <StatusDot key={b.id} status={b.status} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function LotProgressBar({ batches }) {
  const total = batches.length
  const completed = batches.filter((b) => ['checked', 'packing', 'packed'].includes(b.status)).length
  const active = batches.filter((b) => ['assigned', 'in_progress', 'submitted'].includes(b.status)).length
  const pct = total > 0 ? Math.round(((completed + active * 0.5) / total) * 100) : 0

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-emerald-400 to-emerald-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="typo-caption tabular-nums whitespace-nowrap font-semibold">
        {completed}/{total}
      </span>
    </div>
  )
}

function TailorSummary({ batches }) {
  const summary = useMemo(() => {
    const map = {}
    let unclaimed = 0
    batches.forEach((b) => {
      const name = b.assignment?.tailor?.full_name
      if (name) {
        map[name] = (map[name] || 0) + 1
      } else {
        unclaimed++
      }
    })
    const tailors = Object.entries(map).sort((a, b) => b[1] - a[1])
    return { tailors, unclaimed }
  }, [batches])

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
      <span className="typo-card-title">{batches.length} batches</span>
      <span className="text-gray-300">|</span>
      {summary.tailors.map(([name, count]) => (
        <span key={name} className="text-blue-600">{name.split(' ')[0]}({count})</span>
      ))}
      {summary.unclaimed > 0 && (
        <span className="text-gray-400">Unclaimed({summary.unclaimed})</span>
      )}
    </div>
  )
}

function BatchDetailTable({ batches, onRowClick, highlightBatch }) {
  return (
    <div className="border-t border-gray-100">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50">
            <th className="typo-th text-left py-1.5 pl-4 pr-2">Batch</th>
            <th className="typo-th text-left py-1.5 px-2">Size</th>
            <th className="typo-th text-right py-1.5 px-2">Pieces</th>
            <th className="typo-th text-left py-1.5 px-2">Status</th>
            <th className="typo-th text-left py-1.5 px-2">Tailor</th>
            <th className="typo-th text-left py-1.5 pl-2 pr-4">Created</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr
              key={b.id}
              onClick={() => onRowClick(b)}
              className={`border-t border-gray-50 cursor-pointer transition-all duration-500 ${
                highlightBatch === b.id ? 'bg-amber-50 ring-1 ring-inset ring-amber-300' : 'hover:bg-emerald-50/40'
              }`}
            >
              <td className="py-1.5 pl-4 pr-2 font-mono typo-data">{b.batch_code}</td>
              <td className="py-1.5 px-2">
                {b.size ? (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 typo-badge text-emerald-700">{b.size}</span>
                ) : '—'}
              </td>
              <td className="py-1.5 px-2 text-right typo-td">{b.piece_count}</td>
              <td className="py-1.5 px-2">
                <div className="flex items-center gap-1.5">
                  <StatusDot status={b.status} />
                  <span className="capitalize text-gray-600">{STATUS_LABEL[b.status] || b.status}</span>
                </div>
              </td>
              <td className="py-1.5 px-2 text-gray-600">{b.assignment?.tailor?.full_name || <span className="text-gray-300">—</span>}</td>
              <td className="py-1.5 pl-2 pr-4 text-gray-400">{b.created_at ? new Date(b.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LotCard({ lotId, batches, expanded, onToggle, onPrint, onBatchClick, highlightBatch }) {
  const firstBatch = batches[0]
  const lot = firstBatch?.lot
  const lotCode = lot?.lot_code || '—'
  const designNo = batches[0]?.design_no || '—'
  const createdAt = firstBatch?.created_at
  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'

  const workflowState = getLotWorkflowState(batches)
  const stateColors = {
    unclaimed:     'border-l-gray-300 hover:border-l-emerald-500',
    in_production: 'border-l-blue-400 hover:border-l-blue-500',
    in_review:     'border-l-purple-400 hover:border-l-purple-500',
    done:          'border-l-emerald-400 hover:border-l-emerald-600',
  }

  return (
    <div id={`lot-${lotId}`} className={`bg-white rounded-xl shadow-sm border border-gray-200 border-l-4 ${stateColors[workflowState]} overflow-hidden transition-all duration-200 hover:shadow-md cursor-pointer`}>
      {/* Header row */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="typo-card-title text-gray-900">{lotCode}</span>
            <span className="typo-caption">Design {designNo}</span>
            <span className="typo-caption">{dateStr}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); onPrint() }}
              title="Print batch labels"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
            </button>
            <button
              onClick={onToggle}
              className={`rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all ${expanded ? 'rotate-180' : ''}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2">
          <LotProgressBar batches={batches} />
        </div>

        {/* Size breakdown dots */}
        <div className="mt-2">
          <SizeBreakdown batches={batches} />
        </div>

        {/* Tailor summary */}
        <div className="mt-1.5">
          <TailorSummary batches={batches} />
        </div>
      </div>

      {/* Expanded: batch detail table */}
      {expanded && <BatchDetailTable batches={batches} onRowClick={onBatchClick} highlightBatch={highlightBatch} />}
    </div>
  )
}

// Skeleton card for loading state
function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-gray-200 p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-4 w-20 bg-gray-200 rounded" />
        <div className="h-3 w-24 bg-gray-100 rounded" />
        <div className="h-3 w-16 bg-gray-100 rounded" />
      </div>
      <div className="mt-3 h-2 w-full bg-gray-100 rounded-full" />
      <div className="mt-3 flex gap-4">
        <div className="h-3 w-16 bg-gray-100 rounded" />
        <div className="h-3 w-16 bg-gray-100 rounded" />
        <div className="h-3 w-16 bg-gray-100 rounded" />
      </div>
      <div className="mt-2 h-3 w-40 bg-gray-100 rounded" />
    </div>
  )
}

// ─── Main Page Component ─────────────────────────────────────────
export default function BatchesPage() {
  const navigate = useNavigate()
  const { lastEvent } = useNotifications()
  const [allBatches, setAllBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('batches_tab') || 'all')
  const [search, setSearch] = useState('')
  const [expandedLots, setExpandedLots] = useState(() => {
    try { const s = sessionStorage.getItem('batches_expanded'); return s ? new Set(JSON.parse(s)) : new Set() }
    catch { return new Set() }
  })

  // VA modals
  const [showSendVA, setShowSendVA] = useState(false)
  const [showReceiveVA, setShowReceiveVA] = useState(false)
  const [locationFilter, setLocationFilter] = useState('all')

  const { permissions: perms, role } = useAuth()
  const isAdminOrSuper = ['admin', 'supervisor'].includes(role)
  const canSendVA = !!perms.batch_send_va || isAdminOrSuper
  const canReceiveVA = !!perms.batch_receive_va || isAdminOrSuper

  const [highlightBatch, setHighlightBatch] = useState(null)

  // Persist tab + expanded lots to sessionStorage so back-navigation restores state
  useEffect(() => { sessionStorage.setItem('batches_tab', activeTab) }, [activeTab])
  useEffect(() => { sessionStorage.setItem('batches_expanded', JSON.stringify([...expandedLots])) }, [expandedLots])

  // Scroll to last-viewed lot + highlight batch after data loads
  useEffect(() => {
    if (loading) return
    const lotId = sessionStorage.getItem('batches_scroll_lot')
    const batchId = sessionStorage.getItem('batches_highlight_batch')
    if (!lotId && !batchId) return
    sessionStorage.removeItem('batches_scroll_lot')
    sessionStorage.removeItem('batches_highlight_batch')
    if (batchId) setHighlightBatch(batchId)
    // Wait for DOM to render lot cards
    const timer = setTimeout(() => {
      const el = document.getElementById(`lot-${lotId}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    // Clear highlight after 3s
    const fade = setTimeout(() => setHighlightBatch(null), 3000)
    return () => { clearTimeout(timer); clearTimeout(fade) }
  }, [loading])

  // Label sheet
  const [labelBatches, setLabelBatches] = useState(null)
  const [labelLotCode, setLabelLotCode] = useState('')
  const [labelDesignNo, setLabelDesignNo] = useState('')
  const [labelLotDate, setLabelLotDate] = useState('')

  // VA tab state
  const [batchChallansData, setBatchChallansData] = useState([])
  const [bcLoading, setBcLoading] = useState(false)
  const [bcVAFilter, setBcVAFilter] = useState('')
  const [bcProcessorFilter, setBcProcessorFilter] = useState('')
  const [bcSearch, setBcSearch] = useState('')
  const [showBatchChallan, setShowBatchChallan] = useState(false)
  const [batchChallanData, setBatchChallanData] = useState(null)

  // Fetch all batches (large page_size)
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getBatches({ page: 1, page_size: 0, sort_by: 'created_at', sort_order: 'desc' })
      setAllBatches(res.data.data || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load batches')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh on relevant SSE events (batch pipeline + VA)
  useEffect(() => {
    if (!lastEvent) return
    const batchEvents = ['batch_claimed', 'batch_submitted', 'batch_checked', 'batch_packed', 'va_sent', 'va_received', 'lot_distributed']
    if (batchEvents.includes(lastEvent.type)) {
      fetchData()
    }
  }, [lastEvent, fetchData])

  // Fetch batch challans for VA tab
  const fetchBatchChallans = useCallback(async () => {
    setBcLoading(true)
    try {
      const res = await getBatchChallans({ status: 'sent', page_size: 0 })
      setBatchChallansData(res.data?.data || res.data || [])
    } catch {
      setBatchChallansData([])
    } finally {
      setBcLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'out_for_va') fetchBatchChallans()
  }, [activeTab, fetchBatchChallans])

  // Compute visible tabs based on permissions
  const visibleTabs = useMemo(() => {
    const base = [...TABS]
    if (canSendVA || canReceiveVA) {
      base.push({ key: 'out_for_va', label: 'Out for VA' })
    }
    return base
  }, [canSendVA, canReceiveVA])

  // Pipeline KPI counts + VA stats
  const { pipelineCounts, outForVACount, readyStockCount } = useMemo(() => {
    const counts = {}
    PIPELINE.forEach((s) => { counts[s] = 0 })
    let outVA = 0
    let readyStock = 0
    allBatches.forEach((b) => {
      if (counts[b.status] !== undefined) counts[b.status]++
      if (b.has_pending_va) outVA++
      if (b.status === 'packed') readyStock += (b.piece_count || 0)
    })
    return { pipelineCounts: counts, outForVACount: outVA, readyStockCount: readyStock }
  }, [allBatches])

  // Group batches by lot
  const lotGroups = useMemo(() => {
    const groups = {}
    allBatches.forEach((b) => {
      const lotId = b.lot?.id || '_no_lot'
      if (!groups[lotId]) groups[lotId] = []
      groups[lotId].push(b)
    })
    // Sort each group by batch_code
    Object.values(groups).forEach((arr) => arr.sort((a, b) => (a.batch_code || '').localeCompare(b.batch_code || '')))
    return groups
  }, [allBatches])

  // Filter by tab + search
  const filteredLotIds = useMemo(() => {
    let entries = Object.entries(lotGroups)

    // Tab filter
    if (activeTab !== 'all') {
      entries = entries.filter(([, batches]) => getLotWorkflowState(batches) === activeTab)
    }

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      entries = entries.filter(([, batches]) => {
        const lot = batches[0]?.lot
        const lotCode = (lot?.lot_code || '').toLowerCase()
        const designNo = batches.map((b) => (b.design_no || '').toLowerCase()).join(' ')
        const batchCodes = batches.map((b) => (b.batch_code || '').toLowerCase()).join(' ')
        return lotCode.includes(q) || designNo.includes(q) || batchCodes.includes(q)
      })
    }

    return entries.map(([id]) => id)
  }, [lotGroups, activeTab, search])

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts = { all: 0, unclaimed: 0, in_production: 0, in_review: 0, done: 0 }
    Object.entries(lotGroups).forEach(([, batches]) => {
      counts.all++
      const state = getLotWorkflowState(batches)
      if (counts[state] !== undefined) counts[state]++
    })
    return counts
  }, [lotGroups])

  // Filtered challans for VA tab
  const filteredChallans = useMemo(() => {
    let list = batchChallansData
    if (bcVAFilter) {
      list = list.filter((c) => c.value_addition?.short_code === bcVAFilter)
    }
    if (bcProcessorFilter) {
      list = list.filter((c) => c.va_party?.name === bcProcessorFilter)
    }
    if (bcSearch.trim()) {
      const q = bcSearch.trim().toLowerCase()
      list = list.filter((c) =>
        (c.challan_no || '').toLowerCase().includes(q) ||
        (c.va_party?.name || '').toLowerCase().includes(q) ||
        (c.batch_items || []).some((i) => (i.batch?.batch_code || '').toLowerCase().includes(q))
      )
    }
    return list
  }, [batchChallansData, bcVAFilter, bcProcessorFilter, bcSearch])

  // VA tab KPIs
  const bcKPIs = useMemo(() => {
    const challans = batchChallansData
    const totalPieces = challans.reduce((s, c) => s + (c.total_pieces || 0), 0)
    const processors = new Set(challans.map((c) => c.va_party?.name)).size
    const now = Date.now()
    const overdue = challans.filter((c) => {
      const sent = c.sent_date ? new Date(c.sent_date).getTime() : 0
      return sent > 0 && (now - sent) > 14 * 86400000
    }).length
    return { count: challans.length, totalPieces, processors, overdue }
  }, [batchChallansData])

  // VA filter options
  const bcFilterOptions = useMemo(() => {
    const vas = new Set()
    const procs = new Set()
    batchChallansData.forEach((c) => {
      if (c.value_addition?.short_code) vas.add(c.value_addition.short_code)
      if (c.va_party?.name) procs.add(c.va_party?.name)
    })
    return { vas: [...vas].sort(), processors: [...procs].sort() }
  }, [batchChallansData])

  const handlePrintBatchChallan = async (challan) => {
    try {
      const res = await getBatchChallan(challan.id)
      setBatchChallanData(res.data?.data || res.data)
      setShowBatchChallan(true)
    } catch {
      // Fallback to list-level data (may lack batch_items detail)
      setBatchChallanData(challan)
      setShowBatchChallan(true)
    }
  }

  const handlePrintChallanFromSend = (data) => {
    setBatchChallanData(data)
    setShowBatchChallan(true)
  }

  const toggleExpand = (lotId) => {
    setExpandedLots((prev) => {
      const next = new Set(prev)
      if (next.has(lotId)) next.delete(lotId)
      else next.add(lotId)
      return next
    })
  }

  const handlePrint = (lotId) => {
    const batches = lotGroups[lotId] || []
    if (batches.length === 0) return
    const lot = batches[0]?.lot
    setLabelBatches(batches)
    setLabelLotCode(lot?.lot_code || '—')
    setLabelDesignNo(batches[0]?.design_no || '—')
    setLabelLotDate(batches[0]?.created_at || '')
  }

  const handleBatchClick = (batch) => {
    // Save which lot + batch so we scroll back and highlight
    const lotId = batch.lot?.id || batch.lot_id || ''
    if (lotId) sessionStorage.setItem('batches_scroll_lot', lotId)
    sessionStorage.setItem('batches_highlight_batch', batch.id)
    navigate(`/batches/${batch.id}`)
  }

  return (
    <div>
      {/* Page header */}
      <div>
        <h1 className="typo-page-title">Batches</h1>
        <p className="mt-1 typo-body text-gray-500">Production batches grouped by lot — track tailoring progress at a glance</p>
      </div>

      {/* Pipeline KPI bar */}
      <div className="mt-5 grid grid-cols-7 gap-2">
        {PIPELINE.map((status) => {
          const c = PIPELINE_COLORS[status]
          return (
            <div key={status} className={`rounded-xl border ${c.border} ${c.bg} px-4 py-3 text-center`}>
              <div className={`typo-kpi ${c.accent}`}>{pipelineCounts[status]}</div>
              <div className={`typo-kpi-label mt-0.5 ${c.text}`}>{STATUS_LABEL[status]}</div>
            </div>
          )
        })}
      </div>

      {/* VA action buttons */}
      {(canSendVA || canReceiveVA) && (
        <div className="mt-5 flex items-center gap-2">
          {canSendVA && (
            <button onClick={() => setShowSendVA(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 typo-btn-sm text-white hover:bg-violet-700 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send for VA
            </button>
          )}
          {canReceiveVA && (
            <button onClick={() => setShowReceiveVA(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 typo-btn-sm text-white hover:bg-green-700 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Receive from VA
            </button>
          )}
          {outForVACount > 0 && (
            <span className="typo-badge text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
              {outForVACount} batch{outForVACount !== 1 ? 'es' : ''} out for VA
            </span>
          )}
          {readyStockCount > 0 && (
            <span className="typo-badge text-green-600 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
              {readyStockCount} pcs ready stock
            </span>
          )}
        </div>
      )}

      {/* Tabs + Search */}
      <div className="mt-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-3.5 py-1.5 typo-btn-sm transition-colors ${
                activeTab === tab.key
                  ? tab.key === 'out_for_va' ? 'bg-amber-600 text-white shadow-sm' : 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
              {tab.key === 'out_for_va' ? (
                batchChallansData.length > 0 && (
                  <span className={`ml-1.5 ${activeTab === tab.key ? 'text-amber-200' : 'text-amber-500'}`}>
                    {batchChallansData.length}
                  </span>
                )
              ) : (
                <span className={`ml-1.5 ${activeTab === tab.key ? 'text-emerald-200' : 'text-gray-400'}`}>
                  {tabCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="w-64">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search lot, design, batch..."
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 typo-body text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-3">&times;</button>
        </div>
      )}

      {/* Content area */}
      {activeTab === 'out_for_va' ? (
        <div className="mt-4">
          {/* VA KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
              <div className="typo-kpi text-amber-800">{bcKPIs.count}</div>
              <div className="typo-kpi-label mt-0.5 text-amber-600">Challans Out</div>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-center">
              <div className="typo-kpi text-violet-800">{bcKPIs.totalPieces}</div>
              <div className="typo-kpi-label mt-0.5 text-violet-600">Total Pieces</div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center">
              <div className="typo-kpi text-blue-800">{bcKPIs.processors}</div>
              <div className="typo-kpi-label mt-0.5 text-blue-600">Processors</div>
            </div>
            <div className={`rounded-xl border px-4 py-3 text-center ${bcKPIs.overdue > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
              <div className={`typo-kpi ${bcKPIs.overdue > 0 ? 'text-red-800' : 'text-gray-800'}`}>{bcKPIs.overdue}</div>
              <div className={`typo-kpi-label mt-0.5 ${bcKPIs.overdue > 0 ? 'text-red-600' : 'text-gray-600'}`}>Overdue (&gt;14d)</div>
            </div>
          </div>

          {/* VA filter bar */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <FilterSelect value={bcVAFilter} onChange={setBcVAFilter}
              options={[{ value: '', label: 'All VA Types' }, ...bcFilterOptions.vas.map(v => ({ value: v, label: v }))]} />
            <FilterSelect value={bcProcessorFilter} onChange={setBcProcessorFilter}
              options={[{ value: '', label: 'All Processors' }, ...bcFilterOptions.processors.map(p => ({ value: p, label: p }))]} />
            <div className="w-48">
              <SearchInput value={bcSearch} onChange={setBcSearch} placeholder="Search challan, batch..." />
            </div>
            {(bcVAFilter || bcProcessorFilter || bcSearch) && (
              <button onClick={() => { setBcVAFilter(''); setBcProcessorFilter(''); setBcSearch('') }}
                className="typo-caption hover:text-gray-700 underline">Clear</button>
            )}
          </div>

          {/* Challan cards */}
          {bcLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1,2,3].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : filteredChallans.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="typo-empty">No batch challans out</p>
              <p className="typo-caption mt-1">All batches are in-house</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredChallans.map((challan) => {
                const vaCode = challan.value_addition?.short_code || '—'
                const vaStyle = VA_COLORS[vaCode] || { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' }
                const sentAt = challan.sent_date ? new Date(challan.sent_date) : null
                const daysOut = sentAt ? Math.floor((Date.now() - sentAt.getTime()) / 86400000) : 0
                const batchCount = (challan.batch_items || []).length
                const totalPcs = challan.total_pieces || 0
                const dateStr = sentAt
                  ? sentAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
                  : '—'

                return (
                  <div key={challan.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="px-4 pt-3 pb-3">
                      {/* Challan header */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono typo-card-title text-gray-900">{challan.challan_no}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 typo-badge ${vaStyle.bg} ${vaStyle.text} border ${vaStyle.border}`}>
                          {vaCode}
                        </span>
                      </div>

                      {/* Processor */}
                      <div className="typo-body mb-2">{challan.va_party?.name}</div>

                      {/* Stats row */}
                      <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                          {batchCount} batch{batchCount !== 1 ? 'es' : ''}
                        </span>
                        <span className="typo-card-title">{totalPcs} pcs</span>
                        <span>{dateStr}</span>
                      </div>

                      {/* Days out badge */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 typo-badge ${
                          daysOut > 14 ? 'bg-red-100 text-red-700' : daysOut > 7 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {daysOut}d out
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handlePrintBatchChallan(challan)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 typo-btn-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          Print
                        </button>
                        {canReceiveVA && (
                          <button
                            onClick={() => setShowReceiveVA(true)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 typo-btn-sm text-white hover:bg-green-700 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Receive
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* Lot cards */
        <div className="mt-4 space-y-3">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : filteredLotIds.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="typo-empty">No lots found</p>
              <p className="text-xs mt-1">
                {search ? 'Try a different search term' : 'Distribute lots from the Lots page to create batches'}
              </p>
            </div>
          ) : (
            filteredLotIds.map((lotId) => (
              <LotCard
                key={lotId}
                lotId={lotId}
                batches={lotGroups[lotId]}
                expanded={expandedLots.has(lotId)}
                onToggle={() => toggleExpand(lotId)}
                onPrint={() => handlePrint(lotId)}
                onBatchClick={handleBatchClick}
                highlightBatch={highlightBatch}
              />
            ))
          )}
        </div>
      )}

      {/* Batch Label Sheet (reprint) */}
      {labelBatches && (
        <BatchLabelSheet
          batches={labelBatches}
          lotCode={labelLotCode}
          designNo={labelDesignNo}
          lotDate={labelLotDate}
          onClose={() => setLabelBatches(null)}
        />
      )}

      {/* VA Modals */}
      <SendForVAModal
        open={showSendVA}
        onClose={() => setShowSendVA(false)}
        batches={allBatches}
        onSuccess={() => { fetchData(); if (activeTab === 'out_for_va') fetchBatchChallans() }}
        onPrintChallan={handlePrintChallanFromSend}
      />
      <ReceiveFromVAModal
        open={showReceiveVA}
        onClose={() => setShowReceiveVA(false)}
        onSuccess={() => { fetchData(); if (activeTab === 'out_for_va') fetchBatchChallans() }}
      />

      {/* Batch Challan Print Overlay */}
      {showBatchChallan && batchChallanData && (
        <BatchChallan
          challan={batchChallanData}
          onClose={() => { setShowBatchChallan(false); setBatchChallanData(null) }}
        />
      )}
    </div>
  )
}
