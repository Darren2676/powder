import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import dayjs from 'dayjs';
import { ORDER_STATUS } from '@/shared/constants/statuses';

// ==================== 编号生成 ====================
const generateCostListNumber = async (): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `SC-${today}-`;
  const result: any = await sequelize.query(
    `SELECT MAX(cost_list_number) as max_num FROM standard_cost_header WHERE cost_list_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );
  const rows = result[0];
  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 列表 ====================
export const getStandardCosts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(h.cost_list_number LIKE :search OR h.cost_list_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      conditions.push(`h.approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM standard_cost_header h ${whereClause}`, { replacements }
    );
    const total = countResult[0][0].total;

    const offset = (page - 1) * limit;
    const itemsResult: any = await sequelize.query(`
      SELECT * FROM (
        SELECT h.cost_list_number, h.cost_list_name,
               CONVERT(VARCHAR(10), h.effective_date, 23) as effective_date,
               CONVERT(VARCHAR(10), h.expiration_date, 23) as expiration_date,
               h.approval_status, h.remark, h.creation_date, h.creation_man,
               (SELECT COUNT(*) FROM standard_cost_detail d WHERE d.cost_list_number = h.cost_list_number) as detail_count,
               ROW_NUMBER() OVER (ORDER BY h.creation_date DESC, h.cost_list_number DESC) AS _row_num
        FROM standard_cost_header h ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const items = itemsResult[0].map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({
      items,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取标准成本单价列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getStandardCostDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const headersResult: any = await sequelize.query(
      `SELECT cost_list_number, cost_list_name,
              CONVERT(VARCHAR(10), effective_date, 23) as effective_date,
              CONVERT(VARCHAR(10), expiration_date, 23) as expiration_date,
              approval_status, remark, creation_date, creation_man
       FROM standard_cost_header WHERE cost_list_number = :id`, { replacements: { id } }
    );
    if (!headersResult[0].length) { res.status(404).json({ success: false, message: '标准成本单价表不存在' }); return; }
    const detailsResult: any = await sequelize.query(
      `SELECT * FROM standard_cost_detail WHERE cost_list_number = :id ORDER BY line_number, item_number`,
      { replacements: { id } }
    );
    res.json(success({ header: headersResult[0][0], details: detailsResult[0] }, '获取标准成本单价详情成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createStandardCost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.cost_list_name) { res.status(400).json({ success: false, message: '名称不能为空' }); return; }
    if (!b.effective_date) { res.status(400).json({ success: false, message: '生效日期不能为空' }); return; }
    if (!b.expiration_date) { res.status(400).json({ success: false, message: '失效日期不能为空' }); return; }

    const cost_list_number = await generateCostListNumber();
    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO standard_cost_header (cost_list_number, cost_list_name, effective_date, expiration_date,
          approval_status, remark, creation_date, creation_man)
        VALUES (:cost_list_number, :cost_list_name, :effective_date, :expiration_date,
          N'草稿', :remark, :creation_date, :creation_man)
      `, {
        replacements: {
          cost_list_number,
          cost_list_name: b.cost_list_name || '',
          effective_date: b.effective_date || null,
          expiration_date: b.expiration_date || null,
          remark: b.remark || '',
          creation_date: now,
          creation_man
        },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO standard_cost_detail (cost_list_number, line_number,
              item_number, item_name, item_class_name, specifications, basic_unit,
              material_type, standard_cost, actual_cost, drawing_number, version, remark)
            VALUES (:cost_list_number, :line_number,
              :item_number, :item_name, :item_class_name, :specifications, :basic_unit,
              :material_type, :standard_cost, :actual_cost, :drawing_number, :version, :remark)
          `, {
            replacements: {
              cost_list_number,
              line_number: d.line_number || (i + 1) * 10,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              item_class_name: d.item_class_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              material_type: d.material_type || '',
              standard_cost: d.standard_cost || 0,
              actual_cost: d.actual_cost || 0,
              drawing_number: d.drawing_number || '',
              version: d.version || '',
              remark: d.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success({ cost_list_number }, '创建标准成本单价表成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 更新 ====================
export const updateStandardCost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const chkResult: any = await sequelize.query(
      `SELECT approval_status FROM standard_cost_header WHERE cost_list_number = :id`, { replacements: { id } }
    );
    if (!chkResult[0].length) { res.status(404).json({ success: false, message: '标准成本单价表不存在' }); return; }
    if (chkResult[0][0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE standard_cost_header SET
          cost_list_name = :cost_list_name,
          effective_date = :effective_date, expiration_date = :expiration_date,
          remark = :remark
        WHERE cost_list_number = :id
      `, {
        replacements: {
          id,
          cost_list_name: b.cost_list_name || '',
          effective_date: b.effective_date || null,
          expiration_date: b.expiration_date || null,
          remark: b.remark || ''
        },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        await sequelize.query(
          `DELETE FROM standard_cost_detail WHERE cost_list_number = :id`,
          { replacements: { id }, transaction }
        );
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO standard_cost_detail (cost_list_number, line_number,
              item_number, item_name, item_class_name, specifications, basic_unit,
              material_type, standard_cost, actual_cost, drawing_number, version, remark)
            VALUES (:cost_list_number, :line_number,
              :item_number, :item_name, :item_class_name, :specifications, :basic_unit,
              :material_type, :standard_cost, :actual_cost, :drawing_number, :version, :remark)
          `, {
            replacements: {
              cost_list_number: id,
              line_number: d.line_number || (i + 1) * 10,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              item_class_name: d.item_class_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              material_type: d.material_type || '',
              standard_cost: d.standard_cost || 0,
              actual_cost: d.actual_cost || 0,
              drawing_number: d.drawing_number || '',
              version: d.version || '',
              remark: d.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success(null, '更新标准成本单价表成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 删除 ====================
export const deleteStandardCost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const chkResult: any = await sequelize.query(
      `SELECT approval_status FROM standard_cost_header WHERE cost_list_number = :id`, { replacements: { id } }
    );
    if (chkResult[0].length && chkResult[0][0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return;
    }
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM standard_cost_detail WHERE cost_list_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM standard_cost_header WHERE cost_list_number = :id`, { replacements: { id }, transaction });
      await transaction.commit();
      res.json(success(null, '删除标准成本单价表成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['cost_list_number', 'cost_list_name', 'item_number', 'item_name', 'item_class_name', 'specifications', 'basic_unit', 'material_type', 'standard_cost', 'actual_cost', 'drawing_number', 'version', 'remark', 'approval_status'];
const exportHeaders = ['价目表编号', '价目表名称', '物料编号', '物料名称', '物料分类', '规格', '基本单位', '材质', '标准成本单价', '实际成本', '图号', '版本', '备注', '审批状态'];

export const exportStandardCosts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const costListNumbers = (req.query.cost_list_numbers as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (costListNumbers) {
      const nums = costListNumbers.split(',').map((n: string) => n.trim()).filter(Boolean);
      if (nums.length > 0) {
        const placeholders = nums.map((_: any, i: number) => `:n${i}`).join(',');
        whereClause = `WHERE h.cost_list_number IN (${placeholders})`;
        nums.forEach((n: any, i: number) => { replacements[`n${i}`] = n; });
      }
    }
    const itemsResult: any = await sequelize.query(`
      SELECT h.cost_list_number, h.cost_list_name,
             d.item_number, d.item_name, d.item_class_name, d.specifications, d.basic_unit,
             d.material_type, d.standard_cost, d.actual_cost, d.drawing_number, d.version, d.remark,
             h.approval_status
      FROM standard_cost_header h
      INNER JOIN standard_cost_detail d ON d.cost_list_number = h.cost_list_number
      ${whereClause}
      ORDER BY h.cost_list_number, d.line_number
    `, { replacements });
    exportToExcel(itemsResult[0], exportFields, exportHeaders, 'standard_costs', res);
  } catch (err) { next(err); }
};

// ==================== 导入 ====================
const importDetailFields = ['item_number', 'item_name', 'item_class_name', 'specifications', 'basic_unit', 'material_type', 'standard_cost', 'actual_cost', 'drawing_number', 'version', 'remark'];
const importDetailHeaders = ['物料编号', '物料名称', '物料分类', '规格', '基本单位', '材质', '标准成本单价', '实际成本', '图号', '版本', '备注'];

export const importStandardCost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, importDetailFields, importDetailHeaders);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }

    const cost_list_number = await generateCostListNumber();
    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const creation_man = (req as any).user?.username || '';
    const b = req.body;

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO standard_cost_header (cost_list_number, cost_list_name, effective_date, expiration_date,
          approval_status, remark, creation_date, creation_man)
        VALUES (:cost_list_number, :cost_list_name, :effective_date, :expiration_date,
          N'草稿', :remark, :creation_date, :creation_man)
      `, {
        replacements: {
          cost_list_number,
          cost_list_name: b?.cost_list_name || '导入标准成本单价表',
          effective_date: b?.effective_date || null,
          expiration_date: b?.expiration_date || null,
          remark: b?.remark || '',
          creation_date: now,
          creation_man
        },
        transaction
      });

      for (let i = 0; i < rows.length; i++) {
        const d = rows[i];
        await sequelize.query(`
          INSERT INTO standard_cost_detail (cost_list_number, line_number,
            item_number, item_name, item_class_name, specifications, basic_unit,
            material_type, standard_cost, actual_cost, drawing_number, version, remark)
          VALUES (:cost_list_number, :line_number,
            :item_number, :item_name, :item_class_name, :specifications, :basic_unit,
            :material_type, :standard_cost, :actual_cost, :drawing_number, :version, :remark)
        `, {
          replacements: {
            cost_list_number,
            line_number: (i + 1) * 10,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            item_class_name: d.item_class_name || '',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            material_type: d.material_type || '',
            standard_cost: parseFloat(d.standard_cost) || 0,
            actual_cost: parseFloat(d.actual_cost) || 0,
            drawing_number: d.drawing_number || '',
            version: d.version || '',
            remark: d.remark || ''
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ cost_list_number, imported: rows.length }, `成功导入 ${rows.length} 条明细到标准成本单价表 ${cost_list_number}`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};