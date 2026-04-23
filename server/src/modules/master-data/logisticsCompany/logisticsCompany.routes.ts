import { Router } from 'express';
import { validateCreateLogisticsCompany, validateUpdateLogisticsCompany } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import multer from 'multer';
import {
  getLogisticsCompanies,
  getLogisticsCompanyDetail,
  createLogisticsCompany,
  updateLogisticsCompany,
  deleteLogisticsCompany,
  updateLogisticsCompanyCondition,
  approveLogisticsCompany,
  withdrawLogisticsCompany,
  uploadAttachment,
  downloadAttachment,
  removeAttachment,
  exportLogisticsCompanies,
  importLogisticsCompanies
} from './logisticsCompany.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// 附件路由放在 /:id 之前，避免冲突
router.get('/attachment/:attachmentId/download', authenticate, downloadAttachment);
router.delete('/attachment/:attachmentId', authenticate, removeAttachment);

// 列表、导出、导入
router.get('/', authenticate, getLogisticsCompanies);
router.get('/export', authenticate, exportLogisticsCompanies);
router.post('/import', authenticate, upload.single('file'), importLogisticsCompanies);

// 新建
router.post('/', authenticate, validateCreateLogisticsCompany, createLogisticsCompany);

// 详情、更新、删除
router.get('/:id', authenticate, getLogisticsCompanyDetail);
router.put('/:id', authenticate, validateUpdateLogisticsCompany, updateLogisticsCompany);
router.delete('/:id', authenticate, deleteLogisticsCompany);

// 启用/禁用
router.put('/:id/condition', authenticate, updateLogisticsCompanyCondition);

// 审核/撤消审核
router.put('/:id/approve', authenticate, approveLogisticsCompany);
router.put('/:id/withdraw', authenticate, withdrawLogisticsCompany);

// 附件上传
router.post('/:id/attachments', authenticate, upload.single('file'), uploadAttachment);

export default router;
