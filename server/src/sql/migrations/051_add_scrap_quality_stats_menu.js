-- Add scrap quality statistics menu permission
-- Run this script in XYMES database to add the menu for scrap quality statistics report

-- First, find the parent menu ID for "质量管理" (quality management)
-- Typically quality-related menus have a parent, let's find it
DECLARE @QualityParentId INT;
SELECT TOP 1 @QualityParentId = id
FROM permission
WHERE menu_key = 'quality' OR permission_name = N'质量管理';

-- If quality parent not found, use the top-level parent (id = NULL or find appropriate parent)
-- For now, we'll insert assuming it's under quality management

-- Insert the scrap quality statistics menu
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
    creation_date
)
SELECT
    N'报废质量统计分析',
    'menu',
    '/quality/scrap-quality-stats',
    'scrap-quality-stats',
    ISNULL(@QualityParentId, NULL),  -- Use quality parent if found, else NULL (top-level)
    50,
    'BarChartOutlined',
    1,
    'enabled',
    GETDATE()
WHERE NOT EXISTS (
    SELECT 1 FROM permission WHERE menu_key = 'scrap-quality-stats'
);

-- Verify the insert
SELECT id, permission_name, menu_key, route_path, parent_id
FROM permission
WHERE menu_key = 'scrap-quality-stats';
