import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { createNonconformingFromInspection } from '../nonconformingProduct/nonconformingProduct.controller';
import dayjs from 'dayjs';

// ==================== 编号生成 ====================
const generateInspectionNumber = async (transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `QI-${today}-`;
  const txOpt = transaction ? { transaction } : {};
  const [rows]: any = await sequelize.query(
    `SELECT MAX(inspection_number) as max_num FROM production_inspection WHERE inspection_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' }, ...txOpt }
  );
  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 分页列表 ====================
export const getProductionInspections = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const inspect_type = (req.query.inspect_type as string) || '';
    const inspection_result = (req.query.inspection_result as string) || '';
    const status = (req.query.status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};
    if (search) {
      conditions.push(`(inspection_number LIKE :search OR production_order_number LIKE :search OR process_task_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (inspect_type) { conditions.push(`inspect_type = :inspect_type`); replacements.inspect_type = inspect_type; }
    if (inspection_result) { conditions.push(`inspection_result = :inspection_result`); replacements.inspection_result = inspection_result; }
    if (status) { conditions.push(`status = :status`); replacements.status = status; }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM production_inspection ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC, inspection_number DESC) AS _row_num
        FROM production_inspection ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取生产检验列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情（含明细项） ====================
export const getProductionInspectionDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [records]: any = await sequelize.query(`SELECT * FROM production_inspection WHERE inspection_number = :id`, { replacements: { id } });
    if (!records.length) { res.status(404).json({ success: false, message: '检验记录不存在' }); return; }
    const [items]: any = await sequelize.query(`SELECT * FROM production_inspection_item WHERE inspection_number = :id ORDER BY sort_order`, { replacements: { id } });
    res.json(success({ ...records[0], items }, '获取检验详情成功'));
  } catch (err) { next(err); }
};

// ==================== 按生产单查询 ====================
export const getInspectionsByOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderNo } = req.params;
    const [items]: any = await sequelize.query(
      `SELECT * FROM production_inspection WHERE production_order_number = :orderNo ORDER BY step_number, inspect_type`,
      { replacements: { orderNo } }
    );
    res.json(success(items, '获取生产单检验记录成功'));
  } catch (err) { next(err); }
};

// ==================== 更新检验结果 ====================
export const updateProductionInspection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    // 检查状态
    const [chk]: any = await sequelize.query(`SELECT status FROM production_inspection WHERE inspection_number = :id`, { replacements: { id } });
    if (!chk.length) { res.status(404).json({ success: false, message: '检验记录不存在' }); return; }
    if (chk[0].status === '已完成') { res.status(403).json({ success: false, message: '已完成的检验记录不允许修改' }); return; }

    const transaction = await sequelize.transaction();
    try {
      // 更新主表
      await sequelize.query(`
        UPDATE production_inspection SET
          qualified_quantity = :qualified_quantity,
          unqualified_quantity = :unqualified_quantity,
          inspector_number = :inspector_number,
          inspector_name = :inspector_name,
          inspection_date = :inspection_date,
          status = N'检验中',
          remark = :remark
        WHERE inspection_number = :id
      `, {
        replacements: {
          id,
          qualified_quantity: b.qualified_quantity != null ? Number(b.qualified_quantity) : 0,
          unqualified_quantity: b.unqualified_quantity != null ? Number(b.unqualified_quantity) : 0,
          inspector_number: b.inspector_number || '',
          inspector_name: b.inspector_name || '',
          inspection_date: b.inspection_date || dayjs().format('YYYY/MM/DD HH:mm'),
          remark: b.remark || ''
        },
        transaction
      });

      // 更新明细项
      if (Array.isArray(b.items)) {
        for (const item of b.items) {
          if (!item.id) continue;
          await sequelize.query(`
            UPDATE production_inspection_item SET
              actual_value = :actual_value,
              item_result = :item_result,
              remark = :remark
            WHERE id = :id
          `, {
            replacements: {
              id: item.id,
              actual_value: item.actual_value || '',
              item_result: item.item_result || '',
              remark: item.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success(null, '更新检验记录成功'));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 完成检验 ====================
export const completeInspection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [records]: any = await sequelize.query(`SELECT * FROM production_inspection WHERE inspection_number = :id`, { replacements: { id } });
    if (!records.length) { res.status(404).json({ success: false, message: '检验记录不存在' }); return; }
    const record = records[0];
    if (record.status === '已完成') { res.status(403).json({ success: false, message: '该检验记录已完成' }); return; }

    const qualifiedQty = parseFloat(record.qualified_quantity) || 0;
    const unqualifiedQty = parseFloat(record.unqualified_quantity) || 0;
    const totalQty = parseFloat(record.total_quantity) || 0;

    // 判定结果：如果不合格数量 > 0 则为不合格，否则合格
    const result = unqualifiedQty > 0 ? '不合格' : '合格';

    await sequelize.query(`
      UPDATE production_inspection SET
        inspection_result = :result,
        status = N'已完成',
        inspection_date = :inspection_date
      WHERE inspection_number = :id
    `, {
      replacements: {
        id,
        result,
        inspection_date: dayjs().format('YYYY/MM/DD HH:mm')
      }
    });

    // 回写工序任务检验状态
    const inspectStatus = result === '合格' ? '检验合格' : '检验不合格';
    await sequelize.query(
      `UPDATE process_task SET inspect_status = :inspectStatus WHERE process_task_number = :taskNo`,
      { replacements: { inspectStatus, taskNo: record.process_task_number } }
    );

    res.json(success({ inspection_result: result }, `检验完成，判定结果：${result}`));
  } catch (err) { next(err); }
};

// ==================== 不合格品处理 ====================
export const defectHandling = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const inspectionNumber = String(id);

    const [records]: any = await sequelize.query(`SELECT * FROM production_inspection WHERE inspection_number = :id`, { replacements: { id } });
    if (!records.length) { res.status(404).json({ success: false, message: '检验记录不存在' }); return; }
    const record = records[0];
    if (record.inspection_result !== '不合格') { res.status(400).json({ success: false, message: '仅不合格的检验记录可进行不合格品处理' }); return; }
    if (record.defect_handling) { res.status(400).json({ success: false, message: `该检验记录已进行过不合格品处理（${record.defect_handling}），不可重复操作` }); return; }

    const unqualifiedQty = parseFloat(record.unqualified_quantity) || 0;
    const transaction = await sequelize.transaction();

    try {
      // 仅创建NC待处理单，不再同步执行处理动作
      // 处理方式由人工在"不合格品处理"页面选择
      const ncNumber = await createNonconformingFromInspection({
        source_type: '生产检验',
        source_number: inspectionNumber,
        item_number: record.item_number || '',
        item_name: record.item_name || '',
        specifications: record.specifications || '',
        unqualified_quantity: unqualifiedQty,
        production_order_number: record.production_order_number || '',
        step_number: record.step_number || 0,
        creation_man: (req as any).user?.username || '',
        inspection_table: 'production_inspection'
      }, transaction);

      // 标记检验单缺陷处理为"待处理"
      await sequelize.query(`
        UPDATE production_inspection SET defect_handling = N'待处理' WHERE inspection_number = :id
      `, { replacements: { id }, transaction });

      await transaction.commit();
      res.json(success({ nonconforming_number: ncNumber }, `不合格品待处理单已创建：${ncNumber}，请在不合格品处理页面选择处理方式`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['inspection_number', 'work_report_number', 'process_task_number', 'production_order_number', 'step_number', 'standard_process_name', 'item_number', 'item_name', 'inspect_type', 'inspection_plan_name', 'inspection_spec_name', 'total_quantity', 'qualified_quantity', 'unqualified_quantity', 'inspection_result', 'inspector_name', 'inspection_date', 'defect_handling', 'status', 'remark'];
const exportHeaders = ['检验单号', '报工单号', '工序任务号', '生产单号', '工序序号', '工序名称', '产品编号', '产品名称', '检验类型', '检验方案', '检验规范', '送检数量', '合格数量', '不合格数量', '检验结果', '检验员', '检验日期', '不合格处理', '状态', '备注'];

export const exportProductionInspections = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM production_inspection ORDER BY creation_date DESC`);
    exportToExcel(items, exportFields, exportHeaders, 'production_inspections', res);
  } catch (err) { next(err); }
};

// ==================== 删除检验记录 ====================
export const deleteProductionInspection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const inspectionNumber = String(id);

    const [records]: any = await sequelize.query(
      `SELECT * FROM production_inspection WHERE inspection_number = :id`,
      { replacements: { id: inspectionNumber } }
    );
    if (!records.length) {
      res.status(404).json({ success: false, message: '检验记录不存在' });
      return;
    }
    const record = records[0];

    // 仅允许删除 待检/检验中 状态的记录；已完成 或 已处理 的不允许删除
    if (record.status === '已完成') {
      res.status(403).json({ success: false, message: '已完成的检验记录不允许删除。如需撤销，请使用连续报工页面的「撤销重报」功能。' });
      return;
    }

    const transaction = await sequelize.transaction();
    try {
      // 删除检验明细项
      await sequelize.query(
        `DELETE FROM production_inspection_item WHERE inspection_number = :id`,
        { replacements: { id: inspectionNumber }, transaction }
      );

      // 删除检验主记录
      await sequelize.query(
        `DELETE FROM production_inspection WHERE inspection_number = :id`,
        { replacements: { id: inspectionNumber }, transaction }
      );

      // 清除关联工序任务的 inspect_status
      if (record.process_task_number) {
        await sequelize.query(
          `UPDATE process_task SET inspect_status = NULL WHERE process_task_number = :taskNo`,
          { replacements: { taskNo: record.process_task_number }, transaction }
        );
      }

      await transaction.commit();
      res.json(success(null, `检验记录「${inspectionNumber}」已删除`));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 创建检验记录（供报工服务调用） ====================
export const createInspectionFromWorkReport = async (params: {
  work_report_number: string;
  process_task_number: string;
  production_order_number: string;
  step_number: number;
  standard_process_name: string;
  item_number: string;
  item_name: string;
  specifications: string;
  inspect_type: string;
  inspection_plan_name: string;
  inspection_spec_name: string;
  total_quantity: number;
  creation_man: string;
}, transaction?: any): Promise<string> => {
  const txOpt = transaction ? { transaction } : {};
  const inspectionNumber = await generateInspectionNumber(transaction);
  const now = dayjs().format('YYYY/MM/DD HH:mm');

  await sequelize.query(`
    INSERT INTO production_inspection (inspection_number, work_report_number, process_task_number, production_order_number, step_number, standard_process_name, item_number, item_name, specifications, inspect_type, inspection_plan_name, inspection_spec_name, total_quantity, qualified_quantity, unqualified_quantity, inspection_result, status, creation_date, creation_man)
    VALUES (:inspection_number, :work_report_number, :process_task_number, :production_order_number, :step_number, :standard_process_name, :item_number, :item_name, :specifications, :inspect_type, :inspection_plan_name, :inspection_spec_name, :total_quantity, 0, 0, N'待检', N'待检', :creation_date, :creation_man)
  `, {
    replacements: {
      inspection_number: inspectionNumber,
      work_report_number: params.work_report_number,
      process_task_number: params.process_task_number,
      production_order_number: params.production_order_number,
      step_number: params.step_number,
      standard_process_name: params.standard_process_name,
      item_number: params.item_number,
      item_name: params.item_name,
      specifications: params.specifications,
      inspect_type: params.inspect_type,
      inspection_plan_name: params.inspection_plan_name,
      inspection_spec_name: params.inspection_spec_name,
      total_quantity: params.total_quantity,
      creation_date: now,
      creation_man: params.creation_man
    },
    ...txOpt
  });

  // 根据检验规范复制明细项
  if (params.inspection_spec_name) {
    const [specItems]: any = await sequelize.query(
      `SELECT char_name, inspect_requirement, data_type, upper_limit, standard_value, lower_limit, sort_order FROM inspection_spec_item WHERE spec_name = :specName ORDER BY sort_order`,
      { replacements: { specName: params.inspection_spec_name }, ...txOpt }
    );
    for (const si of specItems) {
      await sequelize.query(`
        INSERT INTO production_inspection_item (inspection_number, char_name, inspect_requirement, data_type, upper_limit, standard_value, lower_limit, sort_order)
        VALUES (:inspection_number, :char_name, :inspect_requirement, :data_type, :upper_limit, :standard_value, :lower_limit, :sort_order)
      `, {
        replacements: {
          inspection_number: inspectionNumber,
          char_name: si.char_name || '',
          inspect_requirement: si.inspect_requirement || '',
          data_type: si.data_type || '',
          upper_limit: si.upper_limit,
          standard_value: si.standard_value,
          lower_limit: si.lower_limit,
          sort_order: si.sort_order || 0
        },
        ...txOpt
      });
    }
  }

  return inspectionNumber;
};
