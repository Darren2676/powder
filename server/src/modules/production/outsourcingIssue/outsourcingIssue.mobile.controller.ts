import { Request, Response } from 'express';
import sequelize from '../../../config/database';
import { generateMaterialTxnNumber, syncMaterialInventorySummary } from '@/services/inventory.service';
import { fifoDeductBatches, createMaterialTransaction } from '@/services/warehouse/helpers';
import { logLinesideMovement } from '@/services/linesideMovement.service';

/**
 * 获取委外发料订单详情（移动端）
 * GET /api/mobile/outsourcing/issue/:order_number
 */
export const getIssueOrder = async (req: Request, res: Response) => {
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
        oo.order_status as issue_status,
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

    // 查询待确认的备料出库申请
    const [pendingIssues]: any = await sequelize.query(`
      SELECT issue_number, warehouse_number, warehouse_name, status
      FROM outsourcing_material_issue
      WHERE outsourcing_order_number = :order_number AND status = N'待确认'
      ORDER BY creation_date ASC
    `, { replacements: { order_number } });

    // 查询所有待确认出库申请的明细
    const pendingIssuesWithDetails: any[] = [];
    for (const pi of pendingIssues) {
      const [details]: any = await sequelize.query(`
        SELECT * FROM outsourcing_material_issue_detail
        WHERE issue_number = :issue_number
        ORDER BY line_number
      `, { replacements: { issue_number: pi.issue_number } });
      pendingIssuesWithDetails.push({
        issue_number: pi.issue_number,
        warehouse_number: pi.warehouse_number,
        warehouse_name: pi.warehouse_name,
        status: pi.status,
        items: details.map((d: any) => ({
          item_number: d.item_number,
          item_name: d.item_name,
          specifications: d.specifications,
          issued_quantity: parseFloat(d.issued_quantity) || 0,
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
        issue_status: orderData.issue_status,
        production_order_number: orderData.production_order_number,
        work_order_number: orderData.work_order_number,
        pending_issues: pendingIssuesWithDetails,
        pending_issue: pendingIssuesWithDetails.length > 0 ? pendingIssuesWithDetails[0] : null,
      }
    });
  } catch (error: any) {
    console.error('获取发料订单失败:', error);
    res.status(500).json({
      success: false,
      message: '获取发料订单失败',
      error: error.message
    });
  }
};

/**
 * 确认委外发料（移动端）- 查找已有待确认出库申请并确认出库（material体系）
 * POST /api/mobile/outsourcing/issue
 */
export const submitIssue = async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();

  try {
    const { order_number, items, remark, issue_number } = req.body;

    if (!order_number) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: '委外订单号不能为空' });
    }

    // 查找已有的待确认出库申请
    let issue: any;
    if (issue_number) {
      // 指定出库单号（分批发料场景）
      const [specified]: any = await sequelize.query(`
        SELECT * FROM outsourcing_material_issue
        WHERE issue_number = :issue_number AND outsourcing_order_number = :order_number AND status = N'待确认'
      `, { replacements: { issue_number, order_number }, transaction });
      if (!specified.length) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: '指定的出库申请不存在或已确认' });
      }
      issue = specified[0];
    } else {
      // 默认取第一条待确认记录（向后兼容）
      const [pendingIssues]: any = await sequelize.query(`
        SELECT * FROM outsourcing_material_issue
        WHERE outsourcing_order_number = :order_number AND status = N'待确认'
        ORDER BY creation_date ASC
      `, { replacements: { order_number }, transaction });
      if (!pendingIssues.length) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: '未找到待确认的备料出库申请，请先审批委外订单' });
      }
      issue = pendingIssues[0];
    }
    const issueNumber = issue.issue_number;
    const operator = (req as any).user?.username || 'mobile';

    // 查询出库申请明细
    const [details]: any = await sequelize.query(`
      SELECT * FROM outsourcing_material_issue_detail WHERE issue_number = :issueNumber ORDER BY line_number
    `, { replacements: { issueNumber }, transaction });

    // 获取工序信息用于线边仓流水
    const warehouseNumber = issue.warehouse_number || '';
    const warehouseName = issue.warehouse_name || '';
    const productionOrderNumber = issue.production_order_number || '';
    const stepNumber = issue.step_number || 0;
    const workCenterNumber = issue.work_center_number || '';
    const workCenterName = issue.work_center_name || '';

    // 对每个明细行：FIFO扣减线边仓 + material流水 + 线边仓流水
    for (const d of details) {
      const issuedQty = parseFloat(d.issued_quantity) || 0;
      if (issuedQty <= 0) continue;

      // 1. 从工序线边仓 FIFO 扣减
      if (warehouseNumber) {
        await fifoDeductBatches({
          batchTable: 'material_batch_inventory',
          item_number: d.item_number,
          warehouse_number: warehouseNumber,
          totalQuantity: issuedQty,
        }, transaction);
        await syncMaterialInventorySummary(d.item_number, warehouseNumber, transaction);
      }

      // 2. 记录 material_inventory_transaction 出库流水
      const [matInfo]: any = await sequelize.query(
        `SELECT item_name, item_type, specifications, basic_unit FROM material_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number`,
        { replacements: { item_number: d.item_number, warehouse_number: warehouseNumber }, transaction }
      );
      const mat = matInfo.length > 0 ? matInfo[0] : {};
      const txNum = await generateMaterialTxnNumber(transaction);
      await createMaterialTransaction({
        transaction_number: txNum,
        transaction_type: '出库',
        source_type: '委外备料出库',
        source_number: issueNumber,
        item_number: d.item_number,
        item_name: d.item_name || mat.item_name || '',
        item_type: mat.item_type || '',
        specifications: d.specifications || mat.specifications || '',
        basic_unit: d.unit || mat.basic_unit || '',
        warehouse_number: warehouseNumber,
        warehouse_name: warehouseName,
        quantity: issuedQty,
        before_quantity: 0, after_quantity: 0,
        batch_number: '',
        supplier_number: '', supplier_name: '',
        operator,
        remark: '移动端委外备料出库确认'
      }, transaction);

      // 3. 记录线边仓出库流水
      await logLinesideMovement({
        transactionType: '出线边',
        sourceType: '委外备料出库',
        sourceNumber: issueNumber,
        productionOrderNumber,
        itemNumber: d.item_number,
        itemName: d.item_name || '',
        specifications: d.specifications || '',
        basicUnit: d.unit || '',
        stepNumber,
        workCenterNumber,
        workCenterName,
        quantity: issuedQty,
        direction: 'OUT',
        operator,
        remark: '移动端委外备料出库'
      }, transaction);
    }

    // 更新发料单状态
    await sequelize.query(
      `UPDATE outsourcing_material_issue SET status = N'已出库' WHERE issue_number = :issueNumber`,
      { replacements: { issueNumber }, transaction }
    );

    await transaction.commit();

    res.json({
      success: true,
      message: '发料确认成功，库存已扣减',
      data: {
        issue_number: issueNumber,
      }
    });
  } catch (error: any) {
    await transaction.rollback();
    console.error('确认发料失败:', error);
    res.status(500).json({
      success: false,
      message: '确认发料失败',
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
 * POST /api/mobile/outsourcing/print-label
 */
export const printLabel = async (req: Request, res: Response) => {
  try {
    const { type, order_number, item_number, item_name, supplier_name, planned_quantity } = req.body;
    
    // 生成标签 HTML
    const labelHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>标签 - ${order_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Microsoft YaHei', sans-serif; padding: 20px; }
    .label-container { 
      width: 80mm; 
      border: 2px solid #333; 
      padding: 10px; 
      margin: 0 auto;
    }
    .label-header { 
      text-align: center; 
      border-bottom: 1px solid #333; 
      padding-bottom: 8px; 
      margin-bottom: 8px; 
    }
    .label-type { 
      font-size: 14px; 
      color: #666; 
    }
    .label-title { 
      font-size: 18px; 
      font-weight: bold; 
      margin-top: 4px; 
    }
    .label-row { 
      display: flex; 
      justify-content: space-between; 
      padding: 6px 0; 
      border-bottom: 1px dashed #ccc; 
      font-size: 12px; 
    }
    .label-row .label-key { 
      color: #666; 
    }
    .label-row .label-val { 
      font-weight: bold; 
    }
    .label-barcode { 
      text-align: center; 
      padding: 10px 0; 
      margin-top: 8px; 
      border-top: 1px solid #333; 
    }
    .barcode-text { 
      font-family: monospace; 
      font-size: 14px; 
      letter-spacing: 2px; 
    }
    .print-btn { 
      display: block; 
      width: 100%; 
      padding: 10px; 
      margin-top: 20px; 
      background: #1989fa; 
      color: white; 
      border: none; 
      font-size: 16px; 
      cursor: pointer; 
    }
    @media print {
      .print-btn, .no-print { display: none !important; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="label-container">
    <div class="label-header">
      <div class="label-type">${type === 'issue' ? '委外发料' : '委外收回'}</div>
      <div class="label-title">${item_name || ''}</div>
    </div>
    <div class="label-row">
      <span class="label-key">订单号</span>
      <span class="label-val">${order_number}</span>
    </div>
    <div class="label-row">
      <span class="label-key">物料编号</span>
      <span class="label-val">${item_number}</span>
    </div>
    <div class="label-row">
      <span class="label-key">供应商</span>
      <span class="label-val">${supplier_name || ''}</span>
    </div>
    <div class="label-row">
      <span class="label-key">数量</span>
      <span class="label-val">${planned_quantity}</span>
    </div>
    <div class="label-row">
      <span class="label-key">日期</span>
      <span class="label-val">${new Date().toLocaleDateString('zh-CN')}</span>
    </div>
    <div class="label-barcode">
      <div class="barcode-text">*${order_number}*</div>
    </div>
  </div>
  <button class="print-btn no-print" onclick="window.print()">🖨️ 打印标签</button>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(labelHtml);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: '生成标签失败',
      error: error.message
    });
  }
};
