import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { generateOrderNumber } from '@/services/documentNumber.service';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { BusinessError } from '@/shared/errors/BusinessError';
import { splitOrdersCore, dispatchOrdersCore, dispatchAndGenerateCore } from '@/services/orderDispatch.service';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

const fields = ['production_order_number', 'production_number', 'item_number', 'item_name', 'basic_unit', 'specifications', 'product_drawing_number', 'rubber_compound_number', 'batch_production_quota', 'planned_quantity', 'equipment_number', 'equipment_name', 'mould_number', 'formed_part_specifications', 'formed_part_unit_consumption', 'actual_cavity_count', 'actual_hole_count', 'actual_daily_output', 'production_date', 'schedule_id', 'planned_completion_time', 'plan_status', 'completion_status', 'inbound_status', 'remark'];
const headers = ['生产单编号', '生产计划编号', '产品编号', '产品名称', '基本单位', '规格', '产品图号', '胶料编号', '班产定额', '计划数量', '设备编号', '设备名称', '模具编号', '成型件规格', '成型件单耗', '实际模腔数', '实际模穴数', '实际班产', '生产日期', '班次', '计划完成时间', '状态', '完成状态', '入库状态', '备注'];

export const getOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const production_number = (req.query.production_number as string) || '';
    const item_number = (req.query.item_number as string) || '';
    const equipment_number = (req.query.equipment_number as string) || '';
    const production_date = (req.query.production_date as string) || '';
    const schedule_id = (req.query.schedule_id as string) || '';

    let whereClause = '';
    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(production_order_number LIKE :search OR production_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search OR plan_status LIKE :search)`);
      replacements.search = `%${search}%`;
    }

    if (status) {
      conditions.push(`plan_status = :status`);
      replacements.status = status;
    }

    if (approval_status) {
      conditions.push(`approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }

    if (production_number) {
      conditions.push(`production_number LIKE :production_number`);
      replacements.production_number = `%${production_number}%`;
    }

    if (item_number) {
      conditions.push(`item_number LIKE :item_number`);
      replacements.item_number = `%${item_number}%`;
    }

    if (equipment_number) {
      conditions.push(`equipment_number LIKE :equipment_number`);
      replacements.equipment_number = `%${equipment_number}%`;
    }

    if (production_date) {
      conditions.push(`CONVERT(VARCHAR(10), production_date, 120) = :production_date`);
      replacements.production_date = production_date;
    }

    if (schedule_id) {
      conditions.push(`schedule_id = :schedule_id`);
      replacements.schedule_id = schedule_id;
    }

    if (conditions.length > 0) {
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }

    const countSql = `SELECT COUNT(*) as total FROM production_order ${whereClause}`;
    const [countResult]: any = await sequelize.query(countSql, { replacements });
    const total = countResult[0].total;

    const selectCols = 'production_order_number, production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, equipment_number, equipment_name, mould_number, formed_part_specifications, formed_part_unit_consumption, actual_cavity_count, actual_hole_count, actual_daily_output, production_date, schedule_id, planned_completion_time, plan_status, completion_status, inbound_status, remark, approval_status';
    const dataSql = `
      SELECT * FROM (
        SELECT ${selectCols}, ROW_NUMBER() OVER (ORDER BY production_order_number DESC) AS _row_num
        FROM production_order ${whereClause}
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
    }, '获取生产单列表成功'));
  } catch (err) {
    next(err);
  }
};

export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const b = req.body;

    if (!b.item_number) {
      res.status(400).json({ success: false, message: '产品编号不能为空' });
      return;
    }

    const production_order_number = await generateOrderNumber(factoryCode);

    const insertSql = `
      INSERT INTO production_order (production_order_number, production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, equipment_number, equipment_name, mould_number, formed_part_specifications, formed_part_unit_consumption, actual_cavity_count, actual_hole_count, actual_daily_output, planned_completion_time, plan_status, remark, factory_id, approval_status)
      VALUES (:production_order_number, :production_number, :item_number, :item_name, :basic_unit, :specifications, :product_drawing_number, :rubber_compound_number, :batch_production_quota, :planned_quantity, :equipment_number, :equipment_name, :mould_number, :formed_part_specifications, :formed_part_unit_consumption, :actual_cavity_count, :actual_hole_count, :actual_daily_output, :planned_completion_time, :plan_status, :remark, :factory_id, N'草稿')
    `;

    await sequelize.query(insertSql, {
      replacements: {
        production_order_number,
        production_number: b.production_number || '',
        item_number: b.item_number,
        item_name: b.item_name || '',
        basic_unit: b.basic_unit || '',
        specifications: b.specifications || '',
        product_drawing_number: b.product_drawing_number || '',
        rubber_compound_number: b.rubber_compound_number || '',
        batch_production_quota: b.batch_production_quota || '',
        planned_quantity: b.planned_quantity || 0,
        equipment_number: b.equipment_number || null,
        equipment_name: b.equipment_name || null,
        mould_number: b.mould_number || null,
        formed_part_specifications: b.formed_part_specifications || null,
        formed_part_unit_consumption: b.formed_part_unit_consumption || null,
        actual_cavity_count: b.actual_cavity_count || null,
        actual_hole_count: b.actual_hole_count || null,
        actual_daily_output: b.actual_daily_output || null,
        planned_completion_time: b.planned_completion_time || null,
        plan_status: b.plan_status || '待执行',
        remark: b.remark || '',
        factory_id: _factoryId
      }
    });

    // 如果关联了生产计划，回写计划状态为"已加入任务"
    if (b.production_number) {
      try {
        await sequelize.query(
          `UPDATE Production_plan SET plan_status = N'已加入任务' WHERE production_number = :pn AND plan_status = N'待加入任务'`,
          { replacements: { pn: b.production_number } }
        );
      } catch (e) { /* 非关键操作，静默忽略 */ }
    }

    res.json(success({ production_order_number }, '创建生产单成功'));
  } catch (err) {
    next(err);
  }
};

export const updateOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM production_order WHERE production_order_number = :id`, { replacements: { id } });
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return; }
    const b = req.body;

    const updateSql = `
      UPDATE production_order SET
        production_number = :production_number,
        item_number = :item_number,
        item_name = :item_name,
        basic_unit = :basic_unit,
        specifications = :specifications,
        product_drawing_number = :product_drawing_number,
        rubber_compound_number = :rubber_compound_number,
        batch_production_quota = :batch_production_quota,
        planned_quantity = :planned_quantity,
        equipment_number = :equipment_number,
        equipment_name = :equipment_name,
        mould_number = :mould_number,
        formed_part_specifications = :formed_part_specifications,
        formed_part_unit_consumption = :formed_part_unit_consumption,
        actual_cavity_count = :actual_cavity_count,
        actual_hole_count = :actual_hole_count,
        actual_daily_output = :actual_daily_output,
        production_date = :production_date,
        schedule_id = :schedule_id,
        planned_completion_time = :planned_completion_time,
        plan_status = :plan_status,
        remark = :remark
      WHERE production_order_number = :id
    `;

    await sequelize.query(updateSql, {
      replacements: {
        id, production_number: b.production_number, item_number: b.item_number, item_name: b.item_name, basic_unit: b.basic_unit, specifications: b.specifications,
        product_drawing_number: b.product_drawing_number, rubber_compound_number: b.rubber_compound_number, batch_production_quota: b.batch_production_quota,
        planned_quantity: b.planned_quantity, equipment_number: b.equipment_number || null,
        equipment_name: b.equipment_name || null, mould_number: b.mould_number || null,
        formed_part_specifications: b.formed_part_specifications || null,
        formed_part_unit_consumption: b.formed_part_unit_consumption || null,
        actual_cavity_count: b.actual_cavity_count || null,
        actual_hole_count: b.actual_hole_count || null,
        actual_daily_output: b.actual_daily_output || null,
        production_date: b.production_date || null,
        schedule_id: b.schedule_id || null,
        planned_completion_time: b.planned_completion_time, plan_status: b.plan_status, remark: b.remark
      }
    });

    // Baseline：首次设置生产日期时，同步记录原始计划日期
    if (b.production_date) {
      await sequelize.query(`
        UPDATE production_order
        SET baseline_production_date = COALESCE(baseline_production_date, production_date),
            baseline_planned_completion_time = COALESCE(baseline_planned_completion_time, planned_completion_time)
        WHERE production_order_number = :id AND baseline_production_date IS NULL
      `, { replacements: { id } });
    }

    res.json(success(null, '更新生产单成功'));
  } catch (err) {
    next(err);
  }
};

export const deleteOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(`SELECT approval_status, production_number FROM production_order WHERE production_order_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return; }

    const productionNumber = chk[0]?.production_number || '';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM production_order WHERE production_order_number = :id${factoryCond}`, {
        replacements: { id, ...factoryReps },
        transaction
      });

      // 如果该生产单有关联的生产计划，检查是否需要回退计划状态
      if (productionNumber) {
        // 只检查该计划下是否还有其他成品生产单（item_number与计划相同的是成品工单，子件工单不应阻止回退）
        const [planInfo]: any = await sequelize.query(
          `SELECT item_number FROM Production_plan WHERE production_number = :pn`,
          { replacements: { pn: productionNumber }, transaction }
        );
        const planItemNumber = planInfo.length > 0 ? planInfo[0].item_number : '';

        const [otherOrders]: any = await sequelize.query(
          `SELECT 1 FROM production_order WHERE production_number = :pn AND production_order_number != :id AND item_number = :itemNum`,
          { replacements: { pn: productionNumber, id, itemNum: planItemNumber }, transaction }
        );

        // 成品工单已无剩余时即回退计划状态（采购申请在MRP重算时作为供给自动扣减，不会重复生成）
        if (otherOrders.length === 0) {
          await sequelize.query(
            `UPDATE Production_plan SET plan_status = N'待加入任务', mrp_status = NULL WHERE production_number = :pn AND plan_status = N'已加入任务'`,
            { replacements: { pn: productionNumber }, transaction }
          );
        }
      }

      await transaction.commit();
      res.json(success(null, '删除生产单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) {
    next(err);
  }
};

export const exportOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT ${fields.join(', ')} FROM production_order ORDER BY production_order_number DESC`);
    exportToExcel(items, fields, headers, 'orders', res);
  } catch (err) { next(err); }
};

export const importOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let imported = 0;
    const updatedPlans = new Set<string>();
    for (const item of rows) {
      try {
        if (!item.production_order_number) {
          item.production_order_number = await generateOrderNumber();
        }
        const [existing]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM production_order WHERE production_order_number = :production_order_number`, { replacements: { production_order_number: item.production_order_number } });
        if (existing[0].cnt > 0) {
          await sequelize.query(`UPDATE production_order SET production_number = :production_number, item_number = :item_number, item_name = :item_name, basic_unit = :basic_unit, specifications = :specifications, product_drawing_number = :product_drawing_number, rubber_compound_number = :rubber_compound_number, batch_production_quota = :batch_production_quota, planned_quantity = :planned_quantity, planned_completion_time = :planned_completion_time, plan_status = :plan_status, remark = :remark WHERE production_order_number = :production_order_number`, { replacements: item });
        } else {
          await sequelize.query(`INSERT INTO production_order (${fields.join(', ')}) VALUES (${fields.map(f => ':' + f).join(', ')})`, { replacements: item });
        }
        if (item.production_number) updatedPlans.add(item.production_number);
        imported++;
      } catch (e) {}
    }
    // 回写已关联计划的状态
    if (updatedPlans.size > 0) {
      try {
        const planList = Array.from(updatedPlans);
        const ph = planList.map((_, i) => `:p${i}`).join(', ');
        const r2: any = {};
        planList.forEach((p, i) => { r2[`p${i}`] = p; });
        await sequelize.query(
          `UPDATE Production_plan SET plan_status = N'已加入任务' WHERE production_number IN (${ph}) AND plan_status = N'待加入任务'`,
          { replacements: r2 }
        );
      } catch (e) { /* 非关键操作 */ }
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};

// 从计划导入
export const importFromPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const b = req.body;
    if (!b.production_numbers || !Array.isArray(b.production_numbers) || b.production_numbers.length === 0) {
      res.status(400).json({ success: false, message: '请选择要导入的计划' });
      return;
    }

    const production_numbers = b.production_numbers;

    const placeholders = production_numbers.map((_: string, i: number) => `:pn${i}`).join(', ');
    const replacements: any = {};
    production_numbers.forEach((pn: string, i: number) => { replacements[`pn${i}`] = pn; });

    const [plans]: any = await sequelize.query(
      `SELECT production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, planned_completion_time, plan_status, remark FROM Production_plan WHERE production_number IN (${placeholders})`,
      { replacements }
    );

    if (plans.length === 0) {
      res.status(400).json({ success: false, message: '未找到对应的计划记录' });
      return;
    }

    let imported = 0;
    for (const plan of plans) {
      try {
        // 检查是否已存在对应的生产单（按计划编号+物料编号匹配，避免子件生产单误判）
        const [existCheck]: any = await sequelize.query(
          `SELECT production_order_number FROM production_order WHERE production_number = :pn AND item_number = :item`,
          { replacements: { pn: plan.production_number, item: plan.item_number } }
        );
        if (existCheck.length > 0) continue;

        const production_order_number = await generateOrderNumber(factoryCode);
        await sequelize.query(
          `INSERT INTO production_order (production_order_number, production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, equipment_number, equipment_name, mould_number, formed_part_specifications, formed_part_unit_consumption, actual_cavity_count, actual_hole_count, actual_daily_output, planned_completion_time, plan_status, remark, factory_id, approval_status)
           VALUES (:production_order_number, :production_number, :item_number, :item_name, :basic_unit, :specifications, :product_drawing_number, :rubber_compound_number, :batch_production_quota, :planned_quantity, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, :planned_completion_time, :plan_status, :remark, :factory_id, :approval_status)`,
          {
            replacements: {
              production_order_number,
              production_number: plan.production_number || '',
              item_number: plan.item_number || '',
              item_name: plan.item_name || '',
              basic_unit: plan.basic_unit || '',
              specifications: plan.specifications || '',
              product_drawing_number: plan.product_drawing_number || '',
              rubber_compound_number: plan.rubber_compound_number || '',
              batch_production_quota: plan.batch_production_quota || '',
              planned_quantity: plan.planned_quantity || 0,
              planned_completion_time: plan.planned_completion_time || null,
              plan_status: '未开始',
              remark: plan.remark || '',
              factory_id: _factoryId,
              approval_status: ORDER_STATUS.DRAFT
            }
          }
        );
        imported++;
      } catch (e) {}
    }

    res.json(success({ imported, totalCount: plans.length }, `成功从计划导入 ${imported} 条生产单`));

    // 将已导入的计划状态从"待加入任务"更新为"已加入任务"
    if (imported > 0) {
      try {
        await sequelize.query(
          `UPDATE Production_plan SET plan_status = N'已加入任务' WHERE production_number IN (${placeholders}) AND plan_status = N'待加入任务'`,
          { replacements }
        );
      } catch (e) {}
    }
  } catch (err) {
    next(err);
  }
};

// ==================== 生产单拆分 ====================
export const splitOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.items || !Array.isArray(b.items) || b.items.length === 0) {
      res.status(400).json({ success: false, message: '拆分数据不能为空' });
      return;
    }

    const result = await splitOrdersCore({
      items: b.items.map((it: any) => ({
        type: it.type,
        productionOrderNumber: it.production_order_number,
        newPlannedQuantity: it.new_planned_quantity,
        sourceOrderNumber: it.source_order_number
      }))
    });

    res.json(success(result, `拆分完成：更新 ${result.updated} 条，新增 ${result.created} 条${result.failed > 0 ? `，失败 ${result.failed} 条` : ''}`));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 生产调度单派发 ====================
export const dispatchOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.items || !Array.isArray(b.items) || b.items.length === 0) {
      res.status(400).json({ success: false, message: '派发数据不能为空' });
      return;
    }

    const result = await dispatchOrdersCore({
      items: b.items.map((it: any) => ({
        productionOrderNumber: it.production_order_number,
        equipmentNumber: it.equipment_number,
        equipmentName: it.equipment_name,
        mouldNumber: it.mould_number,
        formedPartSpecs: it.formed_part_specifications,
        formedPartUnitConsumption: it.formed_part_unit_consumption,
        actualCavityCount: it.actual_cavity_count,
        actualHoleCount: it.actual_hole_count,
        actualDailyOutput: it.actual_daily_output,
        productionDate: it.production_date,
        scheduleId: it.schedule_id
      }))
    });

    if (result.successCount === 0 && result.failedCount > 0) {
      res.json({ success: false, message: '派发失败', data: { succeeded: result.successCount, failed: result.failedCount, errors: result.errors } });
    } else {
      res.json(success({
        succeeded: result.successCount,
        failed: result.failedCount,
        errors: result.errors
      }, `成功派发 ${result.successCount} 条${result.failedCount > 0 ? `，失败 ${result.failedCount} 条` : ''}`));
    }
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 移动端: 生产单概览聚合接口 ====================
export const getOrderOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // 1. 查询生产单基本信息
    const [orders]: any = await sequelize.query(
      `SELECT production_order_number, production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, equipment_number, equipment_name, mould_number, formed_part_specifications, formed_part_unit_consumption, actual_cavity_count, actual_hole_count, actual_daily_output, planned_completion_time, plan_status, completion_status, inbound_status, remark, approval_status FROM production_order WHERE production_order_number = :id`,
      { replacements: { id } }
    );
    if (!orders.length) {
      res.status(404).json({ success: false, message: '生产单不存在' });
      return;
    }
    const order = orders[0];

    // 2. 查询关联的工序任务
    const [tasks]: any = await sequelize.query(
      `SELECT process_task_number, step_number, standard_process_name, work_center_number, work_center_name, planned_quantity, completed_quantity, excess_reporting_ratio, task_status, approval_status FROM process_task WHERE production_order_number = :id ORDER BY step_number ASC`,
      { replacements: { id } }
    );

    // 为每个任务计算 max_reportable
    const actualDaily = parseFloat(order.actual_daily_output) || 0;
    const tasksWithMax = tasks.map((t: any) => {
      const planned = parseFloat(t.planned_quantity) || 0;
      const completed = parseFloat(t.completed_quantity) || 0;
      const excessRatio = parseFloat(t.excess_reporting_ratio) || 0;
      const baseQty = actualDaily > 0 ? actualDaily : planned;
      const maxAllowed = baseQty * (1 + excessRatio / 100);
      return {
        ...t,
        max_reportable: Math.max(Math.round((maxAllowed - completed) * 10000) / 10000, 0)
      };
    });

    // 3. 查询关联的备料单
    const [preps]: any = await sequelize.query(
      `SELECT preparation_number, total_material_types, preparation_status, approval_status FROM material_preparation WHERE production_order_number = :id ORDER BY preparation_number DESC`,
      { replacements: { id } }
    );

    let preparation: any = null;
    if (preps.length > 0) {
      const prep = preps[0];
      // 统计已领和未领
      const [detailStats]: any = await sequelize.query(
        `SELECT
          COUNT(*) as total_items,
          SUM(CASE WHEN issued_quantity >= required_quantity AND required_quantity > 0 THEN 1 ELSE 0 END) as issued_count,
          SUM(CASE WHEN issued_quantity < required_quantity OR required_quantity = 0 THEN 1 ELSE 0 END) as pending_count
        FROM material_preparation_detail WHERE preparation_number = :pn`,
        { replacements: { pn: prep.preparation_number } }
      );
      preparation = {
        ...prep,
        issued_count: detailStats[0]?.issued_count || 0,
        pending_count: detailStats[0]?.pending_count || 0
      };
    }

    // 4. 计算汇总
    const totalTasks = tasksWithMax.length;
    const completedTasks = tasksWithMax.filter((t: any) => t.task_status === '已完成').length;
    const plannedQty = parseFloat(order.planned_quantity) || 1;
    // 取最后一道工序的完成量作为整体完成量，如果没有工序任务，则为0
    let overallCompleted = 0;
    if (tasksWithMax.length > 0) {
      // 计算所有工序的平均完成率
      const totalProgress = tasksWithMax.reduce((sum: number, t: any) => {
        const p = parseFloat(t.planned_quantity) || 1;
        const c = parseFloat(t.completed_quantity) || 0;
        return sum + (c / p);
      }, 0);
      overallCompleted = Math.round((totalProgress / totalTasks) * 100);
    }

    res.json(success({
      order,
      tasks: tasksWithMax,
      preparation,
      summary: {
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        overall_progress: overallCompleted
      }
    }, '获取生产单概览成功'));
  } catch (err) {
    next(err);
  }
};

// ==================== 甘特图数据（dhtmlxGantt 标准格式）====================
export const getGanttData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate, equipmentNumber, search } = req.query;

    let where = `WHERE RTRIM(LTRIM(equipment_number)) != '' AND production_date IS NOT NULL`;
    const replacements: any = {};

    if (startDate) {
      where += ` AND production_date >= :startDate`;
      replacements.startDate = startDate;
    }
    if (endDate) {
      where += ` AND production_date <= :endDate`;
      replacements.endDate = endDate;
    }
    if (equipmentNumber) {
      where += ` AND (RTRIM(LTRIM(equipment_number)) = RTRIM(LTRIM(:equipmentNumber)) OR RTRIM(LTRIM(equipment_name)) = RTRIM(LTRIM(:equipmentNumber)))`;
      replacements.equipmentNumber = equipmentNumber;
    }
    if (search) {
      where += ` AND (item_number LIKE :search OR item_name LIKE :search OR production_order_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const sql = `
      SELECT
        production_order_number,
        production_number,
        item_number,
        item_name,
        specifications,
        planned_quantity,
        equipment_number,
        equipment_name,
        mould_number,
        actual_cavity_count,
        actual_hole_count,
        actual_daily_output,
        production_date,
        baseline_production_date,
        baseline_planned_completion_time,
        schedule_id,
        planned_completion_time,
        plan_status
      FROM production_order
      ${where}
      ORDER BY equipment_number, production_date
    `;

    const [rows]: any = await sequelize.query(sql, { replacements });

    const data: any[] = [];
    for (const row of rows) {
      const startDateObj = new Date(row.production_date);
      const dailyOutput = Number(row.actual_daily_output) || 0;
      const plannedQty = Number(row.planned_quantity) || 0;
      const duration = (dailyOutput > 0 && plannedQty > 0)
        ? Math.max(1, Math.ceil(plannedQty / dailyOutput))
        : 1;

      const endDateObj = new Date(startDateObj);
      endDateObj.setDate(endDateObj.getDate() + duration);

      // Baseline 日期计算（兼容旧数据：无 baseline 时使用当前 production_date）
      const baselineStart = row.baseline_production_date
        ? new Date(row.baseline_production_date)
        : new Date(row.production_date);
      const baselineEnd = new Date(baselineStart);
      baselineEnd.setDate(baselineEnd.getDate() + duration);

      const progress = 0; // completed_quantity 列暂不存在，默认进度为0

      const statusColorMap: Record<string, string> = {
        '未开始': '#d9d9d9',
        '已派发': '#1890ff',
        '已备料': '#faad14',
        '生产中': '#52c41a',
        '已完成': '#8c8c8c'
      };

      data.push({
        id: row.production_order_number,
        text: `${row.item_number || row.item_name || ''} (${row.production_order_number})`,
        start_date: startDateObj.toISOString().split('T')[0],
        end_date: endDateObj.toISOString().split('T')[0],
        duration,
        progress,
        owner: row.equipment_number,
        color: statusColorMap[row.plan_status] || '#1890ff',
        // Baseline 字段
        baseline_start_date: baselineStart.toISOString().split('T')[0],
        baseline_end_date: baselineEnd.toISOString().split('T')[0],
        // 扩展字段
        production_order_number: row.production_order_number,
        production_number: row.production_number,
        item_number: row.item_number,
        item_name: row.item_name,
        specifications: row.specifications,
        planned_quantity: row.planned_quantity,
        mould_number: row.mould_number,
        actual_cavity_count: row.actual_cavity_count,
        actual_hole_count: row.actual_hole_count,
        actual_daily_output: row.actual_daily_output,
        schedule_id: row.schedule_id,
        planned_completion_time: row.planned_completion_time,
        plan_status: row.plan_status,
        equipment_name: row.equipment_name
      });
    }

    res.json(success({ data, links: [] }, '获取甘特图数据成功'));
  } catch (err) {
    next(err);
  }
};

// ==================== 甘特图拖拽更新 ====================
export const updateGanttTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { production_date, planned_completion_time, equipment_number, equipment_name, schedule_id, planned_quantity } = req.body;

    // 校验任务状态
    const [rows]: any = await sequelize.query(
      `SELECT plan_status FROM production_order WHERE production_order_number = :id`,
      { replacements: { id } }
    );
    if (rows.length === 0) {
      res.status(404).json({ success: false, message: '生产单不存在' });
      return;
    }

    const status = rows[0].plan_status;
    const allowedStatuses = ['未开始', '已派发'];
    if (!allowedStatuses.includes(status)) {
      res.status(403).json({ success: false, message: `当前状态为"${status}"，仅"未开始"或"已派发"状态的任务可调整排期` });
      return;
    }

    const setClause: string[] = [];
    const replacements: any = { id };

    if (production_date) {
      setClause.push('production_date = :production_date');
      replacements.production_date = production_date;
    }
    if (planned_completion_time) {
      setClause.push('planned_completion_time = :planned_completion_time');
      replacements.planned_completion_time = planned_completion_time;
    }
    if (equipment_number !== undefined) {
      setClause.push('equipment_number = :equipment_number');
      replacements.equipment_number = equipment_number || null;
    }
    if (equipment_name !== undefined) {
      setClause.push('equipment_name = :equipment_name');
      replacements.equipment_name = equipment_name || null;
    }
    if (schedule_id !== undefined) {
      setClause.push('schedule_id = :schedule_id');
      replacements.schedule_id = schedule_id || null;
    }
    if (planned_quantity !== undefined) {
      setClause.push('planned_quantity = :planned_quantity');
      replacements.planned_quantity = planned_quantity;
    }

    if (setClause.length === 0) {
      res.status(400).json({ success: false, message: '没有需要更新的字段' });
      return;
    }

    await sequelize.query(
      `UPDATE production_order SET ${setClause.join(', ')} WHERE production_order_number = :id`,
      { replacements }
    );

    res.json(success(null, '排期调整已保存'));
  } catch (err) {
    next(err);
  }
};

// ==================== 调度单打印数据（含备料明细+工序任务） ====================
export const getPrintData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.production_order_numbers || !Array.isArray(b.production_order_numbers) || b.production_order_numbers.length === 0) {
      res.status(400).json({ success: false, message: '请提供生产单编号列表' });
      return;
    }

    const production_order_numbers = b.production_order_numbers;

    const results: any[] = [];

    for (const orderNum of production_order_numbers) {
      // 1. 查询生产单基本信息（JOIN item_master 获取 item_type）
      const [orders]: any = await sequelize.query(
        `SELECT po.production_order_number, po.production_number, po.item_number, po.item_name, po.basic_unit,
          po.specifications, po.product_drawing_number, po.rubber_compound_number, po.batch_production_quota,
          po.planned_quantity, po.equipment_number, po.equipment_name, po.mould_number,
          po.formed_part_specifications, po.formed_part_unit_consumption,
          po.actual_cavity_count, po.actual_hole_count, po.actual_daily_output,
          po.production_date, po.schedule_id, po.planned_completion_time, po.plan_status, po.remark,
          im.item_type
        FROM production_order po
        LEFT JOIN item_master im ON po.item_number = im.item_number
        WHERE po.production_order_number = :orderNum`,
        { replacements: { orderNum } }
      );
      if (!orders.length) continue;
      const order = orders[0];
      const itemType = order.item_type || '成品';

      // 1.1 根据 item_type 动态 JOIN 扩展表获取扩展字段
      let extFields: any = {};
      const extTableMap: Record<string, string> = {
        '成品': 'product_ext',
        '原材料': 'material_ext',
        '半成品': 'semi_product_ext',
        '包材': 'packaging_ext',
        '骨架': 'skeleton_ext',
        '预成型件': 'preform_ext'
      };
      const extTable = extTableMap[itemType];
      if (extTable) {
        const [extRows]: any = await sequelize.query(
          `SELECT * FROM ${extTable} WHERE item_number = :itemNumber`,
          { replacements: { itemNumber: order.item_number } }
        );
        if (extRows.length > 0) {
          extFields = extRows[0];
        }
      }

      // 2. 查询备料明细（通过JOIN关联所有备料单，确保获取完整物料列表）
      const [materials]: any = await sequelize.query(
        `SELECT mpd.line_number, mpd.material_number, mpd.material_name, mpd.material_type, mpd.unit,
          mpd.bom_standard_quantity, mpd.bom_wastage_rate, mpd.bom_actual_quantity,
          mpd.required_quantity, mpd.adjusted_quantity, mpd.issued_quantity,
          mpd.step_number, mpd.work_center_number, mpd.work_center_name,
          mpd.is_key_material, mpd.supply_type, mpd.default_warehouse, mpd.remark,
          mp.preparation_number, mp.preparation_status
        FROM material_preparation_detail mpd
        INNER JOIN material_preparation mp ON mpd.preparation_number = mp.preparation_number
        WHERE mp.production_order_number = :orderNum
        ORDER BY mp.preparation_number ASC, mpd.line_number ASC`,
        { replacements: { orderNum } }
      );

      // 3. 查询工序任务（含完整的工序信息、时间和物料投入）
      const [tasks]: any = await sequelize.query(
        `SELECT process_task_number, step_number, standard_process_number, standard_process_name,
          work_center_number, work_center_name,
          planned_quantity, completed_quantity,
          process_material_input_number, process_material_input_quantity, process_material_input_unit,
          material_wastage_rate, excess_reporting_ratio, ingredient_addition_method,
          planned_start_time, planned_end_time, actual_start_time, actual_end_time,
          task_status, remark
        FROM process_task
        WHERE production_order_number = :orderNum
        ORDER BY step_number ASC`,
        { replacements: { orderNum } }
      );

      // 4. 查询产品工艺参数（仅已审批+启用）
      // 优先匹配工艺路线级参数（process_route_number = 产品编号），无则回退到产品级默认参数（process_route_number IS NULL）
      let processParams: any[] = [];
      // 4a. 先查工艺路线级参数
      const [routeParams]: any = await sequelize.query(
        `SELECT d.line_number, d.step_number, d.step_name,
          d.param_name, d.param_code, d.param_value, d.unit,
          d.param_type, d.min_value, d.max_value, d.process_category_code, d.process_category_name, d.remark
        FROM process_parameter_header h
        INNER JOIN process_parameter_detail d ON h.parameter_number = d.parameter_number
        WHERE h.item_number = :itemNumber AND h.approval_status = N'已审批' AND h.[condition] = N'启用'
          AND h.process_route_number IS NOT NULL
        ORDER BY d.line_number`,
        { replacements: { itemNumber: order.item_number } }
      );
      if (routeParams.length > 0) {
        processParams = routeParams;
      } else {
        // 4b. 回退查产品级默认参数
        const [defaultParams]: any = await sequelize.query(
          `SELECT d.line_number, d.step_number, d.step_name,
            d.param_name, d.param_code, d.param_value, d.unit,
            d.param_type, d.min_value, d.max_value, d.process_category_code, d.process_category_name, d.remark
          FROM process_parameter_header h
          INNER JOIN process_parameter_detail d ON h.parameter_number = d.parameter_number
          WHERE h.item_number = :itemNumber AND h.approval_status = N'已审批' AND h.[condition] = N'启用'
            AND h.process_route_number IS NULL
          ORDER BY d.line_number`,
          { replacements: { itemNumber: order.item_number } }
        );
        processParams = defaultParams;
      }

      results.push({ order, materials, tasks, item_type: itemType, ext_fields: extFields, process_parameters: processParams });
    }

    res.json(success({ items: results }, '获取打印数据成功'));
  } catch (err) {
    next(err);
  }
};

// ==================== BOM展平递归辅助函数 ====================
async function flattenBomRecursive(bomNumber: string, parentMultiplier: number, visitedSet: Set<string>, depth: number, maxDepth: number, result: any[], path: string) {
  if (depth > maxDepth || visitedSet.has(bomNumber)) return;
  visitedSet.add(bomNumber);

  const [hdr]: any = await sequelize.query(`SELECT base_quantity FROM bom_header WHERE bom_number = :bomNumber`, { replacements: { bomNumber } });
  if (!hdr.length) return;
  const baseQty = parseFloat(hdr[0].base_quantity) || 1;

  const [details]: any = await sequelize.query(`SELECT * FROM bom_detail WHERE bom_number = :bomNumber ORDER BY line_number`, { replacements: { bomNumber } });

  const materialNumbers = details.map((d: any) => d.material_number).filter((m: string) => m);
  let bomMap: Record<string, string> = {};
  if (materialNumbers.length > 0) {
    const placeholders = materialNumbers.map((_: string, i: number) => `:m${i}`).join(',');
    const matReplacements: any = {};
    materialNumbers.forEach((m: string, i: number) => { matReplacements[`m${i}`] = m; });
    const [bomRows]: any = await sequelize.query(
      `SELECT item_number, bom_number FROM bom_header WHERE item_number IN (${placeholders}) AND [condition] = N'启用'`,
      { replacements: matReplacements }
    );
    for (const row of bomRows) {
      if (!bomMap[row.item_number]) bomMap[row.item_number] = row.bom_number;
    }
  }

  for (const d of details) {
    const childBomNum = d.child_bom_number || bomMap[d.material_number] || null;
    const actualQty = parseFloat(d.actual_quantity) || 0;
    const accumulatedQty = parentMultiplier * (actualQty / baseQty);
    const currentPath = path ? `${path} > ${bomNumber}` : bomNumber;

    if (childBomNum) {
      await flattenBomRecursive(childBomNum, accumulatedQty, new Set(visitedSet), depth + 1, maxDepth, result, currentPath);
    } else {
      result.push({
        material_number: d.material_number,
        material_name: d.material_name,
        material_type: d.material_type,
        unit: d.unit,
        accumulated_quantity: Math.round(accumulatedQty * 10000) / 10000,
        bom_path: currentPath,
        level: depth,
        is_leaf: true,
        step_number: d.step_number || null
      });
    }
  }
}

// ==================== 一键派发并自动生成工序任务+备料单 ====================
export const dispatchAndGenerate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.items || !Array.isArray(b.items) || b.items.length === 0) {
      res.status(400).json({ success: false, message: '请提供需要派发的生产单列表' });
      return;
    }

    const username = (req as any).user?.username || 'system';

    const result = await dispatchAndGenerateCore({
      items: b.items.map((it: any) => ({
        productionOrderNumber: it.production_order_number,
        equipmentNumber: it.equipment_number,
        equipmentName: it.equipment_name,
        mouldNumber: it.mould_number,
        formedPartSpecs: it.formed_part_specifications,
        formedPartUnitConsumption: it.formed_part_unit_consumption,
        actualCavityCount: it.actual_cavity_count,
        actualHoleCount: it.actual_hole_count,
        actualDailyOutput: it.actual_daily_output,
        productionDate: it.production_date,
        scheduleId: it.schedule_id
      }))
    }, username);

    let msg = `成功派发 ${result.dispatch.count} 条生产单`;
    if (result.processTasks.totalGenerated > 0) msg += `，生成 ${result.processTasks.totalGenerated} 条工序任务`;
    if (result.materialPreparations.totalGenerated > 0) msg += `，生成 ${result.materialPreparations.totalGenerated} 份备料单`;
    if (result.errors.length > 0) msg += `，${result.errors.length} 条跳过`;

    res.json(success(result, msg));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({
        success: false,
        message: err.message,
        conflicts: (err as any).conflicts
      });
      return;
    }
    next(err);
  }
};

// ==================== 派发预检：检查工艺路线状态 ====================
export const dispatchPrecheck = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.item_numbers || !Array.isArray(b.item_numbers) || b.item_numbers.length === 0) {
      return res.json(success({}));
    }

    // 去重
    const uniqueItems = [...new Set(b.item_numbers as string[])];

    // 批量查询每个物料对应的工艺路线
    const result: Record<string, { routing_exists: boolean; routing_approved: boolean; routing_number: string; approval_status: string }> = {};

    for (const itemNum of uniqueItems) {
      // 第一步：按真实派发规则查询——优先已审批的主工艺路线
      const [approvedRows]: any = await sequelize.query(
        `SELECT TOP 1 process_route_number, approval_status
         FROM routing_header
         WHERE item_number = :item_number AND condition = N'启用' AND approval_status = N'已审批'
         ORDER BY CASE WHEN is_primary = N'是' THEN 0 ELSE 1 END, creation_date DESC`,
        { replacements: { item_number: itemNum } }
      );
      if (approvedRows.length > 0) {
        result[itemNum] = {
          routing_exists: true,
          routing_approved: true,
          routing_number: approvedRows[0].process_route_number,
          approval_status: approvedRows[0].approval_status || '已审批'
        };
        continue;
      }

      // 第二步：没有已审批路线时，再查任意状态的最新路线，用于向前端展示实际审批状态
      const [anyRows]: any = await sequelize.query(
        `SELECT TOP 1 process_route_number, approval_status
         FROM routing_header
         WHERE item_number = :item_number AND condition = N'启用'
         ORDER BY CASE WHEN is_primary = N'是' THEN 0 ELSE 1 END, creation_date DESC`,
        { replacements: { item_number: itemNum } }
      );
      if (anyRows.length === 0) {
        result[itemNum] = { routing_exists: false, routing_approved: false, routing_number: '', approval_status: '' };
      } else {
        result[itemNum] = {
          routing_exists: true,
          routing_approved: false,
          routing_number: anyRows[0].process_route_number,
          approval_status: anyRows[0].approval_status || ''
        };
      }
    }

    res.json(success(result));
  } catch (err) {
    next(err);
  }
};
