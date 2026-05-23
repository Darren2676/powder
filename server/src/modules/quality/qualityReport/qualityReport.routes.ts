import { Router } from 'express';
import { validateCreatePurchaseInspection, validateUpdatePurchaseInspection } from '../../../validators/quality.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getProductionQualityReport,
  getQualitySummary,
  getDefectAnalysis,
  getProcessQuality,
  getProductQualitySummary,
  getYieldRateReport,
  getProductionOrderQualityPivot
} from './qualityReport.controller';
import {
  createPurchaseInspection,
  getPurchaseInspections,
  getPurchaseInspectionDetail,
  updatePurchaseInspection,
  completePurchaseInspection,
  getPurchaseInspectionSummary,
  defectHandlingPurchaseInspection,
  cancelDefectHandlingPurchaseInspection
} from '../../purchasing/purchaseInspection/purchaseInspection.controller';

const router = Router();

// 单个生产单质量报告
router.get('/production/:production_order_number', authenticate, getProductionQualityReport);

// 质量汇总统计
router.get('/summary', authenticate, getQualitySummary);

// 缺陷分析
router.get('/defect-analysis', authenticate, getDefectAnalysis);

// 工序质量排名
router.get('/process-quality', authenticate, getProcessQuality);

// 按产品质量汇总
router.get('/product-summary', authenticate, getProductQualitySummary);

// 综合合格率报表
router.get('/yield-rate', authenticate, getYieldRateReport);

// 生产单质量透视报表 (行=生产单, 列=缺陷分类)
router.get('/production-order-pivot', authenticate, getProductionOrderQualityPivot);

// ==================== 采购质量检验 ====================

// 创建采购质量检验单
router.post('/purchase-inspection', authenticate, createPurchaseInspection);

// 检验单列表
router.get('/purchase-inspections', authenticate, getPurchaseInspections);

// 采购质量统计
router.get('/purchase-inspection-summary', authenticate, getPurchaseInspectionSummary);

// 检验单详情
router.get('/purchase-inspections/:inspection_number', authenticate, getPurchaseInspectionDetail);

// 更新检验单
router.put('/purchase-inspections/:inspection_number', authenticate, validateUpdatePurchaseInspection, updatePurchaseInspection);

// 完成检验
router.put('/purchase-inspections/:inspection_number/complete', authenticate, completePurchaseInspection);

// 不合格品处理
router.put('/purchase-inspections/:inspection_number/defect-handling', authenticate, defectHandlingPurchaseInspection);

// 撤销不合格品处理
router.put('/purchase-inspections/:inspection_number/cancel-defect-handling', authenticate, cancelDefectHandlingPurchaseInspection);

export default router;
