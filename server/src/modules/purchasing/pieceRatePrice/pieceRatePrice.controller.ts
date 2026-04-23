import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import dayjs from 'dayjs';
import { ORDER_STATUS } from '@/shared/constants/statuses';

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
      conditions.push(`(item_number LIKE :search OR item_name LIKE :search OR standard_process_number LIKE :search OR standard_process_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      conditions.push(`approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM piece_rate_price ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT id, item_number, item_name, standard_process_number, standard_process_name,
               item_category, approval_status, equipment_number, equipment_name,
               employee_number, employee_name, custom_field,
               qualified_piece_rate, defective_piece_rate,
               effective_date, expiration_date,
               drawing_number, version, specifications, material_type,
               creation_date, creation_man,
               ROW_NUMBER() OVER (ORDER BY creation_date DESC, id DESC) AS _row_num
        FROM piece_rate_price ${whereClause}
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
    const [rows]: any = await sequelize.query(
      `SELECT * FROM piece_rate_price WHERE id = :id`, { replacements: { id } }
    );
    if (!rows.length) { res.status(404).json({ success: false, message: '计件单价记录不存在' }); return; }
    res.json(success(rows[0], '获取计件单价详情成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createPieceRatePrice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.item_number) { res.status(400).json({ success: false, message: '物料编号不能为空' }); return; }
    if (!b.standard_process_number) { res.status(400).json({ success: false, message: '工序编号不能为空' }); return; }

    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const creation_man = (req as any).user?.username || '';

    await sequelize.query(`
      INSERT INTO piece_rate_price (item_number, item_name, standard_process_number, standard_process_name,
        item_category, approval_status, equipment_number, equipment_name,
        employee_number, employee_name, custom_field,
        qualified_piece_rate, defective_piece_rate,
        effective_date, expiration_date,
        drawing_number, version, specifications, material_type,
        creation_date, creation_man)
      VALUES (:item_number, :item_name, :standard_process_number, :standard_process_name,
        :item_category, N'草稿', :equipment_number, :equipment_name,
        :employee_number, :employee_name, :custom_field,
        :qualified_piece_rate, :defective_piece_rate,
        :effective_date, :expiration_date,
        :drawing_number, :version, :specifications, :material_type,
        :creation_date, :creation_man)
    `, {
      replacements: {
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        standard_process_number: b.standard_process_number || '',
        standard_process_name: b.standard_process_name || '',
        item_category: b.item_category || '',
        equipment_number: b.equipment_number || '',
        equipment_name: b.equipment_name || '',
        employee_number: b.employee_number || '',
        employee_name: b.employee_name || '',
        custom_field: b.custom_field || '',
        qualified_piece_rate: b.qualified_piece_rate || 0,
        defective_piece_rate: b.defective_piece_rate || 0,
        effective_date: b.effective_date || null,
        expiration_date: b.expiration_date || null,
        drawing_number: b.drawing_number || '',
        version: b.version || '',
        specifications: b.specifications || '',
        material_type: b.material_type || '',
        creation_date: now,
        creation_man
      }
    });

    res.json(success(null, '创建计件单价成功'));
  } catch (err) { next(err); }
};

// ==================== 更新 ====================
export const updatePieceRatePrice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM piece_rate_price WHERE id = :id`, { replacements: { id } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '计件单价记录不存在' }); return; }
    if (chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return;
    }

    await sequelize.query(`
      UPDATE piece_rate_price SET
        item_number = :item_number, item_name = :item_name,
        standard_process_number = :standard_process_number, standard_process_name = :standard_process_name,
        item_category = :item_category,
        equipment_number = :equipment_number, equipment_name = :equipment_name,
        employee_number = :employee_number, employee_name = :employee_name,
        custom_field = :custom_field,
        qualified_piece_rate = :qualified_piece_rate, defective_piece_rate = :defective_piece_rate,
        effective_date = :effective_date, expiration_date = :expiration_date,
        drawing_number = :drawing_number, version = :version,
        specifications = :specifications, material_type = :material_type
      WHERE id = :id
    `, {
      replacements: {
        id,
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        standard_process_number: b.standard_process_number || '',
        standard_process_name: b.standard_process_name || '',
        item_category: b.item_category || '',
        equipment_number: b.equipment_number || '',
        equipment_name: b.equipment_name || '',
        employee_number: b.employee_number || '',
        employee_name: b.employee_name || '',
        custom_field: b.custom_field || '',
        qualified_piece_rate: b.qualified_piece_rate || 0,
        defective_piece_rate: b.defective_piece_rate || 0,
        effective_date: b.effective_date || null,
        expiration_date: b.expiration_date || null,
        drawing_number: b.drawing_number || '',
        version: b.version || '',
        specifications: b.specifications || '',
        material_type: b.material_type || ''
      }
    });

    res.json(success(null, '更新计件单价成功'));
  } catch (err) { next(err); }
};

// ==================== 删除 ====================
export const deletePieceRatePrice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM piece_rate_price WHERE id = :id`, { replacements: { id } }
    );
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return;
    }
    await sequelize.query(`DELETE FROM piece_rate_price WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '删除计件单价成功'));
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = [
  'item_number', 'item_name', 'standard_process_number', 'standard_process_name',
  'item_category', 'approval_status', 'equipment_number', 'equipment_name',
  'employee_number', 'employee_name', 'custom_field',
  'qualified_piece_rate', 'defective_piece_rate',
  'effective_date', 'expiration_date',
  'drawing_number', 'version', 'specifications', 'material_type'
];
const exportHeaders = [
  '物料编号', '物料名称', '工序编号', '工序名称',
  '物料分类名称', '审核状态', '设备编号', '设备名称',
  '人员编号', '人员名称', '自定义项',
  '合格品计件单价（元/产品）', '次品计件单价（元/产品）',
  '生效时间', '失效时间',
  '图号', '版本', '规格', '材质'
];

export const exportPieceRatePrices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const conditions: string[] = [];
    const replacements: any = {};
    if (search) {
      conditions.push(`(item_number LIKE :search OR item_name LIKE :search OR standard_process_number LIKE :search OR standard_process_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      conditions.push(`approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [items]: any = await sequelize.query(`
      SELECT item_number, item_name, standard_process_number, standard_process_name,
             item_category, approval_status, equipment_number, equipment_name,
             employee_number, employee_name, custom_field,
             qualified_piece_rate, defective_piece_rate,
             CONVERT(VARCHAR(10), effective_date, 23) as effective_date,
             CONVERT(VARCHAR(10), expiration_date, 23) as expiration_date,
             drawing_number, version, specifications, material_type
      FROM piece_rate_price ${whereClause}
      ORDER BY item_number, standard_process_number
    `, { replacements });

    exportToExcel(items, exportFields, exportHeaders, 'piece_rate_prices', res);
  } catch (err) { next(err); }
};

// ==================== 导入 ====================
const importFields = [
  'item_number', 'item_name', 'standard_process_number', 'standard_process_name',
  'item_category', 'approval_status', 'equipment_number', 'equipment_name',
  'employee_number', 'employee_name', 'custom_field',
  'qualified_piece_rate', 'defective_piece_rate',
  'effective_date', 'expiration_date',
  'drawing_number', 'version', 'specifications', 'material_type'
];
const importHeaders = [
  '物料编号', '物料名称', '工序编号', '工序名称',
  '物料分类名称', '审核状态', '设备编号', '设备名称',
  '人员编号', '人员名称', '自定义项',
  '合格品计件单价（元/产品）', '次品计件单价（元/产品）',
  '生效时间', '失效时间',
  '图号', '版本', '规格', '材质'
];

export const importPieceRatePrice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, importFields, importHeaders);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }

    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      for (let i = 0; i < rows.length; i++) {
        const d = rows[i];
        await sequelize.query(`
          INSERT INTO piece_rate_price (item_number, item_name, standard_process_number, standard_process_name,
            item_category, approval_status, equipment_number, equipment_name,
            employee_number, employee_name, custom_field,
            qualified_piece_rate, defective_piece_rate,
            effective_date, expiration_date,
            drawing_number, version, specifications, material_type,
            creation_date, creation_man)
          VALUES (:item_number, :item_name, :standard_process_number, :standard_process_name,
            :item_category, N'草稿', :equipment_number, :equipment_name,
            :employee_number, :employee_name, :custom_field,
            :qualified_piece_rate, :defective_piece_rate,
            :effective_date, :expiration_date,
            :drawing_number, :version, :specifications, :material_type,
            :creation_date, :creation_man)
        `, {
          replacements: {
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
            effective_date: d.effective_date || null,
            expiration_date: d.expiration_date || null,
            drawing_number: d.drawing_number || '',
            version: d.version || '',
            specifications: d.specifications || '',
            material_type: d.material_type || '',
            creation_date: now,
            creation_man
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ imported: rows.length }, `成功导入 ${rows.length} 条计件单价记录`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};
