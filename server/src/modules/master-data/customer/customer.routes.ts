import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateCustomer, validateUpdateCustomer } from '../../../validators/customer.validator';
import {
  getCustomers, createCustomer, updateCustomer, deleteCustomer, exportCustomers, importCustomers,
  getCustomerDetail, updateCustomerCondition, approveCustomer, withdrawCustomer,
  addCustomerAddress, updateCustomerAddress, removeCustomerAddress,
  uploadCustomerAttachment, downloadCustomerAttachment, removeCustomerAttachment
} from './customer.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// 基础 CRUD
router.get('/', authenticate, getCustomers);
router.get('/export', authenticate, exportCustomers);
router.post('/import', authenticate, upload.single('file'), importCustomers);
router.post('/', authenticate, validateCreateCustomer, createCustomer);

// 附件路由 (放在 /:id 前面避免冲突)
router.get('/attachment/:attachmentId/download', authenticate, downloadCustomerAttachment);
router.delete('/attachment/:attachmentId', authenticate, removeCustomerAttachment);

// 地址路由
router.put('/address/:addressId', authenticate, updateCustomerAddress);
router.delete('/address/:addressId', authenticate, removeCustomerAddress);

// 客户详情 & 操作
router.get('/:id', authenticate, getCustomerDetail);
router.put('/:id', authenticate, validateUpdateCustomer, updateCustomer);
router.put('/:id/condition', authenticate, updateCustomerCondition);
router.put('/:id/approve', authenticate, approveCustomer);
router.put('/:id/withdraw', authenticate, withdrawCustomer);
router.post('/:id/addresses', authenticate, addCustomerAddress);
router.post('/:id/attachments', authenticate, upload.single('file'), uploadCustomerAttachment);
router.delete('/:id', authenticate, deleteCustomer);

export default router;
