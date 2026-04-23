import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateCreateInspectionSpec, validateUpdateInspectionSpec } from '../../../validators/quality.validator';
import {
  getInspectionSpecs,
  getInspectionSpecDetail,
  createInspectionSpec,
  updateInspectionSpec,
  deleteInspectionSpec,
  exportInspectionSpecs,
  getInspectionSpecItems,
  addInspectionSpecItem,
  updateInspectionSpecItem,
  deleteInspectionSpecItem,
  approveInspectionSpec,
  withdrawInspectionSpec
} from './inspectionSpec.controller';

const router = Router();

router.get('/', authenticate, getInspectionSpecs);
router.get('/export', authenticate, exportInspectionSpecs);
router.post('/', authenticate, validateCreateInspectionSpec, createInspectionSpec);

// 明细独立操作（放在 /:id 前面避免路径冲突）
router.put('/items/:detailId', authenticate, updateInspectionSpecItem);
router.delete('/items/:detailId', authenticate, deleteInspectionSpecItem);

router.get('/:id', authenticate, getInspectionSpecDetail);
router.put('/:id', authenticate, validateUpdateInspectionSpec, updateInspectionSpec);
router.put('/:id/approve', authenticate, approveInspectionSpec);
router.put('/:id/withdraw', authenticate, withdrawInspectionSpec);
router.delete('/:id', authenticate, deleteInspectionSpec);

router.get('/:headerId/items', authenticate, getInspectionSpecItems);
router.post('/:headerId/items', authenticate, addInspectionSpecItem);

export default router;
