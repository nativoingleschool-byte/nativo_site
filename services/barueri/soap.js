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
  <ArquivoRPSBase64>${arquivoRPSBase64}</ArquivoRPSBase64>
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

/**
 * Sends a status query SOAP request to check the processing situation of a previously submitted batch.
 * @param {string} inscricaoMunicipal - Municipal registration number.
 * @param {string} cpfCnpjContrib - CNPJ or CPF of the contributor.
 * @param {string} protocolo - The filename or reception protocol.
 * @returns {Promise<{success: boolean, data: any}>}
 */
export async function sendBarueriStatusRequest(inscricaoMunicipal, cpfCnpjContrib, protocolo) {
  const hasCerts = hasBarueriCredentials();
  if (!hasCerts) {
    console.warn('PFX Credentials are not set. Returning mock status response.');
    return {
      success: true,
      mock: true,
      data: { status: 'concluido', SituacaoArq: '1', NomeArqRetorno: 'MOCK_RET.TXT' }
    };
  }

  const innerXml = `<?xml version="1.0" encoding="utf-8"?>
<NFeLoteStatusArquivo xmlns="http://www.barueri.sp.gov.br/nfe">
  <InscricaoMunicipal>${inscricaoMunicipal}</InscricaoMunicipal>
  <CPFCNPJContrib>${cpfCnpjContrib}</CPFCNPJContrib>
  <ProtocoloRemessa>${protocolo}</ProtocoloRemessa>
</NFeLoteStatusArquivo>`;

  const soapAction = '"http://www.barueri.sp.gov.br/nfe/NFeLoteStatusArquivo"';
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfe="http://www.barueri.sp.gov.br/nfe">
  <soapenv:Body>
    <nfe:NFeLoteStatusArquivo>
      <nfe:VersaoSchema>1</nfe:VersaoSchema>
      <nfe:MensagemXML><![CDATA[${innerXml}]]></nfe:MensagemXML>
    </nfe:NFeLoteStatusArquivo>
  </soapenv:Body>
</soapenv:Envelope>`;

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
      timeout: 30000
    });

    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });
    const parsedResult = parser.parse(response.data);
    const envelope = parsedResult?.['soap:Envelope'] || parsedResult?.Envelope;
    const body = envelope?.['soap:Body'] || envelope?.Body;
    const responseData = body?.NFeLoteStatusArquivoResult || body?.NFeLoteStatusArquivoResponse || body;

    if (!responseData) {
      throw new Error(`Resposta SOAP de status inválida: ${JSON.stringify(parsedResult)}`);
    }

    return { success: true, data: responseData };
  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('Barueri SOAP status failure:', errorMsg);
    throw new Error(`Barueri SOAP Status Error: ${errorMsg}`);
  }
}

/**
 * Sends a request to download the return processing file.
 * @param {string} inscricaoMunicipal - Municipal registration number.
 * @param {string} cpfCnpjContrib - CNPJ or CPF of the contributor.
 * @param {string} nomeArqRetorno - Filename of the return file.
 * @returns {Promise<{success: boolean, data: any}>}
 */
export async function sendBarueriBaixarRequest(inscricaoMunicipal, cpfCnpjContrib, nomeArqRetorno) {
  const hasCerts = hasBarueriCredentials();
  if (!hasCerts) {
    console.warn('PFX Credentials are not set. Returning mock download response.');
    return {
      success: true,
      mock: true,
      data: {
        ArquivoRPSBase64: Buffer.from("1HEADER_INFO_MOCK\n2MOCK 99999                      MOCK-VERIFICATION-CODE  \n9FOOTER_INFO_MOCK\n").toString('base64')
      }
    };
  }

  const innerXml = `<?xml version="1.0" encoding="utf-8"?>
<NFeLoteBaixarArquivo xmlns="http://www.barueri.sp.gov.br/nfe">
  <InscricaoMunicipal>${inscricaoMunicipal}</InscricaoMunicipal>
  <CPFCNPJContrib>${cpfCnpjContrib}</CPFCNPJContrib>
  <NomeArqRetorno>${nomeArqRetorno}</NomeArqRetorno>
</NFeLoteBaixarArquivo>`;

  const soapAction = '"http://www.barueri.sp.gov.br/nfe/NFeLoteBaixarArquivo"';
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfe="http://www.barueri.sp.gov.br/nfe">
  <soapenv:Body>
    <nfe:NFeLoteBaixarArquivo>
      <nfe:VersaoSchema>1</nfe:VersaoSchema>
      <nfe:MensagemXML><![CDATA[${innerXml}]]></nfe:MensagemXML>
    </nfe:NFeLoteBaixarArquivo>
  </soapenv:Body>
</soapenv:Envelope>`;

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
      timeout: 30000
    });

    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });
    const parsedResult = parser.parse(response.data);
    const envelope = parsedResult?.['soap:Envelope'] || parsedResult?.Envelope;
    const body = envelope?.['soap:Body'] || envelope?.Body;
    const responseData = body?.NFeLoteBaixarArquivoResult || body?.NFeLoteBaixarArquivoResponse || body;

    if (!responseData) {
      throw new Error(`Resposta SOAP de download inválida: ${JSON.stringify(parsedResult)}`);
    }

    return { success: true, data: responseData };
  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('Barueri SOAP download failure:', errorMsg);
    throw new Error(`Barueri SOAP Download Error: ${errorMsg}`);
  }
}
