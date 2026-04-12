'use client'

import { useState } from 'react'
import { saveRating, updateSessionEnd, type Outcome } from '@/lib/supabase'

interface RatingFormProps {
  sessionId: string
  onSubmitted: () => void
}

const CRITERIA = [
  { key: 'naturalness',         label: 'Natürlichkeit',      description: 'Klingt es menschlich?' },
  { key: 'latency',             label: 'Latenz',             description: 'Wie schnell sind die Antworten?' },
  { key: 'conversation_flow',   label: 'Gesprächsführung',   description: 'Bleibt es im Thema?' },
  { key: 'objection_handling',  label: 'Einwandbehandlung',  description: 'Reagiert es sinnvoll auf Einwände?' },
  { key: 'closing',             label: 'Closing',            description: 'Treibt es zu einem konkreten nächsten Schritt?' },
  { key: 'errors',              label: 'Fehler',             description: 'Halluziniert es oder bricht es ab?' },
] as const

type RatingKey = typeof CRITERIA[number]['key']
type Ratings = Record<RatingKey, number>

export default function RatingForm({ sessionId, onSubmitted }: RatingFormProps) {
  const [ratings, setRatings] = useState<Ratings>({
    naturalness: 3,
    latency: 3,
    conversation_flow: 3,
    objection_handling: 3,
    closing: 3,
    errors: 3,
  })
  const [notes, setNotes] = useState('')
  const [outcome, setOutcome] = useState<Outcome>('interested')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await Promise.all([
        saveRating(sessionId, { ...ratings, notes: notes || null }),
        updateSessionEnd(sessionId, { outcome }),
      ])
      onSubmitted()
    } catch (err) {
      console.error('Rating speichern fehlgeschlagen:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-white">Call bewerten</h2>
        <p className="text-sm text-ct-secondary">Jedes Kriterium von 1 (schlecht) bis 5 (sehr gut)</p>
      </div>

      <div className="space-y-5">
        {CRITERIA.map(({ key, label, description }) => (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-white">{label}</span>
                <span className="ml-2 text-xs text-ct-secondary">{description}</span>
              </div>
              <span className="text-sm font-semibold text-ct-primary">{ratings[key]}</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={ratings[key]}
              onChange={(e) => setRatings((r) => ({ ...r, [key]: Number(e.target.value) }))}
              className="w-full accent-ct-primary"
            />
            <div className="flex justify-between text-xs text-ct-label">
              <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white">Gesprächsergebnis</label>
        <select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as Outcome)}
          className="w-full rounded-lg border border-ct-border bg-white/5 px-3 py-2 text-sm text-white focus:border-ct-primary focus:outline-none"
        >
          <option value="interested">Interessiert</option>
          <option value="followup">Follow-up vereinbart</option>
          <option value="declined">Abgelehnt</option>
          <option value="aborted">Abgebrochen</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-white">Notizen</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Was ist aufgefallen? Was war gut, was schlecht?"
          rows={3}
          className="w-full rounded-lg border border-ct-border bg-white/5 px-3 py-2 text-sm text-white placeholder:text-ct-secondary focus:border-ct-primary focus:outline-none resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg bg-ct-primary hover:bg-ct-primary-hover text-white font-semibold py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Speichern...' : 'Bewertung speichern'}
      </button>
    </form>
  )
}
