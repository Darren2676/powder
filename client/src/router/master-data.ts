// master-data 域路由
import type { RouteRecordRaw } from 'vue-router';

const CustomerList = () => import('@/views/master-data/Customer/List.vue');
const CustomerDetail = () => import('@/views/master-data/Customer/Detail.vue');
const SupplierList = () => import('@/views/master-data/Supplier/List.vue');
const SupplierDetail = () => import('@/views/master-data/Supplier/Detail.vue');
const EmployeeList = () => import('@/views/master-data/Employee/List.vue');
const ScheduleList = () => import('@/views/master-data/Schedule/List.vue');
const TeamList = () => import('@/views/master-data/Team/List.vue');
const WorkshopList = () => import('@/views/master-data/Workshop/List.vue');
const ProductionlineList = () => import('@/views/master-data/Productionline/List.vue');
const MateriaPropertyList = () => import('@/views/master-data/MateriaProperty/List.vue');
const MaterialClassList = () => import('@/views/master-data/MaterialClass/List.vue');
const ProductClassList = () => import('@/views/master-data/ProductClass/List.vue');
const ProcedureList = () => import('@/views/master-data/Procedure/List.vue');
const WorkCenterList = () => import('@/views/master-data/WorkCenter/List.vue');
const WarehouseList = () => import('@/views/master-data/Warehouse/List.vue');
const RoutingMasterList = () => import('@/views/master-data/RoutingMaster/List.vue');
const CustomerMaterialMapping = () => import('@/views/master-data/CustomerMaterialMapping/List.vue');
const BomList = () => import('@/views/master-data/Bom/List.vue');
const BomTreeViewer = () => import('@/views/master-data/Bom/TreeViewer.vue');
const CostBomIndex = () => import('@/views/master-data/CostBom/Index.vue');
const MfgBomList = () => import('@/views/master-data/MfgBom/List.vue');
const MfgBomTreeViewer = () => import('@/views/master-data/MfgBom/TreeViewer.vue');
const MouldMapping = () => import('@/views/master-data/MfgBom/MouldMapping.vue');
const UnitList = () => import('@/views/master-data/Unit/List.vue');
const StorageLocationList = () => import('@/views/master-data/StorageLocation/List.vue');
const ItemMasterList = () => import('@/views/master-data/ItemMaster/List.vue');
const LogisticsCompanyList = () => import('@/views/master-data/LogisticsCompany/List.vue');
const EngineeringChangeList = () => import('@/views/master-data/EngineeringChange/List.vue');
const EngineeringChangeDetail = () => import('@/views/master-data/EngineeringChange/Detail.vue');

export const masterDataRoutes: RouteRecordRaw[] = [
  { path: 'customers', name: 'CustomerList', component: CustomerList, meta: {"title":"客户管理"} },
  { path: 'customers/:id', name: 'CustomerDetail', component: CustomerDetail, meta: {"title":"客户详情"} },
  { path: 'suppliers', name: 'SupplierList', component: SupplierList, meta: {"title":"供应商管理"} },
  { path: 'suppliers/:id', name: 'SupplierDetail', component: SupplierDetail, meta: {"title":"供应商详情"} },
  { path: 'employees', name: 'EmployeeList', component: EmployeeList, meta: {"title":"员工管理"} },
  { path: 'schedules', name: 'ScheduleList', component: ScheduleList, meta: {"title":"班次管理"} },
  { path: 'teams', name: 'TeamList', component: TeamList, meta: {"title":"班组管理"} },
  { path: 'workshops', name: 'WorkshopList', component: WorkshopList, meta: {"title":"车间管理"} },
  { path: 'productionlines', name: 'ProductionlineList', component: ProductionlineList, meta: {"title":"生产线管理"} },
  { path: 'materia-properties', name: 'MateriaPropertyList', component: MateriaPropertyList, meta: {"title":"物料属性管理"} },
  { path: 'material-classes', name: 'MaterialClassList', component: MaterialClassList, meta: {"title":"物料分类管理"} },
  { path: 'product-classes', name: 'ProductClassList', component: ProductClassList, meta: {"title":"产品分类管理"} },
  { path: 'procedures', name: 'ProcedureList', component: ProcedureList, meta: {"title":"标准工序"} },
  { path: 'work-centers', name: 'WorkCenterList', component: WorkCenterList, meta: {"title":"工作中心"} },
  { path: 'warehouses', name: 'WarehouseList', component: WarehouseList, meta: {"title":"仓库管理"} },
  { path: 'routing-masters', name: 'RoutingMasterList', component: RoutingMasterList, meta: {"title":"工艺路线（主从）"} },
  { path: 'customer-material-mapping', name: 'CustomerMaterialMapping', component: CustomerMaterialMapping, meta: {"title":"客户物料对照表"} },
  { path: 'boms', name: 'BomList', component: BomList, meta: {"title":"BOM物料清单"} },
  { path: 'bom-tree', name: 'BomTreeViewer', component: BomTreeViewer, meta: {"title":"BOM结构树"} },
  { path: 'cost-bom', name: 'CostBomIndex', component: CostBomIndex, meta: {"title":"成本BOM"} },
  { path: 'mfg-boms', name: 'MfgBomList', component: MfgBomList, meta: {"title":"制造BOM管理"} },
  { path: 'mfg-bom-tree', name: 'MfgBomTreeViewer', component: MfgBomTreeViewer, meta: {"title":"制造BOM结构"} },
  { path: 'mould-bom-mapping', name: 'MouldMapping', component: MouldMapping, meta: {"title":"模具BOM映射"} },
  { path: 'units', name: 'UnitList', component: UnitList, meta: {"title":"单位管理"} },
  { path: 'storage-locations', name: 'StorageLocationList', component: StorageLocationList, meta: {"title":"库位管理"} },
  { path: 'item-masters', name: 'ItemMasterList', component: ItemMasterList, meta: {"title":"物料主数据管理"} },
  { path: 'logistics-companies', name: 'LogisticsCompanyList', component: LogisticsCompanyList, meta: {"title":"物流公司管理"} },
  { path: 'engineering-changes', name: 'EngineeringChangeList', component: EngineeringChangeList, meta: {"title":"工程更改"} },
  { path: 'engineering-changes/:id', name: 'EngineeringChangeDetail', component: EngineeringChangeDetail, meta: {"title":"工程更改详情"} },
];
