import { Router } from 'express';
import multer from 'multer';
import { validateCreateRoutingMaster, validateUpdateRoutingMaster } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getRoutingHeaders,
  getRoutingHeaderDetail,
  createRoutingHeader,
  updateRoutingHeader,
  deleteRoutingHeader,
  getRoutingDetails,
  addRoutingDetail,
  updateRoutingDetail,
  deleteRoutingDetail,
  exportRoutingHeaders,
  importRoutingHeaders
} from './routingMaster.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Header CRUD
router.get('/', authenticate, getRoutingHeaders);
router.get('/export', authenticate, exportRoutingHeaders);
router.post('/import', authenticate, upload.single('file'), importRoutingHeaders);
router.post('/', authenticate, createRoutingHeader);
router.get('/:id', authenticate, getRoutingHeaderDetail);
router.put('/:id', authenticate, validateUpdateRoutingMaster, updateRoutingHeader);
router.delete('/:id', authenticate, deleteRoutingHeader);

// Detail CRUD
router.get('/:headerId/details', authenticate, getRoutingDetails);
router.post('/:headerId/details', authenticate, addRoutingDetail);
router.put('/details/:detailId', authenticate, updateRoutingDetail);
router.delete('/details/:detailId', authenticate, deleteRoutingDetail);

export default router;
