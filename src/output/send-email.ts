import { Resend } from 'resend'

export async function sendDigest(options: {
  apiKey: string
  to: string
  subject: string
  html: string
}): Promise<{ id: string }> {
  const resend = new Resend(options.apiKey)
  const { data, error } = await resend.emails.send({
    from: 'No Cap <onboarding@resend.dev>',
    to: options.to,
    subject: options.subject,
    html: options.html,
  })

  if (error) {
    throw new Error(`Email send failed: ${error.message}`)
  }

  return { id: data?.id ?? 'unknown' }
}
