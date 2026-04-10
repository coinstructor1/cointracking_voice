import { useRef } from 'react'

interface OpenAICallCallbacks {
  onTranscript: (role: 'agent' | 'user', content: string) => void
  onError: (message: string) => void
}

export function useOpenAICall({ onTranscript, onError }: OpenAICallCallbacks) {
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const agentBufferRef = useRef('')

  async function start(systemPrompt: string, ragContent: string, voice?: string): Promise<void> {
    // 1. Ephemeral Token vom Server holen
    const tokenRes = await fetch('/api/openai-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, ragContent, voice }),
    })

    if (!tokenRes.ok) {
      const { error } = await tokenRes.json()
      throw new Error(`Token-Fehler: ${error ?? tokenRes.statusText}`)
    }

    const { token } = await tokenRes.json()

    // 2. RTCPeerConnection erstellen
    const pc = new RTCPeerConnection()
    pcRef.current = pc

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

    // Sobald Verbindung steht → Agent eröffnet das Gespräch
    dc.onopen = () => {
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
      'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
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
