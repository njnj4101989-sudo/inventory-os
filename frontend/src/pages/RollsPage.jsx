import { useState, useEffect, useCallback } from 'react'
import { getRolls, stockIn } from '../api/rolls'
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
    key: 'total_length',
    label: 'Total',
    render: (val, row) => `${val} ${row.unit}`,
  },
  {
    key: 'remaining_length',
    label: 'Remaining',
    render: (val, row) => {
      const pct = row.total_length > 0 ? (val / row.total_length) * 100 : 0
      return (
        <div className="flex items-center gap-2">
          <span>{val} {row.unit}</span>
          <div className="h-1.5 w-16 rounded-full bg-gray-200">
            <div className={`h-1.5 rounded-full ${pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )
    },
  },
  { key: 'cost_per_unit', label: 'Cost/Unit', render: (val) => val != null ? `₹${val}` : '—' },
  {
    key: 'supplier',
    label: 'Supplier',
    render: (val) => val?.name || '—',
  },
  { key: 'supplier_invoice_no', label: 'Invoice No.', render: (val) => val || '—' },
  {
    key: 'supplier_invoice_date',
    label: 'Invoice Date',
    render: (val) => val ? new Date(val).toLocaleDateString() : '—',
  },
  {
    key: 'received_at',
    label: 'Received',
    render: (val) => val ? new Date(val).toLocaleDateString() : '—',
  },
]

const EMPTY_FORM = { fabric_type: '', color: '', total_length: '', unit: 'meters', cost_per_unit: '', supplier_id: '', supplier_invoice_no: '', supplier_invoice_date: '', notes: '' }

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
        total_length: parseFloat(form.total_length),
        unit: form.unit,
        cost_per_unit: form.cost_per_unit ? parseFloat(form.cost_per_unit) : null,
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
          <p className="mt-1 text-sm text-gray-500">Raw material stock — fabric rolls</p>
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
        <DataTable columns={COLUMNS} data={rolls} loading={loading} emptyText="No rolls found." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

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
