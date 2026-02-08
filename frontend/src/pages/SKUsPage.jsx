import { useState, useEffect, useCallback } from 'react'
import { getSKUs, createSKU, updateSKU } from '../api/skus'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'

const COLUMNS = [
  { key: 'sku_code', label: 'SKU Code' },
  { key: 'product_name', label: 'Product' },
  { key: 'color', label: 'Color' },
  { key: 'size', label: 'Size' },
  { key: 'base_price', label: 'Price', render: (val) => val != null ? `₹${val}` : '—' },
  {
    key: 'stock',
    label: 'Stock',
    render: (val) => {
      if (!val) return '—'
      return (
        <div className="text-xs">
          <span className="font-medium">{val.available_qty}</span>
          <span className="text-gray-400"> avail</span>
          {val.reserved_qty > 0 && (
            <span className="ml-1 text-yellow-600">({val.reserved_qty} rsv)</span>
          )}
        </div>
      )
    },
  },
  {
    key: 'is_active',
    label: 'Status',
    render: (val) => <StatusBadge status={val ? 'active' : 'inactive'} />,
  },
]

const EMPTY_FORM = { product_type: 'BLS', product_name: '', color: '', size: '', description: '', base_price: '' }

export default function SKUsPage() {
  const [skus, setSKUs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getSKUs({ page, page_size: 20, search: search || undefined })
      setSKUs(res.data.data)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load SKUs')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setForm({
      product_type: row.product_type,
      product_name: row.product_name,
      color: row.color,
      size: row.size,
      description: row.description || '',
      base_price: row.base_price ?? '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        ...form,
        base_price: form.base_price ? parseFloat(form.base_price) : null,
      }
      if (editing) {
        await updateSKU(editing.id, payload)
      } else {
        await createSKU(payload)
      }
      setModalOpen(false)
      fetchData()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to save SKU')
    } finally {
      setSaving(false)
    }
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">SKUs</h1>
          <p className="mt-1 text-sm text-gray-500">Product catalog — DesignNo-Color-Size</p>
        </div>
        <button onClick={openCreate} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
          + Add SKU
        </button>
      </div>

      <div className="mt-5 max-w-sm">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search SKUs..." />
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      <div className="mt-4">
        <DataTable columns={COLUMNS} data={skus} loading={loading} onRowClick={openEdit} emptyText="No SKUs found." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit SKU' : 'Create SKU'}
        actions={
          <>
            <button onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
          </>
        }
      >
        {formError && <div className="mb-4"><ErrorAlert message={formError} onDismiss={() => setFormError(null)} /></div>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
            <input type="text" value={form.product_name} onChange={(e) => set('product_name', e.target.value)} placeholder="e.g. Design 101 Red Medium"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Type</label>
              <select value={form.product_type} onChange={(e) => set('product_type', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                <option value="BLS">Blouse (BLS)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
              <input type="text" value={form.color} onChange={(e) => set('color', e.target.value)} placeholder="e.g. Red"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
              <select value={form.size} onChange={(e) => set('size', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                <option value="">Select</option>
                <option value="XS">XS</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
                <option value="XXL">XXL</option>
                <option value="Free">Free Size</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base Price (₹)</label>
            <input type="number" step="0.01" value={form.base_price} onChange={(e) => set('base_price', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
