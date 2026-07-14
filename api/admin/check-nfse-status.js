import { createClient } from '@supabase/supabase-js';
import { consultarBarueriNFSe } from '../../services/barueri/nfse-service.js';

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

    const { invoice_id } = req.body || {};
    if (!invoice_id) {
      return json(res, 400, { error: 'Missing invoice_id.' });
    }

    // 1. Fetch invoice from database
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return json(res, 404, { error: 'Invoice not found.' });
    }

    // If already has PDF link, return it directly
    if (invoice.nfs_e_pdf_link) {
      let finalLink = invoice.nfs_e_pdf_link;
      // Auto-correct older broken links
      if (finalLink.includes('inscricao=14.B.Z59.82-0')) {
        try {
          const urlObj = new URL(finalLink);
          const params = new URLSearchParams(urlObj.search);
          const nota = params.get('nota');
          if (nota) params.set('nota', String(nota).padStart(7, '0'));
          params.set('inscricao', '14BZ5982');
          urlObj.search = params.toString();
          finalLink = urlObj.toString();
          
          // Asynchronously update db with corrected link
          supabaseAdmin.from('invoices').update({ nfs_e_pdf_link: finalLink }).eq('id', invoice.id).then();
        } catch (e) {
          // ignore
        }
      }
      return json(res, 200, {
        status: 'emitida',
        nfs_e_pdf_link: finalLink
      });
    }

    if (!invoice.protocolo_recebimento) {
      return json(res, 400, { error: 'Invoice has no protocol to check. It may not have been submitted yet.' });
    }

    // 2. Call Barueri SOAP consultation
    const result = await consultarBarueriNFSe(invoice.protocolo_recebimento);

    // 3. Handle result and update database
    if (result.status === 'processando') {
      return json(res, 200, {
        status: 'processando',
        message: result.message || 'Lote ainda em processamento pela prefeitura.'
      });
    }

    if (result.status === 'erro') {
      // Update invoice status to failed using correct enum falha_emissao
      const { error: updateError } = await supabaseAdmin
        .from('invoices')
        .update({ status: 'falha_emissao' })
        .eq('id', invoice_id);

      if (updateError) {
        console.error('Failed to update invoice to falha_emissao:', updateError);
      }

      return json(res, 200, {
        status: 'erro',
        message: result.message || 'A prefeitura rejeitou o lote.'
      });
    }

    if (result.status === 'concluido' && result.nfs_e_pdf_link) {
      // Update invoice with PDF link (do not change status to emitida, as it violates constraint)
      const { error: updateError } = await supabaseAdmin
        .from('invoices')
        .update({
          nfs_e_pdf_link: result.nfs_e_pdf_link
        })
        .eq('id', invoice_id);

      if (updateError) {
        console.error('Failed to update invoice pdf link:', updateError);
        throw new Error('Database update failed.');
      }

      return json(res, 200, {
        status: 'emitida',
        nfs_e_pdf_link: result.nfs_e_pdf_link
      });
    }

    // Fallback
    return json(res, 200, {
      status: 'desconhecido',
      message: 'Resposta inesperada da prefeitura.',
      raw: result
    });

  } catch (error) {
    console.error('NFS-e status check failed:', error.message);
    return json(res, 500, { error: error.message });
  }
}
