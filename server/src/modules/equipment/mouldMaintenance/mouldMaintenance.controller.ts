import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { getFactoryId } from '../../../utils/factoryWhere.util';

const fields = [
  'mould_number', 'maintenance_type', 'maintenance_date', 'description',
  'fault_reason', 'replaced_parts', 'cost', 'performed_by',
  'strokes_reset', 'reset_strokes_to', 'remark'
];
const headers = [
  '模具编号', '维修类型', '维修日期', '维修内容',
  '故障原因', '更换部件', '费用', '执行人',
  '是否重置模次', '重置模次为', '备注'
];

// 计算寿命状态
function calcLifeStatus(totalStrokes: number, maxStrokes: number): string {
  if (maxStrokes <= 0) return '正常';
  if (totalStrokes >= maxStrokes) return '到期';
  if (totalStrokes >= maxStrokes * 0.9) return '预警';
  return '正常';
}

export const getMouldMaintenances = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const mouldNumber = (req.query.mould_number as string) || '';
    const maintenanceType = (req.query.maintenance_type as string) || '';
    const dateFrom = (req.query.date_from as string) || '';
    const dateTo = (req.query.date_to as string) || '';
    const search = (req.query.search as string) || '';

    let whereClause = 'WHERE 1=1';
    const replacements: any = {};

    if (mouldNumber) {
      whereClause += ' AND mm.mould_number = :mouldNumber';
      replacements.mouldNumber = mouldNumber;
    }
    if (maintenanceType) {
      whereClause += ' AND mm.maintenance_type = :maintenanceType';
      replacements.maintenanceType = maintenanceType;
    }
    if (dateFrom) {
      whereClause += ' AND mm.maintenance_date >= :dateFrom';
      replacements.dateFrom = dateFrom;
    }
    if (dateTo) {
      whereClause += ' AND mm.maintenance_date <= :dateTo';
      replacements.dateTo = dateTo;
    }
    if (search) {
      whereClause += ' AND (mm.description LIKE :search OR mm.fault_reason LIKE :search OR mm.remark LIKE :search)';
      replacements.search = `%${search}%`; 
    }
    
    // 多工厂数据隔离过滤
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      whereClause += ' AND mm.factory_id = :_factoryId';
      replacements._factoryId = effectiveFactoryId;
    }
    
    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM mould_maintenance mm ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const offsetEnd = offset + limit;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT mm.*, m.item_name AS mould_name, f.factory_name, f.factory_short, ROW_NUMBER() OVER (ORDER BY mm.maintenance_date DESC, mm.id DESC) AS _row_num
        FROM mould_maintenance mm
        LEFT JOIN mould m ON mm.mould_number = m.item_number
        LEFT JOIN factory f ON mm.factory_id = f.id
        ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd } });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取维修记录成功'));
  } catch (err) { next(err); }
};

export const createMouldMaintenance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const username = (req as any).user?.username || '';
    const _factoryId = getFactoryId(req);

    if (!b.mould_number) {
      res.status(400).json({ success: false, message: '模具编号不能为空' });
      return;
    }
    if (!b.maintenance_type) {
      res.status(400).json({ success: false, message: '维修类型不能为空' });
      return;
    }
    if (!b.maintenance_date) {
      res.status(400).json({ success: false, message: '维修日期不能为空' });
      return;
    }

    // 获取当前模次快照
    const [mouldRows]: any = await sequelize.query(
      `SELECT total_strokes, max_strokes, maintenance_cycle_days, last_maintenance_date FROM mould WHERE item_number = :mn`,
      { replacements: { mn: b.mould_number } }
    );
    if (mouldRows.length === 0) {
      res.status(400).json({ success: false, message: '模具编号不存在' });
      return;
    }

    const currentStrokes = mouldRows[0].total_strokes || 0;

    const cols = fields.join(', ') + ', strokes_at_maintenance, created_by, factory_id';
    const vals = fields.map(f => ':' + f).join(', ') + ', :strokes_at_maintenance, :created_by, :factory_id';
    const replacements: any = { created_by: username, strokes_at_maintenance: currentStrokes, factory_id: _factoryId };
    for (const f of fields) {
      replacements[f] = b[f] !== undefined ? b[f] : (f === 'cost' ? 0 : '');
    }

    await sequelize.query(`INSERT INTO mould_maintenance (${cols}) VALUES (${vals})`, { replacements });

    // 更新模具保养日期
    const cycleDays = mouldRows[0].maintenance_cycle_days || 0;
    let updateMouldSql = `UPDATE mould SET last_maintenance_date = :mdate`;
    const updateReplacements: any = { mn: b.mould_number, mdate: b.maintenance_date };
    if (cycleDays > 0) {
      updateMouldSql += `, next_maintenance_date = DATEADD(DAY, :cycle, :mdate)`;
      updateReplacements.cycle = cycleDays;
    }

    // 翻新时重置模次
    if (b.maintenance_type === '翻新' && b.strokes_reset) {
      const resetTo = parseInt(b.reset_strokes_to) || 0;
      updateMouldSql += `, total_strokes = :resetTo, life_status = N'正常'`;
      updateReplacements.resetTo = resetTo;
    }

    updateMouldSql += ` WHERE item_number = :mn`;
    await sequelize.query(updateMouldSql, { replacements: updateReplacements });

    res.json(success(null, '创建维修记录成功'));
  } catch (err) { next(err); }
};

export const updateMouldMaintenance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const username = (req as any).user?.username || '';

    const setClauses = fields.map(f => `${f} = :${f}`).join(', ') + ', factory_id = :factory_id, updated_by = :updated_by';
    const replacements: any = { id, updated_by: username, factory_id: b.factory_id || null };
    for (const f of fields) {
      replacements[f] = b[f] !== undefined ? b[f] : (f === 'cost' ? 0 : '');
    }

    await sequelize.query(
      `UPDATE mould_maintenance SET ${setClauses} WHERE id = :id`,
      { replacements }
    );
    res.json(success(null, '更新维修记录成功'));
  } catch (err) { next(err); }
};

export const deleteMouldMaintenance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    await sequelize.query(`DELETE FROM mould_maintenance WHERE id = :id${factoryCond}`, { replacements: { id, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) } });
    res.json(success(null, '删除维修记录成功'));
  } catch (err) { next(err); }
};

export const exportMouldMaintenances = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mouldNumber = (req.query.mould_number as string) || '';
    const maintenanceType = (req.query.maintenance_type as string) || '';
    let whereClause = 'WHERE 1=1';
    const replacements: any = {};
    if (mouldNumber) { whereClause += ' AND mm.mould_number = :mouldNumber'; replacements.mouldNumber = mouldNumber; }
    if (maintenanceType) { whereClause += ' AND mm.maintenance_type = :maintenanceType'; replacements.maintenanceType = maintenanceType; }

    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      whereClause += ' AND mm.factory_id = :_factoryId';
      replacements._factoryId = effectiveFactoryId;
    }

    const [items]: any = await sequelize.query(
      `SELECT mm.*, m.item_name AS mould_name, f.factory_short FROM mould_maintenance mm LEFT JOIN mould m ON mm.mould_number = m.item_number LEFT JOIN factory f ON mm.factory_id = f.id ${whereClause} ORDER BY mm.maintenance_date DESC`,
      { replacements }
    );
    const exportFields = ['factory_short', ...fields];
    const exportHeaders = ['工厂', ...headers];
    exportToExcel(items, exportFields, exportHeaders, 'mould_maintenances', res);
  } catch (err) { next(err); }
};

export const importMouldMaintenances = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    const _factoryId = getFactoryId(req);
    let imported = 0;
    for (const item of rows) {
      if (!item.mould_number || !item.maintenance_type || !item.maintenance_date) continue;
      try {
        const cols = fields.join(', ') + ', factory_id';
        const vals = fields.map(f => ':' + f).join(', ') + ', :factory_id';
        await sequelize.query(`INSERT INTO mould_maintenance (${cols}) VALUES (${vals})`, { replacements: { ...item, factory_id: _factoryId } });
        imported++;
      } catch (e) {}
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};
