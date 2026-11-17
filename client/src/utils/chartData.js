/**
 * Build chart data from chat structured blocks (ranking / frequency tables).
 */
export function chartDataFromStructured(structured) {
  if (!structured) return null;
  const table = structured.table;
  if (!table?.rows?.length || !table.columns?.length) {
    if (structured.metrics?.length >= 2) {
      return structured.metrics.slice(0, 6).map((m) => ({
        name: String(m.label),
        value: Number(m.value) || 0,
      }));
    }
    return null;
  }

  const cols = table.columns.map(String);
  const countIdx = cols.findIndex((c) => /건수|count|개수/i.test(c));
  const valueIdx = cols.findIndex((c) => /매출|값|value|합계|평균/i.test(c));
  const labelIdx = cols.findIndex(
    (c, i) => i !== countIdx && i !== valueIdx && c !== '순위' && c !== '행',
  );

  if (structured.kind === 'ranking') {
    const vIdx = valueIdx >= 0 ? valueIdx : cols.length > 2 ? 2 : 1;
    const lIdx = labelIdx >= 0 ? labelIdx : 1;
    return table.rows.slice(0, 8).map((row) => {
      const label = row[lIdx] ?? row[1];
      const useRowPrefix = cols[lIdx] === '행' || lIdx === 1;
      return {
        name: useRowPrefix ? `행 ${label}` : String(label),
        value: Number(row[vIdx]) || 0,
      };
    });
  }

  if (countIdx >= 0) {
    const lIdx = labelIdx >= 0 ? labelIdx : 0;
    return table.rows.slice(0, 8).map((row) => ({
      name: String(row[lIdx] ?? ''),
      value: Number(row[countIdx]) || 0,
    }));
  }

  if (cols.length >= 2) {
    return table.rows.slice(0, 8).map((row) => ({
      name: String(row[0] ?? ''),
      value: Number(row[1]) || 0,
    }));
  }
  return null;
}
