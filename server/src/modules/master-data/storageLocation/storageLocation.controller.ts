import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';

const fields = ['location_number', 'location_name', 'warehouse_number', 'warehouse_name', 'zone', 'cabinet', 'layer', 'grid', 'location_column', 'is_default', 'created_by', 'updated_by', 'created_at', 'updated_at'];
const headers = ['库位编号', '库位名称', '仓库编号', '仓库名称', '区', '柜', '层', '格', '列', '默认库位', '创建人', '更新人', '创建时间', '更新时间'];

// 通过仓库编号查询仓库名称
async function lookupWarehouseName(warehouseNumber: string): Promise<string> {
  if (!warehouseNumber) return '';
  try {
    const [rows]: any = await sequelize.query(
      `SELECT TOP 1 warehouse_name FROM warehouse WHERE warehouse_number = :wn`,
      { replacements: { wn: warehouseNumber } }
    );
    if (rows.length > 0) {
      return (rows[0].warehouse_name || '').trim();
    }
  } catch (e) {}
  return '';
}

export const getStorageLocations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const warehouseName = (req.query.warehouse_name as string) || '';
    let whereClause = 'WHERE 1=1';
    const replacements: any = {};
    if (search) {
      whereClause += ` AND (location_number LIKE :search OR location_name LIKE :search OR zone LIKE :search OR warehouse_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (warehouseName) {
      whereClause += ` AND warehouse_name = :warehouseName`;
      replacements.warehouseName = warehouseName;
    }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM storage_location ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(
      `SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY location_number) AS _row_num FROM storage_location ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    // 获取仓库名称列表用于筛选
    const [warehouses]: any = await sequelize.query(`SELECT DISTINCT warehouse_name FROM storage_location WHERE warehouse_name != '' AND warehouse_name IS NOT NULL ORDER BY warehouse_name`);
    // 获取仓库编号+名称列表用于下拉选择
    const [warehouseList]: any = await sequelize.query(`SELECT warehouse_number, warehouse_name FROM warehouse ORDER BY warehouse_number`);
    res.json(success({
      items: cleanItems,
      warehouses: warehouses.map((w: any) => (w.warehouse_name || '').trim()),
      warehouseList: warehouseList.map((w: any) => ({ warehouse_number: (w.warehouse_number || '').trim(), warehouse_name: (w.warehouse_name || '').trim() })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取库位列表成功'));
  } catch (err) { next(err); }
};

export const createStorageLocation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.location_number) { res.status(400).json({ success: false, message: '库位编号不能为空' }); return; }
    // 检查编号是否重复
    const [existing]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM storage_location WHERE location_number = :location_number`, { replacements: { location_number: b.location_number } });
    if (existing[0].cnt > 0) { res.status(400).json({ success: false, message: '库位编号已存在' }); return; }
    const username = (req as any).user?.username || '';
    // 如果提供了仓库编号，自动查出仓库名称
    let warehouseName = b.warehouse_name || '';
    if (b.warehouse_number) {
      const looked = await lookupWarehouseName(b.warehouse_number);
      if (looked) warehouseName = looked;
    }
    await sequelize.query(`
      INSERT INTO storage_location (location_number, location_name, warehouse_number, warehouse_name, zone, cabinet, layer, grid, location_column, is_default, created_by, updated_by, created_at, updated_at)
      VALUES (:location_number, :location_name, :warehouse_number, :warehouse_name, :zone, :cabinet, :layer, :grid, :location_column, :is_default, :created_by, :updated_by, GETDATE(), GETDATE())
    `, {
      replacements: {
        location_number: b.location_number,
        location_name: b.location_name || '',
        warehouse_number: b.warehouse_number || '',
        warehouse_name: warehouseName,
        zone: b.zone || '',
        cabinet: b.cabinet || '',
        layer: b.layer || '',
        grid: b.grid || '',
        location_column: b.location_column || '',
        is_default: b.is_default || '否',
        created_by: username,
        updated_by: username
      }
    });
    res.json(success(null, '创建库位成功'));
  } catch (err) { next(err); }
};

export const updateStorageLocation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM storage_location WHERE id = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' }); return; }
    const b = req.body;
    const username = (req as any).user?.username || '';
    // 如果提供了仓库编号，自动查出仓库名称
    let warehouseName = b.warehouse_name || '';
    if (b.warehouse_number) {
      const looked = await lookupWarehouseName(b.warehouse_number);
      if (looked) warehouseName = looked;
    }
    await sequelize.query(`
      UPDATE storage_location SET
        location_name = :location_name, warehouse_number = :warehouse_number, warehouse_name = :warehouse_name, zone = :zone,
        cabinet = :cabinet, layer = :layer, grid = :grid, location_column = :location_column,
        is_default = :is_default, updated_by = :updated_by, updated_at = GETDATE()
      WHERE id = :id
    `, {
      replacements: {
        id,
        location_name: b.location_name || '',
        warehouse_number: b.warehouse_number || '',
        warehouse_name: warehouseName,
        zone: b.zone || '',
        cabinet: b.cabinet || '',
        layer: b.layer || '',
        grid: b.grid || '',
        location_column: b.location_column || '',
        is_default: b.is_default || '否',
        updated_by: username
      }
    });
    res.json(success(null, '更新库位成功'));
  } catch (err) { next(err); }
};

export const approveStorageLocation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE storage_location SET approval_status = N'已审核' WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawStorageLocation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE storage_location SET approval_status = N'未审核' WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};

export const deleteStorageLocation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM storage_location WHERE id = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许删除，请先撤消审核' }); return; }
    await sequelize.query(`DELETE FROM storage_location WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '删除库位成功'));
  } catch (err) { next(err); }
};

export const exportStorageLocations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM storage_location ORDER BY location_number`);
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, fields, headers, 'storage_locations', res, format);
  } catch (err) { next(err); }
};

export const importStorageLocations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    const username = (req as any).user?.username || '';
    let successCount = 0;
    let updateCount = 0;
    for (const item of rows) {
      if (!item.location_number) continue;
      // 如果有仓库编号，自动查出仓库名称
      if (item.warehouse_number) {
        const looked = await lookupWarehouseName(item.warehouse_number);
        if (looked) item.warehouse_name = looked;
      }
      try {
        const [existing]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM storage_location WHERE location_number = :location_number`, { replacements: { location_number: item.location_number } });
        if (existing[0].cnt > 0) {
          await sequelize.query(`
            UPDATE storage_location SET
              location_name = :location_name, warehouse_number = :warehouse_number, warehouse_name = :warehouse_name, zone = :zone,
              cabinet = :cabinet, layer = :layer, grid = :grid, location_column = :location_column,
              is_default = :is_default, updated_by = :updated_by, updated_at = GETDATE()
            WHERE location_number = :location_number
          `, {
            replacements: {
              location_number: item.location_number,
              location_name: item.location_name || '',
              warehouse_number: item.warehouse_number || '',
              warehouse_name: item.warehouse_name || '',
              zone: item.zone || '',
              cabinet: item.cabinet || '',
              layer: item.layer || '',
              grid: item.grid || '',
              location_column: item.location_column || '',
              is_default: item.is_default || '否',
              updated_by: username
            }
          });
          updateCount++;
        } else {
          await sequelize.query(`
            INSERT INTO storage_location (location_number, location_name, warehouse_number, warehouse_name, zone, cabinet, layer, grid, location_column, is_default, created_by, updated_by, created_at, updated_at)
            VALUES (:location_number, :location_name, :warehouse_number, :warehouse_name, :zone, :cabinet, :layer, :grid, :location_column, :is_default, :created_by, :updated_by, :created_at, GETDATE())
          `, {
            replacements: {
              location_number: item.location_number,
              location_name: item.location_name || '',
              warehouse_number: item.warehouse_number || '',
              warehouse_name: item.warehouse_name || '',
              zone: item.zone || '',
              cabinet: item.cabinet || '',
              layer: item.layer || '',
              grid: item.grid || '',
              location_column: item.location_column || '',
              is_default: item.is_default || '否',
              created_by: item.created_by || username,
              updated_by: item.updated_by || username,
              created_at: item.created_at || null
            }
          });
          successCount++;
        }
      } catch (e) {}
    }
    res.json(success({ successCount, updateCount, totalCount: rows.length }, `成功导入 ${successCount} 条，更新 ${updateCount} 条`));
  } catch (err) { next(err); }
};

export const toggleStorageLocationStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE storage_location SET status = CASE WHEN ISNULL(status, N'启用') = N'启用' THEN N'禁用' ELSE N'启用' END WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '状态更新成功'));
  } catch (err) { next(err); }
};
