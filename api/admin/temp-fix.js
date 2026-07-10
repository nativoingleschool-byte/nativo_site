import { createClient } from '@supabase/supabase-js';
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

    const today = new Date();
    const tzOffset = -3 * 60;
    const localTime = new Date(today.getTime() + tzOffset * 60 * 1000);
    const todayStr = localTime.toISOString().split('T')[0];

    const situations = ['-2', '-1', '0', '1', '2'];
    const results = {};

    const agentConfig = getBarueriHttpsAgentConfig();
    const agent = new https.Agent({
      pfx: agentConfig.pfx,
      passphrase: agentConfig.passphrase,
      rejectUnauthorized: false
    });

    const endpoint = process.env.BARUERI_SOAP_ENDPOINT || 'https://www.barueri.sp.gov.br/nfeservice/wsrps.asmx';
    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });

    for (const sit of situations) {
      const innerXml = `<?xml version="1.0" encoding="utf-8"?>
<NFeLoteListarArquivos xmlns="http://www.barueri.sp.gov.br/nfe">
  <InscricaoMunicipal>${im}</InscricaoMunicipal>
  <CPFCNPJContrib>${cnpj}</CPFCNPJContrib>
  <DataEnvioArq>${todayStr}</DataEnvioArq>
  <SituacaoArq>${sit}</SituacaoArq>
</NFeLoteListarArquivos>`;

      const soapAction = '"http://www.barueri.sp.gov.br/nfe/NFeLoteListarArquivos"';
      const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfe="http://www.barueri.sp.gov.br/nfe">
  <soapenv:Body>
    <nfe:NFeLoteListarArquivos>
      <nfe:VersaoSchema>1</nfe:VersaoSchema>
      <nfe:MensagemXML><![CDATA[${innerXml}]]></nfe:MensagemXML>
    </nfe:NFeLoteListarArquivos>
  </soapenv:Body>
</soapenv:Envelope>`;

      try {
        const response = await axios.post(endpoint, soapEnvelope, {
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': soapAction
          },
          httpsAgent: agent,
          timeout: 10000
        });

        const parsedResult = parser.parse(response.data);
        const envelope = parsedResult?.['soap:Envelope'] || parsedResult?.Envelope;
        const body = envelope?.['soap:Body'] || envelope?.Body;
        const responseData = body?.NFeLoteListarArquivosResult || body?.NFeLoteListarArquivosResponse || body;

        results[sit] = responseData;
      } catch (err) {
        results[sit] = { error: err.message };
      }
    }

    return json(res, 200, {
      success: true,
      today: todayStr,
      results
    });

  } catch (error) {
    return json(res, 500, { error: error.message, stack: error.stack });
  }
}
