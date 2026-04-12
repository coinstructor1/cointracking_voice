import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types
export type Provider = 'openai' | 'elevenlabs'
export type SessionStatus = 'active' | 'completed' | 'error'
export type TranscriptRole = 'agent' | 'user'

export type Scenario = 'A_interessiert' | 'B_skeptiker' | 'C_preissensitiv' | 'D_vieltrader'
export type Outcome = 'interested' | 'declined' | 'followup' | 'aborted'

export interface Session {
  id: string
  created_at: string
  provider: Provider
  system_prompt: string | null
  rag_content: string | null
  status: SessionStatus
  voice_id: string | null
  agent_name: string | null
  prompt_variant: string | null
  model: string | null
  scenario: Scenario | null
  tester_name: string | null
  call_duration_seconds: number | null
  outcome: Outcome | null
}

export interface Transcript {
  id: string
  session_id: string
  role: TranscriptRole
  content: string
  timestamp: string
}

export interface TranscriptAnalysis {
  id: string
  session_id: string
  summary: string | null
  objections_raised: string[] | null
  objections_handled: boolean | null
  reached_closing: boolean | null
  agent_errors: string[] | null
  conversation_dropoff: string | null
  highlight: string | null
  overall_verdict: 'strong' | 'ok' | 'weak' | null
  created_at: string
}

export interface Rating {
  id: string
  session_id: string
  naturalness: number
  latency: number
  conversation_flow: number
  objection_handling: number
  closing: number
  errors: number
  notes: string | null
  created_at: string
}

export interface CreateSessionParams {
  provider: Provider
  systemPrompt: string
  ragContent: string
  voiceId: string | null
  agentName: string
  promptVariant: string
  model: string | null
  scenario?: Scenario | null
  testerName?: string | null
}

// DB helpers
export async function createSession(params: CreateSessionParams): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      provider:       params.provider,
      system_prompt:  params.systemPrompt,
      rag_content:    params.ragContent,
      voice_id:       params.voiceId,
      agent_name:     params.agentName,
      prompt_variant: params.promptVariant,
      model:          params.model,
      scenario:       params.scenario ?? null,
      tester_name:    params.testerName ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateSessionStatus(id: string, status: SessionStatus) {
  const { error } = await supabase
    .from('sessions')
    .update({ status })
    .eq('id', id)

  if (error) throw error
}

export async function updateSessionEnd(
  id: string,
  fields: { callDurationSeconds?: number; outcome?: Outcome }
) {
  const update: Record<string, unknown> = {}
  if (fields.callDurationSeconds !== undefined) update.call_duration_seconds = fields.callDurationSeconds
  if (fields.outcome !== undefined) update.outcome = fields.outcome

  const { error } = await supabase.from('sessions').update(update).eq('id', id)
  if (error) throw error
}

export async function addTranscript(
  sessionId: string,
  role: TranscriptRole,
  content: string
) {
  const { error } = await supabase
    .from('transcripts')
    .insert({ session_id: sessionId, role, content })

  if (error) throw error
}

export async function saveRating(
  sessionId: string,
  rating: Omit<Rating, 'id' | 'session_id' | 'created_at'>
) {
  const { error } = await supabase
    .from('ratings')
    .insert({ session_id: sessionId, ...rating })

  if (error) throw error
}

export async function getSessions(): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getAnalysisData() {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      id, created_at, provider, voice_id, agent_name, prompt_variant, model,
      scenario, tester_name, call_duration_seconds, outcome,
      ratings(naturalness, latency, conversation_flow, objection_handling, closing, errors, notes),
      transcript_analysis(summary, overall_verdict, reached_closing, objections_raised, agent_errors)
    `)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getSessionWithDetails(id: string) {
  const [sessionRes, transcriptsRes, ratingRes] = await Promise.all([
    supabase.from('sessions').select('*').eq('id', id).single(),
    supabase.from('transcripts').select('*').eq('session_id', id).order('timestamp'),
    supabase.from('ratings').select('*').eq('session_id', id).single(),
  ])

  return {
    session: sessionRes.data as Session | null,
    transcripts: (transcriptsRes.data ?? []) as Transcript[],
    rating: ratingRes.data as Rating | null,
  }
}
