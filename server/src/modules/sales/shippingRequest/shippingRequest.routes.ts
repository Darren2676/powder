import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { dataScope } from '../../../middleware/data-scope.middleware';
import {
  getPendingShipments,
  getPendingRequestDetails,
  exportPendingRequestDetailsSelected,
  createShippingRequest,
  getShippingRequests,
  getShippingRequestDetail,
  updateShippingRequest,
  updateShippingRequestStatus,
  cancelShippingRequest,
  deleteShippingRequest
} from './shippingRequest.controller';
import { validateCreateShippingRequest, validateUpdateShippingRequest } from '../../../validators/sales.validator';

const router = Router();

// 待发货列表（来自销售订单明细）
router.get('/pending', authenticate, dataScope, getPendingShipments);
// 待发货申请明细（待审核+已审核的申请行）
router.get('/pending-details', authenticate, dataScope, getPendingRequestDetails);
router.post('/pending-details/export-selected', authenticate, dataScope, exportPendingRequestDetailsSelected);

// 发货申请 CRUD
router.get('/', authenticate, dataScope, getShippingRequests);
router.post('/', authenticate, validateCreateShippingRequest, createShippingRequest);
router.get('/:id', authenticate, getShippingRequestDetail);
router.put('/:id', authenticate, validateUpdateShippingRequest, updateShippingRequest);
router.put('/:id/status', authenticate, updateShippingRequestStatus);
router.post('/:id/cancel', authenticate, cancelShippingRequest);
router.delete('/:id', authenticate, deleteShippingRequest);

export default router;
