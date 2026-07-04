import { createClient } from '@supabase/supabase-js';
import {
  buildHeaderRow,
  buildDetailRow,
  buildFooterRow,
  assembleRpsFile
} from './utils.js';
import { sendBarueriSoapRequest } from './soap.js';

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
    const { 
      invoice_id, 
      amount, 
      rps_number, 
      rps_serie, 
      codigo_servico, 
      discriminacao 
    } = req.body || {};

    if (!invoice_id) {
      return json(res, 400, { error: 'Missing invoice_id.' });
    }

    // 1. Fetch invoice and student profile details
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('*, profiles(*)')
      .eq('id', invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return json(res, 404, { error: 'Invoice or associated profile not found.' });
    }

    const student = invoice.profiles;
    if (!student || student.role !== 'student') {
      return json(res, 400, { error: 'Invoice is not linked to a valid student profile.' });
    }

    // Deduce value (from body or fallback to default value)
    const finalAmount = Number(amount || 340.00);
    
    // 2. Query atomic daily remessa sequence number via Supabase RPC
    const { data: remessaId, error: rpcError } = await supabaseAdmin.rpc('get_next_barueri_remessa');
    if (rpcError || !remessaId) {
      throw new Error(`Failed to generate atomic remessa ID: ${rpcError?.message || 'unknown error'}`);
    }

    // Determine RPS Number (body parameter, or fallback to timestamp-based sequence)
    const finalRpsNumber = rps_number || String(Math.floor(Date.now() / 1000)).slice(-10);
    const finalRpsSerie = rps_serie || process.env.BARUERI_RPS_SERIE || 'RPS';
    const finalCodigoServico = codigo_servico || process.env.BARUERI_CODIGO_SERVICO || '02685';
    const finalDiscriminacao = discriminacao || 'PRESTACAO DE SERVICOS PEDAGOGICOS - NATIVO ENGLISH SCHOOL';

    // Format current date: YYYYMMDD
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');

    // 3. Assemble Positional RPS file records (CRLF String Length Trap Safe)
    const headerRow = buildHeaderRow(
      process.env.BARUERI_INSCRICAO_MUNICIPAL || '1234567',
      remessaId
    );

    const detailRow = buildDetailRow({
      rpsSerie: finalRpsSerie,
      rpsNumero: finalRpsNumber,
      dataEmissao: todayStr,
      codigoServico: finalCodigoServico,
      valorServico: finalAmount,
      tomadorCpfCnpj: student.cpf || '00000000000',
      tomadorNome: student.full_name,
      tomadorLogradouro: student.logradouro || 'AVENIDA PRINCIPAL, 100',
      tomadorBairro: student.bairro || 'CENTRO',
      tomadorCidade: student.cidade || 'BARUERI',
      tomadorUf: student.uf || 'SP',
      tomadorCep: student.cep || '06401000',
      tomadorEmail: student.email,
      discriminacaoServico: finalDiscriminacao
    });

    const footerRow = buildFooterRow(
      3, // Header + Detail + Footer = 3 lines total
      finalAmount
    );

    const base64RpsPayload = assembleRpsFile(headerRow, detailRow, footerRow);

    // 4. Send SOAP request to Barueri Web Service
    const soapResult = await sendBarueriSoapRequest({
      inscricaoMunicipal: process.env.BARUERI_INSCRICAO_MUNICIPAL || '1234567',
      cpfCnpjContrib: process.env.BARUERI_CNPJ_PRESTADOR || '00000000000000',
      remessaId,
      arquivoRPSBase64: base64RpsPayload
    });

    // Generate Visual NFS-e URL Link
    const nfseUrl = `https://www.barueri.sp.gov.br/nfe/visualizar.aspx?inscricao=${process.env.BARUERI_INSCRICAO_MUNICIPAL || '1234567'}&rps=${finalRpsNumber}`;

    // Update invoice record in Supabase
    const { data: updatedInvoice, error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({
        nfse_url: nfseUrl
      })
      .eq('id', invoice_id)
      .select('*')
      .single();

    if (updateError) {
      throw new Error(`Failed to update database invoice: ${updateError.message}`);
    }

    return json(res, 200, {
      success: true,
      message: 'RPS file built and NFS-e generated successfully.',
      filename: soapResult.nomeArquivoRPS,
      remessaId,
      rpsNumber: finalRpsNumber,
      nfseUrl,
      soapResponse: soapResult.data || soapResult.message
    });

  } catch (error) {
    console.error('Barueri NFS-e Handler Error:', error);
    return json(res, 400, { error: error instanceof Error ? error.message : 'Unexpected server error.' });
  }
}
