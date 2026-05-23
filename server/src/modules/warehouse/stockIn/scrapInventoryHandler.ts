/**
 * 报废入库库存处理器
 *
 * 当报废入库单（stock_in_type='报废入库'）审批通过后，
 * 自动将报废物料写入报废仓批次库存、汇总库存，并记录库存流水。
 * 反审时自动回退库存，并同步回退关联的不合格品记录和检验记录状态。
 */
import sequelize from '@/config/database';
import { generateBatchNumber, generateTransactionNumber, syncFinishedGoodsSummary } from '@/services/inventory.service';
import { createTransactionBatches, validateAccountingPeriodOpen } from '@/services/warehouse/helpers';
import { createLogger } from '@/config/logger';

const log = createLogger('scrapInventoryHandler');

/**
 * 报废入库单审批通过 → 自动更新库存
 *
 * 流程：
 * 1. 查询入库单头和明细
 * 2. 判断是否为报废入库类型
 * 3. 为每个明细行生成报废批次号（FB前缀）写入 finished_batch_inventory
 * 4. 更新 finished_goods_inventory 汇总库存
 * 5. 记录 inventory_transaction 流水（source_type='报废入库'）
 */
export const onStockInApproved = async (stockInNumber: string): Promise<void> => {
  // 1. 获取入库单头
  const [headers]: any = await sequelize.query(
    `SELECT * FROM stock_in WHERE stock_in_number = :number`,
    { replacements: { number: stockInNumber } }
  );
  if (!headers.length) {
    log.warn({ stockInNumber }, '入库单不存在，跳过库存处理');
    return;
  }
  const header = headers[0];

  // 2. 只处理报废入库类型
  if (header.stock_in_type !== '报废入库') {
    // 非报废入库的stock_in（如采购入库）有独立的confirmStockIn流程，此处不做处理
    return;
  }

  // 3. 获取入库明细
  const [details]: any = await sequelize.query(
    `SELECT * FROM stock_in_detail WHERE stock_in_number = :number ORDER BY line_number`,
    { replacements: { number: stockInNumber } }
  );
  if (!details.length) {
    log.warn({ stockInNumber }, '入库单无明细行，跳过库存处理');
    return;
  }

  // 使用入库单上已有的会计期间，若无则取当前年月
  const accountingPeriod = header.accounting_period || new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');

  // 校验会计期间
  await validateAccountingPeriodOpen(accountingPeriod);

  const transaction = await sequelize.transaction();
  try {
    // 更新入库单会计期间（若原来为空则补上）
    if (!header.accounting_period) {
      await sequelize.query(
        `UPDATE stock_in SET accounting_period = :ap WHERE stock_in_number = :number`,
        { replacements: { ap: accountingPeriod, number: stockInNumber }, transaction }
      );
    }

    for (const d of details) {
      const qty = Number(d.stock_in_quantity) || 0;
      if (qty <= 0) continue;

      // 生成报废批次号
      const batchNo = await generateBatchNumber('FB', transaction);

      // 写入成品批次库存
      await sequelize.query(`
        INSERT INTO finished_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit,
          product_drawing_number, warehouse_number, warehouse_name, quantity, initial_quantity,
          production_order_number, inbound_date, status, quality_status, creation_date, last_updated)
        VALUES (:batch_number, :item_number, :item_name, :specifications, :basic_unit,
          :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quantity,
          N'', GETDATE(), N'正常', N'不合格品', GETDATE(), GETDATE())
      `, {
        replacements: {
          batch_number: batchNo,
          item_number: d.item_number || '',
          item_name: d.item_name || '',
          specifications: d.specifications || '',
          basic_unit: d.basic_unit || '',
          product_drawing_number: d.product_drawing_number || '',
          warehouse_number: header.warehouse_number,
          warehouse_name: header.warehouse_name,
          quantity: qty
        },
        transaction
      });

      // 更新汇总库存（不合格品）
      const [existing]: any = await sequelize.query(
        `SELECT id, quantity FROM finished_goods_inventory
         WHERE item_number = :item_number AND warehouse_number = :wn AND quality_status = N'不合格品'`,
        { replacements: { item_number: d.item_number, wn: header.warehouse_number }, transaction }
      );

      const beforeQty = existing.length > 0 ? Number(existing[0].quantity) : 0;
      const afterQty = beforeQty + qty;

      if (existing.length > 0) {
        await sequelize.query(
          `UPDATE finished_goods_inventory SET quantity = :afterQty, last_updated = GETDATE() WHERE id = :id`,
          { replacements: { afterQty, id: existing[0].id }, transaction }
        );
      } else {
        await sequelize.query(`
          INSERT INTO finished_goods_inventory (item_number, item_name, specifications, basic_unit,
            product_drawing_number, warehouse_number, warehouse_name, quantity, quality_status, last_updated, creation_date)
          VALUES (:item_number, :item_name, :specifications, :basic_unit,
            :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, N'不合格品', GETDATE(), GETDATE())
        `, {
          replacements: {
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            product_drawing_number: d.product_drawing_number || '',
            warehouse_number: header.warehouse_number,
            warehouse_name: header.warehouse_name,
            quantity: afterQty
          },
          transaction
        });
      }

      // 记录库存流水
      const txNum = await generateTransactionNumber(transaction);
      await sequelize.query(`
        INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
          item_number, item_name, specifications, basic_unit, product_drawing_number,
          warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
          batch_number, operator, operation_date, remark, quality_status, creation_date, accounting_period)
        VALUES (:transaction_number, N'入库', N'报废入库', :source_number,
          :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
          :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
          :batch_number, :operator, GETDATE(), :remark, N'不合格品', GETDATE(), :accounting_period)
      `, {
        replacements: {
          transaction_number: txNum,
          source_number: stockInNumber,
          item_number: d.item_number || '',
          item_name: d.item_name || '',
          specifications: d.specifications || '',
          basic_unit: d.basic_unit || '',
          product_drawing_number: d.product_drawing_number || '',
          warehouse_number: header.warehouse_number,
          warehouse_name: header.warehouse_name,
          quantity: qty,
          before_quantity: beforeQty,
          after_quantity: afterQty,
          batch_number: batchNo,
          operator: header.creation_man || '',
          remark: `报废入库 - 入库单 ${stockInNumber}`,
          accounting_period: accountingPeriod
        },
        transaction
      });

      // 回写批次号到入库明细
      await sequelize.query(
        `UPDATE stock_in_detail SET batch_number = :batchNo WHERE id = :detailId`,
        { replacements: { batchNo, detailId: d.id }, transaction }
      );
    }

    await transaction.commit();
    log.info({ stockInNumber }, '报废入库库存更新成功');
  } catch (e) {
    await transaction.rollback();
    log.error({ stockInNumber, e }, '报废入库库存更新失败');
    throw e;
  }
};

/**
 * 报废入库单反审 → 回退库存 + 回退关联单据状态
 *
 * 流程：
 * 1. 查找关联的库存流水
 * 2. 扣减/删除报废批次库存
 * 3. 同步汇总库存
 * 4. 标记流水为作废
 * 5. 回退不合格品记录（handling_status → '待处理'，清空处理字段）
 * 6. 回退检验记录（清空 defect_handling，回退 inspect_status）
 */
export const onStockInReversed = async (stockInNumber: string): Promise<void> => {
  // 1. 获取入库单头
  const [headers]: any = await sequelize.query(
    `SELECT * FROM stock_in WHERE stock_in_number = :number`,
    { replacements: { number: stockInNumber } }
  );
  if (!headers.length) return;
  const header = headers[0];

  // 只处理报废入库类型
  if (header.stock_in_type !== '报废入库') return;

  // 2. 查找关联库存流水
  const [txRows]: any = await sequelize.query(
    `SELECT * FROM inventory_transaction WHERE source_number = :rn AND source_type = N'报废入库' AND (status IS NULL OR status = N'正常')`,
    { replacements: { rn: stockInNumber } }
  );
  if (!txRows.length) {
    log.warn({ stockInNumber }, '未找到关联的库存流水，跳过回退');
    return;
  }

  const transaction = await sequelize.transaction();
  try {
    for (const tx of txRows) {
      const batchNo = tx.batch_number;
      if (!batchNo) continue;

      // 扣减批次库存
      const [batchInv]: any = await sequelize.query(
        `SELECT id, quantity FROM finished_batch_inventory
         WHERE batch_number = :bn AND item_number = :in AND warehouse_number = :wn`,
        { replacements: { bn: batchNo, in: tx.item_number, wn: tx.warehouse_number }, transaction }
      );

      if (batchInv.length > 0) {
        const currentQty = Number(batchInv[0].quantity);
        const originalQty = Number(tx.quantity);

        if (currentQty < originalQty) {
          throw new Error(
            `物料 ${tx.item_number} 的批次 ${batchNo} 已被后续操作消耗（剩余 ${currentQty}，需回退 ${originalQty}），无法反审。请先撤消后续操作。`
          );
        }

        const newQty = currentQty - originalQty;
        if (newQty <= 0) {
          await sequelize.query(
            `DELETE FROM finished_batch_inventory WHERE id = :id`,
            { replacements: { id: batchInv[0].id }, transaction }
          );
        } else {
          await sequelize.query(
            `UPDATE finished_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
            { replacements: { qty: newQty, id: batchInv[0].id }, transaction }
          );
        }
      }

      // 同步汇总库存（不合格品）
      await syncFinishedGoodsSummary(tx.item_number, tx.warehouse_number, transaction, '不合格品');
    }

    // 标记流水为作废
    await sequelize.query(
      `UPDATE inventory_transaction SET status = N'作废', void_operator = :op, void_date = GETDATE()
       WHERE source_number = :rn AND source_type = N'报废入库' AND (status IS NULL OR status = N'正常')`,
      { replacements: { rn: stockInNumber, op: 'system' }, transaction }
    );

    // ====== 回退关联单据状态 ======

    // 1. 查找关联的不合格品记录
    const [ncRecords]: any = await sequelize.query(
      `SELECT nonconforming_number, source_type, source_number, item_number FROM nonconforming_product WHERE stock_in_number = :stockInNumber`,
      { replacements: { stockInNumber }, transaction }
    );

    if (ncRecords.length > 0) {
      // 2. 重置不合格品记录为待处理
      await sequelize.query(`
        UPDATE nonconforming_product SET
          handling_status = N'待处理', handling_method = N'',
          handling_quantity = 0, stock_in_number = N'',
          scrap_type = N'', scrap_quantity = 0,
          handling_date = NULL, handling_remark = N'', operator = N''
        WHERE stock_in_number = :stockInNumber
      `, { replacements: { stockInNumber }, transaction });

      // 3. 逐条回退检验记录
      for (const nc of ncRecords) {
        if (nc.source_type === '生产检验') {
          // 清空 production_inspection.defect_handling
          await sequelize.query(
            `UPDATE production_inspection SET defect_handling = N'' WHERE inspection_number = :sourceNumber`,
            { replacements: { sourceNumber: nc.source_number }, transaction }
          );

          // 查找 process_task_number 并回退 inspect_status → '不合格'
          const [inspRows]: any = await sequelize.query(
            `SELECT process_task_number FROM production_inspection WHERE inspection_number = :sourceNumber`,
            { replacements: { sourceNumber: nc.source_number }, transaction }
          );
          if (inspRows.length && inspRows[0].process_task_number) {
            await sequelize.query(
              `UPDATE process_task SET inspect_status = N'不合格' WHERE process_task_number = :taskNo`,
              { replacements: { taskNo: inspRows[0].process_task_number }, transaction }
            );
          }
        } else if (nc.source_type === '来料检验') {
          // 清空 purchase_quality_inspection.defect_handling
          await sequelize.query(
            `UPDATE purchase_quality_inspection SET defect_handling = N'' WHERE inspection_number = :sourceNumber`,
            { replacements: { sourceNumber: nc.source_number }, transaction }
          );

          // 查找原始入库单号并回退 stock_in_detail.inspect_status
          const [purchaseInspRows]: any = await sequelize.query(
            `SELECT stock_in_number, item_number FROM purchase_quality_inspection WHERE inspection_number = :sourceNumber`,
            { replacements: { sourceNumber: nc.source_number }, transaction }
          );
          if (purchaseInspRows.length && purchaseInspRows[0].stock_in_number) {
            await sequelize.query(
              `UPDATE stock_in_detail SET inspect_status = N'' WHERE stock_in_number = :origStockIn AND item_number = :itemNum`,
              { replacements: { origStockIn: purchaseInspRows[0].stock_in_number, itemNum: purchaseInspRows[0].item_number }, transaction }
            );
          }
        }
      }

      log.info({ stockInNumber, ncCount: ncRecords.length }, '报废入库反审-关联单据状态已回退');
    }

    await transaction.commit();
    log.info({ stockInNumber }, '报废入库反审库存回退成功');
  } catch (e) {
    await transaction.rollback();
    log.error({ stockInNumber, e }, '报废入库反审库存回退失败');
    throw e;
  }
};
