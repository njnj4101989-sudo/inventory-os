import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'

/**
 * Order Confirmation / Order Sheet — A4 print document.
 * Full-screen overlay with print button, follows JobChallan pattern.
 */
export default function OrderPrint({ order, companyName, company, onClose }) {
  const printRef = useRef(null)

  const o = order || {}
  const items = o.items || []
  const totalQty = items.reduce((s, it) => s + (it.quantity || 0), 0)

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Order-${o.order_number || 'Sheet'}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 15mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tr { page-break-inside: avoid; }
      .op-totals { page-break-inside: avoid; }
      .op-signatures { page-break-inside: avoid; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
    `,
  })

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-start overflow-y-auto py-6">
      {/* Toolbar */}
      <div className="w-full max-w-[220mm] mb-3 flex items-center justify-between bg-white rounded-xl px-5 py-3 shadow-lg mx-4">
        <span className="font-semibold text-gray-800">Order {o.order_number}</span>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 transition-colors">
            Print
          </button>
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Close
          </button>
        </div>
      </div>

      {/* A4 printable */}
      <div ref={printRef} style={{
        width: '210mm', background: '#fff', padding: '15mm',
        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", color: '#1f2937',
        fontSize: '12px', lineHeight: '1.5',
      }} className="shadow-2xl rounded-lg mb-6">
        {/* Header */}
        <div style={{ borderBottom: '3px solid #1e40af', paddingBottom: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#1e40af', margin: 0, letterSpacing: '-0.5px' }}>ORDER CONFIRMATION</h1>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '4px 0 0' }}>{companyName || company?.name || 'Company'}</p>
            {company?.address && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>{company.address}{company.city ? `, ${company.city}` : ''}</p>}
            {!company?.address && company?.city && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>{company.city}</p>}
            {company?.gst_no && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>GSTIN: {company.gst_no}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '14px', fontWeight: 700 }}>{o.order_number}</p>
            <p style={{ fontSize: '11px', color: '#6b7280' }}>Date: {o.order_date ? fmtDate(o.order_date + 'T00:00:00') : fmtDate(o.created_at)}</p>
            <p style={{
              display: 'inline-block', padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, marginTop: '4px',
              background: o.status === 'shipped' ? '#dcfce7' : o.status === 'cancelled' ? '#fee2e2' : '#fef3c7',
              color: o.status === 'shipped' ? '#166534' : o.status === 'cancelled' ? '#991b1b' : '#92400e',
            }}>
              {(o.status || 'pending').toUpperCase()}
            </p>
          </div>
        </div>

        {/* Customer + Order info */}
        <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
          <div style={{ flex: 1, background: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>Customer</p>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{o.customer?.name || o.customer_name || 'Walk-in'}</p>
            {(o.customer?.phone || o.customer_phone) && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>Phone: {o.customer?.phone || o.customer_phone}</p>}
            {(o.customer_address || o.customer?.city) && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>{o.customer_address || o.customer?.city}</p>}
            {o.customer?.gst_no && <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>GST: {o.customer.gst_no}</p>}
          </div>
          <div style={{ flex: 1, background: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>Order Details</p>
            <p style={{ fontSize: '11px', margin: '2px 0' }}><span style={{ fontWeight: 600 }}>Source:</span> {o.source || '—'}</p>
            {o.external_order_ref && <p style={{ fontSize: '11px', margin: '2px 0' }}><span style={{ fontWeight: 600 }}>Ext. Ref:</span> {o.external_order_ref}</p>}
            {o.broker_name && <p style={{ fontSize: '11px', margin: '2px 0' }}><span style={{ fontWeight: 600 }}>Broker:</span> {o.broker_name}</p>}
            {o.transport && <p style={{ fontSize: '11px', margin: '2px 0' }}><span style={{ fontWeight: 600 }}>Transport:</span> {o.transport}</p>}
            <p style={{ fontSize: '11px', margin: '2px 0' }}><span style={{ fontWeight: 600 }}>Items:</span> {items.length} line items · {totalQty} pcs</p>
          </div>
        </div>

        {o.notes && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '8px 12px', marginBottom: '16px', fontSize: '11px', color: '#92400e' }}>
            <span style={{ fontWeight: 700 }}>Notes:</span> {o.notes}
          </div>
        )}

        {/* Items table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>#</th>
              <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>SKU Code</th>
              <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Description</th>
              <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Size</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Qty</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Rate</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', pageBreakInside: 'avoid' }}>
                <td style={{ padding: '8px 6px', color: '#9ca3af' }}>{i + 1}</td>
                <td style={{ padding: '8px 6px', fontWeight: 600 }}>{item.sku?.sku_code || '—'}</td>
                <td style={{ padding: '8px 6px', color: '#6b7280' }}>{item.sku?.product_name || '—'}</td>
                <td style={{ padding: '8px 6px' }}>{item.sku?.size || '—'}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{item.quantity}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>{'\u20B9'}{(item.unit_price || 0).toLocaleString('en-IN')}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{'\u20B9'}{(item.total_price || 0).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="op-totals" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '260px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
              <span style={{ color: '#6b7280' }}>Total Qty</span>
              <span style={{ fontWeight: 600 }}>{totalQty} pcs</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
              <span style={{ color: '#6b7280' }}>Subtotal</span>
              <span style={{ fontWeight: 600 }}>{'\u20B9'}{(o.total_amount || 0).toLocaleString('en-IN')}</span>
            </div>
            {(o.gst_percent || 0) > 0 && <>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                <span style={{ color: '#6b7280' }}>CGST ({(o.gst_percent || 0) / 2}%)</span>
                <span>{'\u20B9'}{((o.total_amount || 0) * (o.gst_percent || 0) / 200).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                <span style={{ color: '#6b7280' }}>SGST ({(o.gst_percent || 0) / 2}%)</span>
                <span>{'\u20B9'}{((o.total_amount || 0) * (o.gst_percent || 0) / 200).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </>}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '14px', borderTop: '2px solid #1f2937', marginTop: '4px' }}>
              <span style={{ fontWeight: 800 }}>Grand Total</span>
              <span style={{ fontWeight: 800 }}>{'\u20B9'}{((o.total_amount || 0) * (1 + (o.gst_percent || 0) / 100)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Signature area */}
        <div className="op-signatures" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '60px', paddingTop: '0' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #9ca3af', width: '160px', paddingTop: '6px' }}>
              <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>Customer Signature</p>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #9ca3af', width: '160px', paddingTop: '6px' }}>
              <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>Authorized Signature</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
