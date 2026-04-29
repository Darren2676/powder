import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
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
    const b = req.body;
    const handling = b.defect_handling; // 返修 / 报废 / 让步接收

    const [records]: any = await sequelize.query(`SELECT * FROM production_inspection WHERE inspection_number = :id`, { replacements: { id } });
    if (!records.length) { res.status(404).json({ success: false, message: '检验记录不存在' }); return; }
    const record = records[0];
    if (record.inspection_result !== '不合格') { res.status(400).json({ success: false, message: '仅不合格的检验记录可进行不合格品处理' }); return; }
    if (record.defect_handling) { res.status(400).json({ success: false, message: `该检验记录已进行过不合格品处理（${record.defect_handling}），不可重复操作` }); return; }

    const unqualifiedQty = parseFloat(record.unqualified_quantity) || 0;
    const transaction = await sequelize.transaction();

    try {
      if (handling === '返修') {
        const reworkStep = b.rework_step_number;
        if (!reworkStep) { await transaction.rollback(); res.status(400).json({ success: false, message: '返修处理必须指定返修目标工序号' }); return; }

        // 将不合格数量加回目标工序的计划量
        await sequelize.query(`
          UPDATE process_task SET planned_quantity = planned_quantity + :qty
          WHERE production_order_number = :orderNo AND step_number = :step
        `, {
          replacements: { qty: unqualifiedQty, orderNo: record.production_order_number, step: reworkStep },
          transaction
        });

        await sequelize.query(`
          UPDATE production_inspection SET defect_handling = N'返修', rework_step_number = :reworkStep WHERE inspection_number = :id
        `, { replacements: { id, reworkStep }, transaction });

        // 返修：目标工序状态回退
        await sequelize.query(`
          UPDATE process_task SET task_status = N'未开始', inspect_status = N'无需检', completed_quantity = 0
          WHERE production_order_number = :orderNo AND step_number = :step
        `, { replacements: { orderNo: record.production_order_number, step: reworkStep }, transaction });

        // 返修：生产单回退为生产中
        await sequelize.query(
          `UPDATE production_order SET plan_status = N'生产中' WHERE production_order_number = :orderNo AND plan_status = N'已完成'`,
          { replacements: { orderNo: record.production_order_number }, transaction }
        );
        // 回写销售订单
        const { syncProductionStatus } = await import('@/services/salesOrderSync.service');
        await syncProductionStatus(record.production_order_number, '生产中', transaction);

      } else if (handling === '报废') {
        const scrapType = b.scrap_type || '批量';
        const scrapQty = b.scrap_quantity != null ? Number(b.scrap_quantity) : unqualifiedQty;

        // 创建报废入库单（主表 + 明细表）
        const today = dayjs().format('YYYYMMDD');
        const siPrefix = `SI-${today}-`;
        const [siRows]: any = await sequelize.query(
          `SELECT MAX(stock_in_number) as max_num FROM stock_in WHERE stock_in_number LIKE :prefix`,
          { replacements: { prefix: siPrefix + '%' }, transaction }
        );
        let siSeq = 1;
        if (siRows[0].max_num) {
          const lastSeq = parseInt(siRows[0].max_num.slice(-3));
          if (!isNaN(lastSeq)) siSeq = lastSeq + 1;
        }
        const stockInNumber = siPrefix + String(siSeq).padStart(3, '0');
        const now = dayjs().format('YYYY/MM/DD HH:mm');
        const username = (req as any).user?.username || 'system';

        // 插入主表
        await sequelize.query(`
          INSERT INTO stock_in (stock_in_number, purchase_order_number, supplier_number, supplier_name,
            warehouse_number, warehouse_name, stock_in_date, stock_in_type, approval_status,
            [condition], operator, remark, creation_date, creation_man)
          VALUES (:stock_in_number, N'', N'', N'', N'', N'', :stock_in_date, N'报废入库', N'草稿',
            N'启用', :operator, :remark, :creation_date, :creation_man)
        `, {
          replacements: {
            stock_in_number: stockInNumber,
            stock_in_date: dayjs().format('YYYY/MM/DD'),
            operator: username,
            remark: `报废入库 - 来源检验单 ${record.inspection_number}`,
            creation_date: now,
            creation_man: username
          }, transaction
        });

        // 插入明细表
        await sequelize.query(`
          INSERT INTO stock_in_detail (stock_in_number, line_number, purchase_order_number, purchase_detail_id,
            item_number, item_name, specifications, basic_unit, order_quantity, received_quantity,
            stock_in_quantity, qualified_quantity, unqualified_quantity, batch_number, remark)
          VALUES (:stock_in_number, 10, N'', 0,
            :item_number, :item_name, :specifications, N'', 0, 0,
            :stock_in_quantity, 0, :scrapQty, N'', :remark)
        `, {
          replacements: {
            stock_in_number: stockInNumber,
            item_number: record.item_number || '',
            item_name: record.item_name || '',
            specifications: record.specifications || '',
            stock_in_quantity: scrapQty,
            scrapQty,
            remark: `报废 - 检验单 ${record.inspection_number}`
          }, transaction
        });

        await sequelize.query(`
          UPDATE production_inspection SET defect_handling = N'报废', scrap_type = :scrapType, scrap_quantity = :scrapQty WHERE inspection_number = :id
        `, { replacements: { id, scrapType, scrapQty }, transaction });

        // 报废：当前工序标记为已处理
        await sequelize.query(
          `UPDATE process_task SET inspect_status = N'已处理' WHERE process_task_number = :taskNo`,
          { replacements: { taskNo: record.process_task_number }, transaction }
        );

      } else if (handling === '让步接收') {
        const concessionQty = b.concession_quantity != null ? Number(b.concession_quantity) : unqualifiedQty;

        // 将让步数量加入合格数量
        await sequelize.query(`
          UPDATE production_inspection SET
            defect_handling = N'让步接收',
            concession_quantity = :concessionQty,
            qualified_quantity = qualified_quantity + :concessionQty,
            unqualified_quantity = CASE WHEN unqualified_quantity - :concessionQty < 0 THEN 0 ELSE unqualified_quantity - :concessionQty END
          WHERE inspection_number = :id
        `, { replacements: { id, concessionQty }, transaction });

        // 让步接收：当前工序标记为已处理
        await sequelize.query(
          `UPDATE process_task SET inspect_status = N'已处理' WHERE process_task_number = :taskNo`,
          { replacements: { taskNo: record.process_task_number }, transaction }
        );

      } else {
        await transaction.rollback();
        res.status(400).json({ success: false, message: '不合格品处理方式必须为：返修、报废或让步接收' });
        return;
      }

      await transaction.commit();
      res.json(success(null, `不合格品处理完成：${handling}`));
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
