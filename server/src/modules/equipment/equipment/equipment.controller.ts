import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';
import { getFactoryId } from '../../../utils/factoryWhere.util';

const fields = ['equipment_number', 'equipment_name', 'record_date', 'equipment_type', 'equipment_model', 'manufacture_date', 'remark'];
const headers = ['设备编号', '设备名称', '登记日期', '设备类型', '设备型号', '出厂日期', '备注'];

// 合法设备状态列表
const VALID_STATUSES = ['运行', '闲置', '故障', '保养', '停用'];

export const getEquipments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const statusFilter = (req.query.equipment_status as string) || '';

    let whereClause = '';
    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push('(e.equipment_number LIKE :search OR e.equipment_name LIKE :search OR e.equipment_type LIKE :search OR e.equipment_model LIKE :search)');
      replacements.search = `%${search}%`;
    }
    if (statusFilter) {
      conditions.push('e.equipment_status = :statusFilter');
      replacements.statusFilter = statusFilter;
    }
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    // 多工厂数据隔离过滤
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      const factoryCondition = `e.factory_id = :_factoryId`;
      whereClause = whereClause ? whereClause + ` AND ${factoryCondition}` : `WHERE ${factoryCondition}`;
      replacements._factoryId = _factoryId;
    }

    const countSql = `SELECT COUNT(*) as total FROM equipment e ${whereClause}`;
    const [countResult]: any = await sequelize.query(countSql, { replacements });
    const total = countResult[0].total;

    const dataSql = `
      SELECT * FROM (
        SELECT e.*, f.factory_name, f.factory_short, ROW_NUMBER() OVER (ORDER BY e.equipment_number) AS _row_num
        FROM equipment e LEFT JOIN factory f ON e.factory_id = f.id ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(dataSql, {
      replacements: { ...replacements, offset, offsetEnd: offset + limit }
    });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取设备列表成功'));
  } catch (err) {
    next(err);
  }
};

// 设备状态概览统计
export const getEquipmentStatusOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [rows]: any = await sequelize.query(`
      SELECT equipment_status, COUNT(*) as count FROM equipment GROUP BY equipment_status
    `);
    const overview: any = { running: 0, idle: 0, fault: 0, maintenance: 0, disabled: 0, total: 0 };
    for (const row of rows) {
      overview.total += row.count;
      switch ((row.equipment_status || '').trim()) {
        case '运行': overview.running = row.count; break;
        case '闲置': overview.idle = row.count; break;
        case '故障': overview.fault = row.count; break;
        case '保养': overview.maintenance = row.count; break;
        case '停用': overview.disabled = row.count; break;
        default: overview.idle += row.count; break;
      }
    }
    res.json(success(overview, '获取设备状态概览成功'));
  } catch (err) { next(err); }
};

// 更新设备状态
export const updateEquipmentStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { equipment_status, fault_reason } = req.body;
    const _factoryId = getFactoryId(req);

    if (!equipment_status || !VALID_STATUSES.includes(equipment_status)) {
      res.status(400).json({ success: false, message: '无效的设备状态，可选: 运行/闲置/故障/保养/停用' });
      return;
    }

    // 获取当前设备信息
    const [eqRows]: any = await sequelize.query(
      `SELECT equipment_status, last_status_change_time FROM equipment WHERE equipment_number = :id`,
      { replacements: { id } }
    );
    if (eqRows.length === 0) {
      res.status(404).json({ success: false, message: '设备不存在' });
      return;
    }

    const oldStatus = (eqRows[0].equipment_status || '').trim();
    const now = new Date();

    // 如果从运行/闲置切换到故障/保养/停用，自动创建停机记录
    if ((oldStatus === '运行' || oldStatus === '闲置') && (equipment_status === '故障' || equipment_status === '保养' || equipment_status === '停用')) {
      await sequelize.query(
        `INSERT INTO equipment_downtime (equipment_number, downtime_type, start_time, fault_reason, approval_status, created_by, factory_id)
         VALUES (:equipment_number, :downtime_type, :start_time, :fault_reason, N'未审核', :created_by, :factory_id)`,
        {
          replacements: {
            equipment_number: id,
            downtime_type: equipment_status === '故障' ? '故障' : equipment_status === '保养' ? '保养' : '计划停机',
            start_time: now,
            fault_reason: fault_reason || null,
            created_by: (req as any).user?.username || '',
            factory_id: _factoryId
          }
        }
      );
    }

    // 如果从故障/保养/停用恢复到运行/闲置，自动关闭最近的停机记录
    if ((oldStatus === '故障' || oldStatus === '保养' || oldStatus === '停用') && (equipment_status === '运行' || equipment_status === '闲置')) {
      const [openDowntime]: any = await sequelize.query(
        `SELECT TOP 1 id, start_time FROM equipment_downtime WHERE equipment_number = :id AND end_time IS NULL ORDER BY start_time DESC`,
        { replacements: { id } }
      );
      if (openDowntime.length > 0) {
        const startTime = new Date(openDowntime[0].start_time);
        const durationMinutes = Math.round((now.getTime() - startTime.getTime()) / 60000);
        await sequelize.query(
          `UPDATE equipment_downtime SET end_time = :end_time, duration_minutes = :duration WHERE id = :did`,
          { replacements: { end_time: now, duration: durationMinutes, did: openDowntime[0].id } }
        );
      }

      // 累加运行时间
      if (eqRows[0].last_status_change_time) {
        const lastChange = new Date(eqRows[0].last_status_change_time);
        const runningMinutes = Math.round((now.getTime() - lastChange.getTime()) / 60000);
        if (runningMinutes > 0) {
          // 不累加，因为之前是故障/保养/停用状态，不是运行
        }
      }
    }

    // 如果从运行切换到非运行，累加运行时间
    if (oldStatus === '运行' && equipment_status !== '运行' && eqRows[0].last_status_change_time) {
      const lastChange = new Date(eqRows[0].last_status_change_time);
      const runningHours = (now.getTime() - lastChange.getTime()) / 3600000;
      if (runningHours > 0) {
        await sequelize.query(
          `UPDATE equipment SET total_running_hours = ISNULL(total_running_hours, 0) + :hours WHERE equipment_number = :id`,
          { replacements: { hours: Math.round(runningHours * 10) / 10, id } }
        );
      }
    }

    // 更新设备状态（用 GETDATE() 避免日期转换问题）
    await sequelize.query(
      `UPDATE equipment SET equipment_status = :status, last_status_change_time = GETDATE() WHERE equipment_number = :id`,
      { replacements: { status: equipment_status, id } }
    );

    res.json(success(null, '设备状态更新成功'));
  } catch (err) { next(err); }
};

// 更新设备保养设置
export const updateEquipmentMaintenanceSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { maintenance_cycle_days, daily_running_hours } = req.body;

    const updates: string[] = [];
    const replacements: any = { id };

    if (maintenance_cycle_days !== undefined) {
      updates.push('maintenance_cycle_days = :mcd');
      replacements.mcd = maintenance_cycle_days;
      // 如果有上次保养日期，自动计算下次保养日期
      updates.push(`next_maintenance_date = CASE WHEN last_maintenance_date IS NOT NULL AND :mcd2 > 0 THEN DATEADD(DAY, :mcd3, last_maintenance_date) ELSE next_maintenance_date END`);
      replacements.mcd2 = maintenance_cycle_days;
      replacements.mcd3 = maintenance_cycle_days;
    }
    if (daily_running_hours !== undefined) {
      updates.push('daily_running_hours = :drh');
      replacements.drh = daily_running_hours;
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, message: '未提供更新字段' });
      return;
    }

    await sequelize.query(
      `UPDATE equipment SET ${updates.join(', ')} WHERE equipment_number = :id`,
      { replacements }
    );

    res.json(success(null, '保养设置更新成功'));
  } catch (err) { next(err); }
};

export const createEquipment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const _factoryId = getFactoryId(req);

    if (!b.equipment_number) {
      res.status(400).json({ success: false, message: '设备编号不能为空' });
      return;
    }

    const [existing]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM equipment WHERE equipment_number = :equipment_number`,
      { replacements: { equipment_number: b.equipment_number } }
    );
    if (existing[0].cnt > 0) {
      res.status(400).json({ success: false, message: '设备编号已存在' });
      return;
    }

    await sequelize.query(
      `INSERT INTO equipment (equipment_number, equipment_name, record_date, equipment_type, equipment_model, manufacture_date, remark, factory_id)
       VALUES (:equipment_number, :equipment_name, :record_date, :equipment_type, :equipment_model, :manufacture_date, :remark, :factory_id)`,
      {
        replacements: {
          equipment_number: b.equipment_number,
          equipment_name: b.equipment_name || '',
          record_date: b.record_date || null,
          equipment_type: b.equipment_type || '',
          equipment_model: b.equipment_model || '',
          manufacture_date: b.manufacture_date || null,
          remark: b.remark || '',
          factory_id: _factoryId
        }
      }
    );

    res.json(success(null, '创建设备成功'));
  } catch (err) {
    next(err);
  }
};

export const updateEquipment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM equipment WHERE equipment_number = :id`,
      { replacements: { id } }
    );
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
      res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' });
      return;
    }

    const newId = (b.equipment_number || '').trim();
    const numberChanged = newId && newId !== id;

    if (numberChanged) {
      const [existCheck]: any = await sequelize.query(`SELECT equipment_number FROM equipment WHERE equipment_number = :newId`, { replacements: { newId } });
      if (existCheck.length) { res.status(400).json({ success: false, message: `设备编号 ${newId} 已存在` }); return; }
    }

    await sequelize.query(
      `UPDATE equipment SET
        equipment_number = :new_number,
        equipment_name = :equipment_name,
        record_date = :record_date,
        equipment_type = :equipment_type,
        equipment_model = :equipment_model,
        manufacture_date = :manufacture_date,
        remark = :remark
      WHERE equipment_number = :id`,
      {
        replacements: { id, new_number: numberChanged ? newId : id, equipment_name: b.equipment_name, record_date: b.record_date, equipment_type: b.equipment_type, equipment_model: b.equipment_model, manufacture_date: b.manufacture_date, remark: b.remark }
      }
    );

    res.json(success(null, '更新设备成功'));
  } catch (err) {
    next(err);
  }
};

export const deleteEquipment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM equipment WHERE equipment_number = :id${factoryCond}`,
      { replacements: { id, ...factoryReps } }
    );
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
      res.status(403).json({ success: false, message: '已审核的记录不允许删除，请先撤消审核' });
      return;
    }

    await sequelize.query(`DELETE FROM equipment WHERE equipment_number = :id${factoryCond}`, {
      replacements: { id, ...factoryReps }
    });
    res.json(success(null, '删除设备成功'));
  } catch (err) {
    next(err);
  }
};

export const exportEquipments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE equipment_number LIKE :search OR equipment_name LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [items]: any = await sequelize.query(`SELECT ${fields.join(', ')} FROM equipment ${whereClause} ORDER BY equipment_number`, { replacements });
    exportToExcel(items, fields, headers, 'equipments', res);
  } catch (err) { next(err); }
};

export const importEquipments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const _factoryId = getFactoryId(req);
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let imported = 0;
    for (const item of rows) {
      try {
        const [existing]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM equipment WHERE equipment_number = :equipment_number`, { replacements: { equipment_number: item.equipment_number } });
        if (existing[0].cnt > 0) {
          await sequelize.query(`UPDATE equipment SET equipment_name = :equipment_name, record_date = :record_date, equipment_type = :equipment_type, equipment_model = :equipment_model, manufacture_date = :manufacture_date, remark = :remark WHERE equipment_number = :equipment_number`, { replacements: item });
        } else {
          await sequelize.query(`INSERT INTO equipment (${fields.join(', ')}, factory_id) VALUES (${fields.map(f => ':' + f).join(', ')}, :factory_id)`, { replacements: { ...item, factory_id: _factoryId } });
        }
        imported++;
      } catch (e) {}
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};

export const approveEquipment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE equipment SET approval_status = N'已审核' WHERE equipment_number = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawEquipment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE equipment SET approval_status = N'未审核' WHERE equipment_number = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};
