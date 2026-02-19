import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { getRollPassport } from '../api/rolls'
import CameraScanner from '../components/common/CameraScanner'

/**
 * Public Roll Passport page — /scan/roll/:rollCode
 * No auth required. Workers scan QR on roll → see full chain.
 * Also shows a "Scan Another" button to open camera scanner.
 */
export default function ScanPage() {
  const { rollCode } = useParams()
  const navigate = useNavigate()

  const [passport, setPassport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showScanner, setShowScanner] = useState(false)

  useEffect(() => {
    if (!rollCode) {
      setShowScanner(true)
      setLoading(false)
      return
    }
    fetchPassport(rollCode)
  }, [rollCode])

  async function fetchPassport(code) {
    setLoading(true)
    setError(null)
    try {
      const res = await getRollPassport(code)
      // Handle both mock shape (res.data.data) and real backend (res.data.data)
      const data = res?.data?.data || res?.data || res
      setPassport(data)
    } catch (err) {
      setError(err?.response?.data?.detail || `Roll "${code}" not found`)
    } finally {
      setLoading(false)
    }
  }

  function handleScan(decodedText) {
    setShowScanner(false)
    // Extract roll_code from scan URL or use raw text
    // Expected: http://host/scan/roll/{rollCode} or just the rollCode itself
    const match = decodedText.match(/\/scan\/roll\/([^/?\s]+)/)
    const code = match ? decodeURIComponent(match[1]) : decodedText.trim()
    navigate(`/scan/roll/${encodeURIComponent(code)}`)
  }

  const statusColor = {
    in_stock: 'bg-green-100 text-green-700',
    sent_for_processing: 'bg-yellow-100 text-yellow-700',
    in_cutting: 'bg-blue-100 text-blue-700',
  }

  const batchStatusColor = {
    CREATED: 'bg-gray-100 text-gray-600',
    ASSIGNED: 'bg-blue-100 text-blue-700',
    STARTED: 'bg-yellow-100 text-yellow-700',
    SUBMITTED: 'bg-purple-100 text-purple-700',
    COMPLETED: 'bg-green-100 text-green-700',
    APPROVED: 'bg-emerald-100 text-emerald-700',
    REJECTED: 'bg-red-100 text-red-700',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900 text-sm">Roll Passport</span>
        </div>
        <button
          onClick={() => setShowScanner(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8H3m2 8H3m10-10V4m0 16v-2" />
          </svg>
          Scan QR
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Loading passport...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center mt-8">
            <div className="text-3xl mb-3">❌</div>
            <h3 className="font-semibold text-red-800 mb-1">Roll Not Found</h3>
            <p className="text-red-600 text-sm">{error}</p>
            <button
              onClick={() => setShowScanner(true)}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
            >
              Scan Again
            </button>
          </div>
        )}

        {/* No rollCode — prompt to scan */}
        {!loading && !error && !passport && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8H3m2 8H3m10-10V4m0 16v-2" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Scan a Roll QR Code</h3>
              <p className="text-gray-500 text-sm mt-1">Point your camera at the QR label on any roll</p>
            </div>
            <button
              onClick={() => setShowScanner(true)}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
            >
              Open Camera
            </button>
          </div>
        )}

        {/* Passport */}
        {!loading && !error && passport && (
          <div className="space-y-4">
            {/* Roll identity card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-bold text-gray-900 font-mono break-all">
                    {passport.enhanced_roll_code || passport.roll_code}
                  </h1>
                  {passport.effective_sku && (
                    <div className="mt-1 inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.243 3.03a1 1 0 01.727 1.213L9.53 6h2.94l.56-2.243a1 1 0 111.94.486L14.53 6H17a1 1 0 110 2h-2.97l-1 4H15a1 1 0 110 2h-2.47l-.56 2.242a1 1 0 11-1.94-.485L10.47 14H7.53l-.56 2.242a1 1 0 11-1.94-.485L5.47 14H3a1 1 0 110-2h2.97l1-4H5a1 1 0 110-2h2.47l.56-2.243a1 1 0 011.213-.727zM9.03 8l-1 4h2.938l1-4H9.031z" />
                      </svg>
                      {passport.effective_sku}
                    </div>
                  )}
                  <span className={`mt-2 inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor[passport.status] || 'bg-gray-100 text-gray-600'}`}>
                    {passport.status?.replace(/_/g, ' ')}
                  </span>
                </div>
                {/* Mini QR for sharing */}
                <div className="flex-shrink-0">
                  <QRCodeSVG
                    value={window.location.href}
                    size={64}
                    level="M"
                    includeMargin={false}
                  />
                </div>
              </div>

              {/* Key metrics */}
              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100">
                <Metric label="Fabric" value={passport.fabric_type} />
                <Metric label="Color" value={`${passport.color}${passport.color_no ? ` (${String(passport.color_no).padStart(2,'0')})` : ''}`} />
                <Metric label="Weight" value={`${parseFloat(passport.total_weight || 0).toFixed(1)} ${passport.unit || 'kg'}`} />
                <Metric label="Remaining" value={`${parseFloat(passport.remaining_weight || 0).toFixed(1)} ${passport.unit || 'kg'}`} />
                {passport.panna && <Metric label="Panna" value={passport.panna} />}
                {passport.gsm && <Metric label="GSM" value={passport.gsm} />}
              </div>
            </div>

            {/* Origin */}
            <Section title="Origin" icon="📦">
              <InfoRow label="Supplier" value={passport.supplier?.name} />
              <InfoRow label="Invoice" value={passport.supplier_invoice_no} />
              <InfoRow label="Challan" value={passport.supplier_challan_no} />
              <InfoRow label="Sr. No." value={passport.sr_no} />
              <InfoRow label="Date" value={passport.supplier_invoice_date
                ? new Date(passport.supplier_invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : null} />
              <InfoRow label="Received by" value={passport.received_by_user?.full_name} />
            </Section>

            {/* Value Additions */}
            {passport.value_additions?.length > 0 && (
              <Section title="Value Additions" icon="✨">
                {passport.value_additions.map((log, i) => (
                  <div key={log.id || i} className="py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">+{log.short_code}</span>
                        <span className="text-sm font-medium text-gray-900">{log.name}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        log.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {log.status === 'received' ? 'Returned' : 'Sent'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                      <span>{log.vendor_name}</span>
                      {log.sent_date && <span>Sent: {log.sent_date}</span>}
                      {log.received_date && <span>Returned: {log.received_date}</span>}
                      {log.processing_cost && <span>Cost: ₹{parseFloat(log.processing_cost).toLocaleString('en-IN')}</span>}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {/* Regular Processing */}
            {passport.regular_processing?.length > 0 && (
              <Section title="Processing History" icon="🔧">
                {passport.regular_processing.map((log, i) => (
                  <div key={log.id || i} className="py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900 capitalize">
                        {log.process_type?.replace(/_/g, ' ')}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        log.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {log.status === 'received' ? 'Returned' : 'Sent'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                      <span>{log.vendor_name}</span>
                      {log.sent_date && <span>Sent: {log.sent_date}</span>}
                      {log.received_date && <span>Returned: {log.received_date}</span>}
                      {log.processing_cost && <span>Cost: ₹{parseFloat(log.processing_cost).toLocaleString('en-IN')}</span>}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {/* Fallback: processing_logs if no split (mock mode) */}
            {!passport.value_additions && !passport.regular_processing && passport.processing_logs?.length > 0 && (
              <Section title="Processing History" icon="🔧">
                {passport.processing_logs.map((log, i) => (
                  <div key={log.id || i} className="py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 capitalize">{log.process_type?.replace(/_/g, ' ')}</span>
                        {log.value_addition && <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">+{log.value_addition.short_code}</span>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        log.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {log.status === 'received' ? 'Returned' : 'Sent'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                      <span>{log.vendor_name}</span>
                      {log.sent_date && <span>Sent: {log.sent_date}</span>}
                      {log.received_date && <span>Returned: {log.received_date}</span>}
                      {log.processing_cost && <span>Cost: ₹{parseFloat(log.processing_cost).toLocaleString('en-IN')}</span>}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {/* Lots */}
            {passport.lots?.length > 0 && (
              <Section title="Cutting Lots" icon="✂️">
                {passport.lots.map((lot, i) => (
                  <div key={lot.id || i} className="py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-900 font-mono">{lot.lot_code}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        lot.status === 'distributed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>{lot.status}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                      {lot.lot_date && <span>{new Date(lot.lot_date).toLocaleDateString('en-IN')}</span>}
                      {lot.weight_used != null && <span>Used: {parseFloat(lot.weight_used).toFixed(1)} kg</span>}
                      {lot.pieces_from_roll != null && <span>Pieces: {lot.pieces_from_roll}</span>}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {/* Batches */}
            {passport.batches?.length > 0 && (
              <Section title="Stitching Batches" icon="🧵">
                {passport.batches.map((batch, i) => (
                  <div key={batch.id || i} className="py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900 font-mono">{batch.batch_code}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${batchStatusColor[batch.status] || 'bg-gray-100 text-gray-600'}`}>
                        {batch.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                      {batch.effective_sku && (
                        <span className="font-medium text-indigo-600">{batch.effective_sku}</span>
                      )}
                      {batch.quantity && <span>Qty: {batch.quantity}</span>}
                      {batch.tailor && <span>Tailor: {batch.tailor.full_name}</span>}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {/* Orders */}
            {passport.orders?.length > 0 && (
              <Section title="Orders" icon="📋">
                {passport.orders.map((order, i) => (
                  <InfoRow key={order.id || i} label={order.order_number} value={order.customer_name} />
                ))}
              </Section>
            )}

            {/* Footer note */}
            <p className="text-center text-xs text-gray-400 pb-4">
              Inventory-OS • Scan QR to see latest status
            </p>
          </div>
        )}
      </div>

      {/* Camera scanner overlay */}
      {showScanner && (
        <CameraScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}

// ── Small reusable sub-components (defined outside to avoid focus loss) ──

function Section({ title, icon, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <span>{icon}</span> {title}
      </h3>
      {children}
    </div>
  )
}

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex items-baseline gap-2 py-1 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 w-24 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  )
}

function Metric({ label, value }) {
  if (!value) return null
  return (
    <div className="text-center">
      <div className="text-sm font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  )
}
