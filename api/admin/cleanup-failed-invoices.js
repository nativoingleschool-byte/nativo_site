import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body, null, 2));
};

const getSupabaseAdmin = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase server environment variables are missing.');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
};

const assertAdmin = async (req) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Missing bearer token.');

  const adminClient = getSupabaseAdmin();
  const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !user) throw new Error('Session could not be verified.');

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    throw new Error('Only admin users can perform this action.');
  }

  return adminClient;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  try {
    const supabaseAdmin = await assertAdmin(req);

    const { student_names } = req.body || {};
    if (!student_names || !Array.isArray(student_names) || student_names.length === 0) {
      return json(res, 400, { error: 'Missing student_names array.' });
    }

    const results = [];

    for (const name of student_names) {
      // 1. Find student by full_name (case-insensitive via ilike)
      const { data: students, error: findError } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .ilike('full_name', `%${name}%`);

      if (findError) {
        results.push({ name, error: `Search failed: ${findError.message}` });
        continue;
      }

      if (!students || students.length === 0) {
        results.push({ name, error: 'Student not found.' });
        continue;
      }

      for (const student of students) {
        // 2. Find failed invoices: have protocolo_recebimento but no nfs_e_pdf_link
        const { data: failedInvoices, error: invoiceError } = await supabaseAdmin
          .from('invoices')
          .select('id, billing_period, status, protocolo_recebimento, nfs_e_pdf_link, created_at')
          .eq('student_id', student.id)
          .is('nfs_e_pdf_link', null)
          .not('protocolo_recebimento', 'is', null);

        if (invoiceError) {
          results.push({ name: student.full_name, error: `Invoice query failed: ${invoiceError.message}` });
          continue;
        }

        if (!failedInvoices || failedInvoices.length === 0) {
          results.push({ name: student.full_name, message: 'No failed invoices found.', invoices_updated: 0 });
          continue;
        }

        // 3. Update status to 'erro_layout' to unblock re-issuance
        const invoiceIds = failedInvoices.map(inv => inv.id);
        const { error: updateError } = await supabaseAdmin
          .from('invoices')
          .update({ status: 'erro_layout' })
          .in('id', invoiceIds);

        if (updateError) {
          results.push({ name: student.full_name, error: `Update failed: ${updateError.message}` });
          continue;
        }

        results.push({
          name: student.full_name,
          student_id: student.id,
          invoices_updated: failedInvoices.length,
          invoice_details: failedInvoices.map(inv => ({
            id: inv.id,
            billing_period: inv.billing_period,
            old_status: inv.status,
            new_status: 'erro_layout',
            protocolo: inv.protocolo_recebimento
          }))
        });
      }
    }

    return json(res, 200, { success: true, results });

  } catch (error) {
    console.error('Cleanup failed:', error.message);
    return json(res, 500, { error: error.message });
  }
}
