import React, { useState, useEffect } from 'react'
import {
  Calendar,
  Clock,
  User,
  Phone as PhoneIcon,
  Mail,
  Wrench,
  Check,
  X,
  RefreshCw,
  Filter,
  AlertCircle,
} from 'lucide-react'
import { getAppointments, updateAppointment } from '../services/api'
import { format, parseISO, isToday, isTomorrow, isPast } from 'date-fns'

const STATUS_STYLES = {
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Scheduled' },
  confirmed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Confirmed' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled' },
  completed: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Completed' },
  no_show: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'No Show' },
}

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.scheduled
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}

function DateLabel({ dateStr }) {
  try {
    const d = parseISO(dateStr)
    if (isToday(d)) return <span className="text-green-600 font-semibold">Today</span>
    if (isTomorrow(d)) return <span className="text-blue-600 font-semibold">Tomorrow</span>
    return <span>{format(d, 'EEE, MMM d')}</span>
  } catch {
    return <span>{dateStr}</span>
  }
}

export default function AppointmentList() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [updatingId, setUpdatingId] = useState(null)

  const fetchAppointments = async () => {
    setLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const data = await getAppointments(null, statusFilter || null)
      setAppointments(data.appointments || [])
    } catch (err) {
      console.error('Failed to load appointments:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAppointments()
  }, [statusFilter])

  const handleStatusChange = async (id, newStatus) => {
    setUpdatingId(id)
    try {
      await updateAppointment(id, { status: newStatus })
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
      )
    } catch (err) {
      console.error('Failed to update appointment:', err)
    }
    setUpdatingId(null)
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Appointments</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage appointments booked by the AI agent
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-sm bg-transparent border-none outline-none text-gray-700"
            >
              <option value="">All Status</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <button
            onClick={fetchAppointments}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Appointment Cards */}
      {appointments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-900 text-lg mb-2">
            No Appointments Yet
          </h3>
          <p className="text-gray-500 max-w-md mx-auto">
            When the AI agent books appointments during calls, they'll appear here.
            Try the Call Simulator to schedule a test appointment.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {appointments.map((appt) => (
            <div
              key={appt.id}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                {/* Left: Customer Info */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                    <User className="w-6 h-6 text-brand-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="font-semibold text-gray-900">{appt.customer_name}</h4>
                      <StatusBadge status={appt.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                      {appt.customer_phone && (
                        <span className="flex items-center gap-1">
                          <PhoneIcon className="w-3.5 h-3.5" />
                          {appt.customer_phone}
                        </span>
                      )}
                      {appt.customer_email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5" />
                          {appt.customer_email}
                        </span>
                      )}
                      {appt.service_requested && (
                        <span className="flex items-center gap-1">
                          <Wrench className="w-3.5 h-3.5" />
                          {appt.service_requested}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Date/Time */}
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <DateLabel dateStr={appt.appointment_date} />
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                    <Clock className="w-4 h-4 text-gray-400" />
                    {appt.appointment_time?.slice(0, 5) || 'N/A'}
                    <span className="text-xs text-gray-400">
                      ({appt.duration_minutes || 60} min)
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {appt.notes && (
                <div className="mt-3 ml-16 text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                  {appt.notes}
                </div>
              )}

              {/* Actions */}
              {appt.status === 'scheduled' && (
                <div className="mt-4 ml-16 flex items-center gap-2">
                  <button
                    onClick={() => handleStatusChange(appt.id, 'confirmed')}
                    disabled={updatingId === appt.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Confirm
                  </button>
                  <button
                    onClick={() => handleStatusChange(appt.id, 'cancelled')}
                    disabled={updatingId === appt.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                </div>
              )}
              {appt.status === 'confirmed' && (
                <div className="mt-4 ml-16 flex items-center gap-2">
                  <button
                    onClick={() => handleStatusChange(appt.id, 'completed')}
                    disabled={updatingId === appt.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Mark Complete
                  </button>
                  <button
                    onClick={() => handleStatusChange(appt.id, 'no_show')}
                    disabled={updatingId === appt.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors disabled:opacity-50"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    No Show
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
