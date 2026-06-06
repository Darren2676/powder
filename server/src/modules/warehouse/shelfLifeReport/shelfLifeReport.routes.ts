import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { getShelfLifeReport } from './shelfLifeReport.controller';

const router = Router();

router.get('/', authenticate, getShelfLifeReport);

export default router;
