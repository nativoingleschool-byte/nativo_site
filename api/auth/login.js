import { getSupabaseAnonClient } from '../../services/supabase-admin.js';

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

  const { email, password } = body || {};

  if (!email || !password) {
    return json(res, 400, { error: 'Email and password are required.' });
  }

  try {
    const supabase = getSupabaseAnonClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });

    if (error) {
      return json(res, 401, { error: error.message });
    }

    return json(res, 200, {
      session: data.session,
      user: data.user
    });
  } catch (err) {
    return json(res, 500, { error: err.message || 'Internal server error' });
  }
}
