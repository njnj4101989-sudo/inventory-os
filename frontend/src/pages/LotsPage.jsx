import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { getLots, createLot } from '../api/lots'
import { getRolls } from '../api/rolls'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
const LABEL = 'block text-sm font-medium text-gray-700 mb-1'
const DEFAULT_SIZE_PATTERN = { L: 2, XL: 6, XXL: 6, '3XL': 4 }

const VA_COLORS = {
  EMB: { bg: 'bg-purple-100', text: 'text-purple-700' },
  DYE: { bg: 'bg-amber-100', text: 'text-amber-700' },
  DPT: { bg: 'bg-sky-100', text: 'text-sky-700' },
  HWK: { bg: 'bg-rose-100', text: 'text-rose-700' },
  SQN: { bg: 'bg-pink-100', text: 'text-pink-700' },
  BTC: { bg: 'bg-teal-100', text: 'text-teal-700' },
}
const DEFAULT_VA = { bg: 'bg-gray-100', text: 'text-gray-700' }

function RollCodeDisplay({ roll }) {
  if (!roll) return <span className="text-gray-400">—</span>
  const base = roll.roll_code || ''
  const enhanced = roll.enhanced_roll_code || base
  if (enhanced === base) return <span className="font-semibold text-gray-700">{base}</span>
  const codes = enhanced.slice(base.length).split('+').filter(Boolean)
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className="font-semibold text-gray-700">{base}</span>
      {codes.map(code => {
        const c = VA_COLORS[code] || DEFAULT_VA
        return <span key={code} className={`rounded px-1 py-0.5 text-[10px] font-bold leading-none ${c.bg} ${c.text}`}>+{code}</span>
      })}
    </span>
  )
}

function hasVA(roll) {
  return roll && roll.enhanced_roll_code && roll.enhanced_roll_code !== roll.roll_code
}

const COLUMNS = [
  { key: 'lot_code', label: 'Lot Code', render: (v) => <span className="font-semibold text-primary-700">{v}</span> },
  { key: 'design_no', label: 'Design' },
  {
    key: 'lot_rolls', label: 'Colors',
    render: (v) => [...new Set((v || []).map(r => r.color).filter(Boolean))].length,
  },
  { key: 'total_pallas', label: 'Pallas', render: (v) => <span className="font-medium">{v}</span> },
  { key: 'total_pieces', label: 'Pieces', render: (v) => <span className="font-semibold text-primary-700">{v}</span> },
  { key: 'total_weight', label: 'Weight', render: (v) => `${parseFloat(v || 0).toFixed(2)} kg` },
  { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
  { key: 'lot_date', label: 'Date', render: (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—' },
]

export default function LotsPage() {
  // ── List state ──
  const [lots, setLots] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [detailLot, setDetailLot] = useState(null)

  // ── Create overlay state ──
  const [showCreate, setShowCreate] = useState(false)
  const [availableRolls, setAvailableRolls] = useState([])
  const [rollSearch, setRollSearch] = useState('')
  const [form, setForm] = useState({
    lot_date: new Date().toISOString().split('T')[0],
    design_no: '', standard_palla_weight: '', standard_palla_meter: '',
    size_pattern: { ...DEFAULT_SIZE_PATTERN },
    rolls: [], notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const designRef = useRef(null)
  const saveRef = useRef(null)

  // ── Fetch lots ──
  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const p = { page, page_size: 20 }
      if (statusFilter) p.status = statusFilter
      const res = await getLots(p)
      setLots(res.data.data); setTotal(res.data.total); setPages(res.data.pages)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load lots')
    } finally { setLoading(false) }
  }, [page, statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Fetch available rolls when overlay opens ──
  const fetchRolls = useCallback(async () => {
    try {
      const res = await getRolls({ status: 'in_stock', page_size: 500 })
      const arr = Array.isArray(res.data.data) ? res.data.data : []
      setAvailableRolls(arr.filter(r => parseFloat(r.remaining_weight) > 0))
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    if (showCreate) {
      fetchRolls()
      setTimeout(() => designRef.current?.focus(), 100)
    }
  }, [showCreate, fetchRolls])

  // ── Calculations ──
  const piecesPerPalla = Object.values(form.size_pattern).reduce((s, v) => s + (parseInt(v) || 0), 0)

  const rollCalcs = form.rolls.map(r => {
    const roll = availableRolls.find(rl => rl.id === r.roll_id)
    const rem = roll ? parseFloat(roll.remaining_weight) : 0
    const pw = parseFloat(r.palla_weight) || 0
    const pallas = pw > 0 ? Math.floor(rem / pw) : 0
    const used = +(pallas * pw).toFixed(3)
    const waste = +(rem - used).toFixed(3)
    const pcs = pallas * piecesPerPalla
    return { roll, rem, pallas, used, waste, pcs }
  })

  const totals = {
    colors: [...new Set(rollCalcs.map(c => c.roll?.color).filter(Boolean))].length,
    pallas: rollCalcs.reduce((s, c) => s + c.pallas, 0),
    pieces: rollCalcs.reduce((s, c) => s + c.pcs, 0),
    weight: rollCalcs.reduce((s, c) => s + c.rem, 0),
    waste: rollCalcs.reduce((s, c) => s + c.waste, 0),
  }

  const addableRolls = useMemo(() => {
    const used = new Set(form.rolls.map(r => r.roll_id))
    let list = availableRolls.filter(r => !used.has(r.id))
    if (rollSearch.trim()) {
      const q = rollSearch.toLowerCase()
      list = list.filter(r =>
        (r.roll_code || '').toLowerCase().includes(q) ||
        (r.color || '').toLowerCase().includes(q) ||
        (r.fabric || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [availableRolls, form.rolls, rollSearch])

  // ── Form actions ──
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setSizeKey = (k, v) => setForm(f => ({ ...f, size_pattern: { ...f.size_pattern, [k]: parseInt(v) || 0 } }))

  const addRoll = (id) => {
    if (!id || form.rolls.some(r => r.roll_id === id)) return
    setForm(f => ({ ...f, rolls: [...f.rolls, { roll_id: id, palla_weight: f.standard_palla_weight || '' }] }))
  }

  const removeRoll = (i) => setForm(f => ({ ...f, rolls: f.rolls.filter((_, idx) => idx !== i) }))

  const setRollPw = (i, v) => setForm(f => {
    const rolls = [...f.rolls]; rolls[i] = { ...rolls[i], palla_weight: v }; return { ...f, rolls }
  })

  const openCreate = () => {
    setFormError(null); setRollSearch('')
    setForm({ lot_date: new Date().toISOString().split('T')[0], design_no: '', standard_palla_weight: '', standard_palla_meter: '', size_pattern: { ...DEFAULT_SIZE_PATTERN }, rolls: [], notes: '' })
    setShowCreate(true)
  }

  const handleCreate = async () => {
    if (!form.design_no.trim()) return setFormError('Design No. is required')
    if (!form.standard_palla_weight || parseFloat(form.standard_palla_weight) <= 0) return setFormError('Palla Weight is required')
    if (form.rolls.length === 0) return setFormError('Add at least one roll')
    setSaving(true); setFormError(null)
    try {
      await createLot({
        lot_date: form.lot_date, design_no: form.design_no,
        standard_palla_weight: parseFloat(form.standard_palla_weight),
        standard_palla_meter: form.standard_palla_meter ? parseFloat(form.standard_palla_meter) : null,
        default_size_pattern: form.size_pattern,
        rolls: form.rolls.map(r => ({ roll_id: r.roll_id, palla_weight: parseFloat(r.palla_weight) })),
        notes: form.notes || null,
      })
      setShowCreate(false)
      fetchData()
    } catch (e) {
      setFormError(e.response?.data?.detail || 'Failed to create lot')
    } finally { setSaving(false) }
  }

  // ── Ctrl+S (ref stays fresh every render) ──
  saveRef.current = () => { if (form.rolls.length > 0 && !saving) handleCreate() }

  useEffect(() => {
    if (!showCreate) return
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveRef.current?.() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [showCreate])

  // ═══════════════════════════════════════════
  // RENDER: Create Overlay (full-page cutting sheet)
  // ═══════════════════════════════════════════
  if (showCreate) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowCreate(false)} className="rounded-lg p-1.5 hover:bg-white/20 transition-colors">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Cutting Sheet</h2>
              <p className="text-xs text-emerald-100">New lot — design, rolls, palla calculations</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-emerald-200">Ctrl+S to save</span>
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-white/30 px-3 py-1.5 text-sm hover:bg-white/20 transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={saving || form.rolls.length === 0}
              className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors">
              {saving ? 'Creating...' : `Create Lot (${form.rolls.length})`}
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl space-y-3 px-6 py-4">
            {formError && <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />}

            {/* ── Lot Details (tight toolbar) ── */}
            <div className="rounded-lg border bg-white px-4 py-3 shadow-sm">
              <div className="flex items-end gap-3">
                <div className="shrink-0">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Lot No.</label>
                  <div className="flex items-center h-[34px] rounded border border-dashed border-gray-300 bg-gray-50 px-2.5 text-sm font-semibold text-primary-700">
                    LOT-{String(total + 1).padStart(4, '0')}
                  </div>
                </div>
                <div className="w-24">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Design *</label>
                  <input ref={designRef} type="text" value={form.design_no} onChange={e => setField('design_no', e.target.value)}
                    placeholder="702" className="w-full h-[34px] rounded border border-gray-300 px-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                </div>
                <div className="w-[130px]">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Date</label>
                  <input type="date" value={form.lot_date} onChange={e => setField('lot_date', e.target.value)}
                    className="w-full h-[34px] rounded border border-gray-300 px-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                </div>
                <div className="w-24">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Palla Wt *</label>
                  <input type="number" step="0.001" value={form.standard_palla_weight}
                    onChange={e => {
                      const v = e.target.value
                      setForm(f => ({ ...f, standard_palla_weight: v, rolls: f.rolls.map(r => ({ ...r, palla_weight: v })) }))
                    }}
                    placeholder="6.700" className="w-full h-[34px] rounded border border-gray-300 px-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                </div>
                <div className="w-24">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Palla Mtr</label>
                  <input type="number" step="0.01" value={form.standard_palla_meter}
                    onChange={e => setField('standard_palla_meter', e.target.value)}
                    tabIndex={-1}
                    placeholder="5.50" className="w-full h-[34px] rounded border border-gray-300 px-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                </div>
                <div className="h-px w-px border-l border-gray-200 self-stretch my-1" />
                {Object.entries(form.size_pattern).map(([size, count]) => (
                  <div key={size} className="flex items-center gap-0.5">
                    <label className="text-[10px] font-bold text-gray-400">{size}</label>
                    <input type="number" value={count} onChange={e => setSizeKey(size, e.target.value)}
                      className="w-11 h-[34px] rounded border border-gray-300 px-1 text-center text-sm font-bold focus:border-primary-500 focus:ring-1 focus:ring-primary-500" />
                  </div>
                ))}
                <span className="shrink-0 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  = {piecesPerPalla} pcs
                </span>
              </div>
            </div>

            {/* ── Rolls Section ── */}
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Rolls <span className="ml-1 text-emerald-600">({form.rolls.length})</span>
                </h3>
                <div className="relative w-64">
                  <input type="text" value={rollSearch} onChange={e => setRollSearch(e.target.value)}
                    placeholder="Search code, color, fabric..." className={`${INPUT} pl-8 text-xs`} />
                  <svg className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>

              {/* Available rolls — grid cards */}
              {addableRolls.length > 0 && (
                <div className="border-b bg-gray-50/50 px-4 py-3">
                  <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                    {addableRolls.slice(0, 60).map(r => (
                      <button key={r.id} onClick={() => addRoll(r.id)}
                        className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-sm ${hasVA(r) ? 'border-purple-300 bg-purple-50/30' : 'border-gray-200 bg-white'}`}>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-gray-700"><RollCodeDisplay roll={r} /></div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: r.color?.toLowerCase() || '#9ca3af' }} />
                            <span className="text-[11px] text-gray-500 truncate">{r.color || '—'}</span>
                            <span className="ml-auto text-[11px] font-semibold text-emerald-600 tabular-nums whitespace-nowrap">{r.remaining_weight} kg</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {addableRolls.length > 60 && <p className="mt-2 text-center text-[11px] text-gray-400">+{addableRolls.length - 60} more rolls (use search to filter)</p>}
                </div>
              )}

              {/* Selected rolls table */}
              {form.rolls.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <svg className="mx-auto h-10 w-10 text-gray-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <p className="text-sm">Click rolls above to add them to this lot</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                      <th className="py-2.5 px-4 w-8">#</th>
                      <th className="px-3">Roll Code</th>
                      <th className="px-3">Color</th>
                      <th className="px-3 text-right">Avail. Wt</th>
                      <th className="px-3 text-right w-28">Palla Wt</th>
                      <th className="px-3 text-right">Pallas</th>
                      <th className="px-3 text-right">Pieces</th>
                      <th className="px-3 text-right">Waste</th>
                      <th className="px-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.rolls.map((r, i) => {
                      const c = rollCalcs[i]
                      return (
                        <tr key={r.roll_id} className="border-b hover:bg-gray-50/50">
                          <td className="py-2 px-4 text-xs text-gray-400">{i + 1}</td>
                          <td className="px-3"><RollCodeDisplay roll={c.roll} /></td>
                          <td className="px-3"><span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{c.roll?.color || '—'}</span></td>
                          <td className="px-3 text-right tabular-nums">{c.rem.toFixed(3)}</td>
                          <td className="px-3 text-right">
                            <input type="number" step="0.001" value={r.palla_weight} tabIndex={-1}
                              onChange={e => setRollPw(i, e.target.value)}
                              className="w-24 rounded border border-gray-200 px-2 py-1 text-right text-xs tabular-nums focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                          </td>
                          <td className="px-3 text-right font-bold tabular-nums">{c.pallas}</td>
                          <td className="px-3 text-right font-bold text-emerald-700 tabular-nums">{c.pcs}</td>
                          <td className="px-3 text-right text-red-400 tabular-nums">{c.waste > 0 ? c.waste.toFixed(3) : '—'}</td>
                          <td className="px-3">
                            <button onClick={() => removeRoll(i)} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── Summary ── */}
            {form.rolls.length > 0 && (
              <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-4">
                <div className="grid grid-cols-6 gap-3 text-center">
                  <div>
                    <div className="text-xl font-bold text-amber-600">{totals.colors}</div>
                    <div className="text-xs text-gray-500">Colors</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-600">{form.rolls.length}</div>
                    <div className="text-xs text-gray-500">Rolls</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-blue-700">{totals.pallas}</div>
                    <div className="text-xs text-gray-500">Pallas</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-emerald-700">{totals.pieces}</div>
                    <div className="text-xs text-gray-500">Pieces</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-purple-700">{totals.weight.toFixed(3)}</div>
                    <div className="text-xs text-gray-500">Weight (kg)</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-red-500">{totals.waste.toFixed(3)}</div>
                    <div className="text-xs text-gray-500">Waste (kg)</div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Notes ── */}
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <label className={LABEL}>Notes</label>
              <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2}
                placeholder="Special instructions..." className={INPUT} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════
  // RENDER: Lots List
  // ═══════════════════════════════════════════
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Lots</h1>
          <p className="mt-1 text-sm text-gray-500">Cutting lots — group rolls, calculate pallas & pieces</p>
        </div>
        <button onClick={openCreate} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
          + New Cutting Sheet
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        {[
          { key: '', label: 'All' },
          { key: 'open', label: 'Open' },
          { key: 'cutting', label: 'Cutting' },
          { key: 'distributed', label: 'Distributed' },
        ].map(p => (
          <button key={p.key} onClick={() => { setStatusFilter(p.key); setPage(1) }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${statusFilter === p.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      <div className="mt-4">
        <DataTable columns={COLUMNS} data={lots} loading={loading} onRowClick={setDetailLot} emptyText="No lots found." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      {/* ── Detail Modal ── */}
      <Modal open={!!detailLot} onClose={() => setDetailLot(null)}
        title={detailLot ? `${detailLot.lot_code} — Design ${detailLot.design_no}` : ''} wide>
        {detailLot && (
          <div className="space-y-4">
            <div className="grid grid-cols-5 gap-3">
              <div className="rounded-lg bg-amber-50 p-3 text-center">
                <div className="text-xl font-bold text-amber-700">{[...new Set((detailLot.lot_rolls || []).map(r => r.color).filter(Boolean))].length}</div>
                <div className="text-xs text-amber-500">Colors</div>
              </div>
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <div className="text-xl font-bold text-blue-700">{detailLot.total_pallas}</div>
                <div className="text-xs text-blue-500">Pallas</div>
              </div>
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <div className="text-xl font-bold text-green-700">{detailLot.total_pieces}</div>
                <div className="text-xs text-green-500">Pieces</div>
              </div>
              <div className="rounded-lg bg-purple-50 p-3 text-center">
                <div className="text-xl font-bold text-purple-700">{detailLot.total_weight} kg</div>
                <div className="text-xs text-purple-500">Weight</div>
              </div>
              <div className="rounded-lg bg-orange-50 p-3 text-center">
                <div className="text-xl font-bold text-orange-700">{detailLot.pieces_per_palla}</div>
                <div className="text-xs text-orange-500">Pcs/Palla</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              <span><span className="font-medium">Size:</span> {Object.entries(detailLot.default_size_pattern || {}).map(([k, v]) => `${k}:${v}`).join(' + ')} = {detailLot.pieces_per_palla}/palla</span>
              <span><span className="font-medium">Palla Wt:</span> {detailLot.standard_palla_weight} kg</span>
              {detailLot.standard_palla_meter && <span><span className="font-medium">Palla Meter:</span> {detailLot.standard_palla_meter} m</span>}
              <span><span className="font-medium">Date:</span> {detailLot.lot_date ? new Date(detailLot.lot_date).toLocaleDateString('en-IN') : '—'}</span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="py-2 px-3">#</th>
                  <th className="px-3">Roll Code</th>
                  <th className="px-3">Color</th>
                  <th className="px-3 text-right">Roll Wt</th>
                  <th className="px-3 text-right">Palla Wt</th>
                  <th className="px-3 text-right">Pallas</th>
                  <th className="px-3 text-right">Used</th>
                  <th className="px-3 text-right">Waste</th>
                  <th className="px-3 text-right">Pieces</th>
                </tr>
              </thead>
              <tbody>
                {(detailLot.lot_rolls || []).map((lr, i) => (
                  <tr key={lr.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-400">{i + 1}</td>
                    <td className="px-3 font-medium">{lr.roll_code}</td>
                    <td className="px-3"><span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{lr.color}</span></td>
                    <td className="px-3 text-right">{lr.roll_weight} kg</td>
                    <td className="px-3 text-right">{lr.palla_weight} kg</td>
                    <td className="px-3 text-right font-semibold">{lr.num_pallas}</td>
                    <td className="px-3 text-right">{lr.weight_used} kg</td>
                    <td className="px-3 text-right text-red-500">{lr.waste_weight} kg</td>
                    <td className="px-3 text-right font-bold text-primary-700">{lr.pieces_from_roll}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-gray-50 font-semibold">
                  <td className="py-2 px-3" colSpan={5}>Totals</td>
                  <td className="px-3 text-right">{detailLot.total_pallas}</td>
                  <td className="px-3 text-right">{parseFloat(detailLot.total_weight || 0).toFixed(3)} kg</td>
                  <td className="px-3 text-right text-red-500">{(detailLot.lot_rolls || []).reduce((s, r) => s + parseFloat(r.waste_weight || 0), 0).toFixed(3)} kg</td>
                  <td className="px-3 text-right text-primary-700">{detailLot.total_pieces}</td>
                </tr>
              </tfoot>
            </table>

            {detailLot.notes && <div className="text-sm text-gray-500"><span className="font-medium">Notes:</span> {detailLot.notes}</div>}
          </div>
        )}
      </Modal>
    </div>
  )
}
