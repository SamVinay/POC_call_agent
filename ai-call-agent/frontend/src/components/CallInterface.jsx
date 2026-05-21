import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  MessageSquare,
  Send,
  Volume2,
  Clock,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from 'lucide-react'
import { startCall, createCallWebSocket } from '../services/api'
import { AudioHandler, float32ToBase64, playAudioBase64 } from '../services/webrtc'

const URGENCY_COLORS = {
  LOW: 'text-green-600 bg-green-50',
  MEDIUM: 'text-yellow-600 bg-yellow-50',
  HIGH: 'text-orange-600 bg-orange-50',
  CRITICAL: 'text-red-600 bg-red-50 animate-pulse',
}

export default function CallInterface({ backendReady }) {
  const [callState, setCallState] = useState('idle') // idle | connecting | active | ended
  const [callId, setCallId] = useState(null)
  const [messages, setMessages] = useState([])
  const [textInput, setTextInput] = useState('')
  const [useVoice, setUseVoice] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [currentUrgency, setCurrentUrgency] = useState(null)
  const [callDuration, setCallDuration] = useState(0)
  const [callSummary, setCallSummary] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const wsRef = useRef(null)
  const audioHandlerRef = useRef(null)
  const messagesEndRef = useRef(null)
  const timerRef = useRef(null)

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Call duration timer
  useEffect(() => {
    if (callState === 'active') {
      timerRef.current = setInterval(() => {
        setCallDuration((d) => d + 1)
      }, 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [callState])

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const addMessage = useCallback((role, text) => {
    setMessages((prev) => [
      ...prev,
      { role, text, timestamp: new Date().toISOString() },
    ])
  }, [])

  // --- Start a call ---
  const handleStartCall = async () => {
    if (!backendReady) return
    setCallState('connecting')
    setMessages([])
    setCallDuration(0)
    setCallSummary(null)
    setCurrentUrgency(null)

    try {
      const data = await startCall()
      setCallId(data.call_id)
      addMessage('assistant', data.greeting)

      // Play greeting audio if available
      if (data.greeting_audio_b64) {
        playAudioBase64(data.greeting_audio_b64).catch(() => {})
      }

      // Connect WebSocket
      const ws = createCallWebSocket(data.call_id)

      ws.onopen = () => {
        setCallState('active')
      }

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)

        if (msg.type === 'transcript') {
          // Caller's speech transcription
          addMessage('caller', msg.text)
        } else if (msg.type === 'response') {
          addMessage('assistant', msg.text)
          setIsProcessing(false)
          if (msg.urgency) {
            setCurrentUrgency(msg.urgency)
          }
          // Play audio response
          if (msg.audio) {
            playAudioBase64(msg.audio).catch(() => {})
          }
        } else if (msg.type === 'call_ended') {
          setCallSummary(msg)
          setCallState('ended')
        } else if (msg.type === 'error') {
          addMessage('system', `Error: ${msg.message}`)
        }
      }

      ws.onclose = () => {
        if (callState !== 'ended') {
          setCallState('ended')
        }
      }

      ws.onerror = () => {
        addMessage('system', 'Connection error occurred')
        setCallState('idle')
      }

      wsRef.current = ws
    } catch (err) {
      addMessage('system', `Failed to start call: ${err.message}`)
      setCallState('idle')
    }
  }

  // --- End the call ---
  const handleEndCall = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_call' }))
    }

    if (audioHandlerRef.current) {
      audioHandlerRef.current.stop()
      setIsRecording(false)
    }
  }

  // --- Send text message ---
  const handleSendText = () => {
    const text = textInput.trim()
    if (!text || !wsRef.current || callState !== 'active') return

    addMessage('caller', text)
    wsRef.current.send(JSON.stringify({ type: 'text', data: text }))
    setTextInput('')
    setIsProcessing(true)
  }

  // --- Toggle voice recording ---
  const handleToggleVoice = async () => {
    if (isRecording) {
      audioHandlerRef.current?.stop()
      setIsRecording(false)
    } else {
      const handler = new AudioHandler({
        onAudioChunk: (chunk) => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const b64 = float32ToBase64(chunk)
            wsRef.current.send(
              JSON.stringify({ type: 'audio', data: b64, sample_rate: 16000 })
            )
            setIsProcessing(true)
          }
        },
        sampleRate: 16000,
        chunkDurationMs: 3000,
      })

      const started = await handler.start()
      if (started) {
        audioHandlerRef.current = handler
        setIsRecording(true)
      }
    }
  }

  // --- New call after ended ---
  const handleNewCall = () => {
    setCallState('idle')
    setCallId(null)
    setMessages([])
    setCallDuration(0)
    setCallSummary(null)
    setCurrentUrgency(null)
    wsRef.current = null
  }

  return (
    <div className="p-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Call Simulator</h2>
          <p className="text-sm text-gray-500 mt-1">
            Test the AI agent by simulating a phone call
          </p>
        </div>
        <div className="flex items-center gap-3">
          {callState === 'active' && (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <Clock className="w-4 h-4 text-red-600" />
                <span className="text-sm font-mono font-medium text-red-700">
                  {formatDuration(callDuration)}
                </span>
              </div>
              {currentUrgency && (
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${URGENCY_COLORS[currentUrgency.urgency] || ''}`}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {currentUrgency.urgency}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main call area */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Call status bar */}
        {callState !== 'idle' && (
          <div className={`px-6 py-3 border-b flex items-center justify-between ${
            callState === 'active' ? 'bg-green-50 border-green-200' :
            callState === 'connecting' ? 'bg-yellow-50 border-yellow-200' :
            'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              <span className="text-sm font-medium">
                {callState === 'connecting' ? 'Connecting...' :
                 callState === 'active' ? 'Call Active' :
                 'Call Ended'}
              </span>
            </div>
            <span className="text-xs text-gray-500 font-mono">{callId?.slice(0, 8)}</span>
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {callState === 'idle' ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-20 h-20 rounded-full bg-brand-50 flex items-center justify-center mb-6">
                <Phone className="w-10 h-10 text-brand-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Ready to Simulate a Call
              </h3>
              <p className="text-gray-500 max-w-md mb-8">
                Click the button below to start a test call. You can type messages or use
                your microphone to talk to the AI agent.
              </p>
              <div className="flex gap-4 items-center mb-6">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={useVoice}
                    onChange={(e) => setUseVoice(e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  Enable voice mode
                </label>
              </div>
              <button
                onClick={handleStartCall}
                disabled={!backendReady}
                className="flex items-center gap-2 px-8 py-4 bg-green-600 text-white rounded-xl font-semibold text-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-200"
              >
                <Phone className="w-6 h-6" />
                Start Call
              </button>
              {!backendReady && (
                <p className="text-xs text-red-500 mt-3">
                  Backend is not ready. Please ensure the server is running.
                </p>
              )}
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'caller' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                      msg.role === 'caller'
                        ? 'bg-brand-600 text-white rounded-br-md'
                        : msg.role === 'system'
                        ? 'bg-gray-100 text-gray-500 text-xs italic'
                        : 'bg-gray-100 text-gray-900 rounded-bl-md'
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                    <p className={`text-[10px] mt-1 ${
                      msg.role === 'caller' ? 'text-blue-200' : 'text-gray-400'
                    }`}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}

              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input area */}
        {callState === 'active' && (
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center gap-3">
              {useVoice && (
                <button
                  onClick={handleToggleVoice}
                  className={`p-3 rounded-xl transition-colors ${
                    isRecording
                      ? 'bg-red-100 text-red-600 hover:bg-red-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title={isRecording ? 'Stop recording' : 'Start recording'}
                >
                  {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              )}

              <div className="flex-1 relative">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                  placeholder="Type a message as the caller..."
                  className="w-full px-4 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-colors"
                  disabled={isProcessing}
                />
              </div>

              <button
                onClick={handleSendText}
                disabled={!textInput.trim() || isProcessing}
                className="p-3 bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
              </button>

              <button
                onClick={handleEndCall}
                className="p-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
                title="End call"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Call summary */}
        {callState === 'ended' && callSummary && (
          <div className="border-t border-gray-200 p-6 bg-gray-50">
            <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Call Summary
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {callSummary.summary && Object.entries(callSummary.summary).map(([key, value]) => (
                <div key={key}>
                  <span className="text-gray-500 capitalize">
                    {key.replace(/_/g, ' ')}:
                  </span>{' '}
                  <span className="font-medium text-gray-900">
                    {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                  </span>
                </div>
              ))}
              {callSummary.duration_seconds && (
                <div>
                  <span className="text-gray-500">Duration:</span>{' '}
                  <span className="font-medium">{formatDuration(callSummary.duration_seconds)}</span>
                </div>
              )}
            </div>
            <button
              onClick={handleNewCall}
              className="mt-6 px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              Start New Call
            </button>
          </div>
        )}

        {callState === 'ended' && !callSummary && (
          <div className="border-t border-gray-200 p-6 bg-gray-50 text-center">
            <p className="text-gray-500 mb-4">Call has ended</p>
            <button
              onClick={handleNewCall}
              className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
            >
              Start New Call
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
