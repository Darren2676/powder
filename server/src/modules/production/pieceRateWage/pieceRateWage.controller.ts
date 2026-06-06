import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import dayjs from 'dayjs';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 编号生成 ====================
const generateWageNumber = async (factoryCode: string = ''): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `WG-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT MAX(wage_number) as max_num FROM piece_rate_wage_header WHERE wage_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );
  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 列表 ====================
export const getPieceRateWages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const period_type = (req.query.period_type as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(h.wage_number LIKE :search OR h.wage_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      conditions.push(`h.approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }
    if (period_type) {
      conditions.push(`h.period_type = :period_type`);
      replacements.period_type = period_type;
    }

    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      conditions.push(`h.factory_id = :_factoryId`);
      replacements._factoryId = _factoryId;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM piece_rate_wage_header h ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT h.wage_number, h.wage_name, h.period_type,
               CONVERT(VARCHAR(10), h.period_start, 23) as period_start,
               CONVERT(VARCHAR(10), h.period_end, 23) as period_end,
               h.total_qualified_wage, h.total_defective_wage, h.total_wage,
               h.detail_count, h.calculation_status, h.approval_status,
               h.remark, h.creation_date, h.creation_man,
               ROW_NUMBER() OVER (ORDER BY h.creation_date DESC, h.wage_number DESC) AS _row_num
        FROM piece_rate_wage_header h ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取计件工资列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getPieceRateWageDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReplacements: any = { id, ...(_factoryId !== null ? { _factoryId } : {}) };
    const [headers]: any = await sequelize.query(
      `SELECT wage_number, wage_name, period_type,
              CONVERT(VARCHAR(10), period_start, 23) as period_start,
              CONVERT(VARCHAR(10), period_end, 23) as period_end,
              total_qualified_wage, total_defective_wage, total_wage,
              detail_count, calculation_status, approval_status,
              remark, creation_date, creation_man
       FROM piece_rate_wage_header WHERE wage_number = :id${factoryCond}`, { replacements: factoryReplacements }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '计件工资表不存在' }); return; }
    const [details]: any = await sequelize.query(
      `SELECT * FROM piece_rate_wage_detail WHERE wage_number = :id ORDER BY line_number, employee_number, item_number, standard_process_number`,
      { replacements: { id } }
    );
    res.json(success({ header: headers[0], details }, '获取计件工资详情成功'));
  } catch (err) { next(err); }
};

// ==================== 员工汇总 ====================
export const getPieceRateWageSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [summary]: any = await sequelize.query(`
      SELECT employee_number, employee_name,
             COUNT(*) as line_count,
             SUM(qualified_quantity) as total_qualified_qty,
             SUM(unqualified_quantity) as total_unqualified_qty,
             SUM(qualified_wage) as total_qualified_wage,
             SUM(defective_wage) as total_defective_wage,
             SUM(line_wage) as total_employee_wage
      FROM piece_rate_wage_detail
      WHERE wage_number = :id
      GROUP BY employee_number, employee_name
      ORDER BY employee_number
    `, { replacements: { id } });
    res.json(success(summary, '获取员工工资汇总成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createPieceRateWage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const b = req.body;
    if (!b.wage_name) { res.status(400).json({ success: false, message: '工资表名称不能为空' }); return; }
    if (!b.period_type) { res.status(400).json({ success: false, message: '周期类型不能为空' }); return; }
    if (!b.period_start) { res.status(400).json({ success: false, message: '周期开始日期不能为空' }); return; }
    if (!b.period_end) { res.status(400).json({ success: false, message: '周期结束日期不能为空' }); return; }

    const wage_number = await generateWageNumber(factoryCode);
    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const creation_man = (req as any).user?.username || '';

    await sequelize.query(`
      INSERT INTO piece_rate_wage_header (wage_number, wage_name, period_type, period_start, period_end,
        total_qualified_wage, total_defective_wage, total_wage, detail_count,
        calculation_status, approval_status, remark, factory_id, creation_date, creation_man)
      VALUES (:wage_number, :wage_name, :period_type, :period_start, :period_end,
        0, 0, 0, 0, N'未计算', N'草稿', :remark, :factory_id, :creation_date, :creation_man)
    `, {
      replacements: {
        wage_number,
        wage_name: b.wage_name || '',
        period_type: b.period_type || '月',
        period_start: b.period_start || null,
        period_end: b.period_end || null,
        remark: b.remark || '',
        factory_id: _factoryId,
        creation_date: now,
        creation_man
      }
    });

    res.json(success({ wage_number }, '创建计件工资表成功'));
  } catch (err) { next(err); }
};

// ==================== 更新 ====================
export const updatePieceRateWage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const b = req.body;

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM piece_rate_wage_header WHERE wage_number = :id${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`, { replacements: { id, ...(_factoryId !== null ? { _factoryId } : {}) } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '计件工资表不存在' }); return; }
    if (chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return;
    }

    await sequelize.query(`
      UPDATE piece_rate_wage_header SET
        wage_name = :wage_name, period_type = :period_type,
        period_start = :period_start, period_end = :period_end,
        remark = :remark
      WHERE wage_number = :id
    `, {
      replacements: {
        id,
        wage_name: b.wage_name || '',
        period_type: b.period_type || '月',
        period_start: b.period_start || null,
        period_end: b.period_end || null,
        remark: b.remark || ''
      }
    });

    res.json(success(null, '更新计件工资表成功'));
  } catch (err) { next(err); }
};

// ==================== 删除 ====================
export const deletePieceRateWage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM piece_rate_wage_header WHERE wage_number = :id${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`, { replacements: { id, ...(_factoryId !== null ? { _factoryId } : {}) } }
    );
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return;
    }
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM piece_rate_wage_detail WHERE wage_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM piece_rate_wage_header WHERE wage_number = :id`, { replacements: { id }, transaction });
      await transaction.commit();
      res.json(success(null, '删除计件工资表成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 计算工资 ====================
export const calculatePieceRateWage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);

    // 检查工资表状态
    const [chk]: any = await sequelize.query(
      `SELECT wage_number, approval_status, period_start, period_end FROM piece_rate_wage_header WHERE wage_number = :id${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`,
      { replacements: { id, ...(_factoryId !== null ? { _factoryId } : {}) } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '计件工资表不存在' }); return; }
    if (chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '只有草稿状态的工资表才能计算' }); return;
    }

    const periodStart = chk[0].period_start;
    const periodEnd = chk[0].period_end;

    // 核心计算：已审批报工 × 计件单价 = 工资明细
    // 匹配逻辑：work_report.item_number + process_task.standard_process_number + 日期范围 + 优先员工匹配
    const [wageLines]: any = await sequelize.query(`
      SELECT
        wr.work_report_number,
        wr.process_task_number,
        wr.production_order_number,
        wr.item_number,
        wr.item_name,
        pt.standard_process_number,
        wr.standard_process_name,
        ISNULL(prpd.equipment_number, '') as equipment_number,
        ISNULL(prpd.equipment_name, '') as equipment_name,
        wr.operator_number as employee_number,
        wr.operator_name as employee_name,
        wr.report_date,
        wr.qualified_quantity,
        wr.unqualified_quantity,
        ISNULL(prpd.qualified_piece_rate, 0) as qualified_piece_rate,
        ISNULL(prpd.defective_piece_rate, 0) as defective_piece_rate,
        ROUND(wr.qualified_quantity * ISNULL(prpd.qualified_piece_rate, 0), 2) as qualified_wage,
        ROUND(wr.unqualified_quantity * ISNULL(prpd.defective_piece_rate, 0), 2) as defective_wage,
        ROUND(wr.qualified_quantity * ISNULL(prpd.qualified_piece_rate, 0) +
              wr.unqualified_quantity * ISNULL(prpd.defective_piece_rate, 0), 2) as line_wage,
        prpd.price_list_number,
        prpd.line_number as price_list_line_number
      FROM work_report wr
      INNER JOIN process_task pt ON wr.process_task_number = pt.process_task_number
      LEFT JOIN (
        SELECT d.price_list_number, d.line_number, d.item_number, d.item_name,
               d.standard_process_number, d.standard_process_name, d.item_category,
               d.equipment_number, d.equipment_name, d.employee_number, d.employee_name,
               d.custom_field, d.qualified_piece_rate, d.defective_piece_rate,
               d.drawing_number, d.version, d.specifications, d.material_type,
               h.effective_date, h.expiration_date
        FROM piece_rate_price_detail d
        INNER JOIN piece_rate_price_header h ON d.price_list_number = h.price_list_number
        WHERE h.approval_status = N'已审批'
      ) prpd ON prpd.item_number = wr.item_number
             AND prpd.standard_process_number = pt.standard_process_number
             AND prpd.effective_date <= :periodStart
             AND prpd.expiration_date >= :periodEnd
             AND (
               prpd.employee_number = wr.operator_number
               OR prpd.employee_number = '' OR prpd.employee_number IS NULL
             )
      WHERE wr.approval_status = N'已审批'
        AND wr.report_date >= :periodStartStr
        AND wr.report_date <= :periodEndStr
      ORDER BY wr.operator_number, wr.item_number, pt.standard_process_number, wr.work_report_number
    `, {
      replacements: {
        periodStart,
        periodEnd,
        periodStartStr: dayjs(periodStart).format('YYYY/MM/DD'),
        periodEndStr: dayjs(periodEnd).format('YYYY/MM/DD')
      }
    });

    if (wageLines.length === 0) {
      res.json(success({ wage_number: id, detail_count: 0, total_wage: 0 }, '该周期内无已审批报工数据，工资明细为空'));
      return;
    }

    // 优先匹配员工特定单价（employee_number匹配 > 通用单价）
    const bestLines: any[] = [];
    const lineMap = new Map<string, any>();

    for (const line of wageLines) {
      const key = `${line.work_report_number}|${line.item_number}|${line.standard_process_number}`;
      const existing = lineMap.get(key);
      if (!existing) {
        lineMap.set(key, line);
      } else {
        // 优先选择有员工匹配的单价
        const existingHasEmployee = existing.employee_number && existing.employee_number === existing.employee_number;
        const currentHasEmployee = line.price_list_number && line.employee_number && line.employee_number === line.employee_number;
        if (currentHasEmployee && !existingHasEmployee) {
          lineMap.set(key, line);
        }
      }
    }
    lineMap.forEach(v => bestLines.push(v));

    // 写入明细
    const transaction = await sequelize.transaction();
    try {
      // 清除旧明细
      await sequelize.query(`DELETE FROM piece_rate_wage_detail WHERE wage_number = :id`,
        { replacements: { id }, transaction });

      let totalQualifiedWage = 0;
      let totalDefectiveWage = 0;
      let totalWage = 0;

      for (let i = 0; i < bestLines.length; i++) {
        const d = bestLines[i];
        const lineNum = (i + 1) * 10;
        const qualifiedWage = parseFloat(d.qualified_wage) || 0;
        const defectiveWage = parseFloat(d.defective_wage) || 0;
        const lineWage = parseFloat(d.line_wage) || 0;

        totalQualifiedWage += qualifiedWage;
        totalDefectiveWage += defectiveWage;
        totalWage += lineWage;

        await sequelize.query(`
          INSERT INTO piece_rate_wage_detail (wage_number, line_number,
            work_report_number, process_task_number, production_order_number,
            item_number, item_name, standard_process_number, standard_process_name,
            equipment_number, equipment_name, employee_number, employee_name,
            report_date, qualified_quantity, unqualified_quantity,
            qualified_piece_rate, defective_piece_rate,
            qualified_wage, defective_wage, line_wage,
            price_list_number, price_list_line_number)
          VALUES (:wage_number, :line_number,
            :work_report_number, :process_task_number, :production_order_number,
            :item_number, :item_name, :standard_process_number, :standard_process_name,
            :equipment_number, :equipment_name, :employee_number, :employee_name,
            :report_date, :qualified_quantity, :unqualified_quantity,
            :qualified_piece_rate, :defective_piece_rate,
            :qualified_wage, :defective_wage, :line_wage,
            :price_list_number, :price_list_line_number)
        `, {
          replacements: {
            wage_number: id,
            line_number: lineNum,
            work_report_number: d.work_report_number || '',
            process_task_number: d.process_task_number || '',
            production_order_number: d.production_order_number || '',
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            standard_process_number: d.standard_process_number || '',
            standard_process_name: d.standard_process_name || '',
            equipment_number: d.equipment_number || '',
            equipment_name: d.equipment_name || '',
            employee_number: d.employee_number || '',
            employee_name: d.employee_name || '',
            report_date: d.report_date || '',
            qualified_quantity: d.qualified_quantity || 0,
            unqualified_quantity: d.unqualified_quantity || 0,
            qualified_piece_rate: d.qualified_piece_rate || 0,
            defective_piece_rate: d.defective_piece_rate || 0,
            qualified_wage: qualifiedWage,
            defective_wage: defectiveWage,
            line_wage: lineWage,
            price_list_number: d.price_list_number || '',
            price_list_line_number: d.price_list_line_number || 0
          },
          transaction
        });
      }

      // 更新表头汇总
      await sequelize.query(`
        UPDATE piece_rate_wage_header SET
          total_qualified_wage = :total_qualified_wage,
          total_defective_wage = :total_defective_wage,
          total_wage = :total_wage,
          detail_count = :detail_count,
          calculation_status = N'已计算'
        WHERE wage_number = :id
      `, {
        replacements: {
          id,
          total_qualified_wage: Math.round(totalQualifiedWage * 100) / 100,
          total_defective_wage: Math.round(totalDefectiveWage * 100) / 100,
          total_wage: Math.round(totalWage * 100) / 100,
          detail_count: bestLines.length
        },
        transaction
      });

      await transaction.commit();
      res.json(success({
        wage_number: id,
        detail_count: bestLines.length,
        total_wage: Math.round(totalWage * 100) / 100
      }, `工资计算完成，共 ${bestLines.length} 条明细，总金额 ${Math.round(totalWage * 100) / 100}`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['wage_number', 'wage_name', 'employee_number', 'employee_name', 'item_number', 'item_name', 'standard_process_number', 'standard_process_name', 'equipment_number', 'equipment_name', 'report_date', 'qualified_quantity', 'unqualified_quantity', 'qualified_piece_rate', 'defective_piece_rate', 'qualified_wage', 'defective_wage', 'line_wage', 'work_report_number', 'production_order_number', 'approval_status'];
const exportHeaders = ['工资表编号', '工资表名称', '员工编号', '员工名称', '物料编号', '物料名称', '工序编号', '工序名称', '设备编号', '设备名称', '报工日期', '合格数量', '不合格数量', '合格品单价', '次品单价', '合格品工资', '次品工资', '行工资', '报工单号', '生产单号', '审批状态'];

export const exportPieceRateWages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`
      SELECT h.wage_number, h.wage_name,
             d.employee_number, d.employee_name,
             d.item_number, d.item_name, d.standard_process_number, d.standard_process_name,
             d.equipment_number, d.equipment_name, d.report_date,
             d.qualified_quantity, d.unqualified_quantity,
             d.qualified_piece_rate, d.defective_piece_rate,
             d.qualified_wage, d.defective_wage, d.line_wage,
             d.work_report_number, d.production_order_number,
             h.approval_status
      FROM piece_rate_wage_header h
      INNER JOIN piece_rate_wage_detail d ON d.wage_number = h.wage_number
      ORDER BY h.wage_number, d.line_number
    `);
    exportToExcel(items, exportFields, exportHeaders, 'piece_rate_wages', res);
  } catch (err) { next(err); }
};

export const exportPieceRateWagesSelected = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, message: '请提供要导出的记录ID' }); return;
    }
    const placeholders = ids.map((_: any, i: number) => `@id${i}`).join(',');
    const replacements: any = {};
    ids.forEach((id: string, i: number) => { replacements[`id${i}`] = id; });
    const [items]: any = await sequelize.query(`
      SELECT h.wage_number, h.wage_name,
             d.employee_number, d.employee_name,
             d.item_number, d.item_name, d.standard_process_number, d.standard_process_name,
             d.equipment_number, d.equipment_name, d.report_date,
             d.qualified_quantity, d.unqualified_quantity,
             d.qualified_piece_rate, d.defective_piece_rate,
             d.qualified_wage, d.defective_wage, d.line_wage,
             d.work_report_number, d.production_order_number,
             h.approval_status
      FROM piece_rate_wage_header h
      INNER JOIN piece_rate_wage_detail d ON d.wage_number = h.wage_number
      WHERE h.wage_number IN (${placeholders})
      ORDER BY h.wage_number, d.line_number
    `, { replacements });
    exportToExcel(items, exportFields, exportHeaders, 'piece_rate_wages_selected', res);
  } catch (err) { next(err); }
};
