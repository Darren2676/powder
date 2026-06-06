/**
 * 生产单材料成本快照服务
 * 
 * 领料时将标准成本单价快照写入 production_material_cost_snapshot 表，
 * 确保历史成本不受标准成本表更新影响。
 * 
 * 场景：
 * - 领料：writeCostSnapshot source_type='领料' - 写入正数快照
 * - 补料：writeCostSnapshot source_type='补料' - 写入正数快照
 * - 退料：writeReturnSnapshot - 写入负数快照（冲减成本）
 * - 撤回领料：deleteCostSnapshot - 删除该领料单对应快照
 * - 撤回退料：deleteCostSnapshotBySource - 删除该退料单对应快照
 */

import sequelize from '@/config/database';
import dayjs from 'dayjs';

// ==================== 获取已审批标准成本单价Map ====================
export const getApprovedCostMap = async (): Promise<{
  costMap: Map<string, { standard_cost: number; cost_list_number: string; cost_list_name: string }>;
  costListNumber: string;
  costListName: string;
}> => {
  const costMap = new Map<string, { standard_cost: number; cost_list_number: string; cost_list_name: string }>();

  // 取最新已审批的标准成本单价表
  const [costHeaders]: any = await sequelize.query(`
    SELECT TOP 1 cost_list_number, cost_list_name, effective_date
    FROM standard_cost_header
    WHERE approval_status = N'已审批'
      AND effective_date <= GETDATE()
      AND (expiration_date IS NULL OR expiration_date >= GETDATE())
    ORDER BY effective_date DESC
  `);

  if (costHeaders.length === 0) {
    return { costMap, costListNumber: '', costListName: '' };
  }

  const costListNumber = costHeaders[0].cost_list_number;
  const costListName = costHeaders[0].cost_list_name || '';

  const [costDetails]: any = await sequelize.query(`
    SELECT item_number, standard_cost
    FROM standard_cost_detail
    WHERE cost_list_number = :costListNumber
      AND standard_cost > 0
  `, { replacements: { costListNumber } });

  for (const d of costDetails) {
    costMap.set(d.item_number, {
      standard_cost: parseFloat(d.standard_cost) || 0,
      cost_list_number: costListNumber,
      cost_list_name: costListName,
    });
  }

  return { costMap, costListNumber, costListName };
};

// ==================== 生成快照编号 ====================
const generateSnapshotNumber = async (factoryCode: string = '', tx?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `MCS${fc}-${today}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(snapshot_number) as max_num FROM production_material_cost_snapshot WHERE snapshot_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' }, transaction: tx }
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return prefix + String(seq).padStart(3, '0');
};

// ==================== 快照写入（领料时调用） ====================
export interface CostSnapshotItem {
  production_order_number: string;
  preparation_number: string;
  issue_number: string;
  material_number: string;
  material_name: string;
  material_type: string;
  unit: string;
  issued_quantity: number;
  step_number: number | null;
  work_center_name: string;
}

export const writeCostSnapshot = async (
  items: CostSnapshotItem[],
  issueNumber: string,
  operator: string,
  tx: any,
  sourceType: string = '领料'
): Promise<void> => {
  if (items.length === 0) return;

  // 获取当前标准成本
  const { costMap, costListNumber, costListName } = await getApprovedCostMap();

  // 生成快照编号
  const snapshotNumber = await generateSnapshotNumber(tx);

  for (const item of items) {
    const costInfo = costMap.get(item.material_number);
    const standardCost = costInfo ? costInfo.standard_cost : 0;
    const materialCost = Math.round(item.issued_quantity * standardCost * 100) / 100;
    const hasCost = costInfo ? 1 : 0;

    await sequelize.query(`
      INSERT INTO production_material_cost_snapshot (
        snapshot_number, production_order_number, preparation_number, issue_number,
        material_number, material_name, material_type, unit,
        issued_quantity, standard_cost, material_cost,
        cost_list_number, cost_list_name, has_cost,
        step_number, work_center_name,
        source_type, source_number, creation_date, creation_man
      ) VALUES (
        :snapshot_number, :production_order_number, :preparation_number, :issue_number,
        :material_number, :material_name, :material_type, :unit,
        :issued_quantity, :standard_cost, :material_cost,
        :cost_list_number, :cost_list_name, :has_cost,
        :step_number, :work_center_name,
        :source_type, :source_number, GETDATE(), :creation_man
      )
    `, {
      replacements: {
        snapshot_number: snapshotNumber,
        production_order_number: item.production_order_number,
        preparation_number: item.preparation_number,
        issue_number: item.issue_number,
        material_number: item.material_number,
        material_name: item.material_name || '',
        material_type: item.material_type || '',
        unit: item.unit || '',
        issued_quantity: item.issued_quantity,
        standard_cost: standardCost,
        material_cost: materialCost,
        cost_list_number: costInfo ? costInfo.cost_list_number : costListNumber,
        cost_list_name: costInfo ? costInfo.cost_list_name : costListName,
        has_cost: hasCost,
        step_number: item.step_number,
        work_center_name: item.work_center_name || '',
        source_type: sourceType,
        source_number: issueNumber,
        creation_man: operator,
      },
      transaction: tx,
    });
  }

  console.log(`[CostSnapshot] 写入 ${items.length} 条快照, 快照编号=${snapshotNumber}, 领料单=${issueNumber}, 成本表=${costListNumber}, source_type=${sourceType}`);
};

// ==================== 退料快照写入（退料时调用，负数冲减） ====================
export interface ReturnSnapshotItem {
  production_order_number: string;
  preparation_number: string;
  material_number: string;
  material_name: string;
  material_type: string;
  unit: string;
  return_quantity: number;        // 退料数量(正数)，函数内部转为负数
  step_number: number | null;
  work_center_name: string;
}

export const writeReturnSnapshot = async (
  items: ReturnSnapshotItem[],
  returnNumber: string,
  operator: string,
  tx: any
): Promise<void> => {
  if (items.length === 0) return;

  // 获取当前标准成本
  const { costMap, costListNumber, costListName } = await getApprovedCostMap();

  // 生成快照编号
  const snapshotNumber = await generateSnapshotNumber(tx);

  for (const item of items) {
    const costInfo = costMap.get(item.material_number);
    const standardCost = costInfo ? costInfo.standard_cost : 0;
    // 退料：数量和成本均为负数
    const issuedQuantity = -item.return_quantity;
    const materialCost = Math.round(issuedQuantity * standardCost * 100) / 100;
    const hasCost = costInfo ? 1 : 0;

    await sequelize.query(`
      INSERT INTO production_material_cost_snapshot (
        snapshot_number, production_order_number, preparation_number, issue_number,
        material_number, material_name, material_type, unit,
        issued_quantity, standard_cost, material_cost,
        cost_list_number, cost_list_name, has_cost,
        step_number, work_center_name,
        source_type, source_number, creation_date, creation_man
      ) VALUES (
        :snapshot_number, :production_order_number, :preparation_number, :issue_number,
        :material_number, :material_name, :material_type, :unit,
        :issued_quantity, :standard_cost, :material_cost,
        :cost_list_number, :cost_list_name, :has_cost,
        :step_number, :work_center_name,
        :source_type, :source_number, GETDATE(), :creation_man
      )
    `, {
      replacements: {
        snapshot_number: snapshotNumber,
        production_order_number: item.production_order_number,
        preparation_number: item.preparation_number,
        issue_number: '',  // 退料不关联领料单号
        material_number: item.material_number,
        material_name: item.material_name || '',
        material_type: item.material_type || '',
        unit: item.unit || '',
        issued_quantity: issuedQuantity,
        standard_cost: standardCost,
        material_cost: materialCost,
        cost_list_number: costInfo ? costInfo.cost_list_number : costListNumber,
        cost_list_name: costInfo ? costInfo.cost_list_name : costListName,
        has_cost: hasCost,
        step_number: item.step_number,
        work_center_name: item.work_center_name || '',
        source_type: '退料',
        source_number: returnNumber,
        creation_man: operator,
      },
      transaction: tx,
    });
  }

  console.log(`[CostSnapshot] 写入退料快照 ${items.length} 条, 快照编号=${snapshotNumber}, 退料单=${returnNumber}, 成本表=${costListNumber}`);
};

// ==================== 快照删除（领料撤回时调用） ====================
export const deleteCostSnapshot = async (issueNumber: string, tx: any): Promise<number> => {
  const [result]: any = await sequelize.query(
    `DELETE FROM production_material_cost_snapshot WHERE issue_number = :issueNumber`,
    { replacements: { issueNumber }, transaction: tx }
  );

  const deletedCount = result || 0;
  console.log(`[CostSnapshot] 删除领料单 ${issueNumber} 对应的 ${deletedCount} 条快照`);
  return deletedCount;
};

// ==================== 按source_number删除快照（退料撤回时调用） ====================
export const deleteCostSnapshotBySource = async (sourceNumber: string, tx: any): Promise<number> => {
  const [result]: any = await sequelize.query(
    `DELETE FROM production_material_cost_snapshot WHERE source_number = :sourceNumber AND source_type = N'退料'`,
    { replacements: { sourceNumber }, transaction: tx }
  );

  const deletedCount = result || 0;
  console.log(`[CostSnapshot] 删除退料单 ${sourceNumber} 对应的 ${deletedCount} 条快照`);
  return deletedCount;
};
