'use client'

import { useEffect, useState } from 'react'
import { supabase, type Session, type Transcript, type Rating } from '@/lib/supabase'

type Provider = 'all' | 'openai' | 'elevenlabs'

interface SessionWithDetails extends Session {
  transcripts: Transcript[]
  rating: Rating | null
  hasAnalysis: boolean
}

const RATING_LABELS: Record<string, string> = {
  naturalness:        'Natürlichkeit',
  latency:            'Latenz',
  conversation_flow:  'Gesprächsführung',
  objection_handling: 'Einwandbehandlung',
  closing:            'Closing',
  errors:             'Fehler',
}

function avgRating(rating: Rating): number {
  const vals = [
    rating.naturalness,
    rating.latency,
    rating.conversation_flow,
    rating.objection_handling,
    rating.closing,
    rating.errors,
  ]
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 4 ? 'text-green-400 border-green-400/30 bg-green-400/10' :
    score >= 3 ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10' :
                 'text-red-400 border-red-400/30 bg-red-400/10'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${color}`}>
      ⌀ {score}
    </span>
  )
}

function ProviderBadge({ provider }: { provider: string }) {
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded border border-ct-border text-ct-label">
      {provider === 'openai' ? 'OpenAI' : 'ElevenLabs'}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'completed' ? 'bg-green-400' :
    status === 'error'     ? 'bg-red-400'   : 'bg-yellow-400'
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}

function SessionCard({ session }: { session: SessionWithDetails }) {
  const [expanded, setExpanded] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzed, setAnalyzed] = useState(session.hasAnalysis)

  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      const res = await fetch('/api/analyze-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id }),
      })
      if (res.ok) setAnalyzed(true)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="rounded-xl border border-ct-border bg-ct-dark overflow-hidden">
      {/* Header */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/5 transition-colors cursor-pointer"
      >
        <StatusDot status={session.status} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <ProviderBadge provider={session.provider} />
            {session.rating && <ScoreBadge score={avgRating(session.rating)} />}
            {!session.rating && (
              <span className="text-xs text-ct-label border border-ct-border px-2 py-0.5 rounded">
                Nicht bewertet
              </span>
            )}
            {session.prompt_variant && session.prompt_variant !== 'custom' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded border border-ct-border text-ct-label uppercase">
                {session.prompt_variant}
              </span>
            )}
          </div>
          <p className="text-xs text-ct-secondary mt-1">
            {new Date(session.created_at).toLocaleString('de-DE')}
            {session.agent_name && ` · ${session.agent_name}`}
            {session.voice_id && ` · ${session.voice_id}`}
            {session.model && ` · ${session.model}`}
            {' · '}
            {session.transcripts.length} Nachrichten
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {analyzed ? (
            <span className="text-xs text-ct-teal border border-ct-teal/30 px-2 py-0.5 rounded">
              Analysiert
            </span>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); handleAnalyze() }}
              disabled={analyzing}
              className="text-xs border border-ct-border px-2 py-0.5 rounded text-ct-secondary hover:text-white hover:border-ct-primary transition-colors disabled:opacity-40"
            >
              {analyzing ? 'Läuft...' : 'Analysieren'}
            </button>
          )}
          <span className="text-ct-label text-sm">
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-ct-border px-5 py-4 space-y-5">

          {/* Rating Breakdown */}
          {session.rating && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-ct-label mb-3">
                Bewertung
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(RATING_LABELS).map(([key, label]) => {
                  const val = session.rating![key as keyof Rating] as number
                  return (
                    <div key={key} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                      <span className="text-xs text-ct-secondary">{label}</span>
                      <span className="text-xs font-semibold text-white">{val}/5</span>
                    </div>
                  )
                })}
              </div>
              {session.rating.notes && (
                <p className="mt-3 text-sm text-ct-secondary italic">
                  &ldquo;{session.rating.notes}&rdquo;
                </p>
              )}
            </div>
          )}

          {/* Transcript */}
          {session.transcripts.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-ct-label mb-3">
                Transkript
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {session.transcripts.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-ct-label mt-1 w-12 text-center">
                      {msg.role === 'agent' ? 'Agent' : 'User'}
                    </span>
                    <div
                      className={`rounded-xl px-3 py-2 text-sm max-w-[80%] ${
                        msg.role === 'agent'
                          ? 'bg-ct-teal text-white'
                          : 'bg-ct-border text-white'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {session.transcripts.length === 0 && !session.rating && (
            <p className="text-sm text-ct-secondary">Kein Inhalt für diese Session.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [providerFilter, setProviderFilter] = useState<Provider>('all')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: sessionData, error } = await supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false })

      if (error || !sessionData) {
        setLoading(false)
        return
      }

      const detailed = await Promise.all(
        sessionData.map(async (s: Session) => {
          const [{ data: transcripts }, { data: rating }, { data: analysis }] = await Promise.all([
            supabase.from('transcripts').select('*').eq('session_id', s.id).order('timestamp'),
            supabase.from('ratings').select('*').eq('session_id', s.id).maybeSingle(),
            supabase.from('transcript_analysis').select('id').eq('session_id', s.id).maybeSingle(),
          ])
          return {
            ...s,
            transcripts: (transcripts ?? []) as Transcript[],
            rating: (rating ?? null) as Rating | null,
            hasAnalysis: !!analysis,
          }
        })
      )

      setSessions(detailed)
      setLoading(false)
    }

    load()
  }, [])

  const filtered = providerFilter === 'all'
    ? sessions
    : sessions.filter((s) => s.provider === providerFilter)

  const rated = sessions.filter((s) => s.rating)
  const avgScore = rated.length > 0
    ? (rated.reduce((sum, s) => sum + avgRating(s.rating!), 0) / rated.length).toFixed(1)
    : null

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-8 gap-6">

      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-ct-label">
          Historie
        </p>
        <h1 className="text-2xl font-bold text-white">Sessions</h1>
      </div>

      {/* Stats */}
      {!loading && sessions.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Gesamt',     value: sessions.length },
            { label: 'Bewertet',   value: rated.length },
            { label: 'Ø Score',    value: avgScore ?? '–' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-ct-border bg-ct-dark px-4 py-3 text-center">
              <p className="text-2xl font-bold text-ct-primary">{value}</p>
              <p className="text-xs text-ct-secondary mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      {sessions.length > 0 && (
        <div className="flex gap-2">
          {(['all', 'openai', 'elevenlabs'] as Provider[]).map((p) => (
            <button
              key={p}
              onClick={() => setProviderFilter(p)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                providerFilter === p
                  ? 'border-ct-primary bg-ct-primary text-white'
                  : 'border-ct-border text-ct-secondary hover:text-white hover:border-ct-primary'
              }`}
            >
              {p === 'all' ? 'Alle' : p === 'openai' ? 'OpenAI' : 'ElevenLabs'}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-ct-secondary text-sm">
          Laden...
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <span className="text-4xl">📋</span>
          <p className="text-ct-secondary text-sm">
            {sessions.length === 0
              ? 'Noch keine Sessions. Starte deinen ersten Call unter /call.'
              : 'Keine Sessions für diesen Filter.'}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-3 pb-8">
          {filtered.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  )
}
