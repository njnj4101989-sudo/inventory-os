import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getJobChallans, getJobChallan, getJobChallanByNo, createJobChallan, getNextJCNumber, receiveJobChallan, updateJobChallan, cancelJobChallan } from '../api/jobChallans'
import { getBatchChallans, getBatchChallan, getBatchChallanByNo, updateBatchChallan, cancelBatchChallan } from '../api/batchChallans'
import { getBatches } from '../api/batches'
import { getRolls } from '../api/rolls'
import { getAllValueAdditions, getAllVAParties } from '../api/masters'
import { useScanPair } from '../hooks/useScanPair'
import useQuickMaster from '../hooks/useQuickMaster'
import QuickMasterModal from '../components/common/QuickMasterModal'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import ErrorAlert from '../components/common/ErrorAlert'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Modal from '../components/common/Modal'
import JobChallan from '../components/common/JobChallan'
import BatchChallan from '../components/common/BatchChallan'
import SendForVAModal from '../components/batches/SendForVAModal'
import FilterSelect from '../components/common/FilterSelect'

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
  cancelled: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Cancelled' },
}
const getStatusStyle = (s) => STATUS_STYLES[s] || STATUS_STYLES.sent

const TABS = [
  { key: 'job', label: 'Job Challans', sublabel: 'Rolls' },
  { key: 'batch', label: 'Batch Challans', sublabel: 'Garments' },
]

export default function ChallansPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkHandled = useRef(false)
  const [tab, setTab] = useState(searchParams.get('tab') || 'job')
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

  // Edit modal
  const [editOpen, setEditOpen] = useState(false)
  const [editChallan, setEditChallan] = useState(null)
  const [editForm, setEditForm] = useState({ va_party_id: '', value_addition_id: '', sent_date: '', notes: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState(null)

  // Batch challan create (SendForVAModal)
  const [showSendVA, setShowSendVA] = useState(false)
  const [allBatches, setAllBatches] = useState([])

  // Job challan create
  const [jcCreateMode, setJcCreateMode] = useState(false)
  const [jcRolls, setJcRolls] = useState([]) // all available rolls
  const [jcSelected, setJcSelected] = useState(new Set()) // selected roll IDs
  const [jcWeights, setJcWeights] = useState({}) // {rollId: weightStr}
  const [jcForm, setJcForm] = useState({ value_addition_id: '', va_party_id: '', sent_date: '', notes: '' })
  const [jcSaving, setJcSaving] = useState(false)
  const [jcError, setJcError] = useState(null)
  const [jcNextNo, setJcNextNo] = useState('')
  const [jcRollSearch, setJcRollSearch] = useState('')
  const [jcScanMode, setJcScanMode] = useState(false)
  const [jcScanStatus, setJcScanStatus] = useState(null)
  const jcScanInputRef = useRef(null)

  // Cancel confirmation
  const [cancelConfirm, setCancelConfirm] = useState(null)
  const [cancelSaving, setCancelSaving] = useState(false)

  const handleCancel = async () => {
    if (!cancelConfirm) return
    const challanId = cancelConfirm.id
    setCancelSaving(true)
    try {
      if (tab === 'job') await cancelJobChallan(challanId)
      else await cancelBatchChallan(challanId)
      setCancelConfirm(null)
      // Refresh detail overlay live
      if (detail && detail.id === challanId) {
        try {
          const res = tab === 'job'
            ? await getJobChallan(challanId)
            : await getBatchChallan(challanId)
          setDetail(res.data?.data || res.data)
        } catch { setDetail(null) }
      }
      fetchData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to cancel challan')
      setCancelConfirm(null)
    } finally {
      setCancelSaving(false)
    }
  }

  const openEdit = (challan) => {
    setEditChallan(challan)
    setEditForm({
      va_party_id: challan.va_party?.id || '',
      value_addition_id: challan.value_addition?.id || '',
      sent_date: challan.sent_date || '',
      notes: challan.notes || '',
    })
    setEditError(null)
    setEditOpen(true)
  }

  const handleEdit = async () => {
    if (!editChallan) return
    setEditSaving(true)
    setEditError(null)
    try {
      const payload = {}
      if (editForm.va_party_id && editForm.va_party_id !== editChallan.va_party?.id) payload.va_party_id = editForm.va_party_id
      if (editForm.value_addition_id && editForm.value_addition_id !== editChallan.value_addition?.id) payload.value_addition_id = editForm.value_addition_id
      if (tab === 'job' && editForm.sent_date && editForm.sent_date !== editChallan.sent_date) payload.sent_date = editForm.sent_date
      if (editForm.notes !== (editChallan.notes || '')) payload.notes = editForm.notes

      if (Object.keys(payload).length === 0) {
        setEditOpen(false)
        return
      }

      const res = tab === 'job'
        ? await updateJobChallan(editChallan.id, payload)
        : await updateBatchChallan(editChallan.id, payload)
      const updated = res.data?.data || res.data
      setDetail(updated)
      setEditOpen(false)
      setEditChallan(null)
      fetchData()
    } catch (err) {
      setEditError(err.response?.data?.detail || 'Failed to update challan')
    } finally {
      setEditSaving(false)
    }
  }

  const openReceive = (challan) => {
    const today = new Date().toISOString().split('T')[0]
    const rows = {}
    for (const r of (challan.rolls || [])) {
      // Only include rolls that haven't been received yet
      if (r.processing_status === 'received') continue
      rows[r.id] = {
        checked: true,
        weight_after: String(r.weight_sent || r.current_weight || r.total_weight || ''),
        processing_cost: '',
        weight_damaged: '',
        damage_reason: '',
        processing_id: r.processing_id,
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
      const rollsPayload = toReceive.map(([rollId, row]) => ({
        roll_id: rollId,
        processing_id: row.processing_id,
        weight_after: parseFloat(row.weight_after),
        processing_cost: row.processing_cost ? parseFloat(row.processing_cost) : null,
        weight_damaged: row.weight_damaged ? parseFloat(row.weight_damaged) : null,
        damage_reason: row.damage_reason || null,
      }))
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

  /* ── Deep-link: ?open=JC-xxx&tab=job → auto-open detail ── */
  useEffect(() => {
    if (deepLinkHandled.current) return
    const openNo = searchParams.get('open')
    if (!openNo) return
    deepLinkHandled.current = true

    const isJob = openNo.startsWith('JC-')
    const targetTab = isJob ? 'job' : 'batch'
    setTab(targetTab)

    // Direct lookup by challan_no (unique, indexed — single query)
    const fetchAndOpen = async () => {
      setDetailLoading(true)
      try {
        const res = isJob
          ? await getJobChallanByNo(openNo)
          : await getBatchChallanByNo(openNo)
        const challan = res.data?.data || res.data
        if (challan) {
          setDetail(challan)
        } else {
          setError(`Challan not found: ${openNo}`)
        }
      } catch (err) {
        setError(err.response?.data?.detail || `Challan not found: ${openNo}`)
      } finally {
        setDetailLoading(false)
      }
      // Clean URL params
      setSearchParams({}, { replace: true })
    }
    fetchAndOpen()
  }, [searchParams])

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

  /* ── Open batch challan create — fetch eligible batches ── */
  const openBatchCreate = async () => {
    try {
      const res = await getBatches({ page: 1, page_size: 0, sort_by: 'created_at', sort_order: 'desc' })
      setAllBatches(res.data.data || res.data?.data || [])
    } catch {
      setAllBatches([])
    }
    setShowSendVA(true)
  }

  const handleBatchChallanPrint = (challan) => {
    setPrintChallan(challan)
  }

  /* ── Job Challan Create ── */
  const { quickMasterType, quickMasterOpen, closeQuickMaster, onMasterCreated } = useQuickMaster(
    (type, newItem) => {
      if (type === 'value_addition') {
        getAllValueAdditions().then(r => setVaTypes(r.data?.data || [])).catch(() => {})
        setTimeout(() => setJcForm(f => ({ ...f, value_addition_id: newItem.id })), 200)
      }
      if (type === 'va_party') {
        getAllVAParties().then(r => setVaParties(r.data?.data || [])).catch(() => {})
        setTimeout(() => setJcForm(f => ({ ...f, va_party_id: newItem.id })), 200)
      }
    }
  )

  const openJobCreate = async () => {
    setJcCreateMode(true)
    setJcError(null)
    setJcScanMode(false)
    setJcScanStatus(null)
    setJcSelected(new Set())
    setJcWeights({})
    setJcRollSearch('')
    setJcForm({ value_addition_id: '', va_party_id: '', sent_date: new Date().toISOString().split('T')[0], notes: '' })
    try {
      const [rollRes, nextRes] = await Promise.all([
        getRolls({ page_size: 0, status: 'in_stock' }),
        getNextJCNumber(),
      ])
      const rd = rollRes.data?.data || rollRes.data
      setJcRolls(Array.isArray(rd) ? rd : rd?.data || [])
      setJcNextNo(nextRes.data?.data?.next_challan_no || nextRes.data?.next_challan_no || '')
    } catch {
      setJcRolls([])
      setJcNextNo('')
    }
  }

  const jcToggleRoll = useCallback((roll) => {
    setJcSelected(prev => {
      const next = new Set(prev)
      if (next.has(roll.id)) {
        next.delete(roll.id)
        setJcWeights(w => { const copy = { ...w }; delete copy[roll.id]; return copy })
      } else {
        next.add(roll.id)
        setJcWeights(w => ({ ...w, [roll.id]: String(roll.remaining_weight || roll.current_weight || roll.total_weight || '') }))
      }
      return next
    })
  }, [])

  const jcFilteredRolls = useMemo(() => {
    if (!jcRollSearch.trim()) return jcRolls
    const q = jcRollSearch.toLowerCase()
    return jcRolls.filter(r =>
      (r.roll_code || '').toLowerCase().includes(q) ||
      (r.fabric_type || '').toLowerCase().includes(q) ||
      (r.color?.name || r.color || '').toLowerCase().includes(q)
    )
  }, [jcRolls, jcRollSearch])

  /* ── Phone scan → auto-select roll ── */
  const jcSelectedRef = useRef(jcSelected)
  jcSelectedRef.current = jcSelected

  const handleJcPhoneScan = useCallback((rawValue, source = 'phone') => {
    const rollMatch = rawValue.match(/\/scan\/roll\/([^/?\s]+)/)
    const code = rollMatch ? decodeURIComponent(rollMatch[1]) : rawValue.trim()
    if (!code) return

    const roll = jcRolls.find(r => r.roll_code === code)
    if (!roll) {
      setJcScanStatus({ type: 'error', message: `Roll not found or not in stock: ${code}` })
      setTimeout(() => setJcScanStatus(null), 4000)
      return
    }
    if (jcSelectedRef.current.has(roll.id)) {
      setJcScanStatus({ type: 'duplicate', message: `${code} already selected` })
      setTimeout(() => setJcScanStatus(null), 3000)
      return
    }
    jcToggleRoll(roll)
    setJcScanStatus({ type: 'added', message: `${code} added${source === 'phone' ? ' via phone' : ''}` })
    setTimeout(() => setJcScanStatus(null), 2500)
  }, [jcRolls, jcToggleRoll])

  const { phoneConnected: jcPhoneConnected } = useScanPair({
    role: 'desktop',
    enabled: jcCreateMode && jcScanMode,
    onScan: useCallback((data) => {
      if (data.code) handleJcPhoneScan(data.code, 'phone')
    }, [handleJcPhoneScan]),
  })

  const handleJcPOSSubmit = useCallback((code) => {
    if (!code.trim()) return
    handleJcPhoneScan(code.trim(), 'type')
    setTimeout(() => {
      const input = jcScanInputRef.current?.querySelector('input')
      if (input) { input.focus(); input.value = '' }
    }, 50)
  }, [handleJcPhoneScan])

  const jcRollSearchOptions = useMemo(() => {
    return jcRolls.map(r => ({
      value: r.roll_code,
      label: `${r.roll_code} · ${r.fabric_type || ''} · ${r.color?.name || r.color || ''} · ${r.remaining_weight || r.current_weight || '?'} kg`,
    }))
  }, [jcRolls])

  const handleJobCreate = async () => {
    if (!jcForm.value_addition_id) { setJcError('Select a value addition type'); return }
    if (!jcForm.va_party_id) { setJcError('Select a VA party'); return }
    if (jcSelected.size === 0) { setJcError('Select at least one roll'); return }

    const rolls = [...jcSelected].map(id => ({
      roll_id: id,
      weight_to_send: parseFloat(jcWeights[id]) || 0,
    }))
    const zeroWeight = rolls.find(r => r.weight_to_send <= 0)
    if (zeroWeight) { setJcError('All selected rolls must have send weight > 0'); return }

    setJcSaving(true)
    setJcError(null)
    try {
      const vaObj = vaTypes.find(v => v.id === jcForm.value_addition_id)
      const rollObjs = jcRolls.filter(r => jcSelected.has(r.id))
      const res = await createJobChallan({
        value_addition_id: jcForm.value_addition_id,
        va_party_id: jcForm.va_party_id,
        sent_date: jcForm.sent_date,
        notes: jcForm.notes?.trim() || null,
        rolls,
        _rolls: rollObjs,
        _vaObj: vaObj || null,
      })
      const challan = res.data?.data || res.data
      setJcCreateMode(false)
      setPrintChallan(challan)
      fetchData()
    } catch (err) {
      setJcError(err.response?.data?.detail || 'Failed to create job challan — check roll availability')
    } finally {
      setJcSaving(false)
    }
  }

  /* ── Escape key for job create ── */
  useEffect(() => {
    if (!jcCreateMode) return
    const handler = (e) => {
      if (e.key !== 'Escape') return
      if (quickMasterOpen) return
      e.preventDefault()
      if (jcScanMode) { setJcScanMode(false); setJcScanStatus(null); return }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [jcCreateMode, jcScanMode, quickMasterOpen])

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

    return (<>
      <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
        {/* ── Gradient header ── */}
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setDetail(null)} className="rounded-lg p-1.5 hover:bg-white/20 transition-colors">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h2 className="typo-modal-title text-white font-mono">{detail.challan_no}</h2>
              <p className="typo-caption text-emerald-100">
                {detail.va_party?.name || '—'} · {detail.value_addition?.name || '—'}
                {detail.sent_date && ` · Sent: ${detail.sent_date}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 typo-badge ${detail.status === 'received' ? 'bg-green-500/30 text-white' : detail.status === 'partially_received' ? 'bg-amber-300/30 text-white' : 'bg-white/20 text-white'}`}>
              {st.label}
            </span>
            {detail.status === 'sent' && (
              <button onClick={() => setCancelConfirm(detail)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/80 px-3 py-1.5 typo-btn-sm text-white hover:bg-red-600 transition-colors">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                Cancel
              </button>
            )}
            {!['received', 'cancelled'].includes(detail.status) && (
              <button onClick={() => openEdit(detail)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Edit
              </button>
            )}
            {isJob && !['received', 'cancelled'].includes(detail.status) && (
              <button onClick={() => openReceive(detail)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 typo-btn-sm text-emerald-700 hover:bg-emerald-50 transition-colors">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Receive Back
              </button>
            )}
            <button onClick={() => openPrint(detail)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print
            </button>
            <button onClick={() => setDetail(null)}
              className="rounded-lg border border-white/30 px-3 py-1.5 typo-btn-sm hover:bg-white/20 transition-colors">Close</button>
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
                  <label className="typo-label-sm">Challan</label>
                  <div className="typo-data font-mono">{detail.challan_no}</div>
                </div>
                <div className="px-4 py-2 border-r border-gray-200">
                  <label className="typo-label-sm">VA Party</label>
                  <div className="typo-data">{detail.va_party?.name || '—'}</div>
                </div>
                <div className="px-4 py-2 border-r border-gray-200">
                  <label className="typo-label-sm">VA Type</label>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`rounded-full px-2 py-0.5 typo-badge ${vc.bg} ${vc.text}`}>{detail.value_addition?.short_code || '—'}</span>
                    <span className="typo-td-secondary">{detail.value_addition?.name}</span>
                  </div>
                </div>
                <div className="px-4 py-2 border-r border-gray-200">
                  <label className="typo-label-sm">Sent</label>
                  <div className="typo-td">{detail.sent_date || '—'}</div>
                </div>
                {detail.received_date && (
                  <div className="px-4 py-2 border-r border-gray-200">
                    <label className="typo-label-sm">Received</label>
                    <div className="typo-data text-green-700">{detail.received_date}</div>
                  </div>
                )}
                <div className="ml-auto px-4 py-2">
                  <label className="typo-label-sm">Created By</label>
                  <div className="typo-td">{detail.created_by_user?.full_name || '—'}</div>
                </div>
              </div>
            </div>

            {/* ── Items table — emerald header ── */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-emerald-600 text-white typo-th">
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
                        <th className="py-2 px-4 text-right border-r border-emerald-500">Damaged</th>
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
                        <td className="px-4 py-2 text-right border-r border-gray-50">
                          {(bi.pieces_damaged || 0) > 0
                            ? <span className="text-red-600 font-semibold" title={bi.damage_reason || ''}>{bi.pieces_damaged}</span>
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                        <td className="px-4 py-2">
                          <span className={`rounded-full px-2 py-0.5 typo-badge border ${biSt.bg} ${biSt.text} ${biSt.border}`}>
                            {biSt.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {((isJob && !(detail.rolls || []).length) || (!isJob && !(detail.batch_items || []).length)) && (
                    <tr><td colSpan={isJob ? 6 : 8} className="px-4 py-8 text-center text-gray-400">No items</td></tr>
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
                { value: isJob ? `${(detail.total_weight || 0).toFixed(3)}` : `₹${Number(detail.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, label: isJob ? 'Weight (kg)' : 'Total Amount', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
                { value: detail.value_addition?.short_code || '—', label: detail.value_addition?.name || 'VA Type', color: vc.text, bg: `${vc.bg} ${vc.border}` },
                { value: st.label, label: 'Status', color: st.text, bg: `${st.bg} ${st.border}` },
              ].map((kpi, i) => (
                <div key={i} className={`rounded-lg border ${kpi.bg} px-3 py-2 text-center`}>
                  <div className={`typo-kpi ${kpi.color}`}>{kpi.value}</div>
                  <div className="typo-kpi-label">{kpi.label}</div>
                </div>
              ))}
            </div>

            {/* S121 — Totals stack card (visible after receive when subtotal locks) */}
            {Number(detail.subtotal || 0) > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 rounded-t-xl">
                  <span className="typo-label-sm text-white uppercase tracking-wider">Totals</span>
                </div>
                <div className="p-4">
                  <div className="ml-auto max-w-md space-y-1.5">
                    <div className="flex items-center justify-between typo-data text-gray-700">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{`₹${Number(detail.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
                    </div>
                    {Number(detail.discount_amount || 0) > 0 && (
                      <div className="flex items-center justify-between typo-data text-rose-600">
                        <span>(−) Discount</span>
                        <span className="tabular-nums">{`₹${Number(detail.discount_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
                      </div>
                    )}
                    {Number(detail.additional_amount || 0) > 0 && (
                      <div className="flex items-center justify-between typo-data text-gray-700">
                        <span>(+) Additional</span>
                        <span className="tabular-nums">{`₹${Number(detail.additional_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
                      </div>
                    )}
                    {(Number(detail.discount_amount || 0) > 0 || Number(detail.additional_amount || 0) > 0) && (
                      <div className="flex items-center justify-between typo-data text-gray-800 border-t border-gray-200 pt-1.5">
                        <span>Taxable Value</span>
                        <span className="tabular-nums">{`₹${Number(detail.taxable_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
                      </div>
                    )}
                    {Number(detail.tax_amount || 0) > 0 && (
                      <div className="flex items-center justify-between typo-data text-gray-700">
                        <span>GST @ {Number(detail.gst_percent || 0).toFixed(2)}%</span>
                        <span className="tabular-nums">{`₹${Number(detail.tax_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between typo-data font-bold text-emerald-700 border-t-2 border-gray-300 pt-2 mt-1">
                      <span>Total Amount</span>
                      <span className="tabular-nums">{`₹${Number(detail.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            {detail.notes && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h4 className="typo-label-sm">Notes</h4>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{detail.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Cancel Confirmation Modal ── */}
      <Modal open={!!cancelConfirm} onClose={() => !cancelSaving && setCancelConfirm(null)} title="Cancel Challan?">
        <p className="typo-body text-gray-600 mb-4">
          Are you sure you want to cancel <strong className="text-gray-900">{cancelConfirm?.challan_no}</strong>?
          {tab === 'job' && ' This will restore the sent weight back to all rolls.'}
          {' '}This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setCancelConfirm(null)} disabled={cancelSaving}
            className="rounded-lg border border-gray-300 px-4 py-2 typo-btn-sm text-gray-700 hover:bg-gray-50">No, Keep It</button>
          <button onClick={handleCancel} disabled={cancelSaving}
            className="rounded-lg bg-red-600 px-4 py-2 typo-btn-sm text-white hover:bg-red-700 disabled:opacity-50">
            {cancelSaving ? 'Cancelling...' : 'Yes, Cancel Challan'}
          </button>
        </div>
      </Modal>

      {/* ── Edit Modal (Job + Batch Challans) ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="">
        <div className="-mx-6 mb-5 rounded-t-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 text-white">
          <h2 className="typo-modal-title text-white">Edit Challan</h2>
          {editChallan && (
            <p className="typo-caption text-emerald-100 mt-0.5">{editChallan.challan_no} · {editChallan.va_party?.name} · {editChallan.value_addition?.name}</p>
          )}
        </div>

        {editError && <div className="mb-4"><ErrorAlert message={editError} onDismiss={() => setEditError(null)} /></div>}

        <div className="space-y-4">
          <div>
            <label className="typo-label">VA Party</label>
            <FilterSelect full value={editForm.va_party_id} onChange={v => setEditForm(f => ({ ...f, va_party_id: v }))}
              options={[{ value: '', label: 'Select VA Party' }, ...vaParties.map(p => ({ value: p.id, label: `${p.name}${p.city ? ` — ${p.city}` : ''}` }))]} />
          </div>
          <div>
            <label className="typo-label">VA Type</label>
            <FilterSelect full value={editForm.value_addition_id} onChange={v => setEditForm(f => ({ ...f, value_addition_id: v }))}
              options={[{ value: '', label: 'Select VA Type' }, ...vaTypes.map(v => ({ value: v.id, label: `${v.name} (${v.short_code})` }))]} />
          </div>
          {tab === 'job' && (
            <div>
              <label className="typo-label">Sent Date</label>
              <input type="date" value={editForm.sent_date} onChange={e => setEditForm(f => ({ ...f, sent_date: e.target.value }))} className="typo-input" />
            </div>
          )}
          <div>
            <label className="typo-label">Notes</label>
            <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
              rows={3} className="typo-input" placeholder="Optional notes..." />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setEditOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 typo-btn-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleEdit} disabled={editSaving}
              className="rounded-lg bg-emerald-600 px-5 py-2 typo-btn-sm text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm">
              {editSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Receive Modal (Job Challans) ── */}
      <Modal open={recvOpen} onClose={() => setRecvOpen(false)} title="" wide>
        <div className="-mx-6 mb-5 rounded-t-xl bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 text-white">
          <h2 className="typo-modal-title text-white">Receive Back from VA</h2>
          {recvChallan && (
            <p className="typo-caption text-green-100 mt-0.5">{recvChallan.challan_no} · {recvChallan.va_party?.name} · {recvChallan.value_addition?.name}</p>
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
                  <tr className="bg-emerald-600 text-white typo-th">
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
                    <th className="py-2 px-3 text-right border-r border-emerald-500">Damaged</th>
                    <th className="py-2 px-3 text-left border-r border-emerald-500">Reason</th>
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
                            className="w-28 typo-input-sm text-right tabular-nums !w-28" />
                        </td>
                        <td className="px-3 py-2 text-right border-r border-gray-50">
                          <input type="number" step="0.001" value={row.weight_damaged}
                            onChange={e => setRecvRows(prev => ({ ...prev, [r.id]: { ...prev[r.id], weight_damaged: e.target.value } }))}
                            placeholder="0"
                            className="w-20 typo-input-sm text-right tabular-nums !w-20" />
                        </td>
                        <td className="px-3 py-2 border-r border-gray-50">
                          <select value={row.damage_reason}
                            onChange={e => setRecvRows(prev => ({ ...prev, [r.id]: { ...prev[r.id], damage_reason: e.target.value } }))}
                            className="typo-input-sm w-full !w-28">
                            <option value="">—</option>
                            <option value="shrinkage">Shrinkage</option>
                            <option value="color_bleeding">Color Bleeding</option>
                            <option value="stain">Stain</option>
                            <option value="tear">Tear</option>
                            <option value="wrong_process">Wrong Process</option>
                            <option value="lost">Lost</option>
                            <option value="other">Other</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" step="1" value={row.processing_cost}
                            onChange={e => setRecvRows(prev => ({ ...prev, [r.id]: { ...prev[r.id], processing_cost: e.target.value } }))}
                            placeholder="0"
                            className="w-24 typo-input-sm text-right tabular-nums !w-24" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {recvChallan && Object.keys(recvRows).length === 0 && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 typo-body text-green-700">
              All rolls in this challan have already been received.
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setRecvOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 typo-btn-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleReceive} disabled={recvSaving || Object.keys(recvRows).length === 0}
              className="rounded-lg bg-emerald-600 px-5 py-2 typo-btn-sm text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm">
              {recvSaving ? 'Receiving...' : `Receive (${Object.values(recvRows).filter(r => r.checked).length})`}
            </button>
          </div>
        </div>
      </Modal>
    </>)
  }

  // ── Job Challan Create Overlay ──
  if (jcCreateMode) {
    const vaRollOptions = vaTypes.filter(v => v.is_active && (v.applicable_to || 'both') !== 'garment')
    const selectedRollObjs = jcRolls.filter(r => jcSelected.has(r.id))
    const totalWeight = selectedRollObjs.reduce((s, r) => s + (parseFloat(jcWeights[r.id]) || 0), 0)

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setJcCreateMode(false)} className="rounded-lg p-1.5 hover:bg-white/20 transition-colors">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h2 className="text-lg font-bold tracking-tight">New Job Challan</h2>
              <p className="text-xs text-emerald-100">{jcNextNo ? `Next: ${jcNextNo}` : 'Send rolls for VA processing'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">{jcSelected.size} rolls · {totalWeight.toFixed(2)} kg</span>
            <button onClick={() => setJcCreateMode(false)} className="rounded-lg border border-white/30 px-3 py-1.5 text-sm hover:bg-white/20 transition-colors">Cancel</button>
            <button onClick={handleJobCreate} disabled={jcSaving}
              className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors">
              {jcSaving ? 'Creating...' : 'Create Job Challan'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {jcError && <ErrorAlert message={jcError} onDismiss={() => setJcError(null)} />}

          {/* Challan Details card */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 bg-gray-50 rounded-t-xl px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Challan Details</span>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="typo-label-sm">VA TYPE *</label>
                <FilterSelect full data-master="value_addition" value={jcForm.value_addition_id}
                  onChange={v => setJcForm(f => ({ ...f, value_addition_id: v }))}
                  options={[{ value: '', label: 'Select VA type' }, ...vaRollOptions.map(v => ({ value: v.id, label: `${v.name} (${v.short_code})` }))]} />
              </div>
              <div>
                <label className="typo-label-sm">VA PARTY *</label>
                <FilterSelect searchable full data-master="va_party" value={jcForm.va_party_id}
                  onChange={v => setJcForm(f => ({ ...f, va_party_id: v }))}
                  options={[{ value: '', label: 'Select VA party' }, ...vaParties.map(p => ({ value: p.id, label: p.name }))]} />
              </div>
              <div>
                <label className="typo-label-sm">SENT DATE *</label>
                <input type="date" className="typo-input" value={jcForm.sent_date}
                  onChange={e => setJcForm(f => ({ ...f, sent_date: e.target.value }))} />
              </div>
              <div>
                <label className="typo-label-sm">NOTES</label>
                <input className="typo-input" value={jcForm.notes}
                  onChange={e => setJcForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
          </div>

          {/* Roll Selection card */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 rounded-t-xl px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Select Rolls ({jcSelected.size} selected)</span>
              <div className="flex items-center gap-2">
                <button onClick={() => { setJcScanMode(m => !m); setJcScanStatus(null) }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 typo-btn-sm shadow-sm transition-colors ${jcScanMode ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-emerald-600 text-emerald-700 hover:bg-emerald-50'}`}>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  {jcScanMode ? 'Scanning Active' : 'Scan from Phone'}
                </button>
              </div>
            </div>

            {/* POS Scan Bar */}
            {jcScanMode && (
              <div className="border-b border-gray-200 bg-emerald-50/50 px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative" ref={jcScanInputRef}>
                    <FilterSelect searchable autoFocus full value=""
                      onChange={(code) => { if (code) handleJcPOSSubmit(code) }}
                      options={[{ value: '', label: 'Type or scan roll code...' }, ...jcRollSearchOptions]} />
                  </div>
                  <button onClick={() => { setJcScanMode(false); setJcScanStatus(null) }}
                    className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="flex items-center gap-2 min-h-[20px]">
                  {jcScanStatus ? (
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      jcScanStatus.type === 'added' ? 'text-emerald-600' : jcScanStatus.type === 'duplicate' ? 'text-amber-600' : 'text-red-500'
                    }`}>
                      {jcScanStatus.type === 'added' && <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                      {jcScanStatus.type === 'duplicate' && <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                      {jcScanStatus.type === 'error' && <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                      {jcScanStatus.message}
                    </span>
                  ) : jcPhoneConnected ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <span className="relative flex h-2 w-2"><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
                      Phone connected — ready to scan
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                      </span>
                      Phone not connected — open Gun mode on phone
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Roll search filter */}
            <div className="px-4 py-2 border-b border-gray-100">
              <input className="typo-input-sm w-full" placeholder="Filter rolls by code, fabric, or color..."
                value={jcRollSearch} onChange={e => setJcRollSearch(e.target.value)} />
            </div>

            {/* Roll list */}
            <div className="max-h-[45vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-emerald-600">
                    <th className="px-2 py-2 text-xs font-semibold text-white uppercase tracking-wider w-[4%] border-r border-emerald-500"></th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider border-r border-emerald-500">Roll Code</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider w-[15%] border-r border-emerald-500">Fabric</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-white uppercase tracking-wider w-[15%] border-r border-emerald-500">Color</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider w-[12%] border-r border-emerald-500">Available</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-white uppercase tracking-wider w-[15%]">Send Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {jcFilteredRolls.map(r => {
                    const selected = jcSelected.has(r.id)
                    const availWt = r.remaining_weight || r.current_weight || r.total_weight || 0
                    return (
                      <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${selected ? 'bg-emerald-50' : ''}`}>
                        <td className="px-2 py-2 text-center">
                          <input type="checkbox" checked={selected} onChange={() => jcToggleRoll(r)} />
                        </td>
                        <td className="px-2 py-2 font-semibold">{r.roll_code}</td>
                        <td className="px-2 py-2 text-gray-600">{r.fabric_type || '—'}</td>
                        <td className="px-2 py-2 text-gray-600">{r.color?.name || r.color || '—'}</td>
                        <td className="px-2 py-2 text-right text-gray-600">{parseFloat(availWt).toFixed(2)} kg</td>
                        <td className="px-2 py-2">
                          {selected ? (
                            <input type="number" step="0.001" min="0.001" max={availWt}
                              className="typo-input-sm w-full text-right"
                              value={jcWeights[r.id] || ''}
                              onChange={e => setJcWeights(w => ({ ...w, [r.id]: e.target.value }))} />
                          ) : (
                            <span className="text-gray-300 text-right block">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {jcFilteredRolls.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No in-stock rolls found{jcRollSearch ? ' matching filter' : ''}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <QuickMasterModal type={quickMasterType} open={quickMasterOpen} onClose={closeQuickMaster} onCreated={onMasterCreated} />
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
          <p className="mt-1 typo-caption">VA processing history — Job Challans (rolls) & Batch Challans (garments)</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 typo-btn-sm text-gray-700 hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-60">
            <svg className={`h-4 w-4 transition-transform ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Refresh
          </button>
          {tab === 'job' && (
            <button onClick={openJobCreate} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 typo-btn-sm text-white hover:bg-emerald-700 shadow-sm transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              New Job Challan
            </button>
          )}
          {tab === 'batch' && (
            <button onClick={openBatchCreate} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 typo-btn-sm text-white hover:bg-emerald-700 shadow-sm transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              New Batch Challan
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 pb-2.5 typo-tab border-b-2 transition-colors ${
              tab === t.key
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label} <span className="typo-caption ml-0.5">({t.sublabel})</span>
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
            <div className={`typo-kpi ${kpi.color}`}>{kpi.value}</div>
            <div className="typo-kpi-label">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search challan no, party, VA type..." />
        </div>
        <FilterSelect value={statusFilter} onChange={setStatusFilter}
          options={[{ value: '', label: 'All Status' }, { value: 'sent', label: 'Sent' }, { value: 'partially_received', label: 'Partially Received' }, { value: 'received', label: 'Received' }]} />
        <FilterSelect value={vaFilter} onChange={setVaFilter}
          options={[{ value: '', label: 'All VA Types' }, ...vaTypes.map(v => ({ value: v.id, label: `${v.name} (${v.short_code})` }))]} />
        <FilterSelect value={partyFilter} onChange={setPartyFilter}
          options={[{ value: '', label: 'All VA Parties' }, ...vaParties.map(p => ({ value: p.id, label: p.name }))]} />
        {(statusFilter || vaFilter || partyFilter) && (
          <button onClick={() => { setStatusFilter(''); setVaFilter(''); setPartyFilter('') }}
            className="typo-caption hover:text-gray-700 underline">Clear</button>
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
              <tr className="bg-emerald-600 text-white typo-th">
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
                      <div className="typo-data font-mono">{c.challan_no}</div>
                      <div className="typo-caption mt-0.5">{c.created_by_user?.full_name || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{c.va_party?.name || '—'}</div>
                      {c.va_party?.city && <div className="typo-caption">{c.va_party.city}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 typo-badge ${vc.bg} ${vc.text}`}>
                        {c.value_addition?.short_code || '?'} — {c.value_addition?.name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-900">
                      {isJob ? (c.roll_count || 0) : (c.total_pieces || 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-700">
                      {isJob ? `${(c.total_weight || 0).toFixed(1)} kg` : (Number(c.total_amount || 0) > 0 ? `₹${Number(c.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—')}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{c.sent_date || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-full px-2.5 py-0.5 typo-badge border ${st.bg} ${st.text} ${st.border}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {daysOut !== null && daysOut > 0 ? (
                        <span className={`typo-badge rounded-full px-2 py-0.5 ${
                          daysOut > 14 ? 'text-red-600 bg-red-50 border border-red-200' :
                          daysOut > 7 ? 'text-amber-600 bg-amber-50 border border-amber-200' :
                          'text-gray-500 bg-gray-50 border border-gray-200'
                        }`}>{daysOut}d</span>
                      ) : c.status === 'received' ? (
                        <span className="typo-badge text-green-600">✓</span>
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

      {/* Batch Challan Create Modal */}
      <SendForVAModal
        open={showSendVA}
        onClose={() => setShowSendVA(false)}
        batches={allBatches}
        onSuccess={() => { setShowSendVA(false); fetchData() }}
        onPrintChallan={handleBatchChallanPrint}
      />

      {/* Challan Print Overlay */}
      {printChallan && tab === 'batch' && (
        <BatchChallan challan={printChallan} onClose={() => setPrintChallan(null)} />
      )}
      {printChallan && tab === 'job' && (
        <JobChallan challan={printChallan} onClose={() => setPrintChallan(null)} />
      )}

    </div>
  )
}
