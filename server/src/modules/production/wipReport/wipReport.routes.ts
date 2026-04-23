import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getWipByOrder,
  getWipByOrderDetail,
  getWipByWorkCenter,
  getWipByWorkCenterDetail,
  getLinesideTransactions,
  getWipSummary,
  exportWipByOrderSelected,
  exportWipByWorkCenterSelected,
  exportLinesideTransactionsSelected
} from './wipReport.controller';

const router = Router();

router.post('/by-order/export-selected', authenticate, exportWipByOrderSelected);
router.get('/by-order', authenticate, getWipByOrder);
router.get('/by-order/:orderNo', authenticate, getWipByOrderDetail);
router.post('/by-work-center/export-selected', authenticate, exportWipByWorkCenterSelected);
router.get('/by-work-center', authenticate, getWipByWorkCenter);
router.get('/by-work-center/:wcNumber', authenticate, getWipByWorkCenterDetail);
router.post('/lineside-transactions/export-selected', authenticate, exportLinesideTransactionsSelected);
router.get('/lineside-transactions', authenticate, getLinesideTransactions);
router.get('/summary', authenticate, getWipSummary);

export default router;
