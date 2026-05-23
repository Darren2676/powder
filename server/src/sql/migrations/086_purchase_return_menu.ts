/**
 * 采购退货菜单权限迁移
 * 在"采购订单"子菜单下添加"采购退货"页面权限
 */

import sequelize from '@/config/database'

export async function up(): Promise<void> {
  console.log('开始执行采购退货菜单迁移...')

  try {
    // 查找"采购订单"子菜单父菜单
    const parentMenus: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'purchase-order-management'`,
      { type: 'SELECT' }
    )

    if (parentMenus.length === 0) {
      console.log('未找到采购订单子菜单 (purchase-order-management)，跳过')
      return
    }

    const parentId = parentMenus[0].id
    console.log(`采购订单子菜单已存在，ID: ${parentId}`)

    // 添加"采购退货"页面权限
    const existing: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'purchase-returns'`,
      { type: 'SELECT' }
    )

    if (existing.length === 0) {
      await sequelize.query(
        `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, icon, sort_order, status)
         VALUES (N'采购退货', N'purchase-returns', N'page', :parentId, N'purchase-returns', N'/purchase-returns', N'SwapOutlined', 3, N'启用')`,
        { replacements: { parentId } }
      )
      console.log('✓ 已添加采购退货菜单权限')
    } else {
      console.log('- 采购退货菜单权限已存在')
    }

    // 重新查询获取权限ID
    const permRows: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'purchase-returns'`,
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
          console.log(`✓ 已为角色 ID=${role.id} 添加采购退货权限`)
        }
      }
    }

    console.log('采购退货菜单迁移完成！')
  } catch (error) {
    console.error('采购退货菜单迁移失败:', error)
    throw error
  }
}

export async function down(): Promise<void> {
  console.log('开始回滚采购退货菜单迁移...')
  try {
    await sequelize.query(`DELETE FROM role_permission WHERE permission_id IN (SELECT id FROM permission WHERE permission_code = N'purchase-returns')`)
    await sequelize.query(`DELETE FROM permission WHERE permission_code = N'purchase-returns'`)
    console.log('✓ 已删除采购退货菜单权限')
    console.log('采购退货菜单回滚完成！')
  } catch (error) {
    console.error('采购退货菜单回滚失败:', error)
    throw error
  }
}
