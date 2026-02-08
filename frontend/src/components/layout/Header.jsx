import { useAuth } from '../../hooks/useAuth'

const ROLE_COLORS = {
  admin:      'bg-red-100 text-red-700',
  supervisor: 'bg-blue-100 text-blue-700',
  billing:    'bg-green-100 text-green-700',
  tailor:     'bg-yellow-100 text-yellow-700',
  checker:    'bg-purple-100 text-purple-700',
}

export default function Header() {
  const { user, role, roleDisplayName, logout } = useAuth()

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      {/* Page context (left side) */}
      <div className="text-sm text-gray-500">
        Textile Inventory Management
      </div>

      {/* User info + logout (right side) */}
      <div className="flex items-center gap-4">
        {/* Role badge */}
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
            ROLE_COLORS[role] || 'bg-gray-100 text-gray-700'
          }`}
        >
          {roleDisplayName}
        </span>

        {/* User name */}
        <span className="text-sm font-medium text-gray-700">
          {user?.full_name}
        </span>

        {/* Logout button */}
        <button
          onClick={logout}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Logout
        </button>
      </div>
    </header>
  )
}
