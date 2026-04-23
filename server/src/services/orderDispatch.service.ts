/**
 * 生产调度服务 - 从 Controller 抽取的业务逻辑
 * 包含：排产冲突检查、工序任务生成、备料单生成、拆分、派发、一键派发并生成、从生产单生成任务
 */
import sequelize from '@/config/database';
import dayjs from 'dayjs';
import { BusinessError } from '@/shared/errors/BusinessError';
import { generateOrderNumber, generateTaskNumber, generatePrepNumber, generateOutsourcingReqNumber } from '@/services/documentNumber.service';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { withTransaction } from '@/shared/db/withTransaction';

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

// ==================== 工序任务生成（使用调用方事务） ====================
export const generateProcessTasks = async (params: {
  orderNumber: string; productionNumber: string; itemNumber: string;
  itemName: string; specifications: string; basicUnit: string;
  plannedQuantity: number;
}, username: string, transaction: any): Promise<{
  tasksGenerated: number; skipReason: string;
  outsourcingReqLines: Array<{
    taskNumber: string; stepNumber: number;
    standardProcessNumber: string; processName: string;
    workCenterNumber: string; workCenterName: string;
    plannedQuantity: number; isOutsourced: boolean;
  }>;
  routeMaterialMap: Record<string, any>;
  routeStepNameMap: Record<number, string>;
}> => {
  const orderNo = params.orderNumber;
  let tasksGenerated = 0;
  let skipReason = '';
  const outsourcingReqLines: Array<{
    taskNumber: string; stepNumber: number;
    standardProcessNumber: string; processName: string;
    workCenterNumber: string; workCenterName: string;
    plannedQuantity: number; isOutsourced: boolean;
  }> = [];
  let routeMaterialMap: Record<string, { step_number: any; work_center_number: string; work_center_name: string; standard_process_name: string }> = {};
  let routeStepNameMap: Record<number, string> = {};

  try {
    const [routes]: any = await sequelize.query(
      `SELECT TOP 1 process_route_number, process_route_name
      FROM routing_header
      WHERE item_number = :item_number AND condition = N'启用' AND approval_status = N'已审批'
      ORDER BY creation_date DESC`,
      { replacements: { item_number: params.itemNumber }, transaction }
    );
    if (routes.length === 0) {
      skipReason = '未找到匹配的工艺路线';
    } else {
      const route = routes[0];
      const [routeDetails]: any = await sequelize.query(
        `SELECT id, step_number, standard_process_number, standard_process_name,
          post_processing_sequence_number, post_processing_sequence_name,
          work_center_number, work_center_name, excess_reporting_ratio,
          ingredient_addition_method, process_material_input_number,
          process_material_input_quantity, process_material_input_unit,
          material_wastage_rate, is_outsourced,
          enable_self_inspect, enable_special_inspect,
          self_inspect_plan_name, special_inspect_plan_name,
          self_inspect_spec_name, special_inspect_spec_name
        FROM routing_detail WHERE process_route_number = :prn ORDER BY step_number`,
        { replacements: { prn: route.process_route_number }, transaction }
      );
      // 构建 step_number -> standard_process_name 映射
      for (const rd of routeDetails) {
        if (rd.step_number != null) routeStepNameMap[rd.step_number] = rd.standard_process_name || '';
      }
      // 查询工艺路线物料子表，构建 material_number -> step_number 映射
      const routeDetailIds = routeDetails.map((rd: any) => rd.id).filter(Boolean);
      if (routeDetailIds.length > 0) {
        const [routeMats]: any = await sequelize.query(
          `SELECT rdm.material_number, rd.step_number, rd.work_center_number, rd.work_center_name, rd.standard_process_name
          FROM routing_detail_material rdm
          INNER JOIN routing_detail rd ON rdm.routing_detail_id = rd.id
          WHERE rd.process_route_number = :prn`,
          { replacements: { prn: route.process_route_number }, transaction }
        );
        for (const rm of routeMats) {
          if (rm.material_number && !routeMaterialMap[rm.material_number]) {
            routeMaterialMap[rm.material_number] = {
              step_number: rm.step_number,
              work_center_number: rm.work_center_number || '',
              work_center_name: rm.work_center_name || '',
              standard_process_name: rm.standard_process_name || ''
            };
          }
        }
      }
      if (routeDetails.length === 0) {
        skipReason = '工艺路线无明细数据';
      } else {
        for (const d of routeDetails) {
          const [existing]: any = await sequelize.query(
            `SELECT COUNT(*) as cnt FROM process_task WHERE production_order_number = :orderNo AND step_number = :step`,
            { replacements: { orderNo, step: d.step_number }, transaction }
          );
          if (existing[0].cnt > 0) continue;

          const taskNumber = await generateTaskNumber(transaction);
          await sequelize.query(
            `INSERT INTO process_task (
              process_task_number, production_order_number, production_number,
              process_route_number, step_number, item_number, item_name,
              specifications, basic_unit, planned_quantity, completed_quantity,
              standard_process_number, standard_process_name,
              work_center_number, work_center_name,
              process_material_input_number, process_material_input_quantity,
              process_material_input_unit, material_wastage_rate,
              excess_reporting_ratio, ingredient_addition_method,
              task_status, approval_status, remark, creation_date, creation_man, is_outsourced,
              enable_self_inspect, enable_special_inspect,
              self_inspect_plan_name, special_inspect_plan_name,
              self_inspect_spec_name, special_inspect_spec_name
            ) VALUES (
              :taskNumber, :orderNo, :prodNum, :routeNum, :step,
              :itemNum, :itemName, :specs, :unit, :plannedQty, 0,
              :stdProcNum, :stdProcName, :wcNum, :wcName,
              :matInputNum, :matInputQty, :matInputUnit, :wastageRate,
              :excessRatio, :ingredientMethod,
              N'未开始', N'已审批', N'派发自动审批', :createDate, :createMan, :isOutsourced,
              :enableSelfInspect, :enableSpecialInspect,
              :selfInspectPlanName, :specialInspectPlanName,
              :selfInspectSpecName, :specialInspectSpecName
            )`,
            {
              replacements: {
                taskNumber,
                orderNo,
                prodNum: params.productionNumber,
                routeNum: route.process_route_number,
                step: d.step_number,
                itemNum: params.itemNumber,
                itemName: params.itemName,
                specs: params.specifications || '',
                unit: params.basicUnit || '',
                plannedQty: params.plannedQuantity,
                stdProcNum: d.standard_process_number || '',
                stdProcName: d.standard_process_name || '',
                wcNum: d.work_center_number || '',
                wcName: d.work_center_name || '',
                matInputNum: d.process_material_input_number || '',
                matInputQty: d.process_material_input_quantity || '',
                matInputUnit: d.process_material_input_unit || '',
                wastageRate: d.material_wastage_rate || '',
                excessRatio: d.excess_reporting_ratio || '',
                ingredientMethod: d.ingredient_addition_method || '',
                createDate: dayjs().format('YYYY/MM/DD HH:mm'),
                createMan: username,
                isOutsourced: d.is_outsourced ? 1 : 0,
                enableSelfInspect: d.enable_self_inspect || '否',
                enableSpecialInspect: d.enable_special_inspect || '否',
                selfInspectPlanName: d.self_inspect_plan_name || '',
                specialInspectPlanName: d.special_inspect_plan_name || '',
                selfInspectSpecName: d.self_inspect_spec_name || '',
                specialInspectSpecName: d.special_inspect_spec_name || ''
              },
              transaction
            }
          );
          // 若为委外工序，收集到委外申请明细列表
          if (d.is_outsourced) {
            outsourcingReqLines.push({
              taskNumber,
              stepNumber: d.step_number,
              standardProcessNumber: d.standard_process_number || '',
              processName: d.standard_process_name || '',
              workCenterNumber: d.work_center_number || '',
              workCenterName: d.work_center_name || '',
              plannedQuantity: params.plannedQuantity || 0,
              isOutsourced: true
            });
          }
          tasksGenerated++;
        }

        // 为该生产单的所有委外工序创建一张委外申请单
        if (outsourcingReqLines.length > 0) {
          try {
            const [dupReq]: any = await sequelize.query(
              `SELECT COUNT(*) as cnt FROM outsourcing_req WHERE production_order_number = :orderNo`,
              { replacements: { orderNo }, transaction }
            );
            if (dupReq[0].cnt === 0) {
              const reqNumber = await generateOutsourcingReqNumber(transaction);
              await sequelize.query(`
                INSERT INTO outsourcing_req (outsourcing_req_number, production_order_number, production_number, item_number, item_name, specifications, basic_unit, planned_quantity, approval_status, order_status, remark, creation_date, creation_man)
                VALUES (:reqNumber, :pon, :pn, :itemNum, :itemName, :specs, :unit, :qty, N'草稿', N'未执行', N'派发自动生成', :createDate, :createMan)
              `, {
                replacements: {
                  reqNumber, pon: orderNo, pn: params.productionNumber || '',
                  itemNum: params.itemNumber || '', itemName: params.itemName || '',
                  specs: params.specifications || '', unit: params.basicUnit || '',
                  qty: params.plannedQuantity || 0,
                  createDate: dayjs().format('YYYY/MM/DD HH:mm'), createMan: username
                }, transaction
              });
              for (let li = 0; li < outsourcingReqLines.length; li++) {
                const line = outsourcingReqLines[li];
                await sequelize.query(`
                  INSERT INTO outsourcing_req_detail (outsourcing_req_number, line_number, process_task_number, step_number, standard_process_number, standard_process_name, work_center_number, work_center_name, planned_quantity, ordered_quantity, status)
                  VALUES (:reqNumber, :lineNum, :ptn, :step, :spn, :spname, :wcn, :wcname, :qty, 0, N'未执行')
                `, {
                  replacements: {
                    reqNumber, lineNum: (li + 1) * 10, ptn: line.taskNumber, step: line.stepNumber,
                    spn: line.standardProcessNumber, spname: line.processName,
                    wcn: line.workCenterNumber, wcname: line.workCenterName, qty: line.plannedQuantity
                  }, transaction
                });
              }
            }
          } catch (reqErr: any) { /* 委外申请创建失败不阻断派发 */ }
        }
      }
    }
  } catch (taskErr: any) {
    skipReason = `工序任务生成异常: ${taskErr.message}`;
  }

  return { tasksGenerated, skipReason, outsourcingReqLines, routeMaterialMap, routeStepNameMap };
};

// ==================== 备料单生成（使用调用方事务） ====================
export const generateMaterialPreparation = async (params: {
  orderNumber: string; productionNumber: string; itemNumber: string;
  itemName: string; specifications: string; basicUnit: string;
  plannedQuantity: number; routeMaterialMap: Record<string, any>;
  routeStepNameMap: Record<number, string>; taskMap: Record<number, any>;
}, username: string, transaction: any): Promise<{
  materialsGenerated: number; skipReason: string;
  prepNumberForCleanup: string;
}> => {
  const orderNo = params.orderNumber;
  let materialsGenerated = 0;
  let prepSkipReason = '';
  let prepNumberForCleanup = '';

  try {
    const [existingPrep]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM material_preparation WHERE production_order_number = :orderNo`,
      { replacements: { orderNo }, transaction }
    );
    if (existingPrep[0].cnt > 0) {
      prepSkipReason = '该生产单已存在备料单';
    } else {
      const [boms]: any = await sequelize.query(
        `SELECT TOP 1 bom_number, bom_name, bom_version, base_quantity
        FROM bom_header
        WHERE item_number = :item_number AND [condition] = N'启用' AND approval_status = N'已审批'
        ORDER BY bom_version DESC`,
        { replacements: { item_number: params.itemNumber }, transaction }
      );
      if (boms.length === 0) {
        prepSkipReason = '未找到匹配的BOM';
      } else {
        const bom = boms[0];
        const bomBaseQty = parseFloat(bom.base_quantity) || 1;

        // 只取第一层BOM明细（不递归展开到底层）
        const [firstLevelDetails]: any = await sequelize.query(
          `SELECT material_number, material_name, material_type, unit,
                  standard_quantity, wastage_rate, actual_quantity,
                  step_number, is_key_material, substitute_group,
                  substitute_priority, supply_type, default_warehouse, line_number
           FROM bom_detail WHERE bom_number = :bomNumber ORDER BY line_number`,
          { replacements: { bomNumber: bom.bom_number }, transaction }
        );

        if (firstLevelDetails.length === 0) {
          prepSkipReason = 'BOM无物料明细';
        } else {
          const prepNumber = await generatePrepNumber(transaction);
          prepNumberForCleanup = prepNumber;
          const plannedQty = parseFloat(String(params.plannedQuantity)) || 0;
          const multiplier = bomBaseQty > 0 ? plannedQty / bomBaseQty : 0;

          await sequelize.query(
            `INSERT INTO material_preparation (
              preparation_number, production_order_number, production_number,
              item_number, item_name, specifications, basic_unit,
              bom_number, bom_version, planned_quantity, bom_base_quantity,
              total_material_types, preparation_status, approval_status,
              remark, creation_date, creation_man
            ) VALUES (
              :prepNum, :orderNo, :prodNum, :itemNum, :itemName, :specs, :unit,
              :bomNum, :bomVer, :plannedQty, :bomBaseQty,
              :totalTypes, N'未领料', N'已审批', N'派发自动审批', :createDate, :createMan
            )`,
            {
              replacements: {
                prepNum: prepNumber, orderNo,
                prodNum: params.productionNumber,
                itemNum: params.itemNumber, itemName: params.itemName,
                specs: params.specifications || '', unit: params.basicUnit || '',
                bomNum: bom.bom_number, bomVer: bom.bom_version,
                plannedQty: params.plannedQuantity, bomBaseQty: bom.base_quantity,
                totalTypes: firstLevelDetails.length,
                createDate: dayjs().format('YYYY/MM/DD HH:mm'),
                createMan: username
              },
              transaction
            }
          );

          for (let i = 0; i < firstLevelDetails.length; i++) {
            const bd = firstLevelDetails[i];
            const routeMatInfo = params.routeMaterialMap[bd.material_number];
            // step_number: 优先使用工艺路线物料映射的数值步骤号;
            // bom_detail.step_number 可能是文本工序编码(如'TJ','BZ')，需解析为int
            let step: number | null = null;
            let procName = '';
            if (routeMatInfo && routeMatInfo.step_number != null) {
              step = parseInt(routeMatInfo.step_number, 10);
              if (isNaN(step)) step = null;
              procName = routeMatInfo.standard_process_name || '';
            } else {
              const rawStep = bd.step_number || null;
              if (rawStep != null) {
                const parsed = parseInt(rawStep, 10);
                step = isNaN(parsed) ? null : parsed;
              }
            }
            // 从 routeStepNameMap 获取 standard_process_name（回退）
            if (!procName && step != null) {
              procName = params.routeStepNameMap[step] || '';
            }
            const wc = step && params.taskMap[step] ? params.taskMap[step]
              : (routeMatInfo ? { work_center_number: routeMatInfo.work_center_number, work_center_name: routeMatInfo.work_center_name } : {});
            const actualQty = parseFloat(bd.actual_quantity) || 0;
            const requiredQty = Math.round(multiplier * actualQty * 10000) / 10000;

            await sequelize.query(
              `INSERT INTO material_preparation_detail (
                preparation_number, line_number, material_number, material_name,
                material_type, unit, bom_standard_quantity, bom_wastage_rate,
                bom_actual_quantity, required_quantity, adjusted_quantity, issued_quantity,
                step_number, work_center_number, work_center_name, standard_process_name,
                is_key_material, substitute_group, substitute_priority,
                supply_type, default_warehouse, bom_path, remark
              ) VALUES (
                :prepNum, :lineNum, :matNum, :matName,
                :matType, :unit, :bomStdQty, :bomWaste,
                :bomActQty, :reqQty, :adjQty, 0,
                :step, :wcNum, :wcName, :procName,
                :isKey, :subGrp, :subPri,
                :supply, :warehouse, :bomPath, ''
              )`,
              {
                replacements: {
                  prepNum: prepNumber, lineNum: (i + 1) * 10,
                  matNum: bd.material_number, matName: bd.material_name,
                  matType: bd.material_type || '', unit: bd.unit || '',
                  bomStdQty: bd.standard_quantity || actualQty,
                  bomWaste: bd.wastage_rate || 0,
                  bomActQty: actualQty,
                  reqQty: requiredQty, adjQty: requiredQty,
                  step: step, wcNum: wc.work_center_number || '',
                  wcName: wc.work_center_name || '',
                  procName: procName,
                  isKey: bd.is_key_material || 0,
                  subGrp: bd.substitute_group || '',
                  subPri: bd.substitute_priority || 0,
                  supply: bd.supply_type || '',
                  warehouse: bd.default_warehouse || '',
                  bomPath: bom.bom_number
                },
                transaction
              }
            );
          }
          materialsGenerated = firstLevelDetails.length;
        }
      }
    }
  } catch (prepErr: any) {
    prepSkipReason = `备料单生成异常: ${prepErr.message}`;
    // 如果头记录已插入但明细失败，清理孤立的头记录
    if (prepNumberForCleanup) {
      try {
        await sequelize.query(
          `DELETE FROM material_preparation WHERE preparation_number = :prepNum`,
          { replacements: { prepNum: prepNumberForCleanup }, transaction }
        );
      } catch (_) { /* 清理失败不影响主流程 */ }
    }
  }

  return { materialsGenerated, skipReason: prepSkipReason, prepNumberForCleanup };
};

// ==================== 生产单拆分 ====================
export const splitOrdersCore = async (params: {
  items: Array<{
    type: 'original' | 'new'; productionOrderNumber?: string;
    newPlannedQuantity: number; sourceOrderNumber?: string;
  }>;
}): Promise<{ updated: number; created: number; failed: number; errors: string[] }> => {
  const items = params.items;

  const originalItems = items.filter(i => i.type === 'original');
  const newItems = items.filter(i => i.type === 'new');

  if (newItems.length === 0) {
    throw new BusinessError(400, '至少需要一条新增记录才能执行拆分');
  }

  // 预先查询源记录信息（事务外，避免锁冲突）
  const sourceOrderNumbers = [...new Set(newItems.map(i => i.sourceOrderNumber))] as string[];
  const sourceDataMap: Record<string, any> = {};
  for (const sourceNum of sourceOrderNumbers) {
    const [sourceRows]: any = await sequelize.query(
      `SELECT production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_completion_time, remark, equipment_number, equipment_name, mould_number, formed_part_specifications, formed_part_unit_consumption, actual_cavity_count, actual_hole_count, actual_daily_output FROM production_order WHERE production_order_number = :id`,
      { replacements: { id: sourceNum } }
    );
    if (sourceRows.length > 0) {
      sourceDataMap[sourceNum] = sourceRows[0];
    }
  }

  // 预先生成所有新增行所需的编号（事务外，避免锁冲突）
  // 一次性查询当天最大编号，然后递增生成，避免重复
  const preGeneratedNumbers: string[] = [];
  const today = new Date();
  const numPrefix = 'P' + today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const [maxRows]: any = await sequelize.query(
    `SELECT MAX(production_order_number) as max_num FROM production_order WHERE production_order_number LIKE :prefix`,
    { replacements: { prefix: numPrefix + '%' } }
  );
  let baseSeq = 1;
  if (maxRows[0].max_num) {
    const lastSeq = parseInt(maxRows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) { baseSeq = lastSeq + 1; }
  }
  for (let i = 0; i < newItems.length; i++) {
    preGeneratedNumbers.push(numPrefix + String(baseSeq + i).padStart(3, '0'));
  }

  return await withTransaction(async (transaction) => {
    let updatedCount = 0;
    let createdCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // 1. 更新原始行的计划数量
    for (const item of originalItems) {
      try {
        const newQty = parseFloat(String(item.newPlannedQuantity));
        if (isNaN(newQty) || newQty < 0) {
          errors.push(`${item.productionOrderNumber}: 新计划数量无效`);
          failedCount++;
          continue;
        }
        await sequelize.query(
          `UPDATE production_order SET planned_quantity = :qty WHERE production_order_number = :id`,
          { replacements: { qty: newQty, id: item.productionOrderNumber }, transaction }
        );
        updatedCount++;
      } catch (e: any) {
        errors.push(`${item.productionOrderNumber}: ${e.message}`);
        failedCount++;
      }
    }

    // 2. 创建新增行（使用预生成的编号和预查询的源数据）
    let numIdx = 0;
    for (const item of newItems) {
      try {
        const newQty = parseFloat(String(item.newPlannedQuantity));
        if (isNaN(newQty) || newQty <= 0) {
          errors.push(`新增行(源自${item.sourceOrderNumber}): 计划数量无效`);
          failedCount++;
          numIdx++;
          continue;
        }

        const source = sourceDataMap[item.sourceOrderNumber!];
        if (!source) {
          errors.push(`新增行: 源记录 ${item.sourceOrderNumber} 不存在`);
          failedCount++;
          numIdx++;
          continue;
        }

        const newOrderNumber = preGeneratedNumbers[numIdx];

        await sequelize.query(
          `INSERT INTO production_order (production_order_number, production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, equipment_number, equipment_name, mould_number, formed_part_specifications, formed_part_unit_consumption, actual_cavity_count, actual_hole_count, actual_daily_output, planned_completion_time, plan_status, remark, approval_status)
           VALUES (:production_order_number, :production_number, :item_number, :item_name, :basic_unit, :specifications, :product_drawing_number, :rubber_compound_number, :batch_production_quota, :planned_quantity, :equipment_number, :equipment_name, :mould_number, :formed_part_specifications, :formed_part_unit_consumption, :actual_cavity_count, :actual_hole_count, :actual_daily_output, :planned_completion_time, :plan_status, :remark, :approval_status)`,
          {
            replacements: {
              production_order_number: newOrderNumber,
              production_number: source.production_number || '',
              item_number: source.item_number || '',
              item_name: source.item_name || '',
              basic_unit: source.basic_unit || '',
              specifications: source.specifications || '',
              product_drawing_number: source.product_drawing_number || '',
              rubber_compound_number: source.rubber_compound_number || '',
              batch_production_quota: source.batch_production_quota || '',
              planned_quantity: newQty,
              equipment_number: source.equipment_number || null,
              equipment_name: source.equipment_name || null,
              mould_number: source.mould_number || null,
              formed_part_specifications: source.formed_part_specifications || null,
              formed_part_unit_consumption: source.formed_part_unit_consumption || null,
              actual_cavity_count: source.actual_cavity_count || null,
              actual_hole_count: source.actual_hole_count || null,
              actual_daily_output: source.actual_daily_output || null,
              planned_completion_time: source.planned_completion_time || null,
              plan_status: '未开始',
              remark: source.remark || '',
              approval_status: ORDER_STATUS.DRAFT
            },
            transaction
          }
        );
        createdCount++;
      } catch (e: any) {
        errors.push(`新增行(源自${item.sourceOrderNumber}): ${e.message}`);
        failedCount++;
      }
      numIdx++;
    }

    return { updated: updatedCount, created: createdCount, failed: failedCount, errors };
  });
};

// ==================== 生产调度单派发（简单派发，不生成任务） ====================
export const dispatchOrdersCore = async (params: {
  items: Array<{
    productionOrderNumber: string; equipmentNumber?: string;
    equipmentName?: string; mouldNumber?: string;
    formedPartSpecs?: string; formedPartUnitConsumption?: string;
    actualCavityCount?: number; actualHoleCount?: number;
    actualDailyOutput?: number;
    productionDate?: string; scheduleId?: string;
  }>;
}): Promise<{ successCount: number; failedCount: number; errors: string[] }> => {
  const items = params.items;

  return await withTransaction(async (transaction) => {
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        const orderNum = item.productionOrderNumber;
        if (!orderNum) {
          errors.push('缺少生产单编号');
          failedCount++;
          continue;
        }

        // 验证生产单审批状态
        const [checkRows]: any = await sequelize.query(
          `SELECT approval_status, plan_status FROM production_order WHERE production_order_number = :orderNum`,
          { replacements: { orderNum }, transaction }
        );
        if (checkRows.length === 0) {
          errors.push(`${orderNum}: 生产单不存在`);
          failedCount++;
          continue;
        }
        if (checkRows[0].approval_status !== '已审批') {
          errors.push(`${orderNum}: 审批状态为"${checkRows[0].approval_status}"，需要"已审批"才能派发`);
          failedCount++;
          continue;
        }
        if (checkRows[0].plan_status !== '未开始') {
          errors.push(`${orderNum}: 计划状态为"${checkRows[0].plan_status}"，需要"未开始"才能派发`);
          failedCount++;
          continue;
        }

        await sequelize.query(
          `UPDATE production_order SET
            plan_status = N'已派发',
            equipment_number = :equipment_number,
            equipment_name = :equipment_name,
            mould_number = :mould_number,
            formed_part_specifications = :formed_part_specifications,
            formed_part_unit_consumption = :formed_part_unit_consumption,
            actual_cavity_count = :actual_cavity_count,
            actual_hole_count = :actual_hole_count,
            actual_daily_output = :actual_daily_output,
            production_date = :production_date,
            schedule_id = :schedule_id
          WHERE production_order_number = :id`,
          {
            replacements: {
              id: orderNum,
              equipment_number: item.equipmentNumber || null,
              equipment_name: item.equipmentName || null,
              mould_number: item.mouldNumber || null,
              formed_part_specifications: item.formedPartSpecs || null,
              formed_part_unit_consumption: item.formedPartUnitConsumption || null,
              actual_cavity_count: item.actualCavityCount || null,
              actual_hole_count: item.actualHoleCount || null,
              actual_daily_output: item.actualDailyOutput || null,
              production_date: item.productionDate || null,
              schedule_id: item.scheduleId || null
            },
            transaction
          }
        );
        successCount++;
      } catch (e: any) {
        errors.push(`${item.productionOrderNumber}: ${e.message}`);
        failedCount++;
      }
    }

    return { successCount, failedCount, errors };
  });
};

// ==================== 一键派发并自动生成工序任务+备料单 ====================
export const dispatchAndGenerateCore = async (params: {
  items: Array<{
    productionOrderNumber: string; equipmentNumber?: string;
    equipmentName?: string; mouldNumber?: string;
    formedPartSpecs?: string; formedPartUnitConsumption?: string;
    actualCavityCount?: number; actualHoleCount?: number;
    actualDailyOutput?: number; productionDate?: string; scheduleId?: string;
  }>;
}, username: string): Promise<{
  dispatch: { count: number; items: any[] };
  processTasks: { totalGenerated: number; details: any[] };
  materialPreparations: { totalGenerated: number; details: any[] };
  errors: string[];
}> => {
  const items = params.items;

  // ============ 排产冲突检查（派发前置校验） ============
  const { batchConflicts, dbConflicts } = await checkSchedulingConflicts(
    items.map(it => ({
      productionOrderNumber: it.productionOrderNumber,
      mouldNumber: it.mouldNumber,
      equipmentNumber: it.equipmentNumber,
      productionDate: it.productionDate,
      scheduleId: it.scheduleId
    }))
  );

  // 如果本批次内部有冲突，抛出 400
  if (batchConflicts.length > 0) {
    const err = new BusinessError(400, '本批次派发存在排产冲突');
    (err as any).conflicts = batchConflicts;
    throw err;
  }

  // 汇总所有数据库冲突，抛出 409
  if (dbConflicts.length > 0) {
    const err = new BusinessError(409, '排产冲突，派发失败');
    (err as any).conflicts = dbConflicts;
    throw err;
  }

  return await withTransaction(async (transaction) => {
    const dispatchResults: any[] = [];
    const taskResults: any[] = [];
    const prepResults: any[] = [];
    const errors: string[] = [];

    for (const item of items) {
      const orderNo = item.productionOrderNumber;

      // ============ 第一步：验证并派发 ============
      const [orderRows]: any = await sequelize.query(
        `SELECT production_order_number, production_number, item_number, item_name,
          specifications, basic_unit, planned_quantity, approval_status, plan_status
        FROM production_order WHERE production_order_number = :orderNo`,
        { replacements: { orderNo }, transaction }
      );
      if (orderRows.length === 0) {
        errors.push(`${orderNo}: 生产单不存在`);
        continue;
      }
      const order = orderRows[0];
      if (order.approval_status !== '已审批') {
        errors.push(`${orderNo}: 审批状态为"${order.approval_status}"，需要"已审批"才能派发`);
        continue;
      }
      if (order.plan_status !== '未开始') {
        errors.push(`${orderNo}: 计划状态为"${order.plan_status}"，需要"未开始"才能派发`);
        continue;
      }

      await sequelize.query(
        `UPDATE production_order SET
          plan_status = N'已派发',
          equipment_number = :equipment_number,
          equipment_name = :equipment_name,
          mould_number = :mould_number,
          formed_part_specifications = :formed_part_specifications,
          formed_part_unit_consumption = :formed_part_unit_consumption,
          actual_cavity_count = :actual_cavity_count,
          actual_hole_count = :actual_hole_count,
          actual_daily_output = :actual_daily_output,
          production_date = :production_date,
          schedule_id = :schedule_id
        WHERE production_order_number = :id`,
        {
          replacements: {
            id: orderNo,
            equipment_number: item.equipmentNumber || null,
            equipment_name: item.equipmentName || null,
            mould_number: item.mouldNumber || null,
            formed_part_specifications: item.formedPartSpecs || null,
            formed_part_unit_consumption: item.formedPartUnitConsumption || null,
            actual_cavity_count: item.actualCavityCount || null,
            actual_hole_count: item.actualHoleCount || null,
            actual_daily_output: item.actualDailyOutput || null,
            production_date: item.productionDate || null,
            schedule_id: item.scheduleId || null
          },
          transaction
        }
      );
      dispatchResults.push({ orderNo, status: 'dispatched' });

      // ============ 第二步：自动生成工序任务 ============
      const taskResult = await generateProcessTasks({
        orderNumber: orderNo,
        productionNumber: order.production_number,
        itemNumber: order.item_number,
        itemName: order.item_name,
        specifications: order.specifications,
        basicUnit: order.basic_unit,
        plannedQuantity: order.planned_quantity
      }, username, transaction);
      taskResults.push({ orderNo, tasksGenerated: taskResult.tasksGenerated, skipped: taskResult.skipReason || undefined });

      // ============ 第三步：自动生成备料单 ============
      // 查询 taskMap 供备料单使用
      const [taskWcRows]: any = await sequelize.query(
        `SELECT step_number, work_center_number, work_center_name FROM process_task WHERE production_order_number = :orderNo ORDER BY step_number`,
        { replacements: { orderNo }, transaction }
      );
      const taskMap: Record<number, any> = {};
      for (const tw of taskWcRows) { taskMap[tw.step_number] = tw; }

      const prepResult = await generateMaterialPreparation({
        orderNumber: orderNo,
        productionNumber: order.production_number,
        itemNumber: order.item_number,
        itemName: order.item_name,
        specifications: order.specifications,
        basicUnit: order.basic_unit,
        plannedQuantity: order.planned_quantity,
        routeMaterialMap: taskResult.routeMaterialMap,
        routeStepNameMap: taskResult.routeStepNameMap,
        taskMap
      }, username, transaction);
      prepResults.push({ orderNo, materialsGenerated: prepResult.materialsGenerated, prepSkipped: prepResult.skipReason || undefined });
    }

    const successCount = dispatchResults.length;
    const taskTotalCount = taskResults.reduce((sum, r) => sum + r.tasksGenerated, 0);
    const prepTotalCount = prepResults.filter(r => r.materialsGenerated > 0).length;

    return {
      dispatch: { count: successCount, items: dispatchResults },
      processTasks: { totalGenerated: taskTotalCount, details: taskResults },
      materialPreparations: { totalGenerated: prepTotalCount, details: prepResults },
      errors
    };
  });
};

// ==================== 从生产单拆解生成工序任务（无事务包装，部分成功可接受） ====================
export const generateFromOrderCore = async (productionOrderNumbers: string[], username: string): Promise<{
  orderCount: number; taskCount: number;
  details: any[]; skipped: any[];
}> => {
  const results: { orderCount: number; taskCount: number; details: any[]; skipped: any[] } = {
    orderCount: 0, taskCount: 0, details: [], skipped: []
  };
  const now = dayjs().format('YYYY/MM/DD HH:mm');
  const outsourcingReqLines: Record<string, any[]> = {};

  for (const orderNo of productionOrderNumbers) {
    // 1. 查询生产单
    const [orders]: any = await sequelize.query(
      `SELECT production_order_number, production_number, item_number, item_name, specifications, basic_unit, planned_quantity, approval_status FROM production_order WHERE production_order_number = :orderNo`,
      { replacements: { orderNo } }
    );
    if (orders.length === 0) { results.skipped.push({ orderNo, reason: '生产单不存在' }); continue; }
    const order = orders[0];
    if (order.approval_status !== '已审批') { results.skipped.push({ orderNo, reason: '生产单未审批（当前状态：' + order.approval_status + '）' }); continue; }

    // 2. 匹配工艺路线（通过产品编号，取已启用+已审批+最新的一条）
    const [routings]: any = await sequelize.query(
      `SELECT TOP 1 process_route_number, process_route_name FROM routing_header WHERE item_number = :item_number AND condition = N'启用' AND approval_status = N'已审批' ORDER BY creation_date DESC`,
      { replacements: { item_number: order.item_number } }
    );
    if (routings.length === 0) { results.skipped.push({ orderNo, reason: '未匹配到已审批且启用的工艺路线（产品编号：' + order.item_number + '）' }); continue; }
    const routing = routings[0];

    // 3. 读取工艺路线明细
    const [details]: any = await sequelize.query(
      `SELECT step_number, standard_process_number, standard_process_name, post_processing_sequence_number, post_processing_sequence_name, work_center_number, work_center_name, excess_reporting_ratio, ingredient_addition_method, process_material_input_number, process_material_input_quantity, process_material_input_unit, material_wastage_rate, operator, is_outsourced, enable_self_inspect, enable_special_inspect, self_inspect_plan_name, special_inspect_plan_name, self_inspect_spec_name, special_inspect_spec_name FROM routing_detail WHERE process_route_number = :prn ORDER BY step_number`,
      { replacements: { prn: routing.process_route_number } }
    );
    if (details.length === 0) { results.skipped.push({ orderNo, reason: '工艺路线无工序明细（路线编号：' + routing.process_route_number + '）' }); continue; }

    // 4. 逐条生成工序任务
    let tasksGenerated = 0;
    for (const d of details) {
      // 防重复：检查同一生产单+同一工序序号是否已存在
      const [dup]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM process_task WHERE production_order_number = :orderNo AND step_number = :step`,
        { replacements: { orderNo, step: d.step_number } }
      );
      if (dup[0].cnt > 0) continue;

      const taskNumber = await generateTaskNumber();
      await sequelize.query(`
        INSERT INTO process_task (process_task_number, production_order_number, production_number, process_route_number, step_number, item_number, item_name, specifications, basic_unit, planned_quantity, completed_quantity, standard_process_number, standard_process_name, work_center_number, work_center_name, process_material_input_number, process_material_input_quantity, process_material_input_unit, material_wastage_rate, excess_reporting_ratio, ingredient_addition_method, task_status, approval_status, remark, creation_date, creation_man, operator, is_outsourced, enable_self_inspect, enable_special_inspect, self_inspect_plan_name, special_inspect_plan_name, self_inspect_spec_name, special_inspect_spec_name)
        VALUES (:process_task_number, :production_order_number, :production_number, :process_route_number, :step_number, :item_number, :item_name, :specifications, :basic_unit, :planned_quantity, 0, :standard_process_number, :standard_process_name, :work_center_number, :work_center_name, :process_material_input_number, :process_material_input_quantity, :process_material_input_unit, :material_wastage_rate, :excess_reporting_ratio, :ingredient_addition_method, N'未开始', N'草稿', :remark, :creation_date, :creation_man, :operator, :is_outsourced, :enable_self_inspect, :enable_special_inspect, :self_inspect_plan_name, :special_inspect_plan_name, :self_inspect_spec_name, :special_inspect_spec_name)
      `, {
        replacements: {
          process_task_number: taskNumber,
          production_order_number: order.production_order_number,
          production_number: order.production_number || '',
          process_route_number: routing.process_route_number,
          step_number: d.step_number,
          item_number: order.item_number || '',
          item_name: order.item_name || '',
          specifications: order.specifications || '',
          basic_unit: order.basic_unit || '',
          planned_quantity: order.planned_quantity || 0,
          standard_process_number: d.standard_process_number || '',
          standard_process_name: d.standard_process_name || '',
          work_center_number: d.work_center_number || '',
          work_center_name: d.work_center_name || '',
          process_material_input_number: d.process_material_input_number || '',
          process_material_input_quantity: d.process_material_input_quantity || '',
          process_material_input_unit: d.process_material_input_unit || '',
          material_wastage_rate: d.material_wastage_rate || '',
          excess_reporting_ratio: d.excess_reporting_ratio || '',
          ingredient_addition_method: d.ingredient_addition_method || '',
          remark: '',
          creation_date: now,
          creation_man: username,
          operator: d.operator || username,
          is_outsourced: d.is_outsourced ? 1 : 0,
          enable_self_inspect: d.enable_self_inspect || '否',
          enable_special_inspect: d.enable_special_inspect || '否',
          self_inspect_plan_name: d.self_inspect_plan_name || '',
          special_inspect_plan_name: d.special_inspect_plan_name || '',
          self_inspect_spec_name: d.self_inspect_spec_name || '',
          special_inspect_spec_name: d.special_inspect_spec_name || ''
        }
      });
      // 若为委外工序，收集到委外申请明细列表
      if (d.is_outsourced) {
        if (!outsourcingReqLines[orderNo]) outsourcingReqLines[orderNo] = [];
        outsourcingReqLines[orderNo].push({
          process_task_number: taskNumber,
          step_number: d.step_number,
          standard_process_number: d.standard_process_number || '',
          standard_process_name: d.standard_process_name || '',
          work_center_number: d.work_center_number || '',
          work_center_name: d.work_center_name || '',
          planned_quantity: order.planned_quantity || 0
        });
      }
      tasksGenerated++;
    }

    // 为该生产单的所有委外工序创建一张委外申请单
    if (outsourcingReqLines[orderNo] && outsourcingReqLines[orderNo].length > 0) {
      try {
        const [dupReq]: any = await sequelize.query(
          `SELECT COUNT(*) as cnt FROM outsourcing_req WHERE production_order_number = :orderNo`,
          { replacements: { orderNo } }
        );
        if (dupReq[0].cnt === 0) {
          const reqNumber = await generateOutsourcingReqNumber();
          await sequelize.query(`
            INSERT INTO outsourcing_req (outsourcing_req_number, production_order_number, production_number, item_number, item_name, specifications, basic_unit, planned_quantity, approval_status, order_status, remark, creation_date, creation_man)
            VALUES (:reqNumber, :pon, :pn, :itemNum, :itemName, :specs, :unit, :qty, N'草稿', N'未执行', N'派发自动生成', :createDate, :createMan)
          `, {
            replacements: {
              reqNumber, pon: order.production_order_number, pn: order.production_number || '',
              itemNum: order.item_number || '', itemName: order.item_name || '',
              specs: order.specifications || '', unit: order.basic_unit || '',
              qty: order.planned_quantity || 0, createDate: now, createMan: username
            }
          });
          for (let li = 0; li < outsourcingReqLines[orderNo].length; li++) {
            const line = outsourcingReqLines[orderNo][li];
            await sequelize.query(`
              INSERT INTO outsourcing_req_detail (outsourcing_req_number, line_number, process_task_number, step_number, standard_process_number, standard_process_name, work_center_number, work_center_name, planned_quantity, ordered_quantity, status)
              VALUES (:reqNumber, :lineNum, :ptn, :step, :spn, :spname, :wcn, :wcname, :qty, 0, N'未执行')
            `, {
              replacements: {
                reqNumber, lineNum: (li + 1) * 10, ptn: line.process_task_number, step: line.step_number,
                spn: line.standard_process_number, spname: line.standard_process_name,
                wcn: line.work_center_number, wcname: line.work_center_name, qty: line.planned_quantity
              }
            });
          }
        }
      } catch (reqErr: any) { /* 委外申请创建失败不阻断主流程 */ }
    }

    results.orderCount++;
    results.taskCount += tasksGenerated;
    results.details.push({ production_order_number: orderNo, tasks_generated: tasksGenerated });
  }

  return results;
};
