import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getBatch } from '../api/batches'
import StatusBadge from '../components/common/StatusBadge'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorAlert from '../components/common/ErrorAlert'
import BatchLabelSheet from '../components/common/BatchLabelSheet'

const TIMELINE_STEPS = [
  { key: 'created_at', label: 'Created', status: 'CREATED' },
  { key: 'assigned_at', label: 'Assigned', status: 'ASSIGNED' },
  { key: 'started_at', label: 'Started', status: 'IN_PROGRESS' },
  { key: 'submitted_at', label: 'Submitted', status: 'SUBMITTED' },
  { key: 'completed_at', label: 'Completed', status: 'COMPLETED' },
]

export default function BatchDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [batch, setBatch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Label sheet
  const [labelBatches, setLabelBatches] = useState(null)

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      try {
        const res = await getBatch(id)
        setBatch(res.data.data)
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load batch')
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [id])

  const handlePrintLabel = () => {
    if (!batch) return
    setLabelBatches([batch])
  }

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" text="Loading batch..." /></div>
  if (error) return <ErrorAlert message={error} />
  if (!batch) return <ErrorAlert message="Batch not found" />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/batches')} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
          &larr; Back
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-800">{batch.batch_code}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {batch.lot ? `${batch.lot.lot_code} — Design ${batch.lot.design_no}` : batch.sku ? `${batch.sku.sku_code} — ${batch.sku.product_name}` : ''}
            {batch.size && <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">{batch.size}</span>}
          </p>
        </div>
        <button onClick={handlePrintLabel}
          className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print Label
        </button>
        <StatusBadge status={batch.status} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Pieces</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{batch.piece_count ?? batch.quantity ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Size</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{batch.size || '—'}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Approved / Rejected</p>
          <p className="mt-1 text-2xl font-bold">
            <span className="text-green-600">{batch.approved_qty ?? '—'}</span>
            <span className="text-gray-300 mx-1">/</span>
            <span className="text-red-600">{batch.rejected_qty ?? '—'}</span>
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Tailor</p>
          <p className="mt-1 text-lg font-semibold text-gray-800">{batch.assignment?.tailor?.full_name || 'Unassigned'}</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Timeline</h2>
        <div className="flex items-start gap-0">
          {TIMELINE_STEPS.map((step, i) => {
            const ts = batch[step.key]
            const done = !!ts
            return (
              <div key={step.key} className="flex-1 text-center">
                <div className="flex items-center justify-center">
                  {i > 0 && <div className={`h-0.5 flex-1 ${done ? 'bg-primary-500' : 'bg-gray-200'}`} />}
                  <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                    done ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-400'
                  }`}>
                    {done ? '✓' : i + 1}
                  </div>
                  {i < TIMELINE_STEPS.length - 1 && <div className={`h-0.5 flex-1 ${TIMELINE_STEPS[i + 1] && batch[TIMELINE_STEPS[i + 1].key] ? 'bg-primary-500' : 'bg-gray-200'}`} />}
                </div>
                <p className={`mt-2 text-xs font-medium ${done ? 'text-gray-800' : 'text-gray-400'}`}>{step.label}</p>
                {ts && <p className="text-[10px] text-gray-400">{new Date(ts).toLocaleString()}</p>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Lot Info */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Lot Info</h2>
        {batch.lot ? (
          <div className="space-y-2 text-sm">
            <div className="flex gap-4">
              <span className="text-gray-500">Lot:</span>
              <span className="font-medium">{batch.lot.lot_code}</span>
              <span className="text-gray-500">Design:</span>
              <span className="font-medium">{batch.lot.design_no}</span>
              <span className="text-gray-500">Total Pieces:</span>
              <span className="font-medium">{batch.lot.total_pieces}</span>
            </div>
            {batch.color_breakdown && (
              <div className="flex gap-2 flex-wrap">
                <span className="text-gray-500">Colors:</span>
                {Object.entries(batch.color_breakdown).map(([color, qty]) => (
                  <span key={color} className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                    {color}: {qty}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No lot linked.</p>
        )}
      </div>

      {/* Details */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Details</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Created By</dt>
            <dd className="font-medium">{batch.created_by_user?.full_name || '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">QR Code</dt>
            <dd className="font-medium text-xs break-all">{batch.qr_code_data || '—'}</dd>
          </div>
          {batch.rejection_reason && (
            <div className="col-span-2">
              <dt className="text-gray-500">Rejection Reason</dt>
              <dd className="font-medium text-red-600">{batch.rejection_reason}</dd>
            </div>
          )}
          {batch.notes && (
            <div className="col-span-2">
              <dt className="text-gray-500">Notes</dt>
              <dd className="font-medium">{batch.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Batch Label Sheet (reprint) */}
      {labelBatches && (
        <BatchLabelSheet
          batches={labelBatches}
          lotCode={batch.lot?.lot_code || '—'}
          designNo={batch.lot?.design_no || '—'}
          lotDate={batch.lot?.lot_date || batch.created_at || ''}
          onClose={() => setLabelBatches(null)}
        />
      )}
    </div>
  )
}
