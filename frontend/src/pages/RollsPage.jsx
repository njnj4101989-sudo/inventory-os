import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRolls, getInvoices, stockInBulk, updateRoll, deleteRoll, getProcessingRolls, sendForProcessing, receiveFromProcessing, updateProcessingLog, updateSupplierInvoice } from '../api/rolls'
import { createJobChallan, getJobChallan, getNextJCNumber } from '../api/jobChallans'
import LabelSheet from '../components/common/LabelSheet'
import JobChallan from '../components/common/JobChallan'
import { getSuppliers } from '../api/suppliers'
import { getAllFabrics, getAllColors, getAllValueAdditions, getAllVAParties } from '../api/masters'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import ErrorAlert from '../components/common/ErrorAlert'
import StatusBadge from '../components/common/StatusBadge'
import RollForm from '../components/forms/RollForm'
import useQuickMaster from '../hooks/useQuickMaster'
import QuickMasterModal from '../components/common/QuickMasterModal'

const INPUT_CLS = 'w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
const LABEL_CLS = 'block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-0.5'

// Challan-style fast entry — no per-roll template needed

const TABS = [
  { key: 'invoices', label: 'By Invoice', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'rolls', label: 'All Rolls', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
  { key: 'processing', label: 'In Processing', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
]

const ROLL_STATUS_LABELS = {
  in_stock: 'In Stock',
  sent_for_processing: 'Processing',
  in_cutting: 'In Cutting',
  remnant: 'Remnant',
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
    render: (val, row) => {
      if (!val || val <= 0) return '—'
      const base = `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      if (row.gst_percent > 0) {
        return (
          <div className="leading-tight">
            <span>{base}</span>
            <div className="text-[10px] text-amber-600">+{row.gst_percent}% GST</div>
          </div>
        )
      }
      return base
    },
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
      const total = val
      const remaining = row.remaining_weight
      const pct = total > 0 ? (remaining / total) * 100 : 0
      const barColor = pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : pct > 0 ? 'bg-red-500' : 'bg-gray-300'
      return (
        <div className="w-[100px]">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-gray-800">{total}</span>
            <span className="text-[10px] text-gray-400">kg</span>
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
    key: 'current_weight',
    label: 'Wt. Change',
    render: (val, row) => {
      const orig = parseFloat(row.total_weight) || 0
      const curr = parseFloat(val) || orig
      const delta = curr - orig
      if (Math.abs(delta) < 0.001) return <span className="text-gray-300">—</span>
      const isGain = delta > 0
      return (
        <span className={`text-sm font-medium ${isGain ? 'text-green-600' : 'text-red-600'}`}>
          {isGain ? '+' : ''}{delta.toFixed(2)} kg
        </span>
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
              {latestSent.value_addition?.name || latestSent.value_addition?.short_code || '—'}
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
    label: 'Orig. Wt',
    render: (val) => <span className="text-sm">{val} kg</span>,
  },
  {
    key: 'processing_logs',
    label: 'Value Addition',
    render: (val) => {
      const latest = val?.[val.length - 1]
      if (!latest) return '—'
      const va = latest.value_addition
      const c = va ? getVAColor(va.short_code) : DEFAULT_VA_COLOR
      return (
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
            {va?.name || '—'}
          </span>
        </div>
      )
    },
  },
  {
    key: 'processing_logs',
    label: 'VA Party',
    render: (val) => val?.[val.length - 1]?.va_party?.name || '—',
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

const VA_COLORS = {
  EMB: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  DYE: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  DPT: { bg: 'bg-sky-100', text: 'text-sky-700', dot: 'bg-sky-500' },
  HWK: { bg: 'bg-rose-100', text: 'text-rose-700', dot: 'bg-rose-500' },
  SQN: { bg: 'bg-teal-100', text: 'text-teal-700', dot: 'bg-teal-500' },
  BTC: { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' },
}
const DEFAULT_VA_COLOR = { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' }
const getVAColor = (shortCode) => VA_COLORS[shortCode] || DEFAULT_VA_COLOR

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
    label: 'Value Additions',
    sortable: false,
    render: (logs) => {
      if (!logs || logs.length === 0) return '—'
      const seen = new Set()
      return (
        <div className="flex flex-wrap gap-1">
          {logs.map((l, i) => {
            const sc = l.value_addition?.short_code
            if (!sc || seen.has(sc)) return null
            seen.add(sc)
            const c = getVAColor(sc)
            return (
              <span key={i} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
                {l.value_addition?.name || sc}
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
  const navigate = useNavigate()
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
  const [remnantMaxWeight, setRemnantMaxWeight] = useState('5')
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
  const [vaParties, setVAParties] = useState([])

  // Stock-in modal — challan style with design groups
  const EMPTY_GROUP = { fabric_type: '', cost_per_unit: '', unit: 'kg', panna: '', gsm: '', notes: '', colorRows: [{ color: '', weights: [''] }] }
  const [stockInOpen, setStockInOpen] = useState(false)
  const [invoiceHeader, setInvoiceHeader] = useState({ supplier_id: '', supplier_invoice_no: '', supplier_challan_no: '', supplier_invoice_date: '', sr_no: '', gst_percent: '' })
  const [designGroups, setDesignGroups] = useState([{ ...EMPTY_GROUP, colorRows: [{ color: '', weights: [''] }] }])
  const [pendingDeleteRow, setPendingDeleteRow] = useState(null) // { gIdx, cIdx } — Delete key confirmation
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [lastSavedRolls, setLastSavedRolls] = useState([])   // for Print Labels
  const [showLabelSheet, setShowLabelSheet] = useState(false)

  // Roll selection + bulk actions
  const [selectedRolls, setSelectedRolls] = useState(new Set())
  const [showBulkLabels, setShowBulkLabels] = useState(false)
  const [bulkSendOpen, setBulkSendOpen] = useState(false)
  const [bulkSendRolls, setBulkSendRolls] = useState([])
  const [bulkSendForm, setBulkSendForm] = useState({ value_addition_id: '', va_party_id: '', sent_date: '', notes: '' })
  const [bulkSendWeights, setBulkSendWeights] = useState({})
  const [bulkSendSaving, setBulkSendSaving] = useState(false)
  const [bulkSendError, setBulkSendError] = useState(null)
  const [showJobChallan, setShowJobChallan] = useState(false)
  const [jobChallanData, setJobChallanData] = useState(null)

  // Invoice detail modal
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [selectedInvRolls, setSelectedInvRolls] = useState(new Set())
  const [lotDesignPicker, setLotDesignPicker] = useState(null)

  // Individual roll detail/edit modal
  const [detailRoll, setDetailRoll] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState(null)

  // Send for Processing modal
  const [sendProcOpen, setSendProcOpen] = useState(false)
  const [sendProcRoll, setSendProcRoll] = useState(null)
  const [sendProcForm, setSendProcForm] = useState({ value_addition_id: '', va_party_id: '', sent_date: '', notes: '', weight_to_send: '' })
  const [sendProcSaving, setSendProcSaving] = useState(false)
  const [sendProcError, setSendProcError] = useState(null)
  const [nextJCNo, setNextJCNo] = useState('')

  // Receive from Processing modal
  const [recvProcOpen, setRecvProcOpen] = useState(false)
  const [recvProcRoll, setRecvProcRoll] = useState(null)
  const [recvProcLog, setRecvProcLog] = useState(null)
  const [recvProcForm, setRecvProcForm] = useState({ received_date: '', weight_after: '', length_after: '', processing_cost: '', notes: '' })
  const [recvProcSaving, setRecvProcSaving] = useState(false)
  const [recvProcError, setRecvProcError] = useState(null)

  // Bulk Receive from Processing (challan-based)
  const [bulkRecvOpen, setBulkRecvOpen] = useState(false)
  const [bulkRecvChallan, setBulkRecvChallan] = useState(null) // {challanNo, vaPartyName, vaName, vaShortCode, rolls:[{roll, log}]}
  const [bulkRecvDate, setBulkRecvDate] = useState('')
  const [bulkRecvRows, setBulkRecvRows] = useState({}) // {logId: {checked, weight_after, processing_cost}}
  const [bulkRecvSaving, setBulkRecvSaving] = useState(false)
  const [bulkRecvError, setBulkRecvError] = useState(null)

  // Edit Processing Log modal
  const [editProcOpen, setEditProcOpen] = useState(false)
  const [editProcRollId, setEditProcRollId] = useState(null)
  const [editProcLog, setEditProcLog] = useState(null)
  const [editProcForm, setEditProcForm] = useState({})
  const [editProcSaving, setEditProcSaving] = useState(false)
  const [editProcError, setEditProcError] = useState(null)

  const isEditable = detailRoll && detailRoll.remaining_weight >= (detailRoll.current_weight || detailRoll.total_weight) && detailRoll.status === 'in_stock'

  // ── Shift+M Quick Master ──
  const refreshMasters = useCallback(() => {
    getSuppliers({ is_active: true }).then((res) => setSuppliers(res.data.data)).catch(() => {})
    getAllFabrics().then((res) => setMasterFabrics(res.data.data)).catch(() => {})
    getAllColors().then((res) => setMasterColors(res.data.data)).catch(() => {})
    getAllValueAdditions().then((res) => setMasterValueAdditions(res.data.data)).catch(() => {})
    getAllVAParties().then((r) => setVAParties(r?.data?.data || r?.data || [])).catch(() => {})
  }, [])

  const handleQuickMasterCreated = useCallback((masterType, newItem, triggerEl) => {
    refreshMasters()
    // Auto-select the new item in the triggering select
    if (triggerEl && triggerEl.tagName === 'SELECT') {
      const selectName = triggerEl.getAttribute('data-master')
      setTimeout(() => {
        if (selectName === 'supplier' && newItem?.id) {
          setHeader('supplier_id', newItem.id)
        } else if (selectName === 'fabric' && newItem?.name) {
          // Find which design group this select belongs to
          const gIdx = triggerEl.closest('[data-design-group]')?.getAttribute('data-design-group')
          if (gIdx != null) setGroupField(parseInt(gIdx), 'fabric_type', newItem.name)
        } else if (selectName === 'color' && newItem?.name) {
          // Find group + color row
          const gIdx = triggerEl.closest('[data-design-group]')?.getAttribute('data-design-group')
          const cIdx = triggerEl.getAttribute('data-color-idx')
          if (gIdx != null && cIdx != null) {
            updateGroup(parseInt(gIdx), (g) => ({
              ...g, colorRows: g.colorRows.map((r, j) => j === parseInt(cIdx) ? { ...r, color: newItem.name } : r),
            }))
          }
        } else if (selectName === 'value_addition' && newItem?.id) {
          // Could be single send or bulk send — check which form is open
          if (sendProcOpen) setSendProcForm((f) => ({ ...f, value_addition_id: newItem.id }))
          else if (bulkSendOpen) setBulkSendForm((f) => ({ ...f, value_addition_id: newItem.id }))
          else if (editProcOpen) setEditProcForm((f) => ({ ...f, value_addition_id: newItem.id }))
        } else if (selectName === 'va_party' && newItem?.id) {
          if (sendProcOpen) setSendProcForm((f) => ({ ...f, va_party_id: newItem.id }))
          else if (bulkSendOpen) setBulkSendForm((f) => ({ ...f, va_party_id: newItem.id }))
          else if (editProcOpen) setEditProcForm((f) => ({ ...f, va_party_id: newItem.id }))
        }
      }, 200) // Wait for master list refresh
    }
  }, [refreshMasters, sendProcOpen, bulkSendOpen, editProcOpen])

  const { quickMasterType, quickMasterOpen, closeQuickMaster, onMasterCreated } = useQuickMaster(handleQuickMasterCreated)

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
      } else if (rollStatusFilter === 'remnant') {
        // Remnant = rolls with low remaining weight (below threshold)
        params.has_remaining = true
        const maxWt = parseFloat(remnantMaxWeight)
        if (maxWt > 0) params.max_remaining_weight = maxWt
      } else if (rollStatusFilter !== 'all') {
        params.status = rollStatusFilter
      }
      if (rollAvailFilter === 'available') params.has_remaining = true
      if (rollAvailFilter === 'consumed') params.fully_consumed = true
      if (rollSupplierFilter) params.supplier_id = rollSupplierFilter
      if (rollFabricFilter) params.fabric_filter = rollFabricFilter
      if (rollProcessFilter && rollProcessFilter !== 'none') params.value_addition_id = rollProcessFilter
      const res = await getRolls(params)
      let rollData = res.data.data
      // Client-side sub-filter for fresh vs processed-and-returned
      if (rollStatusFilter === 'in_stock_fresh') {
        rollData = rollData.filter((r) => !r.processing_logs || r.processing_logs.length === 0 || r.processing_logs.every((l) => l.status === 'sent'))
      } else if (rollStatusFilter === 'in_stock_processed') {
        rollData = rollData.filter((r) => r.processing_logs?.some((l) => l.status === 'received'))
      }
      // Client-side: "none" = no processing logs at all
      if (rollProcessFilter === 'none') {
        rollData = rollData.filter((r) => !r.processing_logs || r.processing_logs.length === 0)
      }
      setRolls(rollData)
      setRollTotal(res.data.total)
      setRollPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load rolls')
    } finally {
      setRollLoading(false)
    }
  }, [rollPage, rollSearch, rollStatusFilter, rollAvailFilter, rollSupplierFilter, rollFabricFilter, rollProcessFilter, remnantMaxWeight])

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
  useEffect(() => { refreshMasters() }, [refreshMasters])

  const refreshAll = () => { fetchInvoices(); fetchRolls(); fetchProcessing() }

  // Clear selection on any filter/tab/page change
  useEffect(() => { setSelectedRolls(new Set()) }, [tab, rollStatusFilter, rollAvailFilter, rollSupplierFilter, rollFabricFilter, rollProcessFilter, rollPage, rollSearch])

  const getSelectedRollObjects = () => rolls.filter((r) => selectedRolls.has(r.id))

  const handleBulkSendProcessing = async () => {
    if (!bulkSendForm.value_addition_id) { setBulkSendError('Value Addition is required'); return }
    if (!bulkSendForm.va_party_id) { setBulkSendError('VA Party is required'); return }
    if (!bulkSendForm.sent_date) { setBulkSendError('Sent date is required'); return }
    if (bulkSendRolls.length === 0) { setBulkSendError('No rolls selected'); return }
    // Validate weights
    for (const r of bulkSendRolls) {
      const wt = parseFloat(bulkSendWeights[r.id])
      const maxWt = r.remaining_weight || r.current_weight || r.total_weight
      if (!wt || wt <= 0) { setBulkSendError(`Weight must be > 0 for ${r.roll_code}`); return }
      if (wt > maxWt) { setBulkSendError(`Weight (${wt}) exceeds remaining (${maxWt}) for ${r.roll_code}`); return }
    }
    setBulkSendSaving(true)
    setBulkSendError(null)
    try {
      const rollEntries = bulkSendRolls.map((r) => ({
        roll_id: r.id,
        weight_to_send: parseFloat(bulkSendWeights[r.id]),
      }))
      const res = await createJobChallan({
        value_addition_id: bulkSendForm.value_addition_id,
        va_party_id: bulkSendForm.va_party_id,
        sent_date: bulkSendForm.sent_date,
        notes: bulkSendForm.notes.trim() || null,
        rolls: rollEntries,
        _rolls: bulkSendRolls, // for mock
        _vaObj: masterValueAdditions.find((va) => va.id === bulkSendForm.value_addition_id) || null,
      })
      const challan = res.data?.data || res.data
      const vaObj = masterValueAdditions.find((va) => va.id === bulkSendForm.value_addition_id)
      const party = vaParties.find(p => p.id === (challan.va_party?.id || bulkSendForm.va_party_id))
      setJobChallanData({
        challanNo: challan.challan_no,
        rolls: challan.rolls || bulkSendRolls,
        vaName: challan.value_addition?.name || vaObj?.name || '—',
        vaShortCode: challan.value_addition?.short_code || vaObj?.short_code || '—',
        vaPartyName: party?.name || challan.va_party?.name || '—',
        vaPartyPhone: party?.phone || challan.va_party?.phone || '',
        sentDate: challan.sent_date || bulkSendForm.sent_date,
        notes: challan.notes || bulkSendForm.notes.trim() || '',
      })
      setBulkSendOpen(false)
      setBulkSendRolls([])
      setSelectedRolls(new Set())
      setShowJobChallan(true)
      refreshAll()
    } catch (err) {
      setBulkSendError(err.response?.data?.detail || 'Failed to create job challan')
    } finally {
      setBulkSendSaving(false)
    }
  }

  // Track if we're editing an existing invoice (vs creating new)
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [removedRollIds, setRemovedRollIds] = useState([])

  // ── Stock In — Challan-style with design groups ──
  const openStockIn = () => {
    setEditingInvoice(null)
    setRemovedRollIds([])
    setPendingDeleteRow(null)
    // Auto-generate next Sr. No. (our internal filing serial)
    const existingSrNos = invoices.map((inv) => parseInt(inv.sr_no, 10)).filter((n) => !isNaN(n))
    const nextSr = existingSrNos.length > 0 ? Math.max(...existingSrNos) + 1 : 1
    const today = new Date().toISOString().split('T')[0]
    setInvoiceHeader({ supplier_id: '', supplier_invoice_no: '', supplier_challan_no: '', supplier_invoice_date: today, sr_no: String(nextSr), gst_percent: '' })
    setDesignGroups([{ ...EMPTY_GROUP, colorRows: [{ color: '', weights: [''] }] }])
    setFormError(null)
    setStockInOpen(true)
  }

  const isInvoiceEditable = (inv) => inv?.rolls?.every((r) =>
    (r.status || 'in_stock') === 'in_stock' && r.remaining_weight >= (r.current_weight || r.total_weight)
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
      gst_percent: selectedInvoice.gst_percent ? String(selectedInvoice.gst_percent) : '',
    })
    // Group rolls by fabric_type → design groups, then by color within each
    // Sort rolls by created_at (or received_at) to preserve original entry order
    const sortedRolls = [...selectedInvoice.rolls].sort((a, b) =>
      (a.created_at || a.received_at || '').localeCompare(b.created_at || b.received_at || '')
    )
    const fabricMap = {}
    for (const r of sortedRolls) {
      const ft = r.fabric_type || 'Unknown'
      if (!fabricMap[ft]) fabricMap[ft] = { fabric_type: ft, cost_per_unit: r.cost_per_unit != null ? String(r.cost_per_unit) : '', unit: r.unit || 'kg', panna: r.panna != null ? String(r.panna) : '', gsm: r.gsm != null ? String(r.gsm) : '', notes: '', colors: {} }
      const c = r.color || 'Unknown'
      if (!fabricMap[ft].colors[c]) fabricMap[ft].colors[c] = { color: c, weights: [], rollIds: [] }
      const qty = r.total_weight
      fabricMap[ft].colors[c].weights.push(String(qty))
      fabricMap[ft].colors[c].rollIds.push(r.id)
    }
    setDesignGroups(Object.values(fabricMap).map((g) => ({
      fabric_type: g.fabric_type, cost_per_unit: g.cost_per_unit, unit: g.unit, panna: g.panna, gsm: g.gsm, notes: g.notes,
      colorRows: Object.values(g.colors),
    })))
    setRemovedRollIds([])
    setPendingDeleteRow(null)
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
  const removeWeight = (gIdx, cIdx, wIdx) => {
    // Read rollId from fresh state inside updater to avoid stale closure
    updateGroup(gIdx, (g) => {
      const r = g.colorRows[cIdx]
      if (!r) return g
      // Track removed rollId for edit mode (so we can delete it on save)
      if (editingInvoice && r.rollIds?.[wIdx]) {
        setRemovedRollIds((prev) => [...prev, r.rollIds[wIdx]])
      }
      return {
        ...g, colorRows: g.colorRows.map((row, j) => j === cIdx ? {
          ...row,
          weights: row.weights.length > 1 ? row.weights.filter((_, k) => k !== wIdx) : row.weights,
          rollIds: row.rollIds ? (row.weights.length > 1 ? row.rollIds.filter((_, k) => k !== wIdx) : row.rollIds) : undefined,
        } : row),
      }
    })
  }
  const addColorRow = (gIdx) => updateGroup(gIdx, (g) => ({
    ...g, colorRows: [...g.colorRows, { color: '', weights: [''] }],
  }))
  const removeColorRow = (gIdx, cIdx) => {
    // Read rollIds from fresh state inside updater to avoid stale closure
    updateGroup(gIdx, (g) => {
      const row = g.colorRows[cIdx]
      if (editingInvoice && row?.rollIds?.length) {
        setRemovedRollIds((prev) => [...prev, ...row.rollIds])
      }
      return {
        ...g, colorRows: g.colorRows.length > 1 ? g.colorRows.filter((_, j) => j !== cIdx) : g.colorRows,
      }
    })
  }
  // Remove empty trailing weight from a color row (used by smart Enter)
  const trimEmptyWeight = (gIdx, cIdx, wIdx) => updateGroup(gIdx, (g) => {
    const r = g.colorRows[cIdx]
    if (!r || r.weights.length <= 1) return g
    // Track removed rollId in edit mode
    if (editingInvoice && r.rollIds?.[wIdx]) {
      setRemovedRollIds((prev) => [...prev, r.rollIds[wIdx]])
    }
    return {
      ...g, colorRows: g.colorRows.map((row, j) => j === cIdx ? {
        ...row,
        weights: row.weights.filter((_, k) => k !== wIdx),
        rollIds: row.rollIds ? row.rollIds.filter((_, k) => k !== wIdx) : undefined,
      } : row),
    }
  })

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
        const updateErrors = []
        const stringifyDetail = (d) => typeof d === 'string' ? d : d ? JSON.stringify(d) : null
        for (const grp of designGroups) {
          const fabricMatch = masterFabrics.find((f) => f.name === grp.fabric_type)
          for (const row of grp.colorRows) {
            const colorMatch = masterColors.find((c) => c.name === row.color)
            for (let wI = 0; wI < row.weights.length; wI++) {
              const wt = parseFloat(row.weights[wI])
              if (!(wt > 0)) continue // skip empty, NaN, zero, negative
              const existingId = row.rollIds?.[wI]
              if (existingId) {
                try {
                  await updateRoll(existingId, {
                    fabric_type: grp.fabric_type.trim(),
                    color: row.color.trim(),
                    total_weight: wt,
                    unit: grp.unit,
                    cost_per_unit: grp.cost_per_unit ? parseFloat(grp.cost_per_unit) : null,
                    supplier_id: invoiceHeader.supplier_id || null,
                    supplier_invoice_no: invoiceHeader.supplier_invoice_no || null,
                    supplier_challan_no: invoiceHeader.supplier_challan_no || null,
                    supplier_invoice_date: invoiceHeader.supplier_invoice_date || null,
                    sr_no: invoiceHeader.sr_no || null,
                    notes: grp.notes || null,
                  })
                } catch (err) {
                  updateErrors.push(`${row.color} (${wt} kg): ${stringifyDetail(err.response?.data?.detail) || 'Update failed'}`)
                }
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
            }
          }
        }
        if (newRolls.length > 0) await stockInBulk(invoiceHeader, newRolls)

        // Delete rolls that were removed from the invoice during edit
        if (removedRollIds.length > 0) {
          for (const rid of removedRollIds) {
            try {
              await deleteRoll(rid)
            } catch (err) {
              updateErrors.push(`Could not delete removed roll: ${stringifyDetail(err.response?.data?.detail) || 'Delete failed'}`)
            }
          }
        }

        // Update SupplierInvoice GST (if invoice has a linked record)
        if (editingInvoice.supplier_invoice_id) {
          try {
            await updateSupplierInvoice(editingInvoice.supplier_invoice_id, {
              gst_percent: invoiceHeader.gst_percent ? parseFloat(invoiceHeader.gst_percent) : 0,
              invoice_no: invoiceHeader.supplier_invoice_no || null,
              challan_no: invoiceHeader.supplier_challan_no || null,
              invoice_date: invoiceHeader.supplier_invoice_date || null,
              sr_no: invoiceHeader.sr_no || null,
            })
          } catch (err) {
            updateErrors.push(`GST update failed: ${stringifyDetail(err.response?.data?.detail) || 'Unknown error'}`)
          }
        }

        if (updateErrors.length > 0) {
          setFormError(`Some rolls could not be updated:\n${updateErrors.join('\n')}`)
          setSaving(false)
          return
        }
      } else {
        await stockInBulk(invoiceHeader, flatRolls)
      }

      const wasEditing = !!editingInvoice
      setStockInOpen(false)
      setEditingInvoice(null)
      setRemovedRollIds([])
      await refreshAll()

      // Show label sheet only for new stock-in, not edits
      if (!wasEditing) {
        try {
          const filterParams = { page: 1, page_size: 100 }
          if (invoiceHeader.sr_no) filterParams.sr_no = invoiceHeader.sr_no
          const freshResp = await getRolls(filterParams)
          const freshRolls = freshResp?.data?.data || []
          if (freshRolls.length > 0) {
            setLastSavedRolls(freshRolls)
          }
        } catch (_) { /* non-fatal — labels still available from state */ }
        setShowLabelSheet(true)
      }
    } catch (err) {
      if (err.partialResults) {
        // Partial success from stockInBulk — some rolls saved, some failed
        setFormError(err.message)
        await refreshAll()
      } else {
        const detail = err.response?.data?.detail
        if (err.response?.status === 422) {
          setFormError('Validation error — please check all fields are filled correctly')
        } else if (err.response?.status === 409) {
          setFormError('Duplicate entry detected — a roll with this data may already exist')
        } else if (err.response?.status >= 500) {
          setFormError('Server error — please try again. If this persists, contact support')
        } else if (!navigator.onLine) {
          setFormError('No internet connection — please check your network and try again')
        } else {
          setFormError(detail || err.message || 'Failed to save rolls. Please try again')
        }
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Ctrl+S to save stock-in form ──
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && stockInOpen && !saving) {
        e.preventDefault()
        // Blur active input first so its onChange fires and state is committed
        if (document.activeElement && document.activeElement.tagName !== 'BODY') {
          document.activeElement.blur()
        }
        // Let React process the blur/onChange before saving
        setTimeout(() => handleStockIn(), 50)
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
  const openInvoiceDetail = (inv) => { setSelectedInvoice(inv); setSelectedInvRolls(new Set()) }
  const lastFocusedRollRef = useRef(null)
  const openRollFromInvoice = (roll) => {
    lastFocusedRollRef.current = roll.id
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
    // Restore focus to the roll that was clicked
    if (lastFocusedRollRef.current) {
      const rollId = lastFocusedRollRef.current
      setTimeout(() => {
        const btn = document.querySelector(`[data-inv-roll-id="${rollId}"]`)
        if (btn) { btn.focus(); btn.scrollIntoView({ block: 'center', behavior: 'smooth' }) }
      }, 100)
    }
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
            const va = log.value_addition
            const c = va ? getVAColor(va.short_code) : DEFAULT_VA_COLOR
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
                        {va?.name || '—'}
                      </span>
                      <span className="text-sm text-gray-600 font-medium">{log.va_party?.name}</span>
                      {log.va_party?.phone && <span className="text-xs text-gray-400">{log.va_party?.phone}</span>}
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
      value_addition_id: log.value_addition_id || log.value_addition?.id || '',
      va_party_id: log.va_party?.id || '',
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
      const origVaId = editProcLog.value_addition_id || editProcLog.value_addition?.id || ''
      if (editProcForm.value_addition_id && editProcForm.value_addition_id !== origVaId) payload.value_addition_id = editProcForm.value_addition_id
      if (editProcForm.va_party_id && editProcForm.va_party_id !== editProcLog.va_party?.id) payload.va_party_id = editProcForm.va_party_id
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
  const fetchNextJCNo = () => {
    getNextJCNumber()
      .then((res) => setNextJCNo(res.data?.data?.next_challan_no || res.data?.next_challan_no || ''))
      .catch(() => setNextJCNo(''))
  }

  const openSendProcessing = (roll) => {
    setSendProcRoll(roll)
    setSendProcForm({ value_addition_id: '', va_party_id: '', sent_date: new Date().toISOString().split('T')[0], notes: '', weight_to_send: String(roll.remaining_weight || roll.current_weight || roll.total_weight) })
    setSendProcError(null)
    setDetailRoll(null) // close detail modal
    fetchNextJCNo()
    setSendProcOpen(true)
  }

  const handleSendProcessing = async () => {
    if (!sendProcForm.value_addition_id) { setSendProcError('Value Addition is required'); return }
    if (!sendProcForm.va_party_id) { setSendProcError('VA Party is required'); return }
    if (!sendProcForm.sent_date) { setSendProcError('Sent date is required'); return }
    const wts = parseFloat(sendProcForm.weight_to_send)
    if (!wts || wts <= 0) { setSendProcError('Weight to send must be > 0'); return }
    const maxWt = sendProcRoll.remaining_weight || sendProcRoll.current_weight || sendProcRoll.total_weight
    if (wts > maxWt) { setSendProcError(`Weight to send (${wts}) exceeds remaining (${maxWt})`); return }
    setSendProcSaving(true)
    setSendProcError(null)
    try {
      await sendForProcessing(sendProcRoll.id, {
        value_addition_id: sendProcForm.value_addition_id,
        va_party_id: sendProcForm.va_party_id,
        sent_date: sendProcForm.sent_date,
        notes: sendProcForm.notes.trim() || null,
        weight_to_send: wts,
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

  // ── Bulk Receive (challan-based) ──
  const openBulkReceive = (group) => {
    const today = new Date().toISOString().split('T')[0]
    const rows = {}
    for (const item of group.rolls) {
      const log = item.log
      rows[log.id] = {
        checked: true,
        weight_after: String(log.weight_before || ''),
        processing_cost: '',
      }
    }
    setBulkRecvChallan(group)
    setBulkRecvDate(today)
    setBulkRecvRows(rows)
    setBulkRecvError(null)
    setBulkRecvOpen(true)
  }

  const handleBulkReceive = async () => {
    if (!bulkRecvDate) { setBulkRecvError('Received date is required'); return }
    const toReceive = bulkRecvChallan.rolls.filter(item => bulkRecvRows[item.log.id]?.checked)
    if (toReceive.length === 0) { setBulkRecvError('Select at least one roll to receive'); return }
    for (const item of toReceive) {
      const row = bulkRecvRows[item.log.id]
      const wt = parseFloat(row.weight_after)
      if (!wt || wt <= 0) { setBulkRecvError(`Weight required for ${item.roll.roll_code}`); return }
    }
    setBulkRecvSaving(true)
    setBulkRecvError(null)
    try {
      for (const item of toReceive) {
        const row = bulkRecvRows[item.log.id]
        await receiveFromProcessing(item.roll.id, item.log.id, {
          received_date: bulkRecvDate,
          weight_after: parseFloat(row.weight_after),
          processing_cost: row.processing_cost ? parseFloat(row.processing_cost) : null,
          notes: null,
        })
      }
      setBulkRecvOpen(false)
      setBulkRecvChallan(null)
      refreshAll()
    } catch (err) {
      setBulkRecvError(err.response?.data?.detail || 'Failed to receive — check individual rolls')
    } finally {
      setBulkRecvSaving(false)
    }
  }

  // ── Stock-in totals (across all design groups) ──
  const challanTotals = (() => {
    const base = designGroups.reduce((acc, grp) => {
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
    const gstPct = parseFloat(invoiceHeader.gst_percent) || 0
    base.gstPercent = gstPct
    base.gstAmount = Math.round(base.value * gstPct / 100 * 100) / 100
    base.totalWithGst = Math.round((base.value + base.gstAmount) * 100) / 100
    return base
  })()

  return (
    <div>
      {/* ── Print Labels Sheet overlay ── */}
      {showLabelSheet && (
        <LabelSheet
          rolls={lastSavedRolls}
          onClose={() => setShowLabelSheet(false)}
        />
      )}
      {showBulkLabels && (
        <LabelSheet
          rolls={getSelectedRollObjects()}
          onClose={() => setShowBulkLabels(false)}
        />
      )}
      {showJobChallan && jobChallanData && (
        <JobChallan
          challanNo={jobChallanData.challanNo}
          rolls={jobChallanData.rolls}
          vaName={jobChallanData.vaName}
          vaShortCode={jobChallanData.vaShortCode}
          vaPartyName={jobChallanData.vaPartyName}
          vaPartyPhone={jobChallanData.vaPartyPhone}
          sentDate={jobChallanData.sentDate}
          notes={jobChallanData.notes}
          onClose={() => { setShowJobChallan(false); setJobChallanData(null) }}
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
          { key: 'remnant', label: 'Remnant', active: 'bg-amber-100 text-amber-700 ring-1 ring-amber-300' },
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
                  <span className="text-xs font-medium text-gray-500 uppercase mr-1">Status:</span>
                  {STATUS_PILLS.map((p) => (
                    <button key={p.key} onClick={() => { setRollStatusFilter(p.key); setRollPage(1) }}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        rollStatusFilter === p.key ? p.active : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >{p.label}</button>
                  ))}
                  {rollStatusFilter === 'remnant' && (
                    <div className="flex items-center gap-1 ml-1">
                      <span className="text-[10px] text-amber-700">Max wt:</span>
                      <input type="number" step="0.5" min="0.5" value={remnantMaxWeight}
                        onChange={e => { setRemnantMaxWeight(e.target.value); setRollPage(1) }}
                        className="w-16 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      />
                      <span className="text-[10px] text-amber-600">kg</span>
                    </div>
                  )}
                </div>
                <div className="h-5 w-px bg-gray-200" />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-500 uppercase mr-1">Stock:</span>
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
                  <option value="">All Value Additions</option>
                  <option value="none">No Processing</option>
                  {masterValueAdditions.map((va) => <option key={va.id} value={va.id}>{va.name} ({va.short_code})</option>)}
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
            {(() => {
              const isSelectableView = rollStatusFilter !== 'in_stock_processed'
              const sendableRolls = rolls.filter((r) => (r.status === 'in_stock' || r.status === 'remnant') && (r.remaining_weight || 0) > 0)
              const allSelected = sendableRolls.length > 0 && sendableRolls.every((r) => selectedRolls.has(r.id))
              const CHECKBOX_COL = {
                key: '__select',
                label: (
                  <input type="checkbox" checked={allSelected}
                    onChange={() => {
                      if (allSelected) setSelectedRolls(new Set())
                      else setSelectedRolls(new Set(sendableRolls.map((r) => r.id)))
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                ),
                sortable: false,
                render: (_, row) => ((row.status !== 'in_stock' && row.status !== 'remnant') || (row.remaining_weight || 0) <= 0) ? <span className="w-4" /> : (
                  <input type="checkbox" checked={selectedRolls.has(row.id)}
                    onChange={(e) => { e.stopPropagation(); setSelectedRolls((prev) => { const next = new Set(prev); next.has(row.id) ? next.delete(row.id) : next.add(row.id); return next }) }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                ),
              }
              const displayColumns = isSelectableView ? [CHECKBOX_COL, ...ROLL_COLUMNS] : ROLL_COLUMNS

              return (
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
                    <DataTable columns={displayColumns} data={rolls} loading={rollLoading} onRowClick={openRollDetail} emptyText="No rolls found." />
                  )}
                  <Pagination page={rollPage} pages={rollPages} total={rollTotal} onChange={setRollPage} />

                  {/* ── Floating bulk action bar ── */}
                  {selectedRolls.size > 0 && (
                    <div className="sticky bottom-4 z-20 mt-3 flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50/95 backdrop-blur px-5 py-3 shadow-lg">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">{selectedRolls.size}</span>
                        <span className="text-sm font-semibold text-primary-800">roll{selectedRolls.size > 1 ? 's' : ''} selected</span>
                        <button onClick={() => setSelectedRolls(new Set())} className="text-xs text-primary-500 hover:text-primary-700 underline">Clear</button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setShowBulkLabels(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          Print Labels ({selectedRolls.size})
                        </button>
                        <button onClick={() => {
                            navigate('/lots', { state: { preselectedRolls: getSelectedRollObjects().map(r => r.id) } })
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                          Create Lot ({selectedRolls.size})
                        </button>
                        <button onClick={() => {
                            const rollObjs = getSelectedRollObjects()
                            setBulkSendRolls(rollObjs)
                            setBulkSendForm({ value_addition_id: '', va_party_id: '', sent_date: new Date().toISOString().split('T')[0], notes: '' })
                            const wts = {}; rollObjs.forEach((r) => { wts[r.id] = String(r.remaining_weight || r.current_weight || r.total_weight) }); setBulkSendWeights(wts)
                            setBulkSendError(null)
                            fetchNextJCNo()
                            setBulkSendOpen(true)
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 transition-colors">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          Send for Processing ({selectedRolls.size})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
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
        const uniqueVendors = [...new Set(procRolls.map((r) => getLatestLog(r)?.va_party?.name).filter(Boolean))].sort()
        const uniqueVAs = []
        const seenVA = new Set()
        for (const r of procRolls) {
          const va = getLatestLog(r)?.value_addition
          if (va && !seenVA.has(va.id)) { seenVA.add(va.id); uniqueVAs.push(va) }
        }

        // Apply filters
        let filtered = [...procRolls]
        if (procProcessFilter) filtered = filtered.filter((r) => getLatestLog(r)?.value_addition?.id === procProcessFilter)
        if (procVendorFilter) filtered = filtered.filter((r) => getLatestLog(r)?.va_party?.name === procVendorFilter)
        if (procDaysFilter === 'overdue') filtered = filtered.filter((r) => getDaysOut(getLatestLog(r)) > 14)
        if (procDaysFilter === 'week') filtered = filtered.filter((r) => getDaysOut(getLatestLog(r)) <= 7)
        if (procDaysFilter === '7to14') filtered = filtered.filter((r) => { const d = getDaysOut(getLatestLog(r)); return d > 7 && d <= 14 })
        if (procSearch) {
          const q = procSearch.toLowerCase()
          filtered = filtered.filter((r) =>
            r.roll_code.toLowerCase().includes(q) ||
            r.fabric_type?.toLowerCase().includes(q) ||
            r.color?.toLowerCase().includes(q) ||
            (getLatestLog(r)?.va_party?.name || '').toLowerCase().includes(q)
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
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-orange-500">Rolls Out</div>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                  <div className="text-2xl font-bold text-blue-700">{totalWeight.toFixed(3)} kg</div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-500">Total Weight</div>
                </div>
                <div className="rounded-lg bg-purple-50 border border-purple-100 p-3">
                  <div className="text-2xl font-bold text-purple-700">{vendorCount}</div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-500">Vendors</div>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                  <div className="text-2xl font-bold text-red-700">{overdueCount}</div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-red-500">Overdue (&gt;14 days)</div>
                </div>
              </div>
            )}

            {/* ── Filter toolbar ── */}
            {!procLoading && procRolls.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <select value={procProcessFilter} onChange={(e) => setProcProcessFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                  <option value="">All Value Additions</option>
                  {uniqueVAs.map((va) => <option key={va.id} value={va.id}>{va.name} ({va.short_code})</option>)}
                </select>
                <select value={procVendorFilter} onChange={(e) => setProcVendorFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                  <option value="">All Vendors</option>
                  {uniqueVendors.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-500 uppercase mr-1">Duration:</span>
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

            {/* ── Job Challan grouped cards ── */}
            {!procLoading && filtered.length > 0 && (() => {
              const groups = {}
              for (const r of filtered) {
                const log = getLatestLog(r)
                if (!log) continue
                const key = log.job_challan_id || `no-challan-${log.va_party?.name || '?'}|||${log.value_addition?.id || '?'}`
                if (!groups[key]) groups[key] = {
                  challanId: log.job_challan_id,
                  challanNo: log.challan_no || null,
                  vaPartyName: log.va_party?.name || '—',
                  vaPartyPhone: log.va_party?.phone || '',
                  va: log.value_addition,
                  sentDate: log.sent_date,
                  rolls: [],
                }
                groups[key].rolls.push({ roll: r, log })
              }
              const groupList = Object.values(groups).sort((a, b) => (b.challanNo || '').localeCompare(a.challanNo || ''))
              if (groupList.length === 0) return null
              return (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {groupList.map((g, gi) => {
                    const vaColor = g.va ? getVAColor(g.va.short_code) : DEFAULT_VA_COLOR
                    const totalWt = g.rolls.reduce((s, item) => s + (parseFloat(item.log.weight_before) || 0), 0)
                    const daysOut = g.sentDate ? Math.floor((Date.now() - new Date(g.sentDate).getTime()) / (1000 * 60 * 60 * 24)) : 0
                    return (
                      <div key={gi} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                        <div className="p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              {g.challanNo && (
                                <div className="font-mono text-xs font-bold text-orange-700 mb-0.5">{g.challanNo}</div>
                              )}
                              <div className="font-semibold text-gray-800 text-sm">{g.vaPartyName}</div>
                              <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${vaColor.bg} ${vaColor.text}`}>
                                {g.va?.name || '—'} ({g.va?.short_code || '?'})
                              </span>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {daysOut > 14 ? (
                                <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">{daysOut}d overdue</span>
                              ) : daysOut > 7 ? (
                                <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{daysOut}d</span>
                              ) : (
                                <span className="text-[10px] font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">{daysOut}d</span>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {g.rolls.map(item => (
                              <span key={item.roll.id} className="text-[10px] font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                                {item.roll.roll_code} <span className="text-gray-400">{parseFloat(item.log.weight_before || 0).toFixed(1)}kg</span>
                              </span>
                            ))}
                          </div>
                          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                            <span>{g.rolls.length} roll{g.rolls.length > 1 ? 's' : ''}</span>
                            <span>{totalWt.toFixed(3)} kg</span>
                          </div>
                        </div>
                        <div className="flex border-t border-gray-100 divide-x divide-gray-100">
                          <button onClick={async () => {
                              if (g.challanId) {
                                try {
                                  const res = await getJobChallan(g.challanId)
                                  const c = res.data?.data || res.data
                                  setJobChallanData({
                                    challanNo: c.challan_no,
                                    rolls: c.rolls || g.rolls.map(item => item.roll),
                                    vaName: c.value_addition?.name || g.va?.name || '—',
                                    vaShortCode: c.value_addition?.short_code || g.va?.short_code || '—',
                                    vaPartyName: c.va_party?.name || g.vaPartyName,
                                    vaPartyPhone: c.va_party?.phone || g.vaPartyPhone,
                                    sentDate: c.sent_date || g.sentDate || '',
                                    notes: c.notes || '',
                                  })
                                  setShowJobChallan(true)
                                  return
                                } catch { /* fallback */ }
                              }
                              setJobChallanData({
                                rolls: g.rolls.map(item => item.roll),
                                vaName: g.va?.name || '—',
                                vaShortCode: g.va?.short_code || '—',
                                vaPartyName: g.vaPartyName,
                                vaPartyPhone: g.vaPartyPhone,
                                sentDate: g.sentDate || '',
                                notes: '',
                              })
                              setShowJobChallan(true)
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-orange-700 hover:bg-orange-50 transition-colors">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            Print
                          </button>
                          <button onClick={() => openBulkReceive(g)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-green-700 hover:bg-green-50 transition-colors">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Receive All
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

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
      <Modal open={!!selectedInvoice} onClose={() => { setSelectedInvoice(null); setSelectedInvRolls(new Set()) }}
        title={selectedInvoice?.invoice_no ? `Invoice: ${selectedInvoice.invoice_no}` : 'Invoice Details'} extraWide
        actions={
          <div className="flex w-full items-center justify-between">
            <div className="flex gap-2">
              {isInvoiceEditable(selectedInvoice) && (
                <button onClick={openEditInvoice}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Invoice
                </button>
              )}
              {selectedInvoice?.rolls?.length > 0 && (
                <button onClick={() => { setLastSavedRolls(selectedInvoice.rolls); setSelectedInvoice(null); setSelectedInvRolls(new Set()); setShowLabelSheet(true) }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print All Labels ({selectedInvoice.rolls.length})
                </button>
              )}
              {(() => {
                const selectable = selectedInvoice?.rolls?.filter(r => (r.status === 'in_stock' || r.status === 'remnant') && parseFloat(r.remaining_weight) > 0) || []
                if (selectable.length === 0) return null
                return (
                  <button onClick={() => {
                      // Group selectable rolls by fabric_type
                      const groups = {}
                      for (const r of selectable) {
                        const key = r.fabric_type || 'Unknown'
                        if (!groups[key]) groups[key] = []
                        groups[key].push(r)
                      }
                      const designs = Object.entries(groups).map(([fabric, rolls]) => ({
                        fabric, rollCount: rolls.length,
                        totalWeight: rolls.reduce((s, r) => s + parseFloat(r.remaining_weight), 0),
                        rollIds: rolls.map(r => r.id),
                      }))
                      if (designs.length === 1) {
                        navigate('/lots', { state: { preselectedRolls: designs[0].rollIds } })
                        setSelectedInvoice(null); setSelectedInvRolls(new Set())
                      } else {
                        setLotDesignPicker({ designs, allSelectableIds: selectable.map(r => r.id) })
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    Create Lot ({selectable.length})
                  </button>
                )
              })()}
              {selectedInvoice && !isInvoiceEditable(selectedInvoice) && (
                <span className="text-xs text-gray-400 italic self-center">Some rolls are used — invoice is read-only</span>
              )}
            </div>
            <button onClick={() => { setSelectedInvoice(null); setSelectedInvRolls(new Set()) }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Close</button>
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
          // Selectable rolls: in_stock with remaining weight
          const selectableInvRolls = selectedInvoice.rolls.filter(r => (r.status === 'in_stock' || r.status === 'remnant') && parseFloat(r.remaining_weight) > 0)
          const selectableInvIds = new Set(selectableInvRolls.map(r => r.id))

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
                {selectedInvoice.gst_percent > 0 && (
                  <div>
                    <span className="text-gray-400">GST:</span>{' '}
                    <span className="font-semibold text-amber-700">{selectedInvoice.gst_percent}%</span>
                  </div>
                )}
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
                  {selectedInvoice.gst_percent > 0 && (
                    <span className="text-amber-500 ml-1">+{selectedInvoice.gst_percent}% GST = ₹{selectedInvoice.total_with_gst?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  )}
                </span>
              </div>

              {/* ── Shift+Click hint + Select All ── */}
              {selectableInvRolls.length > 0 && (
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>Shift+Click to select rolls for lot creation</span>
                  {selectedInvRolls.size > 0 && (
                    <span className="font-medium text-blue-600">{selectedInvRolls.size} selected</span>
                  )}
                  <button onClick={() => {
                    if (selectedInvRolls.size === selectableInvRolls.length) {
                      setSelectedInvRolls(new Set())
                    } else {
                      setSelectedInvRolls(new Set(selectableInvRolls.map(r => r.id)))
                    }
                  }} className="text-blue-500 hover:text-blue-700 underline">
                    {selectedInvRolls.size === selectableInvRolls.length ? 'Deselect All' : 'Select All Available'}
                  </button>
                </div>
              )}

              {/* ── Design Groups ── */}
              {fabricGroups.map((grp, gIdx) => {
                const grpWeight = grp.rolls.reduce((s, r) => s + (parseFloat(r.total_weight) || 0), 0)
                const grpValue = grp.rolls.reduce((s, r) => s + (parseFloat(r.total_weight) || 0) * (parseFloat(r.cost_per_unit) || 0), 0)
                const colorEntries = Object.entries(grp.colorMap)

                return (
                  <div key={gIdx} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    {/* Design group header bar — matches entry style */}
                    <div className="flex items-center justify-between bg-blue-50 border-b border-blue-100 px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">{gIdx + 1}</span>
                        <span className="text-xs font-semibold text-blue-800">{grp.fabric}</span>
                        <span className="text-xs text-blue-500">
                          {grp.rolls.length} roll{grp.rolls.length > 1 ? 's' : ''} · {grpWeight.toFixed(3)} kg
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
                        <span className="text-xs font-semibold text-gray-500 uppercase">Roll Weights (kg)</span>
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
                                  const currWt = parseFloat(roll.current_weight) || wt
                                  const isUsed = currWt > 0 && rem < currWt
                                  const isProcessing = roll.status === 'sent_for_processing'
                                  const receivedVAs = (roll.processing_logs || []).filter(l => l.status === 'received')
                                  const hasVA = receivedVAs.length > 0
                                  const vaSuffixes = hasVA ? receivedVAs.map(l => l.value_addition?.short_code).filter(Boolean).join('+') : ''
                                  const isSelectable = selectableInvIds.has(roll.id)
                                  const isSelected = selectedInvRolls.has(roll.id)
                                  return (
                                    <button
                                      key={roll.id}
                                      data-inv-roll-id={roll.id}
                                      onClick={(e) => {
                                        if (e.shiftKey && isSelectable) {
                                          setSelectedInvRolls(prev => { const next = new Set(prev); if (next.has(roll.id)) next.delete(roll.id); else next.add(roll.id); return next })
                                        } else {
                                          openRollFromInvoice(roll)
                                        }
                                      }}
                                      title={`${roll.roll_code}${vaSuffixes ? '+' + vaSuffixes : ''} — ${wt} kg${hasVA ? ` (now ${currWt})` : ''}${isUsed ? ` (${rem} remaining)` : ''}${isProcessing ? ' [Processing]' : ''}${isSelectable ? ' (Shift+Click to select)' : ''}`}
                                      className={`relative inline-flex items-center rounded border px-2.5 py-1 text-sm tabular-nums transition-colors cursor-pointer
                                        ${isSelected
                                          ? 'ring-2 ring-blue-500 border-blue-400 bg-blue-50 text-blue-800'
                                          : isProcessing
                                            ? 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100'
                                            : isUsed
                                              ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                              : hasVA
                                                ? 'border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100'
                                                : 'border-gray-300 bg-white text-gray-800 hover:bg-blue-50 hover:border-blue-300'}`}
                                    >
                                      {isSelected && (
                                        <svg className="absolute -top-1 -right-1 h-3.5 w-3.5 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                      )}
                                      {wt.toFixed(3)}
                                      {hasVA && !isProcessing && !isUsed && (
                                        <span className="ml-1 text-[10px] font-bold text-purple-600">+{vaSuffixes}</span>
                                      )}
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
                                {colorWeight.toFixed(3)} kg
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
                          <span className="font-medium text-gray-700">{grpWeight.toFixed(3)} kg</span>
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

              {/* ── Sticky action bar for selected rolls ── */}
              {selectedInvRolls.size > 0 && (
                <div className="sticky bottom-0 z-10 mt-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/95 backdrop-blur px-5 py-3 shadow-lg">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">{selectedInvRolls.size}</span>
                    <span className="text-sm font-semibold text-emerald-800">roll{selectedInvRolls.size > 1 ? 's' : ''} selected</span>
                    <button onClick={() => setSelectedInvRolls(new Set())} className="text-xs text-emerald-500 hover:text-emerald-700 underline">Clear</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => {
                        navigate('/lots', { state: { preselectedRolls: [...selectedInvRolls] } })
                        setSelectedInvoice(null); setSelectedInvRolls(new Set())
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      Create Lot ({selectedInvRolls.size})
                    </button>
                    <button onClick={() => {
                        const invRollObjects = selectedInvoice.rolls.filter(r => selectedInvRolls.has(r.id))
                        setBulkSendRolls(invRollObjects)
                        setBulkSendForm({ value_addition_id: '', va_party_id: '', sent_date: new Date().toISOString().split('T')[0], notes: '' })
                        const wts = {}; invRollObjects.forEach(r => { wts[r.id] = String(r.remaining_weight || r.current_weight || r.total_weight) }); setBulkSendWeights(wts)
                        setBulkSendError(null)
                        fetchNextJCNo()
                        setSelectedInvoice(null); setSelectedInvRolls(new Set())
                        setBulkSendOpen(true)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 transition-colors">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Send for Processing ({selectedInvRolls.size})
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* ════════════════════════════════════════════════════════
          MULTI-DESIGN LOT PICKER (from Create Lot from Invoice)
         ════════════════════════════════════════════════════════ */}
      <Modal open={!!lotDesignPicker} onClose={() => setLotDesignPicker(null)} title="Multiple Fabric Types Found">
        {lotDesignPicker && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">This invoice has {lotDesignPicker.designs.length} fabric types. Choose which to create a lot for:</p>
            <div className="space-y-2">
              {lotDesignPicker.designs.map((d, i) => (
                <button key={i} onClick={() => {
                    navigate('/lots', { state: { preselectedRolls: d.rollIds } })
                    setLotDesignPicker(null); setSelectedInvoice(null); setSelectedInvRolls(new Set())
                  }}
                  className="w-full flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left hover:border-emerald-300 hover:bg-emerald-50 transition-colors">
                  <div>
                    <span className="text-sm font-semibold text-gray-800">{d.fabric}</span>
                    <span className="ml-2 text-xs text-gray-500">{d.rollCount} roll{d.rollCount > 1 ? 's' : ''}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-600">{d.totalWeight.toFixed(1)} kg</span>
                </button>
              ))}
            </div>
            <div className="border-t pt-3">
              <button onClick={() => {
                  navigate('/lots', { state: { preselectedRolls: lotDesignPicker.allSelectableIds } })
                  setLotDesignPicker(null); setSelectedInvoice(null); setSelectedInvRolls(new Set())
                }}
                className="w-full rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50/50 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors">
                Create Combined Lot — all {lotDesignPicker.allSelectableIds.length} rolls
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ════════════════════════════════════════════════════════
          STOCK IN — Full-page challan entry
         ════════════════════════════════════════════════════════ */}
      {stockInOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
          {/* ── Top bar (sticky) ── */}
          <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-2 shadow-sm">
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
                        {challanTotals.gstAmount > 0 && (
                          <span className="text-amber-500 ml-1">+{challanTotals.gstPercent}% = ₹{challanTotals.totalWithGst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                        )}
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
          <div className="flex-1 overflow-y-auto px-4 py-2">
            <div className="mx-auto max-w-6xl space-y-2">
              {formError && <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />}

              {/* ── Invoice Header ── */}
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
                <div className="flex items-center justify-between mb-1.5">
                  <h2 className="text-xs font-semibold text-gray-600">Invoice / Challan Details</h2>
                  <span className="text-[10px] text-gray-400"><kbd className="px-1 py-0.5 font-mono bg-gray-100 border border-gray-300 rounded text-[9px]">Shift+M</kbd> on any dropdown to quick-add master</span>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  <div>
                    <label className={LABEL_CLS}>Sr. No.</label>
                    <div className="relative">
                      <input type="text" tabIndex={-1} value={invoiceHeader.sr_no} onChange={(e) => setHeader('sr_no', e.target.value)}
                        className={`${INPUT_CLS} font-bold text-primary-700 bg-primary-50`} />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">Filing</span>
                    </div>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className={LABEL_CLS}>Supplier <span className="text-red-500">*</span></label>
                    <select data-master="supplier" data-supplier-input="true" value={invoiceHeader.supplier_id} onChange={(e) => setHeader('supplier_id', e.target.value)} className={INPUT_CLS}>
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
                    <label className={LABEL_CLS}>GST %</label>
                    <select value={invoiceHeader.gst_percent} onChange={(e) => setHeader('gst_percent', e.target.value)} className={INPUT_CLS}>
                      <option value="">0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
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
                  <div key={gIdx} className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                    {/* Design header bar */}
                    <div className="flex items-center justify-between bg-blue-50 border-b border-blue-100 px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">{gIdx + 1}</span>
                        <span className="text-xs font-semibold text-blue-800">
                          {grp.fabric_type.trim() || `Design ${gIdx + 1}`}
                        </span>
                        {grpTotals.count > 0 && (
                          <span className="text-xs text-blue-500">
                            {grpTotals.count} roll{grpTotals.count > 1 ? 's' : ''} · {grpTotals.weight.toFixed(3)} kg
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

                    <div className="px-3 py-2 space-y-2">
                      {/* Fabric / Panna / GSM / Rate / Unit / Notes row */}
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                        <div>
                          <label className={LABEL_CLS}>Fabric / Design <span className="text-red-500">*</span></label>
                          <select data-master="fabric" data-fabric-input="true" value={grp.fabric_type} onChange={(e) => setGroupField(gIdx, 'fabric_type', e.target.value)} className={INPUT_CLS}>
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
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                            Color-wise Rolls <span className="font-normal normal-case text-gray-400 ml-1">(Enter on empty = new color)</span>
                          </span>
                          <button onClick={() => addColorRow(gIdx)} className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Add Color
                          </button>
                        </div>

                        {/* Grid header */}
                        <div className="rounded-t border border-b-0 border-gray-200 bg-gray-100 px-3 py-1 grid grid-cols-[160px_1fr_50px] gap-2 items-center">
                          <span className="text-xs font-semibold text-gray-500 uppercase">Color</span>
                          <span className="text-xs font-semibold text-gray-500 uppercase">Weights (kg) — Enter/Tab between fields</span>
                          <span className="text-xs font-semibold text-gray-500 uppercase text-center">Rolls</span>
                        </div>

                        {/* Grid rows */}
                        <div className="border border-gray-200 rounded-b divide-y divide-gray-100 bg-white" data-design-group={gIdx}>
                          {grp.colorRows.map((row, cIdx) => {
                            const validCount = row.weights.filter((w) => parseFloat(w) > 0).length
                            const rowWeight = row.weights.reduce((s, w) => s + (parseFloat(w) || 0), 0)
                            const hasData = row.color !== '' || row.weights.some((w) => w !== '')
                            const isDeletePending = pendingDeleteRow?.gIdx === gIdx && pendingDeleteRow?.cIdx === cIdx
                            return (
                              <div key={cIdx} className={`px-3 py-1 grid grid-cols-[160px_1fr_50px] gap-2 items-center group ${isDeletePending ? 'bg-red-50' : 'hover:bg-gray-50/50'}`}>
                                {/* Color name */}
                                <div className="flex items-center gap-1.5">
                                  {isDeletePending ? (
                                    <div className="w-full flex items-center gap-1.5 text-xs">
                                      <span className="text-red-600 font-medium">Delete {row.color || 'row'}?</span>
                                      <button onClick={() => { removeColorRow(gIdx, cIdx); setPendingDeleteRow(null) }}
                                        className="rounded bg-red-600 px-1.5 py-0.5 text-white font-medium hover:bg-red-700"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Escape') { e.preventDefault(); setPendingDeleteRow(null) }
                                        }}
                                        autoFocus>Yes</button>
                                      <button onClick={() => setPendingDeleteRow(null)}
                                        className="rounded bg-gray-200 px-1.5 py-0.5 text-gray-700 font-medium hover:bg-gray-300">Esc</button>
                                    </div>
                                  ) : (
                                  <select
                                    data-master="color" data-color-idx={cIdx}
                                    data-color-input="true"
                                    value={row.color}
                                    onChange={(e) => setColorName(gIdx, cIdx, e.target.value)}
                                    className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm font-medium focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                    onKeyDown={(e) => {
                                      // Shift+G → new design group (from any color select)
                                      if (e.key.toLowerCase() === 'g' && e.shiftKey && !e.ctrlKey && !e.altKey) {
                                        e.preventDefault()
                                        if (!hasData && grp.colorRows.length > 1) removeColorRow(gIdx, cIdx)
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
                                      // Delete key → confirm before removing color row
                                      if (e.key === 'Delete' && grp.colorRows.length > 1) {
                                        e.preventDefault()
                                        if (!hasData) {
                                          removeColorRow(gIdx, cIdx) // empty row — no confirmation needed
                                        } else {
                                          setPendingDeleteRow({ gIdx, cIdx })
                                        }
                                        return
                                      }
                                      // Tab → focus first weight (if color selected)
                                      if (e.key === 'Tab' && !e.shiftKey) {
                                        if (row.color) {
                                          e.preventDefault()
                                          const gridRow = e.target.closest('.group')
                                          const firstWeight = gridRow?.querySelector('input[data-weight]')
                                          firstWeight?.focus()
                                        }
                                      }
                                      // Enter → let browser open the dropdown naturally (no override)
                                      // Backspace or Shift+Tab on empty color → delete row, jump back to previous row's last weight
                                      if ((e.key === 'Backspace' || (e.key === 'Tab' && e.shiftKey)) && !hasData && cIdx > 0) {
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
                                  )}
                                  {grp.colorRows.length > 1 && !isDeletePending && (
                                    <button onClick={() => {
                                        if (!hasData) { removeColorRow(gIdx, cIdx) }
                                        else { setPendingDeleteRow({ gIdx, cIdx }) }
                                      }} title="Remove color (Delete)"
                                      className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-gray-300 hover:text-red-500 transition-opacity flex-shrink-0">
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                  )}
                                </div>

                                {/* Weight inputs */}
                                <div className="flex flex-wrap items-center gap-1">
                                  {row.weights.map((w, wIdx) => (
                                    <div key={wIdx} className="relative">
                                      <input
                                        data-weight="true"
                                        type="number"
                                        step="0.001"
                                        value={w}
                                        onChange={(e) => setWeight(gIdx, cIdx, wIdx, e.target.value)}
                                        placeholder="0.000"
                                        className="w-[80px] rounded border border-gray-300 px-1.5 py-1 text-sm text-center tabular-nums focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                                    className="flex h-[28px] w-[28px] items-center justify-center rounded border border-dashed border-gray-300 text-gray-400 hover:border-primary-400 hover:text-primary-600 transition-colors">
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
                className="w-full rounded-lg border-2 border-dashed border-gray-300 py-2 text-xs font-medium text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors">
                + Add Another Design / Fabric
              </button>

              {/* Grand total summary */}
              {challanTotals.count > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div>
                      <span className="text-gray-400">Rolls</span>
                      <div className="text-sm font-bold text-gray-800">{challanTotals.count}</div>
                    </div>
                    <div className="h-7 w-px bg-gray-200" />
                    <div>
                      <span className="text-gray-400">Weight</span>
                      <div className="text-sm font-bold text-gray-800">{challanTotals.weight.toFixed(3)} kg</div>
                    </div>
                    <div className="h-7 w-px bg-gray-200" />
                    <div>
                      <span className="text-gray-400">Colors</span>
                      <div className="text-sm font-bold text-gray-800">{challanTotals.colors}</div>
                    </div>
                    <div className="h-7 w-px bg-gray-200" />
                    <div>
                      <span className="text-gray-400">Designs</span>
                      <div className="text-sm font-bold text-gray-800">{designGroups.length}</div>
                    </div>
                    {challanTotals.value > 0 && (
                      <>
                        <div className="h-7 w-px bg-gray-200" />
                        <div>
                          <span className="text-gray-400">Subtotal</span>
                          <div className="text-sm font-bold text-green-700">₹{challanTotals.value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        </div>
                        {challanTotals.gstAmount > 0 && (
                          <>
                            <div className="h-7 w-px bg-gray-200" />
                            <div>
                              <span className="text-gray-400">GST {challanTotals.gstPercent}%</span>
                              <div className="text-sm font-bold text-amber-600">₹{challanTotals.gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                            </div>
                            <div className="h-7 w-px bg-gray-200" />
                            <div>
                              <span className="text-gray-400">Total</span>
                              <div className="text-sm font-bold text-green-800">₹{challanTotals.totalWithGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Keyboard hints */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 pb-2">
                <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Enter</kbd> Next weight</span>
                <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Enter</kbd> on empty = New color</span>
                <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Backspace</kbd> on empty = Go back</span>
                <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Shift+G</kbd> New design group</span>
                <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Shift+M</kbd> Quick create master</span>
                <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Delete</kbd> Remove color row</span>
                <span><kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono">Ctrl+S</kbd> Save</span>
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
                <button onClick={() => { setLastSavedRolls([detailRoll]); setDetailRoll(null); setCameFromInvoice(null); setShowLabelSheet(true) }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print Label
                </button>
                {detailRoll?.status === 'in_stock' && (
                  <button onClick={() => openSendProcessing(detailRoll)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100 transition-colors">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Send for Processing
                  </button>
                )}
                {detailRoll?.status === 'sent_for_processing' && (() => {
                  const latestLog = detailRoll.processing_logs?.[detailRoll.processing_logs.length - 1]
                  return (
                    <>
                      <button onClick={() => openReceiveProcessing(detailRoll)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Receive Back
                      </button>
                      {latestLog && (
                        <button onClick={async () => {
                            // Try to fetch from DB if log has a job_challan_id
                            const challanId = latestLog.job_challan_id
                            if (challanId) {
                              try {
                                const res = await getJobChallan(challanId)
                                const c = res.data?.data || res.data
                                setJobChallanData({
                                  challanNo: c.challan_no,
                                  rolls: c.rolls || [detailRoll],
                                  vaName: c.value_addition?.name || latestLog.value_addition?.name || '—',
                                  vaShortCode: c.value_addition?.short_code || latestLog.value_addition?.short_code || '—',
                                  vaPartyName: c.va_party?.name || latestLog.va_party?.name || '—',
                                  vaPartyPhone: c.va_party?.phone || latestLog.va_party?.phone || '',
                                  sentDate: c.sent_date || latestLog.sent_date || '',
                                  notes: c.notes || '',
                                })
                                setDetailRoll(null)
                                setCameFromInvoice(null)
                                setShowJobChallan(true)
                                return
                              } catch { /* fallback */ }
                            }
                            // Fallback: use client-side data
                            const vendorKey = latestLog.va_party?.name
                            const vaId = latestLog.value_addition?.id
                            const groupRolls = procRolls.filter((r) => {
                              const log = r.processing_logs?.[r.processing_logs.length - 1]
                              return log?.va_party?.name === vendorKey && log?.value_addition?.id === vaId
                            })
                            setJobChallanData({
                              rolls: groupRolls.length > 0 ? groupRolls : [detailRoll],
                              vaName: latestLog.value_addition?.name || '—',
                              vaShortCode: latestLog.value_addition?.short_code || '—',
                              vaPartyName: latestLog.va_party?.name || '—',
                              vaPartyPhone: latestLog.va_party?.phone || '',
                              sentDate: latestLog.sent_date || '',
                              notes: latestLog.notes || '',
                            })
                            setDetailRoll(null)
                            setCameFromInvoice(null)
                            setShowJobChallan(true)
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100 transition-colors">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          Print Challan
                        </button>
                      )}
                    </>
                  )
                })()}
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
          const rateUnit = detailRoll.unit === 'meters' ? 'm' : 'kg'
          const totalQty = detailRoll.total_weight
          const remainQty = detailRoll.remaining_weight
          const currentWt = parseFloat(detailRoll.current_weight) || parseFloat(detailRoll.total_weight) || 0
          const origWt = parseFloat(detailRoll.total_weight) || 0
          const wtDelta = currentWt - origWt
          const pct = totalQty > 0 ? (remainQty / totalQty) * 100 : 0
          const totalValue = origWt * (parseFloat(detailRoll.cost_per_unit) || 0)
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
                            : `${((detailRoll.current_weight || detailRoll.total_weight) - detailRoll.remaining_weight).toFixed(3)} kg has already been used in lots/cutting. Only unused rolls can be edited.`}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* KPI Summary — compact single row */}
                  <div className="flex items-center gap-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">Original</span>
                      <span className="text-sm font-bold text-blue-700">{origWt} kg</span>
                    </div>
                    {Math.abs(wtDelta) >= 0.001 && (
                      <>
                        <div className="h-4 w-px bg-gray-300" />
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-500">Wt. Change</span>
                          <span className={`text-sm font-bold ${wtDelta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {wtDelta > 0 ? '+' : ''}{wtDelta.toFixed(2)} kg
                          </span>
                        </div>
                      </>
                    )}
                    <div className="h-4 w-px bg-gray-300" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">Remaining</span>
                      <span className="text-sm font-bold text-green-700">{remainQty} kg</span>
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
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Material Information</h3>
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-0 divide-y divide-gray-100">
                        {[
                          ['Roll Code', <span key="rc" className="font-mono text-primary-600 font-semibold">{detailRoll.roll_code}{detailRoll.enhanced_roll_code && detailRoll.enhanced_roll_code !== detailRoll.roll_code && <span className="text-orange-600">{detailRoll.enhanced_roll_code.slice(detailRoll.roll_code.length)}</span>}</span>],
                          ['Status', <StatusBadge key="st" status={detailRoll.status || 'in_stock'} label={ROLL_STATUS_LABELS[detailRoll.status] || 'In Stock'} />],
                          ['Fabric Type', detailRoll.fabric_type],
                          ['Color', detailRoll.color],
                          ['Rate Unit', detailRoll.unit === 'meters' ? 'Meters' : 'Kilograms'],
                          ['Original Weight', `${totalQty} kg`],
                          ...(Math.abs(wtDelta) >= 0.001 ? [['Current Weight',
                            <span key="cw">{currentWt.toFixed(3)} kg <span className={`text-xs ${wtDelta > 0 ? 'text-green-600' : 'text-red-600'}`}>({wtDelta > 0 ? '+' : ''}{wtDelta.toFixed(2)})</span></span>
                          ]] : []),
                          ...(detailRoll.total_length
                            ? [['Length (ref)', `${detailRoll.total_length} m`]]
                            : []),
                          ['Cost / ' + rateUnit, detailRoll.cost_per_unit != null ? `₹${detailRoll.cost_per_unit}` : '—'],
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
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Supplier & Invoice</h3>
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
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Receiving Details</h3>
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
                          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</h3>
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
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Processing History</h3>
                      <div className="space-y-3">
                        {procLogs.map((log, idx) => {
                          const va = log.value_addition
                          const vc = va ? getVAColor(va.short_code) : DEFAULT_VA_COLOR
                          const isActive = log.status === 'sent'
                          return (
                            <div key={log.id || idx} className={`rounded-lg border p-4 ${isActive ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${vc.bg} ${vc.text}`}>
                                    {va?.name || '—'}
                                  </span>
                                  {va && (
                                    <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">+{va.short_code}</span>
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
                                <div><span className="text-gray-500">VA Party:</span> <span className="text-gray-800">{log.va_party?.name}</span></div>
                                {log.va_party?.phone && <div><span className="text-gray-500">Phone:</span> <span className="text-gray-800">{log.va_party?.phone}</span></div>}
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

        {/* Challan Number Preview */}
        {nextJCNo && (
          <div className="mb-4 flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Challan No.</div>
            <div className="font-mono font-bold text-amber-900 text-sm">{nextJCNo}</div>
            <div className="text-[10px] text-amber-500 ml-auto">Auto-generated</div>
          </div>
        )}

        {sendProcRoll && (
          <div className="mb-5 rounded-lg bg-blue-50 border border-blue-100 p-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div><span className="text-blue-500">Roll:</span> <span className="font-medium text-blue-800">{sendProcRoll.roll_code}</span></div>
              <div><span className="text-blue-500">Fabric:</span> <span className="font-medium text-blue-800">{sendProcRoll.fabric_type}</span></div>
              <div><span className="text-blue-500">Color:</span> <span className="font-medium text-blue-800">{sendProcRoll.color}</span></div>
              <div><span className="text-blue-500">Original:</span> <span className="font-medium text-blue-800">{sendProcRoll.total_weight} kg</span></div>
              {sendProcRoll.current_weight !== sendProcRoll.total_weight && (
                <div><span className="text-blue-500">Current:</span> <span className="font-medium text-blue-800">{sendProcRoll.current_weight} kg</span></div>
              )}
              <div><span className="text-blue-500">Remaining:</span> <span className="font-bold text-blue-900">{sendProcRoll.remaining_weight} kg</span></div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className={LABEL_CLS}>Weight to Send (kg) <span className="text-red-500">*</span></label>
            <div className="flex items-center gap-3">
              <input type="number" step="0.001" min="0.001"
                max={sendProcRoll ? (sendProcRoll.remaining_weight || sendProcRoll.current_weight || sendProcRoll.total_weight) : undefined}
                value={sendProcForm.weight_to_send} onChange={(e) => setSendProcForm((f) => ({ ...f, weight_to_send: e.target.value }))}
                className={INPUT_CLS + ' max-w-[180px]'} />
              {sendProcRoll && (
                <button type="button" onClick={() => setSendProcForm((f) => ({ ...f, weight_to_send: String(sendProcRoll.remaining_weight || sendProcRoll.current_weight) }))}
                  className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap">Send All</button>
              )}
            </div>
            {sendProcRoll && <p className="mt-1 text-xs text-gray-400">Max: {sendProcRoll.remaining_weight} kg (remaining). Send less to keep the roll in stock.</p>}
          </div>
          <div>
            <label className={LABEL_CLS}>Value Addition <span className="text-red-500">*</span></label>
            <select data-master="value_addition" value={sendProcForm.value_addition_id} onChange={(e) => setSendProcForm((f) => ({ ...f, value_addition_id: e.target.value }))} className={INPUT_CLS}>
              <option value="">Select value addition</option>
              {masterValueAdditions.map((va) => <option key={va.id} value={va.id}>{va.name} ({va.short_code})</option>)}
            </select>
            <p className="mt-1 text-xs text-gray-400">Adds to enhanced roll code after completion (e.g. +EMB, +DYE)</p>
          </div>
          <div>
            <label className={LABEL_CLS}>VA Party <span className="text-red-500">*</span></label>
            <select data-master="va_party" value={sendProcForm.va_party_id} onChange={(e) => setSendProcForm((f) => ({ ...f, va_party_id: e.target.value }))} className={INPUT_CLS}>
              <option value="">Select VA Party…</option>
              {vaParties.filter(p => p.is_active !== false).map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.city ? ` (${p.city})` : ''}</option>
              ))}
            </select>
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
                <div><span className="text-orange-500">Process:</span> <span className="font-medium text-orange-800">{recvProcLog.value_addition?.name || '—'}</span></div>
                <div><span className="text-orange-500">VA Party:</span> <span className="font-medium text-orange-800">{recvProcLog.va_party?.name}</span></div>
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
        title={editProcLog ? `Edit Processing: ${editProcLog.value_addition?.name || '—'}` : 'Edit Processing Log'}
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
          {/* Row 1: Value Addition + VA Party */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Value Addition</label>
              <select data-master="value_addition" value={editProcForm.value_addition_id} onChange={(e) => setEditProcForm((f) => ({ ...f, value_addition_id: e.target.value }))} className={INPUT_CLS}>
                <option value="">Select value addition</option>
                {masterValueAdditions.map((va) => <option key={va.id} value={va.id}>{va.name} ({va.short_code})</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>VA Party</label>
              <select data-master="va_party" value={editProcForm.va_party_id} onChange={(e) => setEditProcForm((f) => ({ ...f, va_party_id: e.target.value }))} className={INPUT_CLS}>
                <option value="">Select VA Party…</option>
                {vaParties.filter(p => p.is_active !== false).map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.city ? ` (${p.city})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Sent Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      {/* ════════════════════════════════════════════════════════
          BULK SEND FOR PROCESSING — Full-page overlay
         ════════════════════════════════════════════════════════ */}
      {bulkSendOpen && (() => {
        const totalSendWt = bulkSendRolls.reduce((s, r) => s + (parseFloat(bulkSendWeights[r.id]) || 0), 0)
        return (
          <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col overflow-hidden">
            {/* ── Top bar ── */}
            <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Send {bulkSendRolls.length} Roll{bulkSendRolls.length > 1 ? 's' : ''} for Processing</h2>
                <p className="text-sm text-gray-500">Total send weight: {totalSendWt.toFixed(3)} kg</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setBulkSendOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={handleBulkSendProcessing} disabled={bulkSendSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-5 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  {bulkSendSaving ? 'Sending...' : 'Send & Print Challan'}
                </button>
              </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-4xl space-y-6">
                {bulkSendError && <ErrorAlert message={bulkSendError} onDismiss={() => setBulkSendError(null)} />}

                {/* Challan Number Preview */}
                {nextJCNo && (
                  <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Challan No.</div>
                    <div className="font-mono font-bold text-amber-900 text-base">{nextJCNo}</div>
                    <div className="text-[10px] text-amber-500 ml-auto">Auto-generated</div>
                  </div>
                )}

                {/* ── Selected Rolls Table ── */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">Selected Rolls</h3>
                    <button type="button" onClick={() => { const wts = {}; bulkSendRolls.forEach((r) => { wts[r.id] = String(r.remaining_weight || r.current_weight || r.total_weight) }); setBulkSendWeights(wts) }}
                      className="text-xs text-blue-600 hover:text-blue-800">Reset All to Full</button>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        <th className="px-4 py-2.5 text-center w-10">#</th>
                        <th className="px-4 py-2.5 text-left">Roll Code</th>
                        <th className="px-4 py-2.5 text-left">Fabric</th>
                        <th className="px-4 py-2.5 text-left">Color</th>
                        <th className="px-4 py-2.5 text-right">Remaining</th>
                        <th className="px-4 py-2.5 text-right">Send Weight</th>
                        <th className="px-4 py-2.5 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkSendRolls.map((r, i) => {
                        const maxWt = r.remaining_weight || r.current_weight || r.total_weight
                        return (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-2 text-center text-gray-400 font-medium">{i + 1}</td>
                          <td className="px-4 py-2 font-semibold text-gray-800">{r.enhanced_roll_code || r.roll_code}</td>
                          <td className="px-4 py-2 text-gray-600">{r.fabric_type}</td>
                          <td className="px-4 py-2 text-gray-600">{r.color}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{parseFloat(maxWt).toFixed(3)} kg</td>
                          <td className="px-4 py-2 text-right">
                            <input type="number" step="0.001" min="0.001" max={maxWt}
                              value={bulkSendWeights[r.id] || ''}
                              onChange={(e) => setBulkSendWeights((prev) => ({ ...prev, [r.id]: e.target.value }))}
                              className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500" />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button onClick={() => { setBulkSendRolls((prev) => { const next = prev.filter(x => x.id !== r.id); if (next.length === 0) setBulkSendOpen(false); return next }); setBulkSendWeights((prev) => { const next = { ...prev }; delete next[r.id]; return next }) }}
                              className="text-gray-400 hover:text-red-500 transition-colors" title="Remove">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold text-sm">
                        <td colSpan={5} className="px-4 py-2 text-right text-gray-600">Total: {bulkSendRolls.length} roll{bulkSendRolls.length > 1 ? 's' : ''}</td>
                        <td className="px-4 py-2 text-right">{totalSendWt.toFixed(3)} kg</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* ── Processing Details Form ── */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700">Processing Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={LABEL_CLS}>Value Addition <span className="text-red-500">*</span></label>
                      <select data-master="value_addition" value={bulkSendForm.value_addition_id} onChange={(e) => setBulkSendForm((f) => ({ ...f, value_addition_id: e.target.value }))} className={INPUT_CLS}>
                        <option value="">Select value addition</option>
                        {masterValueAdditions.map((va) => <option key={va.id} value={va.id}>{va.name} ({va.short_code})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Sent Date <span className="text-red-500">*</span></label>
                      <input type="date" value={bulkSendForm.sent_date} onChange={(e) => setBulkSendForm((f) => ({ ...f, sent_date: e.target.value }))} className={INPUT_CLS} />
                    </div>
                    <div>
                      <label className={LABEL_CLS}>VA Party <span className="text-red-500">*</span></label>
                      <select data-master="va_party" value={bulkSendForm.va_party_id} onChange={(e) => setBulkSendForm((f) => ({ ...f, va_party_id: e.target.value }))} className={INPUT_CLS}>
                        <option value="">Select VA Party…</option>
                        {vaParties.filter(p => p.is_active !== false).map(p => (
                          <option key={p.id} value={p.id}>{p.name}{p.city ? ` (${p.city})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Notes</label>
                    <textarea value={bulkSendForm.notes} onChange={(e) => setBulkSendForm((f) => ({ ...f, notes: e.target.value }))}
                      rows={2} placeholder="Instructions for the vendor..." className={INPUT_CLS} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ════════════════════════════════════════════════════════
          BULK RECEIVE FROM PROCESSING — Full-page overlay
         ════════════════════════════════════════════════════════ */}
      {bulkRecvOpen && bulkRecvChallan && (() => {
        const items = bulkRecvChallan.rolls
        const checkedItems = items.filter(item => bulkRecvRows[item.log.id]?.checked)
        const totalRecvWt = checkedItems.reduce((s, item) => s + (parseFloat(bulkRecvRows[item.log.id]?.weight_after) || 0), 0)
        const totalCost = checkedItems.reduce((s, item) => s + (parseFloat(bulkRecvRows[item.log.id]?.processing_cost) || 0), 0)
        return (
          <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Receive {checkedItems.length} Roll{checkedItems.length !== 1 ? 's' : ''}
                  {bulkRecvChallan.challanNo && <span className="ml-2 font-mono text-orange-600">{bulkRecvChallan.challanNo}</span>}
                </h2>
                <p className="text-sm text-gray-500">
                  {bulkRecvChallan.vaPartyName} — {bulkRecvChallan.va?.name || '—'} ({bulkRecvChallan.va?.short_code || '?'})
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setBulkRecvOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={handleBulkReceive} disabled={bulkRecvSaving || checkedItems.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {bulkRecvSaving ? 'Receiving...' : `Receive ${checkedItems.length} Roll${checkedItems.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-4xl space-y-6">
                {bulkRecvError && <ErrorAlert message={bulkRecvError} onDismiss={() => setBulkRecvError(null)} />}

                {/* Received Date */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Received Date</label>
                    <input type="date" value={bulkRecvDate} onChange={(e) => setBulkRecvDate(e.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500" />
                  </div>
                </div>

                {/* Rolls Table */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">Rolls</h3>
                    <div className="flex items-center gap-3">
                      <button onClick={() => {
                        const rows = { ...bulkRecvRows }
                        for (const item of items) { rows[item.log.id] = { ...rows[item.log.id], weight_after: String(item.log.weight_before || '') } }
                        setBulkRecvRows(rows)
                      }} className="text-xs text-blue-600 hover:text-blue-800">Reset Weights to Sent</button>
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={checkedItems.length === items.length}
                          onChange={(e) => {
                            const rows = { ...bulkRecvRows }
                            for (const item of items) { rows[item.log.id] = { ...rows[item.log.id], checked: e.target.checked } }
                            setBulkRecvRows(rows)
                          }}
                          className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
                        All
                      </label>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        <th className="px-4 py-2.5 text-center w-10"></th>
                        <th className="px-4 py-2.5 text-center w-10">#</th>
                        <th className="px-4 py-2.5 text-left">Roll Code</th>
                        <th className="px-4 py-2.5 text-left">Color</th>
                        <th className="px-4 py-2.5 text-right">Sent Wt</th>
                        <th className="px-4 py-2.5 text-right">Received Wt</th>
                        <th className="px-4 py-2.5 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => {
                        const row = bulkRecvRows[item.log.id] || {}
                        return (
                          <tr key={item.log.id} className={`border-b border-gray-50 ${!row.checked ? 'opacity-40' : ''} hover:bg-gray-50/50`}>
                            <td className="px-4 py-2 text-center">
                              <input type="checkbox" checked={!!row.checked}
                                onChange={(e) => setBulkRecvRows(prev => ({ ...prev, [item.log.id]: { ...prev[item.log.id], checked: e.target.checked } }))}
                                className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
                            </td>
                            <td className="px-4 py-2 text-center text-gray-400 font-medium">{i + 1}</td>
                            <td className="px-4 py-2 font-semibold text-gray-800">{item.roll.enhanced_roll_code || item.roll.roll_code}</td>
                            <td className="px-4 py-2 text-gray-600">{item.roll.color}</td>
                            <td className="px-4 py-2 text-right text-gray-500">{parseFloat(item.log.weight_before || 0).toFixed(3)} kg</td>
                            <td className="px-4 py-2 text-right">
                              <input type="number" step="0.001" min="0.001"
                                value={row.weight_after || ''}
                                onChange={(e) => setBulkRecvRows(prev => ({ ...prev, [item.log.id]: { ...prev[item.log.id], weight_after: e.target.value } }))}
                                disabled={!row.checked}
                                className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:bg-gray-100" />
                            </td>
                            <td className="px-4 py-2 text-right">
                              <input type="number" step="1" min="0"
                                value={row.processing_cost || ''}
                                onChange={(e) => setBulkRecvRows(prev => ({ ...prev, [item.log.id]: { ...prev[item.log.id], processing_cost: e.target.value } }))}
                                disabled={!row.checked}
                                className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:bg-gray-100"
                                placeholder="0" />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold text-sm">
                        <td colSpan={5} className="px-4 py-2 text-right text-gray-600">{checkedItems.length} of {items.length} rolls</td>
                        <td className="px-4 py-2 text-right">{totalRecvWt.toFixed(3)} kg</td>
                        <td className="px-4 py-2 text-right text-gray-600">{totalCost > 0 ? `₹${totalCost.toLocaleString()}` : '—'}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Shift+M Quick Master Create */}
      <QuickMasterModal type={quickMasterType} open={quickMasterOpen} onClose={closeQuickMaster} onCreated={onMasterCreated} />
    </div>
  )
}
