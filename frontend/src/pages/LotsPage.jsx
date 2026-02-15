import { useState, useEffect, useCallback } from 'react'
import { getLots, createLot } from '../api/lots'
import { getRolls } from '../api/rolls'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'

const COLUMNS = [
  { key: 'lot_code', label: 'Lot Code' },
  { key: 'design_no', label: 'Design No.' },
  { key: 'total_pallas', label: 'Pallas' },
  {
    key: 'total_pieces',
    label: 'Total Pieces',
    render: (val) => <span className="font-semibold text-primary-700">{val}</span>,
  },
  {
    key: 'total_weight',
    label: 'Weight (kg)',
    render: (val) => `${val} kg`,
  },
  {
    key: 'status',
    label: 'Status',
    render: (val) => <StatusBadge status={val} />,
  },
  {
    key: 'lot_date',
    label: 'Date',
    render: (val) => val ? new Date(val).toLocaleDateString() : '—',
  },
]

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'

const DEFAULT_SIZE_PATTERN = { L: 2, XL: 6, XXL: 6, '3XL': 4 }

export default function LotsPage() {
  const [lots, setLots] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Detail modal
  const [detailLot, setDetailLot] = useState(null)

  // Create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [availableRolls, setAvailableRolls] = useState([])
  const [form, setForm] = useState({
    lot_date: new Date().toISOString().split('T')[0],
    design_no: '', standard_palla_weight: '',
    size_pattern: { ...DEFAULT_SIZE_PATTERN },
    rolls: [], notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getLots({ page, page_size: 20 })
      setLots(res.data.data)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load lots')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    getRolls({ has_remaining: true, status: 'in_stock' }).then((res) => setAvailableRolls(res.data.data)).catch(() => {})
  }, [])

  // Calculations
  const piecesPerPalla = Object.values(form.size_pattern).reduce((s, v) => s + (parseInt(v) || 0), 0)

  const rollCalcs = form.rolls.map((r) => {
    const roll = availableRolls.find((rl) => rl.id === r.roll_id)
    const rollWeight = roll ? roll.total_weight : 0
    const pallaWt = parseFloat(r.palla_weight) || 0
    const numPallas = pallaWt > 0 ? Math.floor(rollWeight / pallaWt) : 0
    const weightUsed = +(numPallas * pallaWt).toFixed(3)
    const waste = +(rollWeight - weightUsed).toFixed(3)
    const pieces = numPallas * piecesPerPalla
    return { roll, rollWeight, numPallas, weightUsed, waste, pieces }
  })

  const totalPallas = rollCalcs.reduce((s, r) => s + r.numPallas, 0)
  const totalPieces = totalPallas * piecesPerPalla
  const totalWeight = rollCalcs.reduce((s, r) => s + r.rollWeight, 0)

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const setSizeKey = (key, val) => {
    setForm((f) => ({ ...f, size_pattern: { ...f.size_pattern, [key]: parseInt(val) || 0 } }))
  }

  const addRoll = (rollId) => {
    if (!rollId || form.rolls.some((r) => r.roll_id === rollId)) return
    setForm((f) => ({ ...f, rolls: [...f.rolls, { roll_id: rollId, palla_weight: f.standard_palla_weight || '' }] }))
  }

  const removeRoll = (idx) => {
    setForm((f) => ({ ...f, rolls: f.rolls.filter((_, i) => i !== idx) }))
  }

  const setRollPallaWeight = (idx, val) => {
    setForm((f) => {
      const rolls = [...f.rolls]
      rolls[idx] = { ...rolls[idx], palla_weight: val }
      return { ...f, rolls }
    })
  }

  const handleCreate = async () => {
    setSaving(true)
    setFormError(null)
    try {
      await createLot({
        lot_date: form.lot_date,
        design_no: form.design_no,
        standard_palla_weight: parseFloat(form.standard_palla_weight),
        default_size_pattern: form.size_pattern,
        rolls: form.rolls.map((r) => ({
          roll_id: r.roll_id,
          palla_weight: parseFloat(r.palla_weight),
        })),
        notes: form.notes || null,
      })
      setCreateOpen(false)
      setForm({
        lot_date: new Date().toISOString().split('T')[0],
        design_no: '', standard_palla_weight: '',
        size_pattern: { ...DEFAULT_SIZE_PATTERN },
        rolls: [], notes: '',
      })
      fetchData()
      // Refresh available rolls
      getRolls({ has_remaining: true, status: 'in_stock' }).then((res) => setAvailableRolls(res.data.data)).catch(() => {})
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to create lot')
    } finally {
      setSaving(false)
    }
  }

  const usedRollIds = new Set(form.rolls.map((r) => r.roll_id))
  const addableRolls = availableRolls.filter((r) => !usedRollIds.has(r.id))

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Lots</h1>
          <p className="mt-1 text-sm text-gray-500">Cutting lots — group rolls, calculate pallas & pieces</p>
        </div>
        <button onClick={() => { setFormError(null); setCreateOpen(true) }} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
          + Create Lot
        </button>
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      <div className="mt-4">
        <DataTable columns={COLUMNS} data={lots} loading={loading} onRowClick={setDetailLot} emptyText="No lots found." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      {/* Lot Detail Modal */}
      <Modal open={!!detailLot} onClose={() => setDetailLot(null)} title={detailLot ? `${detailLot.lot_code} — Design ${detailLot.design_no}` : ''} wide>
        {detailLot && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <div className="text-2xl font-bold text-blue-700">{detailLot.total_pallas}</div>
                <div className="text-xs text-blue-500">Total Pallas</div>
              </div>
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{detailLot.total_pieces}</div>
                <div className="text-xs text-green-500">Total Pieces</div>
              </div>
              <div className="rounded-lg bg-purple-50 p-3 text-center">
                <div className="text-2xl font-bold text-purple-700">{detailLot.total_weight} kg</div>
                <div className="text-xs text-purple-500">Total Weight</div>
              </div>
              <div className="rounded-lg bg-orange-50 p-3 text-center">
                <div className="text-2xl font-bold text-orange-700">{detailLot.pieces_per_palla}</div>
                <div className="text-xs text-orange-500">Pcs/Palla</div>
              </div>
            </div>

            <div className="text-sm text-gray-600">
              <span className="font-medium">Size Pattern:</span>{' '}
              {Object.entries(detailLot.default_size_pattern).map(([k, v]) => `${k}: ${v}`).join(', ')}
              {' = '}{detailLot.pieces_per_palla} per palla
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2">Roll</th>
                  <th>Color</th>
                  <th className="text-right">Roll Wt</th>
                  <th className="text-right">Palla Wt</th>
                  <th className="text-right">Pallas</th>
                  <th className="text-right">Used</th>
                  <th className="text-right">Waste</th>
                  <th className="text-right">Pieces</th>
                </tr>
              </thead>
              <tbody>
                {(detailLot.lot_rolls || []).map((lr) => (
                  <tr key={lr.id} className="border-b">
                    <td className="py-2 font-medium">{lr.roll_code}</td>
                    <td>{lr.color}</td>
                    <td className="text-right">{lr.roll_weight} kg</td>
                    <td className="text-right">{lr.palla_weight} kg</td>
                    <td className="text-right font-medium">{lr.num_pallas}</td>
                    <td className="text-right">{lr.weight_used} kg</td>
                    <td className="text-right text-red-500">{lr.waste_weight} kg</td>
                    <td className="text-right font-semibold text-primary-700">{lr.pieces_from_roll}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Create Lot Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Lot" wide
        actions={
          <>
            <button onClick={() => setCreateOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleCreate} disabled={saving || form.rolls.length === 0}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Lot'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />}

          {/* Header fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Design No.</label>
              <input type="text" value={form.design_no} onChange={(e) => setField('design_no', e.target.value)}
                placeholder="e.g. 702" className={INPUT} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lot Date</label>
              <input type="date" value={form.lot_date} onChange={(e) => setField('lot_date', e.target.value)} className={INPUT} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Standard Palla Weight (kg)</label>
            <input type="number" step="0.001" value={form.standard_palla_weight}
              onChange={(e) => setField('standard_palla_weight', e.target.value)}
              placeholder="e.g. 3.600" className={`${INPUT} max-w-xs`} />
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">Size Pattern (pieces per palla)</label>
              <span className="rounded-full bg-primary-100 px-3 py-0.5 text-sm font-semibold text-primary-700">
                Total: {piecesPerPalla} pcs / palla
              </span>
            </div>
            <div className="grid grid-cols-4 gap-4">
              {Object.entries(form.size_pattern).map(([size, count]) => (
                <div key={size}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{size}</label>
                  <input type="number" value={count} onChange={(e) => setSizeKey(size, e.target.value)}
                    className={`${INPUT} text-center`} />
                </div>
              ))}
            </div>
          </div>

          {/* Add rolls */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Rolls in Lot</label>
              <select onChange={(e) => { addRoll(e.target.value); e.target.value = '' }} className="rounded border border-gray-300 px-2 py-1 text-sm">
                <option value="">+ Add roll...</option>
                {addableRolls.map((r) => (
                  <option key={r.id} value={r.id}>{r.roll_code} — {r.color} ({r.remaining_weight} kg)</option>
                ))}
              </select>
            </div>

            {form.rolls.length === 0 && (
              <div className="text-center py-4 text-sm text-gray-400">No rolls added yet. Select from dropdown above.</div>
            )}

            {form.rolls.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2">Roll</th>
                    <th>Color</th>
                    <th className="text-right">Weight</th>
                    <th className="text-right">Palla Wt</th>
                    <th className="text-right">Pallas</th>
                    <th className="text-right">Pieces</th>
                    <th className="text-right">Waste</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {form.rolls.map((r, i) => {
                    const c = rollCalcs[i]
                    return (
                      <tr key={r.roll_id} className="border-b">
                        <td className="py-2 font-medium">{c.roll?.roll_code || '—'}</td>
                        <td>{c.roll?.color || '—'}</td>
                        <td className="text-right">{c.rollWeight} kg</td>
                        <td className="text-right">
                          <input type="number" step="0.001" value={r.palla_weight}
                            onChange={(e) => setRollPallaWeight(i, e.target.value)}
                            className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-right" />
                        </td>
                        <td className="text-right font-medium">{c.numPallas}</td>
                        <td className="text-right font-semibold text-primary-700">{c.pieces}</td>
                        <td className="text-right text-red-400">{c.waste > 0 ? `${c.waste} kg` : ''}</td>
                        <td className="text-right">
                          <button onClick={() => removeRoll(i)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Summary */}
          {form.rolls.length > 0 && (
            <div className="rounded-lg bg-gray-50 p-3 grid grid-cols-4 gap-3 text-center">
              <div>
                <div className="text-lg font-bold text-blue-700">{totalPallas}</div>
                <div className="text-xs text-gray-500">Total Pallas</div>
              </div>
              <div>
                <div className="text-lg font-bold text-green-700">{totalPieces}</div>
                <div className="text-xs text-gray-500">Total Pieces</div>
              </div>
              <div>
                <div className="text-lg font-bold text-purple-700">{totalWeight.toFixed(3)} kg</div>
                <div className="text-xs text-gray-500">Total Weight</div>
              </div>
              <div>
                <div className="text-lg font-bold text-orange-700">{piecesPerPalla}</div>
                <div className="text-xs text-gray-500">Pcs / Palla</div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} className={INPUT} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
