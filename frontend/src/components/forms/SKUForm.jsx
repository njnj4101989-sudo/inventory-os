import { useState, useEffect } from 'react'
import ErrorAlert from '../common/ErrorAlert'
import { getAllProductTypes, getAllColors } from '../../api/masters'

export default function SKUForm({ form, onChange, editing = false, error = null, onDismissError }) {
  const [productTypes, setProductTypes] = useState([])
  const [colorsList, setColorsList] = useState([])

  useEffect(() => {
    getAllProductTypes().then((res) => setProductTypes(res.data.data)).catch(() => {})
    getAllColors().then((res) => setColorsList(res.data.data)).catch(() => {})
  }, [])

  const set = (k, v) => onChange({ ...form, [k]: v })

  // Live preview of the generated SKU code
  const preview = form.product_type && form.design_no && form.color && form.size
    ? `${form.product_type}-${form.design_no}-${form.color}-${form.size}`
    : null

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error} onDismiss={onDismissError} />}

      {/* SKU code preview */}
      {preview && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-2.5 flex items-center gap-2">
          <span className="typo-data-label uppercase tracking-wide">SKU Code:</span>
          <span className="typo-data font-mono text-primary-700">{preview}</span>
        </div>
      )}

      <div>
        <label className="typo-label">Product Name</label>
        <input type="text" value={form.product_name} onChange={(e) => set('product_name', e.target.value)}
          placeholder="e.g. White Cotton Blouse" className="typo-input" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="typo-label">Product Type</label>
          <select value={form.product_type} onChange={(e) => set('product_type', e.target.value)} className="typo-input"
            disabled={editing}>
            <option value="">Select type</option>
            {productTypes.map((t) => (
              <option key={t.id} value={t.code}>{t.name} ({t.code})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="typo-label">Design No.</label>
          <input type="text" value={form.design_no} onChange={(e) => set('design_no', e.target.value)}
            placeholder="e.g. 101" className="typo-input" disabled={editing} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="typo-label">Color</label>
          <select value={form.color} onChange={(e) => set('color', e.target.value)} className="typo-input"
            disabled={editing}>
            <option value="">Select color</option>
            {colorsList.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="typo-label">Size</label>
          <select value={form.size} onChange={(e) => set('size', e.target.value)} className="typo-input"
            disabled={editing}>
            <option value="">Select</option>
            <option value="XS">XS</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
            <option value="XXL">XXL</option>
            <option value="Free">Free Size</option>
          </select>
        </div>
      </div>
      <div>
        <label className="typo-label">Base Price (₹)</label>
        <input type="number" step="0.01" value={form.base_price} onChange={(e) => set('base_price', e.target.value)} className="typo-input" />
      </div>
      <div>
        <label className="typo-label">Description</label>
        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} className="typo-input" />
      </div>
    </div>
  )
}
