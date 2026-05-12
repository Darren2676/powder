import { Router } from 'express';
import * as mobileInspectionController from './outsourcingInspection.mobile.controller';

const router = Router();

// 移动端质检路由
router.get('/task/:task_number', mobileInspectionController.getInspectionTask);
router.post('/', mobileInspectionController.submitInspection);

export default router;
