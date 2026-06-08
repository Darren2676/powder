import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import dayjs from 'dayjs';
import { generateTaskNumber } from '@/services/documentNumber.service';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { BusinessError } from '@/shared/errors/BusinessError';
import { generateFromOrderCore } from '@/services/orderDispatch.service';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

const selectCols = 'process_task_number, production_order_number, production_number, process_route_number, step_number, item_number, item_name, specifications, basic_unit, planned_quantity, completed_quantity, standard_process_number, standard_process_name, work_center_number, work_center_name, process_material_input_number, process_material_input_quantity, process_material_input_unit, material_wastage_rate, excess_reporting_ratio, ingredient_addition_method, planned_start_time, planned_end_time, actual_start_time, actual_end_time, task_status, inspect_status, inspect_type, inspect_plan_name, inspect_spec_name, inspector_number, inspector_name, attachment_info, technical_requirement, approval_status, remark, creation_date, creation_man';

const exportFields = ['process_task_number', 'production_order_number', 'production_number', 'step_number', 'standard_process_number', 'standard_process_name', 'item_number', 'item_name', 'specifications', 'basic_unit', 'planned_quantity', 'completed_quantity', 'work_center_number', 'work_center_name', 'task_status', 'inspect_status', 'inspect_type', 'inspect_plan_name', 'inspect_spec_name', 'inspector_number', 'inspector_name', 'attachment_info', 'technical_requirement', 'approval_status', 'factory_id', 'remark'];
const exportHeaders = ['工序任务编号', '生产单编号', '生产计划编号', '工序序号', '标准工序编号', '标准工序名称', '产品编号', '产品名称', '规格', '单位', '计划数量', '已完成数量', '工作中心编号', '工作中心名称', '任务状态', '检验状态', '检验类型', '检验方案', '检验规范', '检验人编号', '检验人', '附件信息', '技术要求', '审批状态', '所属工厂', '备注'];

// 获取列表
export const getProcessTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const task_status = (req.query.task_status as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const production_order_number = (req.query.production_order_number as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(pt.process_task_number LIKE :search OR pt.production_order_number LIKE :search OR pt.item_number LIKE :search OR pt.item_name LIKE :search OR pt.standard_process_name LIKE :search OR pt.work_center_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (task_status) {
      conditions.push(`pt.task_status = :task_status`);
      replacements.task_status = task_status;
    }
    if (approval_status) {
      conditions.push(`pt.approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }
    if (production_order_number) {
      conditions.push(`pt.production_order_number = :production_order_number`);
      replacements.production_order_number = production_order_number;
    }

    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      conditions.push(`pt.factory_id = :_factoryId`);
      replacements._factoryId = effectiveFactoryId;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM process_task pt ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT ${selectCols}, ISNULL(f.factory_short, f.factory_name) as factory_short, f.factory_name, pt.factory_id,
               ROW_NUMBER() OVER (ORDER BY pt.process_task_number DESC) AS _row_num
        FROM process_task pt
        LEFT JOIN factory f ON pt.factory_id = f.id
        ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取工序任务列表成功'));
  } catch (err) { next(err); }
};

// 新建
export const createProcessTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const user = (req as any).user;
    const b = req.body;

    if (!b.standard_process_number && !b.standard_process_name) {
      res.status(400).json({ success: false, message: '标准工序不能为空' });
      return;
    }

    const process_task_number = await generateTaskNumber(factoryCode);
    const now = dayjs().format('YYYY/MM/DD HH:mm');

    await sequelize.query(`
      INSERT INTO process_task (process_task_number, production_order_number, production_number, process_route_number, step_number, item_number, item_name, specifications, basic_unit, planned_quantity, completed_quantity, standard_process_number, standard_process_name, work_center_number, work_center_name, process_material_input_number, process_material_input_quantity, process_material_input_unit, material_wastage_rate, excess_reporting_ratio, ingredient_addition_method, planned_start_time, planned_end_time, inspector_number, inspector_name, attachment_info, technical_requirement, task_status, approval_status, remark, factory_id, creation_date, creation_man, operator)
      VALUES (:process_task_number, :production_order_number, :production_number, :process_route_number, :step_number, :item_number, :item_name, :specifications, :basic_unit, :planned_quantity, 0, :standard_process_number, :standard_process_name, :work_center_number, :work_center_name, :process_material_input_number, :process_material_input_quantity, :process_material_input_unit, :material_wastage_rate, :excess_reporting_ratio, :ingredient_addition_method, :planned_start_time, :planned_end_time, :inspector_number, :inspector_name, :attachment_info, :technical_requirement, N'未开始', N'草稿', :remark, :factory_id, :creation_date, :creation_man, :operator)
    `, {
      replacements: {
        process_task_number,
        production_order_number: b.production_order_number || null,
        production_number: b.production_number || null,
        process_route_number: b.process_route_number || null,
        step_number: b.step_number || null,
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        specifications: b.specifications || '',
        basic_unit: b.basic_unit || '',
        planned_quantity: b.planned_quantity || 0,
        standard_process_number: b.standard_process_number || '',
        standard_process_name: b.standard_process_name || '',
        work_center_number: b.work_center_number || '',
        work_center_name: b.work_center_name || '',
        process_material_input_number: b.process_material_input_number || '',
        process_material_input_quantity: b.process_material_input_quantity || '',
        process_material_input_unit: b.process_material_input_unit || '',
        material_wastage_rate: b.material_wastage_rate || '',
        excess_reporting_ratio: b.excess_reporting_ratio || '',
        ingredient_addition_method: b.ingredient_addition_method || '',
        planned_start_time: b.planned_start_time || null,
        planned_end_time: b.planned_end_time || null,
        inspector_number: b.inspector_number || '',
        inspector_name: b.inspector_name || '',
        attachment_info: b.attachment_info || '',
        technical_requirement: b.technical_requirement || '',
        remark: b.remark || '',
        factory_id: _factoryId,
        creation_date: now,
        creation_man: user?.username || '',
        operator: b.operator || user?.username || ''
      }
    });

    res.json(success({ process_task_number }, '创建工序任务成功'));
  } catch (err) { next(err); }
};

// 编辑
export const updateProcessTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM process_task WHERE process_task_number = :id${factoryCond}`, { replacements: { id, ...(_factoryId !== null ? { _factoryId } : {}) } });
    if (!chk.length) { res.status(404).json({ success: false, message: '工序任务不存在' }); return; }
    if (chk[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return; }

    const b = req.body;
    await sequelize.query(`
      UPDATE process_task SET
        production_order_number = :production_order_number,
        production_number = :production_number,
        process_route_number = :process_route_number,
        step_number = :step_number,
        item_number = :item_number,
        item_name = :item_name,
        specifications = :specifications,
        basic_unit = :basic_unit,
        planned_quantity = :planned_quantity,
        standard_process_number = :standard_process_number,
        standard_process_name = :standard_process_name,
        work_center_number = :work_center_number,
        work_center_name = :work_center_name,
        process_material_input_number = :process_material_input_number,
        process_material_input_quantity = :process_material_input_quantity,
        process_material_input_unit = :process_material_input_unit,
        material_wastage_rate = :material_wastage_rate,
        excess_reporting_ratio = :excess_reporting_ratio,
        ingredient_addition_method = :ingredient_addition_method,
        planned_start_time = :planned_start_time,
        planned_end_time = :planned_end_time,
        inspector_number = :inspector_number,
        inspector_name = :inspector_name,
        attachment_info = :attachment_info,
        technical_requirement = :technical_requirement,
        remark = :remark
      WHERE process_task_number = :id${factoryCond}
    `, {
      replacements: {
        id,
        production_order_number: b.production_order_number || null,
        production_number: b.production_number || null,
        process_route_number: b.process_route_number || null,
        step_number: b.step_number || null,
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        specifications: b.specifications || '',
        basic_unit: b.basic_unit || '',
        planned_quantity: b.planned_quantity || 0,
        standard_process_number: b.standard_process_number || '',
        standard_process_name: b.standard_process_name || '',
        work_center_number: b.work_center_number || '',
        work_center_name: b.work_center_name || '',
        process_material_input_number: b.process_material_input_number || '',
        process_material_input_quantity: b.process_material_input_quantity || '',
        process_material_input_unit: b.process_material_input_unit || '',
        material_wastage_rate: b.material_wastage_rate || '',
        excess_reporting_ratio: b.excess_reporting_ratio || '',
        ingredient_addition_method: b.ingredient_addition_method || '',
        planned_start_time: b.planned_start_time || null,
        planned_end_time: b.planned_end_time || null,
        inspector_number: b.inspector_number || '',
        inspector_name: b.inspector_name || '',
        attachment_info: b.attachment_info || '',
        technical_requirement: b.technical_requirement || '',
        remark: b.remark || ''
      , ...(_factoryId !== null ? { _factoryId } : {}) }
    });

    res.json(success(null, '更新工序任务成功'));
  } catch (err) { next(err); }
};

// 删除
export const deleteProcessTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM process_task WHERE process_task_number = :id${factoryCond}`, { replacements: { id, ...(_factoryId !== null ? { _factoryId } : {}) } });
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return; }
    await sequelize.query(`DELETE FROM process_task WHERE process_task_number = :id${factoryCond}`, { replacements: { id, ...(_factoryId !== null ? { _factoryId } : {}) } });
    res.json(success(null, '删除工序任务成功'));
  } catch (err) { next(err); }
};

// 批量删除
export const batchDeleteProcessTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, message: '请选择要删除的记录' });
      return;
    }

    const succeeded: string[] = [];
    const failed: { record_id: string; message: string }[] = [];

    const _factoryId = getFactoryId(req);

    for (const id of ids) {
      try {
        const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
        const [chk]: any = await sequelize.query(
          `SELECT approval_status FROM process_task WHERE process_task_number = :id${factoryCond}`,
          { replacements: { id, ...(_factoryId !== null ? { _factoryId } : {}) } }
        );
        if (!chk.length) {
          failed.push({ record_id: id, message: '记录不存在' });
          continue;
        }
        if (chk[0].approval_status !== ORDER_STATUS.DRAFT) {
          failed.push({ record_id: id, message: '已提交审批或已审批的记录不允许删除' });
          continue;
        }
        await sequelize.query(`DELETE FROM process_task WHERE process_task_number = :id${factoryCond}`, { replacements: { id, ...(_factoryId !== null ? { _factoryId } : {}) } });
        succeeded.push(id);
      } catch (e: any) {
        failed.push({ record_id: id, message: e.message || '删除失败' });
      }
    }

    res.json(success({ succeeded, failed }, `批量删除完成：成功 ${succeeded.length} 条，失败 ${failed.length} 条`));
  } catch (err) { next(err); }
};

// 导出
export const exportProcessTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    let factoryCond = '';
    const reps: any = {};
    if (effectiveFactoryId !== null) {
      factoryCond = 'WHERE pt.factory_id = :_factoryId';
      reps._factoryId = effectiveFactoryId;
    }
    const [items]: any = await sequelize.query(`SELECT pt.process_task_number, pt.production_order_number, pt.production_number, pt.step_number, pt.standard_process_number, pt.standard_process_name, pt.item_number, pt.item_name, pt.specifications, pt.basic_unit, pt.planned_quantity, pt.completed_quantity, pt.work_center_number, pt.work_center_name, pt.task_status, pt.inspect_status, pt.inspect_type, pt.inspect_plan_name, pt.inspect_spec_name, pt.inspector_number, pt.inspector_name, pt.attachment_info, pt.technical_requirement, pt.approval_status, ISNULL(f.factory_short, f.factory_name) as factory_id, pt.remark FROM process_task pt LEFT JOIN factory f ON pt.factory_id = f.id ${factoryCond} ORDER BY pt.process_task_number DESC`, { replacements: reps });
    exportToExcel(items, exportFields, exportHeaders, 'process_tasks', res);
  } catch (err) { next(err); }
};

// 导入
export const importProcessTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, exportFields, exportHeaders);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }

    let imported = 0;
    for (const item of rows) {
      try {
        const factoryCode = await getFactoryCode(req);
        if (!item.process_task_number) item.process_task_number = await generateTaskNumber(factoryCode);
        const [existing]: any = await sequelize.query(
          `SELECT COUNT(*) as cnt FROM process_task WHERE process_task_number = :n`,
          { replacements: { n: item.process_task_number } }
        );
        if (existing[0].cnt > 0) continue; // skip duplicates
        await sequelize.query(`
          INSERT INTO process_task (process_task_number, production_order_number, production_number, step_number, standard_process_number, standard_process_name, item_number, item_name, specifications, basic_unit, planned_quantity, completed_quantity, work_center_number, work_center_name, inspector_number, inspector_name, attachment_info, technical_requirement, task_status, approval_status, remark, factory_id, operator)
          VALUES (:process_task_number, :production_order_number, :production_number, :step_number, :standard_process_number, :standard_process_name, :item_number, :item_name, :specifications, :basic_unit, :planned_quantity, 0, :work_center_number, :work_center_name, :inspector_number, :inspector_name, :attachment_info, :technical_requirement, :task_status, :approval_status, :remark, :factory_id, :operator)
        `, { replacements: { ...item, planned_quantity: item.planned_quantity || 0, task_status: item.task_status || '未开始', approval_status: item.approval_status || ORDER_STATUS.DRAFT, operator: item.operator || '', factory_id: _factoryId } });
        imported++;
      } catch (e) {}
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条工序任务`));
  } catch (err) { next(err); }
};

// ==================== 从生产单拆解生成工序任务 ====================
export const generateFromOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { production_order_numbers } = req.body;
    const user = (req as any).user;

    if (!production_order_numbers || !Array.isArray(production_order_numbers) || production_order_numbers.length === 0) {
      res.status(400).json({ success: false, message: '请选择要拆解的生产单' });
      return;
    }

    const results = await generateFromOrderCore(production_order_numbers, user?.username || 'system');

    const msg = results.taskCount > 0
      ? `成功从 ${results.orderCount} 张生产单生成 ${results.taskCount} 条工序任务`
      : '未生成任何工序任务';
    const skippedMsg = results.skipped.length > 0
      ? `，跳过 ${results.skipped.length} 条：` + results.skipped.map((s: any) => s.reason).join('；')
      : '';

    res.json(success(results, msg + skippedMsg));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 按生产单获取工序任务（连续报工用） ====================
export const getTasksByOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderNo = req.params.orderNo;
    if (!orderNo) {
      res.status(400).json({ success: false, message: '生产单编号不能为空' });
      return;
    }

    // 1. 查询生产单基本信息（含工厂信息）
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    const factoryCond = effectiveFactoryId !== null ? ' AND po.factory_id = :_factoryId' : '';
    const [orders]: any = await sequelize.query(
      `SELECT po.production_order_number, po.production_number, po.item_number, po.item_name, po.specifications, po.basic_unit, po.planned_quantity, po.plan_status, po.equipment_number, po.equipment_name, po.mould_number, po.production_date, po.schedule_id, po.actual_daily_output, po.approval_status, po.factory_id, ISNULL(f.factory_short, f.factory_name) as factory_short, f.factory_name FROM production_order po LEFT JOIN factory f ON po.factory_id = f.id WHERE po.production_order_number = :orderNo${factoryCond}`,
      { replacements: { orderNo, ...(effectiveFactoryId !== null ? { _factoryId: effectiveFactoryId } : {}) } }
    );
    if (orders.length === 0) {
      res.status(404).json({ success: false, message: `生产单 ${orderNo} 不存在` });
      return;
    }
    const order = orders[0];

    // 1.5 查询班次名称
    if (order.schedule_id) {
      const [schRows]: any = await sequelize.query(
        `SELECT TOP 1 schedules_name FROM schedules WHERE schedules_id = :sid`,
        { replacements: { sid: order.schedule_id } }
      );
      order.schedule_name = schRows.length > 0 ? schRows[0].schedules_name : '';
    } else {
      order.schedule_name = '';
    }

    // 2. 查询该单所有工序任务
    const [tasks]: any = await sequelize.query(
      `SELECT process_task_number, step_number, standard_process_number, standard_process_name, item_number, item_name, specifications, basic_unit, work_center_number, work_center_name, planned_quantity, completed_quantity, excess_reporting_ratio, task_status, approval_status, operator, ISNULL(is_backflush, 0) as is_backflush FROM process_task WHERE production_order_number = :orderNo ORDER BY step_number ASC`,
      { replacements: { orderNo } }
    );

    if (tasks.length === 0) {
      res.json(success({ order, tasks: [] }, '该生产单尚无工序任务，请先进行工序拆解'));
      return;
    }

    // 3. 统计每道工序的报工次数和已报工总产出
    const [reportCounts]: any = await sequelize.query(
      `SELECT process_task_number, COUNT(*) as report_count, ISNULL(SUM(ISNULL(qualified_quantity,0) + ISNULL(unqualified_quantity,0)), 0) as total_reported_qty FROM work_report WHERE production_order_number = :orderNo GROUP BY process_task_number`,
      { replacements: { orderNo } }
    );
    const reportCountMap: Record<string, number> = {};
    const totalReportedQtyMap: Record<string, number> = {};
    for (const rc of reportCounts) {
      reportCountMap[rc.process_task_number] = rc.report_count;
      totalReportedQtyMap[rc.process_task_number] = parseFloat(rc.total_reported_qty) || 0;
    }

    // 3.5 批量查询每道工序的备料状态（物料门控用）
    const [matPrepRows]: any = await sequelize.query(`
      SELECT mpd.step_number,
             COUNT(*) as total,
             SUM(CASE WHEN ISNULL(mpd.issued_quantity, 0) >= ISNULL(mpd.required_quantity, 0) AND ISNULL(mpd.required_quantity, 0) > 0 THEN 1 ELSE 0 END) as fully_issued,
             SUM(CASE WHEN ISNULL(mpd.issued_quantity, 0) > 0 THEN 1 ELSE 0 END) as partially_issued
      FROM material_preparation_detail mpd
      INNER JOIN material_preparation mp ON mpd.preparation_number = mp.preparation_number
      WHERE mp.production_order_number = :orderNo AND mpd.step_number IS NOT NULL
      GROUP BY mpd.step_number
    `, { replacements: { orderNo } });
    const matGateMap: Record<number, { total: number; fullyIssued: number; partiallyIssued: number }> = {};
    for (const row of matPrepRows) {
      matGateMap[row.step_number] = {
        total: parseInt(row.total) || 0,
        fullyIssued: parseInt(row.fully_issued) || 0,
        partiallyIssued: parseInt(row.partially_issued) || 0
      };
    }
    const firstStepNumber = tasks.length > 0 ? tasks[0].step_number : null;

    // 4. 为每道工序计算额外字段
    const enrichedTasks = tasks.map((task: any, index: number) => {
      const plannedQty = parseFloat(task.planned_quantity) || 0;
      const completedQty = parseFloat(task.completed_quantity) || 0;
      const excessRatio = parseFloat(task.excess_reporting_ratio) || 0;
      const actualDaily = parseFloat(order.actual_daily_output) || 0;
      const baseQty = actualDaily > 0 ? actualDaily : plannedQty;
      const maxAllowed = baseQty * (1 + excessRatio / 100);
      const remaining = Math.round((plannedQty - completedQty) * 10000) / 10000;
      let maxReportable = Math.round((maxAllowed - completedQty) * 10000) / 10000;

      // 跨工序限制已移至报工提交接口（quickReport/createWorkReport）中校验
      // 连续报工场景下串行提交，前道完成后后道自然满足约束，此处不再限制显示

      let canReport = task.approval_status === '已审批' && task.task_status !== '已完成' && task.task_status !== '已关闭' && maxReportable > 0;

      // === 物料门控状态计算 ===
      let materialGateStatus: 'passed' | 'blocked' = 'passed';
      let materialGateReason = '';
      const isFirstStep = firstStepNumber != null && task.step_number === firstStepNumber;
      const planStatus = order.plan_status || '';

      if (isFirstStep) {
        // 首道工序：需生产单状态为"已备料"或更后面，或首道倒冲（is_backflush=1）允许跳过领料
        const isBackflush = parseInt(task.is_backflush) === 1;
        if ((planStatus === '未开始' || planStatus === '已派发') && !isBackflush) {
          materialGateStatus = 'blocked';
          materialGateReason = '首道工序需先完成物料领料（当前状态：' + planStatus + '）';
          canReport = false;
        }
      } else {
        // 非首道工序：检查该工序是否有备料清单且尚未领料
        const matGate = matGateMap[task.step_number];
        if (matGate && matGate.total > 0 && matGate.partiallyIssued === 0) {
          materialGateStatus = 'blocked';
          materialGateReason = `工序 ${task.step_number} - ${task.standard_process_name || ''} 有 ${matGate.total} 种物料尚未领料，请先完成该工序的备料`;
          canReport = false;
        }
      }

      return {
        ...task,
        remaining_quantity: remaining,
        max_reportable: maxReportable,
        report_count: reportCountMap[task.process_task_number] || 0,
        total_reported_qty: totalReportedQtyMap[task.process_task_number] || 0,
        can_report: canReport,
        material_gate_status: materialGateStatus,
        material_gate_reason: materialGateReason
      };
    });

    res.json(success({ order, tasks: enrichedTasks }, '获取工序任务成功'));
  } catch (err) { next(err); }
};

// 获取已审批生产单列表（供弹窗选择，包含工艺路线匹配状态预检）
export const getOrdersForGenerate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';

    let whereClause = `WHERE approval_status = N'已审批'`;
    const replacements: any = {};

    if (search) {
      whereClause += ` AND (production_order_number LIKE :search OR production_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    // 多工厂数据隔离
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      whereClause += ' AND factory_id = :_factoryId';
      replacements._factoryId = effectiveFactoryId;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM production_order ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT production_order_number, production_number, item_number, item_name, specifications, basic_unit, planned_quantity, approval_status, ROW_NUMBER() OVER (ORDER BY production_order_number DESC) AS _row_num
        FROM production_order ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    // 预检每张生产单的工艺路线匹配状态
    const enrichedItems = [];
    for (const item of items) {
      const { _row_num, ...order } = item;
      // 查匹配的工艺路线
      const [routings]: any = await sequelize.query(
        `SELECT TOP 1 process_route_number FROM routing_header WHERE item_number = :item_number AND condition = N'启用' AND approval_status = N'已审批'`,
        { replacements: { item_number: order.item_number } }
      );
      if (routings.length > 0) {
        const [detailCount]: any = await sequelize.query(
          `SELECT COUNT(*) as cnt FROM routing_detail WHERE process_route_number = :prn`,
          { replacements: { prn: routings[0].process_route_number } }
        );
        order.routing_matched = true;
        order.routing_process_count = detailCount[0].cnt;
        order.process_route_number = routings[0].process_route_number;
      } else {
        order.routing_matched = false;
        order.routing_process_count = 0;
        order.process_route_number = null;
      }
      // 查已生成的工序任务数
      const [taskCount]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM process_task WHERE production_order_number = :orderNo`,
        { replacements: { orderNo: order.production_order_number } }
      );
      order.existing_task_count = taskCount[0].cnt;
      enrichedItems.push(order);
    }

    res.json(success({
      items: enrichedItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取已审批生产单列表成功'));
  } catch (err) { next(err); }
};

// 获取可报工的生产单列表（按生产日期倒序，移动端扫码报工用）
export const getOrdersForReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 15;
    const search = (req.query.search as string) || '';

    let whereClause = `WHERE approval_status = N'已审批' AND plan_status IN (N'已派发', N'已备料', N'生产中')`;
    const replacements: any = {};

    if (search) {
      whereClause += ` AND (production_order_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    // 多工厂数据隔离
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      whereClause += ' AND factory_id = :_factoryId';
      replacements._factoryId = _factoryId;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM production_order ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT production_order_number, item_number, item_name, specifications,
               basic_unit, planned_quantity, plan_status, production_date,
               ROW_NUMBER() OVER (ORDER BY production_date DESC, production_order_number DESC) AS _row_num
        FROM production_order ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    // 附加工序任务统计
    const enrichedItems = [];
    for (const item of items) {
      const { _row_num, ...order } = item;
      const [taskStats]: any = await sequelize.query(
        `SELECT COUNT(*) as task_count, SUM(CASE WHEN task_status = N'已完成' THEN 1 ELSE 0 END) as completed_task_count FROM process_task WHERE production_order_number = :orderNo`,
        { replacements: { orderNo: order.production_order_number } }
      );
      order.task_count = parseInt(taskStats[0]?.task_count) || 0;
      order.completed_task_count = parseInt(taskStats[0]?.completed_task_count) || 0;
      enrichedItems.push(order);
    }

    res.json(success({
      items: enrichedItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取可报工生产单列表成功'));
  } catch (err) { next(err); }
};
