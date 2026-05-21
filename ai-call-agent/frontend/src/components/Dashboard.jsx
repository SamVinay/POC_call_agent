import React, { useState, useEffect } from 'react'
import {
  Phone,
  PhoneIncoming,
  AlertTriangle,
  Calendar,
  Clock,
  TrendingUp,
  RefreshCw,
  ChevronRight,
  User,
} from 'lucide-react'
import { getDashboardStats, getCallHistory } from '../services/api'
import { format, parseISO } from 'date-fns'

const URGENCY_STYLES = {
  LOW: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  MEDIUM: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  HIGH: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  CRITICAL: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
}

function StatCard({ icon: Icon, label, value, color, subtext }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-3xl font-bold mt-1 text-gray-900">{value}</p>
          {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
        </div>
        <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  )
}

function UrgencyBadge({ urgency }) {
  const style = URGENCY_STYLES[urgency] || URGENCY_STYLES.LOW
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {urgency}
    </span>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [recentCalls, setRecentCalls] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [statsData, callsData] = await Promise.all([
        getDashboardStats(),
        getCallHistory(10),
      ])
      setStats(statsData)
      setRecentCalls(callsData.calls || [])
    } catch (err) {
      console.error('Failed to load dashboard:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Overview of your call activity and appointments</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={Phone}
          label="Total Calls"
          value={stats?.total_calls ?? '-'}
          color="bg-brand-600"
          subtext="All time"
        />
        <StatCard
          icon={PhoneIncoming}
          label="Today's Calls"
          value={stats?.today_calls ?? '-'}
          color="bg-emerald-600"
          subtext="Since midnight"
        />
        <StatCard
          icon={AlertTriangle}
          label="Urgent Unreviewed"
          value={stats?.urgent_unreviewed ?? '-'}
          color="bg-orange-600"
          subtext="Needs attention"
        />
        <StatCard
          icon={Calendar}
          label="Upcoming Appointments"
          value={stats?.upcoming_appointments ?? '-'}
          color="bg-violet-600"
          subtext={`${stats?.today_appointments ?? 0} today`}
        />
      </div>

      {/* Recent Calls */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Recent Calls</h3>
          <span className="text-xs text-gray-400">Last {recentCalls.length} calls</span>
        </div>

        {recentCalls.length === 0 ? (
          <div className="p-12 text-center">
            <Phone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No calls yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Use the Call Simulator to test the AI agent
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentCalls.map((call) => (
              <div
                key={call.call_id}
                className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 truncate">
                      {call.caller_name || 'Unknown Caller'}
                    </p>
                    <UrgencyBadge urgency={call.urgency} />
                  </div>
                  <p className="text-sm text-gray-500 truncate mt-0.5">
                    {call.caller_phone || 'No phone'} &middot;{' '}
                    {call.duration_seconds
                      ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`
                      : 'N/A'}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-400">
                    {call.started_at
                      ? format(parseISO(call.started_at), 'MMM d, h:mm a')
                      : ''}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
