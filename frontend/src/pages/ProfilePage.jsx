import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const ROLE_COLORS = {
  admin: 'bg-red-100 text-red-700',
  supervisor: 'bg-blue-100 text-blue-700',
  tailor: 'bg-emerald-100 text-emerald-700',
  checker: 'bg-purple-100 text-purple-700',
  billing: 'bg-amber-100 text-amber-700',
}

export default function ProfilePage() {
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="px-4 py-8 pb-24">
      <div className="max-w-sm mx-auto">
        {/* Avatar */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-3xl font-bold text-gray-500 mb-3">
            {user?.full_name?.[0]?.toUpperCase() || '?'}
          </div>
          <h1 className="text-xl font-bold text-gray-900">{user?.full_name || 'User'}</h1>
          <span className={`mt-2 inline-block px-3 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-600'}`}>
            {role?.charAt(0).toUpperCase() + role?.slice(1)}
          </span>
        </div>

        {/* Info */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
          <InfoRow label="Username" value={user?.username} />
          <InfoRow label="Role" value={role} />
          <InfoRow label="Email" value={user?.email || '—'} />
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="mt-6 w-full py-3 bg-red-50 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value || '—'}</span>
    </div>
  )
}
