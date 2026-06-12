import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { preview, printLabel, getLogs } from './labelPrint.controller';

const router = Router();

router.post('/preview', authenticate, preview);
router.post('/print', authenticate, printLabel);
router.get('/logs', authenticate, getLogs);

export default router;
