import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { getList, getDetail, matchScheme, create, update, remove } from './productLabelScheme.controller';

const router = Router();

router.get('/', authenticate, getList);
router.get('/match', authenticate, matchScheme);
router.get('/:id', authenticate, getDetail);
router.post('/', authenticate, create);
router.put('/:id', authenticate, update);
router.delete('/:id', authenticate, remove);

export default router;
