import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Resend } from 'npm:resend@2.0.0'
import { corsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const resend = new Resend(RESEND_API_KEY)

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

    const data = await resend.emails.send({
      from: 'Galal Academy <onboarding@resend.dev>', // You must verify a domain in Resend to change this
      to: [email], // Note: while using resend.dev test domain, you can only send to the email you used to sign up for Resend
      subject: subject,
      html: html,
    })

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
