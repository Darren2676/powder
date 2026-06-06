import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 设计BOM展平汇总 (内部复用) ====================

async function flattenMfgBomForPurchase(bomNumber: string, parentMultiplier: number, visitedSet: Set<string>, depth: number, maxDepth: number, result: any[], path: string) {
  if (depth > maxDepth || visitedSet.has(bomNumber)) return;
  visitedSet.add(bomNumber);

  const [headers]: any = await sequelize.query(`SELECT base_quantity FROM mfg_bom_header WHERE mfg_bom_number = :bomNumber`, { replacements: { bomNumber } });
  if (!headers.length) return;
  const baseQty = parseFloat(headers[0].base_quantity) || 1;

  const [details]: any = await sequelize.query(`SELECT * FROM mfg_bom_detail WHERE mfg_bom_number = :bomNumber ORDER BY line_number`, { replacements: { bomNumber } });

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
    const currentPath = path ? `${path} > ${bomNumber}` : bomNumber;

    if (childBomNum) {
      await flattenMfgBomForPurchase(childBomNum, accumulatedQty, new Set(visitedSet), depth + 1, maxDepth, result, currentPath);
    } else {
      result.push({
        material_number: d.material_number,
        material_name: d.material_name,
        material_type: d.material_type,
        unit: d.unit,
        supply_type: d.supply_type,
        accumulated_quantity: Math.round(accumulatedQty * 10000) / 10000
      });
    }
  }
}

// ==================== 采购需求报表 ====================

export const demandReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const { mfg_bom_number, planned_quantity } = req.body;
    if (!mfg_bom_number || !planned_quantity) {
      res.status(400).json({ success: false, message: '请提供设计BOM编号和计划产量' });
      return;
    }

    // 1. 获取设计BOM基准数量
    const [headers]: any = await sequelize.query(
      `SELECT base_quantity FROM mfg_bom_header WHERE mfg_bom_number = :id`,
      { replacements: { id: mfg_bom_number } }
    );
    if (!headers.length) {
      res.status(404).json({ success: false, message: '设计BOM不存在' });
      return;
    }
    const baseQty = parseFloat(headers[0].base_quantity) || 1;

    // 2. 展平汇总到最低层原料
    const items: any[] = [];
    await flattenMfgBomForPurchase(mfg_bom_number, baseQty, new Set(), 0, 10, items, '');

    // 按物料编号分组汇总
    const grouped: Record<string, any> = {};
    for (const item of items) {
      if (grouped[item.material_number]) {
        grouped[item.material_number].accumulated_quantity = Math.round((grouped[item.material_number].accumulated_quantity + item.accumulated_quantity) * 10000) / 10000;
      } else {
        grouped[item.material_number] = { ...item };
      }
    }

    // 3. 计算需求数量
    const multiplier = parseFloat(planned_quantity) / baseQty;
    const materialList = Object.values(grouped);

    for (const mat of materialList) {
      (mat as any).needed_quantity = Math.round((mat as any).accumulated_quantity * multiplier * 10000) / 10000;
    }

    // 4. 查库存
    const matNumbers = materialList.map((m: any) => m.material_number).filter((n: string) => n);
    let inventoryMap: Record<string, { on_hand: number; safety_stock: number }> = {};
    if (matNumbers.length > 0) {
      const placeholders = matNumbers.map((_: string, i: number) => `:m${i}`).join(',');
      const matReplacements: any = {};
      matNumbers.forEach((m: string, i: number) => { matReplacements[`m${i}`] = m; });

      const [invRows]: any = await sequelize.query(
        `SELECT mi.item_number, SUM(mi.quantity) as on_hand, MAX(mi.quantity) as stock FROM material_inventory mi WHERE mi.item_number IN (${placeholders}) GROUP BY mi.item_number`,
        { replacements: { ...matReplacements } }
      );
      for (const row of invRows) {
        inventoryMap[row.item_number] = {
          on_hand: parseFloat(row.on_hand) || 0,
          safety_stock: parseFloat(row.safety_stock) || 0
        };
      }
    }

    // 5. 计算短缺
    const reportItems = materialList.map((mat: any) => {
      const inv = inventoryMap[mat.material_number] || { on_hand: 0, safety_stock: 0 };
      const shortage = Math.max(0, Math.round((mat.needed_quantity - inv.on_hand) * 10000) / 10000);
      return {
        material_number: mat.material_number,
        material_name: mat.material_name,
        material_type: mat.material_type,
        unit: mat.unit,
        supply_type: mat.supply_type,
        accumulated_quantity: mat.accumulated_quantity,
        needed_quantity: mat.needed_quantity,
        on_hand: inv.on_hand,
        safety_stock: inv.safety_stock,
        shortage
      };
    });

    res.json(success({
      mfg_bom_number,
      planned_quantity: parseFloat(planned_quantity),
      base_quantity: baseQty,
      items: reportItems.sort((a: any, b: any) => a.material_number.localeCompare(b.material_number))
    }, '采购需求报表计算成功'));
  } catch (err) { next(err); }
};

// ==================== 一键生成采购申请单 ====================

export const generatePurchaseReq = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const { mfg_bom_number, items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, message: '请提供需要采购的物料明细' });
      return;
    }

    // 生成采购申请编号
    const today = new Date();
    const dateStr = today.getFullYear() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0');
    const prPrefix = `PR-${dateStr}-`;

    const [prRows]: any = await sequelize.query(
      `SELECT MAX(purchase_req_number) as max_num FROM purchase_req WHERE purchase_req_number LIKE :prefix${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`,
      { replacements: { prefix: prPrefix + '%', ...(_factoryId !== null ? { _factoryId } : {}) } }
    );

    let prSeq = 1;
    if (prRows[0].max_num) {
      const lastSeq = parseInt(prRows[0].max_num.slice(-3));
      if (!isNaN(lastSeq)) prSeq = lastSeq + 1;
    }
    const purchase_req_number = prPrefix + String(prSeq).padStart(3, '0');

    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO purchase_req (purchase_req_number, request_date, request_department, requester, request_reason,
          source_number, approval_status, order_status, [condition], remark, factory_id, creation_date, creation_man)
        VALUES (:purchase_req_number, GETDATE(), '', :requester, N'BOM采购需求',
          :source_number, N'草稿', N'未执行', N'启用', :remark, :factory_id, :creation_date, :creation_man)
      `, {
        replacements: {
          purchase_req_number,
          requester: creation_man,
          source_number: mfg_bom_number || '',
          remark: `来源设计BOM: ${mfg_bom_number || ''}`,
          factory_id: _factoryId,
          creation_date,
          creation_man
        },
        transaction
      });

      for (let i = 0; i < items.length; i++) {
        const d = items[i];
        await sequelize.query(`
          INSERT INTO purchase_req_detail (purchase_req_number, line_number, item_number, item_name, specifications,
            basic_unit, request_quantity, ordered_quantity, expected_date, suggested_supplier_number, suggested_supplier_name, status, remark)
          VALUES (:purchase_req_number, :line_number, :item_number, :item_name, '',
            :basic_unit, :request_quantity, 0, NULL, '', '', N'未执行', '')
        `, {
          replacements: {
            purchase_req_number,
            line_number: (i + 1) * 10,
            item_number: d.material_number || '',
            item_name: d.material_name || '',
            basic_unit: d.unit || '',
            request_quantity: d.purchase_quantity || d.shortage || 0
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ purchase_req_number }, '采购申请单生成成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};
