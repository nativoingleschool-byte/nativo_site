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
    const supabaseAdmin = getSupabaseAdmin();
    const { 
      token, 
      email, 
      password, 
      full_name, 
      country,
      nf_issued_to_student,
      student_name,
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

    const nfIssuedToStudent = nf_issued_to_student !== false;
    const trimmedStudentName = typeof student_name === 'string' ? student_name.trim() : '';
    if (!nfIssuedToStudent && !trimmedStudentName) {
      return json(res, 400, { error: 'Informe o nome do aluno.' });
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
      country: country || 'BR',
      nf_issued_to_student: nfIssuedToStudent,
      student_name: nfIssuedToStudent ? null : trimmedStudentName,
      cpf: cpf || null,
      data_pagamento_preferencial: data_pagamento_preferencial ? parseInt(data_pagamento_preferencial, 10) : null,
      cep: cep || null,
      logradouro: logradouro || null,
      bairro: bairro || null,
      cidade: cidade || null,
      uf: uf || null,
      status_pagamento: 'pendente'
    };

    let { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profilePayload);

    // Fallback: If optional newer columns have not been added to the database schema yet
    if (profileError && profileError.message) {
      const msg = profileError.message.toLowerCase();
      if (msg.includes('country') || msg.includes('nf_issued_to_student') || msg.includes('student_name')) {
        console.warn('[register-student] Retrying profile upsert without unmigrated columns:', profileError.message);
        const fallbackPayload = { ...profilePayload };
        if (msg.includes('country')) delete fallbackPayload.country;
        if (msg.includes('nf_issued_to_student')) delete fallbackPayload.nf_issued_to_student;
        if (msg.includes('student_name')) delete fallbackPayload.student_name;
        const retryResult = await supabaseAdmin
          .from('profiles')
          .upsert(fallbackPayload);
        profileError = retryResult.error;
      }
    }

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
