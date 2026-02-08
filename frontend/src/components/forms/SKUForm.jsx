import ErrorAlert from '../common/ErrorAlert'

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'

const PRODUCT_TYPES = [
  { value: 'BLS', label: 'Blouse (BLS)' },
  { value: 'KRT', label: 'Kurti (KRT)' },
  { value: 'SAR', label: 'Saree (SAR)' },
  { value: 'DRS', label: 'Dress (DRS)' },
  { value: 'OTH', label: 'Other (OTH)' },
]

export default function SKUForm({ form, onChange, editing = false, error = null, onDismissError }) {
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
          <span className="text-xs text-gray-400 uppercase tracking-wide">SKU Code:</span>
          <span className="font-mono font-semibold text-primary-700">{preview}</span>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
        <input type="text" value={form.product_name} onChange={(e) => set('product_name', e.target.value)}
          placeholder="e.g. White Cotton Blouse" className={INPUT} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Product Type</label>
          <select value={form.product_type} onChange={(e) => set('product_type', e.target.value)} className={INPUT}
            disabled={editing}>
            {PRODUCT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Design No.</label>
          <input type="text" value={form.design_no} onChange={(e) => set('design_no', e.target.value)}
            placeholder="e.g. 101" className={INPUT} disabled={editing} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
          <input type="text" value={form.color} onChange={(e) => set('color', e.target.value)}
            placeholder="e.g. Red" className={INPUT} disabled={editing} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
          <select value={form.size} onChange={(e) => set('size', e.target.value)} className={INPUT}
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Base Price (₹)</label>
        <input type="number" step="0.01" value={form.base_price} onChange={(e) => set('base_price', e.target.value)} className={INPUT} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} className={INPUT} />
      </div>
    </div>
  )
}
