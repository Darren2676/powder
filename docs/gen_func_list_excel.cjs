const ExcelJS = require('exceljs');
const path = require('path');

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Seals MES System';
  wb.created = new Date();

  // ── common styles ──
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF302B63' } };
  const headerFont = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  const titleFont = { name: 'Microsoft YaHei', size: 14, bold: true, color: { argb: 'FF302B63' } };
  const dataFont = { name: 'Microsoft YaHei', size: 9 };
  const dataFontBold = { name: 'Microsoft YaHei', size: 9, bold: true };
  const border = { style: 'thin', color: { argb: 'FFD0D0D0' } };
  const centerAlign = { vertical: 'middle', horizontal: 'center', wrapText: true };
  const leftAlign = { vertical: 'middle', horizontal: 'left', wrapText: true };

  function applyHeaderStyle(ws, rowNum, colCount) {
    for (let c = 1; c <= colCount; c++) {
      const cell = ws.getCell(rowNum, c);
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = centerAlign;
      cell.border = { top: border, left: border, bottom: border, right: border };
    }
    ws.getRow(rowNum).height = 22;
  }

  function addDataRow(ws, rowNum, cols, isBold) {
    for (let c = 1; c <= cols.length; c++) {
      const cell = ws.getCell(rowNum, c);
      cell.value = cols[c - 1] || '';
      cell.font = isBold ? dataFontBold : dataFont;
      cell.alignment = c === cols.length ? leftAlign : (c === 1 ? centerAlign : leftAlign);
      cell.border = { top: border, left: border, bottom: border, right: border };
    }
    ws.getRow(rowNum).height = 20;
  }

  function addDomainSheet(wb, sheetName, domainTitle, modules, domainColor) {
    const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: '#', key: 'idx', width: 5 },
      { header: '功能模块', key: 'name', width: 16 },
      { header: '前端页面', key: 'frontend', width: 22 },
      { header: '后端API', key: 'api', width: 28 },
      { header: '核心数据表', key: 'tables', width: 30 },
      { header: '功能说明', key: 'desc', width: 50 },
    ];
    applyHeaderStyle(ws, 1, 6);
    modules.forEach((m, i) => addDataRow(ws, i + 2, [i + 1, m.name, m.frontend, m.api, m.tables, m.desc], false));
    return ws;
  }

  // ═══════════════════════════════════════════════
  // 1. Cover Sheet
  // ═══════════════════════════════════════════════
  const cover = wb.addWorksheet('总览');
  cover.mergeCells('A1:F1'); const t1 = cover.getCell('A1'); t1.value = 'Seals MES 制造执行系统 · 按域功能详细清单 (v4)'; t1.font = { name: 'Microsoft YaHei', size: 20, bold: true, color: { argb: 'FF302B63' } }; t1.alignment = centerAlign;
  cover.mergeCells('A2:F2'); const t2 = cover.getCell('A2'); t2.value = '更新时间：2026-05-15 | 基于现有系统功能全面更新 | 12个业务域 · 134个功能模块 · 118个后端路由 · 150个前端页面'; t2.font = { name: 'Microsoft YaHei', size: 10, color: { argb: 'FF666666' } }; t2.alignment = centerAlign;
  cover.getRow(1).height = 40;
  cover.getRow(2).height = 24;

  const statsData = [
    ['业务域', '功能模块数', '后端路由数', '前端页面数'],
    ['一、基础数据', 24, 23, 24],
    ['二、销售管理', 12, 8, 12],
    ['三、计划管理', 3, 3, 4],
    ['四、生产管理', 22, 19, 24],
    ['五、采购管理', 8, 7, 10],
    ['六、质量管理', 17, 17, 19],
    ['七、仓储管理', 15, 8, 26],
    ['八、设备管理', 6, 6, 6],
    ['九、财务管理', 3, 3, 3],
    ['十、系统集成', 3, 3, 7],
    ['十一、系统管理', 16, 17, 11],
    ['十二、开放接口', 5, 4, 0],
    ['合  计', 134, 118, 150],
  ];
  statsData.forEach((row, i) => {
    const r = i + 4;
    const isHeader = i === 0;
    const isTotal = i === statsData.length - 1;
    for (let c = 1; c <= 4; c++) {
      const cell = cover.getCell(r, c);
      cell.value = row[c - 1];
      cell.font = (isHeader || isTotal) ? dataFontBold : dataFont;
      cell.alignment = c === 1 ? leftAlign : centerAlign;
      cell.border = { top: border, left: border, bottom: border, right: border };
      if (isHeader) { cell.fill = headerFill; cell.font = headerFont; }
      if (isTotal) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAF6' } }; }
    }
    cover.getRow(r).height = isHeader ? 22 : 20;
  });
  cover.getColumn(1).width = 18;
  cover.getColumn(2).width = 14;
  cover.getColumn(3).width = 14;
  cover.getColumn(4).width = 14;
  cover.getColumn(5).width = 14;
  cover.getColumn(6).width = 14;

  // ═══════════════════════════════════════════════
  // Domain Sheets
  // ═══════════════════════════════════════════════

  // 一、基础数据域 (24)
  addDomainSheet(wb, '1-基础数据', '一、基础数据域 (master-data)', [
    { name: '客户管理', frontend: 'Customer/', api: '/customers', tables: 'customer', desc: '客户档案CRUD，含开票信息（抬头/税号/地址/银行账号）' },
    { name: '供应商管理', frontend: 'Supplier/', api: '/suppliers', tables: 'supplier', desc: '供应商档案CRUD，含税务/银行信息' },
    { name: '物料主文件', frontend: 'ItemMaster/', api: '/item-masters', tables: 'item_master', desc: '物料档案CRUD，含质量特性启用标志、默认仓库' },
    { name: '物料分类', frontend: 'MaterialClass/', api: '/material-classes', tables: 'material_class', desc: '物料分类树形管理' },
    { name: '物料属性', frontend: 'MateriaProperty/', api: '/materia-properties', tables: 'materia_property', desc: '物料属性定义（原料/成品/半成品等）' },
    { name: '产品分类', frontend: 'ProductClass/', api: '/product-classes', tables: 'product_class', desc: '产品分类管理' },
    { name: '产品管理', frontend: 'Product/', api: '/products', tables: 'product', desc: '产品档案管理' },
    { name: '物料管理', frontend: 'Material/', api: '/materials', tables: 'material', desc: '物料基础信息管理' },
    { name: '客户物料映射', frontend: 'CustomerMaterialMapping/', api: '/customer-material-mappings', tables: 'customer_material_mapping', desc: '客户与物料编号对照关系' },
    { name: 'BOM管理', frontend: 'Bom/', api: '/boms', tables: 'bom / bom_detail', desc: '标准BOM清单及明细行管理' },
    { name: '制造BOM', frontend: 'MfgBom/', api: '/mfg-boms', tables: 'mfg_bom / mfg_bom_detail', desc: '制造BOM（含替代料/损耗率），含模具BOM映射' },
    { name: '成本BOM', frontend: 'CostBom/', api: '/boms/:id/cost-bom', tables: '—', desc: '基于BOM的多层物料成本累计计算，含物料成本/标准成本汇总导出' },
    { name: '工序管理', frontend: 'Procedure/', api: '/procedures', tables: 'procedure', desc: '工序定义（编号/名称/类型/工时）' },
    { name: '工作中心', frontend: 'WorkCenter/', api: '/work-centers', tables: 'work_center', desc: '工作中心管理，关联车间/设备' },
    { name: '工艺路线', frontend: 'RoutingMaster/', api: '/routing-masters', tables: 'routing_master / routing_detail', desc: '工艺路线主表+工序明细行管理' },
    { name: '单位管理', frontend: 'Unit/', api: '/units', tables: 'unit', desc: '计量单位CRUD' },
    { name: '仓库管理', frontend: 'Warehouse/', api: '/warehouses', tables: 'warehouse', desc: '仓库档案（编号/名称/类型：成品仓/原料仓/报废仓等）' },
    { name: '库位管理', frontend: 'StorageLocation/', api: '/storage-locations', tables: 'storage_location', desc: '仓库内库位管理' },
    { name: '车间管理', frontend: 'Workshop/', api: '/workshops', tables: 'workshop', desc: '车间档案管理' },
    { name: '生产线', frontend: 'Productionline/', api: '/productionlines', tables: 'production_line', desc: '产线档案管理' },
    { name: '班组管理', frontend: 'Team/', api: '/teams', tables: 'team', desc: '班组档案管理' },
    { name: '班次管理', frontend: 'Schedule/', api: '/schedules', tables: 'schedule', desc: '班次定义（早班/中班/晚班）' },
    { name: '员工管理', frontend: 'Employee/', api: '/employees', tables: 'employee', desc: '员工档案（工号/姓名/部门/岗位）' },
    { name: '物流公司', frontend: 'LogisticsCompany/', api: '/logistics-companies', tables: 'logistics_company', desc: '承运商/物流公司管理' },
  ]);

  // 二、销售管理域 (12)
  addDomainSheet(wb, '2-销售管理', '二、销售管理域 (sales)', [
    { name: '销售订单', frontend: 'SalesOrder/', api: '/sales-orders', tables: 'sales_order / sales_order_detail', desc: '订单CRUD+审批，明细行含shipping_status/invoice_status/production_status多维度状态跟踪' },
    { name: '销售预测', frontend: 'Forecast/', api: '/forecasts', tables: 'sales_forecast / sales_forecast_detail', desc: '预测录入+审批，作为MPS需求来源' },
    { name: '销售价目表', frontend: 'SalesPrice/', api: '/sales-prices', tables: 'sales_price', desc: '客户+物料维度定价管理' },
    { name: '发货申请', frontend: 'ShippingRequest/', api: '/shipping-requests', tables: 'shipping_request / shipping_request_detail', desc: '从销售订单创建发货申请，审核后可出库' },
    { name: '销售发货单', frontend: 'ShippingOrder/', api: '/shipping-orders', tables: 'shipping_order / shipping_order_detail', desc: '发货出库后自动生成，支持批次FIFO/箱码出库，明细行含invoice_status开票状态' },
    { name: '退货单', frontend: 'ReturnOrder/', api: '/return-orders', tables: 'return_order / return_order_detail', desc: '退款退货/退货换货，确认后触发退货入库' },
    { name: '销售发票', frontend: 'SalesInvoice/', api: '/sales-invoices', tables: 'sales_invoice / sales_invoice_line', desc: '发票CRUD+审批/撤消，明细行关联发货明细和销售明细，审批后联动更新开票状态' },
    { name: '销售报表', frontend: 'SalesReport/', api: '/sales-report', tables: '—', desc: '销售统计报表' },
    { name: '发货预警', frontend: 'ShippingWarning/', api: '—', tables: '—', desc: '超期未发货/逾期提醒' },
    { name: '按订单发货汇总', frontend: 'ShippingByOrderSummary/', api: '—', tables: '—', desc: '按销售订单维度汇总发货情况' },
    { name: '订单生产汇总', frontend: 'OrderProductionSummary/', api: '—', tables: '—', desc: '按销售订单维度汇总关联生产单的执行进度' },
    { name: '销售订单仪表板', frontend: 'Dashboard/', api: '—', tables: '—', desc: '销售订单可视化仪表板，图表展示订单状态分布' },
  ]);

  // 三、计划管理域 (3)
  addDomainSheet(wb, '3-计划管理', '三、计划管理域 (planning)', [
    { name: '生产计划', frontend: 'Plan/', api: '/plans', tables: 'Production_plan / Production_plan_detail', desc: '生产计划CRUD+审批，支持MPS导入，明细行含MRP状态' },
    { name: 'MPS主生产计划', frontend: 'MPS/', api: '/mps', tables: '—', desc: 'MPS计算（毛需求→净需求→建议计划），从需求来源（销售订单+预测）导入' },
    { name: 'MRP物料需求计划', frontend: 'MRP/', api: '/mrp', tables: 'mrp_run / mrp_run_detail', desc: 'MRP运算（BFS展开BOM），生成生产单+采购申请，执行后可拆分/派发' },
  ]);

  // 四、生产管理域 (22)
  addDomainSheet(wb, '4-生产管理', '四、生产管理域 (production)', [
    { name: '生产订单', frontend: 'Order/', api: '/orders', tables: 'production_order', desc: '生产单管理，支持拆分/派发+生成工序任务和备料单' },
    { name: '工序任务', frontend: 'ProcessTask/', api: '/process-tasks', tables: 'process_task', desc: '工序任务管理，含倒冲标志(is_backflush)，支持快速报工' },
    { name: '报工管理', frontend: 'WorkReport/', api: '/work-reports', tables: 'work_report / work_report_detail', desc: '生产报工（合格/不合格数量），支持快速报工和连续报工' },
    { name: '备料单', frontend: 'MaterialPreparation/', api: '/material-preparations', tables: 'material_preparation / material_preparation_detail', desc: '派发时自动生成，记录各工序所需物料，支持按工序备料' },
    { name: '领料单', frontend: 'MaterialIssue/', api: '/material-issues', tables: 'material_issue', desc: '从备料单创建领料单，扣减原料库存' },
    { name: '退料管理', frontend: '—', api: '/material-returns', tables: 'material_return', desc: '生产领料后退料回仓，退回原料库存' },
    { name: '倒冲任务', frontend: '—', api: '/backflush-tasks', tables: 'backflush_task', desc: '自动倒冲领料（按BOM耗用）' },
    { name: '委外申请', frontend: 'OutsourcingReq/', api: '/outsourcing-reqs', tables: 'outsourcing_req', desc: '委外加工申请' },
    { name: '委外订单', frontend: 'OutsourcingOrder/', api: '/outsourcing-orders', tables: 'outsourcing_order', desc: '委外订单CRUD+发出，关联工序任务' },
    { name: '委外发料', frontend: 'OutsourcingIssue/', api: '/outsourcing/issue', tables: 'outsourcing_issue', desc: '委外原料发料，支持移动端操作+打印标签+拍照' },
    { name: '委外收货', frontend: 'OutsourcingReceipt/', api: '/outsourcing/receipt', tables: 'outsourcing_receipt', desc: '委外收货确认，触发检验路由，支持移动端' },
    { name: '委外检验', frontend: 'OutsourcingInspection/', api: '/outsourcing/inspection', tables: '—', desc: '委外来料检验，支持移动端' },
    { name: '委外结算', frontend: 'OutsourcingSettlement/', api: '/outsourcing/settlement', tables: 'outsourcing_settlement', desc: '委外费用结算' },
    { name: '委外退料入库', frontend: '—', api: '/outsourcing/return-stockin', tables: '—', desc: '委外余料退回入库' },
    { name: '委外价目表', frontend: 'OutsourcingPrice/', api: '/outsourcing-prices', tables: 'outsourcing_price', desc: '委外供应商+物料维度定价' },
    { name: '在制品报表', frontend: 'WIP/', api: '/wip', tables: '—', desc: '在制品统计报表（按生产单/按工作中心/线边仓流水）' },
    { name: '计件工资', frontend: 'PieceRateWage/', api: '/piece-rate-wages', tables: 'piece_rate_wage', desc: '按报工数量×计件单价计算工资' },
    { name: '甘特图', frontend: 'Gantt/', api: '/orders/gantt', tables: '—', desc: '生产排程甘特图视图' },
    { name: '派发打印', frontend: 'DispatchPrint/', api: '/orders/print-data', tables: '—', desc: '派工单/流程卡打印' },
    { name: '生产单材料成本', frontend: 'MaterialCost/', api: '/production-material-cost', tables: '—', desc: '生产单物料消耗成本统计分析' },
    { name: '生产工单仪表板', frontend: 'ProgressDashboard/', api: '/progress-dashboard', tables: '—', desc: '生产工单进度可视化仪表板' },
    { name: '生产单进度看板', frontend: 'ProcessKanban/', api: '/process-kanban', tables: '—', desc: '生产单工序进度看板，实时跟踪各工序完成状态' },
  ]);

  // 五、采购管理域 (8)
  addDomainSheet(wb, '5-采购管理', '五、采购管理域 (purchasing)', [
    { name: '采购申请', frontend: 'PurchaseReq/', api: '/purchase-reqs', tables: 'purchase_req / purchase_req_detail', desc: '采购申请CRUD+审批，支持合并转采购订单，转单后回写明细行状态' },
    { name: '采购订单', frontend: 'PurchaseOrder/', api: '/purchase-orders', tables: 'purchase_order / purchase_order_detail', desc: '采购订单CRUD+审批，支持从采购申请转单，删除后回写申请明细' },
    { name: '收货通知', frontend: 'ReceivingNotice/', api: '/receiving-notices', tables: 'receiving_notice / receiving_notice_detail', desc: '采购收货通知，确认后触发检验路由' },
    { name: '采购退货', frontend: 'PurchaseReturn/', api: '/purchase-returns', tables: 'purchase_return', desc: '采购退货出库' },
    { name: '采购价目表', frontend: 'PurchasePrice/', api: '/purchase-prices', tables: 'purchase_price', desc: '供应商+物料维度采购定价' },
    { name: '采购计算器', frontend: 'PurchaseCalc/', api: '/purchase-calc', tables: '—', desc: '采购需求计算报表' },
    { name: '采购发票', frontend: 'PurchaseInvoice/', api: '/purchase-invoices', tables: 'purchase_invoice', desc: '采购发票管理，关联采购订单/收货' },
    { name: '采购订单仪表板', frontend: 'PurchasingDashboard/', api: '—', tables: '—', desc: '采购订单可视化仪表板，图表展示订单执行状态' },
  ]);

  // 六、质量管理域 (17)
  addDomainSheet(wb, '6-质量管理', '六、质量管理域 (quality)', [
    { name: '来料检验规范', frontend: 'IncomingInspectSpec/', api: '/quality/incoming-inspect-specs', tables: 'incoming_inspect_spec / incoming_inspect_spec_item', desc: '按物料编号精确匹配检验规范，含抽检方式/检验项目/质量特性' },
    { name: '来料检验方案', frontend: 'IncomingInspectPlan/', api: '/quality/incoming-inspect-plans', tables: 'incoming_inspect_plan', desc: '检验方案CRUD，含抽检方式(全检/抽检)、检验部门、检验员、质量特性启用' },
    { name: '生产检验规范', frontend: 'InspectionSpec/', api: '/quality/inspection-specs', tables: 'inspection_spec / inspection_spec_item', desc: '生产过程检验规范定义' },
    { name: '生产检验方案', frontend: 'InspectionPlan/', api: '/quality/inspection-plans', tables: 'inspection_plan', desc: '生产检验方案管理' },
    { name: '采购检验报告', frontend: 'QualityReport/', api: '/quality/quality-report', tables: 'purchase_quality_inspection / purchase_quality_inspection_detail', desc: '采购来料检验单，含合格/不合格/特采判定，缺陷明细行，质量特性启用' },
    { name: '生产检验报告', frontend: 'ProductionInspection/', api: '/quality/production-inspections', tables: 'production_inspection', desc: '生产过程检验，支持合格/不合格判定+缺陷处理' },
    { name: '不合格品管理', frontend: 'NonconformingProduct/', api: '/quality/nonconforming-products', tables: 'nonconforming_product', desc: 'NC单管理，支持返修/报废/让步接收，按缺陷行拆分' },
    { name: '返修单', frontend: 'ReworkOrder/', api: '/quality/rework-orders', tables: 'rework_order', desc: '返修工单，完成后可重新检验' },
    { name: '缺陷分类', frontend: 'DefectClass/', api: '/quality/defect-classes', tables: 'defect_class', desc: '缺陷大类管理' },
    { name: '缺陷项目', frontend: 'Defect/', api: '/quality/defects', tables: 'defect', desc: '缺陷项目定义，关联缺陷分类' },
    { name: '缺陷原因', frontend: 'DefectReason/', api: '/quality/defect-reasons', tables: 'defect_reason', desc: '缺陷原因字典' },
    { name: '质量特性', frontend: 'QualityCharacteristic/', api: '/quality/quality-characteristics', tables: 'quality_characteristic', desc: '检验项目/质量特性定义' },
    { name: '报废订单报表', frontend: 'ScrapOrderReport/', api: '/quality/scrap-order-report', tables: '—', desc: '报废订单统计报表' },
    { name: '报废库存报表', frontend: 'ScrapInventoryReport/', api: '/quality/scrap-inventory-report', tables: '—', desc: '报废仓库存报表' },
    { name: '报废处置报表', frontend: 'ScrapDisposalReport/', api: '/quality/scrap-disposal-report', tables: '—', desc: '报废处置统计报表' },
    { name: '报废质量统计', frontend: 'ScrapQualityStatsReport/', api: '/quality/scrap-quality-stats-report', tables: '—', desc: '报废品质量分析报表' },
    { name: '报废入库单', frontend: 'ScrapInboundOrder/', api: '/quality/scrap-inbound-orders', tables: 'scrap_inbound_order', desc: '报废品入库管理' },
  ]);

  // 七、仓储管理域 (15)
  addDomainSheet(wb, '7-仓储管理', '七、仓储管理域 (warehouse)', [
    { name: '成品库存查询', frontend: 'FinishedGoods/', api: '/finished-goods/inventory', tables: 'finished_goods_inventory', desc: '成品仓库存汇总查询（按物料+仓库+质量状态）' },
    { name: '成品批次库存', frontend: '—', api: '/finished-goods/inventory/detail', tables: 'finished_batch_inventory', desc: '成品批次明细+流水查询' },
    { name: '成品入库', frontend: '—', api: '/finished-goods/inbound', tables: 'finished_goods_inventory', desc: '生产成品入库（含入库单管理/确认/撤回）' },
    { name: '成品出库', frontend: '—', api: '/finished-goods/outbound', tables: '—', desc: '销售发货出库（批次FIFO/箱码模式）' },
    { name: '成品装箱', frontend: '—', api: '/packing-orders', tables: 'packing_order / packing_box_inventory', desc: '装箱单管理（确认/拆箱/箱码出库）' },
    { name: '原料库存查询', frontend: 'MaterialWarehouse/', api: '/material-warehouse/inventory', tables: 'material_batch_inventory', desc: '原料仓库存查询（批次+库位），含安全库存预警' },
    { name: '原料入库', frontend: '—', api: '/material-warehouse/inbound', tables: 'material_batch_inventory', desc: '原料采购入库/半成品入库/退料入库' },
    { name: '原料出库', frontend: '—', api: '/material-warehouse/outbound', tables: '—', desc: '原料领料出库/采购退货出库' },
    { name: '来料入库', frontend: 'StockIn/', api: '/stock-ins', tables: 'stock_in / stock_in_detail', desc: '采购来料入库单CRUD+确认/撤回，含会计期间字段' },
    { name: '盘点管理', frontend: 'StockCount/', api: '/stock-counts', tables: 'stock_count / stock_count_detail', desc: '盘点单CRUD，录入实盘→复核→确认执行（库存调整）' },
    { name: '其他出入库', frontend: '—', api: '/abnormal-io', tables: 'abnormal_io / abnormal_io_detail', desc: '其他入库/出库/调拨，确认/驳回/撤消' },
    { name: '报废处置', frontend: 'ScrapDisposal/', api: '/scrap-disposal', tables: 'scrap_disposal', desc: '报废品处置管理' },
    { name: '报废流水', frontend: 'ScrapTransaction/', api: '/scrap-transactions', tables: '—', desc: '报废仓库存流水记录' },
    { name: '报废库存', frontend: 'ScrapInventory/', api: '—', tables: '—', desc: '报废仓库存查询' },
    { name: '月度出入库报表', frontend: '—', api: '/finished-goods/monthly-report', tables: '—', desc: '成品仓/原料仓/报废仓月度出入库统计报表' },
  ]);

  // 八、设备管理域 (6)
  addDomainSheet(wb, '8-设备管理', '八、设备管理域 (equipment)', [
    { name: '设备台账', frontend: 'Equipment/', api: '/equipments', tables: 'equipment', desc: '设备档案CRUD（编号/名称/型号/状态/所属车间）' },
    { name: '模具台账', frontend: 'Mould/', api: '/moulds', tables: 'mould', desc: '模具档案管理' },
    { name: '模具保养', frontend: 'MouldMaintenance/', api: '/mould-maintenance', tables: 'mould_maintenance', desc: '模具保养记录' },
    { name: '设备停机', frontend: 'EquipmentDowntime/', api: '/equipment-downtime', tables: 'equipment_downtime', desc: '设备停机记录（原因/时长）' },
    { name: '设备保养计划', frontend: 'EquipmentMaintenancePlan/', api: '/equipment-maintenance-plan', tables: 'equipment_maintenance_plan', desc: '设备保养计划管理' },
    { name: '设备OEE', frontend: 'EquipmentOee/', api: '/equipment-oee', tables: '—', desc: '设备综合效率(OEE)仪表板' },
  ]);

  // 九、财务管理域 (3)
  addDomainSheet(wb, '9-财务管理', '九、财务管理域 (finance)', [
    { name: '会计期间', frontend: 'AccountingPeriod/', api: '/accounting-periods', tables: 'accounting_period', desc: '会计期间管理（年月/起止日期/状态），月度报表和报废入库的期间控制' },
    { name: '计件单价', frontend: 'PieceRatePrice/', api: '/piece-rate-prices', tables: 'piece_rate_price', desc: '工序+物料维度计件单价' },
    { name: '标准成本', frontend: 'StandardCost/', api: '/standard-costs', tables: 'standard_cost', desc: '物料标准成本管理' },
  ]);

  // 十、系统集成域 (3)
  addDomainSheet(wb, '10-系统集成', '十、系统集成域 (integration)', [
    { name: '批次追溯', frontend: 'BatchTrace/', api: '/batch-trace', tables: '—', desc: '成品批次全链路追溯（原料→生产→发货）' },
    { name: '新核云检验对接', frontend: 'XinheyunInspect/', api: '/integration/xhy-inspect', tables: '—', desc: '同步新核云系统检验记录/检验报工数据，含包装质量报表' },
    { name: '新核云库存对接', frontend: '—', api: '/integration/xhy-inventory', tables: '—', desc: '同步新核云系统库存数据，含库存查询/出入库流水' },
  ]);

  // 十一、系统管理域 (16)
  addDomainSheet(wb, '11-系统管理', '十一、系统管理域 (system)', [
    { name: '认证管理', frontend: 'Auth/', api: '/auth', tables: 'users', desc: '用户登录/注册/Token刷新，JWT认证' },
    { name: '驾驶舱', frontend: 'Cockpit/', api: '/cockpit', tables: '—', desc: '管理驾驶舱首页，全局数据可视化看板' },
    { name: '用户管理', frontend: 'User/', api: '/users', tables: 'users', desc: '用户CRUD，含角色分配' },
    { name: '角色管理', frontend: 'Role/', api: '/roles', tables: 'roles / role_permissions', desc: '角色CRUD+权限分配' },
    { name: '权限管理', frontend: 'Permission/', api: '/permissions', tables: 'permissions / permission_menu', desc: '菜单权限+API权限管理' },
    { name: '部门管理', frontend: 'Department/', api: '/departments', tables: 'department', desc: '部门树形管理' },
    { name: '审批管理', frontend: '—', api: '/approval', tables: '—', desc: '通用审批流（提交/审批/反审）' },
    { name: '工作流引擎', frontend: 'Workflow/', api: '/workflows / /workflow-runtime', tables: 'workflow_definition / workflow_instance', desc: '工作流设计器+运行时引擎，含我的待办' },
    { name: '通知管理', frontend: '—', api: '/notifications', tables: 'notifications', desc: '站内通知（SSE实时推送）' },
    { name: '安全审计', frontend: '—', api: '/security', tables: '—', desc: '操作日志/安全审计' },
    { name: 'API密钥', frontend: 'ApiKey/', api: '/api-keys', tables: 'api_key', desc: '外部系统API密钥管理' },
    { name: '用户偏好', frontend: '—', api: '/user-preferences', tables: 'user_preference', desc: '列个性化等用户偏好持久化' },
    { name: '单据完结配置', frontend: 'DocumentCompletionConfig/', api: '/document-completion-config', tables: 'document_completion_config', desc: '单据自动完结规则配置' },
    { name: '手动完结', frontend: 'ManualClose/', api: '/manual-close', tables: '—', desc: '手动完结指定单据' },
    { name: '自动盘点', frontend: 'AutoStockCount/', api: '/auto-stock-count', tables: '—', desc: '定时自动盘点任务配置' },
    { name: 'SSE推送', frontend: '—', api: '/sse', tables: '—', desc: 'Server-Sent Events实时消息推送' },
  ]);

  // 十二、开放接口域 (5)
  addDomainSheet(wb, '12-开放接口', '十二、开放接口域 (open)', [
    { name: '移动端报工', frontend: '—', api: '/open/work-reports', tables: '—', desc: '移动端快速报工接口' },
    { name: '开放订单接口', frontend: '—', api: '/open/orders', tables: '—', desc: '外部系统订单数据查询接口' },
    { name: '开放备料接口', frontend: '—', api: '/open/material-preparations', tables: '—', desc: '外部系统备料数据接口' },
    { name: '开放BOM接口', frontend: '—', api: '/open/bom', tables: '—', desc: '外部系统BOM数据查询接口' },
    { name: '外部API', frontend: '—', api: '/open/*', tables: '—', desc: 'API Key认证的外部系统接口' },
  ]);

  // ═══════════════════════════════════════════════
  // 13. Appendix: 跨域业务流程
  // ═══════════════════════════════════════════════
  const flowWs = wb.addWorksheet('附录A-跨域业务流程', { views: [{ state: 'frozen', ySplit: 1 }] });
  flowWs.columns = [
    { header: '#', key: 'idx', width: 5 },
    { header: '业务流程', key: 'flow', width: 35 },
    { header: '涉及域', key: 'domains', width: 40 },
    { header: '关键状态流转', key: 'states', width: 55 },
  ];
  applyHeaderStyle(flowWs, 1, 4);
  const flows = [
    ['销售订单→发货→开票全流程', 'sales', '草稿→已审批→已发货→部分开票/已开票'],
    ['采购申请→采购订单→收货→检验→入库', 'purchasing + quality + warehouse', '草稿→已审批→已收货→已检验→已入库'],
    ['MPS→MRP→生产单→派发→报工→检验→入库', 'planning + production + quality + warehouse', '待排产→已派发→生产中→已报工→已检验→已入库'],
    ['委外申请→委外订单→发料→收货→检验→结算', 'production', '草稿→已发出→已发料→已收货→已检验→已结算'],
    ['生产检验→NC单→返修/报废/让步', 'quality + production', '合格/不合格→返修→重检 / 报废→处置 / 让步接收'],
    ['成品装箱→箱码出库→发货', 'warehouse + sales', '待确认→已确认→在库→已出库'],
    ['盘点→复核→库存调整', 'warehouse', '待盘点→已录入→已复核→已调整'],
    ['采购退货出库', 'purchasing + warehouse', '草稿→已审批→已出库'],
    ['销售退货→退货入库', 'sales + warehouse', '草稿→已确认→已入库'],
    ['报废处置→报废入库', 'quality + warehouse', '待处置→已处置→已入库'],
  ];
  flows.forEach((f, i) => addDataRow(flowWs, i + 2, [i + 1, f[0], f[1], f[2]], false));

  // ═══════════════════════════════════════════════
  // 14. Appendix: 统计汇总
  // ═══════════════════════════════════════════════
  const statsWs = wb.addWorksheet('附录B-统计汇总');
  statsWs.columns = [
    { header: '业务域', key: 'domain', width: 18 },
    { header: '功能模块数', key: 'modules', width: 14 },
    { header: '后端路由数', key: 'routes', width: 14 },
    { header: '前端页面数', key: 'pages', width: 14 },
  ];
  applyHeaderStyle(statsWs, 1, 4);
  const summaryRows = [
    ['一、基础数据', 24, 23, 24],
    ['二、销售管理', 12, 8, 12],
    ['三、计划管理', 3, 3, 4],
    ['四、生产管理', 22, 19, 24],
    ['五、采购管理', 8, 7, 10],
    ['六、质量管理', 17, 17, 19],
    ['七、仓储管理', 15, 8, 26],
    ['八、设备管理', 6, 6, 6],
    ['九、财务管理', 3, 3, 3],
    ['十、系统集成', 3, 3, 7],
    ['十一、系统管理', 16, 17, 11],
    ['十二、开放接口', 5, 4, 0],
  ];
  summaryRows.forEach((r, i) => addDataRow(statsWs, i + 2, r, false));
  // total row
  const totalRow = statsWs.getRow(summaryRows.length + 2);
  addDataRow(statsWs, summaryRows.length + 2, ['合  计', 134, 118, 150], true);
  for (let c = 1; c <= 4; c++) {
    statsWs.getCell(summaryRows.length + 2, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAF6' } };
  }

  // ═══════════════════════════════════════════════
  // Save
  // ═══════════════════════════════════════════════
  const outPath = path.join(__dirname, 'Seals MES系统按域功能详细清单_v4.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log('Excel generated: ' + outPath);
}

main().catch(err => { console.error(err); process.exit(1); });
