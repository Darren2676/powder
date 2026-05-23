import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { createMaterialReturn, deleteMaterialReturn, getMaterialReturns, getMaterialReturnDetail } from './materialReturn.controller';

const router = Router();

router.post('/', authenticate, createMaterialReturn);
router.delete('/:id', authenticate, deleteMaterialReturn);
router.get('/:id', authenticate, getMaterialReturnDetail);
router.get('/', authenticate, getMaterialReturns);

export default router;
