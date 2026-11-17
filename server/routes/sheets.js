import { Router } from 'express';
import {
  getDistributions,
  getRows,
  getSheet,
  listSheets,
} from '../controllers/sheetController.js';
import { requireSession } from '../middleware/session.js';

const router = Router();

router.use(requireSession);

router.get('/', listSheets);
router.get('/:sheetId/distributions', getDistributions);
router.get('/:sheetId/rows', getRows);
router.get('/:sheetId', getSheet);

export default router;
