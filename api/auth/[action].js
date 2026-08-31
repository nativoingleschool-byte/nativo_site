import { createClient } from '@supabase/supabase-js';

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase server environment variables are missing.');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
};

async function handleLogin(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  const { email, password } = req.body || {};

  if (!email || !password) {
    return json(res, 400, { error: 'Email and password are required.' });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are missing on the server.');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
  });

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
}

async function handleRegisterStudent(req, res) {
  const supabaseAdmin = getSupabaseAdmin();
  const { 
    token, 
    email, 
    password, 
    full_name, 
    cpf, 
    data_pagamento_preferencial,
    cep,
    logradouro,
    bairro,
    cidade,
    uf
  } = req.body || {};

  if (!token || !email || !password || !full_name) {
    return json(res, 400, { error: 'Missing required registration fields.' });
  }

  const emailNormalized = email.trim().toLowerCase();

  // 1. Verify invitation token
  const { data: invitation, error: inviteError } = await supabaseAdmin
    .from('invitations')
    .select('*')
    .eq('id', token)
    .single();

  if (inviteError || !invitation) {
    return json(res, 400, { error: 'Link de convite inválido ou expirado.' });
  }

  if (!invitation.is_global && invitation.email !== emailNormalized) {
    return json(res, 400, { error: 'Este link de convite é restrito a outro e-mail.' });
  }

  if (invitation.used) {
    return json(res, 400, { error: 'Este convite já foi utilizado.' });
  }

  // 2. Create the user in Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: emailNormalized,
    password: password,
    email_confirm: true,
    user_metadata: { full_name }
  });

  if (authError) {
    return json(res, 400, { error: authError.message });
  }

  const userId = authData.user.id;

  // 3. Upsert student details into profiles
  const profilePayload = {
    id: userId,
    email: emailNormalized,
    full_name,
    role: 'student',
    cpf: cpf || null,
    data_pagamento_preferencial: data_pagamento_preferencial ? parseInt(data_pagamento_preferencial, 10) : null,
    cep: cep || null,
    logradouro: logradouro || null,
    bairro: bairro || null,
    cidade: cidade || null,
    uf: uf || null,
    status_pagamento: 'pendente'
  };

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert(profilePayload);

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return json(res, 400, { error: `Erro ao salvar perfil: ${profileError.message}` });
  }

  // 4. Mark invitation as used
  if (!invitation.is_global) {
    await supabaseAdmin
      .from('invitations')
      .update({ used: true })
      .eq('id', token);
  }

  return json(res, 200, {
    success: true,
    message: 'Conta criada com sucesso!',
    user: { id: userId, email: emailNormalized, full_name }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const action = req.query?.action || req.body?.action;

  try {
    if (action === 'login') {
      return await handleLogin(req, res);
    } else if (action === 'register-student') {
      return await handleRegisterStudent(req, res);
    } else {
      return json(res, 404, { error: `Auth action "${action}" not found.` });
    }
  } catch (err) {
    console.error(`Auth error (${action}):`, err);
    return json(res, 500, { error: err.message || 'Internal server error' });
  }
}
