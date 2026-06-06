import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';
import { getFactoryId } from '../../../utils/factoryWhere.util';

const fields = [
  'equipment_number', 'downtime_type', 'start_time', 'end_time',
  'duration_minutes', 'fault_reason', 'treatment', 'replaced_parts',
  'cost', 'performed_by', 'remark'
];
const headers = [
  '设备编号', '停机类型', '开始时间', '结束时间',
  '持续分钟', '故障原因', '处理方式', '更换部件',
  '费用', '执行人', '备注'
];

export const getEquipmentDowntimes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const equipmentNumber = (req.query.equipment_number as string) || '';
    const downtimeType = (req.query.downtime_type as string) || '';
    const dateFrom = (req.query.date_from as string) || '';
    const dateTo = (req.query.date_to as string) || '';
    const search = (req.query.search as string) || '';

    let whereClause = 'WHERE 1=1';
    const replacements: any = {};

    if (equipmentNumber) {
      whereClause += ' AND ed.equipment_number = :equipmentNumber';
      replacements.equipmentNumber = equipmentNumber;
    }
    if (downtimeType) {
      whereClause += ' AND ed.downtime_type = :downtimeType';
      replacements.downtimeType = downtimeType;
    }
    if (dateFrom) {
      whereClause += ' AND ed.start_time >= :dateFrom';
      replacements.dateFrom = dateFrom;
    }
    if (dateTo) {
      whereClause += ' AND ed.start_time <= :dateTo';
      replacements.dateTo = dateTo;
    }
    if (search) {
      whereClause += ' AND (ed.fault_reason LIKE :search OR ed.treatment LIKE :search OR ed.remark LIKE :search)';
      replacements.search = `%${search}%`;
    }

    // 多工厂数据隔离过滤
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      whereClause += ' AND ed.factory_id = :_factoryId';
      replacements._factoryId = _factoryId;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM equipment_downtime ed ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const offsetEnd = offset + limit;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT ed.*, e.equipment_name, f.factory_name, f.factory_short, ROW_NUMBER() OVER (ORDER BY ed.start_time DESC, ed.id DESC) AS _row_num
        FROM equipment_downtime ed
        LEFT JOIN equipment e ON ed.equipment_number = e.equipment_number
        LEFT JOIN factory f ON ed.factory_id = f.id
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
    }, '获取停机记录成功'));
  } catch (err) { next(err); }
};

export const createEquipmentDowntime = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const username = (req as any).user?.username || '';
    const _factoryId = getFactoryId(req);

    if (!b.equipment_number) {
      res.status(400).json({ success: false, message: '设备编号不能为空' });
      return;
    }
    if (!b.downtime_type) {
      res.status(400).json({ success: false, message: '停机类型不能为空' });
      return;
    }
    if (!b.start_time) {
      res.status(400).json({ success: false, message: '开始时间不能为空' });
      return;
    }

    // 验证设备存在
    const [eqRows]: any = await sequelize.query(
      `SELECT equipment_number FROM equipment WHERE equipment_number = :en`,
      { replacements: { en: b.equipment_number } }
    );
    if (eqRows.length === 0) {
      res.status(400).json({ success: false, message: '设备编号不存在' });
      return;
    }

    // 计算持续分钟
    let durationMinutes = b.duration_minutes || null;
    if (b.start_time && b.end_time) {
      const start = new Date(b.start_time);
      const end = new Date(b.end_time);
      durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    }

    const cols = fields.join(', ') + ', approval_status, created_by, factory_id';
    const vals = fields.map(f => ':' + f).join(', ') + ', N\'未审核\', :created_by, :factory_id';
    const replacements: any = { created_by: username, factory_id: _factoryId };
    for (const f of fields) {
      if (f === 'duration_minutes') {
        replacements[f] = durationMinutes;
      } else if (f === 'cost') {
        replacements[f] = b[f] !== undefined ? b[f] : 0;
      } else {
        replacements[f] = b[f] !== undefined ? b[f] : null;
      }
    }

    await sequelize.query(`INSERT INTO equipment_downtime (${cols}) VALUES (${vals})`, { replacements });

    // 如果有结束时间，设备状态自动恢复为闲置
    if (b.end_time) {
      await sequelize.query(
        `UPDATE equipment SET equipment_status = N'闲置', last_status_change_time = GETDATE() WHERE equipment_number = :en AND equipment_status IN (N'故障', N'保养', N'停用')`,
        { replacements: { en: b.equipment_number } }
      );
    }

    res.json(success(null, '创建停机记录成功'));
  } catch (err) { next(err); }
};

export const updateEquipmentDowntime = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    // 计算持续分钟
    if (b.start_time && b.end_time) {
      const start = new Date(b.start_time);
      const end = new Date(b.end_time);
      b.duration_minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    }

    const setClauses = fields.map(f => `${f} = :${f}`).join(', ');
    const replacements: any = { id };
    for (const f of fields) {
      if (f === 'cost') {
        replacements[f] = b[f] !== undefined ? b[f] : 0;
      } else {
        replacements[f] = b[f] !== undefined ? b[f] : null;
      }
    }

    await sequelize.query(
      `UPDATE equipment_downtime SET ${setClauses} WHERE id = :id`,
      { replacements }
    );
    res.json(success(null, '更新停机记录成功'));
  } catch (err) { next(err); }
};

export const deleteEquipmentDowntime = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM equipment_downtime WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '删除停机记录成功'));
  } catch (err) { next(err); }
};

export const exportEquipmentDowntimes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const equipmentNumber = (req.query.equipment_number as string) || '';
    const downtimeType = (req.query.downtime_type as string) || '';
    let whereClause = 'WHERE 1=1';
    const replacements: any = {};
    if (equipmentNumber) { whereClause += ' AND ed.equipment_number = :equipmentNumber'; replacements.equipmentNumber = equipmentNumber; }
    if (downtimeType) { whereClause += ' AND ed.downtime_type = :downtimeType'; replacements.downtimeType = downtimeType; }

    const [items]: any = await sequelize.query(
      `SELECT ed.*, e.equipment_name FROM equipment_downtime ed LEFT JOIN equipment e ON ed.equipment_number = e.equipment_number ${whereClause} ORDER BY ed.start_time DESC`,
      { replacements }
    );
    exportToExcel(items, fields, headers, 'equipment_downtimes', res);
  } catch (err) { next(err); }
};

export const approveEquipmentDowntime = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE equipment_downtime SET approval_status = N'已审核' WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawEquipmentDowntime = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE equipment_downtime SET approval_status = N'未审核' WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};
