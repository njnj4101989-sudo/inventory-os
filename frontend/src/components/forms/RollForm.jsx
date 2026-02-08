import ErrorAlert from '../common/ErrorAlert'

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'

export default function RollForm({ form, onChange, suppliers = [], error = null, onDismissError }) {
  const set = (k, v) => onChange({ ...form, [k]: v })

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error} onDismiss={onDismissError} />}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fabric Type</label>
          <input type="text" value={form.fabric_type} onChange={(e) => set('fabric_type', e.target.value)}
            placeholder="e.g. Cotton" className={INPUT} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
          <input type="text" value={form.color} onChange={(e) => set('color', e.target.value)}
            placeholder="e.g. Red" className={INPUT} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Total Length</label>
          <input type="number" step="0.01" value={form.total_length} onChange={(e) => set('total_length', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
          <select value={form.unit} onChange={(e) => set('unit', e.target.value)} className={INPUT}>
            <option value="meters">Meters</option>
            <option value="yards">Yards</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cost per Unit (₹)</label>
          <input type="number" step="0.01" value={form.cost_per_unit} onChange={(e) => set('cost_per_unit', e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
          <select value={form.supplier_id} onChange={(e) => set('supplier_id', e.target.value)} className={INPUT}>
            <option value="">Select supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={INPUT} />
      </div>
    </div>
  )
}
