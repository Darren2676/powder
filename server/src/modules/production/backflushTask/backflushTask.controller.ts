/**
 * 倒冲任务清单 - 控制器
 */
import { Request, Response, NextFunction } from 'express';
import {
  getBackflushTasks,
  getBackflushTaskDetail,
  manualRetryDeduction,
  getBackflushSummary,
  generateBackflushTasks,
  checkBackflushReadiness,
} from '@/services/backflushTask.service';
import sequelize from '@/config/database';
import { success } from '../../../utils/response.util';
import { BusinessError } from '@/shared/errors/BusinessError';
import { withTransaction } from '@/shared/db/withTransaction';
import { getFactoryId, getFactoryCode } from '../../../utils/factoryWhere.util';

// ==================== 列表查询 ====================
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    const result = await getBackflushTasks({ ...req.query, _factoryId: effectiveFactoryId ?? undefined });
    res.json(success(result));
  } catch (err) { next(err); }
};

// ==================== 详情查询 ====================
export const detail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const result = await getBackflushTaskDetail(id);
    if (!result) {
      throw new BusinessError(404, '倒冲任务不存在');
    }
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null && result.task.factory_id !== _factoryId) {
      throw new BusinessError(404, '倒冲任务不存在');
    }
    res.json(success(result));
  } catch (err) { next(err); }
};

// ==================== 汇总查询 ====================
export const summary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderNo = (req.params.orderNo as string) || '';
    const _factoryId = getFactoryId(req);
    const result = await getBackflushSummary(orderNo, _factoryId);
    res.json(success(result));
  } catch (err) { next(err); }
};

// ==================== 手动重试扣减 ====================
export const retry = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const _factoryId = getFactoryId(req);
    // 防越权：先检查该任务是否属于当前工厂
    if (_factoryId !== null) {
      const [chk]: any = await sequelize.query(
        'SELECT id FROM backflush_task WHERE id = :id AND factory_id = :_factoryId',
        { replacements: { id, _factoryId } }
      );
      if (chk.length === 0) throw new BusinessError(404, '倒冲任务不存在');
    }
    const operator = (req as any).user?.username || '';
    const result = await manualRetryDeduction(id, operator);
    res.json(success(result, '重试完成'));
  } catch (err) { next(err); }
};

// ==================== 手动生成倒冲任务 ====================
export const generate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { production_order_numbers } = req.body;
    if (!production_order_numbers || !Array.isArray(production_order_numbers) || production_order_numbers.length === 0) {
      throw new BusinessError(400, '请选择至少一个生产单');
    }
    const username = (req as any).user?.username || '';
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const results: any[] = [];

    await withTransaction(async (transaction) => {
      for (const orderNo of production_order_numbers) {
        const [orders]: any = await sequelize.query(
          `SELECT production_order_number, item_number, item_name, specifications, basic_unit, planned_quantity, factory_id
           FROM production_order WHERE production_order_number = :orderNo${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`,
          { replacements: { orderNo, ...(_factoryId !== null ? { _factoryId } : {}) }, transaction }
        );
        if (orders.length === 0) continue;
        const order = orders[0];

        const result = await generateBackflushTasks({
          orderNumber: order.production_order_number,
          itemNumber: order.item_number,
          itemName: order.item_name,
          specifications: order.specifications,
          basicUnit: order.basic_unit,
          plannedQuantity: order.planned_quantity,
        }, username, transaction, factoryCode);
        results.push({ orderNo, ...result });
      }
    });

    res.json(success(results, '倒冲任务生成完成'));
  } catch (err) { next(err); }
};

// ==================== 入库前倒冲就绪检查 ====================
export const readiness = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderNo = (req.params.orderNo as string) || '';
    const inboundQty = parseFloat(req.query.inboundQty as string) || 0;
    if (!orderNo) {
      throw new BusinessError(400, '请提供生产单号');
    }
    const result = await checkBackflushReadiness(orderNo, inboundQty);
    res.json(success(result));
  } catch (err) { next(err); }
};

// ==================== 批量更新自动称量标记 ====================
export const updateAutoWeigh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids, auto_weigh } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BusinessError(400, '请选择至少一条记录');
    }
    if (!['Y', 'N'].includes(auto_weigh)) {
      throw new BusinessError(400, 'auto_weigh 值必须为 Y 或 N');
    }
    const placeholders = ids.map((_: any, i: number) => `:id${i}`).join(',');
    const replacements: any = { val: auto_weigh };
    ids.forEach((id: number, i: number) => { replacements[`id${i}`] = id; });
    const _factoryId = getFactoryId(req);
    let factoryCond = '';
    if (_factoryId !== null) {
      factoryCond = ' AND factory_id = :_factoryId';
      replacements._factoryId = _factoryId;
    }
    await sequelize.query(
      `UPDATE backflush_task SET auto_weigh = :val WHERE id IN (${placeholders})${factoryCond}`,
      { replacements }
    );
    res.json(success({ updatedCount: ids.length }, '更新成功'));
  } catch (err) { next(err); }
};

// ==================== 导出Excel ====================
export const exportExcel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    const result = await getBackflushTasks({ ...req.query, page: 1, pageSize: 10000, _factoryId: effectiveFactoryId ?? undefined });
    const rows = result.rows || [];

    const headers = ['任务编号', '生产单号', '产品编号', '产品名称', '工序号', '工序名称',
      '物料编号', '物料名称', '物料类型', 'BOM用量', '需求量', '已扣减量', '扣减状态',
      '仓库编号', '仓库名称', '错误信息', '所属工厂', '创建时间'];
    const csvRows = [headers.join(',')];
    for (const row of rows) {
      csvRows.push([
        row.backflush_task_number, row.production_order_number,
        row.item_number, row.item_name, row.step_number, row.standard_process_name,
        row.material_number, row.material_name, row.material_type,
        row.bom_actual_quantity, row.required_quantity, row.deducted_quantity,
        row.deduction_status, row.warehouse_number, row.warehouse_name,
        (row.error_message || '').replace(/[,\n]/g, ' '),
        row.factory_short || row.factory_name || '',
        row.creation_date
      ].map(v => `"${v || ''}"`).join(','));
    }

    const BOM = '\uFEFF';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=backflush_tasks_${Date.now()}.csv`);
    res.send(BOM + csvRows.join('\n'));
  } catch (err) { next(err); }
};
