import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBatches } from '../api/batches'
import SearchInput from '../components/common/SearchInput'
import BatchLabelSheet from '../components/common/BatchLabelSheet'
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
      <span className="text-xs font-semibold text-gray-500 tabular-nums whitespace-nowrap">
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
      <span className="font-semibold text-gray-700">{batches.length} batches</span>
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

function BatchDetailTable({ batches, onRowClick }) {
  return (
    <div className="border-t border-gray-100">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-gray-500">
            <th className="text-left py-1.5 pl-4 pr-2 font-medium">Batch</th>
            <th className="text-left py-1.5 px-2 font-medium">Size</th>
            <th className="text-right py-1.5 px-2 font-medium">Pieces</th>
            <th className="text-left py-1.5 px-2 font-medium">Status</th>
            <th className="text-left py-1.5 px-2 font-medium">Tailor</th>
            <th className="text-left py-1.5 pl-2 pr-4 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr
              key={b.id}
              onClick={() => onRowClick(b)}
              className="border-t border-gray-50 hover:bg-emerald-50/40 cursor-pointer transition-colors"
            >
              <td className="py-1.5 pl-4 pr-2 font-mono font-semibold text-gray-800">{b.batch_code}</td>
              <td className="py-1.5 px-2">
                {b.size ? (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{b.size}</span>
                ) : '—'}
              </td>
              <td className="py-1.5 px-2 text-right font-semibold text-gray-700">{b.piece_count}</td>
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

function LotCard({ lotId, batches, expanded, onToggle, onPrint, onBatchClick }) {
  const firstBatch = batches[0]
  const lot = firstBatch?.lot
  const lotCode = lot?.lot_code || '—'
  const designNo = lot?.design_no || '—'
  const createdAt = firstBatch?.created_at
  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'

  const workflowState = getLotWorkflowState(batches)
  const stateColors = {
    unclaimed:     'border-l-gray-300',
    in_production: 'border-l-blue-400',
    in_review:     'border-l-purple-400',
    done:          'border-l-emerald-400',
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 border-l-4 ${stateColors[workflowState]} overflow-hidden transition-shadow hover:shadow-md`}>
      {/* Header row */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-bold text-gray-900 text-sm">{lotCode}</span>
            <span className="text-gray-400 text-xs">Design {designNo}</span>
            <span className="text-gray-400 text-xs">{dateStr}</span>
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
      {expanded && <BatchDetailTable batches={batches} onRowClick={onBatchClick} />}
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
  const [allBatches, setAllBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [expandedLots, setExpandedLots] = useState(new Set())

  // VA modals
  const [showSendVA, setShowSendVA] = useState(false)
  const [showReceiveVA, setShowReceiveVA] = useState(false)
  const [locationFilter, setLocationFilter] = useState('all')

  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}') } catch { return {} } })()
  const perms = currentUser.permissions || {}
  const canSendVA = !!perms.batch_send_va
  const canReceiveVA = !!perms.batch_receive_va

  // Label sheet
  const [labelBatches, setLabelBatches] = useState(null)
  const [labelLotCode, setLabelLotCode] = useState('')
  const [labelDesignNo, setLabelDesignNo] = useState('')
  const [labelLotDate, setLabelLotDate] = useState('')

  // Fetch all batches (large page_size)
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getBatches({ page: 1, page_size: 500, sort_by: 'created_at', sort_order: 'desc' })
      setAllBatches(res.data.data || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load batches')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

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
        const designNo = (lot?.design_no || '').toLowerCase()
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
    setLabelDesignNo(lot?.design_no || '—')
    setLabelLotDate(batches[0]?.created_at || '')
  }

  const handleBatchClick = (batch) => {
    navigate(`/batches/${batch.id}`)
  }

  return (
    <div>
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Batches</h1>
        <p className="mt-1 text-sm text-gray-500">Production batches grouped by lot — track tailoring progress at a glance</p>
      </div>

      {/* Pipeline KPI bar */}
      <div className="mt-5 grid grid-cols-7 gap-2">
        {PIPELINE.map((status) => {
          const c = PIPELINE_COLORS[status]
          return (
            <div key={status} className={`rounded-xl border ${c.border} ${c.bg} px-4 py-3 text-center`}>
              <div className={`text-2xl font-bold tabular-nums ${c.accent}`}>{pipelineCounts[status]}</div>
              <div className={`text-xs font-medium mt-0.5 ${c.text}`}>{STATUS_LABEL[status]}</div>
            </div>
          )
        })}
      </div>

      {/* VA action buttons */}
      {(canSendVA || canReceiveVA) && (
        <div className="mt-5 flex items-center gap-2">
          {canSendVA && (
            <button onClick={() => setShowSendVA(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send for VA
            </button>
          )}
          {canReceiveVA && (
            <button onClick={() => setShowReceiveVA(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Receive from VA
            </button>
          )}
          {outForVACount > 0 && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 font-medium">
              {outForVACount} batch{outForVACount !== 1 ? 'es' : ''} out for VA
            </span>
          )}
          {readyStockCount > 0 && (
            <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-2.5 py-1 font-medium">
              {readyStockCount} pcs ready stock
            </span>
          )}
        </div>
      )}

      {/* Tabs + Search */}
      <div className="mt-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 ${activeTab === tab.key ? 'text-emerald-200' : 'text-gray-400'}`}>
                {tabCounts[tab.key]}
              </span>
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
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-3">&times;</button>
        </div>
      )}

      {/* Lot cards */}
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
            <p className="text-sm font-medium">No lots found</p>
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
            />
          ))
        )}
      </div>

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
        onSuccess={fetchData}
      />
      <ReceiveFromVAModal
        open={showReceiveVA}
        onClose={() => setShowReceiveVA(false)}
        onSuccess={fetchData}
      />
    </div>
  )
}
