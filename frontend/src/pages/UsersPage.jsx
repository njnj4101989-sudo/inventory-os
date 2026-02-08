import { useState, useEffect, useCallback } from 'react'
import { getUsers, createUser, updateUser } from '../api/users'
import { getRoles, createRole, updateRole, deleteRole, PERMISSIONS } from '../api/roles'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'
import UserForm from '../components/forms/UserForm'

// Helper: show display_name if set, otherwise fall back to name
const roleName = (role) => role?.display_name || role?.name || '—'

// All available permissions for the checklist
const ALL_PERMISSIONS = [
  { key: 'user_manage',      label: 'User Management' },
  { key: 'role_manage',      label: 'Role Management' },
  { key: 'supplier_manage',  label: 'Supplier Management' },
  { key: 'stock_in',         label: 'Stock In' },
  { key: 'roll_cut',         label: 'Roll Cutting' },
  { key: 'batch_create',     label: 'Batch Create' },
  { key: 'batch_assign',     label: 'Batch Assign' },
  { key: 'batch_start',      label: 'Batch Start' },
  { key: 'batch_submit',     label: 'Batch Submit' },
  { key: 'batch_check',      label: 'Batch Check (QC)' },
  { key: 'inventory_view',   label: 'Inventory View' },
  { key: 'inventory_adjust', label: 'Inventory Adjust' },
  { key: 'order_manage',     label: 'Order Management' },
  { key: 'invoice_manage',   label: 'Invoice Management' },
  { key: 'report_view',      label: 'Report View' },
]

const USER_COLUMNS = [
  { key: 'username', label: 'Username' },
  { key: 'full_name', label: 'Full Name' },
  {
    key: 'role',
    label: 'Role',
    render: (val) => (
      <StatusBadge
        status={val?.name === 'admin' ? 'active' : 'ASSIGNED'}
        label={roleName(val)}
      />
    ),
  },
  { key: 'phone', label: 'Phone' },
  {
    key: 'is_active',
    label: 'Status',
    render: (val) => <StatusBadge status={val ? 'active' : 'inactive'} />,
  },
  {
    key: 'created_at',
    label: 'Created',
    render: (val) => val ? new Date(val).toLocaleDateString() : '—',
  },
]

const EMPTY_USER_FORM = { username: '', password: '', full_name: '', role_id: '', phone: '' }
const EMPTY_ROLE_FORM = { name: '', display_name: '', permissions: {} }

// ─── Role color mapping ──────────────────────────────────
const ROLE_COLORS = {
  admin:      { bg: 'bg-purple-50',  border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' },
  supervisor: { bg: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  tailor:     { bg: 'bg-green-50',   border: 'border-green-200',  text: 'text-green-700',  dot: 'bg-green-500' },
  checker:    { bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  billing:    { bg: 'bg-rose-50',    border: 'border-rose-200',   text: 'text-rose-700',   dot: 'bg-rose-500' },
}
const DEFAULT_COLOR = { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', dot: 'bg-gray-500' }

export default function UsersPage() {
  const [tab, setTab] = useState('users')

  // ─── Users state ─────────────────────────────────────
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_USER_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  // ─── Roles state ─────────────────────────────────────
  const [roles, setRoles] = useState([])
  const [rolesLoading, setRolesLoading] = useState(true)
  const [rolesError, setRolesError] = useState(null)
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [roleForm, setRoleForm] = useState(EMPTY_ROLE_FORM)
  const [roleSaving, setRoleSaving] = useState(false)
  const [roleFormError, setRoleFormError] = useState(null)

  // ─── Fetch users ─────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getUsers({ page, page_size: 20, search: search || undefined })
      const data = res.data
      setUsers(data.data)
      setTotal(data.total)
      setPages(data.pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  // ─── Fetch roles ─────────────────────────────────────
  const fetchRoles = useCallback(async () => {
    setRolesLoading(true)
    setRolesError(null)
    try {
      const res = await getRoles()
      setRoles(res.data.data || res.data)
    } catch (err) {
      setRolesError(err.response?.data?.detail || 'Failed to load roles')
    } finally {
      setRolesLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])
  useEffect(() => { fetchRoles() }, [fetchRoles])

  // ─── User CRUD handlers ──────────────────────────────
  const openCreateUser = () => {
    setEditing(null)
    setForm(EMPTY_USER_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  const openEditUser = (user) => {
    setEditing(user)
    setForm({
      username: user.username,
      password: '',
      full_name: user.full_name,
      role_id: user.role?.id || '',
      phone: user.phone || '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  const handleSaveUser = async () => {
    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        const payload = { full_name: form.full_name, phone: form.phone, role_id: form.role_id }
        if (form.password) payload.password = form.password
        await updateUser(editing.id, payload)
      } else {
        await createUser(form)
      }
      setModalOpen(false)
      fetchUsers()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to save user')
    } finally {
      setSaving(false)
    }
  }

  // ─── Role CRUD handlers ──────────────────────────────
  const openCreateRole = () => {
    setEditingRole(null)
    setRoleForm(EMPTY_ROLE_FORM)
    setRoleFormError(null)
    setRoleModalOpen(true)
  }

  const openEditRole = (role) => {
    setEditingRole(role)
    setRoleForm({
      name: role.name,
      display_name: role.display_name || '',
      permissions: { ...role.permissions },
    })
    setRoleFormError(null)
    setRoleModalOpen(true)
  }

  const handleSaveRole = async () => {
    setRoleSaving(true)
    setRoleFormError(null)
    try {
      if (editingRole) {
        await updateRole(editingRole.id, {
          display_name: roleForm.display_name || null,
          permissions: roleForm.permissions,
        })
      } else {
        if (!roleForm.name.trim()) {
          setRoleFormError('Role name is required')
          setRoleSaving(false)
          return
        }
        await createRole({
          name: roleForm.name.toLowerCase().replace(/\s+/g, '_'),
          display_name: roleForm.display_name || null,
          permissions: roleForm.permissions,
        })
      }
      setRoleModalOpen(false)
      fetchRoles()
    } catch (err) {
      setRoleFormError(err.response?.data?.detail || 'Failed to save role')
    } finally {
      setRoleSaving(false)
    }
  }

  const handleDeleteRole = async (role) => {
    if (!confirm(`Delete role "${roleName(role)}"? This cannot be undone.`)) return
    try {
      await deleteRole(role.id)
      fetchRoles()
    } catch (err) {
      setRolesError(err.response?.data?.detail || 'Failed to delete role')
    }
  }

  const togglePerm = (key) => {
    setRoleForm((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: !prev.permissions[key] },
    }))
  }

  // ─── Render ──────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Users & Roles</h1>
          <p className="mt-1 text-sm text-gray-500">Manage user accounts and role configuration</p>
        </div>
        {tab === 'users' && (
          <button onClick={openCreateUser}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
            + Add User
          </button>
        )}
        {tab === 'roles' && (
          <button onClick={openCreateRole}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
            + Add Role
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="mt-5 flex gap-1 border-b border-gray-200">
        {['users', 'roles'].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}>
            {t === 'users' ? `Users (${total})` : `Roles (${roles.length})`}
          </button>
        ))}
      </div>

      {/* ─── Users Tab ──────────────────────────────── */}
      {tab === 'users' && (
        <>
          <div className="mt-4 max-w-sm">
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search users..." />
          </div>
          {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}
          <div className="mt-4">
            <DataTable columns={USER_COLUMNS} data={users} loading={loading}
              onRowClick={openEditUser} emptyText="No users found." />
            <Pagination page={page} pages={pages} total={total} onChange={setPage} />
          </div>
        </>
      )}

      {/* ─── Roles Tab ──────────────────────────────── */}
      {tab === 'roles' && (
        <div className="mt-4">
          {rolesError && <ErrorAlert message={rolesError} onDismiss={() => setRolesError(null)} />}
          {rolesLoading ? (
            <div className="text-center py-12 text-gray-400">Loading roles...</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((role) => {
                const c = ROLE_COLORS[role.name] || DEFAULT_COLOR
                const permCount = Object.values(role.permissions || {}).filter(Boolean).length
                return (
                  <div key={role.id}
                    className={`${c.bg} ${c.border} border rounded-xl p-5 hover:shadow-md transition-shadow`}>
                    {/* Role header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                        <div>
                          <h3 className={`font-semibold ${c.text}`}>
                            {roleName(role)}
                          </h3>
                          {role.display_name && (
                            <p className="text-xs text-gray-400 mt-0.5">system: {role.name}</p>
                          )}
                        </div>
                      </div>
                      <button onClick={() => openEditRole(role)}
                        className="p-1.5 rounded-lg hover:bg-white/60 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Edit role">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>

                    {/* Stats */}
                    <div className="mt-4 flex items-center gap-4 text-sm">
                      <span className="text-gray-600">
                        <span className="font-medium">{role.user_count}</span> user{role.user_count !== 1 ? 's' : ''}
                      </span>
                      <span className="text-gray-400">|</span>
                      <span className="text-gray-600">
                        <span className="font-medium">{permCount}</span> permission{permCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Permission pills */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {ALL_PERMISSIONS.filter((p) => role.permissions?.[p.key]).map((p) => (
                        <span key={p.key}
                          className={`inline-block px-2 py-0.5 text-xs rounded-full ${c.bg} ${c.text} border ${c.border}`}>
                          {p.label}
                        </span>
                      ))}
                    </div>

                    {/* Delete (only if no users) */}
                    {role.user_count === 0 && (
                      <button onClick={() => handleDeleteRole(role)}
                        className="mt-4 text-xs text-red-400 hover:text-red-600 transition-colors">
                        Delete role
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── User Create/Edit Modal ─────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? 'Edit User' : 'Create User'}
        actions={
          <>
            <button onClick={() => setModalOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleSaveUser} disabled={saving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
          </>
        }>
        <UserForm form={form} onChange={setForm} roles={roles} editing={!!editing}
          error={formError} onDismissError={() => setFormError(null)} />
      </Modal>

      {/* ─── Role Create/Edit Modal ─────────────────── */}
      <Modal open={roleModalOpen} onClose={() => setRoleModalOpen(false)}
        title={editingRole ? `Edit Role — ${roleName(editingRole)}` : 'Create Role'}
        wide
        actions={
          <>
            <button onClick={() => setRoleModalOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleSaveRole} disabled={roleSaving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {roleSaving ? 'Saving...' : editingRole ? 'Update' : 'Create'}
            </button>
          </>
        }>
        {roleFormError && (
          <div className="mb-4"><ErrorAlert message={roleFormError} onDismiss={() => setRoleFormError(null)} /></div>
        )}

        <div className="space-y-4">
          {/* Role name (only editable on create) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role Name (system key)
            </label>
            {editingRole ? (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{editingRole.name}</p>
            ) : (
              <input type="text" value={roleForm.name}
                onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. floor_manager"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500" />
            )}
          </div>

          {/* Display name (alias) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Display Name (alias shown in UI)
            </label>
            <input type="text" value={roleForm.display_name}
              onChange={(e) => setRoleForm((f) => ({ ...f, display_name: e.target.value }))}
              placeholder={editingRole ? editingRole.name : 'e.g. Floor Manager'}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500" />
            <p className="mt-1 text-xs text-gray-400">
              Leave blank to use the system name. This alias is what users see throughout the app.
            </p>
          </div>

          {/* Permissions checklist */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Permissions ({Object.values(roleForm.permissions).filter(Boolean).length} of {ALL_PERMISSIONS.length})
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto rounded-lg border border-gray-200 p-3">
              {ALL_PERMISSIONS.map((p) => (
                <label key={p.key}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm">
                  <input type="checkbox" checked={!!roleForm.permissions[p.key]}
                    onChange={() => togglePerm(p.key)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                  <span className="text-gray-700">{p.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
