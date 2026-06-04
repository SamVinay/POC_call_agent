import React, { useState, useEffect } from 'react'
import {
  X,
  Phone,
  User,
  Clock,
  AlertTriangle,
  MessageSquare,
  Calendar,
  Loader2,
  Mail,
  FileText,
} from 'lucide-react'
import { getCallDetail, getCallMessages } from '../services/api'
import { format, parseISO } from 'date-fns'

const URGENCY_STYLES = {
  LOW: { bg: 'bg-green-100', text: 'text-green-700' },
  MEDIUM: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  HIGH: { bg: 'bg-orange-100', text: 'text-orange-700' },
  CRITICAL: { bg: 'bg-red-100', text: 'text-red-700' },
}

export default function CallDetailModal({ callId, onClose }) {
  const [call, setCall] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('transcript')

  useEffect(() => {
    if (!callId) return
    setLoading(true)
    Promise.all([getCallDetail(callId), getCallMessages(callId)])
      .then(([callData, msgsData]) => {
        setCall(callData)
        setMessages(msgsData.messages || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [callId])

  if (!callId) return null

  const urgStyle = URGENCY_STYLES[call?.urgency] || URGENCY_STYLES.LOW

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-3xl w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
              <Phone className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Call Details</h3>
              <p className="text-xs text-gray-500 font-mono">{callId?.slice(0, 12)}...</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* Call Info Bar */}
            <div className="px-6 py-4 border-b border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-4 flex-shrink-0">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Caller</p>
                <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  {call?.caller_name || 'Unknown'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Phone</p>
                <p className="text-sm font-medium text-gray-900">
                  {call?.caller_phone || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Duration</p>
                <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  {call?.duration_seconds
                    ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Urgency</p>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${urgStyle.bg} ${urgStyle.text}`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  {call?.urgency || 'LOW'}
                </span>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6 pt-2 border-b border-gray-200 flex gap-6 flex-shrink-0">
              {[
                { id: 'transcript', label: 'Transcript', icon: MessageSquare },
                { id: 'summary', label: 'Summary', icon: FileText },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === id
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'transcript' && (
                <div className="space-y-3">
                  {messages.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">
                      No conversation messages recorded
                    </p>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${
                          msg.role === 'caller' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                            msg.role === 'caller'
                              ? 'bg-brand-600 text-white rounded-br-md'
                              : 'bg-gray-100 text-gray-900 rounded-bl-md'
                          }`}
                        >
                          <p className="text-[10px] uppercase font-semibold mb-0.5 opacity-60">
                            {msg.role === 'caller' ? 'Caller' : 'AI Agent'}
                          </p>
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                          <p
                            className={`text-[10px] mt-1 ${
                              msg.role === 'caller' ? 'text-blue-200' : 'text-gray-400'
                            }`}
                          >
                            {msg.timestamp
                              ? format(parseISO(msg.timestamp), 'h:mm:ss a')
                              : ''}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'summary' && (
                <div className="space-y-4">
                  {call?.summary ? (
                    (() => {
                      let summaryObj
                      try {
                        summaryObj =
                          typeof call.summary === 'string'
                            ? JSON.parse(call.summary)
                            : call.summary
                      } catch {
                        summaryObj = null
                      }

                      if (summaryObj && typeof summaryObj === 'object') {
                        return Object.entries(summaryObj).map(([key, value]) => (
                          <div
                            key={key}
                            className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0"
                          >
                            <span className="text-sm text-gray-500 font-medium min-w-[160px] capitalize">
                              {key.replace(/_/g, ' ')}
                            </span>
                            <span className="text-sm text-gray-900 font-medium">
                              {typeof value === 'boolean'
                                ? value
                                  ? 'Yes'
                                  : 'No'
                                : String(value || 'N/A')}
                            </span>
                          </div>
                        ))
                      }

                      return (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {String(call.summary)}
                        </p>
                      )
                    })()
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-8">
                      No summary available
                    </p>
                  )}

                  {call?.urgency_reason && (
                    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-xs font-semibold text-amber-700 mb-1">
                        Urgency Assessment
                      </p>
                      <p className="text-sm text-amber-800">{call.urgency_reason}</p>
                      {call.urgency_confidence > 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          Confidence: {(call.urgency_confidence * 100).toFixed(0)}%
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500 flex-shrink-0">
              <span>
                {call?.started_at
                  ? format(parseISO(call.started_at), 'MMM d, yyyy h:mm a')
                  : ''}
              </span>
              <span>
                Status: <span className="font-medium text-gray-700">{call?.status}</span>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
