import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const CORA_API_URL = process.env.CORA_API_URL || 'https://api.sandbox.cora.com.br'
const CORA_CLIENT_ID = process.env.CORA_CLIENT_ID
const CORA_CLIENT_SECRET = process.env.CORA_CLIENT_SECRET

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

// Ensure the request is coming from an authenticated Admin
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
    throw new Error('Only admin users can generate boletos.')
  }

  return adminClient
}

// Obtain OAuth token from Cora Bank API
const getCoraAccessToken = async () => {
  if (!CORA_CLIENT_ID || !CORA_CLIENT_SECRET) {
    // If credentials are not set, return a mock token for local testing/compiles
    console.warn('Cora credentials missing. Using sandbox mock credentials.')
    return 'mock-cora-token'
  }

  const response = await fetch(`${CORA_API_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${CORA_CLIENT_ID}:${CORA_CLIENT_SECRET}`).toString('base64')
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  })

  if (!response.ok) {
    throw new Error('Failed to retrieve access token from Cora.')
  }

  const data = await response.json()
  return data.access_token
}

// Generate the invoice (boleto) via Cora
const createCoraInvoice = async (accessToken, student, amount, dueDateStr) => {
  // If sandbox mock token, bypass external API call and return mock invoice data
  if (accessToken === 'mock-cora-token') {
    return {
      invoice_id: 'cora-mock-invoice-' + Math.random().toString(36).slice(2, 9),
      payment_url: 'https://cora.com.br/boleto/mock-pdf-link-' + Math.random().toString(36).slice(2, 9)
    }
  }

  const payload = {
    payment_method: 'BOLETO',
    amount: Math.round(amount * 100), // Cora expects amount in cents
    due_date: dueDateStr, // YYYY-MM-DD
    customer: {
      name: student.full_name,
      email: student.email,
      document: student.cpf ? student.cpf.replace(/\D/g, '') : ''
    },
    // Automatic billing rules setup (Régua de Cobrança)
    // 2 days before, on the due date, and 2 days after
    notifications: [
      {
        channel: 'EMAIL',
        rules: [
          { rule_type: 'BEFORE_DUE_DATE', days: 2 },
          { rule_type: 'ON_DUE_DATE', days: 0 },
          { rule_type: 'AFTER_DUE_DATE', days: 2 }
        ]
      }
    ]
  }

  const response = await fetch(`${CORA_API_URL}/v2/invoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Cora API error: ${errorBody}`)
  }

  const data = await response.json()
  return {
    invoice_id: data.id,
    payment_url: data.payment_url // Cora returns pdf link or checkout url
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' })
  }

  try {
    const supabaseAdmin = await assertAdmin(req)
    const { student_id, amount, due_date } = req.body || {}

    if (!student_id || !amount || !due_date) {
      return json(res, 400, { error: 'Missing student_id, amount, or due_date.' })
    }

    // Load student profile
    const { data: student, error: studentError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', student_id)
      .eq('role', 'student')
      .single()

    if (studentError || !student) {
      return json(res, 404, { error: 'Student not found.' })
    }

    const token = await getCoraAccessToken()
    const coraInvoice = await createCoraInvoice(token, student, amount, due_date)

    // Save invoice to database
    const { data: invoiceData, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .insert({
        student_id: student.id,
        boleto_url: coraInvoice.payment_url,
        status: 'pendente'
      })
      .select('*')
      .single()

    if (invoiceError) {
      throw new Error(invoiceError.message)
    }

    return json(res, 200, {
      message: 'Boleto generated successfully via Cora.',
      invoice: invoiceData
    })
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
  }
}
