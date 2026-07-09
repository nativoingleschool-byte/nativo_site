import https from 'https';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { SignedXml } from 'xml-crypto';
import { create } from 'xmlbuilder2';
import { hasBarueriCredentials, getBarueriHttpsAgentConfig, getBarueriKeys } from './security.js';

/**
 * Handles the complete SOAP connection and XML transmission.
 * Formats the SOAP envelope using xmlbuilder2, signs the payload using xml-crypto (XMLDSig),
 * and handles secure HTTPS Client Certificate loading.
 */
export async function sendBarueriSoapRequest(data) {
  const {
    student,
    amount,
    rpsNumber
  } = data;

  const hasCerts = hasBarueriCredentials();

  const schoolIm = process.env.BARUERI_INSCRICAO_MUNICIPAL || '1234567';
  const schoolCnpj = (process.env.BARUERI_CNPJ_PRESTADOR || '00.000.000/0001-00').replace(/\D/g, '');
  const rpsSerie = process.env.BARUERI_RPS_SERIE || 'RPS';
  const codigoServico = process.env.BARUERI_CODIGO_SERVICO || '02685';
  const discriminacao = process.env.BARUERI_DISCRIMINACAO || 'PRESTACAO DE SERVICOS PEDAGOGICOS - NATIVO ENGLISH SCHOOL';

  if (!hasCerts) {
    console.warn('PFX Credentials are not set. Returning mock response for testing/compiles.');
    const remessaId = Math.floor(Math.random() * 100000);
    return {
      success: true,
      mock: true,
      message: 'Lote recebido com sucesso (MOCK).',
      nfs_e_pdf_link: `https://receita.barueri.sp.gov.br/nfse/visualizar?id=MOCK-NF-${remessaId}&cnpj=${schoolCnpj}&rps=${rpsNumber}`
    };
  }

  // 1. Get Certificate & Private Key PEM
  const { privateKeyPem, certPem } = getBarueriKeys();
  const cleanCert = certPem
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/[\r\n]/g, '');

  // Get current date in ISO format YYYY-MM-DDThh:mm:ss
  const today = new Date();
  const tzOffset = -3 * 60;
  const localTime = new Date(today.getTime() + tzOffset * 60 * 1000);
  const dataEmissao = localTime.toISOString().substring(0, 19);

  // 2. Build the XML document using xmlbuilder2
  const rpsId = `rps_${rpsNumber}`;
  const xmlObj = {
    EnviarLoteRpsEnvio: {
      '@xmlns': 'http://www.abrasf.org.br/nfse.xsd',
      LoteRps: {
        '@Id': `lote_${rpsNumber}`,
        Numero: rpsNumber,
        Cnpj: schoolCnpj,
        InscricaoMunicipal: schoolIm,
        QuantidadeRps: '1',
        ListaRps: {
          Rps: {
            InfDeclaracaoPrestacaoServico: {
              '@Id': rpsId,
              Rps: {
                IdentificacaoRps: {
                  Numero: rpsNumber,
                  Serie: rpsSerie,
                  Tipo: '1'
                },
                DataEmissao: dataEmissao,
                Status: '1'
              },
              Servico: {
                Valores: {
                  ValorServicos: amount.toFixed(2),
                  Aliquota: '0.02' // Default 2% ISS
                },
                CodigoTributacaoMunicipio: codigoServico,
                Discriminacao: discriminacao,
                MunicipioPrestacaoServico: '3505708' // Barueri IBGE Code
              },
              Prestador: {
                Cnpj: schoolCnpj,
                InscricaoMunicipal: schoolIm
              },
              Tomador: {
                IdentificacaoTomador: {
                  CpfCnpj: {
                    Cpf: (student.cpf || '00000000000').replace(/\D/g, '')
                  },
                  RazaoSocial: student.full_name
                },
                Endereco: {
                  Logradouro: student.logradouro || 'AVENIDA PRINCIPAL, 100',
                  Bairro: student.bairro || 'CENTRO',
                  CodigoMunicipio: '3505708',
                  Uf: student.uf || 'SP',
                  Cep: (student.cep || '06401000').replace(/\D/g, '')
                },
                Contato: {
                  Email: student.email
                }
              }
            }
          }
        }
      }
    }
  };

  const xmlDoc = create(xmlObj).end({ prettyPrint: false });

  // 3. Sign the XML Document using xml-crypto
  const sig = new SignedXml();
  sig.addReference(
    `//*[@Id='${rpsId}']`,
    [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/REC-xml-c14n-20010315"
    ],
    "http://www.w3.org/2000/09/xmldsig#sha1"
  );
  sig.signingKey = privateKeyPem;
  sig.keyInfoProvider = {
    getKeyInfo: () => `<X509Data><X509Certificate>${cleanCert}</X509Certificate></X509Data>`
  };
  sig.computeSignature(xmlDoc);
  const signedXml = sig.getSignedXml();

  // 4. Wrap signed XML in SOAP envelope
  const soapAction = '"http://www.barueri.sp.gov.br/nfe/NFeLoteEnviarArquivo"';
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfe="http://www.barueri.sp.gov.br/nfe">
  <soapenv:Body>
    <nfe:NFeLoteEnviarArquivo>
      <nfe:VersaoSchema>1</nfe:VersaoSchema>
      <nfe:MensagemXML><![CDATA[${signedXml}]]></nfe:MensagemXML>
    </nfe:NFeLoteEnviarArquivo>
  </soapenv:Body>
</soapenv:Envelope>`;

  // 5. Send POST HTTPS request mTLS
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
