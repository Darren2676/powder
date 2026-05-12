import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { generateOutsourcingSettlementNumber } from '@/services/documentNumber.service';
import dayjs from 'dayjs';

export { generateOutsourcingSettlementNumber } from '@/services/documentNumber.service';

// ==================== 列表 ====================
export const getOutsourcingSettlements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const payment_status = (req.query.payment_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(settlement_number LIKE :search OR outsourcing_order_number LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (payment_status) { conditions.push(`payment_status = :payment_status`); replacements.payment_status = payment_status; }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM outsourcing_settlement ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;

    const [items]: any = await sequelize.query(
      `SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC, settlement_number DESC) AS _row_num FROM outsourcing_settlement ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取委外结算单列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getOutsourcingSettlementDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(`SELECT * FROM outsourcing_settlement WHERE settlement_number = :id`, { replacements: { id } });
    if (!rows.length) { res.status(404).json({ success: false, message: '委外结算单不存在' }); return; }

    res.json(success(rows[0], '获取委外结算单详情成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createOutsourcingSettlement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.outsourcing_order_number) { res.status(400).json({ success: false, message: '委外订单号不能为空' }); return; }

    // 校验委外订单的合格数量
    const [orderCheck]: any = await sequelize.query(`
      SELECT qualified_quantity, settlement_quantity FROM outsourcing_order WHERE outsourcing_order_number = :id
    `, { replacements: { id: b.outsourcing_order_number } });
    
    if (!orderCheck.length) { res.status(404).json({ success: false, message: '委外订单不存在' }); return; }
    
    const qualifiedQty = parseFloat(orderCheck[0].qualified_quantity || 0);
    const settledQty = parseFloat(orderCheck[0].settlement_quantity || 0);
    const remainingQty = qualifiedQty - settledQty;
    
    if (remainingQty <= 0) { res.status(400).json({ success: false, message: '没有可结算的合格数量' }); return; }

    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const username = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      const settlementNumber = await generateOutsourcingSettlementNumber(transaction);

      // 自动计算金额
      const settlementQty = parseFloat(b.settlement_quantity) || remainingQty;
      const unitPrice = parseFloat(b.unit_price) || 0;
      const totalAmount = settlementQty * unitPrice;
      const taxRate = parseFloat(b.tax_rate) || 0;
      const taxAmount = totalAmount * (taxRate / 100);
      const amountWithTax = totalAmount + taxAmount;

      await sequelize.query(`
        INSERT INTO outsourcing_settlement (
          settlement_number, outsourcing_order_number, settlement_date,
          settlement_quantity, unit_price, total_amount,
          tax_rate, tax_amount, amount_with_tax,
          payment_status, status, remark, creation_date, creation_man
        ) VALUES (
          :settlementNumber, :outsourcing_order_number, :settlement_date,
          :settlement_quantity, :unit_price, :total_amount,
          :tax_rate, :tax_amount, :amount_with_tax,
          N'未付款', N'草稿', :remark, :creation_date, :creation_man
        )
      `, {
        replacements: {
          settlementNumber,
          outsourcing_order_number: b.outsourcing_order_number,
          settlement_date: b.settlement_date || now.split(' ')[0],
          settlement_quantity: settlementQty,
          unit_price: unitPrice,
          total_amount: totalAmount,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          amount_with_tax: amountWithTax,
          remark: b.remark || '',
          creation_date: now,
          creation_man: username
        },
        transaction
      });

      await transaction.commit();
      res.json(success({ settlement_number: settlementNumber }, '创建委外结算单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 审核 ====================
export const approveSettlement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [check]: any = await sequelize.query(`SELECT status FROM outsourcing_settlement WHERE settlement_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外结算单不存在' }); return; }
    if (check[0].status !== '草稿') { res.status(403).json({ success: false, message: '只能审核草稿状态的结算单' }); return; }

    await sequelize.query(`UPDATE outsourcing_settlement SET status = N'已审核' WHERE settlement_number = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

// ==================== 登记付款 ====================
export const recordPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    if (!b.paid_amount || parseFloat(b.paid_amount) <= 0) {
      res.status(400).json({ success: false, message: '付款金额必须大于0' });
      return;
    }

    const [check]: any = await sequelize.query(`
      SELECT * FROM outsourcing_settlement WHERE settlement_number = :id
    `, { replacements: { id } });
    
    if (!check.length) { res.status(404).json({ success: false, message: '委外结算单不存在' }); return; }
    if (check[0].status !== '已审核') { res.status(403).json({ success: false, message: '只能对已审核的结算单付款' }); return; }

    const currentPaid = parseFloat(check[0].paid_amount || 0);
    const newPaid = currentPaid + parseFloat(b.paid_amount);
    const totalAmount = parseFloat(check[0].amount_with_tax || 0);
    
    // 判断付款状态
    let paymentStatus = '部分付款';
    if (newPaid >= totalAmount) {
      paymentStatus = '已付款';
    }

    const transaction = await sequelize.transaction();
    try {
      // 更新结算单付款状态
      await sequelize.query(`
        UPDATE outsourcing_settlement SET
          paid_amount = :paid_amount,
          payment_status = :payment_status
        WHERE settlement_number = :id
      `, {
        replacements: {
          id,
          paid_amount: newPaid,
          payment_status: paymentStatus
        },
        transaction
      });

      // 如果已付款，更新结算单状态
      if (paymentStatus === '已付款') {
        await sequelize.query(`
          UPDATE outsourcing_settlement SET status = N'已结算'
          WHERE settlement_number = :id
        `, { replacements: { id }, transaction });

        // 更新委外订单的结算状态
        const [orderCheck]: any = await sequelize.query(`
          SELECT outsourcing_order_number, settlement_quantity FROM outsourcing_order 
          WHERE outsourcing_order_number = :order_number
        `, { 
          replacements: { order_number: check[0].outsourcing_order_number },
          transaction 
        });

        if (orderCheck.length) {
          const newSettledQty = parseFloat(orderCheck[0].settlement_quantity || 0) + parseFloat(check[0].settlement_quantity || 0);
          const qualifiedQty = parseFloat(orderCheck[0].qualified_quantity || 0);
          const settlementStatus = newSettledQty >= qualifiedQty ? '已结算' : '部分结算';

          await sequelize.query(`
            UPDATE outsourcing_order 
            SET settlement_quantity = :qty,
                settlement_status = :status
            WHERE outsourcing_order_number = :order_number
          `, {
            replacements: {
              qty: newSettledQty,
              status: settlementStatus,
              order_number: check[0].outsourcing_order_number
            },
            transaction
          });

          // 如果全部结算完成，更新订单为已完成
          if (settlementStatus === '已结算') {
            await sequelize.query(`
              UPDATE outsourcing_order SET order_status = N'已完成'
              WHERE outsourcing_order_number = :order_number
            `, { replacements: { order_number: check[0].outsourcing_order_number }, transaction });
          }
        }
      }

      await transaction.commit();
      res.json(success(null, `付款成功，当前状态：${paymentStatus}`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['settlement_number', 'outsourcing_order_number', 'settlement_date', 'settlement_quantity', 'unit_price', 'total_amount', 'tax_rate', 'tax_amount', 'amount_with_tax', 'payment_status', 'paid_amount', 'status', 'creation_date'];
const exportHeaderLabels = ['结算单号', '委外订单号', '结算日期', '结算数量', '单价', '总金额', '税率', '税额', '含税金额', '付款状态', '已付金额', '状态', '创建日期'];

export const exportOutsourcingSettlements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE settlement_number LIKE :search OR outsourcing_order_number LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [items]: any = await sequelize.query(`SELECT * FROM outsourcing_settlement ${whereClause} ORDER BY creation_date DESC`, { replacements });
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, exportFields, exportHeaderLabels, 'outsourcing_settlements', res, format);
  } catch (err) { next(err); }
};
