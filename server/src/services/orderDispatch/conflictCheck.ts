/**
 * 生产调度服务 - 排产冲突检查
 * 从 orderDispatch.service.ts 拆分
 */
import sequelize from '@/config/database';

// ==================== 排产冲突检查（只读，无需事务） ====================
export const checkSchedulingConflicts = async (items: Array<{
  productionOrderNumber: string; mouldNumber?: string;
  equipmentNumber?: string; productionDate?: string; scheduleId?: string;
}>): Promise<{ batchConflicts: string[]; dbConflicts: string[] }> => {
  const batchConflicts: string[] = [];
  const dbConflicts: string[] = [];

  // ---------- 1) 本批次内：模具+日期+班次 重复检查 ----------
  const batchMouldMap = new Map<string, string[]>();
  for (const item of items) {
    if (item.mouldNumber && item.productionDate && item.scheduleId) {
      const key = `${item.mouldNumber}|${item.productionDate}|${item.scheduleId}`;
      if (!batchMouldMap.has(key)) batchMouldMap.set(key, []);
      batchMouldMap.get(key)!.push(item.productionOrderNumber);
    }
  }
  for (const [key, orders] of batchMouldMap) {
    if (orders.length > 1) {
      const [mould, date, schedule] = key.split('|');
      batchConflicts.push(`模具 ${mould} 在 ${date} ${schedule} 被分配给多条生产单: ${orders.join(', ')}`);
    }
  }

  // ---------- 2) 本批次内：设备+日期+班次 重复检查 ----------
  const batchEquipMap = new Map<string, string[]>();
  for (const item of items) {
    if (item.equipmentNumber && item.productionDate && item.scheduleId) {
      const key = `${item.equipmentNumber}|${item.productionDate}|${item.scheduleId}`;
      if (!batchEquipMap.has(key)) batchEquipMap.set(key, []);
      batchEquipMap.get(key)!.push(item.productionOrderNumber);
    }
  }
  for (const [key, orders] of batchEquipMap) {
    if (orders.length > 1) {
      const [equip, date, schedule] = key.split('|');
      batchConflicts.push(`设备 ${equip} 在 ${date} ${schedule} 被分配给多条生产单: ${orders.join(', ')}`);
    }
  }

  // 如果本批次内部有冲突，直接返回（不查 DB，与原始逻辑一致）
  if (batchConflicts.length > 0) {
    return { batchConflicts, dbConflicts };
  }

  // 公共排除列表
  const excludeNos = items.map(it => it.productionOrderNumber);
  const excludePlaceholders = excludeNos.map((_, i) => `:exn${i}`).join(',');
  const excludeReplacements: Record<string, any> = {};
  excludeNos.forEach((no, i) => {
    excludeReplacements[`exn${i}`] = no;
  });

  // ---------- 3) 数据库已派发记录：模具冲突检查 ----------
  const mouldChecks = items.filter(it => it.mouldNumber && it.productionDate && it.scheduleId);
  if (mouldChecks.length > 0) {
    const conditions = mouldChecks.map((_, i) =>
      `(mould_number = :m${i} AND production_date = :d${i} AND schedule_id = :s${i})`
    ).join(' OR ');
    const replacements: Record<string, any> = { ...excludeReplacements };
    mouldChecks.forEach((it, i) => {
      replacements[`m${i}`] = it.mouldNumber;
      replacements[`d${i}`] = it.productionDate;
      replacements[`s${i}`] = it.scheduleId;
    });
    const [existingRows]: any = await sequelize.query(
      `SELECT production_order_number, mould_number, production_date, schedule_id
       FROM production_order
       WHERE plan_status != N'未开始'
         AND production_order_number NOT IN (${excludePlaceholders})
         AND (${conditions})`,
      { replacements }
    );
    for (const r of existingRows) {
      dbConflicts.push(`模具 ${r.mould_number} 在 ${r.production_date} ${r.schedule_id} 已被生产单 ${r.production_order_number} 占用`);
    }
  }

  // ---------- 4) 数据库已派发记录：设备冲突检查 ----------
  const equipChecks = items.filter(it => it.equipmentNumber && it.productionDate && it.scheduleId);
  if (equipChecks.length > 0) {
    const conditions = equipChecks.map((_, i) =>
      `(equipment_number = :e${i} AND production_date = :ed${i} AND schedule_id = :es${i})`
    ).join(' OR ');
    const replacements: Record<string, any> = { ...excludeReplacements };
    equipChecks.forEach((it, i) => {
      replacements[`e${i}`] = it.equipmentNumber;
      replacements[`ed${i}`] = it.productionDate;
      replacements[`es${i}`] = it.scheduleId;
    });
    const [existingRows]: any = await sequelize.query(
      `SELECT production_order_number, equipment_number, production_date, schedule_id
       FROM production_order
       WHERE plan_status != N'未开始'
         AND production_order_number NOT IN (${excludePlaceholders})
         AND (${conditions})`,
      { replacements }
    );
    for (const r of existingRows) {
      dbConflicts.push(`设备 ${r.equipment_number} 在 ${r.production_date} ${r.schedule_id} 已被生产单 ${r.production_order_number} 占用`);
    }
  }

  return { batchConflicts, dbConflicts };
};
