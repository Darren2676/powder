import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getSampleRequests, getSampleRequestDetail, createSampleRequest, updateSampleRequest,
  deleteSampleRequest, submitSampleRequest, withdrawSampleRequest, receiveSampleRequest, completeSampleRequest,
  updateLabData, convertToOrder, getConversionRate,
} from './sampleRequest.controller';

const router = Router();

router.put('/:id/lab', authenticate, updateLabData);

// 娴佺▼鎿嶄綔璺敱锛堟斁鍦?/:id 涔嬪墠锛?
router.post('/:id/submit', authenticate, submitSampleRequest);
router.post('/:id/withdraw', authenticate, withdrawSampleRequest);
router.post('/:id/receive', authenticate, receiveSampleRequest);
router.post('/:id/complete', authenticate, completeSampleRequest);
router.post('/:id/convert-to-order', authenticate, convertToOrder);

// 杞寲鐜囩粺璁★紙GET锛屾斁鍦ㄥ叿浣?:id 璺敱涔嬪墠锛?
router.get('/conversion-rate', authenticate, getConversionRate);

// 鍩虹 CRUD
router.get('/', authenticate, getSampleRequests);
router.get('/:id', authenticate, getSampleRequestDetail);
router.post('/', authenticate, createSampleRequest);
router.put('/:id', authenticate, updateSampleRequest);
router.delete('/:id', authenticate, deleteSampleRequest);

export default router;
