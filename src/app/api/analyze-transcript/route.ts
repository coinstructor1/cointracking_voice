import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

const ANALYSIS_PROMPT = `Analysiere das folgende Sales-Call Transkript eines AI Voice Agents für CoinTracking (Krypto-Steuer-Software).

TRANSKRIPT:
[TRANSKRIPT]

Bewerte folgendes und antworte ausschließlich als JSON-Objekt mit diesen Feldern:
{
  "summary": "1-2 Sätze: Was war das Gespräch?",
  "objections": ["Einwand 1", "Einwand 2"],
  "objections_handled": true,
  "reached_closing": false,
  "errors": ["Fehler 1", "Fehler 2"],
  "dropoff": "An welcher Stelle war der Agent am schwächsten?",
  "highlight": "Was hat der Agent besonders gut gemacht?",
  "verdict": "ok"
}

Regeln:
- verdict ist genau einer von: "strong", "ok", "weak"
- objections_handled: true wenn Einwände überzeugend behandelt wurden
- reached_closing: true wenn Agent einen konkreten nächsten Schritt vorgeschlagen hat
- errors: Halluzinationen, falsche Preise, Wiederholungen, Abbrüche (leeres Array wenn keine)
- Antworte nur mit dem JSON, kein zusätzlicher Text`

export async function POST(req: NextRequest) {
  const { session_id } = await req.json()
  console.log('[analyze-transcript] Start for session:', session_id)

  if (!session_id) {
    return Response.json({ error: 'session_id fehlt' }, { status: 400 })
  }

  // Transkript aus Supabase holen
  const { data: transcripts, error: fetchError } = await supabase
    .from('transcripts')
    .select('role, content')
    .eq('session_id', session_id)
    .order('timestamp')

  if (fetchError) {
    console.error('[analyze-transcript] Supabase fetch error:', fetchError)
    return Response.json({ error: 'Supabase-Fehler beim Laden der Transkripte' }, { status: 500 })
  }

  if (!transcripts?.length) {
    console.warn('[analyze-transcript] No transcripts found for session:', session_id)
    return Response.json({ error: 'Keine Transkripte gefunden' }, { status: 404 })
  }

  console.log('[analyze-transcript] Transcripts loaded:', transcripts.length, 'messages')

  const transcriptText = transcripts
    .map((t) => `${t.role === 'agent' ? 'Agent' : 'Kunde'}: ${t.content}`)
    .join('\n')

  // GPT-4o Auswertung
  console.log('[analyze-transcript] Calling OpenAI GPT-4o...')
  const llmRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: ANALYSIS_PROMPT.replace('[TRANSKRIPT]', transcriptText) }],
    }),
  })

  if (!llmRes.ok) {
    const errText = await llmRes.text()
    console.error('[analyze-transcript] OpenAI error:', llmRes.status, errText)
    return Response.json({ error: `LLM-Auswertung fehlgeschlagen: ${llmRes.status}` }, { status: 500 })
  }

  const llmData = await llmRes.json()
  console.log('[analyze-transcript] OpenAI response received')

  let analysis: Record<string, unknown>
  try {
    analysis = JSON.parse(llmData.choices[0].message.content)
    console.log('[analyze-transcript] Parsed analysis:', analysis)
  } catch (e) {
    console.error('[analyze-transcript] JSON parse error:', e, 'Raw:', llmData.choices?.[0]?.message?.content)
    return Response.json({ error: 'LLM-Antwort konnte nicht geparst werden' }, { status: 500 })
  }

  // Evtl. vorhandene Analyse löschen (re-analyse support)
  await supabase.from('transcript_analysis').delete().eq('session_id', session_id)

  // Neue Analyse speichern
  const { data: saved, error: saveError } = await supabase
    .from('transcript_analysis')
    .insert({
      session_id,
      summary:              analysis.summary ?? null,
      objections_raised:    analysis.objections ?? [],
      objections_handled:   analysis.objections_handled ?? null,
      reached_closing:      analysis.reached_closing ?? null,
      agent_errors:         analysis.errors ?? [],
      conversation_dropoff: analysis.dropoff ?? null,
      highlight:            analysis.highlight ?? null,
      overall_verdict:      analysis.verdict ?? null,
    })
    .select()
    .single()

  if (saveError) {
    console.error('[analyze-transcript] Supabase save error:', saveError)
    return Response.json({ error: 'Speichern fehlgeschlagen', detail: saveError.message }, { status: 500 })
  }

  console.log('[analyze-transcript] Saved successfully:', saved?.id)
  return Response.json(saved)
}
