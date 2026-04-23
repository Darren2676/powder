import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { APPROVAL_STATUS, CONDITION_STATUS } from '@/shared/constants/statuses';

const fields = ['warehouse_number', 'warehouse_name', 'warehouse_type', 'condition', 'supplier_number', 'customer_number', 'enable_location', 'default_location', 'is_system_warehouse', 'is_in_balance', 'remark', 'creation_date', 'creation_man', 'last_updater', 'last_updated_at'];
const headers = ['仓库编号', '仓库名称', '仓库类型', '启用状态', '供应商编号', '客户编号', '启用库位', '默认库位', '是否系统仓库', '是否参与结存', '备注', '创建时间', '创建人', '最后更新人', '最后更新时间'];

export const getWarehouses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) { whereClause = `WHERE warehouse_number LIKE :search OR warehouse_name LIKE :search`; replacements.search = `%${search}%`; }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM warehouse ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY warehouse_number) AS _row_num FROM warehouse ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取仓库列表成功'));
  } catch (err) { next(err); }
};

export const getWarehouseDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(`SELECT * FROM warehouse WHERE warehouse_number = :id`, { replacements: { id } });
    if (rows.length === 0) { res.status(404).json({ success: false, message: '仓库不存在' }); return; }
    const [managers]: any = await sequelize.query(`SELECT * FROM warehouse_manager WHERE warehouse_number = :id ORDER BY created_at`, { replacements: { id } });
    res.json(success({ ...rows[0], managers }, '获取仓库详情成功'));
  } catch (err) { next(err); }
};

export const createWarehouse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.warehouse_number) { res.status(400).json({ success: false, message: '仓库编号不能为空' }); return; }
    const username = (req as any).user?.username || '';
    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    await sequelize.query(`
      INSERT INTO warehouse (warehouse_number, warehouse_name, warehouse_type, [condition], supplier_number, customer_number, enable_location, default_location, is_system_warehouse, is_in_balance, remark, creation_date, creation_man, last_updater, last_updated_at)
      VALUES (:warehouse_number, :warehouse_name, :warehouse_type, :condition, :supplier_number, :customer_number, :enable_location, :default_location, :is_system_warehouse, :is_in_balance, :remark, :creation_date, :creation_man, :last_updater, GETDATE())
    `, {
      replacements: {
        warehouse_number: b.warehouse_number,
        warehouse_name: b.warehouse_name || '',
        warehouse_type: b.warehouse_type || '',
        condition: b.condition || CONDITION_STATUS.ENABLED,
        supplier_number: b.supplier_number || '',
        customer_number: b.customer_number || '',
        enable_location: b.enable_location || '否',
        default_location: b.default_location || '',
        is_system_warehouse: b.is_system_warehouse || '否',
        is_in_balance: b.is_in_balance || '是',
        remark: b.remark || '',
        creation_date,
        creation_man: username,
        last_updater: username
      }
    });
    // 添加仓库负责人
    if (b.managers && Array.isArray(b.managers)) {
      for (const m of b.managers) {
        if (m.manager_name) {
          await sequelize.query(`INSERT INTO warehouse_manager (warehouse_number, manager_name) VALUES (:warehouse_number, :manager_name)`, {
            replacements: { warehouse_number: b.warehouse_number, manager_name: m.manager_name }
          });
        }
      }
    }
    res.json(success(null, '创建仓库成功'));
  } catch (err) { next(err); }
};

export const updateWarehouse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM warehouse WHERE warehouse_number = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' }); return; }
    const b = req.body;
    const username = (req as any).user?.username || '';
    await sequelize.query(`
      UPDATE warehouse SET
        warehouse_name = :warehouse_name, warehouse_type = :warehouse_type, [condition] = :condition,
        supplier_number = :supplier_number, customer_number = :customer_number,
        enable_location = :enable_location, default_location = :default_location,
        is_system_warehouse = :is_system_warehouse, is_in_balance = :is_in_balance,
        remark = :remark, last_updater = :last_updater, last_updated_at = GETDATE()
      WHERE warehouse_number = :id
    `, {
      replacements: {
        id,
        warehouse_name: b.warehouse_name || '',
        warehouse_type: b.warehouse_type || '',
        condition: b.condition || CONDITION_STATUS.ENABLED,
        supplier_number: b.supplier_number || '',
        customer_number: b.customer_number || '',
        enable_location: b.enable_location || '否',
        default_location: b.default_location || '',
        is_system_warehouse: b.is_system_warehouse || '否',
        is_in_balance: b.is_in_balance || '是',
        remark: b.remark || '',
        last_updater: username
      }
    });
    // 更新仓库负责人: 先删后增
    if (b.managers !== undefined) {
      await sequelize.query(`DELETE FROM warehouse_manager WHERE warehouse_number = :id`, { replacements: { id } });
      if (Array.isArray(b.managers)) {
        for (const m of b.managers) {
          if (m.manager_name) {
            await sequelize.query(`INSERT INTO warehouse_manager (warehouse_number, manager_name) VALUES (:warehouse_number, :manager_name)`, {
              replacements: { warehouse_number: id, manager_name: m.manager_name }
            });
          }
        }
      }
    }
    res.json(success(null, '更新仓库成功'));
  } catch (err) { next(err); }
};

export const approveWarehouse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE warehouse SET approval_status = N'已审核' WHERE warehouse_number = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawWarehouse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE warehouse SET approval_status = N'未审核' WHERE warehouse_number = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};

export const deleteWarehouse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM warehouse WHERE warehouse_number = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许删除，请先撤消审核' }); return; }
    await sequelize.query(`DELETE FROM warehouse_manager WHERE warehouse_number = :id`, { replacements: { id } });
    await sequelize.query(`DELETE FROM warehouse WHERE warehouse_number = :id`, { replacements: { id } });
    res.json(success(null, '删除仓库成功'));
  } catch (err) { next(err); }
};

export const exportWarehouses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM warehouse ORDER BY warehouse_number`);
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, fields, headers, 'warehouses', res, format);
  } catch (err) { next(err); }
};

export const importWarehouses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    const username = (req as any).user?.username || '';
    let successCount = 0;
    for (const item of rows) {
      try {
        const [existing]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM warehouse WHERE warehouse_number = :wn`, { replacements: { wn: item.warehouse_number } });
        if (existing[0].cnt > 0) {
          await sequelize.query(`
            UPDATE warehouse SET warehouse_name = :warehouse_name, warehouse_type = :warehouse_type, [condition] = :condition,
              supplier_number = :supplier_number, customer_number = :customer_number,
              enable_location = :enable_location, default_location = :default_location,
              is_system_warehouse = :is_system_warehouse, is_in_balance = :is_in_balance,
              remark = :remark, last_updater = :last_updater, last_updated_at = GETDATE()
            WHERE warehouse_number = :warehouse_number
          `, {
            replacements: {
              warehouse_number: item.warehouse_number,
              warehouse_name: item.warehouse_name || '',
              warehouse_type: item.warehouse_type || '',
              condition: item.condition || CONDITION_STATUS.ENABLED,
              supplier_number: item.supplier_number || '',
              customer_number: item.customer_number || '',
              enable_location: item.enable_location || '否',
              default_location: item.default_location || '',
              is_system_warehouse: item.is_system_warehouse || '否',
              is_in_balance: item.is_in_balance || '是',
              remark: item.remark || '',
              last_updater: username
            }
          });
        } else {
          await sequelize.query(`
            INSERT INTO warehouse (warehouse_number, warehouse_name, warehouse_type, [condition], supplier_number, customer_number, enable_location, default_location, is_system_warehouse, is_in_balance, remark, creation_date, creation_man, last_updater, last_updated_at)
            VALUES (:warehouse_number, :warehouse_name, :warehouse_type, :condition, :supplier_number, :customer_number, :enable_location, :default_location, :is_system_warehouse, :is_in_balance, :remark, :creation_date, :creation_man, :last_updater, GETDATE())
          `, {
            replacements: {
              warehouse_number: item.warehouse_number || '',
              warehouse_name: item.warehouse_name || '',
              warehouse_type: item.warehouse_type || '',
              condition: item.condition || CONDITION_STATUS.ENABLED,
              supplier_number: item.supplier_number || '',
              customer_number: item.customer_number || '',
              enable_location: item.enable_location || '否',
              default_location: item.default_location || '',
              is_system_warehouse: item.is_system_warehouse || '否',
              is_in_balance: item.is_in_balance || '是',
              remark: item.remark || '',
              creation_date: item.creation_date || null,
              creation_man: item.creation_man || username,
              last_updater: username
            }
          });
        }
        successCount++;
      } catch (e) {}
    }
    res.json(success({ successCount, totalCount: rows.length }, `成功导入 ${successCount} 条记录`));
  } catch (err) { next(err); }
};

// ======== 仓库负责人管理 ========
export const addWarehouseManager = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { manager_name } = req.body;
    if (!manager_name) { res.status(400).json({ success: false, message: '负责人姓名不能为空' }); return; }
    await sequelize.query(`INSERT INTO warehouse_manager (warehouse_number, manager_name) VALUES (:warehouse_number, :manager_name)`, {
      replacements: { warehouse_number: id, manager_name }
    });
    // 更新仓库最后更新人和时间
    const username = (req as any).user?.username || '';
    await sequelize.query(`UPDATE warehouse SET last_updater = :u, last_updated_at = GETDATE() WHERE warehouse_number = :id`, { replacements: { u: username, id } });
    res.json(success(null, '添加负责人成功'));
  } catch (err) { next(err); }
};

export const removeWarehouseManager = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { managerId } = req.params;
    await sequelize.query(`DELETE FROM warehouse_manager WHERE id = :id`, { replacements: { id: managerId } });
    res.json(success(null, '删除负责人成功'));
  } catch (err) { next(err); }
};
