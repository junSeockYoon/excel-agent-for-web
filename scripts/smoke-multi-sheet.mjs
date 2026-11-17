import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSheetTarget } from '../server/services/sheetTarget.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const base = process.env.SMOKE_BASE || 'http://localhost:3000';

const fakeSession = {
  activeSheetId: 's1',
  sheetOrder: ['s1', 's2'],
  sheets: {
    s1: {
      id: 's1',
      name: '매출',
      rowCount: 4,
      columnCount: 3,
      columns: [{ header: '매출' }],
      rows: [],
    },
    s2: {
      id: 's2',
      name: '품목',
      rowCount: 2,
      columnCount: 2,
      columns: [{ header: '코드' }],
      rows: [],
    },
  },
};

const tActive = resolveSheetTarget('합계 알려줘', fakeSession, 's1');
if (tActive.mode !== 'single' || tActive.sheetIds[0] !== 's1') {
  throw new Error('default active failed');
}
const tNamed = resolveSheetTarget('품목 시트 요약해줘', fakeSession, 's1');
if (tNamed.sheetIds[0] !== 's2') throw new Error('named sheet failed');
const tAll = resolveSheetTarget('모든 시트 요약해줘', fakeSession, 's1');
if (tAll.mode !== 'all' || tAll.sheetIds.length !== 2) throw new Error('all sheets failed');
const tOther = resolveSheetTarget('다른 시트도 요약해줘', fakeSession, 's1');
if (tOther.mode !== 'all') throw new Error('other sheets failed');
console.log('TARGET_OK');

const form = new FormData();
form.append(
  'file',
  new Blob([fs.readFileSync(path.join(root, 'sample.xlsx'))], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }),
  'sample.xlsx',
);
const up = await (await fetch(`${base}/api/upload`, { method: 'POST', body: form })).json();
const headers = { 'X-Session-Id': up.sessionId, 'Content-Type': 'application/json' };
console.log('UPLOADED', up.sheets?.map((s) => s.name));

const sheets = await (await fetch(`${base}/api/sheets`, { headers })).json();
if ((sheets.sheets || []).length < 2) throw new Error('expected multi-sheet workbook');

const sheetB = sheets.sheets[1].id;
await fetch(`${base}/api/session/active-sheet`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ sheetId: sheetB }),
});
const distB = await (
  await fetch(`${base}/api/sheets/${sheetB}/distributions`, {
    headers: { 'X-Session-Id': up.sessionId },
  })
).json();
console.log('SWITCHED', sheets.sheets[1].name, 'charts', (distB.charts || []).length);

async function ask(message, sheetId = sheetB) {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, sheetId }),
  });
  const body = await res.json();
  console.log(
    'ASK',
    message,
    '→',
    res.status,
    'target',
    body.sheetTarget?.mode,
    body.sheetTarget?.label,
    'ev',
    (body.evidence || []).length,
  );
  if (!res.ok) {
    console.error(body);
    process.exit(1);
  }
  return body;
}

const status = await (await fetch(`${base}/api/chat/status`)).json();
if (!status.configured) {
  console.log('SMOKE_OK_MULTI_SHEET_OFFLINE');
  process.exit(0);
}

// Active sheet is 품목 after switch — ask about 매출 by name
const a1 = await ask('매출 시트를 한눈에 요약해줘');
if (a1.sheetTarget?.label !== '매출' && a1.sheetId !== 's1') {
  console.log('named target', a1.sheetTarget, a1.sheetId);
}

const a2 = await ask('다른 시트도 요약해줘');
if (a2.sheetTarget?.mode !== 'all') throw new Error('expected all-sheet target');
if (a2.structured?.kind !== 'summary') console.log('structured', a2.structured?.kind);

const a3 = await ask('매출 합계와 평균을 알려줘');
console.log(
  'EVIDENCE_SAMPLE',
  (a3.evidence || []).slice(0, 2).map((e) => ({
    sheet: e.sheetName,
    show: e.showSheet,
    row: e.rowLabel,
  })),
);
if ((a3.evidence || []).some((e) => e.showSheet && !e.sheetName)) {
  throw new Error('multi-sheet evidence missing sheetName');
}

console.log('SMOKE_OK_MULTI_SHEET');
