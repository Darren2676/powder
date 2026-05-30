import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getSampleRequests, getSampleRequestDetail, createSampleRequest, updateSampleRequest,
  deleteSampleRequest, submitSampleRequest, withdrawSampleRequest, receiveSampleRequest, completeSampleRequest,
  updateLabData,
} from './sampleRequest.controller';

const router = Router();

router.put('/:id/lab', authenticate, updateLabData);

// 流程操作路由（放在 /:id 之前）
router.post('/:id/submit', authenticate, submitSampleRequest);
router.post('/:id/withdraw', authenticate, withdrawSampleRequest);
router.post('/:id/receive', authenticate, receiveSampleRequest);
router.post('/:id/complete', authenticate, completeSampleRequest);

// 基础 CRUD
router.get('/', authenticate, getSampleRequests);
router.get('/:id', authenticate, getSampleRequestDetail);
router.post('/', authenticate, createSampleRequest);
router.put('/:id', authenticate, updateSampleRequest);
router.delete('/:id', authenticate, deleteSampleRequest);

export default router;
