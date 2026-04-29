import { Request, Response } from 'express';
import sequelize from '../../../config/database';
import { generateOutsourcingIssueNumber } from '@/services/documentNumber.service';

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
        oo.id,
        oo.outsourcing_number,
        oo.supplier_number,
        s.supplier_name,
        oo.item_number,
        i.item_name,
        i.specifications,
        oo.planned_quantity,
        oo.issued_quantity,
        oo.received_quantity,
        oo.qualified_quantity,
        oo.issue_status,
        oo.production_order_number,
        oo.work_order_number
      FROM outsourcing_order oo
      LEFT JOIN suppliers s ON oo.supplier_number = s.supplier_number
      LEFT JOIN item_master i ON oo.item_number = i.item_number
      WHERE oo.outsourcing_number = :order_number
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

    // 查询待发物料清单（从生产单 BOM 获取）
    const [items]: any = await sequelize.query(`
      SELECT 
        b.item_number,
        i.item_name,
        i.specifications,
        b.quantity_per_unit AS planned_quantity,
        ISNULL(SUM(omid.issued_quantity), 0) AS issued_quantity,
        (b.quantity_per_unit * :planned_quantity) - ISNULL(SUM(omid.issued_quantity), 0) AS remaining_quantity,
        i.unit
      FROM bom_items b
      LEFT JOIN item_master i ON b.item_number = i.item_number
      LEFT JOIN outsourcing_material_issue_detail omid 
        ON b.item_number = omid.item_number 
        AND omid.issue_number IN (
          SELECT issue_number FROM outsourcing_material_issue 
          WHERE outsourcing_order_number = :order_number
        )
      WHERE b.parent_item_number = :item_number
      GROUP BY b.item_number, i.item_name, i.specifications, b.quantity_per_unit, i.unit
    `, {
      replacements: {
        order_number,
        item_number: orderData.item_number,
        planned_quantity: orderData.planned_quantity
      }
    });

    res.json({
      success: true,
      data: {
        order_number: orderData.outsourcing_number,
        supplier_number: orderData.supplier_number,
        supplier_name: orderData.supplier_name,
        item_number: orderData.item_number,
        item_name: orderData.item_name,
        specifications: orderData.specifications,
        planned_quantity: parseFloat(orderData.planned_quantity),
        issued_quantity: parseFloat(orderData.issued_quantity) || 0,
        received_quantity: parseFloat(orderData.received_quantity) || 0,
        qualified_quantity: parseFloat(orderData.qualified_quantity) || 0,
        issue_status: orderData.issue_status,
        production_order_number: orderData.production_order_number,
        work_order_number: orderData.work_order_number,
        items: items.map((item: any) => ({
          item_number: item.item_number,
          item_name: item.item_name,
          specifications: item.specifications,
          planned_quantity: parseFloat(item.planned_quantity),
          issued_quantity: parseFloat(item.issued_quantity),
          remaining_quantity: parseFloat(item.remaining_quantity),
          unit: item.unit
        }))
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
 * 提交委外发料（移动端）
 * POST /api/mobile/outsourcing/issue
 */
export const submitIssue = async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      order_number,
      warehouse_number,
      items,
      remark
    } = req.body;

    // 参数校验
    if (!order_number || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: '参数不完整'
      });
    }

    // 验证订单是否存在
    const [order]: any = await sequelize.query(`
      SELECT id, planned_quantity, issued_quantity, issue_status
      FROM outsourcing_order
      WHERE outsourcing_number = :order_number
    `, {
      replacements: { order_number },
      transaction
    });

    if (!order || order.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: '委外订单不存在'
      });
    }

    // 生成发料单号
    const issue_number = await generateOutsourcingIssueNumber();

    // 创建发料单主表
    await sequelize.query(`
      INSERT INTO outsourcing_material_issue (
        issue_number,
        outsourcing_order_number,
        warehouse_number,
        status,
        remark,
        creation_date,
        creation_man
      ) VALUES (
        :issue_number,
        :order_number,
        :warehouse_number,
        N'已审核',
        :remark,
        FORMAT(GETDATE(), 'yyyy/MM/dd HH:mm'),
        :username
      )
    `, {
      replacements: {
        issue_number,
        order_number,
        warehouse_number: warehouse_number || '',
        remark: remark || '',
        username: req.user?.username || 'mobile'
      },
      transaction
    });

    // 创建发料单明细并扣减库存
    let totalIssued = 0;

    for (const item of items) {
      const { item_number, issued_quantity } = item;

      if (!item_number || !issued_quantity || issued_quantity <= 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `物料 ${item_number} 的发料数量无效`
        });
      }

      // 检查库存
      const [inventory]: any = await sequelize.query(`
        SELECT quantity FROM inventory
        WHERE item_number = :item_number AND warehouse_number = :warehouse_number
      `, {
        replacements: { item_number, warehouse_number: warehouse_number || 'LINE_WH' },
        transaction
      });

      if (!inventory || inventory.length === 0 || inventory[0].quantity < issued_quantity) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `物料 ${item_number} 库存不足`
        });
      }

      // 创建发料明细
      await sequelize.query(`
        INSERT INTO outsourcing_material_issue_detail (
          issue_number,
          item_number,
          issued_quantity,
          unit_price,
          amount
        ) VALUES (
          :issue_number,
          :item_number,
          :issued_quantity,
          0,
          0
        )
      `, {
        replacements: { issue_number, item_number, issued_quantity },
        transaction
      });

      // 扣减库存（线边仓）
      await sequelize.query(`
        UPDATE inventory SET 
          quantity = quantity - :issued_quantity,
          modification_date = FORMAT(GETDATE(), 'yyyy/MM/dd HH:mm')
        WHERE item_number = :item_number AND warehouse_number = :warehouse_number
      `, {
        replacements: { issued_quantity, item_number, warehouse_number: warehouse_number || 'LINE_WH' },
        transaction
      });

      totalIssued += issued_quantity;
    }

    // 更新委外订单发料状态
    const newIssuedQuantity = (parseFloat(order[0].issued_quantity) || 0) + totalIssued;
    const plannedQuantity = parseFloat(order[0].planned_quantity);
    
    let issueStatus = '部分发料';
    if (newIssuedQuantity >= plannedQuantity) {
      issueStatus = '已发料';
    }

    await sequelize.query(`
      UPDATE outsourcing_order SET
        issued_quantity = :issued_quantity,
        issue_status = :issue_status,
        modification_date = FORMAT(GETDATE(), 'yyyy/MM/dd HH:mm')
      WHERE outsourcing_number = :order_number
    `, {
      replacements: {
        issued_quantity: newIssuedQuantity,
        issue_status: issueStatus,
        order_number
      },
      transaction
    });

    await transaction.commit();

    res.json({
      success: true,
      message: '发料成功',
      data: {
        issue_number,
        total_issued: totalIssued,
        issue_status: issueStatus
      }
    });
  } catch (error: any) {
    await transaction.rollback();
    console.error('提交发料失败:', error);
    res.status(500).json({
      success: false,
      message: '提交发料失败',
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
