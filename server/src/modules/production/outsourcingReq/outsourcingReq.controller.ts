import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { generateOutsourcingOrderNumber, generateOutsourcingReqNumber } from '@/services/documentNumber.service';
import dayjs from 'dayjs';
import { ORDER_STATUS } from '@/shared/constants/statuses';

// Re-export from service for backward compatibility
export { generateOutsourcingReqNumber } from '@/services/documentNumber.service';

// ==================== 列表 ====================
export const getOutsourcingReqs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const order_status = (req.query.order_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(outsourcing_req_number LIKE :search OR production_order_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) { conditions.push(`approval_status = :approval_status`); replacements.approval_status = approval_status; }
    if (order_status) { conditions.push(`order_status = :order_status`); replacements.order_status = order_status; }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM outsourcing_req ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;

    const [items]: any = await sequelize.query(
      `SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC, outsourcing_req_number DESC) AS _row_num FROM outsourcing_req ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取委外申请列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情（含明细） ====================
export const getOutsourcingReqDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(`SELECT * FROM outsourcing_req WHERE outsourcing_req_number = :id`, { replacements: { id } });
    if (!rows.length) { res.status(404).json({ success: false, message: '委外申请单不存在' }); return; }

    const [details]: any = await sequelize.query(
      `SELECT * FROM outsourcing_req_detail WHERE outsourcing_req_number = :id ORDER BY line_number`,
      { replacements: { id } }
    );

    res.json(success({ ...rows[0], details }, '获取委外申请详情成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createOutsourcingReq = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const username = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      const reqNumber = await generateOutsourcingReqNumber(transaction);

      await sequelize.query(`
        INSERT INTO outsourcing_req (
          outsourcing_req_number, production_order_number, production_number,
          item_number, item_name, specifications, basic_unit, planned_quantity,
          approval_status, order_status, remark, creation_date, creation_man
        ) VALUES (
          :reqNumber, :production_order_number, :production_number,
          :item_number, :item_name, :specifications, :basic_unit, :planned_quantity,
          N'草稿', N'未执行', :remark, :creation_date, :creation_man
        )
      `, {
        replacements: {
          reqNumber,
          production_order_number: b.production_order_number || '',
          production_number: b.production_number || '',
          item_number: b.item_number || '',
          item_name: b.item_name || '',
          specifications: b.specifications || '',
          basic_unit: b.basic_unit || '',
          planned_quantity: b.planned_quantity || 0,
          remark: b.remark || '',
          creation_date: now,
          creation_man: username
        },
        transaction
      });

      // 插入明细行
      const details = b.details || [];
      for (let i = 0; i < details.length; i++) {
        const d = details[i];
        await sequelize.query(`
          INSERT INTO outsourcing_req_detail (
            outsourcing_req_number, line_number, process_task_number, step_number,
            standard_process_number, standard_process_name, work_center_number, work_center_name,
            planned_quantity, ordered_quantity, suggested_supplier_number, suggested_supplier_name,
            status, remark
          ) VALUES (
            :reqNumber, :line_number, :process_task_number, :step_number,
            :standard_process_number, :standard_process_name, :work_center_number, :work_center_name,
            :planned_quantity, 0, :suggested_supplier_number, :suggested_supplier_name,
            N'未执行', :remark
          )
        `, {
          replacements: {
            reqNumber,
            line_number: (i + 1) * 10,
            process_task_number: d.process_task_number || '',
            step_number: d.step_number || 0,
            standard_process_number: d.standard_process_number || '',
            standard_process_name: d.standard_process_name || '',
            work_center_number: d.work_center_number || '',
            work_center_name: d.work_center_name || '',
            planned_quantity: d.planned_quantity || 0,
            suggested_supplier_number: d.suggested_supplier_number || '',
            suggested_supplier_name: d.suggested_supplier_name || '',
            remark: d.remark || ''
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ outsourcing_req_number: reqNumber }, '创建委外申请单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 更新 ====================
export const updateOutsourcingReq = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [check]: any = await sequelize.query(`SELECT approval_status FROM outsourcing_req WHERE outsourcing_req_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外申请单不存在' }); return; }
    if (check[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return; }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE outsourcing_req SET
          remark = :remark
        WHERE outsourcing_req_number = :id
      `, { replacements: { id, remark: b.remark || '' }, transaction });

      // 重写明细行
      await sequelize.query(`DELETE FROM outsourcing_req_detail WHERE outsourcing_req_number = :id`, { replacements: { id }, transaction });

      const details = b.details || [];
      for (let i = 0; i < details.length; i++) {
        const d = details[i];
        await sequelize.query(`
          INSERT INTO outsourcing_req_detail (
            outsourcing_req_number, line_number, process_task_number, step_number,
            standard_process_number, standard_process_name, work_center_number, work_center_name,
            planned_quantity, ordered_quantity, suggested_supplier_number, suggested_supplier_name,
            status, remark
          ) VALUES (
            :reqNumber, :line_number, :process_task_number, :step_number,
            :standard_process_number, :standard_process_name, :work_center_number, :work_center_name,
            :planned_quantity, 0, :suggested_supplier_number, :suggested_supplier_name,
            N'未执行', :remark
          )
        `, {
          replacements: {
            reqNumber: id,
            line_number: (i + 1) * 10,
            process_task_number: d.process_task_number || '',
            step_number: d.step_number || 0,
            standard_process_number: d.standard_process_number || '',
            standard_process_name: d.standard_process_name || '',
            work_center_number: d.work_center_number || '',
            work_center_name: d.work_center_name || '',
            planned_quantity: d.planned_quantity || 0,
            suggested_supplier_number: d.suggested_supplier_number || '',
            suggested_supplier_name: d.suggested_supplier_name || '',
            remark: d.remark || ''
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success(null, '更新委外申请单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 删除 ====================
export const deleteOutsourcingReq = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [check]: any = await sequelize.query(`SELECT approval_status FROM outsourcing_req WHERE outsourcing_req_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外申请单不存在' }); return; }
    if (check[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return; }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM outsourcing_req_detail WHERE outsourcing_req_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM outsourcing_req WHERE outsourcing_req_number = :id`, { replacements: { id }, transaction });
      await transaction.commit();
      res.json(success(null, '删除委外申请单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 转委外订单 ====================
export const toOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    if (!b.supplier_number) { res.status(400).json({ success: false, message: '供应商不能为空' }); return; }
    if (!b.detail_ids || !b.detail_ids.length) { res.status(400).json({ success: false, message: '请选择要转单的明细行' }); return; }

    // 校验申请单审批状态
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM outsourcing_req WHERE outsourcing_req_number = :id`, { replacements: { id } }
    );
    if (!chk.length || chk[0].approval_status !== '已审批') {
      res.status(403).json({ success: false, message: '只有已审批的委外申请才能转委外订单' }); return;
    }

    // 获取选中的明细行
    const [selectedDetails]: any = await sequelize.query(
      `SELECT * FROM outsourcing_req_detail WHERE outsourcing_req_number = :id AND id IN (:detail_ids)`,
      { replacements: { id, detail_ids: b.detail_ids } }
    );
    if (!selectedDetails.length) { res.status(400).json({ success: false, message: '未找到选中的明细行' }); return; }

    // 获取申请单头信息
    const [reqHeader]: any = await sequelize.query(
      `SELECT * FROM outsourcing_req WHERE outsourcing_req_number = :id`, { replacements: { id } }
    );

    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const username = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      const createdOrders: string[] = [];

      for (const d of selectedDetails) {
        const reqQty = parseFloat(d.planned_quantity) || 0;
        const orderedQty = parseFloat(d.ordered_quantity) || 0;
        const remaining = reqQty - orderedQty;
        if (remaining <= 0) continue;

        const unitPrice = parseFloat(b.unit_prices?.[d.id]) || 0;
        const ooNumber = await generateOutsourcingOrderNumber(transaction);

        // 创建委外订单（一条明细 → 一张委外订单）
        await sequelize.query(`
          INSERT INTO outsourcing_order (
            outsourcing_order_number, process_task_number, production_order_number, production_number,
            process_route_number, step_number, standard_process_number, standard_process_name,
            work_center_number, work_center_name, item_number, item_name, specifications, basic_unit,
            planned_quantity, received_quantity, supplier_number, supplier_name,
            unit_price, total_amount, expected_return_date,
            approval_status, order_status, source_req_number, source_req_detail_id,
            remark, creation_date, creation_man
          ) VALUES (
            :ooNumber, :process_task_number, :production_order_number, :production_number,
            '', :step_number, :standard_process_number, :standard_process_name,
            :work_center_number, :work_center_name, :item_number, :item_name, :specifications, :basic_unit,
            :planned_quantity, 0, :supplier_number, :supplier_name,
            :unit_price, :total_amount, :expected_return_date,
            N'草稿', N'待发出', :source_req_number, :source_req_detail_id,
            :remark, :creation_date, :creation_man
          )
        `, {
          replacements: {
            ooNumber,
            process_task_number: d.process_task_number || '',
            production_order_number: reqHeader[0].production_order_number || '',
            production_number: reqHeader[0].production_number || '',
            step_number: d.step_number || 0,
            standard_process_number: d.standard_process_number || '',
            standard_process_name: d.standard_process_name || '',
            work_center_number: d.work_center_number || '',
            work_center_name: d.work_center_name || '',
            item_number: reqHeader[0].item_number || '',
            item_name: reqHeader[0].item_name || '',
            specifications: reqHeader[0].specifications || '',
            basic_unit: reqHeader[0].basic_unit || '',
            planned_quantity: remaining,
            supplier_number: b.supplier_number || '',
            supplier_name: b.supplier_name || '',
            unit_price: unitPrice,
            total_amount: remaining * unitPrice,
            expected_return_date: b.expected_return_date || '',
            source_req_number: id,
            source_req_detail_id: d.id,
            remark: b.remark || '',
            creation_date: now,
            creation_man: username
          },
          transaction
        });

        createdOrders.push(ooNumber);

        // 回写申请单明细行
        const newOrdered = orderedQty + remaining;
        const newStatus = newOrdered >= reqQty ? '已转单' : '部分转单';
        await sequelize.query(
          `UPDATE outsourcing_req_detail SET ordered_quantity = :newOrdered, status = :newStatus WHERE id = :detailId`,
          { replacements: { newOrdered, newStatus, detailId: d.id }, transaction }
        );
      }

      // 更新申请单头转单状态
      const [allDetails]: any = await sequelize.query(
        `SELECT status FROM outsourcing_req_detail WHERE outsourcing_req_number = :id`,
        { replacements: { id }, transaction }
      );
      const allDone = allDetails.every((r: any) => r.status === '已转单');
      const anyDone = allDetails.some((r: any) => r.status !== ORDER_STATUS.UNEXECUTED);
      const newOrderStatus = allDone ? '已转单' : (anyDone ? '部分转单' : ORDER_STATUS.UNEXECUTED);
      await sequelize.query(
        `UPDATE outsourcing_req SET order_status = :newOrderStatus WHERE outsourcing_req_number = :id`,
        { replacements: { newOrderStatus, id }, transaction }
      );

      await transaction.commit();
      res.json(success({ created_orders: createdOrders }, `成功转${createdOrders.length}张委外订单`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['outsourcing_req_number', 'production_order_number', 'item_number', 'item_name', 'specifications', 'basic_unit', 'planned_quantity', 'approval_status', 'order_status', 'remark', 'creation_date', 'creation_man'];
const exportHeaderLabels = ['委外申请号', '生产单号', '产品编号', '产品名称', '规格', '单位', '计划数量', '审批状态', '转单状态', '备注', '创建日期', '创建人'];

export const exportOutsourcingReqs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE outsourcing_req_number LIKE :search OR production_order_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [items]: any = await sequelize.query(`SELECT * FROM outsourcing_req ${whereClause} ORDER BY creation_date DESC`, { replacements });
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, exportFields, exportHeaderLabels, 'outsourcing_reqs', res, format);
  } catch (err) { next(err); }
};
