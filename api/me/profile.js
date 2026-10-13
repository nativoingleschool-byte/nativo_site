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
    auth: { autoRefreshToken: false, persistSession: false },
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
    } catch {
      return json(res, 400, { error: 'Invalid JSON payload.' });
    }
  }

  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json(res, 401, { error: 'Missing bearer token.' });

    const supabaseAdmin = getSupabaseAdmin();
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return json(res, 401, { error: 'Invalid session.' });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single();
    if (profileError || !profile) return json(res, 404, { error: 'Profile not found.' });
    if (profile.role !== 'teacher') return json(res, 403, { error: 'Only teacher profiles can use this endpoint.' });

    const input = body && typeof body === 'object' ? body : {};
    const fullName = typeof input.full_name === 'string' ? input.full_name.trim() : '';
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    const cnpj = typeof input.cnpj === 'string' ? input.cnpj.trim() : '';
    const pixKey = typeof input.chave_pix === 'string' ? input.chave_pix.trim() : '';
    if (!fullName || fullName.length > 200) return json(res, 400, { error: 'A valid full name is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(res, 400, { error: 'A valid email is required.' });
    if (cnpj.length > 32 || pixKey.length > 128) return json(res, 400, { error: 'Profile field exceeds the allowed length.' });
    if (typeof input.push_enabled !== 'boolean') return json(res, 400, { error: 'Notification preference must be a boolean.' });

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: fullName,
        email,
        cnpj,
        chave_pix: pixKey,
        push_enabled: input.push_enabled,
      })
      .eq('id', user.id)
      .select('id, full_name, email, cnpj, chave_pix, push_enabled')
      .single();

    if (error) return json(res, 400, { error: error.message });
    return json(res, 200, { data });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Unexpected server error.' });
  }
}
