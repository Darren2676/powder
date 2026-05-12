import { Request, Response, NextFunction } from 'express';
import sequelize from '@/config/database';
import { success } from '@/utils/response.util';
import { syncFinishedGoodsSummary, generateTransactionNumber } from '@/services/inventory.service';
import dayjs from 'dayjs';

// ==================== 单据编号生成 ====================

async function generatePackingNumber(transaction?: any): Promise<string> {
  const today = new Date();
  const prefix = 'PK' + today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const opts: any = { replacements: { prefix: prefix + '%' } };
  if (transaction) opts.transaction = transaction;
  const [rows]: any = await sequelize.query(
    `SELECT MAX(packing_number) as max_num FROM packing_order WHERE packing_number LIKE :prefix`, opts
  );
  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
}

/** 查询某前缀下的当前最大序号，返回 { prefix, startSeq } */
async function getNextSequence(tableName: string, numberColumn: string, prefix: string, transaction?: any): Promise<{ prefix: string; startSeq: number }> {
  const opts: any = { replacements: { prefix: prefix + '%' } };
  if (transaction) opts.transaction = transaction;
  const [rows]: any = await sequelize.query(
    `SELECT MAX(${numberColumn}) as max_num FROM ${tableName} WHERE ${numberColumn} LIKE :prefix`, opts
  );
  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return { prefix, startSeq: seq };
}

function formatNumber(prefix: string, seq: number): string {
  return prefix + String(seq).padStart(3, '0');
}

// ==================== 获取装箱单列表 ====================

export const getPackingOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    let where = '1=1';
    if (search) where += ` AND (packing_number LIKE '%${search}%' OR item_number LIKE '%${search}%' OR item_name LIKE '%${search}%')`;
    if (status) where += ` AND status = N'${status}'`;
    const [rows]: any = await sequelize.query(
      `SELECT po.*, COALESCE(NULLIF(po.specifications,''), im.specifications) AS specifications
       FROM packing_order po LEFT JOIN item_master im ON po.item_number = im.item_number
       WHERE ${where} ORDER BY po.creation_date DESC`,
      { replacements: {} }
    );
    const total = rows.length;
    const offset = (Number(page) - 1) * Number(limit);
    const items = rows.slice(offset, offset + Number(limit));
    res.json(success({ items, total, page: Number(page), pageSize: Number(limit) }, '查询成功'));
  } catch (err) { next(err); }
};

// ==================== 获取装箱单详情 ====================

export const getPackingOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { packingNumber } = req.params;
    const [headers]: any = await sequelize.query(
      `SELECT * FROM packing_order WHERE packing_number = :pn`, { replacements: { pn: packingNumber } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '装箱单不存在' }); return; }
    const header = headers[0];

    // 查询批次标签（新方案）
    const [labels]: any = await sequelize.query(
      `SELECT * FROM packing_bag_label WHERE packing_number = :pn ORDER BY batch_number, label_sequence`,
      { replacements: { pn: packingNumber } }
    );

    const [boxes]: any = await sequelize.query(
      `SELECT pb.*,
        ISNULL(pbi.status, pb.status) as inventory_status,
        pbi.inbound_date, pbi.outbound_date
       FROM packing_box pb
       LEFT JOIN packing_box_inventory pbi ON pb.box_number = pbi.box_number
       WHERE pb.packing_number = :pn ORDER BY pb.box_sequence`,
      { replacements: { pn: packingNumber } }
    );

    // 将标签挂到对应箱
    for (const box of boxes) {
      box.labels = labels.filter((lb: any) => lb.box_number === box.box_number);
      // 优先使用库存状态（更准确）
      if (box.inventory_status) {
        box.status = box.inventory_status;
      }
    }

    // 兼容旧数据：如果无packing_bag_label记录，回退查packing_bag+packing_bag_batch
    let legacyBags: any[] = [];
    if (labels.length === 0) {
      const [bags]: any = await sequelize.query(
        `SELECT * FROM packing_bag WHERE packing_number = :pn ORDER BY bag_sequence`, { replacements: { pn: packingNumber } }
      );
      const bagNumbers = bags.map((b: any) => b.bag_number);
      let batches: any[] = [];
      if (bagNumbers.length > 0) {
        const [b]: any = await sequelize.query(
          `SELECT * FROM packing_bag_batch WHERE bag_number IN (:bagNumbers) ORDER BY id`, { replacements: { bagNumbers } }
        );
        batches = b;
      }
      for (const bag of bags) {
        bag.batches = batches.filter((bt: any) => bt.bag_number === bag.bag_number);
      }
      for (const box of boxes) {
        box.bags = bags.filter((bg: any) => bg.box_number === box.box_number);
      }
      legacyBags = bags;
    }

    res.json(success({ header, labels, boxes, legacyBags }, '查询成功'));
  } catch (err) { next(err); }
};

// ==================== 获取产品可用批次 ====================

export const getAvailableBatches = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number, warehouse_number } = req.query;
    if (!item_number || !warehouse_number) { res.json(success([], '查询成功')); return; }
    const [rows]: any = await sequelize.query(
      `SELECT batch_number, item_number, item_name, specifications, basic_unit, quantity, initial_quantity, quality_status
       FROM finished_batch_inventory
       WHERE item_number = :item_number AND warehouse_number = :warehouse_number AND quantity > 0 AND status = N'正常'
       ORDER BY inbound_date ASC`,
      { replacements: { item_number: String(item_number), warehouse_number: String(warehouse_number) } }
    );
    res.json(success(rows, '查询成功'));
  } catch (err) { next(err); }
};

// ==================== 创建装箱单（新方案：按批次维度生成标签） ====================

export const createPackingOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const { warehouse_number, warehouse_name, item_number, item_name, specifications, basic_unit,
      total_quantity, inner_pack_qty, outer_pack_qty, remark, selected_batches } = b;

    if (!item_number || !warehouse_number || !total_quantity || total_quantity <= 0) {
      res.status(400).json({ success: false, message: '请填写完整信息' }); return;
    }
    if (!inner_pack_qty || inner_pack_qty <= 0) {
      res.status(400).json({ success: false, message: '请先在物料主数据中配置内包装数量' }); return;
    }

    const operator = (req as any).user?.username || '';
    const transaction = await sequelize.transaction();

    try {
      const packingNumber = await generatePackingNumber(transaction);

      // 如果前端未传规格，从 item_master 获取
      let finalSpecifications = specifications || '';
      if (!finalSpecifications) {
        const [imRows]: any = await sequelize.query(
          `SELECT specifications FROM item_master WHERE item_number = :item_number`,
          { replacements: { item_number }, transaction }
        );
        if (imRows.length > 0 && imRows[0].specifications) {
          finalSpecifications = imRows[0].specifications;
        }
      }

      // 获取可用批次（先进先出）
      const [allBatches]: any = await sequelize.query(
        `SELECT batch_number, quantity, item_number, item_name, specifications, basic_unit, quality_status
         FROM finished_batch_inventory
         WHERE item_number = :item_number AND warehouse_number = :warehouse_number AND quantity > 0 AND status = N'正常'
         ORDER BY inbound_date ASC`,
        { replacements: { item_number, warehouse_number }, transaction }
      );

      // 按选中批次过滤
      const batches: any[] = selected_batches && selected_batches.length > 0
        ? allBatches.filter((r: any) => selected_batches.includes(r.batch_number))
        : allBatches;

      if (batches.length === 0) {
        await transaction.rollback();
        res.status(400).json({ success: false, message: '未选择任何可用批次' }); return;
      }

      const availableTotal = batches.reduce((sum: number, r: any) => sum + parseFloat(r.quantity), 0);
      if (availableTotal < total_quantity) {
        await transaction.rollback();
        res.status(400).json({ success: false, message: `已选批次库存不足，当前可用 ${availableTotal}，需要 ${total_quantity}` }); return;
      }

      const S = Number(inner_pack_qty); // 每袋标准数量
      const N = Number(outer_pack_qty) || 1; // 每箱袋数

      // ========== 按批次维度生成标签 ==========
      let labelSeq = 0;
      let totalLabels = 0;
      let totalActualQty = 0;
      let remaining = Number(total_quantity);
      const labelData: any[] = [];

      for (const batch of batches) {
        if (remaining <= 0) break;
        const batchQty = Math.min(parseFloat(batch.quantity), remaining);

        // 满袋标签数
        const fullLabels = Math.floor(batchQty / S);
        // 尾袋数量
        const tailQty = batchQty - fullLabels * S;

        // 生成满袋标签
        for (let i = 0; i < fullLabels; i++) {
          labelSeq++;
          totalLabels++;
          totalActualQty += S;
          labelData.push({
            packing_number: packingNumber,
            batch_number: batch.batch_number,
            item_number, item_name, specifications: specifications || '', basic_unit: basic_unit || '',
            label_quantity: S,
            standard_qty: S,
            is_full: 1,
            label_sequence: labelSeq,
            box_number: '',
            label_printed: 0
          });
        }

        // 生成尾袋标签（不足一袋按实际数量）
        if (tailQty > 0) {
          labelSeq++;
          totalLabels++;
          totalActualQty += tailQty;
          labelData.push({
            packing_number: packingNumber,
            batch_number: batch.batch_number,
            item_number, item_name, specifications: specifications || '', basic_unit: basic_unit || '',
            label_quantity: tailQty,
            standard_qty: S,
            is_full: 0,
            label_sequence: labelSeq,
            box_number: '',
            label_printed: 0
          });
        }

        remaining -= batchQty;
      }

      // ========== 自动装箱算法（按批次连续装箱） ==========
      const today = new Date();
      const boxPrefix = 'BOX' + today.getFullYear() +
        String(today.getMonth() + 1).padStart(2, '0') +
        String(today.getDate()).padStart(2, '0');

      const boxSeqInfo = await getNextSequence('packing_box', 'box_number', boxPrefix, transaction);
      const boxCount = Math.ceil(labelData.length / N);
      const boxData: any[] = [];

      for (let i = 0; i < boxCount; i++) {
        const boxSeq = i + 1;
        const startIdx = i * N;
        const endIdx = Math.min(startIdx + N, labelData.length);
        const labelsInBox = labelData.slice(startIdx, endIdx);
        const actualLabelQty = labelsInBox.length;
        const totalQtyInBox = labelsInBox.reduce((sum: number, lb: any) => sum + Number(lb.label_quantity), 0);
        const isFull = actualLabelQty >= N;
        const boxNumber = formatNumber(boxSeqInfo.prefix, boxSeqInfo.startSeq + i);

        // 更新标签的 box_number
        for (const lb of labelsInBox) {
          lb.box_number = boxNumber;
        }

        // 收集箱内批次号（去重）
        const batchNums = [...new Set(labelsInBox.map((lb: any) => lb.batch_number))];

        boxData.push({
          packing_number: packingNumber,
          box_number: boxNumber,
          box_sequence: boxSeq,
          item_number, item_name, specifications: finalSpecifications,
          standard_bag_qty: N,
          actual_bag_qty: actualLabelQty,
          total_quantity: totalQtyInBox,
          is_full: isFull ? 1 : 0,
          label_printed: 0,
          warehouse_number, warehouse_name,
          status: '在库',
          batch_numbers: batchNums.join(',')
        });
      }

      // ========== 写入数据库 ==========
      await sequelize.query(
        `INSERT INTO packing_order (packing_number, warehouse_number, warehouse_name, item_number, item_name, specifications, basic_unit, total_quantity, total_bags, total_boxes, total_labels, status, operator, remark)
         VALUES (:packing_number, :warehouse_number, :warehouse_name, :item_number, :item_name, :specifications, :basic_unit, :total_quantity, :total_bags, :total_boxes, :total_labels, N'草稿', :operator, :remark)`,
        { replacements: { packing_number: packingNumber, warehouse_number, warehouse_name, item_number, item_name, specifications: finalSpecifications, basic_unit: basic_unit || '', total_quantity, total_bags: 0, total_boxes: boxData.length, total_labels: totalLabels, operator, remark: remark || '' }, transaction }
      );

      for (const lb of labelData) {
        await sequelize.query(
          `INSERT INTO packing_bag_label (packing_number, batch_number, item_number, item_name, specifications, basic_unit, label_quantity, standard_qty, is_full, label_sequence, box_number, label_printed)
           VALUES (:packing_number, :batch_number, :item_number, :item_name, :specifications, :basic_unit, :label_quantity, :standard_qty, :is_full, :label_sequence, :box_number, :label_printed)`,
          { replacements: lb, transaction }
        );
      }

      for (const bx of boxData) {
        await sequelize.query(
          `INSERT INTO packing_box (packing_number, box_number, box_sequence, item_number, item_name, specifications, standard_bag_qty, actual_bag_qty, total_quantity, is_full, label_printed, warehouse_number, warehouse_name, status, batch_numbers)
           VALUES (:packing_number, :box_number, :box_sequence, :item_number, :item_name, :specifications, :standard_bag_qty, :actual_bag_qty, :total_quantity, :is_full, :label_printed, :warehouse_number, :warehouse_name, N'在库', :batch_numbers)`,
          { replacements: bx, transaction }
        );
      }

      await transaction.commit();
      res.json(success({ packing_number: packingNumber, total_labels: totalLabels, total_boxes: boxData.length }, '创建成功'));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 确认装箱单 ====================

export const confirmPackingOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { packingNumber } = req.params;
    const [headers]: any = await sequelize.query(
      `SELECT * FROM packing_order WHERE packing_number = :pn`, { replacements: { pn: packingNumber } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '装箱单不存在' }); return; }
    if (headers[0].status !== '草稿') { res.status(400).json({ success: false, message: '只有草稿状态的装箱单才能确认' }); return; }

    const transaction = await sequelize.transaction();
    try {
      // 优先从 packing_bag_label 读取批次分配（新方案）
      const [labels]: any = await sequelize.query(
        `SELECT batch_number, item_number, SUM(label_quantity) as quantity
         FROM packing_bag_label WHERE packing_number = :pn
         GROUP BY batch_number, item_number`,
        { replacements: { pn: packingNumber }, transaction }
      );

      // 如果新表无数据，回退旧表
      let batches = labels;
      if (batches.length === 0) {
        const [oldBatches]: any = await sequelize.query(
          `SELECT pbb.batch_number, pbb.item_number, pbb.quantity
           FROM packing_bag_batch pbb
           INNER JOIN packing_bag pb ON pbb.bag_number = pb.bag_number
           WHERE pb.packing_number = :pn`,
          { replacements: { pn: packingNumber }, transaction }
        );
        batches = oldBatches;
      }

      // 扣减批次库存
      for (const bt of batches) {
        const qty = parseFloat(bt.quantity);
        await sequelize.query(
          `UPDATE finished_batch_inventory SET quantity = quantity - :qty, last_updated = GETDATE() WHERE batch_number = :batch_number AND item_number = :item_number`,
          { replacements: { qty, batch_number: bt.batch_number, item_number: bt.item_number }, transaction }
        );
        // 检查是否扣到负数
        const [check]: any = await sequelize.query(
          `SELECT quantity FROM finished_batch_inventory WHERE batch_number = :batch_number AND item_number = :item_number`,
          { replacements: { batch_number: bt.batch_number, item_number: bt.item_number }, transaction }
        );
        if (check.length && parseFloat(check[0].quantity) < 0) {
          await transaction.rollback();
          res.status(400).json({ success: false, message: `批次 ${bt.batch_number} 库存不足` }); return;
        }
      }

      // 更新状态
      await sequelize.query(
        `UPDATE packing_order SET status = N'已确认', confirmation_date = GETDATE() WHERE packing_number = :pn`,
        { replacements: { pn: packingNumber }, transaction }
      );

      // ========== 新增：插入箱装库存 ==========
      const [boxes]: any = await sequelize.query(
        `SELECT pb.box_number, pb.item_number, pb.item_name, pb.specifications,
                pb.warehouse_number, pb.warehouse_name, pb.total_quantity, pb.batch_numbers,
                po.basic_unit
         FROM packing_box pb
         INNER JOIN packing_order po ON pb.packing_number = po.packing_number
         WHERE pb.packing_number = :pn`,
        { replacements: { pn: packingNumber }, transaction }
      );
      for (const bx of boxes) {
        await sequelize.query(`
          INSERT INTO packing_box_inventory (box_number, packing_number, item_number, item_name,
            specifications, basic_unit, warehouse_number, warehouse_name, total_quantity,
            batch_numbers, status, inbound_date, creation_date, last_updated)
          VALUES (:box_number, :packing_number, :item_number, :item_name,
            :specifications, :basic_unit, :warehouse_number, :warehouse_name, :total_quantity,
            :batch_numbers, N'在库', GETDATE(), GETDATE(), GETDATE())
        `, { replacements: { box_number: bx.box_number, packing_number: packingNumber, item_number: bx.item_number, item_name: bx.item_name || '', specifications: bx.specifications || '', basic_unit: bx.basic_unit || '', warehouse_number: bx.warehouse_number || headers[0].warehouse_number, warehouse_name: bx.warehouse_name || headers[0].warehouse_name, total_quantity: bx.total_quantity, batch_numbers: bx.batch_numbers || '' }, transaction });
      }

      // ========== 同步汇总库存（装箱是形态转换，总量不变，重新同步确保一致） ==========
      await syncFinishedGoodsSummary(headers[0].item_number, headers[0].warehouse_number, transaction, '合格品');

      await transaction.commit();
      res.json(success(null, '确认成功'));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 取消装箱单 ====================

export const cancelPackingOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { packingNumber } = req.params;
    const [headers]: any = await sequelize.query(
      `SELECT * FROM packing_order WHERE packing_number = :pn`, { replacements: { pn: packingNumber } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '装箱单不存在' }); return; }
    if (headers[0].status === '已取消') { res.status(400).json({ success: false, message: '装箱单已取消' }); return; }

    const transaction = await sequelize.transaction();
    try {
      // 如果是已确认状态，需要回退批次库存
      if (headers[0].status === '已确认') {
        // ========== 先检查箱库存是否有已出库的箱（在回退批次之前） ==========
        const [outBoxes]: any = await sequelize.query(
          `SELECT box_number FROM packing_box_inventory WHERE packing_number = :pn AND status = N'已出库'`,
          { replacements: { pn: packingNumber }, transaction }
        );
        if (outBoxes.length > 0) {
          const outBoxNums = outBoxes.map((b: any) => b.box_number).join(', ');
          await transaction.rollback();
          res.status(400).json({ success: false, message: `箱 ${outBoxNums} 已出库，无法取消装箱单` }); return;
        }

        // 优先从 packing_bag_label 读取
        const [labels]: any = await sequelize.query(
          `SELECT batch_number, item_number, SUM(label_quantity) as quantity
           FROM packing_bag_label WHERE packing_number = :pn
           GROUP BY batch_number, item_number`,
          { replacements: { pn: packingNumber }, transaction }
        );

        let batches = labels;
        if (batches.length === 0) {
          const [oldBatches]: any = await sequelize.query(
            `SELECT pbb.batch_number, pbb.item_number, pbb.quantity
             FROM packing_bag_batch pbb
             INNER JOIN packing_bag pb ON pbb.bag_number = pb.bag_number
             WHERE pb.packing_number = :pn`,
            { replacements: { pn: packingNumber }, transaction }
          );
          batches = oldBatches;
        }

        for (const bt of batches) {
          const qty = parseFloat(bt.quantity);
          await sequelize.query(
            `UPDATE finished_batch_inventory SET quantity = quantity + :qty, last_updated = GETDATE() WHERE batch_number = :batch_number AND item_number = :item_number`,
            { replacements: { qty, batch_number: bt.batch_number, item_number: bt.item_number }, transaction }
          );
        }

        // ========== 删除箱装库存（所有箱都在库才到这里） ==========
        await sequelize.query(
          `DELETE FROM packing_box_inventory WHERE packing_number = :pn`,
          { replacements: { pn: packingNumber }, transaction }
        );

        // ========== 同步汇总库存 ==========
        await syncFinishedGoodsSummary(headers[0].item_number, headers[0].warehouse_number, transaction, '合格品');
      }

      await sequelize.query(
        `UPDATE packing_order SET status = N'已取消' WHERE packing_number = :pn`,
        { replacements: { pn: packingNumber }, transaction }
      );
      await transaction.commit();
      res.json(success(null, '取消成功'));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 扫码查询箱号 ====================

export const getBoxByNumber = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { boxNumber } = req.params;
    const [boxes]: any = await sequelize.query(
      `SELECT * FROM packing_box WHERE box_number = :bn`, { replacements: { bn: boxNumber } }
    );
    if (!boxes.length) { res.status(404).json({ success: false, message: '箱号不存在' }); return; }
    const box = boxes[0];

    // 优先查新表 packing_bag_label
    const [labels]: any = await sequelize.query(
      `SELECT * FROM packing_bag_label WHERE box_number = :bn ORDER BY batch_number, label_sequence`,
      { replacements: { bn: boxNumber } }
    );

    if (labels.length > 0) {
      box.labels = labels;
    } else {
      // 回退旧表
      const [bags]: any = await sequelize.query(
        `SELECT * FROM packing_bag WHERE box_number = :bn ORDER BY bag_sequence`, { replacements: { bn: boxNumber } }
      );
      const bagNumbers = bags.map((b: any) => b.bag_number);
      let batches: any[] = [];
      if (bagNumbers.length > 0) {
        const [b]: any = await sequelize.query(
          `SELECT * FROM packing_bag_batch WHERE bag_number IN (:bagNumbers) ORDER BY id`, { replacements: { bagNumbers } }
        );
        batches = b;
      }
      for (const bag of bags) {
        bag.batches = batches.filter((bt: any) => bt.bag_number === bag.bag_number);
      }
      box.bags = bags;
    }

    res.json(success(box, '查询成功'));
  } catch (err) { next(err); }
};

// ==================== 扫码查询袋号（兼容旧接口） ====================

export const getBagByNumber = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bagNumber } = req.params;
    const [bags]: any = await sequelize.query(
      `SELECT * FROM packing_bag WHERE bag_number = :bn`, { replacements: { bn: bagNumber } }
    );
    if (!bags.length) { res.status(404).json({ success: false, message: '袋号不存在' }); return; }
    const bag = bags[0];
    const [batches]: any = await sequelize.query(
      `SELECT * FROM packing_bag_batch WHERE bag_number = :bn ORDER BY id`, { replacements: { bn: bagNumber } }
    );
    bag.batches = batches;
    res.json(success(bag, '查询成功'));
  } catch (err) { next(err); }
};

// ==================== 箱内标签分配（将标签分配到指定箱） ====================

export const assignLabelsToBox = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { packingNumber } = req.params;
    const { label_ids, box_number } = req.body || {};

    if (!label_ids || !Array.isArray(label_ids) || label_ids.length === 0) {
      res.status(400).json({ success: false, message: '请选择要分配的标签' }); return;
    }
    if (!box_number) {
      res.status(400).json({ success: false, message: '请指定目标箱号' }); return;
    }

    // 检查装箱单状态
    const [headers]: any = await sequelize.query(
      `SELECT status FROM packing_order WHERE packing_number = :pn`, { replacements: { pn: packingNumber } }
    );
    if (!headers.length || headers[0].status !== '草稿') {
      res.status(400).json({ success: false, message: '只有草稿状态的装箱单才能调整装箱' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      // 更新标签的 box_number
      await sequelize.query(
        `UPDATE packing_bag_label SET box_number = :box_number WHERE packing_number = :pn AND id IN (:ids)`,
        { replacements: { box_number, pn: packingNumber, ids: label_ids }, transaction }
      );

      // 重新计算目标箱的汇总数据
      await recalcBoxSummary(box_number, transaction);

      // 重新计算源箱（之前分配的箱）的汇总数据
      const [affectedBoxes]: any = await sequelize.query(
        `SELECT DISTINCT box_number FROM packing_bag_label WHERE packing_number = :pn AND box_number != '' AND box_number != :box_number`,
        { replacements: { pn: packingNumber, box_number }, transaction }
      );
      for (const ab of affectedBoxes) {
        await recalcBoxSummary(ab.box_number, transaction);
      }

      await transaction.commit();
      res.json(success(null, '标签分配成功'));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 从箱中移除标签 ====================

export const removeLabelFromBox = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { packingNumber } = req.params;
    const { label_ids } = req.body || {};

    if (!label_ids || !Array.isArray(label_ids) || label_ids.length === 0) {
      res.status(400).json({ success: false, message: '请选择要移除的标签' }); return;
    }

    const [headers]: any = await sequelize.query(
      `SELECT status FROM packing_order WHERE packing_number = :pn`, { replacements: { pn: packingNumber } }
    );
    if (!headers.length || headers[0].status !== '草稿') {
      res.status(400).json({ success: false, message: '只有草稿状态的装箱单才能调整装箱' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      // 记录受影响的箱号
      const [affectedLabels]: any = await sequelize.query(
        `SELECT DISTINCT box_number FROM packing_bag_label WHERE packing_number = :pn AND id IN (:ids) AND box_number != ''`,
        { replacements: { pn: packingNumber, ids: label_ids }, transaction }
      );

      // 将标签的 box_number 清空
      await sequelize.query(
        `UPDATE packing_bag_label SET box_number = '' WHERE packing_number = :pn AND id IN (:ids)`,
        { replacements: { pn: packingNumber, ids: label_ids }, transaction }
      );

      // 重新计算受影响箱的汇总数据
      for (const al of affectedLabels) {
        await recalcBoxSummary(al.box_number, transaction);
      }

      await transaction.commit();
      res.json(success(null, '标签已移除'));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 重新创建箱分配 ====================

export const regenerateBoxes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { packingNumber } = req.params;
    const { outer_pack_qty } = req.body || {};

    const [headers]: any = await sequelize.query(
      `SELECT * FROM packing_order WHERE packing_number = :pn`, { replacements: { pn: packingNumber } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '装箱单不存在' }); return; }
    if (headers[0].status !== '草稿') {
      res.status(400).json({ success: false, message: '只有草稿状态的装箱单才能重新装箱' }); return;
    }

    const N = Number(outer_pack_qty) || Number(headers[0].total_boxes) > 0
      ? Math.ceil(headers[0].total_labels / headers[0].total_boxes) : 1;

    const transaction = await sequelize.transaction();
    try {
      // 获取所有标签
      const [labels]: any = await sequelize.query(
        `SELECT * FROM packing_bag_label WHERE packing_number = :pn ORDER BY label_sequence`,
        { replacements: { pn: packingNumber }, transaction }
      );

      if (labels.length === 0) {
        await transaction.rollback();
        res.status(400).json({ success: false, message: '无标签数据' }); return;
      }

      // 删除旧箱数据
      await sequelize.query(
        `DELETE FROM packing_box WHERE packing_number = :pn`,
        { replacements: { pn: packingNumber }, transaction }
      );

      // 清空标签的 box_number
      await sequelize.query(
        `UPDATE packing_bag_label SET box_number = '' WHERE packing_number = :pn`,
        { replacements: { pn: packingNumber }, transaction }
      );

      // 重新生成箱
      const today = new Date();
      const boxPrefix = 'BOX' + today.getFullYear() +
        String(today.getMonth() + 1).padStart(2, '0') +
        String(today.getDate()).padStart(2, '0');

      const boxSeqInfo = await getNextSequence('packing_box', 'box_number', boxPrefix, transaction);
      const boxCount = Math.ceil(labels.length / N);

      for (let i = 0; i < boxCount; i++) {
        const boxSeq = i + 1;
        const startIdx = i * N;
        const endIdx = Math.min(startIdx + N, labels.length);
        const labelsInBox = labels.slice(startIdx, endIdx);
        const actualLabelQty = labelsInBox.length;
        const totalQtyInBox = labelsInBox.reduce((sum: number, lb: any) => sum + Number(lb.label_quantity), 0);
        const isFull = actualLabelQty >= N;
        const boxNumber = formatNumber(boxSeqInfo.prefix, boxSeqInfo.startSeq + i);

        // 更新标签的 box_number
        const labelIds = labelsInBox.map((lb: any) => lb.id);
        await sequelize.query(
          `UPDATE packing_bag_label SET box_number = :box_number WHERE id IN (:ids)`,
          { replacements: { box_number: boxNumber, ids: labelIds }, transaction }
        );

        const batchNums = [...new Set(labelsInBox.map((lb: any) => lb.batch_number))];

        await sequelize.query(
          `INSERT INTO packing_box (packing_number, box_number, box_sequence, item_number, item_name, specifications, standard_bag_qty, actual_bag_qty, total_quantity, is_full, label_printed, warehouse_number, warehouse_name, status, batch_numbers)
           VALUES (:packing_number, :box_number, :box_sequence, :item_number, :item_name, :specifications, :standard_bag_qty, :actual_bag_qty, :total_quantity, :is_full, :label_printed, :warehouse_number, :warehouse_name, N'在库', :batch_numbers)`,
          {
            replacements: {
              packing_number: packingNumber,
              box_number: boxNumber, box_sequence: boxSeq,
              item_number: headers[0].item_number, item_name: headers[0].item_name,
              specifications: headers[0].specifications || '',
              standard_bag_qty: N, actual_bag_qty: actualLabelQty,
              total_quantity: totalQtyInBox, is_full: isFull ? 1 : 0, label_printed: 0,
              warehouse_number: headers[0].warehouse_number, warehouse_name: headers[0].warehouse_name,
              batch_numbers: batchNums.join(',')
            }, transaction
          }
        );
      }

      // 更新主表
      await sequelize.query(
        `UPDATE packing_order SET total_boxes = :total_boxes WHERE packing_number = :pn`,
        { replacements: { total_boxes: boxCount, pn: packingNumber }, transaction }
      );

      await transaction.commit();
      res.json(success({ total_boxes: boxCount }, '重新装箱成功'));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 辅助：重新计算箱汇总 ====================

async function recalcBoxSummary(boxNumber: string, transaction: any) {
  const [labels]: any = await sequelize.query(
    `SELECT * FROM packing_bag_label WHERE box_number = :bn ORDER BY label_sequence`,
    { replacements: { bn: boxNumber }, transaction }
  );

  if (labels.length === 0) {
    // 如果箱内没有标签了，删除该箱
    await sequelize.query(
      `DELETE FROM packing_box WHERE box_number = :bn`,
      { replacements: { bn: boxNumber }, transaction }
    );
    return;
  }

  const totalQty = labels.reduce((sum: number, lb: any) => sum + Number(lb.label_quantity), 0);
  const batchNums = [...new Set(labels.map((lb: any) => lb.batch_number))];
  const standardBagQty = Number(labels[0].standard_qty) > 0
    ? Math.round(totalQty / Number(labels[0].standard_qty) * labels.length / labels.length)
    : labels.length;

  await sequelize.query(
    `UPDATE packing_box SET actual_bag_qty = :actual_bag_qty, total_quantity = :total_quantity,
     batch_numbers = :batch_numbers WHERE box_number = :bn`,
    {
      replacements: {
        actual_bag_qty: labels.length,
        total_quantity: totalQty,
        batch_numbers: batchNums.join(','),
        bn: boxNumber
      }, transaction
    }
  );
}

// ==================== 扫箱码出库 ====================

export const shippingBoxOutbound = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { box_numbers, warehouse_number, shipping_order_number, operator, remark } = req.body || {};
    if (!box_numbers || !Array.isArray(box_numbers) || box_numbers.length === 0) {
      res.status(400).json({ success: false, message: '请提供要出库的箱号列表' }); return;
    }
    if (!warehouse_number) {
      res.status(400).json({ success: false, message: '请指定出库仓库' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      const op = operator || req.user?.username || 'system';
      const now = new Date();
      const accountingPeriod = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      const results: any[] = [];

      for (const boxNumber of box_numbers) {
        // 1. 查询箱装库存
        const [boxInvRows]: any = await sequelize.query(
          `SELECT * FROM packing_box_inventory WHERE box_number = :bn AND warehouse_number = :wn`,
          { replacements: { bn: boxNumber, wn: warehouse_number }, transaction }
        );
        if (boxInvRows.length === 0) {
          await transaction.rollback();
          res.status(400).json({ success: false, message: `箱号 ${boxNumber} 在仓库 ${warehouse_number} 中不存在` }); return;
        }
        const boxInv = boxInvRows[0];
        if (boxInv.status === '已出库') {
          await transaction.rollback();
          res.status(400).json({ success: false, message: `箱号 ${boxNumber} 已出库，不能重复出库` }); return;
        }

        // 2. 更新箱装库存状态
        await sequelize.query(
          `UPDATE packing_box_inventory SET status = N'已出库', outbound_date = GETDATE(), last_updated = GETDATE() WHERE box_number = :bn`,
          { replacements: { bn: boxNumber }, transaction }
        );

        // 3. 同步更新 packing_box 状态
        await sequelize.query(
          `UPDATE packing_box SET status = N'已出库' WHERE box_number = :bn`,
          { replacements: { bn: boxNumber }, transaction }
        );

        // 4. 查询汇总库存（出库前）
        const [summaryRow]: any = await sequelize.query(
          `SELECT id, quantity FROM finished_goods_inventory WHERE item_number = :item_number AND warehouse_number = :wn AND quality_status = N'合格品'`,
          { replacements: { item_number: boxInv.item_number, wn: warehouse_number }, transaction }
        );
        const beforeQty = summaryRow.length > 0 ? Number(summaryRow[0].quantity) : 0;
        const outboundQty = Number(boxInv.total_quantity);
        const afterQty = beforeQty - outboundQty;

        // 5. 更新汇总库存（直接扣减）
        if (summaryRow.length > 0) {
          await sequelize.query(
            `UPDATE finished_goods_inventory SET quantity = :afterQty, last_updated = GETDATE() WHERE id = :id`,
            { replacements: { afterQty, id: summaryRow[0].id }, transaction }
          );
        }

        // 6. 创建库存流水
        const txNum = await generateTransactionNumber(transaction);

        // 从 packing_bag_label 读取批次明细
        const [boxLabels]: any = await sequelize.query(
          `SELECT batch_number, SUM(label_quantity) as quantity FROM packing_bag_label WHERE box_number = :bn GROUP BY batch_number`,
          { replacements: { bn: boxNumber }, transaction }
        );
        const primaryBatch = boxLabels.length > 0 ? boxLabels[0].batch_number : (boxInv.batch_numbers || '').split(',')[0] || '';

        await sequelize.query(
          `INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
            item_number, item_name, specifications, basic_unit, product_drawing_number,
            warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
            batch_number, operator, operation_date, remark, quality_status, creation_date, accounting_period, shipping_order_number)
          VALUES (:transaction_number, :transaction_type, :source_type, :source_number,
            :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
            :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
            :batch_number, :operator, GETDATE(), :remark, :quality_status, GETDATE(), :accounting_period, :shipping_order_number)`,
          {
            replacements: {
              transaction_number: txNum, transaction_type: '出库', source_type: '扫箱码出库',
              source_number: boxNumber,
              item_number: boxInv.item_number, item_name: boxInv.item_name || '',
              specifications: boxInv.specifications || '', basic_unit: boxInv.basic_unit || '',
              product_drawing_number: '',
              warehouse_number, warehouse_name: boxInv.warehouse_name || '',
              quantity: outboundQty, before_quantity: beforeQty, after_quantity: afterQty,
              batch_number: primaryBatch,
              operator: op, remark: remark || `扫箱码出库 ${boxNumber}`,
              quality_status: '合格品', accounting_period: accountingPeriod,
              shipping_order_number: shipping_order_number || ''
            },
            transaction
          }
        );

        // 7. 写入批次明细到扩展表
        if (boxLabels.length > 0) {
          for (const bl of boxLabels) {
            await sequelize.query(
              `INSERT INTO inventory_transaction_batch (transaction_number, batch_number, quantity)
               VALUES (:txNum, :batch_number, :quantity)`,
              { replacements: { txNum, batch_number: bl.batch_number, quantity: Number(bl.quantity) }, transaction }
            );
          }
        }

        results.push({ box_number: boxNumber, item_number: boxInv.item_number, quantity: outboundQty, transaction_number: txNum });
      }

      // 9. 重新同步汇总库存确保一致
      const syncedItems = new Set<string>();
      for (const r of results) {
        if (!syncedItems.has(r.item_number)) {
          await syncFinishedGoodsSummary(r.item_number, warehouse_number, transaction, '合格品');
          syncedItems.add(r.item_number);
        }
      }

      await transaction.commit();
      res.json(success({ outbound_boxes: results }, '箱码出库成功'));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 箱装库存查询 ====================

export const getBoxInventory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, item_number = '', warehouse_number = '', status = '', search = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize + 1;

    let where = '1=1';
    const replacements: any = { offset, offsetEnd };

    if (item_number) { where += ' AND pbi.item_number = :item_number'; replacements.item_number = item_number; }
    if (warehouse_number) { where += ' AND pbi.warehouse_number = :warehouse_number'; replacements.warehouse_number = warehouse_number; }
    if (status) { where += ' AND pbi.status = :status'; replacements.status = status; }
    if (search) {
      where += ' AND (pbi.box_number LIKE :search OR pbi.item_number LIKE :search OR pbi.item_name LIKE :search OR pbi.batch_numbers LIKE :search)';
      replacements.search = `%${search}%`;
    }

    const [rows]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT ROW_NUMBER() OVER (ORDER BY pbi.inbound_date DESC) AS RowNum,
          pbi.*
        FROM packing_box_inventory pbi
        WHERE ${where}
      ) t WHERE RowNum > :offset AND RowNum <= :offsetEnd
    `, { replacements });

    const [countRows]: any = await sequelize.query(`
      SELECT COUNT(*) as total FROM packing_box_inventory pbi WHERE ${where}
    `, { replacements: { ...replacements, offset: undefined, offsetEnd: undefined } });

    const total = countRows[0]?.total || 0;
    // Remove RowNum from results
    const items = rows.map((r: any) => { const { RowNum, ...rest } = r; return rest; });

    res.json(success({ items, total, page: pageNum, limit: pageSize }));
  } catch (err) { next(err); }
};

// ==================== 整单拆箱 ====================

export const unpackPackingOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { packingNumber } = req.params;
    const { remark } = req.body || {};
    const [headers]: any = await sequelize.query(
      `SELECT * FROM packing_order WHERE packing_number = :pn`, { replacements: { pn: packingNumber } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '装箱单不存在' }); return; }
    if (headers[0].status !== '已确认') {
      res.status(400).json({ success: false, message: '只有已确认状态的装箱单才能拆箱' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      const [outBoxes]: any = await sequelize.query(
        `SELECT box_number FROM packing_box_inventory WHERE packing_number = :pn AND status = N'已出库'`,
        { replacements: { pn: packingNumber }, transaction }
      );
      if (outBoxes.length > 0) {
        const outBoxNums = outBoxes.map((b: any) => b.box_number).join(', ');
        await transaction.rollback();
        res.status(400).json({ success: false, message: `箱 ${outBoxNums} 已出库，无法拆箱` }); return;
      }

      // 获取所有在库箱的标签（已拆箱的箱批次已恢复，不重复恢复）
      const [inStockBoxNumbers]: any = await sequelize.query(
        `SELECT box_number FROM packing_box_inventory WHERE packing_number = :pn AND status = N'在库'`,
        { replacements: { pn: packingNumber }, transaction }
      );
      const inStockBoxNums = inStockBoxNumbers.map((b: any) => b.box_number);

      if (inStockBoxNums.length > 0) {
        const [labels]: any = await sequelize.query(
          `SELECT batch_number, item_number, SUM(label_quantity) as quantity FROM packing_bag_label WHERE packing_number = :pn AND box_number IN (:boxNums) GROUP BY batch_number, item_number`,
          { replacements: { pn: packingNumber, boxNums: inStockBoxNums }, transaction }
        );

        for (const bt of labels) {
          const qty = parseFloat(bt.quantity);
          await sequelize.query(
            `UPDATE finished_batch_inventory SET quantity = quantity + :qty, last_updated = GETDATE() WHERE batch_number = :batch_number AND item_number = :item_number`,
            { replacements: { qty, batch_number: bt.batch_number, item_number: bt.item_number }, transaction }
          );
        }

        const op = (req as any).user?.username || 'system';
        const now = new Date();
        const accountingPeriod = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        const totalRestoredQty = labels.reduce((s: number, l: any) => s + parseFloat(l.quantity), 0);
        const primaryBatch = labels.length > 0 ? labels[0].batch_number : '';

        if (totalRestoredQty > 0) {
          const [summaryRow]: any = await sequelize.query(
            `SELECT id, quantity FROM finished_goods_inventory WHERE item_number = :item_number AND warehouse_number = :wn AND quality_status = N'合格品'`,
            { replacements: { item_number: headers[0].item_number, wn: headers[0].warehouse_number }, transaction }
          );
          const beforeQty = summaryRow.length > 0 ? Number(summaryRow[0].quantity) : 0;
          const txNum = await generateTransactionNumber(transaction);
          await sequelize.query(
            `INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number, item_number, item_name, specifications, basic_unit, product_drawing_number, warehouse_number, warehouse_name, quantity, before_quantity, after_quantity, batch_number, operator, operation_date, remark, quality_status, creation_date, accounting_period, shipping_order_number) VALUES (:transaction_number, :transaction_type, :source_type, :source_number, :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity, :batch_number, :operator, GETDATE(), :remark, :quality_status, GETDATE(), :accounting_period, :shipping_order_number)`,
            { replacements: { transaction_number: txNum, transaction_type: '入库', source_type: '整单拆箱', source_number: packingNumber, item_number: headers[0].item_number, item_name: headers[0].item_name || '', specifications: headers[0].specifications || '', basic_unit: headers[0].basic_unit || '', product_drawing_number: '', warehouse_number: headers[0].warehouse_number, warehouse_name: headers[0].warehouse_name || '', quantity: totalRestoredQty, before_quantity: beforeQty, after_quantity: beforeQty, batch_number: primaryBatch, operator: op, remark: remark || `整单拆箱 ${packingNumber}`, quality_status: '合格品', accounting_period: accountingPeriod, shipping_order_number: '' }, transaction }
          );
          for (const bt of labels) {
            await sequelize.query(
              `INSERT INTO inventory_transaction_batch (transaction_number, batch_number, quantity) VALUES (:txNum, :batch_number, :quantity)`,
              { replacements: { txNum, batch_number: bt.batch_number, quantity: parseFloat(bt.quantity) }, transaction }
            );
          }
        }
      }

      await sequelize.query(`DELETE FROM packing_box_inventory WHERE packing_number = :pn`, { replacements: { pn: packingNumber }, transaction });
      await sequelize.query(`UPDATE packing_box SET status = N'在库' WHERE packing_number = :pn`, { replacements: { pn: packingNumber }, transaction });
      await sequelize.query(`UPDATE packing_order SET status = N'草稿' WHERE packing_number = :pn`, { replacements: { pn: packingNumber }, transaction });
      await syncFinishedGoodsSummary(headers[0].item_number, headers[0].warehouse_number, transaction, '合格品');

      await transaction.commit();
      res.json(success(null, '整单拆箱成功，装箱单已回退到草稿状态'));
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { next(err); }
};

// ==================== 逐箱拆箱 ====================

export const unpackBoxes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { box_numbers, warehouse_number, remark } = req.body || {};
    if (!box_numbers || !Array.isArray(box_numbers) || box_numbers.length === 0) {
      res.status(400).json({ success: false, message: '请提供要拆箱的箱号列表' }); return;
    }
    if (!warehouse_number) { res.status(400).json({ success: false, message: '请指定仓库' }); return; }

    const transaction = await sequelize.transaction();
    try {
      const op = (req as any).user?.username || 'system';
      const now = new Date();
      const accountingPeriod = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      const results: any[] = [];

      for (const boxNumber of box_numbers) {
        const [boxInvRows]: any = await sequelize.query(
          `SELECT * FROM packing_box_inventory WHERE box_number = :bn AND warehouse_number = :wn`,
          { replacements: { bn: boxNumber, wn: warehouse_number }, transaction }
        );
        if (boxInvRows.length === 0) {
          await transaction.rollback();
          res.status(400).json({ success: false, message: `箱号 ${boxNumber} 在仓库 ${warehouse_number} 中不存在` }); return;
        }
        const boxInv = boxInvRows[0];
        if (boxInv.status !== '在库') {
          await transaction.rollback();
          res.status(400).json({ success: false, message: `箱号 ${boxNumber} 状态为${boxInv.status}，只有'在库'状态的箱才能拆箱` }); return;
        }

        const [boxLabels]: any = await sequelize.query(
          `SELECT batch_number, item_number, SUM(label_quantity) as quantity FROM packing_bag_label WHERE box_number = :bn GROUP BY batch_number, item_number`,
          { replacements: { bn: boxNumber }, transaction }
        );

        for (const bl of boxLabels) {
          await sequelize.query(
            `UPDATE finished_batch_inventory SET quantity = quantity + :qty, last_updated = GETDATE() WHERE batch_number = :batch_number AND item_number = :item_number`,
            { replacements: { qty: parseFloat(bl.quantity), batch_number: bl.batch_number, item_number: bl.item_number }, transaction }
          );
        }

        await sequelize.query(`UPDATE packing_box_inventory SET status = N'已拆箱', last_updated = GETDATE() WHERE box_number = :bn`, { replacements: { bn: boxNumber }, transaction });
        await sequelize.query(`UPDATE packing_box SET status = N'已拆箱' WHERE box_number = :bn`, { replacements: { bn: boxNumber }, transaction });

        const txNum = await generateTransactionNumber(transaction);
        const unpackQty = Number(boxInv.total_quantity);
        const [summaryRow]: any = await sequelize.query(
          `SELECT id, quantity FROM finished_goods_inventory WHERE item_number = :item_number AND warehouse_number = :wn AND quality_status = N'合格品'`,
          { replacements: { item_number: boxInv.item_number, wn: warehouse_number }, transaction }
        );
        const beforeQty = summaryRow.length > 0 ? Number(summaryRow[0].quantity) : 0;
        const primaryBatch = boxLabels.length > 0 ? boxLabels[0].batch_number : (boxInv.batch_numbers || '').split(',')[0] || '';

        await sequelize.query(
          `INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number, item_number, item_name, specifications, basic_unit, product_drawing_number, warehouse_number, warehouse_name, quantity, before_quantity, after_quantity, batch_number, operator, operation_date, remark, quality_status, creation_date, accounting_period, shipping_order_number) VALUES (:transaction_number, :transaction_type, :source_type, :source_number, :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity, :batch_number, :operator, GETDATE(), :remark, :quality_status, GETDATE(), :accounting_period, :shipping_order_number)`,
          { replacements: { transaction_number: txNum, transaction_type: '入库', source_type: '逐箱拆箱', source_number: boxNumber, item_number: boxInv.item_number, item_name: boxInv.item_name || '', specifications: boxInv.specifications || '', basic_unit: boxInv.basic_unit || '', product_drawing_number: '', warehouse_number, warehouse_name: boxInv.warehouse_name || '', quantity: unpackQty, before_quantity: beforeQty, after_quantity: beforeQty, batch_number: primaryBatch, operator: op, remark: remark || `逐箱拆箱 ${boxNumber}`, quality_status: '合格品', accounting_period: accountingPeriod, shipping_order_number: '' }, transaction }
        );

        for (const bl of boxLabels) {
          await sequelize.query(
            `INSERT INTO inventory_transaction_batch (transaction_number, batch_number, quantity) VALUES (:txNum, :batch_number, :quantity)`,
            { replacements: { txNum, batch_number: bl.batch_number, quantity: Number(bl.quantity) }, transaction }
          );
        }

        results.push({ box_number: boxNumber, item_number: boxInv.item_number, quantity: unpackQty, transaction_number: txNum });
      }

      const syncedItems = new Set<string>();
      for (const r of results) {
        if (!syncedItems.has(r.item_number)) {
          await syncFinishedGoodsSummary(r.item_number, warehouse_number, transaction, '合格品');
          syncedItems.add(r.item_number);
        }
      }

      await transaction.commit();
      res.json(success({ unpacked_boxes: results }, '逐箱拆箱成功'));
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { next(err); }
};
