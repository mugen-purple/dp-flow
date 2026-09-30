const fs = require('node:fs/promises');
const pdfParse = require('pdf-parse');

const documentColumns = ['ASO', 'NR12', 'NR18', 'NR35', 'OS', 'EPI', 'APR'];

function normalizeSpace(value) {
  return value.replace(/[\u00a0\u2007\u202f\s]+/g, ' ').trim();
}

function normalizeEmployeeName(value) {
  return normalizeSpace(String(value || ''))
    .replace(/^(?:CAMP|DESLIGADO|EXCLUIDO|INATIVO|ATIVO)\s+/i, '')
    .replace(/\s+(?:CPF|CNPJ|Cargo|Função|Admissão|Nascimento|Data de admissão)\b.*$/i, '')
    .trim();
}

function stripHtml(value) {
  return value.replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/tr\s*>/gi, '\n').replace(/<\/p\s*>/gi, '\n').replace(/<\/div\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#39;/g, "'").replace(/&quot;/gi, '"');
}

function normalizeCpf(value) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}` : value;
}

function parseMoney(value) {
  const normalized = value.includes(',') && value.includes('.') ? value.replace(/\./g, '').replace(',', '.') : value.replace(',', '.');
  return Number(normalized) || 0;
}

function toIsoDate(value) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!match) return '';
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2]}-${match[1]}`;
}

function parseEmployeeLine(line, row) {
  const match = line.match(/^(Ativo|Inativo)\s*(?:Completo|Simplificado|Resumido)?\s*(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})(.+?)(\d{2}\/\d{2}\/\d{4})(.*)$/i);
  if (!match) return null;
  const [, situation, cpf, name, birthDate, remainder] = match;
  const admissionMatch = remainder.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (!admissionMatch) return { row, name: normalizeEmployeeName(name), cpf, issue: 'Data de admissão não encontrada.' };
  const afterAdmission = remainder.slice(admissionMatch.index + admissionMatch[1].length).trim();
  const salaryMatch = afterAdmission.match(/(\d+[.,]\d{2})/);
  const roleMatch = afterAdmission.match(/\d+[.,]\d{2}\s+(.+?)\s+\d{2}:\d{2}/);
  return { row, name: normalizeEmployeeName(name), cpf: normalizeCpf(cpf), role: roleMatch ? normalizeSpace(roleMatch[1]) : '', salaryBase: salaryMatch ? parseMoney(salaryMatch[1]) : 0, admissionDate: toIsoDate(admissionMatch[1]), employmentStatus: situation.toLowerCase() === 'ativo' ? 'ACTIVE' : 'INACTIVE', notes: `Nascimento: ${birthDate} | Situação no relatório: ${situation} | Dados do relatório: ${normalizeSpace(remainder)}` };
}

function parseExternalTableText(text) {
  const cpfMatches = [...text.matchAll(/\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}/g)];
  if (!cpfMatches.length) return null;
  const candidates = [];
  const warnings = [];
  cpfMatches.forEach((cpfMatch, index) => {
    const previousEnd = index ? cpfMatches[index - 1].index + cpfMatches[index - 1][0].length : 0;
    let prefix = text.slice(previousEnd, cpfMatch.index);
    const headerEnd = prefix.toUpperCase().lastIndexOf('APR');
    if (!index && headerEnd >= 0) prefix = prefix.slice(headerEnd + 3);
    const dates = [...prefix.matchAll(/\d{2}\/\d{2}\/\d{2,4}/g)];
    const birthMatch = dates.at(-2);
    const admissionMatch = dates.at(-1);
    const row = index + 1;
    if (!birthMatch || !admissionMatch) {
      warnings.push({ row, issue: 'Nascimento ou data de admissão não encontrada.' });
      return;
    }
    const previousDate = dates.at(-3);
    const nameStart = previousDate ? previousDate.index + previousDate[0].length : 0;
    const nameField = normalizeSpace(prefix.slice(nameStart, birthMatch.index));
    const status = nameField.match(/^(CAMP|DESLIGADO|EXCLUIDO|INATIVO|ATIVO)\b/i)?.[1] || '';
    const name = normalizeEmployeeName(nameField);
    const suffix = text.slice(cpfMatch.index + cpfMatch[0].length, cpfMatches[index + 1]?.index ?? text.length);
    const firstDateIndex = suffix.search(/\d{2}\/\d{2}\/\d{2,4}/);
    const firstPhoneIndex = suffix.search(/(?:\+?\d{1,3}\s*)?\(?\d{2}\)?[\s-]*\d{4,5}[\s-]*\d{4}/);
    const roleEnds = [firstDateIndex, firstPhoneIndex].filter((value) => value >= 0);
    const roleEnd = roleEnds.length ? Math.min(...roleEnds) : suffix.length;
    const role = normalizeSpace(suffix.slice(0, roleEnd).replace(/^OK\s*/i, ''));
    const documentDates = [...suffix.slice(roleEnd).matchAll(/\d{2}\/\d{2}\/\d{2,4}/g)].map((match) => toIsoDate(match[0])).filter(Boolean);
    if (!name || !toIsoDate(admissionMatch[0])) {
      warnings.push({ row, issue: 'Nome ou data de admissão não reconhecidos.' });
      return;
    }
    const documentIndexes = [0, 1, 2, 3, 6, 7, 8];
    candidates.push({ row, name, cpf: normalizeCpf(cpfMatch[0]), role, salaryBase: 0, admissionDate: toIsoDate(admissionMatch[0]), employmentStatus: /DESLIGADO|EXCLUIDO|INATIVO/i.test(status) ? 'INACTIVE' : 'ACTIVE', notes: `Nascimento: ${birthMatch[0]} | Situação no relatório: ${status || 'não informada'}`, documents: documentColumns.map((type, documentIndex) => ({ type, issuedDate: documentDates[documentIndexes[documentIndex]] || '' })) });
  });
  return candidates.length ? { candidates, warnings } : null;
}

function parseEmployeeText(text) {
  const normalizedText = normalizeSpace(text);
  const companyMatch = normalizedText.match(/^(.+?)\s+-\s+Folha\s+-\s+Grid/i);
  const externalResult = parseExternalTableText(text);
  if (externalResult) {
    const seen = new Set();
    externalResult.candidates.forEach((candidate) => { if (seen.has(candidate.cpf)) externalResult.warnings.push({ row: candidate.row, issue: `CPF duplicado no arquivo: ${candidate.cpf}.` }); seen.add(candidate.cpf); });
    return { ...externalResult, companyName: companyMatch ? companyMatch[1].trim() : '', extractedTextLength: text.length };
  }
  const candidates = [];
  const warnings = [];
  const rowMatches = [...normalizedText.matchAll(/(Ativo|Inativo)\s*(?:Completo|Simplificado|Resumido)?\s*\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}/gi)];
  rowMatches.forEach((match, index) => {
    const candidate = parseEmployeeLine(normalizedText.slice(match.index, rowMatches[index + 1]?.index ?? normalizedText.length), index + 1);
    if (!candidate) warnings.push({ row: index + 1, issue: 'Linha de funcionário não reconhecida.' });
    else if (candidate.issue) warnings.push({ row: candidate.row, issue: candidate.issue });
    else candidates.push(candidate);
  });
  const seen = new Set();
  candidates.forEach((candidate) => { if (seen.has(candidate.cpf)) warnings.push({ row: candidate.row, issue: `CPF duplicado no arquivo: ${candidate.cpf}.` }); seen.add(candidate.cpf); });
  if (!candidates.length) throw new Error(`Nenhum funcionário foi encontrado no arquivo. Verifique se o documento contém texto selecionável, CPF e datas de nascimento/admissão. Texto extraído: ${text.length} caracteres. Início: ${normalizedText.slice(0, 180) || 'nenhum texto foi extraído'}`);
  return { candidates, warnings, companyName: companyMatch ? companyMatch[1].trim() : '', extractedTextLength: text.length };
}

async function parseEmployeeFile(filePath) {
  const extension = filePath.toLowerCase().split('.').pop();
  let text;
  if (extension === 'pdf') text = (await pdfParse(await fs.readFile(filePath))).text;
  else {
    text = await fs.readFile(filePath, 'utf8');
    if (extension === 'html' || extension === 'htm') text = stripHtml(text);
  }
  return parseEmployeeText(text);
}

async function parseEmployeePdf(filePath) { return parseEmployeeFile(filePath); }

module.exports = { parseEmployeeFile, parseEmployeePdf, parseEmployeeText };
