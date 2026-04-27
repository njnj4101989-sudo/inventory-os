import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtCurrency = (v) => `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtInt = (v) => (v || 0).toLocaleString('en-IN')

const CONDITION_STYLE = {
  good:     { bg: '#dcfce7', fg: '#166534', letter: 'G' },
  damaged:  { bg: '#fee2e2', fg: '#dc2626', letter: 'D' },
  rejected: { bg: '#fce7f3', fg: '#be185d', letter: 'R' },
  pending:  { bg: '#f3f4f6', fg: '#6b7280', letter: '·' },
}

/**
 * SalesReturnPrint — warehouse/QC operational document.
 *
 * Focus: full SKU list for goods verification, receive/inspect/restock
 * timeline, 3-way signature block. Differs from CreditNotePrint (which
 * is the half-page GST finance summary).
 *
 * Layout: full A4. Summary bar at top, tight table, totals block, footer
 * with three signatures (Received By · Inspected By · Authorized).
 */
export default function SalesReturnPrint({ salesReturn, company, onClose }) {
  const printRef = useRef(null)
  const sr = salesReturn || {}
  const co = company || {}

  const items = sr.items || []
  const totalRet = items.reduce((s, i) => s + (Number(i.quantity_returned) || 0), 0)
  const totalRest = items.reduce((s, i) => s + (Number(i.quantity_restocked) || 0), 0)
  const totalDmg = items.reduce((s, i) => s + (Number(i.quantity_damaged) || 0), 0)

  const subtotal = Number(sr.subtotal) || 0
  const discount = Number(sr.discount_amount) || 0
  const additional = Number(sr.additional_amount) || 0
  const taxAmt = Number(sr.tax_amount) || 0
  const total = Number(sr.total_amount) || 0
  const gstPct = Number(sr.gst_percent) || 0

  const statusStyle = sr.status === 'closed'
    ? { bg: '#dcfce7', fg: '#166534' }
    : sr.status === 'cancelled'
    ? { bg: '#fee2e2', fg: '#991b1b' }
    : { bg: '#fef3c7', fg: '#92400e' }

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `SalesReturn-${sr.srn_no}`,
    // CSS paged-media: page counter in bottom-center of EVERY page.
    // The 'continued' hint + full TOTALS are positioned in the DOM so they
    // only render ONCE at the real end of the table, not repeated per page.
    pageStyle: `
      @page { size: A4 portrait; margin: 10mm 10mm 15mm 10mm; }
      @page { @bottom-center { content: "Page " counter(page) " of " counter(pages); font-family: 'Inter', Arial, sans-serif; font-size: 9pt; color: #9ca3af; } }
      * { box-sizing: border-box; }
      body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      .sr-continued { display: none; }
      @media print { .sr-continued { display: block; } }
    `,
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center overflow-auto">
      {/* Toolbar */}
      <div className="w-full max-w-[220mm] mt-4 mb-3 flex items-center justify-between bg-white rounded-xl px-5 py-3 shadow-lg">
        <div>
          <span className="font-semibold text-gray-800">Sales Return {sr.srn_no}</span>
          <span className="ml-2 typo-caption">· warehouse / QC operations copy</span>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="rounded-lg bg-emerald-600 text-white px-4 py-2 typo-btn-sm hover:bg-emerald-700 transition-colors">Print</button>
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">Close</button>
        </div>
      </div>

      {/* A4 Document — full page for the SKU table.
          No outer padding; @page's 10mm is the physical print margin.
          Content sits directly inside that margin — no stacking. */}
      <div ref={printRef} style={{ width: '210mm', minHeight: '297mm', background: '#fff', padding: 0, fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", color: '#1f2937', fontSize: '12px', lineHeight: '1.45' }}>

      {/* Inner content wrapper — small 4mm inner padding for on-screen breathing.
          In print, @page margin is the real buffer; this 4mm is visual comfort
          so content doesn't press against the modal backdrop edges on-screen. */}
      <div style={{ padding: '4mm' }}>

        {/* Header strip — compact, emerald border */}
        <div style={{ borderBottom: '3px solid #059669', paddingBottom: '6px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#059669', margin: 0, letterSpacing: '-0.5px', lineHeight: 1 }}>SALES RETURN</h1>
            <p style={{ fontSize: '10px', color: '#6b7280', margin: '3px 0 0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Warehouse / QC Operations Copy</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '20px', fontWeight: 800, margin: 0, lineHeight: 1 }}>{sr.srn_no}</p>
            <p style={{ fontSize: '11px', color: '#6b7280', margin: '3px 0 0' }}>Date: {fmtDate(sr.return_date || sr.created_at)}</p>
            <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 10px', borderRadius: '12px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px', background: statusStyle.bg, color: statusStyle.fg }}>
              {(sr.status || 'draft').toUpperCase()}
            </span>
          </div>
        </div>

        {/* Top grid — Supplier + Customer + Return details + Timeline (4 columns) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          <div style={{ background: '#f9fafb', borderRadius: '4px', padding: '7px 10px' }}>
            <p style={{ fontSize: '9px', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' }}>Supplier</p>
            <p style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>{co.name || '—'}</p>
            {co.address && <p style={{ fontSize: '10px', color: '#374151', margin: '1px 0 0' }}>{co.address}{co.city ? `, ${co.city}` : ''}{co.state ? `, ${co.state}` : ''}{co.pin_code ? ` - ${co.pin_code}` : ''}</p>}
            {co.gst_no && <p style={{ fontSize: '10px', margin: '1px 0 0' }}>GSTIN: <strong style={{ color: '#059669' }}>{co.gst_no}</strong></p>}
          </div>
          <div style={{ background: '#f9fafb', borderRadius: '4px', padding: '7px 10px' }}>
            <p style={{ fontSize: '9px', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' }}>Customer</p>
            <p style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>{sr.customer?.name || '—'}</p>
            {sr.customer?.phone && <p style={{ fontSize: '10px', color: '#374151', margin: '1px 0 0' }}>Phone: {sr.customer.phone}</p>}
            {sr.customer?.city && <p style={{ fontSize: '10px', color: '#374151', margin: '1px 0 0' }}>{sr.customer.city}{sr.customer.state ? `, ${sr.customer.state}` : ''}</p>}
            {sr.customer?.gst_no && <p style={{ fontSize: '10px', margin: '1px 0 0' }}>GSTIN: <strong style={{ color: '#059669' }}>{sr.customer.gst_no}</strong></p>}
          </div>
        </div>

        {/* Details + Timeline — 2 columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          <div style={{ border: '1px dashed #9ca3af', borderRadius: '4px', padding: '7px 10px' }}>
            <p style={{ fontSize: '9px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' }}>Return Details</p>
            <table style={{ width: '100%', fontSize: '11px' }}>
              <tbody>
                {sr.order && <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0', width: '35%' }}>Order:</td><td style={{ fontWeight: 700 }}>{sr.order.order_number}</td></tr>}
                {sr.credit_note_no && <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0' }}>Credit Note:</td><td style={{ fontWeight: 800, color: '#059669' }}>{sr.credit_note_no}</td></tr>}
                {sr.transport && <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0' }}>Transport:</td><td>{sr.transport.name}</td></tr>}
                {sr.lr_number && <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0' }}>LR No.:</td><td>{sr.lr_number}{sr.lr_date ? ` · ${fmtDate(sr.lr_date)}` : ''}</td></tr>}
                {sr.reason_summary && <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0', verticalAlign: 'top' }}>Reason:</td><td style={{ fontStyle: 'italic' }}>{sr.reason_summary}</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ border: '1px dashed #9ca3af', borderRadius: '4px', padding: '7px 10px' }}>
            <p style={{ fontSize: '9px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' }}>Timeline</p>
            <table style={{ width: '100%', fontSize: '11px' }}>
              <tbody>
                <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0', width: '35%' }}>Return Date:</td><td>{fmtDate(sr.return_date)}</td></tr>
                {sr.received_date && <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0' }}>Received:</td><td>{fmtDate(sr.received_date)}{sr.received_by_user ? ` — ${sr.received_by_user.full_name}` : ''}</td></tr>}
                {sr.inspected_date && <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0' }}>Inspected:</td><td>{fmtDate(sr.inspected_date)}{sr.inspected_by_user ? ` — ${sr.inspected_by_user.full_name}` : ''}</td></tr>}
                {sr.restocked_date && <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0' }}>Restocked:</td><td>{fmtDate(sr.restocked_date)}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary bar — at-a-glance totals */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '6px 10px', textAlign: 'center' }}>
            <p style={{ fontSize: '9px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', margin: 0 }}>Items (SKUs)</p>
            <p style={{ fontSize: '18px', fontWeight: 800, color: '#059669', margin: 0, lineHeight: 1.1 }}>{items.length}</p>
          </div>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '6px 10px', textAlign: 'center' }}>
            <p style={{ fontSize: '9px', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', margin: 0 }}>Pieces Returned</p>
            <p style={{ fontSize: '18px', fontWeight: 800, color: '#1e40af', margin: 0, lineHeight: 1.1 }}>{fmtInt(totalRet)}</p>
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '6px 10px', textAlign: 'center' }}>
            <p style={{ fontSize: '9px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', margin: 0 }}>Restocked / Damaged</p>
            <p style={{ fontSize: '16px', fontWeight: 800, margin: 0, lineHeight: 1.1 }}>
              <span style={{ color: '#059669' }}>{fmtInt(totalRest)}</span>
              <span style={{ color: '#9ca3af', fontSize: '12px', margin: '0 4px' }}>/</span>
              <span style={{ color: totalDmg > 0 ? '#dc2626' : '#9ca3af' }}>{fmtInt(totalDmg)}</span>
            </p>
          </div>
          <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '4px', padding: '6px 10px', textAlign: 'center' }}>
            <p style={{ fontSize: '9px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', margin: 0 }}>Total Value</p>
            <p style={{ fontSize: '16px', fontWeight: 800, color: '#92400e', margin: 0, lineHeight: 1.1 }}>{fmtCurrency(total)}</p>
          </div>
        </div>

        {/* Line items — tight, warehouse-focused */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
          <thead>
            <tr style={{ background: '#059669', color: '#fff' }}>
              {[
                { k: '#', w: '4%', align: 'left' },
                { k: 'SKU Code', w: '32%', align: 'left' },
                { k: 'Size', w: '7%', align: 'center' },
                { k: 'Ret', w: '7%', align: 'right' },
                { k: 'Rest', w: '7%', align: 'right' },
                { k: 'Dmg', w: '7%', align: 'right' },
                { k: 'Cond', w: '7%', align: 'center' },
                { k: 'Rate', w: '10%', align: 'right' },
                { k: 'Amount', w: '11%', align: 'right' },
                { k: '✓', w: '5%', align: 'center' },
              ].map(col => (
                <th key={col.k} style={{ padding: '6px 5px', textAlign: col.align, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', width: col.w }}>{col.k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const qty = Number(item.quantity_returned) || 0
              const price = Number(item.unit_price || item.order_item?.unit_price) || 0
              const amt = qty * price
              const cond = CONDITION_STYLE[item.condition] || CONDITION_STYLE.pending
              return (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#fafafa' : '#fff' }}>
                  <td style={{ padding: '4px 5px', color: '#9ca3af', fontSize: '11px' }}>{i + 1}</td>
                  <td style={{ padding: '4px 5px', fontWeight: 700, fontSize: '11px', fontFamily: 'monospace' }}>{item.sku?.sku_code || '—'}</td>
                  <td style={{ padding: '4px 5px', fontWeight: 700, textAlign: 'center', fontSize: '11px' }}>{item.sku?.size || '—'}</td>
                  <td style={{ padding: '4px 5px', textAlign: 'right', fontWeight: 700, fontSize: '11px' }}>{qty}</td>
                  <td style={{ padding: '4px 5px', textAlign: 'right', color: item.quantity_restocked > 0 ? '#166534' : '#9ca3af', fontWeight: 600, fontSize: '11px' }}>{item.quantity_restocked || '—'}</td>
                  <td style={{ padding: '4px 5px', textAlign: 'right', color: item.quantity_damaged > 0 ? '#dc2626' : '#9ca3af', fontWeight: 600, fontSize: '11px' }}>{item.quantity_damaged || '—'}</td>
                  <td style={{ padding: '4px 5px', textAlign: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', fontSize: '10px', fontWeight: 800, background: cond.bg, color: cond.fg }}>{cond.letter}</span>
                  </td>
                  <td style={{ padding: '4px 5px', textAlign: 'right', fontSize: '11px' }}>{price > 0 ? fmtCurrency(price) : '—'}</td>
                  <td style={{ padding: '4px 5px', textAlign: 'right', fontWeight: 700, fontSize: '11px' }}>{amt > 0 ? fmtCurrency(amt) : '—'}</td>
                  <td style={{ padding: '4px 5px', textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '1.5px solid #9ca3af', borderRadius: '2px' }}></span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* TOTALS row — rendered ONCE after the table (as a div, not tfoot,
            so it doesn't repeat on every printed page). Shows final totals
            for all rows in the document. */}
        <div style={{ display: 'grid', gridTemplateColumns: '4% 32% 7% 7% 7% 7% 7% 10% 11% 5%', borderTop: '2px solid #059669', background: '#f0fdf4', marginBottom: '8px' }}>
          <div style={{ gridColumn: 'span 3', padding: '6px 5px', fontWeight: 800, fontSize: '11px', color: '#059669' }}>TOTALS ({items.length} items)</div>
          <div style={{ padding: '6px 5px', textAlign: 'right', fontWeight: 800, fontSize: '12px', color: '#059669' }}>{fmtInt(totalRet)}</div>
          <div style={{ padding: '6px 5px', textAlign: 'right', fontWeight: 800, fontSize: '12px', color: '#166534' }}>{fmtInt(totalRest)}</div>
          <div style={{ padding: '6px 5px', textAlign: 'right', fontWeight: 800, fontSize: '12px', color: totalDmg > 0 ? '#dc2626' : '#9ca3af' }}>{fmtInt(totalDmg)}</div>
          <div />
          <div />
          <div style={{ padding: '6px 5px', textAlign: 'right', fontWeight: 800, fontSize: '12px', color: '#059669' }}>{fmtCurrency(subtotal)}</div>
          <div />
        </div>

        {/* Tax breakup & totals — right-aligned summary block */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', gap: '16px' }}>
          {sr.qc_notes && (
            <div style={{ flex: 1, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '8px 10px', fontSize: '11px', color: '#1e40af' }}>
              <strong>QC Notes:</strong> {sr.qc_notes}
            </div>
          )}
          <div style={{ minWidth: '240px', marginLeft: 'auto' }}>
            <table style={{ width: '100%', fontSize: '12px' }}>
              <tbody>
                <tr>
                  <td style={{ color: '#6b7280', padding: '2px 0' }}>Subtotal</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(subtotal)}</td>
                </tr>
                {discount > 0 && (
                  <tr>
                    <td style={{ color: '#d97706', padding: '2px 0' }}>Discount</td>
                    <td style={{ textAlign: 'right', color: '#d97706', fontWeight: 600 }}>-{fmtCurrency(discount)}</td>
                  </tr>
                )}
                {additional > 0 && (
                  <tr>
                    <td style={{ color: '#2563eb', padding: '2px 0' }}>Additional</td>
                    <td style={{ textAlign: 'right', color: '#2563eb', fontWeight: 600 }}>+{fmtCurrency(additional)}</td>
                  </tr>
                )}
                {gstPct > 0 && (
                  <>
                    <tr>
                      <td style={{ color: '#6b7280', padding: '2px 0' }}>CGST ({gstPct / 2}%)</td>
                      <td style={{ textAlign: 'right' }}>{fmtCurrency(taxAmt / 2)}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#6b7280', padding: '2px 0' }}>SGST ({gstPct / 2}%)</td>
                      <td style={{ textAlign: 'right' }}>{fmtCurrency(taxAmt / 2)}</td>
                    </tr>
                  </>
                )}
                <tr style={{ borderTop: '2px solid #059669' }}>
                  <td style={{ fontSize: '14px', fontWeight: 800, color: '#059669', padding: '5px 0 0' }}>TOTAL VALUE</td>
                  <td style={{ fontSize: '15px', fontWeight: 800, color: '#059669', textAlign: 'right', padding: '5px 0 0' }}>{fmtCurrency(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 3-way signature footer — Received / Inspected / Authorized */}
        <div style={{ paddingTop: '12px', borderTop: '1px solid #d1d5db', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #6b7280', height: '28px', marginBottom: '4px' }}>&nbsp;</div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Received By</p>
            <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>{sr.received_by_user?.full_name || 'Warehouse'}</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #6b7280', height: '28px', marginBottom: '4px' }}>&nbsp;</div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Inspected By</p>
            <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>{sr.inspected_by_user?.full_name || 'QC'}</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #6b7280', height: '28px', marginBottom: '4px' }}>&nbsp;</div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Authorised Signatory</p>
            <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>{co.name || 'Supplier'}</p>
          </div>
        </div>

        {/* Bottom tagline */}
        <p style={{ fontSize: '9px', color: '#9ca3af', margin: '8px 0 0', textAlign: 'center' }}>
          Computer-generated sales return document{sr.credit_note_no ? ` · For financial credit refer to ${sr.credit_note_no}` : ''}.
        </p>
      </div>
      {/* END inner content wrapper */}
      </div>
    </div>
  )
}
