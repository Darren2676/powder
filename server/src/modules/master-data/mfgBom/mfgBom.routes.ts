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
  importFromBom
} from './mfgBom.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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
