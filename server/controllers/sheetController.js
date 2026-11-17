import { sheetMeta } from '../services/excelParser.js';
import { buildDistributions } from '../services/distributions.js';
import { sessionStore } from '../services/sessionStore.js';
import { env } from '../config/env.js';
import { httpError } from '../middleware/errorHandler.js';

function getSheetOrThrow(session, sheetId) {
  const sheet = session.sheets[sheetId];
  if (!sheet) {
    throw httpError(404, 'SHEET_NOT_FOUND', '시트를 찾을 수 없습니다.');
  }
  return sheet;
}

export function listSheets(req, res) {
  const session = req.session;
  const sheets = session.sheetOrder.map((id) => sheetMeta(session.sheets[id]));
  res.json({
    sessionId: session.id,
    activeSheetId: session.activeSheetId,
    fileName: session.files[0]?.originalName ?? null,
    sheets,
  });
}

export function getSheet(req, res) {
  const sheet = getSheetOrThrow(req.session, req.params.sheetId);
  res.json({
    sessionId: req.session.id,
    sheet: sheetMeta(sheet),
  });
}

export function getRows(req, res) {
  const sheet = getSheetOrThrow(req.session, req.params.sheetId);
  let offset = Number.parseInt(req.query.offset ?? '0', 10);
  let limit = Number.parseInt(req.query.limit ?? String(env.defaultPageLimit), 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  if (!Number.isFinite(limit) || limit < 1) limit = env.defaultPageLimit;
  limit = Math.min(limit, env.maxPageLimit);

  const q = String(req.query.q || '').trim().toLowerCase();
  let rows = sheet.rows;
  if (q) {
    rows = rows.filter((row) =>
      Object.values(row).some((v) =>
        v !== null && v !== undefined && String(v).toLowerCase().includes(q),
      ),
    );
  }

  const slice = rows.slice(offset, offset + limit);
  res.json({
    sessionId: req.session.id,
    sheetId: sheet.id,
    offset,
    limit,
    total: rows.length,
    q: q || null,
    columns: sheet.columns,
    rows: slice,
  });
}

export function getDistributions(req, res) {
  const sheet = getSheetOrThrow(req.session, req.params.sheetId);
  const data = buildDistributions(sheet, { maxCharts: 3, topN: 8 });
  res.json({
    sessionId: req.session.id,
    ...data,
  });
}

export function setActiveSheet(req, res) {
  const sheetId = req.body?.sheetId;
  if (!sheetId) {
    throw httpError(400, 'MISSING_SHEET_ID', 'sheetId가 필요합니다.');
  }
  const session = sessionStore.setActiveSheet(req.session.id, sheetId);
  res.json({
    sessionId: session.id,
    activeSheetId: session.activeSheetId,
  });
}

export function getSession(req, res) {
  if (!req.session) {
    return res.status(404).json({
      error: { code: 'SESSION_NOT_FOUND', message: '세션이 없거나 만료되었습니다.' },
    });
  }
  const session = req.session;
  res.json({
    ...sessionStore.summary(session),
    sheets: session.sheetOrder.map((id) => sheetMeta(session.sheets[id])),
  });
}

export function deleteSession(req, res) {
  if (!req.sessionId) {
    return res.status(404).json({
      error: { code: 'SESSION_NOT_FOUND', message: '세션이 없습니다.' },
    });
  }
  sessionStore.delete(req.sessionId);
  res.clearCookie('sessionId');
  res.status(204).end();
}
