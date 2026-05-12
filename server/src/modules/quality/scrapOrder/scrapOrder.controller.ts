import { Request, Response } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';

// ==================== 获取报废单列表 ====================
export const getScrapOrders = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 15;
    const search = (req.query.search as string) || '';
    const approvalStatus = (req.query.approval_status as string) || '';

    let whereClause = `WHERE h.stock_in_type = N'报废入库'`;
    const replacements: any = {};

    if (search) {
      whereClause += ` AND (h.stock_in_number LIKE :search OR d.item_number LIKE :search OR d.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (approvalStatus) {
      whereClause += ` AND h.approval_status = :approvalStatus`;
      replacements.approvalStatus = approvalStatus;
    }

    // 统计总数 - 用stock_in主表计数
    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM stock_in h WHERE h.stock_in_type = N'报废入库'
       ${approvalStatus ? ' AND h.approval_status = :approvalStatus' : ''}`,
      { replacements: approvalStatus ? { approvalStatus } : {} }
    );
    const total = countResult[0].cnt;

    // 分页查询 - ROW_NUMBER方式兼容SQL Server 2008
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT h.stock_in_number, h.warehouse_number, h.warehouse_name,
          h.stock_in_date, h.approval_status, h.operator, h.remark,
          h.creation_date, h.creation_man,
          d.line_number, d.item_number, d.item_name, d.specifications, d.basic_unit,
          d.stock_in_quantity as scrap_quantity, d.unqualified_quantity,
          d.batch_number, d.remark as detail_remark,
          nc.nonconforming_number, nc.source_type, nc.source_number,
          ROW_NUMBER() OVER (ORDER BY h.creation_date DESC) AS rn
        FROM stock_in h
        INNER JOIN stock_in_detail d ON h.stock_in_number = d.stock_in_number
        LEFT JOIN nonconforming_product nc ON nc.stock_in_number = h.stock_in_number
        ${whereClause}
      ) t WHERE rn > ${offset} AND rn <= ${offset + limit}
    `, { replacements });

    // 统计
    const [draftCnt]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM stock_in WHERE stock_in_type = N'报废入库' AND approval_status = N'草稿'`
    );
    const [approvedCnt]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM stock_in WHERE stock_in_type = N'报废入库' AND approval_status = N'已审批'`
    );
    const [totalQty]: any = await sequelize.query(
      `SELECT ISNULL(SUM(d.stock_in_quantity), 0) as total_scrap_quantity FROM stock_in h INNER JOIN stock_in_detail d ON h.stock_in_number = d.stock_in_number WHERE h.stock_in_type = N'报废入库'`
    );

    res.json(success({
      items,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      stats: {
        total_count: total,
        total_scrap_quantity: totalQty[0]?.total_scrap_quantity || 0,
        draft_count: draftCnt[0]?.cnt || 0,
        approved_count: approvedCnt[0]?.cnt || 0
      }
    }, '获取报废单列表成功'));
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ==================== 获取报废单详情 ====================
export const getScrapOrderDetail = async (req: Request, res: Response) => {
  try {
    const { stockInNumber } = req.params;

    const [header]: any = await sequelize.query(
      `SELECT stock_in_number, purchase_order_number, supplier_number, supplier_name, warehouse_number, warehouse_name, stock_in_date, stock_in_type, approval_status, [condition], operator, remark, creation_date, creation_man FROM stock_in WHERE stock_in_number = :number AND stock_in_type = N'报废入库'`,
      { replacements: { number: stockInNumber } }
    );
    if (!header.length) {
      res.status(404).json({ success: false, message: '报废单不存在' });
      return;
    }

    const [details]: any = await sequelize.query(
      `SELECT id, stock_in_number, line_number, item_number, item_name, specifications, basic_unit, stock_in_quantity, qualified_quantity, unqualified_quantity, batch_number, remark, inspection_number, inspect_status FROM stock_in_detail WHERE stock_in_number = :number`,
      { replacements: { number: stockInNumber } }
    );

    const [ncInfo]: any = await sequelize.query(
      `SELECT nonconforming_number, source_type, source_number, handling_method, handling_status FROM nonconforming_product WHERE stock_in_number = :number`,
      { replacements: { number: stockInNumber } }
    );

    res.json(success({
      header: header[0],
      details,
      ncInfo: ncInfo[0] || null
    }, '获取报废单详情成功'));
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ==================== 导出报废单 ====================
export const exportScrapOrders = async (req: Request, res: Response) => {
  try {
    const [items]: any = await sequelize.query(`
      SELECT h.stock_in_number as [报废单号], h.warehouse_number as [仓库编号], h.warehouse_name as [仓库名称],
        h.stock_in_date as [报废日期], h.approval_status as [审批状态], h.operator as [操作人],
        d.item_number as [物料编号], d.item_name as [物料名称], d.specifications as [规格型号],
        d.stock_in_quantity as [报废数量], d.unqualified_quantity as [不合格数量],
        nc.nonconforming_number as [不合格品单号], nc.source_type as [来源类型],
        h.remark as [备注], h.creation_date as [创建时间]
      FROM stock_in h
      INNER JOIN stock_in_detail d ON h.stock_in_number = d.stock_in_number
      LEFT JOIN nonconforming_product nc ON nc.stock_in_number = h.stock_in_number
      WHERE h.stock_in_type = N'报废入库'
      ORDER BY h.creation_date DESC
    `);

    const fields = ['stock_in_number', 'warehouse_name', 'stock_in_date', 'approval_status', 'operator', 'item_number', 'item_name', 'specifications', 'scrap_quantity', 'unqualified_quantity', 'nonconforming_number', 'source_type', 'remark', 'creation_date'];
    const headers = ['入库单号', '仓库名称', '入库日期', '审批状态', '操作员', '物料编号', '物料名称', '规格', '报废数量', '不合格数量', '不合格品单号', '来源类型', '备注', '创建时间'];
    exportToExcel(items, fields, headers, `scrap_orders_${Date.now()}`, res, 'xlsx');
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};
