import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { generateOutsourcingIssueNumber } from '@/services/documentNumber.service';
import { generateMaterialTxnNumber, syncMaterialInventorySummary } from '@/services/inventory.service';
import dayjs from 'dayjs';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { fifoDeductBatches, upsertMaterialInventory, createMaterialTransaction } from '@/services/warehouse/helpers';
import { logLinesideMovement } from '@/services/linesideMovement.service';

// Re-export from service for backward compatibility
export { generateOutsourcingIssueNumber } from '@/services/documentNumber.service';

// ==================== 列表 ====================
export const getOutsourcingIssues = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(issue_number LIKE :search OR outsourcing_order_number LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (status) { conditions.push(`status = :status`); replacements.status = status; }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM outsourcing_material_issue omi ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;

    const [items]: any = await sequelize.query(
      `SELECT t.*, oo.supplier_name FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC, issue_number DESC) AS _row_num FROM outsourcing_material_issue ${whereClause}) AS t LEFT JOIN outsourcing_order oo ON oo.outsourcing_order_number = t.outsourcing_order_number WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取委外发料单列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情（含明细） ====================
export const getOutsourcingIssueDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(`SELECT * FROM outsourcing_material_issue WHERE issue_number = :id`, { replacements: { id } });
    if (!rows.length) { res.status(404).json({ success: false, message: '委外发料单不存在' }); return; }

    const [details]: any = await sequelize.query(
      `SELECT * FROM outsourcing_material_issue_detail WHERE issue_number = :id ORDER BY line_number`,
      { replacements: { id } }
    );

    res.json(success({ ...rows[0], details }, '获取委外发料单详情成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createOutsourcingIssue = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.outsourcing_order_number) { res.status(400).json({ success: false, message: '委外订单号不能为空' }); return; }

    // 校验委外订单状态
    const [orderCheck]: any = await sequelize.query(
      `SELECT approval_status, order_status, planned_quantity FROM outsourcing_order WHERE outsourcing_order_number = :id`,
      { replacements: { id: b.outsourcing_order_number } }
    );
    if (!orderCheck.length) { res.status(404).json({ success: false, message: '委外订单不存在' }); return; }
    if (orderCheck[0].approval_status !== '已审批') { res.status(403).json({ success: false, message: '委外订单未审批，不能发料' }); return; }

    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const username = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      const issueNumber = await generateOutsourcingIssueNumber(transaction);

      await sequelize.query(`
        INSERT INTO outsourcing_material_issue (
          issue_number, outsourcing_order_number, issue_date,
          warehouse_number, warehouse_name, handler,
          status, remark, creation_date, creation_man
        ) VALUES (
          :issueNumber, :outsourcing_order_number, :issue_date,
          :warehouse_number, :warehouse_name, :handler,
          N'草稿', :remark, :creation_date, :creation_man
        )
      `, {
        replacements: {
          issueNumber,
          outsourcing_order_number: b.outsourcing_order_number,
          issue_date: b.issue_date || now.split(' ')[0],
          warehouse_number: b.warehouse_number || '',
          warehouse_name: b.warehouse_name || '',
          handler: b.handler || '',
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
          INSERT INTO outsourcing_material_issue_detail (
            issue_number, line_number, item_number, item_name,
            specifications, batch_number, issued_quantity, unit, remark
          ) VALUES (
            :issueNumber, :line_number, :item_number, :item_name,
            :specifications, :batch_number, :issued_quantity, :unit, :remark
          )
        `, {
          replacements: {
            issueNumber,
            line_number: (i + 1) * 10,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            batch_number: d.batch_number || '',
            issued_quantity: d.issued_quantity || 0,
            unit: d.unit || '',
            remark: d.remark || ''
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ issue_number: issueNumber }, '创建委外发料单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 更新 ====================
export const updateOutsourcingIssue = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [check]: any = await sequelize.query(`SELECT status FROM outsourcing_material_issue WHERE issue_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外发料单不存在' }); return; }
    if (check[0].status !== '草稿') { res.status(403).json({ success: false, message: '非草稿状态不允许编辑' }); return; }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE outsourcing_material_issue SET
          issue_date = :issue_date, warehouse_number = :warehouse_number, warehouse_name = :warehouse_name,
          handler = :handler, remark = :remark
        WHERE issue_number = :id
      `, {
        replacements: {
          id,
          issue_date: b.issue_date,
          warehouse_number: b.warehouse_number,
          warehouse_name: b.warehouse_name,
          handler: b.handler,
          remark: b.remark || ''
        },
        transaction
      });

      // 重写明细行
      await sequelize.query(`DELETE FROM outsourcing_material_issue_detail WHERE issue_number = :id`, { replacements: { id }, transaction });

      const details = b.details || [];
      for (let i = 0; i < details.length; i++) {
        const d = details[i];
        await sequelize.query(`
          INSERT INTO outsourcing_material_issue_detail (
            issue_number, line_number, item_number, item_name,
            specifications, batch_number, issued_quantity, unit, remark
          ) VALUES (
            :issueNumber, :line_number, :item_number, :item_name,
            :specifications, :batch_number, :issued_quantity, :unit, :remark
          )
        `, {
          replacements: {
            issueNumber: id,
            line_number: (i + 1) * 10,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            batch_number: d.batch_number || '',
            issued_quantity: d.issued_quantity || 0,
            unit: d.unit || '',
            remark: d.remark || ''
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success(null, '更新委外发料单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 删除 ====================
export const deleteOutsourcingIssue = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [check]: any = await sequelize.query(`SELECT status FROM outsourcing_material_issue WHERE issue_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外发料单不存在' }); return; }
    if (check[0].status !== '草稿') { res.status(403).json({ success: false, message: '非草稿状态不允许删除' }); return; }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM outsourcing_material_issue_detail WHERE issue_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM outsourcing_material_issue WHERE issue_number = :id`, { replacements: { id }, transaction });
      await transaction.commit();
      res.json(success(null, '删除委外发料单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 审核 ====================
export const approveIssue = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [check]: any = await sequelize.query(`SELECT status FROM outsourcing_material_issue WHERE issue_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外发料单不存在' }); return; }
    if (check[0].status !== '草稿') { res.status(403).json({ success: false, message: '只能审核草稿状态的发料单' }); return; }

    await sequelize.query(`UPDATE outsourcing_material_issue SET status = N'已审核' WHERE issue_number = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

// ==================== 确认发料（扣减material体系库存+线边仓流水） ====================
export const confirmIssue = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    const [check]: any = await sequelize.query(`SELECT * FROM outsourcing_material_issue WHERE issue_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外发料单不存在' }); return; }
    if (check[0].status !== '待确认') { res.status(403).json({ success: false, message: '只能确认待确认状态的发料单' }); return; }

    const [details]: any = await sequelize.query(`SELECT * FROM outsourcing_material_issue_detail WHERE issue_number = :id`, { replacements: { id } });

    const transaction = await sequelize.transaction();
    try {
      const operator = (req as any).user?.username || '';
      const warehouseNumber = check[0].warehouse_number || '';
      const warehouseName = check[0].warehouse_name || '';
      const productionOrderNumber = check[0].production_order_number || '';
      const stepNumber = check[0].step_number || 0;
      const workCenterNumber = check[0].work_center_number || '';
      const workCenterName = check[0].work_center_name || '';

      // 扣减库存（material体系）
      for (const d of details) {
        const issuedQty = parseFloat(d.issued_quantity) || 0;
        if (issuedQty <= 0) continue;

        // 1. 从工序线边仓 FIFO 扣减 material_batch_inventory
        await fifoDeductBatches({
          batchTable: 'material_batch_inventory',
          item_number: d.item_number,
          warehouse_number: warehouseNumber,
          totalQuantity: issuedQty,
        }, transaction);

        // 2. 同步 material_inventory 汇总表
        await syncMaterialInventorySummary(d.item_number, warehouseNumber, transaction);

        // 3. 记录 material_inventory_transaction 出库流水
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
          source_number: String(id),
          item_number: d.item_number,
          item_name: d.item_name || mat.item_name || '',
          item_type: mat.item_type || '',
          specifications: d.specifications || mat.specifications || '',
          basic_unit: d.unit || mat.basic_unit || '',
          warehouse_number: warehouseNumber,
          warehouse_name: warehouseName,
          quantity: issuedQty,
          before_quantity: 0, // 由汇总表计算
          after_quantity: 0,
          batch_number: '',
          supplier_number: '', supplier_name: '',
          operator,
          remark: '委外备料出库确认'
        }, transaction);

        // 4. 记录线边仓出库流水
        await logLinesideMovement({
          transactionType: '出线边',
          sourceType: '委外备料出库',
          sourceNumber: String(id),
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
          remark: '委外备料出库'
        }, transaction);
      }

      // 更新发料单状态
      await sequelize.query(`UPDATE outsourcing_material_issue SET status = N'已出库' WHERE issue_number = :id`, { replacements: { id }, transaction });

      await transaction.commit();
      res.json(success(null, '发料确认成功，库存已扣减'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 追加发料（分批发料：为同一委外订单创建新的出库申请） ====================
export const appendIssue = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.outsourcing_order_number) { res.status(400).json({ success: false, message: '委外订单号不能为空' }); return; }
    if (!b.batch_quantity || parseFloat(b.batch_quantity) <= 0) { res.status(400).json({ success: false, message: '追加发料数量必须大于0' }); return; }

    const batchQuantity = parseFloat(b.batch_quantity);

    // 查询委外订单
    const [orderCheck]: any = await sequelize.query(
      `SELECT * FROM outsourcing_order WHERE outsourcing_order_number = :id`,
      { replacements: { id: b.outsourcing_order_number } }
    );
    if (!orderCheck.length) { res.status(404).json({ success: false, message: '委外订单不存在' }); return; }
    const order = orderCheck[0];
    if (order.approval_status !== '已审批') { res.status(403).json({ success: false, message: '委外订单未审批，不能追加发料' }); return; }

    // 查询工序任务信息
    const [tasks]: any = await sequelize.query(
      `SELECT pt.*, wc.warehouse_number AS wc_warehouse_number, wc.warehouse_name AS wc_warehouse_name FROM process_task pt LEFT JOIN work_center wc ON pt.work_center_number = wc.work_cente_number WHERE pt.process_task_number = :ptn`,
      { replacements: { ptn: order.process_task_number } }
    );
    if (!tasks.length) { res.status(400).json({ success: false, message: '工序任务不存在' }); return; }
    const task = tasks[0];

    // 查询制造BOM
    const [bomItems]: any = await sequelize.query(
      `SELECT bd.material_number, im.item_name, im.specifications, bd.standard_quantity, im.basic_unit AS unit
       FROM mfg_bom_detail bd
       INNER JOIN mfg_bom_header bh ON bd.mfg_bom_number = bh.mfg_bom_number
       LEFT JOIN item_master im ON bd.material_number = im.item_number
       WHERE bh.item_number = :item_number AND bh.[condition] = N'启用' AND bh.approval_status = N'已审批'`,
      { replacements: { item_number: order.item_number || '' } }
    );

    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const username = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      const issueNumber = await generateOutsourcingIssueNumber(transaction);

      // 创建出库申请
      await sequelize.query(`
        INSERT INTO outsourcing_material_issue (
          issue_number, outsourcing_order_number, issue_date,
          warehouse_number, warehouse_name, handler,
          doc_type, work_center_number, work_center_name, step_number,
          production_order_number, process_task_number,
          status, remark, creation_date, creation_man
        ) VALUES (
          :issueNumber, :ooNumber, :issue_date,
          :warehouse_number, :warehouse_name, '',
          N'issue', :wc_number, :wc_name, :step_number,
          :production_order_number, :process_task_number,
          N'待确认', N'追加发料', :creation_date, :creation_man
        )
      `, {
        replacements: {
          issueNumber, ooNumber: b.outsourcing_order_number,
          issue_date: now.split(' ')[0],
          warehouse_number: task.wc_warehouse_number || '',
          warehouse_name: task.wc_warehouse_name || '',
          wc_number: task.work_center_number || '',
          wc_name: task.work_center_name || '',
          step_number: task.step_number || 0,
          production_order_number: order.production_order_number || '',
          process_task_number: order.process_task_number || '',
          creation_date: now, creation_man: username
        },
        transaction
      });

      // 插入明细（BOM × batch_quantity）
      for (let bi = 0; bi < bomItems.length; bi++) {
        const bomItem = bomItems[bi];
        await sequelize.query(`
          INSERT INTO outsourcing_material_issue_detail (
            issue_number, line_number, item_number, item_name,
            specifications, batch_number, issued_quantity, unit, remark
          ) VALUES (
            :issueNumber, :line_number, :item_number, :item_name,
            :specifications, '', :issued_quantity, :unit, ''
          )
        `, {
          replacements: {
            issueNumber,
            line_number: (bi + 1) * 10,
            item_number: bomItem.material_number || '',
            item_name: bomItem.item_name || '',
            specifications: bomItem.specifications || '',
            issued_quantity: (parseFloat(bomItem.standard_quantity) || 0) * batchQuantity,
            unit: bomItem.unit || ''
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ issue_number: issueNumber, batch_quantity: batchQuantity }, '追加发料申请创建成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['issue_number', 'outsourcing_order_number', 'issue_date', 'warehouse_name', 'handler', 'status', 'remark', 'creation_date', 'creation_man'];
const exportHeaderLabels = ['发料单号', '委外订单号', '发料日期', '发料仓库', '经办人', '状态', '备注', '创建日期', '创建人'];

export const exportOutsourcingIssues = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE omi.issue_number LIKE :search OR omi.outsourcing_order_number LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [items]: any = await sequelize.query(`SELECT omi.* FROM outsourcing_material_issue omi ${whereClause} ORDER BY omi.creation_date DESC`, { replacements });
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, exportFields, exportHeaderLabels, 'outsourcing_material_issues', res, format);
  } catch (err) { next(err); }
};
