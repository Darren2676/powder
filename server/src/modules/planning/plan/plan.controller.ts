import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { generateProductionNumber } from '@/services/documentNumber.service';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

// Re-export from service for backward compatibility
export { generateProductionNumber } from '@/services/documentNumber.service';

const fields = ['production_number', 'item_number', 'item_name', 'basic_unit', 'specifications', 'product_drawing_number', 'rubber_compound_number', 'batch_production_quota', 'planned_quantity', 'shifts_number', 'planned_completion_time', 'plan_status', 'source_order_number', 'source_line_number', 'remark', 'customer_item_number', 'customer_item_description', 'factory_id'];
const headers = ['生产计划编号', '产品编号', '产品名称', '基本单位', '规格', '产品图号', '胶料编号', '班产定额', '计划数量', '台班数', '计划完成时间', '计划状态', '源单号', '源单行号', '备注', '客户物料号', '客户物料描述', '所属工厂'];

// 计算台班数: 计划数量 / 班产定额，向上取整
const calcShiftsNumber = (planned_quantity: any, batch_production_quota: any): number | null => {
  const qty = parseFloat(planned_quantity)
  const quota = parseFloat(batch_production_quota)
  if (!qty || !quota || isNaN(qty) || isNaN(quota) || quota === 0) return null
  return Math.ceil(qty / quota)
}

export const getPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const mrp_status = (req.query.mrp_status as string) || '';
    const plan_status = (req.query.plan_status as string) || '';

    let whereClause = '';
    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(production_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search OR plan_status LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      conditions.push(`approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }
    if (plan_status) {
      conditions.push(`plan_status = :plan_status`);
      replacements.plan_status = plan_status;
    }
    if (mrp_status === '已分解') {
      conditions.push(`mrp_status = N'已分解'`);
    } else if (mrp_status === '未分解') {
      conditions.push(`(mrp_status IS NULL OR mrp_status = '')`);
    }

    const _factoryId = getFactoryId(req);
    // 前端传 factory_id（HQ全量模式优先使用查询参数）
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      conditions.push(`pp.factory_id = :_factoryId`);
      replacements._factoryId = effectiveFactoryId;
    }

    if (conditions.length) whereClause = 'WHERE ' + conditions.join(' AND ');

    const countSql = `SELECT COUNT(*) as total FROM Production_plan pp ${whereClause}`;
    const [countResult]: any = await sequelize.query(countSql, { replacements });
    const total = countResult[0].total;

    const dataSql = `
      SELECT * FROM (
        SELECT pp.production_number, pp.item_number, pp.item_name, pp.basic_unit, pp.specifications, pp.product_drawing_number, pp.rubber_compound_number, pp.batch_production_quota, pp.planned_quantity, pp.shifts_number, pp.planned_completion_time, pp.plan_status, pp.remark, pp.approval_status, pp.source_order_number, pp.source_line_number, pp.customer_item_number, pp.customer_item_description, pp.mrp_status, ISNULL(f.factory_short, f.factory_name) as factory_short, pp.factory_id, ROW_NUMBER() OVER (ORDER BY pp.production_number DESC) AS _row_num
        FROM Production_plan pp
        LEFT JOIN factory f ON pp.factory_id = f.id
        ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(dataSql, {
      replacements: { ...replacements, offset, offsetEnd: offset + limit }
    });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取计划列表成功'));
  } catch (err) {
    next(err);
  }
};

export const createPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const b = req.body;

    if (!b.item_number) {
      res.status(400).json({ success: false, message: '产品编号不能为空' });
      return;
    }

    const production_number = await generateProductionNumber(factoryCode);

    const insertSql = `
      INSERT INTO Production_plan (production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, shifts_number, planned_completion_time, plan_status, remark, approval_status, customer_item_number, customer_item_description, factory_id)
      VALUES (:production_number, :item_number, :item_name, :basic_unit, :specifications, :product_drawing_number, :rubber_compound_number, :batch_production_quota, :planned_quantity, :shifts_number, :planned_completion_time, :plan_status, :remark, N'草稿', :customer_item_number, :customer_item_description, :factory_id)
    `;

    await sequelize.query(insertSql, {
      replacements: {
        production_number,
        item_number: b.item_number,
        item_name: b.item_name || '',
        basic_unit: b.basic_unit || '',
        specifications: b.specifications || '',
        product_drawing_number: b.product_drawing_number || '',
        rubber_compound_number: b.rubber_compound_number || '',
        batch_production_quota: b.batch_production_quota || '',
        planned_quantity: b.planned_quantity || 0,
        shifts_number: calcShiftsNumber(b.planned_quantity, b.batch_production_quota),
        planned_completion_time: b.planned_completion_time || null,
        plan_status: b.plan_status || '',
        remark: b.remark || '',
        customer_item_number: b.customer_item_number || '',
        customer_item_description: b.customer_item_description || '',
        factory_id: b.factory_id || _factoryId
      }
    });

    res.json(success({ production_number }, '创建计划成功'));
  } catch (err) {
    next(err);
  }
};

export const updatePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    // 审批状态校验：只有草稿状态可以编辑
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM Production_plan WHERE production_number = :id`, { replacements: { id } });
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return; }
    const b = req.body;

    const updateSql = `
      UPDATE Production_plan SET
        item_number = :item_number,
        item_name = :item_name,
        basic_unit = :basic_unit,
        specifications = :specifications,
        product_drawing_number = :product_drawing_number,
        rubber_compound_number = :rubber_compound_number,
        batch_production_quota = :batch_production_quota,
        planned_quantity = :planned_quantity,
        shifts_number = :shifts_number,
        planned_completion_time = :planned_completion_time,
        plan_status = :plan_status,
        remark = :remark,
        mrp_status = :mrp_status,
        factory_id = :factory_id
      WHERE production_number = :id
        AND (factory_id = :_factoryId OR :_factoryId IS NULL)
    `;

    await sequelize.query(updateSql, {
      replacements: {
        id,
        item_number: b.item_number,
        item_name: b.item_name,
        basic_unit: b.basic_unit,
        specifications: b.specifications,
        product_drawing_number: b.product_drawing_number,
        rubber_compound_number: b.rubber_compound_number,
        batch_production_quota: b.batch_production_quota,
        planned_quantity: b.planned_quantity,
        shifts_number: calcShiftsNumber(b.planned_quantity, b.batch_production_quota),
        planned_completion_time: b.planned_completion_time,
        plan_status: b.plan_status,
        remark: b.remark,
        mrp_status: b.mrp_status || null,
        factory_id: b.factory_id || _factoryId,
        _factoryId: _factoryId || null
      }
    });

    res.json(success(null, '更新计划成功'));
  } catch (err) {
    next(err);
  }
};

// ==================== 回退生产计划关联的源单据状态 ====================
/**
 * 删除计划或反审批时调用，回退销售订单明细/销售预测明细的状态
 * @param productionNumber 生产计划编号
 * @param transaction 可选的事务对象（deletePlan内传递以保持原子性）
 */
export const revertPlanSourceStatuses = async (productionNumber: string, transaction?: any): Promise<void> => {
  const opts: any = transaction ? { transaction } : {};

  // 查询计划信息
  const [planRows]: any = await sequelize.query(
    `SELECT source_order_number, source_line_number, item_number, factory_id FROM Production_plan WHERE production_number = :pn`,
    { replacements: { pn: productionNumber }, ...opts }
  );
  if (!planRows.length) return;

  const plan = planRows[0];
  const sourceOrderNumber: string = plan.source_order_number || '';
  const sourceLineNumber = plan.source_line_number;
  const itemNumber: string = plan.item_number || '';
  const planFactoryId = plan.factory_id;
  const factoryCond = planFactoryId != null ? ' AND factory_id = :_fid' : '';
  const factoryReps: any = planFactoryId != null ? { _fid: planFactoryId } : {};

  if (sourceOrderNumber && sourceOrderNumber !== 'MPS' && sourceLineNumber != null) {
    // 判断是销售订单还是销售预测（通过查询 sales_order 表确认）
    const [soCheck]: any = await sequelize.query(
      `SELECT 1 FROM sales_order WHERE sales_order_number = :son${factoryCond}`,
      { replacements: { son: sourceOrderNumber, ...factoryReps }, ...opts }
    );

    if (soCheck.length > 0) {
      // ──────── 来源：销售订单 ────────
      // 检查是否还有其他计划关联该订单明细行
      const [otherPlans]: any = await sequelize.query(
        `SELECT 1 FROM Production_plan WHERE source_order_number = :son AND source_line_number = :ln AND production_number != :pn`,
        { replacements: { son: sourceOrderNumber, ln: sourceLineNumber, pn: productionNumber }, ...opts }
      );

      if (otherPlans.length === 0) {
        // 无其他计划关联，回退销售订单明细状态
        // 注意: sales_order_detail 表没有 factory_id 列，不能加 factoryCond
        await sequelize.query(
          `UPDATE sales_order_detail
           SET production_status = N'未加入计划',
               status = N'未开始'
           WHERE sales_order_number = :son AND line_number = :ln`,
          { replacements: { son: sourceOrderNumber, ln: sourceLineNumber }, ...opts }
        );

        // 检查整个销售订单是否还有其他明细行处于生产中/待排产状态
        const [otherActiveDetails]: any = await sequelize.query(
          `SELECT 1 FROM sales_order_detail
           WHERE sales_order_number = :son AND production_status IN (N'待排产', N'计划中', N'生产中')`,
          { replacements: { son: sourceOrderNumber }, ...opts }
        );

        if (otherActiveDetails.length === 0) {
          // 无其他明细行在排产，回退销售订单头状态
          await sequelize.query(
            `UPDATE sales_order SET order_status = N'待执行' WHERE sales_order_number = :son AND order_status = N'生产中'${factoryCond}`,
            { replacements: { son: sourceOrderNumber, ...factoryReps }, ...opts }
          );
        }
      }
    } else {
      // ──────── 来源：销售预测 ────────
      // 检查是否还有其他计划关联该预测明细行
      const [otherPlans]: any = await sequelize.query(
        `SELECT 1 FROM Production_plan WHERE source_order_number = :fn AND source_line_number = :ln AND production_number != :pn`,
        { replacements: { fn: sourceOrderNumber, ln: sourceLineNumber, pn: productionNumber }, ...opts }
      );

      if (otherPlans.length === 0) {
        // 无其他计划，回退预测明细状态
        await sequelize.query(
          `UPDATE sales_forecast_detail
           SET status = N'未开始'
           WHERE forecast_number = :fn AND line_number = :ln AND status = N'计划中'`,
          { replacements: { fn: sourceOrderNumber, ln: sourceLineNumber }, ...opts }
        );
      }
    }
  } else if (sourceOrderNumber === 'MPS' && itemNumber) {
    // ──────── 来源：MPS批量导入 ────────
    // 检查该物料下是否还有其他计划
    const [otherPlans]: any = await sequelize.query(
      `SELECT 1 FROM Production_plan WHERE item_number = :item AND production_number != :pn`,
      { replacements: { item: itemNumber, pn: productionNumber }, ...opts }
    );

    if (otherPlans.length === 0) {
      // 无其他计划，回退该物料下预测明细状态
      await sequelize.query(
        `UPDATE sales_forecast_detail
         SET status = N'未开始'
         WHERE item_number = :item AND status = N'计划中'`,
        { replacements: { item: itemNumber }, ...opts }
      );
    }
  }
};

/**
 * 生产计划反审批回调：回退关联的销售订单/销售预测状态
 * 在 approval.service.ts 中注册为 Production_plan 的 onReverse 回调
 */
export const onPlanReversed = async (productionNumber: string): Promise<void> => {
  await revertPlanSourceStatuses(productionNumber);
};

export const deletePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const _factoryId = getFactoryId(req);
    // 审批状态校验：只有草稿状态可以删除
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM Production_plan WHERE production_number = :id`,
      { replacements: { id } }
    );
    if (!chk.length) {
      res.status(404).json({ success: false, message: '生产计划不存在' });
      return;
    }
    if (chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除，请先撤消审批' });
      return;
    }

    const transaction = await sequelize.transaction();
    try {
      // 先回退关联的源单据状态（在删除计划之前执行，保证可查询到计划信息）
      await revertPlanSourceStatuses(id, transaction);

      // 删除计划
      await sequelize.query(
        `DELETE FROM Production_plan WHERE production_number = :id AND (factory_id = :_factoryId OR :_factoryId IS NULL)`,
        { replacements: { id, _factoryId: _factoryId || null }, transaction }
      );

      await transaction.commit();
      res.json(success(null, '删除计划成功，已同步回退关联的销售订单/预测状态'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) {
    next(err);
  }
};

export const exportPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT ${fields.join(', ')} FROM Production_plan ORDER BY production_number DESC`);
    exportToExcel(items, fields, headers, 'plans', res);
  } catch (err) { next(err); }
};

export const importPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const impFactoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const impFactoryReps = _factoryId !== null ? { _factoryId } : {};
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let imported = 0;
    for (const item of rows) {
      try {
        const factoryCode = await getFactoryCode(req);
        if (!item.production_number) {
          item.production_number = await generateProductionNumber(factoryCode);
        }
        // 自动计算台班数
        item.shifts_number = calcShiftsNumber(item.planned_quantity, item.batch_production_quota);
        const [existing]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM Production_plan WHERE production_number = :production_number`, { replacements: { production_number: item.production_number } });
        if (existing[0].cnt > 0) {
          await sequelize.query(`UPDATE Production_plan SET item_number = :item_number, item_name = :item_name, basic_unit = :basic_unit, specifications = :specifications, product_drawing_number = :product_drawing_number, rubber_compound_number = :rubber_compound_number, batch_production_quota = :batch_production_quota, planned_quantity = :planned_quantity, shifts_number = :shifts_number, planned_completion_time = :planned_completion_time, plan_status = :plan_status, remark = :remark WHERE production_number = :production_number${impFactoryCond}`, { replacements: { ...item, ...impFactoryReps } });
        } else {
          await sequelize.query(`INSERT INTO Production_plan (${fields.join(', ')}) VALUES (${fields.map(f => ':' + f).join(', ')})`, { replacements: item });
        }
        imported++;
      } catch (e) {}
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};

// ==================== 获取可导入的已审核销售订单明细 ====================
export const getSalesOrdersForImport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search = '' } = req.query;

    let whereClause = `WHERE h.approval_status = N'已审批' AND h.order_status = N'待执行'`;
    const replacements: any = {};

    if (search) {
      whereClause += ` AND (h.sales_order_number LIKE :search OR h.customer_name LIKE :search OR d.item_number LIKE :search OR d.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      whereClause += ' AND h.factory_id = :_factoryId';
      replacements._factoryId = _factoryId;
    }

    const [items]: any = await sequelize.query(`
      SELECT d.id as detail_id, d.sales_order_number, d.line_number,
             d.item_number, d.item_name, d.specifications, d.basic_unit,
             d.product_drawing_number, d.order_quantity, d.delivery_date,
             d.production_status, d.remark as detail_remark,
             d.customer_item_number, d.customer_item_description,
             h.customer_number, h.customer_name, h.delivery_date as header_delivery_date,
             h.factory_id, ISNULL(f.factory_short, f.factory_name) as factory_short,
             ISNULL(pe.rubber_compound_number, '') as rubber_compound_number,
             ISNULL(pe.batch_production_quota, '') as batch_production_quota
      FROM sales_order_detail d
      INNER JOIN sales_order h ON h.sales_order_number = d.sales_order_number
      LEFT JOIN factory f ON h.factory_id = f.id
      LEFT JOIN product_ext pe ON pe.item_number = d.item_number
      ${whereClause}
      ORDER BY h.sales_order_number DESC, d.line_number
    `, { replacements });

    res.json(success(items));
  } catch (err) { next(err); }
};

// ==================== 从销售订单导入到生产计划 ====================
export const importFromSalesOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const soFactoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const soFactoryReps = _factoryId !== null ? { _factoryId } : {};
    const b = req.body;
    if (!b.items || !Array.isArray(b.items) || b.items.length === 0) {
      res.status(400).json({ success: false, message: '请选择至少一条销售订单明细' });
      return;
    }

    const items = b.items;

    const transaction = await sequelize.transaction();
    let imported = 0;
    const results: any[] = [];

    try {
      const factoryCode = await getFactoryCode(req);
      for (const item of items) {
        const production_number = await generateProductionNumber(factoryCode, transaction);
        const planned_quantity = item.planned_quantity || item.order_quantity || 0;
        const shifts_number = calcShiftsNumber(planned_quantity, item.batch_production_quota);
        // 交货日期取自销售订单明细，若明细无日期则取头部日期
        const planned_completion_time = item.delivery_date || item.header_delivery_date || null;

        await sequelize.query(`
          INSERT INTO Production_plan (production_number, item_number, item_name, basic_unit, specifications,
            product_drawing_number, rubber_compound_number, batch_production_quota,
            planned_quantity, shifts_number, planned_completion_time, plan_status, remark, approval_status,
            source_order_number, source_line_number, customer_item_number, customer_item_description, factory_id)
          VALUES (:production_number, :item_number, :item_name, :basic_unit, :specifications,
            :product_drawing_number, :rubber_compound_number, :batch_production_quota,
            :planned_quantity, :shifts_number, :planned_completion_time, N'待加入任务', :remark, N'草稿',
            :source_order_number, :source_line_number, :customer_item_number, :customer_item_description, :factory_id)
        `, {
          replacements: {
            production_number,
            item_number: item.item_number || '',
            item_name: item.item_name || '',
            basic_unit: item.basic_unit || '',
            specifications: item.specifications || '',
            product_drawing_number: item.product_drawing_number || '',
            rubber_compound_number: item.rubber_compound_number || '',
            batch_production_quota: item.batch_production_quota || '',
            planned_quantity,
            shifts_number,
            planned_completion_time,
            remark: '',
            source_order_number: item.sales_order_number || '',
            source_line_number: item.line_number || null,
            customer_item_number: item.customer_item_number || '',
            customer_item_description: item.customer_item_description || '',
            factory_id: _factoryId,
          },
          transaction
        });

        // 更新销售订单明细的 production_status
        if (item.detail_id) {
          await sequelize.query(
            `UPDATE sales_order_detail SET production_status = N'待排产', status = N'进行中' WHERE id = :id AND (production_status IS NULL OR production_status = N'未加入计划')${soFactoryCond}`,
            { replacements: { id: item.detail_id, ...soFactoryReps }, transaction }
          );
        }

        results.push({ production_number, sales_order_number: item.sales_order_number, line_number: item.line_number });
        imported++;
      }

      // 更新涉及的销售订单 order_status 为"生产中"
      const orderNumbers = [...new Set(items.map((it: any) => it.sales_order_number).filter(Boolean))];
      for (const orderNum of orderNumbers) {
        await sequelize.query(
          `UPDATE sales_order SET order_status = N'生产中' WHERE sales_order_number = :orderNum AND order_status = N'待执行'${soFactoryCond}`,
          { replacements: { orderNum, ...soFactoryReps }, transaction }
        );
      }

      await transaction.commit();
      res.json(success({ imported, results }, `成功导入 ${imported} 条生产计划`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 获取可导入的销售预测明细 ====================
export const getForecastsForImport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search = '' } = req.query;

    let whereClause = `WHERE h.approval_status = N'已审批' AND d.status = N'未开始'`;
    const replacements: any = {};

    if (search) {
      whereClause += ` AND (h.forecast_number LIKE :search OR h.customer_name LIKE :search OR d.item_number LIKE :search OR d.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      whereClause += ' AND h.factory_id = :_factoryId';
      replacements._factoryId = _factoryId;
    }

    const [items]: any = await sequelize.query(`
      SELECT d.id as detail_id, d.forecast_number, d.line_number,
             d.item_number, d.item_name, d.specifications, d.basic_unit,
             d.product_drawing_number, d.start_date, d.end_date,
             d.forecast_quantity, d.status,
             d.remark as detail_remark,
             h.customer_number, h.customer_name,
             h.factory_id, ISNULL(f.factory_short, f.factory_name) as factory_short,
             ISNULL(pe.rubber_compound_number, '') as rubber_compound_number,
             ISNULL(pe.batch_production_quota, '') as batch_production_quota
      FROM sales_forecast_detail d
      INNER JOIN sales_forecast h ON h.forecast_number = d.forecast_number
      LEFT JOIN factory f ON h.factory_id = f.id
      LEFT JOIN product_ext pe ON pe.item_number = d.item_number
      ${whereClause}
      ORDER BY h.forecast_number DESC, d.line_number
    `, { replacements });

    res.json(success(items));
  } catch (err) { next(err); }
};

// ==================== 从销售预测导入到生产计划 ====================
export const importFromForecast = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const b = req.body;
    if (!b.items || !Array.isArray(b.items) || b.items.length === 0) {
      res.status(400).json({ success: false, message: '请选择至少一条预测明细' });
      return;
    }

    const items = b.items;

    const transaction = await sequelize.transaction();
    let imported = 0;
    const results: any[] = [];

    try {
      const factoryCode = await getFactoryCode(req);
      for (const item of items) {
        const production_number = await generateProductionNumber(factoryCode, transaction);
        const planned_quantity = item.planned_quantity || item.forecast_quantity || 0;
        const shifts_number = calcShiftsNumber(planned_quantity, item.batch_production_quota);
        const planned_completion_time = item.end_date || null;

        await sequelize.query(`
          INSERT INTO Production_plan (production_number, item_number, item_name, basic_unit, specifications,
            product_drawing_number, rubber_compound_number, batch_production_quota,
            planned_quantity, shifts_number, planned_completion_time, plan_status, remark, approval_status,
            source_order_number, source_line_number, customer_item_number, customer_item_description, factory_id)
          VALUES (:production_number, :item_number, :item_name, :basic_unit, :specifications,
            :product_drawing_number, :rubber_compound_number, :batch_production_quota,
            :planned_quantity, :shifts_number, :planned_completion_time, N'待加入任务', :remark, N'草稿',
            :source_order_number, :source_line_number, :customer_item_number, :customer_item_description, :factory_id)
        `, {
          replacements: {
            production_number,
            item_number: item.item_number || '',
            item_name: item.item_name || '',
            basic_unit: item.basic_unit || '',
            specifications: item.specifications || '',
            product_drawing_number: item.product_drawing_number || '',
            rubber_compound_number: item.rubber_compound_number || '',
            batch_production_quota: item.batch_production_quota || '',
            planned_quantity,
            shifts_number,
            planned_completion_time,
            remark: '',
            source_order_number: item.forecast_number || '',
            source_line_number: item.line_number || null,
            customer_item_number: '',
            customer_item_description: '',
            factory_id: _factoryId,
          },
          transaction
        });

        // 更新预测明细行的状态为"计划中"
        if (item.detail_id) {
          await sequelize.query(
            `UPDATE sales_forecast_detail SET status = N'计划中' WHERE id = :id AND status = N'未开始'`,
            { replacements: { id: item.detail_id }, transaction }
          );
        }

        results.push({ production_number, forecast_number: item.forecast_number, line_number: item.line_number });
        imported++;
      }

      await transaction.commit();
      res.json(success({ imported, results }, `成功从预测导入 ${imported} 条生产计划`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};
