import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import { getInvoices, getInvoice, markPaid } from '../api/invoices'
import { colorHex, loadColorMap } from '../utils/colorUtils'
import DataTable from '../components/common/DataTable'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'
import SearchInput from '../components/common/SearchInput'

/* ── Module-level helpers ── */

const VA_COLORS = {
  EMB: { bg: 'bg-purple-100', text: 'text-purple-700' },
  DYE: { bg: 'bg-amber-100', text: 'text-amber-700' },
  DPT: { bg: 'bg-sky-100', text: 'text-sky-700' },
  HWK: { bg: 'bg-rose-100', text: 'text-rose-700' },
  SQN: { bg: 'bg-pink-100', text: 'text-pink-700' },
  BTC: { bg: 'bg-teal-100', text: 'text-teal-700' },
  HST: { bg: 'bg-orange-100', text: 'text-orange-700' },
  BTN: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  LCW: { bg: 'bg-lime-100', text: 'text-lime-700' },
  FIN: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
}
const DEFAULT_VA = { bg: 'bg-gray-100', text: 'text-gray-700' }

function parseSKU(code) {
  if (!code) return { base: '', vas: [] }
  const plusIdx = code.indexOf('+')
  const basePart = plusIdx > -1 ? code.slice(0, plusIdx) : code
  const vas = plusIdx > -1 ? code.slice(plusIdx + 1).split('+').filter(Boolean) : []
  return { base: basePart, vas }
}

function SKUCodeDisplay({ code }) {
  const { base, vas } = parseSKU(code)
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className="font-semibold text-gray-800">{base}</span>
      {vas.map(va => {
        const c = VA_COLORS[va] || DEFAULT_VA
        return <span key={va} className={`rounded px-1 py-0.5 text-[10px] font-bold leading-none ${c.bg} ${c.text}`}>+{va}</span>
      })}
    </span>
  )
}

const KPI_COLORS = {
  slate: 'from-slate-500 to-slate-600',
  amber: 'from-amber-500 to-amber-600',
  green: 'from-green-500 to-green-600',
  emerald: 'from-emerald-500 to-emerald-600',
}

function KPICard({ label, value, sub, color = 'slate' }) {
  return (
    <div className={`rounded-lg bg-gradient-to-br ${KPI_COLORS[color] || KPI_COLORS.slate} p-2.5 text-white shadow-sm`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/85">{label}</p>
      <p className="mt-0.5 text-xl font-bold leading-tight">{value}</p>
      {sub && <p className="text-[11px] font-medium text-white/75">{sub}</p>}
    </div>
  )
}

/* ── DataTable columns ── */

const COLUMNS = [
  { key: 'invoice_number', label: 'Invoice #', render: (val) => <span className="font-semibold text-primary-700">{val}</span> },
  { key: 'order', label: 'Order #', render: (val) => val?.order_number || '—' },
  { key: 'order', label: 'Customer', render: (val, row) => row.order?.customer_name || val?.customer_name || <span className="text-gray-400">—</span> },
  {
    key: 'subtotal', label: 'Subtotal',
    render: (val) => `₹${(val || 0).toLocaleString('en-IN')}`,
  },
  {
    key: 'tax_amount', label: 'Tax',
    render: (val) => <span className="text-gray-500">₹{(val || 0).toLocaleString('en-IN')}</span>,
  },
  {
    key: 'total_amount', label: 'Total',
    render: (val) => <span className="font-bold">₹{(val || 0).toLocaleString('en-IN')}</span>,
  },
  { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
  {
    key: 'issued_at', label: 'Issued',
    render: (val) => val ? new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
  },
]

const TABS = [
  { key: '', label: 'All' },
  { key: 'issued', label: 'Unpaid' },
  { key: 'paid', label: 'Paid' },
]

export default function InvoicesPage() {
  const [invoicesList, setInvoicesList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Detail overlay
  const [detailInvoice, setDetailInvoice] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actioning, setActioning] = useState(false)

  // Print overlay
  const [printInvoice, setPrintInvoice] = useState(null)
  const printRef = useRef(null)

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: printInvoice ? `Invoice-${printInvoice.invoice_number}` : 'Invoice',
    pageStyle: `
      @page { size: A4 portrait; margin: 15mm; }
      * { box-sizing: border-box; }
    `,
  })

  useEffect(() => { loadColorMap() }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getInvoices({
        page, page_size: 20,
        status: statusFilter || undefined,
        search: search || undefined,
      })
      setInvoicesList(res.data.data)
      setTotal(res.data.total)
      setPages(res.data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, search])

  useEffect(() => { fetchData() }, [fetchData])

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const all = invoicesList
    const unpaid = all.filter(i => i.status === 'issued')
    const paid = all.filter(i => i.status === 'paid')
    const unpaidAmt = unpaid.reduce((s, i) => s + (i.total_amount || 0), 0)
    const paidAmt = paid.reduce((s, i) => s + (i.total_amount || 0), 0)
    const revenue = all.reduce((s, i) => s + (i.total_amount || 0), 0)
    return { total: all.length, unpaidCount: unpaid.length, unpaidAmt, paidCount: paid.length, paidAmt, revenue }
  }, [invoicesList])

  /* ── Row click → detail overlay ── */
  const handleRowClick = async (row) => {
    setDetailLoading(true)
    setDetailInvoice(row)
    try {
      const res = await getInvoice(row.id)
      setDetailInvoice(res.data.data || res.data)
    } catch {
      // fallback to list data
    } finally {
      setDetailLoading(false)
    }
  }

  /* ── Mark paid ── */
  const handleMarkPaid = async () => {
    setActioning(true)
    try {
      await markPaid(detailInvoice.id)
      setDetailInvoice(null)
      fetchData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to mark invoice as paid')
    } finally {
      setActioning(false)
    }
  }

  /* ── Open print overlay — close detail first (both z-50) ── */
  const openPrint = () => {
    const inv = detailInvoice
    setDetailInvoice(null)
    setPrintInvoice(inv)
  }

  /* ═══════════════════════ PRINT OVERLAY ═══════════════════════ */
  if (printInvoice) {
    const inv = printInvoice
    const o = inv.order || {}
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center overflow-auto">
        {/* Toolbar */}
        <div className="w-full max-w-[220mm] mt-4 mb-3 flex items-center justify-between bg-white rounded-xl px-5 py-3 shadow-lg">
          <span className="font-semibold text-gray-800">Invoice {inv.invoice_number}</span>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700 transition-colors">
              Print
            </button>
            <button onClick={() => setPrintInvoice(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Close
            </button>
          </div>
        </div>

        {/* A4 printable div — ALL inline styles */}
        <div ref={printRef} style={{
          width: '210mm', minHeight: '297mm', background: '#fff', padding: '15mm',
          fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", color: '#1f2937',
          fontSize: '12px', lineHeight: '1.5',
        }}>
          {/* Header */}
          <div style={{ borderBottom: '3px solid #1e40af', paddingBottom: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#1e40af', margin: 0, letterSpacing: '-0.5px' }}>TAX INVOICE</h1>
              <p style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '4px 0 0' }}>DRS Blouse</p>
              <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>GSTIN: ______________</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '13px', fontWeight: 600 }}>{inv.invoice_number}</p>
              <p style={{ fontSize: '11px', color: '#6b7280' }}>Date: {inv.issued_at ? new Date(inv.issued_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
              <p style={{ fontSize: '11px', color: '#6b7280' }}>Order: {o.order_number || '—'}</p>
            </div>
          </div>

          {/* Bill To */}
          <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
            <div style={{ flex: 1, background: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>Bill To</p>
              <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{o.customer?.name || o.customer_name || '—'}</p>
              {(o.customer?.phone || o.customer_phone) && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>Phone: {o.customer?.phone || o.customer_phone}</p>}
              {(o.customer_address || o.customer?.city) && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>{o.customer_address || o.customer?.city}</p>}
              {o.customer?.gst_no && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>GST: {o.customer.gst_no}</p>}
            </div>
            <div style={{ flex: 1, background: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>Payment Status</p>
              <p style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                background: inv.status === 'paid' ? '#dcfce7' : '#fef3c7',
                color: inv.status === 'paid' ? '#166534' : '#92400e',
              }}>
                {inv.status === 'paid' ? 'PAID' : 'PENDING'}
              </p>
              {inv.paid_at && <p style={{ fontSize: '11px', color: '#166534', margin: '4px 0 0' }}>Paid on: {new Date(inv.paid_at).toLocaleDateString('en-IN')}</p>}
            </div>
          </div>

          {/* Line items table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>#</th>
                <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>SKU Code</th>
                <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Description</th>
                <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Qty</th>
                <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Rate</th>
                <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.items?.map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 6px', color: '#9ca3af' }}>{i + 1}</td>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>{item.sku?.sku_code || '—'}</td>
                  <td style={{ padding: '8px 6px', color: '#6b7280' }}>{item.sku?.product_name || '—'}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{item.quantity}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>₹{(item.unit_price || 0).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>₹{(item.total_price || 0).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Tax breakdown */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: '260px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                <span style={{ color: '#6b7280' }}>Subtotal</span>
                <span style={{ fontWeight: 600 }}>₹{(inv.subtotal || 0).toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                <span style={{ color: '#6b7280' }}>CGST (9%)</span>
                <span>₹{(((inv.tax_amount || 0) / 2).toFixed(2)).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                <span style={{ color: '#6b7280' }}>SGST (9%)</span>
                <span>₹{(((inv.tax_amount || 0) / 2).toFixed(2)).toLocaleString()}</span>
              </div>
              {(inv.discount_amount || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                  <span style={{ color: '#16a34a' }}>Discount</span>
                  <span style={{ color: '#16a34a' }}>-₹{(inv.discount_amount || 0).toLocaleString('en-IN')}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', marginTop: '4px', borderTop: '2px solid #1e40af', fontSize: '16px', fontWeight: 800 }}>
                <span>Grand Total</span>
                <span>₹{(inv.total_amount || 0).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Thank you for your business!</p>
              <p style={{ fontSize: '10px', color: '#9ca3af', margin: '2px 0 0' }}>This is a computer-generated invoice.</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '150px', borderBottom: '1px solid #d1d5db', marginBottom: '4px' }}>&nbsp;</div>
              <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>Authorized Signatory</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ═══════════════════════ DETAIL OVERLAY ═══════════════════════ */
  if (detailInvoice) {
    const inv = detailInvoice
    const o = inv.order || {}
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-700 to-blue-700 px-4 py-2.5 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold leading-tight">{inv.invoice_number}</h1>
            <p className="text-xs opacity-80">Order {o.order_number || '—'} &middot; <StatusBadge status={inv.status} /></p>
          </div>
          <div className="flex gap-2">
            <button onClick={openPrint} className="rounded bg-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/30 transition-colors">
              Print Invoice
            </button>
            <button onClick={() => setDetailInvoice(null)} className="rounded bg-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/30 transition-colors">Close</button>
          </div>
        </div>

        {detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <div className="flex-1 p-4 max-w-5xl mx-auto w-full space-y-3">
            {/* Info cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded p-2">
                <p className="text-[11px] uppercase text-gray-500 font-semibold mb-1">Bill To</p>
                <p className="text-sm font-bold text-gray-800">{o.customer?.name || o.customer_name || '—'}</p>
                {(o.customer?.phone || o.customer_phone) && <p className="text-xs text-gray-600 mt-0.5">Phone: {o.customer?.phone || o.customer_phone}</p>}
                {(o.customer_address || o.customer?.city) && <p className="text-xs text-gray-600 mt-0.5">{o.customer_address || o.customer?.city}</p>}
                {o.customer?.gst_no && <p className="text-xs text-gray-600 mt-0.5">GST: {o.customer.gst_no}</p>}
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="text-[11px] uppercase text-gray-500 font-semibold mb-1">Invoice Info</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-gray-500">Issued:</span> <span className="font-medium">{inv.issued_at ? new Date(inv.issued_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span></div>
                  <div><span className="text-gray-500">Status:</span> <StatusBadge status={inv.status} /></div>
                  {inv.paid_at && (
                    <div className="col-span-2"><span className="text-gray-500">Paid:</span> <span className="font-medium text-green-600">{new Date(inv.paid_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div>
                  )}
                </div>
              </div>
            </div>

            {inv.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                <span className="font-semibold">Notes:</span> {inv.notes}
              </div>
            )}

            {/* Line items */}
            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr className="text-left text-gray-600 text-[11px] font-semibold uppercase">
                    <th className="px-2 py-1.5">#</th>
                    <th className="px-2 py-1.5">SKU</th>
                    <th className="px-2 py-1.5">Color</th>
                    <th className="px-2 py-1.5">Size</th>
                    <th className="px-2 py-1.5 text-right">Qty</th>
                    <th className="px-2 py-1.5 text-right">Rate</th>
                    <th className="px-2 py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {inv.items?.map((item, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                      <td className="px-2 py-1.5"><SKUCodeDisplay code={item.sku?.sku_code} /></td>
                      <td className="px-2 py-1.5">
                        {item.sku?.color ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-full border border-gray-200" style={{ backgroundColor: colorHex(item.sku.color) }} />
                            <span>{item.sku.color}</span>
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-1.5 font-semibold">{item.sku?.size || '—'}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{item.quantity}</td>
                      <td className="px-2 py-1.5 text-right">₹{(item.unit_price || 0).toLocaleString('en-IN')}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">₹{(item.total_price || 0).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Amount summary */}
            <div className="flex justify-end">
              <div className="w-64 space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium">₹{(inv.subtotal || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">CGST (9%)</span>
                  <span>₹{(((inv.tax_amount || 0) / 2).toFixed(2))}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">SGST (9%)</span>
                  <span>₹{(((inv.tax_amount || 0) / 2).toFixed(2))}</span>
                </div>
                {(inv.discount_amount || 0) > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-green-600">Discount</span>
                    <span className="text-green-600">-₹{(inv.discount_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t-2 border-blue-600 text-lg font-bold">
                  <span>Grand Total</span>
                  <span>₹{(inv.total_amount || 0).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            {inv.status === 'issued' && (
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button onClick={handleMarkPaid} disabled={actioning}
                  className="rounded bg-green-600 text-white px-4 py-1.5 text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {actioning ? 'Processing...' : 'Mark as Paid'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  /* ═══════════════════════ LIST VIEW ═══════════════════════ */
  return (
    <div>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Invoices</h1>
        <p className="mt-1 text-sm text-gray-500">Track billing and payment status</p>
      </div>

      {/* KPI strip */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
        <KPICard label="Total Invoices" value={kpis.total} color="slate" />
        <KPICard label="Unpaid" value={kpis.unpaidCount} sub={`₹${kpis.unpaidAmt.toLocaleString('en-IN')}`} color="amber" />
        <KPICard label="Paid" value={kpis.paidCount} sub={`₹${kpis.paidAmt.toLocaleString('en-IN')}`} color="green" />
        <KPICard label="Revenue" value={`₹${kpis.revenue.toLocaleString('en-IN')}`} color="emerald" />
      </div>

      {/* Tab pills + search */}
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setStatusFilter(t.key); setPage(1) }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === t.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto w-64">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search invoices..." />
        </div>
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      <div className="mt-4">
        <DataTable columns={COLUMNS} data={invoicesList} loading={loading} onRowClick={handleRowClick} emptyText="No invoices found." />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>
    </div>
  )
}
