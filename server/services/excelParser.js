import fs from 'fs';
import * as XLSX from 'xlsx';
import { env } from '../config/env.js';
import { sanitizeCell } from '../utils/sanitize.js';

const HEADER_HINT =
  /이름|성명|학번|학과|과목|학년|날짜|일자|번호|구분|상태|이메일|연락|전화|주소|금액|합계|비고|title|name|date|id\b|email/i;

function isBlank(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function cellText(v) {
  if (isBlank(v)) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, ' ').trim();
}

function isNumericLike(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return true;
  if (typeof v === 'boolean') return false;
  if (v instanceof Date) return false;
  const s = cellText(v);
  if (!s) return false;
  return /^-?\d+([.,]\d+)?%?$/.test(s);
}

function slugKey(header, index, used) {
  let base = String(header ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\uac00-\ud7a3]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!base) base = `col_${index + 1}`;
  let key = base;
  let n = 2;
  while (used.has(key)) {
    key = `${base}_${n++}`;
  }
  used.add(key);
  return key;
}

function inferType(values) {
  let num = 0;
  let bool = 0;
  let date = 0;
  let nonNull = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    nonNull += 1;
    if (typeof v === 'boolean') bool += 1;
    else if (typeof v === 'number' && Number.isFinite(v)) num += 1;
    else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) date += 1;
  }
  if (!nonNull) return 'empty';
  if (num / nonNull >= 0.8) return 'number';
  if (bool / nonNull >= 0.8) return 'boolean';
  if (date / nonNull >= 0.8) return 'date';
  return 'string';
}

/** Fill merge ranges with the top-left value so table extraction sees full labels. */
function expandMergedCells(sheet) {
  const merges = sheet['!merges'];
  if (!merges?.length) return;
  for (const range of merges) {
    const start = XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c });
    const master = sheet[start];
    if (!master) continue;
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        if (r === range.s.r && c === range.s.c) continue;
        const addr = XLSX.utils.encode_cell({ r, c });
        const existing = sheet[addr];
        if (existing && !isBlank(existing.v) && existing.v !== '') continue;
        sheet[addr] = { t: master.t, v: master.v, w: master.w };
      }
    }
  }
}

function sheetToMatrix(sheet) {
  expandMergedCells(sheet);
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: true,
  });
  // Normalize ragged rows
  const width = matrix.reduce((m, row) => Math.max(m, row?.length || 0), 0);
  return matrix.map((row) => {
    const out = new Array(width).fill(null);
    if (!row) return out;
    for (let i = 0; i < width; i += 1) out[i] = i < row.length ? row[i] : null;
    return out;
  });
}

function rowStats(row, colStart, colEnd) {
  let filled = 0;
  let strings = 0;
  let numbers = 0;
  const unique = new Set();
  for (let c = colStart; c <= colEnd; c += 1) {
    const v = row?.[c];
    if (isBlank(v)) continue;
    filled += 1;
    if (isNumericLike(v)) numbers += 1;
    else {
      strings += 1;
      unique.add(cellText(v));
    }
  }
  return { filled, strings, numbers, unique };
}

function findContentBounds(matrix) {
  let rowStart = -1;
  let rowEnd = -1;
  let colStart = matrix[0]?.length ? matrix[0].length : 0;
  let colEnd = -1;

  for (let r = 0; r < matrix.length; r += 1) {
    const row = matrix[r];
    let rowHas = false;
    for (let c = 0; c < row.length; c += 1) {
      if (isBlank(row[c])) continue;
      rowHas = true;
      colStart = Math.min(colStart, c);
      colEnd = Math.max(colEnd, c);
    }
    if (rowHas) {
      if (rowStart < 0) rowStart = r;
      rowEnd = r;
    }
  }

  if (rowStart < 0 || colEnd < colStart) {
    return { rowStart: 0, rowEnd: -1, colStart: 0, colEnd: -1 };
  }
  return { rowStart, rowEnd, colStart, colEnd };
}

/**
 * Prefer the densest contiguous column band inside the used range.
 * Helps when left/right margins are sparse decoration.
 */
function densestColBand(matrix, rowStart, rowEnd, colStart, colEnd) {
  const width = colEnd - colStart + 1;
  if (width <= 2) return { colStart, colEnd };

  const density = new Array(width).fill(0);
  const span = Math.max(1, rowEnd - rowStart + 1);
  for (let r = rowStart; r <= rowEnd; r += 1) {
    for (let c = colStart; c <= colEnd; c += 1) {
      if (!isBlank(matrix[r][c])) density[c - colStart] += 1;
    }
  }

  let bestStart = 0;
  let bestEnd = width - 1;
  let bestScore = -1;
  for (let a = 0; a < width; a += 1) {
    let filled = 0;
    for (let b = a; b < width; b += 1) {
      filled += density[b];
      const cols = b - a + 1;
      if (cols < 2) continue;
      const avg = filled / (cols * span);
      // Require a reasonably occupied block; reward width lightly
      if (avg < 0.08) continue;
      const score = filled + cols * span * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestStart = a;
        bestEnd = b;
      }
    }
  }
  return { colStart: colStart + bestStart, colEnd: colStart + bestEnd };
}

function scoreHeaderRow(matrix, rowIndex, colStart, colEnd) {
  const row = matrix[rowIndex];
  if (!row) return -Infinity;
  const width = colEnd - colStart + 1;
  const { filled, strings, numbers, unique } = rowStats(row, colStart, colEnd);
  if (filled < 2) return -Infinity;

  const fillRatio = filled / width;
  const stringRatio = strings / filled;
  const numberRatio = numbers / filled;
  const uniqueRatio = strings ? unique.size / strings : 0;

  let score =
    filled * 1.5 +
    stringRatio * 18 +
    uniqueRatio * 16 -
    numberRatio * 22 +
    fillRatio * 8;

  // Banner / summary rows: sparse labels + many counts
  if (numberRatio >= 0.55 && stringRatio <= 0.45) score -= 25;
  if (fillRatio < 0.15) score -= 10;

  const joined = Array.from(unique).join(' ');
  if (HEADER_HINT.test(joined)) score += 12;

  const next = matrix[rowIndex + 1];
  if (next) {
    const nextFilled = rowStats(next, colStart, colEnd).filled;
    if (nextFilled >= Math.max(2, Math.floor(filled * 0.25))) score += 6;
    // Data under a header is often less "unique label"-like
    const nextStats = rowStats(next, colStart, colEnd);
    if (nextStats.numbers > 0 && nextStats.strings > 0) score += 3;
  } else {
    score -= 8;
  }

  return score;
}

function findHeaderRow(matrix, rowStart, rowEnd, colStart, colEnd) {
  const scanEnd = Math.min(rowEnd, rowStart + 40);
  let bestIdx = rowStart;
  let bestScore = -Infinity;
  for (let r = rowStart; r <= scanEnd; r += 1) {
    // Need at least one data row below
    if (r >= rowEnd) break;
    const score = scoreHeaderRow(matrix, r, colStart, colEnd);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = r;
    }
  }
  return { headerIdx: bestIdx, score: bestScore };
}

function composeHeaderLabel(matrix, headerIdx, col, colStart, colEnd, lookback = 2) {
  const rawPrimary = matrix[headerIdx][col];
  // Counts left in the header row (e.g. "26") are not usable column titles
  const primary = isNumericLike(rawPrimary) ? '' : cellText(rawPrimary);
  const extras = [];
  const start = Math.max(0, headerIdx - lookback);
  for (let r = start; r < headerIdx; r += 1) {
    const stats = rowStats(matrix[r], colStart, colEnd);
    // Skip numeric-heavy banner rows when collecting secondary labels
    if (stats.filled && stats.numbers / stats.filled >= 0.55) continue;
    const t = cellText(matrix[r][col]);
    if (!t || isNumericLike(matrix[r][col])) continue;
    if (primary && t === primary) continue;
    extras.push(t);
  }

  if (primary) {
    const uniqExtras = extras.filter((e, i) => extras.indexOf(e) === i && e !== primary);
    if (uniqExtras.length) return `${primary} (${uniqExtras.join(' / ')})`;
    return primary;
  }

  // Empty primary: only take a secondary label if it is uncommon in that upper row
  for (let r = headerIdx - 1; r >= start; r -= 1) {
    const t = cellText(matrix[r][col]);
    if (!t || isNumericLike(matrix[r][col])) continue;
    const stats = rowStats(matrix[r], colStart, colEnd);
    if (stats.filled && stats.numbers / stats.filled >= 0.55) continue;
    let same = 0;
    for (let c = colStart; c <= colEnd; c += 1) {
      if (cellText(matrix[r][c]) === t) same += 1;
    }
    if (same <= 2) return t;
  }
  return '';
}

function buildColumns(matrix, headerIdx, colStart, colEnd) {
  const used = new Set();
  const columns = [];
  for (let c = colStart; c <= colEnd; c += 1) {
    const label = composeHeaderLabel(matrix, headerIdx, c, colStart, colEnd);
    const header = label || `열 ${columns.length + 1}`;
    columns.push({
      key: slugKey(header, columns.length, used),
      header,
      inferredType: 'string',
      sourceCol: c,
    });
  }
  return columns;
}

function trimEmptyColumns(columns, rows) {
  const keep = [];
  for (const col of columns) {
    const any = rows.some((row) => !isBlank(row[col.key]));
    // Keep columns that have a real header even if sparse (course columns may be sparse)
    const hasRealHeader = col.header && !/^열\s+\d+$/.test(col.header);
    if (any || hasRealHeader) keep.push(col);
  }
  if (!keep.length) return { columns, rows };
  const keys = new Set(keep.map((c) => c.key));
  const nextRows = rows.map((row) => {
    const obj = {};
    for (const key of keys) obj[key] = row[key];
    return obj;
  });
  return {
    columns: keep.map(({ sourceCol, ...rest }) => rest),
    rows: nextRows,
  };
}

function sheetToModel(name, sheet, sheetId) {
  if (!sheet || !sheet['!ref']) {
    return {
      id: sheetId,
      name,
      rowCount: 0,
      columnCount: 0,
      columns: [],
      rows: [],
      truncated: false,
      truncateReason: null,
      sourceRowCount: 0,
      headerRow: null,
    };
  }

  const matrix = sheetToMatrix(sheet);
  const bounds = findContentBounds(matrix);
  if (bounds.rowEnd < bounds.rowStart) {
    return {
      id: sheetId,
      name,
      rowCount: 0,
      columnCount: 0,
      columns: [],
      rows: [],
      truncated: false,
      truncateReason: null,
      sourceRowCount: 0,
      headerRow: null,
    };
  }

  const band = densestColBand(
    matrix,
    bounds.rowStart,
    bounds.rowEnd,
    bounds.colStart,
    bounds.colEnd,
  );
  const { headerIdx } = findHeaderRow(
    matrix,
    bounds.rowStart,
    bounds.rowEnd,
    band.colStart,
    band.colEnd,
  );

  let columns = buildColumns(matrix, headerIdx, band.colStart, band.colEnd);
  const dataRowsRaw = matrix.slice(headerIdx + 1, bounds.rowEnd + 1);

  // Drop fully empty data rows
  const nonemptyData = dataRowsRaw.filter((row) =>
    columns.some((col) => !isBlank(row[col.sourceCol])),
  );

  let truncated = false;
  let truncateReason = null;
  const maxRows = env.maxRowsPerSheet;
  const maxCells = env.maxCellsPerSheet;
  const colCount = Math.max(columns.length, 1);
  const cellCapRows = Math.floor(maxCells / colCount);
  const keep = Math.min(nonemptyData.length, maxRows, cellCapRows);

  if (keep < nonemptyData.length) {
    truncated = true;
    truncateReason =
      nonemptyData.length > maxRows
        ? `행 한도(${maxRows})를 초과해 ${keep}행만 메모리에 보관합니다.`
        : `셀 한도(${maxCells})를 초과해 ${keep}행만 메모리에 보관합니다.`;
  }

  let rows = [];
  for (let r = 0; r < keep; r += 1) {
    const raw = nonemptyData[r] || [];
    const obj = {};
    for (const col of columns) {
      obj[col.key] = sanitizeCell(raw[col.sourceCol]);
    }
    rows.push(obj);
  }

  ({ columns, rows } = trimEmptyColumns(columns, rows));

  for (const col of columns) {
    col.inferredType = inferType(rows.map((row) => row[col.key]));
  }

  return {
    id: sheetId,
    name,
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    rows,
    truncated,
    truncateReason,
    sourceRowCount: nonemptyData.length,
    headerRow: headerIdx + 1, // 1-based for debugging / UI
  };
}

export function parseWorkbook(filePath, originalName) {
  const buf = fs.readFileSync(filePath);
  const workbook = XLSX.read(buf, {
    type: 'buffer',
    cellDates: true,
    dense: false,
  });

  const sheets = {};
  const order = [];

  workbook.SheetNames.forEach((name, index) => {
    const sheetId = `s${index + 1}`;
    const model = sheetToModel(name, workbook.Sheets[name], sheetId);
    sheets[sheetId] = model;
    order.push(sheetId);
  });

  if (!order.length) {
    const err = new Error('시트 데이터를 찾을 수 없습니다.');
    err.status = 400;
    err.code = 'EMPTY_WORKBOOK';
    err.expose = true;
    throw err;
  }

  // Prefer first sheet that actually has a table
  const activeSheetId =
    order.find((id) => sheets[id].rowCount > 0 && sheets[id].columnCount > 0) ||
    order[0];

  return {
    originalName,
    sheetOrder: order,
    sheets,
    activeSheetId,
  };
}

export function sheetMeta(sheet) {
  return {
    id: sheet.id,
    name: sheet.name,
    rowCount: sheet.rowCount,
    columnCount: sheet.columnCount,
    columns: sheet.columns,
    truncated: sheet.truncated,
    truncateReason: sheet.truncateReason,
    sourceRowCount: sheet.sourceRowCount ?? sheet.rowCount,
    headerRow: sheet.headerRow ?? null,
  };
}
