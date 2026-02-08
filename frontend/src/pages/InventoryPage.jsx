import { useState, useEffect, useCallback } from 'react'
import { getInventory, getEvents, adjust, reconcile } from '../api/inventory'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'
import SearchInput from '../components/common/SearchInput'

const COLUMNS = [
  {
    key: 'sku',
    label: 'SKU Code',
    render: (val) => <span className="font-medium">{val?.sku_code}</span>,
  },
  {
    key: 'sku',
    label: 'Product',
    render: (val) => val?.product_name || '—',
  },
  {
    key: 'total_qty',
    label: 'Total',
    render: (val) => <span className="font-semibold">{val}</span>,
  },
  {
    key: 'available_qty',
    label: 'Available',
    render: (val) => <span className="text-green-600 font-medium">{val}</span>,
  },
  {
    key: 'reserved_qty',
    label: 'Reserved',
    render: (val) => val > 0 ? <span className="text-amber-600 font-medium">{val}</span> : '0',
  },
  {
    key: 'last_updated',
    label: 'Last Updated',
    render: (val) => val ? new Date(val).toLocaleDateString() : '—',
  },
]

const EVENT_COLUMNS = [
  { key: 'event_type', label: 'Type', render: (val) => <StatusBadge status={val} /> },
  { key: 'item_type', label: 'Item Type' },
  { key: 'quantity', label: 'Qty', render: (val) => <span className="font-medium">{val}</span> },
  {
    key: 'performed_by',
    label: 'By',
    render: (val) => val?.full_name || '—',
  },
  {
    key: 'performed_at',
    label: 'When',
    render: (val) => val ? new Date(val).toLocaleString() : '—',
  },
]

export default function InventoryPage() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [lowStock, setLowStock] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Events modal
  const [eventsOpen, setEventsOpen] = useState(false)
  const [selectedSku, setSelectedSku] = useState(null)
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)

  // Adjust modal
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustForm, setAdjustForm] = useState({ sku_id: '', event_type: 'ADJUSTMENT', quantity: '', reason: '' })
  const [adjusting, setAdjusting] = useState(false)
  const [adjustError, setAdjustError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getInventory({
        page, page_size: 20,
        sku_code: search || undefined,
        low_stock: lowStock || undefined,
      })
      setItems(res.data.data)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }, [page, search, lowStock])

  useEffect(() => { fetchData() }, [fetchData])

  const handleRowClick = async (row) => {
    setSelectedSku(row.sku)
    setEventsOpen(true)
    setEventsLoading(true)
    try {
      const res = await getEvents(row.sku.id)
      setEvents(res.data.data)
    } catch {
      setEvents([])
    } finally {
      setEventsLoading(false)
    }
  }

  const handleAdjust = async () => {
    setAdjusting(true)
    setAdjustError(null)
    try {
      const res = await adjust({
        sku_id: adjustForm.sku_id || items[0]?.sku?.id,
        event_type: adjustForm.event_type,
        quantity: parseInt(adjustForm.quantity),
        reason: adjustForm.reason,
      })
      setAdjustOpen(false)
      setAdjustForm({ sku_id: '', event_type: 'ADJUSTMENT', quantity: '', reason: '' })
      setSuccessMsg(res.data.message)
      fetchData()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setAdjustError(err.response?.data?.detail || 'Adjustment failed')
    } finally {
      setAdjusting(false)
    }
  }

  const handleReconcile = async () => {
    try {
      const res = await reconcile()
      setSuccessMsg(res.data.message)
      fetchData()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Reconciliation failed')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Inventory</h1>
          <p className="mt-1 text-sm text-gray-500">Real-time stock levels by SKU</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReconcile} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Reconcile
          </button>
          <button onClick={() => { setAdjustError(null); setAdjustOpen(true) }} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
            + Adjust Stock
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-5 flex items-center gap-4 flex-wrap">
        <button
          onClick={() => { setLowStock(!lowStock); setPage(1) }}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            lowStock ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Low Stock
        </button>
        <div className="ml-auto w-64">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Filter by SKU code..." />
        </div>
      </div>

      {successMsg && (
        <div className="mt-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {successMsg}
        </div>
      )}
      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      <div className="mt-4">
        <DataTable columns={COLUMNS} data={items} loading={loading} onRowClick={handleRowClick} emptyText="No inventory data found." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      {/* Events Modal */}
      <Modal
        open={eventsOpen}
        onClose={() => setEventsOpen(false)}
        title={selectedSku ? `Events — ${selectedSku.sku_code}` : 'Inventory Events'}
        wide
        actions={
          <button onClick={() => setEventsOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Close</button>
        }
      >
        {eventsLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No events recorded for this SKU.</p>
        ) : (
          <DataTable columns={EVENT_COLUMNS} data={events} emptyText="No events." />
        )}
      </Modal>

      {/* Adjust Modal */}
      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Adjust Stock"
        actions={
          <>
            <button onClick={() => setAdjustOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleAdjust} disabled={adjusting} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {adjusting ? 'Adjusting...' : 'Apply Adjustment'}
            </button>
          </>
        }
      >
        {adjustError && <div className="mb-4"><ErrorAlert message={adjustError} onDismiss={() => setAdjustError(null)} /></div>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
            <select value={adjustForm.sku_id} onChange={(e) => setAdjustForm((f) => ({ ...f, sku_id: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
              <option value="">Select SKU</option>
              {items.map((inv) => (
                <option key={inv.sku.id} value={inv.sku.id}>{inv.sku.sku_code} — {inv.sku.product_name} (avail: {inv.available_qty})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
            <select value={adjustForm.event_type} onChange={(e) => setAdjustForm((f) => ({ ...f, event_type: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
              <option value="ADJUSTMENT">Adjustment</option>
              <option value="LOSS">Loss</option>
              <option value="RETURN">Return</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
            <input type="number" value={adjustForm.quantity} onChange={(e) => setAdjustForm((f) => ({ ...f, quantity: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="Number of pieces" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <textarea value={adjustForm.reason} onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))} rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="Reason for adjustment" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
