# Seals MES 系统项目工程结构优化方案 — 优化评估结果

> 评估日期：2026-04-21
> 评估范围：server/src 全部模块 + client/src 全部模块
> 基准文档：《Seals MES 系统项目工程结构优化方案》（四阶段实施计划）

---

## 一、总体评估

**综合评分：★★★★☆（4/5）** — 核心架构目标已达成，仍有纵深优化空间

| 维度 | 优化前 | 优化后 | 评分 |
|------|--------|--------|------|
| 跨模块 Controller 耦合 | 16 处 | **0 处** | ★★★★★ |
| Service 层存在性 | 2 个（基础设施） | **11 个（8 业务 + 3 基础）** | ★★★★☆ |
| 事务管理统一性 | 无统一工具，手动 try/catch | **withTransaction + 6 Service 迁移完成** | ★★★★☆ |
| 单元测试 | 0 个测试 | **52 个测试 / 5 个测试文件** | ★★★☆☆ |
| 后端目录规范 | 混乱 | **modules / services / shared 三层清晰** | ★★★★☆ |
| 前端目录规范 | 无统一结构 | **views / api / composables / components 四层** | ★★★★☆ |
| 编译 & 测试 | 不适用 | **tsc 通过 + vitest 52/52 通过** | ★★★★★ |

---

## 二、四阶段目标达成率

| 阶段 | 目标 | 达成度 | 评价 |
|------|------|--------|------|
| 一 | 抽取共享服务 | **100%** | inventory + documentNumber + linesideMovement 全部完成 |
| 二 | 核心业务 Service | **100%** | 7 个核心 Controller 已抽取，Service 层完整建立 |
| 三 | 审批回调注册 | **100%** | 19 模块注册、开闭原则达成 |
| 四 | 统一事务 + 单元测试 | **70%** | Service 层事务统一完成；Controller 层事务残留；测试覆盖面需扩展 |

---

## 三、已达标项 ✅

### 3.1 跨模块 Controller 耦合 — 完全消除

- **优化前**：16 处 Controller 之间的直接导入（如 `approval.controller → workReport.controller`）
- **优化后**：**0 处**。全量搜索 `from.*controller.*import` — 零结果
- 所有 83 个 Controller 文件均不导入其他 Controller

**耦合消除明细：**

| 原耦合路径 | 解耦方式 |
|-----------|---------|
| approval.controller → workReport.controller | approval.service 注册回调 |
| approval.controller → forecast.controller | approval.service 注册回调 |
| order.controller → outsourcingReq.controller | orderDispatch.service 调用 documentNumber.service |
| processTask.controller → outsourcingReq.controller | orderDispatch.service 调用 documentNumber.service |
| outsourcingReq.controller → outsourcingOrder.controller | documentNumber.service 统一管理 |
| workReport.controller → wipReport.controller | linesideMovement.service 共享服务 |
| materialIssue.controller → materialWarehouse.controller | inventory.service 共享服务 |
| materialIssue.controller → wipReport.controller | linesideMovement.service 共享服务 |
| finishedGoods.controller → materialWarehouse.controller | inventory.service 共享服务 |
| finishedGoods.controller → wipReport.controller | linesideMovement.service 共享服务 |
| stockIn.controller → materialWarehouse.controller | inventory.service 共享服务 |
| stockCount.controller → materialWarehouse.controller | inventory.service 共享服务 |
| stockCount.controller → finishedGoods.controller | inventory.service 共享服务 |
| abnormalIO.controller → materialWarehouse.controller | inventory.service 共享服务 |
| abnormalIO.controller → finishedGoods.controller | inventory.service 共享服务 |
| mps.controller → plan.controller | documentNumber.service 共享服务 |

### 3.2 Service 层建立

| Service 文件 | 行数 | 导出函数数 | 职责 | 抽取自 |
|-------------|------|-----------|------|--------|
| `inventory.service.ts` | ~180 | 4 | 批次号生成、库存汇总同步 | materialWarehouse.controller, finishedGoods.controller |
| `documentNumber.service.ts` | ~231 | 10 | 统一单据编号生成（11 种编号） | 多个 Controller |
| `linesideMovement.service.ts` | ~250 | 4 | 线边物流记录与冲销 | wipReport.controller, workReport.controller |
| `workReport.service.ts` | ~770 | 9 | 报工 CRUD、任务状态同步 | workReport.controller |
| `approval.service.ts` | ~600 | 12 | 审批流编排、回调注册、批量操作 | approval.controller |
| `warehouse.service.ts` | ~1,192 | 8 | 成品/物料入库出库、FIFO 扣减 | finishedGoods.controller, materialWarehouse.controller |
| `orderDispatch.service.ts` | ~1,023 | 7 | 派工、备料、拆单、冲突检测 | order.controller, processTask.controller |
| `forecast.service.ts` | ~150 | 2 | 预测消耗/恢复（审批回调） | forecast.controller |

**辅助基础设施：**

| 文件 | 职责 |
|------|------|
| `shared/errors/BusinessError.ts` | 业务异常类，Service 抛出 → Controller 转 HTTP 响应 |
| `shared/db/withTransaction.ts` | 统一事务管理工具，支持 afterCommit 钩子 |
| `shared/constants/statuses.ts` | 跨域共享状态常量 |
| `workflow.engine.ts` | 工作流引擎执行逻辑 |
| `workflow.hooks.ts` | 工作流模块钩子，委托 approval.service 回调注册 |
| `xinheyun.service.ts` | 信和云第三方平台对接 |

### 3.3 Controller 瘦身（7 个核心 Controller）

| Controller | 重构前行数 | 重构后行数 | 缩减比例 |
|-----------|----------|----------|---------|
| workReport.controller | 854 | 226 | **-73%** |
| approval.controller | 571 | 236 | **-58%** |
| materialWarehouse.controller | 794 | 385 | **-51%** |
| finishedGoods.controller | 1,447 | 675 | **-53%** |
| order.controller | 1,530 | 776 | **-49%** |
| processTask.controller | 690 | 548 | **-20%** |
| forecast.controller | 634 | 478 | **-24%** |

### 3.4 统一事务管理

**`withTransaction` 工具迁移成果：**

| Service 文件 | 迁移函数数 | 特殊处理 |
|-------------|-----------|---------|
| `workReport.service.ts` | 5 | 已使用 managed pattern，简单替换 |
| `warehouse.service.ts` | 8 | 手动 try/catch → withTransaction，累积变量移入回调 |
| `forecast.service.ts` | 2 | 事务前读取保留在外层 |
| `orderDispatch.service.ts` | 3 | 事务前校验保留在外层 |
| `approval.service.ts` | 8 | 4 处使用 afterCommit 回调；批量操作 rollback+continue → throw BusinessError |
| `workflow.engine.ts` | 3 | rollback+return{success:false} → throw BusinessError + 外层 catch 转回 |

**设计要点：**
- `afterCommit` 钩子：回调在事务提交后执行，失败仅日志不回滚（数据已提交）
- `BusinessError` 模式：Service 统一抛出，Controller catch 后转 HTTP 响应
- `advanceWorkflow` 未迁移：使用可选外部事务 + `ownTransaction` 模式

### 3.5 审批回调注册模式

- 19 个审批模块全部注册回调
- 2 个实际逻辑（work_report、sales_order）+ 17 个 noopCallback 占位
- 开闭原则：新增模块无需修改审批代码
- 诊断能力：`getRegisteredModules()` / `hasApprovalHandler()`

### 3.6 单元测试基础设施

| 测试文件 | 测试数 | 覆盖内容 |
|---------|-------|---------|
| `tests/unit/shared/errors/BusinessError.test.ts` | 5 | 构造、instanceof、状态码、堆栈 |
| `tests/unit/shared/db/withTransaction.test.ts` | 8 | 自动提交/回滚、afterCommit 调用/失败/不调用、事务传递 |
| `tests/unit/services/approval.registry.test.ts` | 11 | 注册、合并、查询、分发、未注册模块 |
| `tests/unit/services/documentNumber.service.test.ts` | 17 | 11 种编号生成、序列递增、事务传递 |
| `tests/unit/services/syncTaskCompletion.test.ts` | 9 | 早返回、状态流转、事务传递、空结果 |

**基础设施：**
- Vitest v4.1.4 + `vitest.config.ts`（含路径别名 `@/*`）
- `tests/helpers/mockSequelize.ts`（可复用 Sequelize mock 工厂）
- npm scripts：`test` / `test:watch` / `test:coverage`

### 3.7 后端目录结构规范

```
server/src/
├── modules/          # 12 个业务域，83 个 Controller
│   ├── master-data/  # 24 个 Controller
│   ├── production/   # 8 个 Controller
│   ├── warehouse/    # 5 个 Controller
│   ├── sales/        # 7 个 Controller
│   ├── purchasing/   # 6 个 Controller
│   ├── quality/      # 9 个 Controller
│   ├── system/       # 9 个 Controller
│   ├── equipment/    # 6 个 Controller
│   ├── planning/     # 3 个 Controller
│   ├── integration/  # 3 个 Controller
│   ├── finance/      # 1 个 Controller
│   └── uploads/      # 静态资源
├── services/         # 11 个 Service（8 业务 + 3 基础）
├── shared/           # 跨域共享
│   ├── constants/    # 状态常量
│   ├── db/           # withTransaction 工具
│   ├── errors/       # BusinessError
│   └── utils/        # pagination 等
├── config/           # 数据库配置
├── middleware/       # 中间件
├── routes/           # 路由注册
├── validators/       # 16 个域级验证器
├── utils/            # 通用工具（response, excel, jwt 等）
├── models/           # 数据模型
├── sql/              # SQL 迁移脚本
└── types/            # TypeScript 类型定义
```

### 3.8 前端架构规范

| 层级 | 数量 | 说明 |
|------|------|------|
| views | 115 个 Vue 文件 | 按 13 个业务模块组织 |
| api | 75 个模块 | 与后端模块一一对应 |
| composables | 5 个 | useTableList, useColumnPreference, useApproval, useExport, usePasswordPolicy |
| components | 13 个 | 选择器、审批组件、列设置、布局 |

---

## 四、待改进项 ⚠️

### 4.1 28 个 Controller 仍残留手动事务管理

**严重程度：中**

| 指标 | 数值 |
|------|------|
| 残留 `commit/rollback` 的 Controller | 28 个 |
| 残留 `commit/rollback` 行数 | 160 行 |
| 仍直接调用 `sequelize.transaction()` 的 Controller | 29 个 |

**未抽取的大型 Controller：**

| Controller | 行数 | 手动事务数 |
|-----------|------|----------|
| mrp.controller | 1,008 | 7 |
| materialPreparation.controller | 982 | — |
| abnormalIO.controller | 898 | 9 |
| salesOrder.controller | 858 | 8 |
| workflow.controller | 845 | — |
| mfgBom.controller | 832 | 12 |
| stockCount.controller | 796 | 9 |
| order.controller | 776 | — |
| xinheyunInspect.controller | 648 | — |
| purchaseReq.controller | 642 | — |

**建议**：下一阶段继续从大 Controller 抽取 Service，同时将事务管理统一迁移到 `withTransaction`。

### 4.2 前端大型组件过多

**严重程度：中**

33 个 Vue 文件超过 500 行，10 个超过 800 行：

| 文件 | 行数 |
|------|------|
| production/Order/List.vue | **2,198** |
| master-data/ItemMaster/List.vue | **1,892** |
| sales/SalesOrder/List.vue | **1,600** |
| master-data/MfgBom/List.vue | **1,505** |
| master-data/Bom/List.vue | **1,418** |
| production/DispatchPrint/Index.vue | **1,265** |
| master-data/RoutingMaster/List.vue | **1,154** |
| components/AppSidebar.vue | **1,108** |
| planning/Plan/List.vue | **940** |
| system/Workflow/Designer.vue | **945** |

**建议**：对超过 1000 行的 6 个页面优先做子组件抽取和 composable 提取。

### 4.3 单元测试覆盖率不足

**严重程度：低**

52 个测试仅覆盖 5 个模块，以下 Service 完全无测试：

| 未覆盖 Service | 导出函数数 |
|---------------|-----------|
| warehouse.service | 8 |
| orderDispatch.service | 7 |
| inventory.service | 4 |
| linesideMovement.service | 4 |
| workflow.engine | ~8 |

**建议**：逐步补充，目标 Service 层覆盖率 > 70%。

### 4.4 shared/utils 与 utils 目录职责重叠

**严重程度：低**

`shared/utils/` 仅 1 个文件（pagination.ts），而 `utils/` 有 8 个工具文件。两者职责边界不清。

**建议**：将 `utils/` 中的业务无关工具（password.util、passwordPolicy.util 等）迁移到 `shared/utils/`，`utils/` 保留仅与 HTTP 层相关的工具（response.util、jwt.util 等）。

---

## 五、数据统计

### 5.1 后端规模

| 指标 | 数值 |
|------|------|
| Controller 文件总数 | 83 |
| Controller 总行数 | ~29,740 |
| Controller 平均行数 | 358 |
| 超过 300 行的 Controller | 40 个（48%） |
| 超过 600 行的 Controller | 10 个 |
| 最大 Controller | mrp.controller（1,008 行） |
| Service 文件总数 | 11 |
| Service 总行数 | ~4,396 |
| 跨模块 Controller 导入 | 0 处 |

### 5.2 前端规模

| 指标 | 数值 |
|------|------|
| Vue 视图文件总数 | 115 |
| API 模块总数 | 75 |
| Composable 总数 | 5 |
| 共享组件总数 | 13 |
| 超过 500 行的 Vue 文件 | 33 个 |
| 最大 Vue 文件 | Order/List.vue（2,198 行） |

### 5.3 测试规模

| 指标 | 数值 |
|------|------|
| 测试文件数 | 5 |
| 测试用例总数 | 52 |
| 测试通过率 | 100% |
| 测试框架 | Vitest v4.1.4 |

---

## 六、下一步建议

### 优先级 P0：继续 Controller → Service 抽取

从最大的未抽取 Controller 开始，按影响面排序：

1. **mrp.controller**（1,008 行）→ 抽取 `mrp.service.ts`
2. **salesOrder.controller**（858 行）→ 抽取 `salesOrder.service.ts`
3. **abnormalIO.controller**（898 行）→ 抽取到 `warehouse.service.ts` 扩展
4. **materialPreparation.controller**（982 行）→ 抽取到 `orderDispatch.service.ts` 扩展
5. **mfgBom.controller**（832 行）→ 抽取 `bom.service.ts`

同时将抽取后的 Service 事务管理统一迁移到 `withTransaction`。

### 优先级 P1：前端大型组件拆分

对超过 1000 行的 6 个 Vue 文件进行组件拆分：
- 提取表格列为独立配置
- 提取表单/弹窗为子组件
- 提取业务逻辑到 composable

### 优先级 P2：扩展单元测试

为 warehouse、orderDispatch、inventory、linesideMovement 等 Service 补充测试，逐步提升覆盖率。

### 优先级 P3：目录规范微调

- 合并 `shared/utils/` 与 `utils/` 的职责边界
- 考虑将 `sql/` 迁移到 `shared/` 下

---

## 七、结论

经过四个阶段的优化实施，Seals MES 系统的工程结构已从"业务逻辑全在 Controller 中"的架构，成功转型为"Controller 薄层 + Service 业务核心 + Shared 共享层"的三层架构。**跨模块耦合完全消除**是最显著的成果，**统一事务管理**和**审批回调注册模式**为后续开发奠定了良好的工程基础。

当前主要的遗留问题集中在**未抽取 Controller 的手动事务残留**和**前端大型组件**两方面，这些可在后续阶段逐步解决。整体而言，优化方案的核心目标已基本达成，系统可维护性和可测试性显著提升。
