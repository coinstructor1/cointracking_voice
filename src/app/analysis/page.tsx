'use client'

import { useEffect, useState } from 'react'
import { getAnalysisData } from '@/lib/supabase'

type RatingRow = {
  naturalness: number
  latency: number
  conversation_flow: number
  objection_handling: number
  closing: number
  errors: number
  notes: string | null
}

type AnalysisRow = {
  summary: string | null
  overall_verdict: string | null
  reached_closing: boolean | null
  objections_raised: string[] | null
  agent_errors: string[] | null
}

type SessionRow = {
  id: string
  created_at: string
  provider: string
  voice_id: string | null
  agent_name: string | null
  prompt_variant: string | null
  model: string | null
  scenario: string | null
  tester_name: string | null
  call_duration_seconds: number | null
  outcome: string | null
  ratings: RatingRow[]
  transcript_analysis: AnalysisRow[]
}

function avgScore(r: RatingRow): number {
  return (r.naturalness + r.latency + r.conversation_flow + r.objection_handling + r.closing + r.errors) / 6
}

function groupAvg(sessions: SessionRow[], key: (s: SessionRow) => string | null) {
  const groups: Record<string, number[]> = {}
  for (const s of sessions) {
    const r = s.ratings[0]
    if (!r) continue
    const k = key(s) ?? 'Unbekannt'
    if (!groups[k]) groups[k] = []
    groups[k].push(avgScore(r))
  }
  return Object.entries(groups)
    .map(([label, scores]) => ({
      label,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      count: scores.length,
    }))
    .sort((a, b) => b.avg - a.avg)
}

function scenarioLabel(s: string | null) {
  const map: Record<string, string> = {
    A_interessiert: 'A – Interessiert',
    B_skeptiker: 'B – Skeptiker',
    C_preissensitiv: 'C – Preissensitiv',
    D_vieltrader: 'D – Vieltrader',
  }
  return s ? (map[s] ?? s) : 'Kein Szenario'
}

function verdictBadge(v: string | null) {
  if (v === 'strong') return <span className="text-green-400 font-semibold">stark</span>
  if (v === 'weak') return <span className="text-red-400 font-semibold">schwach</span>
  return <span className="text-yellow-400 font-semibold">ok</span>
}

function exportCSV(sessions: SessionRow[]) {
  const headers = [
    'id', 'datum', 'provider', 'voice', 'prompt', 'szenario', 'tester',
    'dauer_sek', 'ergebnis', 'natürlichkeit', 'latenz', 'gesprächsführung',
    'einwände', 'closing', 'fehler', 'ø_score', 'verdict',
  ]
  const rows = sessions.map((s) => {
    const r = s.ratings[0]
    const a = s.transcript_analysis[0]
    const avg = r ? avgScore(r).toFixed(2) : ''
    return [
      s.id,
      new Date(s.created_at).toLocaleDateString('de-DE'),
      s.provider,
      s.voice_id ?? '',
      s.prompt_variant ?? '',
      s.scenario ?? '',
      s.tester_name ?? '',
      s.call_duration_seconds ?? '',
      s.outcome ?? '',
      r?.naturalness ?? '',
      r?.latency ?? '',
      r?.conversation_flow ?? '',
      r?.objection_handling ?? '',
      r?.closing ?? '',
      r?.errors ?? '',
      avg,
      a?.overall_verdict ?? '',
    ]
  })
  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cointracking-voice-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AnalysisPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAnalysisData()
      .then((data) => setSessions(data as SessionRow[]))
      .catch(() => setError('Daten konnten nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [])

  const rated = sessions.filter((s) => s.ratings[0])

  const byProvider = groupAvg(sessions, (s) => s.provider === 'openai' ? 'OpenAI' : 'ElevenLabs')
  const byPrompt = groupAvg(sessions, (s) => s.prompt_variant)
  const byVoice = groupAvg(sessions, (s) => s.voice_id)
  const byScenario = groupAvg(sessions, (s) => scenarioLabel(s.scenario))

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-ct-secondary">
        Lade Daten...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400">{error}</div>
    )
  }

  return (
    <div className="flex-1 px-4 py-8 max-w-4xl mx-auto w-full space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Analyse-Dashboard</h1>
          <p className="text-sm text-ct-secondary mt-0.5">
            {rated.length} bewertete Sessions · {sessions.length} gesamt
          </p>
        </div>
        <button
          onClick={() => exportCSV(sessions)}
          className="rounded-lg border border-ct-border px-4 py-2 text-sm text-ct-secondary hover:text-white hover:border-ct-primary transition-colors"
        >
          CSV Export
        </button>
      </div>

      {rated.length === 0 && (
        <div className="rounded-xl border border-ct-border bg-ct-dark p-8 text-center text-ct-secondary">
          Noch keine bewerteten Sessions vorhanden.
        </div>
      )}

      {rated.length > 0 && (
        <>
          {/* Provider Leaderboard */}
          <Section title="Provider-Vergleich">
            <Table
              headers={['Provider', 'Ø Score', 'Sessions']}
              rows={byProvider.map((r) => [
                r.label,
                <Score key="s" value={r.avg} />,
                r.count,
              ])}
            />
          </Section>

          {/* Prompt Comparison */}
          <Section title="Prompt-Vergleich">
            <Table
              headers={['Prompt', 'Ø Score', 'Sessions']}
              rows={byPrompt.map((r) => [
                r.label,
                <Score key="s" value={r.avg} />,
                r.count,
              ])}
            />
          </Section>

          {/* Voice Comparison */}
          {byVoice.length > 1 && (
            <Section title="Voice-Vergleich">
              <Table
                headers={['Voice', 'Ø Score', 'Sessions']}
                rows={byVoice.map((r) => [
                  r.label,
                  <Score key="s" value={r.avg} />,
                  r.count,
                ])}
              />
            </Section>
          )}

          {/* Scenario Matrix */}
          <Section title="Szenario-Auswertung">
            <Table
              headers={['Szenario', 'Ø Score', 'Sessions']}
              rows={byScenario.map((r) => [
                r.label,
                <Score key="s" value={r.avg} />,
                r.count,
              ])}
            />
          </Section>

          {/* Recent Sessions */}
          <Section title="Letzte Sessions">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ct-border text-xs text-ct-label uppercase tracking-wider">
                    <th className="text-left pb-2 pr-4">Datum</th>
                    <th className="text-left pb-2 pr-4">Provider</th>
                    <th className="text-left pb-2 pr-4">Szenario</th>
                    <th className="text-left pb-2 pr-4">Tester</th>
                    <th className="text-left pb-2 pr-4">Score</th>
                    <th className="text-left pb-2">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.slice(0, 20).map((s) => {
                    const r = s.ratings[0]
                    const a = s.transcript_analysis[0]
                    return (
                      <tr key={s.id} className="border-b border-ct-border/40 hover:bg-white/5">
                        <td className="py-2 pr-4 text-ct-secondary">
                          {new Date(s.created_at).toLocaleDateString('de-DE')}
                        </td>
                        <td className="py-2 pr-4 text-white capitalize">{s.provider}</td>
                        <td className="py-2 pr-4 text-ct-secondary">{scenarioLabel(s.scenario)}</td>
                        <td className="py-2 pr-4 text-ct-secondary">{s.tester_name ?? '–'}</td>
                        <td className="py-2 pr-4">
                          {r ? <Score value={avgScore(r)} /> : <span className="text-ct-label">–</span>}
                        </td>
                        <td className="py-2">{a ? verdictBadge(a.overall_verdict) : <span className="text-ct-label">–</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ct-border bg-ct-dark p-6 space-y-4">
      <h2 className="text-sm font-medium uppercase tracking-wider text-ct-label">{title}</h2>
      {children}
    </div>
  )
}

function Table({
  headers,
  rows,
}: {
  headers: string[]
  rows: (string | number | React.ReactNode)[][]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ct-border text-xs text-ct-label uppercase tracking-wider">
            {headers.map((h) => (
              <th key={h} className="text-left pb-2 pr-6">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-ct-border/40 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="py-2.5 pr-6 text-white">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Score({ value }: { value: number }) {
  const color =
    value >= 4 ? 'text-green-400' : value >= 3 ? 'text-yellow-400' : 'text-red-400'
  return <span className={`font-semibold ${color}`}>{value.toFixed(1)}</span>
}
