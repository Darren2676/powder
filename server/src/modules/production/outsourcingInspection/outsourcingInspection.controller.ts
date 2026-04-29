import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { generateOutsourcingInspectionNumber } from '@/services/documentNumber.service';
import dayjs from 'dayjs';

export { generateOutsourcingInspectionNumber } from '@/services/documentNumber.service';

// ==================== 列表 ====================
export const getOutsourcingInspections = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const inspection_result = (req.query.inspection_result as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(inspection_number LIKE :search OR receipt_number LIKE :search OR outsourcing_order_number LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (inspection_result) { conditions.push(`inspection_result = :inspection_result`); replacements.inspection_result = inspection_result; }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM outsourcing_inspection ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;

    const [items]: any = await sequelize.query(
      `SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC, inspection_number DESC) AS _row_num FROM outsourcing_inspection ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取委外质检单列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getOutsourcingInspectionDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(`SELECT * FROM outsourcing_inspection WHERE inspection_number = :id`, { replacements: { id } });
    if (!rows.length) { res.status(404).json({ success: false, message: '委外质检单不存在' }); return; }

    res.json(success(rows[0], '获取委外质检单详情成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createOutsourcingInspection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.receipt_number) { res.status(400).json({ success: false, message: '收回单号不能为空' }); return; }

    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const username = (req as any).user?.username || '';

    const inspectionNumber = await generateOutsourcingInspectionNumber();

    await sequelize.query(`
      INSERT INTO outsourcing_inspection (
        inspection_number, receipt_number, outsourcing_order_number,
        inspection_date, inspector, inspection_status, remark, creation_date, creation_man
      ) VALUES (
        :inspectionNumber, :receipt_number, :outsourcing_order_number,
        :inspection_date, :inspector, N'待检验', :remark, :creation_date, :creation_man
      )
    `, {
      replacements: {
        inspectionNumber,
        receipt_number: b.receipt_number,
        outsourcing_order_number: b.outsourcing_order_number || '',
        inspection_date: b.inspection_date || now.split(' ')[0],
        inspector: b.inspector || '',
        remark: b.remark || '',
        creation_date: now,
        creation_man: username
      }
    });

    res.json(success({ inspection_number: inspectionNumber }, '创建委外质检单成功'));
  } catch (err) { next(err); }
};

// ==================== 更新质检结果 ====================
export const updateInspectionResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [check]: any = await sequelize.query(`SELECT * FROM outsourcing_inspection WHERE inspection_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外质检单不存在' }); return; }
    if (check[0].inspection_status === '已完成') { res.status(403).json({ success: false, message: '已完成的质检单不允许修改' }); return; }

    const username = (req as any).user?.username || '';

    await sequelize.query(`
      UPDATE outsourcing_inspection SET
        inspection_date = :inspection_date,
        inspector = :inspector,
        inspection_result = :inspection_result,
        qualified_quantity = :qualified_quantity,
        unqualified_quantity = :unqualified_quantity,
        defect_description = :defect_description,
        handling_method = :handling_method,
        remark = :remark
      WHERE inspection_number = :id
    `, {
      replacements: {
        id,
        inspection_date: b.inspection_date || dayjs().format('YYYY/MM/DD HH:mm'),
        inspector: b.inspector || '',
        inspection_result: b.inspection_result,
        qualified_quantity: b.qualified_quantity || 0,
        unqualified_quantity: b.unqualified_quantity || 0,
        defect_description: b.defect_description || '',
        handling_method: b.handling_method || '',
        remark: b.remark || ''
      }
    });

    res.json(success(null, '更新质检结果成功'));
  } catch (err) { next(err); }
};

// ==================== 完成质检（触发入库和状态更新） ====================
export const completeInspection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const [check]: any = await sequelize.query(`SELECT * FROM outsourcing_inspection WHERE inspection_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外质检单不存在' }); return; }
    if (check[0].inspection_status === '已完成') { res.status(403).json({ success: false, message: '质检单已完成' }); return; }
    if (!check[0].inspection_result) { res.status(400).json({ success: false, message: '请先录入质检结果' }); return; }

    const transaction = await sequelize.transaction();
    try {
      // 1. 更新质检单状态
      await sequelize.query(`
        UPDATE outsourcing_inspection SET inspection_status = N'已完成'
        WHERE inspection_number = :id
      `, { replacements: { id }, transaction });

      // 2. 更新收回单的质检状态
      await sequelize.query(`
        UPDATE outsourcing_receipt SET
          inspection_status = :inspection_result,
          qualified_quantity = :qualified_quantity,
          unqualified_quantity = :unqualified_quantity
        WHERE receipt_number = :receipt_number
      `, {
        replacements: {
          inspection_result: check[0].inspection_result,
          qualified_quantity: check[0].qualified_quantity,
          unqualified_quantity: check[0].unqualified_quantity,
          receipt_number: check[0].receipt_number
        },
        transaction
      });

      // 3. 如果合格，增加库存
      if (check[0].inspection_result === '合格' && parseFloat(check[0].qualified_quantity) > 0) {
        const [receipt]: any = await sequelize.query(`
          SELECT warehouse_number, outsourcing_order_number FROM outsourcing_receipt WHERE receipt_number = :receipt_number
        `, { replacements: { receipt_number: check[0].receipt_number }, transaction });

        if (receipt.length) {
          const [order]: any = await sequelize.query(`
            SELECT item_number, item_name FROM outsourcing_order WHERE outsourcing_order_number = :order_number
          `, { replacements: { order_number: receipt[0].outsourcing_order_number }, transaction });

          if (order.length) {
            await sequelize.query(`
              UPDATE inventory 
              SET quantity = quantity + :qty,
                  last_update_date = GETDATE()
              WHERE warehouse_number = :warehouse 
                AND item_number = :item_number
            `, {
              replacements: {
                qty: check[0].qualified_quantity,
                warehouse: receipt[0].warehouse_number,
                item_number: order[0].item_number
              },
              transaction
            });
          }
        }
      }

      // 4. 更新委外订单的质检状态和合格数量
      const [orderCheck]: any = await sequelize.query(`
        SELECT outsourcing_order_number FROM outsourcing_inspection WHERE inspection_number = :id
      `, { replacements: { id }, transaction });

      if (orderCheck.length && orderCheck[0].outsourcing_order_number) {
        const [order]: any = await sequelize.query(`
          SELECT qualified_quantity FROM outsourcing_order WHERE outsourcing_order_number = :order_number
        `, { replacements: { order_number: orderCheck[0].outsourcing_order_number }, transaction });

        if (order.length) {
          const newQualifiedQty = parseFloat(order[0].qualified_quantity || 0) + parseFloat(check[0].qualified_quantity || 0);
          await sequelize.query(`
            UPDATE outsourcing_order 
            SET qualified_quantity = :qty,
                receipt_status = CASE 
                  WHEN received_quantity >= planned_quantity THEN N'已收回'
                  ELSE N'部分收回'
                END
            WHERE outsourcing_order_number = :order_number
          `, {
            replacements: {
              qty: newQualifiedQty,
              order_number: orderCheck[0].outsourcing_order_number
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success(null, '质检完成，库存已更新'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['inspection_number', 'receipt_number', 'outsourcing_order_number', 'inspection_date', 'inspector', 'inspection_result', 'qualified_quantity', 'unqualified_quantity', 'defect_description', 'handling_method', 'creation_date'];
const exportHeaderLabels = ['质检单号', '收回单号', '委外订单号', '检验日期', '检验员', '检验结果', '合格数量', '不合格数量', '缺陷描述', '处理方式', '创建日期'];

export const exportOutsourcingInspections = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE inspection_number LIKE :search OR receipt_number LIKE :search OR outsourcing_order_number LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [items]: any = await sequelize.query(`SELECT * FROM outsourcing_inspection ${whereClause} ORDER BY creation_date DESC`, { replacements });
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, exportFields, exportHeaderLabels, 'outsourcing_inspections', res, format);
  } catch (err) { next(err); }
};
