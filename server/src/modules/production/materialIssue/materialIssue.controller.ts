import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import dayjs from 'dayjs';
import { generateMaterialTxnNumber, syncMaterialInventorySummary } from '@/services/inventory.service';
import { logLinesideMovement } from '@/services/linesideMovement.service';
import { syncProductionStatus } from '@/services/salesOrderSync.service';

// 自动生成领料单编号: MI-YYYYMMDD-NNN
const generateIssueNumber = async (): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `MI-${today}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(issue_number) as max_num FROM material_issue WHERE issue_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return prefix + String(seq).padStart(3, '0');
};

// ==================== 模糊搜索生产单 ====================
export const fuzzySearchOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keyword = (req.query.keyword as string) || '';
    if (!keyword.trim()) {
      res.json(success({ items: [] }, '请输入搜索关键字'));
      return;
    }

    const [items]: any = await sequelize.query(`
      SELECT TOP 10 production_order_number, production_number, item_number, item_name, specifications, planned_quantity, basic_unit, plan_status
      FROM production_order
      WHERE production_order_number LIKE :kw OR RIGHT(production_order_number, 7) LIKE :kw
      ORDER BY production_order_number DESC
    `, { replacements: { kw: `%${keyword.trim()}%` } });

    res.json(success({ items }, '搜索成功'));
  } catch (err) { next(err); }
};

// ==================== 按生产单查询备料信息 ====================
export const queryByOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderNo = req.params.orderNo;
    if (!orderNo) {
      res.status(400).json({ success: false, message: '请提供生产单编号' });
      return;
    }

    // 1. 模糊查询生产单
    const [orders]: any = await sequelize.query(`
      SELECT TOP 20 production_order_number, production_number, item_number, item_name,
             specifications, basic_unit, planned_quantity, plan_status, approval_status,
             equipment_name, mould_number, production_date,
             actual_cavity_count, actual_hole_count, actual_daily_output,
             formed_part_specifications, formed_part_unit_consumption
      FROM production_order
      WHERE production_order_number LIKE :kw OR RIGHT(production_order_number, 7) LIKE :kw
      ORDER BY production_order_number DESC
    `, { replacements: { kw: `%${orderNo}%` } });

    if (!orders.length) {
      res.status(404).json({ success: false, message: '未找到匹配的生产单' });
      return;
    }

    // 多条匹配时返回候选列表，由前端让用户选择
    if (orders.length > 1) {
      res.json(success({ matchType: 'multiple', candidates: orders }, `找到 ${orders.length} 条匹配记录，请选择`));
      return;
    }

    const order = orders[0];
    const actualOrderNo = order.production_order_number;

    // 2. 查询备料单（使用实际查到的生产单编号，而非用户输入）
    const [preps]: any = await sequelize.query(`
      SELECT preparation_number, production_order_number, production_number,
             item_number, item_name, specifications, basic_unit,
             bom_number, bom_version, planned_quantity, bom_base_quantity,
             total_material_types, preparation_status, approval_status,
             creation_date, creation_man
      FROM material_preparation
      WHERE production_order_number = :actualOrderNo
      ORDER BY preparation_number DESC
    `, { replacements: { actualOrderNo } });

    if (!preps.length) {
      res.json(success({ order, preparation: null, details: [], previousIssues: [] }, '该生产单尚未生成备料单，请先派发生产单'));
      return;
    }

    const preparation = preps[0];

    // 3. 查询备料明细
    const [details]: any = await sequelize.query(`
      SELECT id, preparation_number, line_number, material_number, material_name,
             material_type, unit, bom_standard_quantity, bom_wastage_rate,
             bom_actual_quantity, required_quantity, adjusted_quantity, issued_quantity,
             step_number, work_center_number, work_center_name,
             is_key_material, substitute_group, substitute_priority,
             supply_type, default_warehouse, bom_path, remark
      FROM material_preparation_detail
      WHERE preparation_number = :prepNo
      ORDER BY line_number
    `, { replacements: { prepNo: preparation.preparation_number } });

    // 4. 查询历史领料记录
    const [previousIssues]: any = await sequelize.query(`
      SELECT issue_number, total_issue_items, issue_status, remark, creation_date, creation_man
      FROM material_issue
      WHERE preparation_number = :prepNo
      ORDER BY creation_date DESC
    `, { replacements: { prepNo: preparation.preparation_number } });

    res.json(success({ order, preparation, details, previousIssues }, '查询成功'));
  } catch (err) { next(err); }
};

// ==================== 创建领料记录 ====================
export const createMaterialIssue = async (req: Request, res: Response, next: NextFunction) => {
  const transaction = await sequelize.transaction();
  try {
    const user = (req as any).user;
    const b = req.body;

    if (!b.preparation_number) {
      res.status(400).json({ success: false, message: '备料单编号不能为空' });
      return;
    }
    if (!b.items || !Array.isArray(b.items)) {
      res.status(400).json({ success: false, message: '领料明细不能为空' });
      return;
    }

    // 过滤有效行
    const validItems = b.items.filter((item: any) => parseFloat(item.actual_quantity) > 0);
    if (validItems.length === 0) {
      res.status(400).json({ success: false, message: '至少需要一行实际备料数量大于0' });
      return;
    }

    // 查询备料单信息
    const [preps]: any = await sequelize.query(
      `SELECT preparation_number, production_order_number, production_number, item_number, item_name, specifications, basic_unit, planned_quantity FROM material_preparation WHERE preparation_number = :prepNo`,
      { replacements: { prepNo: b.preparation_number }, transaction }
    );
    if (!preps.length) {
      await transaction.rollback();
      res.status(404).json({ success: false, message: '备料单不存在' });
      return;
    }
    const prep = preps[0];

    // 生成领料单编号
    const issue_number = await generateIssueNumber();
    const now = dayjs().format('YYYY/MM/DD HH:mm');

    // 插入领料单主表
    await sequelize.query(`
      INSERT INTO material_issue (issue_number, preparation_number, production_order_number, production_number, item_number, item_name, specifications, basic_unit, planned_quantity, total_issue_items, issue_status, remark, creation_date, creation_man)
      VALUES (:issue_number, :preparation_number, :production_order_number, :production_number, :item_number, :item_name, :specifications, :basic_unit, :planned_quantity, :total_issue_items, N'已领料', :remark, :creation_date, :creation_man)
    `, {
      replacements: {
        issue_number,
        preparation_number: b.preparation_number,
        production_order_number: b.production_order_number || prep.production_order_number || '',
        production_number: prep.production_number || '',
        item_number: prep.item_number || '',
        item_name: prep.item_name || '',
        specifications: prep.specifications || '',
        basic_unit: prep.basic_unit || '',
        planned_quantity: prep.planned_quantity || 0,
        total_issue_items: validItems.length,
        remark: b.remark || '',
        creation_date: now,
        creation_man: user?.username || ''
      },
      transaction
    });

    // 插入领料明细 + 更新备料明细已领量
    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];
      const actualQty = parseFloat(item.actual_quantity) || 0;

      await sequelize.query(`
        INSERT INTO material_issue_detail (issue_number, preparation_detail_id, line_number, material_number, material_name, material_type, unit, required_quantity, actual_quantity, batch_number, step_number, work_center_name, is_key_material, default_warehouse, remark)
        VALUES (:issue_number, :preparation_detail_id, :line_number, :material_number, :material_name, :material_type, :unit, :required_quantity, :actual_quantity, :batch_number, :step_number, :work_center_name, :is_key_material, :default_warehouse, :remark)
      `, {
        replacements: {
          issue_number,
          preparation_detail_id: item.preparation_detail_id || 0,
          line_number: (i + 1) * 10,
          material_number: item.material_number || '',
          material_name: item.material_name || '',
          material_type: item.material_type || '',
          unit: item.unit || '',
          required_quantity: item.required_quantity || 0,
          actual_quantity: actualQty,
          batch_number: item.batch_number || '',
          step_number: item.step_number != null ? item.step_number : null,
          work_center_name: item.work_center_name || '',
          is_key_material: item.is_key_material || 0,
          default_warehouse: item.default_warehouse || '',
          remark: item.remark || ''
        },
        transaction
      });

      // 更新备料明细已领料数量
      if (item.preparation_detail_id) {
        await sequelize.query(`
          UPDATE material_preparation_detail
          SET issued_quantity = ISNULL(issued_quantity, 0) + :actualQty
          WHERE id = :detailId
        `, {
          replacements: { actualQty, detailId: item.preparation_detail_id },
          transaction
        });
      }

      // 自动扣减物料库存 - 按批次扣减 (若有默认仓库和批次号)
      const whNumber = (item.default_warehouse || '').trim();
      const batchNumber = (item.batch_number || '').trim();
      if (whNumber && actualQty > 0 && batchNumber) {
        // 从批次库存表扣减
        const [batchRows]: any = await sequelize.query(
          `SELECT id, quantity FROM material_batch_inventory WHERE batch_number = :bn AND item_number = :material_number AND warehouse_number = :wh AND status = N'正常'`,
          { replacements: { bn: batchNumber, material_number: item.material_number, wh: whNumber }, transaction }
        );

        if (batchRows.length > 0) {
          const batchBefore = Number(batchRows[0].quantity);
          if (batchBefore >= actualQty) {
            const batchAfter = batchBefore - actualQty;
            await sequelize.query(
              `UPDATE material_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
              { replacements: { qty: batchAfter, id: batchRows[0].id }, transaction }
            );

            // 同步汇总表
            await syncMaterialInventorySummary(item.material_number, whNumber, transaction);

            // 记录流水
            const [invRows]: any = await sequelize.query(
              `SELECT item_name, item_type, specifications, basic_unit, warehouse_name FROM material_inventory WHERE item_number = :material_number AND warehouse_number = :wh`,
              { replacements: { material_number: item.material_number, wh: whNumber }, transaction }
            );
            const invInfo = invRows[0] || {};

            const mtNum = await generateMaterialTxnNumber();
            await sequelize.query(`
              INSERT INTO material_inventory_transaction (transaction_number, transaction_type, source_type, source_number,
                item_number, item_name, item_type, specifications, basic_unit,
                warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
                batch_number, operator, operation_date, remark, creation_date)
              VALUES (:txn, N'出库', N'领料出库', :source,
                :item_number, :item_name, :item_type, :specifications, :basic_unit,
                :wh_number, :wh_name, :qty, :before, :after,
                :batch, :operator, GETDATE(), :remark, GETDATE())
            `, {
              replacements: {
                txn: mtNum, source: issue_number,
                item_number: item.material_number, item_name: invInfo.item_name || item.material_name || '',
                item_type: invInfo.item_type || '', specifications: invInfo.specifications || '',
                basic_unit: invInfo.basic_unit || item.unit || '',
                wh_number: whNumber, wh_name: invInfo.warehouse_name || '',
                qty: actualQty, before: batchBefore, after: batchAfter,
                batch: batchNumber,
                operator: user?.username || '',
                remark: `领料单 ${issue_number}`
              }, transaction
            });
          }
          // 批次库存不足时不阻塞领料，仅跳过扣减
        }
      } else if (whNumber && actualQty > 0 && !batchNumber) {
        // 无批次号时，保留旧的汇总扣减逻辑（向后兼容）
        const [invRows]: any = await sequelize.query(
          `SELECT id, quantity, item_name, item_type, specifications, basic_unit, warehouse_name FROM material_inventory WHERE item_number = :material_number AND warehouse_number = :wh`,
          { replacements: { material_number: item.material_number, wh: whNumber }, transaction }
        );

        if (invRows.length > 0) {
          const beforeQty = Number(invRows[0].quantity);
          if (beforeQty >= actualQty) {
            const afterQty = beforeQty - actualQty;
            await sequelize.query(
              `UPDATE material_inventory SET quantity = :afterQty, last_updated = GETDATE() WHERE id = :id`,
              { replacements: { afterQty, id: invRows[0].id }, transaction }
            );

            const mtNum = await generateMaterialTxnNumber();
            await sequelize.query(`
              INSERT INTO material_inventory_transaction (transaction_number, transaction_type, source_type, source_number,
                item_number, item_name, item_type, specifications, basic_unit,
                warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
                batch_number, operator, operation_date, remark, creation_date)
              VALUES (:txn, N'出库', N'领料出库', :source,
                :item_number, :item_name, :item_type, :specifications, :basic_unit,
                :wh_number, :wh_name, :qty, :before, :after,
                :batch, :operator, GETDATE(), :remark, GETDATE())
            `, {
              replacements: {
                txn: mtNum, source: issue_number,
                item_number: item.material_number, item_name: invRows[0].item_name || item.material_name || '',
                item_type: invRows[0].item_type || '', specifications: invRows[0].specifications || '',
                basic_unit: invRows[0].basic_unit || item.unit || '',
                wh_number: whNumber, wh_name: invRows[0].warehouse_name || '',
                qty: actualQty, before: beforeQty, after: afterQty,
                batch: '',
                operator: user?.username || '',
                remark: `领料单 ${issue_number}`
              }, transaction
            });
          }
        }
      }
    }

    // 重新计算备料单状态
    const [statusRows]: any = await sequelize.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN ISNULL(issued_quantity, 0) >= ISNULL(required_quantity, 0) AND ISNULL(required_quantity, 0) > 0 THEN 1 ELSE 0 END) as fully_issued,
        SUM(CASE WHEN ISNULL(issued_quantity, 0) > 0 THEN 1 ELSE 0 END) as partially_issued
      FROM material_preparation_detail
      WHERE preparation_number = :prepNo
    `, { replacements: { prepNo: b.preparation_number }, transaction });

    let newStatus = '未领料';
    if (statusRows.length > 0) {
      const { total, fully_issued, partially_issued } = statusRows[0];
      if (fully_issued >= total && total > 0) {
        newStatus = '已领料';
      } else if (partially_issued > 0) {
        newStatus = '部分领料';
      }
    }

    await sequelize.query(
      `UPDATE material_preparation SET preparation_status = :status WHERE preparation_number = :prepNo`,
      { replacements: { status: newStatus, prepNo: b.preparation_number }, transaction }
    );

    // === 首道工序物料全部领完 → 生产单状态 已派发→已备料 ===
    try {
      const orderNoForStatus = b.production_order_number || prep.production_order_number || '';
      if (orderNoForStatus) {
        // 查询该备料单中最小的 step_number（首道工序）
        const [minStepRows]: any = await sequelize.query(
          `SELECT MIN(step_number) as first_step FROM material_preparation_detail WHERE preparation_number = :prepNo AND step_number IS NOT NULL`,
          { replacements: { prepNo: b.preparation_number }, transaction }
        );
        const firstStep = minStepRows[0]?.first_step;
        if (firstStep != null) {
          // 检查首道工序的所有物料是否已全部领完
          const [firstStepStatus]: any = await sequelize.query(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN ISNULL(issued_quantity, 0) >= ISNULL(required_quantity, 0) AND ISNULL(required_quantity, 0) > 0 THEN 1 ELSE 0 END) as fully_issued
            FROM material_preparation_detail
            WHERE preparation_number = :prepNo AND step_number = :firstStep
          `, { replacements: { prepNo: b.preparation_number, firstStep }, transaction });
          const fTotal = parseInt(firstStepStatus[0]?.total) || 0;
          const fIssued = parseInt(firstStepStatus[0]?.fully_issued) || 0;
          if (fTotal > 0 && fIssued >= fTotal) {
            // 仅做 已派发→已备料 的单向转换
            await sequelize.query(
              `UPDATE production_order SET plan_status = N'已备料' WHERE production_order_number = :orderNo AND plan_status = N'已派发'`,
              { replacements: { orderNo: orderNoForStatus }, transaction }
            );
            // 回写销售订单明细 production_status
            await syncProductionStatus(orderNoForStatus, '待生产', transaction);
          }
        }
      }
    } catch (e) { console.log('[materialIssue] 已备料状态更新跳过:', e); }

    // 线边仓流转：领料 -> 首道工序线边 IN
    try {
      const orderNo = b.production_order_number || prep.production_order_number || '';
      if (orderNo) {
        const [firstSteps]: any = await sequelize.query(
          `SELECT TOP 1 step_number, work_center_number, work_center_name
           FROM process_task
           WHERE production_order_number = :orderNo
           ORDER BY step_number ASC`,
          { replacements: { orderNo }, transaction }
        );
        if (firstSteps.length > 0) {
          const totalIssueQty = validItems.reduce((sum: number, item: any) => sum + (parseFloat(item.actual_quantity) || 0), 0);
          if (totalIssueQty > 0) {
            await logLinesideMovement({
              transactionType: '入线边',
              sourceType: '领料入线',
              sourceNumber: issue_number,
              productionOrderNumber: orderNo,
              itemNumber: prep.item_number || '',
              itemName: prep.item_name || '',
              specifications: prep.specifications || '',
              basicUnit: prep.basic_unit || '',
              stepNumber: firstSteps[0].step_number,
              workCenterNumber: firstSteps[0].work_center_number || '',
              workCenterName: firstSteps[0].work_center_name || '',
              quantity: totalIssueQty,
              direction: 'IN',
              operator: user?.username || '',
              remark: `领料单 ${issue_number} 入线边`
            }, transaction);
          }
        }
      }
    } catch (lsErr) {
      console.error('[WIP] logLinesideMovement for material issue error:', lsErr);
    }

    await transaction.commit();
    res.json(success({ issue_number }, '领料记录保存成功'));
  } catch (err) {
    await transaction.rollback();
    next(err);
  }
};

// ==================== 领料记录列表 ====================
export const getMaterialIssues = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(issue_number LIKE :search OR production_order_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search OR preparation_number LIKE :search)`);
      replacements.search = `%${search}%`;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM material_issue ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT issue_number, preparation_number, production_order_number, production_number,
               item_number, item_name, specifications, basic_unit, planned_quantity,
               total_issue_items, issue_status, remark, creation_date, creation_man,
               ROW_NUMBER() OVER (ORDER BY issue_number DESC) AS _row_num
        FROM material_issue ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取领料记录列表成功'));
  } catch (err) { next(err); }
};

// ==================== 领料记录详情 ====================
export const getMaterialIssueDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const [headers]: any = await sequelize.query(`
      SELECT issue_number, preparation_number, production_order_number, production_number,
             item_number, item_name, specifications, basic_unit, planned_quantity,
             total_issue_items, issue_status, remark, creation_date, creation_man
      FROM material_issue
      WHERE issue_number = :id
    `, { replacements: { id } });

    if (!headers.length) {
      res.status(404).json({ success: false, message: '领料记录不存在' });
      return;
    }

    const [details]: any = await sequelize.query(`
      SELECT id, issue_number, preparation_detail_id, line_number,
             material_number, material_name, material_type, unit,
             required_quantity, actual_quantity, batch_number,
             step_number, work_center_name, is_key_material,
             default_warehouse, remark
      FROM material_issue_detail
      WHERE issue_number = :id
      ORDER BY line_number
    `, { replacements: { id } });

    res.json(success({ header: headers[0], details }, '获取领料记录详情成功'));
  } catch (err) { next(err); }
};
