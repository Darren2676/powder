import { Router } from 'express';
import * as mobileController from './outsourcingIssue.mobile.controller';

const router = Router();

// 移动端委外发料路由
router.get('/:order_number', mobileController.getIssueOrder);
router.post('/', mobileController.submitIssue);
router.post('/:type/:number/photos', mobileController.uploadPhotos);
router.get('/:type/:number/label', mobileController.printLabel);

export default router;
