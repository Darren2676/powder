import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { CONDITION_STATUS, ORDER_STATUS } from '@/shared/constants/statuses';

// ==================== 编号生成 ====================

const generatePurchaseReqNumber = async (): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `PR-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(purchase_req_number) as max_num FROM purchase_req WHERE purchase_req_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return prefix + String(seq).padStart(3, '0');
};

// ==================== Header CRUD ====================

export const getPurchaseReqs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const order_status = (req.query.order_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(purchase_req_number LIKE :search OR requester LIKE :search OR request_department LIKE :search OR source_number LIKE :search OR production_number LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      conditions.push(`approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }
    if (order_status) {
      conditions.push(`order_status = :order_status`);
      replacements.order_status = order_status;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM purchase_req ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT purchase_req_number, request_date, request_department, requester, request_reason,
               source_number, production_number, approval_status, order_status, [condition], remark, creation_date, creation_man,
               ROW_NUMBER() OVER (ORDER BY creation_date DESC, purchase_req_number DESC) AS _row_num
        FROM purchase_req ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取采购申请列表成功'));
  } catch (err) { next(err); }
};

export const getPurchaseReqDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(
      `SELECT * FROM purchase_req WHERE purchase_req_number = :id`, { replacements: { id } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '采购申请单不存在' }); return; }
    const [details]: any = await sequelize.query(
      `SELECT * FROM purchase_req_detail WHERE purchase_req_number = :id ORDER BY line_number`, { replacements: { id } }
    );
    res.json(success({ header: headers[0], details }, '获取采购申请详情成功'));
  } catch (err) { next(err); }
};

export const createPurchaseReq = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const purchase_req_number = await generatePurchaseReqNumber();
    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO purchase_req (purchase_req_number, request_date, request_department, requester, request_reason,
          source_number, production_number, approval_status, order_status, [condition], remark, creation_date, creation_man)
        VALUES (:purchase_req_number, :request_date, :request_department, :requester, :request_reason,
          :source_number, :production_number, N'草稿', N'未执行', :condition, :remark, :creation_date, :creation_man)
      `, {
        replacements: {
          purchase_req_number,
          request_date: b.request_date || null,
          request_department: b.request_department || '',
          requester: b.requester || '',
          request_reason: b.request_reason || '其他',
          source_number: b.source_number || '',
          production_number: b.production_number || '',
          condition: b.condition || CONDITION_STATUS.ENABLED,
          remark: b.remark || '',
          creation_date,
          creation_man
        },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO purchase_req_detail (purchase_req_number, line_number, item_number, item_name, specifications,
              basic_unit, request_quantity, ordered_quantity, expected_date, suggested_supplier_number, suggested_supplier_name, status, remark)
            VALUES (:purchase_req_number, :line_number, :item_number, :item_name, :specifications,
              :basic_unit, :request_quantity, 0, :expected_date, :suggested_supplier_number, :suggested_supplier_name, N'未执行', :remark)
          `, {
            replacements: {
              purchase_req_number,
              line_number: d.line_number || (i + 1) * 10,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              request_quantity: d.request_quantity || 0,
              expected_date: d.expected_date || null,
              suggested_supplier_number: d.suggested_supplier_number || '',
              suggested_supplier_name: d.suggested_supplier_name || '',
              remark: d.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success({ purchase_req_number }, '创建采购申请成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

export const updatePurchaseReq = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM purchase_req WHERE purchase_req_number = :id`, { replacements: { id } }
    );
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE purchase_req SET
          request_date = :request_date, request_department = :request_department, requester = :requester,
          request_reason = :request_reason, source_number = :source_number, production_number = :production_number, [condition] = :condition, remark = :remark
        WHERE purchase_req_number = :id
      `, {
        replacements: {
          id,
          request_date: b.request_date || null,
          request_department: b.request_department || '',
          requester: b.requester || '',
          request_reason: b.request_reason || '其他',
          source_number: b.source_number || '',
          production_number: b.production_number || '',
          condition: b.condition || CONDITION_STATUS.ENABLED,
          remark: b.remark || ''
        },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        await sequelize.query(
          `DELETE FROM purchase_req_detail WHERE purchase_req_number = :id`,
          { replacements: { id }, transaction }
        );
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO purchase_req_detail (purchase_req_number, line_number, item_number, item_name, specifications,
              basic_unit, request_quantity, ordered_quantity, expected_date, suggested_supplier_number, suggested_supplier_name, status, remark)
            VALUES (:purchase_req_number, :line_number, :item_number, :item_name, :specifications,
              :basic_unit, :request_quantity, :ordered_quantity, :expected_date, :suggested_supplier_number, :suggested_supplier_name, :status, :remark)
          `, {
            replacements: {
              purchase_req_number: id,
              line_number: d.line_number || (i + 1) * 10,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              request_quantity: d.request_quantity || 0,
              ordered_quantity: d.ordered_quantity || 0,
              expected_date: d.expected_date || null,
              suggested_supplier_number: d.suggested_supplier_number || '',
              suggested_supplier_name: d.suggested_supplier_name || '',
              status: d.status || ORDER_STATUS.UNEXECUTED,
              remark: d.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success(null, '更新采购申请成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

export const deletePurchaseReq = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(
      `SELECT approval_status, production_number FROM purchase_req WHERE purchase_req_number = :id`, { replacements: { id } }
    );
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return;
    }

    const productionNumbers = (chk[0]?.production_number || '').split(',').map((s: string) => s.trim()).filter(Boolean);

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM purchase_req_detail WHERE purchase_req_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM purchase_req WHERE purchase_req_number = :id`, { replacements: { id }, transaction });

      // 检查每个关联的生产计划是否需要回退状态
      for (const productionNumber of productionNumbers) {
        // 检查该计划下是否还有生产单
        const [otherOrders]: any = await sequelize.query(
          `SELECT 1 FROM production_order WHERE production_number = :pn`,
          { replacements: { pn: productionNumber }, transaction }
        );

        // 检查该计划下是否还有其他采购申请引用
        const [otherReqs]: any = await sequelize.query(
          `SELECT 1 FROM purchase_req WHERE CHARINDEX(:pn, production_number) > 0 AND purchase_req_number != :id AND purchase_req_number NOT LIKE N'MRP_TEMP%'`,
          { replacements: { pn: productionNumber, id }, transaction }
        );

        if (otherOrders.length === 0 && otherReqs.length === 0) {
          // 无其他任何关联单据，回退计划状态
          await sequelize.query(
            `UPDATE Production_plan SET plan_status = N'待加入任务', mrp_status = NULL WHERE production_number = :pn AND plan_status = N'已加入任务'`,
            { replacements: { pn: productionNumber }, transaction }
          );
        }
      }

      await transaction.commit();
      res.json(success(null, '删除采购申请成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== Detail CRUD ====================

export const getPurchaseReqDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    const [items]: any = await sequelize.query(
      `SELECT * FROM purchase_req_detail WHERE purchase_req_number = :headerId ORDER BY line_number`,
      { replacements: { headerId } }
    );
    res.json(success(items, '获取采购申请明细成功'));
  } catch (err) { next(err); }
};

export const addPurchaseReqDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    const d = req.body;
    const [maxLine]: any = await sequelize.query(
      `SELECT MAX(line_number) as ml FROM purchase_req_detail WHERE purchase_req_number = :headerId`,
      { replacements: { headerId } }
    );
    const line_number = (maxLine[0].ml || 0) + 10;

    await sequelize.query(`
      INSERT INTO purchase_req_detail (purchase_req_number, line_number, item_number, item_name, specifications,
        basic_unit, request_quantity, ordered_quantity, expected_date, suggested_supplier_number, suggested_supplier_name, status, remark)
      VALUES (:headerId, :line_number, :item_number, :item_name, :specifications,
        :basic_unit, :request_quantity, 0, :expected_date, :suggested_supplier_number, :suggested_supplier_name, N'未执行', :remark)
    `, {
      replacements: {
        headerId,
        line_number,
        item_number: d.item_number || '',
        item_name: d.item_name || '',
        specifications: d.specifications || '',
        basic_unit: d.basic_unit || '',
        request_quantity: d.request_quantity || 0,
        expected_date: d.expected_date || null,
        suggested_supplier_number: d.suggested_supplier_number || '',
        suggested_supplier_name: d.suggested_supplier_name || '',
        remark: d.remark || ''
      }
    });
    res.json(success(null, '新增明细行成功'));
  } catch (err) { next(err); }
};

export const updatePurchaseReqDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const d = req.body;
    await sequelize.query(`
      UPDATE purchase_req_detail SET
        item_number = :item_number, item_name = :item_name, specifications = :specifications,
        basic_unit = :basic_unit, request_quantity = :request_quantity, expected_date = :expected_date,
        suggested_supplier_number = :suggested_supplier_number, suggested_supplier_name = :suggested_supplier_name, remark = :remark
      WHERE id = :detailId
    `, {
      replacements: {
        detailId,
        item_number: d.item_number || '',
        item_name: d.item_name || '',
        specifications: d.specifications || '',
        basic_unit: d.basic_unit || '',
        request_quantity: d.request_quantity || 0,
        expected_date: d.expected_date || null,
        suggested_supplier_number: d.suggested_supplier_number || '',
        suggested_supplier_name: d.suggested_supplier_name || '',
        remark: d.remark || ''
      }
    });
    res.json(success(null, '更新明细行成功'));
  } catch (err) { next(err); }
};

export const deletePurchaseReqDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    await sequelize.query(`DELETE FROM purchase_req_detail WHERE id = :detailId`, { replacements: { detailId } });
    res.json(success(null, '删除明细行成功'));
  } catch (err) { next(err); }
};

// ==================== 转采购订单 ====================

export const toOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    if (!b.supplier_number) { res.status(400).json({ success: false, message: '供应商不能为空' }); return; }
    if (!b.detail_ids || !b.detail_ids.length) { res.status(400).json({ success: false, message: '请选择要转单的明细行' }); return; }

    // 校验申请单审批状态
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM purchase_req WHERE purchase_req_number = :id`, { replacements: { id } }
    );
    if (!chk.length || chk[0].approval_status !== '已审批') {
      res.status(403).json({ success: false, message: '只有已审批的采购申请才能转采购订单' }); return;
    }

    // 获取选中的明细行
    const [selectedDetails]: any = await sequelize.query(
      `SELECT * FROM purchase_req_detail WHERE purchase_req_number = :id AND id IN (:detail_ids)`,
      { replacements: { id, detail_ids: b.detail_ids } }
    );
    if (!selectedDetails.length) { res.status(400).json({ success: false, message: '未找到选中的明细行' }); return; }

    // 生成采购订单号
    const today = new Date();
    const dateStr = today.getFullYear() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0');
    const purPrefix = `PUR-${dateStr}-`;
    const [purRows]: any = await sequelize.query(
      `SELECT MAX(purchase_order_number) as max_num FROM purchase_order WHERE purchase_order_number LIKE :prefix`,
      { replacements: { prefix: purPrefix + '%' } }
    );
    let purSeq = 1;
    if (purRows[0].max_num) {
      const lastSeq = parseInt(purRows[0].max_num.slice(-3));
      if (!isNaN(lastSeq)) purSeq = lastSeq + 1;
    }
    const purchase_order_number = purPrefix + String(purSeq).padStart(3, '0');

    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      // ========== 自动从采购价目表查询单价 ==========
      // 查询该供应商所有已审批且在有效期内的价目表明细
      const priceMap = new Map<string, number>() // item_number → unit_price
      if (b.supplier_number) {
        const [priceLists]: any = await sequelize.query(`
          SELECT h.price_list_number, h.price_type
          FROM purchase_price_list h
          WHERE h.supplier_number = :supplier_number
            AND h.approval_status = N'已审批'
            AND h.effective_date <= CAST(GETDATE() AS DATE)
            AND (h.expiration_date IS NULL OR h.expiration_date >= CAST(GETDATE() AS DATE))
        `, { replacements: { supplier_number: b.supplier_number }, transaction })

        if (priceLists.length) {
          const plNumbers = priceLists.map((p: any) => p.price_list_number)
          const priceTypeMap = new Map<string, string>()
          for (const p of priceLists) priceTypeMap.set(p.price_list_number, p.price_type || '含税')

          const [priceDetails]: any = await sequelize.query(`
            SELECT d.price_list_number, d.item_number, d.tax_inclusive_price, d.tax_exclusive_price,
                   d.enable_tiered_pricing, d.start_quantity, d.end_quantity
            FROM purchase_price_list_detail d
            WHERE d.price_list_number IN (:plNumbers)
            ORDER BY d.item_number, d.line_number
          `, { replacements: { plNumbers }, transaction })

          for (const d of selectedDetails) {
            const reqQty = parseFloat(d.request_quantity) || 0
            const orderedQty = parseFloat(d.ordered_quantity) || 0
            const remaining = reqQty - orderedQty
            if (remaining <= 0) continue
            const itemNumber = d.item_number || ''
            if (priceMap.has(itemNumber)) continue // 已找到价格则跳过

            // 查找该物料的价目表明细
            const matchingDetails = priceDetails.filter((pd: any) => pd.item_number === itemNumber)
            if (!matchingDetails.length) continue

            // 阶梯价匹配：找满足数量区间的行
            let matched: any = null
            const tieredDetails = matchingDetails.filter((pd: any) => pd.enable_tiered_pricing)
            if (tieredDetails.length) {
              // 找到数量区间匹配的阶梯价
              matched = tieredDetails.find((pd: any) => {
                const startQty = parseFloat(pd.start_quantity) || 0
                const endQty = pd.end_quantity != null ? parseFloat(pd.end_quantity) : Infinity
                return remaining >= startQty && remaining <= endQty
              })
              // 未匹配到区间则取第一个阶梯的最低价
              if (!matched) matched = tieredDetails[0]
            }
            if (!matched) matched = matchingDetails[0]

            // 根据价目表的price_type决定取含税还是未税价
            const pl = priceLists.find((p: any) => p.price_list_number === matched.price_list_number)
            const priceType = pl?.price_type || '含税'
            const unitPrice = priceType === '未税'
              ? parseFloat(matched.tax_exclusive_price) || 0
              : parseFloat(matched.tax_inclusive_price) || 0
            if (unitPrice > 0) priceMap.set(itemNumber, unitPrice)
          }
        }
      }

      // 计算总金额
      let totalAmount = 0;
      for (const d of selectedDetails) {
        const qty = parseFloat(d.request_quantity) || 0;
        const remaining = qty - (parseFloat(d.ordered_quantity) || 0);
        // 优先使用前端手工传入的单价，其次使用价目表自动匹配的单价
        const unitPrice = parseFloat(b.unit_prices?.[d.id]) || priceMap.get(d.item_number || '') || 0;
        totalAmount += remaining * unitPrice;
      }

      // 创建采购订单主表
      await sequelize.query(`
        INSERT INTO purchase_order (purchase_order_number, supplier_number, supplier_name, procurement_manager,
          linkman, contacts, order_date, delivery_date, approval_status, order_status, total_amount,
          [condition], source_req_number, remark, creation_date, creation_man)
        VALUES (:purchase_order_number, :supplier_number, :supplier_name, :procurement_manager,
          :linkman, :contacts, :order_date, :delivery_date, N'草稿', N'待执行', :total_amount,
          N'启用', :source_req_number, :remark, :creation_date, :creation_man)
      `, {
        replacements: {
          purchase_order_number,
          supplier_number: b.supplier_number || '',
          supplier_name: b.supplier_name || '',
          procurement_manager: b.procurement_manager || '',
          linkman: b.linkman || '',
          contacts: b.contacts || '',
          order_date: new Date().toISOString().split('T')[0],
          delivery_date: b.delivery_date || null,
          total_amount: totalAmount,
          source_req_number: id,
          remark: b.remark || '',
          creation_date,
          creation_man
        },
        transaction
      });

      // 创建采购订单明细行 + 回写申请单明细
      if (b.merge_same_items) {
        // 合并模式：相同物料编码合并为一行
        const itemMap = new Map<string, any[]>()
        for (const d of selectedDetails) {
          const reqQty = parseFloat(d.request_quantity) || 0
          const orderedQty = parseFloat(d.ordered_quantity) || 0
          const remaining = reqQty - orderedQty
          if (remaining <= 0) continue
          const key = d.item_number || ''
          if (!itemMap.has(key)) itemMap.set(key, [])
          itemMap.get(key)!.push({ ...d, remaining })
        }
        let lineIdx = 0
        for (const [, items] of itemMap) {
          lineIdx++
          const first = items[0]
          const totalQty = items.reduce((s: number, r: any) => s + r.remaining, 0)
          // 优先前端手工单价，其次价目表价格，最后取0
          const manualPrices = items.map((r: any) => parseFloat(b.unit_prices?.[r.id]) || 0).filter((p: number) => p > 0)
          const unitPrice = manualPrices.length
            ? manualPrices.reduce((s: number, p: number) => s + p, 0) / manualPrices.length
            : (priceMap.get(first.item_number || '') || 0)

          await sequelize.query(`
            INSERT INTO purchase_order_detail (purchase_order_number, line_number, item_number, item_name, specifications,
              basic_unit, order_quantity, unit_price, total_amount, received_quantity, delivery_date,
              receive_status, source_req_number, source_req_detail_id, remark)
            VALUES (:purchase_order_number, :line_number, :item_number, :item_name, :specifications,
              :basic_unit, :order_quantity, :unit_price, :total_amount, 0, :delivery_date,
              N'未到货', :source_req_number, :source_req_detail_id, :remark)
          `, {
            replacements: {
              purchase_order_number,
              line_number: lineIdx * 10,
              item_number: first.item_number || '',
              item_name: first.item_name || '',
              specifications: first.specifications || '',
              basic_unit: first.basic_unit || '',
              order_quantity: totalQty,
              unit_price: unitPrice,
              total_amount: totalQty * unitPrice,
              delivery_date: b.delivery_date || first.expected_date || null,
              source_req_number: id,
              source_req_detail_id: first.id,
              remark: items.map((r: any) => r.remark || '').filter(Boolean).join('; ')
            },
            transaction
          })

          // 回写所有原始申请单明细行
          for (const d of items) {
            const reqQty = parseFloat(d.request_quantity) || 0
            const orderedQty = parseFloat(d.ordered_quantity) || 0
            const newOrdered = reqQty
            const newStatus = '已转单'
            await sequelize.query(`
              UPDATE purchase_req_detail SET ordered_quantity = :newOrdered, status = :newStatus WHERE id = :detailId
            `, { replacements: { newOrdered, newStatus, detailId: d.id }, transaction })
          }
        }
      } else {
        // 不合并：每个明细行单独生成采购订单行
      for (let i = 0; i < selectedDetails.length; i++) {
        const d = selectedDetails[i];
        const reqQty = parseFloat(d.request_quantity) || 0;
        const orderedQty = parseFloat(d.ordered_quantity) || 0;
        const remaining = reqQty - orderedQty;
        if (remaining <= 0) continue;

        const unitPrice = parseFloat(b.unit_prices?.[d.id]) || priceMap.get(d.item_number || '') || 0;

        await sequelize.query(`
          INSERT INTO purchase_order_detail (purchase_order_number, line_number, item_number, item_name, specifications,
            basic_unit, order_quantity, unit_price, total_amount, received_quantity, delivery_date,
            receive_status, source_req_number, source_req_detail_id, remark)
          VALUES (:purchase_order_number, :line_number, :item_number, :item_name, :specifications,
            :basic_unit, :order_quantity, :unit_price, :total_amount, 0, :delivery_date,
            N'未到货', :source_req_number, :source_req_detail_id, :remark)
        `, {
          replacements: {
            purchase_order_number,
            line_number: (i + 1) * 10,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            order_quantity: remaining,
            unit_price: unitPrice,
            total_amount: remaining * unitPrice,
            delivery_date: b.delivery_date || d.expected_date || null,
            source_req_number: id,
            source_req_detail_id: d.id,
            remark: d.remark || ''
          },
          transaction
        });

        // 回写申请单明细行 ordered_quantity
        const newOrdered = orderedQty + remaining;
        const newStatus = newOrdered >= reqQty ? '已转单' : '部分转单';
        await sequelize.query(`
          UPDATE purchase_req_detail SET ordered_quantity = :newOrdered, status = :newStatus WHERE id = :detailId
        `, { replacements: { newOrdered, newStatus, detailId: d.id }, transaction });
      }
      }

      // 更新申请单主表执行状态
      const [allDetails]: any = await sequelize.query(
        `SELECT status FROM purchase_req_detail WHERE purchase_req_number = :id`,
        { replacements: { id }, transaction }
      );
      const allDone = allDetails.every((r: any) => r.status === '已转单');
      const anyDone = allDetails.some((r: any) => r.status !== ORDER_STATUS.UNEXECUTED);
      const newOrderStatus = allDone ? '已转单' : (anyDone ? '部分转单' : ORDER_STATUS.UNEXECUTED);
      await sequelize.query(
        `UPDATE purchase_req SET order_status = :newOrderStatus WHERE purchase_req_number = :id`,
        { replacements: { newOrderStatus, id }, transaction }
      );

      await transaction.commit();
      res.json(success({ purchase_order_number }, '转采购订单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出/导入 ====================

export const exportPurchaseReqs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE (h.purchase_req_number LIKE :search OR h.requester LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    const [rows]: any = await sequelize.query(
      `SELECT h.purchase_req_number, h.request_date, h.request_department, h.requester, h.request_reason,
              h.source_number, h.production_number, h.approval_status, h.order_status, h.remark,
              d.line_number, d.item_number, d.item_name, d.specifications, d.basic_unit,
              d.request_quantity, d.ordered_quantity, d.expected_date, d.suggested_supplier_name, d.status as detail_status
       FROM purchase_req h LEFT JOIN purchase_req_detail d ON h.purchase_req_number = d.purchase_req_number
       ${whereClause} ORDER BY h.purchase_req_number DESC, d.line_number`,
      { replacements }
    );

    const fields = ['purchase_req_number', 'request_date', 'request_department', 'requester', 'request_reason',
      'source_number', 'production_number', 'approval_status', 'order_status', 'remark',
      'line_number', 'item_number', 'item_name', 'specifications', 'basic_unit',
      'request_quantity', 'ordered_quantity', 'expected_date', 'suggested_supplier_name', 'detail_status'];
    const headers = ['采购申请号', '申请日期', '部门', '申请人', '原因', '来源单号', '生产计划编号', '审批状态', '执行状态', '备注',
      '行号', '物料编码', '物料名称', '规格', '单位', '申请数量', '已转单数量', '期望到货日', '建议供应商', '行状态'];

    exportToExcel(rows, fields, headers, 'purchase_reqs', res);
  } catch (err) { next(err); }
};

// ==================== 明细列表页 ====================

export const getPurchaseReqDetailsPage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = '';
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` WHERE (d.purchase_req_number LIKE :search OR d.item_number LIKE :search OR d.item_name LIKE :search OR d.suggested_supplier_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (status) {
      const statusArr = String(status).split(',').filter(Boolean);
      if (statusArr.length === 1) {
        whereClause += `${whereClause ? ' AND' : ' WHERE'} d.status = :status`;
        replacements.status = statusArr[0];
      } else if (statusArr.length > 1) {
        const placeholders = statusArr.map((_: string, i: number) => `:status${i}`).join(', ');
        whereClause += `${whereClause ? ' AND' : ' WHERE'} d.status IN (${placeholders})`;
        statusArr.forEach((s: string, i: number) => { replacements[`status${i}`] = s; });
      }
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM purchase_req_detail d
       INNER JOIN purchase_req h ON h.purchase_req_number = d.purchase_req_number
       ${whereClause}`, { replacements }
    );
    const total = countResult[0]?.total || 0;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT d.id, d.purchase_req_number, d.line_number, d.item_number, d.item_name,
               d.specifications, d.basic_unit, d.request_quantity, d.ordered_quantity,
               d.expected_date, d.suggested_supplier_number, d.suggested_supplier_name,
               d.status, d.remark,
               h.request_date, h.requester, h.request_department, h.request_reason,
               h.source_number, h.production_number, h.approval_status, h.order_status,
               ROW_NUMBER() OVER (ORDER BY h.purchase_req_number DESC, d.line_number) AS _row_num
        FROM purchase_req_detail d
        INNER JOIN purchase_req h ON h.purchase_req_number = d.purchase_req_number
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      total,
      page: pageNum,
      limit: pageSize
    }));
  } catch (err) { next(err); }
};

export const exportPurchaseReqDetailsSelected = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      res.status(400).json({ success: false, message: '请选择要导出的记录' });
      return;
    }
    if (ids.length > 1000) {
      res.status(400).json({ success: false, message: '单次导出不能超过1000条' });
      return;
    }

    const replacements: any = {};
    ids.forEach((id: any, i: number) => { replacements[`id${i}`] = id; });
    const placeholders = ids.map((_: any, i: number) => `:id${i}`).join(', ');

    const [items]: any = await sequelize.query(
      `SELECT d.purchase_req_number, d.line_number, d.item_number, d.item_name,
              d.specifications, d.basic_unit, d.request_quantity, d.ordered_quantity,
              d.expected_date, d.suggested_supplier_name, d.status, d.remark,
              h.request_date, h.requester, h.request_department, h.request_reason,
              h.source_number, h.production_number, h.approval_status, h.order_status
       FROM purchase_req_detail d
       INNER JOIN purchase_req h ON h.purchase_req_number = d.purchase_req_number
       WHERE d.id IN (${placeholders})
       ORDER BY d.purchase_req_number, d.line_number`,
      { replacements }
    );

    const fields = [
      'purchase_req_number', 'line_number', 'item_number', 'item_name',
      'specifications', 'basic_unit', 'request_quantity', 'ordered_quantity',
      'expected_date', 'suggested_supplier_name', 'status', 'remark',
      'request_date', 'requester', 'request_department', 'request_reason',
      'source_number', 'production_number', 'approval_status', 'order_status'
    ];
    const headers = [
      '采购申请号', '行号', '物料编码', '物料名称',
      '规格', '单位', '申请数量', '已转单数量',
      '期望到货日', '建议供应商', '行状态', '备注',
      '申请日期', '申请人', '部门', '申请原因',
      '来源单号', '生产计划编号', '审批状态', '执行状态'
    ];

    exportToExcel(items, fields, headers, 'purchase_req_details_selected', res);
  } catch (err) { next(err); }
};
