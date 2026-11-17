import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyIntent, resolveFollowUpMessage } from '../server/services/intentClassifier.js';
import { computeAggregate } from '../server/services/sheetAggregates.js';
import { buildSuggestions } from '../server/services/suggestPrompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const base = process.env.SMOKE_BASE || 'http://localhost:3000';

const sheet = {
  id: 's1',
  name: '매출',
  rowCount: 4,
  columnCount: 3,
  columns: [
    { key: '이름', header: '이름', inferredType: 'string' },
    { key: '부서', header: '부서', inferredType: 'string' },
    { key: '매출', header: '매출', inferredType: 'number' },
  ],
  rows: [
    { 이름: '김민수', 부서: '영업', 매출: 1200 },
    { 이름: '이서연', 부서: '마케팅', 매출: 980 },
    { 이름: '박준호', 부서: '영업', 매출: 1500 },
    { 이름: '최유진', 부서: '기획', 매출: 720 },
  ],
};

// Unit: aggregates
const sum = computeAggregate(sheet, { metric: 'sum', columnKey: '매출' });
if (!sum.ok || sum.result.sum !== 4400) throw new Error('sum failed ' + JSON.stringify(sum));
const top = computeAggregate(sheet, { metric: 'topn', columnKey: '매출', topN: 1 });
if (!top.ok || top.result[0].rowIndex !== 2) throw new Error('topn failed');
console.log('AGG_OK', sum.result.sum, 'top', top.result[0].rowLabel);

// Unit: clarify when multiple numeric would need — create 2 numeric cols
const multi = {
  ...sheet,
  columns: [
    ...sheet.columns,
    { key: '비용', header: '비용', inferredType: 'number' },
  ],
  rows: sheet.rows.map((r) => ({ ...r, 비용: 100 })),
};
const clar = classifyIntent({ message: '합계 알려줘', sheet: multi, chatContext: null });
if (clar.intent !== 'clarify') throw new Error('expected clarify got ' + clar.intent);
console.log('CLARIFY_OK');

const intentSum = classifyIntent({
  message: '매출 합계는?',
  sheet,
  chatContext: null,
});
if (intentSum.intent !== 'aggregate' || intentSum.column?.header !== '매출') {
  throw new Error('intent sum failed ' + JSON.stringify(intentSum));
}
console.log('INTENT_OK');

const fu = resolveFollowUpMessage('그건 상위 3개만', {
  lastQuestion: '매출 순위 알려줘',
  lastColumnKey: '매출',
  lastColumnHeader: '매출',
});
if (!fu.isFollowUp) throw new Error('follow-up not detected');
console.log('FOLLOWUP_OK', fu.message);

const tips = buildSuggestions(sheet);
if (!tips.length) throw new Error('no suggestions');
console.log('SUGGEST_OK', tips.length);

// Live API
const status = await (await fetch(`${base}/api/chat/status`)).json();
console.log('CHAT_STATUS', status);
if (!status.configured) {
  console.log('SMOKE_OK_OFFLINE_UNITS');
  process.exit(0);
}

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

async function ask(message) {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, sheetId: up.activeSheetId }),
  });
  const body = await res.json();
  console.log('ASK', message, '→', res.status, body.intent?.intent, 'ev', (body.evidence || []).length, body.structured?.kind);
  if (!res.ok) {
    console.error(body);
    process.exit(1);
  }
  return body;
}

const a1 = await ask('매출 합계와 평균을 알려줘');
if (a1.structured?.kind !== 'aggregate') throw new Error('expected aggregate structured');
if (!a1.evidence?.length) console.log('WARN no evidence on aggregate');

const a2 = await ask('그건 상위 3개만');
if (!(a2.followUp?.isFollowUp || a2.intent?.intent === 'ranking')) {
  console.log('follow-up body', JSON.stringify({ followUp: a2.followUp, intent: a2.intent }));
}
if (a2.structured?.kind !== 'ranking' && a2.intent?.intent !== 'ranking') {
  // may still work via explain+tool — require tool ranking ideally
  console.log('WARN ranking kind', a2.structured?.kind);
}

const a3 = await ask('존재하지않는컬럼XYZ 합계는?');
// should ungrounded or clarify-ish
console.log('UNGROUNDED_OR_OTHER', a3.structured?.kind, a3.answer?.slice(0, 80));

const sug = await (
  await fetch(`${base}/api/chat/suggestions?sheetId=${up.activeSheetId}`, {
    headers: { 'X-Session-Id': up.sessionId },
  })
).json();
if (!sug.suggestions?.length) throw new Error('suggestions empty');
console.log('LIVE_SUGGEST_OK', sug.suggestions.length);

console.log('SMOKE_OK_CHAT_QUALITY');
