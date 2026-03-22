import ErrorAlert from '../common/ErrorAlert'

export default function BatchForm({ form, onChange, lotList = [], error = null, onDismissError }) {
  const setField = (k, v) => onChange({ ...form, [k]: v })

  const selectedLot = lotList.find((l) => l.id === form.lot_id)

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error} onDismiss={onDismissError} />}
      <div>
        <label className="typo-label">Select Lot</label>
        <select value={form.lot_id} onChange={(e) => setField('lot_id', e.target.value)} className="typo-input">
          <option value="">Choose lot...</option>
          {lotList.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lot_code} — Design {(l.designs || []).map(d => d.design_no).join(', ')} ({l.total_pieces} pcs, {l.status})
            </option>
          ))}
        </select>
      </div>

      {selectedLot && (
        <div className="rounded-lg bg-blue-50 p-3 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="typo-data text-blue-700">{selectedLot.total_pieces}</div>
              <div className="typo-caption text-blue-500">Total Pieces</div>
            </div>
            <div>
              <div className="typo-data text-blue-700">{selectedLot.total_pallas}</div>
              <div className="typo-caption text-blue-500">Total Pallas</div>
            </div>
            <div>
              <div className="typo-data text-blue-700">{selectedLot.total_weight} kg</div>
              <div className="typo-caption text-blue-500">Total Weight</div>
            </div>
          </div>
          {selectedLot.designs?.length > 0 && (
            <div className="mt-2 typo-caption text-center">
              {selectedLot.designs.map((d, i) => (
                <span key={i}>{i > 0 ? ' | ' : ''}Design {d.design_no}: {Object.entries(d.size_pattern || {}).map(([k, v]) => `${k}:${v}`).join(', ')}</span>
              ))}
              {' = '}{selectedLot.pieces_per_palla} per palla
            </div>
          )}
        </div>
      )}

      <div>
        <label className="typo-label">Piece Count (for this batch)</label>
        <input type="number" value={form.piece_count} onChange={(e) => setField('piece_count', e.target.value)}
          placeholder="e.g. 400" className="typo-input" />
      </div>

      <div>
        <label className="typo-label">Notes</label>
        <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} className="typo-input" />
      </div>
    </div>
  )
}
