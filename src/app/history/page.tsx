'use client'

import { useEffect, useState } from 'react'
import { supabase, type Session, type Transcript, type Rating } from '@/lib/supabase'

type Provider = 'all' | 'openai' | 'elevenlabs'
type Tab = 'info' | 'prompt' | 'transcript' | 'analysis'

interface TranscriptAnalysis {
  id: string
  summary: string | null
  objections_raised: string[] | null
  objections_handled: boolean | null
  reached_closing: boolean | null
  agent_errors: string[] | null
  conversation_dropoff: string | null
  highlight: string | null
  overall_verdict: string | null
}

interface SessionWithDetails extends Session {
  transcripts: Transcript[]
  rating: Rating | null
  analysis: TranscriptAnalysis | null
}

const RATING_LABELS: Record<string, string> = {
  naturalness:        'Natürlichkeit',
  latency:            'Latenz',
  conversation_flow:  'Gesprächsführung',
  objection_handling: 'Einwandbehandlung',
  closing:            'Closing',
  errors:             'Fehler',
}

const SCENARIO_LABELS: Record<string, string> = {
  A_interessiert:  'A – Interessiert',
  B_skeptiker:     'B – Skeptiker',
  C_preissensitiv: 'C – Preissensitiv',
  D_vieltrader:    'D – Vieltrader',
}

const OUTCOME_LABELS: Record<string, string> = {
  interested: 'Interessiert',
  declined:   'Abgelehnt',
  followup:   'Follow-up',
  aborted:    'Abgebrochen',
}

function avgRating(rating: Rating): number {
  const vals = [rating.naturalness, rating.latency, rating.conversation_flow, rating.objection_handling, rating.closing, rating.errors]
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

function formatDuration(secs: number | null): string {
  if (!secs) return '–'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 4 ? 'text-green-400 border-green-400/30 bg-green-400/10'
              : score >= 3 ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10'
                           : 'text-red-400 border-red-400/30 bg-red-400/10'
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${color}`}>⌀ {score}</span>
}

function ProviderBadge({ provider }: { provider: string }) {
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded border border-ct-border text-ct-label">
      {provider === 'openai' ? 'OpenAI' : 'ElevenLabs'}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'completed' ? 'bg-green-400' : status === 'error' ? 'bg-red-400' : 'bg-yellow-400'
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}

function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (verdict === 'strong') return <span className="text-xs font-semibold text-green-400 border border-green-400/30 bg-green-400/10 px-2 py-0.5 rounded">Stark</span>
  if (verdict === 'weak')   return <span className="text-xs font-semibold text-red-400 border border-red-400/30 bg-red-400/10 px-2 py-0.5 rounded">Schwach</span>
  return <span className="text-xs font-semibold text-yellow-400 border border-yellow-400/30 bg-yellow-400/10 px-2 py-0.5 rounded">Ok</span>
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-ct-border/40 last:border-0">
      <span className="text-xs text-ct-label w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-white">{value ?? '–'}</span>
    </div>
  )
}

function SessionCard({ session: initialSession }: { session: SessionWithDetails }) {
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<Tab>('info')
  const [analyzing, setAnalyzing] = useState(false)
  const [session, setSession] = useState(initialSession)

  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      const res = await fetch('/api/analyze-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id }),
      })
      if (res.ok) {
        // Analyse nachladen
        const { data } = await supabase
          .from('transcript_analysis')
          .select('*')
          .eq('session_id', session.id)
          .maybeSingle()
        setSession((s) => ({ ...s, analysis: data as TranscriptAnalysis | null }))
        setTab('analysis')
      }
    } finally {
      setAnalyzing(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'info',       label: 'Info' },
    { id: 'prompt',     label: 'Prompt' },
    { id: 'transcript', label: `Transkript (${session.transcripts.length})` },
    { id: 'analysis',   label: 'Analyse' },
  ]

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
              <span className="text-xs text-ct-label border border-ct-border px-2 py-0.5 rounded">Nicht bewertet</span>
            )}
            {session.analysis && <VerdictBadge verdict={session.analysis.overall_verdict} />}
            {session.prompt_variant && (
              <span className="text-xs font-medium px-2 py-0.5 rounded border border-ct-border text-ct-label uppercase">
                {session.prompt_variant}
              </span>
            )}
            {session.scenario && (
              <span className="text-xs px-2 py-0.5 rounded border border-ct-border text-ct-label">
                {SCENARIO_LABELS[session.scenario] ?? session.scenario}
              </span>
            )}
          </div>
          <p className="text-xs text-ct-secondary mt-1">
            {new Date(session.created_at).toLocaleString('de-DE')}
            {session.tester_name && ` · ${session.tester_name}`}
            {session.call_duration_seconds != null && ` · ${formatDuration(session.call_duration_seconds)}`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {session.analysis ? (
            <span className="text-xs text-ct-teal border border-ct-teal/30 px-2 py-0.5 rounded">Analysiert</span>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); handleAnalyze() }}
              disabled={analyzing}
              className="text-xs border border-ct-border px-2 py-0.5 rounded text-ct-secondary hover:text-white hover:border-ct-primary transition-colors disabled:opacity-40"
            >
              {analyzing ? 'Läuft...' : 'Analysieren'}
            </button>
          )}
          <span className="text-ct-label text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-ct-border">
          {/* Tabs */}
          <div className="flex border-b border-ct-border px-5">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  tab === t.id
                    ? 'border-ct-primary text-white'
                    : 'border-transparent text-ct-secondary hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="px-5 py-4">

            {/* TAB: Info */}
            {tab === 'info' && (
              <div className="space-y-1">
                <InfoRow label="Provider"   value={session.provider === 'openai' ? 'OpenAI' : 'ElevenLabs'} />
                <InfoRow label="Voice"      value={session.voice_id} />
                <InfoRow label="Model"      value={session.model} />
                <InfoRow label="Agent"      value={session.agent_name} />
                <InfoRow label="Szenario"   value={session.scenario ? (SCENARIO_LABELS[session.scenario] ?? session.scenario) : null} />
                <InfoRow label="Tester"     value={session.tester_name} />
                <InfoRow label="Dauer"      value={formatDuration(session.call_duration_seconds)} />
                <InfoRow label="Ergebnis"   value={session.outcome ? (OUTCOME_LABELS[session.outcome] ?? session.outcome) : null} />
                <InfoRow label="Status"     value={session.status} />
                {session.rating && (
                  <>
                    <div className="pt-3 pb-1">
                      <span className="text-xs font-medium uppercase tracking-wider text-ct-label">Bewertung</span>
                    </div>
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
                      <p className="mt-3 text-sm text-ct-secondary italic">&ldquo;{session.rating.notes}&rdquo;</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* TAB: Prompt */}
            {tab === 'prompt' && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-ct-label mb-2">
                    System Prompt
                    {session.prompt_variant && (
                      <span className="ml-2 normal-case font-normal text-ct-secondary">({session.prompt_variant})</span>
                    )}
                  </p>
                  {session.system_prompt ? (
                    <pre className="text-xs text-ct-secondary whitespace-pre-wrap font-mono bg-white/5 rounded-lg p-4 max-h-72 overflow-y-auto">
                      {session.system_prompt}
                    </pre>
                  ) : (
                    <p className="text-sm text-ct-secondary">Kein Prompt gespeichert.</p>
                  )}
                </div>
                {session.rag_content && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-ct-label mb-2">RAG Content</p>
                    <pre className="text-xs text-ct-secondary whitespace-pre-wrap font-mono bg-white/5 rounded-lg p-4 max-h-48 overflow-y-auto">
                      {session.rag_content}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* TAB: Transkript */}
            {tab === 'transcript' && (
              <>
                {session.transcripts.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {session.transcripts.map((msg) => (
                      <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-ct-label mt-1 w-12 text-center">
                          {msg.role === 'agent' ? 'Agent' : 'User'}
                        </span>
                        <div className={`rounded-xl px-3 py-2 text-sm max-w-[80%] ${
                          msg.role === 'agent' ? 'bg-ct-teal text-white' : 'bg-ct-border text-white'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ct-secondary">Kein Transkript vorhanden.</p>
                )}
              </>
            )}

            {/* TAB: Analyse */}
            {tab === 'analysis' && (
              <>
                {session.analysis ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <VerdictBadge verdict={session.analysis.overall_verdict} />
                      {session.analysis.reached_closing != null && (
                        <span className={`text-xs px-2 py-0.5 rounded border ${session.analysis.reached_closing ? 'text-green-400 border-green-400/30' : 'text-ct-label border-ct-border'}`}>
                          {session.analysis.reached_closing ? 'Closing versucht' : 'Kein Closing'}
                        </span>
                      )}
                      {session.analysis.objections_handled != null && (
                        <span className={`text-xs px-2 py-0.5 rounded border ${session.analysis.objections_handled ? 'text-green-400 border-green-400/30' : 'text-red-400 border-red-400/30'}`}>
                          Einwände {session.analysis.objections_handled ? 'behandelt' : 'nicht behandelt'}
                        </span>
                      )}
                    </div>

                    {session.analysis.summary && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-ct-label mb-1">Zusammenfassung</p>
                        <p className="text-sm text-white">{session.analysis.summary}</p>
                      </div>
                    )}

                    {session.analysis.objections_raised && session.analysis.objections_raised.length > 0 && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-ct-label mb-2">Einwände</p>
                        <div className="flex flex-wrap gap-2">
                          {session.analysis.objections_raised.map((o, i) => (
                            <span key={i} className="text-xs bg-white/5 border border-ct-border px-2 py-1 rounded text-ct-secondary">{o}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {session.analysis.highlight && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-ct-label mb-1">Highlight</p>
                        <p className="text-sm text-green-400">{session.analysis.highlight}</p>
                      </div>
                    )}

                    {session.analysis.conversation_dropoff && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-ct-label mb-1">Schwachstelle</p>
                        <p className="text-sm text-yellow-400">{session.analysis.conversation_dropoff}</p>
                      </div>
                    )}

                    {session.analysis.agent_errors && session.analysis.agent_errors.length > 0 && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-ct-label mb-2">Agent-Fehler</p>
                        <div className="flex flex-wrap gap-2">
                          {session.analysis.agent_errors.map((e, i) => (
                            <span key={i} className="text-xs bg-red-400/10 border border-red-400/30 px-2 py-1 rounded text-red-400">{e}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <p className="text-sm text-ct-secondary">Noch keine Analyse für diese Session.</p>
                    <button
                      onClick={handleAnalyze}
                      disabled={analyzing}
                      className="rounded-lg border border-ct-border px-4 py-2 text-sm text-ct-secondary hover:text-white hover:border-ct-primary transition-colors disabled:opacity-40"
                    >
                      {analyzing ? 'Läuft...' : 'Jetzt analysieren'}
                    </button>
                  </div>
                )}
              </>
            )}

          </div>
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

      if (error || !sessionData) { setLoading(false); return }

      const detailed = await Promise.all(
        sessionData.map(async (s: Session) => {
          const [{ data: transcripts }, { data: rating }, { data: analysis }] = await Promise.all([
            supabase.from('transcripts').select('*').eq('session_id', s.id).order('timestamp'),
            supabase.from('ratings').select('*').eq('session_id', s.id).maybeSingle(),
            supabase.from('transcript_analysis').select('*').eq('session_id', s.id).maybeSingle(),
          ])
          return {
            ...s,
            transcripts: (transcripts ?? []) as Transcript[],
            rating: (rating ?? null) as Rating | null,
            analysis: (analysis ?? null) as TranscriptAnalysis | null,
          }
        })
      )

      setSessions(detailed)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = providerFilter === 'all' ? sessions : sessions.filter((s) => s.provider === providerFilter)
  const rated = sessions.filter((s) => s.rating)
  const avgScore = rated.length > 0
    ? (rated.reduce((sum, s) => sum + avgRating(s.rating!), 0) / rated.length).toFixed(1)
    : null

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-8 gap-6">

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-ct-label">Historie</p>
        <h1 className="text-2xl font-bold text-white">Sessions</h1>
      </div>

      {!loading && sessions.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Gesamt',   value: sessions.length },
            { label: 'Bewertet', value: rated.length },
            { label: 'Ø Score',  value: avgScore ?? '–' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-ct-border bg-ct-dark px-4 py-3 text-center">
              <p className="text-2xl font-bold text-ct-primary">{value}</p>
              <p className="text-xs text-ct-secondary mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

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

      {loading && (
        <div className="flex items-center justify-center py-20 text-ct-secondary text-sm">Laden...</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <span className="text-4xl">📋</span>
          <p className="text-ct-secondary text-sm">
            {sessions.length === 0 ? 'Noch keine Sessions. Starte deinen ersten Call unter /call.' : 'Keine Sessions für diesen Filter.'}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-3 pb-8">
          {filtered.map((s) => <SessionCard key={s.id} session={s} />)}
        </div>
      )}
    </div>
  )
}
