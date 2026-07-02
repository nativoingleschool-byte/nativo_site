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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { token, email, password, full_name, cpf, data_pagamento_preferencial } = req.body || {}

    if (!token || !email || !password || !full_name) {
      return json(res, 400, { error: 'Missing required registration fields.' })
    }

    const emailNormalized = email.trim().toLowerCase()

    // 1. Verify invitation token
    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from('invitations')
      .select('*')
      .eq('id', token)
      .eq('email', emailNormalized)
      .single()

    if (inviteError || !invitation) {
      return json(res, 400, { error: 'Link de convite inválido ou expirado.' })
    }

    if (invitation.used) {
      return json(res, 400, { error: 'Este link de convite já foi utilizado.' })
    }

    // 2. Create user inside auth schema using admin permissions
    const { data: authData, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
      email: emailNormalized,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: full_name }
    })

    if (authCreateError || !authData?.user) {
      throw new Error(authCreateError?.message || 'Erro ao criar conta de autenticação.')
    }

    const newUser = authData.user

    // 3. Populate student profile details
    const profilePayload = {
      id: newUser.id,
      email: emailNormalized,
      full_name: full_name,
      role: 'student',
      cpf: cpf || null,
      data_pagamento_preferencial: data_pagamento_preferencial ? Number(data_pagamento_preferencial) : null,
      status_pagamento: 'pendente', // Awaiting first payment setup
      created_at: new Date().toISOString()
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profilePayload)

    if (profileError) {
      // Cleanup created auth user if profile upsert fails to maintain integrity
      await supabaseAdmin.auth.admin.deleteUser(newUser.id)
      throw new Error(profileError.message)
    }

    // 4. Mark invitation token as used
    const { error: inviteUpdateError } = await supabaseAdmin
      .from('invitations')
      .update({ used: true })
      .eq('id', token)

    if (inviteUpdateError) {
      console.error('Failed to mark invitation as used:', inviteUpdateError)
    }

    return json(res, 200, {
      message: 'Student registered successfully.',
      profile: profilePayload
    })
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}
