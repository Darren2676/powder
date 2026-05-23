import { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
  // 1. 查找质量管理父菜单ID
  const qualityParentResult = await pool.query(`
    SELECT id FROM permission
    WHERE permission_code = 'quality' OR menu_key = 'quality-management'
    LIMIT 1
  `);

  const qualityParentId = qualityParentResult.rows.length > 0 ? qualityParentResult.rows[0].id : null;

  // 2. 查找质量报表父菜单ID（如果存在）
  const reportParentResult = await pool.query(`
    SELECT id FROM permission
    WHERE permission_code = 'quality-report-menu' OR menu_key = 'quality-report-menu'
    LIMIT 1
  `);

  const reportParentId = reportParentResult.rows.length > 0 ? reportParentResult.rows[0].id : qualityParentId;

  // 3. 插入报废质量统计分析菜单
  await pool.query(`
    INSERT INTO permission (
      permission_name,
      permission_type,
      route_path,
      menu_key,
      parent_id,
      sort_order,
      icon,
      is_menu,
      status,
      created_at
    )
    SELECT
      $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM permission WHERE menu_key = $4
    )
  `, [
    '报废质量统计分析',
    'menu',
    '/quality/scrap-quality-stats',
    'scrap-quality-stats',
    reportParentId,
    10,
    'BarChartOutlined',
    true,
    'enabled'
  ]);

  // 4. 为新菜单创建权限记录
  const newMenuResult = await pool.query(`
    SELECT id FROM permission WHERE menu_key = 'scrap-quality-stats' LIMIT 1
  `);

  if (newMenuResult.rows.length > 0) {
    const menuId = newMenuResult.rows[0].id;

    // 5. 为admin角色授权
    await pool.query(`
      INSERT INTO role_permission (role_id, permission_id)
      SELECT r.id, $1
      FROM role r
      WHERE r.role_code = 'admin'
      AND NOT EXISTS (
        SELECT 1 FROM role_permission WHERE role_id = r.id AND permission_id = $1
      )
    `, [menuId]);

    // 6. 为manager角色授权（如果需要）
    await pool.query(`
      INSERT INTO role_permission (role_id, permission_id)
      SELECT r.id, $1
      FROM role r
      WHERE r.role_code = 'manager'
      AND NOT EXISTS (
        SELECT 1 FROM role_permission WHERE role_id = r.id AND permission_id = $1
      )
    `, [menuId]);
  }

  console.log('✅ 报废质量统计分析菜单已添加并授权');
}

export async function down(pool: Pool): Promise<void> {
  // 删除角色权限关联
  await pool.query(`
    DELETE FROM role_permission
    WHERE permission_id IN (
      SELECT id FROM permission WHERE menu_key = 'scrap-quality-stats'
    )
  `);

  // 删除菜单
  await pool.query(`
    DELETE FROM permission WHERE menu_key = 'scrap-quality-stats'
  `);

  console.log('✅ 报废质量统计分析菜单已删除');
}
