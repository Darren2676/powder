import { Router } from 'express';
import * as mobileController from './outsourcingReceipt.mobile.controller';

const router = Router();

// 移动端委外收回路由
router.get('/:order_number', mobileController.getReceiptOrder);
router.post('/', mobileController.submitReceipt);
router.post('/:type/:number/photos', mobileController.uploadPhotos);
router.get('/:type/:number/label', mobileController.printLabel);

export default router;
