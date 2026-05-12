import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import dayjs from 'dayjs';
import { ORDER_STATUS } from '@/shared/constants/statuses';

// ==================== 编号生成 ====================
const generatePriceListNumber = async (): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `PR-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT MAX(price_list_number) as max_num FROM piece_rate_price_header WHERE price_list_number LIKE :prefix`,
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
export const getPieceRatePrices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(h.price_list_number LIKE :search OR h.price_list_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      conditions.push(`h.approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM piece_rate_price_header h ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT h.price_list_number, h.price_list_name,
               CONVERT(VARCHAR(10), h.effective_date, 23) as effective_date,
               CONVERT(VARCHAR(10), h.expiration_date, 23) as expiration_date,
               h.approval_status, h.remark, h.creation_date, h.creation_man,
               (SELECT COUNT(*) FROM piece_rate_price_detail d WHERE d.price_list_number = h.price_list_number) as detail_count,
               ROW_NUMBER() OVER (ORDER BY h.creation_date DESC, h.price_list_number DESC) AS _row_num
        FROM piece_rate_price_header h ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取计件单价列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getPieceRatePriceDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(
      `SELECT price_list_number, price_list_name,
              CONVERT(VARCHAR(10), effective_date, 23) as effective_date,
              CONVERT(VARCHAR(10), expiration_date, 23) as expiration_date,
              approval_status, remark, creation_date, creation_man
       FROM piece_rate_price_header WHERE price_list_number = :id`, { replacements: { id } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '计件单价表不存在' }); return; }
    const [details]: any = await sequelize.query(
      `SELECT * FROM piece_rate_price_detail WHERE price_list_number = :id ORDER BY line_number, item_number, standard_process_number`,
      { replacements: { id } }
    );
    res.json(success({ header: headers[0], details }, '获取计件单价详情成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createPieceRatePrice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.price_list_name) { res.status(400).json({ success: false, message: '价目表名称不能为空' }); return; }
    if (!b.effective_date) { res.status(400).json({ success: false, message: '生效日期不能为空' }); return; }
    if (!b.expiration_date) { res.status(400).json({ success: false, message: '失效日期不能为空' }); return; }

    const price_list_number = await generatePriceListNumber();
    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO piece_rate_price_header (price_list_number, price_list_name, effective_date, expiration_date,
          approval_status, remark, creation_date, creation_man)
        VALUES (:price_list_number, :price_list_name, :effective_date, :expiration_date,
          N'草稿', :remark, :creation_date, :creation_man)
      `, {
        replacements: {
          price_list_number,
          price_list_name: b.price_list_name || '',
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
            INSERT INTO piece_rate_price_detail (price_list_number, line_number,
              item_number, item_name, standard_process_number, standard_process_name,
              item_category, equipment_number, equipment_name,
              employee_number, employee_name, custom_field,
              qualified_piece_rate, defective_piece_rate,
              drawing_number, version, specifications, material_type)
            VALUES (:price_list_number, :line_number,
              :item_number, :item_name, :standard_process_number, :standard_process_name,
              :item_category, :equipment_number, :equipment_name,
              :employee_number, :employee_name, :custom_field,
              :qualified_piece_rate, :defective_piece_rate,
              :drawing_number, :version, :specifications, :material_type)
          `, {
            replacements: {
              price_list_number,
              line_number: d.line_number || (i + 1) * 10,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              standard_process_number: d.standard_process_number || '',
              standard_process_name: d.standard_process_name || '',
              item_category: d.item_category || '',
              equipment_number: d.equipment_number || '',
              equipment_name: d.equipment_name || '',
              employee_number: d.employee_number || '',
              employee_name: d.employee_name || '',
              custom_field: d.custom_field || '',
              qualified_piece_rate: d.qualified_piece_rate || 0,
              defective_piece_rate: d.defective_piece_rate || 0,
              drawing_number: d.drawing_number || '',
              version: d.version || '',
              specifications: d.specifications || '',
              material_type: d.material_type || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success({ price_list_number }, '创建计件单价表成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 更新 ====================
export const updatePieceRatePrice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM piece_rate_price_header WHERE price_list_number = :id`, { replacements: { id } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '计件单价表不存在' }); return; }
    if (chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE piece_rate_price_header SET
          price_list_name = :price_list_name,
          effective_date = :effective_date, expiration_date = :expiration_date,
          remark = :remark
        WHERE price_list_number = :id
      `, {
        replacements: {
          id,
          price_list_name: b.price_list_name || '',
          effective_date: b.effective_date || null,
          expiration_date: b.expiration_date || null,
          remark: b.remark || ''
        },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        await sequelize.query(
          `DELETE FROM piece_rate_price_detail WHERE price_list_number = :id`,
          { replacements: { id }, transaction }
        );
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO piece_rate_price_detail (price_list_number, line_number,
              item_number, item_name, standard_process_number, standard_process_name,
              item_category, equipment_number, equipment_name,
              employee_number, employee_name, custom_field,
              qualified_piece_rate, defective_piece_rate,
              drawing_number, version, specifications, material_type)
            VALUES (:price_list_number, :line_number,
              :item_number, :item_name, :standard_process_number, :standard_process_name,
              :item_category, :equipment_number, :equipment_name,
              :employee_number, :employee_name, :custom_field,
              :qualified_piece_rate, :defective_piece_rate,
              :drawing_number, :version, :specifications, :material_type)
          `, {
            replacements: {
              price_list_number: id,
              line_number: d.line_number || (i + 1) * 10,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              standard_process_number: d.standard_process_number || '',
              standard_process_name: d.standard_process_name || '',
              item_category: d.item_category || '',
              equipment_number: d.equipment_number || '',
              equipment_name: d.equipment_name || '',
              employee_number: d.employee_number || '',
              employee_name: d.employee_name || '',
              custom_field: d.custom_field || '',
              qualified_piece_rate: d.qualified_piece_rate || 0,
              defective_piece_rate: d.defective_piece_rate || 0,
              drawing_number: d.drawing_number || '',
              version: d.version || '',
              specifications: d.specifications || '',
              material_type: d.material_type || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success(null, '更新计件单价表成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 删除 ====================
export const deletePieceRatePrice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM piece_rate_price_header WHERE price_list_number = :id`, { replacements: { id } }
    );
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return;
    }
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM piece_rate_price_detail WHERE price_list_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM piece_rate_price_header WHERE price_list_number = :id`, { replacements: { id }, transaction });
      await transaction.commit();
      res.json(success(null, '删除计件单价表成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['price_list_number', 'price_list_name', 'item_number', 'item_name', 'standard_process_number', 'standard_process_name', 'item_category', 'equipment_number', 'equipment_name', 'employee_number', 'employee_name', 'custom_field', 'qualified_piece_rate', 'defective_piece_rate', 'drawing_number', 'version', 'specifications', 'material_type', 'approval_status'];
const exportHeaders = ['价目表编号', '价目表名称', '物料编号', '物料名称', '工序编号', '工序名称', '物料分类', '设备编号', '设备名称', '人员编号', '人员名称', '自定义项', '合格品计件单价', '次品计件单价', '图号', '版本', '规格', '材质', '审批状态'];

export const exportPieceRatePrices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`
      SELECT h.price_list_number, h.price_list_name,
             d.item_number, d.item_name, d.standard_process_number, d.standard_process_name,
             d.item_category, d.equipment_number, d.equipment_name,
             d.employee_number, d.employee_name, d.custom_field,
             d.qualified_piece_rate, d.defective_piece_rate,
             d.drawing_number, d.version, d.specifications, d.material_type,
             h.approval_status
      FROM piece_rate_price_header h
      INNER JOIN piece_rate_price_detail d ON d.price_list_number = h.price_list_number
      ORDER BY h.price_list_number, d.line_number
    `);
    exportToExcel(items, exportFields, exportHeaders, 'piece_rate_prices', res);
  } catch (err) { next(err); }
};

// ==================== 导入 ====================
const importDetailFields = ['item_number', 'item_name', 'standard_process_number', 'standard_process_name', 'item_category', 'equipment_number', 'equipment_name', 'employee_number', 'employee_name', 'custom_field', 'qualified_piece_rate', 'defective_piece_rate', 'drawing_number', 'version', 'specifications', 'material_type'];
const importDetailHeaders = ['物料编号', '物料名称', '工序编号', '工序名称', '物料分类', '设备编号', '设备名称', '人员编号', '人员名称', '自定义项', '合格品计件单价', '次品计件单价', '图号', '版本', '规格', '材质'];

export const importPieceRatePrice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, importDetailFields, importDetailHeaders);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }

    const price_list_number = await generatePriceListNumber();
    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const creation_man = (req as any).user?.username || '';
    const b = req.body;

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO piece_rate_price_header (price_list_number, price_list_name, effective_date, expiration_date,
          approval_status, remark, creation_date, creation_man)
        VALUES (:price_list_number, :price_list_name, :effective_date, :expiration_date,
          N'草稿', :remark, :creation_date, :creation_man)
      `, {
        replacements: {
          price_list_number,
          price_list_name: b?.price_list_name || '导入计件单价表',
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
          INSERT INTO piece_rate_price_detail (price_list_number, line_number,
            item_number, item_name, standard_process_number, standard_process_name,
            item_category, equipment_number, equipment_name,
            employee_number, employee_name, custom_field,
            qualified_piece_rate, defective_piece_rate,
            drawing_number, version, specifications, material_type)
          VALUES (:price_list_number, :line_number,
            :item_number, :item_name, :standard_process_number, :standard_process_name,
            :item_category, :equipment_number, :equipment_name,
            :employee_number, :employee_name, :custom_field,
            :qualified_piece_rate, :defective_piece_rate,
            :drawing_number, :version, :specifications, :material_type)
        `, {
          replacements: {
            price_list_number,
            line_number: (i + 1) * 10,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            standard_process_number: String(d.standard_process_number || ''),
            standard_process_name: d.standard_process_name || '',
            item_category: d.item_category || '',
            equipment_number: d.equipment_number || '',
            equipment_name: d.equipment_name || '',
            employee_number: d.employee_number || '',
            employee_name: d.employee_name || '',
            custom_field: d.custom_field || '',
            qualified_piece_rate: parseFloat(d.qualified_piece_rate) || 0,
            defective_piece_rate: parseFloat(d.defective_piece_rate) || 0,
            drawing_number: d.drawing_number || '',
            version: d.version || '',
            specifications: d.specifications || '',
            material_type: d.material_type || ''
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ price_list_number, imported: rows.length }, `成功导入 ${rows.length} 条明细到计件单价表 ${price_list_number}`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};
