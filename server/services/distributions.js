/**
 * Build top-value distributions for categorical columns.
 */

const PREFERRED_HEADERS = [
  '구분',
  '경로',
  '프로그램',
  '프로그램명',
  '유형',
  '상태',
  '부서',
  '카테고리',
  '분류',
  '항목',
  '코드',
  '이름',
];

function isEmpty(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

/** Spreadsheet-style category columns often leave blanks to mean "same as above". */
function valuesForColumn(rows, key, { forwardFill = false } = {}) {
  const out = [];
  let last = null;
  for (const row of rows) {
    let v = row[key];
    if (isEmpty(v)) {
      if (forwardFill && last != null) v = last;
      else {
        out.push(null);
        continue;
      }
    } else {
      v = String(v);
      last = v;
    }
    out.push(v);
  }
  return out;
}

function uniqueCountFromValues(values) {
  const set = new Set();
  let nonNull = 0;
  for (const v of values) {
    if (v == null) continue;
    nonNull += 1;
    set.add(String(v));
  }
  return { unique: set.size, nonNull, empty: values.length - nonNull };
}

function shouldForwardFill(col, rows) {
  const header = String(col.header || '');
  if (!['구분', '유형', '분류', '카테고리', '상태'].some((h) => header.includes(h))) {
    return false;
  }
  let empty = 0;
  for (const row of rows) if (isEmpty(row[col.key])) empty += 1;
  return empty / Math.max(1, rows.length) >= 0.25;
}

function scoreColumn(col, rows) {
  const header = String(col.header || '');
  const ff = shouldForwardFill(col, rows);
  const values = valuesForColumn(rows, col.key, { forwardFill: ff });
  const { unique, nonNull } = uniqueCountFromValues(values);
  if (nonNull < 2) return -1;
  if (unique < 1) return -1;
  // Skip ID-like / all-distinct columns
  if (unique >= nonNull && nonNull >= 3) return -1;
  if (unique > Math.min(40, Math.max(8, nonNull * 0.85))) return -1;

  let score = 0;
  const preferred = PREFERRED_HEADERS.some((p) => header === p || header.includes(p));
  if (col.inferredType === 'string' || col.inferredType === 'boolean') score += 5;
  if (col.inferredType === 'number' && !preferred) return -1;

  for (const pref of PREFERRED_HEADERS) {
    if (header === pref) score += 12;
    else if (header.includes(pref)) score += 8;
  }

  if (unique >= 2 && unique <= 12) score += 6;
  else if (unique <= 20) score += 3;
  else score += 1;

  score += Math.min(3, Math.floor(nonNull / 20));
  return score;
}

function topValues(rows, key, limit = 8, { forwardFill = false } = {}) {
  const values = valuesForColumn(rows, key, { forwardFill });
  const counts = new Map();
  let empty = 0;
  for (const v of values) {
    if (v == null) {
      empty += 1;
      continue;
    }
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const items = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
  if (!forwardFill && empty > 0 && empty >= Math.max(2, Math.floor((rows.length || 0) * 0.05))) {
    items.push({ name: '(비어 있음)', count: empty });
    items.sort((a, b) => b.count - a.count);
  }
  const total = items.reduce((s, i) => s + i.count, 0);
  return items.map((i) => ({
    ...i,
    pct: total ? Number(((i.count / total) * 100).toFixed(1)) : 0,
  }));
}

/**
 * @returns {{ sheetId, charts: Array<{ key, header, totalDistinct, items }> }}
 */
export function buildDistributions(sheet, { maxCharts = 3, topN = 8 } = {}) {
  const rows = sheet.rows || [];
  const columns = sheet.columns || [];
  const ranked = columns
    .map((col) => ({ col, score: scoreColumn(col, rows) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.col.header.localeCompare(b.col.header, 'ko'));

  const charts = ranked.slice(0, maxCharts).map(({ col }) => {
    const forwardFill = shouldForwardFill(col, rows);
    const items = topValues(rows, col.key, topN, { forwardFill });
    const values = valuesForColumn(rows, col.key, { forwardFill });
    const { unique } = uniqueCountFromValues(values);
    return {
      key: col.key,
      header: col.header,
      inferredType: col.inferredType,
      totalDistinct: unique,
      forwardFill,
      items,
      chartType: items.length <= 5 ? 'pie' : 'bar',
    };
  });

  return {
    sheetId: sheet.id,
    sheetName: sheet.name,
    rowCount: sheet.rowCount,
    charts,
  };
}
