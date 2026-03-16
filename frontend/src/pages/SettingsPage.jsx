import { useState, useEffect } from 'react'
import { getCompany, updateCompany, getFinancialYears, createFinancialYear, updateFinancialYear, deleteFinancialYear, getCompanies, createNewCompany, closeFYPreview, closeFY } from '../api/company'
import { useAuth } from '../hooks/useAuth'
import ErrorAlert from '../components/common/ErrorAlert'
import StatusBadge from '../components/common/StatusBadge'

const INPUT = 'w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
const LABEL = 'block text-xs font-medium text-gray-500 mb-1'

const MASTER_OPTIONS = [
  { key: 'colors', label: 'Colors', color: 'bg-pink-400', group: 'item' },
  { key: 'fabrics', label: 'Fabrics', color: 'bg-amber-400', group: 'item' },
  { key: 'product_types', label: 'Product Types', color: 'bg-sky-400', group: 'item' },
  { key: 'value_additions', label: 'VA Types', color: 'bg-violet-400', group: 'item' },
  { key: 'suppliers', label: 'Suppliers', color: 'bg-emerald-400', group: 'party' },
  { key: 'customers', label: 'Customers', color: 'bg-blue-400', group: 'party' },
  { key: 'va_parties', label: 'VA Parties', color: 'bg-orange-400', group: 'party' },
]

export default function SettingsPage() {
  const { role, company: activeCompany, selectCompany } = useAuth()
  const isAdmin = role === 'admin'

  const TABS = [
    { key: 'company', label: 'Company Profile' },
    { key: 'fy', label: 'Financial Years' },
    ...(isAdmin ? [{ key: 'companies', label: 'Companies' }] : []),
  ]

  const [tab, setTab] = useState('company')
  const [error, setError] = useState(null)

  // Company Profile
  const [company, setCompany] = useState({
    name: '', address: '', city: '', state: '', pin_code: '',
    gst_no: '', state_code: '', pan_no: '', phone: '', email: '',
    logo_url: '', bank_name: '', bank_account: '', bank_ifsc: '', bank_branch: '',
  })
  const [companySaving, setCompanySaving] = useState(false)
  const [companyMsg, setCompanyMsg] = useState(null)

  // FY
  const [fys, setFYs] = useState([])
  const [fyForm, setFYForm] = useState({ code: '', start_date: '', end_date: '', is_current: false })
  const [fyCreating, setFYCreating] = useState(false)

  // FY Edit
  const [editingFy, setEditingFy] = useState(null) // { id, code, start_date, end_date }
  const [fySaving, setFySaving] = useState(false)

  // FY Closing
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closePreview, setClosePreview] = useState(null)
  const [closeLoading, setCloseLoading] = useState(false)
  const [closeForm, setCloseForm] = useState({ new_fy_code: '', new_start_date: '', new_end_date: '' })
  const [closing, setClosing] = useState(false)

  // Companies list + create wizard
  const [allCompanies, setAllCompanies] = useState([])
  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [wizardData, setWizardData] = useState({
    name: '', city: '', gst_no: '', state_code: '', pan_no: '', phone: '', email: '', address: '',
    copy_from_company_id: null, inherit_masters: [...MASTER_OPTIONS.map((m) => m.key)],
  })
  const [wizardCreating, setWizardCreating] = useState(false)

  useEffect(() => {
    setError(null)
    if (tab === 'company') {
      getCompany().then((res) => {
        const d = res.data.data
        if (d) {
          const c = {}
          Object.keys(company).forEach((k) => { c[k] = d[k] ?? '' })
          setCompany(c)
        }
      }).catch(() => {})
    } else if (tab === 'fy') {
      getFinancialYears().then((res) => setFYs(res.data.data || [])).catch(() => {})
    } else if (tab === 'companies') {
      getCompanies().then((res) => setAllCompanies(res.data.data || [])).catch(() => {})
    }
  }, [tab])

  const handleCompanySave = async () => {
    setCompanySaving(true); setError(null); setCompanyMsg(null)
    try {
      const payload = {}
      Object.entries(company).forEach(([k, v]) => { payload[k] = v || null })
      payload.name = company.name || 'My Company'
      await updateCompany(payload)
      setCompanyMsg('Company profile saved')
      setTimeout(() => setCompanyMsg(null), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save')
    } finally { setCompanySaving(false) }
  }

  // After any FY change, refresh the JWT so header badge updates
  const refreshFYContext = async () => {
    const res = await getFinancialYears()
    setFYs(res.data.data || [])
    // Re-select company to refresh JWT with current FY
    if (activeCompany?.id) {
      try { await selectCompany(activeCompany.id) } catch { /* ignore */ }
    }
  }

  const handleFYCreate = async () => {
    if (!fyForm.code || !fyForm.start_date || !fyForm.end_date) return
    setFYCreating(true); setError(null)
    try {
      await createFinancialYear(fyForm)
      await refreshFYContext()
      setFYForm({ code: '', start_date: '', end_date: '', is_current: false })
    } catch (err) { setError(err.response?.data?.detail || 'Failed to create FY') }
    finally { setFYCreating(false) }
  }

  const handleSetCurrent = async (fy) => {
    try {
      await updateFinancialYear(fy.id, { is_current: true })
      await refreshFYContext()
    } catch (err) { setError(err.response?.data?.detail || 'Failed to update') }
  }

  const toggleInherit = (key) => {
    setWizardData((d) => ({
      ...d,
      inherit_masters: d.inherit_masters.includes(key)
        ? d.inherit_masters.filter((k) => k !== key)
        : [...d.inherit_masters, key],
    }))
  }

  const toggleGroup = (group) => {
    const groupKeys = MASTER_OPTIONS.filter((m) => m.group === group).map((m) => m.key)
    const allSelected = groupKeys.every((k) => wizardData.inherit_masters.includes(k))
    setWizardData((d) => ({
      ...d,
      inherit_masters: allSelected
        ? d.inherit_masters.filter((k) => !groupKeys.includes(k))
        : [...new Set([...d.inherit_masters, ...groupKeys])],
    }))
  }

  const handleWizardCreate = async () => {
    if (!wizardData.name.trim()) return
    setWizardCreating(true); setError(null)
    try {
      const body = {
        name: wizardData.name,
        city: wizardData.city || null,
        gst_no: wizardData.gst_no || null,
        state_code: wizardData.state_code || null,
        pan_no: wizardData.pan_no || null,
        phone: wizardData.phone || null,
        email: wizardData.email || null,
        address: wizardData.address || null,
      }
      if (wizardData.copy_from_company_id) {
        body.copy_from_company_id = wizardData.copy_from_company_id
        body.inherit_masters = wizardData.inherit_masters.length > 0 ? wizardData.inherit_masters : null
      }
      await createNewCompany(body)
      const res = await getCompanies()
      setAllCompanies(res.data.data || [])
      setShowWizard(false)
      setWizardStep(1)
      setWizardData({
        name: '', city: '', gst_no: '', state_code: '', pan_no: '', phone: '', email: '', address: '',
        copy_from_company_id: null, inherit_masters: [...MASTER_OPTIONS.map((m) => m.key)],
      })
    } catch (err) { setError(err.response?.data?.detail || 'Failed to create company') }
    finally { setWizardCreating(false) }
  }

  const handleFYEdit = async () => {
    if (!editingFy) return
    setFySaving(true); setError(null)
    try {
      await updateFinancialYear(editingFy.id, {
        code: editingFy.code,
        start_date: editingFy.start_date,
        end_date: editingFy.end_date,
      })
      await refreshFYContext()
      setEditingFy(null)
    } catch (err) { setError(err.response?.data?.detail || 'Failed to update') }
    finally { setFySaving(false) }
  }

  const handleFYDelete = async (fy) => {
    if (!confirm(`Delete ${fy.code}? This cannot be undone.`)) return
    setError(null)
    try {
      await deleteFinancialYear(fy.id)
      const res = await getFinancialYears()
      setFYs(res.data.data || [])
    } catch (err) { setError(err.response?.data?.detail || 'Failed to delete') }
  }

  const handleClosePreview = async (fy) => {
    setCloseLoading(true); setError(null)
    try {
      const res = await closeFYPreview(fy.id)
      setClosePreview({ ...res.data.data, fy_id: fy.id })
      // Auto-suggest next FY code
      const year = new Date(fy.end_date).getFullYear()
      setCloseForm({
        new_fy_code: `FY${year}-${(year + 1).toString().slice(2)}`,
        new_start_date: `${year}-04-01`,
        new_end_date: `${year + 1}-03-31`,
      })
      setShowCloseModal(true)
    } catch (err) { setError(err.response?.data?.detail || 'Failed to load preview') }
    finally { setCloseLoading(false) }
  }

  const handleCloseFY = async () => {
    if (!closePreview || !closeForm.new_fy_code) return
    setClosing(true); setError(null)
    try {
      await closeFY(closePreview.fy_id, closeForm)
      const res = await getFinancialYears()
      setFYs(res.data.data || [])
      setShowCloseModal(false)
      setClosePreview(null)
    } catch (err) { setError(err.response?.data?.detail || 'Failed to close FY') }
    finally { setClosing(false) }
  }

  const set = (k, v) => setCompany((c) => ({ ...c, [k]: v }))
  const setW = (k, v) => setWizardData((d) => ({ ...d, [k]: v }))

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800">Settings</h1>
      <p className="text-xs text-gray-500">Company profile, financial years, and multi-company management</p>

      <div className="mt-2 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="mt-2"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      {/* ── Company Profile Tab ── */}
      {tab === 'company' && (
        <div className="mt-3 space-y-4 max-w-4xl">
          {companyMsg && <p className="text-xs text-green-600 font-medium">{companyMsg}</p>}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Business Identity</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="md:col-span-2"><label className={LABEL}>Company Name</label><input value={company.name} onChange={(e) => set('name', e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>Phone</label><input value={company.phone} onChange={(e) => set('phone', e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>Email</label><input value={company.email} onChange={(e) => set('email', e.target.value)} className={INPUT} /></div>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">GST & PAN</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><label className={LABEL}>GST No.</label><input value={company.gst_no} onChange={(e) => set('gst_no', e.target.value.toUpperCase())} className={INPUT} maxLength={15} /></div>
              <div><label className={LABEL}>State Code</label><input value={company.state_code} onChange={(e) => set('state_code', e.target.value)} className={INPUT} maxLength={2} /></div>
              <div><label className={LABEL}>PAN No.</label><input value={company.pan_no} onChange={(e) => set('pan_no', e.target.value.toUpperCase())} className={INPUT} maxLength={10} /></div>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Address</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="md:col-span-2"><label className={LABEL}>Address</label><input value={company.address} onChange={(e) => set('address', e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>City</label><input value={company.city} onChange={(e) => set('city', e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>State</label><input value={company.state} onChange={(e) => set('state', e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>PIN Code</label><input value={company.pin_code} onChange={(e) => set('pin_code', e.target.value)} className={INPUT} maxLength={6} /></div>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Bank Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><label className={LABEL}>Bank Name</label><input value={company.bank_name} onChange={(e) => set('bank_name', e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>Account No.</label><input value={company.bank_account} onChange={(e) => set('bank_account', e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>IFSC Code</label><input value={company.bank_ifsc} onChange={(e) => set('bank_ifsc', e.target.value.toUpperCase())} className={INPUT} maxLength={11} /></div>
              <div><label className={LABEL}>Branch</label><input value={company.bank_branch} onChange={(e) => set('bank_branch', e.target.value)} className={INPUT} /></div>
            </div>
          </div>
          <button onClick={handleCompanySave} disabled={companySaving}
            className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            {companySaving ? 'Saving...' : 'Save Company Profile'}
          </button>
        </div>
      )}

      {/* ── Financial Years Tab ── */}
      {tab === 'fy' && (
        <div className="mt-3 max-w-3xl space-y-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Create Financial Year</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
              <div><label className={LABEL}>Code</label><input value={fyForm.code} onChange={(e) => setFYForm(f => ({ ...f, code: e.target.value }))} className={INPUT} placeholder="FY2026-27" /></div>
              <div><label className={LABEL}>Start Date</label><input type="date" value={fyForm.start_date} onChange={(e) => setFYForm(f => ({ ...f, start_date: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>End Date</label><input type="date" value={fyForm.end_date} onChange={(e) => setFYForm(f => ({ ...f, end_date: e.target.value }))} className={INPUT} /></div>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={fyForm.is_current} onChange={(e) => setFYForm(f => ({ ...f, is_current: e.target.checked }))} /> Current</label>
              <button onClick={handleFYCreate} disabled={fyCreating} className="rounded bg-primary-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-primary-700 disabled:opacity-50">
                {fyCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {fys.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No financial years created yet</p>
            ) : fys.map((fy) => (
              <div key={fy.id} className={`rounded-lg border p-3 ${fy.is_current ? 'border-primary-300 bg-primary-50' : 'border-gray-200'}`}>
                {/* Edit mode */}
                {editingFy?.id === fy.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div><label className={LABEL}>Code</label><input value={editingFy.code} onChange={(e) => setEditingFy(f => ({ ...f, code: e.target.value }))} className={INPUT} /></div>
                      <div><label className={LABEL}>Start Date</label><input type="date" value={editingFy.start_date} onChange={(e) => setEditingFy(f => ({ ...f, start_date: e.target.value }))} className={INPUT} /></div>
                      <div><label className={LABEL}>End Date</label><input type="date" value={editingFy.end_date} onChange={(e) => setEditingFy(f => ({ ...f, end_date: e.target.value }))} className={INPUT} /></div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleFYEdit} disabled={fySaving} className="rounded bg-primary-600 text-white px-3 py-1 text-xs font-bold hover:bg-primary-700 disabled:opacity-50">
                        {fySaving ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => setEditingFy(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-gray-800">{fy.code}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {new Date(fy.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} — {new Date(fy.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={fy.status} />
                      {fy.is_current && <span className="text-xs font-bold text-primary-600 bg-primary-100 rounded-full px-2 py-0.5">CURRENT</span>}
                      {fy.status === 'open' && (
                        <button onClick={() => setEditingFy({ id: fy.id, code: fy.code, start_date: fy.start_date, end_date: fy.end_date })}
                          className="text-xs text-gray-500 hover:text-primary-600">Edit</button>
                      )}
                      {fy.is_current && fy.status === 'open' && isAdmin && (
                        <button onClick={() => handleClosePreview(fy)} disabled={closeLoading}
                          className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                          {closeLoading ? 'Loading...' : 'Close Year'}
                        </button>
                      )}
                      {!fy.is_current && fy.status === 'open' && (
                        <>
                          <button onClick={() => handleSetCurrent(fy)} className="text-xs text-primary-600 hover:underline">Set Current</button>
                          <button onClick={() => handleFYDelete(fy)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Close Year Modal ── */}
          {showCloseModal && closePreview && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="w-full max-w-lg mx-4 rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
                <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold">Close Financial Year</h2>
                      <p className="text-sm text-red-200">{closePreview.fy.code} ({closePreview.fy.start_date} to {closePreview.fy.end_date})</p>
                    </div>
                    <button onClick={() => setShowCloseModal(false)} className="rounded-lg p-1 hover:bg-white/20">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {/* Warnings */}
                  {closePreview.warnings.length > 0 && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                      <h4 className="text-xs font-bold text-amber-800 uppercase mb-1">Warnings</h4>
                      {closePreview.warnings.map((w, i) => (
                        <p key={i} className="text-sm text-amber-700">{w}</p>
                      ))}
                    </div>
                  )}

                  {/* Balance Summary */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Closing Balances</h4>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                        <p className="text-lg font-bold text-gray-800">{closePreview.balances?.suppliers?.length || 0}</p>
                        <p className="text-[10px] text-gray-500 uppercase">Suppliers</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                        <p className="text-lg font-bold text-gray-800">{closePreview.balances?.customers?.length || 0}</p>
                        <p className="text-[10px] text-gray-500 uppercase">Customers</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                        <p className="text-lg font-bold text-gray-800">{closePreview.balances?.va_parties?.length || 0}</p>
                        <p className="text-[10px] text-gray-500 uppercase">VA Parties</p>
                      </div>
                    </div>
                    {(closePreview.balances?.summary?.parties_with_balance || 0) > 0 && (
                      <p className="mt-2 text-xs text-gray-500">
                        {closePreview.balances.summary.parties_with_balance} parties with outstanding balances will be carried forward as opening entries.
                      </p>
                    )}
                  </div>

                  {/* New FY Details */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">New Financial Year</h4>
                    <div className="grid grid-cols-3 gap-2">
                      <div><label className={LABEL}>Code</label><input value={closeForm.new_fy_code} onChange={(e) => setCloseForm(f => ({ ...f, new_fy_code: e.target.value }))} className={INPUT} /></div>
                      <div><label className={LABEL}>Start Date</label><input type="date" value={closeForm.new_start_date} onChange={(e) => setCloseForm(f => ({ ...f, new_start_date: e.target.value }))} className={INPUT} /></div>
                      <div><label className={LABEL}>End Date</label><input type="date" value={closeForm.new_end_date} onChange={(e) => setCloseForm(f => ({ ...f, new_end_date: e.target.value }))} className={INPUT} /></div>
                    </div>
                  </div>

                  {/* What happens */}
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                    <h4 className="text-xs font-bold text-blue-800 uppercase mb-1">What will happen</h4>
                    <ul className="text-xs text-blue-700 space-y-0.5 list-disc ml-4">
                      <li>{closePreview.fy.code} will be marked as <strong>closed</strong></li>
                      <li>Party balances will be snapshot for audit</li>
                      <li>Opening balance entries created in {closeForm.new_fy_code || 'new FY'}</li>
                      <li>Counters (ORD, INV, JC, BC, etc.) restart from 001</li>
                      <li>All existing stock, batches, challans remain untouched</li>
                    </ul>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3 bg-gray-50">
                  <button onClick={() => setShowCloseModal(false)} className="text-sm text-gray-600 hover:text-gray-900 font-medium">Cancel</button>
                  <button onClick={handleCloseFY} disabled={closing || !closeForm.new_fy_code}
                    className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                    {closing ? 'Closing...' : 'Confirm Close Year'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Companies Tab (admin only) ── */}
      {tab === 'companies' && (
        <div className="mt-3 max-w-4xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">{allCompanies.length} {allCompanies.length === 1 ? 'Company' : 'Companies'}</h3>
            <button
              onClick={() => { setShowWizard(true); setWizardStep(1) }}
              className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors shadow-sm"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Company
            </button>
          </div>

          {/* Company cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            {allCompanies.map((c) => (
              <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-lg font-bold text-white shadow-sm">
                    {c.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-gray-900 truncate">{c.name}</h4>
                    <p className="text-xs text-gray-500 font-mono">{c.schema_name}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.city && <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">{c.city}</span>}
                      {c.gst_no && <span className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-[10px] font-mono text-blue-600">{c.gst_no}</span>}
                      {c.is_active ? (
                        <span className="inline-flex items-center rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">Active</span>
                      ) : (
                        <span className="inline-flex items-center rounded bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">Inactive</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Create Company Wizard (overlay) ── */}
          {showWizard && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="w-full max-w-lg mx-4 rounded-2xl bg-white shadow-2xl overflow-hidden">
                {/* Wizard header */}
                <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold">Create Company</h2>
                      <p className="text-sm text-primary-200">Step {wizardStep} of 2</p>
                    </div>
                    <button onClick={() => setShowWizard(false)} className="rounded-lg p-1 hover:bg-white/20 transition-colors">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {/* Step indicator */}
                  <div className="mt-3 flex gap-2">
                    <div className={`h-1 flex-1 rounded-full ${wizardStep >= 1 ? 'bg-white' : 'bg-white/30'}`} />
                    <div className={`h-1 flex-1 rounded-full ${wizardStep >= 2 ? 'bg-white' : 'bg-white/30'}`} />
                  </div>
                </div>

                <div className="px-6 py-5">
                  {error && <div className="mb-3"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

                  {/* Step 1: Company Details */}
                  {wizardStep === 1 && (
                    <div className="space-y-3">
                      <div>
                        <label className={LABEL}>Company Name *</label>
                        <input value={wizardData.name} onChange={(e) => setW('name', e.target.value)} className={INPUT} placeholder="Krishna Textiles" autoFocus />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className={LABEL}>City</label><input value={wizardData.city} onChange={(e) => setW('city', e.target.value)} className={INPUT} /></div>
                        <div><label className={LABEL}>Phone</label><input value={wizardData.phone} onChange={(e) => setW('phone', e.target.value)} className={INPUT} /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className={LABEL}>GST No.</label><input value={wizardData.gst_no} onChange={(e) => setW('gst_no', e.target.value.toUpperCase())} className={INPUT} maxLength={15} /></div>
                        <div><label className={LABEL}>PAN No.</label><input value={wizardData.pan_no} onChange={(e) => setW('pan_no', e.target.value.toUpperCase())} className={INPUT} maxLength={10} /></div>
                      </div>
                      <div>
                        <label className={LABEL}>Email</label>
                        <input value={wizardData.email} onChange={(e) => setW('email', e.target.value)} className={INPUT} />
                      </div>
                    </div>
                  )}

                  {/* Step 2: Inherit Masters */}
                  {wizardStep === 2 && (
                    <div className="space-y-4">
                      {allCompanies.length > 0 && (
                        <div>
                          <label className={LABEL}>Copy Masters From</label>
                          <select
                            value={wizardData.copy_from_company_id || ''}
                            onChange={(e) => setW('copy_from_company_id', e.target.value || null)}
                            className={INPUT}
                          >
                            <option value="">None — start fresh</option>
                            {allCompanies.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {wizardData.copy_from_company_id && (
                        <div className="space-y-3">
                          {/* Item Masters */}
                          <div className="rounded-lg border border-gray-200 p-3">
                            <label className="flex items-center gap-2 mb-2 cursor-pointer" onClick={() => toggleGroup('item')}>
                              <input
                                type="checkbox"
                                readOnly
                                checked={MASTER_OPTIONS.filter((m) => m.group === 'item').every((m) => wizardData.inherit_masters.includes(m.key))}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Item Masters</span>
                            </label>
                            <div className="grid grid-cols-2 gap-1.5 pl-6">
                              {MASTER_OPTIONS.filter((m) => m.group === 'item').map((m) => (
                                <label key={m.key} className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 hover:bg-gray-50 transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={wizardData.inherit_masters.includes(m.key)}
                                    onChange={() => toggleInherit(m.key)}
                                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                  />
                                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${m.color}`} />
                                  <span className="text-sm text-gray-700">{m.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          {/* Party Masters */}
                          <div className="rounded-lg border border-gray-200 p-3">
                            <label className="flex items-center gap-2 mb-2 cursor-pointer" onClick={() => toggleGroup('party')}>
                              <input
                                type="checkbox"
                                readOnly
                                checked={MASTER_OPTIONS.filter((m) => m.group === 'party').every((m) => wizardData.inherit_masters.includes(m.key))}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Party Masters</span>
                            </label>
                            <div className="grid grid-cols-2 gap-1.5 pl-6">
                              {MASTER_OPTIONS.filter((m) => m.group === 'party').map((m) => (
                                <label key={m.key} className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 hover:bg-gray-50 transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={wizardData.inherit_masters.includes(m.key)}
                                    onChange={() => toggleInherit(m.key)}
                                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                  />
                                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${m.color}`} />
                                  <span className="text-sm text-gray-700">{m.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <p className="text-[11px] text-gray-400 italic">Opening balances are reset for party masters. All records get fresh IDs — fully independent from the source company.</p>
                        </div>
                      )}

                      {!wizardData.copy_from_company_id && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                          <p className="text-sm text-amber-800 font-medium">Starting fresh</p>
                          <p className="text-xs text-amber-600 mt-0.5">Default masters (10 colors, 5 product types, 10 VA types) will be seeded. Add more from the Masters page.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Wizard footer */}
                <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3 bg-gray-50">
                  {wizardStep > 1 ? (
                    <button onClick={() => setWizardStep((s) => s - 1)} className="text-sm text-gray-600 hover:text-gray-900 font-medium">
                      Back
                    </button>
                  ) : <div />}

                  {wizardStep < 2 ? (
                    <button
                      onClick={() => {
                        if (!wizardData.name.trim()) { setError('Company name is required'); return }
                        setError(null)
                        setWizardStep(2)
                      }}
                      className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      onClick={handleWizardCreate}
                      disabled={wizardCreating}
                      className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {wizardCreating ? 'Creating...' : 'Create Company'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
