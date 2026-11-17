import { Router } from 'express';
import {
  deleteSession,
  getSession,
  setActiveSheet,
} from '../controllers/sheetController.js';
import { requireSession } from '../middleware/session.js';

const router = Router();

router.get('/', getSession);
router.delete('/', deleteSession);
router.put('/active-sheet', requireSession, setActiveSheet);

export default router;
