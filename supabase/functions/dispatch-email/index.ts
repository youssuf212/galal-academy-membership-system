import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')
const GOOGLE_REFRESH_TOKEN = Deno.env.get('GOOGLE_REFRESH_TOKEN')

async function getAccessToken(): Promise<string> {
  const url = 'https://oauth2.googleapis.com/token'
  const params = new URLSearchParams()
  params.append('client_id', GOOGLE_CLIENT_ID || '')
  params.append('client_secret', GOOGLE_CLIENT_SECRET || '')
  params.append('refresh_token', GOOGLE_REFRESH_TOKEN || '')
  params.append('grant_type', 'refresh_token')

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    throw new Error('Failed to refresh Google Access Token: ' + await res.text())
  }

  const data = await res.json()
  return data.access_token
}

function createBase64Email(to: string, subject: string, htmlBody: string): string {
  // Construct a raw MIME email string
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    '',
    htmlBody
  ]
  const rawEmail = emailLines.join('\r\n')
  
  // Base64Url encode it per Gmail API requirements
  const encoded = btoa(unescape(encodeURIComponent(rawEmail)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return encoded
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { type, email, name, tier } = await req.json()

    let subject = ''
    let html = ''

    if (type === 'welcome') {
      subject = 'Welcome to Galal Academy Premium!'
      html = `
        <div style="font-family: sans-serif; color: #333;">
          <h1>Thank you for being a member, ${name}!</h1>
          <p>Your <strong>${tier}</strong> access is being processed.</p>
          <p>You will shortly receive invitations linking your email (<strong>${email}</strong>) to our private Slack community and Google Drive repositories.</p>
          <p>Your renewal is coming up soon, based on YouTube's billing cycle.</p>
          <br/>
          <hr style="border: 1px solid #eaeaea;" />
          <p style="font-size: 12px; color: #666;">Need help? Contact our support team at <a href="mailto:agytmembers@gmail.com">agytmembers@gmail.com</a></p>
        </div>
      `
    } else if (type === 'rejected') {
      subject = 'Action Required: Galal Academy Membership'
      html = `
        <div style="font-family: sans-serif; color: #333;">
          <h1>Hi ${name || 'there'},</h1>
          <p>We received your request, but unfortunately, we couldn't find an active membership for your account in our latest member sync.</p>
          <p>If you recently joined on YouTube, please allow up to 24 hours for the member database to sync. If you haven't joined yet, please click "Join" on our YouTube channel.</p>
          <br/>
          <hr style="border: 1px solid #eaeaea;" />
          <p style="font-size: 12px; color: #666;">If you believe this is an error, please contact us at <a href="mailto:agytmembers@gmail.com">agytmembers@gmail.com</a>.</p>
        </div>
      `
    } else if (type === 'pending') {
      subject = 'Galal Academy: Request Received'
      html = `
        <div style="font-family: sans-serif; color: #333;">
          <h1>Hi ${name || 'there'},</h1>
          <p>We have received your verification request for your YouTube membership.</p>
          <p>Your request is currently in the queue. We will align it with our YouTube members sync and update you shortly.</p>
          <br/>
          <hr style="border: 1px solid #eaeaea;" />
          <p style="font-size: 12px; color: #666;">Need help? Contact our support team at <a href="mailto:agytmembers@gmail.com">agytmembers@gmail.com</a></p>
        </div>
      `
    }

    // 1. Refresh Google OAuth Token
    const accessToken = await getAccessToken()
    
    // 2. Prepare Base64 email encoding
    const base64Message = createBase64Email(email, subject, html)

    // 3. Send email using Gmail API
    const response = await fetch('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: base64Message
      })
    })

    if (!response.ok) {
        throw new Error('Failed to send email via Gmail API: ' + await response.text())
    }

    const data = await response.json()

    return new Response(JSON.stringify({ success: true, messageId: data.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
