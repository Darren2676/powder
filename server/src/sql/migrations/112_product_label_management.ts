/**
 * 112: 产品标签管理
 *
 * 变更内容：
 * 1. 创建 label_template 表（标签模板）
 * 2. 创建 label_template_field 表（模板字段配置）
 * 3. 创建 product_label_scheme 表（产品标签方案）
 * 4. 创建 product_label_custom_field 表（方案自定义字段值）
 * 5. 创建 label_print_log 表（标签打印日志）
 * 6. 插入种子数据：标准成品标签模板 + 系统预置字段
 * 7. 插入菜单权限（基础数据 → 标签模板管理 / 产品标签方案）
 */
import sequelize from '@/config/database';

export async function up(): Promise<void> {
  console.log('112: 产品标签管理 开始...');

  // ============================================================
  // 第一步：创建 label_template 表
  // ============================================================
  const [ltCheck]: any = await sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'label_template'`
  );
  if (ltCheck.length === 0) {
    await sequelize.query(`
      CREATE TABLE label_template (
        id INT IDENTITY(1,1) PRIMARY KEY,
        template_name NVARCHAR(100) NOT NULL,
        template_code NVARCHAR(50) NOT NULL,
        description NVARCHAR(500) DEFAULT '',
        paper_width INT DEFAULT 100,
        paper_height INT DEFAULT 80,
        qr_format NVARCHAR(500) DEFAULT '{item_number}|{batch_number}|{production_date}|{box_number}|{net_weight}',
        qr_size INT DEFAULT 20,
        qr_position NVARCHAR(20) DEFAULT 'bottom-right',
        is_active NVARCHAR(10) DEFAULT N'是',
        factory_id INT NULL,
        creation_man NVARCHAR(50) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE(),
        last_updater NVARCHAR(50) DEFAULT '',
        last_updated DATETIME DEFAULT GETDATE()
      )
    `);
    await sequelize.query(`CREATE UNIQUE INDEX UQ_lt_code ON label_template (template_code)`);
    console.log('  ✓ label_template 表已创建');
  } else {
    console.log('  → label_template 表已存在，跳过');
  }

  // ============================================================
  // 第二步：创建 label_template_field 表
  // ============================================================
  const [ltfCheck]: any = await sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'label_template_field'`
  );
  if (ltfCheck.length === 0) {
    await sequelize.query(`
      CREATE TABLE label_template_field (
        id INT IDENTITY(1,1) PRIMARY KEY,
        template_id INT NOT NULL,
        field_key NVARCHAR(50) NOT NULL,
        field_label NVARCHAR(100) NOT NULL,
        field_type NVARCHAR(20) DEFAULT 'system',
        data_source NVARCHAR(100) DEFAULT '',
        display_order INT DEFAULT 0,
        visible NVARCHAR(10) DEFAULT N'是',
        is_in_qr NVARCHAR(10) DEFAULT N'否',
        font_size INT DEFAULT 9,
        col_span INT DEFAULT 1,
        default_value NVARCHAR(200) DEFAULT '',
        FOREIGN KEY (template_id) REFERENCES label_template(id)
      )
    `);
    await sequelize.query(`CREATE INDEX IX_ltf_template ON label_template_field (template_id)`);
    console.log('  ✓ label_template_field 表已创建');
  } else {
    console.log('  → label_template_field 表已存在，跳过');
  }

  // ============================================================
  // 第三步：创建 product_label_scheme 表
  // ============================================================
  const [plsCheck]: any = await sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'product_label_scheme'`
  );
  if (plsCheck.length === 0) {
    await sequelize.query(`
      CREATE TABLE product_label_scheme (
        id INT IDENTITY(1,1) PRIMARY KEY,
        scheme_name NVARCHAR(100) NOT NULL,
        item_number NVARCHAR(50) NOT NULL,
        customer_number NVARCHAR(50) NULL,
        customer_name NVARCHAR(200) DEFAULT '',
        template_id INT NOT NULL,
        is_default NVARCHAR(10) DEFAULT N'否',
        is_active NVARCHAR(10) DEFAULT N'是',
        factory_id INT NULL,
        creation_man NVARCHAR(50) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE(),
        last_updater NVARCHAR(50) DEFAULT '',
        last_updated DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (template_id) REFERENCES label_template(id)
      )
    `);
    await sequelize.query(`CREATE INDEX IX_pls_item ON product_label_scheme (item_number)`);
    await sequelize.query(`CREATE INDEX IX_pls_customer ON product_label_scheme (customer_number)`);
    console.log('  ✓ product_label_scheme 表已创建');
  } else {
    console.log('  → product_label_scheme 表已存在，跳过');
  }

  // ============================================================
  // 第四步：创建 product_label_custom_field 表
  // ============================================================
  const [plcfCheck]: any = await sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'product_label_custom_field'`
  );
  if (plcfCheck.length === 0) {
    await sequelize.query(`
      CREATE TABLE product_label_custom_field (
        id INT IDENTITY(1,1) PRIMARY KEY,
        scheme_id INT NOT NULL,
        field_key NVARCHAR(50) NOT NULL,
        field_label NVARCHAR(100) NOT NULL,
        field_value NVARCHAR(500) DEFAULT '',
        display_order INT DEFAULT 0,
        is_in_qr NVARCHAR(10) DEFAULT N'否',
        FOREIGN KEY (scheme_id) REFERENCES product_label_scheme(id)
      )
    `);
    await sequelize.query(`CREATE INDEX IX_plcf_scheme ON product_label_custom_field (scheme_id)`);
    console.log('  ✓ product_label_custom_field 表已创建');
  } else {
    console.log('  → product_label_custom_field 表已存在，跳过');
  }

  // ============================================================
  // 第五步：创建 label_print_log 表
  // ============================================================
  const [lplCheck]: any = await sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'label_print_log'`
  );
  if (lplCheck.length === 0) {
    await sequelize.query(`
      CREATE TABLE label_print_log (
        id INT IDENTITY(1,1) PRIMARY KEY,
        scheme_id INT NULL,
        item_number NVARCHAR(50) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        batch_number NVARCHAR(50) DEFAULT '',
        production_date NVARCHAR(50) DEFAULT '',
        box_number NVARCHAR(50) DEFAULT '',
        net_weight NVARCHAR(50) DEFAULT '',
        remark NVARCHAR(500) DEFAULT '',
        custom_fields_json NVARCHAR(2000) DEFAULT '',
        qr_content NVARCHAR(500) DEFAULT '',
        print_time DATETIME DEFAULT GETDATE(),
        operator NVARCHAR(50) DEFAULT '',
        factory_id INT NULL
      )
    `);
    await sequelize.query(`CREATE INDEX IX_lpl_item ON label_print_log (item_number)`);
    await sequelize.query(`CREATE INDEX IX_lpl_time ON label_print_log (print_time)`);
    console.log('  ✓ label_print_log 表已创建');
  } else {
    console.log('  → label_print_log 表已存在，跳过');
  }

  // ============================================================
  // 第六步：插入种子数据 — 标准成品标签模板 + 系统预置字段
  // ============================================================
  const [seedCheck]: any = await sequelize.query(
    `SELECT id FROM label_template WHERE template_code = N'STANDARD_PRODUCT_LABEL'`
  );
  if (seedCheck.length === 0) {
    await sequelize.query(`
      INSERT INTO label_template (template_name, template_code, description, paper_width, paper_height, qr_format, qr_size, qr_position, is_active, creation_man)
      VALUES (N'标准成品标签', N'STANDARD_PRODUCT_LABEL', N'默认产品标签模板，包含产品编号、批号、生产日期、箱号、净重、备注等字段',
        100, 80, N'{item_number}|{batch_number}|{production_date}|{box_number}|{net_weight}', 20, N'bottom-right', N'是', N'system')
    `);
    const [tplRow]: any = await sequelize.query(`SELECT id FROM label_template WHERE template_code = N'STANDARD_PRODUCT_LABEL'`);
    const tplId = tplRow[0].id;

    // 系统预置字段
    const systemFields = [
      { key: 'item_number', label: '产品编号', source: 'item_master.item_number', order: 1, in_qr: '是', col: 1 },
      { key: 'item_name', label: '产品描述', source: 'item_master.item_name', order: 2, in_qr: '否', col: 1 },
      { key: 'batch_number', label: '批号', source: 'finished_batch_inventory.batch_number', order: 3, in_qr: '是', col: 1 },
      { key: 'production_date', label: '生产日期', source: 'finished_batch_inventory.production_date', order: 4, in_qr: '是', col: 1 },
      { key: 'box_number', label: '箱号', source: 'packing_box.box_number', order: 5, in_qr: '是', col: 1 },
      { key: 'net_weight', label: '净重', source: 'runtime', order: 6, in_qr: '是', col: 1 },
      { key: 'remark', label: '备注', source: 'runtime', order: 7, in_qr: '否', col: 2 },
      { key: 'specifications', label: '规格', source: 'item_master.specifications', order: 8, in_qr: '否', col: 1 },
      { key: 'shelf_life', label: '保质期', source: 'calc:shelf_life_days', order: 9, in_qr: '否', col: 1 },
      { key: 'reference_standard', label: '参考标准', source: 'runtime', order: 10, in_qr: '否', col: 1 },
    ];
    for (const f of systemFields) {
      await sequelize.query(`
        INSERT INTO label_template_field (template_id, field_key, field_label, field_type, data_source, display_order, visible, is_in_qr, font_size, col_span, default_value)
        VALUES (:tplId, :key, :label, N'system', :source, :order, N'是', :in_qr, 9, :col, '')
      `, { replacements: { tplId, key: f.key, label: f.label, source: f.source, order: f.order, in_qr: f.in_qr, col: f.col } });
    }
    console.log('  ✓ 种子数据已插入（标准成品标签模板 + 10个系统预置字段）');
  } else {
    console.log('  → 种子数据已存在，跳过');
  }

  // ============================================================
  // 第七步：插入菜单权限（包装管理子菜单 + 标签页面）
  // ============================================================
  const [masterDataMenu]: any = await sequelize.query(
    `SELECT id FROM permission WHERE permission_code = 'master-data' AND permission_type = 'menu'`
  );
  if (masterDataMenu.length > 0) {
    const masterDataId = masterDataMenu[0].id;

    // 创建"包装管理"子菜单（挂在主数据管理下）
    const [existPM]: any = await sequelize.query(`SELECT id, status FROM permission WHERE permission_code = 'packing-management'`);
    let packingMenuId: number;
    if (existPM.length === 0) {
      const [maxSort0]: any = await sequelize.query(
        `SELECT ISNULL(MAX(sort_order), 0) as max_sort FROM permission WHERE parent_id = :pid`,
        { replacements: { pid: masterDataId } }
      );
      const nextSort0 = (maxSort0[0]?.max_sort || 0) + 1;
      await sequelize.query(`
        INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, icon, sort_order, status)
        VALUES (N'包装管理', 'packing-management', 'menu', :pid, 'packing-management', NULL, 'GiftOutlined', :sort, N'启用')
      `, { replacements: { pid: masterDataId, sort: nextSort0 } });
      const [newPM]: any = await sequelize.query(`SELECT id FROM permission WHERE permission_code = 'packing-management'`);
      packingMenuId = newPM[0].id;
      console.log('  ✓ 权限"包装管理"子菜单已插入');
    } else {
      packingMenuId = existPM[0].id;
      // 修正 status
      if (existPM[0].status !== '启用') {
        await sequelize.query(`UPDATE permission SET status = N'启用' WHERE permission_code = 'packing-management'`);
        console.log('  ✓ "包装管理"状态已修正');
      } else {
        console.log('  → "包装管理"子菜单已存在');
      }
    }

    // 标签模板管理（挂在包装管理下）
    const [existLT]: any = await sequelize.query(`SELECT id, parent_id, status FROM permission WHERE permission_code = 'label-templates'`);
    if (existLT.length === 0) {
      await sequelize.query(`
        INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, icon, sort_order, status)
        VALUES (N'标签模板管理', 'label-templates', 'page', :pid, 'label-templates', '/label-templates', NULL, 1, N'启用')
      `, { replacements: { pid: packingMenuId } });
      console.log('  ✓ 权限"标签模板管理"已插入');
    } else {
      // 修正 parent_id 和 status
      const fixes: string[] = [];
      if (existLT[0].parent_id !== packingMenuId) fixes.push('parent_id');
      if (existLT[0].status !== '启用') fixes.push('status');
      if (fixes.length > 0) {
        await sequelize.query(`UPDATE permission SET parent_id = :pid, sort_order = 1, status = N'启用' WHERE permission_code = 'label-templates'`, { replacements: { pid: packingMenuId } });
        console.log(`  ✓ "标签模板管理"已修正: ${fixes.join(', ')}`);
      }
    }

    // 产品标签方案（挂在包装管理下）
    const [existPLS]: any = await sequelize.query(`SELECT id, parent_id, status FROM permission WHERE permission_code = 'product-label-schemes'`);
    if (existPLS.length === 0) {
      await sequelize.query(`
        INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, icon, sort_order, status)
        VALUES (N'产品标签方案', 'product-label-schemes', 'page', :pid, 'product-label-schemes', '/product-label-schemes', NULL, 2, N'启用')
      `, { replacements: { pid: packingMenuId } });
      console.log('  ✓ 权限"产品标签方案"已插入');
    } else {
      // 修正 parent_id 和 status
      const fixes: string[] = [];
      if (existPLS[0].parent_id !== packingMenuId) fixes.push('parent_id');
      if (existPLS[0].status !== '启用') fixes.push('status');
      if (fixes.length > 0) {
        await sequelize.query(`UPDATE permission SET parent_id = :pid, sort_order = 2, status = N'启用' WHERE permission_code = 'product-label-schemes'`, { replacements: { pid: packingMenuId } });
        console.log(`  ✓ "产品标签方案"已修正: ${fixes.join(', ')}`);
      }
    }

    // 为管理员角色授权
    const [adminRoles]: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'admin' OR role_name LIKE N'%管理员%'`);
    const newPerms = ['packing-management', 'label-templates', 'product-label-schemes'];
    for (const code of newPerms) {
      const [permRow]: any = await sequelize.query(`SELECT id FROM permission WHERE permission_code = :code`, { replacements: { code } });
      if (adminRoles.length > 0 && permRow.length > 0) {
        for (const role of adminRoles) {
          const [existingPerm]: any = await sequelize.query(
            `SELECT id FROM role_permission WHERE role_id = :rid AND permission_id = :pid`,
            { replacements: { rid: role.id, pid: permRow[0].id } }
          );
          if (existingPerm.length === 0) {
            await sequelize.query(`INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
              { replacements: { rid: role.id, pid: permRow[0].id } });
          }
        }
      }
    }
    console.log('  ✓ 管理员角色已授权');
  } else {
    console.log('  ⚠ 未找到基础数据菜单，跳过权限插入');
  }

  // 注册到 models/index.ts 的表列表
  console.log('  ℹ 请手动将以下表名添加到 server/src/models/index.ts 的表列表中：');
  console.log('    label_template, label_template_field, product_label_scheme, product_label_custom_field, label_print_log');

  console.log('112: 产品标签管理 完成');
}

export async function down(): Promise<void> {
  await sequelize.query(`DROP TABLE IF EXISTS label_print_log`);
  await sequelize.query(`DROP TABLE IF EXISTS product_label_custom_field`);
  await sequelize.query(`DROP TABLE IF EXISTS product_label_scheme`);
  await sequelize.query(`DROP TABLE IF EXISTS label_template_field`);
  await sequelize.query(`DROP TABLE IF EXISTS label_template`);
  await sequelize.query(`DELETE FROM permission WHERE permission_code IN ('label-templates', 'product-label-schemes', 'packing-management')`);
  console.log('112: 回滚完成');
}
