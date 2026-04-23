/**
 * 线边物流服务 - 线边库存事务记录
 * 从 wipReport.controller 抽取
 */
import sequelize from '@/config/database'
import { generateLinesideTxnNumber } from './documentNumber.service'

// ==================== 线边物流记录 ====================

export const logLinesideMovement = async (params: {
  transactionType: string;   // '入线边' / '出线边'
  sourceType: string;        // '领料入线' / '报工转出' / '报工转入' / '成品入库'
  sourceNumber: string;
  productionOrderNumber: string;
  itemNumber: string;
  itemName: string;
  specifications: string;
  basicUnit: string;
  stepNumber: number;
  workCenterNumber: string;
  workCenterName: string;
  quantity: number;
  direction: string;         // 'IN' / 'OUT'
  operator: string;
  remark?: string;
}, transaction?: any): Promise<void> => {
  if (params.quantity <= 0) return;

  const txnNumber = await generateLinesideTxnNumber(transaction);

  await sequelize.query(`
    INSERT INTO lineside_inventory_transaction
      (transaction_number, transaction_type, source_type, source_number,
       production_order_number, item_number, item_name, specifications, basic_unit,
       step_number, work_center_number, work_center_name,
       quantity, direction, operator, remark, operation_date, creation_date)
    VALUES
      (:txn, :txnType, :srcType, :srcNum,
       :orderNo, :itemNum, :itemName, :specs, :unit,
       :step, :wcNum, :wcName,
       :qty, :dir, :op, :remark, GETDATE(), GETDATE())
  `, {
    replacements: {
      txn: txnNumber,
      txnType: params.transactionType,
      srcType: params.sourceType,
      srcNum: params.sourceNumber,
      orderNo: params.productionOrderNumber,
      itemNum: params.itemNumber,
      itemName: params.itemName,
      specs: params.specifications,
      unit: params.basicUnit,
      step: params.stepNumber,
      wcNum: params.workCenterNumber,
      wcName: params.workCenterName,
      qty: params.quantity,
      dir: params.direction,
      op: params.operator,
      remark: params.remark || ''
    },
    ...(transaction ? { transaction } : {})
  });
};

// ==================== 报工线边物流记录 ====================

export const logWorkReportLinesideMovement = async (
  processTaskNumber: string,
  qualifiedQty: number,
  workReportNumber: string,
  operator: string,
  transaction?: any
): Promise<void> => {
  if (qualifiedQty <= 0) return;

  try {
    const [tasks]: any = await sequelize.query(
      `SELECT process_task_number, production_order_number, step_number, standard_process_name,
              item_number, item_name, specifications, basic_unit,
              work_center_number, work_center_name
       FROM process_task WHERE process_task_number = :taskNo`,
      { replacements: { taskNo: processTaskNumber }, ...(transaction ? { transaction } : {}) }
    );
    if (!tasks.length) return;
    const task = tasks[0];

    const [allSteps]: any = await sequelize.query(
      `SELECT process_task_number, step_number, work_center_number, work_center_name
       FROM process_task
       WHERE production_order_number = :orderNo
       ORDER BY step_number ASC`,
      { replacements: { orderNo: task.production_order_number }, ...(transaction ? { transaction } : {}) }
    );
    if (!allSteps.length) return;

    const currentIdx = allSteps.findIndex((s: any) => s.process_task_number === processTaskNumber);
    if (currentIdx < 0) return;

    const baseParams = {
      sourceNumber: workReportNumber,
      productionOrderNumber: task.production_order_number,
      itemNumber: task.item_number || '',
      itemName: task.item_name || '',
      specifications: task.specifications || '',
      basicUnit: task.basic_unit || '',
      operator
    };

    // 当前工序 OUT
    await logLinesideMovement({
      ...baseParams,
      transactionType: '出线边',
      sourceType: '报工转出',
      stepNumber: task.step_number,
      workCenterNumber: task.work_center_number || '',
      workCenterName: task.work_center_name || '',
      quantity: qualifiedQty,
      direction: 'OUT',
      remark: `工序${task.standard_process_name || task.step_number}报工转出`
    }, transaction);

    // 如果存在下道工序，记录 IN
    if (currentIdx < allSteps.length - 1) {
      const nextStep = allSteps[currentIdx + 1];
      await logLinesideMovement({
        ...baseParams,
        transactionType: '入线边',
        sourceType: '报工转入',
        stepNumber: nextStep.step_number,
        workCenterNumber: nextStep.work_center_number || '',
        workCenterName: nextStep.work_center_name || '',
        quantity: qualifiedQty,
        direction: 'IN',
        remark: `从工序${task.standard_process_name || task.step_number}转入`
      }, transaction);
    }
  } catch (err) {
    console.error('[WIP] logWorkReportLinesideMovement error:', err);
  }
};

// ==================== 报工反审线边物流冲销 ====================

export const logWorkReportReverseLinesideMovement = async (
  processTaskNumber: string,
  qualifiedQty: number,
  workReportNumber: string,
  operator: string,
  transaction?: any
): Promise<void> => {
  if (qualifiedQty <= 0) return;

  try {
    const [tasks]: any = await sequelize.query(
      `SELECT process_task_number, production_order_number, step_number, standard_process_name,
              item_number, item_name, specifications, basic_unit,
              work_center_number, work_center_name
       FROM process_task WHERE process_task_number = :taskNo`,
      { replacements: { taskNo: processTaskNumber }, ...(transaction ? { transaction } : {}) }
    );
    if (!tasks.length) return;
    const task = tasks[0];

    const [allSteps]: any = await sequelize.query(
      `SELECT process_task_number, step_number, work_center_number, work_center_name
       FROM process_task
       WHERE production_order_number = :orderNo
       ORDER BY step_number ASC`,
      { replacements: { orderNo: task.production_order_number }, ...(transaction ? { transaction } : {}) }
    );
    if (!allSteps.length) return;

    const currentIdx = allSteps.findIndex((s: any) => s.process_task_number === processTaskNumber);
    if (currentIdx < 0) return;

    const baseParams = {
      sourceNumber: workReportNumber,
      productionOrderNumber: task.production_order_number,
      itemNumber: task.item_number || '',
      itemName: task.item_name || '',
      specifications: task.specifications || '',
      basicUnit: task.basic_unit || '',
      operator
    };

    // 反向：当前工序 IN（冲销之前的 OUT）
    await logLinesideMovement({
      ...baseParams,
      transactionType: '入线边',
      sourceType: '报工转出',
      stepNumber: task.step_number,
      workCenterNumber: task.work_center_number || '',
      workCenterName: task.work_center_name || '',
      quantity: qualifiedQty,
      direction: 'IN',
      remark: `冲销：工序${task.standard_process_name || task.step_number}报工回退`
    }, transaction);

    // 反向：下道工序 OUT（冲销之前的 IN）
    if (currentIdx < allSteps.length - 1) {
      const nextStep = allSteps[currentIdx + 1];
      await logLinesideMovement({
        ...baseParams,
        transactionType: '出线边',
        sourceType: '报工转入',
        stepNumber: nextStep.step_number,
        workCenterNumber: nextStep.work_center_number || '',
        workCenterName: nextStep.work_center_name || '',
        quantity: qualifiedQty,
        direction: 'OUT',
        remark: `冲销：从工序${task.standard_process_name || task.step_number}回退`
      }, transaction);
    }
  } catch (err) {
    console.error('[WIP] logWorkReportReverseLinesideMovement error:', err);
  }
};
