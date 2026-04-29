import sequelize from './config/database';

async function migrate() {
  try {
    console.log('开始补全权限菜单数据...');

    // ============ 1. 添加缺失的二级子菜单 ============
    const subMenus = [
      // 主数据子菜单
      { name: '生产数据', code: 'production-data', parent_code: 'master-data', menu_key: 'production-data', icon: 'ToolOutlined', sort: 1 },
      { name: '产品数据', code: 'product-data', parent_code: 'master-data', menu_key: 'product-data', icon: 'DatabaseOutlined', sort: 2 },
      { name: 'BOM管理', code: 'bom-management', parent_code: 'master-data', menu_key: 'bom-management', icon: 'BranchesOutlined', sort: 3 },
      { name: '质量数据', code: 'quality-data', parent_code: 'master-data', menu_key: 'quality-data', icon: 'SafetyCertificateOutlined', sort: 4 },
      { name: '企业数据', code: 'enterprise-data', parent_code: 'master-data', menu_key: 'enterprise-management', icon: 'ShopOutlined', sort: 5 },
      // 销售子菜单
      { name: '订单管理', code: 'order-management', parent_code: 'sales', menu_key: 'order-management', icon: 'FileTextOutlined', sort: 1 },
      { name: '明细管理', code: 'detail-management', parent_code: 'sales', menu_key: 'detail-management', icon: 'UnorderedListOutlined', sort: 2 },
      { name: '报表统计', code: 'report-statistics', parent_code: 'sales', menu_key: 'report-statistics', icon: 'BarChartOutlined', sort: 3 },
      // 计划子菜单
      { name: 'MRP管理', code: 'mrp-management', parent_code: 'planning', menu_key: 'mrp-management', icon: 'ThunderboltOutlined', sort: 2 },
      // 生产子菜单
      { name: '备料管理', code: 'normal-preparation', parent_code: 'production', menu_key: 'normal-preparation', icon: 'InboxOutlined', sort: 2 },
      { name: '在制管理', code: 'wip-management', parent_code: 'production', menu_key: 'wip-management', icon: 'SwapOutlined', sort: 3 },
      { name: '报工管理', code: 'report-management', parent_code: 'production', menu_key: 'report-management', icon: 'FileDoneOutlined', sort: 4 },
      // 仓储子菜单
      { name: '成品仓', code: 'finished-goods-management', parent_code: 'warehouse', menu_key: 'finished-goods-management', icon: 'ContainerOutlined', sort: 1 },
      { name: '原料仓', code: 'material-warehouse-management', parent_code: 'warehouse', menu_key: 'material-warehouse-management', icon: 'ImportOutlined', sort: 2 },
      // 采购子菜单
      { name: '采购申请', code: 'purchase-req-management', parent_code: 'purchasing', menu_key: 'purchase-req-management', icon: 'FormOutlined', sort: 1 },
      { name: '采购订单', code: 'purchase-order-management', parent_code: 'purchasing', menu_key: 'purchase-order-management', icon: 'FileDoneOutlined', sort: 2 },
      { name: '采购价格', code: 'purchase-price-management', parent_code: 'purchasing', menu_key: 'purchase-price-management', icon: 'AccountBookOutlined', sort: 3 },
      // 质量子菜单
      { name: '检验规范', code: 'inspection-spec-management', parent_code: 'quality', menu_key: 'inspection-spec-management', icon: 'AuditOutlined', sort: 1 },
      { name: '质量数据管理', code: 'quality-data-management', parent_code: 'quality', menu_key: 'quality-data-management', icon: 'DatabaseOutlined', sort: 2 },
      { name: '质量报表', code: 'quality-report-menu', parent_code: 'quality', menu_key: 'quality-report-menu', icon: 'PieChartOutlined', sort: 3 },
      { name: '新核云', code: 'xhy-dev', parent_code: 'quality', menu_key: 'xhy-dev', icon: 'CloudOutlined', sort: 4 },
    ];

    for (const sm of subMenus) {
      const existing: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = :code`,
        { replacements: { code: sm.code }, type: 'SELECT' }
      );
      if (existing.length === 0) {
        const parentRows: any = await sequelize.query(
          `SELECT id FROM permission WHERE permission_code = :code`,
          { replacements: { code: sm.parent_code }, type: 'SELECT' }
        );
        const parentId = parentRows.length > 0 ? parentRows[0].id : null;
        if (!parentId) { console.log(`  SKIP ${sm.name}: parent not found`); continue; }
        await sequelize.query(
          `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, icon, sort_order, status)
           VALUES (:pName, :pCode, 'menu', :parentId, :menuKey, :pIcon, :pSort, N'启用')`,
          { replacements: { pName: sm.name, pCode: sm.code, parentId, menuKey: sm.menu_key, pIcon: sm.icon, pSort: sm.sort } }
        );
        console.log(`  Added sub-menu: ${sm.name}`);
      }
    }

    // ============ 2. 添加缺失的页面权限 ============
    const pages: Array<{ name: string; code: string; parent_code: string; menu_key: string; route: string; sort: number }> = [
      // 生产数据 (production-data)
      { name: '排班管理', code: 'schedules', parent_code: 'production-data', menu_key: 'schedules', route: '/schedules', sort: 1 },
      { name: '班组管理', code: 'teams', parent_code: 'production-data', menu_key: 'teams', route: '/teams', sort: 2 },
      { name: '车间管理', code: 'workshops', parent_code: 'production-data', menu_key: 'workshops', route: '/workshops', sort: 3 },
      { name: '产线管理', code: 'productionlines', parent_code: 'production-data', menu_key: 'productionlines', route: '/productionlines', sort: 4 },
      { name: '仓库管理', code: 'warehouses', parent_code: 'production-data', menu_key: 'warehouses', route: '/warehouses', sort: 5 },
      { name: '单位管理', code: 'units', parent_code: 'production-data', menu_key: 'units', route: '/units', sort: 6 },
      { name: '库位管理', code: 'storage-locations', parent_code: 'production-data', menu_key: 'storage-locations', route: '/storage-locations', sort: 7 },
      // 产品数据 (product-data)
      { name: '物料属性', code: 'materia-properties', parent_code: 'product-data', menu_key: 'materia-properties', route: '/materia-properties', sort: 1 },
      { name: '物料分类', code: 'material-classes', parent_code: 'product-data', menu_key: 'material-classes', route: '/material-classes', sort: 2 },
      { name: '产品分类', code: 'product-classes', parent_code: 'product-data', menu_key: 'product-classes', route: '/product-classes', sort: 3 },
      // BOM管理 (bom-management)
      { name: 'BOM结构树', code: 'bom-tree', parent_code: 'bom-management', menu_key: 'bom-tree', route: '/bom-tree', sort: 2 },
      { name: '制造BOM', code: 'mfg-boms', parent_code: 'bom-management', menu_key: 'mfg-boms', route: '/mfg-boms', sort: 3 },
      { name: '制造BOM结构', code: 'mfg-bom-tree', parent_code: 'bom-management', menu_key: 'mfg-bom-tree', route: '/mfg-bom-tree', sort: 4 },
      // 企业数据 (enterprise-data)
      { name: '物流公司', code: 'logistics-companies', parent_code: 'enterprise-data', menu_key: 'logistics-companies', route: '/logistics-companies', sort: 1 },
      { name: '客户物料对照', code: 'customer-material-mapping', parent_code: 'enterprise-data', menu_key: 'customer-material-mapping', route: '/customer-material-mapping', sort: 2 },
      // 质量数据 (quality-data) - 标准工序/工作中心/工艺路线
      // (这些从master-data移动过来，不需要新增)
      // 销售订单管理 (order-management) - 新增明细页面
      { name: '销售订单明细', code: 'sales-order-details', parent_code: 'order-management', menu_key: 'sales-order-details', route: '/sales-order-details', sort: 2 },
      // 明细管理 (detail-management)
      { name: '发货申请明细', code: 'pending-request-details', parent_code: 'detail-management', menu_key: 'pending-request-details', route: '/pending-request-details', sort: 1 },
      { name: '发货单明细', code: 'shipping-order-details', parent_code: 'detail-management', menu_key: 'shipping-order-details', route: '/shipping-order-details', sort: 2 },
      { name: '退货单明细', code: 'return-order-details', parent_code: 'detail-management', menu_key: 'return-order-details', route: '/return-order-details', sort: 3 },
      { name: '销售预测明细', code: 'forecast-details', parent_code: 'detail-management', menu_key: 'forecast-details', route: '/forecast-details', sort: 4 },
      // 报表统计 (report-statistics)
      { name: '发货预警', code: 'shipping-warning', parent_code: 'report-statistics', menu_key: 'shipping-warning', route: '/shipping-warning', sort: 2 },
      // MRP管理 (mrp-management)
      { name: 'MRP运算历史', code: 'mrp-history', parent_code: 'mrp-management', menu_key: 'mrp-history', route: '/mrp-history', sort: 1 },
      // 备料管理 (normal-preparation)
      { name: '按工序备料请单', code: 'material-preparation-by-process', parent_code: 'normal-preparation', menu_key: 'material-preparation-by-process', route: '/material-preparation-by-process', sort: 2 },
            // 注：原有 'material-issue-page' 重复菜单已移除，使用已存在的 permission_code='material-issue' 作为"按生产单备料"唯一菜单项（见下方 moves）
            { name: '按工序备料', code: 'material-issue-by-process', parent_code: 'normal-preparation', menu_key: 'material-issue-by-process', route: '/material-issue-by-process', sort: 4 },
      // 在制管理 (wip-management)
      { name: 'WIP按生产单', code: 'wip-by-order', parent_code: 'wip-management', menu_key: 'wip-by-order', route: '/wip-by-order', sort: 1 },
      { name: 'WIP按工作中心', code: 'wip-by-work-center', parent_code: 'wip-management', menu_key: 'wip-by-work-center', route: '/wip-by-work-center', sort: 2 },
      { name: '线边仓流水', code: 'wip-lineside-transactions', parent_code: 'wip-management', menu_key: 'wip-lineside-transactions', route: '/wip-lineside-transactions', sort: 3 },
      { name: '连续报工', code: 'continuous-report', parent_code: 'wip-management', menu_key: 'continuous-report', route: '/continuous-report', sort: 5 },
      // 成品仓 (finished-goods-management)
      { name: '生产入库单', code: 'fg-inbound-orders', parent_code: 'finished-goods-management', menu_key: 'fg-inbound-orders', route: '/fg-inbound-orders', sort: 3 },
      { name: '库存流水记录', code: 'fg-transactions', parent_code: 'finished-goods-management', menu_key: 'fg-transactions', route: '/fg-transactions', sort: 4 },
      { name: '异常出入库', code: 'fg-abnormal-io', parent_code: 'finished-goods-management', menu_key: 'fg-abnormal-io', route: '/fg-abnormal-io', sort: 5 },
      { name: '月末盘点', code: 'fg-stock-count', parent_code: 'finished-goods-management', menu_key: 'fg-stock-count', route: '/fg-stock-count', sort: 6 },
      { name: '盘点报表', code: 'fg-stock-count-report', parent_code: 'finished-goods-management', menu_key: 'fg-stock-count-report', route: '/fg-stock-count-report', sort: 7 },
      { name: '月度出入库报表', code: 'fg-monthly-report', parent_code: 'finished-goods-management', menu_key: 'fg-monthly-report', route: '/fg-monthly-report', sort: 8 },
      { name: '退货入库', code: 'fg-return-inbound', parent_code: 'finished-goods-management', menu_key: 'fg-return-inbound', route: '/fg-return-inbound', sort: 9 },
      // 原料仓 (material-warehouse-management)
      { name: '物料流水记录', code: 'mw-transactions', parent_code: 'material-warehouse-management', menu_key: 'mw-transactions', route: '/mw-transactions', sort: 3 },
      { name: '安全库存预警', code: 'mw-safety-stock', parent_code: 'material-warehouse-management', menu_key: 'mw-safety-stock', route: '/mw-safety-stock', sort: 4 },
      { name: '来料入库', code: 'stock-ins', parent_code: 'material-warehouse-management', menu_key: 'stock-ins', route: '/stock-ins', sort: 5 },
      // 采购申请 (purchase-req-management)
      { name: '采购申请明细', code: 'purchase-req-details', parent_code: 'purchase-req-management', menu_key: 'purchase-req-details', route: '/purchase-req-details', sort: 2 },
      // 采购价格 (purchase-price-management)
      { name: '采购需求报表', code: 'purchase-calc', parent_code: 'purchase-price-management', menu_key: 'purchase-calc', route: '/purchase-calc', sort: 3 },
      // 检验规范 (inspection-spec-management)
      { name: '生产检验规范', code: 'inspection-specs-production', parent_code: 'inspection-spec-management', menu_key: 'inspection-specs-production', route: '/inspection-specs-production', sort: 1 },
      { name: '来料检验规范', code: 'inspection-specs-incoming', parent_code: 'inspection-spec-management', menu_key: 'inspection-specs-incoming', route: '/inspection-specs-incoming', sort: 2 },
      { name: '生产检验方案', code: 'inspection-plans', parent_code: 'inspection-spec-management', menu_key: 'inspection-plans', route: '/inspection-plans', sort: 3 },
      { name: '收料检验方案', code: 'incoming-inspect-plans', parent_code: 'inspection-spec-management', menu_key: 'incoming-inspect-plans', route: '/incoming-inspect-plans', sort: 4 },
      // 质量数据管理 (quality-data-management)
      { name: '缺陷原因', code: 'defect-reasons', parent_code: 'quality-data-management', menu_key: 'defect-reasons', route: '/defect-reasons', sort: 1 },
      { name: '缺陷分类', code: 'defect-classes', parent_code: 'quality-data-management', menu_key: 'defect-classes', route: '/defect-classes', sort: 2 },
      { name: '缺陷管理', code: 'defects', parent_code: 'quality-data-management', menu_key: 'defects', route: '/defects', sort: 3 },
      { name: '质量特性', code: 'quality-characteristics', parent_code: 'quality-data-management', menu_key: 'quality-characteristics', route: '/quality-characteristics', sort: 4 },
      // 质量报表 (quality-report-menu)
      { name: '按产品质量汇总', code: 'product-quality-summary', parent_code: 'quality-report-menu', menu_key: 'product-quality-summary', route: '/product-quality-summary', sort: 2 },
      // 新核云 (xhy-dev)
      { name: '检验记录', code: 'xhy-inspect', parent_code: 'xhy-dev', menu_key: 'xhy-inspect', route: '/xhy-inspect', sort: 1 },
      { name: '检验明细行', code: 'xhy-inspect-lines', parent_code: 'xhy-dev', menu_key: 'xhy-inspect-lines', route: '/xhy-inspect-lines', sort: 2 },
      { name: '检验报工汇总', code: 'xhy-inspect-summary', parent_code: 'xhy-dev', menu_key: 'xhy-inspect-summary', route: '/xhy-inspect-summary', sort: 3 },
      { name: '包装质量报表', code: 'xhy-packaging-quality', parent_code: 'xhy-dev', menu_key: 'xhy-packaging-quality', route: '/xhy-packaging-quality', sort: 4 },
      { name: '库存查询', code: 'xhy-inventory', parent_code: 'xhy-dev', menu_key: 'xhy-inventory', route: '/xhy-inventory', sort: 5 },
      { name: '出入库记录', code: 'xhy-inventory-txn', parent_code: 'xhy-dev', menu_key: 'xhy-inventory-txn', route: '/xhy-inventory-txn', sort: 6 },
      // 系统设置
      { name: '角色管理', code: 'roles', parent_code: 'system', menu_key: 'roles', route: '/roles', sort: 2 },
      { name: '权限菜单管理', code: 'permissions', parent_code: 'system', menu_key: 'permissions', route: '/permissions', sort: 3 },
    ];

    for (const p of pages) {
      const existing: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = :code`,
        { replacements: { code: p.code }, type: 'SELECT' }
      );
      if (existing.length === 0) {
        const parentRows: any = await sequelize.query(
          `SELECT id FROM permission WHERE permission_code = :code`,
          { replacements: { code: p.parent_code }, type: 'SELECT' }
        );
        const parentId = parentRows.length > 0 ? parentRows[0].id : null;
        if (!parentId) { console.log(`  SKIP ${p.name}: parent ${p.parent_code} not found`); continue; }
        await sequelize.query(
          `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, sort_order, status)
           VALUES (:pName, :pCode, 'page', :parentId, :menuKey, :routePath, :pSort, N'启用')`,
          { replacements: { pName: p.name, pCode: p.code, parentId, menuKey: p.menu_key, routePath: p.route, pSort: p.sort } }
        );
        console.log(`  Added page: ${p.name}`);
      } else {
        // 页面已存在，但可能需要移动到新的父菜单下
        const parentRows: any = await sequelize.query(
          `SELECT id FROM permission WHERE permission_code = :code`,
          { replacements: { code: p.parent_code }, type: 'SELECT' }
        );
        if (parentRows.length > 0) {
          await sequelize.query(
            `UPDATE permission SET parent_id = :newParentId WHERE permission_code = :code AND parent_id != :newParentId`,
            { replacements: { newParentId: parentRows[0].id, code: p.code } }
          );
        }
      }
    }

    // ============ 3. 移动现有页面权限到正确的子菜单下 ============
    const moves: Array<{ code: string; new_parent_code: string; new_sort: number }> = [
      // master-data > production-data
      { code: 'schedules', new_parent_code: 'production-data', new_sort: 1 },
      { code: 'teams', new_parent_code: 'production-data', new_sort: 2 },
      { code: 'workshops', new_parent_code: 'production-data', new_sort: 3 },
      { code: 'productionlines', new_parent_code: 'production-data', new_sort: 4 },
      { code: 'warehouses', new_parent_code: 'production-data', new_sort: 5 },
      { code: 'units', new_parent_code: 'production-data', new_sort: 6 },
      // master-data > product-data
      { code: 'item-masters', new_parent_code: 'product-data', new_sort: 1 },
      { code: 'materia-properties', new_parent_code: 'product-data', new_sort: 2 },
      { code: 'material-classes', new_parent_code: 'product-data', new_sort: 3 },
      { code: 'product-classes', new_parent_code: 'product-data', new_sort: 4 },
      // master-data > bom-management
      { code: 'boms', new_parent_code: 'bom-management', new_sort: 1 },
      // master-data > product-data (标准工序/工作中心/工艺路线)
      { code: 'procedures', new_parent_code: 'product-data', new_sort: 5 },
      { code: 'work-centers', new_parent_code: 'product-data', new_sort: 6 },
      { code: 'routing-masters', new_parent_code: 'product-data', new_sort: 7 },
      // master-data > enterprise-data
      { code: 'customers', new_parent_code: 'enterprise-data', new_sort: 1 },
      { code: 'suppliers', new_parent_code: 'enterprise-data', new_sort: 2 },
      { code: 'employees', new_parent_code: 'enterprise-data', new_sort: 3 },
      // sales > order-management
      { code: 'sales-orders', new_parent_code: 'order-management', new_sort: 1 },
      { code: 'forecasts', new_parent_code: 'order-management', new_sort: 3 },
      { code: 'forecast-details', new_parent_code: 'order-management', new_sort: 4 },
      { code: 'pending-shipments', new_parent_code: 'order-management', new_sort: 5 },
      { code: 'shipping-requests', new_parent_code: 'order-management', new_sort: 6 },
      { code: 'shipping-orders', new_parent_code: 'order-management', new_sort: 7 },
      { code: 'return-orders', new_parent_code: 'order-management', new_sort: 8 },
      // sales > report-statistics
      { code: 'sales-report', new_parent_code: 'report-statistics', new_sort: 1 },
      { code: 'shipping-warning', new_parent_code: 'report-statistics', new_sort: 2 },
      // production > normal-preparation
      { code: 'material-preparations', new_parent_code: 'normal-preparation', new_sort: 1 },
      // production > wip-management (existing material-issue)
      { code: 'material-issue', new_parent_code: 'normal-preparation', new_sort: 3 },
      // production > report-management (报工管理)
      { code: 'process-tasks', new_parent_code: 'report-management', new_sort: 1 },
      { code: 'continuous-report', new_parent_code: 'report-management', new_sort: 2 },
      { code: 'work-reports', new_parent_code: 'report-management', new_sort: 3 },
      // planning > mrp-management
      { code: 'mrp', new_parent_code: 'mrp-management', new_sort: 1 },
      // warehouse > finished-goods-management
      { code: 'fg-inventory', new_parent_code: 'finished-goods-management', new_sort: 1 },
      { code: 'fg-inbound', new_parent_code: 'finished-goods-management', new_sort: 2 },
      { code: 'fg-outbound', new_parent_code: 'finished-goods-management', new_sort: 2 },
      // warehouse > material-warehouse-management
      { code: 'mw-inventory', new_parent_code: 'material-warehouse-management', new_sort: 1 },
      { code: 'mw-inbound', new_parent_code: 'material-warehouse-management', new_sort: 2 },
      { code: 'mw-outbound', new_parent_code: 'material-warehouse-management', new_sort: 2 },
      // purchasing > purchase-req-management
      { code: 'purchase-reqs', new_parent_code: 'purchase-req-management', new_sort: 1 },
      // purchasing > purchase-order-management
      { code: 'purchase-orders', new_parent_code: 'purchase-order-management', new_sort: 1 },
      // purchasing > purchase-price-management
      { code: 'purchase-prices', new_parent_code: 'purchase-price-management', new_sort: 1 },
      { code: 'piece-rate-prices', new_parent_code: 'purchase-price-management', new_sort: 2 },
      // quality > quality-report-menu
      { code: 'quality-report', new_parent_code: 'quality-report-menu', new_sort: 1 },
      { code: 'purchase-inspection', new_parent_code: 'quality-report-menu', new_sort: 3 },
      // quality > xhy-dev
      { code: 'batch-trace', new_parent_code: 'xhy-dev', new_sort: 7 },
      // finance: 只保留会计期间 (sales-prices和purchase-prices移走)
      { code: 'sales-prices', new_parent_code: 'order-management', new_sort: 9 },
    ];

    for (const m of moves) {
      const parentRows: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = :code`,
        { replacements: { code: m.new_parent_code }, type: 'SELECT' }
      );
      if (parentRows.length > 0) {
        await sequelize.query(
          `UPDATE permission SET parent_id = :newParentId, sort_order = :newSort WHERE permission_code = :code`,
          { replacements: { newParentId: parentRows[0].id, newSort: m.new_sort, code: m.code } }
        );
        console.log(`  Moved: ${m.code} -> ${m.new_parent_code}`);
      } else {
        console.log(`  SKIP move ${m.code}: parent ${m.new_parent_code} not found`);
      }
    }

    // ============ 4. 删除不再需要的旧权限（pending-shipments是待发货列表，已由发货申请替代） ============
    // 不删除，保留

    // ============ 5. 重新给admin分配所有权限 ============
    const adminRole: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'admin'`, { type: 'SELECT' });
    if (adminRole.length > 0) {
      await sequelize.query(`DELETE FROM role_permission WHERE role_id = :rid`, { replacements: { rid: adminRole[0].id } });
      await sequelize.query(
        `INSERT INTO role_permission (role_id, permission_id) SELECT :rid, id FROM permission`,
        { replacements: { rid: adminRole[0].id } }
      );
      console.log('  admin role reassigned all permissions');
    }

    // ============ 6. 给manager分配除system外权限 ============
    const managerRole: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'manager'`, { type: 'SELECT' });
    if (managerRole.length > 0) {
      await sequelize.query(`DELETE FROM role_permission WHERE role_id = :rid`, { replacements: { rid: managerRole[0].id } });
      await sequelize.query(
        `INSERT INTO role_permission (role_id, permission_id) SELECT :rid, id FROM permission WHERE permission_code NOT IN ('system', 'users', 'departments', 'workflow', 'permissions', 'roles')`,
        { replacements: { rid: managerRole[0].id } }
      );
      console.log('  manager role reassigned permissions');
    }

    // ============ 7. 给staff分配基本权限 ============
    const staffRole: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'staff'`, { type: 'SELECT' });
    if (staffRole.length > 0) {
      await sequelize.query(`DELETE FROM role_permission WHERE role_id = :rid`, { replacements: { rid: staffRole[0].id } });
      const staffPerms = [
        'sales', 'order-management', 'sales-orders',
        'production', 'process-tasks', 'work-reports', 'normal-preparation', 'material-preparations', 'material-issue',
        'equipment', 'equipments', 'moulds', 'mould-maintenance',
        'warehouse', 'finished-goods-management', 'fg-inventory', 'fg-inbound', 'fg-outbound',
        'material-warehouse-management', 'mw-inventory', 'mw-inbound', 'mw-outbound',
      ];
      for (const code of staffPerms) {
        const permRows: any = await sequelize.query(`SELECT id FROM permission WHERE permission_code = :code`, { replacements: { code }, type: 'SELECT' });
        if (permRows.length > 0) {
          await sequelize.query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
            { replacements: { rid: staffRole[0].id, pid: permRows[0].id } }
          );
        }
      }
      console.log('  staff role reassigned permissions');
    }

    console.log('权限菜单补全完成!');
    process.exit(0);
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
