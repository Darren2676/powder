import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';

// ==================== 发货单明细列表（批次级别） ====================
export const getShippingOrderDetailsPage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = `WHERE 1=1`;
    const replacements: any = { offset, offsetEnd };

    if (status) {
      const statusArr = String(status).split(',').filter(Boolean);
      if (statusArr.length === 1) {
        whereClause += ` AND h.status = :status`;
        replacements.status = statusArr[0];
      } else if (statusArr.length > 1) {
        const placeholders = statusArr.map((_s, i) => `:status${i}`).join(', ');
        whereClause += ` AND h.status IN (${placeholders})`;
        statusArr.forEach((s, i) => { replacements[`status${i}`] = s; });
      }
    }
    if (search) {
      whereClause += ` AND (h.shipping_order_number LIKE :search OR d.item_number LIKE :search OR d.item_name LIKE :search OR h.customer_name LIKE :search OR d.sales_order_number LIKE :search OR h.carrier LIKE :search OR h.tracking_number LIKE :search OR b.batch_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM shipping_order_batch b
       INNER JOIN shipping_order_detail d ON d.id = b.detail_id AND d.shipping_order_number = b.shipping_order_number
       INNER JOIN shipping_order h ON h.shipping_order_number = b.shipping_order_number
       ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT b.id as batch_id, b.batch_number, b.quantity as batch_quantity,
               d.line_number, d.request_number, d.sales_order_number,
               d.item_number, d.item_name, d.specifications, d.basic_unit, d.quantity as line_quantity,
               h.shipping_order_number, h.customer_name, h.warehouse_name, h.status as order_status,
               h.shipping_date, h.carrier, h.tracking_number, h.creation_man, h.creation_date as order_creation_date,
               ROW_NUMBER() OVER (ORDER BY h.creation_date DESC, b.shipping_order_number, d.line_number, b.id) AS _row_num
        FROM shipping_order_batch b
        INNER JOIN shipping_order_detail d ON d.id = b.detail_id AND d.shipping_order_number = b.shipping_order_number
        INNER JOIN shipping_order h ON h.shipping_order_number = b.shipping_order_number
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: pageSize
    }));
  } catch (err) { next(err); }
};

// ==================== 导出选中发货单明细 ====================
export const exportShippingOrderDetailsSelected = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      res.status(400).json({ success: false, message: '请选择要导出的记录' }); return;
    }
    if (ids.length > 1000) {
      res.status(400).json({ success: false, message: '单次导出不能超过1000条' }); return;
    }
    const replacements: any = {};
    ids.forEach((id: any, i: number) => { replacements[`id${i}`] = id; });
    const placeholders = ids.map((_: any, i: number) => `:id${i}`).join(', ');

    const [items]: any = await sequelize.query(`
      SELECT h.shipping_order_number, h.customer_name, h.warehouse_name, h.status as order_status,
             h.shipping_date, h.carrier, h.tracking_number, h.creation_man, h.creation_date as order_creation_date,
             d.line_number, d.request_number, d.sales_order_number,
             d.item_number, d.item_name, d.specifications, d.basic_unit, d.quantity as line_quantity,
             b.batch_number, b.quantity as batch_quantity
      FROM shipping_order_batch b
      INNER JOIN shipping_order_detail d ON d.id = b.detail_id AND d.shipping_order_number = b.shipping_order_number
      INNER JOIN shipping_order h ON h.shipping_order_number = b.shipping_order_number
      WHERE b.id IN (${placeholders})
      ORDER BY h.shipping_order_number, d.line_number, b.id
    `, { replacements });

    const fields = [
      'shipping_order_number', 'order_status', 'customer_name', 'line_number', 'batch_number',
      'request_number', 'sales_order_number',
      'item_number', 'item_name', 'specifications', 'basic_unit',
      'batch_quantity', 'line_quantity', 'warehouse_name',
      'carrier', 'tracking_number', 'shipping_date', 'creation_man', 'order_creation_date'
    ];
    const headers = [
      '发货单号', '状态', '客户名称', '行号', '批次号',
      '申请单号', '销售订单号',
      '产品编号', '产品名称', '规格', '单位',
      '批次数量', '行发货量', '出库仓库',
      '承运商', '运单号', '发货日期', '创建人', '创建时间'
    ];
    exportToExcel(items, fields, headers, 'shipping_order_details_selected', res);
  } catch (err) { next(err); }
};

// ==================== 发货单列表 ====================
export const getShippingOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = {};

    if (search) {
      whereClause += ` AND (so.shipping_order_number LIKE :search OR so.customer_name LIKE :search OR so.carrier LIKE :search OR so.tracking_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (status) {
      whereClause += ` AND so.status = :status`;
      replacements.status = status;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM shipping_order so ${whereClause}`,
      { replacements }
    );
    const total = countResult[0]?.total || 0;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT so.*, ROW_NUMBER() OVER (ORDER BY so.creation_date DESC) as rn
        FROM shipping_order so
        ${whereClause}
      ) t WHERE t.rn > :offset AND t.rn <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd } });

    res.json(success({ items, total, page: pageNum, limit: pageSize }));
  } catch (err) { next(err); }
};

// ==================== 发货单详情 ====================
export const getShippingOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shipping_order_number } = req.params;

    // 主表
    const [headerRows]: any = await sequelize.query(
      `SELECT * FROM shipping_order WHERE shipping_order_number = :sn`,
      { replacements: { sn: shipping_order_number } }
    );
    if (headerRows.length === 0) {
      res.status(404).json({ success: false, message: '发货单不存在' }); return;
    }

    // 明细
    const [details]: any = await sequelize.query(
      `SELECT * FROM shipping_order_detail WHERE shipping_order_number = :sn ORDER BY line_number`,
      { replacements: { sn: shipping_order_number } }
    );

    // 批次明细
    const [batches]: any = await sequelize.query(
      `SELECT * FROM shipping_order_batch WHERE shipping_order_number = :sn ORDER BY detail_id, id`,
      { replacements: { sn: shipping_order_number } }
    );

    // 将批次明细挂到对应的明细行上
    const detailsWithBatches = details.map((d: any) => ({
      ...d,
      batches: batches.filter((b: any) => b.detail_id === d.id)
    }));

    res.json(success({ header: headerRows[0], details: detailsWithBatches }));
  } catch (err) { next(err); }
};

// ==================== 更新物流信息 ====================
export const updateLogistics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shipping_order_number } = req.params;
    const { carrier, tracking_number, freight, shipping_address, contact_person, contact_phone } = req.body;

    const [existing]: any = await sequelize.query(
      `SELECT id, status FROM shipping_order WHERE shipping_order_number = :sn`,
      { replacements: { sn: shipping_order_number } }
    );
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: '发货单不存在' }); return;
    }
    if (existing[0].status === '已取消') {
      res.status(400).json({ success: false, message: '已取消的发货单不能编辑物流信息' }); return;
    }

    await sequelize.query(`
      UPDATE shipping_order SET
        carrier = :carrier,
        tracking_number = :tracking_number,
        freight = :freight,
        shipping_address = :shipping_address,
        contact_person = :contact_person,
        contact_phone = :contact_phone
      WHERE shipping_order_number = :sn
    `, {
      replacements: {
        sn: shipping_order_number,
        carrier: carrier || '',
        tracking_number: tracking_number || '',
        freight: freight || 0,
        shipping_address: shipping_address || '',
        contact_person: contact_person || '',
        contact_phone: contact_phone || ''
      }
    });

    res.json(success(null, '物流信息更新成功'));
  } catch (err) { next(err); }
};

// ==================== 更新状态 ====================
export const updateStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shipping_order_number } = req.params;
    const { status: newStatus } = req.body;

    if (!['已签收', '已取消'].includes(newStatus)) {
      res.status(400).json({ success: false, message: '无效的状态值' }); return;
    }

    const [existing]: any = await sequelize.query(
      `SELECT id, status FROM shipping_order WHERE shipping_order_number = :sn`,
      { replacements: { sn: shipping_order_number } }
    );
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: '发货单不存在' }); return;
    }

    const currentStatus = existing[0].status;
    if (currentStatus === '已取消') {
      res.status(400).json({ success: false, message: '已取消的发货单不能修改状态' }); return;
    }
    if (currentStatus === '已签收' && newStatus !== '已取消') {
      res.status(400).json({ success: false, message: '已签收的发货单不能修改状态' }); return;
    }

    await sequelize.query(
      `UPDATE shipping_order SET status = :status WHERE shipping_order_number = :sn`,
      { replacements: { sn: shipping_order_number, status: newStatus } }
    );

    res.json(success(null, `状态已更新为"${newStatus}"`));
  } catch (err) { next(err); }
};

// ==================== 获取打印数据 ====================
export const getPrintData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shipping_order_number } = req.params;

    // 主表
    const [headerRows]: any = await sequelize.query(
      `SELECT * FROM shipping_order WHERE shipping_order_number = :sn`,
      { replacements: { sn: shipping_order_number } }
    );
    if (headerRows.length === 0) {
      res.status(404).json({ success: false, message: '发货单不存在' }); return;
    }

    // 明细
    const [details]: any = await sequelize.query(
      `SELECT * FROM shipping_order_detail WHERE shipping_order_number = :sn ORDER BY line_number`,
      { replacements: { sn: shipping_order_number } }
    );

    // 批次明细
    const [batches]: any = await sequelize.query(
      `SELECT * FROM shipping_order_batch WHERE shipping_order_number = :sn ORDER BY detail_id, id`,
      { replacements: { sn: shipping_order_number } }
    );

    const detailsWithBatches = details.map((d: any) => ({
      ...d,
      batches: batches.filter((b: any) => b.detail_id === d.id)
    }));

    res.json(success({ header: headerRows[0], details: detailsWithBatches }));
  } catch (err) { next(err); }
};
