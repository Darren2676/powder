import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';

// ==================== Module Registry ====================
const moduleConfig: Record<string, { tableName: string; primaryKey: string; displayName: string }> = {
  'routing_header':  { tableName: 'routing_header',  primaryKey: 'process_route_number',   displayName: '工艺路线' },
  'production_task': { tableName: 'production_task',  primaryKey: 'production_task_number', displayName: '生产任务单' },
  'Production_plan': { tableName: 'Production_plan',  primaryKey: 'production_number',      displayName: '生产计划' },
  'bom_header':      { tableName: 'bom_header',       primaryKey: 'bom_number',             displayName: 'BOM物料清单' }
};

const getModuleConfig = (module: string) => {
  const config = moduleConfig[module];
  if (!config) return null;
  return config;
};

// ==================== Submit for Approval ====================
export const submitForApproval = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { module, record_id, remark } = req.body;
    const config = getModuleConfig(module);
    if (!config) { res.status(400).json({ success: false, message: '无效的模块标识' }); return; }
    if (!record_id) { res.status(400).json({ success: false, message: '记录ID不能为空' }); return; }

    const user = (req as any).user;
    const transaction = await sequelize.transaction();
    try {
      // Check current status with optimistic lock
      const [rows]: any = await sequelize.query(
        `UPDATE ${config.tableName} SET approval_status = N'待审批' WHERE ${config.primaryKey} = :record_id AND approval_status = N'草稿'`,
        { replacements: { record_id }, transaction }
      );
      const affected = (rows as any)?.length !== undefined ? (rows as any).length : ((rows as any)?.rowCount ?? (rows as any)?.[0]?.affectedRows ?? 1);
      // MSSQL returns metadata; check via re-query
      const [check]: any = await sequelize.query(
        `SELECT approval_status FROM ${config.tableName} WHERE ${config.primaryKey} = :record_id`,
        { replacements: { record_id }, transaction }
      );
      if (!check.length) { await transaction.rollback(); res.status(404).json({ success: false, message: '记录不存在' }); return; }
      if (check[0].approval_status !== '待审批') { await transaction.rollback(); res.status(400).json({ success: false, message: '当前状态不允许提交审批，只有草稿状态可以提交' }); return; }

      // Insert approval log
      await sequelize.query(
        `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark) VALUES (:module, :record_id, 'submit', N'草稿', N'待审批', :operator_id, :operator_name, :remark)`,
        { replacements: { module, record_id, operator_id: user.id, operator_name: user.username, remark: remark || null }, transaction }
      );

      // Notify managers and admins
      const [managers]: any = await sequelize.query(
        `SELECT id, username FROM users WHERE role IN ('manager', 'admin') AND status = 'active'`,
        { transaction }
      );
      for (const mgr of managers) {
        await sequelize.query(
          `INSERT INTO notifications (user_id, type, title, content, is_read, created_at) VALUES (:user_id, 'approval_pending', :title, :content, 0, GETDATE())`,
          { replacements: { user_id: mgr.id, title: `${config.displayName}待审批`, content: `${user.username} 提交了${config.displayName} [${record_id}] 的审批申请` }, transaction }
        );
      }

      await transaction.commit();
      res.json(success(null, '提交审批成功'));
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

// ==================== Approve ====================
export const approve = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { module, record_id, remark } = req.body;
    const config = getModuleConfig(module);
    if (!config) { res.status(400).json({ success: false, message: '无效的模块标识' }); return; }
    if (!record_id) { res.status(400).json({ success: false, message: '记录ID不能为空' }); return; }

    const user = (req as any).user;
    const transaction = await sequelize.transaction();
    try {
      // Update with optimistic lock
      await sequelize.query(
        `UPDATE ${config.tableName} SET approval_status = N'已审批' WHERE ${config.primaryKey} = :record_id AND approval_status = N'待审批'`,
        { replacements: { record_id }, transaction }
      );
      const [check]: any = await sequelize.query(
        `SELECT approval_status FROM ${config.tableName} WHERE ${config.primaryKey} = :record_id`,
        { replacements: { record_id }, transaction }
      );
      if (!check.length) { await transaction.rollback(); res.status(404).json({ success: false, message: '记录不存在' }); return; }
      if (check[0].approval_status !== '已审批') { await transaction.rollback(); res.status(400).json({ success: false, message: '当前状态不允许审批，只有待审批状态可以审批' }); return; }

      // Insert approval log
      await sequelize.query(
        `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark) VALUES (:module, :record_id, 'approve', N'待审批', N'已审批', :operator_id, :operator_name, :remark)`,
        { replacements: { module, record_id, operator_id: user.id, operator_name: user.username, remark: remark || null }, transaction }
      );

      // Notify the submitter
      const [submitLog]: any = await sequelize.query(
        `SELECT TOP 1 operator_id, operator_name FROM approval_log WHERE module = :module AND record_id = :record_id AND action = 'submit' ORDER BY created_at DESC`,
        { replacements: { module, record_id }, transaction }
      );
      if (submitLog.length) {
        await sequelize.query(
          `INSERT INTO notifications (user_id, type, title, content, is_read, created_at) VALUES (:user_id, 'approval_result', :title, :content, 0, GETDATE())`,
          { replacements: { user_id: submitLog[0].operator_id, title: `${config.displayName}审批通过`, content: `${user.username} 审批通过了${config.displayName} [${record_id}]` }, transaction }
        );
      }

      await transaction.commit();
      res.json(success(null, '审批通过'));
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

// ==================== Reverse Approval ====================
export const reverseApproval = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { module, record_id, remark } = req.body;
    const config = getModuleConfig(module);
    if (!config) { res.status(400).json({ success: false, message: '无效的模块标识' }); return; }
    if (!record_id) { res.status(400).json({ success: false, message: '记录ID不能为空' }); return; }

    const user = (req as any).user;
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(
        `UPDATE ${config.tableName} SET approval_status = N'草稿' WHERE ${config.primaryKey} = :record_id AND approval_status = N'已审批'`,
        { replacements: { record_id }, transaction }
      );
      const [check]: any = await sequelize.query(
        `SELECT approval_status FROM ${config.tableName} WHERE ${config.primaryKey} = :record_id`,
        { replacements: { record_id }, transaction }
      );
      if (!check.length) { await transaction.rollback(); res.status(404).json({ success: false, message: '记录不存在' }); return; }
      if (check[0].approval_status !== '草稿') { await transaction.rollback(); res.status(400).json({ success: false, message: '当前状态不允许反审，只有已审批状态可以反审' }); return; }

      await sequelize.query(
        `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark) VALUES (:module, :record_id, 'reverse', N'已审批', N'草稿', :operator_id, :operator_name, :remark)`,
        { replacements: { module, record_id, operator_id: user.id, operator_name: user.username, remark: remark || null }, transaction }
      );

      // Notify original creator
      const [submitLog]: any = await sequelize.query(
        `SELECT TOP 1 operator_id FROM approval_log WHERE module = :module AND record_id = :record_id AND action = 'submit' ORDER BY created_at DESC`,
        { replacements: { module, record_id }, transaction }
      );
      if (submitLog.length) {
        await sequelize.query(
          `INSERT INTO notifications (user_id, type, title, content, is_read, created_at) VALUES (:user_id, 'approval_result', :title, :content, 0, GETDATE())`,
          { replacements: { user_id: submitLog[0].operator_id, title: `${config.displayName}已反审`, content: `${user.username} 对${config.displayName} [${record_id}] 执行了反审操作，已退回草稿` }, transaction }
        );
      }

      await transaction.commit();
      res.json(success(null, '反审成功，已退回草稿'));
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

// ==================== Withdraw ====================
export const withdraw = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { module, record_id } = req.body;
    const config = getModuleConfig(module);
    if (!config) { res.status(400).json({ success: false, message: '无效的模块标识' }); return; }
    if (!record_id) { res.status(400).json({ success: false, message: '记录ID不能为空' }); return; }

    const user = (req as any).user;

    // Verify the current user is the submitter
    const [submitLog]: any = await sequelize.query(
      `SELECT TOP 1 operator_id FROM approval_log WHERE module = :module AND record_id = :record_id AND action = 'submit' ORDER BY created_at DESC`,
      { replacements: { module, record_id } }
    );
    if (!submitLog.length || submitLog[0].operator_id !== user.id) {
      res.status(403).json({ success: false, message: '只有提交人可以撤回' });
      return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(
        `UPDATE ${config.tableName} SET approval_status = N'草稿' WHERE ${config.primaryKey} = :record_id AND approval_status = N'待审批'`,
        { replacements: { record_id }, transaction }
      );
      const [check]: any = await sequelize.query(
        `SELECT approval_status FROM ${config.tableName} WHERE ${config.primaryKey} = :record_id`,
        { replacements: { record_id }, transaction }
      );
      if (!check.length) { await transaction.rollback(); res.status(404).json({ success: false, message: '记录不存在' }); return; }
      if (check[0].approval_status !== '草稿') { await transaction.rollback(); res.status(400).json({ success: false, message: '当前状态不允许撤回，只有待审批状态可以撤回' }); return; }

      await sequelize.query(
        `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark) VALUES (:module, :record_id, 'withdraw', N'待审批', N'草稿', :operator_id, :operator_name, NULL)`,
        { replacements: { module, record_id, operator_id: user.id, operator_name: user.username }, transaction }
      );

      await transaction.commit();
      res.json(success(null, '撤回成功'));
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

// ==================== Get Approval Log ====================
export const getApprovalLog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const module = req.query.module as string;
    const record_id = req.query.record_id as string;
    if (!module || !record_id) { res.status(400).json({ success: false, message: '缺少module或record_id参数' }); return; }

    const [logs]: any = await sequelize.query(
      `SELECT * FROM approval_log WHERE module = :module AND record_id = :record_id ORDER BY created_at DESC`,
      { replacements: { module, record_id } }
    );
    res.json(success(logs, '获取审批历史成功'));
  } catch (err) { next(err); }
};
