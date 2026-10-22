import { getSupabaseAdmin } from '../../services/supabase-admin.js';


const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
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

    const supabaseAdmin = getSupabaseAdmin(token);
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return json(res, 401, { error: 'Invalid session.' });
    }

    const pushEnabled = Boolean(body?.push_enabled);
    const { error } = await supabaseAdmin.from('profiles').update({ push_enabled: pushEnabled }).eq('id', user.id);

    if (error) {
      return json(res, 400, { error: error.message });
    }

    return json(res, 200, { data: { push_enabled: pushEnabled } });
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : 'Unexpected server error.' });
  }
}
