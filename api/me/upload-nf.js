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

// Notifies every active admin that a teacher uploaded a new NF.
// Uses the service-role client because RLS only lets users insert notifications for themselves.
// Failures are logged and never block the upload.
const notifyAdminsOfInvoice = async ({ teacherId, token, activeMonth, invoiceId }) => {
  try {
    const admin = getSupabaseAdmin(token);
    const { data: teacher } = await admin.from('profiles')
      .select('full_name').eq('id', teacherId).maybeSingle();
    const { data: admins, error: adminsError } = await admin.from('profiles')
      .select('id').eq('role', 'admin').eq('archived', false);
    if (adminsError || !admins?.length) {
      if (adminsError) console.warn('[upload-nf] admin lookup warning:', adminsError.message);
      return;
    }

    const [year, month] = activeMonth.split('-');
    const teacherName = teacher?.full_name || 'Um professor';
    const dedupeSuffix = invoiceId || `${activeMonth}-${Date.now()}`;
    const rows = admins.map((a) => ({
      user_id: a.id,
      type: 'invoice_uploaded',
      title: 'Nova nota fiscal enviada',
      body: `${teacherName} enviou a NF de ${month}/${year}.`,
      entity_type: 'teacher_invoice',
      entity_id: invoiceId || null,
      action_url: '/reminder',
      dedupe_key: `${a.id}-nf-${dedupeSuffix}`,
    }));

    const { error } = await admin.from('notifications')
      .upsert(rows, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });
    if (error) console.warn('[upload-nf] admin notification warning:', error.message);
  } catch (err) {
    console.warn('[upload-nf] failed to notify admins:', err.message);
  }
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

    let finalFileUrl = nota_fiscal_url;

    // Upload PDF to Supabase Storage bucket 'teacher-invoices' instead of saving raw base64 string
    if (nota_fiscal_url && nota_fiscal_url.startsWith('data:')) {
      const activeMonth = month_key || new Date().toISOString().slice(0, 7);
      const cleanFileName = (file_name || `NF_${activeMonth}_${user.id}.pdf`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageFilePath = `${user.id}/${activeMonth}/${Date.now()}_${cleanFileName}`;

      try {
        const matches = nota_fiscal_url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches[2]) {
          const buffer = Buffer.from(matches[2], 'base64');
          const adminClient = getSupabaseAdmin(token);
          const { error: uploadErr } = await adminClient.storage
            .from('teacher-invoices')
            .upload(storageFilePath, buffer, {
              contentType: matches[1] || 'application/pdf',
              upsert: true,
            });

          if (!uploadErr) {
            // Generate a 1-year signed download URL for direct access
            const { data: signedData } = await adminClient.storage
              .from('teacher-invoices')
              .createSignedUrl(storageFilePath, 31536000); // 1 year expiry

            finalFileUrl = signedData?.signedUrl || storageFilePath;
          } else {
            console.warn('[upload-nf] Supabase storage upload notice:', uploadErr.message);
          }
        }
      } catch (storageErr) {
        console.warn('[upload-nf] Storage processing warning:', storageErr.message);
      }
    }

    const updatePayload = {
      status_nota_fiscal: status_nota_fiscal || 'enviada',
      ...(finalFileUrl ? { nota_fiscal_url: finalFileUrl } : {})
    };

    const { error: profileError } = await userClient
      .from('profiles')
      .update(updatePayload)
      .eq('id', user.id);

    if (profileError) {
      return json(res, 400, { error: profileError.message });
    }

    if (finalFileUrl) {
      const activeMonth = month_key || new Date().toISOString().slice(0, 7);
      try {
        const { data: invoiceRow, error: invoiceError } = await userClient.from('teacher_invoices').insert({
          teacher_id: user.id,
          month_key: activeMonth,
          file_url: finalFileUrl,
          file_name: file_name || `NF_${activeMonth}_${user.id}.pdf`,
          amount: amount ? Number(amount) : null,
          status: 'enviada'
        }).select('id').maybeSingle();
        if (invoiceError) {
          console.warn('[upload-nf] teacher_invoices insert warning:', invoiceError.message);
        }
        await notifyAdminsOfInvoice({ teacherId: user.id, token, activeMonth, invoiceId: invoiceRow?.id });
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
