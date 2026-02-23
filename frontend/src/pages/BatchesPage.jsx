import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBatches, createBatch, assignBatch } from '../api/batches'
import { getLots } from '../api/lots'
import { getUsers } from '../api/users'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'
import BatchForm from '../components/forms/BatchForm'

const COLUMNS = [
  { key: 'batch_code', label: 'Code' },
  {
    key: 'lot',
    label: 'Lot',
    render: (val) => val ? `${val.lot_code} (D${val.design_no})` : '—',
  },
  {
    key: 'size',
    label: 'Size',
    render: (val) => val ? <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">{val}</span> : '—',
  },
  {
    key: 'sku',
    label: 'SKU',
    render: (val) => val ? (
      <div>
        <span className="font-medium">{val.sku_code}</span>
        <span className="ml-1 text-xs text-gray-400">{val.product_name}</span>
      </div>
    ) : <span className="text-gray-400">—</span>,
  },
  {
    key: 'piece_count',
    label: 'Pieces',
    render: (val) => <span className="font-semibold">{val}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    render: (val) => <StatusBadge status={val} />,
  },
  {
    key: 'assignment',
    label: 'Tailor',
    render: (val) => val?.tailor?.full_name || '—',
  },
  {
    key: 'approved_qty',
    label: 'Approved',
    render: (val, row) => {
      if (row.status !== 'COMPLETED') return '—'
      return <span className="text-green-600 font-medium">{val}</span>
    },
  },
  {
    key: 'created_at',
    label: 'Created',
    render: (val) => val ? new Date(val).toLocaleDateString() : '—',
  },
]

const STATUS_FILTERS = ['', 'CREATED', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED']

export default function BatchesPage() {
  const navigate = useNavigate()
  const [batches, setBatches] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [lotList, setLotList] = useState([])
  const [createForm, setCreateForm] = useState({ lot_id: '', piece_count: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignBatchId, setAssignBatchId] = useState(null)
  const [tailors, setTailors] = useState([])
  const [selectedTailor, setSelectedTailor] = useState('')
  const [assigning, setAssigning] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getBatches({ page, page_size: 20, status: statusFilter || undefined })
      setBatches(res.data.data)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load batches')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    getLots().then((res) => setLotList(res.data.data)).catch(() => {})
    getUsers({ role: 'tailor', is_active: true }).then((res) => setTailors(res.data.data)).catch(() => {})
  }, [])

  const handleRowClick = (row) => {
    if (row.status === 'CREATED') {
      setAssignBatchId(row.id)
      setSelectedTailor('')
      setAssignOpen(true)
    } else {
      navigate(`/batches/${row.id}`)
    }
  }

  // Create batch from lot
  const handleCreate = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const lot = lotList.find((l) => l.id === createForm.lot_id)
      await createBatch({
        lot_id: createForm.lot_id,
        sku_id: lot?.sku?.id || null,
        piece_count: parseInt(createForm.piece_count),
        notes: createForm.notes || null,
      })
      setCreateOpen(false)
      setCreateForm({ lot_id: '', piece_count: '', notes: '' })
      fetchData()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to create batch')
    } finally {
      setSaving(false)
    }
  }

  // Assign batch
  const handleAssign = async () => {
    setAssigning(true)
    try {
      await assignBatch(assignBatchId, selectedTailor)
      setAssignOpen(false)
      fetchData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to assign batch')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Batches</h1>
          <p className="mt-1 text-sm text-gray-500">Production batches — assigned from lots to tailors</p>
        </div>
        <button onClick={() => { setFormError(null); setCreateOpen(true) }} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
          + Create Batch
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="mt-5 flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1) }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      <div className="mt-4">
        <DataTable columns={COLUMNS} data={batches} loading={loading} onRowClick={handleRowClick} emptyText="No batches found." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      {/* Create Batch Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Batch from Lot"
        actions={
          <>
            <button onClick={() => setCreateOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleCreate} disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Batch'}
            </button>
          </>
        }
      >
        <BatchForm form={createForm} onChange={setCreateForm} lotList={lotList}
          error={formError} onDismissError={() => setFormError(null)} />
      </Modal>

      {/* Assign Batch Modal */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign Batch to Tailor"
        actions={
          <>
            <button onClick={() => setAssignOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleAssign} disabled={assigning || !selectedTailor} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {assigning ? 'Assigning...' : 'Assign'}
            </button>
          </>
        }
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Tailor</label>
          <select value={selectedTailor} onChange={(e) => setSelectedTailor(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
            <option value="">Choose tailor...</option>
            {tailors.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </div>
      </Modal>
    </div>
  )
}
