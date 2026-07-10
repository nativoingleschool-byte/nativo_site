import axios from 'axios';
import https from 'https';
import { XMLParser } from 'fast-xml-parser';
import { getBarueriHttpsAgentConfig } from '../../services/barueri/security.js';

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

export default async function handler(req, res) {
  if (req.query.secret !== 'antigravity_fix_9876') {
    return json(res, 403, { error: 'Forbidden' });
  }

  try {
    const im = process.env.BARUERI_INSCRICAO_MUNICIPAL || '4BZ5982';
    const cnpj = (process.env.BARUERI_CNPJ_PRESTADOR || '00000000000100').replace(/\D/g, '');
    const filename = 'ENV4BZ5985A7220260710070829.ERR';

    const innerXml = `<?xml version="1.0" encoding="utf-8"?>
<NFeLoteBaixarArquivo xmlns="http://www.barueri.sp.gov.br/nfe">
  <InscricaoMunicipal>${im}</InscricaoMunicipal>
  <CPFCNPJContrib>${cnpj}</CPFCNPJContrib>
  <NomeArqRetorno>${filename}</NomeArqRetorno>
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

    let base64Data = null;
    if (responseData) {
      const findBase64 = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.ArquivoRPSBase64) return String(obj.ArquivoRPSBase64);
        if (obj.arquivoRPSBase64) return String(obj.arquivoRPSBase64);
        for (const key of Object.keys(obj)) {
          const val = obj[key];
          if (val && typeof val === 'object') {
            const found = findBase64(val);
            if (found) return found;
          }
        }
        return null;
      };
      base64Data = findBase64(responseData);
    }

    let decodedContent = '';
    if (base64Data) {
      decodedContent = Buffer.from(base64Data, 'base64').toString('utf8');
    }

    return json(res, 200, {
      success: true,
      filename,
      raw_response: responseData,
      decoded: decodedContent
    });

  } catch (error) {
    return json(res, 500, { error: error.message, stack: error.stack });
  }
}
