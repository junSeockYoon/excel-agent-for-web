import fs from 'fs';
import * as XLSX from 'xlsx';
import { env } from '../config/env.js';
import { sanitizeCell } from '../utils/sanitize.js';

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

function sheetToModel(name, sheet, sheetId) {
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });

  if (!matrix.length) {
    return {
      id: sheetId,
      name,
      rowCount: 0,
      columnCount: 0,
      columns: [],
      rows: [],
      truncated: false,
      truncateReason: null,
    };
  }

  const headerRow = matrix[0].map((h, i) =>
    h === null || h === undefined || String(h).trim() === ''
      ? `열 ${i + 1}`
      : String(h).trim(),
  );
  const used = new Set();
  const columns = headerRow.map((header, i) => ({
    key: slugKey(header, i, used),
    header,
    inferredType: 'string',
  }));

  const dataRows = matrix.slice(1);
  let truncated = false;
  let truncateReason = null;
  const maxRows = env.maxRowsPerSheet;
  const maxCells = env.maxCellsPerSheet;
  const colCount = Math.max(columns.length, 1);
  const cellCapRows = Math.floor(maxCells / colCount);
  const keep = Math.min(dataRows.length, maxRows, cellCapRows);

  if (keep < dataRows.length) {
    truncated = true;
    truncateReason =
      dataRows.length > maxRows
        ? `행 한도(${maxRows})를 초과해 ${keep}행만 메모리에 보관합니다.`
        : `셀 한도(${maxCells})를 초과해 ${keep}행만 메모리에 보관합니다.`;
  }

  const rows = [];
  for (let r = 0; r < keep; r += 1) {
    const raw = dataRows[r] || [];
    const obj = {};
    for (let c = 0; c < columns.length; c += 1) {
      obj[columns[c].key] = sanitizeCell(raw[c]);
    }
    rows.push(obj);
  }

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
    sourceRowCount: dataRows.length,
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

  return {
    originalName,
    sheetOrder: order,
    sheets,
    activeSheetId: order[0],
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
  };
}
