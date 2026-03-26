import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

function getLandingPath(role) {
  if (role === 'tailor') return '/my-work'
  if (role === 'checker') return '/qc-queue'
  return '/dashboard'
}

// Floating orbs for depth
function FloatingOrbs() {
  return (
    <>
      <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-gradient-to-br from-emerald-400/20 to-teal-300/10 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-gradient-to-tr from-teal-400/15 to-emerald-300/10 blur-3xl" />
    </>
  )
}

// Colorful warehouse/textile illustration
function WarehouseIllustration() {
  return (
    <div className="fixed bottom-0 left-0 right-0 h-56 pointer-events-none z-0">
      {/* Top fade so illustration blends into background */}
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white to-transparent z-10" />
      <svg
        className="absolute bottom-0 w-full"
        viewBox="0 0 1400 220"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        preserveAspectRatio="xMidYMax slice"
      >
        {/* Ground */}
        <rect x="0" y="210" width="1400" height="10" fill="#d1fae5" />

        {/* === Fabric roll 1 — 3D cylinder, left === */}
        <g opacity="0.6">
          {/* Shadow */}
          <ellipse cx="95" cy="210" rx="40" ry="6" fill="#059669" opacity="0.1" />
          {/* Cylinder body */}
          <path d="M55 135 L55 195 C55 205, 72 212, 95 212 C118 212, 135 205, 135 195 L135 135" fill="#86efac" stroke="#059669" strokeWidth="2" />
          {/* Bottom ellipse */}
          <ellipse cx="95" cy="195" rx="40" ry="17" fill="#6ee7b7" stroke="#059669" strokeWidth="1.5" />
          {/* Top ellipse — lid */}
          <ellipse cx="95" cy="135" rx="40" ry="17" fill="#a7f3d0" stroke="#059669" strokeWidth="2" />
          {/* Inner core top */}
          <ellipse cx="95" cy="135" rx="14" ry="6" fill="#ecfdf5" stroke="#059669" strokeWidth="1.5" />
          {/* Fabric wrapping lines for 3D effect */}
          <path d="M60 155 C75 160, 115 160, 130 155" stroke="#059669" strokeWidth="0.8" fill="none" opacity="0.4" />
          <path d="M58 175 C75 180, 115 180, 132 175" stroke="#059669" strokeWidth="0.8" fill="none" opacity="0.4" />
          {/* Unrolling fabric tail */}
          <path d="M135 190 C155 195, 175 203, 200 207 C225 210, 250 210, 275 210" stroke="#059669" strokeWidth="2.5" fill="none" />
          <path d="M135 195 C155 200, 175 208, 200 211 C225 214, 250 213, 275 212" stroke="#059669" strokeWidth="1" fill="#d1fae5" opacity="0.5" />
        </g>

        {/* === Stacked boxes — center left === */}
        <g opacity="0.5">
          {/* Bottom box */}
          <rect x="320" y="158" width="60" height="50" rx="4" fill="#fef3c7" stroke="#d97706" strokeWidth="2" />
          <line x1="350" y1="158" x2="350" y2="208" stroke="#d97706" strokeWidth="1" strokeDasharray="4 3" />
          <line x1="320" y1="183" x2="380" y2="183" stroke="#d97706" strokeWidth="1" strokeDasharray="4 3" />
          {/* Top box */}
          <rect x="328" y="110" width="60" height="48" rx="4" fill="#fde68a" stroke="#d97706" strokeWidth="2" />
          <line x1="358" y1="110" x2="358" y2="158" stroke="#d97706" strokeWidth="1" strokeDasharray="4 3" />
          <line x1="328" y1="134" x2="388" y2="134" stroke="#d97706" strokeWidth="1" strokeDasharray="4 3" />
          {/* Tape */}
          <rect x="346" y="104" width="8" height="14" rx="1" fill="#f59e0b" opacity="0.6" />
        </g>

        {/* === Shelf rack — center === */}
        <g opacity="0.5">
          {/* Uprights */}
          <rect x="478" y="80" width="5" height="128" rx="1" fill="#9ca3af" />
          <rect x="647" y="80" width="5" height="128" rx="1" fill="#9ca3af" />
          {/* Shelves */}
          <rect x="475" y="140" width="180" height="4" rx="1" fill="#6b7280" />
          <rect x="475" y="80" width="180" height="4" rx="1" fill="#6b7280" />
          {/* Bottom shelf items — colored boxes */}
          <rect x="492" y="150" width="38" height="55" rx="3" fill="#bfdbfe" stroke="#3b82f6" strokeWidth="1.5" />
          <rect x="540" y="158" width="32" height="47" rx="3" fill="#c7d2fe" stroke="#6366f1" strokeWidth="1.5" />
          <rect x="582" y="146" width="40" height="59" rx="3" fill="#bbf7d0" stroke="#22c55e" strokeWidth="1.5" />
          <rect x="632" y="155" width="16" height="50" rx="2" fill="#fecaca" stroke="#ef4444" strokeWidth="1" />
          {/* Top shelf — fabric roll + boxes */}
          <ellipse cx="510" cy="110" rx="18" ry="16" fill="#fbcfe8" stroke="#ec4899" strokeWidth="1.5" />
          <ellipse cx="510" cy="110" rx="6" ry="5" fill="#fce7f3" stroke="#ec4899" strokeWidth="1" />
          <rect x="542" y="92" width="30" height="42" rx="3" fill="#fed7aa" stroke="#f97316" strokeWidth="1.5" />
          <rect x="582" y="98" width="28" height="36" rx="3" fill="#e9d5ff" stroke="#a855f7" strokeWidth="1.5" />
          <rect x="620" y="102" width="22" height="32" rx="2" fill="#a7f3d0" stroke="#10b981" strokeWidth="1" />
        </g>

        {/* === Sewing machine === */}
        <g opacity="0.45">
          {/* Base plate */}
          <path d="M740 200 L740 210 L830 210 L830 200 C830 196, 825 194, 820 194 L750 194 C745 194, 740 196, 740 200Z" fill="#e0e7ff" stroke="#6366f1" strokeWidth="1.5" />
          {/* Machine body */}
          <path d="M750 194 L750 160 C750 155, 755 152, 760 152 L795 152 L795 194" fill="#c7d2fe" stroke="#6366f1" strokeWidth="1.5" />
          {/* Upper arm — extends right */}
          <path d="M760 152 L760 135 C760 130, 765 128, 770 128 L810 128 L810 142 L805 152" fill="#ddd6fe" stroke="#6366f1" strokeWidth="1.5" />
          {/* Needle assembly */}
          <line x1="807" y1="142" x2="807" y2="190" stroke="#6366f1" strokeWidth="1.5" />
          <circle cx="807" cy="192" r="2" fill="#6366f1" />
          {/* Thread spool on top */}
          <rect x="780" y="120" width="12" height="8" rx="3" fill="#a78bfa" stroke="#7c3aed" strokeWidth="1" />
          {/* Wheel on left */}
          <circle cx="755" cy="178" r="10" fill="#e0e7ff" stroke="#6366f1" strokeWidth="1.5" />
          <circle cx="755" cy="178" r="4" fill="#c7d2fe" stroke="#6366f1" strokeWidth="1" />
          {/* Fabric being sewn */}
          <path d="M785 190 L825 185 L840 188" stroke="#f59e0b" strokeWidth="2" fill="none" strokeDasharray="4 2" />
        </g>

        {/* === Dress form / Mannequin === */}
        <g opacity="0.55">
          {/* Tripod base */}
          <path d="M940 208 L928 210 M940 208 L952 210 M940 208 L940 210" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" />
          <ellipse cx="940" cy="210" rx="14" ry="3" fill="none" stroke="#9ca3af" strokeWidth="1.5" />
          {/* Stand pole */}
          <line x1="940" y1="208" x2="940" y2="165" stroke="#9ca3af" strokeWidth="3" />
          {/* Torso — proper dress form shape */}
          <path d="M920 108 C918 105, 925 98, 940 96 C955 98, 962 105, 960 108 L962 118 L958 135 C956 148, 948 158, 948 162 L948 165 L932 165 L932 162 C932 158, 924 148, 922 135 L918 118 Z" fill="#fecdd3" stroke="#e11d48" strokeWidth="1.8" />
          {/* Neck */}
          <rect x="935" y="90" width="10" height="8" rx="5" fill="#fecdd3" stroke="#e11d48" strokeWidth="1.5" />
          {/* Neckline scoop */}
          <path d="M926 110 C930 115, 950 115, 954 110" stroke="#e11d48" strokeWidth="1" fill="none" />
          {/* Center line */}
          <line x1="940" y1="110" x2="940" y2="160" stroke="#e11d48" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
          {/* Shoulder points */}
          <circle cx="920" cy="108" r="2" fill="#fda4af" />
          <circle cx="960" cy="108" r="2" fill="#fda4af" />
        </g>

        {/* === Hanging garments — 5 pieces on rack === */}
        <g opacity="0.5">
          {/* Rack bar */}
          <rect x="1060" y="68" width="200" height="4" rx="2" fill="#9ca3af" />

          {/* Garment 1 — pink blouse */}
          <path d="M1085 70 L1085 65 L1073 72 L1085 65 L1097 72" stroke="#6b7280" strokeWidth="2.5" fill="none" />
          <circle cx="1085" cy="63" r="3" fill="#9ca3af" />
          <path d="M1077 75 L1069 80 L1065 96 L1071 96 L1073 86 L1073 165 C1073 170, 1077 174, 1085 175 C1093 174, 1097 170, 1097 165 L1097 86 L1099 96 L1105 96 L1101 80 L1093 75 C1091 78, 1087 79, 1085 79 C1083 79, 1079 78, 1077 75Z" fill="#fecdd3" stroke="#e11d48" strokeWidth="1.5" />
          <path d="M1080 76 C1082 81, 1088 81, 1090 76" stroke="#e11d48" strokeWidth="1" fill="none" />

          {/* Garment 2 — amber kurta */}
          <path d="M1125 70 L1125 65 L1113 72 L1125 65 L1137 72" stroke="#6b7280" strokeWidth="2.5" fill="none" />
          <circle cx="1125" cy="63" r="3" fill="#9ca3af" />
          <path d="M1116 75 L1108 82 L1105 96 L1111 96 L1113 86 L1111 112 L1106 185 C1106 189, 1113 191, 1125 191 C1137 191, 1144 189, 1144 185 L1139 112 L1137 86 L1139 96 L1145 96 L1142 82 L1134 75 C1132 79, 1127 80, 1125 80 C1123 80, 1118 79, 1116 75Z" fill="#fde68a" stroke="#d97706" strokeWidth="1.5" />
          <path d="M1119 76 C1121 82, 1129 82, 1131 76" stroke="#d97706" strokeWidth="1" fill="none" />
          <line x1="1112" y1="112" x2="1138" y2="112" stroke="#d97706" strokeWidth="1" strokeDasharray="3 2" />

          {/* Garment 3 — purple blouse (shorter) */}
          <path d="M1165 70 L1165 65 L1153 72 L1165 65 L1177 72" stroke="#6b7280" strokeWidth="2.5" fill="none" />
          <circle cx="1165" cy="63" r="3" fill="#9ca3af" />
          <path d="M1157 75 L1149 80 L1146 96 L1152 96 L1154 86 L1154 155 C1154 160, 1158 163, 1165 164 C1172 163, 1176 160, 1176 155 L1176 86 L1178 96 L1184 96 L1181 80 L1173 75 C1171 78, 1167 79, 1165 79 C1163 79, 1159 78, 1157 75Z" fill="#e9d5ff" stroke="#7c3aed" strokeWidth="1.5" />
          <path d="M1160 76 C1162 81, 1168 81, 1170 76" stroke="#7c3aed" strokeWidth="1" fill="none" />

          {/* Garment 4 — sky blue A-line */}
          <path d="M1202 70 L1202 65 L1190 72 L1202 65 L1214 72" stroke="#6b7280" strokeWidth="2.5" fill="none" />
          <circle cx="1202" cy="63" r="3" fill="#9ca3af" />
          <path d="M1194 75 L1186 82 L1183 96 L1189 96 L1191 86 L1189 112 L1184 192 C1184 196, 1191 198, 1202 198 C1213 198, 1220 196, 1220 192 L1215 112 L1213 86 L1215 96 L1221 96 L1218 82 L1210 75 C1208 79, 1204 80, 1202 80 C1200 80, 1196 79, 1194 75Z" fill="#bae6fd" stroke="#0284c7" strokeWidth="1.5" />
          <path d="M1197 76 C1199 82, 1205 82, 1207 76" stroke="#0284c7" strokeWidth="1" fill="none" />

          {/* Garment 5 — green short top */}
          <path d="M1240 70 L1240 65 L1228 72 L1240 65 L1252 72" stroke="#6b7280" strokeWidth="2.5" fill="none" />
          <circle cx="1240" cy="63" r="3" fill="#9ca3af" />
          <path d="M1232 75 L1224 80 L1221 96 L1227 96 L1229 86 L1229 148 C1229 153, 1233 156, 1240 157 C1247 156, 1251 153, 1251 148 L1251 86 L1253 96 L1259 96 L1256 80 L1248 75 C1246 78, 1242 79, 1240 79 C1238 79, 1234 78, 1232 75Z" fill="#bbf7d0" stroke="#22c55e" strokeWidth="1.5" />
          <path d="M1235 76 C1237 81, 1243 81, 1245 76" stroke="#22c55e" strokeWidth="1" fill="none" />
        </g>


        {/* === Thread spool — far left === */}
        <g opacity="0.5">
          <rect x="18" y="188" width="24" height="20" rx="4" fill="#c4b5fd" stroke="#8b5cf6" strokeWidth="1.5" />
          <rect x="22" y="182" width="16" height="6" rx="2" fill="#a78bfa" stroke="#7c3aed" strokeWidth="1" />
          {/* Thread line curving out */}
          <path d="M42 195 C55 188, 65 198, 80 190 C95 182, 105 192, 120 186" stroke="#8b5cf6" strokeWidth="1.5" fill="none" strokeDasharray="4 3" />
        </g>

        {/* === Small fabric bolt — between roll and boxes === */}
        <g opacity="0.45">
          <rect x="220" y="175" width="22" height="33" rx="4" fill="#bae6fd" stroke="#0ea5e9" strokeWidth="1.5" />
          <line x1="220" y1="185" x2="242" y2="185" stroke="#0ea5e9" strokeWidth="1" />
          <line x1="220" y1="195" x2="242" y2="195" stroke="#0ea5e9" strokeWidth="1" />
        </g>
      </svg>
    </div>
  )
}

// Brand mark
function BrandMark() {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-600/25 h-10 w-10">
          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Inventory-OS</h1>
      </div>
      <p className="mt-1 text-sm font-medium text-gray-500">Textile Inventory Management</p>
    </div>
  )
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)

  // Company picker state
  const [showPicker, setShowPicker] = useState(false)
  const [pickerCompanies, setPickerCompanies] = useState([])
  const [selectedCompanyId, setSelectedCompanyId] = useState(null)

  const { login, selectCompany, isAuthenticated, role, company } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)
    window.addEventListener('keydown', handler)
    window.addEventListener('keyup', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('keyup', handler)
    }
  }, [])

  // If already logged in with company context, redirect
  if (isAuthenticated && company) {
    return <Navigate to={getLandingPath(role)} replace />
  }

  // Logged in but no companies at all — admin setup mode
  if (isAuthenticated && !company && !showPicker) {
    return <Navigate to="/settings" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(username, password)
      if (result._needsCompanySelect) {
        setPickerCompanies(result._companies || [])
        setSelectedCompanyId(result._companies?.find((c) => c.is_default)?.id || result._companies?.[0]?.id)
        setShowPicker(true)
      } else if (result._noCompany) {
        navigate('/settings', { replace: true })
      } else {
        navigate(getLandingPath(result.role), { replace: true })
      }
    } catch (err) {
      if (err.response?.data?.detail) {
        setError(err.response.data.detail)
      } else if (err.code === 'ERR_NETWORK' || !err.response) {
        setError('Cannot reach server. Check connection and retry.')
      } else {
        setError(`Login failed (${err.response?.status || 'unknown'}).`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCompanySelect = async () => {
    if (!selectedCompanyId || loading) return
    setError('')
    setLoading(true)
    try {
      await selectCompany(selectedCompanyId)
      navigate(getLandingPath(role), { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to select company. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // --- Company Picker View ---
  if (showPicker) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-gray-50 via-white to-emerald-50/40 py-10">
        <FloatingOrbs />
        <WarehouseIllustration />

        <div className="relative z-10 w-full max-w-md px-4">
          <BrandMark />

          <div className="mt-5 rounded-xl border border-gray-200/80 bg-white/80 px-6 py-5 shadow-lg shadow-gray-200/50 backdrop-blur-sm">
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900">Choose your workspace</h2>
              <p className="mt-1 text-sm text-gray-500">You have access to {pickerCompanies.length} companies</p>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" /></svg>
                {error}
              </div>
            )}

            <form
              onSubmit={(e) => { e.preventDefault(); handleCompanySelect() }}
              onKeyDown={(e) => {
                if (!pickerCompanies.length) return
                const idx = pickerCompanies.findIndex((c) => c.id === selectedCompanyId)
                let nextIdx = -1
                if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                  e.preventDefault()
                  nextIdx = (idx + 1) % pickerCompanies.length
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                  e.preventDefault()
                  nextIdx = (idx - 1 + pickerCompanies.length) % pickerCompanies.length
                }
                if (nextIdx >= 0) setSelectedCompanyId(pickerCompanies[nextIdx].id)
              }}
            >
              <div className="space-y-2.5">
                {pickerCompanies.map((c) => {
                  const isSelected = selectedCompanyId === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      ref={isSelected ? (el) => { if (el) requestAnimationFrame(() => el.focus()) } : undefined}
                      onClick={() => setSelectedCompanyId(c.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleCompanySelect() } }}
                      className={`group w-full flex items-center gap-3.5 rounded-xl border-2 px-4 py-3.5 text-left transition-all duration-200 ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/70 shadow-sm shadow-emerald-100'
                          : 'border-gray-100 bg-gray-50/50 hover:border-emerald-200 hover:bg-emerald-50/30'
                      }`}
                    >
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold transition-all duration-200 ${
                        isSelected
                          ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-200'
                          : 'bg-gray-200/70 text-gray-600 group-hover:bg-emerald-100 group-hover:text-emerald-700'
                      }`}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800 truncate">{c.name}</div>
                        <div className="text-xs text-gray-400 font-medium">{c.slug}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.is_default && (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                            Default
                          </span>
                        )}
                        <div className={`flex h-5 w-5 items-center justify-center rounded-full transition-all duration-200 ${
                          isSelected ? 'bg-emerald-500 scale-100' : 'border-2 border-gray-200 scale-90'
                        }`}>
                          {isSelected && (
                            <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              <button
                type="submit"
                disabled={loading || !selectedCompanyId}
                className="mt-6 w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:from-emerald-700 hover:to-teal-700 hover:shadow-emerald-600/30 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:shadow-none active:scale-[0.98]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Connecting...
                  </span>
                ) : 'Continue'}
              </button>
            </form>

            {/* Back to login */}
            <button
              type="button"
              onClick={() => { setShowPicker(false); setError('') }}
              className="mt-4 w-full text-center text-xs font-medium text-gray-400 hover:text-emerald-600 transition-colors"
            >
              Sign in as a different user
            </button>
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-gray-400">
            Use arrow keys to navigate, Enter to continue
          </p>
        </div>
      </div>
    )
  }

  // --- Login Form View ---
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-gray-50 via-white to-emerald-50/40 py-10">

      <FloatingOrbs />
        <WarehouseIllustration />

      <div className="relative z-10 w-full max-w-sm px-4">
        <BrandMark />

        <div className="mt-5 rounded-xl border border-gray-200/80 bg-white/80 px-6 py-5 shadow-lg shadow-gray-200/50 backdrop-blur-sm">
          <h2 className="mb-4 text-base font-bold text-gray-900">Welcome back,</h2>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" /></svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-semibold text-gray-700 mb-1">
                  Username
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  </div>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    required
                    autoFocus
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full rounded-lg border border-gray-300 bg-gray-50/50 pl-10 pr-3 py-2 text-sm font-medium text-gray-800 placeholder:text-gray-400 transition-all duration-200 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="e.g. admin"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="current-password"
                    spellCheck={false}
                    className="w-full rounded-lg border border-gray-300 bg-gray-50/50 pl-10 pr-10 py-2 text-sm font-medium text-gray-800 placeholder:text-gray-400 transition-all duration-200 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-gray-400 transition-colors hover:text-emerald-600 focus:outline-none"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4.5 w-4.5">
                        <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.092 1.092a4 4 0 00-5.558-5.558z" clipRule="evenodd" />
                        <path d="M10.748 13.93l2.523 2.523A9.987 9.987 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 014.09 5.12l2.109 2.11a4 4 0 005.549 5.55z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4.5 w-4.5">
                        <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                        <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </div>
                {capsLock && (
                  <p className="mt-1.5 text-xs font-medium text-amber-600 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                      <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm.75-10.25a.75.75 0 00-1.5 0v4.5a.75.75 0 001.5 0v-4.5zM8 12a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    CapsLock is ON
                  </p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-5 w-full rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:from-emerald-700 hover:to-teal-700 hover:shadow-emerald-600/30 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:shadow-none active:scale-[0.98]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Signing in...
                </span>
              ) : 'Sign in'}
            </button>
          </form>

        </div>

      </div>
    </div>
  )
}
