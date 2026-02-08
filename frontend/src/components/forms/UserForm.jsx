import ErrorAlert from '../common/ErrorAlert'

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'

export default function UserForm({ form, onChange, roles = [], editing = false, error = null, onDismissError }) {
  const set = (k, v) => onChange({ ...form, [k]: v })

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error} onDismiss={onDismissError} />}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
        <input type="text" value={form.username} onChange={(e) => set('username', e.target.value)}
          disabled={editing} className={`${INPUT} disabled:bg-gray-100`} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Password {editing && <span className="text-gray-400">(leave blank to keep)</span>}
        </label>
        <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} className={INPUT} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
        <input type="text" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} className={INPUT} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
        <select value={form.role_id} onChange={(e) => set('role_id', e.target.value)} className={INPUT}>
          <option value="">Select role</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.display_name || r.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
        <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={INPUT} />
      </div>
    </div>
  )
}
