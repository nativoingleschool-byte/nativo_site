import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

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
 * Generates a modern DANFS-e style PDF for the given invoice + student.
 *
 * @param {{ invoice: object, student: object }} opts
 * @returns {Promise<Buffer>}
 */
export async function generateDanfsePdf({ invoice, student }) {
  // School config from env
  const schoolName  = process.env.BARUERI_SCHOOL_NAME     || 'NATIVO LANGUAGES BRAZIL LTDA';
  const schoolCnpj  = process.env.BARUERI_CNPJ_PRESTADOR  || '';
  const schoolIm    = process.env.BARUERI_INSCRICAO_MUNICIPAL || '';
  const svcCode     = process.env.BARUERI_CODIGO_SERVICO   || '080201220';
  const discrimin   = process.env.BARUERI_DISCRIMINACAO    || 'PRESTACAO DE SERVICOS PEDAGOGICOS - NATIVO LANGUAGES BRAZIL LTDA';
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
  doc.setCreator('Nativo Languages Brazil LTDA - Sistema de Gestao');

  // Load Logo Image if available
  let logoImage = null;
  try {
    const logoPath = path.resolve(process.cwd(), 'public/hero/logo-blue.png');
    if (fs.existsSync(logoPath)) {
      const logoBytes = fs.readFileSync(logoPath);
      logoImage = await doc.embedPng(logoBytes);
    }
  } catch (e) {
    console.warn('Could not load logo for PDF:', e.message);
  }

  const page         = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const M            = 36;   // margin
  const CW           = width - M * 2; // content width

  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg     = await doc.embedFont(StandardFonts.Helvetica);
  const mono    = await doc.embedFont(StandardFonts.Courier);
  const boldObl = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

  // ── Modern Palette ─────────────────────────────────────────────
  const NAVY     = rgb(15 / 255, 23 / 255, 42 / 255);    // #0f172a
  const INDIGO   = rgb(79 / 255, 70 / 255, 229 / 255);   // #4f46e5
  const INDIGO_BG= rgb(238 / 255, 242 / 255, 255 / 255); // #eef2ff
  const SLATE_BG = rgb(248 / 255, 250 / 255, 252 / 255); // #f8fafc
  const BORDER   = rgb(226 / 255, 232 / 255, 240 / 255); // #e2e8f0
  const BORDER_DK= rgb(203 / 255, 213 / 255, 225 / 255); // #cbd5e1
  
  const GREEN    = rgb(16 / 255, 185 / 255, 129 / 255);  // #10b981
  const GREEN_BG = rgb(240 / 255, 253 / 255, 244 / 255); // #f0fdf4
  const GREEN_BRD= rgb(187 / 255, 247 / 255, 208 / 255); // #bbf7d0
  
  const AMBER    = rgb(217 / 255, 119 / 255, 6 / 255);   // #d97706
  const AMBER_BG = rgb(254 / 255, 243 / 255, 199 / 255); // #fef3c7
  
  const TEXT_PRI = rgb(15 / 255, 23 / 255, 42 / 255);    // #0f172a
  const TEXT_SEC = rgb(100 / 255, 116 / 255, 139 / 255);  // #64748b
  const WHITE    = rgb(1, 1, 1);

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
  const txt = (str, x, y, { font = reg, size = 9, color = TEXT_PRI, maxWidth } = {}) => {
    const s = n(String(str ?? ''));
    if (!s) return;
    page.drawText(s, { x, y, size, font, color, ...(maxWidth ? { maxWidth } : {}) });
  };

  /** Render a section header bar */
  const sectionHdr = (label, y) => {
    rect(M, y, CW, 20, INDIGO_BG, BORDER_DK, 0.8);
    // Accent left indicator line
    page.drawLine({ start: { x: M, y: y - 1 }, end: { x: M, y: y - 19 }, color: INDIGO, thickness: 3.5 });
    txt(label, M + 10, y - 14, { font: bold, size: 8.5, color: INDIGO });
    return y - 20;
  };

  /** Render a soft slate content box */
  const box = (y, h) => {
    rect(M, y, CW, h, SLATE_BG, BORDER);
    return y - h;
  };

  /** Label + value pair stacked vertically */
  const field = (label, value, x, y, opts = {}) => {
    txt(label, x, y - 2, { size: 7.5, color: TEXT_SEC });
    txt(value, x, y - 13, { size: opts.large ? 12 : 9.5, font: opts.bold ? bold : reg, color: opts.color || TEXT_PRI, maxWidth: opts.maxWidth });
  };

  // ════════════════════════════════════════════════════════════════
  // MODERN TOP HEADER
  // ════════════════════════════════════════════════════════════════
  const HH = 85;
  rect(M, cy, CW, HH, WHITE, BORDER_DK, 1);

  // Left Column: Logo & Company Name
  let leftOffset = M + 14;
  if (logoImage) {
    const logoHeight = 44;
    const logoWidth = (logoImage.width / logoImage.height) * logoHeight;
    page.drawImage(logoImage, {
      x: leftOffset,
      y: cy - 58,
      width: logoWidth,
      height: logoHeight,
    });
    leftOffset += logoWidth + 14;
  }

  txt(n(schoolName), leftOffset, cy - 26, { font: bold, size: 11, color: NAVY });
  txt('PREFEITURA MUNICIPAL DE BARUERI', leftOffset, cy - 40, { size: 8.5, color: TEXT_SEC });
  txt(`Inscricao Municipal: ${n(schoolIm)}`, leftOffset, cy - 53, { size: 8, color: TEXT_SEC });

  // Right Column: NFS-e Badge Card
  const badgeW = 160;
  const badgeX = width - M - badgeW - 10;
  rect(badgeX, cy - 8, badgeW, 68, NAVY, NAVY);

  txt('NOTA FISCAL DE SERVICOS', badgeX + 12, cy - 22, { font: bold, size: 8, color: rgb(199 / 255, 210 / 255, 254 / 255) });
  txt('ELETRONICA - NFS-e', badgeX + 12, cy - 32, { font: bold, size: 8, color: rgb(199 / 255, 210 / 255, 254 / 255) });
  txt(`No ${nfseNum}`, badgeX + 12, cy - 50, { font: bold, size: 15, color: WHITE });
  txt(`RPS: ${rpsNum}`, badgeX + 12, cy - 65, { size: 8, color: rgb(199 / 255, 210 / 255, 254 / 255) });

  // Sub-header Bar: Emission Date & Competency
  const subBarY = cy - HH;
  rect(M, subBarY, CW, 20, INDIGO_BG, BORDER_DK, 0.5);
  txt(`Data de Emissao: ${emitDate}`, M + 14, subBarY - 14, { font: bold, size: 8.5, color: NAVY });
  txt(`Competencia: ${n(fmtPeriod(period))}`, M + 240, subBarY - 14, { font: bold, size: 8.5, color: NAVY });

  cy = subBarY - 30;

  // ════════════════════════════════════════════════════════════════
  // PRESTADOR DE SERVIÇOS
  // ════════════════════════════════════════════════════════════════
  cy = sectionHdr('PRESTADOR DE SERVICOS (EMISSOR)', cy);
  const pBox = box(cy, 48);
  txt(n(schoolName), M + 12, cy - 14, { font: bold, size: 10, color: NAVY });
  txt(`CNPJ: ${fmtDoc(schoolCnpj)}`, M + 12, cy - 28, { size: 9, color: TEXT_SEC });
  txt(`Municipio: Barueri - SP`, M + 240, cy - 28, { size: 9, color: TEXT_SEC });
  txt(`Inscricao Municipal: ${n(schoolIm)}`, M + 12, cy - 40, { size: 8.5, color: TEXT_SEC });
  cy = pBox - 10;

  // ════════════════════════════════════════════════════════════════
  // TOMADOR DE SERVIÇOS
  // ════════════════════════════════════════════════════════════════
  cy = sectionHdr('TOMADOR DE SERVICOS (ALUNO / BENEFICIARIO)', cy);
  const tBox = box(cy, 62);
  txt(student.full_name || '-', M + 12, cy - 14, { font: bold, size: 10.5, color: NAVY });
  txt(`CPF/CNPJ: ${fmtDoc(student.cpf)}`, M + 12, cy - 28, { size: 9, color: TEXT_SEC });
  txt(`E-mail: ${student.email || '-'}`, M + 240, cy - 28, { size: 9, color: TEXT_SEC });

  const addr = [
    n(student.logradouro),
    student.bairro ? n(student.bairro) : null,
    student.cidade && student.uf ? `${n(student.cidade)} - ${n(student.uf)}` : n(student.cidade || student.uf || ''),
    student.cep ? `CEP ${fmtCep(student.cep)}` : null,
  ].filter(Boolean).join('  |  ');
  txt(`Endereco: ${addr}`, M + 12, cy - 44, { size: 8.5, color: TEXT_SEC, maxWidth: CW - 24 });
  cy = tBox - 10;

  // ════════════════════════════════════════════════════════════════
  // DISCRIMINAÇÃO DOS SERVIÇOS
  // ════════════════════════════════════════════════════════════════
  cy = sectionHdr('DISCRIMINACAO DOS SERVICOS PRESTADOS', cy);
  const dBox = box(cy, 42);
  txt(n(discrimin), M + 12, cy - 14, { font: bold, size: 9.5, color: NAVY, maxWidth: CW - 24 });
  txt(`Codigo do Servico: ${svcCode}`, M + 12, cy - 30, { size: 8.5, color: TEXT_SEC });
  txt(`Aliquota ISS: ${(aliq * 100).toFixed(2).replace('.', ',')}%`, M + 240, cy - 30, { size: 8.5, color: TEXT_SEC });
  cy = dBox - 10;

  // ════════════════════════════════════════════════════════════════
  // VALORES E TRIBUTOS
  // ════════════════════════════════════════════════════════════════
  cy = sectionHdr('DEMONSTRATIVO DE VALORES E TRIBUTOS', cy);
  const vBox = box(cy, 48);
  const col = CW / 3;

  // Background highlights for columns
  rect(M + col * 2, cy, col, 48, INDIGO_BG, BORDER_DK, 0.5);

  field('Valor Total dos Servicos', fmtBRL(valor), M + 12, cy - 8, { large: true, bold: true, color: NAVY });
  field(`ISS (${(aliq * 100).toFixed(2).replace('.', ',')}%)`, fmtBRL(valorIss), M + 12 + col, cy - 8, { color: TEXT_SEC });
  field('VALOR LIQUIDO DA NOTA', fmtBRL(valorLiq), M + 12 + col * 2, cy - 8, { large: true, bold: true, color: INDIGO });
  cy = vBox - 10;

  // ════════════════════════════════════════════════════════════════
  // CÓDIGO DE VERIFICAÇÃO / AUTENTICIDADE
  // ════════════════════════════════════════════════════════════════
  cy = sectionHdr('CODIGO DE VERIFICACAO E AUTENTICIDADE', cy);
  const cvH = codVerif ? 72 : 48;
  
  if (codVerif) {
    rect(M, cy, CW, cvH, GREEN_BG, GREEN_BRD, 1.2);
    
    // Left decorative status pill
    rect(M + 12, cy - 12, 100, 18, GREEN, GREEN);
    txt('AUTENTICADA', M + 24, cy - 24, { font: bold, size: 8, color: WHITE });

    txt('Codigo de Verificacao:', M + 120, cy - 24, { font: bold, size: 9, color: NAVY });
    txt(codVerif, M + 230, cy - 24, { font: mono, size: 12, color: INDIGO });
    
    txt('Para verificar a autenticidade deste documento no portal oficial da Prefeitura de Barueri:', M + 12, cy - 44, { size: 8, color: TEXT_SEC });
    txt(`Acesse www.barueri.sp.gov.br/nfe  |  Inscricao Municipal: ${n(schoolIm)}  |  Nota: ${nfseNum}`, M + 12, cy - 58, { font: bold, size: 8, color: NAVY });
  } else {
    rect(M, cy, CW, cvH, AMBER_BG, AMBER, 0.8);
    txt('DOCUMENTO PROVISORIO (AGUARDANDO CODIGO DE VERIFICACAO)', M + 12, cy - 16, { font: bold, size: 9, color: AMBER });
    txt('Este lote RPS foi transmitido para a Prefeitura de Barueri. O codigo de autenticidade estara disponivel em breve.', M + 12, cy - 34, { size: 8, color: TEXT_SEC, maxWidth: CW - 24 });
  }
  cy -= cvH + 12;

  // ════════════════════════════════════════════════════════════════
  // FOOTER
  // ════════════════════════════════════════════════════════════════
  rule(cy, BORDER_DK);
  cy -= 8;
  txt('Este documento e uma representacao grafica da Nota Fiscal de Servicos Eletronica (NFS-e) emitida via sistema de integracao da Prefeitura de Barueri.', M, cy - 10, { size: 7.5, color: TEXT_SEC, maxWidth: CW });
  txt('O documento original pode ser consultado no portal municipal da Prefeitura de Barueri (www.barueri.sp.gov.br/nfe).', M, cy - 20, { size: 7.5, color: TEXT_SEC, maxWidth: CW });
  txt(`Documento gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, M, cy - 34, { size: 7.5, color: TEXT_SEC });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
