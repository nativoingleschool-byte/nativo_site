import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SCHOOL_CNPJ = process.env.SCHOOL_CNPJ || '00.000.000/0001-00';

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

/**
 * Placeholder function for Phase 3: Barueri NFS-e XML emission.
 * Simulates generating an invoice with the municipal service and returning the PDF link.
 */
const issueBarueriNFSe = async (studentData, amount, rpsNumber) => {
  console.log(`[issueBarueriNFSe] Placeholder triggered for RPS ${rpsNumber}, Tomador: ${studentData.full_name}, Amount: ${amount}`);
  
  // In a sandbox/mock run, we generate a mock invoice id and visualization url
  const mockNfseId = Math.floor(100000 + Math.random() * 900000);
  const cnpjClean = SCHOOL_CNPJ.replace(/\D/g, '');
  
  return `https://receita.barueri.sp.gov.br/nfse/visualizar?id=${mockNfseId}&cnpj=${cnpjClean}&rps=${rpsNumber}`;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { event, data } = req.body || {};
  const eventType = event || 'unknown';
  const headers = req.headers || {};

  let logRecordId = null;

  try {
    // 1. Listen & Validate (Logs Seguros): Record request to webhook_logs first
    const { data: logRecord, error: logError } = await supabaseAdmin
      .from('webhook_logs')
      .insert({
        event_type: eventType,
        payload: req.body || {},
        headers: headers,
        processed: false
      })
      .select('id')
      .single();

    if (logError) {
      console.error('Failed to save webhook log in database:', logError.message);
    } else if (logRecord) {
      logRecordId = logRecord.id;
    }

    // 2. Filter Events: Only process payment success events
    if (eventType !== 'invoice.paid' && eventType !== 'invoice_paid') {
      return json(res, 200, { message: 'Webhook event ignored.' });
    }

    // 3. Extract Data: Extract payment details and locate local invoice
    const coraInvoiceId = data?.id || data?.invoice_id;
    const paymentUrl = data?.payment_url || data?.payment_options?.bank_slip?.url || data?.payment_options?.pix?.url;
    const amountCents = data?.amount || data?.value || 0;
    const amount = amountCents / 100; // Cora returns values in cents

    // Match payment to our local invoices table
    let invoice = null;
    if (paymentUrl) {
      const { data: matchedInvoice } = await supabaseAdmin
        .from('invoices')
        .select('*')
        .eq('boleto_url', paymentUrl)
        .maybeSingle();
      invoice = matchedInvoice;
    }

    if (!invoice && coraInvoiceId) {
      const { data: matchedInvoice } = await supabaseAdmin
        .from('invoices')
        .select('*')
        .eq('id', coraInvoiceId)
        .maybeSingle();
      invoice = matchedInvoice;
    }

    if (!invoice) {
      console.warn(`Invoice mismatch: no local invoice matches payment url "${paymentUrl}" or ID "${coraInvoiceId}".`);
      return json(res, 404, { error: 'Corresponding invoice not found.' });
    }

    // Fetch the corresponding student profile details
    const { data: student, error: studentError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', invoice.student_id)
      .single();

    if (studentError || !student) {
      throw new Error(`Student profile not found for ID ${invoice.student_id}`);
    }

    // 4. Trigger Flow (Tratamento Rigoroso de Erros)
    // Get the next daily-sequential RPS number
    const { data: rpsNumber, error: rpsError } = await supabaseAdmin
      .rpc('get_next_barueri_rps');

    if (rpsError || !rpsNumber) {
      throw new Error(`RPS generation failed: ${rpsError?.message || 'Empty sequence'}`);
    }

    // Execute the invoice emission inside a strict try/catch block
    try {
      const nfsEPdfLink = await issueBarueriNFSe(student, amount, rpsNumber);

      // On Success: Update invoice, student profile, and mark webhook as processed
      const { error: invoiceUpdateError } = await supabaseAdmin
        .from('invoices')
        .update({
          status: 'pago',
          rps_number: rpsNumber,
          nfs_e_pdf_link: nfsEPdfLink
        })
        .eq('id', invoice.id);

      if (invoiceUpdateError) throw invoiceUpdateError;

      // Update student's payment status to in_order ('em_dia')
      const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ status_pagamento: 'em_dia' })
        .eq('id', student.id);

      if (profileUpdateError) throw profileUpdateError;

      // Update webhook log processed flag to true
      if (logRecordId) {
        await supabaseAdmin
          .from('webhook_logs')
          .update({ processed: true })
          .eq('id', logRecordId);
      }

      return json(res, 200, {
        message: 'Invoice updated and NFS-e generated successfully.',
        invoice_id: invoice.id,
        rps_number: rpsNumber,
        nfs_e_pdf_link: nfsEPdfLink
      });

    } catch (emissionErr) {
      // On Failure: Log to console, mark invoice as 'falha_emissao', leave webhook log processed as false
      console.error('NFS-e Emission failed. Transaction preserved. Details:', emissionErr.message);

      await supabaseAdmin
        .from('invoices')
        .update({
          status: 'falha_emissao',
          rps_number: rpsNumber
        })
        .eq('id', invoice.id);

      return json(res, 500, {
        error: 'Failed to issue NFS-e. Status set to falha_emissao for manual review.',
        details: emissionErr.message
      });
    }

  } catch (error) {
    console.error('Fatal webhook processing error:', error.message);
    return json(res, 400, { error: error instanceof Error ? error.message : 'Unexpected webhook error.' });
  }
}
