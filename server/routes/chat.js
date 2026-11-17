import { Router } from 'express';
import {
  chatStatus,
  chatSuggestions,
  postChat,
} from '../controllers/chatController.js';
import { requireSession } from '../middleware/session.js';

const router = Router();

router.get('/status', (_req, res) => chatStatus(_req, res));
router.get('/suggestions', requireSession, chatSuggestions);
router.post('/', requireSession, postChat);

export default router;
