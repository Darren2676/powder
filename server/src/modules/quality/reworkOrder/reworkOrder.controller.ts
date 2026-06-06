import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import dayjs from 'dayjs';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 单号生成 ====================
const generateReworkNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `RW-${today}-`;
  const opts: any = transaction
    ? { replacements: { prefix: prefix + '%' }, transaction }
    : { replacements: { prefix: prefix + '%' } };

  const [rows]: any = await sequelize.query(
    `SELECT MAX(rework_order_number) as max_num FROM rework_order WHERE rework_order_number LIKE :prefix`,
    opts
  );

  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 创建返修单（内部服务，由NC处理调用） ====================
export const createReworkOrder = async (params: {
  nonconforming_number: string;
  source_inspection_number: string;
  production_order_number: string;
  item_number: string;
  item_name: string;
  specifications: string;
  basic_unit: string;
  rework_step_number: number;
  rework_quantity: number;
  operator: string;
}, factoryCode: string = '', _factoryId: number | null = null, transaction: any): Promise<string> => {
  const rwNumber = await generateReworkNumber(factoryCode, transaction);
  const now = dayjs().format('YYYY/MM/DD HH:mm');

  await sequelize.query(`
    INSERT INTO rework_order (
      rework_order_number, nonconforming_number, source_inspection_number,
      production_order_number, item_number, item_name, specifications, basic_unit,
      rework_step_number, rework_quantity, rework_status,
      rework_start_date, operator, creation_date, creation_man, factory_id
    ) VALUES (
      :rework_order_number, :nonconforming_number, :source_inspection_number,
      :production_order_number, :item_number, :item_name, :specifications, :basic_unit,
      :rework_step_number, :rework_quantity, N'待返修',
      :rework_start_date, :operator, :creation_date, :creation_man, :factory_id
    )
  `, {
    replacements: {
      rework_order_number: rwNumber,
      nonconforming_number: params.nonconforming_number || '',
      source_inspection_number: params.source_inspection_number || '',
      production_order_number: params.production_order_number || '',
      item_number: params.item_number || '',
      item_name: params.item_name || '',
      specifications: params.specifications || '',
      basic_unit: params.basic_unit || '',
      rework_step_number: params.rework_step_number || 0,
      rework_quantity: params.rework_quantity || 0,
      rework_start_date: now,
      operator: params.operator || '',
      creation_date: now,
      creation_man: params.operator || '',
      factory_id: _factoryId
    },
    transaction
  });

  // 回写返修单号到NC单和检验单
  await sequelize.query(`
    UPDATE nonconforming_product SET rework_order_number = :rwNumber
    WHERE nonconforming_number = :ncNumber
  `, { replacements: { rwNumber, ncNumber: params.nonconforming_number }, transaction });

  await sequelize.query(`
    UPDATE production_inspection SET rework_order_number = :rwNumber
    WHERE inspection_number = :inspNumber
  `, { replacements: { rwNumber, inspNumber: params.source_inspection_number }, transaction });

  return rwNumber;
};

// ==================== 列表查询 ====================
export const getReworkOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 15;
    const search = (req.query.search as string) || '';
    const reworkStatus = (req.query.rework_status as string) || '';
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const replacements: any = {};
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      whereClause += ` AND factory_id = :_factoryId`;
      replacements._factoryId = _factoryId;
    }

    if (search) {
      whereClause += ` AND (rework_order_number LIKE :search OR production_order_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (reworkStatus) {
      whereClause += ` AND rework_status = :reworkStatus`;
      replacements.reworkStatus = reworkStatus;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) AS total FROM rework_order ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC) AS _row_num
        FROM rework_order ${whereClause.replace(/r\./g, '')}
      ) AS t WHERE t._row_num > ${offset} AND t._row_num <= ${offset + limit}
    `, { replacements });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    // 统计卡片
    const [stats]: any = await sequelize.query(`
      SELECT
        COUNT(*) AS total_count,
        ISNULL(SUM(CASE WHEN rework_status = N'待返修' THEN 1 ELSE 0 END), 0) AS pending_count,
        ISNULL(SUM(CASE WHEN rework_status = N'返修中' THEN 1 ELSE 0 END), 0) AS in_progress_count,
        ISNULL(SUM(CASE WHEN rework_status = N'返修完成' THEN 1 ELSE 0 END), 0) AS completed_count
      FROM rework_order ${whereClause}
    `, { replacements });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      stats: stats[0] || {}
    }, '获取返修单列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getReworkOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const [rows]: any = await sequelize.query(
      `SELECT * FROM rework_order WHERE rework_order_number = :id${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`,
      { replacements: { id, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) } }
    );
    if (!rows.length) { res.status(404).json({ success: false, message: '返修单不存在' }); return; }
    res.json(success(rows[0], '获取返修单详情成功'));
  } catch (err) { next(err); }
};

// ==================== 返修完成 ====================
export const completeRework = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const operator = (req as any).user?.username || '';
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [records]: any = await sequelize.query(
      `SELECT * FROM rework_order WHERE rework_order_number = :id${factoryCond}`,
      { replacements: { id, ...factoryReps } }
    );
    if (!records.length) { res.status(404).json({ success: false, message: '返修单不存在' }); return; }

    const record = records[0];
    if (record.rework_status === '返修完成') {
      res.status(400).json({ success: false, message: '该返修单已完成' });
      return;
    }

    const transaction = await sequelize.transaction();
    try {
      const now = dayjs().format('YYYY/MM/DD HH:mm');
      await sequelize.query(`
        UPDATE rework_order SET
          rework_status = N'返修完成',
          rework_complete_date = :completeDate,
          rework_remark = :remark,
          operator = :operator
        WHERE rework_order_number = :id${factoryCond}
      `, {
        replacements: {
          id,
          completeDate: now,
          remark: b.remark || '',
          operator,
          ...factoryReps
        },
        transaction
      });

      // 更新NC单状态为处理中（等待再检验）
      await sequelize.query(`
        UPDATE nonconforming_product SET handling_status = N'处理中'
        WHERE nonconforming_number = :ncNumber AND handling_status != N'已完成'
      `, { replacements: { ncNumber: record.nonconforming_number }, transaction });

      await transaction.commit();
      res.json(success(null, '返修完成，请进行再检验'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 返修再检验 ====================
export const reworkReInspect = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const operator = (req as any).user?.username || '';
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [records]: any = await sequelize.query(
      `SELECT * FROM rework_order WHERE rework_order_number = :id${factoryCond}`,
      { replacements: { id, ...factoryReps } }
    );
    if (!records.length) { res.status(404).json({ success: false, message: '返修单不存在' }); return; }

    const record = records[0];
    if (record.rework_status !== '返修完成') {
      res.status(400).json({ success: false, message: '返修单尚未完成返修，无法再检验' });
      return;
    }

    const reworkResult = b.rework_result; // 合格 / 不合格
    if (!['合格', '不合格'].includes(reworkResult)) {
      res.status(400).json({ success: false, message: '再检验结果必须为：合格/不合格' });
      return;
    }

    const transaction = await sequelize.transaction();
    try {
      // 更新返修单结果
      await sequelize.query(`
        UPDATE rework_order SET
          rework_result = :reworkResult,
          re_inspection_number = :reInspectionNumber
        WHERE rework_order_number = :id${factoryCond}
      `, {
        replacements: {
          id,
          reworkResult,
          reInspectionNumber: b.re_inspection_number || '',
          ...factoryReps
        },
        transaction
      });

      if (reworkResult === '合格') {
        // 返修合格：NC单完成，工序标记已处理
        await sequelize.query(`
          UPDATE nonconforming_product SET handling_status = N'已完成', handling_date = :handleDate
          WHERE nonconforming_number = :ncNumber
        `, {
          replacements: {
            ncNumber: record.nonconforming_number,
            handleDate: dayjs().format('YYYY/MM/DD HH:mm')
          },
          transaction
        });

        // 工序标记已处理
        const [inspRows]: any = await sequelize.query(
          `SELECT process_task_number FROM production_inspection WHERE inspection_number = :inspNumber`,
          { replacements: { inspNumber: record.source_inspection_number }, transaction }
        );
        if (inspRows.length && inspRows[0].process_task_number) {
          await sequelize.query(
            `UPDATE process_task SET inspect_status = N'已处理' WHERE process_task_number = :taskNo`,
            { replacements: { taskNo: inspRows[0].process_task_number }, transaction }
          );
        }
      } else {
        // 返修不合格：可以再次创建NC单或选择其他处理方式
        // 仅标记NC单状态为"返修不合格"，由人工决定下一步
        await sequelize.query(`
          UPDATE nonconforming_product SET handling_status = N'返修不合格', handling_remark = ISNULL(handling_remark, '') + N'; 返修后再检验不合格'
          WHERE nonconforming_number = :ncNumber
        `, { replacements: { ncNumber: record.nonconforming_number }, transaction });
      }

      await transaction.commit();
      res.json(success(null, `返修再检验结果：${reworkResult}`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['rework_order_number', 'nonconforming_number', 'source_inspection_number', 'production_order_number', 'item_number', 'item_name', 'specifications', 'rework_step_number', 'rework_quantity', 'rework_status', 'rework_result', 'rework_start_date', 'rework_complete_date', 'operator'];
const exportHeaders = ['返修单号', '不合格品单号', '来源检验单号', '生产单号', '物料编号', '物料名称', '规格型号', '返修工序号', '返修数量', '返修状态', '返修结果', '开始日期', '完成日期', '操作人'];

export const exportReworkOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const factoryWhere = _factoryId !== null ? 'WHERE factory_id = :_factoryId' : '';
    const factoryReps: any = _factoryId !== null ? { _factoryId } : {};
    const [items]: any = await sequelize.query(`SELECT * FROM rework_order ${factoryWhere} ORDER BY creation_date DESC`, { replacements: factoryReps });
    exportToExcel(items, exportFields, exportHeaders, 'rework_orders', res);
  } catch (err) { next(err); }
};
