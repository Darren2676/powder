import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import dayjs from 'dayjs';

/** 操作类型中英文映射 */
const operationTypeNameMap: Record<string, string> = {
  'PRODUCE_IN': '生产入库',
  'PRODUCE_OUT': '生产出库',
  'PURCHASE_IN': '采购入库',
  'PURCHASE_OUT': '采购出库',
  'SALE_OUT': '销售出库',
  'SALE_IN': '销售退回入库',
  'TRANSFER_IN': '调拨入库',
  'TRANSFER_OUT': '调拨出库',
  'OTHER_IN': '其他入库',
  'OTHER_OUT': '其他出库',
  'SCRAP_OUT': '报废出库',
  'INVENTORY_GAIN': '盘盈入库',
  'INVENTORY_LOSS': '盘亏出库',
  'OUTSOURCE_IN': '委外入库',
  'OUTSOURCE_OUT': '委外出库',
  'RETURN_IN': '退货入库',
  'RETURN_OUT': '退货出库'
};

/** 时间戳转字符串 */
function tsToStr(ts: any): string {
  if (!ts) return '';
  const n = typeof ts === 'number' ? ts : parseInt(ts);
  if (isNaN(n) || n <= 0) return '';
  return dayjs(n).format('YYYY-MM-DD HH:mm:ss');
}

// ==================== Webhook 接收 ====================

export const receiveWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body;

    // 记录收到的 Webhook 原始数据（调试用）
    console.log(`[新核云Webhook] 收到请求, requestId=${payload?.requestId}, businessType=${payload?.businessType}`);

    // TODO: 签名验证 (x-nct-sig)
    // const sig = req.headers['x-nct-sig'];
    // const timestamp = req.headers['x-nct-time'];
    // 待提供签名算法后补充验证逻辑

    if (!payload || !payload.data) {
      res.status(400).json({ success: false, message: '无效的 Webhook 数据' });
      return;
    }

    const data = payload.data;
    const requestId = payload.requestId || '';
    const businessType = payload.businessType || 0;
    const operationType = data.operationType || '';
    const operationTypeName = operationTypeNameMap[operationType] || operationType;

    // 检查是否已处理过（幂等）
    const [existing]: any = await sequelize.query(
      `SELECT id FROM xhy_inventory_transaction WHERE request_id = :requestId`,
      { replacements: { requestId } }
    );
    if (existing.length > 0) {
      console.log(`[新核云Webhook] requestId=${requestId} 已存在，跳过`);
      res.json({ success: true, message: '已处理', id: existing[0].id });
      return;
    }

    // 在事务中保存主表+明细
    const transaction = await sequelize.transaction();
    try {
      // 插入主表
      const [insertResult]: any = await sequelize.query(
        `INSERT INTO xhy_inventory_transaction (
          request_id, business_type, xhy_id, code, source_code,
          staff_code, operation_type_id, operation_type, operation_type_name,
          comments, xhy_create_time, xhy_operation_time, raw_json
        ) OUTPUT INSERTED.id VALUES (
          :requestId, :businessType, :xhyId, :code, :sourceCode,
          :staffCode, :opTypeId, :opType, :opTypeName,
          :comments, :createTime, :opTime, :rawJson
        )`,
        {
          replacements: {
            requestId,
            businessType,
            xhyId: data.id || 0,
            code: data.code || '',
            sourceCode: data.sourceCode || '',
            staffCode: data.staffCode || '',
            opTypeId: data.operationTypeId || 0,
            opType: operationType,
            opTypeName: operationTypeName,
            comments: data.comments || '',
            createTime: tsToStr(data.createTime),
            opTime: tsToStr(data.operationTime),
            rawJson: JSON.stringify(payload).substring(0, 8000) // 限制长度
          },
          transaction
        }
      );
      const transactionId = insertResult[0].id;

      // 插入明细
      const records = data.records || [];
      for (const rec of records) {
        await sequelize.query(
          `INSERT INTO xhy_inventory_transaction_detail (
            transaction_id, xhy_record_id, item_code, item_name, item_unit,
            item_specifications, warehouse_code, location_code,
            another_warehouse_code, another_location_code,
            batch_number, lot_car_code,
            quantity, qualified_quantity, unqualified_quantity, price,
            production_unit, production_unit_quantity,
            inventory_unit, inventory_unit_quantity,
            relative_order_number, relative_product_code, relative_product_quantity,
            applicant, applicant_department, comments, work_order_remark,
            check_account_date
          ) VALUES (
            :txnId, :recId, :itemCode, :itemName, :itemUnit,
            :itemSpecs, :whCode, :locCode,
            :anotherWhCode, :anotherLocCode,
            :batchNum, :lotCarCode,
            :qty, :qualifiedQty, :unqualifiedQty, :price,
            :prodUnit, :prodUnitQty,
            :invUnit, :invUnitQty,
            :relOrderNum, :relProdCode, :relProdQty,
            :applicant, :applicantDept, :comments, :woRemark,
            :checkAcctDate
          )`,
          {
            replacements: {
              txnId: transactionId,
              recId: rec.id || 0,
              itemCode: rec.itemCode || '',
              itemName: rec.itemName || '',
              itemUnit: rec.itemUnit || '',
              itemSpecs: Array.isArray(rec.itemSpecifications) ? rec.itemSpecifications.join('; ') : (rec.itemSpecifications || ''),
              whCode: rec.warehouseCode || '',
              locCode: rec.locationCode || '',
              anotherWhCode: rec.anotherWarehouseCode || '',
              anotherLocCode: rec.anotherLocationCode || '',
              batchNum: rec.batchNumber || '',
              lotCarCode: rec.lotCarCode || '',
              qty: rec.quantity || 0,
              qualifiedQty: rec.qualifiedQuantity || 0,
              unqualifiedQty: rec.unqualifiedQuantity || 0,
              price: rec.price || 0,
              prodUnit: rec.productionUnit || '',
              prodUnitQty: rec.productionUnitQuantity || 0,
              invUnit: rec.inventoryUnit || '',
              invUnitQty: rec.inventoryUnitQuantity || 0,
              relOrderNum: rec.relativeOrderNumber || '',
              relProdCode: rec.relativeProductCode || '',
              relProdQty: rec.relativeProductQuantity || 0,
              applicant: rec.applicant || '',
              applicantDept: rec.applicantDepartment || '',
              comments: rec.comments || '',
              woRemark: rec.workOrderRemark || '',
              checkAcctDate: tsToStr(rec.checkAccountDate)
            },
            transaction
          }
        );
      }

      await transaction.commit();
      console.log(`[新核云Webhook] 保存成功: id=${transactionId}, code=${data.code}, 明细${records.length}条`);

      res.json({ success: true, message: '接收成功', id: transactionId });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('[新核云Webhook] 处理失败:', err);
    next(err);
  }
};

// ==================== 本地查询 ====================

export const getInventoryTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 200);
    const offset = (page - 1) * limit;
    const search = (req.query.search as string || '').trim();
    const operationType = (req.query.operation_type as string || '').trim();
    const startDate = (req.query.startDate as string || '').trim();
    const endDate = (req.query.endDate as string || '').trim();

    let where = 'WHERE 1=1';
    const replacements: Record<string, any> = {};

    if (search) {
      where += ` AND (t.code LIKE :search OR t.staff_code LIKE :search OR d.item_code LIKE :search OR d.item_name LIKE :search OR d.warehouse_code LIKE :search OR d.relative_order_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (operationType) {
      where += ` AND t.operation_type = :operationType`;
      replacements.operationType = operationType;
    }
    if (startDate) {
      where += ` AND t.received_at >= :startDate`;
      replacements.startDate = startDate;
    }
    if (endDate) {
      where += ` AND t.received_at < DATEADD(day, 1, :endDate)`;
      replacements.endDate = endDate;
    }

    // 总数
    const [countRows]: any = await sequelize.query(
      `SELECT COUNT(DISTINCT t.id) as total
       FROM xhy_inventory_transaction t
       LEFT JOIN xhy_inventory_transaction_detail d ON d.transaction_id = t.id
       ${where}`,
      { replacements }
    );
    const total = countRows[0]?.total || 0;

    // 明细列表（展开显示，每行一条明细）
    const [rows]: any = await sequelize.query(
      `SELECT
        t.id as transaction_id,
        t.request_id, t.code, t.source_code, t.staff_code,
        t.operation_type, t.operation_type_name,
        t.xhy_create_time, t.xhy_operation_time, t.received_at,
        d.id as detail_id,
        d.item_code, d.item_name, d.item_unit, d.item_specifications,
        d.warehouse_code, d.location_code,
        d.another_warehouse_code, d.another_location_code,
        d.batch_number, d.lot_car_code,
        d.quantity, d.qualified_quantity, d.unqualified_quantity,
        d.price,
        d.production_unit, d.production_unit_quantity,
        d.inventory_unit, d.inventory_unit_quantity,
        d.relative_order_number, d.relative_product_code, d.relative_product_quantity,
        d.applicant, d.applicant_department,
        d.comments as detail_comments,
        d.work_order_remark,
        d.check_account_date
      FROM xhy_inventory_transaction t
      LEFT JOIN xhy_inventory_transaction_detail d ON d.transaction_id = t.id
      ${where}
      ORDER BY t.received_at DESC, d.id ASC
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { replacements: { ...replacements, offset, limit } }
    );

    res.json(success({
      items: rows,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '查询出入库记录成功'));
  } catch (err) {
    next(err);
  }
};

// ==================== 统计概览 ====================

export const getInventoryTransactionStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [stats]: any = await sequelize.query(`
      SELECT
        COUNT(DISTINCT t.id) as total_transactions,
        COUNT(d.id) as total_details,
        SUM(CASE WHEN t.operation_type LIKE '%_IN' THEN d.quantity ELSE 0 END) as total_in_qty,
        SUM(CASE WHEN t.operation_type LIKE '%_OUT' THEN d.quantity ELSE 0 END) as total_out_qty,
        COUNT(DISTINCT d.item_code) as item_count,
        COUNT(DISTINCT d.warehouse_code) as warehouse_count
      FROM xhy_inventory_transaction t
      LEFT JOIN xhy_inventory_transaction_detail d ON d.transaction_id = t.id
    `);

    const [recentByType]: any = await sequelize.query(`
      SELECT operation_type, operation_type_name, COUNT(*) as cnt
      FROM xhy_inventory_transaction
      GROUP BY operation_type, operation_type_name
      ORDER BY cnt DESC
    `);

    res.json(success({
      summary: stats[0] || {},
      byType: recentByType
    }, '获取统计成功'));
  } catch (err) {
    next(err);
  }
};
