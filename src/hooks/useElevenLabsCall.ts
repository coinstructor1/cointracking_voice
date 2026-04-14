import { useRef } from 'react'
import { Conversation } from '@elevenlabs/client'
import { normalizeEmail } from '@/lib/email'

interface ElevenLabsCallCallbacks {
  onTranscript: (role: 'agent' | 'user', content: string) => void
  onError: (message: string) => void
  onDisconnect?: () => void
  onEmailSent?: () => void
  onEmailConfirmRequest?: (normalizedEmail: string) => Promise<boolean>
}

export function useElevenLabsCall({ onTranscript, onError, onDisconnect, onEmailSent, onEmailConfirmRequest }: ElevenLabsCallCallbacks) {
  const conversationRef = useRef<{ endSession: () => Promise<void> } | null>(null)

  async function start(agentId: string, systemPrompt: string, firstMessage?: string): Promise<void> {
    // 1. Signed URL vom Server holen
    const tokenRes = await fetch('/api/elevenlabs-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    })

    if (!tokenRes.ok) {
      const { error } = await tokenRes.json()
      throw new Error(`ElevenLabs Token-Fehler: ${error ?? tokenRes.statusText}`)
    }

    const { signedUrl } = await tokenRes.json()

    // 2. Conversation Session starten
    const conversation = await Conversation.startSession({
      signedUrl,
      overrides: {
        agent: {
          prompt: { prompt: systemPrompt },
          ...(firstMessage ? { firstMessage } : {}),
        },
      },
      clientTools: {
        send_upgrade_email: async ({ recipient, plan_name, upgrade_url }: {
          recipient: string
          plan_name: string
          upgrade_url: string
        }) => {
          const normalized = normalizeEmail(recipient)
          console.log('[ElevenLabs Tool] send_upgrade_email called with:', { recipient, normalized, plan_name, upgrade_url })

          // User muss die normalisierte Email bestätigen
          if (onEmailConfirmRequest) {
            const confirmed = await onEmailConfirmRequest(normalized)
            if (!confirmed) {
              console.log('[ElevenLabs Tool] User rejected email:', normalized)
              return `Die angezeigte E-Mail-Adresse "${normalized}" wurde vom User als falsch markiert. Bitte frage nach der korrekten Adresse.`
            }
          }

          const res = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient: normalized, plan_name, upgrade_url }),
          })
          const data = await res.json()
          if (!res.ok || !data.success) {
            console.error('[ElevenLabs Tool] send-email API error:', data)
            return data.error ?? 'E-Mail konnte nicht gesendet werden.'
          }
          console.log('[ElevenLabs Tool] Email sent OK:', data)
          onEmailSent?.()
          return `E-Mail erfolgreich gesendet an ${data.recipient}.`
        },
      },
      onMessage: ({ message, role }) => {
        onTranscript(role === 'agent' ? 'agent' : 'user', message)
      },
      onError: (msg) => {
        onError(typeof msg === 'string' ? msg : 'ElevenLabs Fehler')
      },
      onDisconnect: () => {
        if (conversationRef.current !== null) {
          // Nur feuern wenn nicht manuell gestoppt (stop() setzt ref auf null)
          onDisconnect?.()
        }
        conversationRef.current = null
      },
    })

    conversationRef.current = conversation
  }

  function stop() {
    conversationRef.current?.endSession().catch(console.error)
    conversationRef.current = null
  }

  return { start, stop }
}
