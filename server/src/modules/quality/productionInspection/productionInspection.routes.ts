import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getProductionInspections,
  getProductionInspectionDetail,
  getInspectionsByOrder,
  updateProductionInspection,
  completeInspection,
  defectHandling,
  deleteProductionInspection,
  exportProductionInspections
} from './productionInspection.controller';

const router = Router();

router.use(authenticate);

// 列表查询
router.get('/', getProductionInspections);

// 导出
router.get('/export', exportProductionInspections);

// 按生产单查询
router.get('/by-order/:orderNo', getInspectionsByOrder);

// 详情（含明细项）
router.get('/:id', getProductionInspectionDetail);

// 更新检验结果
router.put('/:id', updateProductionInspection);

// 完成检验
router.put('/:id/complete', completeInspection);

// 不合格品处理
router.put('/:id/defect-handling', defectHandling);

// 删除检验记录
router.delete('/:id', deleteProductionInspection);

export default router;
