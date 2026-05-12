import { validateBody } from './index';

// 创建员工
export const validateCreateEmployee = validateBody([
  { field: 'employee_number', label: '员工编号', required: true, maxLength: 50 },
]);

// 更新员工
export const validateUpdateEmployee = validateBody([
  { field: 'employee_number', label: '员工编号', required: true, maxLength: 50 },
]);

// 创建物流公司
export const validateCreateLogisticsCompany = validateBody([
  { field: 'company_name', label: '公司名称', required: true, maxLength: 200 },
]);

// 更新物流公司
export const validateUpdateLogisticsCompany = validateBody([
  { field: 'company_name', label: '公司名称', required: true, maxLength: 200 },
]);

// 创建车间
export const validateCreateWorkshop = validateBody([
  { field: 'workshop_number', label: '车间编号', required: true, maxLength: 50 },
]);

// 更新车间
export const validateUpdateWorkshop = validateBody([
  { field: 'workshop_number', label: '车间编号', required: true, maxLength: 50 },
]);

// 创建生产线
export const validateCreateProductionline = validateBody([
  { field: 'productionline_number', label: '生产线编号', required: true, maxLength: 50 },
]);

// 更新生产线
export const validateUpdateProductionline = validateBody([
  { field: 'productionline_number', label: '生产线编号', required: true, maxLength: 50 },
]);

// 创建班组
export const validateCreateTeam = validateBody([
  { field: 'team_number', label: '班组编号', required: true, maxLength: 50 },
]);

// 更新班组
export const validateUpdateTeam = validateBody([
  { field: 'team_number', label: '班组编号', required: true, maxLength: 50 },
]);

// 创建班次
export const validateCreateSchedule = validateBody([
  { field: 'schedules_id', label: '班次编号', required: true, maxLength: 50 },
]);

// 更新班次
export const validateUpdateSchedule = validateBody([
  { field: 'schedules_id', label: '班次编号', required: true, maxLength: 50 },
]);

// 创建仓库
export const validateCreateWarehouse = validateBody([
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
]);

// 更新仓库
export const validateUpdateWarehouse = validateBody([
  { field: 'warehouse_number', label: '仓库编号', required: true, maxLength: 50 },
]);

// 创建库位
export const validateCreateStorageLocation = validateBody([
  { field: 'location_number', label: '库位编号', required: true, maxLength: 50 },
]);

// 更新库位
export const validateUpdateStorageLocation = validateBody([
  { field: 'location_number', label: '库位编号', required: true, maxLength: 50 },
]);

// 创建单位
export const validateCreateUnit = validateBody([
  { field: 'unit_code', label: '单位编码', required: true, maxLength: 50 },
]);

// 更新单位
export const validateUpdateUnit = validateBody([
]);

// 创建工作中心
export const validateCreateWorkCenter = validateBody([
  { field: 'work_cente_number', label: '工作中心编号', required: true, maxLength: 50 },
]);

// 更新工作中心
export const validateUpdateWorkCenter = validateBody([
  { field: 'work_cente_number', label: '工作中心编号', required: true, maxLength: 50 },
]);

// 创建标准工序
export const validateCreateProcedure = validateBody([
  { field: 'standard_process_number', label: '工序编号', required: true, maxLength: 50 },
]);

// 更新标准工序
export const validateUpdateProcedure = validateBody([
  { field: 'standard_process_number', label: '工序编号', required: true, maxLength: 50 },
]);

// 创建物料主数据
export const validateCreateItemMaster = validateBody([
  { field: 'item_number', label: '物料编号', required: true, maxLength: 100 },
]);

// 更新物料主数据
export const validateUpdateItemMaster = validateBody([
  { field: 'item_number', label: '物料编号', required: true, maxLength: 100 },
]);

// 创建物料分类
export const validateCreateMaterialClass = validateBody([
  { field: 'material_class_number', label: '物料分类编号', required: true, maxLength: 50 },
]);

// 更新物料分类
export const validateUpdateMaterialClass = validateBody([
  { field: 'material_class_number', label: '物料分类编号', required: true, maxLength: 50 },
]);

// 创建物料属性
export const validateCreateMateriaProperty = validateBody([
  { field: 'materia_properties_number', label: '物料属性编号', required: true, maxLength: 50 },
]);

// 更新物料属性
export const validateUpdateMateriaProperty = validateBody([
  { field: 'materia_properties_number', label: '物料属性编号', required: true, maxLength: 50 },
]);

// 创建产品分类
export const validateCreateProductClass = validateBody([
  { field: 'product_class_number', label: '产品分类编号', required: true, maxLength: 50 },
]);

// 更新产品分类
export const validateUpdateProductClass = validateBody([
  { field: 'product_class_number', label: '产品分类编号', required: true, maxLength: 50 },
]);

// 创建BOM
export const validateCreateBom = validateBody([
  { field: 'bom_number', label: 'BOM编号', required: true, maxLength: 50 },
]);

// 更新BOM
export const validateUpdateBom = validateBody([
  { field: 'bom_number', label: 'BOM编号', required: true, maxLength: 50 },
]);

// 创建制造BOM
export const validateCreateMfgBom = validateBody([
  { field: 'mfg_bom_number', label: '制造BOM编号', required: true, maxLength: 50 },
]);

// 更新制造BOM
export const validateUpdateMfgBom = validateBody([
  { field: 'mfg_bom_number', label: '制造BOM编号', required: true, maxLength: 50 },
]);

// 创建工艺路线
export const validateCreateRoutingMaster = validateBody([
  { field: 'process_route_number', label: '工艺路线编号', required: true, maxLength: 50 },
]);

// 更新工艺路线
export const validateUpdateRoutingMaster = validateBody([
  { field: 'process_route_number', label: '工艺路线编号', required: true, maxLength: 50 },
]);

// 创建客户物料对照
export const validateCreateCustomerMaterialMapping = validateBody([
  { field: 'customer_number', label: '客户编号', required: true, maxLength: 50 },
  { field: 'item_number', label: '物料编号', required: true, maxLength: 100 },
]);

// 更新客户物料对照
export const validateUpdateCustomerMaterialMapping = validateBody([
  { field: 'customer_number', label: '客户编号', required: true, maxLength: 50 },
  { field: 'item_number', label: '物料编号', required: true, maxLength: 100 },
]);

// 创建原材料
export const validateCreateMaterial = validateBody([
  { field: 'item_number', label: '物料编号', required: true, maxLength: 100 },
]);

// 更新原材料
export const validateUpdateMaterial = validateBody([
  { field: 'item_number', label: '物料编号', required: true, maxLength: 100 },
]);

// 创建成品
export const validateCreateProduct = validateBody([
  { field: 'item_number', label: '产品编号', required: true, maxLength: 100 },
]);

// 更新成品
export const validateUpdateProduct = validateBody([
  { field: 'item_number', label: '产品编号', required: true, maxLength: 100 },
]);
