import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { getScrapTransactionList } from './scrapTransaction.controller';

const router = Router();

router.get('/', authenticate, getScrapTransactionList);

export default router;
