import { createClient } from '@supabase/supabase-js';
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  try {
    // 1. Authenticate & Verify admin role
    const supabaseAdmin = await assertAdmin(req);

    const { student_id, billing_period } = req.body || {};
    if (!student_id) {
      return json(res, 400, { error: 'Missing student_id.' });
    }

    // Calculate current period in Brasilia Time (UTC-3)
    const today = new Date();
    const tzOffset = -3 * 60;
    const localTime = new Date(today.getTime() + tzOffset * 60 * 1000);
    const currentPeriod = billing_period || localTime.toISOString().substring(0, 7); // 'YYYY-MM'

    // 1.5 Check for duplicate invoice in the current period
    const { data: existingInvoice, error: checkError } = await supabaseAdmin
      .from('invoices')
      .select('id, nfs_e_pdf_link, protocolo_recebimento')
      .eq('student_id', student_id)
      .eq('billing_period', currentPeriod)
      .maybeSingle();

    if (checkError) {
      throw new Error(`Database validation failed: ${checkError.message}`);
    }

    if (existingInvoice && (existingInvoice.nfs_e_pdf_link || existingInvoice.protocolo_recebimento)) {
      return json(res, 409, { error: 'Nota fiscal já emitida ou em processamento para este aluno no período atual.' });
    }

    // 2. Fetch student details and check tuition_fee configuration
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

    // 3. Generate RPS Sequence number
    // Query the highest valid sequential RPS number from the database (< 10,000,000)
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
      // Fallback: If DB query fails or has no small sequence, use the database RPC but format it safely under 10,000,000
      const { data: rpsNumber, error: rpcRpsError } = await supabaseAdmin
        .rpc('get_next_barueri_rps');
      
      if (!rpcRpsError && rpsNumber) {
        const rpsStr = String(rpsNumber);
        const lastDigits = Number(rpsStr.slice(-5)); // Get last 5 digits (e.g. '12003' -> 12003)
        if (!isNaN(lastDigits) && lastDigits > 0) {
          finalRpsNumber = lastDigits;
        } else {
          finalRpsNumber = 1;
        }
      }
    }

    // 4. Invoke SOAP service to issue NFS-e and receive protocol
    const result = await issueBarueriNFSe(student, tuitionFee, finalRpsNumber);
    const isMockLink = typeof result === 'string' && result.startsWith('http');

    // 5. Create or update paid invoice record
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

    // 6. Update student payment status to 'em_dia'
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ status_pagamento: 'em_dia' })
      .eq('id', student.id);

    if (profileUpdateError) {
      console.error('Failed to update student payment status:', profileUpdateError.message);
    }

    return json(res, 200, {
      success: true,
      message: 'NFS-e issued and invoice recorded successfully.',
      invoice_id: invoice.id,
      rps_number: rpsNumber,
      nfs_e_pdf_link: invoice.nfs_e_pdf_link || null,
      protocolo_recebimento: invoice.protocolo_recebimento || null
    });

  } catch (error) {
    console.error('Manual NFS-e emission failed:', error.message);
    return json(res, 500, { error: error.message });
  }
}
