import https from 'https';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { hasBarueriCredentials, getBarueriHttpsAgentConfig } from './security.js';

/**
 * Handles the complete SOAP connection and XML transmission.
 * Packages the Base64 positional text file layout inside the custom XML wrapper,
 * wraps it in a SOAP envelope, and handles secure HTTPS Client Certificate loading.
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

  const hasCerts = hasBarueriCredentials();

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

  // 1. Build the inner XML document using template string
  const innerXml = `<?xml version="1.0" encoding="utf-8"?>
<NFeLoteEnviarArquivo xmlns="http://www.barueri.sp.gov.br/nfe">
  <InscricaoMunicipal>${inscricaoMunicipal}</InscricaoMunicipal>
  <CPFCNPJContrib>${cpfCnpjContrib}</CPFCNPJContrib>
  <NomeArquivoRPS>${nomeArquivoRPS}</NomeArquivoRPS>
  <ApenasValidaArq>false</ApenasValidaArq>
  <ArquivoRPS>${arquivoRPSBase64}</ArquivoRPS>
</NFeLoteEnviarArquivo>`;

  // 2. Wrap XML in SOAP envelope
  const soapAction = '"http://www.barueri.sp.gov.br/nfe/NFeLoteEnviarArquivo"';
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfe="http://www.barueri.sp.gov.br/nfe">
  <soapenv:Body>
    <nfe:NFeLoteEnviarArquivo>
      <nfe:VersaoSchema>1</nfe:VersaoSchema>
      <nfe:MensagemXML><![CDATA[${innerXml}]]></nfe:MensagemXML>
    </nfe:NFeLoteEnviarArquivo>
  </soapenv:Body>
</soapenv:Envelope>`;

  // 3. Send POST HTTPS request mTLS
  const agentConfig = getBarueriHttpsAgentConfig();
  const agent = new https.Agent({
    pfx: agentConfig.pfx,
    passphrase: agentConfig.passphrase,
    rejectUnauthorized: false
  });

  const endpoint = process.env.BARUERI_SOAP_ENDPOINT || 'https://www.barueri.sp.gov.br/nfeservice/wsrps.asmx';

  try {
    const response = await axios.post(endpoint, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': soapAction
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
    const responseData = body?.NFeLoteEnviarArquivoResult || body?.NFeLoteEnviarArquivoResponse || body;

    if (!responseData) {
      throw new Error(`Resposta SOAP inválida ou malformada: ${JSON.stringify(parsedResult)}`);
    }

    return {
      success: true,
      data: responseData
    };
  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('Barueri SOAP request failure:', errorMsg);
    throw new Error(`Barueri SOAP Gateway Error: ${errorMsg}`);
  }
}
