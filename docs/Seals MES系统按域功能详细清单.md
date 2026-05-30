# Seals MES 系统按域功能详细清单

> 更新时间：2026-05-15 | 覆盖：12个业务域、134个功能模块、前后端+数据库三层交叉验证 (v4)

---

## 一、基础数据域（master-data）

| # | 功能模块 | 前端页面 | 后端API | 核心数据表 | 功能说明 |
|---|---------|---------|---------|-----------|---------|
| 1 | 客户管理 | Customer/ | /customers | customer | 客户档案CRUD，含开票信息（抬头/税号/地址/银行账号） |
| 2 | 供应商管理 | Supplier/ | /suppliers | supplier | 供应商档案CRUD，含税务/银行信息 |
| 3 | 物料主文件 | ItemMaster/ | /item-masters | item_master | 物料档案CRUD，含质量特性启用标志、默认仓库 |
| 4 | 物料分类 | MaterialClass/ | /material-classes | material_class | 物料分类树形管理 |
| 5 | 物料属性 | MateriaProperty/ | /materia-properties | materia_property | 物料属性定义（原料/成品/半成品等） |
| 6 | 产品分类 | ProductClass/ | /product-classes | product_class | 产品分类管理 |
| 7 | 产品管理 | Product/ | /products | product | 产品档案管理 |
| 8 | 物料管理 | Material/ | /materials | material | 物料基础信息管理 |
| 9 | 客户物料映射 | CustomerMaterialMapping/ | /customer-material-mappings | customer_material_mapping | 客户与物料编号对照关系 |
| 10 | BOM管理 | Bom/ | /boms | bom / bom_detail | 标准BOM清单及明细行管理 |
| 11 | 制造BOM | MfgBom/ | /mfg-boms | mfg_bom / mfg_bom_detail | 制造BOM（含替代料/损耗率），含模具BOM映射 |
| 12 | 成本BOM | CostBom/ | /boms/:id/cost-bom | — | 基于BOM的多层物料成本累计计算，含物料成本/标准成本汇总导出 |
| 13 | 工序管理 | Procedure/ | /procedures | procedure | 工序定义（编号/名称/类型/工时） |
| 14 | 工作中心 | WorkCenter/ | /work-centers | work_center | 工作中心管理，关联车间/设备 |
| 15 | 工艺路线 | RoutingMaster/ | /routing-masters | routing_master / routing_detail | 工艺路线主表+工序明细行管理 |
| 16 | 单位管理 | Unit/ | /units | unit | 计量单位CRUD |
| 17 | 仓库管理 | Warehouse/ | /warehouses | warehouse | 仓库档案（编号/名称/类型：成品仓/原料仓/报废仓等） |
| 18 | 库位管理 | StorageLocation/ | /storage-locations | storage_location | 仓库内库位管理 |
| 19 | 车间管理 | Workshop/ | /workshops | workshop | 车间档案管理 |
| 20 | 生产线 | Productionline/ | /productionlines | production_line | 产线档案管理 |
| 21 | 班组管理 | Team/ | /teams | team | 班组档案管理 |
| 22 | 班次管理 | Schedule/ | /schedules | schedule | 班次定义（早班/中班/晚班） |
| 23 | 员工管理 | Employee/ | /employees | employee | 员工档案（工号/姓名/部门/岗位） |
| 24 | 物流公司 | LogisticsCompany/ | /logistics-companies | logistics_company | 承运商/物流公司管理 |

---

## 二、销售管理域（sales）

| # | 功能模块 | 前端页面 | 后端API | 核心数据表 | 功能说明 |
|---|---------|---------|---------|-----------|---------|
| 1 | 销售订单 | SalesOrder/ | /sales-orders | sales_order / sales_order_detail | 订单CRUD+审批，明细行含shipping_status/invoice_status/production_status多维度状态跟踪 |
| 2 | 销售预测 | Forecast/ | /forecasts | sales_forecast / sales_forecast_detail | 预测录入+审批，作为MPS需求来源 |
| 3 | 销售价目表 | SalesPrice/ | /sales-prices | sales_price | 客户+物料维度定价管理 |
| 4 | 发货申请 | ShippingRequest/ | /shipping-requests | shipping_request / shipping_request_detail | 从销售订单创建发货申请，审核后可出库 |
| 5 | 销售发货单 | ShippingOrder/ | /shipping-orders | shipping_order / shipping_order_detail | 发货出库后自动生成，支持批次FIFO/箱码出库，明细行含invoice_status开票状态 |
| 6 | 退货单 | ReturnOrder/ | /return-orders | return_order / return_order_detail | 退款退货/退货换货，确认后触发退货入库 |
| 7 | 销售发票 | SalesInvoice/ | /sales-invoices | sales_invoice / sales_invoice_line | 发票CRUD+审批/撤消，明细行关联发货明细(shipping_detail_id)和销售明细(sales_detail_id)，审批后联动更新开票状态 |
| 8 | 销售报表 | SalesReport/ | /sales-report | — | 销售统计报表 |
| 9 | 发货预警 | ShippingWarning/ | — | — | 超期未发货/逾期提醒 |
| 10 | 按订单发货汇总 | ShippingByOrderSummary/ | — | — | 按销售订单维度汇总发货情况 |
| 11 | 订单生产汇总 | OrderProductionSummary/ | — | — | 按销售订单维度汇总关联生产单的执行进度 |
| 12 | 销售订单仪表板 | Dashboard/ | — | — | 销售订单可视化仪表板，图表展示订单状态分布 |

---

## 三、计划管理域（planning）

| # | 功能模块 | 前端页面 | 后端API | 核心数据表 | 功能说明 |
|---|---------|---------|---------|-----------|---------|
| 1 | 生产计划 | Plan/ | /plans | Production_plan / Production_plan_detail | 生产计划CRUD+审批，支持MPS导入，明细行含MRP状态 |
| 2 | MPS主生产计划 | MPS/ | /mps | — | MPS计算（毛需求→净需求→建议计划），从需求来源（销售订单+预测）导入 |
| 3 | MRP物料需求计划 | MRP/ | /mrp | mrp_run / mrp_run_detail | MRP运算（BFS展开BOM），生成生产单+采购申请，执行后可拆分/派发 |

---

## 四、生产管理域（production）

| # | 功能模块 | 前端页面 | 后端API | 核心数据表 | 功能说明 |
|---|---------|---------|---------|-----------|---------|
| 1 | 生产订单 | Order/ | /orders | production_order | 生产单管理，支持拆分/派发+生成工序任务和备料单 |
| 2 | 工序任务 | ProcessTask/ | /process-tasks | process_task | 工序任务管理，含倒冲标志(is_backflush)，支持快速报工 |
| 3 | 报工管理 | WorkReport/ | /work-reports | work_report / work_report_detail | 生产报工（合格/不合格数量），支持快速报工和连续报工 |
| 4 | 备料单 | MaterialPreparation/ | /material-preparations | material_preparation / material_preparation_detail | 派发时自动生成，记录各工序所需物料，支持按工序备料 |
| 5 | 领料单 | MaterialIssue/ | /material-issues | material_issue | 从备料单创建领料单，扣减原料库存 |
| 6 | 退料管理 | — | /material-returns | material_return | 生产领料后退料回仓，退回原料库存 |
| 7 | 倒冲任务 | — | /backflush-tasks | backflush_task | 自动倒冲领料（按BOM耗用） |
| 8 | 委外申请 | OutsourcingReq/ | /outsourcing-reqs | outsourcing_req | 委外加工申请 |
| 9 | 委外订单 | OutsourcingOrder/ | /outsourcing-orders | outsourcing_order | 委外订单CRUD+发出，关联工序任务 |
| 10 | 委外发料 | OutsourcingIssue/ | /outsourcing/issue | outsourcing_issue | 委外原料发料，支持移动端操作+打印标签+拍照 |
| 11 | 委外收货 | OutsourcingReceipt/ | /outsourcing/receipt | outsourcing_receipt | 委外收货确认，触发检验路由，支持移动端 |
| 12 | 委外检验 | OutsourcingInspection/ | /outsourcing/inspection | — | 委外来料检验，支持移动端 |
| 13 | 委外结算 | OutsourcingSettlement/ | /outsourcing/settlement | outsourcing_settlement | 委外费用结算 |
| 14 | 委外退料入库 | — | /outsourcing/return-stockin | — | 委外余料退回入库 |
| 15 | 委外价目表 | OutsourcingPrice/ | /outsourcing-prices | outsourcing_price | 委外供应商+物料维度定价 |
| 16 | 在制品报表 | WIP/ | /wip | — | 在制品统计报表（按生产单/按工作中心/线边仓流水） |
| 17 | 计件工资 | PieceRateWage/ | /piece-rate-wages | piece_rate_wage | 按报工数量×计件单价计算工资 |
| 18 | 甘特图 | Gantt/ | /orders/gantt | — | 生产排程甘特图视图 |
| 19 | 派发打印 | DispatchPrint/ | /orders/print-data | — | 派工单/流程卡打印 |
| 20 | 生产单材料成本 | MaterialCost/ | /production-material-cost | — | 生产单物料消耗成本统计分析 |
| 21 | 生产工单仪表板 | ProgressDashboard/ | /progress-dashboard | — | 生产工单进度可视化仪表板 |
| 22 | 生产单进度看板 | ProcessKanban/ | /process-kanban | — | 生产单工序进度看板，实时跟踪各工序完成状态 |

---

## 五、采购管理域（purchasing）

| # | 功能模块 | 前端页面 | 后端API | 核心数据表 | 功能说明 |
|---|---------|---------|---------|-----------|---------|
| 1 | 采购申请 | PurchaseReq/ | /purchase-reqs | purchase_req / purchase_req_detail | 采购申请CRUD+审批，支持合并转采购订单，转单后回写明细行状态 |
| 2 | 采购订单 | PurchaseOrder/ | /purchase-orders | purchase_order / purchase_order_detail | 采购订单CRUD+审批，支持从采购申请转单，删除后回写申请明细 |
| 3 | 收货通知 | ReceivingNotice/ | /receiving-notices | receiving_notice / receiving_notice_detail | 采购收货通知，确认后触发检验路由 |
| 4 | 采购退货 | PurchaseReturn/ | /purchase-returns | purchase_return | 采购退货出库 |
| 5 | 采购价目表 | PurchasePrice/ | /purchase-prices | purchase_price | 供应商+物料维度采购定价 |
| 6 | 采购计算器 | PurchaseCalc/ | /purchase-calc | — | 采购需求计算报表 |
| 7 | 采购发票 | PurchaseInvoice/ | /purchase-invoices | purchase_invoice | 采购发票管理，关联采购订单/收货 |
| 8 | 采购订单仪表板 | PurchasingDashboard/ | — | — | 采购订单可视化仪表板，图表展示订单执行状态 |

---

## 六、质量管理域（quality）

| # | 功能模块 | 前端页面 | 后端API | 核心数据表 | 功能说明 |
|---|---------|---------|---------|-----------|---------|
| 1 | 来料检验规范 | IncomingInspectSpec/ | /quality/incoming-inspect-specs | incoming_inspect_spec / incoming_inspect_spec_item | 按物料编号精确匹配检验规范，含抽检方式/检验项目/质量特性 |
| 2 | 来料检验方案 | IncomingInspectPlan/ | /quality/incoming-inspect-plans | incoming_inspect_plan | 检验方案CRUD，含抽检方式(全检/抽检)、检验部门、检验员、质量特性启用 |
| 3 | 生产检验规范 | InspectionSpec/ | /quality/inspection-specs | inspection_spec / inspection_spec_item | 生产过程检验规范定义 |
| 4 | 生产检验方案 | InspectionPlan/ | /quality/inspection-plans | inspection_plan | 生产检验方案管理 |
| 5 | 采购检验报告 | QualityReport/ | /quality/quality-report | purchase_quality_inspection / purchase_quality_inspection_detail | 采购来料检验单，含合格/不合格/特采判定，缺陷明细行，质量特性启用 |
| 6 | 生产检验报告 | ProductionInspection/ | /quality/production-inspections | production_inspection | 生产过程检验，支持合格/不合格判定+缺陷处理 |
| 7 | 不合格品管理 | NonconformingProduct/ | /quality/nonconforming-products | nonconforming_product | NC单管理，支持返修/报废/让步接收，按缺陷行拆分 |
| 8 | 返修单 | ReworkOrder/ | /quality/rework-orders | rework_order | 返修工单，完成后可重新检验 |
| 9 | 缺陷分类 | DefectClass/ | /quality/defect-classes | defect_class | 缺陷大类管理 |
| 10 | 缺陷项目 | Defect/ | /quality/defects | defect | 缺陷项目定义，关联缺陷分类 |
| 11 | 缺陷原因 | DefectReason/ | /quality/defect-reasons | defect_reason | 缺陷原因字典 |
| 12 | 质量特性 | QualityCharacteristic/ | /quality/quality-characteristics | quality_characteristic | 检验项目/质量特性定义 |
| 13 | 报废订单报表 | ScrapOrderReport/ | /quality/scrap-order-report | — | 报废订单统计报表 |
| 14 | 报废库存报表 | ScrapInventoryReport/ | /quality/scrap-inventory-report | — | 报废仓库存报表 |
| 15 | 报废处置报表 | ScrapDisposalReport/ | /quality/scrap-disposal-report | — | 报废处置统计报表 |
| 16 | 报废质量统计 | ScrapQualityStatsReport/ | /quality/scrap-quality-stats-report | — | 报废品质量分析报表 |
| 17 | 报废入库单 | ScrapInboundOrder/ | /quality/scrap-inbound-orders | scrap_inbound_order | 报废品入库管理 |

---

## 七、仓储管理域（warehouse）

| # | 功能模块 | 前端页面 | 后端API | 核心数据表 | 功能说明 |
|---|---------|---------|---------|-----------|---------|
| 1 | 成品库存查询 | FinishedGoods/ | /finished-goods/inventory | finished_goods_inventory | 成品仓库存汇总查询（按物料+仓库+质量状态） |
| 2 | 成品批次库存 | — | /finished-goods/inventory/detail | finished_batch_inventory | 成品批次明细+流水查询 |
| 3 | 成品入库 | — | /finished-goods/inbound | finished_goods_inventory | 生产成品入库（含入库单管理/确认/撤回） |
| 4 | 成品出库 | — | /finished-goods/outbound | — | 销售发货出库（批次FIFO/箱码模式） |
| 5 | 成品装箱 | — | /packing-orders | packing_order / packing_box_inventory | 装箱单管理（确认/拆箱/箱码出库） |
| 6 | 原料库存查询 | MaterialWarehouse/ | /material-warehouse/inventory | material_batch_inventory | 原料仓库存查询（批次+库位），含安全库存预警 |
| 7 | 原料入库 | — | /material-warehouse/inbound | material_batch_inventory | 原料采购入库/半成品入库/退料入库 |
| 8 | 原料出库 | — | /material-warehouse/outbound | — | 原料领料出库/采购退货出库 |
| 9 | 来料入库 | StockIn/ | /stock-ins | stock_in / stock_in_detail | 采购来料入库单CRUD+确认/撤回，含会计期间字段 |
| 10 | 盘点管理 | StockCount/ | /stock-counts | stock_count / stock_count_detail | 盘点单CRUD，录入实盘→复核→确认执行（库存调整） |
| 11 | 其他出入库 | — | /abnormal-io | abnormal_io / abnormal_io_detail | 其他入库/出库/调拨，确认/驳回/撤消 |
| 12 | 报废处置 | ScrapDisposal/ | /scrap-disposal | scrap_disposal | 报废品处置管理 |
| 13 | 报废流水 | ScrapTransaction/ | /scrap-transactions | — | 报废仓库存流水记录 |
| 14 | 报废库存 | ScrapInventory/ | — | — | 报废仓库存查询 |
| 15 | 月度出入库报表 | — | /finished-goods/monthly-report | — | 成品仓/原料仓/报废仓月度出入库统计报表 |

---

## 八、设备管理域（equipment）

| # | 功能模块 | 前端页面 | 后端API | 核心数据表 | 功能说明 |
|---|---------|---------|---------|-----------|---------|
| 1 | 设备台账 | Equipment/ | /equipments | equipment | 设备档案CRUD（编号/名称/型号/状态/所属车间） |
| 2 | 模具台账 | Mould/ | /moulds | mould | 模具档案管理 |
| 3 | 模具保养 | MouldMaintenance/ | /mould-maintenance | mould_maintenance | 模具保养记录 |
| 4 | 设备停机 | EquipmentDowntime/ | /equipment-downtime | equipment_downtime | 设备停机记录（原因/时长） |
| 5 | 设备保养计划 | EquipmentMaintenancePlan/ | /equipment-maintenance-plan | equipment_maintenance_plan | 设备保养计划管理 |
| 6 | 设备OEE | EquipmentOee/ | /equipment-oee | — | 设备综合效率(OEE)仪表板 |

---

## 九、财务管理域（finance）

| # | 功能模块 | 前端页面 | 后端API | 核心数据表 | 功能说明 |
|---|---------|---------|---------|-----------|---------|
| 1 | 会计期间 | AccountingPeriod/ | /accounting-periods | accounting_period | 会计期间管理（年月/起止日期/状态），月度报表和报废入库的期间控制 |
| 2 | 计件单价 | PieceRatePrice/ | /piece-rate-prices | piece_rate_price | 工序+物料维度计件单价 |
| 3 | 标准成本 | StandardCost/ | /standard-costs | standard_cost | 物料标准成本管理 |

---

## 十、系统集成域（integration）

| # | 功能模块 | 前端页面 | 后端API | 核心数据表 | 功能说明 |
|---|---------|---------|---------|-----------|---------|
| 1 | 批次追溯 | BatchTrace/ | /batch-trace | — | 成品批次全链路追溯（原料→生产→发货） |
| 2 | 新核云检验对接 | XinheyunInspect/ | /integration/xhy-inspect | — | 同步新核云系统检验记录/检验报工数据，含包装质量报表 |
| 3 | 新核云库存对接 | — | /integration/xhy-inventory | — | 同步新核云系统库存数据，含库存查询/出入库流水 |

---

## 十一、系统管理域（system）

| # | 功能模块 | 前端页面 | 后端API | 核心数据表 | 功能说明 |
|---|---------|---------|---------|-----------|---------|
| 1 | 认证管理 | Auth/ | /auth | users | 用户登录/注册/Token刷新，JWT认证 |
| 2 | 驾驶舱 | Cockpit/ | /cockpit | — | 管理驾驶舱首页，全局数据可视化看板 |
| 3 | 用户管理 | User/ | /users | users | 用户CRUD，含角色分配 |
| 4 | 角色管理 | Role/ | /roles | roles / role_permissions | 角色CRUD+权限分配 |
| 5 | 权限管理 | Permission/ | /permissions | permissions / permission_menu | 菜单权限+API权限管理 |
| 6 | 部门管理 | Department/ | /departments | department | 部门树形管理 |
| 7 | 审批管理 | — | /approval | — | 通用审批流（提交/审批/反审） |
| 8 | 工作流引擎 | Workflow/ | /workflows / /workflow-runtime | workflow_definition / workflow_instance | 工作流设计器+运行时引擎，含我的待办 |
| 9 | 通知管理 | — | /notifications | notifications | 站内通知（SSE实时推送） |
| 10 | 安全审计 | — | /security | — | 操作日志/安全审计 |
| 11 | API密钥 | ApiKey/ | /api-keys | api_key | 外部系统API密钥管理 |
| 12 | 用户偏好 | — | /user-preferences | user_preference | 列个性化等用户偏好持久化 |
| 13 | 单据完结配置 | DocumentCompletionConfig/ | /document-completion-config | document_completion_config | 单据自动完结规则配置 |
| 14 | 手动完结 | ManualClose/ | /manual-close | — | 手动完结指定单据 |
| 15 | 自动盘点 | AutoStockCount/ | /auto-stock-count | — | 定时自动盘点任务配置 |
| 16 | SSE推送 | — | /sse | — | Server-Sent Events实时消息推送 |

---

## 十二、开放接口域（open）

| # | 功能模块 | 前端页面 | 后端API | 核心数据表 | 功能说明 |
|---|---------|---------|---------|-----------|---------|
| 1 | 移动端报工 | — | /open/work-reports | — | 移动端快速报工接口 |
| 2 | 开放订单接口 | — | /open/orders | — | 外部系统订单数据查询接口 |
| 3 | 开放备料接口 | — | /open/material-preparations | — | 外部系统备料数据接口 |
| 4 | 开放BOM接口 | — | /open/bom | — | 外部系统BOM数据查询接口 |
| 5 | 外部API | — | /open/* | — | API Key认证的外部系统接口 |

---

## 附录A：跨域业务流程清单

| # | 业务流程 | 涉及域 | 关键状态流转 |
|---|---------|--------|------------|
| 1 | 销售订单→发货→开票全流程 | sales | 草稿→已审批→已发货→部分开票/已开票 |
| 2 | 采购申请→采购订单→收货→检验→入库 | purchasing + quality + warehouse | 草稿→已审批→已收货→已检验→已入库 |
| 3 | MPS→MRP→生产单→派发→报工→检验→入库 | planning + production + quality + warehouse | 待排产→已派发→生产中→已报工→已检验→已入库 |
| 4 | 委外申请→委外订单→发料→收货→检验→结算 | production | 草稿→已发出→已发料→已收货→已检验→已结算 |
| 5 | 生产检验→NC单→返修/报废/让步 | quality + production | 合格/不合格→返修→重检 / 报废→处置 / 让步接收 |
| 6 | 成品装箱→箱码出库→发货 | warehouse + sales | 待确认→已确认→在库→已出库 |
| 7 | 盘点→复核→库存调整 | warehouse | 待盘点→已录入→已复核→已调整 |
| 8 | 采购退货出库 | purchasing + warehouse | 草稿→已审批→已出库 |
| 9 | 销售退货→退货入库 | sales + warehouse | 草稿→已确认→已入库 |
| 10 | 报废处置→报废入库 | quality + warehouse | 待处置→已处置→已入库 |

---

## 附录B：功能统计汇总

| 业务域 | 功能模块数 | 后端路由数 | 前端页面数 |
|--------|-----------|-----------|-----------|
| 基础数据 | 24 | 23 | 24 |
| 销售管理 | 12 | 8 | 12 |
| 计划管理 | 3 | 3 | 4 |
| 生产管理 | 22 | 19 | 24 |
| 采购管理 | 8 | 7 | 10 |
| 质量管理 | 17 | 17 | 19 |
| 仓储管理 | 15 | 8 | 26 |
| 设备管理 | 6 | 6 | 6 |
| 财务管理 | 3 | 3 | 3 |
| 系统集成 | 3 | 3 | 7 |
| 系统管理 | 16 | 17 | 11 |
| 开放接口 | 5 | 4 | 0 |
| **合计** | **134** | **118** | **150** |
