import { XMLParser } from 'fast-xml-parser';
import { sendBarueriSoapRequest } from './soap.js';

const SCHOOL_IM = process.env.BARUERI_INSCRICAO_MUNICIPAL || '1234567';

/**
 * Submits the ABRASF XML payload to Barueri City Council Web Service via SOAP.
 *
 * @param {object} studentData - Student profile data from Supabase profiles table.
 * @param {number} amount - Final invoice amount.
 * @param {number|string} rpsNumber - Pre-generated unique sequential RPS identifier.
 * @returns {Promise<string>} The deterministic URL to view the generated NFS-e.
 */
export async function issueBarueriNFSe(studentData, amount, rpsNumber) {
  // 1. Dispatch SOAP request to Barueri Web Service
  const soapResult = await sendBarueriSoapRequest({
    student: studentData,
    amount,
    rpsNumber
  });

  if (soapResult.mock) {
    console.log(`[Mock NFS-e] Emitting in mock/sandbox mode for RPS ${rpsNumber}.`);
    return soapResult.nfs_e_pdf_link;
  }

  // 2. Response parsing and failure validation
  const responseData = soapResult.data;
  let innerXml = responseData;
  if (typeof responseData === 'object') {
    innerXml = responseData.GerarNfseResult || responseData.GerarNfseResponse || responseData.output || JSON.stringify(responseData);
  }

  // Parse inner xml if it's a string containing xml tags
  let parsedInner = {};
  if (typeof innerXml === 'string' && innerXml.trim().startsWith('<')) {
    try {
      const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });
      parsedInner = parser.parse(innerXml);
    } catch (e) {
      console.warn('Failed to parse inner response XML, fallback to raw response parsing:', e.message);
      parsedInner = { raw: innerXml };
    }
  } else {
    parsedInner = responseData;
  }

  // 3. Robust Error Extraction (<ListaMensagemRetorno> or <Mensagem> or <Erro>)
  const findErrorMessage = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    
    // Look for ListaMensagemRetorno
    const lista = obj.ListaMensagemRetorno || obj.EnviarLoteRpsResposta?.ListaMensagemRetorno || obj.GerarNfseResposta?.ListaMensagemRetorno;
    if (lista) {
      const retorno = lista.MensagemRetorno;
      if (Array.isArray(retorno)) {
        return retorno.map(r => `${r.Codigo || ''}: ${r.Mensagem || ''} ${r.Correcao ? `(Correção: ${r.Correcao})` : ''}`).join(' | ');
      } else if (retorno) {
        return `${retorno.Codigo || ''}: ${retorno.Mensagem || ''} ${retorno.Correcao ? `(Correção: ${retorno.Correcao})` : ''}`;
      }
    }
    
    // Check specific keys
    if (obj.Mensagem) return typeof obj.Mensagem === 'object' ? JSON.stringify(obj.Mensagem) : String(obj.Mensagem);
    if (obj.mensagem) return typeof obj.mensagem === 'object' ? JSON.stringify(obj.mensagem) : String(obj.mensagem);
    if (obj.Message) return String(obj.Message);
    if (obj.Erro) return typeof obj.Erro === 'object' ? JSON.stringify(obj.Erro) : String(obj.Erro);
    if (obj.erro) return typeof obj.erro === 'object' ? JSON.stringify(obj.erro) : String(obj.erro);
    
    // Recursively look in child objects
    for (const key of Object.keys(obj)) {
      if (obj[key] && typeof obj[key] === 'object') {
        const msg = findErrorMessage(obj[key]);
        if (msg) return msg;
      }
    }
    return null;
  };

  const errorMsg = findErrorMessage(parsedInner);
  if (errorMsg) {
    throw new Error(`Prefeitura rejeitou a NFS-e: ${errorMsg}`);
  }

  // In case raw response text contains clear error signatures
  const responseText = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
  if (
    responseText.includes('<Erro>') ||
    (responseText.includes('<Codigo>') && (responseText.toLowerCase().includes('erro') || responseText.toLowerCase().includes('falha') || responseText.toLowerCase().includes('rejeitado')))
  ) {
    throw new Error(`Prefeitura rejeitou a NFS-e (validação textual): ${responseText}`);
  }

  // 4. Extract Real PDF Link (NFS-e details: Number and Verification Code)
  const findNfseDetails = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    
    // Look for standard ABRASF tags
    const nfse = obj.Nfse || obj.CompNfse || obj.GerarNfseResposta?.CompNfse?.Nfse || obj.GerarNfseResposta?.Nfse;
    if (nfse && nfse.InfNfse) {
      return {
        numero: nfse.InfNfse.Numero,
        codigoVerificacao: nfse.InfNfse.CodigoVerificacao
      };
    }
    
    // Fallback: search keys recursively
    if (obj.Numero && obj.CodigoVerificacao) {
      return {
        numero: obj.Numero,
        codigoVerificacao: obj.CodigoVerificacao
      };
    }
    
    for (const key of Object.keys(obj)) {
      if (obj[key] && typeof obj[key] === 'object') {
        const res = findNfseDetails(obj[key]);
        if (res) return res;
      }
    }
    return null;
  };

  const nfseDetails = findNfseDetails(parsedInner);
  const cleanIm = SCHOOL_IM.replace(/\D/g, '');

  if (!nfseDetails || !nfseDetails.numero) {
    console.warn('Could not locate standard Nfse structure in response. Response:', JSON.stringify(parsedInner));
    // Generates a fallback URL with RPS number
    return `https://www.barueri.sp.gov.br/nfe/visualizar.aspx?inscricao=${cleanIm}&rps=${rpsNumber}`;
  }

  // Returns precise URL to view generated NFS-e
  return `https://www.barueri.sp.gov.br/nfe/visualizar.aspx?inscricao=${cleanIm}&nota=${nfseDetails.numero}&codVerificacao=${nfseDetails.codigoVerificacao || ''}`;
}
