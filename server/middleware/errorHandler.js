import multer from 'multer';
import { env } from '../config/env.js';

export function notFound(_req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: '요청한 경로를 찾을 수 없습니다.' },
  });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: {
          code: 'UPLOAD_TOO_LARGE',
          message: `파일 크기가 한도(${Math.round(env.uploadMaxBytes / 1024 / 1024)}MB)를 초과했습니다.`,
        },
      });
    }
    return res.status(400).json({
      error: { code: 'UPLOAD_ERROR', message: err.message },
    });
  }

  const status = err.status || err.statusCode || 500;
  const code = err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
  const message = err.expose || status < 500
    ? err.message || '요청을 처리할 수 없습니다.'
    : '서버 오류가 발생했습니다.';

  if (status >= 500) {
    console.error('[error]', err);
  }

  res.status(status).json({
    error: { code, message, ...(err.details ? { details: err.details } : {}) },
  });
}

export function httpError(status, code, message, details) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.expose = true;
  if (details) err.details = details;
  return err;
}
