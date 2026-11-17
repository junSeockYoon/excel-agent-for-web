import { env } from '../config/env.js';

function nullRatio(rows, key) {
  if (!rows.length) return 1;
  let n = 0;
  for (const row of rows) {
    const v = row[key];
    if (v === null || v === undefined || v === '') n += 1;
  }
  return Number((n / rows.length).toFixed(3));
}

function numericStats(rows, key) {
  const nums = [];
  for (const row of rows) {
    const v = row[key];
    if (typeof v === 'number' && Number.isFinite(v)) nums.push(v);
    else if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
      nums.push(Number(v));
    }
  }
  if (!nums.length) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    count: nums.length,
    min: Math.min(...nums),
    max: Math.max(...nums),
    avg: Number((sum / nums.length).toFixed(4)),
  };
}

function categoricalTopK(rows, key, k = 5) {
  const counts = new Map();
  for (const row of rows) {
    const v = row[key];
    if (v === null || v === undefined || v === '') continue;
    const s = String(v);
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([value, count]) => ({ value, count }));
}

function findMentionedColumns(question, columns) {
  const q = String(question || '').toLowerCase();
  if (!q) return [];
  return columns.filter((col) => {
    const header = String(col.header || '').toLowerCase();
    const key = String(col.key || '').toLowerCase();
    return (header && q.includes(header)) || (key && q.includes(key));
  });
}

function trimToBudget(text, maxChars) {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, Math.max(0, maxChars - 20))}\n…[context truncated]`,
    truncated: true,
  };
}

function rowPayload(row, columns, rowIndex0) {
  const obj = { row: rowIndex0 + 1 };
  for (const col of columns) obj[col.header] = row[col.key];
  return obj;
}

/**
 * Build a compact CONTEXT block — never dump the full sheet.
 */
export function buildContextPack({
  sheet,
  question,
  history = [],
  intent = null,
  toolResult = null,
  followUp = null,
  workbookSummary = null,
  sheetTarget = null,
}) {
  const sampleN = Math.min(Math.max(env.chatSampleRows, 1), 100);
  const maxChars = env.chatMaxContextChars;
  const historyTurns = env.chatHistoryTurns;

  const columns = sheet.columns || [];
  const rows = sheet.rows || [];
  const allowedRowIndexes = [];

  const schema = columns.map((col) => ({
    key: col.key,
    header: col.header,
    inferredType: col.inferredType,
    nullRatio: nullRatio(rows, col.key),
  }));

  const stats = {};
  for (const col of columns) {
    if (col.inferredType === 'number') {
      const n = numericStats(rows, col.key);
      if (n) stats[col.header] = { type: 'number', ...n };
    } else if (col.inferredType === 'string' || col.inferredType === 'boolean') {
      const top = categoricalTopK(rows, col.key, 5);
      if (top.length) stats[col.header] = { type: 'categorical', top };
    }
  }

  const sampleRows = [];
  for (let i = 0; i < Math.min(sampleN, rows.length); i += 1) {
    sampleRows.push(rowPayload(rows[i], columns, i));
    allowedRowIndexes.push(i);
  }

  // Always allow tool evidence rows
  if (toolResult?.evidence) {
    for (const ev of toolResult.evidence) {
      if (typeof ev.rowIndex === 'number' && !allowedRowIndexes.includes(ev.rowIndex)) {
        allowedRowIndexes.push(ev.rowIndex);
      }
    }
  }

  const mentioned = findMentionedColumns(question, columns);
  let questionSlice = null;
  if (mentioned.length) {
    const keys = mentioned.map((c) => c.key);
    const extra = [];
    for (let i = sampleN; i < Math.min(sampleN + 20, rows.length); i += 1) {
      const obj = { row: i + 1 };
      for (const col of columns) {
        if (keys.includes(col.key)) obj[col.header] = rows[i][col.key];
      }
      extra.push(obj);
      if (!allowedRowIndexes.includes(i)) allowedRowIndexes.push(i);
    }
    if (extra.length) {
      questionSlice = {
        columns: mentioned.map((c) => c.header),
        rows: extra,
      };
    }
  }

  const recentHistory = history.slice(-historyTurns).map((m) => ({
    role: m.role,
    content: String(m.content || '').slice(0, 2000),
  }));

  const multiSheet = Boolean(sheetTarget?.multi && sheetTarget?.mode === 'all');
  const groundingMeta = {
    sheetId: sheet.id,
    sheetName: sheet.name,
    sheetTarget: sheetTarget
      ? { mode: sheetTarget.mode, label: sheetTarget.label }
      : null,
    totalRows: sheet.rowCount,
    sampleRowCount: sampleRows.length,
    columnsUsed: columns.map((c) => c.header),
    mentionedColumns: mentioned.map((c) => c.header),
    intent: intent?.intent || null,
    note: multiSheet
      ? '여러 시트를 대상으로 답합니다. 근거 칩에 시트명이 표시될 수 있습니다.'
      : toolResult?.ok
        ? `서버가 계산한 TOOL_RESULT를 근거로 설명합니다. 시트「${sheet.name}」 ${sheet.rowCount}행.`
        : `시트「${sheet.name}」 ${sheet.rowCount}행 중 샘플 ${sampleRows.length}행과 요약을 근거로 합니다.`,
  };

  const parts = [
    '### CONTEXT',
    `active_or_primary_sheet: ${sheet.name}`,
    `sheet_target: ${JSON.stringify(sheetTarget || { mode: 'single', label: sheet.name })}`,
    `row_count: ${sheet.rowCount}`,
    `column_count: ${sheet.columnCount}`,
    `available_columns: ${columns.map((c) => c.header).join(', ')}`,
    `row_index_note: sample_rows[].row 및 TOOL_RESULT.evidence.rowLabel 은 데이터 행 번호(1부터).`,
    `intent: ${JSON.stringify(intent || {})}`,
    `columns: ${JSON.stringify(schema)}`,
    `stats: ${JSON.stringify(stats)}`,
    `sample_rows (first ${sampleRows.length}): ${JSON.stringify(sampleRows)}`,
  ];
  if (workbookSummary?.length) {
    parts.push(`workbook_sheets: ${JSON.stringify(workbookSummary)}`);
  }
  if (followUp?.isFollowUp) {
    parts.push(`follow_up_resolved_from: ${JSON.stringify(followUp)}`);
  }
  if (toolResult) {
    parts.push(`TOOL_RESULT (authoritative numbers — do NOT recompute or invent): ${JSON.stringify(toolResult)}`);
  }
  if (questionSlice) {
    parts.push(`question_linked_slice: ${JSON.stringify(questionSlice)}`);
  }
  if (recentHistory.length) {
    parts.push(`recent_chat: ${JSON.stringify(recentHistory)}`);
  }
  parts.push('### QUESTION');
  parts.push(String(question || '').trim());
  parts.push('### OUTPUT RULES');
  parts.push('한국어로 짧게 설명하세요. TOOL_RESULT가 있으면 그 숫자만 사용하세요.');
  parts.push('CONTEXT에 없는 컬럼·숫자는 절대 만들지 마세요. 없으면 “데이터에 없습니다”라고 하세요.');
  parts.push(
    '본문은 GitHub-flavored Markdown으로 쓰세요: ## 제목, - 불릿, **굵게**, 표(| col |) 가능. HTML 태그는 쓰지 마세요.',
  );
  parts.push('수치 요약 예: **합계**: 4400 또는 - **평균**: 1100');
  if (multiSheet) {
    parts.push(
      '여러 시트면 근거에 sheet 이름을 넣으세요: <<<EVIDENCE[{"sheet":"시트명","row":1,"columns":["컬럼"]}]>>>',
    );
  } else {
    parts.push('마지막 줄에만: <<<EVIDENCE[{"row":1,"columns":["컬럼헤더"]}]>>>');
  }
  parts.push('TOOL_RESULT.evidence의 rowLabel만 인용. 없으면 <<<EVIDENCE[]>>>');

  const raw = parts.join('\n');
  const { text, truncated } = trimToBudget(raw, maxChars);
  groundingMeta.contextTruncated = truncated;
  groundingMeta.contextChars = text.length;

  return {
    userContent: text,
    groundingMeta,
    allowedRowIndexes,
  };
}

export const SYSTEM_PROMPT = `너는 업로드된 스프레드시트 조수다.
제공된 CONTEXT와 TOOL_RESULT 밖의 숫자를 지어내지 마라.
없는 컬럼을 만들어내지 마라. 모르면 “데이터에 없습니다”라고 하라.
답변 본문은 한국어 Markdown으로 간결하게 작성한다:
- ## 짧은 제목 (필요할 때만)
- - 불릿으로 핵심 수치
- **지표명**: 값 형식 권장
HTML 태그는 쓰지 않는다.
근거 행은 sample_rows/TOOL_RESULT에 있는 row 번호만 사용한다.
여러 시트를 다룰 때는 evidence에 sheet 이름을 넣는다.
반드시 답변 맨 끝에 <<<EVIDENCE[...]>>> 블록을 붙인다.
민감 개인정보는 요약만 한다.`;
