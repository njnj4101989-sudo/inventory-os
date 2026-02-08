import { useState, useEffect, useCallback } from 'react'
import { getUsers, createUser, updateUser } from '../api/users'
import { getRoles } from '../api/roles'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchInput from '../components/common/SearchInput'
import Pagination from '../components/common/Pagination'
import StatusBadge from '../components/common/StatusBadge'
import ErrorAlert from '../components/common/ErrorAlert'
import UserForm from '../components/forms/UserForm'

const COLUMNS = [
  { key: 'username', label: 'Username' },
  { key: 'full_name', label: 'Full Name' },
  {
    key: 'role',
    label: 'Role',
    render: (val) => (
      <StatusBadge
        status={val?.name === 'admin' ? 'active' : 'ASSIGNED'}
        label={val?.name}
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

const EMPTY_FORM = { username: '', password: '', full_name: '', role_id: '', phone: '' }

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  // Roles for dropdown
  const [roles, setRoles] = useState([])

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

  useEffect(() => { fetchUsers() }, [fetchUsers])

  useEffect(() => {
    getRoles().then((res) => setRoles(res.data.data)).catch(() => {})
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (user) => {
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

  const handleSave = async () => {
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Users</h1>
          <p className="mt-1 text-sm text-gray-500">Manage user accounts and role assignments</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
        >
          + Add User
        </button>
      </div>

      {/* Search */}
      <div className="mt-5 max-w-sm">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search users..." />
      </div>

      {error && <div className="mt-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      {/* Table */}
      <div className="mt-4">
        <DataTable
          columns={COLUMNS}
          data={users}
          loading={loading}
          onRowClick={openEdit}
          emptyText="No users found."
        />
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit User' : 'Create User'}
        actions={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
          </>
        }
      >
        <UserForm form={form} onChange={setForm} roles={roles} editing={!!editing}
          error={formError} onDismissError={() => setFormError(null)} />
      </Modal>
    </div>
  )
}
