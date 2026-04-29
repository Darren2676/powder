import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { generateOutsourcingReceiptNumber } from '@/services/documentNumber.service';
import dayjs from 'dayjs';

export { generateOutsourcingReceiptNumber } from '@/services/documentNumber.service';

// ==================== 列表 ====================
export const getOutsourcingReceipts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(receipt_number LIKE :search OR outsourcing_order_number LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (status) { conditions.push(`status = :status`); replacements.status = status; }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM outsourcing_receipt ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;

    const [items]: any = await sequelize.query(
      `SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC, receipt_number DESC) AS _row_num FROM outsourcing_receipt ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取委外收回单列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getOutsourcingReceiptDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(`SELECT * FROM outsourcing_receipt WHERE receipt_number = :id`, { replacements: { id } });
    if (!rows.length) { res.status(404).json({ success: false, message: '委外收回单不存在' }); return; }

    const [details]: any = await sequelize.query(
      `SELECT * FROM outsourcing_receipt_detail WHERE receipt_number = :id ORDER BY line_number`,
      { replacements: { id } }
    );

    res.json(success({ ...rows[0], details }, '获取委外收回单详情成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createOutsourcingReceipt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.outsourcing_order_number) { res.status(400).json({ success: false, message: '委外订单号不能为空' }); return; }

    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const username = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      const receiptNumber = await generateOutsourcingReceiptNumber(transaction);

      await sequelize.query(`
        INSERT INTO outsourcing_receipt (
          receipt_number, outsourcing_order_number, receipt_date,
          warehouse_number, warehouse_name, handler,
          inspection_status, status, remark, creation_date, creation_man
        ) VALUES (
          :receiptNumber, :outsourcing_order_number, :receipt_date,
          :warehouse_number, :warehouse_name, :handler,
          N'待检验', N'草稿', :remark, :creation_date, :creation_man
        )
      `, {
        replacements: {
          receiptNumber,
          outsourcing_order_number: b.outsourcing_order_number,
          receipt_date: b.receipt_date || now.split(' ')[0],
          warehouse_number: b.warehouse_number || '',
          warehouse_name: b.warehouse_name || '',
          handler: b.handler || '',
          remark: b.remark || '',
          creation_date: now,
          creation_man: username
        },
        transaction
      });

      const details = b.details || [];
      for (let i = 0; i < details.length; i++) {
        const d = details[i];
        await sequelize.query(`
          INSERT INTO outsourcing_receipt_detail (
            receipt_number, line_number, item_number, item_name,
            specifications, receipt_quantity, qualified_quantity, unqualified_quantity, unit, remark
          ) VALUES (
            :receiptNumber, :line_number, :item_number, :item_name,
            :specifications, :receipt_quantity, 0, 0, :unit, :remark
          )
        `, {
          replacements: {
            receiptNumber,
            line_number: (i + 1) * 10,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            receipt_quantity: d.receipt_quantity || 0,
            unit: d.unit || '',
            remark: d.remark || ''
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ receipt_number: receiptNumber }, '创建委外收回单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 审核 ====================
export const approveReceipt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [check]: any = await sequelize.query(`SELECT status FROM outsourcing_receipt WHERE receipt_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外收回单不存在' }); return; }
    if (check[0].status !== '草稿') { res.status(403).json({ success: false, message: '只能审核草稿状态的收回单' }); return; }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`UPDATE outsourcing_receipt SET status = N'已审核' WHERE receipt_number = :id`, { replacements: { id }, transaction });

      // 自动创建质检单
      const [receipt]: any = await sequelize.query(`SELECT * FROM outsourcing_receipt WHERE receipt_number = :id`, { replacements: { id }, transaction });
      if (receipt.length) {
        const inspectionNumber = 'OQI' + Date.now();
        await sequelize.query(`
          INSERT INTO outsourcing_inspection (
            inspection_number, receipt_number, outsourcing_order_number,
            inspection_date, inspection_status, creation_date, creation_man
          ) VALUES (
            :inspectionNumber, :receiptNumber, :orderNumber,
            GETDATE(), N'待检验', GETDATE(), :username
          )
        `, {
          replacements: {
            inspectionNumber,
            receiptNumber: id,
            orderNumber: receipt[0].outsourcing_order_number,
            username: (req as any).user?.username || ''
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success(null, '审核成功，已自动创建质检单'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// 其他方法（update, delete, confirm等）类似发料模块...
