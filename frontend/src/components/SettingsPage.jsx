import React, { useState, useEffect } from 'react'
import {
  Save,
  Loader2,
  Building2,
  Clock,
  Wrench,
  HelpCircle,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
} from 'lucide-react'
import { getBusinessConfig, updateBusinessConfig } from '../services/api'

function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
        <Icon className="w-5 h-5 text-brand-600" />
        <h3 className="font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

const INPUT_CLS =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent'

export default function SettingsPage() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const data = await getBusinessConfig()
      setConfig(data)
    } catch (err) {
      setError('Failed to load configuration')
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  const updateField = (path, value) => {
    setConfig((prev) => {
      const updated = JSON.parse(JSON.stringify(prev))
      const keys = path.split('.')
      let obj = updated
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]]
      }
      obj[keys[keys.length - 1]] = value
      return updated
    })
    setSuccess(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      await updateBusinessConfig(config)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message || 'Failed to save')
    }
    setSaving(false)
  }

  const addFaq = () => {
    setConfig((prev) => ({
      ...prev,
      faqs: [...(prev.faqs || []), { question: '', answer: '' }],
    }))
  }

  const removeFaq = (index) => {
    setConfig((prev) => ({
      ...prev,
      faqs: prev.faqs.filter((_, i) => i !== index),
    }))
  }

  const updateFaq = (index, field, value) => {
    setConfig((prev) => ({
      ...prev,
      faqs: prev.faqs.map((faq, i) =>
        i === index ? { ...faq, [field]: value } : faq
      ),
    }))
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!config) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Failed to load configuration</p>
        <button onClick={fetchConfig} className="mt-4 text-brand-600 text-sm font-medium">
          Retry
        </button>
      </div>
    )
  }

  const biz = config.business || {}
  const hours = config.hours || {}
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure your business information and AI agent behavior
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchConfig}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            Reload
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : success ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {success ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Business Info */}
        <Section icon={Building2} title="Business Information">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Business Name">
              <input
                type="text"
                value={biz.name || ''}
                onChange={(e) => updateField('business.name', e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Owner Name">
              <input
                type="text"
                value={biz.owner || ''}
                onChange={(e) => updateField('business.owner', e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Phone">
              <input
                type="text"
                value={biz.phone || ''}
                onChange={(e) => updateField('business.phone', e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={biz.email || ''}
                onChange={(e) => updateField('business.email', e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Address">
              <input
                type="text"
                value={biz.address || ''}
                onChange={(e) => updateField('business.address', e.target.value)}
                className={`${INPUT_CLS} md:col-span-2`}
              />
            </Field>
            <Field label="Website">
              <input
                type="url"
                value={biz.website || ''}
                onChange={(e) => updateField('business.website', e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
          </div>
        </Section>

        {/* Business Hours */}
        <Section icon={Clock} title="Business Hours">
          <div className="space-y-3">
            {dayOrder.map((day) => {
              const val = hours[day]
              const isClosed = val === 'closed' || val === null || val === undefined
              return (
                <div key={day} className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-700 w-24 capitalize">
                    {day}
                  </span>
                  <label className="flex items-center gap-2 text-sm text-gray-600 w-20">
                    <input
                      type="checkbox"
                      checked={!isClosed}
                      onChange={(e) => {
                        if (e.target.checked) {
                          updateField(`hours.${day}`, { open: '09:00', close: '17:00' })
                        } else {
                          updateField(`hours.${day}`, 'closed')
                        }
                      }}
                      className="rounded border-gray-300 text-brand-600"
                    />
                    Open
                  </label>
                  {!isClosed && (
                    <>
                      <input
                        type="time"
                        value={val?.open || '09:00'}
                        onChange={(e) =>
                          updateField(`hours.${day}`, { ...val, open: e.target.value })
                        }
                        className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                      />
                      <span className="text-gray-400">to</span>
                      <input
                        type="time"
                        value={val?.close || '17:00'}
                        onChange={(e) =>
                          updateField(`hours.${day}`, { ...val, close: e.target.value })
                        }
                        className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                      />
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </Section>

        {/* FAQs */}
        <Section icon={HelpCircle} title="Frequently Asked Questions">
          <div className="space-y-4">
            {(config.faqs || []).map((faq, i) => (
              <div key={i} className="p-4 bg-gray-50 rounded-lg relative group">
                <button
                  onClick={() => removeFaq(i)}
                  className="absolute top-2 right-2 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <Field label={`Question ${i + 1}`}>
                  <input
                    type="text"
                    value={faq.question}
                    onChange={(e) => updateFaq(i, 'question', e.target.value)}
                    className={INPUT_CLS}
                    placeholder="Enter the question..."
                  />
                </Field>
                <div className="mt-3">
                  <Field label="Answer">
                    <textarea
                      value={faq.answer}
                      onChange={(e) => updateFaq(i, 'answer', e.target.value)}
                      className={`${INPUT_CLS} resize-none`}
                      rows={2}
                      placeholder="Enter the answer..."
                    />
                  </Field>
                </div>
              </div>
            ))}
            <button
              onClick={addFaq}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add FAQ
            </button>
          </div>
        </Section>

        {/* Greeting Style */}
        <Section icon={Building2} title="Greeting & Tone">
          <div className="space-y-4">
            <Field label="Greeting (during business hours)">
              <textarea
                value={config.greeting_style?.greeting_template || ''}
                onChange={(e) =>
                  updateField('greeting_style.greeting_template', e.target.value)
                }
                className={`${INPUT_CLS} resize-none`}
                rows={2}
                placeholder="Use {business_name} and {owner_name} as placeholders"
              />
            </Field>
            <Field label="After-Hours Greeting">
              <textarea
                value={config.greeting_style?.after_hours_template || ''}
                onChange={(e) =>
                  updateField('greeting_style.after_hours_template', e.target.value)
                }
                className={`${INPUT_CLS} resize-none`}
                rows={2}
              />
            </Field>
            <Field label="Voicemail Template">
              <textarea
                value={config.greeting_style?.voicemail_template || ''}
                onChange={(e) =>
                  updateField('greeting_style.voicemail_template', e.target.value)
                }
                className={`${INPUT_CLS} resize-none`}
                rows={2}
              />
            </Field>
          </div>
        </Section>
      </div>
    </div>
  )
}
