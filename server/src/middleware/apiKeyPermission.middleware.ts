import { Request, Response, NextFunction } from 'express';

// 权限模块与字段的映射
const PERMISSION_MAP: Record<string, { read: string; write: string }> = {
  order: { read: 'perm_order_read', write: 'perm_order_write' },
  work_report: { read: 'perm_work_report_read', write: 'perm_work_report_write' },
  prep: { read: 'perm_prep_read', write: 'perm_prep_write' },
  bom: { read: 'perm_bom_read', write: 'perm_bom_write' }
};

type PermissionAction = 'read' | 'write';

// 权限检查中间件工厂函数
export const requirePermission = (module: string, action: PermissionAction) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      return res.status(401).json({ success: false, message: '未提供API密钥' });
    }

    const permConfig = PERMISSION_MAP[module];
    if (!permConfig) {
      return res.status(500).json({ success: false, message: `未知的权限模块: ${module}` });
    }

    const fieldName = permConfig[action];
    if (!fieldName) {
      return res.status(500).json({ success: false, message: `未知的权限操作: ${action}` });
    }

    // BIT字段在SQL Server中为 true/false (通过Sequelize查询)
    const hasPermission = req.apiKey[fieldName] === true || req.apiKey[fieldName] === 1;

    if (!hasPermission) {
      const moduleName = module === 'order' ? '生产工单'
        : module === 'work_report' ? '工序报工'
        : module === 'prep' ? '按工序备料'
        : module === 'bom' ? '设计BOM'
        : module;
      const actionName = action === 'read' ? '读取' : '写入';
      return res.status(403).json({ success: false, message: `无权限: 缺少 ${moduleName} ${actionName} 权限` });
    }

    next();
  };
};
