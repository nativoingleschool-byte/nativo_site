import { getSupabaseAdmin } from '../../services/supabase-admin.js'

const json = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
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

  const adminClient = getSupabaseAdmin(token)
  const { data: { user }, error: userError } = await adminClient.auth.getUser(token)
  if (userError || !user) {
    const msg = userError?.message || 'Token verification failed'
    throw new Error(`Session could not be verified (${msg}). Please log out and log back in.`)
  }

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
