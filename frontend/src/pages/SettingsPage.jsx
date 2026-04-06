import { useState, useEffect } from 'react'
import { getCompany, updateCompany, getFinancialYears, createFinancialYear, updateFinancialYear, deleteFinancialYear, getCompanies, createNewCompany, setDefaultCompany, closeFYPreview, closeFY } from '../api/company'
import { getOpeningBalanceStatus, createOpeningBalanceBulk } from '../api/ledger'
import { getSuppliers } from '../api/suppliers'
import { getAllCustomers } from '../api/customers'
import { getAllVAParties } from '../api/masters'
import { getAllBrokers } from '../api/brokers'
import { useAuth } from '../hooks/useAuth'
import ErrorAlert from '../components/common/ErrorAlert'
import StatusBadge from '../components/common/StatusBadge'

// Typography: use typo-input-sm and typo-data-label globally

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
    { key: 'company', label: 'Company Profile', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { key: 'fy', label: 'Financial Years', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { key: 'opening', label: 'Opening Balances', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
    ...(isAdmin ? [{ key: 'companies', label: 'Companies', icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064' }] : []),
  ]

  const [tab, setTab] = useState(activeCompany ? 'company' : 'companies')
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const showSuccess = (msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 5000) }

  // Company Profile
  const [company, setCompany] = useState({
    name: '', address: '', city: '', state: '', pin_code: '',
    gst_no: '', state_code: '', pan_no: '', phone: '', email: '',
    logo_url: '', bank_name: '', bank_account: '', bank_ifsc: '', bank_branch: '',
    upi_id: '',
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

  // Opening Balances
  const [obStatus, setOBStatus] = useState(null)
  const [obParties, setOBParties] = useState({})   // { supplier: [...], customer: [...], ... }
  const [obAmounts, setOBAmounts] = useState({})    // { "partyId": { amount: "", balance_type: "cr" } }
  const [obSubTab, setOBSubTab] = useState('supplier')
  const [obSaving, setOBSaving] = useState(false)
  const [obError, setOBError] = useState(null)
  const [obLoading, setOBLoading] = useState(false)

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
      }).catch((err) => setError(err.response?.data?.detail || 'Failed to load company profile'))
    } else if (tab === 'fy') {
      getFinancialYears().then((res) => setFYs(res.data.data || [])).catch((err) => setError(err.response?.data?.detail || 'Failed to load financial years'))
    } else if (tab === 'companies') {
      getCompanies().then((res) => setAllCompanies(res.data.data || [])).catch((err) => setError(err.response?.data?.detail || 'Failed to load companies'))
    } else if (tab === 'opening') {
      setOBLoading(true)
      setOBError(null)
      const PARTY_FETCHERS = {
        supplier: () => getSuppliers({ page_size: 0 }).then(r => (r.data.data || [])),
        customer: () => getAllCustomers().then(r => (r.data.data || [])),
        va_party: () => getAllVAParties().then(r => (r.data.data || [])),
        broker: () => getAllBrokers().then(r => (r.data.data || [])),
      }
      Promise.all([
        getOpeningBalanceStatus(),
        ...Object.entries(PARTY_FETCHERS).map(([type, fn]) => fn().then(data => ({ type, data }))),
      ]).then(([statusRes, ...partyResults]) => {
        setOBStatus(statusRes.data.data)
        const parties = {}
        for (const { type, data } of partyResults) parties[type] = data
        setOBParties(parties)
      }).catch((err) => setOBError(err.response?.data?.detail || 'Failed to load opening balance data'))
        .finally(() => setOBLoading(false))
    }
  }, [tab, activeCompany?.id])

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

  const OB_TABS = [
    { key: 'supplier', label: 'Suppliers', defaultBt: 'cr' },
    { key: 'customer', label: 'Customers', defaultBt: 'dr' },
    { key: 'va_party', label: 'VA Parties', defaultBt: 'cr' },
    { key: 'broker', label: 'Brokers', defaultBt: 'cr' },
  ]

  const handleOBAmountChange = (partyId, field, value) => {
    setOBAmounts(prev => ({
      ...prev,
      [partyId]: { ...(prev[partyId] || {}), [field]: value },
    }))
  }

  const handleOBSaveAll = async () => {
    const entries = []
    for (const [partyId, val] of Object.entries(obAmounts)) {
      const amt = parseFloat(val.amount)
      if (!amt || amt <= 0) continue
      // Find which party_type this belongs to
      let foundType = null
      for (const [type, list] of Object.entries(obParties)) {
        if (list.some(p => p.id === partyId)) { foundType = type; break }
      }
      if (!foundType) continue
      entries.push({
        party_type: foundType,
        party_id: partyId,
        amount: amt,
        balance_type: val.balance_type || OB_TABS.find(t => t.key === foundType)?.defaultBt || 'cr',
      })
    }
    if (entries.length === 0) { setOBError('Enter at least one opening balance amount'); return }
    setOBSaving(true)
    setOBError(null)
    try {
      const res = await createOpeningBalanceBulk({ entries })
      showSuccess(res.data.message)
      // Refresh status
      getOpeningBalanceStatus().then(r => setOBStatus(r.data.data)).catch(() => {})
    } catch (err) {
      setOBError(err.response?.data?.detail || 'Failed to save opening balances')
    } finally { setOBSaving(false) }
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
      showSuccess(`Financial Year "${fyForm.code}" created — you're all set`)
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

  const handleSetDefault = async (companyId) => {
    setError(null)
    try {
      await setDefaultCompany(companyId)
      const res = await getCompanies()
      setAllCompanies(res.data.data || [])
      showSuccess('Default company updated')
    } catch (err) { setError(err.response?.data?.detail || 'Failed to set default') }
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
      const createRes = await createNewCompany(body)
      const newCompany = createRes.data.data
      // Auto-select the new company so JWT gets company context immediately (no logout needed)
      let selectedData = null
      if (newCompany?.id) {
        selectedData = await selectCompany(newCompany.id)
      }
      const res = await getCompanies()
      setAllCompanies(res.data.data || [])
      setShowWizard(false)
      setWizardStep(1)
      setWizardData({
        name: '', city: '', gst_no: '', state_code: '', pan_no: '', phone: '', email: '', address: '',
        copy_from_company_id: null, inherit_masters: [...MASTER_OPTIONS.map((m) => m.key)],
      })
      if (selectedData?.fy) {
        showSuccess(`"${newCompany.name}" created successfully — you're all set`)
      } else {
        showSuccess(`"${newCompany.name}" created — create a Financial Year to start working`)
        setTab('fy')
      }
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
      setCompanyMsg(`Year closed successfully. New financial year ${closeForm.new_fy_code} created. Please re-login to switch.`)
    } catch (err) { setError(err.response?.data?.detail || 'Failed to close FY') }
    finally { setClosing(false) }
  }

  const set = (k, v) => setCompany((c) => ({ ...c, [k]: v }))
  const setW = (k, v) => setWizardData((d) => ({ ...d, [k]: v }))

  return (
    <div>
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="typo-page-title">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Company profile, financial years, and multi-company management</p>
        </div>
        {activeCompany && (
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">{activeCompany.name}</span>
            {fys.find(f => f.is_current) && (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">{fys.find(f => f.is_current)?.code}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="mt-4 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-2 px-4 pb-2.5 pt-1 typo-tab border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} /></svg>
            {t.label}
          </button>
        ))}
      </div>

      {successMsg && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {successMsg}
        </div>
      )}
      {error && <div className="mt-2"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      {/* ── Company Profile Tab ── */}
      {tab === 'company' && (
        <div className="mt-4 space-y-4">
          {companyMsg && <p className="text-xs text-green-600 font-medium">{companyMsg}</p>}

          {/* Section cards with left-accent headers */}
          {[
            { title: 'Business Identity', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', fields: [
              { key: 'name', label: 'Company Name', span: 2 },
              { key: 'phone', label: 'Phone' },
              { key: 'email', label: 'Email' },
            ]},
            { title: 'GST & PAN', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', fields: [
              { key: 'gst_no', label: 'GST No.', upper: true, max: 15 },
              { key: 'state_code', label: 'State Code', max: 2 },
              { key: 'pan_no', label: 'PAN No.', upper: true, max: 10 },
            ]},
            { title: 'Address', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z', fields: [
              { key: 'address', label: 'Address', span: 2 },
              { key: 'city', label: 'City' },
              { key: 'state', label: 'State' },
              { key: 'pin_code', label: 'PIN Code', max: 6 },
            ]},
            { title: 'Bank Details', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z', fields: [
              { key: 'bank_name', label: 'Bank Name' },
              { key: 'bank_account', label: 'Account No.' },
              { key: 'bank_ifsc', label: 'IFSC Code', upper: true, max: 11 },
              { key: 'bank_branch', label: 'Branch' },
              { key: 'upi_id', label: 'UPI ID (VPA)', max: 100, placeholder: 'merchant@upi' },
            ]},
          ].map((section) => (
            <div key={section.title} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 px-4 py-2.5 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50">
                  <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={section.icon} /></svg>
                </div>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{section.title}</span>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                {section.fields.map((f) => (
                  <div key={f.key} className={f.span === 2 ? 'md:col-span-2' : ''}>
                    <label className="block typo-data-label mb-1">{f.label}</label>
                    <input value={company[f.key] || ''} onChange={(e) => set(f.key, f.upper ? e.target.value.toUpperCase() : e.target.value)}
                      className="typo-input-sm" maxLength={f.max} placeholder={f.placeholder} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button onClick={handleCompanySave} disabled={companySaving}
            className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm">
            {companySaving ? 'Saving...' : 'Save Company Profile'}
          </button>
        </div>
      )}

      {/* ── Financial Years Tab ── */}
      {tab === 'fy' && (
        <div className="mt-4 space-y-4">
          {activeCompany && (
            <p className="text-xs text-gray-500">Managing financial years for <span className="font-semibold text-gray-700">{activeCompany.name}</span></p>
          )}
          {/* Create FY card */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-4 py-2.5 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50">
                <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Create Financial Year</span>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
              <div><label className="block typo-data-label mb-1">Code</label><input value={fyForm.code} onChange={(e) => setFYForm(f => ({ ...f, code: e.target.value }))} className="typo-input-sm" placeholder="FY2026-27" /></div>
              <div><label className="block typo-data-label mb-1">Start Date</label><input type="date" value={fyForm.start_date} onChange={(e) => setFYForm(f => ({ ...f, start_date: e.target.value }))} className="typo-input-sm" /></div>
              <div><label className="block typo-data-label mb-1">End Date</label><input type="date" value={fyForm.end_date} onChange={(e) => setFYForm(f => ({ ...f, end_date: e.target.value }))} className="typo-input-sm" /></div>
              <label className="flex items-center gap-2 text-xs font-medium text-gray-600"><input type="checkbox" checked={fyForm.is_current} onChange={(e) => setFYForm(f => ({ ...f, is_current: e.target.checked }))} className="rounded border-gray-300 text-emerald-600" /> Current</label>
              <button onClick={handleFYCreate} disabled={fyCreating} className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 shadow-sm">
                {fyCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {fys.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No financial years created yet</p>
            ) : fys.map((fy) => (
              <div key={fy.id} className={`rounded-xl border p-4 shadow-sm ${fy.is_current ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 bg-white'}`}>
                {/* Edit mode */}
                {editingFy?.id === fy.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div><label className="block typo-data-label mb-1">Code</label><input value={editingFy.code} onChange={(e) => setEditingFy(f => ({ ...f, code: e.target.value }))} className="typo-input-sm" /></div>
                      <div><label className="block typo-data-label mb-1">Start Date</label><input type="date" value={editingFy.start_date} onChange={(e) => setEditingFy(f => ({ ...f, start_date: e.target.value }))} className="typo-input-sm" /></div>
                      <div><label className="block typo-data-label mb-1">End Date</label><input type="date" value={editingFy.end_date} onChange={(e) => setEditingFy(f => ({ ...f, end_date: e.target.value }))} className="typo-input-sm" /></div>
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
                    <h4 className="typo-label-sm mb-2">Closing Balances</h4>
                    <div className="grid grid-cols-4 gap-2">
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
                      <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                        <p className="text-lg font-bold text-gray-800">{closePreview.balances?.brokers?.length || 0}</p>
                        <p className="text-[10px] text-gray-500 uppercase">Brokers</p>
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
                    <h4 className="typo-label-sm mb-2">New Financial Year</h4>
                    <div className="grid grid-cols-3 gap-2">
                      <div><label className="block typo-data-label mb-1">Code</label><input value={closeForm.new_fy_code} onChange={(e) => setCloseForm(f => ({ ...f, new_fy_code: e.target.value }))} className="typo-input-sm" /></div>
                      <div><label className="block typo-data-label mb-1">Start Date</label><input type="date" value={closeForm.new_start_date} onChange={(e) => setCloseForm(f => ({ ...f, new_start_date: e.target.value }))} className="typo-input-sm" /></div>
                      <div><label className="block typo-data-label mb-1">End Date</label><input type="date" value={closeForm.new_end_date} onChange={(e) => setCloseForm(f => ({ ...f, new_end_date: e.target.value }))} className="typo-input-sm" /></div>
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

      {/* ── Opening Balances Tab ── */}
      {tab === 'opening' && (
        <div className="mt-4">
          <div className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-6 py-4 mb-5">
            <h2 className="text-lg font-bold text-white">Opening Balances</h2>
            <p className="text-sm text-amber-100 mt-0.5">Enter outstanding balances for parties from your previous accounting system</p>
          </div>

          {obError && <div className="mb-4"><ErrorAlert message={obError} onDismiss={() => setOBError(null)} /></div>}

          {obLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            </div>
          ) : (
            <>
              {/* Status cards */}
              {obStatus && (
                <div className="grid gap-3 sm:grid-cols-4 mb-5">
                  {OB_TABS.map(t => {
                    const s = obStatus[t.key] || { total: 0, with_opening: 0 }
                    const pct = s.total > 0 ? Math.round(s.with_opening / s.total * 100) : 0
                    return (
                      <div key={t.key} className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
                        <p className="typo-data-label">{t.label}</p>
                        <p className="text-lg font-bold text-gray-900">{s.with_opening}/{s.total}</p>
                        <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{pct}% done</p>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Sub-tabs */}
              <div className="flex gap-4 border-b border-gray-200 mb-4">
                {OB_TABS.map(t => (
                  <button key={t.key} onClick={() => setOBSubTab(t.key)}
                    className={`pb-2.5 typo-tab border-b-2 transition-colors ${
                      obSubTab === t.key ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}>{t.label}</button>
                ))}
              </div>

              {/* Party table */}
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left typo-th">Party Name</th>
                      <th className="px-4 py-2.5 text-left typo-th w-20">Phone</th>
                      <th className="px-4 py-2.5 text-right typo-th w-40">Opening Amount</th>
                      <th className="px-4 py-2.5 text-center typo-th w-20">Dr/Cr</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(obParties[obSubTab] || []).map(party => {
                      const val = obAmounts[party.id] || {}
                      const defaultBt = OB_TABS.find(t => t.key === obSubTab)?.defaultBt || 'cr'
                      return (
                        <tr key={party.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 typo-td font-medium text-gray-900">{party.name}</td>
                          <td className="px-4 py-2 typo-td-secondary">{party.phone || '—'}</td>
                          <td className="px-4 py-2 text-right">
                            <input
                              type="number" min="0" step="0.01"
                              value={val.amount || ''}
                              onChange={(e) => handleOBAmountChange(party.id, 'amount', e.target.value)}
                              className="typo-input-sm w-36 text-right ml-auto"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => handleOBAmountChange(party.id, 'balance_type', (val.balance_type || defaultBt) === 'cr' ? 'dr' : 'cr')}
                              className={`inline-flex h-7 w-10 items-center justify-center rounded-md text-xs font-bold transition-colors ${
                                (val.balance_type || defaultBt) === 'cr'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {(val.balance_type || defaultBt).toUpperCase()}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {(obParties[obSubTab] || []).length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center typo-empty">No {OB_TABS.find(t => t.key === obSubTab)?.label.toLowerCase()} found. Add them in Party Masters first.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Save button */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {Object.values(obAmounts).filter(v => parseFloat(v.amount) > 0).length} parties with amounts entered
                </p>
                <button onClick={handleOBSaveAll} disabled={obSaving}
                  className="rounded-lg bg-emerald-600 px-6 py-2.5 typo-btn-sm text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-colors">
                  {obSaving ? 'Saving...' : 'Save All Opening Balances'}
                </button>
              </div>

              <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                <p className="text-sm text-amber-700">
                  <strong>Default:</strong> Suppliers & VA Parties default to <strong>Cr</strong> (we owe them). Customers default to <strong>Dr</strong> (they owe us). Click Dr/Cr to toggle. Saving overwrites any previous opening balance for that party in the current FY.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Companies Tab (admin only) ── */}
      {tab === 'companies' && (
        <div className="mt-4">
          {/* Company cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allCompanies.map((c) => {
              const isActive = activeCompany?.id === c.id
              return (
                <div key={c.id} className={`group relative rounded-xl border bg-white overflow-hidden transition-all duration-200 hover:shadow-lg ${isActive ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-gray-200 hover:border-gray-300'}`}>
                  {/* Card top accent */}
                  <div className={`h-1.5 ${isActive ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-gray-200 to-gray-300 group-hover:from-emerald-300 group-hover:to-teal-300'} transition-all duration-300`} />

                  <div className="p-4">
                    {/* Header row */}
                    <div className="flex items-start gap-3">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white shadow-md ${isActive ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-gray-400 to-gray-500 group-hover:from-emerald-400 group-hover:to-teal-500'} transition-all duration-300`}>
                        {c.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="typo-card-title truncate">{c.name}</h4>
                          {isActive && (
                            <span className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 typo-badge text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Current
                            </span>
                          )}
                        </div>
                        <p className="typo-caption font-mono mt-0.5">{c.schema_name}</p>
                      </div>
                    </div>

                    {/* Info chips */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {c.city && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 border border-gray-100 px-2 py-0.5 typo-badge text-gray-600">
                          <svg className="h-2.5 w-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                          {c.city}
                        </span>
                      )}
                      {c.gst_no && (
                        <span className="inline-flex items-center rounded-md bg-blue-50 border border-blue-100 px-2 py-0.5 typo-badge font-mono text-blue-600">{c.gst_no}</span>
                      )}
                      {c.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-100 px-2 py-0.5 typo-badge text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-red-50 border border-red-100 px-2 py-0.5 typo-badge text-red-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                          Inactive
                        </span>
                      )}
                    </div>

                    {/* Actions footer */}
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                      {c.is_default ? (
                        <span className="inline-flex items-center gap-1 typo-badge text-amber-600">
                          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                          Default
                        </span>
                      ) : (
                        <button onClick={() => handleSetDefault(c.id)} className="inline-flex items-center gap-1 typo-badge text-gray-400 hover:text-emerald-600 transition-colors">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                          Set as Default
                        </button>
                      )}
                      {!isActive && (
                        <button onClick={() => selectCompany(c.id)} className="inline-flex items-center gap-1 rounded-md bg-gray-50 border border-gray-200 px-2.5 py-1 typo-btn-sm text-gray-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-all">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                          Switch
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Add company card */}
            <button
              onClick={() => { setShowWizard(true); setWizardStep(1) }}
              className="group relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-8 transition-all duration-200 hover:border-emerald-300 hover:bg-emerald-50/30"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white border border-gray-200 shadow-sm group-hover:border-emerald-300 group-hover:shadow-md transition-all duration-200">
                <svg className="h-5 w-5 text-gray-400 group-hover:text-emerald-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div className="text-center">
                <p className="typo-label-sm text-gray-500 group-hover:text-emerald-700 transition-colors">New Company</p>
                <p className="typo-caption mt-0.5">Add another business entity</p>
              </div>
            </button>
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
                        <label className="block typo-data-label mb-1">Company Name *</label>
                        <input value={wizardData.name} onChange={(e) => setW('name', e.target.value)} className="typo-input-sm" placeholder="Krishna Textiles" autoFocus />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block typo-data-label mb-1">City</label><input value={wizardData.city} onChange={(e) => setW('city', e.target.value)} className="typo-input-sm" /></div>
                        <div><label className="block typo-data-label mb-1">Phone</label><input value={wizardData.phone} onChange={(e) => setW('phone', e.target.value)} className="typo-input-sm" /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block typo-data-label mb-1">GST No.</label><input value={wizardData.gst_no} onChange={(e) => setW('gst_no', e.target.value.toUpperCase())} className="typo-input-sm" maxLength={15} /></div>
                        <div><label className="block typo-data-label mb-1">PAN No.</label><input value={wizardData.pan_no} onChange={(e) => setW('pan_no', e.target.value.toUpperCase())} className="typo-input-sm" maxLength={10} /></div>
                      </div>
                      <div>
                        <label className="block typo-data-label mb-1">Email</label>
                        <input value={wizardData.email} onChange={(e) => setW('email', e.target.value)} className="typo-input-sm" />
                      </div>
                    </div>
                  )}

                  {/* Step 2: Inherit Masters */}
                  {wizardStep === 2 && (
                    <div className="space-y-4">
                      {allCompanies.length > 0 && (
                        <div>
                          <label className="block typo-data-label mb-1">Copy Masters From</label>
                          <select
                            value={wizardData.copy_from_company_id || ''}
                            onChange={(e) => setW('copy_from_company_id', e.target.value || null)}
                            className="typo-input-sm"
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
                                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
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
                                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
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
                                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
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
                                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
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
