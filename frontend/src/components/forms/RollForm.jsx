import { useState, useEffect } from 'react'
import ErrorAlert from '../common/ErrorAlert'
import { getAllFabrics, getAllColors } from '../../api/masters'

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
const LABEL = 'block text-sm font-medium text-gray-700 mb-1'

export default function RollForm({ form, onChange, suppliers = [], error = null, onDismissError }) {
  const [fabricsList, setFabricsList] = useState([])
  const [colorsList, setColorsList] = useState([])

  useEffect(() => {
    getAllFabrics().then((res) => setFabricsList(res.data.data)).catch(() => {})
    getAllColors().then((res) => setColorsList(res.data.data)).catch(() => {})
  }, [])

  const set = (k, v) => onChange({ ...form, [k]: v })
  const unit = form.unit || 'kg'

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error} onDismiss={onDismissError} />}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>Fabric Type</label>
          <select value={form.fabric_type} onChange={(e) => set('fabric_type', e.target.value)} className={INPUT}>
            <option value="">Select fabric</option>
            {fabricsList.map((f) => <option key={f.id} value={f.name}>{f.name} ({f.code})</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>Color</label>
          <select value={form.color} onChange={(e) => set('color', e.target.value)} className={INPUT}>
            <option value="">Select color</option>
            {colorsList.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={LABEL}>Unit</label>
          <select value={unit} onChange={(e) => set('unit', e.target.value)} className={INPUT}>
            <option value="kg">Kilograms (kg)</option>
            <option value="meters">Meters (m)</option>
          </select>
        </div>
        <div>
          <label className={LABEL}>{unit === 'kg' ? 'Weight (kg)' : 'Length (meters)'}</label>
          <input type="number" step="0.001"
            value={unit === 'kg' ? form.total_weight : form.total_length}
            onChange={(e) => set(unit === 'kg' ? 'total_weight' : 'total_length', e.target.value)}
            placeholder={unit === 'kg' ? 'e.g. 28.550' : 'e.g. 45.00'} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Cost / {unit === 'kg' ? 'kg' : 'meter'} (₹)</label>
          <input type="number" step="0.01" value={form.cost_per_unit} onChange={(e) => set('cost_per_unit', e.target.value)}
            placeholder="e.g. 120.00" className={INPUT} />
        </div>
      </div>

      {/* Secondary measurement — optional */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>Supplier</label>
          <select value={form.supplier_id} onChange={(e) => set('supplier_id', e.target.value)} className={INPUT}>
            <option value="">Select supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>{unit === 'kg' ? 'Length (optional, meters)' : 'Weight (optional, kg)'}</label>
          <input type="number" step="0.01"
            value={unit === 'kg' ? (form.total_length || '') : (form.total_weight || '')}
            onChange={(e) => set(unit === 'kg' ? 'total_length' : 'total_weight', e.target.value)}
            placeholder="Reference only" className={INPUT} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>Supplier Invoice No.</label>
          <input type="text" value={form.supplier_invoice_no} onChange={(e) => set('supplier_invoice_no', e.target.value)}
            placeholder="e.g. KT-2026-0451" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Invoice Date</label>
          <input type="date" value={form.supplier_invoice_date} onChange={(e) => set('supplier_invoice_date', e.target.value)} className={INPUT} />
        </div>
      </div>

      <div>
        <label className={LABEL}>Notes</label>
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={INPUT} />
      </div>
    </div>
  )
}
