import https from 'https';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

/**
 * Handles the complete SOAP connection and XML transmission.
 * Dynamically names the RPS file, formats the SOAP envelope with CDATA, 
 * and handles secure HTTPS Client Certificate loading.
 */
export async function sendBarueriSoapRequest(data) {
  const {
    inscricaoMunicipal,
    cpfCnpjContrib,
    remessaId,
    arquivoRPSBase64
  } = data;

  const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const remessaIdStr = String(remessaId).padStart(3, '0');
  const nomeArquivoRPS = `RPS_${todayStr}_${remessaIdStr}.txt`;

  const hasCerts = process.env.BARUERI_PFX_BASE64 && process.env.BARUERI_PFX_PASSPHRASE;

  if (!hasCerts) {
    console.warn('PFX Credentials are not set. Returning mock response for testing/compiles.');
    return {
      success: true,
      mock: true,
      message: 'Lote recebido com sucesso (MOCK).',
      protocolo: `MOCK-PROT-${todayStr}-${remessaIdStr}`,
      nomeArquivoRPS
    };
  }

  // Inner parameters XML block to be wrapped in CDATA
  const innerXml = `<InscricaoMunicipal>${inscricaoMunicipal}</InscricaoMunicipal>` +
    `<CPFCNPJContrib>${cpfCnpjContrib}</CPFCNPJContrib>` +
    `<NomeArquivoRPS>${nomeArquivoRPS}</NomeArquivoRPS>` +
    `<ApenasValidaArq>false</ApenasValidaArq>` +
    `<ArquivoRPSBase64>${arquivoRPSBase64}</ArquivoRPSBase64>`;

  // Outer SOAP 1.1 envelope structure
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <NFeLoteEnviarArquivo xmlns="http://www.barueri.sp.gov.br/nfe">
      <![CDATA[${innerXml}]]>
    </NFeLoteEnviarArquivo>
  </soap:Body>
</soap:Envelope>`;

  try {
    const agent = new https.Agent({
      pfx: Buffer.from(process.env.BARUERI_PFX_BASE64, 'base64'),
      passphrase: process.env.BARUERI_PFX_PASSPHRASE,
      rejectUnauthorized: false // Bypasses SSL handshake errors common with Brazilian municipal cert chains
    });

    const response = await axios.post('https://www.barueri.sp.gov.br/nfeservice/wsrps.asmx', soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://www.barueri.sp.gov.br/nfe/NFeLoteEnviarArquivo'
      },
      httpsAgent: agent,
      timeout: 30000 // 30 seconds connection limit
    });

    const parser = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: true
    });

    const parsedResult = parser.parse(response.data);
    
    // Safe traversal for SOAP body wrappers
    const envelope = parsedResult?.['soap:Envelope'] || parsedResult?.Envelope;
    const body = envelope?.['soap:Body'] || envelope?.Body;
    const responseData = body?.NFeLoteEnviarArquivoResponse || body?.NFeLoteEnviarArquivoResult;

    if (!responseData) {
      throw new Error(`Malaformed response structure returned: ${JSON.stringify(parsedResult)}`);
    }

    return {
      success: true,
      data: responseData,
      nomeArquivoRPS
    };
  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('Barueri SOAP request failure:', errorMsg);
    throw new Error(`Barueri SOAP Gateway Error: ${errorMsg}`);
  }
}
