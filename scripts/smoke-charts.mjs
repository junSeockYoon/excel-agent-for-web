import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildDistributions } from '../server/services/distributions.js';
import { chartDataFromStructured } from '../client/src/utils/chartData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const base = process.env.SMOKE_BASE || 'http://localhost:3000';

// Unit: sample-like sheet
const sampleSheet = {
  id: 's1',
  name: '매출',
  rowCount: 4,
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
const d1 = buildDistributions(sampleSheet);
if (!d1.charts.length) throw new Error('expected charts for sample');
console.log(
  'SAMPLE_CHARTS',
  d1.charts.map((c) => `${c.header}:${c.items.map((i) => i.name + '=' + i.count).join(',')}`),
);

const catSheet = {
  id: 's2',
  name: '시트1',
  rowCount: 6,
  columns: [
    { key: '구분', header: '구분', inferredType: 'string' },
    { key: '프로그램명', header: '프로그램명', inferredType: 'string' },
    { key: '경로', header: '경로', inferredType: 'string' },
  ],
  rows: [
    { 구분: 'java', 프로그램명: 'A', 경로: 'bgs/a/' },
    { 구분: 'java', 프로그램명: 'B', 경로: 'bgs/a/' },
    { 구분: 'js', 프로그램명: 'C', 경로: 'bgs/b/' },
    { 구분: 'java', 프로그램명: 'D', 경로: 'bgs/b/' },
    { 구분: null, 프로그램명: 'E', 경로: 'bgs/c/' },
    { 구분: 'js', 프로그램명: 'F', 경로: 'bgs/a/' },
  ],
};
const d2 = buildDistributions(catSheet);
const headers = d2.charts.map((c) => c.header);
if (!headers.includes('구분') && !headers.includes('경로')) {
  throw new Error('preferred categorical headers missing: ' + headers.join(','));
}
console.log('CAT_CHARTS', headers);

const rankingStructured = {
  kind: 'ranking',
  table: {
    columns: ['순위', '행', '매출', '이름'],
    rows: [
      [1, 3, 1500, '박준호'],
      [2, 1, 1200, '김민수'],
      [3, 2, 980, '이서연'],
    ],
  },
};
const mini = chartDataFromStructured(rankingStructured);
if (!mini?.length || mini[0].value !== 1500) throw new Error('mini ranking chart failed');
console.log('MINI_OK', mini);

// Live API
async function upload(filePath) {
  const form = new FormData();
  form.append(
    'file',
    new Blob([fs.readFileSync(filePath)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    path.basename(filePath),
  );
  const up = await fetch(`${base}/api/upload`, { method: 'POST', body: form });
  const body = await up.json();
  if (!up.ok) throw new Error(JSON.stringify(body));
  return body;
}

const sampleUp = await upload(path.join(root, 'sample.xlsx'));
const dist1 = await (
  await fetch(`${base}/api/sheets/${sampleUp.activeSheetId}/distributions`, {
    headers: { 'X-Session-Id': sampleUp.sessionId },
  })
).json();
console.log('LIVE_SAMPLE', (dist1.charts || []).map((c) => c.header));

const catPath = path.join(root, 'sample-categorical.xlsx');
if (fs.existsSync(catPath)) {
  const catUp = await upload(catPath);
  const dist2 = await (
    await fetch(`${base}/api/sheets/${catUp.activeSheetId}/distributions`, {
      headers: { 'X-Session-Id': catUp.sessionId },
    })
  ).json();
  console.log(
    'LIVE_CATEGORICAL',
    (dist2.charts || []).map((c) => ({
      h: c.header,
      n: c.items.length,
      top: c.items[0],
    })),
  );
  if (!(dist2.charts || []).length) throw new Error('categorical sheet produced no charts');
} else {
  console.log('NO_CATEGORICAL_FILE');
}

console.log('SMOKE_OK_CHARTS');
