import { useState, useEffect, useCallback } from 'react'
import { getRolls, stockIn, updateRoll } from '../api/rolls'
import { getSuppliers } from '../api/suppliers'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import ErrorAlert from '../components/common/ErrorAlert'
import RollForm from '../components/forms/RollForm'

const COLUMNS = [
  { key: 'roll_code', label: 'Code' },
  { key: 'fabric_type', label: 'Fabric' },
  { key: 'color', label: 'Color' },
  {
    key: 'total_weight',
    label: 'Weight (kg)',
    render: (val) => `${val} kg`,
  },
  {
    key: 'remaining_weight',
    label: 'Remaining',
    render: (val, row) => {
      const pct = row.total_weight > 0 ? (val / row.total_weight) * 100 : 0
      return (
        <div className="flex items-center gap-2">
          <span>{val} kg</span>
          <div className="h-1.5 w-16 rounded-full bg-gray-200">
            <div className={`h-1.5 rounded-full ${pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )
    },
  },
  { key: 'cost_per_unit', label: '₹/kg', render: (val) => val != null ? `₹${val}` : '—' },
  {
    key: 'supplier',
    label: 'Supplier',
    render: (val) => val?.name || '—',
  },
  { key: 'supplier_invoice_no', label: 'Invoice No.', render: (val) => val || '—' },
  {
    key: 'received_at',
    label: 'Received',
    render: (val) => val ? new Date(val).toLocaleDateString() : '—',
  },
]

const EMPTY_FORM = { fabric_type: '', color: '', total_weight: '', cost_per_unit: '', supplier_id: '', total_length: '', supplier_invoice_no: '', supplier_invoice_date: '', notes: '' }

export default function RollsPage() {
  const [rolls, setRolls] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const [suppliers, setSuppliers] = useState([])
  const [detailRoll, setDetailRoll] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState(null)

  const isEditable = detailRoll && detailRoll.remaining_weight === detailRoll.total_weight

  const openDetail = (roll) => {
    setDetailRoll(roll)
    setEditing(false)
    setEditError(null)
  }

  const startEditing = () => {
    setEditForm({
      fabric_type: detailRoll.fabric_type || '',
      color: detailRoll.color || '',
      total_weight: detailRoll.total_weight ?? '',
      cost_per_unit: detailRoll.cost_per_unit ?? '',
      supplier_id: detailRoll.supplier?.id || '',
      total_length: detailRoll.total_length ?? '',
      supplier_invoice_no: detailRoll.supplier_invoice_no || '',
      supplier_invoice_date: detailRoll.supplier_invoice_date || '',
      notes: detailRoll.notes || '',
    })
    setEditError(null)
    setEditing(true)
  }

  const handleUpdate = async () => {
    setEditSaving(true)
    setEditError(null)
    try {
      await updateRoll(detailRoll.id, {
        fabric_type: editForm.fabric_type,
        color: editForm.color,
        total_weight: parseFloat(editForm.total_weight),
        cost_per_unit: editForm.cost_per_unit ? parseFloat(editForm.cost_per_unit) : null,
        total_length: editForm.total_length ? parseFloat(editForm.total_length) : null,
        supplier_id: editForm.supplier_id || null,
        supplier_invoice_no: editForm.supplier_invoice_no || null,
        supplier_invoice_date: editForm.supplier_invoice_date || null,
        notes: editForm.notes || null,
      })
      setDetailRoll(null)
      fetchData()
    } catch (err) {
      setEditError(err.response?.data?.detail || 'Failed to update roll')
    } finally {
      setEditSaving(false)
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getRolls({ page, page_size: 20, fabric_type: search || undefined })
      setRolls(res.data.data)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load rolls')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    getSuppliers({ is_active: true }).then((res) => setSuppliers(res.data.data)).catch(() => {})
  }, [])

  const openStockIn = () => {
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  const handleStockIn = async () => {
    setSaving(true)
    setFormError(null)
    try {
      await stockIn({
        fabric_type: form.fabric_type,
        color: form.color,
        total_weight: parseFloat(form.total_weight),
        unit: 'kg',
        cost_per_unit: form.cost_per_unit ? parseFloat(form.cost_per_unit) : null,
        total_length: form.total_length ? parseFloat(form.total_length) : null,
        supplier_id: form.supplier_id || null,
        supplier_invoice_no: form.supplier_invoice_no || null,
        supplier_invoice_date: form.supplier_invoice_date || null,
        notes: form.notes || null,
      })
      setModalOpen(false)
      fetchData()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to stock in roll')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Rolls</h1>
          <p className="mt-1 text-sm text-gray-500">Raw material stock — fabric rolls (by weight)</p>
        </div>
        <button onClick={openStockIn} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
          + Stock In
        </button>
      </div>

      <div className="mt-5 max-w-sm">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Filter by fabric type..." />
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      <div className="mt-4">
        <DataTable columns={COLUMNS} data={rolls} loading={loading} onRowClick={openDetail} emptyText="No rolls found." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      {/* Roll Detail Modal */}
      <Modal open={!!detailRoll} onClose={() => { setDetailRoll(null); setEditing(false) }}
        title={detailRoll ? `${detailRoll.roll_code} — ${editing ? 'Edit' : 'Details'}` : ''} wide
        actions={editing ? (
          <>
            <button onClick={() => setEditing(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleUpdate} disabled={editSaving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {editSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </>
        ) : null}
      >
        {detailRoll && (() => {
          const pct = detailRoll.total_weight > 0 ? (detailRoll.remaining_weight / detailRoll.total_weight) * 100 : 0
          return (
            <div className="space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-blue-50 p-3 text-center">
                  <div className="text-xl font-bold text-blue-700">{detailRoll.total_weight} kg</div>
                  <div className="text-xs text-blue-500">Total Weight</div>
                </div>
                <div className="rounded-lg bg-green-50 p-3 text-center">
                  <div className="text-xl font-bold text-green-700">{detailRoll.remaining_weight} kg</div>
                  <div className="text-xs text-green-500">Remaining</div>
                </div>
                <div className="rounded-lg bg-purple-50 p-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="text-xl font-bold text-purple-700">{pct.toFixed(0)}%</div>
                    <div className="h-2 w-20 rounded-full bg-gray-200">
                      <div className={`h-2 rounded-full ${pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-xs text-purple-500">Stock Level</div>
                </div>
              </div>

              {editing ? (
                /* Edit mode — form */
                <RollForm form={editForm} onChange={setEditForm} suppliers={suppliers}
                  error={editError} onDismissError={() => setEditError(null)} />
              ) : (
                /* View mode — read-only detail + edit button or warning */
                <>
                  {!isEditable && (
                    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                      <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-amber-800">This roll cannot be edited</p>
                        <p className="mt-0.5 text-xs text-amber-600">
                          {detailRoll.remaining_weight === 0
                            ? 'This roll has been fully consumed in a lot/batch. Editing consumed rolls would break inventory records.'
                            : `${(detailRoll.total_weight - detailRoll.remaining_weight).toFixed(3)} kg has already been used. Only unused rolls (where remaining = total weight) can be edited.`}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {[
                      ['Roll Code', detailRoll.roll_code],
                      ['Fabric Type', detailRoll.fabric_type],
                      ['Color', detailRoll.color],
                      ['Unit', detailRoll.unit || 'kg'],
                      ['Cost / kg', detailRoll.cost_per_unit != null ? `₹${detailRoll.cost_per_unit}` : '—'],
                      ['Total Length', detailRoll.total_length ? `${detailRoll.total_length} m` : '—'],
                      ['Supplier', detailRoll.supplier?.name || '—'],
                      ['Invoice No.', detailRoll.supplier_invoice_no || '—'],
                      ['Invoice Date', detailRoll.supplier_invoice_date ? new Date(detailRoll.supplier_invoice_date).toLocaleDateString() : '—'],
                      ['Received By', detailRoll.received_by_user?.full_name || '—'],
                      ['Received At', detailRoll.received_at ? new Date(detailRoll.received_at).toLocaleString() : '—'],
                      ['Notes', detailRoll.notes || '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center px-4 py-2.5 text-sm">
                        <span className="w-36 flex-shrink-0 font-medium text-gray-500">{label}</span>
                        <span className="text-gray-800">{value}</span>
                      </div>
                    ))}
                  </div>

                  {isEditable && (
                    <div className="flex justify-end">
                      <button onClick={startEditing}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100 transition-colors">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit Roll
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })()}
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Stock In — New Roll"
        actions={
          <>
            <button onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleStockIn} disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Stock In'}
            </button>
          </>
        }
      >
        <RollForm form={form} onChange={setForm} suppliers={suppliers}
          error={formError} onDismissError={() => setFormError(null)} />
      </Modal>
    </div>
  )
}
