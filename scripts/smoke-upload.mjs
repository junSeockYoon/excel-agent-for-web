import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const filePath = path.join(root, 'sample.xlsx');

const form = new FormData();
form.append(
  'file',
  new Blob([fs.readFileSync(filePath)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }),
  path.basename(filePath),
);

const up = await fetch('http://localhost:3000/api/upload', {
  method: 'POST',
  body: form,
});
const uploadJson = await up.json();
console.log('UPLOAD', up.status, JSON.stringify(uploadJson, null, 2));
if (!up.ok) process.exit(1);

const sid = uploadJson.sessionId;
const headers = { 'X-Session-Id': sid };

const sheets = await (await fetch('http://localhost:3000/api/sheets', { headers })).json();
console.log(
  'SHEETS',
  JSON.stringify(
    sheets.sheets.map((s) => ({ id: s.id, name: s.name, rows: s.rowCount })),
    null,
    2,
  ),
);

const rows = await (
  await fetch(
    `http://localhost:3000/api/sheets/${sheets.activeSheetId}/rows?offset=0&limit=10`,
    { headers },
  )
).json();
console.log('ROWS', rows.total, rows.rows);

const sheet2 = sheets.sheets[1].id;
await fetch('http://localhost:3000/api/session/active-sheet', {
  method: 'PUT',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ sheetId: sheet2 }),
});

const rows2 = await (
  await fetch(`http://localhost:3000/api/sheets/${sheet2}/rows?offset=0&limit=10`, {
    headers,
  })
).json();
console.log('SHEET2', rows2.total, rows2.rows);

const proxied = await (await fetch('http://localhost:5173/api/health')).json();
console.log('PROXY', proxied);
console.log('SMOKE_OK');
