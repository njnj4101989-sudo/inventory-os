import { forwardRef } from 'react'

/**
 * ReceiptVoucherPrint — A4 half-page Receipt Voucher (PAY-XXXX).
 *
 * Layout discipline mirrors S114 CN/DN: top half holds the entire voucher
 * inside an A4 page so two receipts fit per sheet (cut at 148.5mm). No
 * itemised SKU breakdown — that lives on the source invoice. The voucher's
 * reason for existing is bill-wise allocation + total received.
 *
 * Renders via forwardRef so the parent's `useReactToPrint({ contentRef })`
 * can target it directly.
 *
 * Props:
 *   receipt — PaymentReceiptResponse (with allocations[])
 *   company — full Company object (name, gst_no, address, bank_*)
 */

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

const fmtCurrency = (v) =>
  `₹${(Number(v) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

function numberToWordsIN(num) {
  const n = Math.round(Number(num) || 0)
  if (n === 0) return 'Zero Rupees Only'
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const two = (x) => (x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : ''))
  const three = (x) =>
    x >= 100
      ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '')
      : two(x)
  let r = n
  const parts = []
  const crore = Math.floor(r / 10000000)
  r %= 10000000
  const lakh = Math.floor(r / 100000)
  r %= 100000
  const thousand = Math.floor(r / 1000)
  r %= 1000
  if (crore) parts.push(two(crore) + ' Crore')
  if (lakh) parts.push(two(lakh) + ' Lakh')
  if (thousand) parts.push(two(thousand) + ' Thousand')
  if (r) parts.push(three(r))
  return parts.join(' ') + ' Rupees Only'
}

const ReceiptVoucherPrint = forwardRef(function ReceiptVoucherPrint(
  { receipt, company },
  ref,
) {
  const r = receipt || {}
  const co = company || {}
  const total = Number(r.amount) || 0
  const tds = Number(r.tds_amount) || 0
  const tcs = Number(r.tcs_amount) || 0
  const allocated = Number(r.allocated_amount) || 0
  const onAccount = Number(r.on_account_amount) || 0
  const net = Number(r.net_amount) || total - tds + tcs

  return (
    <div
      ref={ref}
      style={{
        width: '210mm',
        minHeight: '297mm',
        background: '#fff',
        padding: 0,
        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
        color: '#1f2937',
        fontSize: '13px',
        lineHeight: '1.5',
      }}
    >
      {/* TOP HALF — half-page voucher */}
      <div
        style={{
          height: '138.5mm',
          display: 'flex',
          flexDirection: 'column',
          padding: '4mm',
        }}
      >
        {/* Header strip */}
        <div
          style={{
            borderBottom: '3px solid #059669',
            paddingBottom: '8px',
            marginBottom: '10px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '28px',
                fontWeight: 800,
                color: '#059669',
                margin: 0,
                letterSpacing: '-0.5px',
                lineHeight: 1,
              }}
            >
              RECEIPT VOUCHER
            </h1>
            <p style={{ fontSize: '11px', color: '#6b7280', margin: '4px 0 0' }}>
              Bill-wise allocation · Tally-style
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p
              style={{
                fontSize: '20px',
                fontWeight: 800,
                color: '#1f2937',
                margin: 0,
                lineHeight: 1,
              }}
            >
              {r.receipt_no}
            </p>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0' }}>
              Date: {fmtDate(r.payment_date)}
            </p>
          </div>
        </div>

        {/* Supplier (us) / Recipient (customer) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            marginBottom: '8px',
          }}
        >
          <div style={{ background: '#f9fafb', borderRadius: '4px', padding: '8px 10px' }}>
            <p
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#059669',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                margin: '0 0 4px',
              }}
            >
              Received By
            </p>
            <p style={{ fontSize: '14px', fontWeight: 800, margin: 0 }}>{co.name || '—'}</p>
            {co.address && (
              <p style={{ fontSize: '12px', color: '#374151', margin: '2px 0 0' }}>
                {co.address}
                {co.city ? `, ${co.city}` : ''}
                {co.state ? `, ${co.state}` : ''}
                {co.pin_code ? ` - ${co.pin_code}` : ''}
              </p>
            )}
            {co.gst_no && (
              <p style={{ fontSize: '12px', fontWeight: 600, margin: '2px 0 0' }}>
                GSTIN:{' '}
                <span style={{ color: '#059669' }}>{co.gst_no}</span>
              </p>
            )}
            {co.phone && (
              <p style={{ fontSize: '12px', color: '#374151', margin: '2px 0 0' }}>
                Phone: {co.phone}
              </p>
            )}
          </div>
          <div style={{ background: '#f9fafb', borderRadius: '4px', padding: '8px 10px' }}>
            <p
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#059669',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                margin: '0 0 4px',
              }}
            >
              Received From
            </p>
            <p style={{ fontSize: '14px', fontWeight: 800, margin: 0 }}>
              {r.party?.name || '—'}
            </p>
            {r.party?.city && (
              <p style={{ fontSize: '12px', color: '#374151', margin: '2px 0 0' }}>
                {r.party.city}
              </p>
            )}
            {r.party?.gst_no && (
              <p style={{ fontSize: '12px', fontWeight: 600, margin: '2px 0 0' }}>
                GSTIN:{' '}
                <span style={{ color: '#059669' }}>{r.party.gst_no}</span>
              </p>
            )}
            {r.party?.phone && (
              <p style={{ fontSize: '12px', color: '#374151', margin: '2px 0 0' }}>
                Phone: {r.party.phone}
              </p>
            )}
          </div>
        </div>

        {/* Mode + reference */}
        <div
          style={{
            border: '1px dashed #9ca3af',
            borderRadius: '4px',
            padding: '6px 12px',
            marginBottom: '8px',
            fontSize: '12px',
          }}
        >
          <span style={{ color: '#6b7280', marginRight: '6px' }}>Mode:</span>
          <strong style={{ textTransform: 'uppercase' }}>{r.payment_mode || '—'}</strong>
          {r.reference_no && (
            <>
              <span style={{ color: '#9ca3af', margin: '0 8px' }}>·</span>
              <span style={{ color: '#6b7280', marginRight: '6px' }}>Ref:</span>
              <strong style={{ fontFamily: 'monospace' }}>{r.reference_no}</strong>
            </>
          )}
          {r.notes && (
            <>
              <span style={{ color: '#9ca3af', margin: '0 8px' }}>·</span>
              <span style={{ fontStyle: 'italic', color: '#374151' }}>"{r.notes}"</span>
            </>
          )}
        </div>

        {/* Allocations + totals */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            marginBottom: '8px',
            flex: '1 1 auto',
          }}
        >
          {/* Allocations table */}
          <div>
            <p
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#059669',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                margin: '0 0 4px',
              }}
            >
              Bill-wise Allocations
            </p>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '4px 6px',
                      fontWeight: 700,
                      color: '#065f46',
                    }}
                  >
                    Invoice
                  </th>
                  <th
                    style={{
                      textAlign: 'right',
                      padding: '4px 6px',
                      fontWeight: 700,
                      color: '#065f46',
                    }}
                  >
                    Applied
                  </th>
                </tr>
              </thead>
              <tbody>
                {(r.allocations || []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={2}
                      style={{
                        padding: '8px',
                        textAlign: 'center',
                        color: '#9ca3af',
                        fontStyle: 'italic',
                      }}
                    >
                      Fully on-account
                    </td>
                  </tr>
                ) : (
                  (r.allocations || []).map((a) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '3px 6px', fontFamily: 'monospace' }}>
                        {a.invoice_number || a.invoice_id}
                      </td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600 }}>
                        {fmtCurrency(a.amount_applied)}
                      </td>
                    </tr>
                  ))
                )}
                <tr style={{ borderTop: '2px solid #059669' }}>
                  <td
                    style={{
                      padding: '4px 6px',
                      fontWeight: 700,
                      color: '#059669',
                    }}
                  >
                    Allocated
                  </td>
                  <td
                    style={{
                      padding: '4px 6px',
                      textAlign: 'right',
                      fontWeight: 800,
                      color: '#059669',
                    }}
                  >
                    {fmtCurrency(allocated)}
                  </td>
                </tr>
                {onAccount > 0.005 && (
                  <tr>
                    <td style={{ padding: '3px 6px', color: '#0369a1', fontWeight: 600 }}>
                      On-Account
                    </td>
                    <td
                      style={{
                        padding: '3px 6px',
                        textAlign: 'right',
                        color: '#0369a1',
                        fontWeight: 700,
                      }}
                    >
                      {fmtCurrency(onAccount)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div
            style={{
              border: '2px solid #059669',
              borderRadius: '4px',
              padding: '8px 12px',
              background: '#f0fdf4',
            }}
          >
            <table style={{ width: '100%', fontSize: '13px' }}>
              <tbody>
                <tr>
                  <td style={{ color: '#374151', padding: '2px 0' }}>Gross Amount</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtCurrency(total)}</td>
                </tr>
                {tds > 0 && (
                  <tr>
                    <td style={{ color: '#d97706', padding: '2px 0' }}>
                      Less: TDS{r.tds_section ? ` (${r.tds_section})` : ''}
                    </td>
                    <td style={{ textAlign: 'right', color: '#d97706', fontWeight: 600 }}>
                      −{fmtCurrency(tds)}
                    </td>
                  </tr>
                )}
                {tcs > 0 && (
                  <tr>
                    <td style={{ color: '#2563eb', padding: '2px 0' }}>
                      Add: TCS{r.tcs_section ? ` (${r.tcs_section})` : ''}
                    </td>
                    <td style={{ textAlign: 'right', color: '#2563eb', fontWeight: 600 }}>
                      +{fmtCurrency(tcs)}
                    </td>
                  </tr>
                )}
                <tr style={{ borderTop: '2px solid #059669' }}>
                  <td
                    style={{
                      fontSize: '15px',
                      fontWeight: 800,
                      color: '#059669',
                      padding: '6px 0 0',
                    }}
                  >
                    NET RECEIVED
                  </td>
                  <td
                    style={{
                      fontSize: '17px',
                      fontWeight: 800,
                      color: '#059669',
                      textAlign: 'right',
                      padding: '6px 0 0',
                    }}
                  >
                    {fmtCurrency(net)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p
              style={{
                marginTop: '8px',
                fontSize: '11px',
                fontStyle: 'italic',
                color: '#065f46',
                lineHeight: 1.4,
              }}
            >
              {numberToWordsIN(net)}
            </p>
          </div>
        </div>

        {/* Bottom strip — bank + signature */}
        {co.bank_name && (
          <div style={{ fontSize: '11px', color: '#374151', marginBottom: '6px' }}>
            <strong style={{ color: '#1f2937' }}>Deposited to:</strong> {co.bank_name} · A/C{' '}
            <strong>{co.bank_account || '—'}</strong> · IFSC{' '}
            <strong>{co.bank_ifsc || '—'}</strong>
          </div>
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            paddingTop: '6px',
            borderTop: '1px solid #d1d5db',
          }}
        >
          <div style={{ fontSize: '10px', color: '#9ca3af', maxWidth: '55%' }}>
            Computer-generated receipt voucher. Receipt against invoices listed above.
          </div>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '140px',
                borderBottom: '1px solid #6b7280',
                marginBottom: '3px',
                height: '20px',
              }}
            >
              &nbsp;
            </div>
            <p style={{ fontSize: '11px', color: '#1f2937', margin: 0, fontWeight: 700 }}>
              Authorised Signatory
            </p>
            <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>{co.name || ''}</p>
          </div>
        </div>
      </div>

      {/* Tear line at A4 midpoint */}
      <div
        style={{
          height: '10mm',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '10px',
          color: '#9ca3af',
          padding: '0 10mm',
        }}
      >
        <span style={{ flex: 1, borderTop: '1px dashed #d1d5db' }}></span>
        <span style={{ fontStyle: 'italic', whiteSpace: 'nowrap' }}>
          ✂ cut here — bottom half for counterfoil / filing
        </span>
        <span style={{ flex: 1, borderTop: '1px dashed #d1d5db' }}></span>
      </div>
    </div>
  )
})

export default ReceiptVoucherPrint
