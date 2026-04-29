-- ============================================
-- 委外全流程菜单配置脚本
-- 执行时间: 2026-04-29
-- 说明: 添加委外发料、委外收回、委外质检、委外结算菜单
-- ============================================

-- 查找"委外管理"父菜单ID
DECLARE @ParentMenuId INT;
SELECT @ParentMenuId = id FROM menus WHERE menu_name = N'委外管理' OR title = N'委外管理';

-- 如果不存在父菜单，则创建
IF @ParentMenuId IS NULL
BEGIN
    INSERT INTO menus (
        menu_name, 
        title, 
        parent_id, 
        sort_order, 
        icon, 
        menu_type, 
        path, 
        component, 
        is_visible, 
        status, 
        creation_date, 
        creation_man
    ) VALUES (
        N'outsourcing', 
        N'委外管理', 
        NULL, 
        60, 
        N'SwapOutlined', 
        N'directory', 
        N'/outsourcing', 
        NULL, 
        1, 
        1, 
        FORMAT(GETDATE(), 'yyyy/MM/dd HH:mm'), 
        N'system'
    );
    
    SET @ParentMenuId = SCOPE_IDENTITY();
    PRINT N'已创建委外管理父菜单，ID: ' + CAST(@ParentMenuId AS VARCHAR);
END
ELSE
BEGIN
    PRINT N'委外管理父菜单已存在，ID: ' + CAST(@ParentMenuId AS VARCHAR);
END

-- ============================================
-- 1. 委外发料菜单
-- ============================================
IF NOT EXISTS (SELECT 1 FROM menus WHERE menu_name = N'outsourcing-issue' AND parent_id = @ParentMenuId)
BEGIN
    INSERT INTO menus (
        menu_name, 
        title, 
        parent_id, 
        sort_order, 
        icon, 
        menu_type, 
        path, 
        component, 
        is_visible, 
        status, 
        creation_date, 
        creation_man
    ) VALUES (
        N'outsourcing-issue', 
        N'委外发料', 
        @ParentMenuId, 
        1, 
        N'SendOutlined', 
        N'menu', 
        N'/outsourcing/issue', 
        N'views/production/OutsourcingIssue/List', 
        1, 
        1, 
        FORMAT(GETDATE(), 'yyyy/MM/dd HH:mm'), 
        N'system'
    );
    PRINT N'✓ 已添加委外发料菜单';
END
ELSE
BEGIN
    PRINT N'- 委外发料菜单已存在';
END

-- ============================================
-- 2. 委外收回菜单
-- ============================================
IF NOT EXISTS (SELECT 1 FROM menus WHERE menu_name = N'outsourcing-receipt' AND parent_id = @ParentMenuId)
BEGIN
    INSERT INTO menus (
        menu_name, 
        title, 
        parent_id, 
        sort_order, 
        icon, 
        menu_type, 
        path, 
        component, 
        is_visible, 
        status, 
        creation_date, 
        creation_man
    ) VALUES (
        N'outsourcing-receipt', 
        N'委外收回', 
        @ParentMenuId, 
        2, 
        N'ReturnOutlined', 
        N'menu', 
        N'/outsourcing/receipt', 
        N'views/production/OutsourcingReceipt/List', 
        1, 
        1, 
        FORMAT(GETDATE(), 'yyyy/MM/dd HH:mm'), 
        N'system'
    );
    PRINT N'✓ 已添加委外收回菜单';
END
ELSE
BEGIN
    PRINT N'- 委外收回菜单已存在';
END

-- ============================================
-- 3. 委外质检菜单
-- ============================================
IF NOT EXISTS (SELECT 1 FROM menus WHERE menu_name = N'outsourcing-inspection' AND parent_id = @ParentMenuId)
BEGIN
    INSERT INTO menus (
        menu_name, 
        title, 
        parent_id, 
        sort_order, 
        icon, 
        menu_type, 
        path, 
        component, 
        is_visible, 
        status, 
        creation_date, 
        creation_man
    ) VALUES (
        N'outsourcing-inspection', 
        N'委外质检', 
        @ParentMenuId, 
        3, 
        N'SearchOutlined', 
        N'menu', 
        N'/outsourcing/inspection', 
        N'views/production/OutsourcingInspection/List', 
        1, 
        1, 
        FORMAT(GETDATE(), 'yyyy/MM/dd HH:mm'), 
        N'system'
    );
    PRINT N'✓ 已添加委外质检菜单';
END
ELSE
BEGIN
    PRINT N'- 委外质检菜单已存在';
END

-- ============================================
-- 4. 委外结算菜单
-- ============================================
IF NOT EXISTS (SELECT 1 FROM menus WHERE menu_name = N'outsourcing-settlement' AND parent_id = @ParentMenuId)
BEGIN
    INSERT INTO menus (
        menu_name, 
        title, 
        parent_id, 
        sort_order, 
        icon, 
        menu_type, 
        path, 
        component, 
        is_visible, 
        status, 
        creation_date, 
        creation_man
    ) VALUES (
        N'outsourcing-settlement', 
        N'委外结算', 
        @ParentMenuId, 
        4, 
        N'DollarOutlined', 
        N'menu', 
        N'/outsourcing/settlement', 
        N'views/production/OutsourcingSettlement/List', 
        1, 
        1, 
        FORMAT(GETDATE(), 'yyyy/MM/dd HH:mm'), 
        N'system'
    );
    PRINT N'✓ 已添加委外结算菜单';
END
ELSE
BEGIN
    PRINT N'- 委外结算菜单已存在';
END

-- ============================================
-- 查询结果
-- ============================================
PRINT N'';
PRINT N'========================================';
PRINT N'委外全流程菜单配置完成！';
PRINT N'========================================';
PRINT N'';

SELECT 
    id,
    menu_name,
    title,
    parent_id,
    sort_order,
    path,
    component
FROM menus 
WHERE parent_id = @ParentMenuId OR id = @ParentMenuId
ORDER BY sort_order;
