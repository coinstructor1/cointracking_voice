# Auswertung – Wie wir aus den Testdaten lernen

---

## 1. Fehlende Felder in Supabase

Die aktuelle `sessions`-Tabelle trackt Provider/Voice/Prompt, aber nicht genug Kontext für Musteranalyse.

### Neue Spalten für `sessions`
```sql
alter table sessions add column scenario text;            -- 'A_interessiert' | 'B_skeptiker' | 'C_preissensitiv' | 'D_vieltrader'
alter table sessions add column tester_name text;         -- Wer hat den Test gemacht?
alter table sessions add column call_duration_seconds int;-- Gesprächslänge
alter table sessions add column outcome text;             -- 'interested' | 'declined' | 'followup' | 'aborted'
alter table sessions add column language text default 'de'; -- 'de' | 'en'
```

### Neue Tabelle: `transcript_analysis` (LLM-Auswertung)
```sql
create table transcript_analysis (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  summary text,                    -- 1-2 Sätze Zusammenfassung
  objections_raised text[],        -- Welche Einwände kamen?
  objections_handled boolean,      -- Wurden sie gut behandelt?
  reached_closing boolean,         -- Hat der Agent ein Closing versucht?
  agent_errors text[],             -- Halluzinationen, falsche Preise, etc.
  conversation_dropoff text,       -- Wo wurde das Gespräch schwach?
  highlight text,                  -- Was war besonders gut?
  overall_verdict text,            -- 'strong' | 'ok' | 'weak'
  created_at timestamptz default now()
);

alter table transcript_analysis enable row level security;
create policy "anon_all_analysis" on transcript_analysis for all using (true);
```

---

## 2. LLM-Transkript-Auswertung (nach jedem Call)

Nach Call-Ende wird das komplette Transkript automatisch an ein LLM geschickt.

### Prompt für die Auswertung

```
Analysiere das folgende Sales-Call Transkript eines AI Voice Agents für CoinTracking.

TRANSKRIPT:
[komplettes Transkript hier]

BEWERTE FOLGENDES:

1. ZUSAMMENFASSUNG: Was war das Gespräch in 1-2 Sätzen?
2. EINWÄNDE: Welche Einwände hat der Kunde gebracht? (Liste)
3. EINWAND-BEHANDLUNG: Wurden die Einwände überzeugend behandelt? (ja/nein + Begründung)
4. CLOSING: Hat der Agent ein konkretes Closing versucht? (ja/nein)
5. FEHLER: Hat der Agent falsche Informationen gegeben, halluziniert, oder sich wiederholt? (Liste)
6. SCHWACHSTELLE: An welcher Stelle im Gespräch war der Agent am schwächsten?
7. HIGHLIGHT: Was hat der Agent besonders gut gemacht?
8. GESAMTBEWERTUNG: 'strong' | 'ok' | 'weak'

Antworte als JSON.
```

### Implementierung
- API Route: `POST /api/analyze-transcript`
- Input: `session_id` → Transkript aus Supabase holen
- LLM Call: OpenAI GPT-4o (günstig, schnell, reicht für Analyse)
- Output: JSON → in `transcript_analysis` Tabelle speichern
- Trigger: Automatisch nach Call-Ende, oder manuell per Button

---

## 3. Analyse-Seite in der App

### Route: `/analysis`

### 3.1 Übersicht (Leaderboard)

**Provider-Vergleich**
```
| Provider    | Ø Score | Beste Kategorie    | Schwächste Kategorie |
|-------------|---------|--------------------|--------------------|
| OpenAI      | 3.8     | Natürlichkeit (4.2)| Closing (3.1)      |
| ElevenLabs  | 4.1     | Latenz (4.5)       | Einwände (3.4)     |
```

**Prompt-Vergleich**
```
| Prompt       | Ø Score | Closing-Rate | Fehler-Rate |
|--------------|---------|-------------|-------------|
| v1 Standard  | 3.9     | 60%         | 10%         |
| v2 Aktiv     | 4.2     | 80%         | 15%         |
| v3 Beratend  | 3.7     | 40%         | 5%          |
```

**Voice-Vergleich**
```
| Voice   | Ø Natürlichkeit | Ø Gesamtscore |
|---------|-----------------|---------------|
| echo    | 4.0             | 3.9           |
| nova    | 4.3             | 4.1           |
| onyx    | 3.5             | 3.6           |
```

### 3.2 Szenario-Auswertung

**Pro Szenario: Welche Kombination (Provider × Prompt) performt am besten?**
```
Szenario A (Interessiert):   ElevenLabs + v2_aktiv → 4.5
Szenario B (Skeptiker):      OpenAI + v1_standard → 3.8
Szenario C (Preissensitiv):  ElevenLabs + v3_beratend → 3.2
Szenario D (Vieltrader):     OpenAI + v2_aktiv → 4.1
```

### 3.3 Einwand-Analyse

**Häufigste Einwände (aus LLM-Analyse)**
```
| Einwand                      | Häufigkeit | Gut behandelt |
|------------------------------|-----------|---------------|
| "Zu teuer"                   | 8x        | 75%           |
| "Mein Steuerberater..."      | 6x        | 50%           |
| "Excel reicht"               | 5x        | 80%           |
| "Wird nicht kontrolliert"    | 3x        | 100%          |
```

### 3.4 Fehler-Analyse

**Häufigste Agent-Fehler**
```
| Fehler                       | Häufigkeit | Provider  |
|------------------------------|-----------|-----------|
| Falscher Preis genannt       | 3x        | OpenAI    |
| Wiederholung im Gespräch     | 5x        | Beide     |
| Kein Closing versucht        | 4x        | OpenAI    |
| Halluzinierte Features       | 2x        | ElevenLabs|
```

### 3.5 Transkript-Detail

- Session auswählen → Transkript lesen
- LLM-Analyse daneben anzeigen
- Bewertung des Testers anzeigen

---

## 4. Export

- **CSV Export** aller Sessions + Ratings + Analyses → für Excel/Sheets
- **Button in der App:** "Export All Data"
- Query: JOIN sessions + ratings + transcript_analysis

```sql
select
  s.id,
  s.created_at,
  s.provider,
  s.voice_id,
  s.agent_name,
  s.prompt_variant,
  s.scenario,
  s.tester_name,
  s.call_duration_seconds,
  s.outcome,
  r.naturalness,
  r.latency,
  r.conversation_flow,
  r.objection_handling,
  r.closing,
  r.errors,
  r.notes,
  (r.naturalness + r.latency + r.conversation_flow + r.objection_handling + r.closing + r.errors) / 6.0 as avg_score,
  ta.summary,
  ta.overall_verdict,
  ta.reached_closing,
  ta.objections_raised,
  ta.agent_errors
from sessions s
left join ratings r on r.session_id = s.id
left join transcript_analysis ta on ta.session_id = s.id
order by s.created_at desc;
```

---

## 5. Finale Erkenntnis → Dokument

Am Ende der Testphase erstellen wir ein Fazit-Dokument mit:
- Bester Provider + Voice + Prompt Kombination
- Welche Szenarien der Agent meistern kann, welche nicht
- Top 3 Schwächen → System Prompt Verbesserungen
- Empfehlung: Ist ein AI Voice Sales Agent für Cointracking realistisch?
