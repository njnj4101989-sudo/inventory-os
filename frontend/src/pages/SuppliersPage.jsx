import { useState, useEffect, useCallback } from 'react'
import { getSuppliers, createSupplier, updateSupplier } from '../api/suppliers'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Chandigarh', 'Puducherry',
]

const COLUMNS = [
  { key: 'name', label: 'Company Name' },
  { key: 'contact_person', label: 'Contact Person' },
  { key: 'phone', label: 'Phone' },
  {
    key: 'city',
    label: 'City',
    render: (val, row) => val ? `${val}${row.state ? ', ' + row.state : ''}` : '—',
  },
  { key: 'gst_no', label: 'GST No.', render: (val) => val || '—' },
  {
    key: 'is_active',
    label: 'Status',
    render: (val) => <StatusBadge status={val ? 'active' : 'inactive'} />,
  },
  {
    key: 'created_at',
    label: 'Created',
    render: (val) => val ? new Date(val).toLocaleDateString('en-IN') : '—',
  },
]

const EMPTY_FORM = {
  name: '', contact_person: '', phone: '', email: '',
  gst_no: '', pan_no: '', address: '', city: '', state: '', pin_code: '',
}

const INPUT_CLS = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
const LABEL_CLS = 'block text-sm font-medium text-gray-700 mb-1'
const HINT_CLS = 'text-xs text-gray-400 mt-0.5'

// --- Extracted outside component to prevent re-mount on every keystroke ---
function Field({ label, name, type = 'text', hint, placeholder, required, maxLength, className = '', form, set, fieldErrors }) {
  return (
    <div className={className}>
      <label className={LABEL_CLS}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type} value={form[name]} maxLength={maxLength}
        onChange={(e) => set(name, type === 'text' && (name === 'gst_no' || name === 'pan_no') ? e.target.value.toUpperCase() : e.target.value)}
        placeholder={placeholder}
        className={`${INPUT_CLS} ${fieldErrors[name] ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
      />
      {fieldErrors[name] ? <p className="text-xs text-red-500 mt-0.5">{fieldErrors[name]}</p> : hint ? <p className={HINT_CLS}>{hint}</p> : null}
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

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([])
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
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getSuppliers({ page, page_size: 20, search: search || undefined })
      setSuppliers(res.data.data)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load suppliers')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { fetchData() }, [fetchData])

  // --- Validation ---
  const validate = () => {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Company name is required'
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
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  // --- Modal handlers ---
  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setFieldErrors({})
    setModalOpen(true)
  }

  const openDetail = (row) => {
    setSelected(row)
    setDetailOpen(true)
  }

  const openEditFromDetail = () => {
    setDetailOpen(false)
    setEditing(selected)
    setForm({
      name: selected.name || '',
      contact_person: selected.contact_person || '',
      phone: selected.phone || '',
      email: selected.email || '',
      gst_no: selected.gst_no || '',
      pan_no: selected.pan_no || '',
      address: selected.address || '',
      city: selected.city || '',
      state: selected.state || '',
      pin_code: selected.pin_code || '',
    })
    setFormError(null)
    setFieldErrors({})
    setModalOpen(true)
  }

  const handleToggleStatus = async () => {
    if (!selected) return
    const next = !selected.is_active
    const action = next ? 'activate' : 'deactivate'
    if (!window.confirm(`Are you sure you want to ${action} "${selected.name}"?`)) return
    try {
      await updateSupplier(selected.id, { is_active: next })
      setSelected((s) => ({ ...s, is_active: next }))
      fetchData()
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to ${action} supplier`)
    }
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    setFormError(null)
    try {
      const payload = { ...form }
      // Send empty optional strings as null
      Object.keys(payload).forEach((k) => { if (k !== 'name' && !payload[k]) payload[k] = null })
      // Uppercase GST/PAN
      if (payload.gst_no) payload.gst_no = payload.gst_no.toUpperCase()
      if (payload.pan_no) payload.pan_no = payload.pan_no.toUpperCase()

      if (editing) {
        await updateSupplier(editing.id, payload)
      } else {
        await createSupplier(payload)
      }
      setModalOpen(false)
      fetchData()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to save supplier')
    } finally {
      setSaving(false)
    }
  }

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (fieldErrors[k]) setFieldErrors((e) => { const n = { ...e }; delete n[k]; return n })
  }

  // Field and InfoRow are defined OUTSIDE the component (top of file) to avoid re-mount on every keystroke

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Suppliers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage fabric and material suppliers
            {total > 0 && <span className="ml-2 text-gray-400">({total} total)</span>}
          </p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Supplier
        </button>
      </div>

      {/* Search */}
      <div className="mt-5 max-w-sm">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search by name, city, GST..." />
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      {/* Table */}
      <div className="mt-4">
        <DataTable columns={COLUMNS} data={suppliers} loading={loading} onRowClick={openDetail} emptyText="No suppliers found." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      {/* ── Detail Modal ── */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Supplier Details"
        actions={
          <div className="flex w-full items-center justify-between">
            <button onClick={handleToggleStatus}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                selected?.is_active
                  ? 'border border-red-300 text-red-600 hover:bg-red-50'
                  : 'border border-green-300 text-green-600 hover:bg-green-50'
              }`}>
              {selected?.is_active ? 'Deactivate' : 'Activate'}
            </button>
            <div className="flex gap-2">
              <button onClick={() => setDetailOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Close</button>
              <button onClick={openEditFromDetail} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
                Edit Supplier
              </button>
            </div>
          </div>
        }
      >
        {selected && (
          <div className="space-y-4">
            {/* Business Info */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Business Information</h3>
              <div className="bg-gray-50 rounded-lg p-3">
                <InfoRow label="Company Name" value={selected.name} />
                <InfoRow label="GST No." value={selected.gst_no} />
                <InfoRow label="PAN No." value={selected.pan_no} />
                <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-500">Status</span>
                  <StatusBadge status={selected.is_active ? 'active' : 'inactive'} />
                </div>
              </div>
            </div>
            {/* Contact */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contact Details</h3>
              <div className="bg-gray-50 rounded-lg p-3">
                <InfoRow label="Contact Person" value={selected.contact_person} />
                <InfoRow label="Phone" value={selected.phone} />
                <InfoRow label="Email" value={selected.email} />
              </div>
            </div>
            {/* Address */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Address</h3>
              <div className="bg-gray-50 rounded-lg p-3">
                <InfoRow label="Address" value={selected.address} />
                <InfoRow label="City" value={selected.city} />
                <InfoRow label="State" value={selected.state} />
                <InfoRow label="PIN Code" value={selected.pin_code} />
              </div>
            </div>
            {/* Meta */}
            <div className="text-xs text-gray-400 text-right pt-2">
              Created: {selected.created_at ? new Date(selected.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Create / Edit Modal ── */}
      <Modal
        open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Supplier' : 'Add New Supplier'}
        wide
        actions={
          <>
            <button onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Update Supplier' : 'Create Supplier'}
            </button>
          </>
        }
      >
        {formError && <div className="mb-4"><ErrorAlert message={formError} onDismiss={() => setFormError(null)} /></div>}

        <div className="space-y-5">
          {/* Section 1: Business Info */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Business Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field name="name" label="Company Name" required placeholder="e.g. Krishna Textiles" className="md:col-span-2" form={form} set={set} fieldErrors={fieldErrors} />
              <Field name="gst_no" label="GST No." placeholder="e.g. 24AABCK1234F1Z5" hint="15-character GSTIN" maxLength={15} form={form} set={set} fieldErrors={fieldErrors} />
              <Field name="pan_no" label="PAN No." placeholder="e.g. AABCK1234F" hint="10-character PAN" maxLength={10} form={form} set={set} fieldErrors={fieldErrors} />
            </div>
          </div>

          {/* Section 2: Contact Details */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Contact Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field name="contact_person" label="Contact Person" placeholder="e.g. Krishna Sharma" form={form} set={set} fieldErrors={fieldErrors} />
              <Field name="phone" label="Phone" type="tel" placeholder="e.g. 9876543210" hint="10-digit mobile" maxLength={10} form={form} set={set} fieldErrors={fieldErrors} />
              <Field name="email" label="Email" type="email" placeholder="e.g. info@company.com" form={form} set={set} fieldErrors={fieldErrors} />
            </div>
          </div>

          {/* Section 3: Address */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Address</h3>
            <div className="space-y-4">
              <div>
                <label className={LABEL_CLS}>Street Address</label>
                <textarea value={form.address} onChange={(e) => set('address', e.target.value)} rows={2}
                  placeholder="e.g. 45, Ring Road, Textile Market"
                  className={INPUT_CLS} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field name="city" label="City" placeholder="e.g. Surat" form={form} set={set} fieldErrors={fieldErrors} />
                <div>
                  <label className={LABEL_CLS}>State</label>
                  <select value={form.state} onChange={(e) => set('state', e.target.value)} className={INPUT_CLS}>
                    <option value="">Select State</option>
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <Field name="pin_code" label="PIN Code" placeholder="e.g. 395002" hint="6-digit code" maxLength={6} form={form} set={set} fieldErrors={fieldErrors} />
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
