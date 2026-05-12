/**
 * 委外全流程菜单配置迁移
 * 添加委外发料、委外收回、委外质检、委外结算菜单
 */
import sequelize from '@/config/database'

export async function up(): Promise<void> {
  console.log('开始执行委外菜单迁移...')

  try {
    // 查找或创建"委外管理"父菜单
    const [parentMenus]: any = await sequelize.query(`
      SELECT id FROM menus WHERE menu_name = N'outsourcing' OR title = N'委外管理'
    `)

    let parentMenuId: number

    if (parentMenus.length === 0) {
      // 创建父菜单
      const [result]: any = await sequelize.query(`
        INSERT INTO menus (
          menu_name, title, parent_id, sort_order, icon, menu_type, 
          path, component, is_visible, status, creation_date, creation_man
        ) VALUES (
          N'outsourcing', N'委外管理', NULL, 60, N'SwapOutlined', N'directory',
          N'/outsourcing', NULL, 1, 1, FORMAT(GETDATE(), 'yyyy/MM/dd HH:mm'), N'system'
        );
        SELECT SCOPE_IDENTITY() as id
      `)
      parentMenuId = result[0].id
      console.log(`✓ 已创建委外管理父菜单，ID: ${parentMenuId}`)
    } else {
      parentMenuId = parentMenus[0].id
      console.log(`- 委外管理父菜单已存在，ID: ${parentMenuId}`)
    }

    // 定义子菜单配置
    const subMenus = [
      {
        menu_name: 'outsourcing-issue',
        title: '委外发料',
        sort_order: 1,
        icon: 'SendOutlined',
        path: '/outsourcing/issue',
        component: 'views/production/OutsourcingIssue/List'
      },
      {
        menu_name: 'outsourcing-receipt',
        title: '委外收回',
        sort_order: 2,
        icon: 'ReturnOutlined',
        path: '/outsourcing/receipt',
        component: 'views/production/OutsourcingReceipt/List'
      },
      {
        menu_name: 'outsourcing-inspection',
        title: '委外质检',
        sort_order: 3,
        icon: 'SearchOutlined',
        path: '/outsourcing/inspection',
        component: 'views/production/OutsourcingInspection/List'
      },
      {
        menu_name: 'outsourcing-settlement',
        title: '委外结算',
        sort_order: 4,
        icon: 'DollarOutlined',
        path: '/outsourcing/settlement',
        component: 'views/production/OutsourcingSettlement/List'
      }
    ]

    // 添加子菜单
    for (const menu of subMenus) {
      const [existing]: any = await sequelize.query(`
        SELECT id FROM menus WHERE menu_name = :menu_name AND parent_id = :parent_id
      `, {
        replacements: { menu_name: menu.menu_name, parent_id: parentMenuId }
      })

      if (existing.length === 0) {
        await sequelize.query(`
          INSERT INTO menus (
            menu_name, title, parent_id, sort_order, icon, menu_type,
            path, component, is_visible, status, creation_date, creation_man
          ) VALUES (
            :menu_name, :title, :parent_id, :sort_order, :icon, N'menu',
            :path, :component, 1, 1, FORMAT(GETDATE(), 'yyyy/MM/dd HH:mm'), N'system'
          )
        `, {
          replacements: {
            menu_name: menu.menu_name,
            title: menu.title,
            parent_id: parentMenuId,
            sort_order: menu.sort_order,
            icon: menu.icon,
            path: menu.path,
            component: menu.component
          }
        })
        console.log(`✓ 已添加${menu.title}菜单`)
      } else {
        console.log(`- ${menu.title}菜单已存在`)
      }
    }

    console.log('委外菜单迁移完成！')
  } catch (error) {
    console.error('委外菜单迁移失败:', error)
    throw error
  }
}

export async function down(): Promise<void> {
  console.log('开始回滚委外菜单迁移...')

  try {
    // 删除子菜单
    await sequelize.query(`
      DELETE FROM menus WHERE menu_name IN (
        N'outsourcing-issue',
        N'outsourcing-receipt',
        N'outsourcing-inspection',
        N'outsourcing-settlement'
      )
    `)
    console.log('✓ 已删除委外子菜单')

    // 删除父菜单
    await sequelize.query(`
      DELETE FROM menus WHERE menu_name = N'outsourcing'
    `)
    console.log('✓ 已删除委外管理父菜单')

    console.log('委外菜单回滚完成！')
  } catch (error) {
    console.error('委外菜单回滚失败:', error)
    throw error
  }
}
