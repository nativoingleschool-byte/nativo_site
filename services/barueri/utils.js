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
  const chunks = [];
  for (let i = 0; i < normalized.length; i += 100) {
    chunks.push(normalized.substring(i, i + 100));
  }
  
  let result = chunks.join('|');
  if (result.length > 1000) {
    result = result.substring(0, 1000);
  } else {
    result = result.padEnd(1000, ' ');
  }
  return result;
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

  const payload =
    generatePositionalString('2', 'text', 1) +
    generatePositionalString('RPS  ', 'text', 5) +
    generatePositionalString(data.rpsSerie, 'text', 4) +
    generatePositionalString('', 'text', 5) + // blank pos 11-15
    generatePositionalString(data.rpsNumero, 'numeric_string', 10) +
    generatePositionalString(data.dataEmissao, 'numeric_string', 8) + // YYYYMMDD
    generatePositionalString(data.horaEmissao, 'numeric_string', 6) + // HHMMSS pos 34-39
    generatePositionalString('E', 'text', 1) + // pos 40
    generatePositionalString('', 'text', 202) + // blank pos 41-242
    generatePositionalString(data.codigoServico, 'numeric_string', 9) + // pos 243-251
    generatePositionalString('', 'text', 206) + // blank pos 252-457
    generatePositionalString('1', 'numeric_string', 6) + // Qtd Serviço = 1, pos 458-463
    generatePositionalString(data.valorServico, 'numeric', 15) + // pos 464-478
    generatePositionalString('', 'text', 5) + // blank pos 479-483 (reserved)
    generatePositionalString(0, 'numeric', 15) + // Valor Total Retenções = R$0, pos 484-498
    generatePositionalString('2', 'text', 1) + // pos 499: Tomador Brasileiro
    generatePositionalString('', 'text', 4) + // blank pos 500-503
    generatePositionalString(tipoDoc, 'text', 1) + // pos 504
    generatePositionalString(cleanedDoc, 'numeric_string', 14) + // pos 505-518
    generatePositionalString(data.tomadorNome, 'text', 60) + // pos 519-578
    generatePositionalString(data.tomadorLogradouro, 'text', 75) + // pos 579-653
    generatePositionalString('', 'text', 39) + // blank pos 654-692
    generatePositionalString(data.tomadorBairro, 'text', 40) + // pos 693-732
    generatePositionalString(data.tomadorCidade, 'text', 40) + // pos 733-772
    generatePositionalString(data.tomadorUf, 'text', 2) + // pos 773-774
    generatePositionalString(data.tomadorCep, 'numeric_string', 8) + // pos 775-782
    generatePositionalString(data.tomadorEmail, 'text', 152) + // pos 783-934
    generatePositionalString('', 'text', 36) + // blank pos 935-970
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
    generatePositionalString('', 'text', 15);

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
export function buildType4Row(data = {}) {
  const optanteSN = data.optanteSimples || '1'; // 1=Não Optante, 2=MEI, 3=ME/EPP
  const regimeApuracao = optanteSN === '3' ? (data.regimeApuracao || '1') : '0';
  const codigoCidadeIBGE = data.codigoCidadeIBGE || '3505708'; // Barueri

  const payload =
    generatePositionalString('4', 'text', 1) +             // pos 1: Tipo do Registro
    generatePositionalString(optanteSN, 'text', 1) +        // pos 2: Optante Simples Nacional
    generatePositionalString(regimeApuracao, 'text', 1) +   // pos 3: Regime Apuração Simples
    generatePositionalString('', 'text', 3) +               // pos 4-6: reserved
    generatePositionalString(codigoCidadeIBGE, 'numeric_string', 7) + // pos 7-13: Código Cidade IBGE
    generatePositionalString('', 'text', 1957);             // pos 14-1970: remaining fields (spaces)

  if (payload.length !== 1970) {
    throw new Error(`Type4 payload length mismatch: expected 1970, got ${payload.length}`);
  }

  return payload + '\r\n';
}

/**
 * Combines all records into the full RPS string buffer and returns the Base64 representation.
 */
export function assembleRpsFile(header, details, footer) {
  const fileContent = header + details + footer;
  return Buffer.from(fileContent, 'utf-8').toString('base64');
}
