import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';

// 计算OEE各项指标
function calcOEE(plannedTime: number, downtime: number, actualRun: number, idealOutput: number, actualOutput: number, goodOutput: number) {
  const availability = plannedTime > 0 ? ((plannedTime - downtime) / plannedTime) * 100 : 0;
  const performance = (plannedTime - downtime) > 0 && idealOutput > 0 ? (actualOutput / ((actualRun / (plannedTime - downtime)) * idealOutput / (plannedTime - downtime))) * 100 : 0;
  // 简化计算
  const availRate = plannedTime > 0 ? Math.min(((plannedTime - downtime) / plannedTime) * 100, 100) : 0;
  const perfRate = idealOutput > 0 && (plannedTime - downtime) > 0 ? Math.min((actualOutput / idealOutput) * 100, 100) : 0;
  const qualRate = actualOutput > 0 ? Math.min((goodOutput / actualOutput) * 100, 100) : 0;
  const oeeRate = (availRate / 100) * (perfRate / 100) * (qualRate / 100) * 100;

  return {
    availability_rate: Math.round(availRate * 100) / 100,
    performance_rate: Math.round(perfRate * 100) / 100,
    quality_rate: Math.round(qualRate * 100) / 100,
    oee_rate: Math.round(oeeRate * 100) / 100
  };
}

// 获取OEE记录列表
export const getEquipmentOees = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const equipmentNumber = (req.query.equipment_number as string) || '';
    const dateFrom = (req.query.date_from as string) || '';
    const dateTo = (req.query.date_to as string) || '';

    let whereClause = 'WHERE 1=1';
    const replacements: any = {};

    if (equipmentNumber) {
      whereClause += ' AND o.equipment_number = :equipmentNumber';
      replacements.equipmentNumber = equipmentNumber;
    }
    if (dateFrom) {
      whereClause += ' AND o.record_date >= :dateFrom';
      replacements.dateFrom = dateFrom;
    }
    if (dateTo) {
      whereClause += ' AND o.record_date <= :dateTo';
      replacements.dateTo = dateTo;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM equipment_oee o ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const offsetEnd = offset + limit;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT o.*, e.equipment_name, ROW_NUMBER() OVER (ORDER BY o.record_date DESC, o.id DESC) AS _row_num
        FROM equipment_oee o
        LEFT JOIN equipment e ON o.equipment_number = e.equipment_number
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
    }, '获取OEE记录成功'));
  } catch (err) { next(err); }
};

// 手动创建/更新OEE记录
export const saveEquipmentOee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;

    if (!b.equipment_number) {
      res.status(400).json({ success: false, message: '设备编号不能为空' });
      return;
    }
    if (!b.record_date) {
      res.status(400).json({ success: false, message: '记录日期不能为空' });
      return;
    }

    const plannedTime = b.planned_time_minutes || 0;
    const downtime = b.downtime_minutes || 0;
    const actualRun = b.actual_run_minutes || 0;
    const idealOutput = b.ideal_output || 0;
    const actualOutput = b.actual_output || 0;
    const goodOutput = b.good_output || 0;

    const rates = calcOEE(plannedTime, downtime, actualRun, idealOutput, actualOutput, goodOutput);

    // 自动计算实际运行时间
    const autoActualRun = actualRun > 0 ? actualRun : Math.max(plannedTime - downtime, 0);

    // 检查是否已存在
    const [existing]: any = await sequelize.query(
      `SELECT id FROM equipment_oee WHERE equipment_number = :en AND record_date = :rd AND ISNULL(shift_id, '') = ISNULL(:sid, '')`,
      { replacements: { en: b.equipment_number, rd: b.record_date, sid: b.shift_id || '' } }
    );

    if (existing.length > 0) {
      await sequelize.query(
        `UPDATE equipment_oee SET
          shift_id = :shift_id, planned_time_minutes = :planned_time_minutes,
          downtime_minutes = :downtime_minutes, actual_run_minutes = :actual_run_minutes,
          ideal_output = :ideal_output, actual_output = :actual_output, good_output = :good_output,
          availability_rate = :availability_rate, performance_rate = :performance_rate,
          quality_rate = :quality_rate, oee_rate = :oee_rate,
          data_source = :data_source, remark = :remark, updated_at = GETDATE()
        WHERE id = :id`,
        {
          replacements: {
            id: existing[0].id,
            shift_id: b.shift_id || null,
            planned_time_minutes: plannedTime,
            downtime_minutes: downtime,
            actual_run_minutes: autoActualRun,
            ideal_output: idealOutput,
            actual_output: actualOutput,
            good_output: goodOutput,
            data_source: b.data_source || '手动',
            remark: b.remark || null,
            ...rates
          }
        }
      );
      res.json(success(null, '更新OEE记录成功'));
    } else {
      await sequelize.query(
        `INSERT INTO equipment_oee (equipment_number, record_date, shift_id, planned_time_minutes, downtime_minutes, actual_run_minutes, ideal_output, actual_output, good_output, availability_rate, performance_rate, quality_rate, oee_rate, data_source, remark)
         VALUES (:equipment_number, :record_date, :shift_id, :planned_time_minutes, :downtime_minutes, :actual_run_minutes, :ideal_output, :actual_output, :good_output, :availability_rate, :performance_rate, :quality_rate, :oee_rate, :data_source, :remark)`,
        {
          replacements: {
            equipment_number: b.equipment_number,
            record_date: b.record_date,
            shift_id: b.shift_id || null,
            planned_time_minutes: plannedTime,
            downtime_minutes: downtime,
            actual_run_minutes: autoActualRun,
            ideal_output: idealOutput,
            actual_output: actualOutput,
            good_output: goodOutput,
            data_source: b.data_source || '手动',
            remark: b.remark || null,
            ...rates
          }
        }
      );
      res.json(success(null, '创建OEE记录成功'));
    }
  } catch (err) { next(err); }
};

// 删除OEE记录
export const deleteEquipmentOee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM equipment_oee WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '删除OEE记录成功'));
  } catch (err) { next(err); }
};

// OEE仪表盘数据
export const getOeeDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dateFrom = (req.query.date_from as string) || '';
    const dateTo = (req.query.date_to as string) || '';
    const equipmentNumber = (req.query.equipment_number as string) || '';

    let whereClause = 'WHERE 1=1';
    const replacements: any = {};
    if (dateFrom) { whereClause += ' AND o.record_date >= :dateFrom'; replacements.dateFrom = dateFrom; }
    if (dateTo) { whereClause += ' AND o.record_date <= :dateTo'; replacements.dateTo = dateTo; }
    if (equipmentNumber) { whereClause += ' AND o.equipment_number = :equipmentNumber'; replacements.equipmentNumber = equipmentNumber; }

    // 总体OEE汇总
    const [summaryRows]: any = await sequelize.query(`
      SELECT
        COUNT(*) as record_count,
        AVG(oee_rate) as avg_oee,
        AVG(availability_rate) as avg_availability,
        AVG(performance_rate) as avg_performance,
        AVG(quality_rate) as avg_quality
      FROM equipment_oee o ${whereClause}
    `, { replacements });

    const summary = summaryRows[0] || {};

    // 按设备分组OEE
    const [byEquipment]: any = await sequelize.query(`
      SELECT
        o.equipment_number, e.equipment_name,
        COUNT(*) as record_count,
        AVG(o.oee_rate) as avg_oee,
        AVG(o.availability_rate) as avg_availability,
        AVG(o.performance_rate) as avg_performance,
        AVG(o.quality_rate) as avg_quality
      FROM equipment_oee o
      LEFT JOIN equipment e ON o.equipment_number = e.equipment_number
      ${whereClause}
      GROUP BY o.equipment_number, e.equipment_name
      ORDER BY avg_oee ASC
    `, { replacements });

    // 按日期趋势
    const [trend]: any = await sequelize.query(`
      SELECT
        CONVERT(NVARCHAR(10), o.record_date, 120) as record_date,
        AVG(o.oee_rate) as avg_oee,
        AVG(o.availability_rate) as avg_availability,
        AVG(o.performance_rate) as avg_performance,
        AVG(o.quality_rate) as avg_quality
      FROM equipment_oee o ${whereClause}
      GROUP BY CONVERT(NVARCHAR(10), o.record_date, 120)
      ORDER BY record_date
    `, { replacements });

    res.json(success({
      summary: {
        record_count: summary.record_count || 0,
        avg_oee: Math.round((summary.avg_oee || 0) * 100) / 100,
        avg_availability: Math.round((summary.avg_availability || 0) * 100) / 100,
        avg_performance: Math.round((summary.avg_performance || 0) * 100) / 100,
        avg_quality: Math.round((summary.avg_quality || 0) * 100) / 100
      },
      by_equipment: byEquipment,
      trend
    }, '获取OEE仪表盘数据成功'));
  } catch (err) { next(err); }
};

// 从生产数据自动计算OEE
export const calculateOeeFromProduction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date, equipment_number } = req.body;
    if (!date) {
      res.status(400).json({ success: false, message: '日期不能为空' });
      return;
    }

    // 获取当天该设备的停机数据
    let downtimeWhere = 'WHERE CONVERT(NVARCHAR(10), start_time, 120) = :date';
    const replacements: any = { date };
    if (equipment_number) {
      downtimeWhere += ' AND equipment_number = :en';
      replacements.en = equipment_number;
    }

    const [downtimeRows]: any = await sequelize.query(
      `SELECT equipment_number, SUM(ISNULL(duration_minutes, 0)) as total_downtime
       FROM equipment_downtime ${downtimeWhere}
       GROUP BY equipment_number`,
      { replacements }
    );

    // 获取设备列表
    let eqWhere = 'WHERE 1=1';
    const eqReplacements: any = {};
    if (equipment_number) {
      eqWhere += ' AND equipment_number = :en';
      eqReplacements.en = equipment_number;
    }
    const [equipments]: any = await sequelize.query(
      `SELECT equipment_number, equipment_name, daily_running_hours FROM equipment ${eqWhere}`,
      { replacements: eqReplacements }
    );

    let generated = 0;
    for (const eq of equipments) {
      const plannedMinutes = (eq.daily_running_hours || 24) * 60;
      const downtime = downtimeRows.find((d: any) => d.equipment_number === eq.equipment_number);
      const downtimeMinutes = downtime ? downtime.total_downtime : 0;
      const actualRunMinutes = Math.max(plannedMinutes - downtimeMinutes, 0);

      const rates = calcOEE(plannedMinutes, downtimeMinutes, actualRunMinutes, 0, 0, 0);

      // 对于自动计算，我们只能得出可用率，性能和质量需要手动补充
      const oeeRecord = {
        equipment_number: eq.equipment_number,
        record_date: date,
        planned_time_minutes: plannedMinutes,
        downtime_minutes: downtimeMinutes,
        actual_run_minutes: actualRunMinutes,
        availability_rate: rates.availability_rate,
        performance_rate: 0,
        quality_rate: 0,
        oee_rate: 0,
        data_source: '自动'
      };

      // upsert
      const [existing]: any = await sequelize.query(
        `SELECT id FROM equipment_oee WHERE equipment_number = :en AND record_date = :rd AND data_source = N'自动'`,
        { replacements: { en: oeeRecord.equipment_number, rd: date } }
      );

      if (existing.length > 0) {
        await sequelize.query(
          `UPDATE equipment_oee SET planned_time_minutes = :planned_time_minutes, downtime_minutes = :downtime_minutes,
            actual_run_minutes = :actual_run_minutes, availability_rate = :availability_rate, updated_at = GETDATE()
          WHERE id = :id`,
          { replacements: { id: existing[0].id, ...oeeRecord } }
        );
      } else {
        await sequelize.query(
          `INSERT INTO equipment_oee (equipment_number, record_date, planned_time_minutes, downtime_minutes, actual_run_minutes, availability_rate, performance_rate, quality_rate, oee_rate, data_source)
           VALUES (:equipment_number, :record_date, :planned_time_minutes, :downtime_minutes, :actual_run_minutes, :availability_rate, :performance_rate, :quality_rate, :oee_rate, :data_source)`,
          { replacements: oeeRecord }
        );
      }
      generated++;
    }

    res.json(success({ generated }, `已为 ${generated} 台设备生成OEE记录`));
  } catch (err) { next(err); }
};
