import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildEvidence } from '../server/services/evidence.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const filePath = path.join(root, 'sample.xlsx');
const base = process.env.SMOKE_BASE || 'http://localhost:3000';

// Local parser unit check (no secrets)
{
  const sheet = {
    rows: [{ a: 1 }, { a: 2 }, { a: 3 }],
    columns: [
      { key: 'a', header: '매출' },
      { key: 'b', header: '부서' },
    ],
  };
  const raw =
    '가장 큰 매출은 행 3입니다.\n<<<EVIDENCE[{"row":3,"columns":["매출"]},{"row":99,"columns":["매출"]}]>>>';
  const parsed = buildEvidence({
    answer: raw,
    sheet,
    allowedRowIndexes: [0, 1, 2],
  });
  if (parsed.answer.includes('EVIDENCE')) throw new Error('strip failed');
  if (parsed.evidence.length !== 1 || parsed.evidence[0].rowIndex !== 2) {
    throw new Error('validate failed: ' + JSON.stringify(parsed.evidence));
  }
  if (parsed.evidence[0].columns[0].key !== 'a') throw new Error('column map failed');
  console.log('PARSER_OK');
}

const status = await (await fetch(`${base}/api/chat/status`)).json();
console.log('CHAT_STATUS', status);
if (!status.configured) {
  console.log('SMOKE_SKIP_NO_KEY');
  process.exit(0);
}

const form = new FormData();
form.append(
  'file',
  new Blob([fs.readFileSync(filePath)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }),
  path.basename(filePath),
);

const up = await fetch(`${base}/api/upload`, { method: 'POST', body: form });
const uploadJson = await up.json();
if (!up.ok) {
  console.error(uploadJson);
  process.exit(1);
}
const sid = uploadJson.sessionId;
const headers = {
  'X-Session-Id': sid,
  'Content-Type': 'application/json',
};

const chatRes = await fetch(`${base}/api/chat`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    message:
      '매출이 가장 큰 사람은 누구야? 해당 데이터 행 번호와 매출 컬럼을 근거로 들어줘.',
    sheetId: uploadJson.activeSheetId,
  }),
});
const chatJson = await chatRes.json();
console.log('CHAT_HTTP', chatRes.status);
console.log(
  'EVIDENCE',
  JSON.stringify(chatJson.evidence || [], null, 2),
);
console.log('ANSWER_SNIP', String(chatJson.answer || '').slice(0, 180));

if (!chatRes.ok) process.exit(1);
if (!Array.isArray(chatJson.evidence)) {
  console.error('missing evidence array');
  process.exit(1);
}

// Prefer at least one evidence chip for this question; soft-fail with note if model omitted
if (!chatJson.evidence.length) {
  console.log('SMOKE_OK_NO_EVIDENCE_CHIPS');
  process.exit(0);
}

const first = chatJson.evidence[0];
const rows = await (
  await fetch(
    `${base}/api/sheets/${uploadJson.activeSheetId}/rows?offset=0&limit=100`,
    { headers: { 'X-Session-Id': sid } },
  )
).json();
const row = rows.rows[first.rowIndex];
if (!row) {
  console.error('evidence row out of page', first);
  process.exit(1);
}
console.log('ROW_AT_EVIDENCE', row);
console.log('SMOKE_OK_EVIDENCE');
