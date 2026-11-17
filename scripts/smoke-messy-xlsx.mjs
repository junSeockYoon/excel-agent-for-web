import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseWorkbook } from '../server/services/excelParser.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('OK', msg);
}

// Regression: simple workbook
const simple = parseWorkbook(path.join(root, 'sample.xlsx'), 'sample.xlsx');
assert(simple.sheets.s1.columns.map((c) => c.header).join(',') === '이름,부서,매출', 'sample headers');
assert(simple.sheets.s1.rowCount === 4, 'sample row count');
assert(simple.sheets.s1.rows[0]['이름'] === '김민수', 'sample first name');

const messyPath = path.join(root, 'course-survey-2026-2.xlsx');
assert(fs.existsSync(messyPath), 'messy sample present');
const messy = parseWorkbook(messyPath, 'course-survey-2026-2.xlsx');
const sheet = messy.sheets[messy.activeSheetId];
assert(sheet.name.includes('2026'), 'active sheet is course survey');
assert(sheet.headerRow === 6, `header row detected (got ${sheet.headerRow})`);
const headers = sheet.columns.map((c) => c.header);
assert(headers.includes('이름'), 'has 이름');
assert(headers.includes('학년'), 'has 학년');
assert(
  headers.some((h) => h.startsWith('심리학에게묻다')),
  'course column from real header row',
);
assert(!headers.includes('수강자 수'), 'did not use banner as header');
assert(!headers.some((h) => /^열\s*1$/.test(h) && headers[0] === '0'), 'no bogus 0 header');
assert(!headers.includes('26'), 'numeric banner count not used as header');
assert(sheet.rowCount >= 50, `enough data rows (got ${sheet.rowCount})`);
const jun = sheet.rows.find((r) => String(r['이름'] || '').includes('윤준석'));
assert(jun, 'finds 윤준석 row');
assert(String(jun['학년']).includes('4'), '윤준석 grade');
assert(
  Object.values(jun).some((v) => String(v || '').includes('AI리터러시')),
  '윤준석 course cell preserved',
);

console.log('SMOKE_OK_MESSY_XLSX', {
  headerRow: sheet.headerRow,
  cols: sheet.columnCount,
  rows: sheet.rowCount,
  headers: headers.slice(0, 8),
});
