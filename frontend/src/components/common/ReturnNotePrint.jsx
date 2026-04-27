import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtCurrency = (v) => `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtInt = (v) => (v || 0).toLocaleString('en-IN')
const fmtWeight = (v) => v != null ? `${Number(v).toFixed(3)}` : '—'

const REASON_LABEL = {
  defective: 'Defective',
  excess: 'Excess',
  wrong_material: 'Wrong Material',
  damaged_in_transit: 'Damaged in Transit',
  quality_reject: 'Quality Reject',
}

/**
 * ReturnNotePrint — warehouse / dispatch operations document (purchase side).
 *
 * Mirror of SalesReturnPrint. Full A4. Focus: supplier details, dispatch
 * timeline, full item list (rolls OR SKUs), totals, 3-way signature block.
 * Differs from DebitNotePrint (which is the half-page GST finance summary).
 *
 * Dynamic columns: roll_return → Roll Code / Fabric / Color / Weight
 *                  sku_return  → SKU Code / Size / Qty
 */
export default function ReturnNotePrint({ note, company, onClose }) {
  const printRef = useRef(null)
  const rn = note || {}
  const co = company || {}
  const isRoll = rn.return_type === 'roll_return'
  const items = rn.items || []

  const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)
  const totalWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0)
  const subtotal = Number(rn.subtotal) || 0
  const discount = Number(rn.discount_amount) || 0
  const additional = Number(rn.additional_amount) || 0
  const taxAmt = Number(rn.tax_amount) || 0
  const total = Number(rn.total_amount) || 0
  const gstPct = Number(rn.gst_percent) || 0
  const taxableValue = Math.max(0, subtotal - discount + additional)

  const statusStyle = rn.status === 'closed'
    ? { bg: '#dcfce7', fg: '#166534' }
    : rn.status === 'cancelled'
    ? { bg: '#fee2e2', fg: '#991b1b' }
    : rn.status === 'dispatched' || rn.status === 'acknowledged'
    ? { bg: '#dbeafe', fg: '#1e40af' }
    : { bg: '#fef3c7', fg: '#92400e' }

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `ReturnNote-${rn.return_note_no}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 10mm 10mm 15mm 10mm; }
      @page { @bottom-center { content: "Page " counter(page) " of " counter(pages); font-family: 'Inter', Arial, sans-serif; font-size: 9pt; color: #9ca3af; } }
      * { box-sizing: border-box; }
      body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
    `,
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center overflow-auto">
      <div className="w-full max-w-[220mm] mt-4 mb-3 flex items-center justify-between bg-white rounded-xl px-5 py-3 shadow-lg">
        <div>
          <span className="font-semibold text-gray-800">Return Note {rn.return_note_no}</span>
          <span className="ml-2 typo-caption">· warehouse / dispatch copy</span>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="rounded-lg bg-emerald-600 text-white px-4 py-2 typo-btn-sm hover:bg-emerald-700 transition-colors">Print</button>
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">Close</button>
        </div>
      </div>

      <div ref={printRef} style={{ width: '210mm', minHeight: '297mm', background: '#fff', padding: 0, fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", color: '#1f2937', fontSize: '12px', lineHeight: '1.45' }}>
        <div style={{ padding: '4mm' }}>

          {/* Header */}
          <div style={{ borderBottom: '3px solid #059669', paddingBottom: '6px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#059669', margin: 0, letterSpacing: '-0.5px', lineHeight: 1 }}>RETURN NOTE</h1>
              <p style={{ fontSize: '10px', color: '#6b7280', margin: '3px 0 0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Warehouse / Dispatch Copy · {isRoll ? 'Roll Return' : 'SKU Return'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '20px', fontWeight: 800, margin: 0, lineHeight: 1 }}>{rn.return_note_no}</p>
              <p style={{ fontSize: '11px', color: '#6b7280', margin: '3px 0 0' }}>Date: {fmtDate(rn.return_date || rn.created_at)}</p>
              <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 10px', borderRadius: '12px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px', background: statusStyle.bg, color: statusStyle.fg }}>
                {(rn.status || 'draft').toUpperCase()}
              </span>
            </div>
          </div>

          {/* From (us) / To (supplier) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div style={{ background: '#f9fafb', borderRadius: '4px', padding: '7px 10px' }}>
              <p style={{ fontSize: '9px', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' }}>From (Buyer)</p>
              <p style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>{co.name || '—'}</p>
              {co.address && <p style={{ fontSize: '10px', color: '#374151', margin: '1px 0 0' }}>{co.address}{co.city ? `, ${co.city}` : ''}{co.state ? `, ${co.state}` : ''}{co.pin_code ? ` - ${co.pin_code}` : ''}</p>}
              {co.gst_no && <p style={{ fontSize: '10px', margin: '1px 0 0' }}>GSTIN: <strong style={{ color: '#059669' }}>{co.gst_no}</strong></p>}
            </div>
            <div style={{ background: '#f9fafb', borderRadius: '4px', padding: '7px 10px' }}>
              <p style={{ fontSize: '9px', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' }}>To (Supplier)</p>
              <p style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>{rn.supplier?.name || '—'}</p>
              {rn.supplier?.phone && <p style={{ fontSize: '10px', color: '#374151', margin: '1px 0 0' }}>Phone: {rn.supplier.phone}</p>}
              {rn.supplier?.city && <p style={{ fontSize: '10px', color: '#374151', margin: '1px 0 0' }}>{rn.supplier.city}{rn.supplier.state ? `, ${rn.supplier.state}` : ''}</p>}
              {rn.supplier?.gst_no && <p style={{ fontSize: '10px', margin: '1px 0 0' }}>GSTIN: <strong style={{ color: '#059669' }}>{rn.supplier.gst_no}</strong></p>}
            </div>
          </div>

          {/* Dispatch Details + Timeline */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div style={{ border: '1px dashed #9ca3af', borderRadius: '4px', padding: '7px 10px' }}>
              <p style={{ fontSize: '9px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' }}>Dispatch Details</p>
              <table style={{ width: '100%', fontSize: '11px' }}>
                <tbody>
                  {rn.debit_note_no && <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0', width: '35%' }}>Debit Note:</td><td style={{ fontWeight: 800, color: '#059669' }}>{rn.debit_note_no}</td></tr>}
                  {rn.transport && <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0' }}>Transport:</td><td>{rn.transport.name}</td></tr>}
                  {rn.lr_number && <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0' }}>LR No.:</td><td>{rn.lr_number}</td></tr>}
                  {rn.notes && <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0', verticalAlign: 'top' }}>Reason:</td><td style={{ fontStyle: 'italic' }}>{rn.notes}</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ border: '1px dashed #9ca3af', borderRadius: '4px', padding: '7px 10px' }}>
              <p style={{ fontSize: '9px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' }}>Timeline</p>
              <table style={{ width: '100%', fontSize: '11px' }}>
                <tbody>
                  <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0', width: '35%' }}>Return Date:</td><td>{fmtDate(rn.return_date)}</td></tr>
                  {rn.approved_at && <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0' }}>Approved:</td><td>{fmtDate(rn.approved_at)}{rn.approved_by_user ? ` — ${rn.approved_by_user.full_name}` : ''}</td></tr>}
                  {rn.dispatch_date && <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0' }}>Dispatched:</td><td>{fmtDate(rn.dispatch_date)}</td></tr>}
                  {rn.acknowledged_date && <tr><td style={{ color: '#6b7280', padding: '1px 8px 1px 0' }}>Acknowledged:</td><td>{fmtDate(rn.acknowledged_date)}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '6px 10px', textAlign: 'center' }}>
              <p style={{ fontSize: '9px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', margin: 0 }}>Items ({isRoll ? 'Rolls' : 'SKUs'})</p>
              <p style={{ fontSize: '18px', fontWeight: 800, color: '#059669', margin: 0, lineHeight: 1.1 }}>{items.length}</p>
            </div>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '6px 10px', textAlign: 'center' }}>
              <p style={{ fontSize: '9px', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', margin: 0 }}>{isRoll ? 'Total Weight (kg)' : 'Total Pieces'}</p>
              <p style={{ fontSize: '18px', fontWeight: 800, color: '#1e40af', margin: 0, lineHeight: 1.1 }}>{isRoll ? fmtWeight(totalWeight) : fmtInt(totalQty)}</p>
            </div>
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '4px', padding: '6px 10px', textAlign: 'center' }}>
              <p style={{ fontSize: '9px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', margin: 0 }}>Total Value</p>
              <p style={{ fontSize: '16px', fontWeight: 800, color: '#92400e', margin: 0, lineHeight: 1.1 }}>{fmtCurrency(total)}</p>
            </div>
          </div>

          {/* Items table — dynamic based on return_type */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
            <thead>
              <tr style={{ background: '#059669', color: '#fff' }}>
                {isRoll ? (
                  <>
                    <th style={{ padding: '6px 5px', textAlign: 'left', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '4%' }}>#</th>
                    <th style={{ padding: '6px 5px', textAlign: 'left', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '22%' }}>Roll Code</th>
                    <th style={{ padding: '6px 5px', textAlign: 'left', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '14%' }}>Fabric</th>
                    <th style={{ padding: '6px 5px', textAlign: 'left', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '12%' }}>Color</th>
                    <th style={{ padding: '6px 5px', textAlign: 'right', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '10%' }}>Wt (kg)</th>
                    <th style={{ padding: '6px 5px', textAlign: 'right', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '10%' }}>Rate</th>
                    <th style={{ padding: '6px 5px', textAlign: 'right', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '13%' }}>Amount</th>
                    <th style={{ padding: '6px 5px', textAlign: 'left', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '10%' }}>Reason</th>
                    <th style={{ padding: '6px 5px', textAlign: 'center', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '5%' }}>✓</th>
                  </>
                ) : (
                  <>
                    <th style={{ padding: '6px 5px', textAlign: 'left', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '4%' }}>#</th>
                    <th style={{ padding: '6px 5px', textAlign: 'left', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '36%' }}>SKU Code</th>
                    <th style={{ padding: '6px 5px', textAlign: 'center', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '8%' }}>Size</th>
                    <th style={{ padding: '6px 5px', textAlign: 'right', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '8%' }}>Qty</th>
                    <th style={{ padding: '6px 5px', textAlign: 'right', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '12%' }}>Rate</th>
                    <th style={{ padding: '6px 5px', textAlign: 'right', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '15%' }}>Amount</th>
                    <th style={{ padding: '6px 5px', textAlign: 'left', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '12%' }}>Reason</th>
                    <th style={{ padding: '6px 5px', textAlign: 'center', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', width: '5%' }}>✓</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const price = Number(item.unit_price) || 0
                const amt = Number(item.amount) || 0
                const reasonLabel = REASON_LABEL[item.reason] || item.reason || '—'
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#fafafa' : '#fff' }}>
                    <td style={{ padding: '4px 5px', color: '#9ca3af', fontSize: '11px' }}>{i + 1}</td>
                    {isRoll ? (
                      <>
                        <td style={{ padding: '4px 5px', fontWeight: 700, fontSize: '11px', fontFamily: 'monospace' }}>{item.roll?.roll_code || '—'}</td>
                        <td style={{ padding: '4px 5px', fontSize: '11px' }}>{item.roll?.fabric_type || '—'}</td>
                        <td style={{ padding: '4px 5px', fontSize: '11px' }}>{item.roll?.color || '—'}</td>
                        <td style={{ padding: '4px 5px', textAlign: 'right', fontWeight: 700, fontSize: '11px' }}>{fmtWeight(item.weight)}</td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '4px 5px', fontWeight: 700, fontSize: '11px', fontFamily: 'monospace' }}>{item.sku?.sku_code || '—'}</td>
                        <td style={{ padding: '4px 5px', fontWeight: 700, textAlign: 'center', fontSize: '11px' }}>{item.sku?.size || '—'}</td>
                        <td style={{ padding: '4px 5px', textAlign: 'right', fontWeight: 700, fontSize: '11px' }}>{item.quantity || 0}</td>
                      </>
                    )}
                    <td style={{ padding: '4px 5px', textAlign: 'right', fontSize: '11px' }}>{price > 0 ? fmtCurrency(price) : '—'}</td>
                    <td style={{ padding: '4px 5px', textAlign: 'right', fontWeight: 700, fontSize: '11px' }}>{amt > 0 ? fmtCurrency(amt) : '—'}</td>
                    <td style={{ padding: '4px 5px', fontSize: '10px', color: '#6b7280' }}>{reasonLabel}</td>
                    <td style={{ padding: '4px 5px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '1.5px solid #9ca3af', borderRadius: '2px' }}></span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* TOTALS row — single render after the table */}
          <div style={{ display: 'grid', gridTemplateColumns: isRoll ? '4% 22% 14% 12% 10% 10% 13% 10% 5%' : '4% 36% 8% 8% 12% 15% 12% 5%', borderTop: '2px solid #059669', background: '#f0fdf4', marginBottom: '8px' }}>
            <div style={{ gridColumn: isRoll ? 'span 4' : 'span 3', padding: '6px 5px', fontWeight: 800, fontSize: '11px', color: '#059669' }}>TOTALS ({items.length} {isRoll ? 'rolls' : 'SKUs'})</div>
            <div style={{ padding: '6px 5px', textAlign: 'right', fontWeight: 800, fontSize: '12px', color: '#059669' }}>{isRoll ? fmtWeight(totalWeight) : fmtInt(totalQty)}</div>
            <div />
            <div style={{ padding: '6px 5px', textAlign: 'right', fontWeight: 800, fontSize: '12px', color: '#059669' }}>{fmtCurrency(subtotal)}</div>
            <div />
            <div />
          </div>

          {/* Tax + totals block */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
            <div style={{ minWidth: '240px' }}>
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
                      <td style={{ color: '#059669', padding: '2px 0' }}>Additional</td>
                      <td style={{ textAlign: 'right', color: '#059669', fontWeight: 600 }}>+{fmtCurrency(additional)}</td>
                    </tr>
                  )}
                  {(discount > 0 || additional > 0) && (
                    <tr>
                      <td style={{ color: '#374151', padding: '2px 0', borderTop: '1px dashed #d1d5db' }}>Taxable Value</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, borderTop: '1px dashed #d1d5db' }}>{fmtCurrency(taxableValue)}</td>
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

          {/* 3-way signature footer */}
          <div style={{ paddingTop: '12px', borderTop: '1px solid #d1d5db', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderBottom: '1px solid #6b7280', height: '28px', marginBottom: '4px' }}>&nbsp;</div>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Dispatched By</p>
              <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>Warehouse</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderBottom: '1px solid #6b7280', height: '28px', marginBottom: '4px' }}>&nbsp;</div>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Acknowledged By</p>
              <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>{rn.supplier?.name || 'Supplier'}</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderBottom: '1px solid #6b7280', height: '28px', marginBottom: '4px' }}>&nbsp;</div>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Authorised Signatory</p>
              <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>{co.name || 'Buyer'}</p>
            </div>
          </div>

          <p style={{ fontSize: '9px', color: '#9ca3af', margin: '8px 0 0', textAlign: 'center' }}>
            Computer-generated return note{rn.debit_note_no ? ` · For financial debit refer to ${rn.debit_note_no}` : ''}.
          </p>
        </div>
      </div>
    </div>
  )
}
