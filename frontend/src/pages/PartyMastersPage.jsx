import { useState, useEffect, useCallback, useMemo } from 'react'
import { getSuppliers, createSupplier, updateSupplier } from '../api/suppliers'
import { getVAParties, createVAParty, updateVAParty } from '../api/masters'
import { getCustomers, createCustomer, updateCustomer } from '../api/customers'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'

// ── Constants ────────────────────────────────────────────

const TABS = [
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'va_parties', label: 'VA Parties' },
  { key: 'customers', label: 'Customers' },
]

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Chandigarh', 'Puducherry',
]

const GST_TYPES = ['regular', 'composition', 'unregistered']
const MSME_TYPES = ['none', 'micro', 'small', 'medium']
const BALANCE_TYPES = ['debit', 'credit']

const PAGE_SIZE = 20

// ── Column Definitions ───────────────────────────────────

const SUPPLIER_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'contact_person', label: 'Contact Person', render: (v) => v || '—' },
  { key: 'phone', label: 'Phone', render: (v) => v || '—' },
  {
    key: 'city', label: 'City / State',
    render: (v, row) => v ? `${v}${row.state ? ', ' + row.state : ''}` : '—',
  },
  { key: 'gst_no', label: 'GST No.', render: (v) => v || '—' },
  {
    key: 'is_active', label: 'Status',
    render: (v) => <StatusBadge status={v ? 'active' : 'inactive'} />,
  },
]

const VA_PARTY_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone', render: (v) => v || '—' },
  { key: 'city', label: 'City', render: (v) => v || '—' },
  { key: 'gst_no', label: 'GST No.', render: (v) => v || '—' },
  { key: 'hsn_code', label: 'HSN Code', render: (v) => v || '—' },
  {
    key: 'is_active', label: 'Status',
    render: (v) => <StatusBadge status={v ? 'active' : 'inactive'} />,
  },
]

const CUSTOMER_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'contact_person', label: 'Contact Person', render: (v) => v || '—' },
  { key: 'phone', label: 'Phone', render: (v) => v || '—' },
  {
    key: 'city', label: 'City / State',
    render: (v, row) => v ? `${v}${row.state ? ', ' + row.state : ''}` : '—',
  },
  { key: 'gst_no', label: 'GST No.', render: (v) => v || '—' },
  { key: 'due_days', label: 'Due Days', render: (v) => v != null ? `${v}d` : '—' },
  {
    key: 'is_active', label: 'Status',
    render: (v) => <StatusBadge status={v ? 'active' : 'inactive'} />,
  },
]

const COLUMNS_MAP = {
  suppliers: SUPPLIER_COLUMNS,
  va_parties: VA_PARTY_COLUMNS,
  customers: CUSTOMER_COLUMNS,
}

// ── Empty Form Per Tab ───────────────────────────────────

const EMPTY_FORMS = {
  suppliers: {
    name: '', contact_person: '', broker: '',
    gst_no: '', gst_type: '', pan_no: '', aadhar_no: '', hsn_code: '',
    phone: '', phone_alt: '', email: '',
    address: '', city: '', state: '', pin_code: '',
    due_days: '', credit_limit: '', opening_balance: '', balance_type: '',
    tds_applicable: false, tds_rate: '', tds_section: '',
    msme_type: '', msme_reg_no: '',
    notes: '',
  },
  va_parties: {
    name: '', contact_person: '',
    gst_no: '', gst_type: '', pan_no: '', aadhar_no: '', hsn_code: '',
    phone: '', phone_alt: '', email: '',
    address: '', city: '', state: '', pin_code: '',
    due_days: '', credit_limit: '', opening_balance: '', balance_type: '',
    tds_applicable: false, tds_rate: '', tds_section: '',
    msme_type: '', msme_reg_no: '',
    notes: '',
  },
  customers: {
    name: '', short_name: '', contact_person: '', broker: '',
    gst_no: '', gst_type: '', pan_no: '', aadhar_no: '',
    phone: '', phone_alt: '', email: '',
    address: '', city: '', state: '', pin_code: '',
    due_days: '', credit_limit: '', opening_balance: '', balance_type: '',
    tds_applicable: false, tds_rate: '', tds_section: '',
    tcs_applicable: false, tcs_rate: '', tcs_section: '',
    notes: '',
  },
}

// ── Style Classes ────────────────────────────────────────

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
const LABEL = 'block text-sm font-medium text-gray-700 mb-1'
const HINT = 'text-xs text-gray-400 mt-0.5'
const SECTION_TITLE = 'text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3'

// ── Extracted Components (outside main to avoid re-mount) ──

function Field({ label, name, type = 'text', hint, placeholder, required, maxLength, className = '', form, set, fieldErrors }) {
  return (
    <div className={className}>
      <label className={LABEL}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={form[name] ?? ''}
        maxLength={maxLength}
        onChange={(e) => set(name, (type === 'text' && (name === 'gst_no' || name === 'pan_no')) ? e.target.value.toUpperCase() : e.target.value)}
        placeholder={placeholder}
        className={`${INPUT} ${fieldErrors[name] ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
      />
      {fieldErrors[name]
        ? <p className="text-xs text-red-500 mt-0.5">{fieldErrors[name]}</p>
        : hint ? <p className={HINT}>{hint}</p> : null}
    </div>
  )
}

function SelectField({ label, name, options, placeholder, form, set, className = '' }) {
  return (
    <div className={className}>
      <label className={LABEL}>{label}</label>
      <select value={form[name] ?? ''} onChange={(e) => set(name, e.target.value)} className={INPUT}>
        <option value="">{placeholder || `Select ${label}`}</option>
        {options.map((o) => {
          const val = typeof o === 'string' ? o : o.value
          const lbl = typeof o === 'string' ? o : o.label
          return <option key={val} value={val}>{lbl}</option>
        })}
      </select>
    </div>
  )
}

function CheckboxField({ label, name, form, set, className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        type="checkbox"
        checked={!!form[name]}
        onChange={(e) => set(name, e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
      />
      <label className="text-sm font-medium text-gray-700">{label}</label>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-800 text-right">{value || '—'}</span>
    </div>
  )
}

function InfoSection({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h3>
      <div className="bg-gray-50 rounded-lg p-3">{children}</div>
    </div>
  )
}

// ── Tab Label Map ────────────────────────────────────────

const TAB_LABELS = {
  suppliers: { singular: 'Supplier', plural: 'Suppliers', desc: 'Manage fabric and material suppliers' },
  va_parties: { singular: 'VA Party', plural: 'VA Parties', desc: 'Manage value addition processing parties' },
  customers: { singular: 'Customer', plural: 'Customers', desc: 'Manage customers and buyers' },
}

// ── Main Component ───────────────────────────────────────

export default function PartyMastersPage() {
  const [tab, setTab] = useState('suppliers')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORMS.suppliers)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [tdsOpen, setTdsOpen] = useState(false)
  const [msmeOpen, setMsmeOpen] = useState(false)

  const labels = TAB_LABELS[tab]
  const columns = COLUMNS_MAP[tab]

  // ── Data Fetching ──────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (tab === 'suppliers') {
        const res = await getSuppliers({ page, page_size: PAGE_SIZE, search: search || undefined })
        setItems(res.data.data)
        setTotal(res.data.total)
        setPages(res.data.pages)
      } else if (tab === 'va_parties') {
        // VA Parties API returns all items (no server-side pagination)
        const res = await getVAParties()
        let list = res.data.data || []
        // Client-side search
        if (search) {
          const s = search.toLowerCase()
          list = list.filter((p) =>
            p.name.toLowerCase().includes(s) ||
            (p.phone || '').toLowerCase().includes(s) ||
            (p.city || '').toLowerCase().includes(s) ||
            (p.gst_no || '').toLowerCase().includes(s)
          )
        }
        setTotal(list.length)
        setPages(Math.max(1, Math.ceil(list.length / PAGE_SIZE)))
        // Client-side pagination
        const start = (page - 1) * PAGE_SIZE
        setItems(list.slice(start, start + PAGE_SIZE))
      } else if (tab === 'customers') {
        const res = await getCustomers({ page, page_size: PAGE_SIZE, search: search || undefined })
        const data = res.data.data
        // Handle both { data: [...], total, pages } and raw array
        if (Array.isArray(data)) {
          setItems(data)
          setTotal(data.length)
          setPages(1)
        } else {
          setItems(data.data || data)
          setTotal(data.total || 0)
          setPages(data.pages || 1)
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to load ${labels.plural.toLowerCase()}`)
    } finally {
      setLoading(false)
    }
  }, [tab, page, search, labels.plural])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Tab Switch ─────────────────────────────────────────

  const switchTab = (key) => {
    if (key === tab) return
    setTab(key)
    setSearch('')
    setPage(1)
    setItems([])
    setError(null)
  }

  // ── Validation ─────────────────────────────────────────

  const validate = () => {
    const errs = {}
    if (!form.name.trim()) errs.name = `${labels.singular} name is required`
    if (form.gst_no && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gst_no))
      errs.gst_no = 'Invalid GST format (e.g. 24AABCK1234F1Z5)'
    if (form.pan_no && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.pan_no))
      errs.pan_no = 'Invalid PAN format (e.g. AABCK1234F)'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = 'Invalid email address'
    if (form.pin_code && !/^[1-9][0-9]{5}$/.test(form.pin_code))
      errs.pin_code = 'Invalid PIN code (6 digits)'
    if (form.phone && !/^[6-9][0-9]{9}$/.test(form.phone.replace(/\s/g, '')))
      errs.phone = 'Invalid phone (10 digits, starts with 6-9)'
    if (form.phone_alt && !/^[6-9][0-9]{9}$/.test(form.phone_alt.replace(/\s/g, '')))
      errs.phone_alt = 'Invalid phone (10 digits, starts with 6-9)'
    if (form.aadhar_no && !/^[0-9]{12}$/.test(form.aadhar_no.replace(/\s/g, '')))
      errs.aadhar_no = 'Invalid Aadhar (12 digits)'
    if (form.due_days && (isNaN(form.due_days) || Number(form.due_days) < 0))
      errs.due_days = 'Must be a positive number'
    if (form.credit_limit && (isNaN(form.credit_limit) || Number(form.credit_limit) < 0))
      errs.credit_limit = 'Must be a positive number'
    if (form.tds_rate && (isNaN(form.tds_rate) || Number(form.tds_rate) < 0 || Number(form.tds_rate) > 100))
      errs.tds_rate = 'Must be 0-100'
    if (form.tcs_rate && (isNaN(form.tcs_rate) || Number(form.tcs_rate) < 0 || Number(form.tcs_rate) > 100))
      errs.tcs_rate = 'Must be 0-100'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Form helpers ───────────────────────────────────────

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (fieldErrors[k]) setFieldErrors((e) => { const n = { ...e }; delete n[k]; return n })
  }

  const buildPayload = () => {
    const payload = { ...form }
    // Convert empty strings to null for optional fields
    Object.keys(payload).forEach((k) => {
      if (k === 'name') return
      if (typeof payload[k] === 'string' && !payload[k]) payload[k] = null
      if (typeof payload[k] === 'boolean') return // keep booleans
    })
    // Uppercase GST/PAN
    if (payload.gst_no) payload.gst_no = payload.gst_no.toUpperCase()
    if (payload.pan_no) payload.pan_no = payload.pan_no.toUpperCase()
    // Numeric conversions
    if (payload.due_days) payload.due_days = Number(payload.due_days)
    if (payload.credit_limit) payload.credit_limit = Number(payload.credit_limit)
    if (payload.opening_balance) payload.opening_balance = Number(payload.opening_balance)
    if (payload.tds_rate) payload.tds_rate = Number(payload.tds_rate)
    if (payload.tcs_rate) payload.tcs_rate = Number(payload.tcs_rate)
    return payload
  }

  const populateForm = (item) => {
    const empty = EMPTY_FORMS[tab]
    const f = {}
    Object.keys(empty).forEach((k) => {
      if (typeof empty[k] === 'boolean') {
        f[k] = !!item[k]
      } else {
        f[k] = item[k] != null ? String(item[k]) : ''
      }
    })
    return f
  }

  // ── Modal Handlers ─────────────────────────────────────

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORMS[tab])
    setFormError(null)
    setFieldErrors({})
    setTdsOpen(false)
    setMsmeOpen(false)
    setModalOpen(true)
  }

  const openDetail = (row) => {
    setSelected(row)
    setDetailOpen(true)
  }

  const openEditFromDetail = () => {
    setDetailOpen(false)
    setEditing(selected)
    setForm(populateForm(selected))
    setFormError(null)
    setFieldErrors({})
    setTdsOpen(!!selected.tds_applicable || !!selected.tds_rate)
    setMsmeOpen(!!selected.msme_type && selected.msme_type !== 'none')
    setModalOpen(true)
  }

  const handleToggleStatus = async () => {
    if (!selected) return
    const next = !selected.is_active
    const action = next ? 'activate' : 'deactivate'
    if (!window.confirm(`Are you sure you want to ${action} "${selected.name}"?`)) return
    try {
      if (tab === 'suppliers') await updateSupplier(selected.id, { is_active: next })
      else if (tab === 'va_parties') await updateVAParty(selected.id, { is_active: next })
      else if (tab === 'customers') await updateCustomer(selected.id, { is_active: next })
      setSelected((s) => ({ ...s, is_active: next }))
      fetchData()
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to ${action} ${labels.singular.toLowerCase()}`)
    }
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    setFormError(null)
    try {
      const payload = buildPayload()
      if (editing) {
        if (tab === 'suppliers') await updateSupplier(editing.id, payload)
        else if (tab === 'va_parties') await updateVAParty(editing.id, payload)
        else if (tab === 'customers') await updateCustomer(editing.id, payload)
      } else {
        if (tab === 'suppliers') await createSupplier(payload)
        else if (tab === 'va_parties') await createVAParty(payload)
        else if (tab === 'customers') await createCustomer(payload)
      }
      setModalOpen(false)
      fetchData()
    } catch (err) {
      setFormError(err.response?.data?.detail || `Failed to save ${labels.singular.toLowerCase()}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Form fields config per tab ─────────────────────────

  const showHSN = tab === 'suppliers' || tab === 'va_parties'
  const showBroker = tab === 'suppliers' || tab === 'customers'
  const showShortName = tab === 'customers'
  const showContactPerson = tab !== 'va_parties' || true // all tabs show contact person
  const showMSME = tab === 'suppliers' || tab === 'va_parties'
  const showTCS = tab === 'customers'

  // ── Render ─────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Party Masters</h1>
          <p className="text-xs text-gray-500">
            {labels.desc}
            {total > 0 && <span className="ml-2 text-gray-400">({total} total)</span>}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add {labels.singular}
        </button>
      </div>

      {/* Tabs */}
      <div className="mt-2 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mt-2 max-w-sm">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1) }}
          placeholder={`Search ${labels.plural.toLowerCase()} by name, city, GST...`}
        />
      </div>

      {error && <div className="mt-2"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      {/* Table */}
      <div className="mt-2">
        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          onRowClick={openDetail}
          emptyText={`No ${labels.plural.toLowerCase()} found.`}
        />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      {/* ── Detail Modal ── */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={`${labels.singular} Details`}
        actions={
          <div className="flex w-full items-center justify-between">
            <button
              onClick={handleToggleStatus}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                selected?.is_active
                  ? 'border border-red-300 text-red-600 hover:bg-red-50'
                  : 'border border-green-300 text-green-600 hover:bg-green-50'
              }`}
            >
              {selected?.is_active ? 'Deactivate' : 'Activate'}
            </button>
            <div className="flex gap-2">
              <button onClick={() => setDetailOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                Close
              </button>
              <button onClick={openEditFromDetail} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
                Edit {labels.singular}
              </button>
            </div>
          </div>
        }
      >
        {selected && (
          <div className="space-y-4">
            <InfoSection title="Business Information">
              <InfoRow label="Name" value={selected.name} />
              {showShortName && <InfoRow label="Short Name" value={selected.short_name} />}
              {showContactPerson && <InfoRow label="Contact Person" value={selected.contact_person} />}
              {showBroker && <InfoRow label="Broker" value={selected.broker} />}
              <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-500">Status</span>
                <StatusBadge status={selected.is_active ? 'active' : 'inactive'} />
              </div>
            </InfoSection>

            <InfoSection title="GST & Compliance">
              <InfoRow label="GST No." value={selected.gst_no} />
              <InfoRow label="GST Type" value={selected.gst_type} />
              <InfoRow label="PAN No." value={selected.pan_no} />
              <InfoRow label="Aadhar No." value={selected.aadhar_no} />
              {showHSN && <InfoRow label="HSN Code" value={selected.hsn_code} />}
            </InfoSection>

            <InfoSection title="Contact">
              <InfoRow label="Phone" value={selected.phone} />
              <InfoRow label="Alt Phone" value={selected.phone_alt} />
              <InfoRow label="Email" value={selected.email} />
            </InfoSection>

            <InfoSection title="Address">
              <InfoRow label="Address" value={selected.address} />
              <InfoRow label="City" value={selected.city} />
              <InfoRow label="State" value={selected.state} />
              <InfoRow label="PIN Code" value={selected.pin_code} />
            </InfoSection>

            <InfoSection title="Credit & Payment">
              <InfoRow label="Due Days" value={selected.due_days} />
              <InfoRow label="Credit Limit" value={selected.credit_limit != null ? `Rs. ${Number(selected.credit_limit).toLocaleString('en-IN')}` : null} />
              <InfoRow label="Opening Balance" value={selected.opening_balance != null ? `Rs. ${Number(selected.opening_balance).toLocaleString('en-IN')}` : null} />
              <InfoRow label="Balance Type" value={selected.balance_type} />
            </InfoSection>

            {(selected.tds_applicable || selected.tds_rate || (showTCS && (selected.tcs_applicable || selected.tcs_rate))) && (
              <InfoSection title="TDS / TCS">
                <InfoRow label="TDS Applicable" value={selected.tds_applicable ? 'Yes' : 'No'} />
                {selected.tds_applicable && (
                  <>
                    <InfoRow label="TDS Rate" value={selected.tds_rate != null ? `${selected.tds_rate}%` : null} />
                    <InfoRow label="TDS Section" value={selected.tds_section} />
                  </>
                )}
                {showTCS && (
                  <>
                    <InfoRow label="TCS Applicable" value={selected.tcs_applicable ? 'Yes' : 'No'} />
                    {selected.tcs_applicable && (
                      <>
                        <InfoRow label="TCS Rate" value={selected.tcs_rate != null ? `${selected.tcs_rate}%` : null} />
                        <InfoRow label="TCS Section" value={selected.tcs_section} />
                      </>
                    )}
                  </>
                )}
              </InfoSection>
            )}

            {showMSME && (selected.msme_type && selected.msme_type !== 'none') && (
              <InfoSection title="MSME">
                <InfoRow label="MSME Type" value={selected.msme_type} />
                <InfoRow label="MSME Reg. No." value={selected.msme_reg_no} />
              </InfoSection>
            )}

            {selected.notes && (
              <InfoSection title="Notes">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.notes}</p>
              </InfoSection>
            )}

            <div className="text-xs text-gray-400 text-right pt-2">
              Created: {selected.created_at ? new Date(selected.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Create / Edit Modal ── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${labels.singular}` : `Add New ${labels.singular}`}
        extraWide
        actions={
          <>
            <button onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Saving...' : editing ? `Update ${labels.singular}` : `Create ${labels.singular}`}
            </button>
          </>
        }
      >
        {formError && <div className="mb-4"><ErrorAlert message={formError} onDismiss={() => setFormError(null)} /></div>}

        <div className="space-y-3">
          {/* Row 1: Business Identity — 5 cols */}
          <div>
            <h3 className={SECTION_TITLE}>Business Information</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Field name="name" label={`${labels.singular} Name`} required placeholder="e.g. Krishna Textiles" form={form} set={set} fieldErrors={fieldErrors} />
              <Field name="contact_person" label="Contact Person" placeholder="e.g. Krishna Sharma" form={form} set={set} fieldErrors={fieldErrors} />
              <Field name="phone" label="Phone" type="tel" placeholder="e.g. 9876543210" maxLength={10} form={form} set={set} fieldErrors={fieldErrors} />
              <Field name="phone_alt" label="Alt Phone" type="tel" placeholder="e.g. 9876543211" maxLength={10} form={form} set={set} fieldErrors={fieldErrors} />
              <Field name="email" label="Email" type="email" placeholder="e.g. info@company.com" form={form} set={set} fieldErrors={fieldErrors} />
            </div>
          </div>

          {/* Row 2: GST & Compliance — 5 cols */}
          <div>
            <h3 className={SECTION_TITLE}>GST & Compliance</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Field name="gst_no" label="GST No." placeholder="e.g. 24AABCK1234F1Z5" maxLength={15} form={form} set={set} fieldErrors={fieldErrors} />
              <SelectField name="gst_type" label="GST Type" options={GST_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))} placeholder="Select" form={form} set={set} />
              <Field name="pan_no" label="PAN No." placeholder="e.g. AABCK1234F" maxLength={10} form={form} set={set} fieldErrors={fieldErrors} />
              <Field name="aadhar_no" label="Aadhar No." placeholder="e.g. 123456789012" maxLength={14} form={form} set={set} fieldErrors={fieldErrors} />
              {showHSN ? (
                <Field name="hsn_code" label="HSN Code" placeholder="e.g. 5208" maxLength={8} form={form} set={set} fieldErrors={fieldErrors} />
              ) : showShortName ? (
                <Field name="short_name" label="Short Name" placeholder="e.g. KT" form={form} set={set} fieldErrors={fieldErrors} />
              ) : <div />}
            </div>
          </div>

          {/* Row 3: Address — 5 cols */}
          <div>
            <h3 className={SECTION_TITLE}>Address</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Field name="city" label="City" placeholder="e.g. Surat" form={form} set={set} fieldErrors={fieldErrors} />
              <SelectField name="state" label="State" options={INDIAN_STATES} placeholder="Select State" form={form} set={set} />
              <Field name="pin_code" label="PIN Code" placeholder="e.g. 395002" maxLength={6} form={form} set={set} fieldErrors={fieldErrors} />
              {showBroker ? (
                <Field name="broker" label="Broker" placeholder="e.g. Ramesh Broker" form={form} set={set} fieldErrors={fieldErrors} />
              ) : <div />}
              <div className="md:col-span-1">
                <label className={LABEL}>Address</label>
                <textarea value={form.address} onChange={(e) => set('address', e.target.value)} rows={1} placeholder="Street address" className={INPUT} />
              </div>
            </div>
          </div>

          {/* Row 4: Credit + TDS/TCS — 5 cols */}
          <div>
            <h3 className={SECTION_TITLE}>Credit & Payment / TDS {showTCS ? '/ TCS' : ''}</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
              <Field name="due_days" label="Due Days" type="number" placeholder="e.g. 30" form={form} set={set} fieldErrors={fieldErrors} />
              <Field name="credit_limit" label="Credit Limit" type="number" placeholder="e.g. 500000" form={form} set={set} fieldErrors={fieldErrors} />
              <Field name="opening_balance" label="Opn Balance" type="number" placeholder="e.g. 0" form={form} set={set} fieldErrors={fieldErrors} />
              <SelectField name="balance_type" label="Bal Type" options={BALANCE_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))} placeholder="Select" form={form} set={set} />
              <CheckboxField name="tds_applicable" label="TDS Applicable" form={form} set={set} className="pt-4" />
            </div>
            {(form.tds_applicable || (showTCS && form.tcs_applicable)) && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2 items-end">
                {form.tds_applicable && (
                  <>
                    <Field name="tds_rate" label="TDS Rate (%)" type="number" placeholder="e.g. 1" form={form} set={set} fieldErrors={fieldErrors} />
                    <Field name="tds_section" label="TDS Section" placeholder="e.g. 194C" form={form} set={set} fieldErrors={fieldErrors} />
                  </>
                )}
                {showTCS && (
                  <>
                    <CheckboxField name="tcs_applicable" label="TCS Applicable" form={form} set={set} className="pt-4" />
                    {form.tcs_applicable && (
                      <>
                        <Field name="tcs_rate" label="TCS Rate (%)" type="number" placeholder="e.g. 0.1" form={form} set={set} fieldErrors={fieldErrors} />
                        <Field name="tcs_section" label="TCS Section" placeholder="e.g. 206C" form={form} set={set} fieldErrors={fieldErrors} />
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Row 5: MSME + Notes — compact */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {showMSME && (
              <>
                <SelectField name="msme_type" label="MSME Type" options={MSME_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))} placeholder="Select" form={form} set={set} />
                {form.msme_type && form.msme_type !== 'none' && (
                  <Field name="msme_reg_no" label="MSME Reg No." placeholder="e.g. UDYAM-XX-00-0000000" form={form} set={set} fieldErrors={fieldErrors} />
                )}
              </>
            )}
            <div className={showMSME ? 'md:col-span-3' : 'md:col-span-5'}>
              <label className={LABEL}>Notes</label>
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={1} placeholder="Any additional notes..." className={INPUT} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
