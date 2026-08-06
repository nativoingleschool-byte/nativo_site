import { createClient } from '@supabase/supabase-js';
import { generateDanfsePdf } from '../../services/barueri/generate-danfse-pdf.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const getSupabaseAdmin = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase server environment variables are missing.');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
};

const assertUserOrAdmin = async (req) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Missing bearer token.');

  const adminClient = getSupabaseAdmin();
  const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !user) throw new Error('Session could not be verified.');

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return { user, role: profile?.role || 'student', adminClient };
};

const jsonErr = (res, status, message) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: message }));
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return jsonErr(res, 405, 'Method not allowed.');

  try {
    const { user, role, adminClient: supabaseAdmin } = await assertUserOrAdmin(req);

    // Parse invoice_id from query string
    const invoiceId =
      req.query?.invoice_id ||
      new URL(req.url, 'http://localhost').searchParams.get('invoice_id');

    if (!invoiceId) return jsonErr(res, 400, 'Missing invoice_id.');

    // Fetch invoice
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) return jsonErr(res, 404, 'Invoice not found.');

    // Enforce authorization: Admin can download any invoice; student can only download their own invoice
    if (role !== 'admin' && invoice.student_id !== user.id) {
      return jsonErr(res, 403, 'Acesso negado.');
    }

    // Must have at least a protocol or NFS-e number to generate a meaningful PDF
    if (!invoice.nfse_numero && !invoice.protocolo_recebimento && !invoice.nfs_e_pdf_link) {
      return jsonErr(res, 400, 'NFS-e ainda nao foi processada. Aguarde o status de emissao.');
    }

    // Back-compat: if new columns are empty but the old URL exists, parse values from it
    if (!invoice.nfse_numero && invoice.nfs_e_pdf_link) {
      try {
        const u = new URL(invoice.nfs_e_pdf_link);
        const nota = u.searchParams.get('nota');
        const cv   = u.searchParams.get('codVerificacao');
        if (nota) invoice.nfse_numero = nota.replace(/^0+/, '') || nota;
        if (cv)   invoice.nfse_codigo_verificacao = cv;
      } catch { /* ignore malformed URL */ }
    }

    // Fetch student profile
    const { data: student, error: studentError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', invoice.student_id)
      .single();

    if (studentError || !student) return jsonErr(res, 404, 'Student profile not found.');

    // Generate PDF
    const pdfBuffer = await generateDanfsePdf({ invoice, student });

    const safeName  = (student.full_name || 'Aluno').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').toUpperCase();
    const nfseLabel = String(invoice.nfse_numero || invoice.id).padStart(7, '0');
    const filename  = `NFS-e_${nfseLabel}_${safeName}.pdf`;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.end(pdfBuffer);

  } catch (error) {
    console.error('NFS-e PDF generation failed:', error.message);
    return jsonErr(res, 500, error.message);
  }
}
