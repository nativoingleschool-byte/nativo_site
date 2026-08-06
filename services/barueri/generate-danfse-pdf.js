import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Strip diacritics — required because Helvetica (StandardFont) only covers Latin-1 Basic
function n(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim();
}

function fmtDoc(doc) {
  const d = String(doc || '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  return doc || '-';
}

function fmtCep(cep) {
  const d = String(cep || '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0,5)}-${d.slice(5)}` : (cep || '-');
}

function fmtBRL(value) {
  const v = Number(value || 0);
  return `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function fmtPeriod(period) {
  if (!period || period.length < 7) return period || '-';
  const [year, month] = period.split('-');
  const months = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${months[parseInt(month, 10) - 1] || month} de ${year}`;
}

function fmtDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return String(iso).slice(0, 10);
  }
}

/**
 * Generates a DANFS-e style PDF for the given invoice + student.
 *
 * @param {{ invoice: object, student: object }} opts
 * @returns {Promise<Buffer>}
 */
export async function generateDanfsePdf({ invoice, student }) {
  // School config from env
  const schoolName  = process.env.BARUERI_SCHOOL_NAME     || 'NATIVO ENGLISH SCHOOL';
  const schoolCnpj  = process.env.BARUERI_CNPJ_PRESTADOR  || '';
  const schoolIm    = process.env.BARUERI_INSCRICAO_MUNICIPAL || '';
  const svcCode     = process.env.BARUERI_CODIGO_SERVICO   || '080201220';
  const discrimin   = process.env.BARUERI_DISCRIMINACAO    || 'PRESTACAO DE SERVICOS PEDAGOGICOS - NATIVO ENGLISH SCHOOL';
  const aliqStr     = process.env.BARUERI_ALIQUOTA_ISS     || '0200'; // 4-digit positional: 0200 = 2.00%
  const aliq        = parseInt(aliqStr, 10) / 10000;

  // ── Values ──────────────────────────────────────────────────────
  const nfseNum     = String(invoice.nfse_numero || '').padStart(7, '0');
  const codVerif    = String(invoice.nfse_codigo_verificacao || '').trim();
  const rpsNum      = String(invoice.rps_number || '-');
  const period      = invoice.billing_period || '';
  const valor       = Number(student.tuition_fee || 0);
  const valorIss    = parseFloat((valor * aliq).toFixed(2));
  const valorLiq    = parseFloat((valor - valorIss).toFixed(2));
  const emitDate    = fmtDate(invoice.created_at);

  // ── PDF setup ──────────────────────────────────────────────────
  const doc  = await PDFDocument.create();
  doc.setTitle(`NFS-e ${nfseNum} - ${n(student.full_name)}`);
  doc.setAuthor(n(schoolName));
  doc.setCreator('Nativo English School - Sistema de Gestao');

  const page         = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const M            = 36;   // margin
  const CW           = width - M * 2; // content width

  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg     = await doc.embedFont(StandardFonts.Helvetica);
  const mono    = await doc.embedFont(StandardFonts.Courier);
  const boldObl = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

  // ── Colour palette ─────────────────────────────────────────────
  const BLUE     = rgb(0.067, 0.196, 0.490);
  const BLUE_LT  = rgb(0.835, 0.886, 0.957);
  const GREEN    = rgb(0.063, 0.502, 0.227);
  const GREEN_LT = rgb(0.914, 0.973, 0.929);
  const AMBER    = rgb(0.608, 0.380, 0.024);
  const AMBER_LT = rgb(0.996, 0.949, 0.875);
  const GRAY     = rgb(0.35, 0.35, 0.35);
  const GRAY_LT  = rgb(0.941, 0.945, 0.953);
  const WHITE    = rgb(1, 1, 1);
  const BLACK    = rgb(0, 0, 0);
  const BORDER   = rgb(0.78, 0.82, 0.90);

  // ── Drawing helpers ────────────────────────────────────────────
  let cy = height - M;

  /** Draw filled (+ optionally bordered) rectangle */
  const rect = (x, y, w, h, fill, bColor, bw = 0.6) => {
    page.drawRectangle({ x, y: y - h, width: w, height: h, color: fill,
      ...(bColor ? { borderColor: bColor, borderWidth: bw } : {}) });
  };

  /** Draw a horizontal rule */
  const rule = (y, color = BORDER, thickness = 0.5) =>
    page.drawLine({ start: { x: M, y }, end: { x: M + CW, y }, color, thickness });

  /** Draw text, automatically normalising to ASCII */
  const txt = (str, x, y, { font = reg, size = 9, color = BLACK, maxWidth } = {}) => {
    const s = n(String(str ?? ''));
    if (!s) return;
    page.drawText(s, { x, y, size, font, color, ...(maxWidth ? { maxWidth } : {}) });
  };

  /** Render a section header bar */
  const sectionHdr = (label, y) => {
    rect(M, y, CW, 18, BLUE_LT, BORDER);
    txt(label, M + 6, y - 13, { font: bold, size: 8, color: BLUE });
    return y - 18;
  };

  /** Render a white content box */
  const box = (y, h) => {
    rect(M, y, CW, h, WHITE, BORDER);
    return y - h;
  };

  /** Label + value pair stacked vertically */
  const field = (label, value, x, y, opts = {}) => {
    txt(label, x, y - 2, { size: 7.5, color: GRAY });
    txt(value, x, y - 13, { size: opts.large ? 12 : 9.5, font: opts.bold ? bold : reg, color: opts.color || BLACK, maxWidth: opts.maxWidth });
  };

  // ════════════════════════════════════════════════════════════════
  // HEADER
  // ════════════════════════════════════════════════════════════════
  const HH = 72;
  rect(M, cy, CW, HH, BLUE, BLUE);

  txt('NOTA FISCAL DE SERVICOS ELETRONICA  -  NFS-e', M + 10, cy - 16, { font: bold, size: 13, color: WHITE });
  txt(`Prefeitura Municipal de Barueri - SP`, M + 10, cy - 30, { size: 9, color: rgb(0.78, 0.87, 1.0) });
  txt(`Secretaria Municipal de Financas  |  Inscricao Municipal: ${n(schoolIm)}`, M + 10, cy - 42, { size: 8.5, color: rgb(0.7, 0.82, 1.0) });

  // NFS-e number badge (right side)
  txt('NFS-e No', width - M - 110, cy - 16, { size: 8.5, color: rgb(0.7, 0.82, 1.0) });
  txt(nfseNum, width - M - 110, cy - 30, { font: bold, size: 18, color: WHITE });
  txt(`RPS: ${rpsNum}`, width - M - 110, cy - 50, { size: 8.5, color: rgb(0.7, 0.82, 1.0) });

  // Dates strip
  txt(`Data de Emissao: ${emitDate}`, M + 10, cy - 58, { size: 8, color: rgb(0.65, 0.78, 1.0) });
  txt(`Competencia: ${n(fmtPeriod(period))}`, M + 200, cy - 58, { size: 8, color: rgb(0.65, 0.78, 1.0) });

  cy -= HH + 10;

  // ════════════════════════════════════════════════════════════════
  // PRESTADOR
  // ════════════════════════════════════════════════════════════════
  cy = sectionHdr('PRESTADOR DE SERVICOS', cy);
  const pBox = box(cy, 44);
  txt(n(schoolName), M + 8, cy - 12, { font: bold, size: 10.5 });
  txt(`CNPJ: ${fmtDoc(schoolCnpj)}`, M + 8, cy - 25, { size: 9, color: GRAY });
  txt(`Municipio de Barueri - SP`, M + 8, cy - 37, { size: 9, color: GRAY });
  cy = pBox - 8;

  // ════════════════════════════════════════════════════════════════
  // TOMADOR
  // ════════════════════════════════════════════════════════════════
  cy = sectionHdr('TOMADOR DE SERVICOS (BENEFICIARIO)', cy);
  const tBox = box(cy, 58);
  txt(student.full_name || '-', M + 8, cy - 12, { font: bold, size: 10.5 });
  txt(`CPF/CNPJ: ${fmtDoc(student.cpf)}`, M + 8, cy - 25, { size: 9, color: GRAY });
  txt(`E-mail: ${student.email || '-'}`, M + 250, cy - 25, { size: 9, color: GRAY });

  const addr = [
    n(student.logradouro),
    student.bairro ? n(student.bairro) : null,
    student.cidade && student.uf ? `${n(student.cidade)} - ${n(student.uf)}` : n(student.cidade || student.uf || ''),
    student.cep ? `CEP ${fmtCep(student.cep)}` : null,
  ].filter(Boolean).join('  |  ');
  txt(`Endereco: ${addr}`, M + 8, cy - 38, { size: 9, color: GRAY, maxWidth: CW - 16 });
  cy = tBox - 8;

  // ════════════════════════════════════════════════════════════════
  // DISCRIMINAÇÃO DOS SERVIÇOS
  // ════════════════════════════════════════════════════════════════
  cy = sectionHdr('DISCRIMINACAO DOS SERVICOS', cy);
  const dBox = box(cy, 36);
  txt(n(discrimin), M + 8, cy - 12, { size: 9.5, maxWidth: CW - 16 });
  txt(`Codigo do Servico: ${svcCode}`, M + 8, cy - 27, { size: 8.5, color: GRAY });
  txt(`Aliquota ISS: ${(aliq * 100).toFixed(2).replace('.', ',')}%`, M + 200, cy - 27, { size: 8.5, color: GRAY });
  cy = dBox - 8;

  // ════════════════════════════════════════════════════════════════
  // VALORES
  // ════════════════════════════════════════════════════════════════
  cy = sectionHdr('VALORES', cy);
  const vBox = box(cy, 44);
  const col = CW / 3;

  field('Valor dos Servicos', fmtBRL(valor), M + 8, cy - 6, { large: true, bold: true });
  field(`ISS Retido (${(aliq * 100).toFixed(2).replace('.', ',')}%)`, fmtBRL(valorIss), M + 8 + col, cy - 6);
  field('Valor Liquido do Prestador', fmtBRL(valorLiq), M + 8 + col * 2, cy - 6, { bold: true });
  cy = vBox - 8;

  // ════════════════════════════════════════════════════════════════
  // CÓDIGO DE VERIFICAÇÃO  (green highlight box)
  // ════════════════════════════════════════════════════════════════
  cy = sectionHdr('CODIGO DE VERIFICACAO / AUTENTICIDADE', cy);
  const cvH = codVerif ? 68 : 44;
  rect(M, cy, CW, cvH, GREEN_LT, GREEN, 1.2);

  if (codVerif) {
    txt(codVerif, M + 10, cy - 16, { font: mono, size: 12.5, color: BLUE });
    txt('Informe o codigo acima no portal da Prefeitura de Barueri para verificar a autenticidade desta nota.', M + 10, cy - 34, { size: 8, color: GRAY, maxWidth: CW - 20 });
    txt('Acesse: www.barueri.sp.gov.br/nfe  |  Campos: Inscricao Municipal + Numero da Nota + Codigo', M + 10, cy - 47, { size: 8, color: GREEN, maxWidth: CW - 20 });
    txt(`Inscricao Municipal: ${n(schoolIm)}  |  Numero da Nota: ${nfseNum}`, M + 10, cy - 59, { size: 8, color: GRAY });
  } else {
    txt('Codigo de verificacao nao disponivel. Consulte o portal da Prefeitura: www.barueri.sp.gov.br/nfe', M + 10, cy - 18, { size: 8.5, color: AMBER, maxWidth: CW - 20 });
    txt(`Inscricao Municipal: ${n(schoolIm)}  |  Numero da Nota: ${nfseNum}  |  RPS: ${rpsNum}`, M + 10, cy - 33, { size: 8, color: GRAY });
  }
  cy -= cvH + 10;

  // ════════════════════════════════════════════════════════════════
  // NOTICE BOX  (amber, if no verification code)
  // ════════════════════════════════════════════════════════════════
  if (!codVerif) {
    rect(M, cy, CW, 30, AMBER_LT, AMBER, 0.8);
    txt('ATENCAO: Este documento foi gerado a partir dos dados do lote RPS. O codigo de verificacao sera disponibilizado apos o processamento completo pela Prefeitura.', M + 8, cy - 10, { size: 8, color: AMBER, maxWidth: CW - 16 });
    cy -= 38;
  }

  // ════════════════════════════════════════════════════════════════
  // FOOTER
  // ════════════════════════════════════════════════════════════════
  rule(cy);
  cy -= 6;
  txt('Este documento e uma representacao grafica da Nota Fiscal de Servicos Eletronica (NFS-e) emitida pela Prefeitura de Barueri.', M, cy - 10, { size: 7, color: GRAY, maxWidth: CW });
  txt('O documento original e o PDF oficial podem ser consultados no portal municipal mediante autenticacao do contribuinte.', M, cy - 20, { size: 7, color: GRAY, maxWidth: CW });
  txt(`Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, M, cy - 32, { size: 7, color: rgb(0.6, 0.6, 0.6) });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
