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
  // Let's secure this with a query key to prevent unauthorized access
  const { key } = req.query || {}
  if (key !== 'W3b_Nativ0_init') {
    return json(res, 401, { error: 'Unauthorized bootstrap request.' })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()
    const email = 'nativoingleschool@gmail.com'
    const password = 'W3b@N@t1v0'
    const fullName = 'Weberty'

    // 1. Check if user already exists in auth
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    if (listError) throw listError

    const existingAuthUser = usersData?.users?.find(u => u.email === email)

    let userId;

    if (existingAuthUser) {
      userId = existingAuthUser.id
      // Reset password of existing user to match the request
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: password,
        email_confirm: true
      })
      if (updateError) throw updateError
    } else {
      // Create new user in auth
      const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      })
      if (createError || !authData?.user) {
        throw new Error(createError?.message || 'Failed to create auth user.')
      }
      userId = authData.user.id
    }

    // 2. Create or update profile in profiles
    const profilePayload = {
      id: userId,
      email: email,
      full_name: fullName,
      role: 'admin',
      timezone: 'America/Sao_Paulo',
      created_at: new Date().toISOString()
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profilePayload)

    if (profileError) {
      throw profileError
    }

    return json(res, 200, {
      success: true,
      message: 'Admin account successfully created/updated.',
      email,
      fullName
    })
  } catch (err) {
    return json(res, 500, { error: err.message })
  }
}
