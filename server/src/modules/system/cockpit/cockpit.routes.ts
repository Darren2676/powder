import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { getCockpitOverview } from './cockpit.controller';

const router = Router();

router.get('/overview', authenticate, getCockpitOverview);

export default router;
