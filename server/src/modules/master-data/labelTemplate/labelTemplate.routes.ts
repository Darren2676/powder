import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { getList, getDetail, create, update, remove, getPresetFields } from './labelTemplate.controller';

const router = Router();

router.get('/', authenticate, getList);
router.get('/preset-fields', authenticate, getPresetFields);
router.get('/:id', authenticate, getDetail);
router.post('/', authenticate, create);
router.put('/:id', authenticate, update);
router.delete('/:id', authenticate, remove);

export default router;
