import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

const json = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' })
  }

  const { email, password } = req.body || {}

  if (!email || !password) {
    return json(res, 400, { error: 'Email and password are required.' })
  }

  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase environment variables are missing on the server.')
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false }
    })

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    })

    if (error) {
      return json(res, 401, { error: error.message })
    }

    return json(res, 200, {
      session: data.session,
      user: data.user
    })
  } catch (err) {
    return json(res, 500, { error: err.message })
  }
}
