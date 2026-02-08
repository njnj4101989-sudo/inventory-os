import ErrorAlert from '../common/ErrorAlert'

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
const INPUT_SM = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'

export default function OrderForm({ form, onChange, skuList = [], error = null, onDismissError }) {
  const setField = (k, v) => onChange({ ...form, [k]: v })

  const setItemField = (idx, field, value) => {
    const items = [...form.items]
    items[idx] = { ...items[idx], [field]: value }
    onChange({ ...form, items })
  }

  const addItemRow = () => {
    onChange({ ...form, items: [...form.items, { sku_id: '', quantity: '', unit_price: '' }] })
  }

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error} onDismiss={onDismissError} />}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
          <input type="text" value={form.customer_name} onChange={(e) => setField('customer_name', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input type="text" value={form.customer_phone} onChange={(e) => setField('customer_phone', e.target.value)} className={INPUT} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
        <select value={form.source} onChange={(e) => setField('source', e.target.value)} className={INPUT}>
          <option value="web">Web</option>
          <option value="ecommerce">E-commerce</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Order Items</label>
        {form.items.map((item, i) => (
          <div key={i} className="mb-2 grid grid-cols-3 gap-3">
            <select value={item.sku_id} onChange={(e) => setItemField(i, 'sku_id', e.target.value)} className={INPUT_SM}>
              <option value="">Select SKU</option>
              {skuList.map((s) => <option key={s.id} value={s.id}>{s.sku_code} — {s.product_name}</option>)}
            </select>
            <input type="number" placeholder="Quantity" value={item.quantity}
              onChange={(e) => setItemField(i, 'quantity', e.target.value)} className={INPUT_SM} />
            <input type="number" step="0.01" placeholder="Unit price" value={item.unit_price}
              onChange={(e) => setItemField(i, 'unit_price', e.target.value)} className={INPUT_SM} />
          </div>
        ))}
        <button onClick={addItemRow} className="text-sm text-primary-600 hover:text-primary-700 font-medium">+ Add another item</button>
      </div>
    </div>
  )
}
