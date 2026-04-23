import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateSupplier, validateUpdateSupplier } from '../../../validators/supplier.validator';
import {
  getSuppliers, createSupplier, updateSupplier, deleteSupplier, exportSuppliers, importSuppliers,
  getSupplierDetail, updateSupplierCondition, approveSupplier, withdrawSupplier,
  addSupplierAddress, updateSupplierAddress, removeSupplierAddress,
  uploadSupplierAttachment, downloadSupplierAttachment, removeSupplierAttachment
} from './supplier.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getSuppliers);
router.get('/export', authenticate, exportSuppliers);
router.post('/import', authenticate, upload.single('file'), importSuppliers);
router.post('/', authenticate, validateCreateSupplier, createSupplier);

// 附件 (放在 /:id 前面避免冲突)
router.get('/attachment/:attachmentId/download', authenticate, downloadSupplierAttachment);
router.delete('/attachment/:attachmentId', authenticate, removeSupplierAttachment);

// 地址
router.put('/address/:addressId', authenticate, updateSupplierAddress);
router.delete('/address/:addressId', authenticate, removeSupplierAddress);

// 供应商详情 & 操作
router.get('/:id', authenticate, getSupplierDetail);
router.put('/:id', authenticate, validateUpdateSupplier, updateSupplier);
router.put('/:id/condition', authenticate, updateSupplierCondition);
router.put('/:id/approve', authenticate, approveSupplier);
router.put('/:id/withdraw', authenticate, withdrawSupplier);
router.post('/:id/addresses', authenticate, addSupplierAddress);
router.post('/:id/attachments', authenticate, upload.single('file'), uploadSupplierAttachment);
router.delete('/:id', authenticate, deleteSupplier);

export default router;
