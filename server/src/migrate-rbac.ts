import sequelize from './config/database';

async function migrate() {
  try {
    console.log('开始RBAC权限系统迁移...');

    // ============ 1. role 表 ============
    try {
      await sequelize.query(`
        CREATE TABLE role (
          id INT IDENTITY(1,1) PRIMARY KEY,
          role_name NVARCHAR(50) NOT NULL,
          role_code NVARCHAR(50) NOT NULL,
          description NVARCHAR(200) NULL,
          is_system BIT DEFAULT 0,
          status NVARCHAR(20) DEFAULT N'启用',
          sort_order INT DEFAULT 0,
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE()
        )
      `);
      console.log('  role table created');

      await sequelize.query('CREATE UNIQUE INDEX IX_role_code ON role(role_code)');
      console.log('  role indexes created');
    } catch (err: any) {
      if (err.message?.includes('already exists') || err.original?.message?.includes('already exists')) {
        console.log('  role already exists, skip');
      } else {
        throw err;
      }
    }

    // ============ 2. permission 表 ============
    try {
      await sequelize.query(`
        CREATE TABLE permission (
          id INT IDENTITY(1,1) PRIMARY KEY,
          permission_name NVARCHAR(100) NOT NULL,
          permission_code NVARCHAR(100) NOT NULL,
          permission_type NVARCHAR(20) NOT NULL,
          parent_id INT NULL,
          menu_key NVARCHAR(100) NULL,
          route_path NVARCHAR(200) NULL,
          icon NVARCHAR(50) NULL,
          sort_order INT DEFAULT 0,
          status NVARCHAR(20) DEFAULT N'启用',
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE()
        )
      `);
      console.log('  permission table created');

      await sequelize.query('CREATE UNIQUE INDEX IX_permission_code ON permission(permission_code)');
      await sequelize.query('CREATE INDEX IX_permission_parent ON permission(parent_id)');
      await sequelize.query('CREATE INDEX IX_permission_type ON permission(permission_type)');
      console.log('  permission indexes created');
    } catch (err: any) {
      if (err.message?.includes('already exists') || err.original?.message?.includes('already exists')) {
        console.log('  permission already exists, skip');
      } else {
        throw err;
      }
    }

    // ============ 3. role_permission 关联表 ============
    try {
      await sequelize.query(`
        CREATE TABLE role_permission (
          id INT IDENTITY(1,1) PRIMARY KEY,
          role_id INT NOT NULL,
          permission_id INT NOT NULL,
          created_at DATETIME DEFAULT GETDATE()
        )
      `);
      console.log('  role_permission table created');

      await sequelize.query('CREATE UNIQUE INDEX IX_rp_unique ON role_permission(role_id, permission_id)');
      await sequelize.query('CREATE INDEX IX_rp_role ON role_permission(role_id)');
      await sequelize.query('CREATE INDEX IX_rp_permission ON role_permission(permission_id)');
      console.log('  role_permission indexes created');
    } catch (err: any) {
      if (err.message?.includes('already exists') || err.original?.message?.includes('already exists')) {
        console.log('  role_permission already exists, skip');
      } else {
        throw err;
      }
    }

    // ============ 4. user_role 关联表 ============
    try {
      await sequelize.query(`
        CREATE TABLE user_role (
          id INT IDENTITY(1,1) PRIMARY KEY,
          user_id INT NOT NULL,
          role_id INT NOT NULL,
          created_at DATETIME DEFAULT GETDATE()
        )
      `);
      console.log('  user_role table created');

      await sequelize.query('CREATE UNIQUE INDEX IX_ur_unique ON user_role(user_id, role_id)');
      await sequelize.query('CREATE INDEX IX_ur_user ON user_role(user_id)');
      await sequelize.query('CREATE INDEX IX_ur_role ON user_role(role_id)');
      console.log('  user_role indexes created');
    } catch (err: any) {
      if (err.message?.includes('already exists') || err.original?.message?.includes('already exists')) {
        console.log('  user_role already exists, skip');
      } else {
        throw err;
      }
    }

    // ============ 5. 初始化系统角色 ============
    const [existingRoles]: any = await sequelize.query('SELECT COUNT(*) as cnt FROM role');
    if (existingRoles[0].cnt === 0) {
      await sequelize.query(`
        INSERT INTO role (role_name, role_code, description, is_system, sort_order) VALUES
        (N'系统管理员', 'admin', N'拥有系统所有权限', 1, 1),
        (N'部门经理', 'manager', N'部门级管理权限', 1, 2),
        (N'普通员工', 'staff', N'基本操作权限', 1, 3)
      `);
      console.log('  default roles inserted');
    }

    // ============ 6. 初始化权限树 ============
    const [existingPerms]: any = await sequelize.query('SELECT COUNT(*) as cnt FROM permission');
    if (existingPerms[0].cnt === 0) {
      // 一级菜单权限
      const menus = [
        { name: '销售管理', code: 'sales', type: 'menu', menu_key: 'sales-management', icon: 'ShoppingOutlined', sort: 1 },
        { name: '生产计划', code: 'planning', type: 'menu', menu_key: 'production-planning', icon: 'DatabaseOutlined', sort: 2 },
        { name: '生产管理', code: 'production', type: 'menu', menu_key: 'production-management', icon: 'ToolOutlined', sort: 3 },
        { name: '仓储管理', code: 'warehouse', type: 'menu', menu_key: 'warehouse-management', icon: 'InboxOutlined', sort: 4 },
        { name: '采购管理', code: 'purchasing', type: 'menu', menu_key: 'purchasing-management', icon: 'CarOutlined', sort: 5 },
        { name: '质量管理', code: 'quality', type: 'menu', menu_key: 'quality-management', icon: 'SafetyCertificateOutlined', sort: 6 },
        { name: '财务结算', code: 'finance', type: 'menu', menu_key: 'finance-management', icon: 'AccountBookOutlined', sort: 7 },
        { name: '设备管理', code: 'equipment', type: 'menu', menu_key: 'equipment-management', icon: 'ToolOutlined', sort: 8 },
        { name: '主数据管理', code: 'master-data', type: 'menu', menu_key: 'master-data', icon: 'DatabaseOutlined', sort: 9 },
        { name: '系统设置', code: 'system', type: 'menu', menu_key: 'system-settings', icon: 'SettingOutlined', sort: 10 },
      ];

      for (const m of menus) {
        await sequelize.query(
          `INSERT INTO permission (permission_name, permission_code, permission_type, menu_key, icon, sort_order) VALUES (:name, :code, :type, :menu_key, :icon, :sort)`,
          { replacements: { ...m, type: 'menu' } }
        );
      }

      // 二级页面权限 - 关联一级菜单
      const pages: Array<{ name: string; code: string; parent_code: string; menu_key: string; route: string; sort: number }> = [
        // 销售
        { name: '销售订单', code: 'sales-orders', parent_code: 'sales', menu_key: 'sales-orders', route: '/sales-orders', sort: 1 },
        { name: '销售预测', code: 'forecasts', parent_code: 'sales', menu_key: 'forecasts', route: '/forecasts', sort: 2 },
        { name: '待发运', code: 'pending-shipments', parent_code: 'sales', menu_key: 'pending-shipments', route: '/pending-shipments', sort: 3 },
        { name: '发货申请', code: 'shipping-requests', parent_code: 'sales', menu_key: 'shipping-requests', route: '/shipping-requests', sort: 4 },
        { name: '发货单', code: 'shipping-orders', parent_code: 'sales', menu_key: 'shipping-orders-list', route: '/shipping-orders-list', sort: 5 },
        { name: '退货单', code: 'return-orders', parent_code: 'sales', menu_key: 'return-orders', route: '/return-orders', sort: 6 },
        { name: '销售报表', code: 'sales-report', parent_code: 'sales', menu_key: 'sales-report', route: '/sales-report', sort: 7 },
        // 生产计划
        { name: 'MPS报表', code: 'mps-report', parent_code: 'planning', menu_key: 'mps-report', route: '/mps-report', sort: 1 },
        { name: '生产计划', code: 'plans', parent_code: 'planning', menu_key: 'plans', route: '/plans', sort: 2 },
        { name: 'MRP运算', code: 'mrp', parent_code: 'planning', menu_key: 'mrp', route: '/mrp', sort: 3 },
        // 生产管理
        { name: '生产工单', code: 'orders', parent_code: 'production', menu_key: 'orders', route: '/orders', sort: 1 },
        { name: '甘特图', code: 'gantt', parent_code: 'production', menu_key: 'gantt', route: '/gantt', sort: 2 },
        { name: '工序任务', code: 'process-tasks', parent_code: 'production', menu_key: 'process-tasks', route: '/process-tasks', sort: 3 },
        { name: '备料任务', code: 'material-preparations', parent_code: 'production', menu_key: 'material-preparations', route: '/material-preparations', sort: 4 },
        { name: '领料记录', code: 'material-issue', parent_code: 'production', menu_key: 'material-issue', route: '/material-issue', sort: 5 },
        { name: '报工记录', code: 'work-reports', parent_code: 'production', menu_key: 'work-reports', route: '/work-reports', sort: 6 },
        { name: '外协申请', code: 'outsourcing-reqs', parent_code: 'production', menu_key: 'outsourcing-reqs', route: '/outsourcing-reqs', sort: 7 },
        { name: '外协订单', code: 'outsourcing-orders', parent_code: 'production', menu_key: 'outsourcing-orders', route: '/outsourcing-orders', sort: 8 },
        // 仓储管理
        { name: '成品仓库存', code: 'fg-inventory', parent_code: 'warehouse', menu_key: 'fg-inventory', route: '/fg-inventory', sort: 1 },
        { name: '成品入库', code: 'fg-inbound', parent_code: 'warehouse', menu_key: 'fg-inbound', route: '/fg-inbound', sort: 2 },
        { name: '成品出库', code: 'fg-outbound', parent_code: 'warehouse', menu_key: 'fg-outbound', route: '/fg-outbound', sort: 3 },
        { name: '原料仓库存', code: 'mw-inventory', parent_code: 'warehouse', menu_key: 'mw-inventory', route: '/mw-inventory', sort: 4 },
        { name: '原料入库', code: 'mw-inbound', parent_code: 'warehouse', menu_key: 'mw-inbound', route: '/mw-inbound', sort: 5 },
        { name: '原料出库', code: 'mw-outbound', parent_code: 'warehouse', menu_key: 'mw-outbound', route: '/mw-outbound', sort: 6 },
        // 采购管理
        { name: '采购申请', code: 'purchase-reqs', parent_code: 'purchasing', menu_key: 'purchase-reqs', route: '/purchase-reqs', sort: 1 },
        { name: '采购订单', code: 'purchase-orders', parent_code: 'purchasing', menu_key: 'purchase-orders', route: '/purchase-orders', sort: 2 },
        { name: '采购入库', code: 'stock-ins', parent_code: 'purchasing', menu_key: 'stock-ins', route: '/stock-ins', sort: 3 },
        // 质量管理
        { name: '批次追溯', code: 'batch-trace', parent_code: 'quality', menu_key: 'batch-trace', route: '/batch-trace', sort: 1 },
        { name: '质量报表', code: 'quality-report', parent_code: 'quality', menu_key: 'quality-report', route: '/quality-report', sort: 2 },
        { name: '来料检验', code: 'purchase-inspection', parent_code: 'quality', menu_key: 'purchase-inspection', route: '/purchase-inspection', sort: 3 },
        // 财务结算
        { name: '销售价目表', code: 'sales-prices', parent_code: 'finance', menu_key: 'sales-prices', route: '/sales-prices', sort: 1 },
        { name: '采购价目表', code: 'purchase-prices', parent_code: 'finance', menu_key: 'purchase-prices', route: '/purchase-prices', sort: 2 },
        { name: '计件单价', code: 'piece-rate-prices', parent_code: 'finance', menu_key: 'piece-rate-prices', route: '/piece-rate-prices', sort: 3 },
        { name: '会计期间', code: 'accounting-periods', parent_code: 'finance', menu_key: 'accounting-periods', route: '/accounting-periods', sort: 4 },
        // 设备管理
        { name: '设备台帐管理', code: 'equipments', parent_code: 'equipment', menu_key: 'equipments', route: '/equipments', sort: 1 },
        { name: '模具管理', code: 'moulds', parent_code: 'equipment', menu_key: 'moulds', route: '/moulds', sort: 2 },
        { name: '模具维修记录', code: 'mould-maintenance', parent_code: 'equipment', menu_key: 'mould-maintenance', route: '/mould-maintenance', sort: 3 },
        { name: '设备停机记录', code: 'equipment-downtime', parent_code: 'equipment', menu_key: 'equipment-downtime', route: '/equipment-downtime', sort: 4 },
        { name: '设备保养计划', code: 'equipment-maintenance-plan', parent_code: 'equipment', menu_key: 'equipment-maintenance-plan', route: '/equipment-maintenance-plan', sort: 5 },
        { name: 'OEE分析', code: 'equipment-oee', parent_code: 'equipment', menu_key: 'equipment-oee', route: '/equipment-oee', sort: 6 },
        // 主数据管理
        { name: '物料主数据', code: 'item-masters', parent_code: 'master-data', menu_key: 'item-masters', route: '/item-masters', sort: 1 },
        { name: 'BOM管理', code: 'boms', parent_code: 'master-data', menu_key: 'boms', route: '/boms', sort: 2 },
        { name: '工序管理', code: 'procedures', parent_code: 'master-data', menu_key: 'procedures', route: '/procedures', sort: 3 },
        { name: '工作中心', code: 'work-centers', parent_code: 'master-data', menu_key: 'work-centers', route: '/work-centers', sort: 4 },
        { name: '工艺路线', code: 'routing-masters', parent_code: 'master-data', menu_key: 'routing-masters', route: '/routing-masters', sort: 5 },
        { name: '客户管理', code: 'customers', parent_code: 'master-data', menu_key: 'customers', route: '/customers', sort: 6 },
        { name: '供应商管理', code: 'suppliers', parent_code: 'master-data', menu_key: 'suppliers', route: '/suppliers', sort: 7 },
        { name: '员工管理', code: 'employees', parent_code: 'master-data', menu_key: 'employees', route: '/employees', sort: 8 },
        // 系统设置
        { name: '用户管理', code: 'users', parent_code: 'system', menu_key: 'users', route: '/users', sort: 1 },
        { name: '部门管理', code: 'departments', parent_code: 'system', menu_key: 'departments', route: '/departments', sort: 2 },
        { name: '流程管理', code: 'workflow', parent_code: 'system', menu_key: 'workflow', route: '/workflow', sort: 3 },
      ];

      for (const p of pages) {
        // 查找parent id
        const [parentRows]: any = await sequelize.query(
          `SELECT id FROM permission WHERE permission_code = :code`,
          { replacements: { code: p.parent_code } }
        );
        const parentId = parentRows.length > 0 ? parentRows[0].id : null;
        await sequelize.query(
          `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, sort_order) VALUES (:name, :code, :type, :parentId, :menu_key, :route, :sort)`,
          { replacements: { name: p.name, code: p.code, type: 'page', parentId, menu_key: p.menu_key, route: p.route, sort: p.sort } }
        );
      }

      console.log('  default permissions inserted');
    }

    // ============ 7. 给admin角色分配所有权限 ============
    const [adminRole]: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'admin'`);
    if (adminRole.length > 0) {
      const [allPerms]: any = await sequelize.query(`SELECT id FROM permission`);
      const [existingRP]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM role_permission WHERE role_id = :rid`, { replacements: { rid: adminRole[0].id } });
      if (existingRP[0].cnt === 0) {
        for (const perm of allPerms) {
          await sequelize.query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
            { replacements: { rid: adminRole[0].id, pid: perm.id } }
          );
        }
        console.log('  admin role assigned all permissions');
      }
    }

    // ============ 8. 给manager角色分配大部分权限（排除系统设置） ============
    const [managerRole]: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'manager'`);
    if (managerRole.length > 0) {
      const [existingMR]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM role_permission WHERE role_id = :rid`, { replacements: { rid: managerRole[0].id } });
      if (existingMR[0].cnt === 0) {
        await sequelize.query(
          `INSERT INTO role_permission (role_id, permission_id) SELECT :rid, id FROM permission WHERE permission_code != 'system' AND permission_code != 'users' AND permission_code != 'departments' AND permission_code != 'workflow'`,
          { replacements: { rid: managerRole[0].id } }
        );
        console.log('  manager role assigned permissions');
      }
    }

    // ============ 9. 给staff角色分配基本权限 ============
    const [staffRole]: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'staff'`);
    if (staffRole.length > 0) {
      const [existingSR]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM role_permission WHERE role_id = :rid`, { replacements: { rid: staffRole[0].id } });
      if (existingSR[0].cnt === 0) {
        // staff只有看板+生产操作权限
        const staffPerms = ['sales', 'production', 'process-tasks', 'work-reports', 'material-preparations', 'material-issue', 'equipment', 'equipments', 'moulds', 'mould-maintenance'];
        for (const code of staffPerms) {
          const [permRows]: any = await sequelize.query(`SELECT id FROM permission WHERE permission_code = :code`, { replacements: { code } });
          if (permRows.length > 0) {
            await sequelize.query(
              `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
              { replacements: { rid: staffRole[0].id, pid: permRows[0].id } }
            );
          }
        }
        console.log('  staff role assigned permissions');
      }
    }

    // ============ 10. 为现有用户按旧role字段自动分配角色 ============
    const [users]: any = await sequelize.query(`SELECT id, role FROM users WHERE role IS NOT NULL`);
    for (const u of users) {
      const [existingUR]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM user_role WHERE user_id = :uid`, { replacements: { uid: u.id } });
      if (existingUR[0].cnt === 0) {
        const [roleRows]: any = await sequelize.query(`SELECT id FROM role WHERE role_code = :code`, { replacements: { code: u.role } });
        if (roleRows.length > 0) {
          await sequelize.query(
            `INSERT INTO user_role (user_id, role_id) VALUES (:uid, :rid)`,
            { replacements: { uid: u.id, rid: roleRows[0].id } }
          );
        }
      }
    }
    console.log('  existing users migrated to user_role');

    console.log('RBAC权限系统迁移全部完成');
    process.exit(0);
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
