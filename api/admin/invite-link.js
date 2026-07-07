import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const json = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

const getSupabaseAdmin = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase server environment variables are missing.')
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

const getBaseUrl = (req) => {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`
}

const assertAdmin = async (req) => {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Missing bearer token.')

  const adminClient = getSupabaseAdmin()
  const { data: { user }, error: userError } = await adminClient.auth.getUser(token)
  if (userError || !user) throw new Error('Session could not be verified.')

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || profile?.role !== 'admin') {
    throw new Error('Only admins can generate invite links.')
  }

  return adminClient
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' })
  }

  try {
    const supabaseAdmin = await assertAdmin(req)
    const { email, is_global } = req.body || {}

    if (!is_global && (!email || !email.includes('@'))) {
      return json(res, 400, { error: 'A valid email is required.' })
    }

    const payload = is_global 
      ? { email: 'global-invite@nativo.com', is_global: true }
      : { email: email.trim().toLowerCase(), is_global: false }

    // Insert invitation record
    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from('invitations')
      .insert(payload)
      .select('*')
      .single()

    if (inviteError) {
      throw new Error(inviteError.message)
    }

    // Create the registration url
    const inviteLink = is_global
      ? `${getBaseUrl(req)}/register?token=${invitation.id}`
      : `${getBaseUrl(req)}/register?token=${invitation.id}&email=${encodeURIComponent(invitation.email)}`

    return json(res, 200, {
      message: 'Invitation link generated successfully.',
      invite_link: inviteLink,
      invitation
    })
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}
