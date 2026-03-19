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

    const baseHtml = (bodyContent: string) => `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <style>
          /* Minimal responsive resets just in case */
          body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; background-color: #f8fafc; }
          img { border: 0; line-height: 100%; outline: none; text-decoration: none; }
          table { border-collapse: collapse !important; }
        </style>
      </head>
      <body style="background-color: #f8fafc; margin: 0; padding: 40px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          
          <!-- Header -->
          <div style="border-bottom: 1px solid #e2e8f0; padding: 32px; text-align: center; background-color: #ffffff;">
            <img src="https://galal-academy-membership-system.vercel.app/profile.jpg" alt="Galal Academy" width="80" height="80" style="display: block; width: 80px; height: 80px; border-radius: 50%; max-width: 80px; max-height: 80px; margin: 0 auto 16px auto; border: 2px solid #e2e8f0; object-fit: cover; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
            <h1 style="font-size: 20px; font-weight: 500; letter-spacing: 4px; margin: 0; color: #0f172a; text-transform: uppercase;">GALAL ACADEMY</h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 48px 40px;">
            ${bodyContent}
          </div>
          
          <!-- Footer -->
          <div style="padding: 32px; text-align: center; border-top: 1px solid #e2e8f0; background-color: #f8fafc;">
            <p style="font-size: 13px; color: #64748b; margin: 0;">Galal Academy Exclusive Membership</p>
            <p style="margin-top: 8px; font-size: 13px; color: #64748b;">Support: <a href="mailto:agytmembers@gmail.com" style="color: #0f172a; text-decoration: none; font-weight: 500;">agytmembers@gmail.com</a></p>
          </div>
          
        </div>
      </body>
      </html>
    `

    if (type === 'welcome') {
      subject = 'Welcome to Galal Academy Premium'
      htmlContent = baseHtml(`
        <h2 style="font-size: 22px; font-weight: 600; margin-top: 0; margin-bottom: 24px; color: #0f172a;">Welcome, ${name}.</h2>
        <p style="font-size: 15px; line-height: 1.7; color: #475569; margin-bottom: 32px;">Your exclusive membership access has been successfully verified and provisioned. You now have full access to our private infrastructure.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
          <div style="display: block; margin-bottom: 16px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 16px;">
            <span style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 6px;">Membership Tier</span>
            <strong style="font-size: 15px; color: #0f172a; font-weight: 600; display: block;">${tier} <span style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 4px 12px; border-radius: 20px; vertical-align: middle; margin-left: 8px;">Active</span></strong>
          </div>
          <div style="display: block; margin-bottom: 16px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 16px;">
            <span style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 6px;">Joined Date</span>
            <strong style="font-size: 15px; color: #0f172a; font-weight: 600; display: block;">${join_date || 'N/A'}</strong>
          </div>
          <div style="display: block;">
            <span style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 6px;">Next Renewal / Cycle</span>
            <strong style="font-size: 15px; color: #0f172a; font-weight: 600; display: block;">${renewal_date || 'N/A'}</strong>
          </div>
        </div>
        
        <p style="font-size: 15px; line-height: 1.7; color: #475569; margin-bottom: 32px;">You will shortly receive separate invitations linking your email (<strong style="color: #0f172a; font-weight: 600;">${email}</strong>) to our private Slack community and Google Drive repositories. Please accept those invitations to sync your workspace.</p>
      `)
    } else if (type === 'rejected') {
      subject = 'Action Required: Unverified Membership'
      htmlContent = baseHtml(`
        <h2 style="font-size: 22px; font-weight: 600; margin-top: 0; margin-bottom: 24px; color: #0f172a;">Priority Notice</h2>
        <p style="font-size: 15px; line-height: 1.7; color: #475569; margin-bottom: 16px;">Hello ${name || 'there'},</p>
        <p style="font-size: 15px; line-height: 1.7; color: #475569; margin-bottom: 32px;">We received your verification request, but unfortunately, we could not locate an active membership matching your profile in our latest database sync.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
          <div style="display: block; margin-bottom: 16px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 16px;">
            <span style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 6px;">Status</span>
            <strong style="font-size: 15px; color: #ef4444; font-weight: 600; display: block;">Unverified</strong>
          </div>
          <div style="display: block;">
            <span style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 6px;">Profile Submitted</span>
            <strong style="font-size: 15px; color: #0f172a; font-weight: 600; display: block;">${name || 'N/A'}</strong>
          </div>
        </div>

        <p style="font-size: 15px; line-height: 1.7; color: #475569; margin-bottom: 32px;">If you recently joined on YouTube, please allow up to 24 hours for our secure database to sync. If you haven't joined yet, please secure your membership directly on our channel.</p>
      `)
    } else if (type === 'pending') {
      subject = 'Membership Verification Pending'
      htmlContent = baseHtml(`
        <h2 style="font-size: 22px; font-weight: 600; margin-top: 0; margin-bottom: 24px; color: #0f172a;">Verification Initiated</h2>
        <p style="font-size: 15px; line-height: 1.7; color: #475569; margin-bottom: 16px;">Hello ${name || 'there'},</p>
        <p style="font-size: 15px; line-height: 1.7; color: #475569; margin-bottom: 32px;">Your verification request has been successfully submitted to our system and is currently pending review.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
          <div style="display: block; margin-bottom: 16px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 16px;">
            <span style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 6px;">Current Status</span>
            <strong style="font-size: 15px; color: #eab308; font-weight: 600; display: block;">Pending Queue</strong>
          </div>
          <div style="display: block;">
            <span style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 6px;">Email Attached</span>
            <strong style="font-size: 15px; color: #0f172a; font-weight: 600; display: block;">${email}</strong>
          </div>
        </div>

        <p style="font-size: 15px; line-height: 1.7; color: #475569; margin-bottom: 32px;">Our system aligns with YouTube records periodically. You will receive an automated follow-up email precisely when your membership status is confirmed and your access channels are opened.</p>
      `)
    }

    // 1. Refresh Google OAuth Token
    const accessToken = await getAccessToken()
    
    // 2. Prepare Base64 email encoding
    const base64Message = createBase64Email(email, subject, htmlContent)

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

    // 4. Google Drive Integration (Elite Tiers)
    if (type === 'welcome') {
      const eliteTiers = [
        'Elite',
        'Platinum',
        'Personal Coaching',
        'Personal Coaching +',
        'Personal Coaching ++'
      ]

      if (tier && eliteTiers.includes(tier)) {
        const folderId = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')
        if (folderId) {
          console.log(`[Dispatch Email] Elite Tier detected (${tier}). Sharing Google Drive folder ${folderId} with ${email}...`)
          const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              role: 'reader', // View only. Use 'writer' or 'commenter' if needed.
              type: 'user',
              emailAddress: email
            })
          })
          
          if (!driveRes.ok) {
            console.error('[Dispatch Email] Failed to invite user to Google Drive:', await driveRes.text())
          } else {
            console.log(`[Dispatch Email] Successfully invited ${email} to Google Drive folder!`)
          }
        } else {
            console.log(`[Dispatch Email] Warning: GOOGLE_DRIVE_FOLDER_ID not set in environment. Skipping Drive invite.`)
        }
      }
    }

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
