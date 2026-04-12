# Implementierungsplan – AI Voice Sales Agent MVP

> Tech Stack: Next.js, Supabase, Vercel, OpenAI Realtime API, ElevenLabs Conv. AI
> Fonio: zurückgestellt (kein Browser-SDK, nur Telefonie-API)

---

## Phase 0 – Setup (Tag 1)

### 0.1 Projekt initialisieren
Du hast bereits ein leeres Repo gecloned. Navigiere dort rein und führe aus:

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint --import-alias "@/*" --yes
```

- `.` → installiert ins aktuelle Verzeichnis (nicht in Unterordner)
- `--yes` → überspringt alle interaktiven Fragen

Falls `--yes` nicht alle Prompts unterdrückt, alternativ:
```bash
echo "y" | npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint --import-alias "@/*"
```

### 0.2 Dependencies
```bash
npm install @supabase/supabase-js
npm install @elevenlabs/react
# OpenAI Realtime: kein npm-Paket nötig, nutzt native WebRTC APIs
```

### 0.3 Supabase Projekt anlegen
- Neues Projekt auf supabase.com
- DB Schema (siehe unten)
- Supabase URL + Anon Key in `.env.local`

### 0.4 Environment Variables (.env.local)
```
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### 0.5 Vercel Projekt anlegen
- Repo verbinden
- Env Vars auf Vercel setzen
- Auto-Deploy von main Branch

---

## Phase 1 – Datenbank Schema (Tag 1)

### Supabase Tabellen

**sessions**
```sql
create table sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  provider text not null,           -- 'openai' | 'elevenlabs'
  voice_id text,                    -- z.B. 'echo', 'nova' (OpenAI) oder ElevenLabs Voice ID
  agent_name text,                  -- z.B. 'Luca'
  prompt_variant text,              -- 'v1_standard' | 'v2_aktiv' | 'v3_beratend' | 'custom'
  scenario text,                    -- 'A_interessiert' | 'B_skeptiker' | 'C_preissensitiv' | 'D_vieltrader'
  tester_name text,                 -- Wer hat getestet?
  call_duration_seconds int,        -- Gesprächslänge
  outcome text,                     -- 'interested' | 'declined' | 'followup' | 'aborted'
  language text default 'de',       -- 'de' | 'en'
  system_prompt text,
  rag_content text,
  status text default 'active'      -- 'active' | 'completed' | 'error'
);
```

**transcripts**
```sql
create table transcripts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  role text not null, -- 'agent' | 'user'
  content text not null,
  timestamp timestamptz default now()
);
```

**ratings**
```sql
create table ratings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  naturalness int check (naturalness between 1 and 5),
  latency int check (latency between 1 and 5),
  conversation_flow int check (conversation_flow between 1 and 5),
  objection_handling int check (objection_handling between 1 and 5),
  closing int check (closing between 1 and 5),
  errors int check (errors between 1 and 5),
  notes text,
  created_at timestamptz default now()
);
```

**transcript_analysis** (LLM-Auswertung nach Call)
```sql
create table transcript_analysis (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  summary text,
  objections_raised text[],
  objections_handled boolean,
  reached_closing boolean,
  agent_errors text[],
  conversation_dropoff text,
  highlight text,
  overall_verdict text,             -- 'strong' | 'ok' | 'weak'
  created_at timestamptz default now()
);
```

### Row Level Security (RLS)
```sql
alter table sessions enable row level security;
alter table transcripts enable row level security;
alter table ratings enable row level security;
alter table transcript_analysis enable row level security;

create policy "anon_all_sessions" on sessions for all using (true);
create policy "anon_all_transcripts" on transcripts for all using (true);
create policy "anon_all_ratings" on ratings for all using (true);
create policy "anon_all_analysis" on transcript_analysis for all using (true);
```
> ⚠️ Für Produktion: RLS auf auth.uid() umstellen + Login-Flow einbauen.

---

## Phase 2 – UI Layout (Tag 1–2)

### Seiten-Struktur (App Router)
```
src/app/
├── page.tsx              # Landing / Provider-Auswahl
├── call/
│   └── page.tsx          # Call-Interface (Haupt-Screen)
├── config/
│   └── page.tsx          # System Prompt + RAG Editor
├── history/
│   └── page.tsx          # Vergangene Sessions + Ratings
├── analysis/
│   └── page.tsx          # Auswertungs-Dashboard
├── api/
│   ├── openai-token/
│   │   └── route.ts      # Ephemeral Token für OpenAI WebRTC
│   ├── elevenlabs-token/
│   │   └── route.ts      # Signed URL für ElevenLabs
│   └── analyze-transcript/
│       └── route.ts      # LLM-Auswertung nach Call-Ende
```

### UI Komponenten
```
src/components/
├── ProviderSelector.tsx   # OpenAI / ElevenLabs Auswahl
├── CallInterface.tsx      # Mic Button, Waveform, Status
├── TranscriptView.tsx     # Live-Transkript während Call
├── PromptEditor.tsx       # Textarea für System Prompt
├── RagEditor.tsx          # Textarea / File Upload für RAG
├── RatingForm.tsx         # 1-5 Sterne × 6 Kriterien + Notizen
├── SessionHistory.tsx     # Liste vergangener Sessions
├── ErrorBanner.tsx        # Fehler-Anzeige
├── AnalysisLeaderboard.tsx # Provider/Prompt/Voice Scores
├── ObjectionChart.tsx     # Einwand-Häufigkeiten
└── ErrorPatterns.tsx      # Häufigste Agent-Fehler
```

### Call-Screen Layout
```
┌─────────────────────────────────┐
│  Provider: [OpenAI ▾]          │
│                                 │
│    ┌─────────────────────┐     │
│    │                     │     │
│    │   🎙️ Call Active    │     │
│    │   02:34             │     │
│    │                     │     │
│    │  [End Call]         │     │
│    └─────────────────────┘     │
│                                 │
│  Live Transcript:               │
│  Agent: Hallo, ich bin...       │
│  User: Hi, ich nutze...         │
│  Agent: Super, wie viele...     │
│                                 │
└─────────────────────────────────┘
```

---

## Phase 3 – OpenAI Realtime API Integration (Tag 2–3)

### Architektur
```
Browser → API Route (Next.js) → OpenAI Ephemeral Token
Browser → WebRTC (direkt zu OpenAI) → Audio In/Out
```

### 3.1 Server: Ephemeral Token Endpoint
```
POST /api/openai-token
→ Ruft OpenAI API mit OPENAI_API_KEY auf
→ Gibt ephemeral Token an Client zurück
→ Token ist kurzlebig (60 Sekunden)
```

Referenz: https://developers.openai.com/api/docs/guides/realtime-webrtc

### 3.2 Client: WebRTC Verbindung
```
1. Token von /api/openai-token holen
2. RTCPeerConnection erstellen
3. getUserMedia() → Mikrofon-Audio als Track hinzufügen
4. createOffer() → SDP an OpenAI senden (mit Token)
5. Remote SDP setzen → Verbindung steht
6. Audio Output über <audio> Element abspielen
```

### 3.2.1 Voice konfigurieren
```
Agent Name: Luca
OpenAI Voice: "echo"

Beim session.update mitgeben:
{
  type: "session.update",
  session: {
    voice: "echo",
    instructions: "[System Prompt + RAG hier]",
    input_audio_transcription: { model: "whisper-1" }
  }
}
```

Verfügbare OpenAI Voices zur Referenz:
- Männlich: echo, onyx, fable, ash, verse
- Weiblich: nova, shimmer, coral, sage
- Neutral:  alloy, ballad

### 3.3 System Prompt & RAG senden
```
Beim Erstellen der Session (NICHT über Data Channel):
→ System Prompt + RAG-Inhalte zusammen als "instructions" übergeben
→ Entweder beim Ephemeral Token Request (serverseitig)
→ Oder via session.update Event direkt nach Verbindungsaufbau
→ RAG-Content wird als Teil der instructions angehängt (kein separates System)
→ input_audio_transcription aktivieren für Transkript
```

**Wichtig:** OpenAI Realtime nutzt den Data Channel nur für Events/Steuerung,
nicht für initialen System Prompt. Prompt muss beim Session-Start gesetzt werden.

### 3.4 Transkript empfangen
```
Über Data Channel Events:
- response.audio_transcript.delta → Agent spricht (partial)
- response.audio_transcript.done → Agent fertig
- conversation.item.input_audio_transcription.completed → User sprach
→ Alles in Supabase transcripts Tabelle schreiben
```

Starter-Repo: https://github.com/cameronking4/openai-realtime-api-nextjs

---

## Phase 4 – ElevenLabs Integration (Tag 3–4)

### Architektur
```
Browser → @elevenlabs/react SDK → ElevenLabs WebSocket → Audio In/Out
```

### 4.1 Server: Signed URL Endpoint
```
POST /api/elevenlabs-token
→ Ruft ElevenLabs API auf mit ELEVENLABS_API_KEY
→ Gibt signed_url zurück für Client-Verbindung
```

### 4.2 Client: React Hook
```tsx
import { useConversation } from '@elevenlabs/react';

const conversation = useConversation({
  onMessage: (msg) => { /* Transkript speichern */ },
  onError: (err) => { /* Error handling */ },
});

// Starten
await conversation.startSession({
  signedUrl: '/api/elevenlabs-token',
  // oder agentId wenn Agent in ElevenLabs Dashboard konfiguriert
});

// Beenden
await conversation.endSession();
```

Referenz: https://elevenlabs.io/docs/conversational-ai/guides/conversational-ai-guide-nextjs

### 4.3 System Prompt & RAG
```
Zwei Optionen:
A) Agent im ElevenLabs Dashboard konfigurieren (prompt + knowledge base)
B) Dynamisch über API: prompt und context im startSession() übergeben

→ Für unser MVP: Option B (damit Prompt in unserer UI editierbar bleibt)
```

### 4.4 Transkript
```
onMessage Callback liefert:
- agent_response → Was der Agent sagt
- user_transcript → Was der User sagt
→ In Supabase speichern
```

---

## Phase 5 – Config & RAG UI (Tag 4)

### 5.1 System Prompt Editor
- Textarea mit den 3 vordefinierten Varianten (v1/v2/v3) als Dropdown
- Custom-Prompt Option
- Wird vor Call-Start an den jeweiligen Provider übergeben
- In Supabase sessions.system_prompt gespeichert

### 5.2 RAG Content Editor
- Textarea für manuellen Text-Input
- File Upload (TXT, PDF) → Text extrahieren
- Content wird als Teil des System Prompts / Kontexts mitgeschickt
- In Supabase sessions.rag_content gespeichert

### 5.3 Prompt-Vorlagen
- Defaultmäßig geladen aus den .md Dateien (03_system_prompt.md Varianten)
- In der UI unter "Templates" wählbar

---

## Phase 6 – Call-Bewertung (Tag 4–5)

### 6.1 Rating Form (nach Call-Ende)
```
Nach Beenden des Calls erscheint automatisch:
- 6 Slider (1–5) für die Bewertungskriterien:
  1. Natürlichkeit
  2. Latenz
  3. Gesprächsführung
  4. Einwandbehandlung
  5. Closing
  6. Fehler
- Freitext-Notizen
- Submit → Supabase ratings Tabelle
```

### 6.2 Session History
- Liste aller bisherigen Sessions
- Pro Session: Provider, Datum, Score, Transkript
- Filter nach Provider / Score
- Daten aus Supabase

---

## Phase 7 – Error Handling (Tag 5)

Siehe `08_error_handling.md` – implementieren:
- Mikrofon-Check vor Call-Start
- Connection-Retry mit Exponential Backoff
- Provider-Fehler Fallback-UI
- Alle Errors in Supabase loggen

---

## Phase 8 – Auswertung & Analyse (Tag 6)

### 8.1 Session-Felder in Call-UI ergänzen
Vor Call-Start muss der Tester angeben:
- **Szenario** – Dropdown (A/B/C/D)
- **Tester-Name** – Textfeld
- Werden in `sessions` gespeichert

### 8.2 API Route: LLM-Transkript-Auswertung
```
POST /api/analyze-transcript
Input: { session_id }
→ Transkript aus Supabase holen
→ GPT-4o Auswertungs-Prompt schicken (siehe 11_auswertung.md)
→ JSON-Antwort in transcript_analysis Tabelle speichern
Trigger: Automatisch nach Call-Ende + Manuell per Button
```

### 8.3 Call-Ende Flow (erweiterter)
```
1. Call endet
2. call_duration_seconds berechnen + speichern
3. /api/analyze-transcript automatisch aufrufen
4. Rating Form anzeigen (inkl. outcome Dropdown)
5. Nach Rating Submit → zur Session History
```

### 8.4 Analyse-Dashboard (/analysis)
- **Leaderboard:** Ø Score pro Provider / Prompt / Voice
- **Szenario-Matrix:** Welche Kombination gewinnt pro Szenario?
- **Einwand-Analyse:** Häufigste Einwände + Behandlungsrate
- **Fehler-Patterns:** Häufigste Agent-Fehler
- **CSV Export:** Button → Download aller Daten als .csv
- Datenquelle: Supabase JOIN Query aus `11_auswertung.md`

---

## Phase 9 – Deploy & Test (Tag 6–7)

### 8.1 Vercel Deploy
- `vercel deploy` oder Auto-Deploy via Git Push
- Env Vars auf Vercel konfiguriert
- Domain zuweisen (optional)

### 8.2 Smoke Test
- Call mit OpenAI starten → funktioniert Audio?
- Call mit ElevenLabs starten → funktioniert Audio?
- Prompt editieren → wird er übernommen?
- RAG Content laden → hat der Agent die Infos?
- Call bewerten → landet es in Supabase?
- Transkript prüfen → ist es vollständig?

---

## Zeitplan Übersicht

| Phase | Was | Aufwand |
|---|---|---|
| 0 | Setup (Next.js, Supabase, Vercel, Env) | 0.5 Tag |
| 1 | DB Schema (inkl. transcript_analysis) | 0.5 Tag |
| 2 | UI Layout & Komponenten | 1 Tag |
| 3 | OpenAI Realtime API Integration | 1.5 Tage |
| 4 | ElevenLabs Integration | 1 Tag |
| 5 | Config & RAG UI | 0.5 Tag |
| 6 | Call-Bewertung | 0.5 Tag |
| 7 | Error Handling | 0.5 Tag |
| 8 | Auswertung & Analyse Dashboard | 1 Tag |
| 9 | Deploy & Smoke Test | 0.5 Tag |
| **Gesamt** | | **~7 Tage** |

---

## Wichtige Referenzen für Claude Code

| Thema | Link |
|---|---|
| OpenAI Realtime WebRTC Guide | https://developers.openai.com/api/docs/guides/realtime-webrtc |
| OpenAI Realtime Next.js Starter | https://github.com/cameronking4/openai-realtime-api-nextjs |
| ElevenLabs Next.js Guide | https://elevenlabs.io/docs/conversational-ai/guides/conversational-ai-guide-nextjs |
| ElevenLabs React SDK | https://github.com/elevenlabs/packages |
| Supabase JS Client | https://supabase.com/docs/reference/javascript |

---

## Reihenfolge in Claude Code

```
1. "Erstelle ein Next.js Projekt mit TypeScript, Tailwind, App Router"
2. "Richte Supabase ein mit diesem Schema: [Schema aus Phase 1]"
3. "Baue die UI Komponenten: [Struktur aus Phase 2]"
4. "Integriere OpenAI Realtime API mit WebRTC: [Details aus Phase 3]"
5. "Integriere ElevenLabs mit @elevenlabs/react: [Details aus Phase 4]"
6. "Füge System Prompt + RAG Editor hinzu: [Details aus Phase 5]"
7. "Füge Call-Bewertung hinzu (inkl. Szenario + Tester-Name): [Details aus Phase 6]"
8. "Implementiere Error Handling: [Details aus Phase 7 + 08_error_handling.md]"
9. "Baue Analyse-Dashboard + LLM-Auswertung + CSV Export: [Details aus Phase 8 + 11_auswertung.md]"
10. "Deploy auf Vercel"
```

Jeder Schritt kann als separater Claude Code Prompt gegeben werden.
Alle .md Dateien (00–11) als Kontext mitgeben.
