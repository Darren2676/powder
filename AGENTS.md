# Seals MES System - Qoder AI Development Rules

## 项目概述
这是一个模具制造企业 MES 系统，采用前后端分离架构。
- 后端项目路径：server/
- 前端项目路径：client/
- 数据库：SQL Server，数据库名：SEALSMES

## 技术栈
- 后端：Node.js + Express 5.x + TypeScript 5.x + Sequelize 6.x + SQL Server
- 前端：Vue 3.5 + Vite 7.x + TypeScript 5.x + Ant Design Vue 4.x + Pinia 3.x

## 开发命令
- 后端启动：cd server && npm run dev（端口 3000）
- 前端启动：cd client && npm run dev（端口 5173）
- 后端构建：cd server && npm run build
- 前端构建：cd client && npm run build
- 后端类型检查：cd server && npx tsc --noEmit
- 前端类型检查：cd client && npx vue-tsc --noEmit

## 后端代码规范

### 目录结构（优化后）
后端代码按业务域组织在 src/modules/ 下，每个模块包含：
- {module}.routes.ts    -- 路由定义
- {module}.controller.ts -- 控制器
- {module}.service.ts   -- 业务逻辑（复杂场景）

业务域划分：
- modules/system/       -- 系统管理域（auth, user, department, workflow...）
- modules/master-data/  -- 基础数据域（customer, supplier, workshop, warehouse...）
- modules/sales/        -- 销售域（salesOrder, forecast, shipping...）
- modules/planning/     -- 计划域（plan, mps, mrp）
- modules/production/   -- 生产域（order, processTask, workReport...）
- modules/warehouse/    -- 仓库域（materialWarehouse, finishedGoods, stockIn...）
- modules/purchasing/   -- 采购域（purchaseReq, purchaseOrder...）
- modules/quality/      -- 质量域（defect, inspectionSpec, inspectionPlan...）
- modules/finance/      -- 财务域（accountingPeriod...）
- modules/integration/  -- 外部集成域（xinheyun, batchTrace...）
- modules/equipment/    -- 设备域（equipment, mould）

公共模块位于 src/shared/：
- shared/middleware/    -- 中间件（auth, role, upload, error）
- shared/utils/         -- 工具函数（jwt, password, excel, response, pagination）

输入校验位于 src/validators/：
- validators/index.ts          -- validateBody()、validatePagination() 中间件工厂
- validators/auth.validator.ts -- 注册/登录/改密校验
- validators/customer.validator.ts -- 客户创建/更新校验
- validators/supplier.validator.ts -- 供应商创建/更新校验
- validators/order.validator.ts    -- 销售单/生产单/采购申请校验

数据库迁移脚本位于 src/sql/migrations/：
- 001-019 为 .ts 格式（import sequelize from '../../config/database'）
- 020-031 为 .js 格式（直接 new Sequelize()）
- 编号命名，如 009_design_mfg_bom.ts

### Controller 规范
- 签名：async methodName(req: Request, res: Response, next: NextFunction)
- 所有方法用 try/catch 包裹，catch 调用 next(error)
- 返回格式：res.json({ success: true, data, message })
- 列表查询支持分页：page（默认1）, limit（默认20）
- 简单 CRUD 直接在 controller 中使用 raw SQL，复杂逻辑抽到 Service 层
- 使用 sequelize.query() 执行 SQL，参数用 replacements 防注入
- 路由参数统一使用 `:id`（禁止使用 `:customerId`、`:supplierId` 等实体前缀形式）
- 请求体统一用 `const b = req.body` 缩写访问
- 涉及多表写操作（创建主表+明细、批量更新等）必须使用 sequelize.transaction()

### Controller 错误处理规范
- 业务验证失败：直接 inline 返回 400，不走 next(error)
  ```typescript
  if (!b.field) { res.status(400).json({ success: false, message: '字段必填' }); return; }
  ```
- 资源不存在：inline 返回 404
  ```typescript
  if (!rows.length) { res.status(404).json({ success: false, message: '记录不存在' }); return; }
  ```
- 审核状态拦截：inline 返回 403
  ```typescript
  if ((row.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    res.status(403).json({ success: false, message: '已审核记录不允许操作' }); return;
  }
  ```
- 异常捕获：统一 catch 调用 next
  ```typescript
  catch (error) { next(error); }
  ```

### Controller 模板
```typescript
import { Request, Response, NextFunction } from 'express'
import sequelize from '@/config/database'
import { APPROVAL_STATUS } from '@/shared/constants/statuses'

export const getList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const search = (req.query.search as string) || ''
    const offset = (page - 1) * limit

    const conditions: string[] = []
    const replacements: any = {}
    if (search) {
      conditions.push(`(field1 LIKE :search OR field2 LIKE :search)`)
      replacements.search = `%${search}%`
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM table_name ${whereClause}`,
      { replacements }
    )
    const total = countResult[0]?.total || 0

    const [items]: any = await sequelize.query(
      `SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS _row_num
        FROM table_name ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    )

    res.json({ success: true, data: { items, pagination: { page, limit, total } } })
  } catch (error) { next(error) }
}

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body
    if (!b.required_field) {
      res.status(400).json({ success: false, message: '必填字段不能为空' }); return
    }
    // ... SQL INSERT
    res.json({ success: true, message: '创建成功' })
  } catch (error) { next(error) }
}
```

### 审核/撤消操作规范
- 审核操作：UPDATE 表 SET approval_status = N'已审核' WHERE pk = :id
- 撤消操作：UPDATE 表 SET approval_status = N'未审核' WHERE pk = :id
- 路由：PUT /:id/approve 和 PUT /:id/withdraw
- 前端审核无需确认弹窗，撤消需要 Modal.confirm 确认

### 路由规范
- RESTful：GET（列表/详情）、POST（创建）、PUT（更新）、DELETE（删除）
- URL 用 kebab-case：/api/customers, /api/work-reports
- 除 /api/auth/login 外，所有路由挂载 authenticate 中间件
- 管理员路由额外挂载 requireRole('admin')
- 路由注册在域级 index.ts 中聚合，再由 routes/index.ts 统一挂载

### 错误处理
- 统一使用 shared/middleware/error.middleware.ts 处理异常
- 错误响应格式：{ success: false, message }
- Controller 内 HTTP 状态码规范：
  - 200：成功
  - 400：业务验证失败（字段缺失、格式错误）
  - 403：权限/状态拦截（已审核记录不允许操作）
  - 404：资源不存在
  - 500：由 error middleware 自动处理未捕获异常

## 前端代码规范

### API 封装
- 每模块一个 API 文件，对应后端模块，按业务域分组在 api/ 子目录下：
  - api/system/        -- 系统管理（user, department, approval, workflow...）
  - api/master-data/   -- 基础数据（customer, supplier, material, warehouse...）
  - api/sales/         -- 销售（salesOrder, forecast, shippingOrder...）
  - api/planning/      -- 计划（plan, mps, mrp）
  - api/production/    -- 生产（order, materialIssue, materialPreparation...）
  - api/warehouse/     -- 仓库（materialWarehouse, finishedGoods, stockIn...）
  - api/purchasing/    -- 采购（purchaseReq, purchaseOrder...）
  - api/quality/       -- 质量（defect, inspectionSpec...）
  - api/finance/       -- 财务（accountingPeriod）
  - api/integration/   -- 外部集成（xinheyun, batchTrace...）
  - api/equipment/     -- 设备（equipment, mould）
- 使用 utils/request.ts 封装的 axios 实例
- 方法命名：getXxxList, createXxx, updateXxx, deleteXxx, approveXxx, withdrawXxx

### Composables（可复用逻辑）
- composables/useTableList.ts  -- 通用表格列表（分页/搜索/加载/行选择）
- composables/useApproval.ts   -- 审核/撤消/提交审批/反审核
- composables/useExport.ts     -- 导出Excel/导入Excel/导出选中行
- composables/useColumnPreference.ts -- 列个性化（排序/显隐/宽度持久化）

**强制规则：所有列表页（List.vue）必须使用 useTableList composable**，禁止手写重复的 pagination/search/fetch 逻辑。

列表页标准用法：
```typescript
import { useTableList } from '@/composables/useTableList'
import { getEntityList } from '@/api/module/entity'

interface Entity { /* ... */ }

const {
  loading, dataSource, searchText, selectedRowKeys,
  pagination, rowSelection, fetchData,
  handleTableChange, handleSearch, handleReset
} = useTableList<Entity>(getEntityList)
```

### 业务组件（跨域复用）
- components/Business/CustomerSelector.vue  -- 客户下拉选择器
- components/Business/SupplierSelector.vue  -- 供应商下拉选择器
- components/Business/WarehouseSelector.vue -- 仓库下拉选择器
- components/Business/ItemSelector.vue      -- 物料下拉选择器

### Views 目录结构
- views/system/        -- 系统管理页面（User, Department, Security, Workflow...）
- views/master-data/   -- 基础数据页面（Customer, Supplier, Material, Workshop...）
- views/sales/         -- 销售页面（SalesOrder, Forecast, Shipping...）
- views/planning/      -- 计划页面（Plan, MPS, MRP）
- views/production/    -- 生产页面（Order, MaterialPreparation, WorkReport...）
- views/warehouse/     -- 仓库页面（MaterialWarehouse, FinishedGoods, StockIn...）
- views/purchasing/    -- 采购页面（PurchaseReq, PurchaseOrder...）
- views/quality/       -- 质量页面（Defect, InspectionSpec...）
- views/finance/       -- 财务页面（AccountingPeriod）
- views/integration/   -- 外部集成页面（Xinheyun, BatchTrace...）
- views/equipment/     -- 设备页面（Equipment, Mould）

### Vue 组件
- 使用 <script setup lang="ts"> 组合式 API
- 表格用 a-table，必须支持分页
- 表单用 a-form，必须有前端校验
- 新增/编辑用 a-modal 或 a-drawer
- 删除必须有 Modal.confirm 确认
- 日期格式化统一使用 dayjs：`dayjs(val).format('YYYY-MM-DD')` 或 `dayjs(val).format('YYYY-MM-DD HH:mm:ss')`
- 禁止使用 `new Date()` 手写日期格式化
- 金额保留 2 位小数，数量保留 4 位小数

### import 顺序（严格遵守）
```typescript
// 1. Vue 核心
import { ref, reactive, computed, onMounted, h, createVNode } from 'vue'
// 2. Vue Router
import { useRouter, useRoute } from 'vue-router'
// 3. Ant Design Vue
import { message, Modal } from 'ant-design-vue'
// 4. Ant Design Icons
import { EditOutlined, DeleteOutlined, ... } from '@ant-design/icons-vue'
// 5. API 函数
import { getEntityList, createEntity, ... } from '@/api/module/entity'
// 6. 组件
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
// 7. Composables
import { useTableList } from '@/composables/useTableList'
// 8. 工具/常量
import dayjs from 'dayjs'
```

### 操作列规范（基础数据页面）
- 主按钮 + 更多下拉模式
- 变体 A（有详情页）：查看 | 更多 > [审核/撤消, 编辑, 删除]
- 变体 B（无详情页）：编辑 | 更多 > [审核/撤消, 删除]
- 审核状态列：蓝色标签"已审核" / 灰色标签"未审核"
- 启用状态列：绿色标签"启用" / 灰色标签"禁用"

### 路由
- kebab-case，与后端 API 路径一致
- 必须有 meta.title
- 按业务域拆分到 router/ 子文件（system.ts, master-data.ts, sales.ts 等 10 个域文件）
- router/index.ts 仅做聚合，导入各域路由并展开到 children

## 数据库规范
- 当前使用 SQL Server（MSSQL），端口 1433
- 表名：snake_case 或现有命名（如 schedules, [group], storage_location）
- 字段名：snake_case
- 业务数据注意软删除和状态字段
- approval_status 字段：N'已审核' / N'未审核'
- status 字段：N'启用' / N'禁用'

## 状态常量规范

禁止在代码中直接硬编码状态字符串，统一引用常量：

**后端常量文件：** `server/src/shared/constants/statuses.ts`
```typescript
export const APPROVAL_STATUS = {
  APPROVED: '已审核',
  UNAPPROVED: '未审核'
} as const

export const CONDITION_STATUS = {
  ENABLED: '启用',
  DISABLED: '禁用'
} as const

export const ORDER_STATUS = {
  DRAFT: '草稿',
  OPEN: '已开启',
  CLOSED: '已关闭'
} as const
```

**前端常量文件：** `client/src/constants/statuses.ts`
```typescript
export const APPROVAL_STATUS = {
  APPROVED: '已审核',
  UNAPPROVED: '未审核'
} as const

export const CONDITION_STATUS = {
  ENABLED: '启用',
  DISABLED: '禁用'
} as const
```

**使用示例：**
```typescript
// 后端 controller
import { APPROVAL_STATUS } from '@/shared/constants/statuses'
if ((row.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { ... }

// 前端组件
import { APPROVAL_STATUS } from '@/constants/statuses'
if (record.approval_status === APPROVAL_STATUS.APPROVED) { ... }
```

## 代码风格规范

### 通用规则（前后端一致）
- 缩进：2 空格（禁止 Tab）
- 引号：单引号（字符串字面量）
- 分号：语句末尾必须带分号
- 尾逗号：多行对象/数组最后一项带逗号
- 行长度：建议不超过 120 字符
- 空行：函数之间保留 1 个空行，import 区与正文之间 1 个空行

### 前端命名规范
- Vue 文件：PascalCase（`List.vue`, `Detail.vue`, `CreateModal.vue`）
- 目录名：PascalCase（`Customer/`, `SalesOrder/`, `Equipment/`）
- Composable 文件：camelCase + use 前缀（`useTableList.ts`）
- API 文件：camelCase（`customer.ts`, `salesOrder.ts`）
- 变量/函数：camelCase
- 事件处理器：`handle` 前缀（`handleSearch`, `handleCreate`, `handleDelete`）
- 状态变量：语义化后缀（`*Loading`, `*Visible`, `*Data`, `*List`）
- 表单工厂函数：`emptyForm()` 返回空表单对象

### 后端命名规范
- 文件名：kebab-case 或 camelCase + 后缀（`customer.controller.ts`, `customer.routes.ts`）
- 函数名：camelCase（`getList`, `create`, `update`, `remove`, `approve`, `withdraw`）
- SQL 中的表/字段：snake_case
- URL 路径：kebab-case（`/api/customers`, `/api/work-centers`）
- 路由参数：统一使用 `:id`

### TypeScript 规范
- 前端：为每个实体定义 interface（放在组件文件顶部或独立 types.ts）
- 后端：catch 块使用 `catch (error)` 而非 `catch (err: any)`
- 禁止在新代码中使用 `as any` 类型断言（sequelize.query 返回值除外）
- API 响应解构：`const res: any = await request.get(...)` 后用 `if (res?.success)` 判断

## 目录命名规范
- views/ 下的业务域目录保持小写：`system/`, `sales/`, `production/`, `quality/` 等
- views/ 下的实体目录统一 PascalCase：`Customer/`, `SalesOrder/`, `Equipment/`
- 禁止实体目录使用全小写（如 ~~`equipment/equipment/`~~ 应为 `equipment/Equipment/`）
- 每个实体目录包含：`List.vue`（列表）、`Detail.vue`（详情，可选）
