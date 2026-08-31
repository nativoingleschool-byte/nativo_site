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

const assertUser = async (req) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Missing bearer token.');

  const supabaseAdmin = getSupabaseAdmin();
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) throw new Error('Invalid session.');

  return { supabaseAdmin, user };
};

async function handlePreferences(req, res, supabaseAdmin, user) {
  const pushEnabled = Boolean(req.body?.push_enabled);
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ push_enabled: pushEnabled })
    .eq('id', user.id);

  if (error) {
    return json(res, 400, { error: error.message });
  }

  return json(res, 200, { data: { push_enabled: pushEnabled } });
}

async function handleUploadNf(req, res, supabaseAdmin, user) {
  const { status_nota_fiscal, nota_fiscal_url } = req.body || {};

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
}

async function handleAccount(req, res, supabaseAdmin, user) {
  const fullName = String(req.body?.full_name ?? '').trim();
  const email = String(req.body?.email ?? '').trim();
  const password = String(req.body?.password ?? '').trim();

  if (!fullName) {
    return json(res, 400, { error: 'Full name is required.' });
  }

  if (!email || !email.includes('@')) {
    return json(res, 400, { error: 'A valid email address is required.' });
  }

  if (password && password.length < 8) {
    return json(res, 400, { error: 'Password must be at least 8 characters.' });
  }

  const updateAuthPayload = {
    email,
    user_metadata: { full_name: fullName }
  };
  if (password) {
    updateAuthPayload.password = password;
  }

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, updateAuthPayload);
  if (authError) {
    return json(res, 400, { error: authError.message });
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ full_name: fullName, email })
    .eq('id', user.id);

  if (profileError) {
    return json(res, 400, { error: profileError.message });
  }

  return json(res, 200, { data: { id: user.id, full_name: fullName, email } });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const action = req.query?.action || req.body?.action;

  try {
    const { supabaseAdmin, user } = await assertUser(req);

    if (action === 'preferences') {
      return await handlePreferences(req, res, supabaseAdmin, user);
    } else if (action === 'upload-nf') {
      return await handleUploadNf(req, res, supabaseAdmin, user);
    } else if (action === 'account') {
      return await handleAccount(req, res, supabaseAdmin, user);
    } else {
      return json(res, 404, { error: `Action "${action}" not found.` });
    }
  } catch (err) {
    return json(res, 400, { error: err.message || 'Unexpected server error.' });
  }
}
