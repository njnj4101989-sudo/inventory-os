import { useState, useEffect, useCallback } from 'react'
import {
  getProductTypes, createProductType, updateProductType,
  getColors, createColor, updateColor,
  getFabrics, createFabric, updateFabric,
  getValueAdditions, createValueAddition, updateValueAddition,
} from '../api/masters'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchInput from '../components/common/SearchInput'
import ErrorAlert from '../components/common/ErrorAlert'
import StatusBadge from '../components/common/StatusBadge'

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
const LABEL = 'block text-sm font-medium text-gray-700 mb-1'

const TABS = [
  { key: 'product_types', label: 'Product Types', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
  { key: 'colors', label: 'Colors', icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
  { key: 'fabrics', label: 'Fabrics', icon: 'M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3M4 7h16' },
  { key: 'value_additions', label: 'VA Types', icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
]

// ── Column Definitions ──────────────────────────────────

const PT_COLUMNS = [
  { key: 'code', label: 'Code', render: (v) => <span className="font-mono font-semibold text-primary-700">{v}</span> },
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description', render: (v) => v || <span className="text-gray-400">—</span> },
  { key: 'is_active', label: 'Status', render: (v) => <StatusBadge status={v ? 'active' : 'inactive'} /> },
]

const COLOR_COLUMNS = [
  {
    key: 'color_no', label: 'No.',
    render: (v) => v != null ? <span className="font-bold text-primary-700 tabular-nums">{String(v).padStart(2, '0')}</span> : <span className="text-gray-300">—</span>,
  },
  {
    key: 'hex_code', label: 'Swatch',
    render: (v) => v ? (
      <span className="inline-block h-6 w-6 rounded-full border border-gray-300" style={{ backgroundColor: v }} />
    ) : <span className="inline-block h-6 w-6 rounded-full border-2 border-dashed border-gray-300" />,
  },
  { key: 'name', label: 'Name', render: (v) => <span className="font-medium">{v}</span> },
  { key: 'code', label: 'Code', render: (v) => <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{v}</span> },
  { key: 'hex_code', label: 'Hex', render: (v) => v || <span className="text-gray-400">—</span> },
  { key: 'is_active', label: 'Status', render: (v) => <StatusBadge status={v ? 'active' : 'inactive'} /> },
]

const FABRIC_COLUMNS = [
  { key: 'code', label: 'Code', render: (v) => <span className="font-mono font-semibold text-primary-700">{v}</span> },
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description', render: (v) => v || <span className="text-gray-400">—</span> },
  { key: 'is_active', label: 'Status', render: (v) => <StatusBadge status={v ? 'active' : 'inactive'} /> },
]

const APPLICABLE_BADGE = {
  roll:    'bg-purple-100 text-purple-700',
  garment: 'bg-green-100 text-green-700',
  both:    'bg-blue-100 text-blue-700',
}

const VA_COLUMNS = [
  { key: 'short_code', label: 'Code', render: (v) => <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-700 font-mono">+{v}</span> },
  { key: 'name', label: 'Name', render: (v) => <span className="font-medium">{v}</span> },
  { key: 'applicable_to', label: 'Applies To', render: (v) => {
    const val = v || 'both'
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${APPLICABLE_BADGE[val] || APPLICABLE_BADGE.both}`}>{val}</span>
  }},
  { key: 'description', label: 'Description', render: (v) => v || <span className="text-gray-400">—</span> },
  { key: 'is_active', label: 'Status', render: (v) => <StatusBadge status={v ? 'active' : 'inactive'} /> },
]


const VA_FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'roll', label: 'Roll' },
  { key: 'garment', label: 'Garment' },
  { key: 'both', label: 'Both' },
]

export default function MastersPage() {
  const [tab, setTab] = useState('product_types')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Data arrays
  const [ptData, setPtData] = useState([])
  const [colorData, setColorData] = useState([])
  const [fabricData, setFabricData] = useState([])
  const [vaData, setVaData] = useState([])

  // VA filter
  const [vaFilter, setVaFilter] = useState('all')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (tab === 'product_types') {
        const res = await getProductTypes()
        setPtData(res.data.data)
      } else if (tab === 'colors') {
        const res = await getColors()
        setColorData(res.data.data)
      } else if (tab === 'fabrics') {
        const res = await getFabrics()
        setFabricData(res.data.data)
      } else if (tab === 'value_additions') {
        const res = await getValueAdditions()
        setVaData(res.data.data)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Filtered data ──
  const q = search.toLowerCase()
  const filteredData = (() => {
    let list = tab === 'product_types' ? ptData : tab === 'colors' ? colorData : tab === 'fabrics' ? fabricData : vaData
    // VA applicable_to filter
    if (tab === 'value_additions' && vaFilter !== 'all') {
      list = list.filter((item) => (item.applicable_to || 'both') === vaFilter)
    }
    if (!q) return list
    return list.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      (item.code || item.short_code || '').toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      (item.phone || '').toLowerCase().includes(q) ||
      (item.city || '').toLowerCase().includes(q) ||
      (item.gst_no || '').toLowerCase().includes(q)
    )
  })()

  // ── Modal open ──
  const openCreate = () => {
    setEditing(null)
    setFormError(null)
    if (tab === 'product_types') setForm({ code: '', name: '', description: '' })
    else if (tab === 'colors') setForm({ name: '', code: '', color_no: '', hex_code: '#000000' })
    else if (tab === 'value_additions') setForm({ short_code: '', name: '', description: '', applicable_to: 'both' })
    else setForm({ code: '', name: '', description: '' })
    setModalOpen(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setFormError(null)
    if (tab === 'product_types') setForm({ name: item.name, description: item.description || '', is_active: item.is_active })
    else if (tab === 'colors') setForm({ name: item.name, code: item.code || '', color_no: item.color_no ?? '', hex_code: item.hex_code || '#000000', is_active: item.is_active })
    else if (tab === 'value_additions') setForm({ name: item.name, short_code: item.short_code || '', description: item.description || '', applicable_to: item.applicable_to || 'both', is_active: item.is_active })
    else setForm({ name: item.name, description: item.description || '', is_active: item.is_active })
    setModalOpen(true)
  }

  // ── Save ──
  const handleSave = async () => {
    setFormError(null)

    // Validation
    if (!editing) {
      if (tab === 'value_additions') {
        if (!form.short_code?.trim()) { setFormError('Short code is required'); return }
        if (form.short_code.trim().length > 4) { setFormError('Short code max 4 characters'); return }
      } else {
        if (!form.code?.trim()) { setFormError('Code is required'); return }
      }
    }
    if (tab === 'colors' && form.code?.trim().length > 5) { setFormError('Color code max 5 characters'); return }
    if (tab === 'fabrics' && !editing && form.code?.trim().length > 3) { setFormError('Fabric code max 3 characters'); return }
    if (!form.name?.trim()) { setFormError('Name is required'); return }

    setSaving(true)
    try {
      if (tab === 'product_types') {
        if (editing) await updateProductType(editing.id, form)
        else await createProductType({ code: form.code.trim(), name: form.name.trim(), description: form.description || null })
      } else if (tab === 'colors') {
        const colorPayload = editing
          ? { ...form, color_no: form.color_no !== '' ? parseInt(form.color_no, 10) : null }
          : { name: form.name.trim(), code: form.code.trim(), color_no: form.color_no ? parseInt(form.color_no, 10) : null, hex_code: form.hex_code || null }
        if (editing) await updateColor(editing.id, colorPayload)
        else await createColor(colorPayload)
      } else if (tab === 'fabrics') {
        if (editing) await updateFabric(editing.id, form)
        else await createFabric({ code: form.code.trim(), name: form.name.trim(), description: form.description || null })
      } else if (tab === 'value_additions') {
        if (editing) await updateValueAddition(editing.id, form)
        else await createValueAddition({ short_code: form.short_code.trim(), name: form.name.trim(), description: form.description || null, applicable_to: form.applicable_to || 'both' })
      }
      setModalOpen(false)
      fetchData()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // ── Labels ──
  const entityLabel = tab === 'product_types' ? 'Product Type' : tab === 'colors' ? 'Color' : tab === 'fabrics' ? 'Fabric' : 'VA Type'
  const columns = tab === 'product_types' ? PT_COLUMNS : tab === 'colors' ? COLOR_COLUMNS : tab === 'fabrics' ? FABRIC_COLUMNS : VA_COLUMNS

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Masters</h1>
          <p className="mt-1 text-sm text-gray-500">Manage product types, colors, fabrics, VA types, and VA parties</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add {entityLabel}
        </button>
      </div>

      {/* Tabs */}
      <div className="mt-5 flex items-center gap-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setSearch('') }}
            className={`inline-flex items-center gap-1.5 pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      {/* VA filter tabs */}
      {tab === 'value_additions' && (
        <div className="mt-4 flex gap-1.5">
          {VA_FILTER_TABS.map((f) => (
            <button key={f.key} onClick={() => setVaFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                vaFilter === f.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Search + Count */}
      <div className="mt-4 flex items-center justify-between">
        <div className="max-w-sm">
          <SearchInput value={search} onChange={setSearch} placeholder={`Search ${entityLabel.toLowerCase()}s...`} />
        </div>
        <span className="text-sm text-gray-500">{filteredData.length} {entityLabel.toLowerCase()}{filteredData.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="mt-4">
        <DataTable columns={columns} data={filteredData} loading={loading} onRowClick={openEdit} emptyText={`No ${entityLabel.toLowerCase()}s found.`} />
      </div>

      {/* ── Create / Edit Modal ── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${entityLabel}` : `New ${entityLabel}`}
        actions={
          <>
            <button onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />}

          {/* Code — only on create (not for VA Parties) */}
          {!editing && tab !== 'value_additions' && (
            <div>
              <label className={LABEL}>Code <span className="text-red-500">*</span></label>
              <input type="text" value={form.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
                placeholder={tab === 'colors' ? 'e.g. CORAL (max 5)' : tab === 'fabrics' ? 'e.g. COT (max 3)' : 'e.g. BLS'}
                maxLength={tab === 'colors' ? 5 : tab === 'fabrics' ? 3 : 10}
                className={`${INPUT} font-mono`} />
              <p className="mt-1 text-xs text-gray-400">
                {tab === 'product_types' && 'Used in SKU codes. Cannot be changed after creation.'}
                {tab === 'colors' && 'Used in roll codes (max 5 chars). Cannot be changed after creation.'}
                {tab === 'fabrics' && 'Used in roll codes (max 3 chars). Cannot be changed after creation.'}
              </p>
            </div>
          )}

          {/* Short Code — value additions */}
          {tab === 'value_additions' && (
            <div>
              <label className={LABEL}>Short Code <span className="text-red-500">*</span></label>
              <input type="text" value={form.short_code || ''} onChange={(e) => set('short_code', e.target.value.toUpperCase())}
                placeholder="e.g. EMB (max 4)" maxLength={4}
                disabled={editing != null}
                className={`${INPUT} font-mono max-w-[160px] ${editing ? 'bg-gray-100 cursor-not-allowed' : ''}`} />
              <p className="mt-1 text-xs text-gray-400">Appended to roll code after processing (e.g. +EMB). Max 4 uppercase chars.</p>
            </div>
          )}

          {/* Applicable To — value additions */}
          {tab === 'value_additions' && (
            <div>
              <label className={LABEL}>Applies To</label>
              <select value={form.applicable_to || 'both'} onChange={(e) => set('applicable_to', e.target.value)} className={INPUT}>
                <option value="both">Both (Roll + Garment)</option>
                <option value="roll">Roll Only</option>
                <option value="garment">Garment Only</option>
              </select>
              <p className="mt-1 text-xs text-gray-400">Controls where this VA appears: job challans (roll), batch challans (garment), or both.</p>
            </div>
          )}

          {/* Code display on edit — editable for colors, immutable for others */}
          {editing && tab === 'colors' && (
            <div>
              <label className={LABEL}>Code</label>
              <input type="text" value={form.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
                placeholder="e.g. RED" maxLength={5} className={`${INPUT} font-mono uppercase max-w-[160px]`} />
            </div>
          )}
          {editing && tab !== 'value_additions' && tab !== 'colors' && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-2.5 flex items-center gap-2">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Code:</span>
              <span className="font-mono font-semibold text-primary-700">{editing.code}</span>
              <span className="text-xs text-gray-400">(immutable)</span>
            </div>
          )}

          {/* Name */}
          <div>
            <label className={LABEL}>Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name || ''} onChange={(e) => set('name', e.target.value)}
              placeholder={tab === 'product_types' ? 'e.g. Blouse' : tab === 'colors' ? 'e.g. Coral' : 'e.g. Cotton'}
              className={INPUT} />
          </div>

          {/* Color-specific: color_no */}
          {tab === 'colors' && (
            <div>
              <label className={LABEL}>Color No.</label>
              <input type="number" min="1" value={form.color_no ?? ''} onChange={(e) => set('color_no', e.target.value)}
                placeholder="Auto-assigned if empty" className={`${INPUT} font-mono max-w-[160px]`} />
              <p className="mt-1 text-xs text-gray-400">Numeric ID for quick reference (e.g. "4 no. Pink")</p>
            </div>
          )}

          {/* Color-specific: hex code */}
          {tab === 'colors' && (
            <div>
              <label className={LABEL}>Hex Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={form.hex_code || '#000000'} onChange={(e) => set('hex_code', e.target.value)}
                  className="h-10 w-14 rounded border border-gray-300 cursor-pointer" />
                <input type="text" value={form.hex_code || ''} onChange={(e) => set('hex_code', e.target.value)}
                  placeholder="#000000" className={`${INPUT} font-mono max-w-[120px]`} />
                <span className="inline-block h-8 w-8 rounded-full border border-gray-300" style={{ backgroundColor: form.hex_code || '#000000' }} />
              </div>
            </div>
          )}

          {/* Description (PT / Fabric / VA) */}
          {tab !== 'colors' && (
            <div>
              <label className={LABEL}>Description</label>
              <textarea value={form.description || ''} onChange={(e) => set('description', e.target.value)}
                rows={2} className={INPUT} placeholder="Optional description" />
            </div>
          )}

          {/* Active toggle on edit */}
          {editing && (
            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => set('is_active', e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600" />
              </label>
              <span className="text-sm text-gray-700">{form.is_active ? 'Active' : 'Inactive'}</span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
