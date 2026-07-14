/**
 * Helper to strip accents and convert to ASCII uppercase.
 * Essential for legacy Brazilian municipal services.
 */
export function normalizeText(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^\x20-\x7E]/g, '')    // Remove non-printable ASCII
    .toUpperCase();
}

/**
 * Align and pad string variables to fixed widths.
 * Numeric: Right-aligned, zero-padded.
 * Numeric String (CPF, CNPJ, CEP): Non-digits removed, right-aligned, zero-padded.
 * Text: Left-aligned, space-padded, normalized to ASCII uppercase.
 */
export function generatePositionalString(value, type, length) {
  let valStr = '';

  if (type === 'numeric') {
    // Treat as float/cents: Math.round(value * 100)
    const cents = Math.round(Number(value || 0) * 100);
    valStr = String(cents);
    if (valStr.length > length) {
      valStr = valStr.substring(valStr.length - length); // Truncate from left
    }
    return valStr.padStart(length, '0');
  } 
  
  if (type === 'numeric_string') {
    // Strip non-digits
    valStr = String(value || '').replace(/\D/g, '');
    if (valStr.length > length) {
      valStr = valStr.substring(0, length);
    }
    return valStr.padStart(length, '0');
  }

  // Default: text
  valStr = normalizeText(String(value || ''));
  if (valStr.length > length) {
    valStr = valStr.substring(0, length);
  }
  return valStr.padEnd(length, ' ');
}

/**
 * Formats Service Discrimination text.
 * Legacy Barueri rules specify "|" as a visual break every 100 characters.
 */
export function formatDiscriminacao(text) {
  const normalized = normalizeText(text || '');
  const words = normalized.split(' ');
  let lines = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= 100) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      lines.push(currentLine.padEnd(100, ' '));
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine.padEnd(100, ' '));
  }
  
  let result = lines.slice(0, 10).join('|');
  return result.padEnd(1000, ' ');
}

/**
 * Header Row (Type 1) - Payload must be exactly 25 characters.
 */
export function buildHeaderRow(inscricaoMunicipal, remessaId) {
  const payload = 
    generatePositionalString('1', 'text', 1) +
    generatePositionalString(inscricaoMunicipal, 'text', 7) +
    generatePositionalString('PMB004', 'text', 6) +
    generatePositionalString(remessaId, 'numeric_string', 11);

  if (payload.length !== 25) {
    throw new Error(`Header payload length mismatch: expected 25, got ${payload.length}`);
  }

  return payload + '\r\n';
}

/**
 * Detail Row (Type 2) - Payload must be exactly 1970 characters.
 */
export function buildDetailRow(data) {
  // Determine if CPF (1) or CNPJ (2)
  const cleanedDoc = String(data.tomadorCpfCnpj || '').replace(/\D/g, '');
  const tipoDoc = cleanedDoc.length > 11 ? '2' : '1';

  let street = data.tomadorLogradouro || '';
  let number = 'SN';
  let complement = '';

  const commaIndex = street.lastIndexOf(',');
  if (commaIndex !== -1) {
    const rest = street.substring(commaIndex + 1).trim();
    street = street.substring(0, commaIndex).trim();
    
    const hyphenIndex = rest.indexOf('-');
    if (hyphenIndex !== -1) {
      number = rest.substring(0, hyphenIndex).trim() || 'SN';
      complement = rest.substring(hyphenIndex + 1).trim();
    } else {
      number = rest || 'SN';
    }
  }

  const payload =
    generatePositionalString('2', 'text', 1) +                        // pos 1: Tipo do Registro (2)
    generatePositionalString('RPS', 'text', 5) +                      // pos 2-6: Tipo do RPS (size 5, e.g. "RPS  ")
    generatePositionalString(data.rpsSerie, 'text', 4) +              // pos 7-10: Série do RPS (size 4)
    generatePositionalString('', 'text', 5) +                         // pos 11-15: Série da NF-e (size 5, blank for non-special regime)
    generatePositionalString(data.rpsNumero, 'numeric_string', 10) +  // pos 16-25: Número do RPS (size 10)
    generatePositionalString(data.dataEmissao, 'numeric_string', 8) + // pos 26-33: Data de Emissão (size 8, YYYYMMDD)
    generatePositionalString(data.horaEmissao, 'numeric_string', 6) + // pos 34-39: Hora de Emissão (size 6, HHMMSS)
    generatePositionalString('E', 'text', 1) +                        // pos 40: Situação do RPS (size 1, "E")
    generatePositionalString('', 'text', 202) +                       // pos 41-242: blank (size 202)
    generatePositionalString(data.codigoServico, 'numeric_string', 9) + // pos 243-251: Código do Serviço Prestado (size 9)
    generatePositionalString('1', 'text', 1) +                        // pos 252: Local da Prestação do Serviço (1 = no Município, size 1)
    generatePositionalString('', 'text', 205) +                       // pos 253-457: blank (size 205)
    generatePositionalString('1', 'numeric_string', 6) + // Qtd Serviço = 1, pos 458-463
    generatePositionalString(data.valorServico, 'numeric', 15) + // pos 464-478
    generatePositionalString(0, 'numeric', 5) + // Alíquota Fora Município = 0, pos 479-483 (PDF layout size 5)
    generatePositionalString(0, 'numeric', 15) + // Valor Total Retenções = R$0, pos 484-498
    generatePositionalString('2', 'text', 1) + // pos 499: Tomador Brasileiro
    generatePositionalString('', 'text', 4) + // blank pos 500-503
    generatePositionalString(tipoDoc, 'text', 1) + // pos 504
    generatePositionalString(cleanedDoc, 'numeric_string', 14) + // pos 505-518
    generatePositionalString(data.tomadorNome, 'text', 60) + // pos 519-578
    generatePositionalString(street, 'text', 75) + // pos 579-653
    generatePositionalString(number, 'text', 9) + // pos 654-662 (PDF layout size 9)
    generatePositionalString(complement, 'text', 30) + // pos 663-692 (PDF layout size 30)
    generatePositionalString(data.tomadorBairro, 'text', 40) + // pos 693-732 (PDF layout size 40)
    generatePositionalString(data.tomadorCidade, 'text', 40) + // pos 733-772 (PDF layout size 40)
    generatePositionalString(data.tomadorUf, 'text', 2) + // pos 773-774 (PDF layout size 2)
    generatePositionalString(data.tomadorCep, 'numeric_string', 8) + // pos 775-782 (PDF layout size 8)
    generatePositionalString(data.tomadorEmail, 'text', 152) + // pos 783-934 (PDF layout size 152)
    generatePositionalString('', 'text', 36) + // blank pos 935-970 (PDF layout size 36)
    formatDiscriminacao(data.discriminacaoServico); // pos 971-1970

  if (payload.length !== 1970) {
    throw new Error(`Detail payload length mismatch: expected 1970, got ${payload.length}`);
  }

  return payload + '\r\n';
}

/**
 * Footer Row (Type 9) - Payload must be exactly 38 characters.
 */
export function buildFooterRow(totalLines, totalValue) {
  const payload =
    generatePositionalString('9', 'text', 1) +
    generatePositionalString(totalLines, 'numeric_string', 7) +
    generatePositionalString(totalValue, 'numeric', 15) +
    generatePositionalString(0, 'numeric', 15);

  if (payload.length !== 38) {
    throw new Error(`Footer payload length mismatch: expected 38, got ${payload.length}`);
  }

  return payload + '\r\n';
}

/**
 * Detail Row (Type 4) - ADN / Reforma Tributária complementary record.
 * Mandatory 1:1 with each Type 2 row in PMB004 layout.
 * Payload must be exactly 1970 characters.
 */
export function buildTaxRow(data = {}) {
  const optanteSN = process.env.BARUERI_OPTANTE_SIMPLES || data.optanteSimples || '1'; // 1=Não Optante, 2=MEI, 3=ME/EPP
  const regimeApuracao = optanteSN === '3' ? (data.regimeApuracao || '1') : '0';
  const codigoCidadeIBGE = data.codigoCidadeIBGE || '3505708'; // Barueri local of prestação
  const tomadorCidadeIBGE = data.tomadorCidadeIBGE || '3505708'; // Student city IBGE code (default Barueri)

  const payload =
    generatePositionalString('4', 'text', 1) +             // pos 1: Tipo do Registro
    generatePositionalString(optanteSN, 'text', 1) +        // pos 2: Optante Simples Nacional
    generatePositionalString(regimeApuracao, 'text', 1) +   // pos 3: Regime Apuração Simples
    generatePositionalString('', 'text', 3) +               // pos 4-6: reserved / country of service (blank for BR)
    generatePositionalString(codigoCidadeIBGE, 'numeric_string', 7) + // pos 7-13: Código Cidade IBGE (prestação)
    generatePositionalString(tomadorCidadeIBGE, 'numeric_string', 7) + // pos 14-20: Código Cidade do Tomador
    generatePositionalString('', 'text', 40) +              // pos 21-60: NIF for foreign tomador (blank for BR)
    generatePositionalString('122051900', 'numeric_string', 9) + // pos 61-69: Código NBS (1.22.05.19.00: educational/training services)
    generatePositionalString('', 'text', 11) +              // pos 70-80: CEP tomador estrangeiro (blank)
    generatePositionalString('', 'text', 60) +              // pos 81-140: Estado/Província/Região tomador estrangeiro (blank)
    generatePositionalString('0', 'text', 1) +              // pos 141: Vínculo entre as partes (0 = Sem vínculo)
    generatePositionalString('', 'text', 30) +              // pos 142-171: reservado (blank)
    generatePositionalString('', 'text', 11) +              // pos 172-182: CEP do serviço no exterior (blank)
    generatePositionalString('', 'text', 60) +              // pos 183-242: Estado/Província/Região serviço exterior (blank)
    generatePositionalString('', 'text', 255) +             // pos 243-497: Nome do evento (blank)
    generatePositionalString('', 'text', 8) +               // pos 498-505: Data início evento (blank)
    generatePositionalString('', 'text', 8) +               // pos 506-513: Data fim evento (blank)
    generatePositionalString('', 'text', 1) +               // pos 514: Código justificativa cancelamento/substituição (blank)
    generatePositionalString('030101', 'numeric_string', 6) + // pos 515-520: Código Indicador da operação de fornecimento
    generatePositionalString('000001', 'numeric_string', 6) + // pos 521-526: Código de Classificação Tributária do IBS e da CBS (Tributado integralmente)
    generatePositionalString('000', 'numeric_string', 3) +  // pos 527-529: Código de Situação Tributária IBS CBS
    generatePositionalString('0', 'text', 1) +              // pos 530: Operação de uso ou consumo pessoal (0 = Não)
    generatePositionalString('0', 'text', 1);               // pos 531: Indicador do Destinatário do Serviço (0 = Tomador)

  if (payload.length !== 531) {
    throw new Error(`Type4 (TaxRow) payload length mismatch: expected 531, got ${payload.length}`);
  }

  return payload + '\r\n';
}

/**
 * Combines all records into the full RPS string buffer and returns the Base64 representation.
 * Flatten and split any inputs by newline, then join strictly using CRLF (\r\n) to guarantee 2-byte line endings.
 */
export function assembleRpsFile(...rows) {
  const flatRows = rows
    .flatMap(row => (typeof row === 'string' ? row.split(/\r?\n/) : []))
    .filter(row => row.length > 0);
  
  const fileContent = flatRows.join('\r\n') + '\r\n';
  return Buffer.from(fileContent, 'utf-8').toString('base64');
}
