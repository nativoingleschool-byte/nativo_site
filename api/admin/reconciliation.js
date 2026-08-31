import { createClient } from '@supabase/supabase-js';
import { processStatementAndUpsert } from '../../services/bank/statement-service.js';
import { issueBarueriNFSe } from '../../services/barueri/nfse-service.js';

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

/**
 * Handles action: "parse" -> parses OFX/CSV statement and runs student matching
 */
async function handleParse(supabaseAdmin, req, res, body) {
  const { file_content, filename } = body || {};
  if (!file_content || typeof file_content !== 'string') {
    return json(res, 400, { error: 'file_content is required as a string.' });
  }

  const result = await processStatementAndUpsert(supabaseAdmin, file_content, filename);
  return json(res, 200, result);
}

/**
 * Handles action: "issue-single" -> emits a single Barueri NFS-e for a reconciled transaction
 */
async function handleIssueSingle(supabaseAdmin, req, res, body) {
  const { transaction_id, student_id: overrideStudentId, billing_period: overridePeriod } = body || {};
  if (!transaction_id) {
    return json(res, 400, { error: 'Missing transaction_id.' });
  }

  // 1. Fetch bank transaction
  const { data: transaction, error: txError } = await supabaseAdmin
    .from('bank_transactions')
    .select('*')
    .eq('id', transaction_id)
    .single();

  if (txError || !transaction) {
    return json(res, 404, { error: 'Bank transaction not found.' });
  }

  if (transaction.status === 'issued' && transaction.nfse_id) {
    return json(res, 200, {
      success: true,
      already_issued: true,
      transaction_id: transaction.id,
      invoice_id: transaction.nfse_id,
      message: 'Esta transação já possui nota fiscal emitida.'
    });
  }

  // 2. Determine target student
  const studentId = overrideStudentId || transaction.student_id;
  if (!studentId) {
    return json(res, 400, { error: 'Nenhum estudante associado a esta transação.' });
  }

  // 3. Fetch student profile
  const { data: student, error: studentError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', studentId)
    .single();

  if (studentError || !student) {
    return json(res, 404, { error: 'Perfil do estudante não encontrado.' });
  }

  if (student.role !== 'student') {
    return json(res, 400, { error: 'O perfil selecionado não pertence a um estudante.' });
  }

  // 4. Validate tuition / transaction amount
  const amount = Number(transaction.amount) > 0 ? Number(transaction.amount) : Number(student.tuition_fee);
  if (!amount || isNaN(amount) || amount <= 0) {
    return json(res, 400, { error: 'Valor da mensalidade inválido para emissão.' });
  }

  // 5. Determine billing period (YYYY-MM)
  let currentPeriod = overridePeriod;
  if (!currentPeriod) {
    if (transaction.transaction_date) {
      currentPeriod = String(transaction.transaction_date).substring(0, 7);
    } else {
      const today = new Date();
      const tzOffset = -3 * 60; // Brasília UTC-3
      const localTime = new Date(today.getTime() + tzOffset * 60 * 1000);
      currentPeriod = localTime.toISOString().substring(0, 7);
    }
  }

  // 6. Generate sequential RPS Number
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

  // 7. Invoke Barueri NFSe service helper (100% untouched)
  const result = await issueBarueriNFSe(student, amount, finalRpsNumber);
  const isMockLink = typeof result === 'string' && result.startsWith('http');

  // 8. Insert new invoice record
  const { data: invoice, error: invoiceError } = await supabaseAdmin
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

  if (invoiceError || !invoice) {
    throw new Error(`Falha ao registrar fatura gerada: ${invoiceError?.message || 'erro desconhecido'}`);
  }

  // 9. Update bank_transactions row
  const { error: updateTxError } = await supabaseAdmin
    .from('bank_transactions')
    .update({
      status: 'issued',
      student_id: student.id,
      nfse_id: invoice.id,
      raw_data: {
        ...(transaction.raw_data || {}),
        issued_at: new Date().toISOString(),
        rps_number: finalRpsNumber,
        protocolo: invoice.protocolo_recebimento,
        nfs_e_pdf_link: invoice.nfs_e_pdf_link
      }
    })
    .eq('id', transaction.id);

  if (updateTxError) {
    console.warn('Could not update bank_transactions record:', updateTxError.message);
  }

  // 10. Update student payment status
  await supabaseAdmin
    .from('profiles')
    .update({ status_pagamento: 'em_dia' })
    .eq('id', student.id);

  return json(res, 200, {
    success: true,
    transaction_id: transaction.id,
    invoice_id: invoice.id,
    rps_number: finalRpsNumber,
    nfs_e_pdf_link: invoice.nfs_e_pdf_link || null,
    protocolo_recebimento: invoice.protocolo_recebimento || null
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return json(res, 400, { error: 'Invalid JSON body.' });
    }
  }

  const action = body?.action || req.query?.action;
  let supabaseAdmin = null;

  try {
    supabaseAdmin = await assertAdmin(req);

    if (action === 'parse') {
      return await handleParse(supabaseAdmin, req, res, body);
    } else if (action === 'issue-single') {
      return await handleIssueSingle(supabaseAdmin, req, res, body);
    } else {
      return json(res, 400, { error: `Invalid or missing action: "${action}". Expected "parse" or "issue-single".` });
    }

  } catch (error) {
    console.error(`Reconciliation error (action: ${action}):`, error.message);

    // If issue-single failed, record status = 'failed' in bank_transactions
    if (action === 'issue-single' && supabaseAdmin && body?.transaction_id) {
      try {
        await supabaseAdmin
          .from('bank_transactions')
          .update({
            status: 'failed',
            raw_data: {
              last_error: error.message,
              failed_at: new Date().toISOString()
            }
          })
          .eq('id', body.transaction_id);
      } catch (e) {
        console.warn('Failed to update bank_transactions failure status:', e.message);
      }
    }

    return json(res, 500, { error: error.message || 'Internal server error' });
  }
}
