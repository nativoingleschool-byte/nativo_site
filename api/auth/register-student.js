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
    } = body || {};

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
  } catch (err) {
    return json(res, 500, { error: err.message || 'Internal server error' });
  }
}
