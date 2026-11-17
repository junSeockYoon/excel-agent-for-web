import fs from 'fs';
import * as XLSX from 'xlsx';

const file = process.argv[2] || 'sample.xlsx';
const buf = fs.readFileSync(file);
const wb = XLSX.read(buf, { type: 'buffer' });
for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null });
  console.log('---', name, 'rows', rows.length);
  console.log('header', rows[0]);
  console.log('sample', rows.slice(1, 4));
}
