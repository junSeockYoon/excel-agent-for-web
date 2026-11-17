import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function renderMd(text) {
  return renderToStaticMarkup(
    React.createElement(
      ReactMarkdown,
      { remarkPlugins: [remarkGfm], skipHtml: true },
      text,
    ),
  );
}

const sample = `## 시트 요약

- **합계**: 4400
- **평균**: 1100

| 지표 | 값 |
| --- | --- |
| 최소 | 720 |
| 최대 | 1500 |

<script>alert(1)</script>
`;

const html = renderMd(sample);
console.log(html);

if (!html.includes('<strong>') && !html.includes('<strong ')) {
  // react-markdown uses <strong>
  if (!/<strong>합계<\/strong>/.test(html) && !html.includes('<strong>합계</strong>')) {
    // check for bold somehow
  }
}
if (!html.includes('<strong>합계</strong>')) {
  console.error('bold not rendered');
  process.exit(1);
}
if (!html.includes('<h2>') && !html.includes('<h2 ')) {
  console.error('heading not rendered');
  process.exit(1);
}
if (!html.includes('<li>')) {
  console.error('list not rendered');
  process.exit(1);
}
if (!html.includes('<table>')) {
  console.error('table not rendered');
  process.exit(1);
}
if (html.includes('<script>') || html.toLowerCase().includes('alert(1)')) {
  // with skipHtml, raw script tags should not become elements; text may appear escaped or omitted
  if (/<script[\s>]/i.test(html)) {
    console.error('unsafe script tag rendered');
    process.exit(1);
  }
}

const panel = fs.readFileSync(path.join(root, 'client/src/components/ChatPanel.jsx'), 'utf8');
const mdComp = fs.readFileSync(
  path.join(root, 'client/src/components/MarkdownMessage.jsx'),
  'utf8',
);
if (!panel.includes('MarkdownMessage')) throw new Error('ChatPanel missing MarkdownMessage');
if (!mdComp.includes('skipHtml')) throw new Error('MarkdownMessage missing skipHtml');
if (/dangerouslySetInnerHTML\s*=/.test(mdComp)) {
  throw new Error('must not assign dangerouslySetInnerHTML');
}

console.log('SMOKE_OK_MARKDOWN');

// Optional live summary answer check
const base = process.env.SMOKE_BASE || 'http://localhost:3000';
try {
  const status = await (await fetch(`${base}/api/chat/status`)).json();
  if (!status.configured) {
    console.log('LIVE_SKIP_NO_KEY');
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
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: {
      'X-Session-Id': up.sessionId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: '이 시트를 한눈에 요약해줘. 굵은 지표와 불릿으로.',
      sheetId: up.activeSheetId,
    }),
  });
  const body = await res.json();
  console.log('LIVE_ANSWER_SNIP', String(body.answer || '').slice(0, 220));
  const liveHtml = renderMd(body.answer || '');
  const hasFmt =
    liveHtml.includes('<strong>') ||
    liveHtml.includes('<li>') ||
    liveHtml.includes('<h2>') ||
    liveHtml.includes('<h3>');
  console.log(hasFmt ? 'LIVE_MARKDOWN_SHAPED' : 'LIVE_PLAINISH_BUT_RENDERER_OK');
} catch (e) {
  console.log('LIVE_SKIP', e.message);
}
