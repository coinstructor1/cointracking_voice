import { useRef } from 'react'
import { salesTools } from '@/lib/tools'

interface OpenAICallCallbacks {
  onTranscript: (role: 'agent' | 'user', content: string) => void
  onError: (message: string) => void
  onDisconnect?: () => void
  onEmailSent?: () => void
}

export function useOpenAICall({ onTranscript, onError, onDisconnect, onEmailSent }: OpenAICallCallbacks) {
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const agentBufferRef = useRef('')

  async function start(systemPrompt: string, ragContent: string, voice?: string, model?: string): Promise<void> {
    // 1. Ephemeral Token vom Server holen
    const tokenRes = await fetch('/api/openai-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, ragContent, voice, model }),
    })

    if (!tokenRes.ok) {
      const { error } = await tokenRes.json()
      throw new Error(`Token-Fehler: ${error ?? tokenRes.statusText}`)
    }

    const { token, model: resolvedModel } = await tokenRes.json()

    // 2. RTCPeerConnection erstellen
    const pc = new RTCPeerConnection()
    pcRef.current = pc

    // Mid-Call Disconnect Detection
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        onDisconnect?.()
      }
    }

    // 3. Audio-Output: Agent-Stimme im Browser abspielen
    const audio = document.createElement('audio')
    audio.autoplay = true
    audioRef.current = audio

    pc.ontrack = (event) => {
      audio.srcObject = event.streams[0]
    }

    // 4. Mikrofon-Track hinzufügen
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    // 5. Data Channel für Events
    const dc = pc.createDataChannel('oai-events')

    // Sobald Verbindung steht → Session konfigurieren + Agent eröffnet das Gespräch
    dc.onopen = () => {
      dc.send(JSON.stringify({
        type: 'session.update',
        session: {
          tools: salesTools.map((t) => ({
            type: 'function',
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
          tool_choice: 'auto',
        },
      }))
      dc.send(JSON.stringify({ type: 'response.create' }))
    }

    dc.onmessage = (event) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      const type = msg.type as string

      // Agent spricht (streamed)
      if (type === 'response.audio_transcript.delta') {
        agentBufferRef.current += (msg.delta as string) ?? ''
      }

      // Agent fertig
      if (type === 'response.audio_transcript.done') {
        const text = agentBufferRef.current.trim()
        if (text) onTranscript('agent', text)
        agentBufferRef.current = ''
      }

      // User hat gesprochen
      if (type === 'conversation.item.input_audio_transcription.completed') {
        const text = ((msg.transcript as string) ?? '').trim()
        if (text) onTranscript('user', text)
      }

      // Tool Call: send_upgrade_email
      if (type === 'response.function_call_arguments.done' && msg.name === 'send_upgrade_email') {
        const args = JSON.parse(msg.arguments as string)
        console.log('[OpenAI Tool] send_upgrade_email called with:', args)
        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        })
          .then(async (res) => {
            const data = await res.json()
            if (!res.ok || !data.success) {
              console.error('[OpenAI Tool] send-email API error:', data)
            } else {
              console.log('[OpenAI Tool] Email sent OK:', data)
              onEmailSent?.()
            }
            // Echtes Ergebnis an OpenAI zurückmelden
            dc.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: msg.call_id,
                output: JSON.stringify(data.success
                  ? { success: true, recipient: data.recipient }
                  : { success: false, error: data.error }
                ),
              },
            }))
            dc.send(JSON.stringify({ type: 'response.create' }))
          })
          .catch((err) => {
            console.error('[OpenAI Tool] fetch /api/send-email failed:', err)
            dc.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: msg.call_id,
                output: JSON.stringify({ success: false, error: 'Netzwerkfehler beim E-Mail-Versand.' }),
              },
            }))
            dc.send(JSON.stringify({ type: 'response.create' }))
          })
      }

      // Fehler vom Server
      if (type === 'error') {
        const errMsg = (msg.error as { message?: string })?.message ?? 'OpenAI Fehler'
        onError(errMsg)
      }
    }

    // 6. SDP Offer erstellen
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // 7. Offer an OpenAI schicken
    const sdpRes = await fetch(
      `https://api.openai.com/v1/realtime?model=${resolvedModel}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      }
    )

    if (!sdpRes.ok) {
      throw new Error(`WebRTC-Verbindung fehlgeschlagen: ${sdpRes.statusText}`)
    }

    // 8. SDP Answer setzen → Verbindung steht
    const answerSdp = await sdpRes.text()
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
  }

  function stop() {
    pcRef.current?.close()
    pcRef.current = null

    if (audioRef.current) {
      audioRef.current.srcObject = null
      audioRef.current = null
    }

    agentBufferRef.current = ''
  }

  return { start, stop }
}
