import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getBatch } from '../api/batches'
import StatusBadge from '../components/common/StatusBadge'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorAlert from '../components/common/ErrorAlert'

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
            {batch.sku?.sku_code} — {batch.sku?.product_name}
          </p>
        </div>
        <StatusBadge status={batch.status} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Quantity</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{batch.quantity}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Approved</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{batch.approved_qty ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Rejected</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{batch.rejected_qty ?? '—'}</p>
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

      {/* Rolls Used */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Rolls Used</h2>
        {batch.rolls_used?.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 font-medium">Roll Code</th>
                <th className="pb-2 font-medium">Pieces Cut</th>
                <th className="pb-2 font-medium">Length Used</th>
              </tr>
            </thead>
            <tbody>
              {batch.rolls_used.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 font-medium">{r.roll_code}</td>
                  <td className="py-2">{r.pieces_cut}</td>
                  <td className="py-2">{r.length_used != null ? `${r.length_used} m` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No rolls assigned yet.</p>
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
    </div>
  )
}
