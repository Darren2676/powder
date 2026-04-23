import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';

const fields = [
  'plan_number', 'equipment_number', 'maintenance_type', 'planned_date',
  'actual_date', 'maintenance_items', 'responsible_person', 'plan_status',
  'completion_remark', 'remark'
];
const headers = [
  '计划编号', '设备编号', '保养类型', '计划日期',
  '实际日期', '保养项目', '负责人', '计划状态',
  '完成备注', '备注'
];

// 生成计划编号
async function generatePlanNumber(): Promise<string> {
  const today = new Date();
  const prefix = `MP${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 plan_number FROM equipment_maintenance_plan WHERE plan_number LIKE :prefix ORDER BY plan_number DESC`,
    { replacements: { prefix: `${prefix}%` } }
  );
  let seq = 1;
  if (rows.length > 0) {
    const lastNum = rows[0].plan_number;
    seq = parseInt(lastNum.substring(prefix.length)) + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

export const getEquipmentMaintenancePlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const equipmentNumber = (req.query.equipment_number as string) || '';
    const planStatus = (req.query.plan_status as string) || '';
    const maintenanceType = (req.query.maintenance_type as string) || '';
    const dateFrom = (req.query.date_from as string) || '';
    const dateTo = (req.query.date_to as string) || '';

    let whereClause = 'WHERE 1=1';
    const replacements: any = {};

    if (equipmentNumber) {
      whereClause += ' AND mp.equipment_number = :equipmentNumber';
      replacements.equipmentNumber = equipmentNumber;
    }
    if (planStatus) {
      whereClause += ' AND mp.plan_status = :planStatus';
      replacements.planStatus = planStatus;
    }
    if (maintenanceType) {
      whereClause += ' AND mp.maintenance_type = :maintenanceType';
      replacements.maintenanceType = maintenanceType;
    }
    if (dateFrom) {
      whereClause += ' AND mp.planned_date >= :dateFrom';
      replacements.dateFrom = dateFrom;
    }
    if (dateTo) {
      whereClause += ' AND mp.planned_date <= :dateTo';
      replacements.dateTo = dateTo;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM equipment_maintenance_plan mp ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const offsetEnd = offset + limit;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT mp.*, e.equipment_name, ROW_NUMBER() OVER (ORDER BY mp.planned_date DESC, mp.id DESC) AS _row_num
        FROM equipment_maintenance_plan mp
        LEFT JOIN equipment e ON mp.equipment_number = e.equipment_number
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
    }, '获取保养计划成功'));
  } catch (err) { next(err); }
};

export const createEquipmentMaintenancePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const username = (req as any).user?.username || '';

    if (!b.equipment_number) {
      res.status(400).json({ success: false, message: '设备编号不能为空' });
      return;
    }
    if (!b.maintenance_type) {
      res.status(400).json({ success: false, message: '保养类型不能为空' });
      return;
    }
    if (!b.planned_date) {
      res.status(400).json({ success: false, message: '计划日期不能为空' });
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

    const planNumber = await generatePlanNumber();
    const cols = 'plan_number, ' + fields.slice(1).join(', ') + ', approval_status, created_by';
    const vals = ':plan_number, ' + fields.slice(1).map(f => ':' + f).join(', ') + ', N\'未审核\', :created_by';
    const replacements: any = { plan_number: planNumber, created_by: username };
    for (const f of fields.slice(1)) {
      replacements[f] = b[f] !== undefined ? b[f] : null;
    }
    if (!replacements.plan_status) replacements.plan_status = '待执行';

    await sequelize.query(`INSERT INTO equipment_maintenance_plan (${cols}) VALUES (${vals})`, { replacements });

    res.json(success({ plan_number: planNumber }, '创建保养计划成功'));
  } catch (err) { next(err); }
};

export const updateEquipmentMaintenancePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const setClauses = fields.map(f => `${f} = :${f}`).join(', ');
    const replacements: any = { id };
    for (const f of fields) {
      replacements[f] = b[f] !== undefined ? b[f] : null;
    }

    await sequelize.query(
      `UPDATE equipment_maintenance_plan SET ${setClauses} WHERE id = :id`,
      { replacements }
    );
    res.json(success(null, '更新保养计划成功'));
  } catch (err) { next(err); }
};

export const deleteEquipmentMaintenancePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM equipment_maintenance_plan WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '删除保养计划成功'));
  } catch (err) { next(err); }
};

// 执行保养计划
export const executeMaintenancePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(
      `UPDATE equipment_maintenance_plan SET plan_status = N'执行中' WHERE id = :id AND plan_status = N'待执行'`,
      { replacements: { id } }
    );
    res.json(success(null, '开始执行保养计划'));
  } catch (err) { next(err); }
};

// 完成保养计划
export const completeMaintenancePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { actual_date, completion_remark } = req.body;
    const today = actual_date || new Date().toISOString().slice(0, 10);

    // 获取计划信息
    const [planRows]: any = await sequelize.query(
      `SELECT equipment_number, maintenance_type FROM equipment_maintenance_plan WHERE id = :id`,
      { replacements: { id } }
    );
    if (planRows.length === 0) {
      res.status(404).json({ success: false, message: '计划不存在' });
      return;
    }

    await sequelize.query(
      `UPDATE equipment_maintenance_plan SET plan_status = N'已完成', actual_date = :actualDate, completion_remark = :completionRemark WHERE id = :id`,
      { replacements: { id, actualDate: today, completionRemark: completion_remark || null } }
    );

    // 更新设备的保养日期
    const eqNum = planRows[0].equipment_number;
    await sequelize.query(
      `UPDATE equipment SET last_maintenance_date = :mdate, next_maintenance_date = CASE WHEN maintenance_cycle_days > 0 THEN DATEADD(DAY, maintenance_cycle_days, :mdate2) ELSE next_maintenance_date END WHERE equipment_number = :en`,
      { replacements: { mdate: today, mdate2: today, en: eqNum } }
    );

    // 如果设备状态是"保养"，恢复为"闲置"
    await sequelize.query(
      `UPDATE equipment SET equipment_status = N'闲置', last_status_change_time = GETDATE() WHERE equipment_number = :en AND equipment_status = N'保养'`,
      { replacements: { en: eqNum } }
    );

    res.json(success(null, '保养计划已完成'));
  } catch (err) { next(err); }
};

// 取消保养计划
export const cancelMaintenancePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(
      `UPDATE equipment_maintenance_plan SET plan_status = N'已取消' WHERE id = :id AND plan_status IN (N'待执行', N'执行中')`,
      { replacements: { id } }
    );
    res.json(success(null, '保养计划已取消'));
  } catch (err) { next(err); }
};

// 自动生成保养计划
export const autoGeneratePlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const username = (req as any).user?.username || '';

    // 查找需要保养的设备（有保养周期且下次保养日期在7天内或已过期）
    const [equipments]: any = await sequelize.query(`
      SELECT equipment_number, equipment_name, maintenance_cycle_days, next_maintenance_date
      FROM equipment
      WHERE maintenance_cycle_days > 0
        AND (next_maintenance_date IS NULL OR next_maintenance_date <= DATEADD(DAY, 7, CAST(GETDATE() AS DATE)))
        AND equipment_status != N'停用'
    `);

    let generated = 0;
    for (const eq of equipments) {
      // 检查是否已有待执行的计划
      const [existing]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM equipment_maintenance_plan WHERE equipment_number = :en AND plan_status IN (N'待执行', N'执行中')`,
        { replacements: { en: eq.equipment_number } }
      );
      if (existing[0].cnt > 0) continue;

      const planNumber = await generatePlanNumber();
      const plannedDate = eq.next_maintenance_date || new Date().toISOString().slice(0, 10);

      await sequelize.query(
        `INSERT INTO equipment_maintenance_plan (plan_number, equipment_number, maintenance_type, planned_date, plan_status, maintenance_items, approval_status, created_by)
         VALUES (:pn, :en, N'定期保养', :pd, N'待执行', N'按保养周期自动生成', N'未审核', :cb)`,
        { replacements: { pn: planNumber, en: eq.equipment_number, pd: plannedDate, cb: username } }
      );
      generated++;
    }

    res.json(success({ generated, total: equipments.length }, `已生成 ${generated} 条保养计划`));
  } catch (err) { next(err); }
};

export const exportEquipmentMaintenancePlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const equipmentNumber = (req.query.equipment_number as string) || '';
    const planStatus = (req.query.plan_status as string) || '';
    let whereClause = 'WHERE 1=1';
    const replacements: any = {};
    if (equipmentNumber) { whereClause += ' AND mp.equipment_number = :equipmentNumber'; replacements.equipmentNumber = equipmentNumber; }
    if (planStatus) { whereClause += ' AND mp.plan_status = :planStatus'; replacements.planStatus = planStatus; }

    const [items]: any = await sequelize.query(
      `SELECT mp.*, e.equipment_name FROM equipment_maintenance_plan mp LEFT JOIN equipment e ON mp.equipment_number = e.equipment_number ${whereClause} ORDER BY mp.planned_date DESC`,
      { replacements }
    );
    exportToExcel(items, fields, headers, 'equipment_maintenance_plans', res);
  } catch (err) { next(err); }
};

export const approveEquipmentMaintenancePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE equipment_maintenance_plan SET approval_status = N'已审核' WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawEquipmentMaintenancePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE equipment_maintenance_plan SET approval_status = N'未审核' WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};
