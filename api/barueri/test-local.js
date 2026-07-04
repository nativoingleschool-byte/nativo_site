import {
  buildHeaderRow,
  buildDetailRow,
  buildFooterRow,
  generatePositionalString,
  formatDiscriminacao
} from './utils.js';

function runTests() {
  console.log('--- RUNNING LOCAL ALIGNMENT TESTS (RPS LAYOUT V4.4) ---');

  // Test 1: Helper numeric padding
  const numericPadded = generatePositionalString(10.25, 'numeric', 15);
  console.log(`Numeric (Money) padding check (expected 000000000001025): ${numericPadded}`);
  if (numericPadded !== '000000000001025') {
    throw new Error('Numeric padding failed');
  }

  // Test 2: Helper text padding and normalization
  const textPadded = generatePositionalString('Ação de Graças! ç', 'text', 20);
  console.log(`Text padding and normalization check (expected "ACAO DE GRACAS! C   "): "${textPadded}"`);
  if (textPadded !== 'ACAO DE GRACAS! C   ') {
    throw new Error('Text normalization/padding failed');
  }

  // Test 3: Discrimination formatting
  const formattedDisc = formatDiscriminacao('A'.repeat(150));
  console.log(`Discrimination formatting visual break check (length: ${formattedDisc.length}):`);
  console.log(`First 120 chars: "${formattedDisc.substring(0, 120)}"`);
  if (formattedDisc.charAt(100) !== '|') {
    throw new Error('Discrimination visual pipe break missing at index 100');
  }
  if (formattedDisc.length !== 1000) {
    throw new Error(`Discrimination length mismatch: expected 1000, got ${formattedDisc.length}`);
  }

  // Test 4: Header line alignment
  const header = buildHeaderRow('1234567', 15);
  console.log(`Header Row length: ${header.length} characters (Payload: ${header.replace('\r\n', '').length})`);
  if (header.replace('\r\n', '').length !== 25) {
    throw new Error(`Header payload length invalid: expected 25, got ${header.replace('\r\n', '').length}`);
  }
  if (!header.endsWith('\r\n')) {
    throw new Error('Header missing CRLF terminator');
  }

  // Test 5: Detail line alignment
  const detail = buildDetailRow({
    rpsSerie: 'RPS',
    rpsNumero: '1234',
    dataEmissao: '20260705',
    codigoServico: '02685',
    valorServico: 340.00,
    tomadorCpfCnpj: '123.456.789-00',
    tomadorNome: 'MOCK STUDENT NAME',
    tomadorLogradouro: 'MOCK STREET, 123',
    tomadorBairro: 'MOCK DISTRICT',
    tomadorCidade: 'BARUERI',
    tomadorUf: 'SP',
    tomadorCep: '06401-000',
    tomadorEmail: 'mock@student.com',
    discriminacaoServico: 'TEST SERVICE EMISSION'
  });
  console.log(`Detail Row length: ${detail.length} characters (Payload: ${detail.replace('\r\n', '').length})`);
  if (detail.replace('\r\n', '').length !== 1970) {
    throw new Error(`Detail payload length invalid: expected 1970, got ${detail.replace('\r\n', '').length}`);
  }
  if (!detail.endsWith('\r\n')) {
    throw new Error('Detail missing CRLF terminator');
  }

  // Test 6: Footer line alignment
  const footer = buildFooterRow(3, 340.00);
  console.log(`Footer Row length: ${footer.length} characters (Payload: ${footer.replace('\r\n', '').length})`);
  if (footer.replace('\r\n', '').length !== 38) {
    throw new Error(`Footer payload length invalid: expected 38, got ${footer.replace('\r\n', '').length}`);
  }
  if (!footer.endsWith('\r\n')) {
    throw new Error('Footer missing CRLF terminator');
  }

  console.log('\nALL ALIGNMENT TESTS PASSED PERFECTLY!');
}

runTests();
