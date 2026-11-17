import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { formatDateCell, sanitizeCell } from '../server/utils/sanitize.js';
import { parseWorkbook } from '../server/services/excelParser.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK', msg);
}

// Unit: Date / ISO → clean local strings, no Z/millis
const noon = new Date(2026, 2, 15, 14, 30, 0); // local
assert(sanitizeCell(noon) === '2026-03-15 14:30', `datetime local (${sanitizeCell(noon)})`);
assert(sanitizeCell(new Date(2026, 2, 15)) === '2026-03-15', 'date only');
assert(
  !String(sanitizeCell(new Date(2026, 2, 15))).includes('Z'),
  'no Z suffix',
);
assert(
  sanitizeCell('2024-01-02T00:00:00.000Z') === formatDateCell('2024-01-02T00:00:00.000Z'),
  'ISO string normalized',
);
assert(!String(sanitizeCell('2024-06-01T12:00:00.000Z')).includes('.000'), 'no millis');
assert(sanitizeCell(1200) === 1200, 'plain number unchanged');
assert(sanitizeCell('영업') === '영업', 'plain text unchanged');

// Build a tiny workbook with Excel date/time cells
const wbPath = path.join(root, 'tmp-dates-smoke.xlsx');
const wb = XLSX.utils.book_new();
const aoa = [
  ['이름', '일자', '시각', '금액'],
  ['김민수', new Date(2026, 0, 5), new Date(1899, 11, 30, 9, 30, 0), 1200],
  ['이서연', new Date(2026, 0, 6, 18, 45, 0), new Date(1899, 11, 30, 13, 0, 0), 980],
];
const sheet = XLSX.utils.aoa_to_sheet(aoa);
// aoa_to_sheet already encodes Date as Excel serial + date format;
// do not force t:'d' (that treats the serial as unix ms).
XLSX.utils.book_append_sheet(wb, sheet, '일정');
XLSX.writeFile(wb, wbPath);

const parsed = parseWorkbook(wbPath, 'tmp-dates-smoke.xlsx');
const rows = parsed.sheets[parsed.activeSheetId].rows;
assert(rows.length === 2, 'date sheet rows');
assert(rows[0]['일자'] === '2026-01-05', `date col (${rows[0]['일자']})`);
assert(
  typeof rows[0]['일자'] === 'string' && !rows[0]['일자'].includes('Z'),
  'date not ISO-Z',
);
assert(
  typeof rows[1]['일자'] === 'string' && !String(rows[1]['일자']).includes('.000'),
  'datetime no millis',
);
assert(rows[0]['금액'] === 1200, 'number intact');
assert(rows[0]['이름'] === '김민수', 'text intact');
console.log('date smoke rows', rows);

// Regression samples
const sample = parseWorkbook(path.join(root, 'sample.xlsx'), 'sample.xlsx');
assert(sample.sheets.s1.rows[0]['매출'] === 1200, 'sample.xlsx number');
assert(sample.sheets.s1.rows[0]['이름'] === '김민수', 'sample.xlsx text');

const messy = path.join(root, 'course-survey-2026-2.xlsx');
if (fs.existsSync(messy)) {
  const m = parseWorkbook(messy, 'course-survey-2026-2.xlsx');
  const s = m.sheets[m.activeSheetId];
  assert(s.columns.some((c) => c.header === '이름'), 'messy still has 이름');
  assert(s.rowCount >= 50, 'messy row count');
  const ugly = s.rows.some((r) =>
    Object.values(r).some(
      (v) => typeof v === 'string' && /\d{4}-\d{2}-\d{2}T.*Z/.test(v),
    ),
  );
  assert(!ugly, 'messy has no ISO-Z cells');
  console.log('OK messy regression');
}

try {
  fs.unlinkSync(wbPath);
} catch {
  /* ignore */
}

console.log('SMOKE_OK_DATES');
