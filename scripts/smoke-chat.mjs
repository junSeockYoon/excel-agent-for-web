import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const filePath = path.join(root, 'sample.xlsx');
const base = process.env.SMOKE_BASE || 'http://localhost:3000';

const status = await (await fetch(`${base}/api/chat/status`)).json();
console.log('CHAT_STATUS', status);

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
  console.error('UPLOAD_FAIL', uploadJson);
  process.exit(1);
}
const sid = uploadJson.sessionId;
const headers = {
  'X-Session-Id': sid,
  'Content-Type': 'application/json',
};
console.log('UPLOADED', sid, uploadJson.activeSheetId);

const chatRes = await fetch(`${base}/api/chat`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    message: '매출 컬럼의 합계와 평균을 알려줘. 근거 컬럼도 말해줘.',
    sheetId: uploadJson.activeSheetId,
  }),
});
const chatJson = await chatRes.json();
console.log('CHAT_HTTP', chatRes.status);
console.log('CHAT_BODY', JSON.stringify(chatJson, null, 2));

if (!status.configured) {
  if (chatRes.status === 503 && chatJson?.error?.code === 'DEEPSEEK_NOT_CONFIGURED') {
    console.log('SMOKE_OK_MISSING_KEY');
    process.exit(0);
  }
  console.error('Expected DEEPSEEK_NOT_CONFIGURED when key missing');
  process.exit(1);
}

if (!chatRes.ok || !chatJson.answer) {
  console.error('CHAT_FAIL');
  process.exit(1);
}
console.log('SMOKE_OK_LIVE_CHAT');
