import { Router } from 'express';
import multer from 'multer';
import { validateCreateBom, validateUpdateBom } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getBomHeaders,
  getBomHeaderDetail,
  createBomHeader,
  updateBomHeader,
  deleteBomHeader,
  getBomDetails,
  addBomDetail,
  updateBomDetail,
  deleteBomDetail,
  exportBomData,
  importBomData,
  copyBomAsNewVersion,
  checkMaterialHasBom,
  getBomTree,
  getBomFlatten,
  getAvailableCostLists,
  getCostBom,
  exportCostBom
} from './bom.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Header CRUD
router.get('/', authenticate, getBomHeaders);
router.get('/export', authenticate, exportBomData);
router.get('/check-has-bom', authenticate, checkMaterialHasBom);
router.get('/available-cost-lists', authenticate, getAvailableCostLists);
router.post('/import', authenticate, upload.single('file'), importBomData);
router.post('/', authenticate, createBomHeader);
router.get('/:id', authenticate, getBomHeaderDetail);
router.put('/:id', authenticate, validateUpdateBom, updateBomHeader);
router.delete('/:id', authenticate, deleteBomHeader);

// Cost BOM
router.get('/:id/cost-bom', authenticate, getCostBom);
router.get('/:id/cost-bom/export', authenticate, exportCostBom);

// Version Copy & Tree
router.post('/:id/copy-version', authenticate, copyBomAsNewVersion);
router.get('/:id/tree', authenticate, getBomTree);
router.get('/:id/flatten', authenticate, getBomFlatten);

// Detail CRUD
router.get('/:headerId/details', authenticate, getBomDetails);
router.post('/:headerId/details', authenticate, addBomDetail);
router.put('/details/:detailId', authenticate, updateBomDetail);
router.delete('/details/:detailId', authenticate, deleteBomDetail);

export default router;
