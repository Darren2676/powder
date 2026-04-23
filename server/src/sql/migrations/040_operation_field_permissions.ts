/**
 * 迁移040：新增操作级权限和字段级权限
 * 
 * 在现有 permission 表中扩展两种新的 permission_type:
 *   - 'operation': 页面操作权限（查看/新增/编辑/删除/审批/导出/导入）
 *   - 'field': 字段级权限（单价/金额等敏感字段的可见性控制）
 * 
 * 权限编码约定:
 *   - 操作权限: {page_code}:{action}  例如 sales-orders:view, sales-orders:edit
 *   - 字段权限: {page_code}:field:{field_name}  例如 sales-orders:field:unit_price
 */

import sequelize from '../../config/database';

// 所有页面的标准操作列表
const STANDARD_OPERATIONS = [
  { action: 'view', name: '查看', sort: 1 },
  { action: 'create', name: '新增', sort: 2 },
  { action: 'edit', name: '编辑', sort: 3 },
  { action: 'delete', name: '删除', sort: 4 },
  { action: 'export', name: '导出', sort: 5 },
];

// 需要审批操作的页面
const APPROVAL_PAGES = [
  'sales-orders', 'purchase-orders', 'outsourcing-orders',
  'purchase-reqs', 'outsourcing-reqs', 'shipping-requests',
  'fg-inbound', 'fg-outbound', 'mw-inbound', 'mw-outbound',
  'stock-ins', 'return-orders',
  // 主数据审批
  'item-masters', 'boms', 'procedures', 'work-centers', 'routing-masters',
  'customers', 'suppliers', 'employees',
  'equipments', 'moulds',
];

// 需要导入操作的页面
const IMPORT_PAGES = [
  'sales-orders', 'purchase-orders', 'item-masters', 'boms',
  'customers', 'suppliers', 'employees',
];

// 需要字段级权限控制的页面及其敏感字段
const FIELD_PERMISSIONS: Array<{
  page_code: string;
  fields: Array<{ field: string; name: string; sort: number }>;
}> = [
  {
    page_code: 'sales-orders',
    fields: [
      { field: 'unit_price', name: '单价', sort: 1 },
      { field: 'total_amount', name: '金额', sort: 2 },
    ]
  },
  {
    page_code: 'purchase-orders',
    fields: [
      { field: 'unit_price', name: '单价', sort: 1 },
      { field: 'total_amount', name: '金额', sort: 2 },
    ]
  },
  {
    page_code: 'outsourcing-orders',
    fields: [
      { field: 'unit_price', name: '单价', sort: 1 },
      { field: 'total_amount', name: '金额', sort: 2 },
    ]
  },
  {
    page_code: 'shipping-orders',
    fields: [
      { field: 'unit_price', name: '单价', sort: 1 },
      { field: 'total_amount', name: '金额', sort: 2 },
      { field: 'freight', name: '运费', sort: 3 },
    ]
  },
  {
    page_code: 'stock-ins',
    fields: [
      { field: 'unit_price', name: '单价', sort: 1 },
      { field: 'total_amount', name: '金额', sort: 2 },
    ]
  },
  {
    page_code: 'sales-prices',
    fields: [
      { field: 'unit_price', name: '单价', sort: 1 },
      { field: 'price', name: '价格', sort: 2 },
    ]
  },
  {
    page_code: 'purchase-prices',
    fields: [
      { field: 'unit_price', name: '单价', sort: 1 },
      { field: 'price', name: '价格', sort: 2 },
    ]
  },
  {
    page_code: 'piece-rate-prices',
    fields: [
      { field: 'unit_price', name: '单价', sort: 1 },
      { field: 'price', name: '价格', sort: 2 },
    ]
  },
  {
    page_code: 'return-orders',
    fields: [
      { field: 'unit_price', name: '单价', sort: 1 },
      { field: 'total_amount', name: '金额', sort: 2 },
    ]
  },
];

export async function up() {
  console.log('开始迁移040：新增操作级权限和字段级权限...');

  // 1. 获取所有现有的 page 类型权限
  const pages: any[] = await sequelize.query(
    `SELECT id, permission_code FROM permission WHERE permission_type = 'page' AND status = N'启用' ORDER BY sort_order, id`,
    { type: 'SELECT' as any }
  );
  console.log(`  找到 ${pages.length} 个页面权限`);

  // 2. 获取 admin 角色 ID
  const adminRoles: any[] = await sequelize.query(
    `SELECT id FROM role WHERE role_code = 'admin' AND status = N'启用'`,
    { type: 'SELECT' as any }
  );
  const adminRoleId = adminRoles.length > 0 ? adminRoles[0].id : null;

  let insertedOps = 0;
  let insertedFields = 0;

  // 3. 为每个页面插入标准操作权限
  for (const page of pages) {
    for (const op of STANDARD_OPERATIONS) {
      const code = `${page.permission_code}:${op.action}`;
      
      // 检查是否已存在
      const existing: any[] = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = :code`,
        { replacements: { code }, type: 'SELECT' as any }
      );
      if (existing.length > 0) continue;

      await sequelize.query(
        `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, sort_order, status)
         VALUES (:name, :code, N'operation', :parentId, :sort, N'启用')`,
        { replacements: { name: op.name, code, parentId: page.id, sort: op.sort } }
      );
      insertedOps++;

      // 自动分配给 admin 角色
      if (adminRoleId) {
        const [newPerm]: any[] = await sequelize.query(
          `SELECT id FROM permission WHERE permission_code = :code`,
          { replacements: { code }, type: 'SELECT' as any }
        );
        if (newPerm) {
          await sequelize.query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
            { replacements: { rid: adminRoleId, pid: newPerm.id } }
          );
        }
      }
    }

    // 审批操作
    if (APPROVAL_PAGES.includes(page.permission_code)) {
      const code = `${page.permission_code}:approve`;
      const existing: any[] = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = :code`,
        { replacements: { code }, type: 'SELECT' as any }
      );
      if (existing.length === 0) {
        await sequelize.query(
          `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, sort_order, status)
           VALUES (N'审批', :code, N'operation', :parentId, 6, N'启用')`,
          { replacements: { code, parentId: page.id } }
        );
        insertedOps++;
        if (adminRoleId) {
          const [newPerm]: any[] = await sequelize.query(
            `SELECT id FROM permission WHERE permission_code = :code`,
            { replacements: { code }, type: 'SELECT' as any }
          );
          if (newPerm) {
            await sequelize.query(
              `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
              { replacements: { rid: adminRoleId, pid: newPerm.id } }
            );
          }
        }
      }
    }

    // 导入操作
    if (IMPORT_PAGES.includes(page.permission_code)) {
      const code = `${page.permission_code}:import`;
      const existing: any[] = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = :code`,
        { replacements: { code }, type: 'SELECT' as any }
      );
      if (existing.length === 0) {
        await sequelize.query(
          `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, sort_order, status)
           VALUES (N'导入', :code, N'operation', :parentId, 7, N'启用')`,
          { replacements: { code, parentId: page.id } }
        );
        insertedOps++;
        if (adminRoleId) {
          const [newPerm]: any[] = await sequelize.query(
            `SELECT id FROM permission WHERE permission_code = :code`,
            { replacements: { code }, type: 'SELECT' as any }
          );
          if (newPerm) {
            await sequelize.query(
              `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
              { replacements: { rid: adminRoleId, pid: newPerm.id } }
            );
          }
        }
      }
    }
  }

  // 4. 为指定页面插入字段级权限
  for (const fp of FIELD_PERMISSIONS) {
    // 找到对应页面
    const pageRow = pages.find(p => p.permission_code === fp.page_code);
    if (!pageRow) {
      console.log(`  警告: 未找到页面 ${fp.page_code}，跳过字段权限`);
      continue;
    }

    for (const field of fp.fields) {
      const code = `${fp.page_code}:field:${field.field}`;
      
      const existing: any[] = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = :code`,
        { replacements: { code }, type: 'SELECT' as any }
      );
      if (existing.length > 0) continue;

      await sequelize.query(
        `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, sort_order, status)
         VALUES (:name, :code, N'field', :parentId, :sort, N'启用')`,
        { replacements: { name: field.name, code, parentId: pageRow.id, sort: 100 + field.sort } }
      );
      insertedFields++;

      // 自动分配给 admin 角色
      if (adminRoleId) {
        const [newPerm]: any[] = await sequelize.query(
          `SELECT id FROM permission WHERE permission_code = :code`,
          { replacements: { code }, type: 'SELECT' as any }
        );
        if (newPerm) {
          await sequelize.query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
            { replacements: { rid: adminRoleId, pid: newPerm.id } }
          );
        }
      }
    }
  }

  // 5. 给 manager 角色也分配所有新增的操作和字段权限（除系统设置模块外）
  const managerRoles: any[] = await sequelize.query(
    `SELECT id FROM role WHERE role_code = 'manager' AND status = N'启用'`,
    { type: 'SELECT' as any }
  );
  if (managerRoles.length > 0) {
    const managerId = managerRoles[0].id;
    // 获取系统设置模块下的所有权限ID
    const systemPerms: any[] = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code IN ('system', 'users', 'departments', 'workflow')
       OR permission_code LIKE 'users:%' OR permission_code LIKE 'departments:%' OR permission_code LIKE 'workflow:%'`,
      { type: 'SELECT' as any }
    );
    const systemPermIds = new Set(systemPerms.map((p: any) => p.id));

    // 获取所有新增的操作和字段权限
    const newPerms: any[] = await sequelize.query(
      `SELECT id FROM permission WHERE permission_type IN (N'operation', N'field') AND status = N'启用'`,
      { type: 'SELECT' as any }
    );

    for (const perm of newPerms) {
      if (systemPermIds.has(perm.id)) continue;
      // 检查是否已存在
      const existing: any[] = await sequelize.query(
        `SELECT id FROM role_permission WHERE role_id = :rid AND permission_id = :pid`,
        { replacements: { rid: managerId, pid: perm.id }, type: 'SELECT' as any }
      );
      if (existing.length === 0) {
        await sequelize.query(
          `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
          { replacements: { rid: managerId, pid: perm.id } }
        );
      }
    }
    console.log(`  manager 角色已分配操作和字段权限`);
  }

  console.log(`  插入操作权限: ${insertedOps} 条`);
  console.log(`  插入字段权限: ${insertedFields} 条`);
  console.log('迁移040完成');
}

// 直接运行
if (require.main === module) {
  up().then(() => process.exit(0)).catch(err => {
    console.error('迁移失败:', err);
    process.exit(1);
  });
}
