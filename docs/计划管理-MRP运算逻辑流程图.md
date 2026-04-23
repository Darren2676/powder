# 计划管理 — MRP 运算逻辑流程图

> 基于代码分析自动生成，源码：`server/src/modules/planning/mrp/mrp.controller.ts`（1009 行）

---

## 一、核心公式

```
净需求 = MAX(0, 毛需求 − 可用供应 + 安全库存)

可用供应 = 现有库存 + 在制品数量 + 采购在途 + 采购申请待执行

子件需求量 = 父件净需求 × (BOM子件实际用量 / BOM基准数量)

开始日期 = 完成日期 − 提前期天数
```

---

## 二、ER 数据模型

```mermaid
erDiagram
    mrp_run ||--o{ mrp_run_plan : "1:N 关联计划"
    mrp_run ||--o{ mrp_run_detail : "1:N 计算结果"
    mrp_run_plan }o--|| Production_plan : "引用生产计划"
    mrp_run_detail }o--|| item_master : "引用物料主数据"
    mrp_run_detail }o--o| mfg_bom_header : "引用制造BOM"
    mfg_bom_header ||--o{ mfg_bom_detail : "1:N BOM子件"
    mrp_run_detail }o--o{ material_inventory : "查库存"
    mrp_run_detail }o--o{ production_order : "查在制品"
    mrp_run_detail }o--o{ purchase_order_detail : "查采购在途"
    mrp_run_detail }o--o{ purchase_req_detail : "查采购申请"

    mrp_run {
        NVARCHAR mrp_run_number PK "MRP-YYYYMMDD-NNN"
        DATETIME run_date
        NVARCHAR run_by
        NVARCHAR run_status "已计算|已确认|已取消"
        INT plan_count
        INT result_count
        INT production_order_count
        INT purchase_req_count
    }

    mrp_run_plan {
        INT id PK
        NVARCHAR mrp_run_number FK
        NVARCHAR production_number FK
        NVARCHAR item_number
        DECIMAL planned_quantity
    }

    mrp_run_detail {
        INT id PK
        NVARCHAR mrp_run_number FK
        INT bom_level "0=成品 1+=子件"
        NVARCHAR parent_item_number
        NVARCHAR item_number
        NVARCHAR action_type "生产|采购|生产+采购"
        NVARCHAR result_status "待确认|已确认|已跳过"
        DECIMAL gross_requirement
        DECIMAL on_hand_inventory
        DECIMAL wip_quantity
        DECIMAL in_transit_po
        DECIMAL pending_pr
        DECIMAL safety_stock
        DECIMAL net_requirement
        DATE planned_start_date
        DATE planned_due_date
        INT lead_time_days
        DECIMAL produce_quantity
        DECIMAL purchase_quantity
        NVARCHAR generated_order_number
    }
```

---

## 三、MRP 运行生命周期状态机

```mermaid
stateDiagram-v2
    [*] --> 选择计划: 用户勾选已审批计划
    选择计划 --> 已计算: POST /api/mrp/run
    已计算 --> 已确认: POST /api/mrp/execute
    已计算 --> 已取消: POST /api/mrp/:id/cancel
    已取消 --> 已删除: DELETE /api/mrp/:id
    已确认 --> [*]: 生产单+采购申请已生成
    已删除 --> [*]: 级联删除 detail+plan+run
```

| 状态 | 可执行操作 | 说明 |
|------|----------|------|
| 已计算 | 执行 / 取消 | BOM分解完成，等待用户审查双源物料分配 |
| 已确认 | 无（终态） | 已生成生产单和采购申请 |
| 已取消 | 删除 | 仅已取消状态可删除 |

---

## 四、MRP 运算核心流程（广度优先 BOM 分解）

```mermaid
flowchart TB
    START([用户选择生产计划]) --> VALIDATE{校验计划列表非空?}
    VALIDATE -- 空 --> ERR400[400: 请选择至少一条生产计划]
    VALIDATE -- 非空 --> QUERY_PLANS[查询已审批的生产计划]
    QUERY_PLANS --> CHECK_PLANS{找到已审批计划?}
    CHECK_PLANS -- 否 --> ERR400B[400: 未找到已审批的生产计划]
    CHECK_PLANS -- 是 --> GEN_NUM[生成MRP运行编号 MRP-YYYYMMDD-NNN]
    GEN_NUM --> INSERT_RUN[创建 mrp_run 头记录]
    INSERT_RUN --> INSERT_PLAN[创建 mrp_run_plan 关联记录]
    INSERT_PLAN --> INIT_QUEUE[初始化BFS队列: 成品入队 Level=0]

    INIT_QUEUE --> BFS_LOOP{队列非空 且 Level≤10?}
    BFS_LOOP -- 否 --> UPDATE_COUNT[更新 mrp_run.result_count]
    BFS_LOOP -- 是 --> GET_MIN_LEVEL[取当前最小Level的批次]

    GET_MIN_LEVEL --> IS_LEVEL0{Level == 0?}
    IS_LEVEL0 -- 是 --> LEVEL0[成品层处理: 直接展开BOM子件]
    IS_LEVEL0 -- 否 --> LEVEL1_PLUS[子件层处理: 需求归集→净需求→决策→展开]

    LEVEL0 --> BFS_LOOP
    LEVEL1_PLUS --> BFS_LOOP

    UPDATE_COUNT --> COMMIT[事务提交]
    COMMIT --> RESPONSE[返回运算统计结果]
```

---

## 五、成品层处理流程（Level 0）

```mermaid
flowchart TB
    L0_START([Level 0 批次]) --> COLLECT_ITEMS[提取去重的成品物料编号]
    COLLECT_ITEMS --> QUERY_BOM[批量查询制造BOM<br/>条件: 启用+已审批]
    QUERY_BOM --> QUERY_LEAD[批量查询 item_master.lead_time_days]

    QUERY_LEAD --> FOR_EACH_PRODUCT[遍历每个成品]
    FOR_EACH_PRODUCT --> HAS_BOM{有制造BOM?}
    HAS_BOM -- 否 --> SKIP[跳过该成品]
    HAS_BOM -- 是 --> CALC_START_DATE[开始日期 = 完成日期 − 提前期]
    CALC_START_DATE --> QUERY_DETAILS[查询BOM子件明细]

    QUERY_DETAILS --> FOR_EACH_DETAIL[遍历子件]
    FOR_EACH_DETAIL --> CALC_CHILD_QTY["子件需求 = 计划数量 × (actual_quantity / base_quantity)"]
    CALC_CHILD_QTY --> PUSH_QUEUE[子件入队 Level=1<br/>due_date = 父件开始日期]
    PUSH_QUEUE --> FOR_EACH_DETAIL

    SKIP --> NEXT_PRODUCT[下一个成品]
    PUSH_QUEUE --> NEXT_PRODUCT
    NEXT_PRODUCT --> FOR_EACH_PRODUCT
```

**关键规则**：
- 成品层 **不做净需求计算**（需求已由 MPS 主计划确定）
- 仅展开 BOM 子件，将子件需求传递到 Level 1

---

## 六、子件层处理流程（Level 1+）

```mermaid
flowchart TB
    L1_START([Level N 批次]) --> AGGREGATE[需求归集: 按物料编号合并<br/>数量累加 / 日期取早 / 来源追溯]

    AGGREGATE --> BATCH_QUERY["批量查询:<br/>① item_master (类型/业务范围/提前期/安全库存)<br/>② mfg_bom_header (制造BOM)<br/>③ material_inventory (现有库存)<br/>④ production_order (在制品)<br/>⑤ purchase_order_detail (采购在途)<br/>⑥ purchase_req_detail (采购申请待执行)"]

    BATCH_QUERY --> FOR_EACH_ITEM[逐物料计算]
    FOR_EACH_ITEM --> CALC_SAFETY[确定安全库存<br/>优先 inventory.safety_stock_quantity<br/>fallback item_master.safety_stock_qty]
    CALC_SAFETY --> CALC_NET["净需求 = MAX(0, 毛需求 − (库存+在制+在途+申请) + 安全库存)"]
    CALC_NET --> DECIDE_ACTION[行动类型决策]
    DECIDE_ACTION --> WRITE_DETAIL[写入 mrp_run_detail]

    WRITE_DETAIL --> SHOULD_EXPAND{需展开子件?<br/>有BOM 且 净需求>0<br/>且 行动含'生产'}
    SHOULD_EXPAND -- 是 --> EXPAND_BOM[查询BOM子件<br/>计算子件需求量<br/>入队 Level=N+1]
    SHOULD_EXPAND -- 否 --> NEXT_ITEM[下一个物料]
    EXPAND_BOM --> NEXT_ITEM
    NEXT_ITEM --> FOR_EACH_ITEM
```

---

## 七、行动类型决策逻辑

```mermaid
flowchart TB
    INPUT([物料]) --> READ_SCOPE[读取 business_scope]
    READ_SCOPE --> PARSE["拆分逗号: scopeArr<br/>canProduce = 含'生产'<br/>canPurchase = 含'采购'"]

    PARSE --> CHECK1{canProduce && canPurchase?}
    CHECK1 -- 是 --> DUAL[生产+采购<br/>双源物料]

    CHECK1 -- 否 --> CHECK2{canProduce && !canPurchase?}
    CHECK2 -- 是 --> PROD[生产]

    CHECK2 -- 否 --> CHECK3{!canProduce && canPurchase?}
    CHECK3 -- 是 --> PURCH[采购]

    CHECK3 -- 否 --> CHECK4{有制造BOM?}
    CHECK4 -- 是 --> PROD_DEFAULT[生产<br/>有配方默认生产]
    CHECK4 -- 否 --> PURCH_DEFAULT[采购<br/>无配方默认采购]
```

| 优先级 | 条件 | 结果 |
|-------|------|------|
| 1 | 业务范围同时含「生产」和「采购」 | **生产+采购**（双源） |
| 2 | 仅含「生产」 | **生产** |
| 3 | 仅含「采购」 | **采购** |
| 4 | 空/NULL + 有制造BOM | **生产** |
| 5 | 空/NULL + 无制造BOM | **采购** |

---

## 八、净需求计算示例

### 8.1 供应数据来源

| 数据项 | 来源表 | SQL 条件 |
|--------|--------|---------|
| 现有库存 | `material_inventory` | `SUM(quantity) WHERE item_number = :x` |
| 安全库存 | `material_inventory` / `item_master` | 优先 `safety_stock_quantity`; fallback `safety_stock_qty` |
| 在制品 | `production_order` | `approval_status='已审批' AND plan_status NOT IN ('已完成','已关闭')` |
| 采购在途 | `purchase_order_detail` JOIN `purchase_order` | `SUM(order_qty - received_qty) WHERE approval_status='已审批'` |
| 采购待执行 | `purchase_req_detail` JOIN `purchase_req` | `SUM(request_qty - ordered_qty) WHERE approval_status='已审批' AND status='未执行'` |

### 8.2 计算示例

| 项目 | 物料 A | 物料 B |
|------|--------|--------|
| 毛需求 | 1000 | 500 |
| 现有库存 | 200 | 300 |
| 在制品 | 300 | 200 |
| 采购在途 | 100 | 50 |
| 采购待执行 | 50 | 0 |
| **可用供应** | **650** | **550** |
| 安全库存 | 100 | 0 |
| **净需求** | MAX(0, 1000−650+100) = **450** | MAX(0, 500−550+0) = **0** |

物料 B 净需求为 0，**不展开其 BOM 子件**。

---

## 九、MRP 执行流程（生成生产单 + 采购申请）

```mermaid
flowchart TB
    EXEC_START([POST /api/mrp/execute]) --> CHECK_STATUS{mrp_run 状态 == 已计算?}
    CHECK_STATUS -- 否 --> ERR_STATUS[400: 不允许执行]
    CHECK_STATUS -- 是 --> DUAL_SCAN[扫描双源物料中选择纯采购的父项]

    DUAL_SCAN --> FOR_ITEMS[遍历确认项]
    FOR_ITEMS --> IS_CHILD_OF_PURE_PURCHASE{父项是纯采购双源物料?}
    IS_CHILD_OF_PURE_PURCHASE -- 是 --> MARK_SKIP[标记'已跳过'<br/>produce_qty=0, purchase_qty=0]
    IS_CHILD_OF_PURE_PURCHASE -- 否 --> CHECK_NET{净需求 > 0?}
    CHECK_NET -- 否 --> MARK_SKIP2[标记'已跳过']
    CHECK_NET -- 是 --> GEN_PROD{action含'生产' 且 prodQty>0?}

    GEN_PROD -- 是 --> CREATE_PO["生成 production_order<br/>编号: PYYYYMMDDNNN<br/>状态: 未开始/草稿"]
    GEN_PROD -- 否 --> GEN_PURCH{action含'采购' 且 purchQty>0?}
    CREATE_PO --> GEN_PURCH

    GEN_PURCH -- 是 --> COLLECT_PR[收集采购申请明细行]
    GEN_PURCH -- 否 --> UPDATE_DETAIL[更新detail: 已确认+数量+订单号]
    COLLECT_PR --> UPDATE_DETAIL
    UPDATE_DETAIL --> FOR_ITEMS

    MARK_SKIP --> FOR_ITEMS
    MARK_SKIP2 --> FOR_ITEMS

    FOR_ITEMS -- 遍历完成 --> HAS_PR_LINES{有采购明细行?}
    HAS_PR_LINES -- 是 --> CREATE_PR["批量生成采购申请<br/>编号: PR-YYYYMMDD-NNN<br/>主表+明细表"]
    HAS_PR_LINES -- 否 --> IMPORT_PLANS

    CREATE_PR --> IMPORT_PLANS[导入源计划为成品生产单]
    IMPORT_PLANS --> UPDATE_RUN[更新 mrp_run 状态='已确认']
    UPDATE_RUN --> UPDATE_PLAN_STATUS["更新源计划:<br/>mrp_status='已分解'<br/>plan_status='已加入任务'"]
    UPDATE_PLAN_STATUS --> COMMIT_TX[事务提交]
    COMMIT_TX --> RESULT[返回统计: 生产单数+采购申请数+计划导入数]
```

---

## 十、双源物料特殊处理

```mermaid
flowchart LR
    DUAL_ITEM["双源物料 X<br/>action=生产+采购"] --> USER_DECIDE{用户决策}
    USER_DECIDE -- "prodQty=450, purchQty=0" --> PRODUCE_ALL[全部生产]
    USER_DECIDE -- "prodQty=0, purchQty=450" --> PURCHASE_ALL[全部采购]
    USER_DECIDE -- "prodQty=200, purchQty=250" --> SPLIT[分配生产+采购]

    PURCHASE_ALL --> SKIP_CHILDREN["子件全部标记'已跳过'<br/>不生成任何订单"]
    PRODUCE_ALL --> EXPAND_CHILDREN[子件正常展开<br/>生成生产单]
    SPLIT --> EXPAND_CHILDREN_PARTIAL[子件正常展开<br/>同时生成采购申请]
```

**核心规则**：当双源物料选择**纯采购**（produce_quantity = 0）时，其所有 BOM 子项自动跳过。

---

## 十一、提前期逐层倒推

```mermaid
flowchart LR
    A["成品 A<br/>完成: 4/30<br/>提前期: 5天<br/>开始: 4/25"] --> B["子件 B<br/>完成: 4/25<br/>提前期: 3天<br/>开始: 4/22"]
    B --> C["原材料 C<br/>完成: 4/22<br/>提前期: 7天<br/>开始: 4/15"]
```

规则：**子件完成日期 = 父件开始日期**，逐层向前递推。

---

## 十二、BOM 展开条件与深度控制

| 条件 | 要求 | 不满足时 |
|------|------|---------|
| 有制造 BOM | `mfg_bom_header` 存在且启用+已审批 | 不展开 |
| 净需求 > 0 | 计算结果为正值 | 不展开（库存充足） |
| 行动类型含「生产」 | `action_type` 为「生产」或「生产+采购」 | 不展开（纯采购） |
| BOM 层级 ≤ 10 | `maxDepth = 10` | 停止展开（防无限递归） |

---

## 十三、编号生成规则

| 编号类型 | 格式 | 示例 |
|---------|------|------|
| MRP 运行 | `MRP-YYYYMMDD-NNN` | MRP-20260423-001 |
| 生产单 | `PYYYYMMDDNNN` | P20260423001 |
| 采购申请 | `PR-YYYYMMDD-NNN` | PR-20260423-001 |

序号取当日最大值 +1，3 位补零。

---

## 十四、API 接口清单

| 方法 | 路径 | 函数 | 说明 |
|------|------|------|------|
| GET | `/api/mrp/plans-for-mrp` | `getPlansForMrp` | 获取可MRP的计划列表（已审批+待加入任务+未分解） |
| POST | `/api/mrp/run` | `runMRP` | 运行MRP计算（核心引擎） |
| GET | `/api/mrp` | `getMRPRuns` | MRP运行记录列表（分页） |
| GET | `/api/mrp/:id` | `getMRPRunDetail` | MRP运行详情（头+计划+明细+统计） |
| POST | `/api/mrp/execute` | `executeMRP` | 确认执行（生成生产单+采购申请） |
| POST | `/api/mrp/:id/cancel` | `cancelMRPRun` | 取消MRP运行（仅已计算可取消） |
| DELETE | `/api/mrp/:id` | `deleteMRPRun` | 删除MRP运行（仅已取消可删除） |

---

## 十五、关键数据库表

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `mrp_run` | MRP运行主表 | mrp_run_number, run_status, plan_count |
| `mrp_run_plan` | 运行关联计划 | mrp_run_number, production_number |
| `mrp_run_detail` | 计算结果明细 | bom_level, gross/net_requirement, action_type |
| `Production_plan` | 生产计划（输入源） | approval_status, plan_status, mrp_status |
| `mfg_bom_header` | 制造BOM主表 | item_number, base_quantity, condition |
| `mfg_bom_detail` | 制造BOM明细 | material_number, actual_quantity |
| `item_master` | 物料主数据 | business_scope, lead_time_days, safety_stock_* |
| `material_inventory` | 原材料库存 | quantity, safety_stock_quantity |
| `production_order` | 生产单（在制品/输出） | planned_quantity, plan_status |
| `purchase_order_detail` | 采购订单明细（在途） | order_quantity, received_quantity |
| `purchase_req` / `_detail` | 采购申请（输出） | request_quantity, ordered_quantity |

---

## 十六、关键代码位置

| 功能 | 文件 | 行号 |
|------|------|------|
| 编号生成工具 | `mrp.controller.ts` | L7-70 |
| 计划筛选查询 | `mrp.controller.ts` | L86-122 |
| **MRP核心引擎** | `mrp.controller.ts` | L126-535 |
| ├ BFS初始化 | `mrp.controller.ts` | L186-211 |
| ├ Level 0成品层 | `mrp.controller.ts` | L225-284 |
| ├ Level 1+需求归集 | `mrp.controller.ts` | L289-319 |
| ├ 批量查询供应数据 | `mrp.controller.ts` | L324-393 |
| ├ 净需求计算 | `mrp.controller.ts` | L396-415 |
| ├ 行动类型决策 | `mrp.controller.ts` | L418-433 |
| └ BOM子件展开 | `mrp.controller.ts` | L487-510 |
| **MRP执行（生成订单）** | `mrp.controller.ts` | L624-942 |
| ├ 双源决策跳过子项 | `mrp.controller.ts` | L652-691 |
| ├ 生成生产单 | `mrp.controller.ts` | L709-737 |
| ├ 生成采购申请 | `mrp.controller.ts` | L776-842 |
| └ 源计划状态回写 | `mrp.controller.ts` | L856-926 |
| 路由注册 | `mrp.routes.ts` | L16-22 |
| SQL建表脚本 | `mrp_migration.sql` | L1-94 |

