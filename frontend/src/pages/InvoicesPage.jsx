import { useState, useEffect, useCallback } from 'react'
import { getInvoices, markPaid, downloadPDF } from '../api/invoices'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'

const COLUMNS = [
  { key: 'invoice_number', label: 'Invoice #' },
  {
    key: 'order',
    label: 'Order',
    render: (val) => val?.order_number || '—',
  },
  {
    key: 'order',
    label: 'Customer',
    render: (val) => val?.customer_name || '—',
  },
  {
    key: 'subtotal',
    label: 'Subtotal',
    render: (val) => `₹${(val || 0).toLocaleString('en-IN')}`,
  },
  {
    key: 'tax_amount',
    label: 'Tax',
    render: (val) => `₹${(val || 0).toLocaleString('en-IN')}`,
  },
  {
    key: 'total_amount',
    label: 'Total',
    render: (val) => <span className="font-semibold">₹{(val || 0).toLocaleString('en-IN')}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    render: (val) => <StatusBadge status={val} />,
  },
  {
    key: 'issued_at',
    label: 'Issued',
    render: (val) => val ? new Date(val).toLocaleDateString() : '—',
  },
]

const STATUS_FILTERS = ['', 'issued', 'paid']

export default function InvoicesPage() {
  const [invoicesList, setInvoicesList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailInvoice, setDetailInvoice] = useState(null)
  const [actioning, setActioning] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getInvoices({ page, page_size: 20, status: statusFilter || undefined })
      setInvoicesList(res.data.data)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const handleRowClick = (row) => {
    setDetailInvoice(row)
    setDetailOpen(true)
  }

  const handleMarkPaid = async () => {
    setActioning(true)
    try {
      await markPaid(detailInvoice.id)
      setDetailOpen(false)
      fetchData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to mark invoice as paid')
    } finally {
      setActioning(false)
    }
  }

  const handleDownloadPDF = async () => {
    try {
      await downloadPDF(detailInvoice.id)
    } catch {
      setError('PDF download not available in mock mode')
    }
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Invoices</h1>
        <p className="mt-1 text-sm text-gray-500">Track billing and payment status</p>
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
        <DataTable columns={COLUMNS} data={invoicesList} loading={loading} onRowClick={handleRowClick} emptyText="No invoices found." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      {/* Invoice Detail Modal */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detailInvoice ? `Invoice ${detailInvoice.invoice_number}` : 'Invoice'}
        wide
        actions={
          detailInvoice && (
            <>
              <button onClick={() => setDetailOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Close</button>
              <button onClick={handleDownloadPDF} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                Download PDF
              </button>
              {detailInvoice.status === 'issued' && (
                <button onClick={handleMarkPaid} disabled={actioning}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                  {actioning ? 'Processing...' : 'Mark as Paid'}
                </button>
              )}
            </>
          )
        }
      >
        {detailInvoice && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Order:</span> <span className="font-medium">{detailInvoice.order?.order_number}</span></div>
              <div><span className="text-gray-500">Customer:</span> <span className="font-medium">{detailInvoice.order?.customer_name}</span></div>
              <div><span className="text-gray-500">Status:</span> <StatusBadge status={detailInvoice.status} /></div>
              <div><span className="text-gray-500">Issued:</span> <span className="font-medium">{new Date(detailInvoice.issued_at).toLocaleString()}</span></div>
              {detailInvoice.paid_at && (
                <div><span className="text-gray-500">Paid:</span> <span className="font-medium text-green-600">{new Date(detailInvoice.paid_at).toLocaleString()}</span></div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Line Items</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2">SKU</th>
                    <th className="pb-2">Product</th>
                    <th className="pb-2">Qty</th>
                    <th className="pb-2">Price</th>
                    <th className="pb-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detailInvoice.items?.map((item, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 font-medium">{item.sku?.sku_code}</td>
                      <td className="py-2 text-gray-600">{item.sku?.product_name}</td>
                      <td className="py-2">{item.quantity}</td>
                      <td className="py-2">₹{item.unit_price}</td>
                      <td className="py-2">₹{item.total_price?.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t pt-3 space-y-1 text-sm text-right">
              <div><span className="text-gray-500">Subtotal:</span> <span className="font-medium">₹{detailInvoice.subtotal?.toLocaleString('en-IN')}</span></div>
              <div><span className="text-gray-500">Tax:</span> <span className="font-medium">₹{detailInvoice.tax_amount?.toLocaleString('en-IN')}</span></div>
              {detailInvoice.discount_amount > 0 && (
                <div><span className="text-gray-500">Discount:</span> <span className="font-medium text-green-600">-₹{detailInvoice.discount_amount?.toLocaleString('en-IN')}</span></div>
              )}
              <div className="text-lg"><span className="text-gray-500">Total:</span> <span className="font-bold text-gray-800">₹{detailInvoice.total_amount?.toLocaleString('en-IN')}</span></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
