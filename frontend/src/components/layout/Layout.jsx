import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      {/* Main content area — shifts based on sidebar width */}
      <div
        className={`transition-all duration-300 ${
          collapsed ? 'ml-16' : 'ml-60'
        }`}
      >
        <Header />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
