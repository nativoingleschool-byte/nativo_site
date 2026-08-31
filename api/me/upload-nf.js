import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const getSupabaseAdmin = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase server environment variables are missing.');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return json(res, 400, { error: 'Invalid JSON payload.' });
    }
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return json(res, 401, { error: 'Missing bearer token.' });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return json(res, 401, { error: 'Invalid session.' });
    }

    const { status_nota_fiscal, nota_fiscal_url } = body || {};

    const updatePayload = {
      status_nota_fiscal: status_nota_fiscal || 'enviada',
      ...(nota_fiscal_url ? { nota_fiscal_url } : {})
    };

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(updatePayload)
      .eq('id', user.id);

    if (profileError) {
      return json(res, 400, { error: profileError.message });
    }

    return json(res, 200, { success: true });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Unexpected server error.' });
  }
}
