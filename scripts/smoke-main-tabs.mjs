import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'client/src/App.jsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'client/src/styles/theme.css'), 'utf8');

const checks = [
  [/mainView === 'table'/, app, 'table tab branch'],
  [/mainView === 'analysis'/, app, 'analysis tab branch'],
  [/setMainView\('table'\)/, app, 'evidence forces table tab'],
  [/role="tablist"/, app, 'tablist a11y'],
  [/>\s*표\s*</, app, 'Korean 표 label'],
  [/>\s*분석\s*</, app, 'Korean 분석 label'],
  [/\.main-view-pane/, css, 'pane fills viewport'],
  [/\.table-pane/, css, 'table pane'],
  [/\.analysis-pane/, css, 'analysis pane'],
];

let failed = false;
for (const [re, hay, label] of checks) {
  if (!re.test(hay)) {
    console.error('FAIL', label);
    failed = true;
  } else {
    console.log('OK', label);
  }
}
if (failed) process.exit(1);

const base = process.env.SMOKE_BASE || 'http://localhost:3000';
const form = new FormData();
form.append(
  'file',
  new Blob([fs.readFileSync(path.join(root, 'sample.xlsx'))], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }),
  'sample.xlsx',
);
const up = await (await fetch(`${base}/api/upload`, { method: 'POST', body: form })).json();
const headers = { 'X-Session-Id': up.sessionId };
const rows = await (
  await fetch(`${base}/api/sheets/${up.activeSheetId}/rows?offset=0&limit=5`, { headers })
).json();
const dist = await (
  await fetch(`${base}/api/sheets/${up.activeSheetId}/distributions`, { headers })
).json();
console.log('API_OK rows', rows.total, 'charts', (dist.charts || []).length);
console.log('SMOKE_OK_MAIN_TABS');
