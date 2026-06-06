/**
 * 退料控制器
 * 
 * 支持部分退料场景：
 * - 创建退料单：将部分物料退回仓库，冲减备料已领量，写入负数成本快照
 * - 撤回退料单：将退料回退的物料重新扣回，恢复备料已领量，删除负数快照
 * - 退料单列表/详情查询
 */

import { Request, Response, NextFunction } from 'express';
import sequelize from '@/config/database';
import dayjs from 'dayjs';
import { success } from '@/utils/response.util';
import { generateMaterialTxnNumber, syncMaterialInventorySummary } from '@/services/inventory.service';
import { createMaterialTransaction } from '@/services/warehouse/helpers';
import { logLinesideMovement } from '@/services/linesideMovement.service';
import { writeReturnSnapshot, deleteCostSnapshotBySource, ReturnSnapshotItem } from '@/services/materialCostSnapshot.service';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 生成退料单编号 ====================
const generateReturnNumber = async (factoryCode: string = '', tx: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `MR-${today}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(return_number) as max_num FROM material_return WHERE return_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' }, transaction: tx }
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return prefix + String(seq).padStart(3, '0');
};

// ==================== 创建退料单 ====================
export const createMaterialReturn = async (req: Request, res: Response, next: NextFunction) => {
  const transaction = await sequelize.transaction();
  try {
    const factoryCode = await getFactoryCode(req);
    const user = (req as any).user;
    const { issue_number, items, remark } = req.body;

    if (!issue_number) {
      await transaction.rollback();
      res.status(400).json({ success: false, message: '领料单编号不能为空' });
      return;
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      res.status(400).json({ success: false, message: '退料明细不能为空' });
      return;
    }

    // A. 查询领料单主表
    const [issueRows]: any = await sequelize.query(
      `SELECT issue_number, production_order_number, preparation_number,
              item_number, item_name, specifications, basic_unit,
              planned_quantity, total_issue_items
       FROM material_issue WHERE issue_number = :issueNo`,
      { replacements: { issueNo: issue_number }, transaction }
    );
    if (!issueRows.length) {
      await transaction.rollback();
      res.status(404).json({ success: false, message: '领料单不存在' });
      return;
    }
    const issue = issueRows[0];

    // B. 查询领料明细
    const [detailRows]: any = await sequelize.query(
      `SELECT id, material_number, actual_quantity, batch_number,
              step_number, work_center_name, default_warehouse
       FROM material_issue_detail WHERE issue_number = :issueNo`,
      { replacements: { issueNo: issue_number }, transaction }
    );

    // C. 计算每种物料已退数量
    const [returnedRows]: any = await sequelize.query(
      `SELECT material_number, SUM(return_quantity) as total_returned
       FROM material_return_detail
       WHERE return_number IN (SELECT return_number FROM material_return WHERE issue_number = :issueNo)
       GROUP BY material_number`,
      { replacements: { issueNo: issue_number }, transaction }
    );
    const returnedMap = new Map<string, number>();
    for (const r of returnedRows) {
      returnedMap.set(r.material_number, parseFloat(r.total_returned) || 0);
    }

    // D. 校验退料数量
    const validItems: any[] = [];
    for (const item of items) {
      const returnQty = parseFloat(item.return_quantity) || 0;
      if (returnQty <= 0) continue;

      // 查找领料明细中的已领数量
      const issueDetail = detailRows.find((d: any) => d.material_number === item.material_number);
      if (!issueDetail) {
        await transaction.rollback();
        res.status(400).json({ success: false, message: `物料 ${item.material_number} 不在领料单 ${issue_number} 中` });
        return;
      }

      const issuedQty = parseFloat(issueDetail.actual_quantity) || 0;
      const alreadyReturned = returnedMap.get(item.material_number) || 0;
      const maxReturn = issuedQty - alreadyReturned;

      if (returnQty > maxReturn) {
        await transaction.rollback();
        res.status(400).json({
          success: false,
          message: `物料 ${item.material_number} 退料数量 ${returnQty} 超过可退量 ${maxReturn}（已领${issuedQty}，已退${alreadyReturned}）`
        });
        return;
      }

      validItems.push({
        ...item,
        return_quantity: returnQty,
        batch_number: item.batch_number || issueDetail.batch_number || '',
        step_number: item.step_number != null ? item.step_number : issueDetail.step_number,
        work_center_name: item.work_center_name || issueDetail.work_center_name || '',
        default_warehouse: item.default_warehouse || issueDetail.default_warehouse || '',
      });
    }

    if (validItems.length === 0) {
      await transaction.rollback();
      res.status(400).json({ success: false, message: '无有效退料明细（数量需大于0）' });
      return;
    }

    // E. 生成退料单编号 + 插入主表
    const returnNumber = await generateReturnNumber(factoryCode, transaction);
    const now = dayjs().format('YYYY/MM/DD HH:mm');

    await sequelize.query(`
      INSERT INTO material_return (return_number, production_order_number, preparation_number, issue_number, return_status, total_return_items, remark, creation_date, creation_man)
      VALUES (:return_number, :production_order_number, :preparation_number, :issue_number, N'已退料', :total_return_items, :remark, :creation_date, :creation_man)
    `, {
      replacements: {
        return_number: returnNumber,
        production_order_number: issue.production_order_number,
        preparation_number: issue.preparation_number,
        issue_number: issue_number,
        total_return_items: validItems.length,
        remark: remark || '',
        creation_date: now,
        creation_man: user?.username || '',
      },
      transaction,
    });

    // F. 插入退料明细 + 库存回退
    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];
      const returnQty = item.return_quantity;

      // 插入明细
      await sequelize.query(`
        INSERT INTO material_return_detail (return_number, line_number, material_number, material_name, material_type, unit, return_quantity, batch_number, step_number, work_center_name, default_warehouse, remark)
        VALUES (:return_number, :line_number, :material_number, :material_name, :material_type, :unit, :return_quantity, :batch_number, :step_number, :work_center_name, :default_warehouse, :remark)
      `, {
        replacements: {
          return_number: returnNumber,
          line_number: i + 1,
          material_number: item.material_number,
          material_name: item.material_name || '',
          material_type: item.material_type || '',
          unit: item.unit || '',
          return_quantity: returnQty,
          batch_number: item.batch_number || '',
          step_number: item.step_number,
          work_center_name: item.work_center_name || '',
          default_warehouse: item.default_warehouse || '',
          remark: item.remark || '',
        },
        transaction,
      });

      // F2. 库存回退
      const batchNumber = (item.batch_number || '').trim();
      let targetWh = (item.default_warehouse || '').trim();

      // 解析退回仓库
      if (targetWh) {
        const [whCheck]: any = await sequelize.query(
          `SELECT TOP 1 warehouse_number FROM material_inventory WHERE item_number = :mn AND warehouse_number = :wh`,
          { replacements: { mn: item.material_number, wh: targetWh }, transaction }
        );
        if (!whCheck.length) targetWh = '';
      }
      if (!targetWh) {
        const [whFallback]: any = await sequelize.query(
          `SELECT TOP 1 warehouse_number FROM material_inventory WHERE item_number = :mn ORDER BY quantity DESC`,
          { replacements: { mn: item.material_number }, transaction }
        );
        if (whFallback.length > 0) targetWh = whFallback[0].warehouse_number;
      }
      if (!targetWh) {
        console.warn(`[materialReturn] 物料 ${item.material_number} 无库存记录，跳过库存回退`);
        continue;
      }

      // 优先批次回退
      let batchRestored = false;
      if (batchNumber) {
        const [batchRows]: any = await sequelize.query(
          `SELECT id, quantity FROM material_batch_inventory
           WHERE batch_number = :bn AND item_number = :mn AND warehouse_number = :wh`,
          { replacements: { bn: batchNumber, mn: item.material_number, wh: targetWh }, transaction }
        );
        if (batchRows.length > 0) {
          const beforeQty = Number(batchRows[0].quantity);
          const afterQty = beforeQty + returnQty;
          await sequelize.query(
            `UPDATE material_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :bid`,
            { replacements: { qty: afterQty, bid: batchRows[0].id }, transaction }
          );
          await syncMaterialInventorySummary(item.material_number, targetWh, transaction);

          const mtNum = await generateMaterialTxnNumber(factoryCode, transaction);
          await createMaterialTransaction({
            transaction_number: mtNum,
            transaction_type: '入库',
            source_type: '退料入库',
            source_number: returnNumber,
            item_number: item.material_number,
            item_name: item.material_name || '',
            item_type: item.material_type || '',
            specifications: '',
            basic_unit: item.unit || '',
            warehouse_number: targetWh,
            warehouse_name: '',
            quantity: returnQty,
            before_quantity: beforeQty,
            after_quantity: afterQty,
            batch_number: batchNumber,
            operator: user?.username || '',
            remark: `退料单 ${returnNumber}`
          }, transaction);
          batchRestored = true;
        }
      }

      // 汇总回退
      if (!batchRestored) {
        const [invRows]: any = await sequelize.query(
          `SELECT id, quantity, item_name, item_type, specifications, basic_unit, warehouse_name
           FROM material_inventory WHERE item_number = :mn AND warehouse_number = :wh`,
          { replacements: { mn: item.material_number, wh: targetWh }, transaction }
        );
        if (invRows.length > 0) {
          const beforeQty = Number(invRows[0].quantity);
          const afterQty = beforeQty + returnQty;
          await sequelize.query(
            `UPDATE material_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :iid`,
            { replacements: { qty: afterQty, iid: invRows[0].id }, transaction }
          );

          const mtNum = await generateMaterialTxnNumber(factoryCode, transaction);
          await createMaterialTransaction({
            transaction_number: mtNum,
            transaction_type: '入库',
            source_type: '退料入库',
            source_number: returnNumber,
            item_number: item.material_number,
            item_name: invRows[0].item_name || item.material_name || '',
            item_type: invRows[0].item_type || '',
            specifications: invRows[0].specifications || '',
            basic_unit: invRows[0].basic_unit || item.unit || '',
            warehouse_number: targetWh,
            warehouse_name: invRows[0].warehouse_name || '',
            quantity: returnQty,
            before_quantity: beforeQty,
            after_quantity: afterQty,
            batch_number: batchNumber,
            operator: user?.username || '',
            remark: `退料单 ${returnNumber}`
          }, transaction);
        } else {
          console.warn(`[materialReturn] 物料 ${item.material_number} 仓库 ${targetWh} 无库存记录，跳过回退`);
        }
      }

      // F3. 回退备料明细已领量
      const [prepDetails]: any = await sequelize.query(
        `SELECT TOP 1 id FROM material_preparation_detail
         WHERE preparation_number = :prepNo AND material_number = :mn AND step_number = :step
         ORDER BY id`,
        { replacements: { prepNo: issue.preparation_number, mn: item.material_number, step: item.step_number || 0 }, transaction }
      );
      if (prepDetails.length > 0) {
        await sequelize.query(
          `UPDATE material_preparation_detail SET issued_quantity = ISNULL(issued_quantity, 0) - :qty WHERE id = :detailId`,
          { replacements: { qty: returnQty, detailId: prepDetails[0].id }, transaction }
        );
      }
    }

    // G. 重算备料单状态
    if (issue.preparation_number) {
      const [statusRows]: any = await sequelize.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN ISNULL(issued_quantity, 0) >= ISNULL(required_quantity, 0) AND ISNULL(required_quantity, 0) > 0 THEN 1 ELSE 0 END) as fully_issued,
          SUM(CASE WHEN ISNULL(issued_quantity, 0) > 0 THEN 1 ELSE 0 END) as partially_issued
        FROM material_preparation_detail
        WHERE preparation_number = :prepNo
      `, { replacements: { prepNo: issue.preparation_number }, transaction });

      let newStatus = '未领料';
      if (statusRows.length > 0) {
        const { total, fully_issued, partially_issued } = statusRows[0];
        if (fully_issued >= total && total > 0) {
          newStatus = '已领料';
        } else if (partially_issued > 0) {
          newStatus = '部分领料';
        }
      }
      await sequelize.query(
        `UPDATE material_preparation SET preparation_status = :status WHERE preparation_number = :prepNo`,
        { replacements: { status: newStatus, prepNo: issue.preparation_number }, transaction }
      );
    }

    // H. 重算生产单状态
    if (issue.production_order_number && issue.preparation_number) {
      try {
        const [minStepRows]: any = await sequelize.query(
          `SELECT MIN(step_number) as first_step FROM material_preparation_detail WHERE preparation_number = :prepNo AND step_number IS NOT NULL`,
          { replacements: { prepNo: issue.preparation_number }, transaction }
        );
        const firstStep = minStepRows[0]?.first_step;
        if (firstStep != null) {
          const [firstStepStatus]: any = await sequelize.query(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN ISNULL(issued_quantity, 0) >= ISNULL(required_quantity, 0) AND ISNULL(required_quantity, 0) > 0 THEN 1 ELSE 0 END) as fully_issued
            FROM material_preparation_detail
            WHERE preparation_number = :prepNo AND step_number = :firstStep
          `, { replacements: { prepNo: issue.preparation_number, firstStep }, transaction });
          const fTotal = parseInt(firstStepStatus[0]?.total) || 0;
          const fIssued = parseInt(firstStepStatus[0]?.fully_issued) || 0;
          if (fTotal > 0 && fIssued < fTotal) {
            await sequelize.query(
              `UPDATE production_order SET plan_status = N'已派发' WHERE production_order_number = :orderNo AND plan_status = N'已备料'`,
              { replacements: { orderNo: issue.production_order_number }, transaction }
            );
          }
        }
      } catch (e) { console.log('[materialReturn] 生产单状态重算跳过:', e); }
    }

    // I. 线边仓对冲：出线边记录
    try {
      // 查询该领料单的入线边记录，按物料汇总
      const [linesideRows]: any = await sequelize.query(
        `SELECT item_number, step_number, work_center_number, work_center_name,
                item_name, specifications, basic_unit, SUM(quantity) as total_qty
         FROM lineside_inventory_transaction
         WHERE source_number = :issueNo AND transaction_type = N'入线边'
         GROUP BY item_number, step_number, work_center_number, work_center_name,
                  item_name, specifications, basic_unit`,
        { replacements: { issueNo: issue_number }, transaction }
      );

      for (const item of validItems) {
        const lsMatch = linesideRows.find((ls: any) => ls.item_number === item.material_number);
        if (lsMatch) {
          await logLinesideMovement({
            transactionType: '出线边',
            sourceType: '退料出线',
            sourceNumber: returnNumber,
            productionOrderNumber: issue.production_order_number || '',
            itemNumber: item.material_number || '',
            itemName: lsMatch.item_name || '',
            specifications: lsMatch.specifications || '',
            basicUnit: lsMatch.basic_unit || '',
            stepNumber: item.step_number || lsMatch.step_number || 0,
            workCenterNumber: lsMatch.work_center_number || '',
            workCenterName: lsMatch.work_center_name || '',
            quantity: item.return_quantity,
            direction: 'OUT',
            operator: user?.username || '',
            remark: `退料单 ${returnNumber}`
          }, transaction);
        }
      }
    } catch (lsErr) { console.error('[materialReturn] 线边仓对冲失败:', lsErr); }

    // J. 写入退料成本快照（负数）
    try {
      const snapshotItems: ReturnSnapshotItem[] = validItems.map((item: any) => ({
        production_order_number: issue.production_order_number || '',
        preparation_number: issue.preparation_number || '',
        material_number: item.material_number || '',
        material_name: item.material_name || '',
        material_type: item.material_type || '',
        unit: item.unit || '',
        return_quantity: item.return_quantity,
        step_number: item.step_number != null ? item.step_number : null,
        work_center_name: item.work_center_name || '',
      }));
      await writeReturnSnapshot(snapshotItems, returnNumber, user?.username || '', transaction);
    } catch (snapErr) {
      console.error('[materialReturn] 退料成本快照写入失败:', snapErr);
    }

    await transaction.commit();
    res.json(success({ return_number: returnNumber }, `退料单 ${returnNumber} 创建成功`));
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

// ==================== 撤回退料单 ====================
export const deleteMaterialReturn = async (req: Request, res: Response, next: NextFunction) => {
  const transaction = await sequelize.transaction();
  try {
    const factoryCode = await getFactoryCode(req);
    const user = (req as any).user;
    const { id } = req.params;

    // A. 查询退料单主表
    const [returnRows]: any = await sequelize.query(
      `SELECT return_number, production_order_number, preparation_number, issue_number
       FROM material_return WHERE return_number = :id`,
      { replacements: { id }, transaction }
    );
    if (!returnRows.length) {
      await transaction.rollback();
      res.status(404).json({ success: false, message: '退料单不存在' });
      return;
    }
    const ret = returnRows[0];
    const returnNumber = ret.return_number;

    // B. 查询退料明细
    const [detailRows]: any = await sequelize.query(
      `SELECT id, material_number, material_name, material_type, unit,
              return_quantity, batch_number, step_number, work_center_name, default_warehouse
       FROM material_return_detail WHERE return_number = :returnNo`,
      { replacements: { returnNo: returnNumber }, transaction }
    );

    // C. 逐行重新扣减库存（把退回的物料再扣回去）
    for (const detail of detailRows) {
      const returnQty = parseFloat(detail.return_quantity) || 0;
      if (returnQty <= 0) continue;

      const batchNumber = (detail.batch_number || '').trim();
      let targetWh = (detail.default_warehouse || '').trim();

      // 解析仓库
      if (targetWh) {
        const [whCheck]: any = await sequelize.query(
          `SELECT TOP 1 warehouse_number FROM material_inventory WHERE item_number = :mn AND warehouse_number = :wh`,
          { replacements: { mn: detail.material_number, wh: targetWh }, transaction }
        );
        if (!whCheck.length) targetWh = '';
      }
      if (!targetWh) {
        const [whFallback]: any = await sequelize.query(
          `SELECT TOP 1 warehouse_number FROM material_inventory WHERE item_number = :mn ORDER BY quantity DESC`,
          { replacements: { mn: detail.material_number }, transaction }
        );
        if (whFallback.length > 0) targetWh = whFallback[0].warehouse_number;
      }
      if (!targetWh) {
        console.warn(`[deleteMaterialReturn] 物料 ${detail.material_number} 无库存记录，跳过`);
        continue;
      }

      // 扣减汇总库存
      const [invRows]: any = await sequelize.query(
        `SELECT id, quantity FROM material_inventory WHERE item_number = :mn AND warehouse_number = :wh`,
        { replacements: { mn: detail.material_number, wh: targetWh }, transaction }
      );
      if (invRows.length > 0) {
        const beforeQty = Number(invRows[0].quantity);
        const afterQty = beforeQty - returnQty;
        await sequelize.query(
          `UPDATE material_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :iid`,
          { replacements: { qty: afterQty, iid: invRows[0].id }, transaction }
        );

        const mtNum = await generateMaterialTxnNumber(factoryCode, transaction);
        await createMaterialTransaction({
          transaction_number: mtNum,
          transaction_type: '出库',
          source_type: '退料撤回',
          source_number: returnNumber,
          item_number: detail.material_number,
          item_name: detail.material_name || '',
          item_type: detail.material_type || '',
          specifications: '',
          basic_unit: detail.unit || '',
          warehouse_number: targetWh,
          warehouse_name: '',
          quantity: returnQty,
          before_quantity: beforeQty,
          after_quantity: afterQty,
          batch_number: batchNumber,
          operator: user?.username || '',
          remark: `撤回退料单 ${returnNumber}`
        }, transaction);
      }

      // D. 恢复备料明细已领量
      const [prepDetails]: any = await sequelize.query(
        `SELECT TOP 1 id FROM material_preparation_detail
         WHERE preparation_number = :prepNo AND material_number = :mn AND step_number = :step
         ORDER BY id`,
        { replacements: { prepNo: ret.preparation_number, mn: detail.material_number, step: detail.step_number || 0 }, transaction }
      );
      if (prepDetails.length > 0) {
        await sequelize.query(
          `UPDATE material_preparation_detail SET issued_quantity = ISNULL(issued_quantity, 0) + :qty WHERE id = :detailId`,
          { replacements: { qty: returnQty, detailId: prepDetails[0].id }, transaction }
        );
      }
    }

    // E. 重算备料单状态
    if (ret.preparation_number) {
      const [statusRows]: any = await sequelize.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN ISNULL(issued_quantity, 0) >= ISNULL(required_quantity, 0) AND ISNULL(required_quantity, 0) > 0 THEN 1 ELSE 0 END) as fully_issued,
          SUM(CASE WHEN ISNULL(issued_quantity, 0) > 0 THEN 1 ELSE 0 END) as partially_issued
        FROM material_preparation_detail
        WHERE preparation_number = :prepNo
      `, { replacements: { prepNo: ret.preparation_number }, transaction });

      let newStatus = '未领料';
      if (statusRows.length > 0) {
        const { total, fully_issued, partially_issued } = statusRows[0];
        if (fully_issued >= total && total > 0) {
          newStatus = '已领料';
        } else if (partially_issued > 0) {
          newStatus = '部分领料';
        }
      }
      await sequelize.query(
        `UPDATE material_preparation SET preparation_status = :status WHERE preparation_number = :prepNo`,
        { replacements: { status: newStatus, prepNo: ret.preparation_number }, transaction }
      );
    }

    // F. 重算生产单状态
    if (ret.production_order_number && ret.preparation_number) {
      try {
        const [minStepRows]: any = await sequelize.query(
          `SELECT MIN(step_number) as first_step FROM material_preparation_detail WHERE preparation_number = :prepNo AND step_number IS NOT NULL`,
          { replacements: { prepNo: ret.preparation_number }, transaction }
        );
        const firstStep = minStepRows[0]?.first_step;
        if (firstStep != null) {
          const [firstStepStatus]: any = await sequelize.query(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN ISNULL(issued_quantity, 0) >= ISNULL(required_quantity, 0) AND ISNULL(required_quantity, 0) > 0 THEN 1 ELSE 0 END) as fully_issued
            FROM material_preparation_detail
            WHERE preparation_number = :prepNo AND step_number = :firstStep
          `, { replacements: { prepNo: ret.preparation_number, firstStep }, transaction });
          const fTotal = parseInt(firstStepStatus[0]?.total) || 0;
          const fIssued = parseInt(firstStepStatus[0]?.fully_issued) || 0;
          if (fTotal > 0 && fIssued >= fTotal) {
            // 首道工序全部领完 → 恢复已备料状态
            await sequelize.query(
              `UPDATE production_order SET plan_status = N'已备料' WHERE production_order_number = :orderNo AND plan_status = N'已派发'`,
              { replacements: { orderNo: ret.production_order_number }, transaction }
            );
          }
        }
      } catch (e) { console.log('[deleteMaterialReturn] 生产单状态重算跳过:', e); }
    }

    // G. 删除成本快照
    try {
      await deleteCostSnapshotBySource(returnNumber, transaction);
    } catch (snapErr) {
      console.error('[deleteMaterialReturn] 成本快照删除失败:', snapErr);
    }

    // H. 删除线边仓对冲记录（退料出线边的反向）
    try {
      // 撤回退料时：补回入线边记录
      const [linesideRows]: any = await sequelize.query(
        `SELECT item_number, step_number, work_center_number, work_center_name,
                item_name, specifications, basic_unit, quantity
         FROM lineside_inventory_transaction
         WHERE source_number = :returnNo AND transaction_type = N'出线边'`,
        { replacements: { returnNo: returnNumber }, transaction }
      );
      for (const ls of linesideRows) {
        await logLinesideMovement({
          transactionType: '入线边',
          sourceType: '退料撤回',
          sourceNumber: returnNumber,
          productionOrderNumber: ret.production_order_number || '',
          itemNumber: ls.item_number || '',
          itemName: ls.item_name || '',
          specifications: ls.specifications || '',
          basicUnit: ls.basic_unit || '',
          stepNumber: ls.step_number || 0,
          workCenterNumber: ls.work_center_number || '',
          workCenterName: ls.work_center_name || '',
          quantity: parseFloat(ls.quantity) || 0,
          direction: 'IN',
          operator: user?.username || '',
          remark: `撤回退料出线 ${returnNumber}`
        }, transaction);
      }
    } catch (lsErr) { console.error('[deleteMaterialReturn] 线边仓恢复失败:', lsErr); }

    // I. 删除退料单
    await sequelize.query(
      `DELETE FROM material_return_detail WHERE return_number = :returnNo`,
      { replacements: { returnNo: returnNumber }, transaction }
    );
    await sequelize.query(
      `DELETE FROM material_return WHERE return_number = :returnNo`,
      { replacements: { returnNo: returnNumber }, transaction }
    );

    await transaction.commit();
    res.json(success(null, `退料单 ${returnNumber} 已撤回，库存与状态已恢复`));
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

// ==================== 退料单列表 ====================
export const getMaterialReturns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search, production_order_number, issue_number } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = 'WHERE 1=1';
    const replacements: any = {};

    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      whereClause += ' AND r.factory_id = :_factoryId';
      replacements._factoryId = _factoryId;
    }

    if (search) {
      whereClause += ` AND (r.return_number LIKE :search OR r.production_order_number LIKE :search OR r.issue_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (production_order_number) {
      whereClause += ` AND r.production_order_number = :pon`;
      replacements.pon = production_order_number;
    }
    if (issue_number) {
      whereClause += ` AND r.issue_number = :in`;
      replacements.in = issue_number;
    }

    const [countRows]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM material_return r ${whereClause}`,
      { replacements }
    );
    const total = countRows[0].total;

    const [rows]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT r.*, 
          (SELECT COUNT(*) FROM material_return_detail WHERE return_number = r.return_number) as detail_count,
          ROW_NUMBER() OVER (ORDER BY r.creation_date DESC) AS _row_num
        FROM material_return r
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + Number(limit) } });

    res.json(success({ data: rows, total, page: Number(page), limit: Number(limit) }));
  } catch (err) { next(err); }
};

// ==================== 退料单详情 ====================
export const getMaterialReturnDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);

    const [headers]: any = await sequelize.query(
      `SELECT * FROM material_return WHERE return_number = :id${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`,
      { replacements: { id, ...(_factoryId !== null ? { _factoryId } : {}) } }
    );
    if (!headers.length) {
      res.status(404).json({ success: false, message: '退料单不存在' });
      return;
    }

    const [details]: any = await sequelize.query(
      `SELECT * FROM material_return_detail WHERE return_number = :id ORDER BY line_number`,
      { replacements: { id } }
    );

    res.json(success({ header: headers[0], details }));
  } catch (err) { next(err); }
};
