import { useState, useEffect, useCallback } from 'react'
import { getCompany, updateCompany, getFinancialYears, createFinancialYear, updateFinancialYear } from '../api/company'
import ErrorAlert from '../components/common/ErrorAlert'
import StatusBadge from '../components/common/StatusBadge'

const TABS = [
  { key: 'company', label: 'Company Profile' },
  { key: 'fy', label: 'Financial Years' },
]

const INPUT = 'w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
const LABEL = 'block text-xs font-medium text-gray-500 mb-1'

export default function SettingsPage() {
  const [tab, setTab] = useState('company')
  const [error, setError] = useState(null)

  // Company
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

  useEffect(() => {
    if (tab === 'company') {
      getCompany().then((res) => {
        const d = res.data.data
        if (d) {
          const c = {}
          Object.keys(company).forEach((k) => { c[k] = d[k] ?? '' })
          setCompany(c)
        }
      }).catch(() => {})
    } else {
      getFinancialYears().then((res) => {
        setFYs(res.data.data || [])
      }).catch(() => {})
    }
  }, [tab])

  const handleCompanySave = async () => {
    setCompanySaving(true)
    setError(null)
    setCompanyMsg(null)
    try {
      const payload = {}
      Object.entries(company).forEach(([k, v]) => { payload[k] = v || null })
      payload.name = company.name || 'My Company'
      await updateCompany(payload)
      setCompanyMsg('Company profile saved')
      setTimeout(() => setCompanyMsg(null), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save')
    } finally {
      setCompanySaving(false)
    }
  }

  const handleFYCreate = async () => {
    if (!fyForm.code || !fyForm.start_date || !fyForm.end_date) return
    setFYCreating(true)
    setError(null)
    try {
      await createFinancialYear(fyForm)
      const res = await getFinancialYears()
      setFYs(res.data.data || [])
      setFYForm({ code: '', start_date: '', end_date: '', is_current: false })
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create FY')
    } finally {
      setFYCreating(false)
    }
  }

  const handleSetCurrent = async (fy) => {
    try {
      await updateFinancialYear(fy.id, { is_current: true })
      const res = await getFinancialYears()
      setFYs(res.data.data || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update')
    }
  }

  const set = (k, v) => setCompany((c) => ({ ...c, [k]: v }))

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800">Settings</h1>
      <p className="text-xs text-gray-500">Company profile and financial year configuration</p>

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

      {tab === 'company' && (
        <div className="mt-3 space-y-4 max-w-4xl">
          {companyMsg && <p className="text-xs text-green-600 font-medium">{companyMsg}</p>}

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Business Identity</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="md:col-span-2"><label className={LABEL}>Company Name</label><input value={company.name} onChange={(e) => set('name', e.target.value)} className={INPUT} placeholder="DRS Blouse" /></div>
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
              <div />
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
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Bank Details (for invoice footer)</h3>
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

      {tab === 'fy' && (
        <div className="mt-3 max-w-3xl space-y-4">
          {/* Create FY */}
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

          {/* FY List */}
          <div className="space-y-2">
            {fys.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No financial years created yet</p>
            ) : fys.map((fy) => (
              <div key={fy.id} className={`flex items-center justify-between rounded-lg border p-3 ${fy.is_current ? 'border-primary-300 bg-primary-50' : 'border-gray-200'}`}>
                <div>
                  <span className="text-sm font-bold text-gray-800">{fy.code}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {new Date(fy.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} — {new Date(fy.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={fy.status} />
                  {fy.is_current && <span className="text-xs font-bold text-primary-600 bg-primary-100 rounded-full px-2 py-0.5">CURRENT</span>}
                  {!fy.is_current && fy.status === 'open' && (
                    <button onClick={() => handleSetCurrent(fy)} className="text-xs text-primary-600 hover:underline">Set Current</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
