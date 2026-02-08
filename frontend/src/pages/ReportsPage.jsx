import { useState, useEffect } from 'react'
import { getTailorPerf, getMovement } from '../api/dashboard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorAlert from '../components/common/ErrorAlert'

export default function ReportsPage() {
  const [tailorData, setTailorData] = useState([])
  const [movementData, setMovementData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      setError(null)
      try {
        const [tailorRes, movementRes] = await Promise.all([
          getTailorPerf(),
          getMovement(),
        ])
        setTailorData(tailorRes.data.data)
        setMovementData(movementRes.data.data)
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load reports')
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" text="Loading reports..." /></div>

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">Performance metrics and inventory movement analysis</p>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {/* Tailor Performance */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Tailor Performance</h2>
        {tailorData.length === 0 ? (
          <p className="text-sm text-gray-500">No tailor performance data available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">Tailor</th>
                  <th className="pb-3 font-medium">Batches Completed</th>
                  <th className="pb-3 font-medium">Pieces Completed</th>
                  <th className="pb-3 font-medium">Avg Days</th>
                  <th className="pb-3 font-medium">Rejection Rate</th>
                </tr>
              </thead>
              <tbody>
                {tailorData.map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-medium text-gray-800">{row.tailor?.full_name}</td>
                    <td className="py-3">{row.batches_completed}</td>
                    <td className="py-3">{row.pieces_completed}</td>
                    <td className="py-3">{row.avg_completion_days}</td>
                    <td className="py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.rejection_rate > 5 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {row.rejection_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inventory Movement */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Inventory Movement</h2>
        {movementData.length === 0 ? (
          <p className="text-sm text-gray-500">No inventory movement data available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">SKU</th>
                  <th className="pb-3 font-medium">Period</th>
                  <th className="pb-3 font-medium">Stock In</th>
                  <th className="pb-3 font-medium">Stock Out</th>
                  <th className="pb-3 font-medium">Returns</th>
                  <th className="pb-3 font-medium">Losses</th>
                  <th className="pb-3 font-medium">Net Change</th>
                  <th className="pb-3 font-medium">Closing</th>
                </tr>
              </thead>
              <tbody>
                {movementData.map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-medium text-gray-800">{row.sku_code}</td>
                    <td className="py-3 text-gray-500 text-xs">{row.period?.from} — {row.period?.to}</td>
                    <td className="py-3 text-green-600">+{row.stock_in}</td>
                    <td className="py-3 text-red-600">-{row.stock_out}</td>
                    <td className="py-3">{row.returns}</td>
                    <td className="py-3">{row.losses}</td>
                    <td className="py-3">
                      <span className={`font-medium ${row.net_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {row.net_change >= 0 ? '+' : ''}{row.net_change}
                      </span>
                    </td>
                    <td className="py-3 font-semibold">{row.closing_stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
