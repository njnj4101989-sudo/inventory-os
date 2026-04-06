import { useRef, useMemo } from 'react'
import { useReactToPrint } from 'react-to-print'

/**
 * Order Print — Two modes:
 *   'confirmation' — formal order sheet (grouped by design, row per SKU, pricing)
 *   'picksheet'    — warehouse pick sheet (pivot: rows=sizes, cols=colors, cells=☐+qty)
 * B&W optimized, A4 portrait.
 */
export default function OrderPrint({ order, companyName, company, onClose, mode = 'confirmation' }) {
  const printRef = useRef(null)

  const o = order || {}
  const items = o.items || []
  const totalQty = items.reduce((s, it) => s + (it.quantity || 0), 0)
  const totalAmount = items.reduce((s, it) => s + (it.total_price || 0), 0)

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Order-${o.order_number || 'Sheet'}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tr { page-break-inside: avoid; }
      .op-totals, .op-signatures { page-break-inside: avoid; }
      thead { display: table-header-group; }
    `,
  })

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  // Parse design from SKU code: SBL-1050-RED-L → 1050
  const parseDesign = (skuCode) => {
    if (!skuCode) return '—'
    const parts = skuCode.split('-')
    return parts.length >= 2 ? parts[1] : '—'
  }

  // Group items by design number
  const grouped = useMemo(() => {
    const map = {}
    items.forEach((item, idx) => {
      const design = parseDesign(item.sku?.sku_code)
      if (!map[design]) map[design] = { design, items: [], totalQty: 0, totalAmount: 0 }
      map[design].items.push({ ...item, _idx: idx + 1 })
      map[design].totalQty += item.quantity || 0
      map[design].totalAmount += item.total_price || 0
    })
    return Object.values(map)
  }, [items])

  // Size summary across all items
  const sizeSummary = useMemo(() => {
    const map = {}
    const sizeOrder = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL']
    items.forEach((item) => {
      const size = item.sku?.size || '—'
      map[size] = (map[size] || 0) + (item.quantity || 0)
    })
    // Sort by known size order, then alphabetical for unknowns
    const sorted = Object.entries(map).sort(([a], [b]) => {
      const ai = sizeOrder.indexOf(a), bi = sizeOrder.indexOf(b)
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return a.localeCompare(b)
    })
    return sorted
  }, [items])

  // Pivot data for pick sheet mode — per design: rows=sizes, cols=colors, cells=qty
  const pivotData = useMemo(() => {
    if (mode !== 'picksheet') return []
    const sizeOrder = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL']
    const sortSize = (a, b) => {
      const ai = sizeOrder.indexOf(a), bi = sizeOrder.indexOf(b)
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return a.localeCompare(b)
    }

    // Group by design
    const designMap = {}
    items.forEach(item => {
      const design = parseDesign(item.sku?.sku_code)
      const color = item.sku?.color || '—'
      const size = item.sku?.size || '—'
      const qty = item.quantity || 0
      if (!designMap[design]) designMap[design] = { design, cells: {}, colors: new Set(), sizes: new Set(), totalQty: 0 }
      designMap[design].colors.add(color)
      designMap[design].sizes.add(size)
      const key = `${size}|${color}`
      designMap[design].cells[key] = (designMap[design].cells[key] || 0) + qty
      designMap[design].totalQty += qty
    })

    return Object.values(designMap).map(g => ({
      design: g.design,
      colors: [...g.colors].sort(),
      sizes: [...g.sizes].sort(sortSize),
      cells: g.cells,
      totalQty: g.totalQty,
    }))
  }, [items, mode])

  // GST calculation
  const gstPct = o.gst_percent || 0
  const subtotal = totalAmount
  const cgst = subtotal * gstPct / 200
  const sgst = subtotal * gstPct / 200
  const grandTotal = subtotal + cgst + sgst
  const fmtINR = (v) => '\u20B9' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Styles — all B&W, solid borders, no grey
  const S = {
    border: '1px solid #000',
    borderB: { borderBottom: '1px solid #000' },
    borderB2: { borderBottom: '2px solid #000' },
    cell: { padding: '4px 6px', fontSize: '10px', borderBottom: '1px solid #000', borderRight: '1px solid #000' },
    cellLast: { padding: '4px 6px', fontSize: '10px', borderBottom: '1px solid #000' },
    th: { padding: '5px 6px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '2px solid #000', borderRight: '1px solid #000', background: '#000', color: '#fff' },
    thLast: { padding: '5px 6px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '2px solid #000', background: '#000', color: '#fff' },
    label: { fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' },
    value: { fontSize: '11px', fontWeight: 600 },
    sm: { fontSize: '10px' },
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-start overflow-y-auto py-6">
      {/* Toolbar */}
      <div className="w-full max-w-[220mm] mb-3 flex items-center justify-between bg-white rounded-xl px-5 py-3 shadow-lg mx-4">
        <span className="font-semibold text-gray-800">
          {mode === 'picksheet' ? 'Pick Sheet' : 'Order'} — {o.order_number}
        </span>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 transition-colors">
            Print
          </button>
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Close
          </button>
        </div>
      </div>

      {/* A4 Printable */}
      <div ref={printRef} style={{
        width: '210mm', background: '#fff', padding: '12mm',
        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", color: '#000',
        fontSize: '11px', lineHeight: '1.4',
      }} className="shadow-2xl rounded-lg mb-6">

        {/* ═══ HEADER ═══ */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '12px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, letterSpacing: '-0.3px' }}>
              {mode === 'picksheet' ? 'WAREHOUSE PICK SHEET' : 'ORDER CONFIRMATION'}
            </h1>
            <p style={{ fontSize: '13px', fontWeight: 700, margin: '2px 0 0' }}>{companyName || company?.name || 'Company'}</p>
            {company?.address && <p style={{ fontSize: '10px', margin: '1px 0 0' }}>{company.address}{company.city ? `, ${company.city}` : ''}</p>}
            {!company?.address && company?.city && <p style={{ fontSize: '10px', margin: '1px 0 0' }}>{company.city}</p>}
            {company?.gst_no && <p style={{ fontSize: '10px', margin: '1px 0 0' }}>GSTIN: {company.gst_no}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>{o.order_number}</p>
            <p style={{ fontSize: '10px', margin: '2px 0' }}>Date: {o.order_date ? fmtDate(o.order_date + 'T00:00:00') : fmtDate(o.created_at)}</p>
            <p style={{ fontSize: '11px', fontWeight: 800, margin: '2px 0', border: '1.5px solid #000', display: 'inline-block', padding: '1px 10px' }}>
              {(o.status || 'pending').toUpperCase()}
            </p>
          </div>
        </div>

        {/* ═══ CUSTOMER + ORDER META ═══ */}
        <div style={{ display: 'flex', border: '1px solid #000', marginBottom: '12px' }}>
          {/* Customer */}
          <div style={{ flex: 1, padding: '8px 10px', borderRight: '1px solid #000' }}>
            <p style={{ ...S.label, margin: '0 0 4px' }}>Customer</p>
            <p style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>{o.customer?.name || o.customer_name || 'Walk-in'}</p>
            {(o.customer?.phone || o.customer_phone) && <p style={{ ...S.sm, margin: '1px 0 0' }}>Ph: {o.customer?.phone || o.customer_phone}</p>}
            {(o.customer_address || o.customer?.city) && <p style={{ ...S.sm, margin: '1px 0 0' }}>{o.customer_address || o.customer?.city}</p>}
            {o.customer?.gst_no && <p style={{ ...S.sm, margin: '1px 0 0' }}>GST: {o.customer.gst_no}</p>}
          </div>
          {/* Order info */}
          <div style={{ flex: 1, padding: '8px 10px', borderRight: '1px solid #000' }}>
            <p style={{ ...S.label, margin: '0 0 4px' }}>Order Details</p>
            <p style={{ ...S.sm, margin: '1px 0' }}>Source: {o.source || '—'}</p>
            {o.external_order_ref && <p style={{ ...S.sm, margin: '1px 0' }}>Ext. Ref: {o.external_order_ref}</p>}
            {(o.broker?.name || o.broker_name) && <p style={{ ...S.sm, margin: '1px 0' }}>Broker: {o.broker?.name || o.broker_name}</p>}
            {(o.transport?.name || o.transport_name) && <p style={{ ...S.sm, margin: '1px 0' }}>Transport: {o.transport?.name || o.transport_name}</p>}
          </div>
          {/* Total qty box — big and bold */}
          <div style={{ width: '120px', padding: '8px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: '24px', fontWeight: 800, margin: 0, lineHeight: 1 }}>{totalQty}</p>
            <p style={{ ...S.label, margin: '2px 0 0' }}>Total Pcs</p>
            <p style={{ fontSize: '9px', margin: '2px 0 0' }}>{items.length} line items</p>
          </div>
        </div>

        {/* Notes */}
        {o.notes && (
          <div style={{ border: '1px solid #000', padding: '6px 10px', marginBottom: '12px', fontSize: '10px' }}>
            <span style={{ fontWeight: 700 }}>Notes:</span> {o.notes}
          </div>
        )}

        {mode === 'picksheet' ? (
          /* ═══ PICK SHEET — PIVOT TABLES ═══ */
          <>
            {pivotData.map((group, gi) => {
              // Column totals
              const colTotals = {}
              group.colors.forEach(c => {
                colTotals[c] = group.sizes.reduce((s, sz) => s + (group.cells[`${sz}|${c}`] || 0), 0)
              })

              return (
                <div key={group.design} style={{ marginBottom: gi < pivotData.length - 1 ? '10px' : '0', pageBreakInside: 'avoid' }}>
                  {/* Design header */}
                  <div style={{ background: '#000', color: '#fff', padding: '5px 8px', fontSize: '11px', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                    <span>DESIGN {group.design}</span>
                    <span>{group.totalQty} pcs</span>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
                    <thead>
                      <tr>
                        <th style={{ ...S.th, textAlign: 'left', width: '70px' }}>Size</th>
                        {group.colors.map((color, ci) => (
                          <th key={color} style={ci < group.colors.length - 1 ? { ...S.th, textAlign: 'center' } : { ...S.thLast, textAlign: 'center' }}>
                            {color}
                          </th>
                        ))}
                        <th style={{ ...S.thLast, textAlign: 'center', width: '50px', borderLeft: '2px solid #fff' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.sizes.map(size => {
                        const rowTotal = group.colors.reduce((s, c) => s + (group.cells[`${size}|${c}`] || 0), 0)
                        return (
                          <tr key={size} style={{ pageBreakInside: 'avoid' }}>
                            <td style={{ ...S.cell, fontWeight: 700, fontSize: '11px' }}>{size}</td>
                            {group.colors.map((color, ci) => {
                              const qty = group.cells[`${size}|${color}`] || 0
                              return (
                                <td key={color} style={ci < group.colors.length - 1 ? { ...S.cell, textAlign: 'center' } : { ...S.cellLast, textAlign: 'center' }}>
                                  {qty > 0 ? (
                                    <span style={{ fontSize: '11px' }}>
                                      <span style={{ fontSize: '9px', marginRight: '2px' }}>☐</span>
                                      <span style={{ fontWeight: 700 }}>{qty}</span>
                                    </span>
                                  ) : (
                                    <span style={{ color: '#999', fontSize: '9px' }}>—</span>
                                  )}
                                </td>
                              )
                            })}
                            <td style={{ ...S.cellLast, textAlign: 'center', fontWeight: 800, fontSize: '11px', borderLeft: '2px solid #000' }}>{rowTotal}</td>
                          </tr>
                        )
                      })}
                      {/* Column totals row */}
                      <tr style={{ borderTop: '2px solid #000' }}>
                        <td style={{ padding: '5px 6px', fontSize: '10px', fontWeight: 800, borderRight: '1px solid #000' }}>TOTAL</td>
                        {group.colors.map((color, ci) => (
                          <td key={color} style={{
                            padding: '5px 6px', fontSize: '11px', fontWeight: 800, textAlign: 'center',
                            borderRight: ci < group.colors.length - 1 ? '1px solid #000' : 'none',
                          }}>
                            {colTotals[color]}
                          </td>
                        ))}
                        <td style={{ padding: '5px 6px', fontSize: '12px', fontWeight: 800, textAlign: 'center', borderLeft: '2px solid #000' }}>
                          {group.totalQty}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )
            })}

            {/* ═══ SIZE SUMMARY ═══ */}
            <div style={{ border: '1px solid #000', padding: '6px 10px', marginTop: '10px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ ...S.label }}>Size Summary:</span>
              {sizeSummary.map(([size, qty], i) => (
                <span key={size} style={{ fontSize: '11px' }}>
                  <span style={{ fontWeight: 700 }}>{size}:</span> {qty}
                  {i < sizeSummary.length - 1 && <span style={{ margin: '0 4px' }}>·</span>}
                </span>
              ))}
              <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: '11px' }}>= {totalQty} pcs</span>
            </div>
          </>
        ) : (
          /* ═══ CONFIRMATION — ITEMS TABLE (GROUPED BY DESIGN) ═══ */
          <>
            {grouped.map((group, gi) => (
              <div key={group.design} style={{ marginBottom: gi < grouped.length - 1 ? '8px' : '0' }}>
                {/* Design header */}
                <div style={{ background: '#000', color: '#fff', padding: '4px 8px', fontSize: '10px', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                  <span>DESIGN {group.design} ({group.items.length} item{group.items.length !== 1 ? 's' : ''})</span>
                  <span>{group.totalQty} pcs · {fmtINR(group.totalAmount)}</span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
                  <thead>
                    <tr>
                      <th style={{ ...S.th, width: '22px', textAlign: 'center', padding: '4px 2px' }}>☐</th>
                      <th style={{ ...S.th, width: '24px', textAlign: 'center' }}>#</th>
                      <th style={{ ...S.th, textAlign: 'left' }}>SKU Code</th>
                      <th style={{ ...S.th, textAlign: 'left', width: '18%' }}>Color</th>
                      <th style={{ ...S.th, textAlign: 'center', width: '10%' }}>Size</th>
                      <th style={{ ...S.th, textAlign: 'right', width: '8%' }}>Qty</th>
                      <th style={{ ...S.th, textAlign: 'right', width: '10%' }}>Rate</th>
                      <th style={{ ...S.thLast, textAlign: 'right', width: '12%' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item._idx} style={{ pageBreakInside: 'avoid' }}>
                        <td style={{ ...S.cell, textAlign: 'center', width: '22px', padding: '4px 2px' }}>☐</td>
                        <td style={{ ...S.cell, textAlign: 'center', fontWeight: 600 }}>{item._idx}</td>
                        <td style={{ ...S.cell, fontWeight: 600 }}>{item.sku?.sku_code || '—'}</td>
                        <td style={{ ...S.cell }}>{item.sku?.color || '—'}</td>
                        <td style={{ ...S.cell, textAlign: 'center', fontWeight: 600 }}>{item.sku?.size || '—'}</td>
                        <td style={{ ...S.cell, textAlign: 'right', fontWeight: 700, fontSize: '11px' }}>{item.quantity}</td>
                        <td style={{ ...S.cell, textAlign: 'right' }}>{'\u20B9'}{(item.unit_price || 0).toLocaleString('en-IN')}</td>
                        <td style={{ ...S.cellLast, textAlign: 'right', fontWeight: 600 }}>{'\u20B9'}{(item.total_price || 0).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {/* ═══ SIZE SUMMARY ═══ */}
            <div style={{ border: '1px solid #000', padding: '6px 10px', marginTop: '10px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ ...S.label }}>Size Summary:</span>
              {sizeSummary.map(([size, qty], i) => (
                <span key={size} style={{ fontSize: '11px' }}>
                  <span style={{ fontWeight: 700 }}>{size}:</span> {qty}
                  {i < sizeSummary.length - 1 && <span style={{ margin: '0 4px' }}>·</span>}
                </span>
              ))}
              <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: '11px' }}>= {totalQty} pcs</span>
            </div>

            {/* ═══ TOTALS ═══ */}
            <div className="op-totals" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <table style={{ borderCollapse: 'collapse', border: '1px solid #000', width: '260px' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '4px 8px', fontSize: '10px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>Total Qty</td>
                    <td style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 700, textAlign: 'right', borderBottom: '1px solid #000' }}>{totalQty} pcs</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '4px 8px', fontSize: '10px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>Subtotal</td>
                    <td style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 700, textAlign: 'right', borderBottom: '1px solid #000' }}>{fmtINR(subtotal)}</td>
                  </tr>
                  {gstPct > 0 && <>
                    <tr>
                      <td style={{ padding: '4px 8px', fontSize: '10px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>CGST ({gstPct / 2}%)</td>
                      <td style={{ padding: '4px 8px', fontSize: '10px', textAlign: 'right', borderBottom: '1px solid #000' }}>{fmtINR(cgst)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '4px 8px', fontSize: '10px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>SGST ({gstPct / 2}%)</td>
                      <td style={{ padding: '4px 8px', fontSize: '10px', textAlign: 'right', borderBottom: '1px solid #000' }}>{fmtINR(sgst)}</td>
                    </tr>
                  </>}
                  <tr>
                    <td style={{ padding: '6px 8px', fontSize: '12px', fontWeight: 800, borderRight: '1px solid #000' }}>Grand Total</td>
                    <td style={{ padding: '6px 8px', fontSize: '12px', fontWeight: 800, textAlign: 'right' }}>{fmtINR(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ═══ SIGNATURES ═══ */}
        <div className="op-signatures" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px', gap: '20px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderBottom: '1px solid #000', height: '24px', marginBottom: '4px' }}></div>
            <p style={{ fontSize: '9px', fontWeight: 600, margin: 0 }}>Packed By (Name & Sign)</p>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderBottom: '1px solid #000', height: '24px', marginBottom: '4px' }}></div>
            <p style={{ fontSize: '9px', fontWeight: 600, margin: 0 }}>Verified By (Name & Sign)</p>
          </div>
          {mode !== 'picksheet' && (
            <>
              <div style={{ flex: 1 }}>
                <div style={{ borderBottom: '1px solid #000', height: '24px', marginBottom: '4px' }}></div>
                <p style={{ fontSize: '9px', fontWeight: 600, margin: 0 }}>Customer Signature</p>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ borderBottom: '1px solid #000', height: '24px', marginBottom: '4px' }}></div>
                <p style={{ fontSize: '9px', fontWeight: 600, margin: 0 }}>Authorized Signature</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
