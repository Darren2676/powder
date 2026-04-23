import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreatePurchaseReq, validateUpdatePurchaseReq, validatePurchaseReqToOrder } from '../../../validators/purchasing.validator';
import {
  getPurchaseReqs, getPurchaseReqDetail, createPurchaseReq, updatePurchaseReq, deletePurchaseReq,
  getPurchaseReqDetails, addPurchaseReqDetail, updatePurchaseReqDetail, deletePurchaseReqDetail,
  toOrder, exportPurchaseReqs, getPurchaseReqDetailsPage, exportPurchaseReqDetailsSelected
} from './purchaseReq.controller';

const router = Router();

// Header
router.get('/', authenticate, getPurchaseReqs);
router.get('/export', authenticate, exportPurchaseReqs);
router.get('/details-page', authenticate, getPurchaseReqDetailsPage);
router.post('/details-page/export-selected', authenticate, exportPurchaseReqDetailsSelected);
router.post('/', authenticate, validateCreatePurchaseReq, createPurchaseReq);
router.get('/:id', authenticate, getPurchaseReqDetail);
router.put('/:id', authenticate, validateUpdatePurchaseReq, updatePurchaseReq);
router.delete('/:id', authenticate, deletePurchaseReq);

// 转采购订单
router.post('/:id/to-order', authenticate, validatePurchaseReqToOrder, toOrder);

// Detail
router.get('/:headerId/details', authenticate, getPurchaseReqDetails);
router.post('/:headerId/details', authenticate, addPurchaseReqDetail);
router.put('/details/:detailId', authenticate, updatePurchaseReqDetail);
router.delete('/details/:detailId', authenticate, deletePurchaseReqDetail);

export default router;
