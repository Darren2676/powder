import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });
import {
  getProcessParameters,
  getProcessParameterDetail,
  createProcessParameter,
  updateProcessParameter,
  deleteProcessParameter,
  getParametersByItem,
  getParametersByRoute,
  exportProcessParameters,
  downloadImportTemplate,
  importProcessParameters,
} from './processParameter.controller';

const router = Router();

// 静态路径放在 :id 之前
router.get('/by-item/:itemNumber', authenticate, getParametersByItem);
router.get('/by-route/:itemNumber/:routeNumber', authenticate, getParametersByRoute);
router.get('/export', authenticate, exportProcessParameters);
router.get('/import-template', authenticate, downloadImportTemplate);
router.post('/import', authenticate, upload.single('file'), importProcessParameters);

// CRUD
router.get('/', authenticate, getProcessParameters);
router.post('/', authenticate, createProcessParameter);
router.get('/:id', authenticate, getProcessParameterDetail);
router.put('/:id', authenticate, updateProcessParameter);
router.delete('/:id', authenticate, deleteProcessParameter);

export default router;
