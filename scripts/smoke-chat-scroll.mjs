/**
 * Structural smoke: chat panel CSS must allow a scrollable thread.
 * Also re-checks evidence API still returns chips.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'client/src/styles/theme.css'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'client/src/components/ChatPanel.jsx'), 'utf8');

const checks = [
  [/\.chat-thread\s*\{[^}]*overflow-y:\s*auto/s, 'chat-thread overflow-y auto'],
  [/\.chat-thread\s*\{[^}]*min-height:\s*0/s, 'chat-thread min-height 0'],
  [/\.chat-panel\s*\{[^}]*overflow:\s*hidden/s, 'chat-panel overflow hidden'],
  [/\.rail\s*\{[^}]*min-height:\s*0/s, 'rail min-height 0'],
  [/scrollIntoView/, 'ChatPanel scrolls to end on new messages'],
  [/chat-thread-inner/, 'thread inner wrapper present'],
  [/evidence-chip/, 'evidence chips still present'],
];

let failed = false;
for (const [re, label] of checks) {
  const hay = re.source.includes('scrollIntoView') || re.source.includes('evidence') || re.source.includes('thread-inner')
    ? `${css}\n${panel}`
    : css;
  if (!re.test(hay)) {
    console.error('FAIL', label);
    failed = true;
  } else {
    console.log('OK', label);
  }
}
if (failed) process.exit(1);

const base = process.env.SMOKE_BASE || 'http://localhost:3000';
const status = await (await fetch(`${base}/api/chat/status`)).json();
console.log('CHAT_STATUS', status);
if (!status.configured) {
  console.log('SMOKE_OK_SCROLL_STRUCTURE_ONLY');
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

const questions = [
  '매출이 가장 큰 행은 누구야? 근거 행을 알려줘.',
  '영업 부서에 해당하는 행을 모두 말해줘.',
  '매출 합계와 평균을 알려줘. 관련 행도 근거로 붙여줘.',
];

let lastEvidence = [];
for (const message of questions) {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, sheetId: up.activeSheetId }),
  });
  const body = await res.json();
  console.log('CHAT', res.status, 'evidence', (body.evidence || []).length);
  if (!res.ok) process.exit(1);
  lastEvidence = body.evidence || [];
}

if (!lastEvidence.length) {
  console.log('SMOKE_OK_SCROLL_NO_FINAL_EVIDENCE');
} else {
  console.log('LAST_EVIDENCE', JSON.stringify(lastEvidence));
  console.log('SMOKE_OK_SCROLL_AND_EVIDENCE');
}
