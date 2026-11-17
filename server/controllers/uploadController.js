import { parseWorkbook, sheetMeta } from '../services/excelParser.js';
import { sessionStore } from '../services/sessionStore.js';
import { setSessionCookie } from '../middleware/session.js';
import { httpError } from '../middleware/errorHandler.js';

export async function uploadFile(req, res, next) {
  try {
    if (!req.file) {
      throw httpError(400, 'NO_FILE', '업로드할 파일이 없습니다. field name: file');
    }

    const parsed = parseWorkbook(req.file.path, req.file.originalname);
    const fileMeta = {
      originalName: req.file.originalname,
      storedPath: req.file.path,
      size: req.file.size,
      mime: req.file.mimetype,
    };

    const sessionId = req.uploadSessionId;
    const payload = {
      sheets: parsed.sheets,
      sheetOrder: parsed.sheetOrder,
      activeSheetId: parsed.activeSheetId,
      file: fileMeta,
    };
    const session = sessionStore.get(sessionId)
      ? sessionStore.replace(sessionId, payload)
      : sessionStore.create({ id: sessionId, ...payload });

    setSessionCookie(res, session.id);

    const sheets = session.sheetOrder.map((id) => sheetMeta(session.sheets[id]));

    res.status(201).json({
      sessionId: session.id,
      activeSheetId: session.activeSheetId,
      fileName: fileMeta.originalName,
      sheets,
    });
  } catch (err) {
    next(err);
  }
}
