import { sessionStore } from '../services/sessionStore.js';

export function attachSession(req, _res, next) {
  const headerId = req.get('X-Session-Id');
  const cookieId = req.cookies?.sessionId;
  const sessionId = headerId || cookieId || null;
  req.sessionId = sessionId;
  req.session = sessionId ? sessionStore.get(sessionId) : null;
  next();
}

export function requireSession(req, _res, next) {
  if (!req.session) {
    const err = new Error('세션이 없거나 만료되었습니다. 파일을 다시 업로드하세요.');
    err.status = 404;
    err.code = 'SESSION_NOT_FOUND';
    err.expose = true;
    return next(err);
  }
  next();
}

export function setSessionCookie(res, sessionId) {
  res.cookie('sessionId', sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.setHeader('X-Session-Id', sessionId);
}
