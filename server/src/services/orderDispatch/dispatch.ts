/**
 * 生产调度服务 - 拆分/派发/一键派发/从生产单生成任务
 * 从 orderDispatch.service.ts 拆分
 */
import sequelize from '@/config/database';
import dayjs from 'dayjs';
import { BusinessError } from '@/shared/errors/BusinessError';
import { generateOrderNumber, generateTaskNumber, generateOutsourcingReqNumber } from '@/services/documentNumber.service';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { withTransaction } from '@/shared/db/withTransaction';
import { syncProductionStatus, syncPlanStatus } from '@/services/salesOrderSync.service';
import { checkSchedulingConflicts } from './conflictCheck';
import { generateProcessTasks, generateMaterialPreparation } from './taskAndMaterialGen';
import { generateBackflushTasks } from '@/services/backflushTask.service';
import { lookupBatchRule, generatePreassignedBatchNumber } from '@/services/inventory.service';

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

        // 检查是否为模式B产品，预分配批次号
        let preassignedBatchNumber = '';
        try {
          const rule = await lookupBatchRule(source.item_number, null, transaction);
          if (rule?.mode === 'B' && source.production_number) {
            // 拆分场景：计算同一源生产单被拆分的新行序号
            const splitIdx = newItems.filter((ni, niIdx) => niIdx < numIdx && ni.sourceOrderNumber === item.sourceOrderNumber).length + 1;
            preassignedBatchNumber = generatePreassignedBatchNumber(source.production_number, splitIdx, rule.append_split_seq);
          }
        } catch (ruleErr: any) { /* 规则查询失败不阻断拆分 */ }

        await sequelize.query(
          `INSERT INTO production_order (production_order_number, production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, equipment_number, equipment_name, mould_number, formed_part_specifications, formed_part_unit_consumption, actual_cavity_count, actual_hole_count, actual_daily_output, planned_completion_time, plan_status, remark, approval_status, preassigned_batch_number)
           VALUES (:production_order_number, :production_number, :item_number, :item_name, :basic_unit, :specifications, :product_drawing_number, :rubber_compound_number, :batch_production_quota, :planned_quantity, :equipment_number, :equipment_name, :mould_number, :formed_part_specifications, :formed_part_unit_consumption, :actual_cavity_count, :actual_hole_count, :actual_daily_output, :planned_completion_time, :plan_status, :remark, :approval_status, :preassigned_batch_number)`,
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
              approval_status: ORDER_STATUS.DRAFT,
              preassigned_batch_number: preassignedBatchNumber
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

        // Baseline：首次设置生产日期时，同步记录原始计划日期
        if (item.productionDate) {
          await sequelize.query(
            `UPDATE production_order
             SET baseline_production_date = COALESCE(baseline_production_date, production_date),
                 baseline_planned_completion_time = COALESCE(baseline_planned_completion_time, planned_completion_time)
             WHERE production_order_number = :id AND baseline_production_date IS NULL`,
            { replacements: { id: orderNum }, transaction }
          );
        }

        successCount++;

        // 回写销售订单明细 production_status
        await syncProductionStatus(orderNum, '计划中', transaction);
        // 同步生产计划状态
        await syncPlanStatus(orderNum, 'order', transaction);
      } catch (e: any) {
        errors.push(`${item.productionOrderNumber}: ${e.message}`);
        failedCount++;
      }
    }

    return { successCount, failedCount, errors };
  });
};

// ==================== 一键派发并自动生成工序任务+备料单 ======================================
export const dispatchAndGenerateCore = async (params: {
  items: Array<{
    productionOrderNumber: string; equipmentNumber?: string;
    equipmentName?: string; mouldNumber?: string;
    formedPartSpecs?: string; formedPartUnitConsumption?: string;
    actualCavityCount?: number; actualHoleCount?: number;
    actualDailyOutput?: number; productionDate?: string; scheduleId?: string;
  }>;
}, username: string, factoryCode: string = ''): Promise<{
  dispatch: { count: number; items: any[] };
  processTasks: { totalGenerated: number; details: any[] };
  materialPreparations: { totalGenerated: number; details: any[] };
  semiProductOrders: { totalGenerated: number; details: any[] };
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
    const semiProductResults: any[] = [];
    const errors: string[] = [];

    for (const item of items) {
      const orderNo = item.productionOrderNumber;

      // ============ 第一步：验证并派发 ============
      const [orderRows]: any = await sequelize.query(
        `SELECT production_order_number, production_number, item_number, item_name,
          specifications, basic_unit, planned_quantity, approval_status, plan_status,
          preassigned_batch_number
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

      // Baseline：首次设置生产日期时，同步记录原始计划日期
      if (item.productionDate) {
        await sequelize.query(
          `UPDATE production_order
           SET baseline_production_date = COALESCE(baseline_production_date, production_date),
               baseline_planned_completion_time = COALESCE(baseline_planned_completion_time, planned_completion_time)
           WHERE production_order_number = :id AND baseline_production_date IS NULL`,
          { replacements: { id: orderNo }, transaction }
        );
      }

      // 模式B：派发时为未预分配批次号的生产单分配
      if (!order.preassigned_batch_number && order.production_number) {
        try {
          const rule = await lookupBatchRule(order.item_number, null, transaction);
          if (rule?.mode === 'B') {
            // 派发场景：未拆分的生产单不需要追加序号
            const batchNo = generatePreassignedBatchNumber(order.production_number, undefined, rule.append_split_seq);
            await sequelize.query(
              `UPDATE production_order SET preassigned_batch_number = :bn WHERE production_order_number = :pon`,
              { replacements: { bn: batchNo, pon: orderNo }, transaction }
            );
          }
        } catch (ruleErr: any) { /* 规则查询失败不阻断派发 */ }
      }

      dispatchResults.push({ orderNo, status: 'dispatched' });

      // 回写销售订单明细 production_status
      await syncProductionStatus(orderNo, '计划中', transaction);
      // 同步生产计划状态
      await syncPlanStatus(orderNo, 'order', transaction);
      const taskResult = await generateProcessTasks({
        orderNumber: orderNo,
        productionNumber: order.production_number,
        itemNumber: order.item_number,
        itemName: order.item_name,
        specifications: order.specifications,
        basicUnit: order.basic_unit,
        plannedQuantity: order.planned_quantity
      }, username, transaction, factoryCode);
      taskResults.push({ orderNo, tasksGenerated: taskResult.tasksGenerated, skipped: taskResult.skipReason || undefined });

      // ============ 第三步：备料单生成 ============
      const [taskWcRowsPrep]: any = await sequelize.query(
        `SELECT step_number, work_center_number, work_center_name FROM process_task WHERE production_order_number = :orderNo ORDER BY step_number`,
        { replacements: { orderNo }, transaction }
      );
      const taskMapPrep: Record<number, any> = {};
      for (const tw of taskWcRowsPrep) { taskMapPrep[tw.step_number] = tw; }

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
        taskMap: taskMapPrep
      }, username, transaction, factoryCode);
      semiProductResults.push({ orderNo, semiOrders: [] });
      prepResults.push({ orderNo, materialsGenerated: prepResult.materialsGenerated, prepSkipped: prepResult.skipReason || undefined });

      // ============ 第四步：倒冲任务生成 ============
      try {
        await generateBackflushTasks({
          orderNumber: orderNo,
          itemNumber: order.item_number,
          itemName: order.item_name,
          specifications: order.specifications,
          basicUnit: order.basic_unit,
          plannedQuantity: order.planned_quantity,
        }, username, transaction);
      } catch (bfErr: any) {
        // 倒冲任务生成失败不阻断派发
      }
    }

    const successCount = dispatchResults.length;
    const taskTotalCount = taskResults.reduce((sum, r) => sum + r.tasksGenerated, 0);
    const prepTotalCount = prepResults.filter(r => r.materialsGenerated > 0).length;

    return {
      dispatch: { count: successCount, items: dispatchResults },
      processTasks: { totalGenerated: taskTotalCount, details: taskResults },
      materialPreparations: { totalGenerated: prepTotalCount, details: prepResults },
      semiProductOrders: { totalGenerated: semiProductResults.reduce((sum, r) => sum + r.semiOrders.length, 0), details: semiProductResults },
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

    // 2. 匹配工艺路线
    const [routings]: any = await sequelize.query(
      `SELECT TOP 1 process_route_number, process_route_name, bom_number FROM routing_header WHERE item_number = :item_number AND condition = N'启用' AND approval_status = N'已审批' ORDER BY CASE WHEN is_primary = N'是' THEN 0 ELSE 1 END, creation_date DESC`,
      { replacements: { item_number: order.item_number } }
    );
    if (routings.length === 0) { results.skipped.push({ orderNo, reason: '未匹配到已审批且启用的工艺路线（产品编号：' + order.item_number + '）' }); continue; }
    const routing = routings[0];

    // 3. 读取工艺路线明细
    const [details]: any = await sequelize.query(
      `SELECT step_number, standard_process_number, standard_process_name, post_processing_sequence_number, post_processing_sequence_name, work_center_number, work_center_name, excess_reporting_ratio, ingredient_addition_method, process_material_input_number, process_material_input_quantity, process_material_input_unit, material_wastage_rate, operator, is_outsourced, inspect_type, inspect_plan_name, inspect_spec_name FROM routing_detail WHERE process_route_number = :prn ORDER BY step_number`,
      { replacements: { prn: routing.process_route_number } }
    );
    if (details.length === 0) { results.skipped.push({ orderNo, reason: '工艺路线无工序明细（路线编号：' + routing.process_route_number + '）' }); continue; }

    // 4. 逐条生成工序任务
    let tasksGenerated = 0;
    for (const d of details) {
      const [dup]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM process_task WHERE production_order_number = :orderNo AND step_number = :step`,
        { replacements: { orderNo, step: d.step_number } }
      );
      if (dup[0].cnt > 0) continue;

      const taskNumber = await generateTaskNumber();
      await sequelize.query(`
        INSERT INTO process_task (process_task_number, production_order_number, production_number, process_route_number, step_number, item_number, item_name, specifications, basic_unit, planned_quantity, completed_quantity, standard_process_number, standard_process_name, work_center_number, work_center_name, process_material_input_number, process_material_input_quantity, process_material_input_unit, material_wastage_rate, excess_reporting_ratio, ingredient_addition_method, task_status, approval_status, remark, creation_date, creation_man, operator, is_outsourced, inspect_type, inspect_plan_name, inspect_spec_name, inspect_status, inspector_number, inspector_name, attachment_info, technical_requirement, is_backflush)
        VALUES (:process_task_number, :production_order_number, :production_number, :process_route_number, :step_number, :item_number, :item_name, :specifications, :basic_unit, :planned_quantity, 0, :standard_process_number, :standard_process_name, :work_center_number, :work_center_name, :process_material_input_number, :process_material_input_quantity, :process_material_input_unit, :material_wastage_rate, :excess_reporting_ratio, :ingredient_addition_method, N'未开始', N'草稿', :remark, :creation_date, :creation_man, :operator, :is_outsourced, :inspect_type, :inspect_plan_name, :inspect_spec_name, N'无需检', :inspector_number, :inspector_name, :attachment_info, :technical_requirement, :isBackflush)
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
          inspect_type: d.inspect_type || '无需检',
          inspect_plan_name: d.inspect_plan_name || '',
          inspect_spec_name: d.inspect_spec_name || '',
          inspector_number: d.inspector_number || '',
          inspector_name: d.inspector_name || '',
          attachment_info: d.attachment_info || '',
          technical_requirement: d.technical_requirement || '',
          isBackflush: d.flowing_backward === '是' ? 1 : 0
        }
      });
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
