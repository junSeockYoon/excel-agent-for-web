import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { parseWorkbook } from '../server/services/excelParser.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'course-survey-2026-2.xlsx');
const buf = fs.readFileSync(file);
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });

console.log('SHEETS', wb.SheetNames);
for (const name of wb.SheetNames) {
  const sh = wb.Sheets[name];
  const ref = sh['!ref'];
  const merges = sh['!merges'] || [];
  console.log('\n===', name, 'ref', ref, 'merges', merges.length);
  const matrix = XLSX.utils.sheet_to_json(sh, {
    header: 1,
    defval: null,
    raw: false,
    blankrows: true,
  });
  console.log('raw matrix rows', matrix.length, 'maxCols', Math.max(0, ...matrix.map((r) => r.length)));
  for (let i = 0; i < Math.min(25, matrix.length); i += 1) {
    const row = matrix[i] || [];
    const filled = row.filter((c) => c !== null && String(c).trim() !== '').length;
    const preview = row.slice(0, 12).map((c) => {
      if (c === null || c === undefined) return '';
      const s = String(c).replace(/\s+/g, ' ').trim();
      return s.length > 24 ? `${s.slice(0, 24)}…` : s;
    });
    console.log(`R${i + 1} filled=${filled}`, JSON.stringify(preview));
  }
  if (merges.length) {
    console.log(
      'merge samples',
      merges.slice(0, 15).map((m) => `${XLSX.utils.encode_range(m)}`),
    );
  }
}

console.log('\n=== CURRENT PARSER ===');
const parsed = parseWorkbook(file, 'course-survey-2026-2.xlsx');
for (const id of parsed.sheetOrder) {
  const s = parsed.sheets[id];
  console.log(id, s.name, 'cols', s.columnCount, 'rows', s.rowCount);
  console.log(
    'headers',
    s.columns.map((c) => c.header).slice(0, 15),
  );
  if (s.rows[0]) console.log('row0', JSON.stringify(s.rows[0]).slice(0, 300));
}
