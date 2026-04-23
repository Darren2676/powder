# Seals MES System - Service 层分析报告

> 分析日期：2026-04-20 | 更新日期：2026-04-21
> 分析范围：server/src 全部 70+ Controller 文件，~31,800 行代码

---

## 实施进度

| 阶段 | 内容 | 状态 |
|------|------|------|
| 阶段一 | 抽取共享服务（inventory、documentNumber、linesideMovement） | **已完成** |
| 阶段二 | 核心业务 Service（workReport、warehouse、approval、forecast、orderDispatch） | **已完成** |
| 阶段三 | 审批回调注册模式（全模块注册 + 日志 + 文档） | **已完成** |
| 阶段四 | 统一事务管理 + 单元测试 | **已完成** |

---

## 已创建的 Service 文件

| 文件 | 行数 | 导出函数数 | 职责 | 抽取自 |
|------|------|-----------|------|--------|
| `inventory.service.ts` | ~180 | 4 | 批次号生成、库存汇总同步 | materialWarehouse.controller, finishedGoods.controller |
| `documentNumber.service.ts` | ~231 | 10 | 统一单据编号生成（10种编号） | 多个 Controller |
| `linesideMovement.service.ts` | ~250 | 4 | 线边物流记录与冲销 | wipReport.controller, workReport.controller |
| `forecast.service.ts` | ~150 | 2 | 预测消耗/恢复（审批回调） | forecast.controller |
| `workReport.service.ts` | ~770 | 9 | 报工CRUD、任务状态同步 | workReport.controller |
| `approval.service.ts` | ~600 | 12 | 审批流编排、回调注册、批量操作 | approval.controller |
| `warehouse.service.ts` | ~1,192 | 8 | 成品/物料入库出库、FIFO扣减 | finishedGoods.controller, materialWarehouse.controller |
| `orderDispatch.service.ts` | ~1,023 | 7 | 派工、备料、拆单、冲突检测 | order.controller, processTask.controller |

**辅助文件：**
- `shared/errors/BusinessError.ts` — 业务异常类，Service 抛出 → Controller 转 HTTP 响应

## Controller 瘦身成果

| Controller | 重构前行数 | 重构后行数 | 缩减比例 |
|-----------|----------|----------|---------|
| workReport.controller.ts | 854 | 227 | -73% |
| approval.controller.ts | 571 | 237 | -58% |
| materialWarehouse.controller.ts | 794 | 386 | -51% |
| finishedGoods.controller.ts | 1,447 | 676 | -53% |
| order.controller.ts | 1,530 | 777 | -49% |
| processTask.controller.ts | 690 | 549 | -20% |
| forecast.controller.ts | 634 | 479 | -24% |

## 跨模块 Controller 导入

| 指标 | 重构前 | 重构后 |
|------|--------|--------|
| 跨模块 Controller 导入 | 16 处 | 1 处（qualityReport.routes.ts，非业务逻辑） |

## 审批回调注册（阶段三完成）

所有 19 个审批模块均已注册回调：

| 模块 | onApprove | onReverse | 类型 |
|------|-----------|-----------|------|
| work_report | onWorkReportApproved (no-op) | onWorkReportReversed (no-op) | 实际逻辑 |
| sales_order | consumeForecastOnOrderApproval | recoverForecastOnOrderReversal | 实际逻辑 |
| 其余 17 个模块 | noopCallback | noopCallback | 占位（可替换） |

**设计要点：**
- 回调在审批事务提交后执行（post-commit），失败不回滚审批状态
- `noopCallback` 工厂函数提供可发现性 — 模块注册即可查
- `getRegisteredModules()` 和 `hasApprovalHandler()` 提供诊断能力
- `dispatchApprovalCallback` 包含慢回调警告（>100ms）和失败日志

---

## 一、现状总览

| 指标 | 数值 |
|------|------|
| 现有 Service 文件 | 2 个（`xinheyun.service.ts`、`workflow.engine.ts`） |
| Controller 文件总数 | 70+ |
| Controller 总行数 | ~31,800 行 |
| 跨模块 Controller 导入 | 16 处 |
| 最复杂 Controller | `finishedGoods.controller.ts`（1,464 行） |
| 单函数最多 SQL 操作 | 15+（`shippingOutbound()`） |

**核心问题：Service 层几乎不存在，所有业务逻辑直接写在 Controller 中。**

---

## 二、现有 Service 文件

仅有的 2 个 Service 文件均属于基础设施层，不含业务逻辑：

| 文件 | 路径 | 职责 |
|------|------|------|
| `xinheyun.service.ts` | `server/src/services/` | 信和云第三方平台对接 |
| `workflow.engine.ts` | `server/src/services/` | 工作流引擎执行逻辑 |

**缺失：** 没有任何模块级的业务 Service 文件（如 `workReport.service.ts`、`warehouse.service.ts` 等）。

---

## 三、Controller 复杂度排名

### 3.1 按行数排名 Top 13

| Controller | 行数 | 导出函数数 | SQL 查询数 | 事务使用数 | 最长函数 |
|-----------|------|-----------|-----------|-----------|---------|
| `production/order/order.controller.ts` | 1,529 | 14 | 55 | 37 | `splitOrders()` ~155 行 |
| `warehouse/finishedGoods/finishedGoods.controller.ts` | 1,464 | 20 | 70 | 115 | `shippingOutbound()` ~290 行 |
| `warehouse/materialWarehouse/materialWarehouse.controller.ts` | 903 | 13 | 45+ | 60+ | `productionInbound()` |
| `production/workReport/workReport.controller.ts` | 853 | 11 | 50 | 25 | `createWorkReport()` ~185 行 |
| `master-data/mfgBom/mfgBom.controller.ts` | 832 | 15 | 30+ | 20+ | 制造BOM变体处理 |
| `sales/salesOrder/salesOrder.controller.ts` | 858 | 15+ | 35+ | 20+ | 多行明细处理 |
| `production/processTask/processTask.controller.ts` | 689 | 12+ | 30+ | 15+ | 任务状态自动化 |
| `master-data/bom/bom.controller.ts` | 617 | 12+ | 25+ | 15+ | BOM 层级管理 |
| `sales/forecast/forecast.controller.ts` | 633 | 13 | 25+ | 10 | 预测消耗逻辑 ~88 行 |
| `system/approval/approval.controller.ts` | 570 | 6 | 30+ | 73 | `reverseApproval()` ~73 行 |
| `purchasing/purchaseOrder/purchaseOrder.controller.ts` | 476 | 10+ | 20+ | 12+ | 采购标准流程 |
| `warehouse/stockIn/stockIn.controller.ts` | 389 | 8+ | 25+ | 30+ | 入库多步操作 |
| `sales/shippingOrder/shippingOrder.controller.ts` | 295 | 8+ | 15+ | 10+ | 较低复杂度 |

**合计重点模块：~11,000+ 行业务逻辑代码集中在 13 个 Controller 文件中。**

### 3.2 业务逻辑密度分布

```
Production (Order + WorkReport + ProcessTask + MaterialIssue):  4,061 行
Warehouse (FinishedGoods + MaterialWarehouse + Stock*):        3,270 行
Sales (SalesOrder + Forecast + ShippingOrder + Return):        2,374 行
Master Data (BOM + MfgBOM + Routing):                          2,266 行
Purchasing (PurchaseOrder + PurchaseReq + etc):                1,700+ 行
```

---

## 四、最严重的问题

### 4.1 Controller 之间的直接调用（16 处紧耦合）

```
approval.controller ──调用──→ workReport.controller (onWorkReportApproved)
                  ──调用──→ forecast.controller (consumeForecastOnOrderApproval)

order.controller ──调用──→ outsourcingReq.controller (generateOutsourcingReqNumber)
processTask.controller ──调用──→ outsourcingReq.controller (同上)
outsourcingReq.controller ──调用──→ outsourcingOrder.controller (generateOutsourcingOrderNumber)

workReport.controller ──调用──→ wipReport.controller (logWorkReportLinesideMovement)

materialIssue.controller ──调用──→ materialWarehouse.controller (generateBatchNumber, syncInventory)
                         ──调用──→ wipReport.controller (logLinesideMovement)

finishedGoods.controller ──调用──→ materialWarehouse.controller (generateBatchNumber)
                       ──调用──→ wipReport.controller (logLinesideMovement)

stockIn.controller ──调用──→ materialWarehouse.controller (generateBatchNumber, generateMaterialTxnNumber, syncMaterialInventorySummary)

stockCount.controller ──调用──→ materialWarehouse.controller (syncFinishedGoodsSummary)
                    ──调用──→ finishedGoods.controller (generateTransactionNumber)

abnormalIO.controller ──调用──→ materialWarehouse.controller (generateBatchNumber, syncFinishedGoodsSummary)
                    ──调用──→ finishedGoods.controller (generateTransactionNumber)

mps.controller ──调用──→ plan.controller (generateProductionNumber)
```

**影响：**
- 循环依赖风险 — 修改一个 Controller 可能影响多个模块
- 无法独立测试 — 任何业务逻辑测试必须走 HTTP 层
- 事务边界模糊 — 跨 Controller 调用时事务一致性无法保证

### 4.2 共享工具函数寄生在 Controller 中

| 函数 | 定义位置 | 被其他 Controller 导入次数 | 本质 |
|------|---------|-------------------------|------|
| `generateBatchNumber()` | materialWarehouse.controller | 4 次 | 领域服务 |
| `generateTransactionNumber()` | finishedGoods.controller | 3 次 | 领域服务 |
| `syncMaterialInventorySummary()` | materialWarehouse.controller | 3 次 | 领域服务 |
| `syncFinishedGoodsSummary()` | materialWarehouse.controller | 2 次 | 领域服务 |
| `generateOutsourcingReqNumber()` | outsourcingReq.controller | 2 次 | 领域服务 |
| `logLinesideMovement()` | wipReport.controller | 2 次 | 领域服务 |
| `generateProductionNumber()` | plan.controller | 1 次 | 领域服务 |

这些函数不处理 HTTP 请求/响应，纯粹是业务计算和数据操作，应该属于 Service 层。

### 4.3 单个函数承载过多职责

#### 案例 1：成品出库 `shippingOutbound()` — 290 行，15+ SQL 操作

| 步骤 | 操作 | 涉及表 |
|------|------|--------|
| 1 | 查询成品批次（FIFO 逻辑） | finished_batch_inventory |
| 2 | 循环检查并扣减批次数量 | finished_batch_inventory |
| 3 | 同步库存汇总 | finished_goods_inventory |
| 4 | 生成事务编号 | — |
| 5 | 插入库存事务记录 | inventory_transaction |
| 6 | 更新销售订单明细已发数量 | sales_order_detail |
| 7 | 检查明细状态 | sales_order_detail |
| 8 | 更新发货状态 | shipping_order |
| 9 | 更新发货请求状态 | shipping_request |
| 10 | 生成发货单编号 | — |
| 11 | 查询客户信息 | customer |
| 12 | 创建发货单 | shipping_order |
| 13 | 创建发货明细 | shipping_order_detail |
| 14 | 创建批次明细 | shipping_order_batch_detail |

**8 个表的写操作全在一个 Controller 函数中，无法独立测试、无法复用。**

#### 案例 2：报工 `createWorkReport()` — 185 行，8+ SQL 操作

| 步骤 | 操作 | 涉及表 |
|------|------|--------|
| 1 | 查询工序任务详情 | process_task |
| 2 | 物料门控验证（首工序需备料完成，非首工序需已领料） | material_preparation, material_issue |
| 3 | 超报比例校验 | production_order |
| 4 | 跨工序数量校验 | process_task |
| 5 | 日产量上限校验 | work_report |
| 6 | 插入报工记录 | work_report |
| 7 | 同步任务完成状态 | process_task |
| 8 | 记录线边物流 | lineside_movement |

**4 种复杂验证逻辑 + 2 次状态同步 + 数据写入，混在一个函数中。**

#### 案例 3：审批 `reverseApproval()` — 73 行，跨 3 个模块

```
approval.controller 内:
  1. 更新业务表审批状态
  2. 插入审批日志
  3. 同步工作流实例状态
  4. 通知用户
  5. 调用 workReport.controller 的回写方法
  6. 调用 forecast.controller 的恢复方法
```

**审批 Controller 直接调用生产和销售模块的 Controller，形成紧耦合。**

---

## 五、复杂状态机逻辑散落在 Controller 中

### 5.1 工序任务状态同步

`workReport.controller.ts` 中的 `syncTaskCompletion()`:

```
IF completed_qty >= planned_qty AND status != '已完成' THEN status = '已完成'
ELSE IF completed_qty > 0 AND completed_qty < planned_qty THEN status = '进行中'
ELSE IF completed_qty <= 0 THEN status = '未开始'

THEN 自动级联更新 production_order.plan_status（基于所有任务完成度）
```

这是一个**多层级状态机**（任务 → 生产单），当前作为 Controller 的内部辅助函数实现。

### 5.2 审批状态转换

`approval.controller.ts` 中管理着 `草稿 → 待审批 → 已审批 → 草稿(反审)` 的状态流转，同时需要：
- 同步工作流实例状态
- 触发模块特定的回调和逆操作
- 记录审批日志
- 发送通知

当前通过 if/else 硬编码模块名来分发回调：
```typescript
if (module === 'work_report') { await onWorkReportApproved(record_id); }
if (module === 'sales_order') { await consumeForecastOnOrderApproval(record_id); }
```

**每新增一个需要审批的模块，就要修改 approval.controller，违反开闭原则。**

---

## 六、改进方案

### 6.1 架构目标

```
重构前:
┌────────────────────────────────────────┐
│ Controller                             │
│  ├─ 参数提取 (req.body)                │
│  ├─ 业务验证 (8 种校验)                │
│  ├─ SQL 操作 (11 次查询)               │
│  ├─ 状态同步 (3 个关联表更新)            │
│  ├─ 跨模块调用 (2 个其他 Controller)     │
│  └─ 响应格式化 (res.json)              │
└────────────────────────────────────────┘

重构后:
┌─────────────────────┐    ┌─────────────────────────────┐
│ Controller (薄层)    │    │ Service (业务核心)           │
│  ├─ 参数提取         │───→│  ├─ 业务验证                  │
│  └─ 响应格式化       │←───│  ├─ 数据操作                  │
│                     │    │  ├─ 状态同步                  │
│                     │    │  └─ 调用其他 Service           │
│                     │    └─────────────────────────────┘
│                     │    ┌─────────────────────────────┐
│                     │    │ Shared Services              │
│                     │    │  ├─ inventory.service        │
│                     │    │  ├─ documentNumber.service   │
│                     │    │  └─ linesideMovement.service │
│                     │    └─────────────────────────────┘
```

### 6.2 Service 层规范

1. **单一职责**：每个 Service 对应一个业务领域
2. **事务边界**：Service 方法定义事务边界，Controller 不管理事务
3. **无 HTTP 依赖**：Service 不引用 req/res，只接收参数返回结果
4. **可测试**：Service 方法可被独立单元测试
5. **错误处理**：Service 抛出业务异常，Controller 转换为 HTTP 响应

```typescript
// Controller: 薄层，仅做 HTTP 适配
export const createWorkReport = async (req, res, next) => {
  try {
    const b = req.body
    const result = await workReportService.createReport(b, req.user)
    res.json({ success: true, data: result })
  } catch (error) { next(error) }
}

// Service: 业务核心，可独立测试
export const createReport = async (params: CreateReportDTO, user: UserInfo) => {
  // 验证 → 操作 → 同步
}
```

### 6.3 阶段一：抽取共享服务（解除跨模块耦合）

优先级最高、风险最低的改动。将寄生在 Controller 中的共享函数抽取为独立 Service：

```
server/src/services/
├── inventory.service.ts          # generateBatchNumber, generateTransactionNumber,
│                                   syncMaterialInventorySummary, syncFinishedGoodsSummary
├── documentNumber.service.ts     # 所有单据编号生成（统一管理）
└── linesideMovement.service.ts   # logLinesideMovement 相关
```

**预期效果：** 消除 16 处跨模块 Controller 导入中的 11 处。

### 6.4 阶段二：为核心业务流建立 Service 层

| 优先级 | Service 文件 | 职责 | 抽取自 Controller 行数 |
|--------|-------------|------|----------------------|
| **P0** | `workReport.service.ts` | 报工验证（物料门控、超报比例、跨工序校验）、任务状态同步 | ~850 行 |
| **P0** | `warehouse.service.ts` | 成品入库（批次+库存+追溯）、出库（FIFO+发货+追溯） | ~2,400 行 |
| **P0** | `approval.service.ts` | 审批流编排、模块回调注册、工作流同步 | ~570 行 |
| **P1** | `forecast.service.ts` | 预测消耗/恢复、与销售订单的联动 | ~130 行 |
| **P1** | `inventoryTransaction.service.ts` | 库存事务统一入口、事务一致性保证 | 分散在多个文件 |
| **P1** | `orderDispatch.service.ts` | 生产单→工序任务派工、拆单逻辑 | ~1,500 行 |

### 6.5 阶段三：审批模块解耦（回调注册模式） ✅ 已完成

将硬编码的模块回调改为注册模式：

```typescript
// 重构前 (approval.controller.ts):
if (module === 'work_report') { await onWorkReportApproved(record_id); }
if (module === 'sales_order') { await consumeForecastOnOrderApproval(record_id); }

// 重构后 (approval.service.ts):
// 回调注册表 — 每个模块注册 onApprove / onReverse 回调
const approvalHandlerRegistry: Record<string, ApprovalHandlers> = {};

export const registerApprovalHandler = (module: string, handlers: ApprovalHandlers): void => {
  approvalHandlerRegistry[module] = { ...approvalHandlerRegistry[module], ...handlers };
};

export const dispatchApprovalCallback = async (
  module: string, action: 'onApprove' | 'onReverse', recordId: string
): Promise<void> => {
  const handlers = approvalHandlerRegistry[module];
  if (!handlers) return;
  const callback = handlers[action];
  if (!callback) return;
  await callback(recordId); // 含日志和错误处理
};

// 所有 19 个模块已注册（2 个实际逻辑 + 17 个 no-op 占位）
registerApprovalHandler('work_report', { onApprove: onWorkReportApproved, onReverse: onWorkReportReversed });
registerApprovalHandler('sales_order', { onApprove: consumeForecastOnOrderApproval, onReverse: recoverForecastOnOrderReversal });
// 其余模块使用 noopCallback 占位，便于将来替换
```

**效果：** 新增审批模块无需修改 approval 代码，满足开闭原则。

### 6.6 阶段四：统一事务管理 + 单元测试 ✅ 已完成

创建 `withTransaction` 工具函数，替代 6 个 Service 文件中 30+ 处手动 try/catch/commit/rollback 模式：

```typescript
// server/src/shared/db/withTransaction.ts
import sequelize from '@/config/database';
import { Transaction } from 'sequelize';

export interface WithTransactionOptions {
  afterCommit?: () => Promise<void>;
}

export async function withTransaction<T>(
  work: (transaction: Transaction) => Promise<T>,
  options?: WithTransactionOptions
): Promise<T> {
  const result = await sequelize.transaction(async (transaction) => {
    return await work(transaction);
  });

  if (options?.afterCommit) {
    try {
      await options.afterCommit();
    } catch (err) {
      console.error('[withTransaction] afterCommit error:', err);
    }
  }

  return result;
}
```

**迁移成果：**

| Service 文件 | 迁移函数数 | 特殊处理 |
|-------------|-----------|---------|
| `workReport.service.ts` | 5 | 已使用 managed pattern，简单替换 |
| `warehouse.service.ts` | 8 | 手动 try/catch → withTransaction，累积变量移入回调 |
| `forecast.service.ts` | 2 | 事务前读取保留在外层 |
| `orderDispatch.service.ts` | 3 | 事务前校验保留在外层 |
| `approval.service.ts` | 8 | 4 处使用 `afterCommit` 回调；批量操作中 `rollback + continue` → `throw BusinessError` |
| `workflow.engine.ts` | 3 | `rollback + return { success: false }` → `throw BusinessError` + 外层 catch 转回 |

**未迁移：**
- `advanceWorkflow`（使用可选外部事务 + `ownTransaction` 模式）
- 接受 `transaction?` 参数的辅助函数（`upsertFinishedGoodsInventory` 等）

**单元测试成果：**

| 测试文件 | 测试数 | 覆盖内容 |
|---------|-------|---------|
| `tests/unit/shared/errors/BusinessError.test.ts` | 5 | 构造、instanceof、状态码、堆栈 |
| `tests/unit/shared/db/withTransaction.test.ts` | 8 | 自动提交/回滚、afterCommit 调用/失败/不调用、事务传递 |
| `tests/unit/services/approval.registry.test.ts` | 11 | 注册、合并、查询、分发、未注册模块 |
| `tests/unit/services/documentNumber.service.test.ts` | 17 | 11 种编号生成、序列递增、事务传递 |
| `tests/unit/services/syncTaskCompletion.test.ts` | 9 | 早返回、状态流转、事务传递、空结果 |

**测试基础设施：**
- Vitest v4.1.4 + `vitest.config.ts`（含路径别名）
- `tests/helpers/mockSequelize.ts`（可复用 mock 工厂）
- `npm test` / `npm run test:watch` / `npm run test:coverage`

---

## 七、实施路线

| 阶段 | 内容 | 风险 | 影响文件数 |
|------|------|------|-----------|
| 阶段一 | 抽取共享服务（inventory、documentNumber、linesideMovement） | 低 | ~10 个 Controller | **已完成** |
| 阶段二 | 核心业务 Service（workReport、warehouse、approval） | 中 | ~6 个 Controller | **已完成** |
| 阶段三 | 审批回调注册模式 | 中 | approval + 各模块 Service | **已完成** |
| 阶段四 | 统一事务管理 + 单元测试 | 低 | 全部 Service | **已完成** |

**原则：**
- 每个阶段完成后确保编译通过和功能回归测试
- Controller 的 API 签名不变，仅将函数体从直接 SQL 改为调用 Service
- Service 先用函数导出模式（非 class），降低迁移成本
- 逐步替换，不搞大爆炸式重构

---

## 八、当前架构 vs 目标架构对比

| 维度 | 当前 | 目标 |
|------|------|------|
| 业务逻辑位置 | Controller 内嵌 | Service 层独立 |
| 跨模块调用 | Controller 直接导入 Controller | Service 调用 Service |
| 事务管理 | 各 Controller 自行 try/catch/rollback | 统一 withTransaction 工具 |
| 可测试性 | 只能通过 HTTP 接口测试 | Service 可独立单元测试 |
| 新增审批模块 | 修改 approval.controller 代码 | 注册回调，无需改审批代码 |
| 单据编号生成 | 散落在多个 Controller | 统一 documentNumber.service |
| 代码复用 | 复制粘贴或跨 Controller 导入 | Service 方法复用 |
| Controller 行数 | 平均 300-1,500 行 | 目标平均 < 100 行 |
