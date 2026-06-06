import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getSampleBoms, getSampleBomDetail, createSampleBom, updateSampleBom, deleteSampleBom,
  getSampleBomsByRequest, importFromDesignBom, importDetailsFromDesignBom,
  getVersions, getVersionDetail, createVersion, copyVersion, submitVersion, deleteVersion,
  addVersionDetail, updateVersionDetail, deleteVersionDetail,
  determineFinalVersion, importToDesignBom,
} from './sampleBom.controller';
import {
  getInspectionReports, getInspectionReportDetail, createInspectionReport, updateInspectionReport,
  submitInspectionReport, deleteInspectionReport, getReportByBomVersion,
  addReportItem, updateReportItem, deleteReportItem, batchImportReportItems,
} from './inspectionReport.controller';

const router = Router();

// ==================== 特定路径（必须在 /:id 之前注册，避免路由冲突） ====================
router.get('/by-request/:requestNumber', authenticate, getSampleBomsByRequest);
router.post('/import-from-design-bom', authenticate, importFromDesignBom);

// ==================== 检测报告（必须在 /:id 之前） ====================
router.get('/inspection-reports', authenticate, getInspectionReports);
router.get('/inspection-reports/by-bom/:bomNumber/:ver', authenticate, getReportByBomVersion);
router.get('/inspection-reports/:reportNumber', authenticate, getInspectionReportDetail);
router.post('/inspection-reports', authenticate, createInspectionReport);
router.put('/inspection-reports/:reportNumber', authenticate, updateInspectionReport);
router.post('/inspection-reports/:reportNumber/submit', authenticate, submitInspectionReport);
router.delete('/inspection-reports/:reportNumber', authenticate, deleteInspectionReport);
router.post('/inspection-reports/:reportNumber/items', authenticate, addReportItem);
router.post('/inspection-reports/:reportNumber/items/batch', authenticate, batchImportReportItems);

// ==================== 版本明细（特定路径，必须在 /:bomNumber 之前） ====================
router.put('/version-details/:id', authenticate, updateVersionDetail);
router.delete('/version-details/:id', authenticate, deleteVersionDetail);
router.put('/inspection-report-items/:id', authenticate, updateReportItem);
router.delete('/inspection-report-items/:id', authenticate, deleteReportItem);

// ==================== 样件BOM 主表 ====================
router.get('/', authenticate, getSampleBoms);
router.get('/:id', authenticate, getSampleBomDetail);
router.post('/', authenticate, createSampleBom);
router.put('/:id', authenticate, updateSampleBom);
router.delete('/:id', authenticate, deleteSampleBom);

// ==================== 样件BOM 版本 ====================
router.get('/:bomNumber/versions', authenticate, getVersions);
router.get('/:bomNumber/versions/:ver', authenticate, getVersionDetail);
router.post('/:bomNumber/versions', authenticate, createVersion);
router.post('/:bomNumber/versions/:ver/copy', authenticate, copyVersion);
router.post('/:bomNumber/versions/:ver/submit', authenticate, submitVersion);
router.delete('/:bomNumber/versions/:ver', authenticate, deleteVersion);

// ==================== 样件BOM 版本明细 ====================
router.post('/:bomNumber/versions/:ver/details', authenticate, addVersionDetail);
router.post('/:bomNumber/versions/:ver/import-details-from-design-bom', authenticate, importDetailsFromDesignBom);

// ==================== 确定最终版本 & 导入 ====================
router.post('/:bomNumber/determine-version', authenticate, determineFinalVersion);
router.post('/:bomNumber/import-to-design-bom', authenticate, importToDesignBom);

export default router;
