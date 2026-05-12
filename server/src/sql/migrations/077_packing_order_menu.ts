import sequelize from '@/config/database'

export async function up(): Promise<void> {
  console.log('开始执行装箱管理菜单迁移...')

  try {
    // 查找"成品仓"父菜单
    const parentMenus: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'finished-goods-management'`,
      { type: 'SELECT' }
    )

    if (parentMenus.length === 0) {
      console.log('未找到成品仓父菜单 (finished-goods-management)，跳过')
      return
    }

    const parentId = parentMenus[0].id
    console.log(`成品仓父菜单已存在，ID: ${parentId}`)

    // 添加"装箱管理"页面权限
    const existing: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'fg-packing-orders'`,
      { type: 'SELECT' }
    )

    if (existing.length === 0) {
      await sequelize.query(
        `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, icon, sort_order, status)
         VALUES (N'装箱管理', N'fg-packing-orders', N'page', :parentId, N'fg-packing-orders', N'/fg-packing-orders', N'InboxOutlined', 10, N'启用')`,
        { replacements: { parentId } }
      )
      console.log('✓ 已添加装箱管理菜单权限')
    } else {
      console.log('- 装箱管理菜单权限已存在')
    }

    // 重新查询获取权限ID
    const permRows: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'fg-packing-orders'`,
      { type: 'SELECT' }
    )
    const permId = permRows.length > 0 ? permRows[0].id : null

    // 给管理员角色赋予新菜单权限
    if (permId) {
      const adminRoles: any = await sequelize.query(
        `SELECT id FROM role WHERE role_name = N'管理员' OR role_name = N'admin'`,
        { type: 'SELECT' }
      )
      for (const role of adminRoles) {
        const existingRP: any = await sequelize.query(
          `SELECT id FROM role_permission WHERE role_id = :roleId AND permission_id = :permId`,
          { replacements: { roleId: role.id, permId }, type: 'SELECT' }
        )
        if (existingRP.length === 0) {
          await sequelize.query(
            `INSERT INTO role_permission (role_id, permission_id) VALUES (:roleId, :permId)`,
            { replacements: { roleId: role.id, permId } }
          )
          console.log(`✓ 已为角色 ID=${role.id} 添加装箱管理权限`)
        }
      }
    }

    console.log('装箱管理菜单迁移完成！')
  } catch (error) {
    console.error('装箱管理菜单迁移失败:', error)
    throw error
  }
}

export async function down(): Promise<void> {
  console.log('开始回滚装箱管理菜单迁移...')
  try {
    await sequelize.query(`DELETE FROM role_permission WHERE permission_id IN (SELECT id FROM permission WHERE permission_code = N'fg-packing-orders')`)
    await sequelize.query(`DELETE FROM permission WHERE permission_name = N'fg-packing-orders' OR permission_code = N'fg-packing-orders'`)
    console.log('✓ 已删除装箱管理菜单权限')
    console.log('装箱管理菜单回滚完成！')
  } catch (error) {
    console.error('装箱管理菜单回滚失败:', error)
    throw error
  }
}
