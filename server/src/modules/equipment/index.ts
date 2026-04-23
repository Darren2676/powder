// 设备域路由聚合
import { Router } from 'express';
import equipmentRoutes from './equipment/equipment.routes';
import mouldRoutes from './mould/mould.routes';
import mouldMaintenanceRoutes from './mouldMaintenance/mouldMaintenance.routes';
import equipmentDowntimeRoutes from './equipmentDowntime/equipmentDowntime.routes';
import equipmentMaintenancePlanRoutes from './equipmentMaintenancePlan/equipmentMaintenancePlan.routes';
import equipmentOeeRoutes from './equipmentOee/equipmentOee.routes';

const router = Router();

router.use('/equipments', equipmentRoutes);
router.use('/moulds', mouldRoutes);
router.use('/mould-maintenance', mouldMaintenanceRoutes);
router.use('/equipment-downtime', equipmentDowntimeRoutes);
router.use('/equipment-maintenance-plan', equipmentMaintenancePlanRoutes);
router.use('/equipment-oee', equipmentOeeRoutes);

export default router;
