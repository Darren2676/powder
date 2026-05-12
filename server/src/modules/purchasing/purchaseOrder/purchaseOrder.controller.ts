import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { CONDITION_STATUS, ORDER_STATUS, PURCHASE_STATUS } from '@/shared/constants/statuses';

// ==================== 编号生成 ====================

const generatePurchaseOrderNumber = async (): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `PUR-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(purchase_order_number) as max_num FROM purchase_order WHERE purchase_order_number LIKE :prefix`,
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

export const getPurchaseOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const order_status = (req.query.order_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(purchase_order_number LIKE :search OR supplier_number LIKE :search OR supplier_name LIKE :search OR procurement_manager LIKE :search)`);
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
      `SELECT COUNT(*) as total FROM purchase_order ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT purchase_order_number, supplier_number, supplier_name, procurement_manager, linkman, contacts,
               order_date, delivery_date, approval_status, order_status, total_amount, [condition],
               source_req_number, remark, creation_date, creation_man,
               ROW_NUMBER() OVER (ORDER BY creation_date DESC, purchase_order_number DESC) AS _row_num
        FROM purchase_order ${whereClause}
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
    }, '获取采购订单列表成功'));
  } catch (err) { next(err); }
};

export const getPurchaseOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(
      `SELECT * FROM purchase_order WHERE purchase_order_number = :id`, { replacements: { id } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '采购订单不存在' }); return; }
    const [details]: any = await sequelize.query(
      `SELECT * FROM purchase_order_detail WHERE purchase_order_number = :id ORDER BY line_number`, { replacements: { id } }
    );
    res.json(success({ header: headers[0], details }, '获取采购订单详情成功'));
  } catch (err) { next(err); }
};

export const createPurchaseOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.supplier_number) { res.status(400).json({ success: false, message: '供应商不能为空' }); return; }

    const purchase_order_number = await generatePurchaseOrderNumber();
    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO purchase_order (purchase_order_number, supplier_number, supplier_name, procurement_manager,
          linkman, contacts, order_date, delivery_date, approval_status, order_status, total_amount,
          [condition], source_req_number, remark, creation_date, creation_man)
        VALUES (:purchase_order_number, :supplier_number, :supplier_name, :procurement_manager,
          :linkman, :contacts, :order_date, :delivery_date, N'草稿', N'待执行', :total_amount,
          :condition, :source_req_number, :remark, :creation_date, :creation_man)
      `, {
        replacements: {
          purchase_order_number,
          supplier_number: b.supplier_number || '',
          supplier_name: b.supplier_name || '',
          procurement_manager: b.procurement_manager || '',
          linkman: b.linkman || '',
          contacts: b.contacts || '',
          order_date: b.order_date || null,
          delivery_date: b.delivery_date || null,
          total_amount: b.total_amount || 0,
          condition: b.condition || CONDITION_STATUS.ENABLED,
          source_req_number: b.source_req_number || '',
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
            INSERT INTO purchase_order_detail (purchase_order_number, line_number, item_number, item_name, specifications,
              basic_unit, order_quantity, unit_price, total_amount, received_quantity, delivery_date,
              receive_status, source_req_number, source_req_detail_id, remark)
            VALUES (:purchase_order_number, :line_number, :item_number, :item_name, :specifications,
              :basic_unit, :order_quantity, :unit_price, :total_amount, 0, :delivery_date,
              N'未到货', :source_req_number, :source_req_detail_id, :remark)
          `, {
            replacements: {
              purchase_order_number,
              line_number: d.line_number || (i + 1) * 10,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              order_quantity: d.order_quantity || 0,
              unit_price: d.unit_price || 0,
              total_amount: d.total_amount || 0,
              delivery_date: d.delivery_date || null,
              source_req_number: d.source_req_number || '',
              source_req_detail_id: d.source_req_detail_id || 0,
              remark: d.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success({ purchase_order_number }, '创建采购订单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

export const updatePurchaseOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM purchase_order WHERE purchase_order_number = :id`, { replacements: { id } }
    );
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE purchase_order SET
          supplier_number = :supplier_number, supplier_name = :supplier_name,
          procurement_manager = :procurement_manager, linkman = :linkman, contacts = :contacts,
          order_date = :order_date, delivery_date = :delivery_date, total_amount = :total_amount,
          [condition] = :condition, remark = :remark
        WHERE purchase_order_number = :id
      `, {
        replacements: {
          id,
          supplier_number: b.supplier_number || '',
          supplier_name: b.supplier_name || '',
          procurement_manager: b.procurement_manager || '',
          linkman: b.linkman || '',
          contacts: b.contacts || '',
          order_date: b.order_date || null,
          delivery_date: b.delivery_date || null,
          total_amount: b.total_amount || 0,
          condition: b.condition || CONDITION_STATUS.ENABLED,
          remark: b.remark || ''
        },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        await sequelize.query(
          `DELETE FROM purchase_order_detail WHERE purchase_order_number = :id`,
          { replacements: { id }, transaction }
        );
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO purchase_order_detail (purchase_order_number, line_number, item_number, item_name, specifications,
              basic_unit, order_quantity, unit_price, total_amount, received_quantity, delivery_date,
              receive_status, source_req_number, source_req_detail_id, remark)
            VALUES (:purchase_order_number, :line_number, :item_number, :item_name, :specifications,
              :basic_unit, :order_quantity, :unit_price, :total_amount, :received_quantity, :delivery_date,
              :receive_status, :source_req_number, :source_req_detail_id, :remark)
          `, {
            replacements: {
              purchase_order_number: id,
              line_number: d.line_number || (i + 1) * 10,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              order_quantity: d.order_quantity || 0,
              unit_price: d.unit_price || 0,
              total_amount: d.total_amount || 0,
              received_quantity: d.received_quantity || 0,
              delivery_date: d.delivery_date || null,
              receive_status: d.receive_status || PURCHASE_STATUS.NOT_RECEIVED,
              source_req_number: d.source_req_number || '',
              source_req_detail_id: d.source_req_detail_id || 0,
              remark: d.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success(null, '更新采购订单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

export const deletePurchaseOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM purchase_order WHERE purchase_order_number = :id`, { replacements: { id } }
    );
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM purchase_order_detail WHERE purchase_order_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM purchase_order WHERE purchase_order_number = :id`, { replacements: { id }, transaction });
      await transaction.commit();
      res.json(success(null, '删除采购订单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== Detail CRUD ====================

export const getPurchaseOrderDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    const [items]: any = await sequelize.query(
      `SELECT * FROM purchase_order_detail WHERE purchase_order_number = :headerId ORDER BY line_number`,
      { replacements: { headerId } }
    );
    res.json(success(items, '获取采购订单明细成功'));
  } catch (err) { next(err); }
};

export const addPurchaseOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    const d = req.body;
    const [maxLine]: any = await sequelize.query(
      `SELECT MAX(line_number) as ml FROM purchase_order_detail WHERE purchase_order_number = :headerId`,
      { replacements: { headerId } }
    );
    const line_number = (maxLine[0].ml || 0) + 10;

    await sequelize.query(`
      INSERT INTO purchase_order_detail (purchase_order_number, line_number, item_number, item_name, specifications,
        basic_unit, order_quantity, unit_price, total_amount, received_quantity, delivery_date,
        receive_status, source_req_number, source_req_detail_id, remark)
      VALUES (:headerId, :line_number, :item_number, :item_name, :specifications,
        :basic_unit, :order_quantity, :unit_price, :total_amount, 0, :delivery_date,
        N'未到货', :source_req_number, :source_req_detail_id, :remark)
    `, {
      replacements: {
        headerId,
        line_number,
        item_number: d.item_number || '',
        item_name: d.item_name || '',
        specifications: d.specifications || '',
        basic_unit: d.basic_unit || '',
        order_quantity: d.order_quantity || 0,
        unit_price: d.unit_price || 0,
        total_amount: d.total_amount || 0,
        delivery_date: d.delivery_date || null,
        source_req_number: d.source_req_number || '',
        source_req_detail_id: d.source_req_detail_id || 0,
        remark: d.remark || ''
      }
    });

    // 更新主表总金额
    await sequelize.query(`
      UPDATE purchase_order SET total_amount = (
        SELECT ISNULL(SUM(total_amount), 0) FROM purchase_order_detail WHERE purchase_order_number = :headerId
      ) WHERE purchase_order_number = :headerId
    `, { replacements: { headerId } });

    res.json(success(null, '新增明细行成功'));
  } catch (err) { next(err); }
};

export const updatePurchaseOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const d = req.body;
    await sequelize.query(`
      UPDATE purchase_order_detail SET
        item_number = :item_number, item_name = :item_name, specifications = :specifications,
        basic_unit = :basic_unit, order_quantity = :order_quantity, unit_price = :unit_price,
        total_amount = :total_amount, delivery_date = :delivery_date, remark = :remark
      WHERE id = :detailId
    `, {
      replacements: {
        detailId,
        item_number: d.item_number || '',
        item_name: d.item_name || '',
        specifications: d.specifications || '',
        basic_unit: d.basic_unit || '',
        order_quantity: d.order_quantity || 0,
        unit_price: d.unit_price || 0,
        total_amount: d.total_amount || 0,
        delivery_date: d.delivery_date || null,
        remark: d.remark || ''
      }
    });

    // 更新主表总金额
    const [det]: any = await sequelize.query(
      `SELECT purchase_order_number FROM purchase_order_detail WHERE id = :detailId`,
      { replacements: { detailId } }
    );
    if (det.length) {
      await sequelize.query(`
        UPDATE purchase_order SET total_amount = (
          SELECT ISNULL(SUM(total_amount), 0) FROM purchase_order_detail WHERE purchase_order_number = :pon
        ) WHERE purchase_order_number = :pon
      `, { replacements: { pon: det[0].purchase_order_number } });
    }

    res.json(success(null, '更新明细行成功'));
  } catch (err) { next(err); }
};

export const deletePurchaseOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const [det]: any = await sequelize.query(
      `SELECT purchase_order_number FROM purchase_order_detail WHERE id = :detailId`,
      { replacements: { detailId } }
    );
    await sequelize.query(`DELETE FROM purchase_order_detail WHERE id = :detailId`, { replacements: { detailId } });

    if (det.length) {
      await sequelize.query(`
        UPDATE purchase_order SET total_amount = (
          SELECT ISNULL(SUM(total_amount), 0) FROM purchase_order_detail WHERE purchase_order_number = :pon
        ) WHERE purchase_order_number = :pon
      `, { replacements: { pon: det[0].purchase_order_number } });
    }

    res.json(success(null, '删除明细行成功'));
  } catch (err) { next(err); }
};

// ==================== 关闭订单 ====================

export const closePurchaseOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(
      `UPDATE purchase_order SET order_status = N'已关闭' WHERE purchase_order_number = :id`,
      { replacements: { id } }
    );
    res.json(success(null, '关闭采购订单成功'));
  } catch (err) { next(err); }
};

// ==================== 获取可入库明细 ====================

export const getReceivable = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [header]: any = await sequelize.query(
      `SELECT * FROM purchase_order WHERE purchase_order_number = :id`, { replacements: { id } }
    );
    if (!header.length) { res.status(404).json({ success: false, message: '采购订单不存在' }); return; }

    const [items]: any = await sequelize.query(`
      SELECT id, line_number, item_number, item_name, specifications, basic_unit,
             order_quantity, received_quantity,
             (order_quantity - received_quantity) as remaining
      FROM purchase_order_detail
      WHERE purchase_order_number = :id AND (order_quantity - received_quantity) > 0
      ORDER BY line_number
    `, { replacements: { id } });

    res.json(success({ header: header[0], items }, '获取可入库明细成功'));
  } catch (err) { next(err); }
};

// ==================== 打印 ====================

export const printPurchaseOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // 查询 PO 主表
    const [headerRows]: any = await sequelize.query(
      `SELECT * FROM purchase_order WHERE purchase_order_number = :id`, { replacements: { id } }
    );
    if (!headerRows.length) { res.status(404).json({ success: false, message: '采购订单不存在' }); return; }
    const po = headerRows[0];

    // 查询明细
    const [details]: any = await sequelize.query(
      `SELECT * FROM purchase_order_detail WHERE purchase_order_number = :id ORDER BY line_number`,
      { replacements: { id } }
    );

    // 构建可打印 HTML
    const orderDate = po.order_date ? new Date(po.order_date).toLocaleDateString('zh-CN') : '';
    const deliveryDate = po.delivery_date ? new Date(po.delivery_date).toLocaleDateString('zh-CN') : '';
    const totalAmount = parseFloat(po.total_amount || 0).toFixed(2);

    const detailRows = details.map((d: any, i: number) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${d.item_number || ''}</td>
        <td>${d.item_name || ''}</td>
        <td>${d.specifications || ''}</td>
        <td style="text-align:center">${d.basic_unit || ''}</td>
        <td style="text-align:right">${parseFloat(d.order_quantity || 0).toFixed(2)}</td>
        <td style="text-align:right">${parseFloat(d.unit_price || 0).toFixed(2)}</td>
        <td style="text-align:right">${parseFloat(d.total_amount || 0).toFixed(2)}</td>
        <td>${d.delivery_date ? new Date(d.delivery_date).toLocaleDateString('zh-CN') : ''}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>采购订单 ${po.purchase_order_number}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "SimSun", "宋体", serif; font-size: 14px; color: #000; padding: 40px 30px; }
  .header { text-align: center; margin-bottom: 20px; }
  .header h1 { font-size: 22px; margin-bottom: 4px; }
  .header .sub { font-size: 16px; }
  .info-section { display: flex; justify-content: space-between; margin-bottom: 16px; }
  .info-block { width: 48%; }
  .info-row { display: flex; margin-bottom: 4px; }
  .info-label { width: 80px; flex-shrink: 0; }
  .info-value { border-bottom: 1px solid #000; flex: 1; min-width: 100px; padding: 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { border: 1px solid #000; padding: 6px 8px; font-size: 13px; }
  th { background: #f0f0f0; text-align: center; }
  .total-row td { font-weight: bold; font-size: 14px; }
  .footer { display: flex; justify-content: space-between; margin-top: 30px; }
  .footer div { width: 30%; text-align: center; }
  .footer .label { margin-bottom: 30px; }
  .remark { margin-top: 16px; }
  .remark .info-label { width: 60px; }
  @media print {
    body { padding: 10px 15px; }
    @page { size: A4 landscape; margin: 12mm; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>采 购 订 单</h1>
    <div class="sub">编号: ${po.purchase_order_number}</div>
  </div>

  <div class="info-section">
    <div class="info-block">
      <div class="info-row"><span class="info-label">供应商:</span><span class="info-value">${po.supplier_name || ''}</span></div>
      <div class="info-row"><span class="info-label">联系人:</span><span class="info-value">${po.linkman || ''}</span></div>
      <div class="info-row"><span class="info-label">联系方式:</span><span class="info-value">${po.contacts || ''}</span></div>
    </div>
    <div class="info-block">
      <div class="info-row"><span class="info-label">订单日期:</span><span class="info-value">${orderDate}</span></div>
      <div class="info-row"><span class="info-label">交货日期:</span><span class="info-value">${deliveryDate}</span></div>
      <div class="info-row"><span class="info-label">采购负责人:</span><span class="info-value">${po.procurement_manager || ''}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px">序号</th>
        <th style="width:120px">物料编码</th>
        <th>物料名称</th>
        <th>规格</th>
        <th style="width:50px">单位</th>
        <th style="width:80px">订单数量</th>
        <th style="width:80px">单价</th>
        <th style="width:80px">金额</th>
        <th style="width:90px">交货日期</th>
      </tr>
    </thead>
    <tbody>
      ${detailRows}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="7" style="text-align:right">合计金额:</td>
        <td style="text-align:right">${totalAmount}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="remark">
    <div class="info-row"><span class="info-label">备注:</span><span class="info-value">${po.remark || ''}</span></div>
  </div>

  <div class="footer">
    <div><div class="label">采购负责人:</div>${po.procurement_manager || ''}</div>
    <div><div class="label">审批人:</div></div>
    <div><div class="label">日期:</div>${new Date().toLocaleDateString('zh-CN')}</div>
  </div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
};

// ==================== 导出 ====================

export const exportPurchaseOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE (h.purchase_order_number LIKE :search OR h.supplier_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    const [rows]: any = await sequelize.query(
      `SELECT h.purchase_order_number, h.supplier_number, h.supplier_name, h.procurement_manager,
              h.order_date, h.delivery_date, h.approval_status, h.order_status, h.total_amount, h.remark,
              d.line_number, d.item_number, d.item_name, d.specifications, d.basic_unit,
              d.order_quantity, d.unit_price, d.total_amount as line_amount, d.received_quantity, d.receive_status
       FROM purchase_order h LEFT JOIN purchase_order_detail d ON h.purchase_order_number = d.purchase_order_number
       ${whereClause} ORDER BY h.purchase_order_number DESC, d.line_number`,
      { replacements }
    );

    const fields = ['purchase_order_number', 'supplier_number', 'supplier_name', 'procurement_manager',
      'order_date', 'delivery_date', 'approval_status', 'order_status', 'total_amount',
      'line_number', 'item_number', 'item_name', 'specifications', 'basic_unit',
      'order_quantity', 'unit_price', 'line_amount', 'received_quantity', 'receive_status'];
    const headers = ['采购订单号', '供应商编码', '供应商名称', '采购负责人', '订单日期', '交货日期',
      '审批状态', '执行状态', '总金额', '行号', '物料编码', '物料名称', '规格', '单位',
      '订单数量', '单价', '金额', '已入库数量', '到货状态'];

    exportToExcel(rows, fields, headers, 'purchase_orders', res);
  } catch (err) { next(err); }
};

// ==================== 明细列表页 ====================

export const getPurchaseOrderDetailsPage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', receive_status = '', approval_status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = '';
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` WHERE (d.purchase_order_number LIKE :search OR d.item_number LIKE :search OR d.item_name LIKE :search OR h.supplier_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (receive_status) {
      const statusArr = String(receive_status).split(',').filter(Boolean);
      if (statusArr.length === 1) {
        whereClause += `${whereClause ? ' AND' : ' WHERE'} d.receive_status = :receive_status`;
        replacements.receive_status = statusArr[0];
      } else if (statusArr.length > 1) {
        const placeholders = statusArr.map((_: string, i: number) => `:rs${i}`).join(', ');
        whereClause += `${whereClause ? ' AND' : ' WHERE'} d.receive_status IN (${placeholders})`;
        statusArr.forEach((s: string, i: number) => { replacements[`rs${i}`] = s; });
      }
    }
    if (approval_status) {
      const statusArr = String(approval_status).split(',').filter(Boolean);
      if (statusArr.length === 1) {
        whereClause += `${whereClause ? ' AND' : ' WHERE'} h.approval_status = :approval_status`;
        replacements.approval_status = statusArr[0];
      } else if (statusArr.length > 1) {
        const placeholders = statusArr.map((_: string, i: number) => `:as${i}`).join(', ');
        whereClause += `${whereClause ? ' AND' : ' WHERE'} h.approval_status IN (${placeholders})`;
        statusArr.forEach((s: string, i: number) => { replacements[`as${i}`] = s; });
      }
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM purchase_order_detail d
       INNER JOIN purchase_order h ON h.purchase_order_number = d.purchase_order_number
       ${whereClause}`, { replacements }
    );
    const total = countResult[0]?.total || 0;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT d.id, d.purchase_order_number, d.line_number, d.item_number, d.item_name,
               d.specifications, d.basic_unit, d.order_quantity, d.unit_price, d.total_amount,
               d.received_quantity, d.delivery_date, d.receive_status, d.source_req_number, d.remark,
               h.supplier_number, h.supplier_name, h.procurement_manager,
               h.order_date, h.approval_status, h.order_status,
               ROW_NUMBER() OVER (ORDER BY h.purchase_order_number DESC, d.line_number) AS _row_num
        FROM purchase_order_detail d
        INNER JOIN purchase_order h ON h.purchase_order_number = d.purchase_order_number
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

export const exportPurchaseOrderDetailsSelected = async (req: Request, res: Response, next: NextFunction) => {
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
      `SELECT d.purchase_order_number, d.line_number, d.item_number, d.item_name,
              d.specifications, d.basic_unit, d.order_quantity, d.unit_price, d.total_amount,
              d.received_quantity, d.delivery_date, d.receive_status, d.source_req_number, d.remark,
              h.supplier_number, h.supplier_name, h.procurement_manager,
              h.order_date, h.approval_status, h.order_status
       FROM purchase_order_detail d
       INNER JOIN purchase_order h ON h.purchase_order_number = d.purchase_order_number
       WHERE d.id IN (${placeholders})
       ORDER BY d.purchase_order_number, d.line_number`,
      { replacements }
    );

    const fields = [
      'purchase_order_number', 'line_number', 'item_number', 'item_name',
      'specifications', 'basic_unit', 'order_quantity', 'unit_price', 'total_amount',
      'received_quantity', 'delivery_date', 'receive_status', 'source_req_number', 'remark',
      'supplier_number', 'supplier_name', 'procurement_manager',
      'order_date', 'approval_status', 'order_status'
    ];
    const headers = [
      '采购订单号', '行号', '物料编码', '物料名称',
      '规格', '单位', '订单数量', '单价', '金额',
      '已入库数量', '交货日期', '到货状态', '来源申请号', '备注',
      '供应商编码', '供应商名称', '采购负责人',
      '订单日期', '审批状态', '执行状态'
    ];

    exportToExcel(items, fields, headers, 'purchase_order_details_selected', res);
  } catch (err) { next(err); }
};
