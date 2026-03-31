import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getLots, getLot, createLot, updateLot } from '../api/lots'
import { distributeLot } from '../api/batches'
import { getRolls } from '../api/rolls'
import { getAllProductTypes, getAllDesigns } from '../api/masters'
import { colorHex, loadColorMap } from '../utils/colorUtils'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import FilterSelect from '../components/common/FilterSelect'
import ErrorAlert from '../components/common/ErrorAlert'
import CuttingSheet from '../components/common/CuttingSheet'
import BatchLabelSheet from '../components/common/BatchLabelSheet'
import useQuickMaster from '../hooks/useQuickMaster'
import QuickMasterModal from '../components/common/QuickMasterModal'

// Typography: use typo-input and typo-label globally
const DEFAULT_SIZE_PATTERN = { S: 0, M: 0, L: 0, XL: 0, XXL: 0, '3XL': 0, '4XL': 0 }

const LOT_STATUS_FLOW = ['open', 'cutting', 'distributed']
const LOT_STATUS_COLORS = {
  open: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Open' },
  cutting: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Cutting' },
  distributed: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Distributed' },
}

function canTransitionTo(current, target) {
  const ci = LOT_STATUS_FLOW.indexOf(current)
  const ti = LOT_STATUS_FLOW.indexOf(target)
  return ti > ci
}

const VA_COLORS = {
  EMB: { bg: 'bg-purple-100', text: 'text-purple-700' },
  DYE: { bg: 'bg-amber-100', text: 'text-amber-700' },
  DPT: { bg: 'bg-sky-100', text: 'text-sky-700' },
  HWK: { bg: 'bg-rose-100', text: 'text-rose-700' },
  SQN: { bg: 'bg-pink-100', text: 'text-pink-700' },
  BTC: { bg: 'bg-teal-100', text: 'text-teal-700' },
}
const DEFAULT_VA = { bg: 'bg-gray-100', text: 'text-gray-700' }

function RollCodeDisplay({ roll }) {
  if (!roll) return <span className="text-gray-400">—</span>
  const base = roll.roll_code || ''
  const enhanced = roll.enhanced_roll_code || base
  if (enhanced === base) return <span className="font-semibold text-gray-700">{base}</span>
  const codes = enhanced.slice(base.length).split('+').filter(Boolean)
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className="font-semibold text-gray-700">{base}</span>
      {codes.map(code => {
        const c = VA_COLORS[code] || DEFAULT_VA
        return <span key={code} className={`rounded px-1 py-0.5 typo-badge leading-none ${c.bg} ${c.text}`}>+{code}</span>
      })}
    </span>
  )
}

function hasVA(roll) {
  return roll && (
    (roll.enhanced_roll_code && roll.enhanced_roll_code !== roll.roll_code) ||
    (roll.processing_logs || []).some(l => l.status === 'received')
  )
}

const COLUMNS = [
  { key: 'lot_code', label: 'Lot Code', render: (v) => <span className="font-semibold text-emerald-700">{v}</span> },
  { key: 'designs', label: 'Design(s)', render: (v) => (v || []).map(d => d.design_no).join(', ') || '—' },
  {
    key: 'lot_rolls', label: 'Colors',
    render: (v) => [...new Set((v || []).map(r => r.color).filter(Boolean))].length,
  },
  { key: 'total_pallas', label: 'Pallas', render: (v) => <span className="font-medium">{v}</span> },
  { key: 'total_pieces', label: 'Pieces', render: (v) => <span className="font-semibold text-emerald-700">{v}</span> },
  { key: 'total_weight', label: 'Weight', render: (v, row) => `${parseFloat(v || 0).toFixed(2)} ${row.unit === 'meters' ? 'm' : 'kg'}` },
  {
    key: 'status', label: 'Status',
    render: (v) => {
      const s = LOT_STATUS_COLORS[v]
      return s ? <span className={`rounded-full px-2 py-0.5 typo-badge ${s.bg} ${s.text}`}>{s.label}</span> : <StatusBadge status={v} />
    },
  },
  { key: 'lot_date', label: 'Date', render: (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—' },
]

export default function LotsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const pendingPreselect = useRef(null)
  const [preselectedBanner, setPreselectedBanner] = useState(0)

  // ── List state ──
  const [lots, setLots] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')

  // ── Detail overlay state ──
  const [detailLot, setDetailLot] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState(null)
  const [showCuttingSheet, setShowCuttingSheet] = useState(false)
  const [distributing, setDistributing] = useState(false)
  const [showBatchLabels, setShowBatchLabels] = useState(null) // { batches, lotCode, designNo, lotDate }

  // ── Create overlay state ──
  const [showCreate, setShowCreate] = useState(false)
  const [availableRolls, setAvailableRolls] = useState([])
  const [rollSearch, setRollSearch] = useState('')
  const [rollsExpanded, setRollsExpanded] = useState(false)
  const [rollFilterStatus, setRollFilterStatus] = useState('all')
  const [rollFilterFabric, setRollFilterFabric] = useState('')
  const [rollFilterColor, setRollFilterColor] = useState('')
  const [rollFilterSupplier, setRollFilterSupplier] = useState('')
  const [rollFilterUnit, setRollFilterUnit] = useState('')
  const [rollFilterVA, setRollFilterVA] = useState('')
  const [rollGroupBy, setRollGroupBy] = useState('sr_no')
  const [form, setForm] = useState({
    lot_date: new Date().toISOString().split('T')[0],
    product_type: 'FBL',
    standard_palla_weight: '', standard_palla_meter: '',
    designs: [{ design_no: '', design_id: null, size_pattern: { ...DEFAULT_SIZE_PATTERN } }],
    rolls: [], notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [pendingDeleteRow, setPendingDeleteRow] = useState(null) // index of row awaiting delete confirmation
  const designRef = useRef(null)
  const saveRef = useRef(null)
  const pallaDebounce = useRef(null)
  const [masterProductTypes, setMasterProductTypes] = useState([])
  const [masterDesigns, setMasterDesigns] = useState([])
  // Derive palla mode from selected product type
  const pallaMode = useMemo(() => {
    const pt = masterProductTypes.find(p => p.code === form.product_type)
    return pt?.palla_mode || 'both'
  }, [form.product_type, masterProductTypes])

  // ── Shift+M Quick Master ──
  const refreshProductTypes = useCallback(() => {
    const PT_ORDER = { FBL: 0, SBL: 1, LHG: 2, SAR: 3 }
    getAllProductTypes().then((res) => {
      const sorted = [...(res.data.data || [])].sort((a, b) => (PT_ORDER[a.code] ?? 99) - (PT_ORDER[b.code] ?? 99))
      setMasterProductTypes(sorted)
    }).catch(() => {})
  }, [])

  const refreshDesigns = useCallback(() => {
    getAllDesigns().then(res => setMasterDesigns(res.data.data || [])).catch(() => {})
  }, [])

  const handleQuickMasterCreated = useCallback((masterType, newItem) => {
    if (masterType === 'product_type' && newItem?.code) {
      refreshProductTypes()
      setTimeout(() => setField('product_type', newItem.code), 200)
    }
    if (masterType === 'design' && newItem?.id) {
      refreshDesigns()
    }
  }, [refreshProductTypes, refreshDesigns])

  const { quickMasterType, quickMasterOpen, closeQuickMaster, onMasterCreated } = useQuickMaster(handleQuickMasterCreated)

  // ══════════════════════════════════════
  // DATA FETCHING
  // ══════════════════════════════════════

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const p = { page, page_size: 20 }
      if (statusFilter) p.status = statusFilter
      const res = await getLots(p)
      setLots(res.data.data); setTotal(res.data.total); setPages(res.data.pages)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load lots')
    } finally { setLoading(false) }
  }, [page, statusFilter])

  useEffect(() => { loadColorMap(); refreshProductTypes(); refreshDesigns() }, [refreshProductTypes, refreshDesigns])
  useEffect(() => { fetchData() }, [fetchData])

  const fetchRolls = useCallback(async () => {
    try {
      // Fetch both in_stock and remnant rolls for the picker
      const [stockRes, remnantRes] = await Promise.all([
        getRolls({ status: 'in_stock', page_size: 500 }),
        getRolls({ status: 'remnant', page_size: 500 }),
      ])
      const stockArr = Array.isArray(stockRes.data.data) ? stockRes.data.data : []
      const remnantArr = Array.isArray(remnantRes.data.data) ? remnantRes.data.data : []
      const combined = [...stockArr, ...remnantArr]
      setAvailableRolls(combined.filter(r => parseFloat(r.remaining_weight) > 0))
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    if (showCreate) {
      fetchRolls()
    }
  }, [showCreate, fetchRolls])

  // ── Preselected rolls from navigation (Invoice→Lot shortcut) ──
  useEffect(() => {
    const pre = location.state?.preselectedRolls
    if (pre && Array.isArray(pre) && pre.length > 0) {
      pendingPreselect.current = pre
      navigate('/lots', { replace: true, state: {} })
      setFormError(null); setRollSearch('')
      setRollFilterStatus('all'); setRollFilterFabric(''); setRollFilterColor(''); setRollFilterSupplier(''); setRollFilterUnit(''); setRollFilterVA(''); setRollGroupBy('sr_no')
      setForm({ lot_date: new Date().toISOString().split('T')[0], product_type: masterProductTypes[0]?.code || 'FBL', standard_palla_weight: '', standard_palla_meter: '', designs: [{ design_no: '', design_id: null, size_pattern: { ...DEFAULT_SIZE_PATTERN } }], rolls: [], notes: '' })
      setShowCreate(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pendingPreselect.current && availableRolls.length > 0) {
      const ids = pendingPreselect.current
      pendingPreselect.current = null
      const matchedIds = ids.filter(id => availableRolls.some(r => r.id === id))
      if (matchedIds.length > 0) {
        setForm(f => ({
          ...f,
          rolls: matchedIds.map(id => ({ roll_id: id, palla_weight: getPallaForRoll(id, f) }))
        }))
        setPreselectedBanner(matchedIds.length)
        setRollsExpanded(true)
        setTimeout(() => setPreselectedBanner(0), 5000)
      }
    }
  }, [availableRolls])

  // ══════════════════════════════════════
  // CREATE OVERLAY — Calculations & Filters
  // ══════════════════════════════════════

  const piecesPerPalla = (form.designs || []).reduce((total, d) => total + Object.values(d.size_pattern || {}).reduce((s, v) => s + (parseInt(v) || 0), 0), 0)

  const rollCalcs = form.rolls.map(r => {
    const roll = availableRolls.find(rl => rl.id === r.roll_id)
    const rem = roll ? parseFloat(roll.remaining_weight) : 0
    const pw = parseFloat(r.palla_weight) || 0
    const pallas = pw > 0 ? Math.floor(rem / pw) : 0
    const used = +(pallas * pw).toFixed(3)
    const waste = +(rem - used).toFixed(3)
    const pcs = pallas * piecesPerPalla
    return { roll, rem, pallas, used, waste, pcs }
  })

  const totals = {
    colors: [...new Set(rollCalcs.map(c => c.roll?.color).filter(Boolean))].length,
    pallas: rollCalcs.reduce((s, c) => s + c.pallas, 0),
    pieces: rollCalcs.reduce((s, c) => s + c.pcs, 0),
    weight: rollCalcs.reduce((s, c) => s + c.rem, 0),
    waste: rollCalcs.reduce((s, c) => s + c.waste, 0),
  }
  const rollUnit = rollCalcs.some(c => c.roll?.unit === 'meters') ? 'm' : 'kg'

  // Filter options — computed from available rolls
  const filterOptions = useMemo(() => {
    const fabrics = [...new Set(availableRolls.map(r => r.fabric_type).filter(Boolean))].sort()
    const colors = [...new Set(availableRolls.map(r => r.color).filter(Boolean))].sort()
    const suppliers = [...new Set(availableRolls.map(r => r.supplier?.name).filter(Boolean))].sort()
    // VA types — collect from processed rolls' received processing logs
    const vaSet = new Set()
    availableRolls.forEach(r => {
      (r.processing_logs || []).forEach(l => {
        if (l.status === 'received' && l.value_addition?.short_code) vaSet.add(l.value_addition.short_code)
      })
    })
    const vaTypes = [...vaSet].sort()
    return { fabrics, colors, suppliers, vaTypes }
  }, [availableRolls])

  const addableRolls = useMemo(() => {
    const used = new Set(form.rolls.map(r => r.roll_id))
    let list = availableRolls.filter(r => !used.has(r.id))
    const pallaWt = parseFloat(form.standard_palla_weight) || 0
    const pallaMtr = parseFloat(form.standard_palla_meter) || 0
    // Get palla threshold per roll based on unit
    const pallaFor = (r) => r.unit === 'meters' ? pallaMtr : pallaWt

    // Status filter
    if (rollFilterStatus === 'remnant') {
      list = list.filter(r => {
        const pv = pallaFor(r)
        return pv > 0 ? parseFloat(r.remaining_weight) < pv : r.status === 'remnant'
      })
    } else {
      // All / Fresh / Processed — hide rolls below palla value (unusable for this lot)
      list = list.filter(r => {
        const pv = pallaFor(r)
        return pv > 0 ? parseFloat(r.remaining_weight) >= pv : true
      })
      if (rollFilterStatus === 'fresh') {
        list = list.filter(r => !hasVA(r))
      } else if (rollFilterStatus === 'processed') {
        list = list.filter(r => hasVA(r))
        if (rollFilterVA) {
          list = list.filter(r =>
            (r.processing_logs || []).some(l => l.status === 'received' && l.value_addition?.short_code === rollFilterVA)
          )
        }
      }
    }

    // Fabric filter
    if (rollFilterFabric) list = list.filter(r => r.fabric_type === rollFilterFabric)

    // Color filter
    if (rollFilterColor) list = list.filter(r => r.color === rollFilterColor)

    // Supplier filter
    if (rollFilterSupplier) list = list.filter(r => r.supplier?.name === rollFilterSupplier)

    // Unit filter
    if (rollFilterUnit) list = list.filter(r => (r.unit || 'kg') === rollFilterUnit)

    // Text search
    if (rollSearch.trim()) {
      const q = rollSearch.toLowerCase()
      list = list.filter(r =>
        (r.roll_code || '').toLowerCase().includes(q) ||
        (r.color || '').toLowerCase().includes(q) ||
        (r.fabric_type || '').toLowerCase().includes(q) ||
        (r.fabric || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [availableRolls, form.rolls, form.standard_palla_weight, form.standard_palla_meter, rollSearch, rollFilterStatus, rollFilterFabric, rollFilterColor, rollFilterSupplier, rollFilterUnit, rollFilterVA])

  // ══════════════════════════════════════
  // CREATE OVERLAY — Actions
  // ══════════════════════════════════════

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))
  // Design helpers for multi-design
  const setDesignField = (dIdx, k, v) => setForm(f => ({
    ...f, designs: f.designs.map((d, i) => i === dIdx ? { ...d, [k]: v } : d)
  }))
  const setDesignSizeKey = (dIdx, size, v) => setForm(f => ({
    ...f, designs: f.designs.map((d, i) => i === dIdx ? { ...d, size_pattern: { ...d.size_pattern, [size]: parseInt(v) || 0 } } : d)
  }))
  const addDesign = () => setForm(f => ({ ...f, designs: [...f.designs, { design_no: '', design_id: null, size_pattern: { ...DEFAULT_SIZE_PATTERN } }] }))
  const removeDesign = (dIdx) => setForm(f => ({ ...f, designs: f.designs.filter((_, i) => i !== dIdx) }))

  // Get correct palla value for a roll based on its unit
  const getPallaForRoll = (rollId, f) => {
    const roll = availableRolls.find(r => r.id === rollId)
    return roll?.unit === 'meters' ? (f.standard_palla_meter || '') : (f.standard_palla_weight || '')
  }

  const addRoll = (id) => {
    if (!id || form.rolls.some(r => r.roll_id === id)) return
    setForm(f => ({ ...f, rolls: [...f.rolls, { roll_id: id, palla_weight: getPallaForRoll(id, f) }] }))
  }

  const addRollsBulk = (ids) => {
    if (!ids || ids.length === 0) return
    setForm(f => {
      const existing = new Set(f.rolls.map(r => r.roll_id))
      const newEntries = ids.filter(id => !existing.has(id)).map(id => ({ roll_id: id, palla_weight: getPallaForRoll(id, f) }))
      return { ...f, rolls: [...f.rolls, ...newEntries] }
    })
  }

  const removeRoll = (i) => { setPendingDeleteRow(null); setForm(f => ({ ...f, rolls: f.rolls.filter((_, idx) => idx !== i) })) }

  const setRollPw = (i, v) => setForm(f => {
    const rolls = [...f.rolls]; rolls[i] = { ...rolls[i], palla_weight: v }; return { ...f, rolls }
  })

  const openCreate = () => {
    setFormError(null); setRollSearch(''); setRollsExpanded(false)
    setRollFilterStatus('all'); setRollFilterFabric(''); setRollFilterColor(''); setRollFilterSupplier(''); setRollFilterUnit(''); setRollFilterVA(''); setRollGroupBy('sr_no')
    setForm({ lot_date: new Date().toISOString().split('T')[0], product_type: masterProductTypes[0]?.code || 'FBL', standard_palla_weight: '', standard_palla_meter: '', designs: [{ design_no: '', design_id: null, size_pattern: { ...DEFAULT_SIZE_PATTERN } }], rolls: [], notes: '' })
    setShowCreate(true)
  }

  const handleCreate = async () => {
    // Validate at least one design with design_no
    const validDesigns = (form.designs || []).filter(d => d.design_id || d.design_no.trim())
    if (validDesigns.length === 0) return setFormError('At least one Design No. is required')
    // At least one palla field
    const hasWeight = form.standard_palla_weight && parseFloat(form.standard_palla_weight) > 0
    const hasMeter = form.standard_palla_meter && parseFloat(form.standard_palla_meter) > 0
    if (!hasWeight && !hasMeter) return setFormError('Either Palla Weight or Palla Meter is required')
    if (form.rolls.length === 0) return setFormError('Add at least one roll')
    setSaving(true); setFormError(null)
    try {
      await createLot({
        lot_date: form.lot_date, product_type: form.product_type || 'FBL',
        standard_palla_weight: hasWeight ? parseFloat(form.standard_palla_weight) : null,
        standard_palla_meter: hasMeter ? parseFloat(form.standard_palla_meter) : null,
        designs: validDesigns.map(d => ({ design_no: d.design_no.trim(), design_id: d.design_id || null, size_pattern: d.size_pattern })),
        rolls: form.rolls.map(r => ({ roll_id: r.roll_id, palla_weight: parseFloat(r.palla_weight) })),
        notes: form.notes || null,
      })
      setShowCreate(false)
      fetchData()
    } catch (e) {
      setFormError(e.response?.data?.detail || 'Failed to create lot')
    } finally { setSaving(false) }
  }

  // Ctrl+S
  saveRef.current = () => { if (form.rolls.length > 0 && !saving) handleCreate() }
  useEffect(() => {
    if (!showCreate) return
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveRef.current?.() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [showCreate])

  // ══════════════════════════════════════
  // DETAIL OVERLAY — Actions
  // ══════════════════════════════════════

  const openDetail = async (lot) => {
    setEditing(false); setEditError(null); setShowCuttingSheet(false); setShowBatchLabels(null)
    setDetailLot(lot)
    try {
      const res = await getLot(lot.id)
      setDetailLot(res.data.data || res.data)
    } catch { /* keep list data */ }
  }

  const closeDetail = () => {
    setDetailLot(null); setEditing(false); setEditError(null)
    setShowCuttingSheet(false); setShowBatchLabels(null)
  }

  const startEditing = () => {
    setEditForm({
      standard_palla_weight: detailLot.standard_palla_weight ?? '',
      standard_palla_meter: detailLot.standard_palla_meter ?? '',
      designs: (detailLot.designs || []).map(d => ({ design_no: d.design_no || '', size_pattern: { ...DEFAULT_SIZE_PATTERN, ...(d.size_pattern || {}) } })),
      notes: detailLot.notes || '',
    })
    setEditError(null); setEditing(true)
  }

  const cancelEditing = () => { setEditing(false); setEditError(null) }

  const handleLotUpdate = async () => {
    setEditSaving(true); setEditError(null)
    try {
      const payload = {
        standard_palla_weight: editForm.standard_palla_weight ? parseFloat(editForm.standard_palla_weight) : null,
        standard_palla_meter: editForm.standard_palla_meter ? parseFloat(editForm.standard_palla_meter) : null,
        designs: (editForm.designs || []).filter(d => d.design_no.trim()).map(d => ({ design_no: d.design_no.trim(), size_pattern: d.size_pattern })),
        notes: editForm.notes || null,
      }
      const res = await updateLot(detailLot.id, payload)
      const updated = res.data.data || res.data
      setDetailLot(updated); setEditing(false); fetchData()
    } catch (err) {
      setEditError(err.response?.data?.detail || 'Failed to update lot')
    } finally { setEditSaving(false) }
  }

  const handleStatusChange = async (newStatus) => {
    if (!canTransitionTo(detailLot.status, newStatus)) return
    try {
      const res = await updateLot(detailLot.id, { status: newStatus })
      const updated = res.data.data || res.data
      setDetailLot(updated); fetchData()
    } catch (err) {
      setEditError(err.response?.data?.detail || 'Failed to change status')
    }
  }

  const handleDistribute = async () => {
    setDistributing(true); setEditError(null)
    try {
      const res = await distributeLot(detailLot.id)
      const data = res.data?.data || res.data
      // Refresh lot detail (now status = distributed)
      try {
        const lotRes = await getLot(detailLot.id)
        setDetailLot(lotRes.data.data || lotRes.data)
      } catch { /* keep current */ }
      fetchData()
      // Open batch label sheet
      setShowBatchLabels({
        batches: data.batches || [],
        lotCode: data.lot_code || detailLot.lot_code,
        designNo: (data.designs || detailLot.designs || []).map(d => d.design_no).join(', '),
        lotDate: data.lot_date || detailLot.lot_date,
      })
    } catch (err) {
      setEditError(err.response?.data?.detail || 'Failed to distribute lot')
    } finally { setDistributing(false) }
  }

  // ═══════════════════════════════════════════
  // RENDER: Create Overlay (full-page cutting sheet)
  // ═══════════════════════════════════════════
  if (showCreate) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowCreate(false)} className="rounded-lg p-1.5 hover:bg-white/20 transition-colors">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h2 className="typo-modal-title tracking-tight">Cutting Sheet</h2>
              <p className="typo-caption text-emerald-100">New lot — design, rolls, palla calculations</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-emerald-200">Ctrl+S to save</span>
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-white/30 px-3 py-1.5 text-sm hover:bg-white/20 transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={saving || form.rolls.length === 0}
              className="rounded-lg bg-white px-4 py-1.5 typo-btn-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors">
              {saving ? 'Creating...' : `Create Lot (${form.rolls.length})`}
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-3 px-6 py-4">
            {formError && <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />}

            {/* ── Lot Details (tight toolbar) ── */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              {/* Top bar — Type, Lot, Date, Palla */}
              <div className="flex items-center gap-0 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-r border-gray-200">
                  <label className="typo-data-label whitespace-nowrap">Type</label>
                  <select autoFocus data-master="product_type" value={form.product_type} onChange={e => setField('product_type', e.target.value)}
                    className="w-20 h-[28px] rounded border border-gray-300 px-1.5 text-sm font-bold bg-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                    {masterProductTypes.map((pt) => <option key={pt.id} value={pt.code}>{pt.code}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-r border-gray-200">
                  <label className="typo-data-label whitespace-nowrap">Lot No.</label>
                  <span className="typo-data text-emerald-700 font-mono">
                    LT-{form.product_type || 'FBL'}-{String(total + 1).padStart(4, '0')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-r border-gray-200">
                  <label className="typo-data-label whitespace-nowrap">Date</label>
                  <input type="date" value={form.lot_date} onChange={e => setField('lot_date', e.target.value)}
                    className="w-[130px] h-[28px] rounded border border-gray-300 px-2 text-sm bg-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                {(pallaMode === 'weight' || pallaMode === 'both') && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-r border-gray-200">
                  <label className="typo-data-label whitespace-nowrap">Palla Wt</label>
                  <input type="text" inputMode="decimal" value={form.standard_palla_weight}
                    onChange={e => {
                      const v = e.target.value
                      setForm(f => ({ ...f, standard_palla_weight: v }))
                    }}
                    onBlur={() => {
                      const v = form.standard_palla_weight
                      if (v) setForm(f => ({ ...f, rolls: f.rolls.map(r => {
                        const roll = availableRolls.find(rl => rl.id === r.roll_id)
                        return roll?.unit === 'meters' ? r : { ...r, palla_weight: v }
                      }) }))
                    }}
                    placeholder="6.700" className="w-20 h-[28px] rounded border border-gray-300 px-2 text-sm bg-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                )}
                {(pallaMode === 'meter' || pallaMode === 'both') && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-r border-gray-200">
                  <label className="typo-data-label whitespace-nowrap">Palla Mtr</label>
                  <input type="text" inputMode="decimal" value={form.standard_palla_meter}
                    onChange={e => {
                      const v = e.target.value
                      setForm(f => ({ ...f, standard_palla_meter: v }))
                    }}
                    onBlur={() => {
                      const v = form.standard_palla_meter
                      if (v) setForm(f => ({ ...f, rolls: f.rolls.map(r => {
                        const roll = availableRolls.find(rl => rl.id === r.roll_id)
                        return roll?.unit === 'meters' ? { ...r, palla_weight: v } : r
                      }) }))
                    }}
                    placeholder="1.35" className="w-20 h-[28px] rounded border border-gray-300 px-2 text-sm bg-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                )}
                <div className="ml-auto px-3 py-1.5 flex items-center">
                  <span className="rounded-full bg-emerald-600 px-3 py-1 typo-badge text-white">
                    {(form.designs || []).length > 1
                      ? `${(form.designs || []).map(d => Object.values(d.size_pattern || {}).reduce((s, v) => s + (parseInt(v) || 0), 0)).join(' + ')} = `
                      : ''
                    }{piecesPerPalla} pcs / {piecesPerPalla} batches
                  </span>
                </div>
              </div>

              {/* Design rows */}
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="typo-label-sm">Designs <span className="normal-case font-normal text-gray-300 ml-1">Enter on last size = new design · Enter on empty = rolls</span></span>
                  <button onClick={addDesign} className="typo-btn-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Add
                  </button>
                </div>
                {(form.designs || []).map((d, dIdx) => {
                  const sizeKeys = Object.keys(d.size_pattern || {})
                  return (
                  <div key={dIdx} className="flex items-end gap-2 rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-1.5" data-design-row={dIdx}>
                    <div className="w-32">
                      <label className="typo-badge text-indigo-600">Design {dIdx + 1}</label>
                      <FilterSelect full searchable
                        value={d.design_id || ''}
                        onChange={v => {
                          const sel = masterDesigns.find(md => md.id === v)
                          setForm(f => ({ ...f, designs: f.designs.map((dd, i) => i === dIdx ? { ...dd, design_id: v || null, design_no: sel?.design_no || '' } : dd) }))
                          if (v) {
                            setTimeout(() => {
                              const row = document.querySelector(`[data-design-row="${dIdx}"]`)
                              row?.querySelector('[data-size-input]')?.focus()
                            }, 60)
                          }
                        }}
                        options={masterDesigns.map(md => ({ value: md.id, label: md.design_no }))}
                        data-master="design"
                      />
                  </div>
                  <div className="h-px w-px border-l border-gray-200 self-stretch my-1" />
                  {sizeKeys.map((size, sIdx) => (
                    <div key={size} className="flex items-center gap-1">
                      <label className="typo-label-sm text-gray-500">{size}</label>
                      <input type="number" value={d.size_pattern[size]} onChange={e => setDesignSizeKey(dIdx, size, e.target.value)}
                        data-size-input="true"
                        className="w-12 h-[34px] rounded border border-gray-300 px-1 text-center text-sm font-bold focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                            e.preventDefault()
                            if (sIdx < sizeKeys.length - 1) {
                              // Next size in this row
                              const allSizes = e.target.closest('[data-design-row]')?.querySelectorAll('[data-size-input]')
                              allSizes?.[sIdx + 1]?.focus()
                              allSizes?.[sIdx + 1]?.select()
                            } else {
                              // Last size → add new design row, focus its design_no
                              addDesign()
                              setTimeout(() => {
                                const allRows = document.querySelectorAll('[data-design-row]')
                                const lastRow = allRows[allRows.length - 1]
                                lastRow?.querySelector('[data-design-no]')?.focus()
                              }, 60)
                            }
                          }
                        }}
                      />
                    </div>
                  ))}
                  <span className="typo-badge text-emerald-700 ml-auto">
                    {Object.values(d.size_pattern || {}).reduce((s, v) => s + (parseInt(v) || 0), 0)} pcs
                  </span>
                  {form.designs.length > 1 && (
                    <button onClick={() => removeDesign(dIdx)} className="text-gray-300 hover:text-red-500 p-0.5">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
                )
              })}
              </div>
            </div>

            {/* ── Pre-selected banner ── */}
            {preselectedBanner > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {preselectedBanner} roll{preselectedBanner > 1 ? 's' : ''} pre-selected from invoice
                <button onClick={() => setPreselectedBanner(0)} className="ml-auto text-emerald-400 hover:text-emerald-600">&times;</button>
              </div>
            )}

            {/* ── Rolls Section ── */}
            <div className="rounded-xl border bg-white shadow-sm">
              <button type="button" onClick={() => setRollsExpanded(v => !v)}
                className="w-full flex items-center justify-between px-5 py-2 hover:bg-gray-50/50 transition-colors border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <svg className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${rollsExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <h3 className="typo-th">
                    {rollsExpanded ? 'Select Rolls' : 'Roll Picker'}
                    <span className="ml-1.5 typo-caption font-normal normal-case tracking-normal">{addableRolls.length} available</span>
                  </h3>
                </div>
                <span className={`typo-badge rounded-full px-2.5 py-0.5 ${rollsExpanded ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {rollsExpanded ? 'Collapse' : 'Expand'}
                </span>
              </button>
              <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${rollsExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="overflow-hidden">
              <div className="flex items-center justify-between border-t border-b px-5 py-2">
                <div className="relative w-64">
                  <input type="text" data-roll-search="true" value={rollSearch} onChange={e => setRollSearch(e.target.value)}
                    placeholder="Search code, color, fabric..." className="typo-input-sm pl-8 text-xs !w-64" />
                  <svg className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>

              {/* ── Roll Filters ── */}
              <div className="flex items-center gap-2 border-b px-5 py-2 bg-gray-50/50 flex-wrap">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'fresh', label: 'Fresh' },
                  { key: 'processed', label: 'Processed' },
                  { key: 'remnant', label: 'Remnant' },
                ].map(p => (
                  <button key={p.key} onClick={() => { setRollFilterStatus(p.key); if (p.key !== 'processed') setRollFilterVA('') }}
                    className={`rounded-full px-3 py-1 typo-btn-sm transition-colors ${
                      rollFilterStatus === p.key ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}>
                    {p.label}
                  </button>
                ))}
                {rollFilterStatus === 'processed' && filterOptions.vaTypes.length > 0 && (
                  <select value={rollFilterVA} onChange={e => setRollFilterVA(e.target.value)}
                    className="rounded border border-purple-300 bg-purple-50 px-2.5 py-1 typo-btn-sm text-purple-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500">
                    <option value="">All VA Types</option>
                    {filterOptions.vaTypes.map(va => <option key={va} value={va}>{va}</option>)}
                  </select>
                )}
                <div className="h-4 w-px bg-gray-300 mx-1" />
                <select value={rollFilterFabric} onChange={e => setRollFilterFabric(e.target.value)}
                  className="rounded border border-gray-300 px-2.5 py-1 typo-btn-sm bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                  <option value="">All Fabrics</option>
                  {filterOptions.fabrics.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={rollFilterColor} onChange={e => setRollFilterColor(e.target.value)}
                  className="rounded border border-gray-300 px-2.5 py-1 typo-btn-sm bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                  <option value="">All Colors</option>
                  {filterOptions.colors.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={rollFilterSupplier} onChange={e => setRollFilterSupplier(e.target.value)}
                  className="rounded border border-gray-300 px-2.5 py-1 typo-btn-sm bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                  <option value="">All Suppliers</option>
                  {filterOptions.suppliers.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={rollFilterUnit} onChange={e => setRollFilterUnit(e.target.value)}
                  className="rounded border border-gray-300 px-2.5 py-1 typo-btn-sm bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                  <option value="">All Units</option>
                  <option value="kg">kg</option>
                  <option value="meters">meters</option>
                </select>
                <span className="ml-auto typo-btn-sm text-gray-500">{addableRolls.length} available</span>
                <div className="h-4 w-px bg-gray-300 mx-1" />
                <select value={rollGroupBy} onChange={e => setRollGroupBy(e.target.value)}
                  className="rounded bg-gray-100 border-0 px-2.5 py-1 typo-btn-sm text-gray-600 focus:ring-1 focus:ring-emerald-500 cursor-pointer">
                  <option value="sr_no">Group: Sr. No.</option>
                  <option value="fabric">Group: Fabric</option>
                  <option value="color">Group: Color</option>
                  <option value="supplier">Group: Supplier</option>
                </select>
              </div>

              {/* Available rolls — grouped dynamically */}
              {addableRolls.length > 0 && (() => {
                const groups = [], map = {}
                for (const r of addableRolls) {
                  let key, label, sublabel
                  switch (rollGroupBy) {
                    case 'fabric':
                      key = r.fabric_type || '—'
                      label = key; sublabel = ''
                      break
                    case 'color':
                      key = r.color || '—'
                      label = key; sublabel = ''
                      break
                    case 'supplier':
                      key = r.supplier?.name || '—'
                      label = key; sublabel = ''
                      break
                    default:
                      key = r.sr_no || '—'
                      label = key; sublabel = `${r.fabric_type || ''} · ${r.supplier?.name || ''}${r.supplier_invoice_no ? ` · ${r.supplier_invoice_no}` : ''}`
                  }
                  if (!map[key]) { map[key] = { key, label, sublabel, rolls: [] }; groups.push(map[key]) }
                  map[key].rolls.push(r)
                }
                if (rollGroupBy === 'sr_no') groups.sort((a, b) => { const an = parseInt(a.key), bn = parseInt(b.key); if (isNaN(an)) return 1; if (isNaN(bn)) return -1; return an - bn })
                else groups.sort((a, b) => { if (a.key === '—') return 1; if (b.key === '—') return -1; return a.key.localeCompare(b.key) })

                const badgeStyle = { sr_no: 'bg-blue-600 text-white', fabric: 'bg-sky-100 text-sky-700', color: 'bg-gray-200 text-gray-700', supplier: 'bg-amber-100 text-amber-700' }

                return (
                  <div className="border-b bg-gray-50/50 px-4 py-3 max-h-72 overflow-y-auto">
                    <div className="space-y-2">
                      {groups.map(grp => {
                        const totalWeight = grp.rolls.reduce((s, r) => s + parseFloat(r.remaining_weight || 0), 0)
                        return (
                          <div key={grp.key} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                            <div className="flex items-center justify-between bg-gray-50 border-b border-gray-100 px-3 py-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {rollGroupBy === 'color' && <span className="inline-block h-3.5 w-3.5 rounded-full flex-shrink-0 ring-1 ring-gray-200" style={{ backgroundColor: colorHex(grp.label) }} />}
                                <span className={`inline-flex items-center justify-center rounded px-1.5 typo-badge flex-shrink-0 ${rollGroupBy === 'sr_no' ? 'h-5 w-5 ' : 'h-5 px-2 '}${badgeStyle[rollGroupBy]}`}>{rollGroupBy === 'sr_no' ? grp.label : ''}</span>
                                {rollGroupBy !== 'sr_no' && <span className="typo-btn-sm text-gray-700 truncate">{grp.label}</span>}
                                {grp.sublabel && <span className="text-xs text-gray-500 truncate">{grp.sublabel}</span>}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-xs text-gray-500">{grp.rolls.length} roll{grp.rolls.length > 1 ? 's' : ''} · {totalWeight.toFixed(1)} {grp.rolls[0]?.unit === 'meters' ? 'm' : 'kg'}</span>
                                <button onClick={() => addRollsBulk(grp.rolls.map(r => r.id))}
                                  className="rounded px-2.5 py-0.5 typo-btn-sm text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition-colors">
                                  + All
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 px-3 py-2">
                              {grp.rolls.map(r => (
                                <button key={r.id} onClick={() => addRoll(r.id)}
                                  className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-left transition-all hover:border-emerald-400 hover:bg-emerald-50 ${hasVA(r) ? 'border-2 border-purple-400 bg-purple-50/40' : 'border border-gray-200 bg-white'}`}>
                                  <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorHex(r.color) }} />
                                  <span className="typo-btn-sm text-gray-700 truncate max-w-[80px]">{r.color || '—'}</span>
                                  <span className="typo-badge text-emerald-600 tabular-nums">{r.remaining_weight} {r.unit === 'meters' ? 'm' : 'kg'}</span>
                                  {r.status === 'remnant' && <span className="typo-badge text-amber-600 bg-amber-100 rounded px-1">REM</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
              </div>
              </div>

              {/* Selected rolls table — always visible */}
              {form.rolls.length === 0 ? (
                <button type="button" onClick={() => setRollsExpanded(true)}
                  className="w-full py-10 text-center text-gray-400 hover:bg-gray-50/50 transition-colors border-t border-gray-100">
                  <svg className="mx-auto h-8 w-8 text-gray-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <p className="typo-body text-gray-400">No rolls selected</p>
                  <p className="typo-caption mt-0.5">{addableRolls.length} available — expand picker above to add</p>
                </button>
              ) : (
                <div>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-emerald-600 text-white typo-th">
                        <th className="py-2 px-3 text-left w-8 border-r border-emerald-500">#</th>
                        <th className="py-2 px-3 text-left border-r border-emerald-500">Roll Code</th>
                        <th className="py-2 px-3 text-left border-r border-emerald-500">Color</th>
                        <th className="py-2 px-3 text-right border-r border-emerald-500">Avail.</th>
                        <th className="py-2 px-3 text-right w-28 border-r border-emerald-500">Palla Val</th>
                        <th className="py-2 px-3 text-right border-r border-emerald-500">Pallas</th>
                        <th className="py-2 px-3 text-right border-r border-emerald-500">Pieces</th>
                        <th className="py-2 px-3 text-right border-r border-emerald-500">Waste</th>
                        <th className="py-2 px-3 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.rolls.map((r, i) => {
                        const c = rollCalcs[i]
                        const isDeletePending = pendingDeleteRow === i
                        return (
                          <tr key={r.roll_id} className={`border-b border-gray-200 ${isDeletePending ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'}`}>
                            <td className="py-1.5 px-3 text-xs text-gray-400 border-r border-gray-100">{i + 1}</td>
                            <td className="py-1.5 px-3 border-r border-gray-100"><RollCodeDisplay roll={c.roll} /></td>
                            <td className="py-1.5 px-3 border-r border-gray-100"><span className="rounded bg-gray-100 border border-gray-200 px-1.5 py-0.5 typo-badge">{c.roll?.color || '—'}</span></td>
                            <td className="py-1.5 px-3 text-right tabular-nums border-r border-gray-100">{c.rem.toFixed(3)} <span className="text-xs text-gray-400">{c.roll?.unit === 'meters' ? 'm' : 'kg'}</span></td>
                            <td className="py-1.5 px-3 text-right border-r border-gray-100">
                              <input type="number" step="0.001" value={r.palla_weight}
                                data-pw-row={i}
                                onChange={e => setRollPw(i, e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Escape' && pendingDeleteRow !== null) {
                                    e.preventDefault(); e.stopPropagation(); setPendingDeleteRow(null)
                                  } else if (e.key === 'Tab' && !e.shiftKey) {
                                    const nextInput = document.querySelector(`[data-pw-row="${i + 1}"]`)
                                    if (nextInput) { e.preventDefault(); nextInput.focus(); nextInput.select() }
                                  } else if (e.key === 'Tab' && e.shiftKey) {
                                    const prevInput = document.querySelector(`[data-pw-row="${i - 1}"]`)
                                    if (prevInput) { e.preventDefault(); prevInput.focus(); prevInput.select() }
                                  } else if (e.key === 'Delete') {
                                    e.preventDefault()
                                    setPendingDeleteRow(i)
                                  } else if (e.key === 'Enter') {
                                    const nextInput = document.querySelector(`[data-pw-row="${i + 1}"]`)
                                    if (nextInput) { e.preventDefault(); nextInput.focus(); nextInput.select() }
                                  }
                                }}
                                className="w-24 rounded border border-gray-200 px-2 py-1 text-right text-xs tabular-nums focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                            </td>
                            <td className="py-1.5 px-3 text-right font-bold tabular-nums border-r border-gray-100">{c.pallas}</td>
                            <td className="py-1.5 px-3 text-right font-bold text-emerald-700 tabular-nums border-r border-gray-100">{c.pcs}</td>
                            <td className="py-1.5 px-3 text-right text-red-500 tabular-nums border-r border-gray-100">{c.waste > 0 ? c.waste.toFixed(3) : '—'}</td>
                            <td className="py-1.5 px-3">
                              <button tabIndex={-1} onClick={() => removeRoll(i)} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {/* Delete confirmation bar */}
                  {pendingDeleteRow !== null && pendingDeleteRow < form.rolls.length && (() => {
                    const dr = rollCalcs[pendingDeleteRow]
                    return (
                      <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 mt-2 mx-4 mb-2">
                        <span className="text-sm text-red-700">
                          Remove <span className="font-semibold">{dr?.roll?.roll_code || `Roll #${pendingDeleteRow + 1}`}</span>
                          {dr?.roll?.color ? ` (${dr.roll.color})` : ''}?
                        </span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => {
                              const idx = pendingDeleteRow
                              const newLen = form.rolls.length - 1
                              removeRoll(idx)
                              // After React re-renders, focus the row that now sits at the deleted index (or the last row)
                              setTimeout(() => {
                                const target = newLen > 0 ? Math.min(idx, newLen - 1) : -1
                                if (target >= 0) {
                                  const el = document.querySelector(`[data-pw-row="${target}"]`)
                                  if (el) { el.focus(); el.select() }
                                }
                              }, 80)
                            }}
                            className="rounded-lg bg-red-600 px-3 py-1.5 typo-btn-sm text-white hover:bg-red-700 transition-colors">Remove</button>
                          <button autoFocus onClick={() => setPendingDeleteRow(null)}
                            onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setPendingDeleteRow(null) } }}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 typo-btn-sm text-gray-600 hover:bg-gray-50 transition-colors">Keep</button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Keyboard hint */}
                  <div className="hidden md:flex items-center gap-4 px-4 py-1.5 text-xs text-gray-400 border-t">
                    <span><kbd className="rounded border border-gray-200 bg-gray-50 px-1 py-0.5 font-mono">Tab</kbd> / <kbd className="rounded border border-gray-200 bg-gray-50 px-1 py-0.5 font-mono">Enter</kbd> Next row</span>
                    <span><kbd className="rounded border border-gray-200 bg-gray-50 px-1 py-0.5 font-mono">Shift+Tab</kbd> Prev row</span>
                    <span><kbd className="rounded border border-gray-200 bg-gray-50 px-1 py-0.5 font-mono">Delete</kbd> Remove roll</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Summary ── */}
            {form.rolls.length > 0 && (
              <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-4">
                <div className="grid grid-cols-6 gap-3 text-center">
                  <div><div className="text-xl font-bold text-amber-600">{totals.colors}</div><div className="typo-label">Colors</div></div>
                  <div><div className="text-xl font-bold text-gray-600">{form.rolls.length}</div><div className="typo-label">Rolls</div></div>
                  <div><div className="text-xl font-bold text-blue-700">{totals.pallas}</div><div className="typo-label">Pallas</div></div>
                  <div><div className="text-xl font-bold text-emerald-700">{totals.pieces}</div><div className="typo-label">Pieces</div></div>
                  <div><div className="text-xl font-bold text-purple-700">{totals.weight.toFixed(3)}</div><div className="typo-label">Weight ({rollUnit})</div></div>
                  <div><div className="text-xl font-bold text-red-500">{totals.waste.toFixed(3)}</div><div className="typo-label">Waste ({rollUnit})</div></div>
                </div>
              </div>
            )}

            {/* ── Notes ── */}
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <label className="typo-label">Notes</label>
              <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2}
                placeholder="Special instructions..." className="typo-input" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════
  // RENDER: Detail Overlay (full-page — replaces old Modal)
  // ═══════════════════════════════════════════
  if (detailLot) {
    const isOpen = detailLot.status === 'open'
    const statusInfo = LOT_STATUS_COLORS[detailLot.status] || LOT_STATUS_COLORS.open
    const detailPiecesPerPalla = (detailLot.designs || []).reduce((total, d) => total + Object.values(d.size_pattern || {}).reduce((s, v) => s + (parseInt(v) || 0), 0), 0)
    const totalWaste = (detailLot.lot_rolls || []).reduce((s, r) => s + parseFloat(r.waste_weight || 0), 0)
    const colorCount = [...new Set((detailLot.lot_rolls || []).map(r => r.color).filter(Boolean))].length
    const detailUnit = detailLot.unit === 'meters' ? 'm' : 'kg'

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
        {/* ── HEADER ── */}
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={closeDetail} className="rounded-lg p-1.5 hover:bg-white/20 transition-colors">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="typo-modal-title tracking-tight">{detailLot.lot_code}</h2>
                <span className="text-emerald-200">—</span>
                <span className="text-emerald-100">Design {(detailLot.designs || []).map(d => d.design_no).join(', ')}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`rounded-full px-2 py-0.5 typo-badge ${statusInfo.bg} ${statusInfo.text}`}>{statusInfo.label}</span>
                {detailLot.lot_date && (
                  <span className="text-xs text-emerald-200">{new Date(detailLot.lot_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                )}
                {detailLot.created_by_user && <span className="text-xs text-emerald-200">by {detailLot.created_by_user.full_name}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Status transitions (forward-only) */}
            {LOT_STATUS_FLOW.filter(s => s !== 'distributed' && canTransitionTo(detailLot.status, s)).map(s => (
              <button key={s} onClick={() => handleStatusChange(s)}
                className="rounded-lg border border-white/30 px-3 py-1.5 typo-btn-sm hover:bg-white/20 transition-colors">
                Move to {LOT_STATUS_COLORS[s].label}
              </button>
            ))}
            {/* Print */}
            <button onClick={() => setShowCuttingSheet(true)} className="rounded-lg border border-white/30 px-3 py-1.5 typo-btn-sm hover:bg-white/20 transition-colors flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
            {/* Distribute — auto-create batches from size pattern */}
            {detailLot.status === 'cutting' && (
              <button onClick={handleDistribute} disabled={distributing}
                className="rounded-lg bg-white/90 px-3 py-1.5 typo-btn-sm text-emerald-700 hover:bg-white disabled:opacity-50 transition-colors">
                {distributing ? 'Distributing...' : `Distribute (${detailPiecesPerPalla} Batches)`}
              </button>
            )}
            {/* Edit (open status only) */}
            {isOpen && !editing && (
              <button onClick={startEditing} className="rounded-lg border border-white/30 px-3 py-1.5 typo-btn-sm hover:bg-white/20 transition-colors flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            )}
            {editing && (
              <>
                <button onClick={cancelEditing} className="rounded-lg border border-white/30 px-3 py-1.5 text-xs hover:bg-white/20 transition-colors">Cancel</button>
                <button onClick={handleLotUpdate} disabled={editSaving}
                  className="rounded-lg bg-white px-4 py-1.5 typo-btn-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors">
                  {editSaving ? 'Saving...' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-3 px-6 py-4">
            {editError && <ErrorAlert message={editError} onDismiss={() => setEditError(null)} />}

            {/* ── Lot Details toolbar ── */}
            <div className="rounded-lg border bg-white px-4 py-3 shadow-sm">
              {editing ? (
                <div className="space-y-2">
                  <div className="flex items-end gap-3">
                    <div className="w-24">
                      <label className="typo-label-sm">Palla Wt</label>
                      <input type="number" step="0.001" value={editForm.standard_palla_weight}
                        onChange={e => setEditForm(f => ({ ...f, standard_palla_weight: e.target.value }))}
                        className="w-full h-[34px] rounded border border-gray-300 px-2.5 text-sm font-medium focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" autoFocus />
                    </div>
                    <div className="w-24">
                      <label className="typo-label-sm">Palla Mtr</label>
                      <input type="number" step="0.01" value={editForm.standard_palla_meter || ''}
                        onChange={e => setEditForm(f => ({ ...f, standard_palla_meter: e.target.value }))}
                        className="w-full h-[34px] rounded border border-gray-300 px-2.5 text-sm font-medium focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                    </div>
                  </div>
                  {(editForm.designs || []).map((d, dIdx) => (
                    <div key={dIdx} className="flex items-end gap-2 rounded bg-gray-50 px-3 py-2">
                      <div className="w-28">
                        <label className="typo-label-sm">Design {dIdx + 1} *</label>
                        <input type="text" value={d.design_no}
                          onChange={e => setEditForm(f => ({ ...f, designs: f.designs.map((dd, i) => i === dIdx ? { ...dd, design_no: e.target.value } : dd) }))}
                          className="w-full h-[34px] rounded border border-gray-300 px-2.5 text-sm font-medium focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      </div>
                      {Object.entries(d.size_pattern || {}).map(([size, count]) => (
                        <div key={size} className="flex items-center gap-1">
                          <label className="typo-label-sm text-gray-500">{size}</label>
                          <input type="number" value={count}
                            onChange={e => setEditForm(f => ({ ...f, designs: f.designs.map((dd, i) => i === dIdx ? { ...dd, size_pattern: { ...dd.size_pattern, [size]: parseInt(e.target.value) || 0 } } : dd) }))}
                            className="w-12 h-[34px] rounded border border-gray-300 px-1 text-center text-sm font-bold focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                        </div>
                      ))}
                      <span className="typo-data text-emerald-600 ml-1">= {Object.values(d.size_pattern || {}).reduce((s, v) => s + (parseInt(v) || 0), 0)} pcs</span>
                      {editForm.designs.length > 1 && (
                        <button onClick={() => setEditForm(f => ({ ...f, designs: f.designs.filter((_, i) => i !== dIdx) }))} className="ml-auto text-gray-400 hover:text-red-500 p-1">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setEditForm(f => ({ ...f, designs: [...f.designs, { design_no: '', size_pattern: { ...DEFAULT_SIZE_PATTERN } }] }))}
                    className="typo-btn-sm text-emerald-600 hover:text-emerald-700">+ Add Design</button>
                </div>
              ) : (
                <div>
                  {/* Lot info bar */}
                  <div className="flex items-center gap-5 border-b border-gray-200 pb-3 mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="typo-label-sm">Lot</span>
                      <span className="typo-data text-emerald-700">{detailLot.lot_code}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="typo-label-sm">Date</span>
                      <span className="typo-data">{detailLot.lot_date ? new Date(detailLot.lot_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}</span>
                    </div>
                    {detailLot.standard_palla_weight && (
                      <div className="flex items-center gap-1.5">
                        <span className="typo-label-sm">Palla Wt</span>
                        <span className="typo-data">{detailLot.standard_palla_weight} kg</span>
                      </div>
                    )}
                    {detailLot.standard_palla_meter && (
                      <div className="flex items-center gap-1.5">
                        <span className="typo-label-sm">Palla Mtr</span>
                        <span className="typo-data">{detailLot.standard_palla_meter} m</span>
                      </div>
                    )}
                    <div className="ml-auto rounded-full bg-emerald-600 px-3 py-0.5 typo-badge text-white">
                      {detailPiecesPerPalla} pcs / palla
                    </div>
                  </div>
                  {/* Design breakdown table */}
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left typo-th text-gray-400 border-b border-gray-200">
                        <th className="pb-1.5 pr-3">Design</th>
                        <th className="pb-1.5">Size Breakdown</th>
                        <th className="pb-1.5 text-right">Pieces</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detailLot.designs || []).map((d, i) => {
                        const nonZero = Object.entries(d.size_pattern || {}).filter(([, v]) => parseInt(v) > 0)
                        const totalPcs = Object.values(d.size_pattern || {}).reduce((s, v) => s + (parseInt(v) || 0), 0)
                        return (
                          <tr key={i} className={i < (detailLot.designs || []).length - 1 ? 'border-b border-gray-100' : ''}>
                            <td className="py-2 pr-3">
                              <span className="inline-flex items-center rounded-md bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 typo-badge text-indigo-700">{d.design_no}</span>
                            </td>
                            <td className="py-2">
                              <div className="flex items-center gap-1">
                                {nonZero.map(([size, count]) => (
                                  <span key={size} className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs">
                                    <span className="font-medium text-gray-500 mr-0.5">{size}</span>
                                    <span className="font-bold text-gray-800">{count}</span>
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-2 text-right font-bold text-emerald-700">{totalPcs}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Notes (edit mode) ── */}
            {editing && (
              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <label className="typo-label-sm">Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  placeholder="Special instructions..." className="typo-input" />
              </div>
            )}

            {/* ── Rolls Table (read-only) ── */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-emerald-600 text-white typo-th">
                    <th className="py-2 px-3 text-left w-8 border-r border-emerald-500">#</th>
                    <th className="py-2 px-3 text-left border-r border-emerald-500">Roll Code</th>
                    <th className="py-2 px-3 text-left border-r border-emerald-500">Color</th>
                    <th className="py-2 px-3 text-right border-r border-emerald-500">Roll Wt</th>
                    <th className="py-2 px-3 text-right border-r border-emerald-500">Palla Wt</th>
                    <th className="py-2 px-3 text-right border-r border-emerald-500">Pallas</th>
                    <th className="py-2 px-3 text-right border-r border-emerald-500">Used</th>
                    <th className="py-2 px-3 text-right border-r border-emerald-500">Waste</th>
                    <th className="py-2 px-3 text-right">Pieces</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailLot.lot_rolls || []).map((lr, i) => (
                    <tr key={lr.id} className={`border-b border-gray-200 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'}`}>
                      <td className="py-1.5 px-3 text-xs text-gray-400 border-r border-gray-100">{i + 1}</td>
                      <td className="py-1.5 px-3 font-medium border-r border-gray-100">{lr.roll_code}</td>
                      <td className="py-1.5 px-3 border-r border-gray-100"><span className="rounded bg-gray-100 border border-gray-200 px-1.5 py-0.5 typo-badge">{lr.color}</span></td>
                      <td className="py-1.5 px-3 text-right tabular-nums border-r border-gray-100">{parseFloat(lr.roll_weight || 0).toFixed(3)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums border-r border-gray-100">{parseFloat(lr.palla_weight || 0).toFixed(3)}</td>
                      <td className="py-1.5 px-3 text-right font-bold tabular-nums border-r border-gray-100">{lr.num_pallas}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums border-r border-gray-100">{parseFloat(lr.weight_used || 0).toFixed(3)}</td>
                      <td className="py-1.5 px-3 text-right text-red-500 tabular-nums border-r border-gray-100">{parseFloat(lr.waste_weight || 0) > 0 ? parseFloat(lr.waste_weight).toFixed(3) : '—'}</td>
                      <td className="py-1.5 px-3 text-right font-bold text-emerald-700 tabular-nums">{lr.pieces_from_roll}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-800 text-white font-semibold text-sm">
                    <td className="py-2 px-3 border-r border-gray-700" colSpan={5}>Totals</td>
                    <td className="py-2 px-3 text-right border-r border-gray-700">{detailLot.total_pallas}</td>
                    <td className="py-2 px-3 text-right border-r border-gray-700">{parseFloat(detailLot.total_weight || 0).toFixed(3)} {detailUnit}</td>
                    <td className="py-2 px-3 text-right text-red-300 border-r border-gray-700">{totalWaste.toFixed(3)} {detailUnit}</td>
                    <td className="py-2 px-3 text-right text-emerald-300">{detailLot.total_pieces}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ── Summary KPIs ── */}
            <div className="grid grid-cols-6 gap-2">
              {[
                { value: colorCount, label: 'Colors', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
                { value: (detailLot.lot_rolls || []).length, label: 'Rolls', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200' },
                { value: detailLot.total_pallas, label: 'Pallas', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
                { value: detailLot.total_pieces, label: 'Pieces', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
                { value: parseFloat(detailLot.total_weight || 0).toFixed(3), label: `Weight (${detailUnit})`, color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
                { value: totalWaste.toFixed(3), label: `Waste (${detailUnit})`, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
              ].map((kpi, i) => (
                <div key={i} className={`rounded-lg border ${kpi.bg} px-3 py-2 text-center`}>
                  <div className={`typo-kpi-sm ${kpi.color}`}>{kpi.value}</div>
                  <div className="typo-kpi-label">{kpi.label}</div>
                </div>
              ))}
            </div>

            {/* ── Notes (read mode) ── */}
            {!editing && detailLot.notes && (
              <div className="rounded-lg border bg-white p-4 shadow-sm text-sm text-gray-500">
                <span className="font-medium text-gray-700">Notes:</span> {detailLot.notes}
              </div>
            )}
          </div>
        </div>

        {/* ── CuttingSheet print overlay ── */}
        {showCuttingSheet && <CuttingSheet lot={detailLot} onClose={() => setShowCuttingSheet(false)} />}

        {/* ── Batch Label Sheet (after distribute) ── */}
        {showBatchLabels && (
          <BatchLabelSheet
            batches={showBatchLabels.batches}
            lotCode={showBatchLabels.lotCode}
            designNo={showBatchLabels.designNo}
            lotDate={showBatchLabels.lotDate}
            onClose={() => setShowBatchLabels(null)}
          />
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════
  // RENDER: Lots List
  // ═══════════════════════════════════════════
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="typo-page-title">Lots</h1>
          <p className="mt-1 typo-caption">Cutting lots — group rolls, calculate pallas & pieces</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 typo-btn-sm text-white hover:bg-emerald-700 shadow-sm transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New Cutting Sheet
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        {[
          { key: '', label: 'All' },
          { key: 'open', label: 'Open' },
          { key: 'cutting', label: 'Cutting' },
          { key: 'distributed', label: 'Distributed' },
        ].map(p => (
          <button key={p.key} onClick={() => { setStatusFilter(p.key); setPage(1) }}
            className={`rounded-full px-3 py-1 typo-btn-sm transition-colors ${statusFilter === p.key ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      <div className="mt-4">
        <DataTable columns={COLUMNS} data={lots} loading={loading} onRowClick={openDetail} emptyText="No lots found." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      {/* Shift+M Quick Master Create */}
      <QuickMasterModal type={quickMasterType} open={quickMasterOpen} onClose={closeQuickMaster} onCreated={onMasterCreated} />
    </div>
  )
}
