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

    if (!invoices || invoices.length === 0) {
      return json(res, 200, { message: 'No invoices found.' });
    }

    // Pick target invoice (specific ID or absolute latest)
    const targetId = req.query.invoice_id;
    const latestInvoice = targetId 
      ? invoices.find(inv => inv.id === targetId)
      : invoices[0];

    if (!latestInvoice) {
      return json(res, 404, { error: `Selected invoice_id ${targetId} not found in the recent list.` });
    }

    const protocolo = latestInvoice.protocolo_recebimento;

    const im = process.env.BARUERI_INSCRICAO_MUNICIPAL || '4BZ5982';
    const cnpj = (process.env.BARUERI_CNPJ_PRESTADOR || '00000000000100').replace(/\D/g, '');

    // 2. Query status from Prefeitura
    const statusResult = await sendBarueriStatusRequest(im, cnpj, protocolo);

    let innerXml = statusResult.data;
    if (typeof innerXml === 'object') {
      innerXml = innerXml.NFeLoteStatusArquivoResult || innerXml.NFeLoteStatusArquivoResponse || innerXml.output || JSON.stringify(innerXml);
    }

    let parsedInner = {};
    if (typeof innerXml === 'string' && innerXml.trim().startsWith('<')) {
      const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });
      parsedInner = parser.parse(innerXml);
    } else {
      parsedInner = statusResult.data;
    }

    // Find SituacaoArq and NomeArqRetorno
    const findStatusDetails = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      if (obj.SituacaoArq !== undefined) {
        return {
          situacao: String(obj.SituacaoArq),
          nomeArqRetorno: obj.NomeArqRetorno ? String(obj.NomeArqRetorno) : null
        };
      }
      if (obj.situacaoArq !== undefined) {
        return {
          situacao: String(obj.situacaoArq),
          nomeArqRetorno: obj.nomeArqRetorno ? String(obj.nomeArqRetorno) : null
        };
      }
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (val && typeof val === 'object') {
          const res = findStatusDetails(val);
          if (res) return res;
        }
      }
      return null;
    };

    const statusDetails = findStatusDetails(parsedInner);

    let decodedErrContent = null;
    let rawDownloadResult = null;

    if (statusDetails && statusDetails.nomeArqRetorno) {
      // 3. Download the .ERR file
      const downloadResult = await sendBarueriBaixarRequest(im, cnpj, statusDetails.nomeArqRetorno);
      rawDownloadResult = downloadResult.data;

      let baixarXml = downloadResult.data;
      if (typeof baixarXml === 'object') {
        baixarXml = baixarXml.NFeLoteBaixarArquivoResult || baixarXml.NFeLoteBaixarArquivoResponse || baixarXml.output || JSON.stringify(baixarXml);
      }

      let parsedBaixar = {};
      if (typeof baixarXml === 'string' && baixarXml.trim().startsWith('<')) {
        const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });
        parsedBaixar = parser.parse(baixarXml);
      } else {
        parsedBaixar = downloadResult.data;
      }

      const findArquivoBase64 = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.ArquivoRPSBase64) return String(obj.ArquivoRPSBase64);
        if (obj.arquivoRPSBase64) return String(obj.arquivoRPSBase64);
        for (const key of Object.keys(obj)) {
          const val = obj[key];
          if (val && typeof val === 'object') {
            const found = findArquivoBase64(val);
            if (found) return found;
          }
        }
        return null;
      };

      const base64Data = findArquivoBase64(parsedBaixar);
      if (base64Data) {
        decodedErrContent = Buffer.from(base64Data, 'base64').toString('utf8');
      }
    }

    return json(res, 200, {
      success: true,
      latest_invoice: {
        id: latestInvoice.id,
        rps_number: latestInvoice.rps_number,
        protocolo_recebimento: latestInvoice.protocolo_recebimento,
        created_at: latestInvoice.created_at,
        status: latestInvoice.status
      },
      recent_invoices: invoices.map(inv => ({
        id: inv.id,
        rps_number: inv.rps_number,
        status: inv.status,
        protocolo_recebimento: inv.protocolo_recebimento,
        created_at: inv.created_at
      })),
      status_details: statusDetails,
      decoded_err_content: decodedErrContent,
      raw_status_response: statusResult.data,
      raw_download_response: rawDownloadResult
    });

  } catch (error) {
    return json(res, 500, { error: error.message, stack: error.stack });
  }
}
