import crypto from 'crypto';

/**
 * Normalizes dates from OFX (YYYYMMDD...) and Brazilian CSV (DD/MM/YYYY or DD/MM/YY)
 * to standard ISO YYYY-MM-DD.
 */
export function normalizeDate(rawDateStr) {
  if (!rawDateStr) return new Date().toISOString().split('T')[0];
  const str = String(rawDateStr).trim();

  // OFX format: YYYYMMDD... (e.g. 20260828000000[0:GMT])
  const ofxMatch = str.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofxMatch) {
    const [, y, m, d] = ofxMatch;
    return `${y}-${m}-${d}`;
  }

  // Brazilian format: DD/MM/YYYY or DD/MM/YY
  const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (brMatch) {
    let [, d, m, y] = brMatch;
    d = d.padStart(2, '0');
    m = m.padStart(2, '0');
    if (y.length === 2) {
      y = `20${y}`;
    }
    return `${y}-${m}-${d}`;
  }

  // ISO format: YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    let [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

/**
 * Parses numeric monetary values from bank string representation.
 */
export function parseAmount(valStr) {
  if (typeof valStr === 'number') return valStr;
  if (!valStr) return 0;

  let s = String(valStr).trim().toUpperCase();
  const isDebit = s.includes('D') || s.includes('-') || s.startsWith('(');

  // Remove currency symbols, parentheses, D/C suffixes, etc.
  s = s.replace(/[R$\s\(\)DC+]/g, '');

  if (s.includes(',') && s.includes('.')) {
    // e.g. 1.234,56 -> remove dots, replace comma
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    // e.g. 450,00 -> 450.00
    s = s.replace(',', '.');
  }

  const num = parseFloat(s);
  if (isNaN(num)) return 0;
  return isDebit ? -Math.abs(num) : num;
}

/**
 * Normalizes text for case-insensitive accent-stripped comparisons and tokenization.
 */
export const normalizeText = (str) =>
  String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

/**
 * Extracts credit transactions from Cora Bank (Banco 0403) and standard OFX exports.
 */
export function parseOfx(content) {
  const transactions = [];
  const stmtTrnRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|$|(?=<\/BANKTRANLIST>))/gi;
  let match;

  while ((match = stmtTrnRegex.exec(content)) !== null) {
    const block = match[1];

    const getTag = (tag) => {
      const regex = new RegExp(`<${tag}>\\s*([^<\\r\\n]+?)(?:<\\/${tag}>|(?=<)|$)`, 'i');
      const m = block.match(regex);
      return m ? m[1].trim() : '';
    };

    const trntype = getTag('TRNTYPE').toUpperCase();
    const dtposted = getTag('DTPOSTED');
    const trnamtStr = getTag('TRNAMT');
    const fitid = getTag('FITID');
    const memo = getTag('MEMO') || getTag('NAME') || '';

    const amount = parseAmount(trnamtStr);

    // 1. Inflow Filtering: TRNTYPE is CREDIT and TRNAMT > 0
    if (amount > 0 && trntype === 'CREDIT') {
      const normalizedDate = normalizeDate(dtposted);
      const cleanFitid = fitid || crypto.createHash('md5').update(`${normalizedDate}_${amount}_${memo.trim().toLowerCase()}`).digest('hex');

      // 2. Smart Regex Matcher tailored for Cora Bank:
      // Real format: "Pagamento recebido - Evelyn Almeida - 489.879.048-81"
      const coraRegex = /^Pagamento recebido\s*-\s*(.+?)\s*-\s*([\d\.\-\/]+)$/i;
      const coraMatch = memo.trim().match(coraRegex);

      let extractedName = null;
      let extractedCpf = null;

      if (coraMatch) {
        extractedName = coraMatch[1].trim();
        extractedCpf = coraMatch[2].replace(/\D/g, '');
      } else {
        // Fallback CPF extraction if memo format slightly differs
        const cpfMatch = memo.match(/(\d{3}\.?\d{3}\.?\d{3}\-?\d{2}|\d{11})/);
        if (cpfMatch) {
          extractedCpf = cpfMatch[1].replace(/\D/g, '');
        }
      }

      transactions.push({
        fitid: cleanFitid,
        transaction_date: normalizedDate,
        amount: Number(amount.toFixed(2)),
        memo: memo.trim(),
        extractedName,
        extractedCpf,
        raw_data: {
          trntype,
          dtposted,
          trnamtStr,
          fitid: cleanFitid,
          extracted_name: extractedName,
          extracted_cpf: extractedCpf
        }
      });
    }
  }

  return transactions;
}

/**
 * Extracts credit transactions from CSV content (semicolon or comma delimited).
 */
export function parseCsv(content) {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Detect delimiter (; or , or \t)
  const headerLine = lines[0];
  let delimiter = ';';
  if (headerLine.includes(';') && !headerLine.includes(',')) {
    delimiter = ';';
  } else if (headerLine.includes(',') && !headerLine.includes(';')) {
    delimiter = ',';
  } else if ((headerLine.match(/;/g) || []).length >= (headerLine.match(/,/g) || []).length) {
    delimiter = ';';
  } else {
    delimiter = ',';
  }

  const parseCsvLine = (line) => {
    const pattern = new RegExp(`(?:^|${delimiter})(?:"([^"]*(?:""[^"]*)*)"|([^"${delimiter}]*))`, 'g');
    const fields = [];
    let entry;
    while ((entry = pattern.exec(line)) !== null) {
      let val = entry[1] !== undefined ? entry[1].replace(/""/g, '"') : entry[2];
      fields.push(val ? val.trim() : '');
    }
    return fields;
  };

  const headers = parseCsvLine(headerLine).map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

  // Find column indices
  let dateIdx = headers.findIndex(h => h.includes('data') || h.includes('date') || h.includes('dt'));
  let memoIdx = headers.findIndex(h => h.includes('historico') || h.includes('descricao') || h.includes('lancamento') || h.includes('memo') || h.includes('detalhe') || h.includes('description'));
  let amountIdx = headers.findIndex(h => h.includes('valor') || h.includes('credito') || h.includes('entrada') || h.includes('amount'));
  let fitidIdx = headers.findIndex(h => h.includes('fitid') || h.includes('documento') || h.includes('doc') || h.includes('identificador') || h.includes('numero'));

  if (dateIdx === -1) dateIdx = 0;
  if (memoIdx === -1) memoIdx = 1;
  if (amountIdx === -1) amountIdx = 2;

  const transactions = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length <= Math.max(dateIdx, memoIdx, amountIdx)) continue;

    const rawDate = fields[dateIdx];
    const memo = fields[memoIdx] || 'Transação CSV';
    const rawAmount = fields[amountIdx];
    const explicitFitid = fitidIdx >= 0 ? fields[fitidIdx] : '';

    const amount = parseAmount(rawAmount);

    if (amount > 0) {
      const normalizedDate = normalizeDate(rawDate);
      const deterministicFitid = explicitFitid || crypto.createHash('md5').update(`${normalizedDate}_${amount}_${memo.trim().toLowerCase()}`).digest('hex');

      const coraRegex = /^Pagamento recebido\s*-\s*(.+?)\s*-\s*([\d\.\-\/]+)$/i;
      const coraMatch = memo.trim().match(coraRegex);

      let extractedName = null;
      let extractedCpf = null;

      if (coraMatch) {
        extractedName = coraMatch[1].trim();
        extractedCpf = coraMatch[2].replace(/\D/g, '');
      } else {
        const cpfMatch = memo.match(/(\d{3}\.?\d{3}\.?\d{3}\-?\d{2}|\d{11})/);
        if (cpfMatch) {
          extractedCpf = cpfMatch[1].replace(/\D/g, '');
        }
      }

      transactions.push({
        fitid: deterministicFitid,
        transaction_date: normalizedDate,
        amount: Number(amount.toFixed(2)),
        memo: memo.trim(),
        extractedName,
        extractedCpf,
        raw_data: { source: 'csv', lineIndex: i, extracted_name: extractedName, extracted_cpf: extractedCpf }
      });
    }
  }

  return transactions;
}

/**
 * Student Profile Matching Hierarchy:
 * - Match 1 (Direct CPF): Check if cleanCpf matches profiles.cpf (digits only).
 * - Match 2 (Full/Partial Name): Match extractedName (or memo) against profiles.name (full_name) using case-insensitive token overlap.
 * - Match 3 (Amount fallback): Match TRNAMT against profiles.tuition_fee for active students.
 */
export function autoMatchStudent(transaction, students) {
  const cleanCpf = transaction.extractedCpf || transaction.memo.replace(/\D/g, '');

  // --- Match 1 (Direct CPF) ---
  if (cleanCpf && cleanCpf.length >= 11) {
    const student = students.find(s => {
      const sCpf = String(s.cpf || '').replace(/\D/g, '');
      return sCpf.length >= 11 && sCpf === cleanCpf;
    });
    if (student) {
      return { student, matchType: 'cpf' };
    }
  }

  // --- Match 2 (Full/Partial Name via token overlap) ---
  const targetName = transaction.extractedName || transaction.memo;
  const nameNorm = normalizeText(targetName);
  const stopWords = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'pagamento', 'recebido', 'pix', 'transf']);
  const targetTokens = nameNorm.split(/\s+/).filter(t => t.length >= 3 && !stopWords.has(t));

  if (targetTokens.length > 0) {
    let bestStudent = null;
    let maxOverlap = 0;

    for (const student of students) {
      if (!student.full_name) continue;
      const sNorm = normalizeText(student.full_name);

      // Exact full name match
      if (sNorm === nameNorm || (transaction.extractedName && sNorm === normalizeText(transaction.extractedName))) {
        return { student, matchType: 'name_exact' };
      }

      const sTokens = sNorm.split(/\s+/).filter(t => t.length >= 3 && !stopWords.has(t));
      if (sTokens.length === 0) continue;

      // Count overlapping name tokens
      const overlapCount = sTokens.filter(t => targetTokens.includes(t)).length;

      if (overlapCount >= 2 && overlapCount > maxOverlap) {
        maxOverlap = overlapCount;
        bestStudent = student;
      }
    }

    if (bestStudent && maxOverlap >= 2) {
      return { student: bestStudent, matchType: 'name_token_overlap' };
    }
  }

  // --- Match 3 (Amount fallback against tuition_fee) ---
  const feeMatches = students.filter(s => {
    const fee = Number(s.tuition_fee);
    return !isNaN(fee) && Math.abs(fee - transaction.amount) < 0.01;
  });

  if (feeMatches.length === 1) {
    return { student: feeMatches[0], matchType: 'amount_fallback' };
  }

  return null;
}

/**
 * Complete Statement Processing & Upsert Pipeline.
 * Shared by api/admin/parse-statement.js and api/webhooks/inbound-email.js.
 */
export async function processStatementAndUpsert(supabaseAdmin, fileContent, filename = '') {
  if (!fileContent || typeof fileContent !== 'string') {
    throw new Error('file_content is required as a string.');
  }

  const lowerName = String(filename || '').toLowerCase();
  const isOfx = lowerName.endsWith('.ofx') || fileContent.includes('<OFX>') || fileContent.includes('<STMTTRN>');

  // 1. Parse credit transactions
  const rawTransactions = isOfx ? parseOfx(fileContent) : parseCsv(fileContent);

  if (!rawTransactions || rawTransactions.length === 0) {
    return {
      success: true,
      message: 'Nenhuma transação de crédito encontrada no extrato.',
      count: 0,
      transactions: []
    };
  }

  // 2. Fetch all active student profiles for auto-matching
  const { data: students, error: studentsError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email, cpf, tuition_fee, cep, logradouro, status_pagamento')
    .eq('role', 'student')
    .eq('archived', false);

  if (studentsError) {
    throw new Error(`Falha ao buscar perfis de alunos: ${studentsError.message}`);
  }

  // 3. Fetch existing bank transactions by FITID for deduplication
  const fitids = rawTransactions.map(t => t.fitid).filter(Boolean);
  let existingMap = new Map();

  if (fitids.length > 0) {
    const { data: existingRecords } = await supabaseAdmin
      .from('bank_transactions')
      .select('id, fitid, status, nfse_id, student_id')
      .in('fitid', fitids);

    if (existingRecords) {
      for (const rec of existingRecords) {
        existingMap.set(rec.fitid, rec);
      }
    }
  }

  // 4. Prepare rows to upsert with Cora matching hierarchy
  const rowsToUpsert = [];
  for (const item of rawTransactions) {
    const existing = existingMap.get(item.fitid);

    if (existing && existing.status === 'issued') {
      // Do not alter already issued bank transactions
      continue;
    }

    const matchResult = autoMatchStudent(item, students || []);
    const matchedStudent = matchResult?.student || null;

    const studentId = existing?.student_id || (matchedStudent ? matchedStudent.id : null);
    const status = existing?.status === 'failed'
      ? 'failed'
      : (studentId ? 'matched' : 'pending');

    rowsToUpsert.push({
      fitid: item.fitid,
      transaction_date: item.transaction_date,
      amount: item.amount,
      memo: item.memo,
      student_id: studentId,
      status: status,
      raw_data: {
        ...(item.raw_data || {}),
        extracted_name: item.extractedName,
        extracted_cpf: item.extractedCpf,
        match_type: matchResult?.matchType || null
      }
    });
  }

  let insertedOrUpdated = [];
  if (rowsToUpsert.length > 0) {
    const { data: upserted, error: upsertError } = await supabaseAdmin
      .from('bank_transactions')
      .upsert(rowsToUpsert, { onConflict: 'fitid' })
      .select(`
        id,
        fitid,
        transaction_date,
        amount,
        memo,
        student_id,
        nfse_id,
        status,
        raw_data,
        created_at,
        student:profiles!bank_transactions_student_id_fkey(id, full_name, email, cpf, tuition_fee)
      `);

    if (upsertError) {
      throw new Error(`Falha ao salvar transações: ${upsertError.message}`);
    }
    insertedOrUpdated = upserted || [];
  }

  // Include any existing records that were already 'issued' for complete preview
  if (existingMap.size > 0) {
    const alreadyIssuedFitids = Array.from(existingMap.values())
      .filter(e => e.status === 'issued')
      .map(e => e.fitid);

    if (alreadyIssuedFitids.length > 0) {
      const { data: alreadyIssuedRecords } = await supabaseAdmin
        .from('bank_transactions')
        .select(`
          id,
          fitid,
          transaction_date,
          amount,
          memo,
          student_id,
          nfse_id,
          status,
          raw_data,
          created_at,
          student:profiles!bank_transactions_student_id_fkey(id, full_name, email, cpf, tuition_fee)
        `)
        .in('fitid', alreadyIssuedFitids);

      if (alreadyIssuedRecords) {
        insertedOrUpdated = [...insertedOrUpdated, ...alreadyIssuedRecords];
      }
    }
  }

  // Sort descending by transaction_date
  insertedOrUpdated.sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());

  return {
    success: true,
    count: insertedOrUpdated.length,
    transactions: insertedOrUpdated
  };
}
