import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getPlansForMrp,
  runMRP,
  getMRPRuns,
  getMRPRunDetail,
  executeMRP,
  cancelMRPRun,
  deleteMRPRun
} from './mrp.controller';

const router = Router();
router.use(authenticate);

router.get('/plans-for-mrp', getPlansForMrp);
router.post('/run', runMRP);
router.get('/', getMRPRuns);
router.get('/:id', getMRPRunDetail);
router.post('/execute', executeMRP);
router.post('/:id/cancel', cancelMRPRun);
router.delete('/:id', deleteMRPRun);

export default router;
