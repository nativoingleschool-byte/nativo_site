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

export default async function handler(req, res) {
  // Simple query secret for developer authorization
  if (req.query.secret !== 'antigravity_fix_9876') {
    return json(res, 403, { error: 'Forbidden' });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Find Gabriela Teotonio Bueno
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .ilike('full_name', '%Gabriela%Teotonio%');

    if (profileError || !profiles || profiles.length === 0) {
      return json(res, 404, { error: 'Gabriela Teotonio Bueno profile not found', details: profileError });
    }

    const student = profiles[0];
    const currentPeriod = '2026-07';

    // 2. Find highest rps_number in invoices
    const { data: highestInvoices, error: highestError } = await supabaseAdmin
      .from('invoices')
      .select('rps_number')
      .order('rps_number', { ascending: false })
      .limit(1);

    if (highestError) throw highestError;
    const highestRps = highestInvoices?.[0]?.rps_number || 0;
    const assumedRps = highestRps + 1;

    // 3. Check for existing invoice for Gabriela in 2026-07
    const { data: existingInvoices, error: checkError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('student_id', student.id)
      .eq('billing_period', currentPeriod);

    if (checkError) throw checkError;

    let invoice = existingInvoices?.[0];
    let created = false;

    if (!invoice) {
      // Create invoice record with the protocol returned from her successful request
      const { data: newInvoice, error: insertError } = await supabaseAdmin
        .from('invoices')
        .insert({
          student_id: student.id,
          status: 'pago',
          rps_number: assumedRps,
          protocolo_recebimento: 'RPS_20260710_20260710002.txt',
          billing_period: currentPeriod
        })
        .select('*')
        .single();

      if (insertError) throw insertError;
      invoice = newInvoice;
      created = true;

      // Update student status to 'em_dia'
      await supabaseAdmin
        .from('profiles')
        .update({ status_pagamento: 'em_dia' })
        .eq('id', student.id);
    }

    // 4. Force check status of the protocol
    let statusUpdate = {};
    if (invoice.protocolo_recebimento && !invoice.nfs_e_pdf_link) {
      try {
        const consultResult = await consultarBarueriNFSe(invoice.protocolo_recebimento);
        if (consultResult.status === 'concluido' && consultResult.nfs_e_pdf_link) {
          const { data: updatedInvoice, error: updateError } = await supabaseAdmin
            .from('invoices')
            .update({
              nfs_e_pdf_link: consultResult.nfs_e_pdf_link,
              status: 'emitida'
            })
            .eq('id', invoice.id)
            .select('*')
            .single();

          if (!updateError) {
            invoice = updatedInvoice;
            statusUpdate = { success: true, newStatus: 'emitida', pdf: consultResult.nfs_e_pdf_link };
          } else {
            statusUpdate = { success: false, error: updateError.message };
          }
        } else {
          statusUpdate = { success: false, status: consultResult.status, message: consultResult.message };
        }
      } catch (consultError) {
        statusUpdate = { success: false, error: consultError.message };
      }
    }

    return json(res, 200, {
      success: true,
      created_new_record: created,
      student: {
        id: student.id,
        name: student.full_name
      },
      invoice: {
        id: invoice.id,
        status: invoice.status,
        rps_number: invoice.rps_number,
        protocolo_recebimento: invoice.protocolo_recebimento,
        nfs_e_pdf_link: invoice.nfs_e_pdf_link
      },
      statusUpdate
    });

  } catch (error) {
    return json(res, 500, { error: error.message });
  }
}
