import { useState, useEffect, useRef } from 'react'
import Modal from './Modal'
import { createColor, createFabric, createProductType, createValueAddition, createVAParty } from '../../api/masters'
import { createSupplier } from '../../api/suppliers'
import { createCustomer } from '../../api/customers'

const MASTER_CONFIG = {
  color: {
    title: 'Add Color',
    fields: [
      { key: 'name', label: 'Color Name', required: true, placeholder: 'e.g. Watermelon', autoFocus: true },
      { key: 'code', label: 'Code (max 5)', required: true, placeholder: 'e.g. WTMLN', maxLength: 5, uppercase: true },
      { key: 'color_no', label: 'Color No.', type: 'number', placeholder: 'e.g. 31' },
      { key: 'hex_code', label: 'Color', type: 'color', placeholder: '#FFB800' },
    ],
    create: createColor,
  },
  fabric: {
    title: 'Add Fabric',
    fields: [
      { key: 'name', label: 'Fabric Name', required: true, placeholder: 'e.g. Organza', autoFocus: true },
      { key: 'code', label: 'Code (max 3)', required: true, placeholder: 'e.g. ORG', maxLength: 3, uppercase: true },
    ],
    create: createFabric,
  },
  supplier: {
    title: 'Add Supplier',
    fields: [
      { key: 'name', label: 'Supplier Name', required: true, placeholder: 'e.g. Krishna Textiles', autoFocus: true },
      { key: 'phone', label: 'Phone', placeholder: 'e.g. 9898123456' },
      { key: 'city', label: 'City', placeholder: 'e.g. Surat' },
    ],
    create: createSupplier,
  },
  product_type: {
    title: 'Add Product Type',
    fields: [
      { key: 'name', label: 'Product Name', required: true, placeholder: 'e.g. Lehnga', autoFocus: true },
      { key: 'code', label: 'Code (3 chars)', required: true, placeholder: 'e.g. LHG', maxLength: 3, uppercase: true },
    ],
    create: createProductType,
  },
  value_addition: {
    title: 'Add Value Addition',
    fields: [
      { key: 'name', label: 'VA Name', required: true, placeholder: 'e.g. Zari Work', autoFocus: true },
      { key: 'short_code', label: 'Short Code (3-4)', required: true, placeholder: 'e.g. ZRI', maxLength: 4, uppercase: true },
      { key: 'applicable_to', label: 'Applicable To', type: 'select', options: [
        { value: 'both', label: 'Both (Roll + Garment)' },
        { value: 'roll', label: 'Roll only' },
        { value: 'garment', label: 'Garment only' },
      ]},
    ],
    create: createValueAddition,
  },
  va_party: {
    title: 'Add VA Party',
    fields: [
      { key: 'name', label: 'Party Name', required: true, placeholder: 'e.g. Pasupatti Trendz', autoFocus: true },
      { key: 'phone', label: 'Phone', placeholder: 'e.g. 9876543210' },
      { key: 'city', label: 'City', placeholder: 'e.g. Surat' },
    ],
    create: createVAParty,
  },
  customer: {
    title: 'Add Customer',
    fields: [
      { key: 'name', label: 'Customer Name', required: true, placeholder: 'e.g. Fashion Hub', autoFocus: true },
      { key: 'phone', label: 'Phone', placeholder: 'e.g. 9876543210' },
      { key: 'city', label: 'City', placeholder: 'e.g. Mumbai' },
    ],
    create: createCustomer,
  },
}

export default function QuickMasterModal({ type, open, onClose, onCreated }) {
  const config = type ? MASTER_CONFIG[type] : null
  const [formData, setFormData] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const firstInputRef = useRef(null)

  // Reset form when modal opens
  useEffect(() => {
    if (open && config) {
      const defaults = {}
      config.fields.forEach((f) => {
        if (f.type === 'select' && f.options?.length) {
          defaults[f.key] = f.options[0].value
        } else {
          defaults[f.key] = ''
        }
      })
      setFormData(defaults)
      setError(null)
      setSaving(false)
      setTimeout(() => firstInputRef.current?.focus(), 100)
    }
  }, [open, type])

  if (!config || !open) return null

  const setField = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    // Validate required fields
    for (const f of config.fields) {
      if (f.required && !formData[f.key]?.trim()) {
        setError(`${f.label} is required`)
        return
      }
    }

    setSaving(true)
    setError(null)
    try {
      // Apply uppercase transforms before sending
      const payload = { ...formData }
      config.fields.forEach((f) => {
        if (f.uppercase && payload[f.key]) {
          payload[f.key] = payload[f.key].toUpperCase()
        }
        if (f.type === 'number' && payload[f.key]) {
          payload[f.key] = parseInt(payload[f.key], 10)
        }
      })
      const res = await config.create(payload)
      const newItem = res?.data?.data || res?.data || res
      onCreated(type, newItem)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to create')
      setSaving(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={config.title}
      actions={
        <>
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create & Select'}
          </button>
        </>
      }
    >
      <div className="space-y-3" onKeyDown={handleKeyDown}>
        <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
          Quick create — press <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white border border-gray-300 rounded">Enter</kbd> to save, <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white border border-gray-300 rounded">Esc</kbd> to cancel
        </p>
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        {config.fields.map((f, idx) => (
          <div key={f.key}>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              {f.label} {f.required && <span className="text-red-500">*</span>}
            </label>
            {f.type === 'select' ? (
              <select
                ref={idx === 0 ? firstInputRef : undefined}
                value={formData[f.key] || ''}
                onChange={(e) => setField(f.key, e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {f.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : f.type === 'color' ? (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={formData[f.key] || '#000000'}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-gray-300 p-0.5"
                />
                <input
                  type="text"
                  value={formData[f.key] || ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  maxLength={7}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <div className="h-9 w-9 rounded-full border border-gray-200 shadow-inner" style={{ backgroundColor: formData[f.key] || '#000000' }} />
              </div>
            ) : (
              <input
                ref={f.autoFocus ? firstInputRef : undefined}
                type={f.type || 'text'}
                value={formData[f.key] || ''}
                onChange={(e) => setField(f.key, f.uppercase ? e.target.value.toUpperCase() : e.target.value)}
                placeholder={f.placeholder}
                maxLength={f.maxLength}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
