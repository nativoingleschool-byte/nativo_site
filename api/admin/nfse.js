import { createClient } from '@supabase/supabase-js';
import { issueBarueriNFSe, consultarBarueriNFSe } from '../../services/barueri/nfse-service.js';
import { generateDanfsePdf } from '../../services/barueri/generate-danfse-pdf.js';

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

  return { adminClient, user };
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

// -----------------------------------------------------------------------------
// 1. PDF Generation Handler (GET or POST action=pdf)
// -----------------------------------------------------------------------------
async function handleGeneratePdf(req, res) {
  const { user, role, adminClient: supabaseAdmin } = await assertUserOrAdmin(req);

  const urlObj = new URL(req.url, 'http://localhost');
  const invoiceId = req.query?.invoice_id || urlObj.searchParams.get('invoice_id') || req.body?.invoice_id;

  if (!invoiceId) return json(res, 400, { error: 'Missing invoice_id.' });

  const { data: invoice, error: invoiceError } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (invoiceError || !invoice) return json(res, 404, { error: 'Invoice not found.' });

  if (role !== 'admin' && invoice.student_id !== user.id) {
    return json(res, 403, { error: 'Acesso negado.' });
  }

  if (!invoice.nfse_numero && !invoice.protocolo_recebimento && !invoice.nfs_e_pdf_link) {
    return json(res, 400, { error: 'NFS-e ainda não foi processada. Aguarde o status de emissão.' });
  }

  if (!invoice.nfse_numero && invoice.nfs_e_pdf_link) {
    try {
      const u = new URL(invoice.nfs_e_pdf_link);
      const nota = u.searchParams.get('nota');
      const cv = u.searchParams.get('codVerificacao');
      if (nota) invoice.nfse_numero = nota.replace(/^0+/, '') || nota;
      if (cv) invoice.nfse_codigo_verificacao = cv;
    } catch {
      // ignore
    }
  }

  const { data: student, error: studentError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', invoice.student_id)
    .single();

  if (studentError || !student) return json(res, 404, { error: 'Student profile not found.' });

  const pdfBuffer = await generateDanfsePdf({ invoice, student });

  const safeName = (student.full_name || 'Aluno').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').toUpperCase();
  const nfseLabel = String(invoice.nfse_numero || invoice.id).padStart(7, '0');
  const filename = `NFS-e_${nfseLabel}_${safeName}.pdf`;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.end(pdfBuffer);
}

// -----------------------------------------------------------------------------
// 2. Issue NFS-e Handler (POST action=issue or student_id present)
// -----------------------------------------------------------------------------
async function handleIssueNfse(req, res, body) {
  const { adminClient: supabaseAdmin } = await assertAdmin(req);
  const { student_id, billing_period, force_retry } = body || {};

  if (!student_id) {
    return json(res, 400, { error: 'Missing student_id.' });
  }

  const today = new Date();
  const tzOffset = -3 * 60;
  const localTime = new Date(today.getTime() + tzOffset * 60 * 1000);
  const currentPeriod = billing_period || localTime.toISOString().substring(0, 7);

  const { data: existingInvoice, error: checkError } = await supabaseAdmin
    .from('invoices')
    .select('id, nfs_e_pdf_link, protocolo_recebimento')
    .eq('student_id', student_id)
    .eq('billing_period', currentPeriod)
    .maybeSingle();

  if (checkError) {
    throw new Error(`Database validation failed: ${checkError.message}`);
  }

  if (existingInvoice) {
    if (force_retry || !existingInvoice.nfs_e_pdf_link) {
      await supabaseAdmin.from('invoices').delete().eq('id', existingInvoice.id);
    } else {
      return json(res, 409, { error: 'Nota fiscal já emitida com sucesso para este aluno no período atual.' });
    }
  }

  const { data: student, error: studentError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', student_id)
    .single();

  if (studentError || !student) {
    return json(res, 404, { error: 'Student profile not found.' });
  }

  if (student.role !== 'student') {
    return json(res, 400, { error: 'Selected user profile is not a student.' });
  }

  const tuitionFee = Number(student.tuition_fee);
  if (!tuitionFee || isNaN(tuitionFee)) {
    return json(res, 400, { error: 'Mensalidade do estudante não cadastrada.' });
  }

  const { data: highestInvoices, error: seqError } = await supabaseAdmin
    .from('invoices')
    .select('rps_number')
    .lt('rps_number', 10000000)
    .order('rps_number', { ascending: false })
    .limit(1);

  let finalRpsNumber = 1;
  if (!seqError && highestInvoices && highestInvoices.length > 0) {
    const maxRps = Number(highestInvoices[0].rps_number);
    if (!isNaN(maxRps) && maxRps > 0) {
      finalRpsNumber = maxRps + 1;
    }
  } else {
    const { data: rpsNumber, error: rpcRpsError } = await supabaseAdmin
      .rpc('get_next_barueri_rps');

    if (!rpcRpsError && rpsNumber) {
      const rpsStr = String(rpsNumber);
      const lastDigits = Number(rpsStr.slice(-5));
      if (!isNaN(lastDigits) && lastDigits > 0) {
        finalRpsNumber = lastDigits;
      }
    }
  }

  const result = await issueBarueriNFSe(student, tuitionFee, finalRpsNumber);
  const isMockLink = typeof result === 'string' && result.startsWith('http');

  let invoice;
  let invoiceError;

  if (existingInvoice) {
    const { data: updatedInvoice, error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({
        status: 'pago',
        rps_number: finalRpsNumber,
        nfs_e_pdf_link: isMockLink ? result : null,
        protocolo_recebimento: isMockLink ? null : result
      })
      .eq('id', existingInvoice.id)
      .select('*')
      .single();
    invoice = updatedInvoice;
    invoiceError = updateError;
  } else {
    const { data: insertedInvoice, error: insertError } = await supabaseAdmin
      .from('invoices')
      .insert({
        student_id: student.id,
        status: 'pago',
        rps_number: finalRpsNumber,
        nfs_e_pdf_link: isMockLink ? result : null,
        protocolo_recebimento: isMockLink ? null : result,
        billing_period: currentPeriod
      })
      .select('*')
      .single();
    invoice = insertedInvoice;
    invoiceError = insertError;
  }

  if (invoiceError) {
    throw new Error(`Failed to record invoice details: ${invoiceError.message}`);
  }

  await supabaseAdmin
    .from('profiles')
    .update({ status_pagamento: 'em_dia' })
    .eq('id', student.id);

  return json(res, 200, {
    success: true,
    message: 'NFS-e issued and invoice recorded successfully.',
    invoice_id: invoice.id,
    rps_number: finalRpsNumber,
    nfs_e_pdf_link: invoice.nfs_e_pdf_link || null,
    protocolo_recebimento: invoice.protocolo_recebimento || null
  });
}

// -----------------------------------------------------------------------------
// 3. Check NFS-e Status Handler (POST action=check-status)
// -----------------------------------------------------------------------------
async function handleCheckStatus(req, res, body) {
  const { adminClient: supabaseAdmin } = await assertAdmin(req);

  if (body?.student_names && Array.isArray(body.student_names)) {
    const results = [];
    for (const name of body.student_names) {
      const { data: students } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .ilike('full_name', `%${name}%`);

      if (students) {
        for (const student of students) {
          const currentPeriod = new Date().toISOString().substring(0, 7);
          const { data: failedInvoices } = await supabaseAdmin
            .from('invoices')
            .select('id')
            .eq('student_id', student.id)
            .eq('billing_period', currentPeriod);

          if (failedInvoices && failedInvoices.length > 0) {
            await supabaseAdmin.from('invoices').delete().in('id', failedInvoices.map(i => i.id));
            results.push({ name: student.full_name, deleted: failedInvoices.length });
          }
        }
      }
    }
    return json(res, 200, { success: true, results });
  }

  const { invoice_id } = body || {};
  if (!invoice_id) {
    return json(res, 400, { error: 'Missing invoice_id.' });
  }

  const { data: invoice, error: invoiceError } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('id', invoice_id)
    .single();

  if (invoiceError || !invoice) {
    return json(res, 404, { error: 'Invoice not found.' });
  }

  if (invoice.nfs_e_pdf_link) {
    return json(res, 200, {
      status: 'emitida',
      nfs_e_pdf_link: invoice.nfs_e_pdf_link
    });
  }

  if (!invoice.protocolo_recebimento) {
    return json(res, 400, { error: 'Invoice has no protocol to check.' });
  }

  const result = await consultarBarueriNFSe(invoice.protocolo_recebimento);

  if (result.status === 'processando') {
    return json(res, 200, {
      status: 'processando',
      message: result.message || 'Lote ainda em processamento pela prefeitura.'
    });
  }

  if (result.status === 'erro') {
    await supabaseAdmin
      .from('invoices')
      .update({ status: 'falha_emissao' })
      .eq('id', invoice_id);

    return json(res, 200, {
      status: 'erro',
      message: result.message || 'A prefeitura rejeitou o lote.'
    });
  }

  if (result.status === 'concluido' && result.nfs_e_pdf_link) {
    await supabaseAdmin
      .from('invoices')
      .update({
        nfs_e_pdf_link: result.nfs_e_pdf_link,
        nfse_numero: result.nfse_numero || null,
        nfse_codigo_verificacao: result.nfse_codigo_verificacao || null
      })
      .eq('id', invoice_id);

    return json(res, 200, {
      status: 'emitida',
      nfs_e_pdf_link: result.nfs_e_pdf_link,
      nfse_numero: result.nfse_numero || null,
      nfse_codigo_verificacao: result.nfse_codigo_verificacao || null
    });
  }

  return json(res, 200, {
    status: 'desconhecido',
    message: 'Resposta inesperada da prefeitura.',
    raw: result
  });
}

// -----------------------------------------------------------------------------
// Unified Entrypoint Router
// -----------------------------------------------------------------------------
export default async function handler(req, res) {
  try {
    const urlObj = new URL(req.url, 'http://localhost');
    const actionParam = req.query?.action || urlObj.searchParams.get('action');

    // GET requests always serve PDF
    if (req.method === 'GET' || actionParam === 'pdf') {
      return await handleGeneratePdf(req, res);
    }

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

    const action = actionParam || body?.action;

    if (action === 'check-status' || (!body?.student_id && body?.invoice_id) || body?.student_names) {
      return await handleCheckStatus(req, res, body);
    }

    if (action === 'issue' || body?.student_id) {
      return await handleIssueNfse(req, res, body);
    }

    return json(res, 400, { error: 'Invalid or missing action in NFS-e router.' });
  } catch (err) {
    console.error('NFS-e endpoint error:', err.message);
    return json(res, 500, { error: err.message || 'Internal server error.' });
  }
}
