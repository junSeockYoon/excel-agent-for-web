/**
 * Parse and validate chat evidence citations against packed sheet sample(s).
 * row in model output is 1-based data-row index (first data row = 1).
 */

const EVIDENCE_RE = /<<<EVIDENCE\s*(\[[\s\S]*?\])\s*>>>/i;
const EVIDENCE_JSON_RE = /```json\s*(\{[\s\S]*?"evidence"[\s\S]*?\})\s*```/i;

export function stripEvidenceBlock(answer) {
  let text = String(answer || '');
  text = text.replace(EVIDENCE_RE, '').trim();
  text = text.replace(EVIDENCE_JSON_RE, '').trim();
  return text;
}

function extractRawEvidence(answer) {
  const s = String(answer || '');
  const m1 = s.match(EVIDENCE_RE);
  if (m1) {
    try {
      const arr = JSON.parse(m1[1]);
      return Array.isArray(arr) ? arr : arr?.evidence || [];
    } catch {
      /* fall through */
    }
  }
  const m2 = s.match(EVIDENCE_JSON_RE);
  if (m2) {
    try {
      const obj = JSON.parse(m2[1]);
      return Array.isArray(obj.evidence) ? obj.evidence : [];
    } catch {
      /* fall through */
    }
  }
  const found = [];
  const re = /(?:행|row)\s*[:#]?\s*(\d+)/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    found.push({ row: Number(m[1]), columns: [] });
  }
  return found;
}

function resolveColumns(columnsSpec, sheetColumns) {
  if (!Array.isArray(columnsSpec) || !columnsSpec.length) return [];
  const out = [];
  const seen = new Set();
  for (const raw of columnsSpec) {
    const token = String(raw || '').trim();
    if (!token) continue;
    const col = sheetColumns.find(
      (c) =>
        c.key === token ||
        c.header === token ||
        c.key.toLowerCase() === token.toLowerCase() ||
        c.header.toLowerCase() === token.toLowerCase(),
    );
    if (col && !seen.has(col.key)) {
      seen.add(col.key);
      out.push({ key: col.key, header: col.header });
    }
  }
  return out;
}

function resolveSheet(item, sheetsById, defaultSheet) {
  const token = item?.sheet || item?.sheetName || item?.sheetId;
  if (!token) return defaultSheet;
  const list = Object.values(sheetsById);
  return (
    sheetsById[token] ||
    list.find((s) => s.name === token) ||
    list.find((s) => s.id === token) ||
    defaultSheet
  );
}

/**
 * @param {object} opts
 * @param {string} opts.answer
 * @param {object} opts.sheet primary sheet
 * @param {Record<string, object>} [opts.sheetsById]
 * @param {Map<string, Set<number>>|Set<number>} opts.allowedRowIndexes
 *   Set for single sheet, or Map sheetId -> Set for multi
 * @param {boolean} [opts.includeSheetLabel]
 */
export function buildEvidence({
  answer,
  sheet,
  sheetsById,
  allowedRowIndexes,
  includeSheetLabel = false,
}) {
  const byId = sheetsById || { [sheet.id]: sheet };
  const raw = extractRawEvidence(answer);
  const displayAnswer = stripEvidenceBlock(answer);
  const evidence = [];
  const seen = new Set();

  const allowedFor = (sid) => {
    if (allowedRowIndexes instanceof Map) {
      return allowedRowIndexes.get(sid) || new Set();
    }
    return allowedRowIndexes instanceof Set
      ? allowedRowIndexes
      : new Set(allowedRowIndexes || []);
  };

  for (const item of raw) {
    const target = resolveSheet(item, byId, sheet);
    if (!target) continue;
    const row1 = Number(item?.row ?? item?.rowIndex ?? item?.r);
    if (!Number.isFinite(row1) || row1 < 1) continue;
    const rowIndex = Math.trunc(row1) - 1;
    const allowed = allowedFor(target.id);
    if (!allowed.has(rowIndex)) continue;
    if (rowIndex >= (target.rows?.length || 0)) continue;

    const key = `${target.id}:${rowIndex}`;
    if (seen.has(key)) {
      const existing = evidence.find(
        (e) => e.sheetId === target.id && e.rowIndex === rowIndex,
      );
      const cols = resolveColumns(item.columns || item.cols || [], target.columns || []);
      for (const c of cols) {
        if (!existing.columns.some((x) => x.key === c.key)) existing.columns.push(c);
      }
      continue;
    }
    seen.add(key);
    evidence.push({
      rowIndex,
      rowLabel: rowIndex + 1,
      columns: resolveColumns(item.columns || item.cols || [], target.columns || []),
      sheetId: target.id,
      sheetName: target.name,
    });
  }

  return {
    answer: displayAnswer,
    evidence: evidence.slice(0, 12).map((e) => ({
      ...e,
      showSheet: includeSheetLabel,
    })),
  };
}

export function annotateEvidence(list, sheet, includeSheetLabel) {
  return (list || []).map((e) => ({
    ...e,
    sheetId: e.sheetId || sheet.id,
    sheetName: e.sheetName || sheet.name,
    showSheet: includeSheetLabel,
  }));
}
