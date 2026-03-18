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
    const rawBody = await req.text()
    console.log('[Dispatch Email] Received POST Payload:', rawBody)
    const { type, email, name, tier, join_date, renewal_date } = JSON.parse(rawBody)

    let subject = ''
    let htmlContent = ''

    const emailStyle = `
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #000000; color: #ffffff; margin: 0; padding: 40px 16px; -webkit-font-smoothing: antialiased; }
      .container { max-width: 600px; margin: 0 auto; background-color: #0a0a0a; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; }
      .header { border-bottom: 1px solid #27272a; padding: 32px; text-align: center; background-color: #050505; }
      .header h1 { font-size: 20px; font-weight: 300; letter-spacing: 6px; margin: 0; color: #ffffff; text-transform: uppercase; }
      .content { padding: 48px 40px; }
      .h2 { font-size: 22px; font-weight: 500; margin-top: 0; margin-bottom: 24px; color: #ffffff; }
      .p { font-size: 15px; line-height: 1.7; color: #a1a1aa; margin-bottom: 32px; }
      .strong { color: #ffffff; font-weight: 600; }
      .details-box { background-color: #121214; border: 1px solid #27272a; border-radius: 8px; padding: 24px; margin-bottom: 32px; }
      .detail-row { display: block; margin-bottom: 16px; border-bottom: 1px dashed #27272a; padding-bottom: 16px; }
      .detail-row:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
      .detail-label { font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 6px; }
      .detail-value { font-size: 15px; color: #ffffff; font-weight: 500; display: block; }
      .tier-badge { display: inline-block; background-color: #ffffff; color: #000000; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 4px 12px; border-radius: 20px; vertical-align: middle; margin-left: 8px; }
      .btn { display: inline-block; background-color: #ffffff; color: #000000; font-size: 14px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; letter-spacing: 0.5px; transition: background-color 0.2s; }
      .footer { padding: 32px; text-align: center; border-top: 1px solid #27272a; background-color: #050505; }
      .footer p { font-size: 13px; color: #52525b; margin: 0; }
      .footer a { color: #f4f4f5; text-decoration: none; }
    `

    const baseHtml = (bodyContent: string) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <style>${emailStyle}</style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>GALAL ACADEMY</h1>
          </div>
          <div class="content">
            ${bodyContent}
          </div>
          <div class="footer">
            <p>Galal Academy Exclusive Membership</p>
            <p style="margin-top: 8px;">Support: <a href="mailto:agytmembers@gmail.com">agytmembers@gmail.com</a></p>
          </div>
        </div>
      </body>
      </html>
    `

    if (type === 'welcome') {
      subject = 'Welcome to Galal Academy Premium'
      htmlContent = baseHtml(`
        <h2 class="h2">Welcome, ${name}.</h2>
        <p class="p">Your exclusive membership access has been successfully verified and provisioned. You now have full access to our private infrastructure.</p>
        
        <div class="details-box">
          <div class="detail-row">
            <span class="detail-label">Membership Tier</span>
            <span class="detail-value">${tier} <span class="tier-badge">Active</span></span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Joined Date</span>
            <span class="detail-value">${join_date || 'N/A'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Next Renewal / Cycle</span>
            <span class="detail-value">${renewal_date || 'N/A'}</span>
          </div>
        </div>
        
        <p class="p">You will shortly receive separate invitations linking your email (<span class="strong">${email}</span>) to our private Slack community and Google Drive repositories. Please accept those invitations to sync your workspace.</p>
        
        <div style="text-align: center; margin-top: 40px;">
          <a href="#" class="btn">View Dashboard</a>
        </div>
      `)
    } else if (type === 'rejected') {
      subject = 'Action Required: Unverified Membership'
      htmlContent = baseHtml(`
        <h2 class="h2">Priority Notice</h2>
        <p class="p">Hello ${name || 'there'},</p>
        <p class="p">We received your verification request, but unfortunately, we could not locate an active membership matching your profile in our latest database sync.</p>
        
        <div class="details-box">
          <div class="detail-row">
            <span class="detail-label">Status</span>
            <span class="detail-value" style="color: #ef4444;">Unverified</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Profile Submitted</span>
            <span class="detail-value">${name || 'N/A'}</span>
          </div>
        </div>

        <p class="p">If you recently joined on YouTube, please allow up to 24 hours for our secure database to sync. If you haven't joined yet, please secure your membership directly on our channel.</p>
      `)
    } else if (type === 'pending') {
      subject = 'Membership Verification Pending'
      htmlContent = baseHtml(`
        <h2 class="h2">Verification Initiated</h2>
        <p class="p">Hello ${name || 'there'},</p>
        <p class="p">Your verification request has been successfully submitted to our system and is currently pending review.</p>
        
        <div class="details-box">
          <div class="detail-row">
            <span class="detail-label">Current Status</span>
            <span class="detail-value" style="color: #eab308;">Pending Queue</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Email Attached</span>
            <span class="detail-value">${email}</span>
          </div>
        </div>

        <p class="p">Our system aligns with YouTube records periodically. You will receive an automated follow-up email precisely when your membership status is confirmed and your access channels are opened.</p>
      `)
    }

    // 1. Refresh Google OAuth Token
    const accessToken = await getAccessToken()
    
    // 2. Prepare Base64 email encoding
    const base64Message = createBase64Email(email, subject, htmlContent)

    // 3. Send email using Gmail API
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
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
