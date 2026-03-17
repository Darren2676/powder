# Seals MES System — ERP+MES 单据命名规范

## 一、背景

本系统由 MES 逐步向 ERP+MES 整合演进，涉及销售、计划、生产、采购、仓储五大业务链条，共计 11 类核心单据。为保证代码风格统一、降低沟通成本、便于后续扩展，制定本命名规范文档。

---

## 二、通用命名规则

基于现有代码库（30+ 模块）已形成的风格：

| 层级 | 规则 | 现有示例 |
|------|------|----------|
| 数据库表名 | `snake_case`，小写 | `routing_header`, `bom_detail` |
| 数据库字段 | `snake_case`，小写 | `item_number`, `creation_date` |
| 单据编号字段 | `{表名}_number` | `sales_order_number` |
| 控制器文件 | `camelCase.controller.ts` | `routingMaster.controller.ts` |
| 路由文件 | `camelCase.routes.ts` | `routingMaster.routes.ts` |
| API 路由路径 | 小写+连字符，复数名词 | `/routing-masters` |
| 前端 API 文件 | `camelCase.ts` | `routingMaster.ts` |
| Vue 视图目录 | `PascalCase/` | `RoutingMaster/` |
| Vue 页面文件 | `PascalCase.vue` | `List.vue`, `Detail.vue` |
| 前端路由 path | 小写+连字符 | `/routing-masters` |
| 路由 name | `PascalCase` + 页面类型 | `RoutingMasterList` |
| API 函数名 | `动词` + `PascalCase资源名` | `getRoutingHeaders()` |
| 侧边栏 key | `kebab-case` | `routing-masters` |

---

## 三、单据总览

### 3.1 业务链路关系

```
销售链: 销售订单 → 发货通知单 → 发货单
                ↓
计划链: 主生产计划 → 生产单 → 工序任务单 → 报工单
                ↓               ↓
采购链: 采购申请单 → 采购单      ↓
                ↓               ↓
仓储链:         入库单 ←────── 领料单
```

### 3.2 命名对照表

| # | 中文名称 | 英文 Key | 编号前缀 | 业务链 |
|---|---------|----------|---------|--------|
| 1 | 销售订单 | salesOrder | `SO` | 销售 |
| 2 | 发货通知单 | shipNotice | `SN` | 销售 |
| 3 | 发货单 | shipment | `SM` | 销售 |
| 4 | 主生产计划单 | mpsPlan | `MPS` | 计划 |
| 5 | 生产单 | prodOrder | `PO` | 生产 |
| 6 | 工序任务单 | processTask | `PT` | 生产 |
| 7 | 报工单 | workReport | `WR` | 生产 |
| 8 | 采购申请单 | purchaseReq | `PR` | 采购 |
| 9 | 采购单 | purchaseOrder | `PUR` | 采购 |
| 10 | 入库单 | stockIn | `SI` | 仓储 |
| 11 | 领料单 | materialIssue | `MI` | 仓储 |

---

## 四、数据库表命名

### 4.1 销售链

| 单据 | 主表 | 明细表 | 主键字段 |
|------|------|--------|---------|
| 销售订单 | `sales_order` | `sales_order_detail` | `sales_order_number` |
| 发货通知单 | `ship_notice` | `ship_notice_detail` | `ship_notice_number` |
| 发货单 | `shipment` | `shipment_detail` | `shipment_number` |

### 4.2 计划与生产链

| 单据 | 主表 | 明细表 | 主键字段 |
|------|------|--------|---------|
| 主生产计划单 | `mps_plan` | `mps_plan_detail` | `mps_plan_number` |
| 生产单 | `prod_order` | `prod_order_detail` | `prod_order_number` |
| 工序任务单 | `process_task` | — | `process_task_number` |
| 报工单 | `work_report` | — | `work_report_number` |

### 4.3 采购链

| 单据 | 主表 | 明细表 | 主键字段 |
|------|------|--------|---------|
| 采购申请单 | `purchase_req` | `purchase_req_detail` | `purchase_req_number` |
| 采购单 | `purchase_order` | `purchase_order_detail` | `purchase_order_number` |

### 4.4 仓储链

| 单据 | 主表 | 明细表 | 主键字段 |
|------|------|--------|---------|
| 入库单 | `stock_in` | `stock_in_detail` | `stock_in_number` |
| 领料单 | `material_issue` | `material_issue_detail` | `material_issue_number` |

### 4.5 通用字段规范

所有单据主表应包含以下标准字段：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `{xxx}_number` | `NVARCHAR(50)` | 单据编号，主键 |
| `condition` | `NVARCHAR(20)` | 启用状态（启用/禁用） |
| `approval_status` | `NVARCHAR(20)` | 审批状态（草稿/待审批/已审批） |
| `remark` | `NVARCHAR(500)` | 备注 |
| `creation_date` | `NVARCHAR(20)` | 创建日期 |
| `creation_man` | `NVARCHAR(50)` | 创建人 |

所有单据明细表应包含以下标准字段：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `id` | `INT IDENTITY` | 自增主键 |
| `{主表}_number` | `NVARCHAR(50)` | 外键，关联主表 |
| `line_number` | `INT` | 行号（步长 10） |
| `remark` | `NVARCHAR(500)` | 备注 |

---

## 五、后端文件命名

### 5.1 控制器 (server/src/controllers/)

| 单据 | 文件名 |
|------|--------|
| 销售订单 | `salesOrder.controller.ts` |
| 发货通知单 | `shipNotice.controller.ts` |
| 发货单 | `shipment.controller.ts` |
| 主生产计划单 | `mpsPlan.controller.ts` |
| 生产单 | `prodOrder.controller.ts` |
| 工序任务单 | `processTask.controller.ts` |
| 报工单 | `workReport.controller.ts` |
| 采购申请单 | `purchaseReq.controller.ts` |
| 采购单 | `purchaseOrder.controller.ts` |
| 入库单 | `stockIn.controller.ts` |
| 领料单 | `materialIssue.controller.ts` |

### 5.2 路由 (server/src/routes/)

| 单据 | 文件名 | API 路径 |
|------|--------|---------|
| 销售订单 | `salesOrder.routes.ts` | `/sales-orders` |
| 发货通知单 | `shipNotice.routes.ts` | `/ship-notices` |
| 发货单 | `shipment.routes.ts` | `/shipments` |
| 主生产计划单 | `mpsPlan.routes.ts` | `/mps-plans` |
| 生产单 | `prodOrder.routes.ts` | `/prod-orders` |
| 工序任务单 | `processTask.routes.ts` | `/process-tasks` |
| 报工单 | `workReport.routes.ts` | `/work-reports` |
| 采购申请单 | `purchaseReq.routes.ts` | `/purchase-reqs` |
| 采购单 | `purchaseOrder.routes.ts` | `/purchase-orders` |
| 入库单 | `stockIn.routes.ts` | `/stock-ins` |
| 领料单 | `materialIssue.routes.ts` | `/material-issues` |

### 5.3 路由注册 (server/src/routes/index.ts)

```typescript
// ========== 销售管理 ==========
import salesOrderRoutes from './salesOrder.routes';
import shipNoticeRoutes from './shipNotice.routes';
import shipmentRoutes from './shipment.routes';

// ========== 计划与生产 ==========
import mpsPlanRoutes from './mpsPlan.routes';
import prodOrderRoutes from './prodOrder.routes';
import processTaskRoutes from './processTask.routes';
import workReportRoutes from './workReport.routes';

// ========== 采购管理 ==========
import purchaseReqRoutes from './purchaseReq.routes';
import purchaseOrderRoutes from './purchaseOrder.routes';

// ========== 仓储管理 ==========
import stockInRoutes from './stockIn.routes';
import materialIssueRoutes from './materialIssue.routes';

router.use('/sales-orders', salesOrderRoutes);
router.use('/ship-notices', shipNoticeRoutes);
router.use('/shipments', shipmentRoutes);
router.use('/mps-plans', mpsPlanRoutes);
router.use('/prod-orders', prodOrderRoutes);
router.use('/process-tasks', processTaskRoutes);
router.use('/work-reports', workReportRoutes);
router.use('/purchase-reqs', purchaseReqRoutes);
router.use('/purchase-orders', purchaseOrderRoutes);
router.use('/stock-ins', stockInRoutes);
router.use('/material-issues', materialIssueRoutes);
```

### 5.4 审批模块注册 (approval.controller.ts — moduleConfig)

```typescript
const moduleConfig: Record<string, { tableName: string; primaryKey: string; displayName: string }> = {
  // ... 现有模块 ...
  'sales_order':    { tableName: 'sales_order',    primaryKey: 'sales_order_number',    displayName: '销售订单' },
  'ship_notice':    { tableName: 'ship_notice',    primaryKey: 'ship_notice_number',    displayName: '发货通知单' },
  'shipment':       { tableName: 'shipment',       primaryKey: 'shipment_number',       displayName: '发货单' },
  'mps_plan':       { tableName: 'mps_plan',       primaryKey: 'mps_plan_number',       displayName: '主生产计划' },
  'prod_order':     { tableName: 'prod_order',     primaryKey: 'prod_order_number',     displayName: '生产单' },
  'process_task':   { tableName: 'process_task',   primaryKey: 'process_task_number',   displayName: '工序任务单' },
  'work_report':    { tableName: 'work_report',    primaryKey: 'work_report_number',    displayName: '报工单' },
  'purchase_req':   { tableName: 'purchase_req',   primaryKey: 'purchase_req_number',   displayName: '采购申请单' },
  'purchase_order': { tableName: 'purchase_order', primaryKey: 'purchase_order_number', displayName: '采购单' },
  'stock_in':       { tableName: 'stock_in',       primaryKey: 'stock_in_number',       displayName: '入库单' },
  'material_issue': { tableName: 'material_issue', primaryKey: 'material_issue_number', displayName: '领料单' },
};
```

### 5.5 REST API 端点规范

每个单据模块遵循统一的 RESTful 端点结构（以销售订单为例）：

```
GET    /sales-orders              获取列表（分页、搜索、筛选）
GET    /sales-orders/export       导出 Excel
POST   /sales-orders/import       导入 Excel（multer）
POST   /sales-orders              新建
GET    /sales-orders/:id          获取详情（含明细）
PUT    /sales-orders/:id          编辑（仅草稿状态）
DELETE /sales-orders/:id          删除（仅草稿状态，级联删除明细）

GET    /sales-orders/:headerId/details    获取明细列表
POST   /sales-orders/:headerId/details    新增明细行
PUT    /sales-orders/details/:detailId    编辑明细行
DELETE /sales-orders/details/:detailId    删除明细行
```

---

## 六、前端文件命名

### 6.1 API 层 (client/src/api/)

| 单据 | 文件名 | 函数示例 |
|------|--------|---------|
| 销售订单 | `salesOrder.ts` | `getSalesOrders()`, `createSalesOrder()` |
| 发货通知单 | `shipNotice.ts` | `getShipNotices()`, `createShipNotice()` |
| 发货单 | `shipment.ts` | `getShipments()`, `createShipment()` |
| 主生产计划单 | `mpsPlan.ts` | `getMpsPlans()`, `createMpsPlan()` |
| 生产单 | `prodOrder.ts` | `getProdOrders()`, `createProdOrder()` |
| 工序任务单 | `processTask.ts` | `getProcessTasks()`, `createProcessTask()` |
| 报工单 | `workReport.ts` | `getWorkReports()`, `createWorkReport()` |
| 采购申请单 | `purchaseReq.ts` | `getPurchaseReqs()`, `createPurchaseReq()` |
| 采购单 | `purchaseOrder.ts` | `getPurchaseOrders()`, `createPurchaseOrder()` |
| 入库单 | `stockIn.ts` | `getStockIns()`, `createStockIn()` |
| 领料单 | `materialIssue.ts` | `getMaterialIssues()`, `createMaterialIssue()` |

### 6.2 视图目录 (client/src/views/)

| 单据 | 目录 | 页面文件 |
|------|------|---------|
| 销售订单 | `SalesOrder/` | `List.vue` |
| 发货通知单 | `ShipNotice/` | `List.vue` |
| 发货单 | `Shipment/` | `List.vue` |
| 主生产计划单 | `MpsPlan/` | `List.vue` |
| 生产单 | `ProdOrder/` | `List.vue` |
| 工序任务单 | `ProcessTask/` | `List.vue` |
| 报工单 | `WorkReport/` | `List.vue` |
| 采购申请单 | `PurchaseReq/` | `List.vue` |
| 采购单 | `PurchaseOrder/` | `List.vue` |
| 入库单 | `StockIn/` | `List.vue` |
| 领料单 | `MaterialIssue/` | `List.vue` |

### 6.3 前端路由 (client/src/router/index.ts)

```typescript
// ========== 销售管理 ==========
{ path: 'sales-orders',  name: 'SalesOrderList',  component: () => import('@/views/SalesOrder/List.vue'),  meta: { title: '销售订单' } },
{ path: 'ship-notices',  name: 'ShipNoticeList',  component: () => import('@/views/ShipNotice/List.vue'),  meta: { title: '发货通知单' } },
{ path: 'shipments',     name: 'ShipmentList',    component: () => import('@/views/Shipment/List.vue'),    meta: { title: '发货单' } },

// ========== 计划与生产 ==========
{ path: 'mps-plans',     name: 'MpsPlanList',     component: () => import('@/views/MpsPlan/List.vue'),     meta: { title: '主生产计划' } },
{ path: 'prod-orders',   name: 'ProdOrderList',   component: () => import('@/views/ProdOrder/List.vue'),   meta: { title: '生产单' } },
{ path: 'process-tasks', name: 'ProcessTaskList', component: () => import('@/views/ProcessTask/List.vue'), meta: { title: '工序任务单' } },
{ path: 'work-reports',  name: 'WorkReportList',  component: () => import('@/views/WorkReport/List.vue'),  meta: { title: '报工单' } },

// ========== 采购管理 ==========
{ path: 'purchase-reqs',   name: 'PurchaseReqList',   component: () => import('@/views/PurchaseReq/List.vue'),   meta: { title: '采购申请单' } },
{ path: 'purchase-orders', name: 'PurchaseOrderList', component: () => import('@/views/PurchaseOrder/List.vue'), meta: { title: '采购单' } },

// ========== 仓储管理 ==========
{ path: 'stock-ins',       name: 'StockInList',       component: () => import('@/views/StockIn/List.vue'),       meta: { title: '入库单' } },
{ path: 'material-issues', name: 'MaterialIssueList', component: () => import('@/views/MaterialIssue/List.vue'), meta: { title: '领料单' } },
```

### 6.4 侧边栏 (AppSidebar.vue)

**pathMap 注册：**

```typescript
const pathMap: Record<string, string> = {
  // ... 现有条目 ...
  'sales-orders':   '/sales-orders',
  'ship-notices':   '/ship-notices',
  'shipments':      '/shipments',
  'mps-plans':      '/mps-plans',
  'prod-orders':    '/prod-orders',
  'process-tasks':  '/process-tasks',
  'work-reports':   '/work-reports',
  'purchase-reqs':  '/purchase-reqs',
  'purchase-orders':'/purchase-orders',
  'stock-ins':      '/stock-ins',
  'material-issues':'/material-issues',
};
```

**菜单结构：**

```html
<a-sub-menu key="sales">
  <template #icon><ShoppingCartOutlined /></template>
  <template #title>销售管理</template>
  <a-menu-item key="sales-orders">销售订单</a-menu-item>
  <a-menu-item key="ship-notices">发货通知单</a-menu-item>
  <a-menu-item key="shipments">发货单</a-menu-item>
</a-sub-menu>

<a-sub-menu key="production">
  <template #icon><ToolOutlined /></template>
  <template #title>生产管理</template>
  <a-menu-item key="mps-plans">主生产计划</a-menu-item>
  <a-menu-item key="prod-orders">生产单</a-menu-item>
  <a-menu-item key="process-tasks">工序任务单</a-menu-item>
  <a-menu-item key="work-reports">报工单</a-menu-item>
</a-sub-menu>

<a-sub-menu key="procurement">
  <template #icon><AccountBookOutlined /></template>
  <template #title>采购管理</template>
  <a-menu-item key="purchase-reqs">采购申请单</a-menu-item>
  <a-menu-item key="purchase-orders">采购单</a-menu-item>
</a-sub-menu>

<a-sub-menu key="inventory">
  <template #icon><InboxOutlined /></template>
  <template #title>仓储管理</template>
  <a-menu-item key="stock-ins">入库单</a-menu-item>
  <a-menu-item key="material-issues">领料单</a-menu-item>
</a-sub-menu>
```

---

## 七、单据编号生成规范

### 7.1 编号格式

统一格式：`{前缀}-{YYYYMMDD}-{3位序号}`

| 单据 | 前缀 | 示例 |
|------|------|------|
| 销售订单 | `SO` | `SO-20260313-001` |
| 发货通知单 | `SN` | `SN-20260313-001` |
| 发货单 | `SM` | `SM-20260313-001` |
| 主生产计划 | `MPS` | `MPS-20260313-001` |
| 生产单 | `PO` | `PO-20260313-001` |
| 工序任务单 | `PT` | `PT-20260313-001` |
| 报工单 | `WR` | `WR-20260313-001` |
| 采购申请单 | `PR` | `PR-20260313-001` |
| 采购单 | `PUR` | `PUR-20260313-001` |
| 入库单 | `SI` | `SI-20260313-001` |
| 领料单 | `MI` | `MI-20260313-001` |

### 7.2 编号生成 SQL（通用模板）

```sql
-- 以销售订单为例，获取今日最大编号后 +1
DECLARE @prefix NVARCHAR(10) = 'SO';
DECLARE @today NVARCHAR(8) = FORMAT(GETDATE(), 'yyyyMMdd');
DECLARE @pattern NVARCHAR(20) = @prefix + '-' + @today + '-%';

SELECT @prefix + '-' + @today + '-' +
  RIGHT('000' + CAST(
    ISNULL(MAX(CAST(RIGHT(sales_order_number, 3) AS INT)), 0) + 1
  AS NVARCHAR), 3)
FROM sales_order
WHERE sales_order_number LIKE @pattern;
```

---

## 八、与现有模块的兼容说明

| 现有模块 | 现有 Key | 新增单据 | 关系说明 |
|---------|---------|---------|---------|
| 计划管理 | `plan` | 主生产计划 `mpsPlan` | MPS 是企业级计划，现有 `plan` 可作为车间级排产保留，或后续合并至 `mpsPlan` |
| 生产任务单 | `task` | 工序任务单 `processTask` | 现有 `task` 为生产单级别任务，`processTask` 是拆解到工序级别的执行单，两者为父子关系 |
| BOM物料清单 | `bom` | — | 已实现，生产单展开 BOM 生成领料单 |
| 工艺路线 | `routingMaster` | — | 已实现，生产单关联工艺路线拆解工序任务单 |

---

## 九、命名速查表

完整的 11 个单据在各层级的命名速查：

| 中文 | 英文Key | DB表 | 控制器文件 | 路由路径 | API文件 | Vue目录 | 菜单Key |
|------|---------|------|-----------|---------|---------|---------|---------|
| 销售订单 | salesOrder | sales_order | salesOrder.controller.ts | /sales-orders | salesOrder.ts | SalesOrder/ | sales-orders |
| 发货通知单 | shipNotice | ship_notice | shipNotice.controller.ts | /ship-notices | shipNotice.ts | ShipNotice/ | ship-notices |
| 发货单 | shipment | shipment | shipment.controller.ts | /shipments | shipment.ts | Shipment/ | shipments |
| 主生产计划 | mpsPlan | mps_plan | mpsPlan.controller.ts | /mps-plans | mpsPlan.ts | MpsPlan/ | mps-plans |
| 生产单 | prodOrder | prod_order | prodOrder.controller.ts | /prod-orders | prodOrder.ts | ProdOrder/ | prod-orders |
| 工序任务单 | processTask | process_task | processTask.controller.ts | /process-tasks | processTask.ts | ProcessTask/ | process-tasks |
| 报工单 | workReport | work_report | workReport.controller.ts | /work-reports | workReport.ts | WorkReport/ | work-reports |
| 采购申请单 | purchaseReq | purchase_req | purchaseReq.controller.ts | /purchase-reqs | purchaseReq.ts | PurchaseReq/ | purchase-reqs |
| 采购单 | purchaseOrder | purchase_order | purchaseOrder.controller.ts | /purchase-orders | purchaseOrder.ts | PurchaseOrder/ | purchase-orders |
| 入库单 | stockIn | stock_in | stockIn.controller.ts | /stock-ins | stockIn.ts | StockIn/ | stock-ins |
| 领料单 | materialIssue | material_issue | materialIssue.controller.ts | /material-issues | materialIssue.ts | MaterialIssue/ | material-issues |
