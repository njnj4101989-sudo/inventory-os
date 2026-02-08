import { useState, useEffect, useCallback } from 'react'
import { getOrders, createOrder, shipOrder, cancelOrder } from '../api/orders'
import { getSKUs } from '../api/skus'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'
import SearchInput from '../components/common/SearchInput'
import OrderForm from '../components/forms/OrderForm'

const COLUMNS = [
  { key: 'order_number', label: 'Order #' },
  { key: 'customer_name', label: 'Customer' },
  {
    key: 'source',
    label: 'Source',
    render: (val) => (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        val === 'ecommerce' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
      }`}>
        {val}
      </span>
    ),
  },
  {
    key: 'items',
    label: 'Items',
    render: (val) => val?.length || 0,
  },
  {
    key: 'total_amount',
    label: 'Total',
    render: (val) => `₹${(val || 0).toLocaleString('en-IN')}`,
  },
  {
    key: 'status',
    label: 'Status',
    render: (val) => <StatusBadge status={val} />,
  },
  {
    key: 'created_at',
    label: 'Created',
    render: (val) => val ? new Date(val).toLocaleDateString() : '—',
  },
]

const STATUS_FILTERS = ['', 'pending', 'processing', 'shipped', 'cancelled']

export default function OrdersPage() {
  const [ordersList, setOrdersList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [skuList, setSkuList] = useState([])
  const [createForm, setCreateForm] = useState({
    customer_name: '', customer_phone: '', source: 'web',
    items: [{ sku_id: '', quantity: '', unit_price: '' }],
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  // Action modal
  const [actionOpen, setActionOpen] = useState(false)
  const [actionOrder, setActionOrder] = useState(null)
  const [actionType, setActionType] = useState(null)
  const [actioning, setActioning] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getOrders({
        page, page_size: 20,
        status: statusFilter || undefined,
        search: search || undefined,
      })
      setOrdersList(res.data.data)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, search])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    getSKUs({ is_active: true }).then((res) => setSkuList(res.data.data)).catch(() => {})
  }, [])

  const handleRowClick = (row) => {
    setActionOrder(row)
    setActionType(null)
    setActionOpen(true)
  }

  // Create order
  const handleCreate = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const items = createForm.items
        .filter((i) => i.sku_id && i.quantity)
        .map((i) => ({
          sku_id: i.sku_id,
          quantity: parseInt(i.quantity),
          unit_price: parseFloat(i.unit_price) || 0,
        }))
      if (!items.length) { setFormError('Add at least one item'); setSaving(false); return }
      await createOrder({
        customer_name: createForm.customer_name,
        customer_phone: createForm.customer_phone,
        source: createForm.source,
        items,
      })
      setCreateOpen(false)
      setCreateForm({
        customer_name: '', customer_phone: '', source: 'web',
        items: [{ sku_id: '', quantity: '', unit_price: '' }],
      })
      fetchData()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to create order')
    } finally {
      setSaving(false)
    }
  }

  // Ship / Cancel
  const handleAction = async (type) => {
    setActioning(true)
    try {
      if (type === 'ship') await shipOrder(actionOrder.id)
      if (type === 'cancel') await cancelOrder(actionOrder.id)
      setActionOpen(false)
      fetchData()
    } catch (err) {
      setError(err.response?.data?.detail || `Failed to ${type} order`)
    } finally {
      setActioning(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Orders</h1>
          <p className="mt-1 text-sm text-gray-500">Manage customer orders and fulfillment</p>
        </div>
        <button onClick={() => { setFormError(null); setCreateOpen(true) }} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
          + New Order
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="mt-5 flex items-center gap-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">
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
        <div className="ml-auto w-64">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search orders..." />
        </div>
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      <div className="mt-4">
        <DataTable columns={COLUMNS} data={ordersList} loading={loading} onRowClick={handleRowClick} emptyText="No orders found." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      {/* Create Order Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Order"
        wide
        actions={
          <>
            <button onClick={() => setCreateOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleCreate} disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Order'}
            </button>
          </>
        }
      >
        <OrderForm form={createForm} onChange={setCreateForm} skuList={skuList}
          error={formError} onDismissError={() => setFormError(null)} />
      </Modal>

      {/* Order Detail / Action Modal */}
      <Modal
        open={actionOpen}
        onClose={() => setActionOpen(false)}
        title={actionOrder ? `Order ${actionOrder.order_number}` : 'Order'}
        actions={
          actionOrder && (
            <>
              <button onClick={() => setActionOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Close</button>
              {(actionOrder.status === 'pending' || actionOrder.status === 'processing') && (
                <button onClick={() => handleAction('cancel')} disabled={actioning}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                  {actioning ? 'Processing...' : 'Cancel Order'}
                </button>
              )}
              {actionOrder.status === 'processing' && (
                <button onClick={() => handleAction('ship')} disabled={actioning}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                  {actioning ? 'Processing...' : 'Ship Order'}
                </button>
              )}
            </>
          )
        }
      >
        {actionOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Customer:</span> <span className="font-medium">{actionOrder.customer_name}</span></div>
              <div><span className="text-gray-500">Phone:</span> <span className="font-medium">{actionOrder.customer_phone}</span></div>
              <div><span className="text-gray-500">Source:</span> <span className="font-medium">{actionOrder.source}</span></div>
              <div><span className="text-gray-500">Status:</span> <StatusBadge status={actionOrder.status} /></div>
              {actionOrder.external_order_ref && (
                <div className="col-span-2"><span className="text-gray-500">External Ref:</span> <span className="font-medium">{actionOrder.external_order_ref}</span></div>
              )}
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Items</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2">SKU</th>
                    <th className="pb-2">Qty</th>
                    <th className="pb-2">Price</th>
                    <th className="pb-2">Total</th>
                    <th className="pb-2">Fulfilled</th>
                  </tr>
                </thead>
                <tbody>
                  {actionOrder.items?.map((item, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 font-medium">{item.sku?.sku_code}</td>
                      <td className="py-2">{item.quantity}</td>
                      <td className="py-2">₹{item.unit_price}</td>
                      <td className="py-2">₹{item.total_price?.toLocaleString('en-IN')}</td>
                      <td className="py-2">{item.fulfilled_qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t pt-3 text-right">
              <span className="text-lg font-bold text-gray-800">Total: ₹{actionOrder.total_amount?.toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
