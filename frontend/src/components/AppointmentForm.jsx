import React, { useState, useEffect } from 'react'
import {
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  Wrench,
  FileText,
  X,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { createAppointment, getAvailability, getServices } from '../services/api'
import { format, addDays } from 'date-fns'

export default function AppointmentForm({ onClose, onCreated }) {
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    service_requested: '',
    appointment_date: '',
    appointment_time: '',
    duration_minutes: 60,
    notes: '',
  })
  const [services, setServices] = useState([])
  const [availableSlots, setAvailableSlots] = useState([])
  const [dateInfo, setDateInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    getServices()
      .then((data) => setServices(data.services || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!formData.appointment_date) {
      setAvailableSlots([])
      setDateInfo(null)
      return
    }
    setSlotsLoading(true)
    getAvailability(formData.appointment_date)
      .then((data) => {
        setAvailableSlots(data.slots || [])
        setDateInfo(data)
      })
      .catch(() => setAvailableSlots([]))
      .finally(() => setSlotsLoading(false))
  }, [formData.appointment_date])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    setError('')
  }

  const handleServiceChange = (e) => {
    const serviceName = e.target.value
    const service = services.find((s) => s.name === serviceName)
    setFormData((prev) => ({
      ...prev,
      service_requested: serviceName,
      duration_minutes: service?.duration_minutes || 60,
    }))
  }

  const handleSlotClick = (slotTime) => {
    setFormData((prev) => ({ ...prev, appointment_time: slotTime }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.customer_name.trim()) {
      setError('Customer name is required')
      return
    }
    if (!formData.appointment_date) {
      setError('Please select a date')
      return
    }
    if (!formData.appointment_time) {
      setError('Please select a time slot')
      return
    }

    setLoading(true)
    try {
      await createAppointment(formData)
      setSuccess(true)
      setTimeout(() => {
        onCreated?.()
        onClose?.()
      }, 1500)
    } catch (err) {
      setError(err.message || 'Failed to create appointment')
    }
    setLoading(false)
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const maxDate = format(addDays(new Date(), 30), 'yyyy-MM-dd')

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Appointment Created!</h3>
          <p className="text-gray-500">
            {formData.customer_name} — {formData.appointment_date} at {formData.appointment_time}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Book New Appointment</h3>
            <p className="text-sm text-gray-500">Schedule a new appointment manually</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Customer Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <User className="w-3.5 h-3.5 inline mr-1" />
                Customer Name *
              </label>
              <input
                type="text"
                name="customer_name"
                value={formData.customer_name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <Phone className="w-3.5 h-3.5 inline mr-1" />
                Phone
              </label>
              <input
                type="tel"
                name="customer_phone"
                value={formData.customer_phone}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <Mail className="w-3.5 h-3.5 inline mr-1" />
                Email
              </label>
              <input
                type="email"
                name="customer_email"
                value={formData.customer_email}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="john@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <Wrench className="w-3.5 h-3.5 inline mr-1" />
                Service
              </label>
              <select
                name="service_requested"
                value={formData.service_requested}
                onChange={handleServiceChange}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white"
              >
                <option value="">Select a service</option>
                {services.map((svc) => (
                  <option key={svc.name} value={svc.name}>
                    {svc.name} ({svc.duration_minutes} min — {svc.price_range})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date & Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />
              Appointment Date *
            </label>
            <input
              type="date"
              name="appointment_date"
              value={formData.appointment_date}
              onChange={handleChange}
              min={today}
              max={maxDate}
              required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          {/* Available Slots */}
          {formData.appointment_date && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="w-3.5 h-3.5 inline mr-1" />
                Available Time Slots
                {dateInfo && !dateInfo.is_open && (
                  <span className="ml-2 text-red-500 font-normal">(Closed this day)</span>
                )}
                {dateInfo?.hours && (
                  <span className="ml-2 text-gray-400 font-normal">
                    ({dateInfo.hours.open} - {dateInfo.hours.close})
                  </span>
                )}
              </label>

              {slotsLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading available slots...
                </div>
              ) : availableSlots.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">
                  No available slots for this date
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot.start}
                      type="button"
                      onClick={() => slot.available && handleSlotClick(slot.start)}
                      disabled={!slot.available}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        formData.appointment_time === slot.start
                          ? 'bg-brand-600 text-white ring-2 ring-brand-300'
                          : slot.available
                          ? 'bg-gray-100 text-gray-700 hover:bg-brand-50 hover:text-brand-700'
                          : 'bg-red-50 text-red-300 line-through cursor-not-allowed'
                      }`}
                    >
                      {slot.start}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Duration (minutes)
            </label>
            <select
              name="duration_minutes"
              value={formData.duration_minutes}
              onChange={handleChange}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white"
            >
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
              <option value={180}>3 hours</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <FileText className="w-3.5 h-3.5 inline mr-1" />
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
              placeholder="Any additional notes..."
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Book Appointment
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
