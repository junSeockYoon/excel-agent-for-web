import { findColumn, numericColumns, stringColumns } from './sheetAggregates.js';

const INTENTS = [
  'summary',
  'aggregate',
  'ranking',
  'outlier',
  'explain',
  'filter',
  'followup',
  'clarify',
];

function detectMetric(q) {
  if (/합계|총합|총액|sum\b/i.test(q)) return 'sum';
  if (/평균|avg|average/i.test(q)) return 'avg';
  if (/최소|최저|min\b/i.test(q)) return 'min';
  if (/최대|최고|가장\s*큰|가장\s*많|max\b/i.test(q)) return 'max';
  if (/개수|몇\s*개|건수|count/i.test(q)) return 'count';
  if (/이상치|outlier|특이/i.test(q)) return 'outlier';
  if (/하위|낮은|bottom/i.test(q)) return 'bottomn';
  if (/상위|탑|top|랭킹|순위|가장/i.test(q)) return 'topn';
  return null;
}

function detectTopN(q, fallback = 5) {
  const m =
    q.match(/(?:상위|탑|top|하위|bottom)\s*(\d+)/i) ||
    q.match(/(\d+)\s*개/) ||
    q.match(/top\s*-?\s*(\d+)/i);
  if (m) return Math.max(1, Math.min(20, Number(m[1])));
  return fallback;
}

function mentionedColumns(q, sheet) {
  const found = [];
  for (const col of sheet.columns || []) {
    const header = String(col.header || '');
    if (!header) continue;
    if (q.includes(header) || q.toLowerCase().includes(header.toLowerCase())) {
      found.push(col);
    }
  }
  return found;
}

function looksLikeFollowUp(q) {
  if (/^(그건|그거|그것|방금|아까|그럼|그러면|그리고|이어서|대신|그\s*중|중에서)/.test(q)) {
    return true;
  }
  // Short modifier-only follow-ups: 「상위 3개만」
  if (
    q.length <= 20 &&
    /^(상위|하위|탑|top)\s*\d+/i.test(q) &&
    !/(합계|평균|최소|최대|컬럼|열)/.test(q)
  ) {
    return true;
  }
  return false;
}

/**
 * Resolve short follow-ups against prior chatContext.
 */
export function resolveFollowUpMessage(message, chatContext) {
  const q = String(message || '').trim();
  if (!chatContext?.lastQuestion) return { message: q, isFollowUp: false };

  if (!looksLikeFollowUp(q) && !/^(그건|그거|그것|그럼)/.test(q)) {
    return { message: q, isFollowUp: false };
  }

  const parts = [chatContext.lastQuestion];
  if (/상위\s*\d+|탑\s*\d+|top\s*\d+/i.test(q)) {
    parts.push(q);
  } else if (/하위|낮은/.test(q)) {
    parts.push(q);
  } else if (/합계|평균|최대|최소|개수/.test(q) && chatContext.lastColumnHeader) {
    parts.push(`${chatContext.lastColumnHeader} ${q}`);
  } else {
    parts.push(q);
  }

  return {
    message: parts.join(' → '),
    isFollowUp: true,
    resolvedFrom: chatContext.lastQuestion,
  };
}

/**
 * Rule-based intent classification.
 */
export function classifyIntent({ message, sheet, chatContext }) {
  const q = String(message || '').trim();
  const cols = mentionedColumns(q, sheet);
  const nums = numericColumns(sheet);
  const strs = stringColumns(sheet);
  const metric = detectMetric(q);
  const topN = detectTopN(q, chatContext?.lastTopN || 5);

  let intent = 'explain';
  if (/요약|한눈에|전체\s*설명|overview|summary/i.test(q)) intent = 'summary';
  else if (metric === 'outlier' || /이상치/.test(q)) intent = 'outlier';
  else if (metric === 'topn' || metric === 'bottomn' || /순위|랭킹|상위|하위/.test(q)) {
    intent = 'ranking';
  } else if (metric === 'sum' || metric === 'avg' || metric === 'min' || metric === 'max' || metric === 'count') {
    intent = 'aggregate';
  }   else if (
    (/필터|해당하는|인\s*행|같은|만\s*보여/.test(q) && (cols.length || strs.length)) ||
    (/별\s*건수|값별|분포/.test(q) && (cols.length || strs.length))
  ) {
    intent = 'filter';
  } else if (/왜|설명|의미|해석/.test(q)) intent = 'explain';

  // Explicit unknown column token near a metric word → refuse later
  let missingColumn = null;
  const near = q.match(
    /([A-Za-z가-힣0-9_]{2,})\s*(?:의\s*)?(합계|평균|최소|최대|합|상위|하위|이상치|건수)/,
  );
  if (near) {
    const token = near[1];
    const stop = new Set(['그것', '그거', '전체', '숫자', '값', '이번', '해당', '관련']);
    if (!stop.has(token) && !findColumn(sheet, token)) {
      missingColumn = token;
    }
  }

  // Column resolution
  let column = cols[0] || null;
  if (
    !column &&
    chatContext?.lastColumnKey &&
    (intent === 'aggregate' ||
      intent === 'ranking' ||
      intent === 'outlier' ||
      looksLikeFollowUp(q))
  ) {
    column =
      findColumn(sheet, chatContext.lastColumnKey) ||
      findColumn(sheet, chatContext.lastColumnHeader);
  }
  if (
    !column &&
    !missingColumn &&
    nums.length === 1 &&
    (intent === 'aggregate' || intent === 'ranking' || intent === 'outlier')
  ) {
    column = nums[0];
  }

  if (missingColumn && (intent === 'aggregate' || intent === 'ranking' || intent === 'outlier')) {
    return {
      intent: 'ungrounded',
      metric: metric || 'sum',
      topN,
      column: null,
      missingColumn,
      candidates: nums.map((c) => ({ key: c.key, header: c.header })),
      clarifyQuestion: null,
      mentionedColumns: cols.map((c) => c.header),
      rawQuestion: q,
    };
  }

  // Filter value guess: quoted token or known categorical value from question
  let filterEquals = null;
  const quoted = q.match(/[‘'"]([^’'"]+)[’'"]/);
  if (quoted) filterEquals = quoted[1];

  // Ambiguity: aggregate/ranking/outlier without column and multiple numeric cols
  const needsColumn = intent === 'aggregate' || intent === 'ranking' || intent === 'outlier';
  const ambiguous =
    needsColumn &&
    !column &&
    nums.length > 1 &&
    !/모든|전체\s*숫자|각\s*컬럼/.test(q);

  // Unknown column name mentioned?
  const invented = [];
  const colHints = q.match(/[A-Za-z가-힣_]{2,}(?:\s*컬럼|\s*열)?/g) || [];
  // skip — rely on refuse in prompt; clarifying covers missing metric column

  if (ambiguous) {
    return {
      intent: 'clarify',
      metric: metric || 'sum',
      topN,
      column: null,
      candidates: nums.map((c) => ({ key: c.key, header: c.header })),
      clarifyQuestion: `어떤 숫자 열을 기준으로 할까요? (${nums.map((c) => c.header).join(', ')})`,
      mentionedColumns: cols.map((c) => c.header),
      rawQuestion: q,
    };
  }

  // Filter without clear column/value → clarify lightly
  if (intent === 'filter' && !column && !filterEquals) {
    // try match categorical value inside question
    for (const sc of strs) {
      for (const row of (sheet.rows || []).slice(0, 200)) {
        const v = row[sc.key];
        if (v != null && q.includes(String(v))) {
          column = sc;
          filterEquals = String(v);
          break;
        }
      }
      if (column) break;
    }
  }

  return {
    intent,
    metric:
      intent === 'ranking'
        ? metric === 'bottomn'
          ? 'bottomn'
          : 'topn'
        : intent === 'outlier'
          ? 'outlier'
          : metric || (intent === 'aggregate' ? 'sum' : null),
    topN,
    column: column ? { key: column.key, header: column.header } : null,
    filterEquals,
    mentionedColumns: cols.map((c) => c.header),
    candidates: [],
    clarifyQuestion: null,
    rawQuestion: q,
    intents: INTENTS,
  };
}
