import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { extOf, sanitizeFilename } from '../utils/sanitize.js';
import { httpError } from './errorHandler.js';

fs.mkdirSync(env.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const sessionId = req.uploadSessionId || uuidv4();
    req.uploadSessionId = sessionId;
    const dir = path.join(env.uploadDir, sessionId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const safe = sanitizeFilename(file.originalname);
    cb(null, `${Date.now()}-${safe}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = extOf(file.originalname);
  if (!env.allowedExtensions.includes(ext)) {
    return cb(
      httpError(
        400,
        'INVALID_FILE_TYPE',
        `허용되지 않는 파일 형식입니다. (${env.allowedExtensions.join(', ')})`,
      ),
    );
  }
  cb(null, true);
}

export const uploadSingle = multer({
  storage,
  limits: { fileSize: env.uploadMaxBytes, files: 1 },
  fileFilter,
}).single('file');
