/**
 * 倒冲任务清单服务
 * - 派发时生成倒冲任务
 * - 入库时自动扣减物料库存
 */
import sequelize from '@/config/database';
import { generateBackflushTaskNumber } from './documentNumber.service';
import { generateMaterialTxnNumber } from './inventory.service';
import { getFactoryId } from '../utils/factoryWhere.util';
import { fifoDeductBatches, upsertMaterialInventory, createMaterialTransaction } from './warehouse/helpers';
import { logLinesideMovement } from './linesideMovement.service';
import { createLogger } from '@/config/logger';
import { BusinessError } from '@/shared/errors/BusinessError';

const log = createLogger('backflushTask');

// ==================== 倒冲任务生成 ====================

export const generateBackflushTasks = async (
  params: {
    orderNumber: string;
    itemNumber: string; itemName: string; specifications: string; basicUnit: string;
    plannedQuantity: number;
  },
  username: string,
  transaction: any,
  factoryCode: string = ''
): Promise<{ tasksGenerated: number; skipReason: string }> => {
  const orderNo = params.orderNumber;
  let tasksGenerated = 0;
  let skipReason = '';

  try {
    // 幂等: 若该生产单已有倒冲任务则跳过
    const [existingTasks]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM backflush_task WHERE production_order_number = :orderNo`,
      { replacements: { orderNo }, transaction }
    );
    if (existingTasks[0].cnt > 0) {
      return { tasksGenerated: 0, skipReason: '该生产单已存在倒冲任务' };
    }

    // 查询工艺路线
    const [routes]: any = await sequelize.query(
      `SELECT TOP 1 process_route_number, bom_number, default_backflush_warehouse
       FROM routing_header
       WHERE item_number = :item_number AND condition = N'启用' AND approval_status = N'已审批'
       ORDER BY CASE WHEN is_primary = N'是' THEN 0 ELSE 1 END, creation_date DESC`,
      { replacements: { item_number: params.itemNumber }, transaction }
    );
    if (routes.length === 0) {
      return { tasksGenerated: 0, skipReason: '未找到匹配的工艺路线' };
    }

    const route = routes[0];
    const routeBackflushWarehouse = route.default_backflush_warehouse || '';

    // 查询 flowing_backward='是' 的工序
    const [backflushSteps]: any = await sequelize.query(
      `SELECT id, step_number, standard_process_name, work_center_number, work_center_name, default_repository
       FROM routing_detail
       WHERE process_route_number = :prn AND flowing_backward = N'是'
       ORDER BY step_number`,
      { replacements: { prn: route.process_route_number }, transaction }
    );
    if (backflushSteps.length === 0) {
      return { tasksGenerated: 0, skipReason: '工艺路线无倒冲工序' };
    }

    // 获取BOM信息
    let bomNumber = route.bom_number || '';
    let bomBaseQty = 1;
    if (!bomNumber) {
      const [fallbackBom]: any = await sequelize.query(
        `SELECT TOP 1 bom_number, base_quantity FROM bom_header
         WHERE item_number = :item_number AND [condition] = N'启用' AND approval_status = N'已审批'
         ORDER BY bom_version DESC`,
        { replacements: { item_number: params.itemNumber }, transaction }
      );
      if (fallbackBom.length > 0) {
        bomNumber = fallbackBom[0].bom_number;
        bomBaseQty = parseFloat(fallbackBom[0].base_quantity) || 1;
      }
    } else {
      const [bomHeader]: any = await sequelize.query(
        `SELECT base_quantity FROM bom_header WHERE bom_number = :bomNumber`,
        { replacements: { bomNumber }, transaction }
      );
      if (bomHeader.length > 0) {
        bomBaseQty = parseFloat(bomHeader[0].base_quantity) || 1;
      }
    }

    // 查询BOM明细
    const [bomDetails]: any = await sequelize.query(
      `SELECT material_number, material_name, material_type, unit,
              actual_quantity, step_number, default_warehouse
       FROM bom_detail WHERE bom_number = :bomNumber ORDER BY line_number`,
      { replacements: { bomNumber }, transaction }
    );
    if (bomDetails.length === 0) {
      return { tasksGenerated: 0, skipReason: 'BOM无物料明细' };
    }

    // 查询工序物料子表
    const backflushStepIds = backflushSteps.map((s: any) => s.id);
    const [routeMaterials]: any = await sequelize.query(
      `SELECT rdm.material_number, rdm.quantity, rdm.unit, rdm.is_backflush, rdm.routing_detail_id,
              rd.step_number, rd.work_center_number, rd.work_center_name, rd.standard_process_name, rd.default_repository
       FROM routing_detail_material rdm
       INNER JOIN routing_detail rd ON rdm.routing_detail_id = rd.id
       WHERE rdm.routing_detail_id IN (:ids)`,
      { replacements: { ids: backflushStepIds }, transaction }
    );

    // 构建工序默认仓库映射
    const stepWarehouseMap: Record<number, string> = {};
    for (const step of backflushSteps) {
      if (step.default_repository) {
        stepWarehouseMap[step.step_number] = step.default_repository;
      }
    }

    const plannedQty = parseFloat(String(params.plannedQuantity)) || 0;
    const multiplier = bomBaseQty > 0 ? plannedQty / bomBaseQty : 0;

    // 收集需要生成倒冲任务的物料行
    const taskLines: Array<{
      stepNumber: number; processName: string; wcNumber: string; wcName: string;
      materialNumber: string; materialName: string; materialType: string; materialUnit: string;
      bomActualQty: number; requiredQty: number; warehouseNumber: string;
    }> = [];

    if (routeMaterials.length > 0) {
      // 优先使用工序物料子表
      for (const rm of routeMaterials) {
        const actualQty = parseFloat(rm.quantity) || 0;
        const requiredQty = Math.round(multiplier * actualQty * 10000) / 10000;
        if (requiredQty <= 0) continue;

        // 仓库优先级: 工艺路线默认倒冲仓库 → 工序默认仓库 → BOM默认仓库
        let warehouse = routeBackflushWarehouse;
        if (!warehouse) {
          if (stepWarehouseMap[rm.step_number]) {
            warehouse = stepWarehouseMap[rm.step_number];
          } else {
            const bomMatch = bomDetails.find((bd: any) => bd.material_number === rm.material_number);
            if (bomMatch && bomMatch.default_warehouse) {
              warehouse = bomMatch.default_warehouse;
            }
          }
        }

        taskLines.push({
          stepNumber: rm.step_number,
          processName: rm.standard_process_name || '',
          wcNumber: rm.work_center_number || '',
          wcName: rm.work_center_name || '',
          materialNumber: rm.material_number,
          materialName: '',  // 从BOM补充
          materialType: '',
          materialUnit: rm.unit || '',
          bomActualQty: actualQty,
          requiredQty,
          warehouseNumber: warehouse,
        });
      }
    } else {
      // 回退: 使用BOM中属于倒冲工序的物料
      for (const bd of bomDetails) {
        const stepNum = parseInt(bd.step_number, 10);
        if (isNaN(stepNum)) continue;

        const isBackflushStep = backflushSteps.some((s: any) => s.step_number === stepNum);
        if (!isBackflushStep) continue;

        const actualQty = parseFloat(bd.actual_quantity) || 0;
        const requiredQty = Math.round(multiplier * actualQty * 10000) / 10000;
        if (requiredQty <= 0) continue;

        const stepInfo = backflushSteps.find((s: any) => s.step_number === stepNum);
        // 仓库优先级: 工艺路线默认倒冲仓库 → 工序默认仓库 → BOM默认仓库
        let warehouse = routeBackflushWarehouse;
        if (!warehouse) {
          if (stepInfo && stepInfo.default_repository) {
            warehouse = stepInfo.default_repository;
          } else {
            warehouse = bd.default_warehouse || '';
          }
        }

        taskLines.push({
          stepNumber: stepNum,
          processName: stepInfo ? stepInfo.standard_process_name : '',
          wcNumber: stepInfo ? stepInfo.work_center_number : '',
          wcName: stepInfo ? stepInfo.work_center_name : '',
          materialNumber: bd.material_number,
          materialName: bd.material_name,
          materialType: bd.material_type || '',
          materialUnit: bd.unit || '',
          bomActualQty: actualQty,
          requiredQty,
          warehouseNumber: warehouse,
        });
      }
    }

    // 补充物料名称/类型(若从工序物料子表取的缺少名称)
    for (const tl of taskLines) {
      if (!tl.materialName) {
        const bomMatch = bomDetails.find((bd: any) => bd.material_number === tl.materialNumber);
        if (bomMatch) {
          tl.materialName = bomMatch.material_name || '';
          tl.materialType = bomMatch.material_type || '';
          if (!tl.materialUnit) tl.materialUnit = bomMatch.unit || '';
        }
      }
      // 仓库未确定时，从material_inventory找有库存的仓库
      if (!tl.warehouseNumber) {
        const [invRows]: any = await sequelize.query(
          `SELECT TOP 1 warehouse_number FROM material_inventory
           WHERE item_number = :matNum AND quantity > 0
           ORDER BY quantity DESC`,
          { replacements: { matNum: tl.materialNumber }, transaction }
        );
        if (invRows.length > 0) {
          tl.warehouseNumber = invRows[0].warehouse_number;
        }
      }
    }

    // 批量生成倒冲任务编号并插入
    for (const tl of taskLines) {
      const taskNumber = await generateBackflushTaskNumber(factoryCode, transaction);

      // 查询仓库名称
      let warehouseName = '';
      if (tl.warehouseNumber) {
        const [whRows]: any = await sequelize.query(
          `SELECT TOP 1 warehouse_name FROM warehouse WHERE warehouse_number = :whNum`,
          { replacements: { whNum: tl.warehouseNumber }, transaction }
        );
        if (whRows.length > 0) warehouseName = whRows[0].warehouse_name || '';
      }

      await sequelize.query(
        `INSERT INTO backflush_task (
          backflush_task_number, production_order_number,
          item_number, item_name, specifications, basic_unit,
          planned_quantity, bom_number, bom_base_quantity,
          step_number, standard_process_name, work_center_number, work_center_name,
          material_number, material_name, material_type, material_unit,
          bom_actual_quantity, required_quantity, deducted_quantity, deduction_status,
          warehouse_number, warehouse_name, error_message, remark,
          creation_date, creation_man, last_updated
        ) VALUES (
          :taskNum, :orderNo,
          :itemNum, :itemName, :specs, :unit,
          :plannedQty, :bomNum, :bomBaseQty,
          :step, :procName, :wcNum, :wcName,
          :matNum, :matName, :matType, :matUnit,
          :bomActQty, :reqQty, 0, N'待扣减',
          :whNum, :whName, '', '',
          GETDATE(), :createMan, GETDATE()
        )`,
        {
          replacements: {
            taskNum: taskNumber, orderNo,
            itemNum: params.itemNumber, itemName: params.itemName,
            specs: params.specifications || '', unit: params.basicUnit || '',
            plannedQty: plannedQty, bomNum: bomNumber, bomBaseQty,
            step: tl.stepNumber, procName: tl.processName,
            wcNum: tl.wcNumber, wcName: tl.wcName,
            matNum: tl.materialNumber, matName: tl.materialName,
            matType: tl.materialType, matUnit: tl.materialUnit,
            bomActQty: tl.bomActualQty, reqQty: tl.requiredQty,
            whNum: tl.warehouseNumber, whName: warehouseName,
            createMan: username,
          },
          transaction
        }
      );
      tasksGenerated++;
    }
  } catch (err: any) {
    skipReason = `倒冲任务生成异常: ${err.message}`;
    log.error({ err, orderNo }, 'generateBackflushTasks error');
  }

  return { tasksGenerated, skipReason };
};

// ==================== 倒冲扣减执行 ====================

export const executeBackflushDeduction = async (
  productionOrderNumber: string,
  inboundQty: number,
  operator: string,
  transaction: any,
  factoryCode: string = ''
): Promise<{ deductedCount: number; failedCount: number }> => {
  let deductedCount = 0;
  const failedItems: string[] = [];

  if (!productionOrderNumber || inboundQty <= 0) {
    return { deductedCount: 0, failedCount: 0 };
  }

  // 查询该生产单待扣减的倒冲任务
  const [pendingTasks]: any = await sequelize.query(
    `SELECT id, backflush_task_number, production_order_number,
            item_number, item_name, specifications, basic_unit,
            bom_base_quantity, step_number, standard_process_name,
            work_center_number, work_center_name,
            material_number, material_name, material_type, material_unit,
            bom_actual_quantity, required_quantity, deducted_quantity,
            warehouse_number, warehouse_name
     FROM backflush_task
     WHERE production_order_number = :pon
       AND deduction_status IN (N'待扣减', N'部分扣减')
     ORDER BY step_number, material_number`,
    { replacements: { pon: productionOrderNumber }, transaction }
  );

  if (pendingTasks.length === 0) {
    return { deductedCount: 0, failedCount: 0 };
  }

  // ========== 入库前齐套检查：逐一校验线边仓库存是否充足 ==========
  const shortageItems: string[] = [];
  for (const task of pendingTasks) {
    const bomActualQty = parseFloat(task.bom_actual_quantity) || 0;
    const bomBaseQty = parseFloat(task.bom_base_quantity) || 1;
    const deductQty = Math.round(inboundQty * (bomActualQty / bomBaseQty) * 10000) / 10000;
    const remaining = (parseFloat(task.required_quantity) || 0) - (parseFloat(task.deducted_quantity) || 0);
    const actualDeduct = Math.min(deductQty, Math.round(remaining * 10000) / 10000);
    if (actualDeduct <= 0) continue;

    // 仓库未指定
    if (!task.warehouse_number) {
      shortageItems.push(`${task.material_name || task.material_number}: 扣减仓库未指定，请先在工艺路线设置默认倒冲仓库`);
      continue;
    }

    // 查询线边仓可用库存
    const [invRows]: any = await sequelize.query(
      `SELECT ISNULL(SUM(quantity), 0) as qty FROM material_inventory
       WHERE item_number = :matNum AND warehouse_number = :whNum`,
      { replacements: { matNum: task.material_number, whNum: task.warehouse_number }, transaction }
    );
    const availableQty = parseFloat(invRows[0]?.qty) || 0;

    if (availableQty < actualDeduct) {
      shortageItems.push(
        `${task.material_name || task.material_number}(${task.warehouse_name || task.warehouse_number}): ` +
        `需${actualDeduct}，库存仅${availableQty}，请先将材料移至线边仓`
      );
    }
  }

  // 齐套检查不通过 → 抛出错误阻止入库
  if (shortageItems.length > 0) {
    throw new BusinessError(400, `倒冲物料不齐套，无法入库：\n${shortageItems.join('\n')}`);
  }

  // ========== 齐套检查通过，执行扣减 ==========

  for (const task of pendingTasks) {
    // 计算本次扣减量 = 入库量 × (BOM单耗 / BOM基础量)
    const bomActualQty = parseFloat(task.bom_actual_quantity) || 0;
    const bomBaseQty = parseFloat(task.bom_base_quantity) || 1;
    let deductQty = Math.round(inboundQty * (bomActualQty / bomBaseQty) * 10000) / 10000;

    // 剩余封顶: 不超过 required - deducted
    const remaining = (parseFloat(task.required_quantity) || 0) - (parseFloat(task.deducted_quantity) || 0);
    if (deductQty > remaining) {
      deductQty = Math.round(remaining * 10000) / 10000;
    }
    if (deductQty <= 0) continue;

    // 仓库检查 — 无仓库则阻止入库
    if (!task.warehouse_number) {
      await updateTaskError(task.id, '扣减仓库未指定，请先设置线边仓', transaction);
      await insertDeductionLog(task, inboundQty, deductQty, '', '失败', '扣减仓库未指定', operator, transaction);
      failedItems.push(`${task.material_name || task.material_number}: 扣减仓库未指定，请先设置线边仓`);
      continue;
    }

    // FIFO扣减批次库存 — 库存不足则阻止入库
    let batchDeductions: any[];
    try {
      batchDeductions = await fifoDeductBatches({
        batchTable: 'material_batch_inventory',
        item_number: task.material_number,
        warehouse_number: task.warehouse_number,
        totalQuantity: deductQty,
      }, transaction);
    } catch (fifoErr: any) {
      const errMsg = fifoErr.message || '库存不足';
      await updateTaskError(task.id, errMsg, transaction);
      await insertDeductionLog(task, inboundQty, 0, '', '失败', errMsg, operator, transaction);
      failedItems.push(`${task.material_name || task.material_number}(${task.warehouse_name || task.warehouse_number}): ${errMsg}，请先将材料移至线边仓`);
      continue;
    }

    // 更新汇总库存
    const { beforeQty, afterQty } = await upsertMaterialInventory({
      item_number: task.material_number,
      item_name: task.material_name || '',
      item_type: task.material_type || '',
      specifications: task.specifications || '',
      basic_unit: task.material_unit || '',
      warehouse_number: task.warehouse_number,
      warehouse_name: task.warehouse_name || '',
      deltaQuantity: -deductQty,
    }, transaction);

    // 创建物料库存流水
    const txNum = await generateMaterialTxnNumber(factoryCode, transaction);
    await createMaterialTransaction({
      transaction_number: txNum,
      transaction_type: '出库',
      source_type: '倒冲出库',
      source_number: productionOrderNumber,
      item_number: task.material_number,
      item_name: task.material_name || '',
      item_type: task.material_type || '',
      specifications: task.specifications || '',
      basic_unit: task.material_unit || '',
      warehouse_number: task.warehouse_number,
      warehouse_name: task.warehouse_name || '',
      quantity: deductQty,
      before_quantity: beforeQty,
      after_quantity: afterQty,
      batch_number: batchDeductions.map(bd => bd.batch_number).join(','),
      supplier_number: '',
      supplier_name: '',
      operator,
      remark: `倒冲出库 生产单${productionOrderNumber} 入库量${inboundQty}`,
    }, transaction);

    // 记录线边仓出库
    try {
      await logLinesideMovement({
        transactionType: '出线边',
        sourceType: '倒冲出库',
        sourceNumber: txNum,
        productionOrderNumber: productionOrderNumber,
        itemNumber: task.material_number,
        itemName: task.material_name || '',
        specifications: task.specifications || '',
        basicUnit: task.material_unit || '',
        stepNumber: task.step_number || 0,
        workCenterNumber: task.work_center_number || '',
        workCenterName: task.work_center_name || '',
        quantity: deductQty,
        direction: 'OUT',
        operator,
        remark: `倒冲出库 ${txNum}`,
      }, transaction, factoryCode);
    } catch (lsErr) {
      log.error({ lsErr, materialNumber: task.material_number }, '倒冲线边仓记录失败');
    }

    // 更新倒冲任务状态
    const newDeductedQty = (parseFloat(task.deducted_quantity) || 0) + deductQty;
    const newRequiredQty = parseFloat(task.required_quantity) || 0;
    const newStatus = newDeductedQty >= newRequiredQty ? '已完成' : '部分扣减';

    await sequelize.query(
      `UPDATE backflush_task
       SET deducted_quantity = :deductedQty, deduction_status = :status,
           error_message = '', last_updated = GETDATE()
       WHERE id = :id`,
      {
        replacements: {
          deductedQty: newDeductedQty,
          status: newStatus,
          id: task.id,
        },
        transaction
      }
    );

    // 写入扣减日志
    await insertDeductionLog(
      task, inboundQty, deductQty,
      JSON.stringify(batchDeductions), '成功', '', operator, transaction,
      txNum, task.warehouse_number
    );

    deductedCount++;
  }

  // 有扣减失败项 → 抛出 BusinessError 阻止入库，回滚整个事务
  if (failedItems.length > 0) {
    throw new BusinessError(400, `倒冲扣减失败，无法入库：\n${failedItems.join('\n')}`);
  }

  return { deductedCount, failedCount: 0 };
};

// ==================== 辅助函数 ====================

const updateTaskError = async (taskId: number, errorMessage: string, transaction: any) => {
  try {
    await sequelize.query(
      `UPDATE backflush_task SET error_message = :errMsg, last_updated = GETDATE() WHERE id = :id`,
      { replacements: { errMsg: errorMessage, id: taskId }, transaction }
    );
  } catch (_) { /* 更新错误信息失败不影响主流程 */ }
};

const insertDeductionLog = async (
  task: any,
  inboundQty: number,
  deductQty: number,
  batchDeductions: string,
  status: string,
  errorMessage: string,
  operator: string,
  transaction: any,
  transactionNumber?: string,
  warehouseNumber?: string
) => {
  try {
    await sequelize.query(
      `INSERT INTO backflush_deduction_log (
        backflush_task_id, backflush_task_number, production_order_number,
        material_number, inbound_quantity, deduction_quantity,
        batch_deductions, transaction_number, warehouse_number,
        status, error_message, operator, deduction_date
      ) VALUES (
        :taskId, :taskNum, :pon,
        :matNum, :inboundQty, :deductQty,
        :batchDeductions, :txNum, :whNum,
        :status, :errMsg, :operator, GETDATE()
      )`,
      {
        replacements: {
          taskId: task.id,
          taskNum: task.backflush_task_number,
          pon: task.production_order_number,
          matNum: task.material_number,
          inboundQty,
          deductQty,
          batchDeductions,
          txNum: transactionNumber || '',
          whNum: warehouseNumber || task.warehouse_number || '',
          status,
          errMsg: errorMessage,
          operator,
        },
        transaction
      }
    );
  } catch (_) { /* 日志写入失败不影响主流程 */ }
};

// ==================== 查询接口 ====================

export const getBackflushTasks = async (queryParams: any) => {
  const {
    page = 1, pageSize = 20,
    production_order_number, deduction_status, material_number, item_number,
    keyword, auto_weigh
  } = queryParams || {};

  let where = 'WHERE 1=1';
  const replacements: any = {};

  if (production_order_number) {
    where += ' AND bt.production_order_number LIKE :pon';
    replacements.pon = `%${production_order_number}%`;
  }
  if (deduction_status) {
    where += ' AND bt.deduction_status = :status';
    replacements.status = deduction_status;
  }
  if (material_number) {
    where += ' AND bt.material_number LIKE :matNum';
    replacements.matNum = `%${material_number}%`;
  }
  if (item_number) {
    where += ' AND bt.item_number LIKE :itemNum';
    replacements.itemNum = `%${item_number}%`;
  }
  if (keyword) {
    where += ` AND (bt.production_order_number LIKE :kw OR bt.material_number LIKE :kw
              OR bt.material_name LIKE :kw OR bt.item_number LIKE :kw OR bt.item_name LIKE :kw)`;
    replacements.kw = `%${keyword}%`;
  }
  if (auto_weigh) {
    where += ' AND bt.auto_weigh = :aw';
    replacements.aw = auto_weigh;
  }

  // 多工厂数据隔离过滤（从controller传入factory_id）
  if (queryParams._factoryId) {
    where += ' AND bt.factory_id = :_factoryId';
    replacements._factoryId = queryParams._factoryId;
  }

  const countQuery = `SELECT COUNT(*) as total FROM backflush_task bt ${where}`;
  const [countRows]: any = await sequelize.query(countQuery, { replacements });
  const total = countRows[0]?.total || 0;

  const offset = (Number(page) - 1) * Number(pageSize) + 1;
  const limit = Number(page) * Number(pageSize);
  const dataQuery = `
    SELECT * FROM (
      SELECT bt.*, f.factory_name, f.factory_short, ROW_NUMBER() OVER (ORDER BY bt.creation_date DESC, bt.id DESC) AS _rn
      FROM backflush_task bt LEFT JOIN factory f ON bt.factory_id = f.id ${where}
    ) t WHERE _rn BETWEEN :offset AND :limit
  `;
  replacements.offset = offset;
  replacements.limit = limit;
  const [rawRows]: any = await sequelize.query(dataQuery, { replacements });
  // 移除辅助列 _rn
  const rows = rawRows.map((r: any) => { const { _rn, ...rest } = r; return rest; });

  return { total, page: Number(page), pageSize: Number(pageSize), rows };
};

export const getBackflushTaskDetail = async (taskId: number) => {
  const [taskRows]: any = await sequelize.query(
    `SELECT * FROM backflush_task WHERE id = :id`,
    { replacements: { id: taskId } }
  );
  if (taskRows.length === 0) return null;

  const [logs]: any = await sequelize.query(
    `SELECT * FROM backflush_deduction_log WHERE backflush_task_id = :taskId ORDER BY deduction_date DESC`,
    { replacements: { taskId } }
  );

  return { task: taskRows[0], logs };
};

export const manualRetryDeduction = async (taskId: number, operator: string) => {
  const { withTransaction } = await import('@/shared/db/withTransaction');
  return await withTransaction(async (transaction) => {
    const [taskRows]: any = await sequelize.query(
      `SELECT * FROM backflush_task WHERE id = :id AND deduction_status IN (N'待扣减', N'部分扣减')`,
      { replacements: { id: taskId }, transaction }
    );
    if (taskRows.length === 0) {
      const { BusinessError } = await import('@/shared/errors/BusinessError');
      throw new BusinessError(400, '未找到待扣减的倒冲任务');
    }

    const task = taskRows[0];
    const remaining = (parseFloat(task.required_quantity) || 0) - (parseFloat(task.deducted_quantity) || 0);
    if (remaining <= 0) {
      await sequelize.query(
        `UPDATE backflush_task SET deduction_status = N'已完成', error_message = '', last_updated = GETDATE() WHERE id = :id`,
        { replacements: { id: taskId }, transaction }
      );
      return { success: true, message: '任务已标记为完成' };
    }

    // 使用 required_quantity 作为入库量触发全量扣减(只扣剩余量)
    const result = await executeBackflushDeduction(
      task.production_order_number,
      parseFloat(task.required_quantity),
      operator,
      transaction
    );

    return { success: result.failedCount === 0, deductedCount: result.deductedCount, failedCount: result.failedCount };
  });
};

export const getBackflushSummary = async (productionOrderNumber: string) => {
  const [summaryRows]: any = await sequelize.query(
    `SELECT deduction_status, COUNT(*) as cnt,
            SUM(required_quantity) as total_required,
            SUM(deducted_quantity) as total_deducted
     FROM backflush_task
     WHERE production_order_number = :pon
     GROUP BY deduction_status`,
    { replacements: { pon: productionOrderNumber } }
  );
  return summaryRows;
};

// ==================== 入库前倒冲就绪检查 ====================

export const checkBackflushReadiness = async (productionOrderNumber: string, inboundQty: number) => {
  const result: {
    ready: boolean;
    items: Array<{
      material_number: string;
      material_name: string;
      warehouse_number: string;
      warehouse_name: string;
      required_quantity: number;
      available_quantity: number;
      sufficient: boolean;
      message: string;
    }>;
  } = { ready: true, items: [] };

  // 查询待扣减的倒冲任务
  const [pendingTasks]: any = await sequelize.query(
    `SELECT bt.material_number, bt.material_name, bt.material_type, bt.material_unit,
            bt.bom_actual_quantity, bt.bom_base_quantity,
            bt.required_quantity, bt.deducted_quantity,
            bt.warehouse_number, bt.warehouse_name
     FROM backflush_task bt
     WHERE bt.production_order_number = :pon
       AND bt.deduction_status IN (N'待扣减', N'部分扣减')
     ORDER BY bt.step_number, bt.material_number`,
    { replacements: { pon: productionOrderNumber } }
  );

  if (pendingTasks.length === 0) {
    return result; // 无倒冲任务，直接放行
  }

  for (const task of pendingTasks) {
    const bomActualQty = parseFloat(task.bom_actual_quantity) || 0;
    const bomBaseQty = parseFloat(task.bom_base_quantity) || 1;
    const deductQty = Math.round(inboundQty * (bomActualQty / bomBaseQty) * 10000) / 10000;
    const remaining = (parseFloat(task.required_quantity) || 0) - (parseFloat(task.deducted_quantity) || 0);
    const actualDeduct = Math.min(deductQty, Math.round(remaining * 10000) / 10000);

    if (actualDeduct <= 0) continue;

    // 查询线边仓可用库存
    let availableQty = 0;
    if (task.warehouse_number) {
      const [invRows]: any = await sequelize.query(
        `SELECT ISNULL(SUM(quantity), 0) as qty FROM material_inventory
         WHERE item_number = :matNum AND warehouse_number = :whNum`,
        { replacements: { matNum: task.material_number, whNum: task.warehouse_number } }
      );
      availableQty = parseFloat(invRows[0]?.qty) || 0;
    }

    const sufficient = availableQty >= actualDeduct;
    if (!sufficient) result.ready = false;

    result.items.push({
      material_number: task.material_number,
      material_name: task.material_name || '',
      warehouse_number: task.warehouse_number || '',
      warehouse_name: task.warehouse_name || '',
      required_quantity: actualDeduct,
      available_quantity: availableQty,
      sufficient,
      message: !task.warehouse_number
        ? '扣减仓库未指定，请先设置线边仓'
        : sufficient
          ? '库存充足'
          : `库存不足（需${actualDeduct}，有${availableQty}），请先将材料移至线边仓`,
    });
  }

  return result;
};
