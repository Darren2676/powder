import { Router } from 'express';
import { validateCreateMaterialIssue } from '../../../validators/production.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { fuzzySearchOrders, queryByOrder, createMaterialIssue, getMaterialIssues, getMaterialIssueDetail } from './materialIssue.controller';

const router = Router();

router.get('/search-orders', authenticate, fuzzySearchOrders);
router.get('/query-by-order/:orderNo', authenticate, queryByOrder);
router.get('/:id', authenticate, getMaterialIssueDetail);
router.get('/', authenticate, getMaterialIssues);
router.post('/', authenticate, validateCreateMaterialIssue, createMaterialIssue);

export default router;
