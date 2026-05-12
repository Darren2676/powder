import { Request, Response } from 'express';
import sequelize from '../../../config/database';
import { generateOutsourcingInspectionNumber, generateOutsourcingReturnStockinNumber } from '@/services/documentNumber.service';
import { generateBatchNumber, generateMaterialTxnNumber, syncMaterialInventorySummary } from '@/services/inventory.service';
import { upsertMaterialInventory, createMaterialTransaction } from '@/services/warehouse/helpers';
import { logLinesideMovement } from '@/services/linesideMovement.service';

/**
 * 获取委外收回订单详情（移动端）
 * GET /api/mobile/outsourcing/receipt/:order_number
 */
export const getReceiptOrder = async (req: Request, res: Response) => {
  try {
    const { order_number } = req.params;

    // 查询委外订单
    const [order]: any = await sequelize.query(`
      SELECT 
        oo.outsourcing_order_number as order_number,
        oo.supplier_number,
        oo.supplier_name,
        oo.item_number,
        oo.item_name,
        oo.specifications,
        oo.planned_quantity,
        oo.received_quantity,
        oo.order_status as receipt_status,
        oo.production_order_number,
        oo.process_task_number as work_order_number
      FROM outsourcing_order oo
      WHERE oo.outsourcing_order_number = :order_number
    `, {
      replacements: { order_number }
    });

    if (!order || order.length === 0) {
      return res.status(404).json({
        success: false,
        message: '委外订单不存在'
      });
    }

    const orderData = order[0];

    // 查询待确认的委外回收申请
    const [pendingReceipts]: any = await sequelize.query(`
      SELECT receipt_number, warehouse_number, warehouse_name, status,
             inspection_warehouse_number, inspection_warehouse_name
      FROM outsourcing_receipt
      WHERE outsourcing_order_number = :order_number AND status = N'待确认'
      ORDER BY creation_date ASC
    `, { replacements: { order_number } });

    // 查询所有待确认回收申请的明细
    const pendingReceiptsWithDetails: any[] = [];
    for (const pr of pendingReceipts) {
      const [details]: any = await sequelize.query(`
        SELECT * FROM outsourcing_receipt_detail
        WHERE receipt_number = :receipt_number
        ORDER BY line_number
      `, { replacements: { receipt_number: pr.receipt_number } });
      pendingReceiptsWithDetails.push({
        receipt_number: pr.receipt_number,
        warehouse_number: pr.warehouse_number,
        warehouse_name: pr.warehouse_name,
        inspection_warehouse_number: pr.inspection_warehouse_number,
        inspection_warehouse_name: pr.inspection_warehouse_name,
        status: pr.status,
        items: details.map((d: any) => ({
          item_number: d.item_number,
          item_name: d.item_name,
          specifications: d.specifications,
          receipt_quantity: parseFloat(d.receipt_quantity) || 0,
          unit: d.unit,
        }))
      });
    }

    res.json({
      success: true,
      data: {
        order_number: orderData.order_number,
        supplier_number: orderData.supplier_number,
        supplier_name: orderData.supplier_name,
        item_number: orderData.item_number,
        item_name: orderData.item_name,
        specifications: orderData.specifications,
        planned_quantity: parseFloat(orderData.planned_quantity),
        received_quantity: parseFloat(orderData.received_quantity) || 0,
        receipt_status: orderData.receipt_status,
        production_order_number: orderData.production_order_number,
        work_order_number: orderData.work_order_number,
        pending_receipts: pendingReceiptsWithDetails,
        pending_receipt: pendingReceiptsWithDetails.length > 0 ? pendingReceiptsWithDetails[0] : null,
      }
    });
  } catch (error: any) {
    console.error('获取收回订单失败:', error);
    res.status(500).json({
      success: false,
      message: '获取收回订单失败',
      error: error.message
    });
  }
};

/**
 * 确认委外收回（移动端）- 根据物料来料检验字段分流：
 *   需检验 → 入待检仓 + 创建质检单
 *   免检   → 直接入库到下道线边仓 + 跳过质检
 * POST /api/mobile/outsourcing/receipt
 */
export const submitReceipt = async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();

  try {
    const { order_number, items, remark, receipt_number } = req.body;

    if (!order_number) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: '委外订单号不能为空' });
    }

    // 查找已有的待确认回收申请
    let receipt: any;
    if (receipt_number) {
      // 指定回收单号（分批回收场景）
      const [specified]: any = await sequelize.query(`
        SELECT * FROM outsourcing_receipt
        WHERE receipt_number = :receipt_number AND outsourcing_order_number = :order_number AND status = N'待确认'
      `, { replacements: { receipt_number, order_number }, transaction });
      if (!specified.length) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: '指定的回收申请不存在或已确认' });
      }
      receipt = specified[0];
    } else {
      // 默认取第一条待确认记录（向后兼容）
      const [pendingReceipts]: any = await sequelize.query(`
        SELECT * FROM outsourcing_receipt
        WHERE outsourcing_order_number = :order_number AND status = N'待确认'
        ORDER BY creation_date ASC
      `, { replacements: { order_number }, transaction });
      if (!pendingReceipts.length) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: '未找到待确认的委外回收申请，请先审批委外订单' });
      }
      receipt = pendingReceipts[0];
    }
    const receiptNumber = receipt.receipt_number;
    const operator = (req as any).user?.username || 'mobile';
    const inspWhNumber = receipt.inspection_warehouse_number || receipt.warehouse_number || 'INSP_WH';
    const inspWhName = receipt.inspection_warehouse_name || receipt.warehouse_name || '待检仓';
    const nextWhNumber = receipt.next_step_warehouse_number || '';
    const nextWhName = receipt.next_step_warehouse_name || '';
    const nextStepNumber = receipt.next_step_number || 0;
    const nextWcNumber = receipt.next_work_center_number || '';
    const nextWcName = receipt.next_work_center_name || '';

    // 查询回收申请明细
    const [details]: any = await sequelize.query(`
      SELECT * FROM outsourcing_receipt_detail WHERE receipt_number = :receiptNumber ORDER BY line_number
    `, { replacements: { receiptNumber }, transaction });

    // 查询每个物料的来料检验标志
    const itemInspectionMap: Record<string, boolean> = {};
    for (const d of details) {
      if (!d.item_number || itemInspectionMap[d.item_number] !== undefined) continue;
      const [itemRows]: any = await sequelize.query(
        `SELECT incoming_inspection FROM item_master WHERE item_number = :item_number`,
        { replacements: { item_number: d.item_number }, transaction }
      );
      itemInspectionMap[d.item_number] = itemRows.length > 0 && itemRows[0].incoming_inspection === 'Y';
    }

    // 分流：需检验 vs 免检
    const needsInspection = details.filter((d: any) => itemInspectionMap[d.item_number || ''] === true);
    const noInspection = details.filter((d: any) => itemInspectionMap[d.item_number || ''] !== true);

    let inspectionNumber: string | null = null;
    let stockinNumber: string | null = null;

    // ========== 路径A：需检验物料 → 入待检仓 + 创建质检单 ==========
    if (needsInspection.length > 0) {
      for (const d of needsInspection) {
        const recvQty = parseFloat(d.receipt_quantity) || 0;
        if (recvQty <= 0) continue;

        // 1. 生成批次号，写入 material_batch_inventory（待检仓）
        const batchNo = await generateBatchNumber('MB', transaction);
        await sequelize.query(
          `INSERT INTO material_batch_inventory (batch_number, item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, initial_quantity, inbound_date, status, creation_date, last_updated) VALUES (:batch_number, :item_number, :item_name, N'半成品', :specifications, :basic_unit, :warehouse_number, :warehouse_name, :quantity, :quantity, GETDATE(), N'正常', GETDATE(), GETDATE())`,
          {
            replacements: {
              batch_number: batchNo,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              specifications: d.specifications || '',
              basic_unit: d.unit || '',
              warehouse_number: inspWhNumber,
              warehouse_name: inspWhName,
              quantity: recvQty,
            },
            transaction
          }
        );

        // 2. 更新 material_inventory 汇总表
        await upsertMaterialInventory({
          item_number: d.item_number || '',
          item_name: d.item_name || '',
          item_type: '半成品',
          specifications: d.specifications || '',
          basic_unit: d.unit || '',
          warehouse_number: inspWhNumber,
          warehouse_name: inspWhName,
          deltaQuantity: recvQty,
        }, transaction);

        // 3. 记录 material_inventory_transaction 入库流水
        const txNum = await generateMaterialTxnNumber(transaction);
        await createMaterialTransaction({
          transaction_number: txNum,
          transaction_type: '入库',
          source_type: '委外回收入待检',
          source_number: receiptNumber,
          item_number: d.item_number || '',
          item_name: d.item_name || '',
          item_type: '半成品',
          specifications: d.specifications || '',
          basic_unit: d.unit || '',
          warehouse_number: inspWhNumber,
          warehouse_name: inspWhName,
          quantity: recvQty,
          before_quantity: 0,
          after_quantity: 0,
          batch_number: batchNo,
          supplier_number: '', supplier_name: '',
          operator,
          remark: '移动端委外回收入待检仓'
        }, transaction);
      }

      // 创建委外质检单（仅包含需检验物料）
      inspectionNumber = await generateOutsourcingInspectionNumber(transaction);
      await sequelize.query(`
        INSERT INTO outsourcing_inspection (
          inspection_number, receipt_number, outsourcing_order_number,
          inspection_date, inspection_status, remark, creation_date, creation_man
        ) VALUES (
          :inspectionNumber, :receiptNumber, :orderNumber,
          GETDATE(), N'待检验', N'移动端委外收回自动创建', GETDATE(), :username
        )
      `, {
        replacements: {
          inspectionNumber,
          receiptNumber,
          orderNumber: order_number,
          username: operator
        },
        transaction
      });

      // 创建质检明细
      for (const d of needsInspection) {
        await sequelize.query(`
          INSERT INTO outsourcing_inspection_detail (
            inspection_number, item_number, planned_quantity, actual_quantity
          ) VALUES (
            :inspectionNumber, :item_number, :planned_quantity, :actual_quantity
          )
        `, {
          replacements: {
            inspectionNumber,
            item_number: d.item_number || '',
            planned_quantity: d.receipt_quantity || 0,
            actual_quantity: d.receipt_quantity || 0
          },
          transaction
        });
      }
    }

    // ========== 路径B：免检物料 → 直接入库到下道线边仓 + 更新completed_quantity ==========
    if (noInspection.length > 0) {
      // 查询委外订单信息
      const [orderRows]: any = await sequelize.query(
        `SELECT * FROM outsourcing_order WHERE outsourcing_order_number = :orderNumber`,
        { replacements: { orderNumber: order_number }, transaction }
      );
      const order = orderRows.length > 0 ? orderRows[0] : null;
      const productionOrderNumber = order?.production_order_number || '';

      // 创建回收入库单
      stockinNumber = await generateOutsourcingReturnStockinNumber(transaction);
      await sequelize.query(`
        INSERT INTO outsourcing_return_stockin (
          stockin_number, outsourcing_order_number, receipt_number, inspection_number,
          warehouse_from, warehouse_to, step_number, work_center_number,
          production_order_number, stockin_date, status, remark,
          creation_date, creation_man
        ) VALUES (
          :stockin_number, :order_number, :receipt_number, :inspection_number,
          :warehouse_from, :warehouse_to, :step_number, :work_center_number,
          :production_order_number, GETDATE(), N'已入库', N'移动端免检直接入库',
          GETDATE(), :creation_man
        )
      `, {
        replacements: {
          stockin_number: stockinNumber,
          order_number: order_number,
          receipt_number: receiptNumber,
          inspection_number: '',
          warehouse_from: '',
          warehouse_to: nextWhNumber,
          step_number: nextStepNumber,
          work_center_number: nextWcNumber,
          production_order_number: productionOrderNumber,
          creation_man: operator || 'mobile'
        },
        transaction
      });

      let totalDirectStockinQty = 0;

      for (let si = 0; si < noInspection.length; si++) {
        const d = noInspection[si];
        const recvQty = parseFloat(d.receipt_quantity) || 0;
        if (recvQty <= 0) continue;
        totalDirectStockinQty += recvQty;

        // 插入入库单明细
        await sequelize.query(`
          INSERT INTO outsourcing_return_stockin_detail (
            stockin_number, line_number, item_number, item_name,
            specifications, basic_unit, qualified_quantity, batch_number
          ) VALUES (
            :stockin_number, :line_number, :item_number, :item_name,
            :specifications, :basic_unit, :qualified_quantity, ''
          )
        `, {
          replacements: {
            stockin_number: stockinNumber,
            line_number: (si + 1) * 10,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            basic_unit: d.unit || '',
            qualified_quantity: recvQty,
          },
          transaction
        });

        const itemNumber = d.item_number || '';
        const itemName = d.item_name || '';
        const specifications = d.specifications || '';
        const basicUnit = d.unit || '';

        // 直接入库到下道工序线边仓
        if (nextWhNumber) {
          const batchNo = await generateBatchNumber('MB', transaction);
          await sequelize.query(
            `INSERT INTO material_batch_inventory (batch_number, item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, initial_quantity, production_order_number, inbound_date, status, creation_date, last_updated) VALUES (:batch_number, :item_number, :item_name, N'半成品', :specifications, :basic_unit, :warehouse_number, :warehouse_name, :quantity, :quantity, :production_order_number, GETDATE(), N'正常', GETDATE(), GETDATE())`,
            {
              replacements: {
                batch_number: batchNo, item_number: itemNumber, item_name: itemName,
                specifications, basic_unit: basicUnit,
                warehouse_number: nextWhNumber, warehouse_name: nextWhName,
                quantity: recvQty, production_order_number: productionOrderNumber
              },
              transaction
            }
          );
          await upsertMaterialInventory({
            item_number: itemNumber, item_name: itemName,
            item_type: '半成品', specifications, basic_unit: basicUnit,
            warehouse_number: nextWhNumber, warehouse_name: nextWhName,
            deltaQuantity: recvQty,
          }, transaction);

          const txNumIn = await generateMaterialTxnNumber(transaction);
          await createMaterialTransaction({
            transaction_number: txNumIn,
            transaction_type: '入库',
            source_type: '委外免检直接入库',
            source_number: stockinNumber,
            item_number: itemNumber,
            item_name: itemName,
            item_type: '半成品',
            specifications,
            basic_unit: basicUnit,
            warehouse_number: nextWhNumber,
            warehouse_name: nextWhName,
            quantity: recvQty,
            before_quantity: 0, after_quantity: 0,
            batch_number: batchNo,
            supplier_number: '', supplier_name: '',
            operator,
            remark: '移动端委外免检直接入库-线边仓入库'
          }, transaction);
        }

        // 线边仓流水：当前委外工序OUT
        if (order) {
          await logLinesideMovement({
            transactionType: '出线边',
            sourceType: '委外免检直接入库',
            sourceNumber: stockinNumber,
            productionOrderNumber,
            itemNumber: itemNumber,
            itemName: itemName,
            specifications,
            basicUnit: basicUnit,
            stepNumber: order.step_number || 0,
            workCenterNumber: order.work_center_number || '',
            workCenterName: order.work_center_name || '',
            quantity: recvQty,
            direction: 'OUT',
            operator,
            remark: '移动端委外免检直接入库'
          }, transaction);
        }

        // 线边仓流水：下道工序IN
        if (nextStepNumber > 0) {
          await logLinesideMovement({
            transactionType: '入线边',
            sourceType: '委外免检直接入库',
            sourceNumber: stockinNumber,
            productionOrderNumber,
            itemNumber: itemNumber,
            itemName: itemName,
            specifications,
            basicUnit: basicUnit,
            stepNumber: nextStepNumber,
            workCenterNumber: nextWcNumber,
            workCenterName: nextWcName,
            quantity: recvQty,
            direction: 'IN',
            operator,
            remark: '移动端委外免检直接入库-下道工序'
          }, transaction);
        }
      }

      // 更新 process_task.completed_quantity
      if (order?.process_task_number && totalDirectStockinQty > 0) {
        await sequelize.query(
          `UPDATE process_task SET completed_quantity = ISNULL(completed_quantity, 0) + :qty, task_status = CASE WHEN ISNULL(completed_quantity, 0) + :qty2 >= planned_quantity THEN N'已完成' ELSE N'进行中' END WHERE process_task_number = :ptn`,
          { replacements: { qty: totalDirectStockinQty, qty2: totalDirectStockinQty, ptn: order.process_task_number }, transaction }
        );
      }

      // 更新委外订单 qualified_quantity 和 order_status
      if (order && totalDirectStockinQty > 0) {
        const newQualifiedQty = (parseFloat(order.qualified_quantity) || 0) + totalDirectStockinQty;
        const plannedQty = parseFloat(order.planned_quantity) || 0;
        const orderStatus = newQualifiedQty >= plannedQty ? '已完成' : '部分收回';
        await sequelize.query(
          `UPDATE outsourcing_order SET qualified_quantity = :qty, order_status = :status WHERE outsourcing_order_number = :orderNumber`,
          { replacements: { qty: newQualifiedQty, status: orderStatus, orderNumber: order_number }, transaction }
        );
      }
    }

    // 更新收回单状态和检验状态
    const inspectionStatus = noInspection.length === details.length
      ? '免检'
      : (needsInspection.length === details.length ? '待检验' : '部分待检');
    await sequelize.query(
      `UPDATE outsourcing_receipt SET status = N'已收回', inspection_status = :inspectionStatus WHERE receipt_number = :receiptNumber`,
      { replacements: { receiptNumber, inspectionStatus }, transaction }
    );

    // 更新委外订单 received_quantity（仅记录回收数量，不改 order_status）
    const totalReceived = details.reduce((sum: number, d: any) => sum + (parseFloat(d.receipt_quantity) || 0), 0);
    await sequelize.query(
      `UPDATE outsourcing_order SET received_quantity = ISNULL(received_quantity, 0) + :qty WHERE outsourcing_order_number = :orderNumber`,
      { replacements: { qty: totalReceived, orderNumber: order_number }, transaction }
    );

    await transaction.commit();

    const msg = noInspection.length === details.length
      ? '收回确认成功，物料免检已直接入库'
      : (needsInspection.length === details.length
        ? '收回确认成功，已入待检仓并创建质检单'
        : '收回确认成功，部分物料入待检仓待检验，部分物料免检直接入库');

    res.json({
      success: true,
      message: msg,
      data: {
        receipt_number: receiptNumber,
        inspection_number: inspectionNumber,
        stockin_number: stockinNumber,
      }
    });
  } catch (error: any) {
    await transaction.rollback();
    console.error('确认收回失败:', error);
    res.status(500).json({
      success: false,
      message: '确认收回失败',
      error: error.message
    });
  }
};

/**
 * 上传照片
 * POST /api/mobile/outsourcing/:type/:number/photos
 */
export const uploadPhotos = async (req: Request, res: Response) => {
  try {
    const { type, number } = req.params;
    // TODO: 实现照片上传逻辑
    // 1. 接收 multipart/form-data
    // 2. 保存到服务器
    // 3. 记录到数据库
    
    res.json({
      success: true,
      message: '照片上传成功'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: '照片上传失败',
      error: error.message
    });
  }
};

/**
 * 打印标签
 * GET /api/mobile/outsourcing/:type/:number/label
 */
export const printLabel = async (req: Request, res: Response) => {
  try {
    const { type, number } = req.params;
    
    // 获取发料单/收回单信息
    const tableName = type === 'issue' ? 'outsourcing_material_issue' : 'outsourcing_receipt';
    const [data]: any = await sequelize.query(`
      SELECT * FROM ${tableName} WHERE ${type === 'issue' ? 'issue_number' : 'receipt_number'} = :number
    `, {
      replacements: { number }
    });

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        message: '单据不存在'
      });
    }

    res.json({
      success: true,
      data: data[0]
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: '获取标签数据失败',
      error: error.message
    });
  }
};
