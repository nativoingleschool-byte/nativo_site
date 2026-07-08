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

const SCHOOL_IM = process.env.BARUERI_INSCRICAO_MUNICIPAL || '1234567';
const SCHOOL_CNPJ = process.env.BARUERI_CNPJ_PRESTADOR || '00.000.000/0001-00';
const RPS_SERIE = process.env.BARUERI_RPS_SERIE || 'RPS';
const CODIGO_SERVICO = process.env.BARUERI_CODIGO_SERVICO || '02685';
const DISCRIMINACAO = process.env.BARUERI_DISCRIMINACAO || 'PRESTACAO DE SERVICOS PEDAGOGICOS - NATIVO ENGLISH SCHOOL';

const getSupabaseAdmin = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase server environment variables are missing.');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
};

/**
 * Submits the positional layout batch to Barueri City Council Web Service via SOAP NFeLoteEnviarArquivo.
 * Decodes Digital Certificate .pfx from environment securely in-memory.
 *
 * @param {object} studentData - Student profile data from Supabase profiles table.
 * @param {number} amount - Final invoice amount.
 * @param {number|string} rpsNumber - Pre-generated unique sequential RPS identifier.
 * @returns {Promise<string>} The deterministic URL to view the generated NFS-e.
 */
export async function issueBarueriNFSe(studentData, amount, rpsNumber) {
  const supabaseAdmin = getSupabaseAdmin();

  // 1. Fetch daily batch remessa ID via Supabase RPC
  const { data: remessaId, error: rpcError } = await supabaseAdmin
    .rpc('get_next_barueri_remessa');

  if (rpcError || !remessaId) {
    throw new Error(`Failed to generate daily remessa ID sequence: ${rpcError?.message || 'unknown error'}`);
  }

  // Get current date in Brasilia Timezone (UTC-3)
  const today = new Date();
  const tzOffset = -3 * 60;
  const localTime = new Date(today.getTime() + tzOffset * 60 * 1000);
  const todayStr = localTime.toISOString().split('T')[0].replace(/-/g, '');

  // 2. Assemble Positional RPS file records
  // Header Payload must be exactly 25 characters before CRLF (\r\n)
  const headerRow = buildHeaderRow(
    SCHOOL_IM,
    remessaId
  );

  // Detail Payload must be exactly 1970 characters before CRLF (\r\n)
  const detailRow = buildDetailRow({
    rpsSerie: RPS_SERIE,
    rpsNumero: String(rpsNumber),
    dataEmissao: todayStr,
    codigoServico: CODIGO_SERVICO,
    valorServico: amount,
    tomadorCpfCnpj: studentData.cpf || '00000000000',
    tomadorNome: studentData.full_name,
    tomadorLogradouro: studentData.logradouro || 'AVENIDA PRINCIPAL, 100',
    tomadorBairro: studentData.bairro || 'CENTRO',
    tomadorCidade: studentData.cidade || 'BARUERI',
    tomadorUf: studentData.uf || 'SP',
    tomadorCep: studentData.cep || '06401000',
    tomadorEmail: studentData.email,
    discriminacaoServico: DISCRIMINACAO
  });

  // Footer Payload must be exactly 38 characters before CRLF (\r\n)
  const footerRow = buildFooterRow(
    3, // Total line count (Header + Detail + Footer)
    amount
  );

  // Convert assembled string file to Base64
  const base64RpsPayload = assembleRpsFile(headerRow, detailRow, footerRow);

  // 3. Dispatch SOAP request to Barueri Web Service
  const soapResult = await sendBarueriSoapRequest({
    inscricaoMunicipal: SCHOOL_IM,
    cpfCnpjContrib: SCHOOL_CNPJ.replace(/\D/g, ''),
    remessaId,
    arquivoRPSBase64: base64RpsPayload
  });

  if (soapResult.mock) {
    console.log(`[Mock NFS-e] Emitting in mock/sandbox mode for RPS ${rpsNumber}.`);
    return `https://receita.barueri.sp.gov.br/nfse/visualizar?id=MOCK-NF-${remessaId}&cnpj=${SCHOOL_CNPJ.replace(/\D/g, '')}&rps=${rpsNumber}`;
  }

  // 4. Response parsing and failure validation
  const responseText = typeof soapResult.data === 'string' ? soapResult.data : JSON.stringify(soapResult.data);
  
  if (
    responseText.includes('<Erro>') ||
    responseText.includes('<Codigo>') && (responseText.toLowerCase().includes('erro') || responseText.toLowerCase().includes('falha') || responseText.toLowerCase().includes('rejeitado'))
  ) {
    throw new Error(`Barueri SOAP Gateway rejected RPS upload: ${responseText}`);
  }

  // Generate deterministic URL to view the generated NFS-e
  const cleanIm = SCHOOL_IM.replace(/\D/g, '');
  return `https://www.barueri.sp.gov.br/nfe/visualizar.aspx?inscricao=${cleanIm}&rps=${rpsNumber}`;
}
