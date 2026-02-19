import { useState, useEffect, useCallback } from 'react'
import { getRolls, getInvoices, stockInBulk, updateRoll, getProcessingRolls, sendForProcessing, receiveFromProcessing, updateProcessingLog } from '../api/rolls'
import LabelSheet from '../components/common/LabelSheet'
import { getSuppliers } from '../api/suppliers'
import { getAllFabrics, getAllColors, getAllValueAdditions } from '../api/masters'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import ErrorAlert from '../components/common/ErrorAlert'
import StatusBadge from '../components/common/StatusBadge'
import RollForm from '../components/forms/RollForm'

const INPUT_CLS = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
const LABEL_CLS = 'block text-sm font-medium text-gray-700 mb-1'

// Challan-style fast entry — no per-roll template needed

const PROCESS_TYPES = [
  { value: 'embroidery', label: 'Embroidery' },
  { value: 'digital_print', label: 'Digital Print' },
  { value: 'dyeing', label: 'Dyeing' },
  { value: 'other', label: 'Other' },
]

const TABS = [
  { key: 'invoices', label: 'By Invoice', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'rolls', label: 'All Rolls', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
  { key: 'processing', label: 'In Processing', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
]

const ROLL_STATUS_LABELS = {
  in_stock: 'In Stock',
  sent_for_processing: 'Processing',
  in_cutting: 'In Cutting',
}

// ── Invoice tab columns ──
const INVOICE_COLUMNS = [
  {
    key: 'sr_no',
    label: 'Sr.',
    render: (val) => val ? <span className="font-bold text-primary-700 text-sm">{val}</span> : <span className="text-gray-300">—</span>,
  },
  {
    key: 'invoice_date',
    label: 'Date',
    render: (val) => val ? new Date(val).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
  },
  {
    key: 'invoice_no',
    label: 'Invoice / Challan',
    render: (val, row) => {
      const inv = val || ''
      const ch = row.challan_no || ''
      if (!inv && !ch) return <span className="text-gray-400 italic">No Invoice</span>
      return (
        <div className="leading-tight">
          {inv && <span className="font-medium text-gray-800">{inv}</span>}
          {inv && ch && <span className="text-gray-300 mx-1">/</span>}
          {ch && <span className="text-gray-600">{ch}</span>}
        </div>
      )
    },
  },
  {
    key: 'supplier',
    label: 'Supplier',
    render: (val) => val?.name || '—',
  },
  {
    key: 'roll_count',
    label: 'Rolls',
    render: (val) => (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
        {val} roll{val > 1 ? 's' : ''}
      </span>
    ),
  },
  {
    key: 'total_weight',
    label: 'Weight',
    render: (val) => val > 0 ? `${val.toFixed(3)} kg` : '—',
  },
  {
    key: 'total_value',
    label: 'Value',
    render: (val) => val > 0 ? `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—',
  },
]

// ── All rolls tab columns ──
const ROLL_COLUMNS = [
  {
    key: 'roll_code',
    label: 'Roll',
    render: (val, row) => {
      const enhanced = row.enhanced_roll_code || val || ''
      // Split base roll code and process suffixes: "1-COT-GREEN/01-01+EMB+DYE"
      const plusIdx = enhanced.indexOf('+')
      const base = plusIdx >= 0 ? enhanced.slice(0, plusIdx) : enhanced
      const suffixes = plusIdx >= 0 ? enhanced.slice(plusIdx) : ''
      // Split base: "390-SHK-WHITE-03" → invoice part + seq
      const parts = base.split('-')
      const seq = parts.length > 1 ? parts.pop() : ''
      const rest = parts.join('-')
      return (
        <span className="text-xs font-semibold text-gray-800">
          {rest}{seq && <span className="font-bold text-primary-600">-{seq}</span>}
          {suffixes && <span className="text-[10px] font-bold text-orange-600">{suffixes}</span>}
        </span>
      )
    },
  },
  {
    key: 'fabric_type',
    label: 'Material',
    render: (val, row) => (
      <div className="leading-tight">
        <span className="text-sm font-medium text-gray-800">{val}</span>
        <span className="text-gray-300 mx-0.5">/</span>
        <span className="text-sm text-gray-600">{row.color}</span>
      </div>
    ),
  },
  {
    key: 'supplier',
    label: 'Supplier',
    render: (val, row) => (
      <div className="max-w-[160px]">
        <div className="text-sm text-gray-800 truncate">{val?.name || '—'}</div>
        {row.supplier_invoice_no && (
          <div className="text-[10px] text-gray-400 mt-0.5 truncate">{row.supplier_invoice_no}</div>
        )}
      </div>
    ),
  },
  {
    key: 'received_at',
    label: 'Date',
    render: (val) => val
      ? <span className="text-xs text-gray-600">{new Date(val).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
      : <span className="text-gray-300">—</span>,
  },
  {
    key: 'total_weight',
    label: 'Stock',
    render: (val, row) => {
      const total = row.unit === 'meters' ? (row.total_length || val) : val
      const remaining = row.unit === 'meters' ? (row.remaining_length ?? row.remaining_weight) : row.remaining_weight
      const pct = total > 0 ? (remaining / total) * 100 : 0
      const u = row.unit === 'meters' ? 'm' : 'kg'
      const barColor = pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : pct > 0 ? 'bg-red-500' : 'bg-gray-300'
      return (
        <div className="w-[100px]">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-gray-800">{total}</span>
            <span className="text-[10px] text-gray-400">{u}</span>
          </div>
          <div className="mt-0.5 h-1.5 w-full rounded-full bg-gray-100">
            <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${Math.max(pct, 2)}%` }} />
          </div>
          <div className={`text-[10px] mt-0.5 ${pct > 50 ? 'text-emerald-600' : pct > 20 ? 'text-amber-600' : pct > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {pct > 0 && pct < 100 ? `${remaining} left` : pct === 0 ? 'Fully used' : 'Full stock'}
          </div>
        </div>
      )
    },
  },
  {
    key: 'cost_per_unit',
    label: 'Value',
    render: (val, row) => {
      if (val == null) return <span className="text-gray-300">—</span>
      const u = row.unit === 'meters' ? 'm' : 'kg'
      const totalValue = parseFloat(val) * parseFloat(row.total_weight || 0)
      return (
        <div>
          <div className="text-sm font-semibold text-gray-800">₹{totalValue > 0 ? totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '0'}</div>
          <div className="text-[10px] text-gray-400">@₹{val}/{u}</div>
        </div>
      )
    },
  },
  {
    key: 'status',
    label: 'Status',
    render: (val, row) => {
      const logs = row.processing_logs || []
      const hasHistory = logs.some((l) => l.status === 'received')
      const latestSent = logs.find((l) => l.status === 'sent')
      return (
        <div>
          <StatusBadge status={val} label={ROLL_STATUS_LABELS[val] || val} />
          {val === 'sent_for_processing' && latestSent && (
            <div className="mt-0.5 text-[10px] text-orange-600 font-medium truncate max-w-[80px]">
              {PROCESS_TYPES.find((p) => p.value === latestSent.process_type)?.label || latestSent.process_type}
            </div>
          )}
          {val === 'in_stock' && hasHistory && (
            <div className="mt-0.5 flex items-center gap-0.5">
              <svg className="h-2.5 w-2.5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              <span className="text-[10px] text-purple-600 font-medium">Processed</span>
            </div>
          )}
        </div>
      )
    },
  },
]

// ── Processing tab columns ──
const PROCESSING_COLUMNS = [
  { key: 'roll_code', label: 'Roll Code', render: (val) => <span className="font-medium text-primary-600">{val}</span> },
  { key: 'fabric_type', label: 'Fabric' },
  { key: 'color', label: 'Color' },
  {
    key: 'total_weight',
    label: 'Weight',
    render: (val) => `${val} kg`,
  },
  {
    key: 'processing_logs',
    label: 'Process / VA',
    render: (val) => {
      const latest = val?.[val.length - 1]
      if (!latest) return '—'
      const pt = PROCESS_TYPES.find((p) => p.value === latest.process_type)
      const va = latest.value_addition
      return (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
            {pt?.label || latest.process_type}
          </span>
          {va && (
            <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
              +{va.short_code}
            </span>
          )}
        </div>
      )
    },
  },
  {
    key: 'processing_logs',
    label: 'Vendor',
    render: (val) => val?.[val.length - 1]?.vendor_name || '—',
  },
  {
    key: 'processing_logs',
    label: 'Sent Date',
    render: (val) => {
      const latest = val?.[val.length - 1]
      return latest?.sent_date ? new Date(latest.sent_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
    },
  },
  {
    key: 'processing_logs',
    label: 'Days Out',
    render: (val) => {
      const latest = val?.[val.length - 1]
      if (!latest?.sent_date) return '—'
      const days = Math.floor((Date.now() - new Date(latest.sent_date).getTime()) / (1000 * 60 * 60 * 24))
      return (
        <span className={`text-sm font-medium ${days > 14 ? 'text-red-600' : days > 7 ? 'text-amber-600' : 'text-gray-700'}`}>
          {days}d
        </span>
      )
    },
  },
]

// ── Helper: compute process summary from processing_logs ──
const getProcessSummary = (logs) => {
  if (!logs || logs.length === 0) return null
  const received = logs.filter((l) => l.status === 'received')
  const totalCost = received.reduce((sum, l) => sum + (l.processing_cost || 0), 0)
  const totalDays = received.reduce((sum, l) => {
    if (!l.sent_date || !l.received_date) return sum
    return sum + Math.max(1, Math.floor((new Date(l.received_date) - new Date(l.sent_date)) / (1000 * 60 * 60 * 24)))
  }, 0)
  const firstBefore = logs[0]?.weight_before ?? null
  const lastAfter = received.length > 0 ? received[received.length - 1]?.weight_after : null
  const weightChange = firstBefore != null && lastAfter != null ? lastAfter - firstBefore : null
  const weightChangePct = firstBefore && weightChange != null ? (weightChange / firstBefore) * 100 : null
  const lastDate = received.length > 0 ? received[received.length - 1]?.received_date : null
  return { received, totalCost, totalDays, weightChange, weightChangePct, lastDate, processCount: logs.length }
}

const PROCESS_COLORS = {
  embroidery: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  digital_print: { bg: 'bg-sky-100', text: 'text-sky-700', dot: 'bg-sky-500' },
  dyeing: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  other: { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
}

// ── Processed & Returned tab columns ──
const PROCESSED_COLUMNS = [
  {
    key: 'roll_code',
    label: 'Roll Code',
    render: (val, row) => {
      const enhanced = row.enhanced_roll_code || val || ''
      const plusIdx = enhanced.indexOf('+')
      const base = plusIdx >= 0 ? enhanced.slice(0, plusIdx) : enhanced
      const suffixes = plusIdx >= 0 ? enhanced.slice(plusIdx) : ''
      return (
        <span className="font-medium text-gray-800 font-mono text-xs">
          {base}
          {suffixes && <span className="font-bold text-orange-600">{suffixes}</span>}
        </span>
      )
    },
  },
  {
    key: 'fabric_type',
    label: 'Fabric / Color',
    render: (val, row) => (
      <div className="flex items-center gap-1.5">
        <span className="text-sm">{val}</span>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium">{row.color}</span>
      </div>
    ),
  },
  {
    key: 'total_weight',
    label: 'Weight',
    render: (val) => <span className="text-sm">{val} kg</span>,
  },
  {
    key: 'processing_logs',
    label: 'Processes',
    sortable: false,
    render: (logs) => {
      if (!logs || logs.length === 0) return '—'
      const seen = new Set()
      return (
        <div className="flex flex-wrap gap-1">
          {logs.map((l, i) => {
            if (seen.has(l.process_type)) return null
            seen.add(l.process_type)
            const c = PROCESS_COLORS[l.process_type] || PROCESS_COLORS.other
            const pt = PROCESS_TYPES.find((p) => p.value === l.process_type)
            return (
              <span key={i} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
                {pt?.label || l.process_type}
              </span>
            )
          })}
          {logs.length > 1 && (
            <span className="text-xs text-gray-400 ml-0.5">x{logs.length}</span>
          )}
        </div>
      )
    },
  },
  {
    key: 'processing_logs',
    label: 'Total Cost',
    render: (logs) => {
      const s = getProcessSummary(logs)
      if (!s || s.totalCost === 0) return <span className="text-gray-400">—</span>
      return <span className="text-sm font-semibold text-gray-800">₹{s.totalCost.toLocaleString('en-IN')}</span>
    },
  },
  {
    key: 'processing_logs',
    label: 'Wt. Change',
    render: (logs) => {
      const s = getProcessSummary(logs)
      if (!s || s.weightChange == null) return <span className="text-gray-400">—</span>
      const isLoss = s.weightChange < 0
      const isGain = s.weightChange > 0
      return (
        <span className={`text-sm font-medium ${isLoss ? 'text-red-600' : isGain ? 'text-green-600' : 'text-gray-500'}`}>
          {isGain ? '+' : ''}{s.weightChange.toFixed(2)} kg
          <span className="text-xs ml-0.5 opacity-70">({isGain ? '+' : ''}{s.weightChangePct.toFixed(1)}%)</span>
        </span>
      )
    },
  },
  {
    key: 'processing_logs',
    label: 'Days',
    render: (logs) => {
      const s = getProcessSummary(logs)
      if (!s || s.totalDays === 0) return <span className="text-gray-400">—</span>
      return (
        <span className={`text-sm font-medium ${s.totalDays > 14 ? 'text-red-600' : s.totalDays > 7 ? 'text-amber-600' : 'text-gray-700'}`}>
          {s.totalDays}d
        </span>
      )
    },
  },
  {
    key: 'processing_logs',
    label: 'Last Returned',
    render: (logs) => {
      const s = getProcessSummary(logs)
      if (!s?.lastDate) return <span className="text-gray-400">—</span>
      return <span className="text-sm">{new Date(s.lastDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
    },
  },
]

export default function RollsPage() {
  const [tab, setTab] = useState('invoices')

  // Invoice tab state
  const [invoices, setInvoices] = useState([])
  const [invTotal, setInvTotal] = useState(0)
  const [invPage, setInvPage] = useState(1)
  const [invPages, setInvPages] = useState(1)
  const [invSearch, setInvSearch] = useState('')
  const [invLoading, setInvLoading] = useState(true)

  // All rolls tab state
  const [rolls, setRolls] = useState([])
  const [rollTotal, setRollTotal] = useState(0)
  const [rollPage, setRollPage] = useState(1)
  const [rollPages, setRollPages] = useState(1)
  const [rollSearch, setRollSearch] = useState('')
  const [rollLoading, setRollLoading] = useState(true)
  const [rollStatusFilter, setRollStatusFilter] = useState('all')
  const [rollAvailFilter, setRollAvailFilter] = useState('all')
  const [rollSupplierFilter, setRollSupplierFilter] = useState('')
  const [rollFabricFilter, setRollFabricFilter] = useState('')
  const [rollProcessFilter, setRollProcessFilter] = useState('')
  const [expandedRows, setExpandedRows] = useState(new Set())

  // Processing tab state
  const [procRolls, setProcRolls] = useState([])
  const [procLoading, setProcLoading] = useState(true)
  const [procProcessFilter, setProcProcessFilter] = useState('')
  const [procVendorFilter, setProcVendorFilter] = useState('')
  const [procDaysFilter, setProcDaysFilter] = useState('all')
  const [procSearch, setProcSearch] = useState('')

  const [error, setError] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [masterFabrics, setMasterFabrics] = useState([])
  const [masterColors, setMasterColors] = useState([])
  const [masterValueAdditions, setMasterValueAdditions] = useState([])

  // Stock-in modal — challan style with design groups
  const EMPTY_GROUP = { fabric_type: '', cost_per_unit: '', unit: 'kg', panna: '', gsm: '', notes: '', colorRows: [{ color: '', weights: [''] }] }
  const [stockInOpen, setStockInOpen] = useState(false)
  const [invoiceHeader, setInvoiceHeader] = useState({ supplier_id: '', supplier_invoice_no: '', supplier_challan_no: '', supplier_invoice_date: '', sr_no: '' })
  const [designGroups, setDesignGroups] = useState([{ ...EMPTY_GROUP, colorRows: [{ color: '', weights: [''] }] }])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [lastSavedRolls, setLastSavedRolls] = useState([])   // for Print Labels
  const [showLabelSheet, setShowLabelSheet] = useState(false)

  // Invoice detail modal
  const [selectedInvoice, setSelectedInvoice] = useState(null)

  // Individual roll detail/edit modal
  const [detailRoll, setDetailRoll] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState(null)

  // Send for Processing modal
  const [sendProcOpen, setSendProcOpen] = useState(false)
  const [sendProcRoll, setSendProcRoll] = useState(null)
  const [sendProcForm, setSendProcForm] = useState({ process_type: 'embroidery', vendor_name: '', vendor_phone: '', sent_date: '', notes: '' })
  const [sendProcSaving, setSendProcSaving] = useState(false)
  const [sendProcError, setSendProcError] = useState(null)

  // Receive from Processing modal
  const [recvProcOpen, setRecvProcOpen] = useState(false)
  const [recvProcRoll, setRecvProcRoll] = useState(null)
  const [recvProcLog, setRecvProcLog] = useState(null)
  const [recvProcForm, setRecvProcForm] = useState({ received_date: '', weight_after: '', length_after: '', processing_cost: '', notes: '' })
  const [recvProcSaving, setRecvProcSaving] = useState(false)
  const [recvProcError, setRecvProcError] = useState(null)

  // Edit Processing Log modal
  const [editProcOpen, setEditProcOpen] = useState(false)
  const [editProcRollId, setEditProcRollId] = useState(null)
  const [editProcLog, setEditProcLog] = useState(null)
  const [editProcForm, setEditProcForm] = useState({})
  const [editProcSaving, setEditProcSaving] = useState(false)
  const [editProcError, setEditProcError] = useState(null)

  const isEditable = detailRoll && detailRoll.remaining_weight === detailRoll.total_weight && detailRoll.status === 'in_stock'

  // ── Data fetching ──
  const fetchInvoices = useCallback(async () => {
    setInvLoading(true)
    setError(null)
    try {
      const res = await getInvoices({ page: invPage, page_size: 20, search: invSearch || undefined })
      setInvoices(res.data.data)
      setInvTotal(res.data.total)
      setInvPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load invoices')
    } finally {
      setInvLoading(false)
    }
  }, [invPage, invSearch])

  const fetchRolls = useCallback(async () => {
    setRollLoading(true)
    setError(null)
    try {
      const params = { page: rollPage, page_size: 20 }
      if (rollSearch) params.fabric_type = rollSearch
      if (rollStatusFilter === 'in_stock_fresh' || rollStatusFilter === 'in_stock_processed') {
        params.status = 'in_stock'
      } else if (rollStatusFilter !== 'all') {
        params.status = rollStatusFilter
      }
      if (rollAvailFilter === 'available') params.has_remaining = true
      if (rollAvailFilter === 'consumed') params.fully_consumed = true
      if (rollSupplierFilter) params.supplier_id = rollSupplierFilter
      if (rollFabricFilter) params.fabric_filter = rollFabricFilter
      if (rollProcessFilter) params.process_type = rollProcessFilter
      const res = await getRolls(params)
      let rollData = res.data.data
      // Client-side sub-filter for fresh vs processed-and-returned
      if (rollStatusFilter === 'in_stock_fresh') {
        rollData = rollData.filter((r) => !r.processing_logs || r.processing_logs.length === 0 || r.processing_logs.every((l) => l.status === 'sent'))
      } else if (rollStatusFilter === 'in_stock_processed') {
        rollData = rollData.filter((r) => r.processing_logs?.some((l) => l.status === 'received'))
      }
      setRolls(rollData)
      setRollTotal(res.data.total)
      setRollPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load rolls')
    } finally {
      setRollLoading(false)
    }
  }, [rollPage, rollSearch, rollStatusFilter, rollAvailFilter, rollSupplierFilter, rollFabricFilter, rollProcessFilter])

  const fetchProcessing = useCallback(async () => {
    setProcLoading(true)
    setError(null)
    try {
      const res = await getProcessingRolls()
      setProcRolls(res.data.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load processing rolls')
    } finally {
      setProcLoading(false)
    }
  }, [])

  useEffect(() => { if (tab === 'invoices') fetchInvoices() }, [tab, fetchInvoices])
  useEffect(() => { if (tab === 'rolls') fetchRolls() }, [tab, fetchRolls])
  useEffect(() => { if (tab === 'processing') fetchProcessing() }, [tab, fetchProcessing])
  useEffect(() => {
    getSuppliers({ is_active: true }).then((res) => setSuppliers(res.data.data)).catch(() => {})
    getAllFabrics().then((res) => setMasterFabrics(res.data.data)).catch(() => {})
    getAllColors().then((res) => setMasterColors(res.data.data)).catch(() => {})
    getAllValueAdditions().then((res) => setMasterValueAdditions(res.data.data)).catch(() => {})
  }, [])

  const refreshAll = () => { fetchInvoices(); fetchRolls(); fetchProcessing() }

  // Track if we're editing an existing invoice (vs creating new)
  const [editingInvoice, setEditingInvoice] = useState(null)

  // ── Stock In — Challan-style with design groups ──
  const openStockIn = () => {
    setEditingInvoice(null)
    // Auto-generate next Sr. No. (our internal filing serial)
    const existingSrNos = invoices.map((inv) => parseInt(inv.sr_no, 10)).filter((n) => !isNaN(n))
    const nextSr = existingSrNos.length > 0 ? Math.max(...existingSrNos) + 1 : 1
    const today = new Date().toISOString().split('T')[0]
    setInvoiceHeader({ supplier_id: '', supplier_invoice_no: '', supplier_challan_no: '', supplier_invoice_date: today, sr_no: String(nextSr) })
    setDesignGroups([{ ...EMPTY_GROUP, colorRows: [{ color: '', weights: [''] }] }])
    setFormError(null)
    setStockInOpen(true)
  }

  const isInvoiceEditable = (inv) => inv?.rolls?.every((r) =>
    (r.status || 'in_stock') === 'in_stock' && r.remaining_weight === r.total_weight
  )

  const openEditInvoice = () => {
    if (!selectedInvoice) return
    setEditingInvoice(selectedInvoice)
    setInvoiceHeader({
      supplier_id: selectedInvoice.supplier?.id || '',
      supplier_invoice_no: selectedInvoice.invoice_no || '',
      supplier_challan_no: selectedInvoice.challan_no || '',
      supplier_invoice_date: selectedInvoice.invoice_date || '',
      sr_no: selectedInvoice.sr_no || '',
    })
    // Group rolls by fabric_type → design groups, then by color within each
    const fabricMap = {}
    for (const r of selectedInvoice.rolls) {
      const ft = r.fabric_type || 'Unknown'
      if (!fabricMap[ft]) fabricMap[ft] = { fabric_type: ft, cost_per_unit: r.cost_per_unit != null ? String(r.cost_per_unit) : '', unit: r.unit || 'kg', panna: r.panna != null ? String(r.panna) : '', gsm: r.gsm != null ? String(r.gsm) : '', notes: '', colors: {} }
      const c = r.color || 'Unknown'
      if (!fabricMap[ft].colors[c]) fabricMap[ft].colors[c] = { color: c, weights: [], rollIds: [] }
      const qty = r.unit === 'meters' ? (r.total_length || r.total_weight) : r.total_weight
      fabricMap[ft].colors[c].weights.push(String(qty))
      fabricMap[ft].colors[c].rollIds.push(r.id)
    }
    setDesignGroups(Object.values(fabricMap).map((g) => ({
      fabric_type: g.fabric_type, cost_per_unit: g.cost_per_unit, unit: g.unit, panna: g.panna, gsm: g.gsm, notes: g.notes,
      colorRows: Object.values(g.colors),
    })))
    setFormError(null)
    setSelectedInvoice(null)
    setStockInOpen(true)
  }

  // ── Design group helpers ──
  const setHeader = (k, v) => setInvoiceHeader((h) => ({ ...h, [k]: v }))
  const updateGroup = (gIdx, updater) => setDesignGroups((gs) => gs.map((g, i) => i === gIdx ? updater(g) : g))
  const setGroupField = (gIdx, k, v) => updateGroup(gIdx, (g) => ({ ...g, [k]: v }))
  const addDesignGroup = () => setDesignGroups((gs) => [...gs, { ...EMPTY_GROUP, colorRows: [{ color: '', weights: [''] }] }])
  const removeDesignGroup = (gIdx) => { if (designGroups.length > 1) setDesignGroups((gs) => gs.filter((_, i) => i !== gIdx)) }

  // Color/weight helpers (scoped to design group)
  const setColorName = (gIdx, cIdx, v) => updateGroup(gIdx, (g) => ({
    ...g, colorRows: g.colorRows.map((r, j) => j === cIdx ? { ...r, color: v } : r),
  }))
  const setWeight = (gIdx, cIdx, wIdx, v) => updateGroup(gIdx, (g) => ({
    ...g, colorRows: g.colorRows.map((r, j) => j === cIdx ? { ...r, weights: r.weights.map((w, k) => k === wIdx ? v : w) } : r),
  }))
  const addWeight = (gIdx, cIdx) => updateGroup(gIdx, (g) => ({
    ...g, colorRows: g.colorRows.map((r, j) => j === cIdx ? { ...r, weights: [...r.weights, ''] } : r),
  }))
  const removeWeight = (gIdx, cIdx, wIdx) => updateGroup(gIdx, (g) => ({
    ...g, colorRows: g.colorRows.map((r, j) => j === cIdx ? { ...r, weights: r.weights.length > 1 ? r.weights.filter((_, k) => k !== wIdx) : r.weights } : r),
  }))
  const addColorRow = (gIdx) => updateGroup(gIdx, (g) => ({
    ...g, colorRows: [...g.colorRows, { color: '', weights: [''] }],
  }))
  const removeColorRow = (gIdx, cIdx) => updateGroup(gIdx, (g) => ({
    ...g, colorRows: g.colorRows.length > 1 ? g.colorRows.filter((_, j) => j !== cIdx) : g.colorRows,
  }))
  // Remove empty trailing weight from a color row (used by smart Enter)
  const trimEmptyWeight = (gIdx, cIdx, wIdx) => updateGroup(gIdx, (g) => ({
    ...g, colorRows: g.colorRows.map((r, j) => j === cIdx && r.weights.length > 1 ? { ...r, weights: r.weights.filter((_, k) => k !== wIdx) } : r),
  }))

  const validateStockIn = () => {
    if (!invoiceHeader.supplier_id) return 'Please select a supplier'
    for (let g = 0; g < designGroups.length; g++) {
      const grp = designGroups[g]
      if (!grp.fabric_type.trim()) return `Design ${g + 1}: Fabric type is required`
      for (let i = 0; i < grp.colorRows.length; i++) {
        const r = grp.colorRows[i]
        // Skip completely empty color rows (no color, no weights)
        const hasAnyWeight = r.weights.some((w) => parseFloat(w) > 0)
        if (!r.color.trim() && !hasAnyWeight) continue
        if (!r.color.trim()) return `Design "${grp.fabric_type}", row ${i + 1}: Color name is required`
        if (!hasAnyWeight) return `Design "${grp.fabric_type}", "${r.color}": Enter at least one weight`
      }
    }
    return null
  }

  const handleStockIn = async () => {
    const err = validateStockIn()
    if (err) { setFormError(err); return }
    setSaving(true)
    setFormError(null)
    try {
      // Flatten all design groups → individual roll entries
      const flatRolls = []
      for (const grp of designGroups) {
        const fabricMatch = masterFabrics.find((f) => f.name === grp.fabric_type)
        for (const row of grp.colorRows) {
          const colorMatch = masterColors.find((c) => c.name === row.color)
          for (const w of row.weights) {
            const wt = parseFloat(w)
            if (wt > 0) {
              flatRolls.push({
                fabric_type: grp.fabric_type.trim(),
                color: row.color.trim(),
                quantity: String(wt),
                unit: grp.unit,
                cost_per_unit: grp.cost_per_unit || '',
                panna: grp.panna || '',
                gsm: grp.gsm || '',
                weight: '', length: '', notes: grp.notes || '',
                fabric_code: fabricMatch?.code || null,
                color_code: colorMatch?.code || null,
                color_no: colorMatch?.color_no || null,
              })
            }
          }
        }
      }

      if (editingInvoice) {
        const newRolls = []
        for (const grp of designGroups) {
          const fabricMatch = masterFabrics.find((f) => f.name === grp.fabric_type)
          for (const row of grp.colorRows) {
            const colorMatch = masterColors.find((c) => c.name === row.color)
            let rIdx = 0
            for (const w of row.weights) {
              const wt = parseFloat(w)
              if (wt <= 0) continue
              const existingId = row.rollIds?.[rIdx]
              if (existingId) {
                await updateRoll(existingId, {
                  fabric_type: grp.fabric_type.trim(),
                  color: row.color.trim(),
                  total_weight: grp.unit === 'kg' ? wt : 0,
                  unit: grp.unit,
                  cost_per_unit: grp.cost_per_unit ? parseFloat(grp.cost_per_unit) : null,
                  total_length: grp.unit === 'meters' ? wt : null,
                  supplier_id: invoiceHeader.supplier_id || null,
                  supplier_invoice_no: invoiceHeader.supplier_invoice_no || null,
                  supplier_challan_no: invoiceHeader.supplier_challan_no || null,
                  supplier_invoice_date: invoiceHeader.supplier_invoice_date || null,
                  sr_no: invoiceHeader.sr_no || null,
                  notes: grp.notes || null,
                })
              } else {
                newRolls.push({
                  fabric_type: grp.fabric_type.trim(),
                  color: row.color.trim(),
                  quantity: String(wt),
                  unit: grp.unit,
                  cost_per_unit: grp.cost_per_unit || '',
                  panna: grp.panna || '',
                  gsm: grp.gsm || '',
                  weight: '', length: '', notes: grp.notes || '',
                  fabric_code: fabricMatch?.code || null,
                  color_code: colorMatch?.code || null,
                  color_no: colorMatch?.color_no || null,
                })
              }
              rIdx++
            }
          }
        }
        if (newRolls.length > 0) await stockInBulk(invoiceHeader, newRolls)
      } else {
        await stockInBulk(invoiceHeader, flatRolls)
      }

      setStockInOpen(false)
      setEditingInvoice(null)
      await refreshAll()

      // Fetch fresh rolls from DB by sr_no — gives real roll_codes from backend
      try {
        const filterParams = { page: 1, page_size: 100 }
        if (invoiceHeader.sr_no) filterParams.sr_no = invoiceHeader.sr_no
        const freshResp = await getRolls(filterParams)
        const freshRolls = freshResp?.data?.data || []   // GET /rolls → res.data = { success, data: [...] }
        if (freshRolls.length > 0) {
          setLastSavedRolls(freshRolls)
        }
      } catch (_) { /* non-fatal — labels still available from state */ }
      setShowLabelSheet(true)
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ── Ctrl+S to save stock-in form ──
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && stockInOpen && !saving) {
        e.preventDefault()
        handleStockIn()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [stockInOpen, saving, designGroups, invoiceHeader, editingInvoice])

  // ── Auto-focus supplier field when stock-in overlay opens ──
  useEffect(() => {
    if (stockInOpen) {
      setTimeout(() => {
        document.querySelector('[data-supplier-input]')?.focus()
      }, 100)
    }
  }, [stockInOpen])

  // ── Invoice Detail ──
  const openInvoiceDetail = (inv) => setSelectedInvoice(inv)
  const openRollFromInvoice = (roll) => {
    setCameFromInvoice(selectedInvoice)
    setSelectedInvoice(null)
    setDetailRoll(roll)
    setEditing(false)
    setEditError(null)
  }

  const goBackToInvoice = () => {
    setDetailRoll(null)
    setEditing(false)
    setSelectedInvoice(cameFromInvoice)
    setCameFromInvoice(null)
  }

  // Track which invoice the roll was opened from (for "Back to Invoice" navigation)
  const [cameFromInvoice, setCameFromInvoice] = useState(null)

  // ── Expand/collapse for processed rolls table ──
  const toggleExpand = (rowId) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  const renderExpandedProcessRow = (roll) => {
    const logs = roll.processing_logs || []
    const received = logs.filter((l) => l.status === 'received')
    const totalCost = received.reduce((sum, l) => sum + (l.processing_cost || 0), 0)
    const totalDays = received.reduce((sum, l) => {
      if (!l.sent_date || !l.received_date) return sum
      return sum + Math.max(1, Math.floor((new Date(l.received_date) - new Date(l.sent_date)) / (1000 * 60 * 60 * 24)))
    }, 0)
    const firstBefore = logs[0]?.weight_before ?? null
    const lastAfter = received.length > 0 ? received[received.length - 1]?.weight_after : null
    const netChange = firstBefore != null && lastAfter != null ? lastAfter - firstBefore : null

    return (
      <div className="px-6 py-4 border-t border-purple-100">
        {/* Timeline */}
        <div className="relative">
          {logs.map((log, idx) => {
            const pt = PROCESS_TYPES.find((p) => p.value === log.process_type)
            const c = PROCESS_COLORS[log.process_type] || PROCESS_COLORS.other
            const isReceived = log.status === 'received'
            const days = log.sent_date && log.received_date
              ? Math.max(1, Math.floor((new Date(log.received_date) - new Date(log.sent_date)) / (1000 * 60 * 60 * 24)))
              : null
            const wChange = isReceived && log.weight_before != null && log.weight_after != null
              ? log.weight_after - log.weight_before : null

            return (
              <div key={log.id || idx} className="relative flex gap-4 pb-4 last:pb-0">
                {/* Vertical connector line */}
                {idx < logs.length - 1 && (
                  <div className="absolute left-[11px] top-7 bottom-0 w-0.5 bg-gray-200" />
                )}
                {/* Dot */}
                <div className="relative flex-shrink-0 mt-1">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${isReceived ? c.dot : 'bg-orange-400'}`}>
                    {idx + 1}
                  </div>
                </div>
                {/* Content card */}
                <div className={`flex-1 rounded-lg border p-3 ${isReceived ? 'border-gray-200 bg-white' : 'border-orange-200 bg-orange-50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>
                        {pt?.label || log.process_type}
                      </span>
                      <span className="text-sm text-gray-600 font-medium">{log.vendor_name}</span>
                      {log.vendor_phone && <span className="text-xs text-gray-400">{log.vendor_phone}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {isReceived ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 animate-pulse">
                          In Progress
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditProcLog(roll.id, log) }}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                        title="Edit this processing step"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        Edit
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-1 text-xs">
                    <div><span className="text-gray-400">Sent:</span> <span className="font-medium">{formatDate(log.sent_date)}</span></div>
                    <div><span className="text-gray-400">Received:</span> <span className="font-medium">{isReceived ? formatDate(log.received_date) : '—'}</span></div>
                    {days != null && <div><span className="text-gray-400">Duration:</span> <span className="font-medium">{days}d</span></div>}
                    {isReceived && log.weight_before != null && (
                      <div><span className="text-gray-400">Wt:</span> <span className="font-medium">{log.weight_before} → {log.weight_after} kg</span></div>
                    )}
                    {wChange != null && (
                      <div>
                        <span className="text-gray-400">Change:</span>{' '}
                        <span className={`font-semibold ${wChange < 0 ? 'text-red-600' : wChange > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                          {wChange > 0 ? '+' : ''}{wChange.toFixed(2)} kg
                        </span>
                      </div>
                    )}
                    {isReceived && log.processing_cost != null && (
                      <div><span className="text-gray-400">Cost:</span> <span className="font-semibold text-gray-800">₹{log.processing_cost.toLocaleString('en-IN')}</span></div>
                    )}
                  </div>
                  {log.notes && <p className="mt-1.5 text-xs text-gray-500 italic">{log.notes}</p>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Summary footer (only if 2+ processes completed) */}
        {received.length > 1 && (
          <div className="mt-3 flex items-center gap-6 rounded-lg bg-gray-50 border border-gray-200 px-4 py-2.5 text-xs">
            <span className="font-semibold text-gray-600 uppercase tracking-wider">Total</span>
            <div><span className="text-gray-400">Processes:</span> <span className="font-bold text-gray-800">{logs.length}</span></div>
            <div><span className="text-gray-400">Days:</span> <span className="font-bold text-gray-800">{totalDays}d</span></div>
            {netChange != null && (
              <div>
                <span className="text-gray-400">Net Wt Change:</span>{' '}
                <span className={`font-bold ${netChange < 0 ? 'text-red-600' : netChange > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                  {netChange > 0 ? '+' : ''}{netChange.toFixed(2)} kg
                </span>
              </div>
            )}
            <div><span className="text-gray-400">Total Cost:</span> <span className="font-bold text-gray-800">₹{totalCost.toLocaleString('en-IN')}</span></div>
          </div>
        )}
      </div>
    )
  }

  // ── Edit Processing Log ──
  const openEditProcLog = (rollId, log) => {
    setEditProcRollId(rollId)
    setEditProcLog(log)
    setEditProcForm({
      process_type: log.process_type || '',
      vendor_name: log.vendor_name || '',
      vendor_phone: log.vendor_phone || '',
      sent_date: log.sent_date || '',
      received_date: log.received_date || '',
      weight_after: log.weight_after ?? '',
      length_after: log.length_after ?? '',
      processing_cost: log.processing_cost ?? '',
      notes: log.notes || '',
    })
    setEditProcError(null)
    setEditProcOpen(true)
  }

  const saveEditProcLog = async () => {
    if (!editProcRollId || !editProcLog) return
    setEditProcSaving(true)
    setEditProcError(null)
    try {
      // Only send changed fields
      const payload = {}
      if (editProcForm.process_type && editProcForm.process_type !== editProcLog.process_type) payload.process_type = editProcForm.process_type
      if (editProcForm.vendor_name && editProcForm.vendor_name !== editProcLog.vendor_name) payload.vendor_name = editProcForm.vendor_name
      if (editProcForm.vendor_phone !== (editProcLog.vendor_phone || '')) payload.vendor_phone = editProcForm.vendor_phone || null
      if (editProcForm.sent_date && editProcForm.sent_date !== editProcLog.sent_date) payload.sent_date = editProcForm.sent_date
      if (editProcForm.received_date && editProcForm.received_date !== (editProcLog.received_date || '')) payload.received_date = editProcForm.received_date
      if (editProcForm.weight_after !== '' && editProcForm.weight_after != editProcLog.weight_after) payload.weight_after = parseFloat(editProcForm.weight_after)
      if (editProcForm.length_after !== '' && editProcForm.length_after != editProcLog.length_after) payload.length_after = parseFloat(editProcForm.length_after)
      if (editProcForm.processing_cost !== '' && editProcForm.processing_cost != editProcLog.processing_cost) payload.processing_cost = parseFloat(editProcForm.processing_cost)
      if (editProcForm.notes !== (editProcLog.notes || '')) payload.notes = editProcForm.notes

      if (Object.keys(payload).length === 0) {
        setEditProcOpen(false)
        return
      }

      const res = await updateProcessingLog(editProcRollId, editProcLog.id, payload)
      setEditProcOpen(false)
      // Update detailRoll in-place if the detail modal is showing this roll
      const updatedRoll = res?.data?.data || res?.data
      if (updatedRoll && detailRoll && detailRoll.id === editProcRollId) {
        setDetailRoll(updatedRoll)
      }
      refreshAll()
    } catch (err) {
      setEditProcError(err.response?.data?.detail || 'Failed to update processing log')
    } finally {
      setEditProcSaving(false)
    }
  }

  // ── Roll Detail / Edit ──
  const openRollDetail = (roll) => {
    setCameFromInvoice(null)
    setDetailRoll(roll)
    setEditing(false)
    setEditError(null)
  }

  const startEditing = () => {
    setEditForm({
      fabric_type: detailRoll.fabric_type || '',
      color: detailRoll.color || '',
      total_weight: detailRoll.total_weight ?? '',
      cost_per_unit: detailRoll.cost_per_unit ?? '',
      supplier_id: detailRoll.supplier?.id || '',
      total_length: detailRoll.total_length ?? '',
      unit: detailRoll.unit || 'kg',
      supplier_invoice_no: detailRoll.supplier_invoice_no || '',
      supplier_invoice_date: detailRoll.supplier_invoice_date || '',
      notes: detailRoll.notes || '',
    })
    setEditError(null)
    setEditing(true)
  }

  const handleUpdate = async () => {
    setEditSaving(true)
    setEditError(null)
    try {
      await updateRoll(detailRoll.id, {
        fabric_type: editForm.fabric_type,
        color: editForm.color,
        total_weight: parseFloat(editForm.total_weight) || 0,
        cost_per_unit: editForm.cost_per_unit ? parseFloat(editForm.cost_per_unit) : null,
        total_length: editForm.total_length ? parseFloat(editForm.total_length) : null,
        unit: editForm.unit || 'kg',
        supplier_id: editForm.supplier_id || null,
        supplier_invoice_no: editForm.supplier_invoice_no || null,
        supplier_invoice_date: editForm.supplier_invoice_date || null,
        notes: editForm.notes || null,
      })
      setDetailRoll(null)
      refreshAll()
    } catch (err) {
      setEditError(err.response?.data?.detail || 'Failed to update roll')
    } finally {
      setEditSaving(false)
    }
  }

  // ── Send for Processing ──
  const openSendProcessing = (roll) => {
    setSendProcRoll(roll)
    setSendProcForm({ process_type: 'embroidery', value_addition_id: '', vendor_name: '', vendor_phone: '', sent_date: new Date().toISOString().split('T')[0], notes: '' })
    setSendProcError(null)
    setDetailRoll(null) // close detail modal
    setSendProcOpen(true)
  }

  const handleSendProcessing = async () => {
    if (!sendProcForm.vendor_name.trim()) { setSendProcError('Vendor name is required'); return }
    if (!sendProcForm.sent_date) { setSendProcError('Sent date is required'); return }
    setSendProcSaving(true)
    setSendProcError(null)
    try {
      await sendForProcessing(sendProcRoll.id, {
        process_type: sendProcForm.process_type,
        value_addition_id: sendProcForm.value_addition_id || null,
        vendor_name: sendProcForm.vendor_name.trim(),
        vendor_phone: sendProcForm.vendor_phone.trim() || null,
        sent_date: sendProcForm.sent_date,
        notes: sendProcForm.notes.trim() || null,
      })
      setSendProcOpen(false)
      refreshAll()
    } catch (err) {
      setSendProcError(err.response?.data?.detail || 'Failed to send for processing')
    } finally {
      setSendProcSaving(false)
    }
  }

  // ── Receive from Processing ──
  const openReceiveProcessing = (roll) => {
    const latestLog = roll.processing_logs?.[roll.processing_logs.length - 1]
    if (!latestLog) return
    setRecvProcRoll(roll)
    setRecvProcLog(latestLog)
    setRecvProcForm({ received_date: new Date().toISOString().split('T')[0], weight_after: '', length_after: '', processing_cost: '', notes: '' })
    setRecvProcError(null)
    setDetailRoll(null) // close detail modal
    setRecvProcOpen(true)
  }

  const handleReceiveProcessing = async () => {
    if (!recvProcForm.received_date) { setRecvProcError('Received date is required'); return }
    if (!recvProcForm.weight_after || parseFloat(recvProcForm.weight_after) <= 0) { setRecvProcError('Weight after processing is required'); return }
    setRecvProcSaving(true)
    setRecvProcError(null)
    try {
      await receiveFromProcessing(recvProcRoll.id, recvProcLog.id, {
        received_date: recvProcForm.received_date,
        weight_after: parseFloat(recvProcForm.weight_after),
        length_after: recvProcForm.length_after ? parseFloat(recvProcForm.length_after) : null,
        processing_cost: recvProcForm.processing_cost ? parseFloat(recvProcForm.processing_cost) : null,
        notes: recvProcForm.notes.trim() || null,
      })
      setRecvProcOpen(false)
      refreshAll()
    } catch (err) {
      setRecvProcError(err.response?.data?.detail || 'Failed to receive from processing')
    } finally {
      setRecvProcSaving(false)
    }
  }

  // ── Stock-in totals (across all design groups) ──
  const challanTotals = designGroups.reduce((acc, grp) => {
    const rate = parseFloat(grp.cost_per_unit) || 0
    grp.colorRows.forEach((row) => {
      row.weights.forEach((w) => {
        const wt = parseFloat(w) || 0
        if (wt > 0) { acc.count++; acc.weight += wt; acc.value += wt * rate }
      })
      if (row.color.trim()) acc.colors++
    })
    return acc
  }, { count: 0, weight: 0, value: 0, colors: 0 })

  return (
    <div>
      {/* ── Print Labels Sheet overlay ── */}
      {showLabelSheet && (
        <LabelSheet
          rolls={lastSavedRolls}
          onClose={() => setShowLabelSheet(false)}
        />
      )}

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Rolls</h1>
          <p className="mt-1 text-sm text-gray-500">Raw material stock — fabric rolls</p>
        </div>
        <div className="flex items-center gap-2">
          {lastSavedRolls.length > 0 && (
            <button
              onClick={() => setShowLabelSheet(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Labels ({lastSavedRolls.length})
            </button>
          )}
          <button onClick={openStockIn} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Stock In
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="mt-5 flex items-center gap-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
            </svg>
            {t.label}
            {t.key === 'processing' && procRolls.length > 0 && (
              <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                {procRolls.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      {/* ════════════════════════════════════════════
          TAB 1: BY INVOICE
         ════════════════════════════════════════════ */}
      {tab === 'invoices' && (
        <div>
          <div className="mt-4 max-w-sm">
            <SearchInput value={invSearch} onChange={(v) => { setInvSearch(v); setInvPage(1) }} placeholder="Search by invoice, supplier, fabric..." />
          </div>
          <div className="mt-4">
            <DataTable columns={INVOICE_COLUMNS} data={invoices} loading={invLoading} onRowClick={openInvoiceDetail} emptyText="No invoices found." />
            <Pagination page={invPage} pages={invPages} total={invTotal} onChange={setInvPage} />
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          TAB 2: ALL ROLLS
         ════════════════════════════════════════════ */}
      {tab === 'rolls' && (() => {
        const STATUS_PILLS = [
          { key: 'all', label: 'All', active: 'bg-gray-200 text-gray-800 ring-1 ring-gray-300' },
          { key: 'in_stock', label: 'In Stock', active: 'bg-green-100 text-green-700 ring-1 ring-green-300' },
          { key: 'in_stock_fresh', label: 'Fresh (No Process)', active: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300' },
          { key: 'in_stock_processed', label: 'Processed & Returned', active: 'bg-purple-100 text-purple-700 ring-1 ring-purple-300' },
          { key: 'sent_for_processing', label: 'In Processing', active: 'bg-orange-100 text-orange-700 ring-1 ring-orange-300' },
          { key: 'in_cutting', label: 'In Cutting', active: 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' },
        ]
        const AVAIL_PILLS = [
          { key: 'all', label: 'All', active: 'bg-gray-200 text-gray-800 ring-1 ring-gray-300' },
          { key: 'available', label: 'Has Stock', active: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300' },
          { key: 'consumed', label: 'Fully Used', active: 'bg-red-100 text-red-700 ring-1 ring-red-300' },
        ]
        // Use master fabrics for filter dropdown
        const uniqueFabrics = masterFabrics.map((f) => f.name)
        const activeFilterCount = [rollStatusFilter !== 'all', rollAvailFilter !== 'all', !!rollSupplierFilter, !!rollFabricFilter, !!rollProcessFilter].filter(Boolean).length

        return (
          <div>
            {/* ── Filter toolbar ── */}
            <div className="mt-4 space-y-3">
              {/* Row 1: Status pills + Availability pills */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-400 uppercase mr-1">Status:</span>
                  {STATUS_PILLS.map((p) => (
                    <button key={p.key} onClick={() => { setRollStatusFilter(p.key); setRollPage(1) }}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        rollStatusFilter === p.key ? p.active : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >{p.label}</button>
                  ))}
                </div>
                <div className="h-5 w-px bg-gray-200" />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-400 uppercase mr-1">Stock:</span>
                  {AVAIL_PILLS.map((p) => (
                    <button key={p.key} onClick={() => { setRollAvailFilter(p.key); setRollPage(1) }}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        rollAvailFilter === p.key ? p.active : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >{p.label}</button>
                  ))}
                </div>
              </div>

              {/* Row 2: Dropdowns + Search + Clear */}
              <div className="flex flex-wrap items-center gap-3">
                <select value={rollSupplierFilter} onChange={(e) => { setRollSupplierFilter(e.target.value); setRollPage(1) }}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                  <option value="">All Suppliers</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={rollFabricFilter} onChange={(e) => { setRollFabricFilter(e.target.value); setRollPage(1) }}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                  <option value="">All Fabrics</option>
                  {uniqueFabrics.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={rollProcessFilter} onChange={(e) => { setRollProcessFilter(e.target.value); setRollPage(1) }}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                  <option value="">All Processes</option>
                  <option value="none">No Processing</option>
                  {PROCESS_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <div className="flex-1 max-w-sm">
                  <SearchInput value={rollSearch} onChange={(v) => { setRollSearch(v); setRollPage(1) }} placeholder="Search code, color, invoice..." />
                </div>
                {activeFilterCount > 0 && (
                  <button onClick={() => { setRollStatusFilter('all'); setRollAvailFilter('all'); setRollSupplierFilter(''); setRollFabricFilter(''); setRollProcessFilter(''); setRollSearch(''); setRollPage(1) }}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                  </button>
                )}
              </div>
            </div>

            {/* ── Table ── */}
            <div className="mt-4">
              {rollStatusFilter === 'in_stock_processed' ? (
                <DataTable
                  columns={PROCESSED_COLUMNS}
                  data={rolls}
                  loading={rollLoading}
                  onRowClick={openRollDetail}
                  emptyText="No processed rolls found."
                  expandedRows={expandedRows}
                  onToggleExpand={toggleExpand}
                  renderExpanded={renderExpandedProcessRow}
                />
              ) : (
                <DataTable columns={ROLL_COLUMNS} data={rolls} loading={rollLoading} onRowClick={openRollDetail} emptyText="No rolls found." />
              )}
              <Pagination page={rollPage} pages={rollPages} total={rollTotal} onChange={setRollPage} />
            </div>
          </div>
        )
      })()}

      {/* ════════════════════════════════════════════
          TAB 3: IN PROCESSING
         ════════════════════════════════════════════ */}
      {tab === 'processing' && (() => {
        // Client-side filters on procRolls (already fully loaded)
        const getLatestLog = (r) => r.processing_logs?.[r.processing_logs.length - 1]
        const getDaysOut = (log) => log?.sent_date ? Math.floor((Date.now() - new Date(log.sent_date).getTime()) / (1000 * 60 * 60 * 24)) : 0

        // Extract unique vendors and process types from data
        const uniqueVendors = [...new Set(procRolls.map((r) => getLatestLog(r)?.vendor_name).filter(Boolean))].sort()
        const uniqueProcTypes = [...new Set(procRolls.map((r) => getLatestLog(r)?.process_type).filter(Boolean))]

        // Apply filters
        let filtered = [...procRolls]
        if (procProcessFilter) filtered = filtered.filter((r) => getLatestLog(r)?.process_type === procProcessFilter)
        if (procVendorFilter) filtered = filtered.filter((r) => getLatestLog(r)?.vendor_name === procVendorFilter)
        if (procDaysFilter === 'overdue') filtered = filtered.filter((r) => getDaysOut(getLatestLog(r)) > 14)
        if (procDaysFilter === 'week') filtered = filtered.filter((r) => getDaysOut(getLatestLog(r)) <= 7)
        if (procDaysFilter === '7to14') filtered = filtered.filter((r) => { const d = getDaysOut(getLatestLog(r)); return d > 7 && d <= 14 })
        if (procSearch) {
          const q = procSearch.toLowerCase()
          filtered = filtered.filter((r) =>
            r.roll_code.toLowerCase().includes(q) ||
            r.fabric_type?.toLowerCase().includes(q) ||
            r.color?.toLowerCase().includes(q) ||
            (getLatestLog(r)?.vendor_name || '').toLowerCase().includes(q)
          )
        }

        const procActiveFilters = [!!procProcessFilter, !!procVendorFilter, procDaysFilter !== 'all', !!procSearch].filter(Boolean).length

        // KPIs from ALL procRolls (unfiltered)
        const totalWeight = procRolls.reduce((s, r) => s + parseFloat(r.total_weight || 0), 0)
        const vendorCount = uniqueVendors.length
        const overdueCount = procRolls.filter((r) => getDaysOut(getLatestLog(r)) > 14).length

        return (
          <div>
            {/* Summary cards */}
            {!procLoading && procRolls.length > 0 && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg bg-orange-50 border border-orange-100 p-3">
                  <div className="text-2xl font-bold text-orange-700">{procRolls.length}</div>
                  <div className="text-xs text-orange-500">Rolls Out</div>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                  <div className="text-2xl font-bold text-blue-700">{totalWeight.toFixed(3)} kg</div>
                  <div className="text-xs text-blue-500">Total Weight</div>
                </div>
                <div className="rounded-lg bg-purple-50 border border-purple-100 p-3">
                  <div className="text-2xl font-bold text-purple-700">{vendorCount}</div>
                  <div className="text-xs text-purple-500">Vendors</div>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                  <div className="text-2xl font-bold text-red-700">{overdueCount}</div>
                  <div className="text-xs text-red-500">Overdue (&gt;14 days)</div>
                </div>
              </div>
            )}

            {/* ── Filter toolbar ── */}
            {!procLoading && procRolls.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <select value={procProcessFilter} onChange={(e) => setProcProcessFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                  <option value="">All Process Types</option>
                  {uniqueProcTypes.map((pt) => {
                    const label = PROCESS_TYPES.find((p) => p.value === pt)?.label || pt
                    return <option key={pt} value={pt}>{label}</option>
                  })}
                </select>
                <select value={procVendorFilter} onChange={(e) => setProcVendorFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                  <option value="">All Vendors</option>
                  {uniqueVendors.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-400 uppercase mr-1">Duration:</span>
                  {[
                    { key: 'all', label: 'All', active: 'bg-gray-200 text-gray-800 ring-1 ring-gray-300' },
                    { key: 'week', label: '≤ 7 days', active: 'bg-green-100 text-green-700 ring-1 ring-green-300' },
                    { key: '7to14', label: '8–14 days', active: 'bg-amber-100 text-amber-700 ring-1 ring-amber-300' },
                    { key: 'overdue', label: '> 14 days', active: 'bg-red-100 text-red-700 ring-1 ring-red-300' },
                  ].map((p) => (
                    <button key={p.key} onClick={() => setProcDaysFilter(p.key)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        procDaysFilter === p.key ? p.active : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >{p.label}</button>
                  ))}
                </div>
                <div className="flex-1 max-w-xs">
                  <SearchInput value={procSearch} onChange={setProcSearch} placeholder="Search code, color, vendor..." />
                </div>
                {procActiveFilters > 0 && (
                  <button onClick={() => { setProcProcessFilter(''); setProcVendorFilter(''); setProcDaysFilter('all'); setProcSearch('') }}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    Clear {procActiveFilters} filter{procActiveFilters > 1 ? 's' : ''}
                  </button>
                )}
              </div>
            )}

            {/* ── Filtered count ── */}
            {procActiveFilters > 0 && filtered.length !== procRolls.length && (
              <div className="mt-2 text-xs text-gray-400">
                Showing {filtered.length} of {procRolls.length} roll{procRolls.length > 1 ? 's' : ''}
              </div>
            )}

            <div className="mt-4">
              <DataTable columns={PROCESSING_COLUMNS} data={filtered} loading={procLoading} onRowClick={openRollDetail}
                emptyText={
                  procActiveFilters > 0
                    ? <div className="py-6 text-center">
                        <p className="text-sm text-gray-500">No rolls match the current filters</p>
                        <button onClick={() => { setProcProcessFilter(''); setProcVendorFilter(''); setProcDaysFilter('all'); setProcSearch('') }}
                          className="mt-2 text-xs font-medium text-primary-600 hover:text-primary-700">Clear all filters</button>
                      </div>
                    : <div className="py-6 text-center">
                        <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="mt-2 text-sm text-gray-500">No rolls currently out for processing</p>
                        <p className="text-xs text-gray-400">Send a roll for processing from the roll detail view</p>
                      </div>
                }
              />
            </div>
          </div>
        )
      })()}

      {/* ════════════════════════════════════════════════════════
          INVOICE DETAIL Modal
         ════════════════════════════════════════════════════════ */}
      <Modal open={!!selectedInvoice} onClose={() => setSelectedInvoice(null)}
        title={selectedInvoice?.invoice_no ? `Invoice: ${selectedInvoice.invoice_no}` : 'Invoice Details'} extraWide
        actions={
          <div className="flex w-full items-center justify-between">
            <div>
              {isInvoiceEditable(selectedInvoice) && (
                <button onClick={openEditInvoice}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Invoice
                </button>
              )}
              {selectedInvoice && !isInvoiceEditable(selectedInvoice) && (
                <span className="text-xs text-gray-400 italic">Some rolls are used — invoice is read-only</span>
              )}
            </div>
            <button onClick={() => setSelectedInvoice(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Close</button>
          </div>
        }
      >
        {selectedInvoice && (() => {
          // Group rolls by fabric_type → then by color within each group
          const fabricGroups = []
          const fabricMap = {}
          for (const roll of selectedInvoice.rolls) {
            const fabric = roll.fabric_type || 'Unknown'
            if (!fabricMap[fabric]) {
              fabricMap[fabric] = { fabric, rolls: [], colorMap: {}, unit: roll.unit || 'kg', cost_per_unit: roll.cost_per_unit, notes: roll.notes }
              fabricGroups.push(fabricMap[fabric])
            }
            const grp = fabricMap[fabric]
            grp.rolls.push(roll)
            const color = roll.color || 'Unknown'
            if (!grp.colorMap[color]) grp.colorMap[color] = []
            grp.colorMap[color].push(roll)
          }
          // Unique colors across all groups
          const allColors = new Set(selectedInvoice.rolls.map((r) => r.color || 'Unknown'))

          return (
            <div className="space-y-4">
              {/* ── Compact Invoice Header ── */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <div>
                  <span className="text-gray-400">Supplier:</span>{' '}
                  <span className="font-semibold text-gray-800">{selectedInvoice.supplier?.name || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Challan No.:</span>{' '}
                  <span className="font-semibold text-gray-800">{selectedInvoice.invoice_no || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Date:</span>{' '}
                  <span className="font-medium text-gray-700">
                    {selectedInvoice.invoice_date ? new Date(selectedInvoice.invoice_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Received:</span>{' '}
                  <span className="font-medium text-gray-700">
                    {selectedInvoice.received_at ? new Date(selectedInvoice.received_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </span>
                </div>
              </div>

              {/* ── KPI Summary Pills (matching entry top-bar style) ── */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                  {selectedInvoice.roll_count} roll{selectedInvoice.roll_count > 1 ? 's' : ''}
                </span>
                <span className="rounded-full bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700">
                  {allColors.size} color{allColors.size > 1 ? 's' : ''}
                </span>
                <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
                  {fabricGroups.length} design{fabricGroups.length > 1 ? 's' : ''}
                </span>
                <span className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                  {selectedInvoice.total_weight.toFixed(3)} kg
                </span>
                <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                  ₹{selectedInvoice.total_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* ── Design Groups ── */}
              {fabricGroups.map((grp, gIdx) => {
                const grpWeight = grp.rolls.reduce((s, r) => s + (parseFloat(r.total_weight) || 0), 0)
                const grpValue = grp.rolls.reduce((s, r) => s + (parseFloat(r.total_weight) || 0) * (parseFloat(r.cost_per_unit) || 0), 0)
                const colorEntries = Object.entries(grp.colorMap)

                return (
                  <div key={gIdx} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    {/* Design group header bar — matches entry style */}
                    <div className="flex items-center justify-between bg-blue-50 border-b border-blue-100 px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{gIdx + 1}</span>
                        <span className="text-sm font-semibold text-blue-800">{grp.fabric}</span>
                        <span className="text-xs text-blue-500">
                          {grp.rolls.length} roll{grp.rolls.length > 1 ? 's' : ''} · {grpWeight.toFixed(3)} {grp.unit}
                          {grpValue > 0 ? ` · ₹${grpValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : ''}
                        </span>
                      </div>
                      {grp.cost_per_unit > 0 && (
                        <span className="text-xs text-blue-500">Rate: ₹{grp.cost_per_unit}/{grp.unit}</span>
                      )}
                    </div>

                    {/* Color-wise weight grid */}
                    <div className="p-4">
                      {/* Grid header */}
                      <div className="rounded-t-lg border border-b-0 border-gray-200 bg-gray-100 px-4 py-2 grid grid-cols-[140px_1fr_60px_80px] gap-3 items-center">
                        <span className="text-xs font-semibold text-gray-500 uppercase">Color</span>
                        <span className="text-xs font-semibold text-gray-500 uppercase">Roll Weights ({grp.unit})</span>
                        <span className="text-xs font-semibold text-gray-500 uppercase text-center">Rolls</span>
                        <span className="text-xs font-semibold text-gray-500 uppercase text-right">Total</span>
                      </div>

                      {/* Color rows */}
                      <div className="border border-gray-200 rounded-b-lg divide-y divide-gray-100 bg-white">
                        {colorEntries.map(([color, colorRolls]) => {
                          const colorWeight = colorRolls.reduce((s, r) => s + (parseFloat(r.total_weight) || 0), 0)
                          return (
                            <div key={color} className="px-4 py-2.5 grid grid-cols-[140px_1fr_60px_80px] gap-3 items-center hover:bg-gray-50/50">
                              {/* Color name */}
                              <span className="text-sm font-medium text-gray-800">{color}</span>

                              {/* Individual roll weight cells — clickable */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                {colorRolls.map((roll) => {
                                  const wt = parseFloat(roll.total_weight) || 0
                                  const rem = parseFloat(roll.remaining_weight) || 0
                                  const isUsed = wt > 0 && rem < wt
                                  const isProcessing = roll.status === 'sent_for_processing'
                                  return (
                                    <button
                                      key={roll.id}
                                      onClick={() => openRollFromInvoice(roll)}
                                      title={`${roll.roll_code} — ${wt} ${grp.unit}${isUsed ? ` (${rem} remaining)` : ''}${isProcessing ? ' [Processing]' : ''}`}
                                      className={`relative inline-flex items-center rounded border px-2.5 py-1 text-sm tabular-nums transition-colors cursor-pointer
                                        ${isProcessing
                                          ? 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100'
                                          : isUsed
                                            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                            : 'border-gray-300 bg-white text-gray-800 hover:bg-blue-50 hover:border-blue-300'}`}
                                    >
                                      {wt.toFixed(3)}
                                      {isProcessing && (
                                        <span className="ml-1 h-1.5 w-1.5 rounded-full bg-orange-500 inline-block" />
                                      )}
                                      {isUsed && !isProcessing && (
                                        <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-500 inline-block" />
                                      )}
                                    </button>
                                  )
                                })}
                              </div>

                              {/* Roll count badge */}
                              <div className="text-center">
                                <span className="inline-flex items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                  {colorRolls.length}
                                </span>
                              </div>

                              {/* Row total */}
                              <div className="text-right text-sm font-medium text-gray-700">
                                {colorWeight.toFixed(3)} {grp.unit}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Group footer — totals */}
                      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                        <div className="flex items-center gap-3">
                          {grp.notes && <span className="italic">{grp.notes}</span>}
                        </div>
                        <div className="flex items-center gap-4">
                          <span>{grp.rolls.length} roll{grp.rolls.length > 1 ? 's' : ''}</span>
                          <span className="font-medium text-gray-700">{grpWeight.toFixed(3)} {grp.unit}</span>
                          {grpValue > 0 && <span className="font-medium text-gray-700">₹{grpValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* ── Legend ── */}
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>Click any weight to view roll details</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-orange-500 inline-block" /> Processing</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500 inline-block" /> Partially used</span>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* ════════════════════════════════════════════════════════
          STOCK IN — Full-page challan entry
         ════════════════════════════════════════════════════════ */}
      {stockInOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
          {/* ── Top bar (sticky) ── */}
          <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => { setStockInOpen(false); setEditingInvoice(null) }}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <h1 className="text-lg font-bold text-gray-800">
                  {editingInvoice ? `Edit Invoice: ${editingInvoice.invoice_no || '—'}` : 'Stock In — Challan Entry'}
                </h1>
              </div>
              <div className="flex items-center gap-4">
                {/* Live totals */}
                {challanTotals.count > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      {challanTotals.count} roll{challanTotals.count > 1 ? 's' : ''}
                    </span>
                    <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                      {challanTotals.weight.toFixed(3)} kg
                    </span>
                    {challanTotals.colors > 0 && (
                      <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
                        {challanTotals.colors} color{challanTotals.colors > 1 ? 's' : ''}
                      </span>
                    )}
                    {challanTotals.value > 0 && (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        ₹{challanTotals.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>
                )}
                <button onClick={() => { setStockInOpen(false); setEditingInvoice(null) }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={handleStockIn} disabled={saving || challanTotals.count === 0}
                  className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                  {saving ? 'Saving...' : editingInvoice ? 'Save Changes' : `Stock In ${challanTotals.count} Roll${challanTotals.count > 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="mx-auto max-w-6xl space-y-5">
              {formError && <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />}

              {/* ── Invoice Header ── */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Invoice / Challan Details</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="col-span-2 md:col-span-1">
                    <label className={LABEL_CLS}>Supplier <span className="text-red-500">*</span></label>
                    <select data-supplier-input="true" value={invoiceHeader.supplier_id} onChange={(e) => setHeader('supplier_id', e.target.value)} className={INPUT_CLS}>
                      <option value="">Select supplier</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Invoice No.</label>
                    <input type="text" value={invoiceHeader.supplier_invoice_no} onChange={(e) => setHeader('supplier_invoice_no', e.target.value)}
                      placeholder="Supplier inv." className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Challan No.</label>
                    <input type="text" value={invoiceHeader.supplier_challan_no} onChange={(e) => setHeader('supplier_challan_no', e.target.value)}
                      placeholder="Supplier challan" className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Date</label>
                    <input type="date" value={invoiceHeader.supplier_invoice_date} onChange={(e) => setHeader('supplier_invoice_date', e.target.value)}
                      className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Sr. No.</label>
                    <div className="relative">
                      <input type="text" value={invoiceHeader.sr_no} onChange={(e) => setHeader('sr_no', e.target.value)}
                        className={`${INPUT_CLS} font-bold text-primary-700 bg-primary-50`} />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">Filing</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Design Groups ── */}
              {designGroups.map((grp, gIdx) => {
                const grpTotals = grp.colorRows.reduce((acc, row) => {
                  row.weights.forEach((w) => { const wt = parseFloat(w) || 0; if (wt > 0) { acc.count++; acc.weight += wt } })
                  return acc
                }, { count: 0, weight: 0 })
                const grpValue = grpTotals.weight * (parseFloat(grp.cost_per_unit) || 0)

                return (
                  <div key={gIdx} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    {/* Design header bar */}
                    <div className="flex items-center justify-between bg-blue-50 border-b border-blue-100 px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{gIdx + 1}</span>
                        <span className="text-sm font-semibold text-blue-800">
                          {grp.fabric_type.trim() || `Design ${gIdx + 1}`}
                        </span>
                        {grpTotals.count > 0 && (
                          <span className="text-xs text-blue-500">
                            {grpTotals.count} roll{grpTotals.count > 1 ? 's' : ''} · {grpTotals.weight.toFixed(3)} {grp.unit}
                            {grpValue > 0 ? ` · ₹${grpValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : ''}
                          </span>
                        )}
                      </div>
                      {designGroups.length > 1 && (
                        <button onClick={() => removeDesignGroup(gIdx)}
                          className="rounded p-1 text-blue-400 hover:bg-blue-100 hover:text-red-500">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>

                    <div className="p-5 space-y-5">
                      {/* Fabric / Panna / GSM / Rate / Unit / Notes row */}
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                        <div>
                          <label className={LABEL_CLS}>Fabric / Design <span className="text-red-500">*</span></label>
                          <select data-fabric-input="true" value={grp.fabric_type} onChange={(e) => setGroupField(gIdx, 'fabric_type', e.target.value)} className={INPUT_CLS}>
                            <option value="">Select fabric</option>
                            {masterFabrics.map((f) => <option key={f.id} value={f.name}>{f.name} ({f.code})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={LABEL_CLS}>Panna (″)</label>
                          <input type="number" step="0.5" value={grp.panna} onChange={(e) => setGroupField(gIdx, 'panna', e.target.value)}
                            placeholder="e.g. 44" className={INPUT_CLS} />
                        </div>
                        <div>
                          <label className={LABEL_CLS}>GSM</label>
                          <input type="number" step="1" value={grp.gsm} onChange={(e) => setGroupField(gIdx, 'gsm', e.target.value)}
                            placeholder="e.g. 180" className={INPUT_CLS} />
                        </div>
                        <div>
                          <label className={LABEL_CLS}>Rate / {grp.unit} (₹)</label>
                          <input type="number" step="0.01" value={grp.cost_per_unit} onChange={(e) => setGroupField(gIdx, 'cost_per_unit', e.target.value)}
                            placeholder="e.g. 221" className={INPUT_CLS} />
                        </div>
                        <div>
                          <label className={LABEL_CLS}>Unit</label>
                          <select value={grp.unit} onChange={(e) => setGroupField(gIdx, 'unit', e.target.value)} className={INPUT_CLS}>
                            <option value="kg">kg</option>
                            <option value="meters">meters</option>
                          </select>
                        </div>
                        <div>
                          <label className={LABEL_CLS}>Notes</label>
                          <input type="text" value={grp.notes} onChange={(e) => setGroupField(gIdx, 'notes', e.target.value)}
                            placeholder="Optional" className={INPUT_CLS} />
                        </div>
                      </div>

                      {/* Color-wise weight grid */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            Color-wise Rolls <span className="font-normal normal-case text-gray-400 ml-1">(Enter on empty = new color)</span>
                          </span>
                          <button onClick={() => addColorRow(gIdx)} className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Add Color
                          </button>
                        </div>

                        {/* Grid header */}
                        <div className="rounded-t-lg border border-b-0 border-gray-200 bg-gray-100 px-4 py-2 grid grid-cols-[180px_1fr_70px] gap-3 items-center">
                          <span className="text-xs font-semibold text-gray-500 uppercase">Color</span>
                          <span className="text-xs font-semibold text-gray-500 uppercase">Weights ({grp.unit}) — Enter/Tab between fields</span>
                          <span className="text-xs font-semibold text-gray-500 uppercase text-center">Rolls</span>
                        </div>

                        {/* Grid rows */}
                        <div className="border border-gray-200 rounded-b-lg divide-y divide-gray-100 bg-white" data-design-group={gIdx}>
                          {grp.colorRows.map((row, cIdx) => {
                            const validCount = row.weights.filter((w) => parseFloat(w) > 0).length
                            const rowWeight = row.weights.reduce((s, w) => s + (parseFloat(w) || 0), 0)
                            return (
                              <div key={cIdx} className="px-4 py-2.5 grid grid-cols-[180px_1fr_70px] gap-3 items-start group hover:bg-gray-50/50">
                                {/* Color name */}
                                <div className="flex items-center gap-1.5">
                                  <select
                                    data-color-input="true"
                                    value={row.color}
                                    onChange={(e) => setColorName(gIdx, cIdx, e.target.value)}
                                    className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm font-medium focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                    onKeyDown={(e) => {
                                      const hasData = row.weights.some((w) => w !== '')
                                      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                                        e.preventDefault()
                                        // Empty color + no weights → new design group
                                        if (row.color === '' && !hasData) {
                                          if (grp.colorRows.length > 1) removeColorRow(gIdx, cIdx)
                                          addDesignGroup()
                                          setTimeout(() => {
                                            const allGroups = document.querySelectorAll('[data-design-group]')
                                            const lastGroup = allGroups[allGroups.length - 1]?.closest('.rounded-xl')
                                            const fabricInput = lastGroup?.querySelector('[data-fabric-input]')
                                            fabricInput?.focus()
                                            fabricInput?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                          }, 60)
                                          return
                                        }
                                        // Has color → focus first weight
                                        if (row.color) {
                                          const gridRow = e.target.closest('.group')
                                          const firstWeight = gridRow?.querySelector('input[data-weight]')
                                          firstWeight?.focus()
                                        }
                                      }
                                      // Backspace or Shift+Tab on empty color → delete row, jump back to previous row's last weight
                                      if ((e.key === 'Backspace' || (e.key === 'Tab' && e.shiftKey)) && row.color === '' && !hasData && cIdx > 0) {
                                        e.preventDefault()
                                        removeColorRow(gIdx, cIdx)
                                        setTimeout(() => {
                                          const groupEl = document.querySelector(`[data-design-group="${gIdx}"]`)
                                          const prevRow = groupEl?.querySelectorAll('.group')?.[cIdx - 1]
                                          const allW = prevRow?.querySelectorAll('input[data-weight]')
                                          allW?.[allW.length - 1]?.focus()
                                        }, 60)
                                      }
                                    }}
                                  >
                                    <option value="">{cIdx === 0 ? 'Select color' : 'Color'}</option>
                                    {masterColors.map((c) => <option key={c.id} value={c.name}>{c.name}{c.color_no ? ` (${String(c.color_no).padStart(2, '0')})` : ''}</option>)}
                                  </select>
                                  {grp.colorRows.length > 1 && (
                                    <button onClick={() => removeColorRow(gIdx, cIdx)} title="Remove color"
                                      className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-gray-300 hover:text-red-500 transition-opacity flex-shrink-0">
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                  )}
                                </div>

                                {/* Weight inputs */}
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {row.weights.map((w, wIdx) => (
                                    <div key={wIdx} className="relative">
                                      <input
                                        data-weight="true"
                                        type="number"
                                        step="0.001"
                                        value={w}
                                        onChange={(e) => setWeight(gIdx, cIdx, wIdx, e.target.value)}
                                        placeholder="0.000"
                                        className="w-[90px] rounded border border-gray-300 px-2 py-1.5 text-sm text-center tabular-nums focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                                            e.preventDefault()

                                            // SMART ENTER: empty last weight → new color row
                                            if (w === '' && wIdx === row.weights.length - 1) {
                                              // Remove this empty trailing weight (if not the only one)
                                              if (row.weights.length > 1) trimEmptyWeight(gIdx, cIdx, wIdx)
                                              // Add new color row and focus its color input
                                              addColorRow(gIdx)
                                              setTimeout(() => {
                                                const groupEl = document.querySelector(`[data-design-group="${gIdx}"]`)
                                                const allColorInputs = groupEl?.querySelectorAll('[data-color-input]')
                                                allColorInputs?.[allColorInputs.length - 1]?.focus()
                                              }, 60)
                                              return
                                            }

                                            if (wIdx === row.weights.length - 1) {
                                              // Last filled weight → add new weight field
                                              addWeight(gIdx, cIdx)
                                              setTimeout(() => {
                                                const gridRow = e.target.closest('.group')
                                                const allW = gridRow?.querySelectorAll('input[data-weight]')
                                                allW?.[allW.length - 1]?.focus()
                                              }, 60)
                                            } else {
                                              // Focus next weight in this row
                                              const wrapper = e.target.closest('.flex-wrap')
                                              const allW = wrapper?.querySelectorAll('input[data-weight]')
                                              allW?.[wIdx + 1]?.focus()
                                            }
                                          }
                                          // Backspace on empty → remove weight, focus previous
                                          if (e.key === 'Backspace' && w === '' && row.weights.length > 1) {
                                            e.preventDefault()
                                            removeWeight(gIdx, cIdx, wIdx)
                                            setTimeout(() => {
                                              const gridRow = e.target.closest('.group')
                                              const allW = gridRow?.querySelectorAll('input[data-weight]')
                                              const target = allW?.[Math.max(0, wIdx - 1)]
                                              target?.focus()
                                            }, 60)
                                          }
                                        }}
                                      />
                                      {row.weights.length > 1 && (
                                        <button onClick={() => removeWeight(gIdx, cIdx, wIdx)}
                                          className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[10px] leading-none hover:bg-red-600">
                                          ×
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  <button onClick={() => addWeight(gIdx, cIdx)} title="Add weight"
                                    className="flex h-[34px] w-[34px] items-center justify-center rounded border border-dashed border-gray-300 text-gray-400 hover:border-primary-400 hover:text-primary-600 transition-colors">
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                  </button>
                                </div>

                                {/* Roll count + row weight */}
                                <div className="text-center">
                                  <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
                                    validCount > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                                  }`}>
                                    {validCount}
                                  </span>
                                  {rowWeight > 0 && (
                                    <div className="text-[10px] text-gray-400 mt-0.5">{rowWeight.toFixed(1)}</div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Add another design group */}
              <button onClick={addDesignGroup}
                className="w-full rounded-xl border-2 border-dashed border-gray-300 py-4 text-sm font-medium text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors">
                + Add Another Design / Fabric
              </button>

              {/* Grand total summary */}
              {challanTotals.count > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center gap-6 text-sm">
                    <div>
                      <span className="text-gray-500">Total Rolls</span>
                      <div className="text-xl font-bold text-gray-800">{challanTotals.count}</div>
                    </div>
                    <div className="h-10 w-px bg-gray-200" />
                    <div>
                      <span className="text-gray-500">Total Weight</span>
                      <div className="text-xl font-bold text-gray-800">{challanTotals.weight.toFixed(3)} kg</div>
                    </div>
                    <div className="h-10 w-px bg-gray-200" />
                    <div>
                      <span className="text-gray-500">Colors</span>
                      <div className="text-xl font-bold text-gray-800">{challanTotals.colors}</div>
                    </div>
                    <div className="h-10 w-px bg-gray-200" />
                    <div>
                      <span className="text-gray-500">Designs</span>
                      <div className="text-xl font-bold text-gray-800">{designGroups.length}</div>
                    </div>
                    {challanTotals.value > 0 && (
                      <>
                        <div className="h-10 w-px bg-gray-200" />
                        <div>
                          <span className="text-gray-500">Total Value</span>
                          <div className="text-xl font-bold text-green-700">₹{challanTotals.value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Keyboard hints */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 pb-2">
                <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Enter</kbd> Next weight</span>
                <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Enter</kbd> on empty weight = New color row</span>
                <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Backspace</kbd> on empty = Go back</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          ROLL DETAIL / EDIT Modal
         ════════════════════════════════════════════════════════ */}
      <Modal open={!!detailRoll} onClose={() => { setDetailRoll(null); setEditing(false); setCameFromInvoice(null) }}
        title={detailRoll ? `${detailRoll.enhanced_roll_code || detailRoll.roll_code} — ${editing ? 'Edit' : 'Details'}` : ''} extraWide
        actions={
          editing ? (
            <>
              <button onClick={() => setEditing(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleUpdate} disabled={editSaving}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <div className="flex w-full items-center justify-between">
              <div className="flex gap-2">
                {detailRoll?.status === 'in_stock' && (
                  <button onClick={() => openSendProcessing(detailRoll)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100 transition-colors">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Send for Processing
                  </button>
                )}
                {detailRoll?.status === 'sent_for_processing' && (
                  <button onClick={() => openReceiveProcessing(detailRoll)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Receive Back
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setDetailRoll(null); setCameFromInvoice(null) }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Close</button>
                {isEditable && (
                  <button onClick={startEditing}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit Roll
                  </button>
                )}
              </div>
            </div>
          )
        }
      >
        {detailRoll && (() => {
          const unitLabel = detailRoll.unit === 'meters' ? 'm' : 'kg'
          const totalQty = detailRoll.unit === 'meters' ? (detailRoll.total_length || detailRoll.total_weight) : detailRoll.total_weight
          const remainQty = detailRoll.unit === 'meters' ? (detailRoll.remaining_length ?? detailRoll.remaining_weight) : detailRoll.remaining_weight
          const pct = totalQty > 0 ? (remainQty / totalQty) * 100 : 0
          const totalValue = (parseFloat(detailRoll.total_weight) || 0) * (parseFloat(detailRoll.cost_per_unit) || 0)
          const procLogs = detailRoll.processing_logs || []
          return (
            <div className="space-y-5">
              {/* Back to Invoice nav */}
              {cameFromInvoice && !editing && (
                <button onClick={goBackToInvoice}
                  className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium -mt-1">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Invoice: {cameFromInvoice.invoice_no || 'Details'}
                </button>
              )}

              {editing ? (
                <RollForm form={editForm} onChange={setEditForm} suppliers={suppliers}
                  error={editError} onDismissError={() => setEditError(null)} />
              ) : (
                <>
                  {/* Non-editable warning */}
                  {!isEditable && detailRoll.status === 'in_stock' && (
                    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                      <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-amber-800">This roll cannot be edited</p>
                        <p className="mt-0.5 text-xs text-amber-600">
                          {detailRoll.remaining_weight === 0
                            ? 'This roll has been fully consumed in a lot/batch.'
                            : `${(detailRoll.total_weight - detailRoll.remaining_weight).toFixed(3)} kg has already been used. Only unused rolls can be edited.`}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* KPI Summary — compact single row */}
                  <div className="flex items-center gap-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">Total</span>
                      <span className="text-sm font-bold text-blue-700">{totalQty} {unitLabel}</span>
                    </div>
                    <div className="h-4 w-px bg-gray-300" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">Remaining</span>
                      <span className="text-sm font-bold text-green-700">{remainQty} {unitLabel}</span>
                    </div>
                    <div className="h-4 w-px bg-gray-300" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">Stock</span>
                      <span className={`text-sm font-bold ${pct > 50 ? 'text-green-700' : pct > 20 ? 'text-amber-600' : 'text-red-600'}`}>{pct.toFixed(0)}%</span>
                      <div className="h-1.5 w-16 rounded-full bg-gray-200">
                        <div className={`h-1.5 rounded-full ${pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="h-4 w-px bg-gray-300" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">Value</span>
                      <span className="text-sm font-bold text-amber-700">{totalValue > 0 ? `₹${totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}</span>
                    </div>
                  </div>

                  {/* Detail sections — 2-col layout */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Material Info */}
                    <div>
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Material Information</h3>
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-0 divide-y divide-gray-100">
                        {[
                          ['Roll Code', <span key="rc" className="font-mono text-primary-600 font-semibold">{detailRoll.roll_code}{detailRoll.enhanced_roll_code && detailRoll.enhanced_roll_code !== detailRoll.roll_code && <span className="text-orange-600">{detailRoll.enhanced_roll_code.slice(detailRoll.roll_code.length)}</span>}</span>],
                          ['Status', <StatusBadge key="st" status={detailRoll.status || 'in_stock'} label={ROLL_STATUS_LABELS[detailRoll.status] || 'In Stock'} />],
                          ['Fabric Type', detailRoll.fabric_type],
                          ['Color', detailRoll.color],
                          ['Unit', detailRoll.unit === 'meters' ? 'Meters' : 'Kilograms'],
                          [detailRoll.unit === 'meters' ? 'Total Length' : 'Total Weight', `${totalQty} ${unitLabel}`],
                          [detailRoll.unit === 'meters' ? 'Weight (ref)' : 'Length (ref)',
                            detailRoll.unit === 'meters'
                              ? (detailRoll.total_weight ? `${detailRoll.total_weight} kg` : '—')
                              : (detailRoll.total_length ? `${detailRoll.total_length} m` : '—')
                          ],
                          ['Cost / ' + unitLabel, detailRoll.cost_per_unit != null ? `₹${detailRoll.cost_per_unit}` : '—'],
                        ].map(([label, value]) => (
                          <div key={label} className="flex items-center justify-between py-2 text-sm">
                            <span className="text-gray-500">{label}</span>
                            <span className="text-gray-800 font-medium text-right">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: Supplier & Receiving */}
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Supplier & Invoice</h3>
                        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-0 divide-y divide-gray-100">
                          {[
                            ['Supplier', detailRoll.supplier?.name || '—'],
                            ['Invoice No.', detailRoll.supplier_invoice_no || '—'],
                            ['Invoice Date', detailRoll.supplier_invoice_date ? new Date(detailRoll.supplier_invoice_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'],
                          ].map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between py-2 text-sm">
                              <span className="text-gray-500">{label}</span>
                              <span className="text-gray-800 font-medium text-right">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Receiving Details</h3>
                        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-0 divide-y divide-gray-100">
                          {[
                            ['Received By', detailRoll.received_by_user?.full_name || '—'],
                            ['Received At', detailRoll.received_at ? new Date(detailRoll.received_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'],
                          ].map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between py-2 text-sm">
                              <span className="text-gray-500">{label}</span>
                              <span className="text-gray-800 font-medium text-right">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {detailRoll.notes && (
                        <div>
                          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Notes</h3>
                          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                            <p className="text-sm text-gray-700">{detailRoll.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Processing History */}
                  {procLogs.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Processing History</h3>
                      <div className="space-y-3">
                        {procLogs.map((log, idx) => {
                          const pt = PROCESS_TYPES.find((p) => p.value === log.process_type)
                          const isActive = log.status === 'sent'
                          return (
                            <div key={log.id || idx} className={`rounded-lg border p-4 ${isActive ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm text-gray-800">{pt?.label || log.process_type}</span>
                                  {log.value_addition && (
                                    <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">+{log.value_addition.short_code}</span>
                                  )}
                                  <StatusBadge status={log.status} />
                                </div>
                                <div className="flex items-center gap-2">
                                  {isActive && (
                                    <span className="text-xs text-orange-600 font-medium">
                                      {Math.floor((Date.now() - new Date(log.sent_date).getTime()) / (1000 * 60 * 60 * 24))} days out
                                    </span>
                                  )}
                                  <button
                                    onClick={() => openEditProcLog(detailRoll.id, log)}
                                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                                    title="Edit this processing step"
                                  >
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    Edit
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                <div><span className="text-gray-500">Vendor:</span> <span className="text-gray-800">{log.vendor_name}</span></div>
                                {log.vendor_phone && <div><span className="text-gray-500">Phone:</span> <span className="text-gray-800">{log.vendor_phone}</span></div>}
                                <div><span className="text-gray-500">Sent:</span> <span className="text-gray-800">{new Date(log.sent_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                                {log.received_date && <div><span className="text-gray-500">Received:</span> <span className="text-gray-800">{new Date(log.received_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>}
                              </div>
                              {log.status === 'received' && (
                                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs border-t border-gray-200 pt-2">
                                  <div><span className="text-gray-500">Wt Before:</span> <span className="text-gray-800">{log.weight_before} kg</span></div>
                                  <div><span className="text-gray-500">Wt After:</span> <span className="text-gray-800">{log.weight_after} kg</span></div>
                                  <div>
                                    <span className="text-gray-500">Change:</span>
                                    <span className={`ml-1 font-medium ${(log.weight_after - log.weight_before) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {((log.weight_after - log.weight_before) >= 0 ? '+' : '')}{(log.weight_after - log.weight_before).toFixed(3)} kg
                                    </span>
                                  </div>
                                  {log.processing_cost != null && (
                                    <div><span className="text-gray-500">Cost:</span> <span className="text-gray-800">₹{parseFloat(log.processing_cost).toLocaleString('en-IN')}</span></div>
                                  )}
                                </div>
                              )}
                              {log.notes && <p className="mt-2 text-xs text-gray-500 italic">{log.notes}</p>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* ════════════════════════════════════════════════════════
          SEND FOR PROCESSING Modal
         ════════════════════════════════════════════════════════ */}
      <Modal open={sendProcOpen} onClose={() => setSendProcOpen(false)}
        title={sendProcRoll ? `Send ${sendProcRoll.roll_code} for Processing` : 'Send for Processing'}
        actions={
          <>
            <button onClick={() => setSendProcOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSendProcessing} disabled={sendProcSaving}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">
              {sendProcSaving ? 'Sending...' : 'Send for Processing'}
            </button>
          </>
        }
      >
        {sendProcError && <div className="mb-4"><ErrorAlert message={sendProcError} onDismiss={() => setSendProcError(null)} /></div>}

        {sendProcRoll && (
          <div className="mb-5 rounded-lg bg-blue-50 border border-blue-100 p-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div><span className="text-blue-500">Roll:</span> <span className="font-medium text-blue-800">{sendProcRoll.roll_code}</span></div>
              <div><span className="text-blue-500">Fabric:</span> <span className="font-medium text-blue-800">{sendProcRoll.fabric_type}</span></div>
              <div><span className="text-blue-500">Color:</span> <span className="font-medium text-blue-800">{sendProcRoll.color}</span></div>
              <div><span className="text-blue-500">Weight:</span> <span className="font-medium text-blue-800">{sendProcRoll.total_weight} kg</span></div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Process Type <span className="text-red-500">*</span></label>
              <select value={sendProcForm.process_type} onChange={(e) => setSendProcForm((f) => ({ ...f, process_type: e.target.value }))} className={INPUT_CLS}>
                {PROCESS_TYPES.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Value Addition</label>
              <select value={sendProcForm.value_addition_id} onChange={(e) => setSendProcForm((f) => ({ ...f, value_addition_id: e.target.value }))} className={INPUT_CLS}>
                <option value="">None (regular processing)</option>
                {masterValueAdditions.map((va) => <option key={va.id} value={va.id}>{va.name} ({va.short_code})</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-400">If selected, adds to enhanced roll code after completion</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Vendor Name <span className="text-red-500">*</span></label>
              <input type="text" value={sendProcForm.vendor_name} onChange={(e) => setSendProcForm((f) => ({ ...f, vendor_name: e.target.value }))}
                placeholder="e.g. Shree Embroidery Works" className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>Vendor Phone</label>
              <input type="text" value={sendProcForm.vendor_phone} onChange={(e) => setSendProcForm((f) => ({ ...f, vendor_phone: e.target.value }))}
                placeholder="e.g. 9898123456" className={INPUT_CLS} />
            </div>
          </div>
          <div className="max-w-xs">
            <label className={LABEL_CLS}>Sent Date <span className="text-red-500">*</span></label>
            <input type="date" value={sendProcForm.sent_date} onChange={(e) => setSendProcForm((f) => ({ ...f, sent_date: e.target.value }))} className={INPUT_CLS} />
          </div>
          <div>
            <label className={LABEL_CLS}>Notes</label>
            <textarea value={sendProcForm.notes} onChange={(e) => setSendProcForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2} placeholder="e.g. Chikan embroidery work on full body" className={INPUT_CLS} />
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════════
          RECEIVE FROM PROCESSING Modal
         ════════════════════════════════════════════════════════ */}
      <Modal open={recvProcOpen} onClose={() => setRecvProcOpen(false)}
        title={recvProcRoll ? `Receive ${recvProcRoll.roll_code} from Processing` : 'Receive from Processing'}
        actions={
          <>
            <button onClick={() => setRecvProcOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleReceiveProcessing} disabled={recvProcSaving}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              {recvProcSaving ? 'Saving...' : 'Receive Back'}
            </button>
          </>
        }
      >
        {recvProcError && <div className="mb-4"><ErrorAlert message={recvProcError} onDismiss={() => setRecvProcError(null)} /></div>}

        {recvProcRoll && recvProcLog && (
          <div className="mb-5 space-y-3">
            {/* Roll + processing info */}
            <div className="rounded-lg bg-orange-50 border border-orange-100 p-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                <div><span className="text-orange-500">Roll:</span> <span className="font-medium text-orange-800">{recvProcRoll.roll_code}</span></div>
                <div><span className="text-orange-500">Process:</span> <span className="font-medium text-orange-800">{PROCESS_TYPES.find((p) => p.value === recvProcLog.process_type)?.label || recvProcLog.process_type}</span></div>
                <div><span className="text-orange-500">Vendor:</span> <span className="font-medium text-orange-800">{recvProcLog.vendor_name}</span></div>
                <div><span className="text-orange-500">Sent:</span> <span className="font-medium text-orange-800">{new Date(recvProcLog.sent_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                <div><span className="text-orange-500">Weight Before:</span> <span className="font-medium text-orange-800">{recvProcLog.weight_before} kg</span></div>
                <div>
                  <span className="text-orange-500">Days Out:</span>
                  <span className="font-medium text-orange-800 ml-1">{Math.floor((Date.now() - new Date(recvProcLog.sent_date).getTime()) / (1000 * 60 * 60 * 24))}d</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Received Date <span className="text-red-500">*</span></label>
              <input type="date" value={recvProcForm.received_date} onChange={(e) => setRecvProcForm((f) => ({ ...f, received_date: e.target.value }))} className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>Weight After (kg) <span className="text-red-500">*</span></label>
              <input type="number" step="0.001" value={recvProcForm.weight_after} onChange={(e) => setRecvProcForm((f) => ({ ...f, weight_after: e.target.value }))}
                placeholder={recvProcLog ? `Was ${recvProcLog.weight_before} kg` : ''} className={INPUT_CLS} />
              {recvProcForm.weight_after && recvProcLog && (
                <p className={`mt-1 text-xs font-medium ${(parseFloat(recvProcForm.weight_after) - recvProcLog.weight_before) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Change: {((parseFloat(recvProcForm.weight_after) - recvProcLog.weight_before) >= 0 ? '+' : '')}
                  {(parseFloat(recvProcForm.weight_after) - recvProcLog.weight_before).toFixed(3)} kg
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Length After (m, optional)</label>
              <input type="number" step="0.01" value={recvProcForm.length_after} onChange={(e) => setRecvProcForm((f) => ({ ...f, length_after: e.target.value }))}
                placeholder="If applicable" className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>Processing Cost (₹)</label>
              <input type="number" step="0.01" value={recvProcForm.processing_cost} onChange={(e) => setRecvProcForm((f) => ({ ...f, processing_cost: e.target.value }))}
                placeholder="Total cost for this processing" className={INPUT_CLS} />
              {recvProcForm.processing_cost && recvProcForm.weight_after && (
                <p className="mt-1 text-xs text-gray-500">
                  = ₹{(parseFloat(recvProcForm.processing_cost) / parseFloat(recvProcForm.weight_after)).toFixed(2)}/kg added to cost
                </p>
              )}
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>Notes</label>
            <textarea value={recvProcForm.notes} onChange={(e) => setRecvProcForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2} placeholder="Quality observations, shrinkage notes, etc." className={INPUT_CLS} />
          </div>
        </div>
      </Modal>

      {/* ═══════ Edit Processing Log Modal ═══════ */}
      <Modal open={editProcOpen} onClose={() => setEditProcOpen(false)}
        title={editProcLog ? `Edit Processing: ${PROCESS_TYPES.find((p) => p.value === editProcLog.process_type)?.label || editProcLog.process_type}` : 'Edit Processing Log'}
        actions={
          <>
            <button onClick={() => setEditProcOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={saveEditProcLog} disabled={editProcSaving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {editProcSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </>
        }
      >
        {editProcError && <div className="mb-4"><ErrorAlert message={editProcError} onDismiss={() => setEditProcError(null)} /></div>}

        <div className="space-y-4">
          {/* Row 1: Process Type + Vendor */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Process Type</label>
              <select value={editProcForm.process_type} onChange={(e) => setEditProcForm((f) => ({ ...f, process_type: e.target.value }))} className={INPUT_CLS}>
                {PROCESS_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Vendor Name</label>
              <input type="text" value={editProcForm.vendor_name} onChange={(e) => setEditProcForm((f) => ({ ...f, vendor_name: e.target.value }))} className={INPUT_CLS} />
            </div>
          </div>

          {/* Row 2: Vendor Phone + Sent Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Vendor Phone</label>
              <input type="text" value={editProcForm.vendor_phone} onChange={(e) => setEditProcForm((f) => ({ ...f, vendor_phone: e.target.value }))} placeholder="Optional" className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>Sent Date</label>
              <input type="date" value={editProcForm.sent_date} onChange={(e) => setEditProcForm((f) => ({ ...f, sent_date: e.target.value }))} className={INPUT_CLS} />
            </div>
          </div>

          {/* Row 3: Received Date + Weight After (only if log is received or being filled now) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Received Date</label>
              <input type="date" value={editProcForm.received_date} onChange={(e) => setEditProcForm((f) => ({ ...f, received_date: e.target.value }))} className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>Weight After (kg)</label>
              <input type="number" step="0.001" value={editProcForm.weight_after} onChange={(e) => setEditProcForm((f) => ({ ...f, weight_after: e.target.value }))}
                placeholder={editProcLog?.weight_before ? `Was ${editProcLog.weight_before} kg before` : ''} className={INPUT_CLS} />
            </div>
          </div>

          {/* Row 4: Processing Cost + Length After */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Processing Cost (₹)</label>
              <input type="number" step="0.01" value={editProcForm.processing_cost} onChange={(e) => setEditProcForm((f) => ({ ...f, processing_cost: e.target.value }))}
                placeholder="Total cost for this step" className={INPUT_CLS} />
              {editProcForm.processing_cost && editProcForm.weight_after && (
                <p className="mt-1 text-xs text-gray-500">
                  = ₹{(parseFloat(editProcForm.processing_cost) / parseFloat(editProcForm.weight_after)).toFixed(2)}/kg
                </p>
              )}
            </div>
            <div>
              <label className={LABEL_CLS}>Length After (m, optional)</label>
              <input type="number" step="0.01" value={editProcForm.length_after} onChange={(e) => setEditProcForm((f) => ({ ...f, length_after: e.target.value }))}
                placeholder="If applicable" className={INPUT_CLS} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={LABEL_CLS}>Notes</label>
            <textarea value={editProcForm.notes} onChange={(e) => setEditProcForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2} placeholder="Update notes for this processing step" className={INPUT_CLS} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
