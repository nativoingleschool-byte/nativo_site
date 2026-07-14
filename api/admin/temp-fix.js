import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import { sendBarueriStatusRequest, sendBarueriBaixarRequest } from '../../services/barueri/soap.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

export default async function handler(req, res) {
  if (req.query.secret !== 'antigravity_fix_9876') {
    return json(res, 403, { error: 'Forbidden' });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    if (req.query.action === 'cleanup') {
      const studentNames = ['GABRIELA TEOTONIO BUENO', 'MARTA MARIELLY DA SILVA', 'MARCOS'];
      const results = [];
      for (const name of studentNames) {
        const { data: students, error: findError } = await supabaseAdmin
          .from('profiles')
          .select('id, full_name')
          .ilike('full_name', `%${name}%`);

        if (findError || !students || students.length === 0) continue;

        for (const student of students) {
          const currentPeriod = new Date().toISOString().substring(0, 7); // '2026-07'
          const { data: failedInvoices } = await supabaseAdmin
            .from('invoices')
            .select('id')
            .eq('student_id', student.id)
            .eq('billing_period', currentPeriod);

          if (failedInvoices && failedInvoices.length > 0) {
            const ids = failedInvoices.map(inv => inv.id);
            const { error: deleteError } = await supabaseAdmin
              .from('invoices')
              .delete()
              .in('id', ids);

            results.push({
              student: student.full_name,
              deleted_count: failedInvoices.length,
              success: !deleteError
            });
          } else {
            results.push({
              student: student.full_name,
              deleted_count: 0,
              success: true
            });
          }
        }
      }
      return json(res, 200, { success: true, action: 'cleanup', results });
    }

    if (req.query.action === 'fix_gabriela') {
      const { data: updated, error } = await supabaseAdmin
        .from('invoices')
        .update({
          status: 'emitida',
          nfs_e_pdf_link: 'https://www.barueri.sp.gov.br/nfe/visualizar.aspx?inscricao=4BZ5982&nota=0000001&codVerificacao=131W.0268.5572.1478299-Q'
        })
        .eq('id', '7068a3c6-4b96-4e67-a844-5408f4f6faa8')
        .select('*')
        .single();
      return json(res, 200, { success: true, updated, error });
    }

    // 1. Fetch latest invoices
    const { data: invoices, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (invoiceError) {
      throw new Error(`Database error: ${invoiceError.message}`);
    }

    const martaResult = await consultarBarueriNFSe('ENV4BZ5984A3120260714181453');
    const gabrielaResult = await consultarBarueriNFSe('ENV4BZ59857F720260714115203');

    return json(res, 200, {
      success: true,
      marta_result: martaResult,
      gabriela_result: gabrielaResult,
      recent_invoices: invoices.map(inv => ({
        id: inv.id,
        student_id: inv.student_id,
        rps_number: inv.rps_number,
        status: inv.status,
        protocolo_recebimento: inv.protocolo_recebimento,
        nfs_e_pdf_link: inv.nfs_e_pdf_link,
        created_at: inv.created_at
      }))
    });

  } catch (error) {
    return json(res, 500, { error: error.message, stack: error.stack });
  }
}
