/**
 * 模具级MRP重算差异对比服务
 * 仅处理预成型件（半成品）的差异对比与智能更新
 * 其他子项（备料单、工序任务）保持原有流程不变
 */
import sequelize from '@/config/database';
import { generateOrderNumber } from '@/services/documentNumber.service';
import { createLogger } from '@/config/logger';

const log = createLogger('mouldMRP');

/**
 * 根据产品编号和模具编号查询模具专属BOM
 */
const findMouldBOM = async (itemNumber: string, mouldNumber: string): Promise<any | null> => {
  log.debug({ itemNumber, mouldNumber }, '查询模具BOM');
  const [rows]: any = await sequelize.query(
    `SELECT m.mfg_bom_number, h.mfg_bom_name, h.base_quantity
     FROM mfg_bom_mould_mapping m
     INNER JOIN mfg_bom_header h ON m.mfg_bom_number = h.mfg_bom_number
     WHERE m.item_number = :itemNumber AND m.mould_number = :mouldNumber`,
    { replacements: { itemNumber, mouldNumber } }
  );
  log.debug({ result: rows.length > 0 ? rows[0] : null }, '模具BOM查询结果');
  return rows.length > 0 ? rows[0] : null;
};

/**
 * 递归展平制造BOM（mfg_bom_header / mfg_bom_detail）
 */
async function flattenMfgBomRecursive(
  mfgBomNumber: string, parentMultiplier: number, visitedSet: Set<string>,
  depth: number, maxDepth: number, result: any[], path: string
) {
  if (depth > maxDepth || visitedSet.has(mfgBomNumber)) return;
  visitedSet.add(mfgBomNumber);

  const [headers]: any = await sequelize.query(
    `SELECT base_quantity FROM mfg_bom_header WHERE mfg_bom_number = :mfgBomNumber`,
    { replacements: { mfgBomNumber } }
  );
  if (!headers.length) return;
  const baseQty = parseFloat(headers[0].base_quantity) || 1;

  const [details]: any = await sequelize.query(
    `SELECT * FROM mfg_bom_detail WHERE mfg_bom_number = :mfgBomNumber ORDER BY line_number`,
    { replacements: { mfgBomNumber } }
  );

  const materialNumbers = details.map((d: any) => d.material_number).filter((m: string) => m);
  let bomMap: Record<string, string> = {};
  if (materialNumbers.length > 0) {
    const placeholders = materialNumbers.map((_: string, i: number) => `:m${i}`).join(',');
    const matReplacements: any = {};
    materialNumbers.forEach((m: string, i: number) => { matReplacements[`m${i}`] = m; });
    const [bomRows]: any = await sequelize.query(
      `SELECT item_number, mfg_bom_number FROM mfg_bom_header WHERE item_number IN (${placeholders}) AND [condition] = N'启用'`,
      { replacements: matReplacements }
    );
    for (const row of bomRows) {
      if (!bomMap[row.item_number]) bomMap[row.item_number] = row.mfg_bom_number;
    }
  }

  for (const d of details) {
    const childBomNum = d.child_mfg_bom_number || bomMap[d.material_number] || null;
    const actualQty = parseFloat(d.actual_quantity) || 0;
    const accumulatedQty = parentMultiplier * (actualQty / baseQty);
    const currentPath = path ? `${path} > ${mfgBomNumber}` : mfgBomNumber;

    if (childBomNum) {
      await flattenMfgBomRecursive(childBomNum, accumulatedQty, new Set(visitedSet), depth + 1, maxDepth, result, currentPath);
    } else {
      result.push({
        material_number: d.material_number,
        material_name: d.material_name,
        material_type: d.material_type,
        unit: d.unit,
        accumulated_quantity: Math.round(accumulatedQty * 10000) / 10000,
        bom_path: currentPath,
        level: depth,
        is_leaf: true,
        step_number: d.step_number || null
      });
    }
  }
}

/**
 * 展平制造BOM获取所有物料
 */
const flattenMouldBom = async (mfgBomNumber: string): Promise<any[]> => {
  const result: any[] = [];
  await flattenMfgBomRecursive(mfgBomNumber, 1, new Set(), 0, 10, result, '');
  return result;
};

/**
 * 差异对比算法：对比标准BOM和模具BOM中的预成型件
 */
const compareSemiProductOrders = async (
  parentOrder: any,
  mouldBomFlatten: any[],
  standardBomFlatten: any[],
  existingSemiOrders: any[]
): Promise<any[]> => {
  const results: any[] = [];
  const mouldSemiMap = new Map<string, number>();
  const mouldSemiNameMap = new Map<string, string>();
  const mouldSemiUnitMap = new Map<string, string>();
  for (const item of mouldBomFlatten) {
    if (item.material_type === '半成品') {
      const netReq = Math.round(parentOrder.planned_quantity * item.accumulated_quantity * 10000) / 10000;
      if (netReq > 0) {
        mouldSemiMap.set(item.material_number, netReq);
        mouldSemiNameMap.set(item.material_number, item.material_name || '');
        mouldSemiUnitMap.set(item.material_number, item.unit || '');
      }
    }
  }
  const standardSemiMap = new Map<string, number>();
  for (const item of standardBomFlatten) {
    if (item.material_type === '半成品') {
      const netReq = Math.round(parentOrder.planned_quantity * item.accumulated_quantity * 10000) / 10000;
      if (netReq > 0) {
        standardSemiMap.set(item.material_number, netReq);
      }
    }
  }
  const existingMap = new Map<string, any>();
  for (const order of existingSemiOrders) {
    existingMap.set(order.item_number, order);
  }
  for (const [matNum, newQty] of mouldSemiMap) {
    const existing = existingMap.get(matNum);
    if (!existing) {
      results.push({
        material_number: matNum,
        material_name: mouldSemiNameMap.get(matNum) || '',
        diff_type: 'new_added',
        old_quantity: 0,
        new_quantity: newQty,
        old_order_number: null,
        unit: mouldSemiUnitMap.get(matNum) || ''
      });
    } else if (Math.abs(existing.planned_quantity - newQty) > 0.0001) {
      results.push({
        material_number: matNum,
        material_name: existing.item_name || mouldSemiNameMap.get(matNum) || '',
        diff_type: 'quantity_changed',
        old_quantity: existing.planned_quantity,
        new_quantity: newQty,
        old_order_number: existing.production_order_number,
        unit: existing.basic_unit || mouldSemiUnitMap.get(matNum) || ''
      });
    } else {
      results.push({
        material_number: matNum,
        material_name: existing.item_name || mouldSemiNameMap.get(matNum) || '',
        diff_type: 'unchanged',
        old_quantity: existing.planned_quantity,
        new_quantity: newQty,
        old_order_number: existing.production_order_number,
        unit: existing.basic_unit || mouldSemiUnitMap.get(matNum) || ''
      });
    }
  }
  for (const [matNum, existing] of existingMap) {
    if (!mouldSemiMap.has(matNum)) {
      const isReplaced = standardSemiMap.has(matNum) && mouldSemiMap.size > 0 && [...mouldSemiMap.keys()].some(k => !existingMap.has(k));
      results.push({
        material_number: matNum,
        material_name: existing.item_name,
        diff_type: isReplaced ? 'material_changed' : 'removed',
        old_quantity: existing.planned_quantity,
        new_quantity: 0,
        old_order_number: existing.production_order_number,
        new_material: isReplaced ? [...mouldSemiMap.keys()].find(k => !existingMap.has(k)) || null : null,
        unit: existing.basic_unit
      });
    }
  }
  return results;
};

/**
 * 预览模具级MRP差异（只读，不写入数据库）
 */
export const previewMouldMRPComparison = async (params: {
  itemNumber: string;
  mouldNumber: string;
  parentOrder: any;
}): Promise<{
  mouldBomNumber: string | null;
  standardBomNumber: string | null;
  comparison: any[];
  summary: any;
}> => {
  const { itemNumber, mouldNumber, parentOrder } = params;
  log.info({ itemNumber, mouldNumber, parentOrder: parentOrder.production_order_number }, '预览模具MRP差异');
  const mouldBom = await findMouldBOM(itemNumber, mouldNumber);
  if (!mouldBom) {
    log.info({ itemNumber, mouldNumber }, '未找到模具BOM映射');
    return { mouldBomNumber: null, standardBomNumber: null, comparison: [], summary: { total: 0, unchanged: 0, quantity_changed: 0, new_added: 0, removed: 0, material_changed: 0 } };
  }
  const [standardBomRows]: any = await sequelize.query(
    `SELECT mfg_bom_number FROM mfg_bom_header WHERE item_number = :itemNumber AND (mould_number IS NULL OR mould_number = '')`,
    { replacements: { itemNumber } }
  );
  const standardBomNumber = standardBomRows.length > 0 ? standardBomRows[0].mfg_bom_number : null;
  log.info({ mouldBomNumber: mouldBom.mfg_bom_number, standardBomNumber }, 'BOM对比');
  if (!standardBomNumber) {
    log.info({ itemNumber }, '未找到标准BOM');
    return { mouldBomNumber: mouldBom.mfg_bom_number, standardBomNumber: null, comparison: [], summary: { total: 0, unchanged: 0, quantity_changed: 0, new_added: 0, removed: 0, material_changed: 0 } };
  }
  const standardBomFlatten = await flattenMouldBom(standardBomNumber);
  const mouldBomFlatten = await flattenMouldBom(mouldBom.mfg_bom_number);
  const [existingSemiOrders]: any = await sequelize.query(
    `SELECT production_order_number, item_number, item_name, planned_quantity, basic_unit, plan_status, approval_status
     FROM production_order
     WHERE production_number = :prodNum
       AND is_semi_product = 1
       AND plan_status IN (N'未开始', N'已派发')
       AND (parent_production_order_number = :orderNo OR parent_production_order_number IS NULL)`,
    { replacements: { prodNum: parentOrder.production_number, orderNo: parentOrder.production_order_number } }
  );
  const comparison = await compareSemiProductOrders(parentOrder, mouldBomFlatten, standardBomFlatten, existingSemiOrders);
  const summary = {
    total: comparison.length,
    unchanged: comparison.filter((c: any) => c.diff_type === 'unchanged').length,
    quantity_changed: comparison.filter((c: any) => c.diff_type === 'quantity_changed').length,
    new_added: comparison.filter((c: any) => c.diff_type === 'new_added').length,
    removed: comparison.filter((c: any) => c.diff_type === 'removed').length,
    material_changed: comparison.filter((c: any) => c.diff_type === 'material_changed').length
  };
  return { mouldBomNumber: mouldBom.mfg_bom_number, standardBomNumber, comparison, summary };
};

/**
 * 应用模具级MRP差异（在事务内执行）
 */
export const applyMouldMRPComparison = async (params: {
  parentOrder: any;
  comparison: any[];
  mouldNumber: string;
  username: string;
  transaction: any;
}, factoryCode: string = ''): Promise<{ updated: number; created: number; removed: number; skipped: number; details: any[] }> => {
  const { parentOrder, comparison, mouldNumber, username, transaction } = params;
  let updated = 0, created = 0, removed = 0, skipped = 0;
  const details: any[] = [];
  for (const item of comparison) {
    switch (item.diff_type) {
      case 'unchanged': {
        skipped++;
        details.push({ material_number: item.material_number, diff_type: 'unchanged', action: '保留', order_number: item.old_order_number });
        break;
      }
      case 'quantity_changed': {
        if (item.old_order_number) {
          await sequelize.query(
            `UPDATE production_order SET planned_quantity = :newQty WHERE production_order_number = :orderNo`,
            { replacements: { newQty: item.new_quantity, orderNo: item.old_order_number }, transaction }
          );
          updated++;
          details.push({ material_number: item.material_number, diff_type: 'quantity_changed', action: '更新数量', order_number: item.old_order_number, new_quantity: item.new_quantity });
        }
        break;
      }
      case 'new_added': {
        const netReq = item.new_quantity;
        if (netReq > 0) {
          const semiOrderNo = await generateOrderNumber(factoryCode, transaction);
          await sequelize.query(
            `INSERT INTO production_order (
              production_order_number, production_number, parent_production_order_number,
              item_number, item_name, specifications, basic_unit, planned_quantity,
              plan_status, approval_status, is_semi_product, source_type, source_mould_number,
              creation_date, creation_man
            ) VALUES (
              :production_order_number, :production_number, :parent_production_order_number,
              :item_number, :item_name, :specifications, :basic_unit, :planned_quantity,
              N'未开始', N'草稿', 1, N'模具MRP重算', :source_mould_number,
              GETDATE(), :creation_man
            )`,
            {
              replacements: {
                production_order_number: semiOrderNo,
                production_number: parentOrder.production_number,
                parent_production_order_number: parentOrder.production_order_number,
                item_number: item.material_number,
                item_name: item.material_name || '',
                specifications: '',
                basic_unit: item.unit || '',
                planned_quantity: netReq,
                source_mould_number: mouldNumber,
                creation_man: username
              },
              transaction
            }
          );
          created++;
          details.push({ material_number: item.material_number, diff_type: 'new_added', action: '新建', order_number: semiOrderNo, new_quantity: netReq });
        }
        break;
      }
      case 'removed': {
        if (item.old_order_number) {
          await sequelize.query(
            `UPDATE production_order SET plan_status = N'已取消', remark = CONCAT(ISNULL(remark, ''), ' [模具MRP重算取消]') WHERE production_order_number = :orderNo`,
            { replacements: { orderNo: item.old_order_number }, transaction }
          );
          removed++;
          details.push({ material_number: item.material_number, diff_type: 'removed', action: '取消', order_number: item.old_order_number });
        }
        break;
      }
      case 'material_changed': {
        if (item.old_order_number && item.new_material) {
          const [newMatRows]: any = await sequelize.query(
            `SELECT item_name, basic_unit FROM item_master WHERE item_number = :matNum`,
            { replacements: { matNum: item.new_material }, transaction }
          );
          const newMatName = newMatRows.length > 0 ? newMatRows[0].item_name : item.new_material;
          const newMatUnit = newMatRows.length > 0 ? newMatRows[0].basic_unit : item.unit;
          await sequelize.query(
            `UPDATE production_order SET item_number = :newMat, item_name = :newName, basic_unit = :newUnit, planned_quantity = :newQty WHERE production_order_number = :orderNo`,
            { replacements: { newMat: item.new_material, newName: newMatName, newUnit: newMatUnit, newQty: item.new_quantity || item.old_quantity, orderNo: item.old_order_number }, transaction }
          );
          updated++;
          details.push({ material_number: item.material_number, diff_type: 'material_changed', action: '更新物料', order_number: item.old_order_number, new_material: item.new_material });
        }
        break;
      }
    }
  }
  return { updated, created, removed, skipped, details };
};
