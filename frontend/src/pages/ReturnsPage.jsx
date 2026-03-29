import { useState, useEffect, useCallback, useMemo } from 'react'
import { getReturnNotes, getReturnNote, createReturnNote, approveReturnNote, dispatchReturnNote, acknowledgeReturnNote, closeReturnNote, cancelReturnNote } from '../api/returns'
import { getSuppliers } from '../api/suppliers'
import { getAllTransports } from '../api/transports'
import DataTable from '../components/common/DataTable'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'
import SearchInput from '../components/common/SearchInput'
import FilterSelect from '../components/common/FilterSelect'
import Modal from '../components/common/Modal'

const TABS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'approved', label: 'Approved' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'closed', label: 'Closed' },
  { key: 'cancelled', label: 'Cancelled' },
]

const TYPE_TABS = [
  { key: '', label: 'All Types' },
  { key: 'roll_return', label: 'Roll Returns' },
  { key: 'sku_return', label: 'SKU Returns' },
]

const REASON_OPTIONS = [
  { value: '', label: 'Select reason' },
  { value: 'defective', label: 'Defective' },
  { value: 'excess', label: 'Excess Stock' },
  { value: 'wrong_material', label: 'Wrong Material' },
  { value: 'damaged_in_transit', label: 'Damaged in Transit' },
  { value: 'quality_reject', label: 'Quality Reject' },
  { value: 'other', label: 'Other' },
]

const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtCurrency = (v) => `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const KPI_COLORS = {
  slate: 'from-slate-500 to-slate-600',
  amber: 'from-amber-500 to-amber-600',
  green: 'from-green-500 to-green-600',
  emerald: 'from-emerald-500 to-emerald-600',
  red: 'from-red-500 to-red-600',
  blue: 'from-blue-500 to-blue-600',
  orange: 'from-orange-500 to-orange-600',
}

function KPICard({ label, value, sub, color = 'slate' }) {
  return (
    <div className={`rounded-lg bg-gradient-to-br ${KPI_COLORS[color] || KPI_COLORS.slate} p-2.5 text-white shadow-sm`}>
      <p className="typo-label-sm tracking-wide text-white/85">{label}</p>
      <p className="mt-0.5 text-xl font-bold leading-tight">{value}</p>
      {sub && <p className="typo-caption text-white/75">{sub}</p>}
    </div>
  )
}

const COLUMNS = [
  { key: 'return_note_no', label: 'Return #', render: (val) => <span className="font-semibold text-emerald-700">{val}</span> },
  { key: 'return_type', label: 'Type', render: (val) => (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 typo-badge ${val === 'roll_return' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
      {val === 'roll_return' ? 'Roll' : 'SKU'}
    </span>
  )},
  { key: 'supplier', label: 'Supplier', render: (val) => val?.name || '—' },
  { key: 'total_amount', label: 'Amount', render: (val) => fmtCurrency(val) },
  { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
  { key: 'return_date', label: 'Date', render: (val) => fmtDate(val) },
]

export default function ReturnsPage() {
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Detail overlay
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actioning, setActioning] = useState(false)

  // Create mode
  const [createMode, setCreateMode] = useState(false)
  const [suppliers, setSuppliers] = useState([])
  const [transports, setTransports] = useState([])
  const [form, setForm] = useState({ return_type: 'roll_return', supplier_id: '', transport_id: '', lr_number: '', notes: '' })
  const [formItems, setFormItems] = useState([{ roll_id: '', sku_id: '', quantity: 1, weight: '', unit_price: '', reason: '', notes: '' }])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  // Confirm cancel
  const [confirmCancel, setConfirmCancel] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getReturnNotes({
        page, page_size: 20,
        status: statusFilter || undefined,
        return_type: typeFilter || undefined,
        search: search || undefined,
      })
      const d = res.data?.data || res.data
      if (Array.isArray(d)) {
        setList(d)
        setTotal(res.data?.total || d.length)
        setPages(res.data?.pages || 1)
      } else {
        setList(d?.data || [])
        setTotal(d?.total || 0)
        setPages(d?.pages || 1)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load return notes')
    } finally { setLoading(false) }
  }, [page, statusFilter, typeFilter, search])

  useEffect(() => { fetchData() }, [fetchData])

  const kpis = useMemo(() => {
    const all = list
    return {
      total: all.length,
      draftCount: all.filter(n => n.status === 'draft').length,
      approvedCount: all.filter(n => n.status === 'approved').length,
      dispatchedCount: all.filter(n => n.status === 'dispatched').length,
      closedCount: all.filter(n => n.status === 'closed').length,
      totalAmt: all.filter(n => n.status !== 'cancelled').reduce((s, n) => s + (n.total_amount || 0), 0),
    }
  }, [list])

  const handleRowClick = async (row) => {
    setDetailLoading(true)
    setDetail(row)
    try {
      const res = await getReturnNote(row.id)
      setDetail(res.data?.data || res.data)
    } catch { /* fallback to list data */ }
    finally { setDetailLoading(false) }
  }

  const handleStatusAction = async (action) => {
    setActioning(true)
    try {
      const fns = { approve: approveReturnNote, dispatch: dispatchReturnNote, acknowledge: acknowledgeReturnNote, close: closeReturnNote, cancel: cancelReturnNote }
      const fn = fns[action]
      if (!fn) return
      const res = await fn(detail.id)
      setDetail(res.data?.data || res.data)
      fetchData()
      if (action === 'cancel') setConfirmCancel(false)
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to ${action}`)
    } finally { setActioning(false) }
  }

  const openCreate = async () => {
    setCreateMode(true)
    setFormError(null)
    setForm({ return_type: 'roll_return', supplier_id: '', transport_id: '', lr_number: '', notes: '' })
    setFormItems([{ roll_id: '', sku_id: '', quantity: 1, weight: '', unit_price: '', reason: '', notes: '' }])
    try {
      const [supRes, transRes] = await Promise.all([getSuppliers({ is_active: true }), getAllTransports()])
      setSuppliers(supRes.data?.data || [])
      setTransports(transRes.data?.data || [])
    } catch {}
  }

  const addItem = () => setFormItems(prev => [...prev, { roll_id: '', sku_id: '', quantity: 1, weight: '', unit_price: '', reason: '', notes: '' }])
  const removeItem = (idx) => setFormItems(prev => prev.filter((_, i) => i !== idx))
  const updateItem = (idx, field, value) => setFormItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))

  const handleCreate = async () => {
    if (!form.supplier_id) { setFormError('Select a supplier'); return }
    if (formItems.length === 0) { setFormError('Add at least one item'); return }

    setSaving(true)
    setFormError(null)
    try {
      await createReturnNote({
        return_type: form.return_type,
        supplier_id: form.supplier_id,
        return_date: new Date().toISOString().split('T')[0],
        transport_id: form.transport_id || null,
        lr_number: form.lr_number?.trim() || null,
        notes: form.notes?.trim() || null,
        items: formItems.map(item => ({
          roll_id: item.roll_id || null,
          sku_id: item.sku_id || null,
          quantity: parseInt(item.quantity) || 1,
          weight: item.weight ? parseFloat(item.weight) : null,
          unit_price: item.unit_price ? parseFloat(item.unit_price) : null,
          reason: item.reason || null,
          notes: item.notes?.trim() || null,
        })),
      })
      setCreateMode(false)
      fetchData()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to create return note')
    } finally { setSaving(false) }
  }

  /* ═══════════════════════ DETAIL OVERLAY ═══════════════════════ */
  if (detail) {
    const n = detail
    const statusFlow = ['draft', 'approved', 'dispatched', 'acknowledged', 'closed']
    const currentIdx = statusFlow.indexOf(n.status)

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-auto">
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="typo-modal-title text-white leading-tight">{n.return_note_no}</h1>
            <p className="text-xs opacity-80">
              {n.return_type === 'roll_return' ? 'Roll Return' : 'SKU Return'} &middot; <StatusBadge status={n.status} />
            </p>
          </div>
          <button onClick={() => setDetail(null)} className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors">Close</button>
        </div>

        {detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : (
          <div className="flex-1 p-4 max-w-5xl mx-auto w-full space-y-3">
            {/* Status timeline */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {statusFlow.map((s, i) => (
                <div key={s} className="flex items-center">
                  <div className={`rounded-full px-2.5 py-0.5 typo-badge capitalize whitespace-nowrap ${
                    i <= currentIdx ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'
                  }`}>{s}</div>
                  {i < statusFlow.length - 1 && <div className={`w-6 h-0.5 ${i < currentIdx ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
                </div>
              ))}
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Supplier</p>
                <p className="typo-body">{n.supplier?.name || '—'}</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Return Date</p>
                <p className="typo-body">{fmtDate(n.return_date)}</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="typo-label-sm">Total Amount</p>
                <p className="typo-body font-semibold">{fmtCurrency(n.total_amount)}</p>
              </div>
              {n.transport && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Transport</p>
                  <p className="typo-body">{n.transport.name}</p>
                </div>
              )}
              {n.lr_number && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">L.R. Number</p>
                  <p className="typo-body">{n.lr_number}</p>
                </div>
              )}
              {n.dispatch_date && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Dispatched</p>
                  <p className="typo-body">{fmtDate(n.dispatch_date)}</p>
                </div>
              )}
              {n.approved_by_user && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="typo-label-sm">Approved By</p>
                  <p className="typo-body">{n.approved_by_user.full_name}</p>
                </div>
              )}
            </div>

            {n.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                <span className="font-semibold">Notes:</span> {n.notes}
              </div>
            )}

            {/* Items table */}
            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 typo-th">#</th>
                    <th className="px-2 py-1.5 typo-th">{n.return_type === 'roll_return' ? 'Roll' : 'SKU'}</th>
                    <th className="px-2 py-1.5 typo-th text-right">{n.return_type === 'roll_return' ? 'Weight' : 'Qty'}</th>
                    <th className="px-2 py-1.5 typo-th text-right">Unit Price</th>
                    <th className="px-2 py-1.5 typo-th text-right">Amount</th>
                    <th className="px-2 py-1.5 typo-th">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(n.items || []).map((item, i) => (
                    <tr key={item.id || i} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                      <td className="px-2 py-1.5 font-semibold">
                        {item.roll ? item.roll.roll_code : item.sku ? item.sku.sku_code : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {n.return_type === 'roll_return'
                          ? (item.weight ? `${item.weight} kg` : '—')
                          : item.quantity
                        }
                      </td>
                      <td className="px-2 py-1.5 text-right">{item.unit_price ? fmtCurrency(item.unit_price) : '—'}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">{item.amount ? fmtCurrency(item.amount) : '—'}</td>
                      <td className="px-2 py-1.5">
                        {item.reason && (
                          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 typo-badge bg-orange-100 text-orange-700 capitalize">
                            {item.reason.replace(/_/g, ' ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t">
              {n.status === 'draft' && (
                <>
                  <button onClick={() => setConfirmCancel(true)} disabled={actioning}
                    className="rounded border border-red-300 text-red-600 px-4 py-1.5 typo-btn-sm hover:bg-red-50 disabled:opacity-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={() => handleStatusAction('approve')} disabled={actioning}
                    className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {actioning ? 'Processing...' : 'Approve'}
                  </button>
                </>
              )}
              {n.status === 'approved' && (
                <>
                  <button onClick={() => setConfirmCancel(true)} disabled={actioning}
                    className="rounded border border-red-300 text-red-600 px-4 py-1.5 typo-btn-sm hover:bg-red-50 disabled:opacity-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={() => handleStatusAction('dispatch')} disabled={actioning}
                    className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {actioning ? 'Processing...' : 'Mark Dispatched'}
                  </button>
                </>
              )}
              {n.status === 'dispatched' && (
                <>
                  <button onClick={() => handleStatusAction('acknowledge')} disabled={actioning}
                    className="rounded border border-gray-300 text-gray-700 px-4 py-1.5 typo-btn-sm hover:bg-gray-50 disabled:opacity-50 transition-colors">
                    {actioning ? 'Processing...' : 'Acknowledge'}
                  </button>
                  <button onClick={() => handleStatusAction('close')} disabled={actioning}
                    className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {actioning ? 'Processing...' : 'Close & Debit Supplier'}
                  </button>
                </>
              )}
              {n.status === 'acknowledged' && (
                <button onClick={() => handleStatusAction('close')} disabled={actioning}
                  className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {actioning ? 'Processing...' : 'Close & Debit Supplier'}
                </button>
              )}
            </div>

            {/* Cancel confirmation */}
            <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel Return Note" actions={
              <>
                <button onClick={() => setConfirmCancel(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 typo-btn-sm text-gray-600 hover:bg-gray-50">No, Keep</button>
                <button onClick={() => handleStatusAction('cancel')} disabled={actioning}
                  className="rounded-lg bg-red-600 px-4 py-1.5 typo-btn-sm text-white hover:bg-red-700 disabled:opacity-50">
                  {actioning ? 'Cancelling...' : 'Yes, Cancel'}
                </button>
              </>
            }>
              <p className="typo-body">Cancel return note <span className="font-semibold">{n.return_note_no}</span>? This cannot be undone.</p>
            </Modal>
          </div>
        )}
      </div>
    )
  }

  /* ═══════════════════════ CREATE OVERLAY ═══════════════════════ */
  if (createMode) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-auto">
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="typo-modal-title text-white leading-tight">New Return Note</h1>
            <p className="text-xs opacity-80">Create a supplier return</p>
          </div>
          <button onClick={() => setCreateMode(false)} className="rounded bg-white/20 px-3 py-1.5 typo-btn-sm hover:bg-white/30 transition-colors">Close</button>
        </div>

        <div className="flex-1 p-4 max-w-4xl mx-auto w-full space-y-4">
          {formError && <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="typo-label">Return Type</label>
              <FilterSelect full value={form.return_type}
                onChange={v => setForm(f => ({ ...f, return_type: v }))}
                options={[{ value: 'roll_return', label: 'Roll Return' }, { value: 'sku_return', label: 'SKU Return' }]} />
            </div>
            <div>
              <label className="typo-label">Supplier</label>
              <FilterSelect searchable full value={form.supplier_id}
                onChange={v => setForm(f => ({ ...f, supplier_id: v }))}
                options={[{ value: '', label: 'Select Supplier' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]} />
            </div>
            <div>
              <label className="typo-label">Transport</label>
              <FilterSelect searchable full value={form.transport_id}
                onChange={v => setForm(f => ({ ...f, transport_id: v }))}
                options={[{ value: '', label: 'Select Transport (optional)' }, ...transports.map(t => ({ value: t.id, label: t.name }))]} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="typo-label">L.R. Number</label>
              <input className="typo-input" value={form.lr_number} onChange={e => setForm(f => ({ ...f, lr_number: e.target.value }))} placeholder="Optional" />
            </div>
            <div>
              <label className="typo-label">Notes</label>
              <input className="typo-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Return reason / notes" />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="typo-label">Items</label>
              <button onClick={addItem} className="rounded bg-emerald-600 text-white px-3 py-1 typo-btn-sm hover:bg-emerald-700">+ Add Item</button>
            </div>
            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1.5 typo-th text-left">#</th>
                    <th className="px-2 py-1.5 typo-th text-left">{form.return_type === 'roll_return' ? 'Roll ID' : 'SKU ID'}</th>
                    <th className="px-2 py-1.5 typo-th text-right">{form.return_type === 'roll_return' ? 'Weight (kg)' : 'Qty'}</th>
                    <th className="px-2 py-1.5 typo-th text-right">Unit Price</th>
                    <th className="px-2 py-1.5 typo-th text-left">Reason</th>
                    <th className="px-2 py-1.5 typo-th w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {formItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-2 py-1.5 text-gray-400">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        <input className="typo-input-sm w-full"
                          placeholder={form.return_type === 'roll_return' ? 'Paste roll UUID' : 'Paste SKU UUID'}
                          value={form.return_type === 'roll_return' ? item.roll_id : item.sku_id}
                          onChange={e => updateItem(idx, form.return_type === 'roll_return' ? 'roll_id' : 'sku_id', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" className="typo-input-sm w-20 text-right"
                          value={form.return_type === 'roll_return' ? item.weight : item.quantity}
                          onChange={e => updateItem(idx, form.return_type === 'roll_return' ? 'weight' : 'quantity', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" className="typo-input-sm w-20 text-right" placeholder="0"
                          value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <select className="typo-input-sm w-full" value={item.reason}
                          onChange={e => updateItem(idx, 'reason', e.target.value)}>
                          {REASON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {formItems.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <button onClick={() => setCreateMode(false)} className="rounded border border-gray-300 text-gray-700 px-4 py-1.5 typo-btn-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleCreate} disabled={saving}
              className="rounded bg-emerald-600 text-white px-4 py-1.5 typo-btn-sm hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Return Note'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ═══════════════════════ LIST VIEW ═══════════════════════ */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="typo-page-title">Returns</h1>
          <p className="typo-caption">Supplier return notes — rolls & SKUs</p>
        </div>
        <button onClick={openCreate} className="rounded bg-emerald-600 text-white px-4 py-2 typo-btn-sm hover:bg-emerald-700 shadow-sm flex items-center gap-1.5">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New Return
        </button>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <KPICard label="Total" value={kpis.total} color="slate" />
        <KPICard label="Draft" value={kpis.draftCount} color="amber" />
        <KPICard label="Approved" value={kpis.approvedCount} color="blue" />
        <KPICard label="Dispatched" value={kpis.dispatchedCount} color="orange" />
        <KPICard label="Closed" value={kpis.closedCount} color="green" />
        <KPICard label="Value" value={fmtCurrency(kpis.totalAmt)} color="emerald" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => { setStatusFilter(tab.key); setPage(1) }}
              className={`px-2.5 py-1 rounded-full typo-tab transition-colors ${
                statusFilter === tab.key
                  ? 'border-b-2 border-emerald-600 text-emerald-700 bg-emerald-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-2">
          {TYPE_TABS.map(tab => (
            <button key={tab.key} onClick={() => { setTypeFilter(tab.key); setPage(1) }}
              className={`px-2.5 py-1 rounded-full typo-tab transition-colors ${
                typeFilter === tab.key
                  ? 'border-b-2 border-blue-600 text-blue-700 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="ml-auto w-56">
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search returns..." />
        </div>
      </div>

      <div className="mt-4">
        <DataTable columns={COLUMNS} data={list} loading={loading} onRowClick={handleRowClick} emptyText="No return notes found." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>
    </div>
  )
}
