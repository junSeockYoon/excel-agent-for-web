/**
 * Deterministic sheet computations — never invent numbers for the model.
 */

export function toNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function findColumn(sheet, token) {
  if (!token) return null;
  const t = String(token).trim().toLowerCase();
  return (
    (sheet.columns || []).find(
      (c) =>
        c.key.toLowerCase() === t ||
        c.header.toLowerCase() === t ||
        c.header.toLowerCase().includes(t) ||
        t.includes(c.header.toLowerCase()),
    ) || null
  );
}

export function numericColumns(sheet) {
  return (sheet.columns || []).filter((c) => c.inferredType === 'number');
}

export function stringColumns(sheet) {
  return (sheet.columns || []).filter(
    (c) => c.inferredType === 'string' || c.inferredType === 'boolean',
  );
}

function valuesWithIndex(sheet, colKey) {
  const out = [];
  (sheet.rows || []).forEach((row, rowIndex) => {
    const n = toNumber(row[colKey]);
    if (n !== null) out.push({ rowIndex, value: n, row });
  });
  return out;
}

export function computeAggregate(sheet, { metric, columnKey, topN = 5, direction = 'desc' }) {
  const col = (sheet.columns || []).find((c) => c.key === columnKey);
  if (!col) {
    return { ok: false, reason: 'COLUMN_NOT_FOUND' };
  }

  const pairs = valuesWithIndex(sheet, columnKey);
  if (!pairs.length) {
    return {
      ok: false,
      reason: 'NO_NUMERIC_VALUES',
      column: { key: col.key, header: col.header },
    };
  }

  const values = pairs.map((p) => p.value);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sortedAsc = [...pairs].sort((a, b) => a.value - b.value);
  const sortedDesc = [...pairs].sort((a, b) => b.value - a.value);

  const evidenceFrom = (list) =>
    list.map((p) => ({
      rowIndex: p.rowIndex,
      rowLabel: p.rowIndex + 1,
      columns: [{ key: col.key, header: col.header }],
      value: p.value,
    }));

  if (metric === 'sum' || metric === 'avg' || metric === 'count' || metric === 'min' || metric === 'max') {
    const minRows = pairs.filter((p) => p.value === min).slice(0, 5);
    const maxRows = pairs.filter((p) => p.value === max).slice(0, 5);
    let evidence = [];
    if (metric === 'min') evidence = evidenceFrom(minRows);
    else if (metric === 'max') evidence = evidenceFrom(maxRows);
    else if (metric === 'sum' || metric === 'avg' || metric === 'count') {
      evidence = evidenceFrom(pairs.slice(0, Math.min(8, pairs.length)));
    }

    return {
      ok: true,
      kind: 'aggregate',
      column: { key: col.key, header: col.header },
      metric,
      result: {
        count: values.length,
        sum: Number(sum.toFixed(6)),
        avg: Number(avg.toFixed(6)),
        min,
        max,
        value:
          metric === 'sum'
            ? Number(sum.toFixed(6))
            : metric === 'avg'
              ? Number(avg.toFixed(6))
              : metric === 'min'
                ? min
                : metric === 'max'
                  ? max
                  : values.length,
      },
      evidence,
      table: {
        columns: ['지표', '값'],
        rows: [
          ['개수', values.length],
          ['합계', Number(sum.toFixed(4))],
          ['평균', Number(avg.toFixed(4))],
          ['최소', min],
          ['최대', max],
        ],
      },
    };
  }

  if (metric === 'rank' || metric === 'topn' || metric === 'bottomn') {
    const n = Math.max(1, Math.min(Number(topN) || 5, 20));
    const list =
      metric === 'bottomn' || direction === 'asc' ? sortedAsc.slice(0, n) : sortedDesc.slice(0, n);
    const labelCols = (sheet.columns || []).slice(0, 3);
    return {
      ok: true,
      kind: 'ranking',
      column: { key: col.key, header: col.header },
      metric,
      topN: n,
      direction: metric === 'bottomn' ? 'asc' : 'desc',
      result: list.map((p, i) => ({
        rank: i + 1,
        rowIndex: p.rowIndex,
        rowLabel: p.rowIndex + 1,
        value: p.value,
        preview: Object.fromEntries(labelCols.map((c) => [c.header, p.row[c.key]])),
      })),
      evidence: evidenceFrom(list),
      table: {
        columns: ['순위', '행', col.header, ...labelCols.filter((c) => c.key !== col.key).map((c) => c.header).slice(0, 2)],
        rows: list.map((p, i) => {
          const extras = labelCols
            .filter((c) => c.key !== col.key)
            .slice(0, 2)
            .map((c) => p.row[c.key]);
          return [i + 1, p.rowIndex + 1, p.value, ...extras];
        }),
      },
    };
  }

  if (metric === 'outlier') {
    // simple IQR outliers
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor((sorted.length - 1) * 0.25)];
    const q3 = sorted[Math.floor((sorted.length - 1) * 0.75)];
    const iqr = q3 - q1;
    const low = q1 - 1.5 * iqr;
    const high = q3 + 1.5 * iqr;
    const outliers = pairs.filter((p) => p.value < low || p.value > high);
    return {
      ok: true,
      kind: 'outlier',
      column: { key: col.key, header: col.header },
      metric: 'outlier',
      result: {
        q1,
        q3,
        iqr: Number(iqr.toFixed(6)),
        low: Number(low.toFixed(6)),
        high: Number(high.toFixed(6)),
        outliers: outliers.map((p) => ({
          rowIndex: p.rowIndex,
          rowLabel: p.rowIndex + 1,
          value: p.value,
        })),
      },
      evidence: evidenceFrom(outliers.slice(0, 12)),
      table: {
        columns: ['행', col.header],
        rows: outliers.slice(0, 12).map((p) => [p.rowIndex + 1, p.value]),
      },
    };
  }

  return { ok: false, reason: 'UNSUPPORTED_METRIC' };
}

export function filterRows(sheet, { columnKey, equals, contains }) {
  const col = (sheet.columns || []).find((c) => c.key === columnKey);
  if (!col) return { ok: false, reason: 'COLUMN_NOT_FOUND' };
  const rows = [];
  (sheet.rows || []).forEach((row, rowIndex) => {
    const v = row[col.key];
    if (v == null) return;
    const s = String(v);
    if (equals != null && s === String(equals)) rows.push({ rowIndex, row });
    else if (contains != null && s.toLowerCase().includes(String(contains).toLowerCase())) {
      rows.push({ rowIndex, row });
    }
  });
  return {
    ok: true,
    kind: 'filter',
    column: { key: col.key, header: col.header },
    matchCount: rows.length,
    evidence: rows.slice(0, 12).map((r) => ({
      rowIndex: r.rowIndex,
      rowLabel: r.rowIndex + 1,
      columns: [{ key: col.key, header: col.header }],
    })),
    table: {
      columns: ['행', ...(sheet.columns || []).slice(0, 4).map((c) => c.header)],
      rows: rows.slice(0, 12).map((r) => [
        r.rowIndex + 1,
        ...(sheet.columns || []).slice(0, 4).map((c) => r.row[c.key]),
      ]),
    },
  };
}

export function summarizeSheet(sheet) {
  const nums = numericColumns(sheet).map((c) => {
    const agg = computeAggregate(sheet, { metric: 'sum', columnKey: c.key });
    return {
      header: c.header,
      key: c.key,
      stats: agg.ok ? agg.result : null,
    };
  });
  return {
    ok: true,
    kind: 'summary',
    rowCount: sheet.rowCount,
    columnCount: sheet.columnCount,
    numeric: nums,
    categorical: stringColumns(sheet).map((c) => c.header),
  };
}
