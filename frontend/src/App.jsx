import React, { useState, useEffect } from 'react'
import { Phone, LayoutDashboard, Calendar, Settings, Activity } from 'lucide-react'
import CallInterface from './components/CallInterface'
import Dashboard from './components/Dashboard'
import AppointmentList from './components/AppointmentList'
import SettingsPage from './components/SettingsPage'
import { checkHealth } from './services/api'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'call', label: 'Call Simulator', icon: Phone },
  { id: 'appointments', label: 'Appointments', icon: Calendar },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [backendStatus, setBackendStatus] = useState('checking')

  useEffect(() => {
    const check = async () => {
      try {
        const data = await checkHealth()
        setBackendStatus(data.call_manager_ready ? 'ready' : 'limited')
      } catch {
        setBackendStatus('offline')
      }
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
              <Phone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg leading-tight">AI Call Agent</h1>
              <p className="text-xs text-gray-500">Smart Business Assistant</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </nav>

        {/* Status Footer */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                backendStatus === 'ready'
                  ? 'bg-green-500'
                  : backendStatus === 'limited'
                  ? 'bg-yellow-500'
                  : backendStatus === 'checking'
                  ? 'bg-gray-400 animate-pulse'
                  : 'bg-red-500'
              }`}
            />
            <span className="text-xs text-gray-500">
              {backendStatus === 'ready'
                ? 'All systems operational'
                : backendStatus === 'limited'
                ? 'Running in limited mode'
                : backendStatus === 'checking'
                ? 'Checking connection...'
                : 'Backend offline'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'call' && <CallInterface backendReady={backendStatus === 'ready'} />}
        {activeTab === 'appointments' && <AppointmentList />}
        {activeTab === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
