-- Migration: transcript_analysis Tabelle für LLM-Auswertung nach Call
create table transcript_analysis (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  summary text,
  objections_raised text[],
  objections_handled boolean,
  reached_closing boolean,
  agent_errors text[],
  conversation_dropoff text,
  highlight text,
  overall_verdict text,
  created_at timestamptz default now()
);

alter table transcript_analysis enable row level security;
create policy "anon_all_analysis" on transcript_analysis for all using (true) with check (true);
