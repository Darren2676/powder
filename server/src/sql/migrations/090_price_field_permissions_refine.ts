/**
 * 迁移090：精化价格/金额字段权限
 * 
 * 将 sales-prices / piece-rate-prices / standard-costs 三个页面的字段权限
 * 从旧的不精确字段（unit_price / price）替换为实际表格中的精确字段名。
 * 
 * 变更明细：
 * - sales-prices: 删除 unit_price/price，新增 tax_inclusive_price/tax_exclusive_price/tax_rate/min_price_inclusive/min_price_exclusive
 * - piece-rate-prices: 删除 unit_price/price，新增 qualified_piece_rate/defective_piece_rate
 * - standard-costs: 删除 price，保留 standard_cost/actual_cost
 * 
 * 同时为 admin/manager 角色自动分配新的字段权限。
 */

import sequelize from '../../config/database';

// 旧的字段权限码（需要删除）
const OLD_FIELD_CODES = [
  'sales-prices:field:unit_price',
  'sales-prices:field:price',
  'piece-rate-prices:field:unit_price',
  'piece-rate-prices:field:price',
  'standard-costs:field:price',
];

// 新的字段权限定义
const NEW_FIELD_PERMISSIONS: Array<{
  page_code: string;
  fields: Array<{ field: string; name: string; sort: number }>;
}> = [
  {
    page_code: 'sales-prices',
    fields: [
      { field: 'tax_inclusive_price', name: '含税单价', sort: 1 },
      { field: 'tax_exclusive_price', name: '未税单价', sort: 2 },
      { field: 'tax_rate', name: '税率', sort: 3 },
      { field: 'min_price_inclusive', name: '含税最低价', sort: 4 },
      { field: 'min_price_exclusive', name: '不含税最低价', sort: 5 },
    ]
  },
  {
    page_code: 'piece-rate-prices',
    fields: [
      { field: 'qualified_piece_rate', name: '合格品计件单价', sort: 1 },
      { field: 'defective_piece_rate', name: '次品计件单价', sort: 2 },
    ]
  },
  {
    page_code: 'standard-costs',
    fields: [
      { field: 'standard_cost', name: '标准成本单价', sort: 1 },
      { field: 'actual_cost', name: '实际成本', sort: 2 },
    ]
  },
];

export async function up() {
  console.log('开始迁移090：精化价格/金额字段权限...');

  // 1. 删除旧的字段权限（先删 role_permission 再删 permission）
  for (const code of OLD_FIELD_CODES) {
    const existing: any[] = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = :code`,
      { replacements: { code }, type: 'SELECT' as any }
    );
    if (existing.length > 0) {
      // 删除角色-权限关联
      await sequelize.query(
        `DELETE FROM role_permission WHERE permission_id = :pid`,
        { replacements: { pid: existing[0].id } }
      );
      // 删除权限本身
      await sequelize.query(
        `DELETE FROM permission WHERE id = :pid`,
        { replacements: { pid: existing[0].id } }
      );
      console.log(`  已删除旧字段权限: ${code}`);
    }
  }

  // 2. 获取所有现有的 page/menu 类型权限（standard-costs 在数据库中是 menu 类型而非 page）
  const pages: any[] = await sequelize.query(
    `SELECT id, permission_code FROM permission WHERE permission_type IN (N'page', N'menu') AND status = N'启用'`,
    { type: 'SELECT' as any }
  );

  // 3. 获取角色ID
  const roles: any[] = await sequelize.query(
    `SELECT id, role_code FROM role WHERE role_code IN ('admin', 'manager') AND status = N'启用'`,
    { type: 'SELECT' as any }
  );
  const adminRole = roles.find((r: any) => r.role_code === 'admin');
  const managerRole = roles.find((r: any) => r.role_code === 'manager');

  let insertedCount = 0;

  // 4. 插入新的字段权限
  for (const fp of NEW_FIELD_PERMISSIONS) {
    const pageRow = pages.find((p: any) => p.permission_code === fp.page_code);
    if (!pageRow) {
      console.log(`  警告: 未找到页面 ${fp.page_code}，跳过`);
      continue;
    }

    for (const field of fp.fields) {
      const code = `${fp.page_code}:field:${field.field}`;

      // 检查是否已存在（幂等）
      const existing: any[] = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = :code`,
        { replacements: { code }, type: 'SELECT' as any }
      );
      if (existing.length > 0) {
        console.log(`  字段权限已存在，跳过: ${code}`);
        continue;
      }

      // 插入权限
      await sequelize.query(
        `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, sort_order, status)
         VALUES (:name, :code, N'field', :parentId, :sort, N'启用')`,
        { replacements: { name: field.name, code, parentId: pageRow.id, sort: 100 + field.sort } }
      );

      // 获取新插入的权限ID
      const [newPerm]: any[] = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = :code`,
        { replacements: { code }, type: 'SELECT' as any }
      );

      // 分配给 admin 角色
      if (adminRole && newPerm) {
        const dupCheck: any[] = await sequelize.query(
          `SELECT id FROM role_permission WHERE role_id = :rid AND permission_id = :pid`,
          { replacements: { rid: adminRole.id, pid: newPerm.id }, type: 'SELECT' as any }
        );
        if (dupCheck.length === 0) {
          await sequelize.query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
            { replacements: { rid: adminRole.id, pid: newPerm.id } }
          );
        }
      }

      // 分配给 manager 角色
      if (managerRole && newPerm) {
        const dupCheck: any[] = await sequelize.query(
          `SELECT id FROM role_permission WHERE role_id = :rid AND permission_id = :pid`,
          { replacements: { rid: managerRole.id, pid: newPerm.id }, type: 'SELECT' as any }
        );
        if (dupCheck.length === 0) {
          await sequelize.query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
            { replacements: { rid: managerRole.id, pid: newPerm.id } }
          );
        }
      }

      insertedCount++;
      console.log(`  新增字段权限: ${code} (${field.name})`);
    }
  }

  console.log(`  新增字段权限: ${insertedCount} 条`);
  console.log('迁移090完成');
}

// 直接运行
if (require.main === module) {
  up().then(() => process.exit(0)).catch(err => {
    console.error('迁移失败:', err);
    process.exit(1);
  });
}
