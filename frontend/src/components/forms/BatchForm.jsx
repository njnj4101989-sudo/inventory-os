import ErrorAlert from '../common/ErrorAlert'

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'

export default function BatchForm({ form, onChange, lotList = [], error = null, onDismissError }) {
  const setField = (k, v) => onChange({ ...form, [k]: v })

  const selectedLot = lotList.find((l) => l.id === form.lot_id)

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error} onDismiss={onDismissError} />}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Select Lot</label>
        <select value={form.lot_id} onChange={(e) => setField('lot_id', e.target.value)} className={INPUT}>
          <option value="">Choose lot...</option>
          {lotList.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lot_code} — Design {l.design_no} ({l.total_pieces} pcs, {l.status})
            </option>
          ))}
        </select>
      </div>

      {selectedLot && (
        <div className="rounded-lg bg-blue-50 p-3 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="font-bold text-blue-700">{selectedLot.total_pieces}</div>
              <div className="text-xs text-blue-500">Total Pieces</div>
            </div>
            <div>
              <div className="font-bold text-blue-700">{selectedLot.total_pallas}</div>
              <div className="text-xs text-blue-500">Total Pallas</div>
            </div>
            <div>
              <div className="font-bold text-blue-700">{selectedLot.total_weight} kg</div>
              <div className="text-xs text-blue-500">Total Weight</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-500 text-center">
            Size: {Object.entries(selectedLot.default_size_pattern).map(([k, v]) => `${k}:${v}`).join(', ')}
            {' = '}{selectedLot.pieces_per_palla} per palla
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Piece Count (for this batch)</label>
        <input type="number" value={form.piece_count} onChange={(e) => setField('piece_count', e.target.value)}
          placeholder="e.g. 400" className={INPUT} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} className={INPUT} />
      </div>
    </div>
  )
}
