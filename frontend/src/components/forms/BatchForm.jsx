import ErrorAlert from '../common/ErrorAlert'

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
const INPUT_SM = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'

export default function BatchForm({ form, onChange, skuList = [], error = null, onDismissError }) {
  const setField = (k, v) => onChange({ ...form, [k]: v })

  const setRollField = (idx, field, value) => {
    const rolls = [...form.rolls]
    rolls[idx] = { ...rolls[idx], [field]: value }
    onChange({ ...form, rolls })
  }

  const addRollRow = () => {
    onChange({ ...form, rolls: [...form.rolls, { roll_id: '', pieces_cut: '', length_used: '' }] })
  }

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error} onDismiss={onDismissError} />}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
        <select value={form.sku_id} onChange={(e) => setField('sku_id', e.target.value)} className={INPUT}>
          <option value="">Select SKU</option>
          {skuList.map((s) => <option key={s.id} value={s.id}>{s.sku_code} — {s.product_name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Rolls Used</label>
        {form.rolls.map((r, i) => (
          <div key={i} className="mb-2 grid grid-cols-2 gap-3">
            <input type="number" placeholder="Pieces cut" value={r.pieces_cut}
              onChange={(e) => setRollField(i, 'pieces_cut', e.target.value)} className={INPUT_SM} />
            <input type="number" step="0.01" placeholder="Length used" value={r.length_used}
              onChange={(e) => setRollField(i, 'length_used', e.target.value)} className={INPUT_SM} />
          </div>
        ))}
        <button onClick={addRollRow} className="text-sm text-primary-600 hover:text-primary-700 font-medium">+ Add another roll</button>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} className={INPUT} />
      </div>
    </div>
  )
}
