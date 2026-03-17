import { useState, useEffect } from 'react'
import ErrorAlert from '../common/ErrorAlert'
import { getAllFabrics, getAllColors } from '../../api/masters'

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
          <label className="typo-label">Fabric Type</label>
          <select value={form.fabric_type} onChange={(e) => set('fabric_type', e.target.value)} className="typo-input">
            <option value="">Select fabric</option>
            {fabricsList.map((f) => <option key={f.id} value={f.name}>{f.name} ({f.code})</option>)}
          </select>
        </div>
        <div>
          <label className="typo-label">Color</label>
          <select value={form.color} onChange={(e) => set('color', e.target.value)} className="typo-input">
            <option value="">Select color</option>
            {colorsList.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="typo-label">Unit</label>
          <select value={unit} onChange={(e) => set('unit', e.target.value)} className="typo-input">
            <option value="kg">Kilograms (kg)</option>
            <option value="meters">Meters (m)</option>
          </select>
        </div>
        <div>
          <label className="typo-label">{unit === 'kg' ? 'Weight (kg)' : 'Length (meters)'}</label>
          <input type="number" step="0.001"
            value={unit === 'kg' ? form.total_weight : form.total_length}
            onChange={(e) => set(unit === 'kg' ? 'total_weight' : 'total_length', e.target.value)}
            placeholder={unit === 'kg' ? 'e.g. 28.550' : 'e.g. 45.00'} className="typo-input" />
        </div>
        <div>
          <label className="typo-label">Cost / {unit === 'kg' ? 'kg' : 'meter'} (₹)</label>
          <input type="number" step="0.01" value={form.cost_per_unit} onChange={(e) => set('cost_per_unit', e.target.value)}
            placeholder="e.g. 120.00" className="typo-input" />
        </div>
      </div>

      {/* Secondary measurement — optional */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="typo-label">Supplier</label>
          <select value={form.supplier_id} onChange={(e) => set('supplier_id', e.target.value)} className="typo-input">
            <option value="">Select supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="typo-label">{unit === 'kg' ? 'Length (optional, meters)' : 'Weight (optional, kg)'}</label>
          <input type="number" step="0.01"
            value={unit === 'kg' ? (form.total_length || '') : (form.total_weight || '')}
            onChange={(e) => set(unit === 'kg' ? 'total_length' : 'total_weight', e.target.value)}
            placeholder="Reference only" className="typo-input" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="typo-label">Supplier Invoice No.</label>
          <input type="text" value={form.supplier_invoice_no} onChange={(e) => set('supplier_invoice_no', e.target.value)}
            placeholder="e.g. KT-2026-0451" className="typo-input" />
        </div>
        <div>
          <label className="typo-label">Invoice Date</label>
          <input type="date" value={form.supplier_invoice_date} onChange={(e) => set('supplier_invoice_date', e.target.value)} className="typo-input" />
        </div>
      </div>

      <div>
        <label className="typo-label">Notes</label>
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className="typo-input" />
      </div>
    </div>
  )
}
