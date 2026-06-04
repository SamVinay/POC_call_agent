import React, { useState, useEffect } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Wrench,
  Loader2,
} from 'lucide-react'
import { getAvailability } from '../services/api'
import { format, addDays, startOfWeek, isSameDay, isToday, parseISO } from 'date-fns'

const HOUR_HEIGHT = 64 // px per hour

function TimeSlotEvent({ booking, dayStart }) {
  const startParts = booking.start.split(':').map(Number)
  const endParts = booking.end.split(':').map(Number)
  const startMinutes = startParts[0] * 60 + startParts[1]
  const endMinutes = endParts[0] * 60 + endParts[1]
  const dayStartMinutes = dayStart * 60

  const top = ((startMinutes - dayStartMinutes) / 60) * HOUR_HEIGHT
  const height = ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT

  return (
    <div
      className="absolute left-1 right-1 bg-brand-100 border border-brand-300 rounded-lg px-2 py-1 overflow-hidden cursor-pointer hover:bg-brand-200 transition-colors group z-10"
      style={{ top: `${top}px`, height: `${Math.max(height, 28)}px` }}
      title={`${booking.customer_name} - ${booking.service || 'Appointment'}`}
    >
      <p className="text-xs font-semibold text-brand-800 truncate">
        {booking.customer_name}
      </p>
      {height > 36 && (
        <p className="text-[10px] text-brand-600 truncate">
          {booking.service || 'Appointment'} · {booking.start}-{booking.end}
        </p>
      )}
    </div>
  )
}

export default function AppointmentCalendar() {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [weekData, setWeekData] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState(null)

  const fetchWeek = async () => {
    setLoading(true)
    try {
      const data = await getAvailability(null, format(weekStart, 'yyyy-MM-dd'))
      setWeekData(data.week || [])
    } catch (err) {
      console.error('Failed to load week:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchWeek()
  }, [weekStart])

  const goToPrevWeek = () => setWeekStart((d) => addDays(d, -7))
  const goToNextWeek = () => setWeekStart((d) => addDays(d, 7))
  const goToToday = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))

  // Determine earliest open hour across the week for the timeline
  let earliestHour = 8
  let latestHour = 18
  for (const day of weekData) {
    if (day.hours) {
      const openH = parseInt(day.hours.open?.split(':')[0] || '8')
      const closeH = parseInt(day.hours.close?.split(':')[0] || '18')
      if (openH < earliestHour) earliestHour = openH
      if (closeH > latestHour) latestHour = closeH
    }
  }

  const hours = []
  for (let h = earliestHour; h <= latestHour; h++) {
    hours.push(h)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Calendar Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-900">Weekly Calendar</h3>
          <button
            onClick={goToToday}
            className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevWeek}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">
            {format(weekStart, 'MMM d')} — {format(addDays(weekStart, 6), 'MMM d, yyyy')}
          </span>
          <button
            onClick={goToNextWeek}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Day Headers */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-gray-200">
              <div className="border-r border-gray-100" />
              {weekData.map((day, i) => {
                const d = parseISO(day.date)
                const today = isToday(d)
                return (
                  <div
                    key={day.date}
                    className={`px-2 py-3 text-center border-r border-gray-100 last:border-r-0 ${
                      !day.is_open ? 'bg-gray-50' : ''
                    }`}
                  >
                    <p className="text-xs text-gray-500 uppercase">
                      {day.day_name.slice(0, 3)}
                    </p>
                    <p
                      className={`text-lg font-bold mt-0.5 ${
                        today
                          ? 'w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center mx-auto'
                          : 'text-gray-900'
                      }`}
                    >
                      {format(d, 'd')}
                    </p>
                    <div className="mt-1">
                      {day.is_open ? (
                        <span className="text-[10px] text-gray-400">
                          {day.available_slots} free / {day.total_slots}
                        </span>
                      ) : (
                        <span className="text-[10px] text-red-400 font-medium">
                          Closed
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Time Grid */}
            <div
              className="grid grid-cols-[60px_repeat(7,1fr)] relative"
              style={{ height: `${hours.length * HOUR_HEIGHT}px` }}
            >
              {/* Time Labels */}
              <div className="border-r border-gray-100 relative">
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 text-right pr-2 text-xs text-gray-400"
                    style={{
                      top: `${(h - earliestHour) * HOUR_HEIGHT}px`,
                      transform: 'translateY(-6px)',
                    }}
                  >
                    {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                  </div>
                ))}
              </div>

              {/* Day Columns */}
              {weekData.map((day) => {
                const booked = day.slots?.filter((s) => !s.available) || []
                const d = parseISO(day.date)
                // Find booked appointments from the availability data
                return (
                  <div
                    key={day.date}
                    className={`border-r border-gray-100 last:border-r-0 relative ${
                      !day.is_open ? 'bg-gray-50/50' : ''
                    }`}
                  >
                    {/* Hour lines */}
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="absolute left-0 right-0 border-t border-gray-100"
                        style={{ top: `${(h - earliestHour) * HOUR_HEIGHT}px` }}
                      />
                    ))}

                    {/* Business hours shading */}
                    {day.is_open && day.hours && (
                      <div
                        className="absolute left-0 right-0 bg-green-50/30"
                        style={{
                          top: `${(parseInt(day.hours.open.split(':')[0]) - earliestHour) * HOUR_HEIGHT}px`,
                          height: `${(parseInt(day.hours.close.split(':')[0]) - parseInt(day.hours.open.split(':')[0])) * HOUR_HEIGHT}px`,
                        }}
                      />
                    )}

                    {/* Booked slots visualization */}
                    {booked.map((slot) => (
                      <TimeSlotEvent
                        key={slot.start}
                        booking={{
                          start: slot.start,
                          end: slot.end,
                          customer_name: 'Booked',
                          service: null,
                        }}
                        dayStart={earliestHour}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Summary Footer */}
      <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-50 border border-green-200" />
          Open Hours
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-brand-100 border border-brand-300" />
          Booked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-gray-50 border border-gray-200" />
          Closed
        </span>
      </div>
    </div>
  )
}
