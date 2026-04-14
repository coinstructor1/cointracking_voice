import { Resend } from 'resend'
import { normalizeEmail, EMAIL_REGEX } from '@/lib/email'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  const body = await req.json()
  const { recipient: rawRecipient, plan_name, upgrade_url } = body

  console.log('[send-email] Tool call received:', { recipient: rawRecipient, plan_name, upgrade_url })

  if (!rawRecipient || !plan_name || !upgrade_url) {
    console.error('[send-email] Missing fields:', body)
    return Response.json({ success: false, error: 'Fehlende Felder: recipient, plan_name, upgrade_url' }, { status: 400 })
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('[send-email] RESEND_API_KEY is not set')
    return Response.json({ success: false, error: 'RESEND_API_KEY nicht konfiguriert' }, { status: 500 })
  }

  // Umlauts normalisieren (häufig bei deutscher Spracherkennung)
  const recipient = normalizeEmail(rawRecipient)
  if (recipient !== rawRecipient) {
    console.log(`[send-email] Normalized: "${rawRecipient}" → "${recipient}"`)
  }

  // Syntax-Validierung
  if (!EMAIL_REGEX.test(recipient)) {
    console.error(`[send-email] Invalid email after normalization: "${recipient}"`)
    return Response.json({
      success: false,
      error: `Ungültige E-Mail-Adresse: "${recipient}". Bitte den User bitten, die Adresse zu buchstabieren.`,
    }, { status: 422 })
  }

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'Luca von CoinTracking <luca@secure-ai-gateway.com>',
    to: recipient,
    subject: `Dein CoinTracking ${plan_name} Upgrade-Link`,
    html: `
      <p>Hi,</p>
      <p>wie besprochen – hier ist dein persönlicher Link zum <strong>${plan_name}</strong> Plan:</p>
      <p><a href="${upgrade_url}">${upgrade_url}</a></p>
      <p>Bei Fragen bin ich gerne für dich da.</p>
      <p>Viele Grüße,<br/>Luca – CoinTracking</p>
    `,
  })

  if (error) {
    console.error('[send-email] Resend error:', error)
    return Response.json({ success: false, error: error.message }, { status: 500 })
  }

  console.log('[send-email] Email sent successfully. Resend ID:', data?.id, '→', recipient)
  return Response.json({ success: true, id: data?.id, recipient })
}
