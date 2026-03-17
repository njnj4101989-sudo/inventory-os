import { useState, useEffect, useMemo, useCallback } from 'react'
import { getJobChallans, getJobChallan } from '../api/jobChallans'
import { getBatchChallans, getBatchChallan } from '../api/batchChallans'
import { getAllValueAdditions, getAllVAParties } from '../api/masters'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import ErrorAlert from '../components/common/ErrorAlert'
import LoadingSpinner from '../components/common/LoadingSpinner'
import JobChallan from '../components/common/JobChallan'
import BatchChallan from '../components/common/BatchChallan'

const VA_COLORS = {
  EMB: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  DYE: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  DPT: { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200' },
  HWK: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
  SQN: { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' },
  BTC: { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' },
  HST: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  BTN: { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
  LCW: { bg: 'bg-lime-100', text: 'text-lime-700', border: 'border-lime-200' },
  FIN: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' },
}
const DEFAULT_VA = { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' }
const getVAColor = (sc) => VA_COLORS[sc] || DEFAULT_VA

const STATUS_STYLES = {
  sent: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'Sent' },
  partially_received: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Partial' },
  received: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', label: 'Received' },
}
const getStatusStyle = (s) => STATUS_STYLES[s] || STATUS_STYLES.sent

const TABS = [
  { key: 'job', label: 'Job Challans', sublabel: 'Rolls' },
  { key: 'batch', label: 'Batch Challans', sublabel: 'Garments' },
]

export default function ChallansPage() {
  const [tab, setTab] = useState('job')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [vaFilter, setVaFilter] = useState('')
  const [partyFilter, setPartyFilter] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Data
  const [jcData, setJcData] = useState({ data: [], total: 0, pages: 1 })
  const [bcData, setBcData] = useState({ data: [], total: 0, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Masters
  const [vaTypes, setVaTypes] = useState([])
  const [vaParties, setVaParties] = useState([])

  // Detail overlay
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Print
  const [printChallan, setPrintChallan] = useState(null)

  useEffect(() => {
    getAllValueAdditions().then(r => setVaTypes(r.data?.data || [])).catch((e) => console.error('Failed to load VA types:', e.message))
    getAllVAParties().then(r => setVaParties(r.data?.data || [])).catch((e) => console.error('Failed to load VA parties:', e.message))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = { page, page_size: pageSize }
      if (statusFilter) params.status = statusFilter
      if (vaFilter) params.value_addition_id = vaFilter
      if (partyFilter) params.va_party_id = partyFilter

      if (tab === 'job') {
        const res = await getJobChallans(params)
        setJcData(res.data)
      } else {
        const res = await getBatchChallans(params)
        setBcData(res.data)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load challans')
    } finally {
      setLoading(false)
    }
  }, [tab, page, statusFilter, vaFilter, partyFilter])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(1) }, [tab, statusFilter, vaFilter, partyFilter])

  const data = tab === 'job' ? jcData : bcData
  const filtered = useMemo(() => {
    if (!search.trim()) return data.data || []
    const q = search.toLowerCase()
    return (data.data || []).filter(c =>
      (c.challan_no || '').toLowerCase().includes(q) ||
      (c.va_party?.name || '').toLowerCase().includes(q) ||
      (c.value_addition?.name || '').toLowerCase().includes(q)
    )
  }, [data.data, search])

  // KPIs
  const kpis = useMemo(() => {
    const list = filtered
    const sent = list.filter(c => c.status === 'sent').length
    const partial = list.filter(c => c.status === 'partially_received').length
    const received = list.filter(c => c.status === 'received').length
    const totalItems = tab === 'job'
      ? list.reduce((s, c) => s + (c.roll_count || 0), 0)
      : list.reduce((s, c) => s + (c.total_pieces || 0), 0)
    return { sent, partial, received, totalItems, total: list.length }
  }, [filtered, tab])

  const openDetail = async (challan) => {
    setDetailLoading(true)
    setDetail(challan) // show immediately with list data
    try {
      const res = tab === 'job'
        ? await getJobChallan(challan.id)
        : await getBatchChallan(challan.id)
      setDetail(res.data?.data || res.data)
    } catch {
      // keep list data if detail fetch fails
    } finally {
      setDetailLoading(false)
    }
  }

  const openPrint = async (challan) => {
    try {
      const res = tab === 'job'
        ? await getJobChallan(challan.id)
        : await getBatchChallan(challan.id)
      setPrintChallan(res.data?.data || res.data)
    } catch {
      setPrintChallan(challan) // fallback to list data
    }
  }

  // ── Print overlay ──
  if (printChallan) {
    if (tab === 'job') {
      return <JobChallan challan={printChallan} onClose={() => setPrintChallan(null)} />
    }
    return <BatchChallan challan={printChallan} onClose={() => setPrintChallan(null)} />
  }

  // ── Detail overlay ──
  if (detail) {
    const st = getStatusStyle(detail.status)
    const vc = getVAColor(detail.value_addition?.short_code)
    const isJob = tab === 'job'

    return (
      <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="typo-modal-title font-mono">{detail.challan_no}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${st.bg} ${st.text} ${st.border}`}>
                {st.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {detail.va_party?.name || '—'} • {detail.value_addition?.name || '—'}
              {detail.sent_date && <span className="ml-2 text-gray-400">Sent: {detail.sent_date}</span>}
              {detail.received_date && <span className="ml-2 text-green-600">Received: {detail.received_date}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openPrint(detail)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print
            </button>
            <button onClick={() => setDetail(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl">
            {detailLoading && <div className="text-center py-4"><LoadingSpinner size="sm" /></div>}

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
                <div className="typo-kpi">{isJob ? (detail.roll_count || 0) : (detail.total_pieces || 0)}</div>
                <div className="typo-kpi-label mt-0.5">{isJob ? 'Rolls' : 'Pieces'}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
                <div className="typo-kpi">
                  {isJob ? `${(detail.total_weight || 0).toFixed(1)} kg` : (detail.total_cost ? `₹${detail.total_cost}` : '—')}
                </div>
                <div className="typo-kpi-label mt-0.5">{isJob ? 'Total Weight' : 'Total Cost'}</div>
              </div>
              <div className={`rounded-xl border p-4 text-center ${vc.bg} ${vc.border}`}>
                <div className={`text-lg font-bold ${vc.text}`}>{detail.value_addition?.short_code || '—'}</div>
                <div className="typo-kpi-label mt-0.5">{detail.value_addition?.name || 'VA Type'}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
                <div className="typo-data">{detail.created_by_user?.full_name || '—'}</div>
                <div className="typo-kpi-label mt-0.5">Created By</div>
              </div>
            </div>

            {/* Items table */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-3">
                <h3 className="typo-card-title">{isJob ? 'Rolls' : 'Batch Items'}</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50 typo-th">
                    <th className="px-4 py-2.5 text-center w-10">#</th>
                    {isJob ? (
                      <>
                        <th className="px-4 py-2.5 text-left">Roll Code</th>
                        <th className="px-4 py-2.5 text-left">Color</th>
                        <th className="px-4 py-2.5 text-left">Fabric</th>
                        <th className="px-4 py-2.5 text-right">Weight Sent</th>
                        <th className="px-4 py-2.5 text-right">Current Wt</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-2.5 text-left">Batch Code</th>
                        <th className="px-4 py-2.5 text-left">Size</th>
                        <th className="px-4 py-2.5 text-left">Phase</th>
                        <th className="px-4 py-2.5 text-right">Pcs Sent</th>
                        <th className="px-4 py-2.5 text-right">Pcs Recv</th>
                        <th className="px-4 py-2.5 text-left">Status</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {isJob && (detail.rolls || []).map((r, i) => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-center text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2 font-semibold text-gray-800">{r.enhanced_roll_code || r.roll_code}</td>
                      <td className="px-4 py-2 text-gray-600">{r.color}</td>
                      <td className="px-4 py-2 text-gray-600">{r.fabric_type}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{r.weight_sent ? `${parseFloat(r.weight_sent).toFixed(3)} kg` : '—'}</td>
                      <td className="px-4 py-2 text-right text-gray-700 font-medium">{parseFloat(r.current_weight || 0).toFixed(3)} kg</td>
                    </tr>
                  ))}
                  {!isJob && (detail.batch_items || []).map((bi, i) => {
                    const biSt = getStatusStyle(bi.status)
                    return (
                      <tr key={bi.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-2 text-center text-gray-400">{i + 1}</td>
                        <td className="px-4 py-2 font-semibold text-gray-800">{bi.batch?.batch_code || '—'}</td>
                        <td className="px-4 py-2 text-gray-600">{bi.batch?.size || '—'}</td>
                        <td className="px-4 py-2 text-gray-600 capitalize">{bi.phase || '—'}</td>
                        <td className="px-4 py-2 text-right text-gray-500">{bi.pieces_sent}</td>
                        <td className="px-4 py-2 text-right text-gray-700 font-medium">{bi.pieces_received ?? '—'}</td>
                        <td className="px-4 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium border ${biSt.bg} ${biSt.text} ${biSt.border}`}>
                            {biSt.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {((isJob && !(detail.rolls || []).length) || (!isJob && !(detail.batch_items || []).length)) && (
                    <tr><td colSpan={isJob ? 6 : 7} className="px-4 py-8 text-center text-gray-400">No items</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Notes */}
            {detail.notes && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                <h4 className="typo-label-sm">Notes</h4>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{detail.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Main list view ──
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="typo-page-title">Challans</h1>
          <p className="typo-caption">VA processing history — Job Challans (rolls) & Batch Challans (garments)</p>
        </div>
        <button onClick={fetchData} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label} <span className="text-xs text-gray-400 ml-1">({t.sublabel})</span>
          </button>
        ))}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
          <div className="typo-kpi-sm text-gray-900">{kpis.total}</div>
          <div className="typo-kpi-label">Total</div>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-center">
          <div className="typo-kpi-sm text-blue-700">{kpis.sent}</div>
          <div className="typo-kpi-label text-blue-500">Sent</div>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-center">
          <div className="typo-kpi-sm text-amber-700">{kpis.partial}</div>
          <div className="typo-kpi-label text-amber-500">Partial</div>
        </div>
        <div className="rounded-xl border border-green-100 bg-green-50/50 p-3 text-center">
          <div className="typo-kpi-sm text-green-700">{kpis.received}</div>
          <div className="typo-kpi-label text-green-500">Received</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
          <div className="typo-kpi-sm text-gray-900">{kpis.totalItems}</div>
          <div className="typo-kpi-label">{tab === 'job' ? 'Rolls' : 'Pieces'}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search challan no, party, VA type..." />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500">
          <option value="">All Status</option>
          <option value="sent">Sent</option>
          <option value="partially_received">Partially Received</option>
          <option value="received">Received</option>
        </select>
        <select value={vaFilter} onChange={e => setVaFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500">
          <option value="">All VA Types</option>
          {vaTypes.map(v => <option key={v.id} value={v.id}>{v.name} ({v.short_code})</option>)}
        </select>
        <select value={partyFilter} onChange={e => setPartyFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500">
          <option value="">All VA Parties</option>
          {vaParties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {(statusFilter || vaFilter || partyFilter) && (
          <button onClick={() => { setStatusFilter(''); setVaFilter(''); setPartyFilter('') }}
            className="text-xs text-gray-500 hover:text-gray-700 underline">Clear</button>
        )}
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {/* Challan table */}
      {loading ? (
        <div className="py-12 text-center"><LoadingSpinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-gray-400">No challans found</div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 typo-th">
                <th className="px-4 py-3 text-left">Challan</th>
                <th className="px-4 py-3 text-left">VA Party</th>
                <th className="px-4 py-3 text-left">VA Type</th>
                <th className="px-4 py-3 text-center">{tab === 'job' ? 'Rolls' : 'Pieces'}</th>
                <th className="px-4 py-3 text-right">{tab === 'job' ? 'Weight' : 'Cost'}</th>
                <th className="px-4 py-3 text-center">Sent</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Days</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const st = getStatusStyle(c.status)
                const vc = getVAColor(c.value_addition?.short_code)
                const isJob = tab === 'job'
                const daysOut = c.sent_date && c.status !== 'received'
                  ? Math.floor((Date.now() - new Date(c.sent_date).getTime()) / (1000 * 60 * 60 * 24))
                  : null

                return (
                  <tr key={c.id} onClick={() => openDetail(c)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono text-sm font-bold text-gray-900">{c.challan_no}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{c.created_by_user?.full_name || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{c.va_party?.name || '—'}</div>
                      {c.va_party?.city && <div className="text-[10px] text-gray-400">{c.va_party.city}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${vc.bg} ${vc.text}`}>
                        {c.value_addition?.short_code || '?'} — {c.value_addition?.name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-900">
                      {isJob ? (c.roll_count || 0) : (c.total_pieces || 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-700">
                      {isJob ? `${(c.total_weight || 0).toFixed(1)} kg` : (c.total_cost ? `₹${c.total_cost}` : '—')}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{c.sent_date || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${st.bg} ${st.text} ${st.border}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {daysOut !== null && daysOut > 0 ? (
                        <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                          daysOut > 14 ? 'text-red-600 bg-red-50 border border-red-200' :
                          daysOut > 7 ? 'text-amber-600 bg-amber-50 border border-amber-200' :
                          'text-gray-500 bg-gray-50 border border-gray-200'
                        }`}>{daysOut}d</span>
                      ) : c.status === 'received' ? (
                        <span className="text-[10px] text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={(e) => { e.stopPropagation(); openPrint(c) }}
                        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-orange-600 transition-colors"
                        title="Print Challan">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data.pages > 1 && (
        <Pagination page={page} pages={data.pages} total={data.total} onChange={setPage} />
      )}
    </div>
  )
}
