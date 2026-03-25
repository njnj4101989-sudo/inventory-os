import ErrorAlert from '../common/ErrorAlert'
import FilterSelect from '../common/FilterSelect'

export default function UserForm({ form, onChange, roles = [], editing = false, error = null, onDismissError }) {
  const set = (k, v) => onChange({ ...form, [k]: v })

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error} onDismiss={onDismissError} />}
      <div>
        <label className="typo-label">Username</label>
        <input type="text" value={form.username} onChange={(e) => set('username', e.target.value)}
          disabled={editing} className="typo-input disabled:bg-gray-100" />
      </div>
      <div>
        <label className="typo-label">
          Password {editing && <span className="text-gray-400">(leave blank to keep)</span>}
        </label>
        <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} className="typo-input" />
      </div>
      <div>
        <label className="typo-label">Full Name</label>
        <input type="text" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} className="typo-input" />
      </div>
      <div>
        <label className="typo-label">Role</label>
        <FilterSelect full value={form.role_id} onChange={(v) => set('role_id', v)}
          options={[{ value: '', label: 'Select role' }, ...roles.map(r => ({ value: r.id, label: r.display_name || r.name }))]} />
      </div>
      <div>
        <label className="typo-label">Phone</label>
        <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className="typo-input" />
      </div>
    </div>
  )
}
