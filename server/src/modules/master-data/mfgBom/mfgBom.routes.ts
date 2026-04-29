import { Router } from 'express';
import multer from 'multer';
import { validateCreateMfgBom, validateUpdateMfgBom } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getMfgBomHeaders,
  getMfgBomHeaderDetail,
  createMfgBomHeader,
  updateMfgBomHeader,
  deleteMfgBomHeader,
  getMfgBomDetails,
  addMfgBomDetail,
  updateMfgBomDetail,
  deleteMfgBomDetail,
  exportMfgBomData,
  importMfgBomData,
  copyMfgBomAsNewVersion,
  duplicateMfgBom,
  checkMfgBomHasBom,
  getMfgBomTree,
  getMfgBomFlatten,
  importFromBom,
  getMouldBomMappings,
  createMouldBomMapping,
  updateMouldBomMapping,
  deleteMouldBomMapping,
  getMouldBomByItemAndMould,
  approveMouldBomMapping,
  withdrawMouldBomMapping
} from './mfgBom.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// 模具BOM映射 (必须放在 /:id 通配路由之前)
router.get('/mould-mappings', authenticate, getMouldBomMappings);
router.post('/mould-mappings', authenticate, createMouldBomMapping);
router.put('/mould-mappings/:id', authenticate, updateMouldBomMapping);
router.delete('/mould-mappings/:id', authenticate, deleteMouldBomMapping);
router.post('/mould-mappings/:id/approve', authenticate, approveMouldBomMapping);
router.post('/mould-mappings/:id/withdraw', authenticate, withdrawMouldBomMapping);
router.get('/mould-mappings/find', authenticate, getMouldBomByItemAndMould);

// Header CRUD
router.get('/', authenticate, getMfgBomHeaders);
router.get('/export', authenticate, exportMfgBomData);
router.get('/check-has-bom', authenticate, checkMfgBomHasBom);
router.post('/import', authenticate, upload.single('file'), importMfgBomData);
router.post('/import-from-bom', authenticate, importFromBom);
router.post('/', authenticate, validateCreateMfgBom, createMfgBomHeader);
router.get('/:id', authenticate, getMfgBomHeaderDetail);
router.put('/:id', authenticate, validateUpdateMfgBom, updateMfgBomHeader);
router.delete('/:id', authenticate, deleteMfgBomHeader);

// Version Copy & Tree
router.post('/:id/copy-version', authenticate, copyMfgBomAsNewVersion);
router.post('/:id/duplicate', authenticate, duplicateMfgBom);
router.get('/:id/tree', authenticate, getMfgBomTree);
router.get('/:id/flatten', authenticate, getMfgBomFlatten);

// Detail CRUD
router.get('/:headerId/details', authenticate, getMfgBomDetails);
router.post('/:headerId/details', authenticate, addMfgBomDetail);
router.put('/details/:detailId', authenticate, updateMfgBomDetail);
router.delete('/details/:detailId', authenticate, deleteMfgBomDetail);

export default router;
