import { Router } from 'express';
import multer from 'multer';
import { validateCreateCustomerMaterialMapping, validateUpdateCustomerMaterialMapping } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getList, getDetail, create, update, remove, reverseLookup, approveMapping, withdrawMapping, exportMappings, importMappings } from './customerMaterialMapping.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getList);
router.get('/export', authenticate, exportMappings);
router.get('/reverse-lookup', authenticate, reverseLookup);
router.post('/import', authenticate, upload.single('file'), importMappings);
router.get('/:id', authenticate, getDetail);
router.post('/', authenticate, validateCreateCustomerMaterialMapping, create);
router.put('/:id/approve', authenticate, approveMapping);
router.put('/:id/withdraw', authenticate, withdrawMapping);
router.put('/:id', authenticate, validateUpdateCustomerMaterialMapping, update);
router.delete('/:id', authenticate, remove);

export default router;
