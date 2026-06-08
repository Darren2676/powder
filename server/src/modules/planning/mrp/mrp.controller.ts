import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 编号生成 ====================

const generateMrpRunNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = new Date();
  const fc = factoryCode ? factoryCode.toUpperCase() : '';
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `MRP${fc}-${dateStr}-`;

  const opts: any = { replacements: { prefix: prefix + '%' } };
  if (transaction) opts.transaction = transaction;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(mrp_run_number) as max_num FROM mrp_run WHERE mrp_run_number LIKE :prefix`, opts
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

const generateOrderNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = new Date();
  const fc = factoryCode ? factoryCode.toUpperCase() : '';
  const prefix = 'P' + fc + today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');

  const opts: any = { replacements: { prefix: prefix + '%' } };
  if (transaction) opts.transaction = transaction;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(production_order_number) as max_num FROM production_order WHERE production_order_number LIKE :prefix`, opts
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

const generatePurchaseReqNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = new Date();
  const fc = factoryCode ? factoryCode.toUpperCase() : '';
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `PR${fc}-${dateStr}-`;

  const opts: any = { replacements: { prefix: prefix + '%' } };
  if (transaction) opts.transaction = transaction;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(purchase_req_number) as max_num FROM purchase_req WHERE purchase_req_number LIKE :prefix`, opts
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 辅助: 参数化IN查询 ====================

function buildInClause(items: string[], paramPrefix: string): { placeholders: string; replacements: Record<string, string> } {
  const replacements: Record<string, string> = {};
  const placeholders = items.map((v, i) => {
    const key = `${paramPrefix}${i}`;
    replacements[key] = v;
    return `:${key}`;
  }).join(', ');
  return { placeholders, replacements };
}

// ==================== 1. 获取可MRP的生产计划 ====================

export const getPlansForMrp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    const start_date = (req.query.start_date as string) || '';
    const end_date = (req.query.end_date as string) || '';

    const conditions: string[] = [`pp.approval_status = N'已审批'`, `pp.plan_status = N'待加入任务'`, `pp.mrp_status IS NULL`];
    const replacements: any = {};
    const _factoryId = getFactoryId(req);
    // 前端传 factory_id（HQ全量模式优先使用查询参数）
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      conditions.push(`pp.factory_id = :_factoryId`);
      replacements._factoryId = effectiveFactoryId;
    }

    if (search) {
      conditions.push(`(pp.production_number LIKE :search OR pp.item_number LIKE :search OR pp.item_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (start_date) {
      conditions.push(`pp.planned_completion_time >= :start_date`);
      replacements.start_date = start_date;
    }
    if (end_date) {
      conditions.push(`pp.planned_completion_time <= :end_date`);
      replacements.end_date = end_date;
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const [items]: any = await sequelize.query(`
      SELECT pp.production_number, pp.item_number, pp.item_name, pp.basic_unit, pp.specifications,
             pp.product_drawing_number, pp.rubber_compound_number, pp.batch_production_quota,
             pp.planned_quantity, pp.shifts_number, pp.planned_completion_time, pp.plan_status,
             pp.source_order_number, pp.remark,
             ISNULL(f.factory_short, f.factory_name) as factory_short, pp.factory_id
      FROM Production_plan pp
      LEFT JOIN factory f ON pp.factory_id = f.id
      ${whereClause}
      ORDER BY pp.planned_completion_time ASC, pp.production_number DESC
    `, { replacements });

    res.json(success(items, '获取可MRP计划列表成功'));
  } catch (err) { next(err); }
};

// ==================== 2. 运行MRP计算 (核心引擎) ====================

export const runMRP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const b = req.body;
    if (!b.production_numbers || !Array.isArray(b.production_numbers) || b.production_numbers.length === 0) {
      res.status(400).json({ success: false, message: '请选择至少一条生产计划' });
      return;
    }

    const production_numbers = b.production_numbers;

    const transaction = await sequelize.transaction();
    try {
      const factoryCode = await getFactoryCode(req);
      // 1. 查询选中的生产计划
      const { placeholders: planPH, replacements: planRepl } = buildInClause(production_numbers, 'pn');
      const _factoryId = getFactoryId(req);
      const factoryCondition = _factoryId !== null ? 'AND factory_id = :_factoryId' : '';
      const planReplacements: any = { ...planRepl };
      if (_factoryId !== null) planReplacements._factoryId = _factoryId;
      const [plans]: any = await sequelize.query(`
        SELECT production_number, item_number, item_name, basic_unit, specifications,
               product_drawing_number, planned_quantity, planned_completion_time
        FROM Production_plan
        WHERE production_number IN (${planPH}) AND approval_status = N'已审批' ${factoryCondition}
      `, { replacements: planReplacements, transaction });

      if (plans.length === 0) {
        await transaction.rollback();
        res.status(400).json({ success: false, message: '未找到已审批的生产计划' });
        return;
      }

      // 2. 生成MRP运行编号
      const mrp_run_number = await generateMrpRunNumber(factoryCode, transaction);
      const now = new Date();
      const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const creation_man = (req as any).user?.username || '';

      // 3. 创建 mrp_run 头记录
      await sequelize.query(`
        INSERT INTO mrp_run (mrp_run_number, run_date, run_by, run_status, plan_count, remark, creation_date, creation_man, factory_id)
        VALUES (:mrp_run_number, GETDATE(), :run_by, N'已计算', :plan_count, '', :creation_date, :creation_man, :factory_id)
      `, {
        replacements: { mrp_run_number, run_by: creation_man, plan_count: plans.length, creation_date, creation_man, factory_id: req.body.factory_id || _factoryId },
        transaction
      });

      // 4. 创建 mrp_run_plan 关联记录
      for (const plan of plans) {
        await sequelize.query(`
          INSERT INTO mrp_run_plan (mrp_run_number, production_number, item_number, item_name, planned_quantity, planned_completion_time, factory_id)
          VALUES (:mrp_run_number, :production_number, :item_number, :item_name, :planned_quantity, :planned_completion_time, :factory_id)
        `, {
          replacements: {
            mrp_run_number,
            production_number: plan.production_number,
            item_number: plan.item_number,
            item_name: plan.item_name || '',
            planned_quantity: plan.planned_quantity,
            planned_completion_time: plan.planned_completion_time || null,
            factory_id: req.body.factory_id || _factoryId
          },
          transaction
        });
      }

      // 5. BOM逐层分解 (广度优先)
      interface QueueItem {
        item_number: string;
        item_name: string;
        specifications: string;
        basic_unit: string;
        quantity: number;
        due_date: string | null;
        level: number;
        source_plan: string;
        parent_item: string | null;
        bom_path: string;
      }

      let queue: QueueItem[] = plans.map((p: any) => ({
        item_number: p.item_number,
        item_name: p.item_name || '',
        specifications: p.specifications || '',
        basic_unit: p.basic_unit || '',
        quantity: parseFloat(p.planned_quantity) || 0,
        due_date: p.planned_completion_time ? new Date(p.planned_completion_time).toISOString().split('T')[0] : null,
        level: 0,
        source_plan: p.production_number,
        parent_item: null,
        bom_path: p.production_number
      }));

      const allResults: any[] = [];
      const maxDepth = 10;

      while (queue.length > 0) {
        // 取当前最小level的所有条目
        const minLevel = Math.min(...queue.map(q => q.level));
        if (minLevel > maxDepth) break;

        const batch = queue.filter(q => q.level === minLevel);
        queue = queue.filter(q => q.level !== minLevel);

        // Level 0: 成品写入 mrp_run_detail 并展开BOM子件
        if (minLevel === 0) {
          const itemNumbers = [...new Set(batch.map(b => b.item_number))];
          if (itemNumbers.length === 0) continue;

          const { placeholders: itemPH, replacements: itemRepl } = buildInClause(itemNumbers, 'bom');
          const [bomHeaders]: any = await sequelize.query(`
            SELECT bom_number, item_number, base_quantity
            FROM bom_header
            WHERE item_number IN (${itemPH}) AND [condition] = N'启用' AND approval_status = N'已审批'
          `, { replacements: itemRepl, transaction });

          const bomMap: Record<string, { bom_number: string; base_quantity: number }> = {};
          for (const bh of bomHeaders) {
            if (!bomMap[bh.item_number]) {
              bomMap[bh.item_number] = { bom_number: bh.bom_number, base_quantity: parseFloat(bh.base_quantity) || 1 };
            }
          }

          // 查询item_master获取成品物料信息（含 item_type / business_scope）
          const { placeholders: imPH, replacements: imRepl } = buildInClause(itemNumbers, 'im');
          const [imRows]: any = await sequelize.query(
            `SELECT item_number, lead_time_days, item_type, business_scope, item_name, specifications, basic_unit FROM item_master WHERE item_number IN (${imPH})`,
            { replacements: imRepl, transaction }
          );
          const itemMasterMap: Record<string, any> = {};
          for (const r of imRows) { itemMasterMap[r.item_number] = r; }

          for (const entry of batch) {
            const bom = bomMap[entry.item_number];
            const imInfo = itemMasterMap[entry.item_number] || {};
            const leadTime = parseInt(imInfo.lead_time_days) || 0;
            const startDate = entry.due_date ? subtractDays(entry.due_date, leadTime) : null;
            const plannedQty = Math.round(entry.quantity * 10000) / 10000;

            // 将成品写入 mrp_run_detail，确保即使子件库存充足也能生成生产单
            await sequelize.query(`
              INSERT INTO mrp_run_detail (
                mrp_run_number, source_production_number, bom_level, parent_item_number,
                item_number, item_name, specifications, basic_unit, item_type, business_scope, mfg_bom_number,
                gross_requirement, on_hand_inventory, wip_quantity, in_transit_po, pending_pr, safety_stock,
                net_requirement, planned_start_date, planned_due_date, lead_time_days,
                action_type, result_status, produce_quantity, purchase_quantity, bom_path, factory_id
              ) VALUES (
                :mrp_run_number, :source_production_number, 0, NULL,
                :item_number, :item_name, :specifications, :basic_unit, :item_type, :business_scope, :mfg_bom_number,
                :gross_requirement, 0, 0, 0, 0, 0,
                :net_requirement, :planned_start_date, :planned_due_date, :lead_time_days,
                N'生产', N'待确认', :net_requirement, 0, :bom_path, :factory_id
              )
            `, {
              replacements: {
                mrp_run_number,
                source_production_number: entry.source_plan,
                item_number: entry.item_number,
                item_name: imInfo.item_name || entry.item_name || '',
                specifications: imInfo.specifications || entry.specifications || '',
                basic_unit: imInfo.basic_unit || entry.basic_unit || '',
                item_type: imInfo.item_type || '',
                business_scope: imInfo.business_scope || '',
                mfg_bom_number: bom?.bom_number || null,
                gross_requirement: plannedQty,
                net_requirement: plannedQty,
                planned_start_date: startDate,
                planned_due_date: entry.due_date,
                lead_time_days: leadTime,
                bom_path: (entry.bom_path || '').substring(0, 500),
                factory_id: req.body.factory_id || _factoryId
              },
              transaction
            });

            allResults.push({ item_number: entry.item_number, action_type: '生产', net_requirement: plannedQty });

            if (!bom) continue; // 成品无BOM则无子件可展开

            // 查子件
            const [details]: any = await sequelize.query(
              `SELECT * FROM bom_detail WHERE bom_number = :bomNum ORDER BY line_number`,
              { replacements: { bomNum: bom.bom_number }, transaction }
            );

            for (const d of details) {
              const childQty = entry.quantity * ((parseFloat(d.actual_quantity) || 0) / bom.base_quantity);
              if (childQty <= 0) continue;

              queue.push({
                item_number: d.material_number,
                item_name: d.material_name || '',
                specifications: '',
                basic_unit: d.unit || '',
                quantity: Math.round(childQty * 10000) / 10000,
                due_date: startDate,
                level: 1,
                source_plan: entry.source_plan,
                parent_item: entry.item_number,
                bom_path: `${entry.bom_path} > ${bom.bom_number}`
              });
            }
          }
          continue;
        }

        // Level 1+: 需求归集 → 净需求计算 → 写入结果 → 展开子件
        // 需求归集: 按 item_number 合并
        const demandMap: Record<string, {
          item_number: string; item_name: string; specifications: string; basic_unit: string;
          gross: number; due_date: string | null; source_plans: Set<string>;
          parent_items: Set<string>; bom_paths: string[];
        }> = {};

        for (const entry of batch) {
          const key = entry.item_number;
          if (demandMap[key]) {
            demandMap[key].gross += entry.quantity;
            demandMap[key].source_plans.add(entry.source_plan);
            demandMap[key].parent_items.add(entry.parent_item || '');
            demandMap[key].bom_paths.push(entry.bom_path);
            // 取最早的 due_date
            if (entry.due_date && (!demandMap[key].due_date || entry.due_date < demandMap[key].due_date)) {
              demandMap[key].due_date = entry.due_date;
            }
          } else {
            demandMap[key] = {
              item_number: entry.item_number,
              item_name: entry.item_name,
              specifications: entry.specifications,
              basic_unit: entry.basic_unit,
              gross: entry.quantity,
              due_date: entry.due_date,
              source_plans: new Set([entry.source_plan]),
              parent_items: new Set([entry.parent_item || '']),
              bom_paths: [entry.bom_path]
            };
          }
        }

        const itemNumbers = Object.keys(demandMap);
        if (itemNumbers.length === 0) continue;

        // 批量查询物料主数据 (item_type, business_scope, lead_time_days, safety_stock)
        const { placeholders: imPH, replacements: imRepl } = buildInClause(itemNumbers, 'im');
        const [itemMasterRows]: any = await sequelize.query(`
          SELECT item_number, item_type, item_name, specifications, basic_unit, business_scope,
                 lead_time_days, safety_stock_enabled, safety_stock_qty
          FROM item_master WHERE item_number IN (${imPH})
        `, { replacements: imRepl, transaction });

        const itemInfoMap: Record<string, any> = {};
        for (const r of itemMasterRows) { itemInfoMap[r.item_number] = r; }

        // 批量查设计BOM
        const [bomHeaders]: any = await sequelize.query(`
          SELECT bom_number, item_number, base_quantity
          FROM bom_header
          WHERE item_number IN (${imPH}) AND [condition] = N'启用' AND approval_status = N'已审批'
        `, { replacements: imRepl, transaction });

        const bomMap: Record<string, { bom_number: string; base_quantity: number }> = {};
        for (const bh of bomHeaders) {
          if (!bomMap[bh.item_number]) {
            bomMap[bh.item_number] = { bom_number: bh.bom_number, base_quantity: parseFloat(bh.base_quantity) || 1 };
          }
        }

        // 批量查库存 (Level 1+ 统一查 material_inventory, 不查 finished_goods_inventory, 避免与MPS重复扣减)
        const invMap: Record<string, { on_hand: number; safety_stock: number }> = {};

        if (itemNumbers.length > 0) {
          const { placeholders: mwPH, replacements: mwRepl } = buildInClause(itemNumbers, 'mw');
          const [mwRows]: any = await sequelize.query(`
            SELECT item_number, SUM(quantity) AS on_hand, MAX(ISNULL(safety_stock_quantity, 0)) AS safety_stock
            FROM material_inventory WHERE item_number IN (${mwPH}) GROUP BY item_number
          `, { replacements: mwRepl, transaction });
          for (const r of mwRows) {
            invMap[r.item_number] = { on_hand: parseFloat(r.on_hand) || 0, safety_stock: parseFloat(r.safety_stock) || 0 };
          }
        }

        // 批量查在制品 (production_order)
        const wipMap: Record<string, number> = {};
        const [wipRows]: any = await sequelize.query(`
          SELECT item_number, SUM(planned_quantity) AS wip
          FROM production_order
          WHERE item_number IN (${imPH}) AND plan_status NOT IN (N'已完成', N'已关闭') AND approval_status = N'已审批'
          GROUP BY item_number
        `, { replacements: imRepl, transaction });
        for (const r of wipRows) { wipMap[r.item_number] = parseFloat(r.wip) || 0; }

        // 批量查在途采购订单
        const poMap: Record<string, number> = {};
        const [poRows]: any = await sequelize.query(`
          SELECT d.item_number, SUM(d.order_quantity - ISNULL(d.received_quantity, 0)) AS in_transit
          FROM purchase_order_detail d
          INNER JOIN purchase_order h ON h.purchase_order_number = d.purchase_order_number
          WHERE h.approval_status = N'已审批' AND d.item_number IN (${imPH})
          GROUP BY d.item_number
        `, { replacements: imRepl, transaction });
        for (const r of poRows) { poMap[r.item_number] = parseFloat(r.in_transit) || 0; }

        // 批量查待执行采购申请
        const prMap: Record<string, number> = {};
        const [prRows]: any = await sequelize.query(`
          SELECT d.item_number, SUM(d.request_quantity - ISNULL(d.ordered_quantity, 0)) AS pending
          FROM purchase_req_detail d
          INNER JOIN purchase_req h ON h.purchase_req_number = d.purchase_req_number
          WHERE h.approval_status = N'已审批' AND d.status = N'未执行' AND d.item_number IN (${imPH})
          GROUP BY d.item_number
        `, { replacements: imRepl, transaction });
        for (const r of prRows) { prMap[r.item_number] = parseFloat(r.pending) || 0; }

        // 逐物料计算净需求并写入结果
        for (const itemNum of itemNumbers) {
          const demand = demandMap[itemNum];
          const info = itemInfoMap[itemNum] || {};
          const inv = invMap[itemNum] || { on_hand: 0, safety_stock: 0 };
          const wip = wipMap[itemNum] || 0;
          const po = poMap[itemNum] || 0;
          const pr = prMap[itemNum] || 0;
          const bom = bomMap[itemNum];
          const businessScope = (info.business_scope || '') as string;
          const leadTime = parseInt(info.lead_time_days) || 0;

          // 安全库存: 优先inventory表，fallback到item_master
          let safetyStock = inv.safety_stock;
          if (safetyStock === 0 && info.safety_stock_enabled === 'Y') {
            safetyStock = parseFloat(info.safety_stock_qty) || 0;
          }

          const grossReq = Math.round(demand.gross * 10000) / 10000;
          const totalSupply = inv.on_hand + wip + po + pr;
          const netReq = Math.round(Math.max(0, grossReq - totalSupply + safetyStock) * 10000) / 10000;

          // 根据 business_scope + 有无BOM 决定 action_type
          let actionType: string;
          const hasBom = !!bom;
          const scopeArr = businessScope.split(',').map(s => s.trim()).filter(Boolean);
          const canProduce = scopeArr.includes('生产');
          const canPurchase = scopeArr.includes('采购');

          if (canProduce && canPurchase) {
            actionType = '生产+采购'; // 双源：不论是否有BOM，均标识为双源待用户决策
          } else if (canProduce && !canPurchase) {
            actionType = '生产';
          } else if (!canProduce && canPurchase) {
            actionType = '采购';
          } else {
            // 空/NULL business_scope: 按BOM判断
            actionType = hasBom ? '生产' : '采购';
          }

          const dueDate = demand.due_date;
          const startDate = dueDate ? subtractDays(dueDate, leadTime) : null;

          // 写入 mrp_run_detail
          await sequelize.query(`
            INSERT INTO mrp_run_detail (
              mrp_run_number, source_production_number, bom_level, parent_item_number,
              item_number, item_name, specifications, basic_unit, item_type, business_scope, mfg_bom_number,
              gross_requirement, on_hand_inventory, wip_quantity, in_transit_po, pending_pr, safety_stock,
              net_requirement, planned_start_date, planned_due_date, lead_time_days,
              action_type, result_status, produce_quantity, purchase_quantity, bom_path, factory_id
            ) VALUES (
              :mrp_run_number, :source_production_number, :bom_level, :parent_item_number,
              :item_number, :item_name, :specifications, :basic_unit, :item_type, :business_scope, :mfg_bom_number,
              :gross_requirement, :on_hand_inventory, :wip_quantity, :in_transit_po, :pending_pr, :safety_stock,
              :net_requirement, :planned_start_date, :planned_due_date, :lead_time_days,
              :action_type, N'待确认', :produce_quantity, :purchase_quantity, :bom_path, :factory_id
            )
          `, {
            replacements: {
              mrp_run_number,
              source_production_number: [...demand.source_plans].join(','),
              bom_level: minLevel,
              parent_item_number: [...demand.parent_items].filter(Boolean).join(',') || null,
              item_number: itemNum,
              item_name: info.item_name || demand.item_name || '',
              specifications: info.specifications || demand.specifications || '',
              basic_unit: info.basic_unit || demand.basic_unit || '',
              item_type: info.item_type || '',
              business_scope: businessScope,
              mfg_bom_number: bom?.bom_number || null,
              gross_requirement: grossReq,
              on_hand_inventory: inv.on_hand,
              wip_quantity: wip,
              in_transit_po: po,
              pending_pr: pr,
              safety_stock: safetyStock,
              net_requirement: netReq,
              planned_start_date: startDate,
              planned_due_date: dueDate,
              lead_time_days: leadTime,
              action_type: actionType,
              produce_quantity: actionType === '采购' ? 0 : netReq,
              purchase_quantity: actionType === '采购' ? netReq : 0,
              bom_path: demand.bom_paths.join(' | ').substring(0, 500),
              factory_id: req.body.factory_id || _factoryId
            },
            transaction
          });

          allResults.push({ item_number: itemNum, action_type: actionType, net_requirement: netReq });

          // 展开子件BOM (仅当 action_type 包含生产 且 有BOM 且 净需求>0)
          if (hasBom && netReq > 0 && (actionType === '生产' || actionType === '生产+采购')) {
            const [details]: any = await sequelize.query(
              `SELECT * FROM bom_detail WHERE bom_number = :bomNum ORDER BY line_number`,
              { replacements: { bomNum: bom!.bom_number }, transaction }
            );

            for (const d of details) {
              const childQty = netReq * ((parseFloat(d.actual_quantity) || 0) / bom!.base_quantity);
              if (childQty <= 0) continue;

              queue.push({
                item_number: d.material_number,
                item_name: d.material_name || '',
                specifications: '',
                basic_unit: d.unit || '',
                quantity: Math.round(childQty * 10000) / 10000,
                due_date: startDate,
                level: minLevel + 1,
                source_plan: [...demand.source_plans].join(','),
                parent_item: itemNum,
                bom_path: `${demand.bom_paths[0]} > ${bom!.bom_number}`
              });
            }
          }
        }
      }

      // 6. 更新 mrp_run 的 result_count
      await sequelize.query(
        `UPDATE mrp_run SET result_count = (SELECT COUNT(*) FROM mrp_run_detail WHERE mrp_run_number = :mrp_run_number) WHERE mrp_run_number = :mrp_run_number`,
        { replacements: { mrp_run_number }, transaction }
      );

      await transaction.commit();

      res.json(success({
        mrp_run_number,
        plan_count: plans.length,
        result_count: allResults.length,
        items_need_production: allResults.filter(r => r.action_type === '生产' || r.action_type === '生产+采购').length,
        items_need_purchase: allResults.filter(r => r.action_type === '采购' || r.action_type === '生产+采购').length,
        dual_source_count: allResults.filter(r => r.action_type === '生产+采购').length
      }, 'MRP 计算完成'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 3. MRP运行记录列表 ====================

export const getMRPRuns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const run_status = (req.query.run_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};
    const _factoryId = getFactoryId(req);
    // 前端传 factory_id（HQ全量模式优先使用查询参数）
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      conditions.push(`mr.factory_id = :_factoryId`);
      replacements._factoryId = effectiveFactoryId;
    }

    if (search) {
      conditions.push(`(mr.mrp_run_number LIKE :search OR mr.run_by LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (run_status) {
      conditions.push(`mr.run_status = :run_status`);
      replacements.run_status = run_status;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM mrp_run mr ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;
    const offset = (page - 1) * limit;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT mr.id, mr.mrp_run_number, mr.run_status, mr.plan_count,
               mr.result_count AS detail_count,
               mr.production_order_count, mr.purchase_req_count,
               mr.run_date AS created_at,
               mr.confirmed_at,
               mr.run_by AS created_by,
               mr.remark,
               ISNULL(f.factory_short, f.factory_name) as factory_short, f.factory_name, mr.factory_id,
               ROW_NUMBER() OVER (ORDER BY mr.run_date DESC) AS _row_num
        FROM mrp_run mr
        LEFT JOIN factory f ON mr.factory_id = f.id
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取MRP运行记录成功'));
  } catch (err) { next(err); }
};

// ==================== 4. MRP运行详情 ====================

export const getMRPRunDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const [headers]: any = await sequelize.query(`
      SELECT mr.*, ISNULL(f.factory_short, f.factory_name) as factory_short, f.factory_name
      FROM mrp_run mr
      LEFT JOIN factory f ON mr.factory_id = f.id
      WHERE mr.mrp_run_number = :id${_factoryId !== null ? ' AND mr.factory_id = :_factoryId' : ''}
    `, { replacements: { id, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) } }
    );
    if (!headers.length) {
      res.status(404).json({ success: false, message: 'MRP运行记录不存在' });
      return;
    }

    const [plans]: any = await sequelize.query(
      `SELECT * FROM mrp_run_plan WHERE mrp_run_number = :id ORDER BY production_number`,
      { replacements: { id } }
    );

    const [details]: any = await sequelize.query(
      `SELECT * FROM mrp_run_detail WHERE mrp_run_number = :id ORDER BY bom_level, item_number`,
      { replacements: { id } }
    );

    const summary = {
      total_items: details.length,
      items_need_production: details.filter((d: any) => d.action_type === '生产' || d.action_type === '生产+采购').length,
      items_need_purchase: details.filter((d: any) => d.action_type === '采购' || d.action_type === '生产+采购').length,
      dual_source_count: details.filter((d: any) => d.action_type === '生产+采购').length,
      items_with_net_demand: details.filter((d: any) => parseFloat(d.net_requirement) > 0).length
    };

    res.json(success({
      run: headers[0],
      plans,
      details,
      summary
    }, '获取MRP运行详情成功'));
  } catch (err) { next(err); }
};

// ==================== 5. 执行MRP (确认生成生产单+采购申请) ====================

export const executeMRP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.mrp_run_number || !b.items || !Array.isArray(b.items) || b.items.length === 0) {
      res.status(400).json({ success: false, message: '请提供MRP运行编号和确认项' });
      return;
    }

    const mrp_run_number = b.mrp_run_number;
    const items = b.items;

    // 校验MRP状态
    const _factoryId = getFactoryId(req);
    const [runCheck]: any = await sequelize.query(
      `SELECT run_status FROM mrp_run WHERE mrp_run_number = :mrp_run_number${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`,
      { replacements: { mrp_run_number, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) } }
    );
    if (!runCheck.length || runCheck[0].run_status !== '已计算') {
      res.status(400).json({ success: false, message: 'MRP运行状态不允许执行(需为"已计算"状态)' });
      return;
    }

    const transaction = await sequelize.transaction();
    const creation_man = (req as any).user?.username || '';

    try {
      const factoryCode = await getFactoryCode(req);
      let productionOrderCount = 0;
      let purchaseReqLines: any[] = [];

      // === 双源决策: 收集选择纯采购的双源父物料，其子项将被跳过 ===
      const purePurchaseParents: Set<string> = new Set();
      for (const item of items) {
        const prodQty = parseFloat(item.produce_quantity) || 0;
        const purchQty = parseFloat(item.purchase_quantity) || 0;
        if (prodQty === 0 && purchQty > 0) {
          // 查询该detail是否为双源物料
          const [dRows]: any = await sequelize.query(
            `SELECT item_number, action_type FROM mrp_run_detail WHERE id = :id AND mrp_run_number = :mrp_run_number`,
            { replacements: { id: item.id, mrp_run_number }, transaction }
          );
          if (dRows.length > 0 && dRows[0].action_type === '生产+采购') {
            purePurchaseParents.add(dRows[0].item_number);
          }
        }
      }

      for (const item of items) {
        const { id, produce_quantity, purchase_quantity } = item;

        // 查询 detail 行
        const [detailRows]: any = await sequelize.query(
          `SELECT * FROM mrp_run_detail WHERE id = :id AND mrp_run_number = :mrp_run_number`,
          { replacements: { id, mrp_run_number }, transaction }
        );
        if (!detailRows.length) continue;
        const detail = detailRows[0];

        // === 双源决策: 如果该物料的父项是纯采购的双源物料，则跳过（不生成任何订单）===
        if (purePurchaseParents.size > 0 && detail.parent_item_number) {
          const parentItems = (detail.parent_item_number as string).split(',').map((s: string) => s.trim());
          const isChildOfPurePurchase = parentItems.some((p: string) => purePurchaseParents.has(p));
          if (isChildOfPurePurchase) {
            await sequelize.query(
              `UPDATE mrp_run_detail SET result_status = N'已跳过', produce_quantity = 0, purchase_quantity = 0 WHERE id = :id`,
              { replacements: { id }, transaction }
            );
            continue;
          }
        }

        const prodQty = parseFloat(produce_quantity) || parseFloat(detail.produce_quantity) || 0;
        const purchQty = parseFloat(purchase_quantity) || parseFloat(detail.purchase_quantity) || 0;
        const netReq = parseFloat(detail.net_requirement) || 0;

        if (netReq <= 0) {
          // 无需操作，标记已跳过
          await sequelize.query(
            `UPDATE mrp_run_detail SET result_status = N'已跳过' WHERE id = :id`,
            { replacements: { id }, transaction }
          );
          continue;
        }

        const generatedNumbers: string[] = [];

        // 生成生产单
        if (prodQty > 0 && (detail.action_type === '生产' || detail.action_type === '生产+采购')) {
          const orderNum = await generateOrderNumber(factoryCode, transaction);
          await sequelize.query(`
            INSERT INTO production_order (
              production_order_number, production_number, item_number, item_name, basic_unit, specifications,
              product_drawing_number, rubber_compound_number, batch_production_quota,
              planned_quantity, planned_completion_time, plan_status, remark, approval_status, is_semi_product, factory_id
            ) VALUES (
              :production_order_number, :production_number, :item_number, :item_name, :basic_unit, :specifications,
              '', '', '',
              :planned_quantity, :planned_completion_time, N'未开始', :remark, N'草稿', :is_semi_product, :factory_id
            )
          `, {
            replacements: {
              production_order_number: orderNum,
              production_number: (detail.source_production_number || '').split(',')[0] || '',
              item_number: detail.item_number,
              item_name: detail.item_name || '',
              basic_unit: detail.basic_unit || '',
              specifications: detail.specifications || '',
              planned_quantity: prodQty,
              planned_completion_time: detail.planned_due_date || null,
              remark: `MRP自动生成 (${mrp_run_number})`,
              is_semi_product: detail.item_type === "半成品" ? 1 : 0,
              factory_id: req.body.factory_id || _factoryId
            },
            transaction
          });
          generatedNumbers.push(orderNum);
          productionOrderCount++;
        }

        // 收集采购申请明细行
        if (purchQty > 0 && (detail.action_type === '采购' || detail.action_type === '生产+采购')) {
          purchaseReqLines.push({
            detail_id: id,
            item_number: detail.item_number,
            item_name: detail.item_name || '',
            basic_unit: detail.basic_unit || '',
            quantity: purchQty,
            expected_date: detail.planned_due_date || null,
            source_production_number: detail.source_production_number || ''
          });
        }

        // 更新 detail 状态
        await sequelize.query(`
          UPDATE mrp_run_detail SET
            result_status = N'已确认',
            produce_quantity = :produce_quantity,
            purchase_quantity = :purchase_quantity,
            generated_order_number = CASE
              WHEN generated_order_number IS NOT NULL AND generated_order_number != '' THEN generated_order_number + ',' + :gen_num
              ELSE :gen_num
            END
          WHERE id = :id
        `, {
          replacements: {
            id,
            produce_quantity: prodQty,
            purchase_quantity: purchQty,
            gen_num: generatedNumbers.join(',') || ''
          },
          transaction
        });
      }

      // 批量生成采购申请
      let purchaseReqCount = 0;
      if (purchaseReqLines.length > 0) {
        const prNumber = await generatePurchaseReqNumber(factoryCode, transaction);
        const now = new Date();
        const creationDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // 提取去重的生产计划编号
        const allProdNums = new Set<string>();
        for (const line of purchaseReqLines) {
          if (line.source_production_number) {
            for (const num of line.source_production_number.split(',')) {
              const trimmed = num.trim();
              if (trimmed) allProdNums.add(trimmed);
            }
          }
        }
        const productionNumbers = [...allProdNums].join(',');

        await sequelize.query(`
          INSERT INTO purchase_req (purchase_req_number, request_date, request_department, requester, request_reason,
            source_number, production_number, approval_status, order_status, [condition], remark, creation_date, creation_man, factory_id)
          VALUES (:purchase_req_number, GETDATE(), '', :requester, N'MRP物料需求计划',
            :source_number, :production_number, N'草稿', N'未执行', N'启用', :remark, :creation_date, :creation_man, :factory_id)
        `, {
          replacements: {
            purchase_req_number: prNumber,
            requester: creation_man,
            source_number: mrp_run_number,
            production_number: productionNumbers,
            remark: 'MRP自动生成 (' + mrp_run_number + ')',
            creation_date: creationDate,
            creation_man: creation_man,
            factory_id: req.body.factory_id || _factoryId
          },
          transaction
        });

        for (let i = 0; i < purchaseReqLines.length; i++) {
          const line = purchaseReqLines[i];
          await sequelize.query(`
            INSERT INTO purchase_req_detail (purchase_req_number, line_number, item_number, item_name, specifications,
              basic_unit, request_quantity, ordered_quantity, expected_date, suggested_supplier_number, suggested_supplier_name, status, remark)
            VALUES (:purchase_req_number, :line_number, :item_number, :item_name, '',
              :basic_unit, :request_quantity, 0, :expected_date, '', '', N'未执行', '')
          `, {
            replacements: {
              purchase_req_number: prNumber,
              line_number: (i + 1) * 10,
              item_number: line.item_number,
              item_name: line.item_name,
              basic_unit: line.basic_unit,
              request_quantity: line.quantity,
              expected_date: line.expected_date
            },
            transaction
          });

          // 更新对应detail行的generated_order_number
          await sequelize.query(`
            UPDATE mrp_run_detail SET
              generated_order_number = CASE
                WHEN generated_order_number IS NOT NULL AND generated_order_number != '' THEN generated_order_number + ',' + :pr_num
                ELSE :pr_num
              END
            WHERE id = :detail_id
          `, { replacements: { pr_num: prNumber, detail_id: line.detail_id }, transaction });
        }
        purchaseReqCount = 1;
      }

      // 更新 mrp_run 状态
      await sequelize.query(`
        UPDATE mrp_run SET
          run_status = N'已确认',
          confirmed_at = GETDATE(),
          production_order_count = :po_count,
          purchase_req_count = :pr_count
        WHERE mrp_run_number = :mrp_run_number
      `, {
        replacements: { mrp_run_number, po_count: productionOrderCount, pr_count: purchaseReqCount },
        transaction
      });

      // 更新源生产计划的 mrp_status
      const mrpFactoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
      const mrpFactoryReps = _factoryId !== null ? { _factoryId } : {};
      await sequelize.query(`
        UPDATE Production_plan SET mrp_status = N'已分解'
        WHERE production_number IN (SELECT DISTINCT production_number FROM mrp_run_plan WHERE mrp_run_number = :mrp_run_number)
          AND mrp_status IS NULL${mrpFactoryCond}
      `, { replacements: { mrp_run_number, ...mrpFactoryReps }, transaction });

      // 将源计划行导入生产单管理（与"从计划导入"功能相同）
      let planImportCount = 0;
      const [sourcePlans]: any = await sequelize.query(`
        SELECT p.production_number, p.item_number, p.item_name, p.basic_unit, p.specifications,
               p.product_drawing_number, p.rubber_compound_number, p.batch_production_quota,
               p.planned_quantity, p.planned_completion_time, p.remark
        FROM Production_plan p
        INNER JOIN mrp_run_plan rp ON p.production_number = rp.production_number
        WHERE rp.mrp_run_number = :mrp_run_number
          AND p.plan_status = N'待加入任务'
          AND p.approval_status = N'已审批'
      `, { replacements: { mrp_run_number }, transaction });

      for (const plan of sourcePlans) {
        // 检查是否已存在对应的生产单（按计划编号+物料编号匹配，避免子件生产单误判）
        const [existCheck]: any = await sequelize.query(
          `SELECT production_order_number FROM production_order WHERE production_number = :pn AND item_number = :item`,
          { replacements: { pn: plan.production_number, item: plan.item_number }, transaction }
        );
        if (existCheck.length > 0) continue;

        const planOrderNum = await generateOrderNumber(factoryCode, transaction);
        await sequelize.query(`
          INSERT INTO production_order (
            production_order_number, production_number, item_number, item_name, basic_unit, specifications,
            product_drawing_number, rubber_compound_number, batch_production_quota,
            planned_quantity, equipment_number, equipment_name, mould_number,
            formed_part_specifications, formed_part_unit_consumption, actual_cavity_count, actual_hole_count, actual_daily_output,
            planned_completion_time, plan_status, remark, approval_status, factory_id
          ) VALUES (
            :production_order_number, :production_number, :item_number, :item_name, :basic_unit, :specifications,
            :product_drawing_number, :rubber_compound_number, :batch_production_quota,
            :planned_quantity, NULL, NULL, NULL,
            NULL, NULL, NULL, NULL, NULL,
            :planned_completion_time, N'未开始', :remark, N'草稿', :factory_id
          )
        `, {
          replacements: {
            production_order_number: planOrderNum,
            production_number: plan.production_number || '',
            item_number: plan.item_number || '',
            item_name: plan.item_name || '',
            basic_unit: plan.basic_unit || '',
            specifications: plan.specifications || '',
            product_drawing_number: plan.product_drawing_number || '',
            rubber_compound_number: plan.rubber_compound_number || '',
            batch_production_quota: plan.batch_production_quota || '',
            planned_quantity: plan.planned_quantity || 0,
            planned_completion_time: plan.planned_completion_time || null,
            remark: plan.remark || '',
            factory_id: req.body.factory_id || _factoryId
          },
          transaction
        });
        planImportCount++;
      }

      // 更新已导入计划的状态为"已加入任务"
      if (planImportCount > 0) {
        await sequelize.query(`
          UPDATE Production_plan SET plan_status = N'已加入任务'
          WHERE production_number IN (SELECT DISTINCT production_number FROM mrp_run_plan WHERE mrp_run_number = :mrp_run_number)
            AND plan_status = N'待加入任务'${mrpFactoryCond}
        `, { replacements: { mrp_run_number, ...mrpFactoryReps }, transaction });
      }

      await transaction.commit();

      res.json(success({
        mrp_run_number,
        production_order_count: productionOrderCount,
        purchase_req_count: purchaseReqCount,
        purchase_req_line_count: purchaseReqLines.length,
        plan_import_count: planImportCount
      }, `MRP执行完成: 生成 ${productionOrderCount} 个生产单, ${purchaseReqLines.length} 行采购申请, 导入 ${planImportCount} 条计划生产单`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 6. 取消MRP运行 ====================

export const cancelMRPRun = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const [check]: any = await sequelize.query(
      `SELECT run_status FROM mrp_run WHERE mrp_run_number = :id${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`,
      { replacements: { id, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) } }
    );
    if (!check.length) {
      res.status(404).json({ success: false, message: 'MRP运行记录不存在' });
      return;
    }
    if (check[0].run_status !== '已计算') {
      res.status(400).json({ success: false, message: '仅"已计算"状态的MRP运行可以取消' });
      return;
    }

    await sequelize.query(
      `UPDATE mrp_run SET run_status = N'已取消' WHERE mrp_run_number = :id${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`,
      { replacements: { id, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) } }
    );
    res.json(success(null, 'MRP运行已取消'));
  } catch (err) { next(err); }
};

// ==================== 7. 删除MRP运行 ====================

export const deleteMRPRun = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const [check]: any = await sequelize.query(
      `SELECT run_status FROM mrp_run WHERE mrp_run_number = :id${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`,
      { replacements: { id, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) } }
    );
    if (!check.length) {
      res.status(404).json({ success: false, message: 'MRP运行记录不存在' });
      return;
    }
    if (check[0].run_status !== '已取消') {
      res.status(400).json({ success: false, message: '仅"已取消"状态的MRP运行可以删除' });
      return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM mrp_run_detail WHERE mrp_run_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM mrp_run_plan WHERE mrp_run_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM mrp_run WHERE mrp_run_number = :id${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`, { replacements: { id, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) }, transaction });
      await transaction.commit();
      res.json(success(null, 'MRP运行记录已删除'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 辅助函数 ====================

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}
