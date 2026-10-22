import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig, getSupabaseAdmin } from '../../services/supabase-admin.js';

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const getUserClient = (token) => {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    throw new Error('Supabase server authentication configuration is missing.');
  }
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
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

    const userClient = getUserClient(token);
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return json(res, 401, { error: 'Sessão inválida. Entre novamente.' });
    }
    const { data: profile, error: roleError } = await userClient.from('profiles')
      .select('id,role,archived').eq('id', user.id).single();
    if (roleError || !profile || profile.archived || profile.role !== 'teacher') {
      return json(res, 403, { error: 'Somente professores ativos podem enviar notas fiscais.' });
    }

    const { status_nota_fiscal, nota_fiscal_url, month_key, amount, file_name } = body || {};
    if (nota_fiscal_url && (typeof nota_fiscal_url !== 'string' || !nota_fiscal_url.startsWith('data:application/pdf;base64,'))) {
      return json(res, 400, { error: 'Envie um arquivo PDF válido.' });
    }

    const updatePayload = {
      status_nota_fiscal: status_nota_fiscal || 'enviada',
      ...(nota_fiscal_url ? { nota_fiscal_url } : {})
    };

    const { error: profileError } = await userClient
      .from('profiles')
      .update(updatePayload)
      .eq('id', user.id);

    if (profileError) {
      return json(res, 400, { error: profileError.message });
    }

    if (nota_fiscal_url) {
      const activeMonth = month_key || new Date().toISOString().slice(0, 7);
      try {
        const { error: invoiceError } = await userClient.from('teacher_invoices').insert({
          teacher_id: user.id,
          month_key: activeMonth,
          file_url: nota_fiscal_url,
          file_name: file_name || `NF_${activeMonth}_${user.id}.pdf`,
          amount: amount ? Number(amount) : null,
          status: 'enviada'
        });
        if (invoiceError) {
          console.warn('[upload-nf] teacher_invoices insert warning:', invoiceError.message);
        }
      } catch (err) {
        console.warn('[upload-nf] failed to insert to teacher_invoices:', err.message);
      }
    }

    return json(res, 200, {
      success: true,
      message: 'Nota fiscal enviada com sucesso.',
      status_nota_fiscal: updatePayload.status_nota_fiscal
    });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Erro interno ao salvar nota fiscal.' });
  }
}
