import { useState, useEffect, useMemo, useCallback } from 'react'
import { getJobChallans, getJobChallan, receiveJobChallan } from '../api/jobChallans'
import { getBatchChallans, getBatchChallan } from '../api/batchChallans'
import { getAllValueAdditions, getAllVAParties } from '../api/masters'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import ErrorAlert from '../components/common/ErrorAlert'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Modal from '../components/common/Modal'
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

  // Receive modal (job challans)
  const [recvOpen, setRecvOpen] = useState(false)
  const [recvChallan, setRecvChallan] = useState(null)
  const [recvDate, setRecvDate] = useState('')
  const [recvRows, setRecvRows] = useState({}) // {rollId: {checked, weight_after, processing_cost}}
  const [recvSaving, setRecvSaving] = useState(false)
  const [recvError, setRecvError] = useState(null)

  const openReceive = (challan) => {
    const today = new Date().toISOString().split('T')[0]
    const rows = {}
    for (const r of (challan.rolls || [])) {
      // Only include rolls that haven't been received yet
      const log = r.processing_logs?.[r.processing_logs.length - 1]
      if (log?.status === 'received') continue
      rows[r.id] = {
        checked: true,
        weight_after: String(r.weight_sent || r.current_weight || r.total_weight || ''),
        processing_cost: '',
      }
    }
    setRecvChallan(challan)
    setRecvDate(today)
    setRecvRows(rows)
    setRecvError(null)
    setRecvOpen(true)
  }

  const handleReceive = async () => {
    if (!recvDate) { setRecvError('Received date is required'); return }
    const toReceive = Object.entries(recvRows).filter(([, v]) => v.checked)
    if (toReceive.length === 0) { setRecvError('Select at least one roll to receive'); return }
    for (const [rollId, row] of toReceive) {
      const wt = parseFloat(row.weight_after)
      if (!wt || wt <= 0) {
        const roll = (recvChallan.rolls || []).find(r => r.id === rollId)
        setRecvError(`Weight required for ${roll?.roll_code || 'roll'}`)
        return
      }
    }
    setRecvSaving(true)
    setRecvError(null)
    try {
      const rollsPayload = toReceive.map(([rollId, row]) => {
        const roll = (recvChallan.rolls || []).find(r => r.id === rollId)
        const log = roll?.processing_logs?.[roll.processing_logs.length - 1]
        return {
          roll_id: rollId,
          processing_id: log?.id,
          weight_after: parseFloat(row.weight_after),
          processing_cost: row.processing_cost ? parseFloat(row.processing_cost) : null,
        }
      })
      await receiveJobChallan(recvChallan.id, { received_date: recvDate, rolls: rollsPayload })
      setRecvOpen(false)
      setRecvChallan(null)
      // Refresh detail if open
      if (detail && detail.id === recvChallan.id) {
        try {
          const res = await getJobChallan(recvChallan.id)
          setDetail(res.data?.data || res.data)
        } catch { setDetail(null) }
      }
      fetchData()
    } catch (err) {
      setRecvError(err.response?.data?.detail || 'Failed to receive — check individual rolls')
    } finally {
      setRecvSaving(false)
    }
  }

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
      <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
        {/* ── Gradient header ── */}
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-orange-600 to-amber-600 px-6 py-3 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setDetail(null)} className="rounded-lg p-1.5 hover:bg-white/20 transition-colors">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h2 className="text-lg font-bold tracking-tight font-mono">{detail.challan_no}</h2>
              <p className="text-xs text-orange-100">
                {detail.va_party?.name || '—'} · {detail.value_addition?.name || '—'}
                {detail.sent_date && ` · Sent: ${detail.sent_date}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${detail.status === 'received' ? 'bg-green-500/30 text-white' : detail.status === 'partially_received' ? 'bg-amber-300/30 text-white' : 'bg-white/20 text-white'}`}>
              {st.label}
            </span>
            {isJob && detail.status !== 'received' && (
              <button onClick={() => openReceive(detail)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-orange-700 hover:bg-orange-50 transition-colors">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Receive Back
              </button>
            )}
            <button onClick={() => openPrint(detail)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium hover:bg-white/30 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print
            </button>
            <button onClick={() => setDetail(null)}
              className="rounded-lg border border-white/30 px-3 py-1.5 text-sm hover:bg-white/20 transition-colors">Close</button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-4 px-6 py-4">
            {detailLoading && <div className="text-center py-4"><LoadingSpinner size="sm" /></div>}

            {/* ── Info toolbar ── */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-end gap-0 bg-gray-50 border-b border-gray-200">
                <div className="px-4 py-2 border-r border-gray-200">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Challan</label>
                  <div className="text-sm font-bold font-mono text-gray-800">{detail.challan_no}</div>
                </div>
                <div className="px-4 py-2 border-r border-gray-200">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">VA Party</label>
                  <div className="text-sm font-semibold text-gray-800">{detail.va_party?.name || '—'}</div>
                </div>
                <div className="px-4 py-2 border-r border-gray-200">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">VA Type</label>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${vc.bg} ${vc.text}`}>{detail.value_addition?.short_code || '—'}</span>
                    <span className="text-xs text-gray-500">{detail.value_addition?.name}</span>
                  </div>
                </div>
                <div className="px-4 py-2 border-r border-gray-200">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Sent</label>
                  <div className="text-sm text-gray-700">{detail.sent_date || '—'}</div>
                </div>
                {detail.received_date && (
                  <div className="px-4 py-2 border-r border-gray-200">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Received</label>
                    <div className="text-sm font-semibold text-green-700">{detail.received_date}</div>
                  </div>
                )}
                <div className="ml-auto px-4 py-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Created By</label>
                  <div className="text-sm text-gray-700">{detail.created_by_user?.full_name || '—'}</div>
                </div>
              </div>
            </div>

            {/* ── Items table — emerald header ── */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-emerald-600 text-white text-xs font-semibold uppercase tracking-wider">
                    <th className="py-2 px-4 text-center w-10 border-r border-emerald-500">#</th>
                    {isJob ? (
                      <>
                        <th className="py-2 px-4 text-left border-r border-emerald-500">Roll Code</th>
                        <th className="py-2 px-4 text-left border-r border-emerald-500">Color</th>
                        <th className="py-2 px-4 text-left border-r border-emerald-500">Fabric</th>
                        <th className="py-2 px-4 text-right border-r border-emerald-500">Weight Sent</th>
                        <th className="py-2 px-4 text-right">Current Wt</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2 px-4 text-left border-r border-emerald-500">Batch Code</th>
                        <th className="py-2 px-4 text-left border-r border-emerald-500">Size</th>
                        <th className="py-2 px-4 text-left border-r border-emerald-500">Phase</th>
                        <th className="py-2 px-4 text-right border-r border-emerald-500">Pcs Sent</th>
                        <th className="py-2 px-4 text-right border-r border-emerald-500">Pcs Recv</th>
                        <th className="py-2 px-4 text-left">Status</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {isJob && (detail.rolls || []).map((r, i) => (
                    <tr key={r.id} className={`border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50/70' : 'bg-white'}`}>
                      <td className="px-4 py-2 text-center text-gray-400 border-r border-gray-50">{i + 1}</td>
                      <td className="px-4 py-2 font-semibold text-gray-800 border-r border-gray-50">{r.enhanced_roll_code || r.roll_code}</td>
                      <td className="px-4 py-2 text-gray-600 border-r border-gray-50">{r.color}</td>
                      <td className="px-4 py-2 text-gray-600 border-r border-gray-50">{r.fabric_type}</td>
                      <td className="px-4 py-2 text-right text-gray-500 tabular-nums border-r border-gray-50">{r.weight_sent ? `${parseFloat(r.weight_sent).toFixed(3)} kg` : '—'}</td>
                      <td className="px-4 py-2 text-right font-medium text-gray-700 tabular-nums">{parseFloat(r.current_weight || 0).toFixed(3)} kg</td>
                    </tr>
                  ))}
                  {!isJob && (detail.batch_items || []).map((bi, i) => {
                    const biSt = getStatusStyle(bi.status)
                    return (
                      <tr key={bi.id} className={`border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50/70' : 'bg-white'}`}>
                        <td className="px-4 py-2 text-center text-gray-400 border-r border-gray-50">{i + 1}</td>
                        <td className="px-4 py-2 font-semibold text-gray-800 border-r border-gray-50">{bi.batch?.batch_code || '—'}</td>
                        <td className="px-4 py-2 text-gray-600 border-r border-gray-50">{bi.batch?.size || '—'}</td>
                        <td className="px-4 py-2 text-gray-600 capitalize border-r border-gray-50">{bi.phase || '—'}</td>
                        <td className="px-4 py-2 text-right text-gray-500 tabular-nums border-r border-gray-50">{bi.pieces_sent}</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-700 tabular-nums border-r border-gray-50">{bi.pieces_received ?? '—'}</td>
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
                {/* Dark totals footer */}
                {((isJob && (detail.rolls || []).length > 0) || (!isJob && (detail.batch_items || []).length > 0)) && (
                  <tfoot>
                    <tr className="bg-gray-800 text-white font-semibold text-sm">
                      <td className="py-2 px-4 border-r border-gray-700" colSpan={isJob ? 4 : 4}>Totals</td>
                      {isJob ? (
                        <>
                          <td className="py-2 px-4 text-right border-r border-gray-700 tabular-nums">{(detail.total_weight || 0).toFixed(3)} kg</td>
                          <td className="py-2 px-4 text-right tabular-nums text-emerald-300">
                            {(detail.rolls || []).reduce((s, r) => s + (parseFloat(r.current_weight) || 0), 0).toFixed(3)} kg
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 px-4 text-right border-r border-gray-700 tabular-nums">{detail.total_pieces || 0}</td>
                          <td className="py-2 px-4 text-right tabular-nums text-emerald-300">
                            {(detail.batch_items || []).reduce((s, bi) => s + (bi.pieces_received || 0), 0)}
                          </td>
                          <td className="py-2 px-4"></td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* ── KPI grid ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { value: isJob ? (detail.roll_count || (detail.rolls || []).length) : (detail.total_pieces || 0), label: isJob ? 'Rolls' : 'Pieces', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
                { value: isJob ? `${(detail.total_weight || 0).toFixed(3)}` : (detail.total_cost ? `₹${detail.total_cost}` : '—'), label: isJob ? 'Weight (kg)' : 'Total Cost', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
                { value: detail.value_addition?.short_code || '—', label: detail.value_addition?.name || 'VA Type', color: vc.text, bg: `${vc.bg} ${vc.border}` },
                { value: st.label, label: 'Status', color: st.text, bg: `${st.bg} ${st.border}` },
              ].map((kpi, i) => (
                <div key={i} className={`rounded-lg border ${kpi.bg} px-3 py-2 text-center`}>
                  <div className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{kpi.label}</div>
                </div>
              ))}
            </div>

            {/* Notes */}
            {detail.notes && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Notes</h4>
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { value: kpis.total, label: 'Total', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200' },
          { value: kpis.sent, label: 'Sent', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
          { value: kpis.partial, label: 'Partial', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
          { value: kpis.received, label: 'Received', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
          { value: kpis.totalItems, label: tab === 'job' ? 'Rolls' : 'Pieces', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
        ].map((kpi, i) => (
          <div key={i} className={`rounded-lg border ${kpi.bg} px-3 py-2 text-center`}>
            <div className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{kpi.label}</div>
          </div>
        ))}
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
              <tr className="bg-emerald-600 text-white text-xs font-semibold uppercase tracking-wider">
                <th className="px-4 py-2.5 text-left border-r border-emerald-500">Challan</th>
                <th className="px-4 py-2.5 text-left border-r border-emerald-500">VA Party</th>
                <th className="px-4 py-2.5 text-left border-r border-emerald-500">VA Type</th>
                <th className="px-4 py-2.5 text-center border-r border-emerald-500">{tab === 'job' ? 'Rolls' : 'Pieces'}</th>
                <th className="px-4 py-2.5 text-right border-r border-emerald-500">{tab === 'job' ? 'Weight' : 'Cost'}</th>
                <th className="px-4 py-2.5 text-center border-r border-emerald-500">Sent</th>
                <th className="px-4 py-2.5 text-center border-r border-emerald-500">Status</th>
                <th className="px-4 py-2.5 text-center border-r border-emerald-500">Days</th>
                <th className="px-4 py-2.5 text-right"></th>
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

      {/* ── Receive Modal (Job Challans) ── */}
      <Modal open={recvOpen} onClose={() => setRecvOpen(false)} title="" wide>
        <div className="-mx-6 mb-5 rounded-t-xl bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 text-white">
          <h2 className="text-lg font-bold tracking-tight">Receive Back from VA</h2>
          {recvChallan && (
            <p className="text-sm text-green-100 mt-0.5">{recvChallan.challan_no} · {recvChallan.va_party?.name} · {recvChallan.value_addition?.name}</p>
          )}
        </div>

        {recvError && <div className="mb-4"><ErrorAlert message={recvError} onDismiss={() => setRecvError(null)} /></div>}

        <div className="space-y-4">
          <div className="max-w-xs">
            <label className="typo-label-sm">Received Date <span className="text-red-500">*</span></label>
            <input type="date" value={recvDate} onChange={e => setRecvDate(e.target.value)} className="typo-input-sm" />
          </div>

          {recvChallan && Object.keys(recvRows).length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-emerald-600 text-white text-xs font-semibold uppercase tracking-wider">
                    <th className="py-2 px-3 w-10 border-r border-emerald-500">
                      <input type="checkbox"
                        checked={Object.values(recvRows).every(r => r.checked)}
                        onChange={() => {
                          const allChecked = Object.values(recvRows).every(r => r.checked)
                          setRecvRows(prev => {
                            const next = { ...prev }
                            for (const k of Object.keys(next)) next[k] = { ...next[k], checked: !allChecked }
                            return next
                          })
                        }}
                        className="h-4 w-4 rounded border-white/50 text-emerald-700 cursor-pointer" />
                    </th>
                    <th className="py-2 px-3 text-left border-r border-emerald-500">Roll Code</th>
                    <th className="py-2 px-3 text-right border-r border-emerald-500">Sent Wt</th>
                    <th className="py-2 px-3 text-right border-r border-emerald-500">Weight After *</th>
                    <th className="py-2 px-3 text-right">Cost (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(recvChallan.rolls || []).filter(r => recvRows[r.id]).map((r, i) => {
                    const row = recvRows[r.id]
                    return (
                      <tr key={r.id} className={`border-b border-gray-100 ${i % 2 === 1 ? 'bg-gray-50/70' : 'bg-white'}`}>
                        <td className="px-3 py-2 text-center border-r border-gray-50">
                          <input type="checkbox" checked={row.checked}
                            onChange={() => setRecvRows(prev => ({ ...prev, [r.id]: { ...prev[r.id], checked: !prev[r.id].checked } }))}
                            className="h-4 w-4 rounded border-gray-300 text-emerald-600 cursor-pointer" />
                        </td>
                        <td className="px-3 py-2 font-semibold text-gray-800 border-r border-gray-50">{r.enhanced_roll_code || r.roll_code}</td>
                        <td className="px-3 py-2 text-right text-gray-500 tabular-nums border-r border-gray-50">{parseFloat(r.weight_sent || r.current_weight || 0).toFixed(3)} kg</td>
                        <td className="px-3 py-2 text-right border-r border-gray-50">
                          <input type="number" step="0.001" value={row.weight_after}
                            onChange={e => setRecvRows(prev => ({ ...prev, [r.id]: { ...prev[r.id], weight_after: e.target.value } }))}
                            className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-right tabular-nums focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" step="1" value={row.processing_cost}
                            onChange={e => setRecvRows(prev => ({ ...prev, [r.id]: { ...prev[r.id], processing_cost: e.target.value } }))}
                            placeholder="0"
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm text-right tabular-nums focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {recvChallan && Object.keys(recvRows).length === 0 && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              All rolls in this challan have already been received.
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setRecvOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleReceive} disabled={recvSaving || Object.keys(recvRows).length === 0}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm">
              {recvSaving ? 'Receiving...' : `Receive (${Object.values(recvRows).filter(r => r.checked).length})`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
