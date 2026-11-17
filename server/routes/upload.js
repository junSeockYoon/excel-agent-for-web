import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { uploadFile } from '../controllers/uploadController.js';
import { uploadSingle } from '../middleware/upload.js';
import { sessionStore } from '../services/sessionStore.js';

const router = Router();

router.post('/', (req, res, next) => {
  // Keep disk folder aligned with the session id we will keep or create.
  if (req.sessionId && sessionStore.get(req.sessionId)) {
    req.uploadSessionId = req.sessionId;
  } else {
    req.uploadSessionId = uuidv4();
  }
  uploadSingle(req, res, (err) => {
    if (err) return next(err);
    return uploadFile(req, res, next);
  });
});

export default router;
