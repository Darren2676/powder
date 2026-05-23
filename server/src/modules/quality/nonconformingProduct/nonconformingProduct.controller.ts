import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { createReworkOrder } from '../reworkOrder/reworkOrder.controller';
import { generateReturnNumber } from '../../purchasing/purchaseReturn/purchaseReturn.controller';
import dayjs from 'dayjs';

// ==================== 单号生成 ====================
const generateNCNumber = async (transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `NC-${today}-`;
  const opts: any = transaction
    ? { replacements: { prefix: prefix + '%' }, transaction }
    : { replacements: { prefix: prefix + '%' } };

  const [rows]: any = await sequelize.query(
    `SELECT MAX(nonconforming_number) as max_num FROM nonconforming_product WHERE nonconforming_number LIKE :prefix`,
    opts
  );

  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 内部服务：从检验单创建不合格品记录 ====================
export const createNonconformingFromInspection = async (params: {
  source_type: string;         // 来料检验 / 生产检验 / 委外检验
  source_number: string;       // 检验单号
  item_number: string;
  item_name: string;
  specifications?: string;
  basic_unit?: string;
  unqualified_quantity: number;
  defect_class_name?: string;
  defect_name?: string;
  defect_reason_name?: string;
  production_order_number?: string;
  step_number?: number;
  supplier_number?: string;
  supplier_name?: string;
  warehouse_number?: string;
  warehouse_name?: string;
  creation_man?: string;
  inspection_table: string;    // production_inspection | purchase_quality_inspection
  defect_line_id?: number;     // 关联缺陷明细行ID
}, transaction: any): Promise<string> => {
  const ncNumber = await generateNCNumber(transaction);

  await sequelize.query(`
    INSERT INTO nonconforming_product (
      nonconforming_number, source_type, source_number,
      item_number, item_name, specifications, basic_unit,
      unqualified_quantity, defect_class_name, defect_name, defect_reason_name,
      handling_status,
      production_order_number, step_number,
      supplier_number, supplier_name,
      warehouse_number, warehouse_name,
      creation_man, defect_line_id
    ) VALUES (
      :nonconforming_number, :source_type, :source_number,
      :item_number, :item_name, :specifications, :basic_unit,
      :unqualified_quantity, :defect_class_name, :defect_name, :defect_reason_name,
      N'待处理',
      :production_order_number, :step_number,
      :supplier_number, :supplier_name,
      :warehouse_number, :warehouse_name,
      :creation_man, :defect_line_id
    )
  `, {
    replacements: {
      nonconforming_number: ncNumber,
      source_type: params.source_type,
      source_number: params.source_number,
      item_number: params.item_number || '',
      item_name: params.item_name || '',
      specifications: params.specifications || '',
      basic_unit: params.basic_unit || '',
      unqualified_quantity: params.unqualified_quantity || 0,
      defect_class_name: params.defect_class_name || '',
      defect_name: params.defect_name || '',
      defect_reason_name: params.defect_reason_name || '',
      production_order_number: params.production_order_number || '',
      step_number: params.step_number || 0,
      supplier_number: params.supplier_number || '',
      supplier_name: params.supplier_name || '',
      warehouse_number: params.warehouse_number || '',
      warehouse_name: params.warehouse_name || '',
      creation_man: params.creation_man || '',
      defect_line_id: params.defect_line_id || null
    },
    transaction
  });

  // 回写 nonconforming_number 到检验单
  await sequelize.query(`
    UPDATE ${params.inspection_table} SET nonconforming_number = :ncNumber
    WHERE inspection_number = :sourceNumber OR ${params.inspection_table === 'purchase_quality_inspection' ? 'inspection_number' : 'inspection_number'} = :sourceNumber
  `, { replacements: { ncNumber, sourceNumber: params.source_number }, transaction });

  return ncNumber;
};

// ==================== 内部服务：更新不合格品处理结果 ====================
export const updateNonconformingHandling = async (params: {
  nonconforming_number: string;
  handling_method: string;
  handling_quantity?: number;
  handling_remark?: string;
  rework_step_number?: number;
  concession_quantity?: number;
  scrap_type?: string;
  scrap_quantity?: number;
  return_order_number?: string;
  special_warehouse?: string;
  qualified_quantity_after?: number;
  unqualified_quantity_after?: number;
  operator?: string;
}, transaction: any): Promise<void> => {
  const handlingDate = dayjs().format('YYYY/MM/DD HH:mm');

  await sequelize.query(`
    UPDATE nonconforming_product SET
      handling_method = :handling_method,
      handling_quantity = :handling_quantity,
      handling_status = N'已完成',
      handling_remark = :handling_remark,
      rework_step_number = :rework_step_number,
      concession_quantity = :concession_quantity,
      scrap_type = :scrap_type,
      scrap_quantity = :scrap_quantity,
      return_order_number = :return_order_number,
      special_warehouse = :special_warehouse,
      qualified_quantity_after = :qualified_quantity_after,
      unqualified_quantity_after = :unqualified_quantity_after,
      operator = :operator,
      handling_date = :handling_date
    WHERE nonconforming_number = :nonconforming_number
  `, {
    replacements: {
      nonconforming_number: params.nonconforming_number,
      handling_method: params.handling_method || '',
      handling_quantity: params.handling_quantity || 0,
      handling_remark: params.handling_remark || '',
      rework_step_number: params.rework_step_number || null,
      concession_quantity: params.concession_quantity || 0,
      scrap_type: params.scrap_type || '',
      scrap_quantity: params.scrap_quantity || 0,
      return_order_number: params.return_order_number || '',
      special_warehouse: params.special_warehouse || '',
      qualified_quantity_after: params.qualified_quantity_after || 0,
      unqualified_quantity_after: params.unqualified_quantity_after || 0,
      operator: params.operator || '',
      handling_date: handlingDate
    },
    transaction
  });
};

// ==================== 列表查询 ====================
export const getNonconformingProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const sourceType = req.query.source_type as string || '';
    const handlingStatus = req.query.handling_status as string || '';
    const search = (req.query.search as string) || '';

    let whereClause = 'WHERE 1=1';
    const replacements: any = {};

    if (sourceType) { whereClause += ` AND source_type = :sourceType`; replacements.sourceType = sourceType; }
    if (handlingStatus) { whereClause += ` AND handling_status = :handlingStatus`; replacements.handlingStatus = handlingStatus; }
    if (search) {
      whereClause += ` AND (nonconforming_number LIKE :search OR source_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM nonconforming_product ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC) AS _row_num
        FROM nonconforming_product ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    // 统计卡片
    const [stats]: any = await sequelize.query(`
      SELECT
        COUNT(*) AS total_count,
        ISNULL(SUM(CASE WHEN handling_status = N'待处理' THEN 1 ELSE 0 END), 0) AS pending_count,
        ISNULL(SUM(CASE WHEN handling_status = N'已完成' THEN 1 ELSE 0 END), 0) AS completed_count,
        ISNULL(SUM(unqualified_quantity), 0) AS total_unqualified
      FROM nonconforming_product ${whereClause}
    `, { replacements });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      stats: stats[0] || {}
    }, '获取不合格品列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getNonconformingProductDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const ncId = String(id);
    const [rows]: any = await sequelize.query(
      `SELECT * FROM nonconforming_product WHERE nonconforming_number = :ncId`,
      { replacements: { ncId } }
    );
    if (!rows.length) { res.status(404).json({ success: false, message: '不合格品记录不存在' }); return; }
    res.json(success(rows[0], '获取不合格品详情成功'));
  } catch (err) { next(err); }
};

// ==================== 报废入库单号生成 ====================
const generateStockInNumber = async (transaction: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const siPrefix = `SI-${today}-`;
  const [siRows]: any = await sequelize.query(
    `SELECT MAX(stock_in_number) as max_num FROM stock_in WHERE stock_in_number LIKE :prefix`,
    { replacements: { prefix: siPrefix + '%' }, transaction }
  );
  let siSeq = 1;
  if (siRows[0]?.max_num) {
    const lastSeq = parseInt(siRows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) siSeq = lastSeq + 1;
  }
  return siPrefix + String(siSeq).padStart(3, '0');
};

// ==================== 获取报废仓信息 ====================
const getScrapWarehouse = async (transaction: any): Promise<{ warehouse_number: string; warehouse_name: string } | null> => {
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE warehouse_type = N'报废仓库' OR warehouse_number LIKE 'SCRAP%' ORDER BY warehouse_number`,
    { transaction }
  );
  return rows.length ? rows[0] : null;
};

// ==================== 不合格品处理 ====================
export const handleNonconforming = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const ncId = String(id);
    const b = req.body;

    const [records]: any = await sequelize.query(
      `SELECT * FROM nonconforming_product WHERE nonconforming_number = :ncId`,
      { replacements: { ncId } }
    );
    if (!records.length) { res.status(404).json({ success: false, message: '不合格品记录不存在' }); return; }

    const record = records[0];
    if (record.handling_status === '已完成') {
      res.status(400).json({ success: false, message: '该不合格品已处理完成，不可重复操作' });
      return;
    }
    // 返修不合格状态也允许再次处理
    if (record.handling_status !== '待处理' && record.handling_status !== '返修不合格' && record.handling_status !== '处理中') {
      res.status(400).json({ success: false, message: `当前状态[${record.handling_status}]不允许处理` });
      return;
    }

    const handlingMethod = b.handling_method;
    const sourceType = record.source_type;

    // 根据来源类型校验处理方式
    const incomingMethods = ['挑选', '拒收', '报废', '特采', '退货'];
    const productionMethods = ['返修', '报废', '让步接收'];

    if (sourceType === '来料检验' && !incomingMethods.includes(handlingMethod)) {
      res.status(400).json({ success: false, message: `来料检验不合格品处理方式应为：${incomingMethods.join('/')}` });
      return;
    }
    if (sourceType === '生产检验' && !productionMethods.includes(handlingMethod)) {
      res.status(400).json({ success: false, message: `生产检验不合格品处理方式应为：${productionMethods.join('/')}` });
      return;
    }
    if (sourceType === '委外检验') {
      const outsourceMethods = [...incomingMethods, ...productionMethods];
      if (!outsourceMethods.includes(handlingMethod)) {
        res.status(400).json({ success: false, message: `无效的处理方式` });
        return;
      }
    }

    // 返修必须指定工序号
    if (handlingMethod === '返修' && !b.rework_step_number) {
      res.status(400).json({ success: false, message: '返修处理必须指定返修目标工序号' });
      return;
    }

    // 退货自动创建采购退货单，无需手动指定退货单号

    const unqualifiedQty = parseFloat(record.unqualified_quantity) || 0;
    const handlingQty = b.handling_quantity != null ? Number(b.handling_quantity) : unqualifiedQty;
    const operator = (req as any).user?.username || '';
    const now = dayjs().format('YYYY/MM/DD HH:mm');

    // 辅助函数：回写缺陷明细行处理方式
    const writeBackDefectLine = async (handlingMethod: string, tx: any) => {
      if (record.defect_line_id) {
        await sequelize.query(
          `UPDATE purchase_inspection_defect SET defect_handling = :handlingMethod WHERE id = :defectLineId`,
          { replacements: { handlingMethod, defectLineId: record.defect_line_id }, transaction: tx }
        );
      }
    };

    const transaction = await sequelize.transaction();
    try {
      // ==================== 生产检验 - 返修 ====================
      if (sourceType === '生产检验' && handlingMethod === '返修') {
        // 1. 创建返修单
        const rwNumber = await createReworkOrder({
          nonconforming_number: ncId,
          source_inspection_number: record.source_number,
          production_order_number: record.production_order_number || '',
          item_number: record.item_number || '',
          item_name: record.item_name || '',
          specifications: record.specifications || '',
          basic_unit: record.basic_unit || '',
          rework_step_number: b.rework_step_number,
          rework_quantity: handlingQty,
          operator
        }, transaction);

        // 2. 回退目标工序任务状态
        await sequelize.query(`
          UPDATE process_task SET planned_quantity = planned_quantity + :qty
          WHERE production_order_number = :orderNo AND step_number = :step
        `, { replacements: { qty: unqualifiedQty, orderNo: record.production_order_number, step: b.rework_step_number }, transaction });

        await sequelize.query(`
          UPDATE process_task SET task_status = N'未开始', inspect_status = N'无需检', completed_quantity = 0
          WHERE production_order_number = :orderNo AND step_number = :step
        `, { replacements: { orderNo: record.production_order_number, step: b.rework_step_number }, transaction });

        // 2.5 级联删除：删除返修目标工序及后续所有工序的报工单+检验单+NC单
        // 因为返修意味着后续工序的产出已不正确，必须级联清理以保证数据一致性
        const [cascadeReports]: any = await sequelize.query(
          `SELECT work_report_number, process_task_number, qualified_quantity, approval_status, step_number
           FROM work_report
           WHERE production_order_number = :orderNo AND step_number >= :reworkStep
           ORDER BY step_number DESC`,
          { replacements: { orderNo: record.production_order_number, reworkStep: b.rework_step_number }, transaction }
        );

        if (cascadeReports.length > 0) {
          // 检查是否有非草稿状态的报工单
          const nonDraftReports = cascadeReports.filter((r: any) => r.approval_status !== '草稿');
          if (nonDraftReports.length > 0) {
            await transaction.rollback();
            res.status(400).json({
              success: false,
              message: `返修级联清理失败：有 ${nonDraftReports.length} 条报工单处于"${nonDraftReports[0].approval_status}"状态，需先撤回审批后才能返修`,
              data: { non_draft_reports: nonDraftReports.map((r: any) => r.work_report_number) }
            });
            return;
          }

          const wrPlaceholders = cascadeReports.map((_: any, i: number) => `:wr${i}`).join(',');
          const wrReplacements: any = {};
          cascadeReports.forEach((r: any, i: number) => { wrReplacements[`wr${i}`] = r.work_report_number; });

          // 删除关联检验明细项
          await sequelize.query(
            `DELETE FROM production_inspection_item WHERE inspection_number IN (
              SELECT inspection_number FROM production_inspection WHERE work_report_number IN (${wrPlaceholders})
            )`,
            { replacements: wrReplacements, transaction }
          );

          // 查找关联的NC单号（用于后续处理）
          const [relatedInspections]: any = await sequelize.query(
            `SELECT inspection_number, nonconforming_number FROM production_inspection WHERE work_report_number IN (${wrPlaceholders})`,
            { replacements: wrReplacements, transaction }
          );

          // 删除关联NC单（仅待处理状态，已处理的不允许删除）
          const ncNumbers = relatedInspections
            .map((insp: any) => insp.nonconforming_number)
            .filter((n: any) => n);
          if (ncNumbers.length > 0) {
            const ncPlaceholders = ncNumbers.map((_: any, i: number) => `:nc${i}`).join(',');
            const ncReplacements: any = {};
            ncNumbers.forEach((n: string, i: number) => { ncReplacements[`nc${i}`] = n; });
            // 检查是否有已处理的NC单
            const [processedNc]: any = await sequelize.query(
              `SELECT nonconforming_number, handling_status FROM nonconforming_product WHERE nonconforming_number IN (${ncPlaceholders}) AND handling_status NOT IN (N'待处理', N'处理中')`,
              { replacements: ncReplacements, transaction }
            );
            if (processedNc.length > 0) {
              await transaction.rollback();
              res.status(400).json({
                success: false,
                message: `返修级联清理失败：有已处理的不合格品单(${processedNc[0].nonconforming_number}，状态:${processedNc[0].handling_status})，无法级联删除`,
              });
              return;
            }
            // 删除待处理/处理中的NC单
            await sequelize.query(
              `DELETE FROM nonconforming_product WHERE nonconforming_number IN (${ncPlaceholders}) AND handling_status IN (N'待处理', N'处理中')`,
              { replacements: ncReplacements, transaction }
            );
          }

          // 删除关联检验主记录
          await sequelize.query(
            `DELETE FROM production_inspection WHERE work_report_number IN (${wrPlaceholders})`,
            { replacements: wrReplacements, transaction }
          );

          // 删除报工单
          await sequelize.query(
            `DELETE FROM work_report WHERE work_report_number IN (${wrPlaceholders})`,
            { replacements: wrReplacements, transaction }
          );

          // 重置后续工序的completed_quantity和inspect_status（目标工序已在上面重置）
          const distinctTaskNumbers = [...new Set(cascadeReports
            .filter((r: any) => r.step_number > b.rework_step_number)
            .map((r: any) => r.process_task_number))];
          for (const taskNo of distinctTaskNumbers) {
            await sequelize.query(
              `UPDATE process_task SET completed_quantity = 0, task_status = N'未开始', inspect_status = NULL WHERE process_task_number = :taskNo`,
              { replacements: { taskNo }, transaction }
            );
          }

          // 线边仓冲销（逐条处理）
          for (const report of cascadeReports) {
            const rQty = parseFloat(report.qualified_quantity) || 0;
            if (report.process_task_number && rQty > 0) {
              try {
                const { logWorkReportReverseLinesideMovement } = await import('@/services/linesideMovement.service');
                await logWorkReportReverseLinesideMovement(report.process_task_number, rQty, report.work_report_number, operator, transaction);
              } catch (e) { /* 线边仓冲销失败不阻断主流程 */ }
            }
          }

          // 重算综合合格率
          try {
            const { recalcYieldRate } = await import('@/services/productionYield.service');
            await recalcYieldRate(record.production_order_number, transaction);
          } catch (e) { /* 合格率重算失败不阻断主流程 */ }
        }

        // 3. 生产单回退为生产中
        await sequelize.query(
          `UPDATE production_order SET plan_status = N'生产中' WHERE production_order_number = :orderNo AND plan_status = N'已完成'`,
          { replacements: { orderNo: record.production_order_number }, transaction }
        );

        // 4. 更新检验单
        await sequelize.query(`
          UPDATE production_inspection SET defect_handling = N'返修', rework_step_number = :step, rework_order_number = :rwNumber
          WHERE inspection_number = :sourceNumber
        `, { replacements: { step: b.rework_step_number, rwNumber, sourceNumber: record.source_number }, transaction });

        // 5. 更新NC单
        await sequelize.query(`
          UPDATE nonconforming_product SET
            handling_method = N'返修', handling_quantity = :handlingQty,
            handling_status = N'处理中', rework_step_number = :step,
            rework_order_number = :rwNumber, operator = :operator,
            handling_date = :handlingDate, handling_remark = :remark
          WHERE nonconforming_number = :ncId
        `, { replacements: { handlingQty, step: b.rework_step_number, rwNumber, operator, handlingDate: now, remark: b.handling_remark || '', ncId }, transaction });

        await writeBackDefectLine('返修', transaction);
        await transaction.commit();
        res.json(success({ rework_order_number: rwNumber }, `返修单已创建：${rwNumber}，等待返修完成后再检验`));
        return;
      }

      // ==================== 生产检验 - 报废 ====================
      if (sourceType === '生产检验' && handlingMethod === '报废') {
        const scrapQty = b.scrap_quantity || unqualifiedQty;
        const scrapWarehouse = await getScrapWarehouse(transaction);
        if (!scrapWarehouse) { await transaction.rollback(); res.status(400).json({ success: false, message: '未找到报废仓库，请先在仓库管理中创建类型为"报废仓库"的仓库' }); return; }

        const stockInNumber = await generateStockInNumber(transaction);

        await sequelize.query(`
          INSERT INTO stock_in (stock_in_number, purchase_order_number, supplier_number, supplier_name,
            warehouse_number, warehouse_name, stock_in_date, stock_in_type, approval_status,
            [condition], operator, remark, creation_date, creation_man)
          VALUES (:stock_in_number, N'', N'', N'', :warehouse_number, :warehouse_name, :stock_in_date, N'报废入库', N'草稿',
            N'启用', :operator, :remark, :creation_date, :creation_man)
        `, {
          replacements: {
            stock_in_number: stockInNumber, warehouse_number: scrapWarehouse.warehouse_number,
            warehouse_name: scrapWarehouse.warehouse_name, stock_in_date: dayjs().format('YYYY/MM/DD'),
            operator, remark: `报废入库 - 来源不合格品单 ${ncId}`, creation_date: now, creation_man: operator
          }, transaction
        });

        await sequelize.query(`
          INSERT INTO stock_in_detail (stock_in_number, line_number, purchase_order_number, purchase_detail_id,
            item_number, item_name, specifications, basic_unit, order_quantity, received_quantity,
            stock_in_quantity, qualified_quantity, unqualified_quantity, batch_number, remark)
          VALUES (:stock_in_number, 10, N'', 0,
            :item_number, :item_name, :specifications, N'', 0, 0,
            :stock_in_quantity, 0, :scrapQty, N'', :remark)
        `, {
          replacements: {
            stock_in_number: stockInNumber, item_number: record.item_number || '',
            item_name: record.item_name || '', specifications: record.specifications || '',
            stock_in_quantity: scrapQty, scrapQty, remark: `报废 - 不合格品单 ${ncId}`
          }, transaction
        });

        // 更新检验单
        await sequelize.query(`
          UPDATE production_inspection SET defect_handling = N'报废', scrap_type = :scrapType, scrap_quantity = :scrapQty
          WHERE inspection_number = :sourceNumber
        `, { replacements: { scrapType: b.scrap_type || '批量', scrapQty, sourceNumber: record.source_number }, transaction });

        // 工序标记已处理
        const [taskRows]: any = await sequelize.query(
          `SELECT process_task_number FROM production_inspection WHERE inspection_number = :sourceNumber`,
          { replacements: { sourceNumber: record.source_number }, transaction }
        );
        if (taskRows.length && taskRows[0].process_task_number) {
          await sequelize.query(
            `UPDATE process_task SET inspect_status = N'已处理' WHERE process_task_number = :taskNo`,
            { replacements: { taskNo: taskRows[0].process_task_number }, transaction }
          );
        }

        // 更新NC单
        await sequelize.query(`
          UPDATE nonconforming_product SET
            handling_method = N'报废', handling_quantity = :handlingQty,
            handling_status = N'已完成', scrap_type = :scrapType, scrap_quantity = :scrapQty,
            stock_in_number = :stockInNumber, operator = :operator,
            handling_date = :handlingDate, handling_remark = :remark
          WHERE nonconforming_number = :ncId
        `, { replacements: { handlingQty: scrapQty, scrapType: b.scrap_type || '批量', scrapQty, stockInNumber, operator, handlingDate: now, remark: b.handling_remark || '', ncId }, transaction });

        await writeBackDefectLine('报废', transaction);
        await transaction.commit();
        res.json(success({ stock_in_number: stockInNumber }, `报废入库单已创建：${stockInNumber}，等待仓库管理员确认入库`));
        return;
      }

      // ==================== 生产检验 - 让步接收 ====================
      if (sourceType === '生产检验' && handlingMethod === '让步接收') {
        const concessionQty = b.concession_quantity || unqualifiedQty;

        await sequelize.query(`
          UPDATE production_inspection SET
            defect_handling = N'让步接收', concession_quantity = :concessionQty,
            qualified_quantity = qualified_quantity + :concessionQty,
            unqualified_quantity = CASE WHEN unqualified_quantity - :concessionQty < 0 THEN 0 ELSE unqualified_quantity - :concessionQty END
          WHERE inspection_number = :sourceNumber
        `, { replacements: { concessionQty, sourceNumber: record.source_number }, transaction });

        // 工序标记已处理
        const [taskRows]: any = await sequelize.query(
          `SELECT process_task_number FROM production_inspection WHERE inspection_number = :sourceNumber`,
          { replacements: { sourceNumber: record.source_number }, transaction }
        );
        if (taskRows.length && taskRows[0].process_task_number) {
          await sequelize.query(
            `UPDATE process_task SET inspect_status = N'已处理' WHERE process_task_number = :taskNo`,
            { replacements: { taskNo: taskRows[0].process_task_number }, transaction }
          );
        }

        await sequelize.query(`
          UPDATE nonconforming_product SET
            handling_method = N'让步接收', handling_quantity = :handlingQty,
            handling_status = N'已完成', concession_quantity = :concessionQty,
            operator = :operator, handling_date = :handlingDate, handling_remark = :remark
          WHERE nonconforming_number = :ncId
        `, { replacements: { handlingQty: concessionQty, concessionQty, operator, handlingDate: now, remark: b.handling_remark || '', ncId }, transaction });

        await writeBackDefectLine('让步接收', transaction);
        await transaction.commit();
        res.json(success(null, '让步接收处理完成'));
        return;
      }

      // ==================== 来料检验 - 挑选 ====================
      if (sourceType === '来料检验' && handlingMethod === '挑选') {
        const qualifiedAfter = b.qualified_quantity_after || 0;
        const unqualifiedAfter = b.unqualified_quantity_after || 0;

        await sequelize.query(`
          UPDATE purchase_quality_inspection SET
            defect_handling = N'挑选',
            qualified_quantity = :qualified_quantity,
            unqualified_quantity = :unqualified_quantity,
            inspect_result = CASE WHEN :unqualified_quantity > 0 THEN N'不合格' ELSE N'合格' END,
            handling_quantity = :handlingQty, handling_remark = :handling_remark
          WHERE inspection_number = :sourceNumber
        `, {
          replacements: {
            qualified_quantity: qualifiedAfter, unqualified_quantity: unqualifiedAfter,
            handlingQty, handling_remark: b.handling_remark || '', sourceNumber: record.source_number
          }, transaction
        });

        // 回写入库单明细
        const [inspRows]: any = await sequelize.query(
          `SELECT stock_in_number, item_number FROM purchase_quality_inspection WHERE inspection_number = :sourceNumber`,
          { replacements: { sourceNumber: record.source_number }, transaction }
        );
        if (inspRows.length && inspRows[0].stock_in_number) {
          await sequelize.query(`
            UPDATE stock_in_detail SET
              qualified_quantity = :qualified_quantity, unqualified_quantity = :unqualified_quantity,
              inspect_status = N'已处理-挑选'
            WHERE stock_in_number = :stock_in_number AND item_number = :item_number
          `, {
            replacements: {
              qualified_quantity: qualifiedAfter, unqualified_quantity: unqualifiedAfter,
              stock_in_number: inspRows[0].stock_in_number, item_number: inspRows[0].item_number
            }, transaction
          });
        }

        await sequelize.query(`
          UPDATE nonconforming_product SET
            handling_method = N'挑选', handling_quantity = :handlingQty,
            handling_status = N'已完成', qualified_quantity_after = :qualifiedAfter,
            unqualified_quantity_after = :unqualifiedAfter,
            operator = :operator, handling_date = :handlingDate, handling_remark = :remark
          WHERE nonconforming_number = :ncId
        `, { replacements: { handlingQty, qualifiedAfter, unqualifiedAfter, operator, handlingDate: now, remark: b.handling_remark || '', ncId }, transaction });

        await writeBackDefectLine('挑选', transaction);
        await transaction.commit();
        res.json(success(null, '挑选处理完成'));
        return;
      }

      // ==================== 来料检验 - 拒收 ====================
      if (sourceType === '来料检验' && handlingMethod === '拒收') {
        await sequelize.query(`
          UPDATE purchase_quality_inspection SET
            defect_handling = N'拒收', handling_quantity = :handlingQty,
            handling_remark = :handling_remark
          WHERE inspection_number = :sourceNumber
        `, { replacements: { handlingQty, handling_remark: b.handling_remark || '', sourceNumber: record.source_number }, transaction });

        // 回写入库单明细
        const [inspRows]: any = await sequelize.query(
          `SELECT stock_in_number, item_number FROM purchase_quality_inspection WHERE inspection_number = :sourceNumber`,
          { replacements: { sourceNumber: record.source_number }, transaction }
        );
        if (inspRows.length && inspRows[0].stock_in_number) {
          await sequelize.query(`
            UPDATE stock_in_detail SET inspect_status = N'已处理-拒收'
            WHERE stock_in_number = :stock_in_number AND item_number = :item_number
          `, { replacements: { stock_in_number: inspRows[0].stock_in_number, item_number: inspRows[0].item_number }, transaction });
        }

        await sequelize.query(`
          UPDATE nonconforming_product SET
            handling_method = N'拒收', handling_quantity = :handlingQty,
            handling_status = N'已完成', operator = :operator,
            handling_date = :handlingDate, handling_remark = :remark
          WHERE nonconforming_number = :ncId
        `, { replacements: { handlingQty, operator, handlingDate: now, remark: b.handling_remark || '', ncId }, transaction });

        await writeBackDefectLine('拒收', transaction);
        await transaction.commit();
        res.json(success(null, '拒收处理完成'));
        return;
      }

      // ==================== 来料检验 - 报废 ====================
      if (sourceType === '来料检验' && handlingMethod === '报废') {
        const scrapQty = b.scrap_quantity || unqualifiedQty;
        const scrapWarehouse = await getScrapWarehouse(transaction);
        if (!scrapWarehouse) { await transaction.rollback(); res.status(400).json({ success: false, message: '未找到报废仓库，请先在仓库管理中创建类型为"报废仓库"的仓库' }); return; }

        const stockInNumber = await generateStockInNumber(transaction);

        await sequelize.query(`
          INSERT INTO stock_in (stock_in_number, purchase_order_number, supplier_number, supplier_name,
            warehouse_number, warehouse_name, stock_in_date, stock_in_type, approval_status,
            [condition], operator, remark, creation_date, creation_man)
          VALUES (:stock_in_number, N'', N'', N'', :warehouse_number, :warehouse_name, :stock_in_date, N'报废入库', N'草稿',
            N'启用', :operator, :remark, :creation_date, :creation_man)
        `, {
          replacements: {
            stock_in_number: stockInNumber, warehouse_number: scrapWarehouse.warehouse_number,
            warehouse_name: scrapWarehouse.warehouse_name, stock_in_date: dayjs().format('YYYY/MM/DD'),
            operator, remark: `报废入库 - 来源不合格品单 ${ncId}`, creation_date: now, creation_man: operator
          }, transaction
        });

        await sequelize.query(`
          INSERT INTO stock_in_detail (stock_in_number, line_number, purchase_order_number, purchase_detail_id,
            item_number, item_name, specifications, basic_unit, order_quantity, received_quantity,
            stock_in_quantity, qualified_quantity, unqualified_quantity, batch_number, remark)
          VALUES (:stock_in_number, 10, N'', 0,
            :item_number, :item_name, :specifications, N'', 0, 0,
            :stock_in_quantity, 0, :scrapQty, N'', :remark)
        `, {
          replacements: {
            stock_in_number: stockInNumber, item_number: record.item_number || '',
            item_name: record.item_name || '', specifications: record.specifications || '',
            stock_in_quantity: scrapQty, scrapQty, remark: `报废 - 不合格品单 ${ncId}`
          }, transaction
        });

        // 更新检验单
        await sequelize.query(`
          UPDATE purchase_quality_inspection SET defect_handling = N'报废', handling_quantity = :handlingQty,
            handling_remark = :handling_remark
          WHERE inspection_number = :sourceNumber
        `, { replacements: { handlingQty: scrapQty, handling_remark: b.handling_remark || '', sourceNumber: record.source_number }, transaction });

        // 回写入库单明细
        const [inspRows]: any = await sequelize.query(
          `SELECT stock_in_number, item_number FROM purchase_quality_inspection WHERE inspection_number = :sourceNumber`,
          { replacements: { sourceNumber: record.source_number }, transaction }
        );
        if (inspRows.length && inspRows[0].stock_in_number) {
          await sequelize.query(`
            UPDATE stock_in_detail SET inspect_status = N'已处理-报废'
            WHERE stock_in_number = :stock_in_number AND item_number = :item_number
          `, { replacements: { stock_in_number: inspRows[0].stock_in_number, item_number: inspRows[0].item_number }, transaction });
        }

        await sequelize.query(`
          UPDATE nonconforming_product SET
            handling_method = N'报废', handling_quantity = :handlingQty,
            handling_status = N'已完成', scrap_type = :scrapType, scrap_quantity = :scrapQty,
            stock_in_number = :stockInNumber, operator = :operator,
            handling_date = :handlingDate, handling_remark = :remark
          WHERE nonconforming_number = :ncId
        `, { replacements: { handlingQty: scrapQty, scrapType: b.scrap_type || '批量', scrapQty, stockInNumber, operator, handlingDate: now, remark: b.handling_remark || '', ncId }, transaction });

        await writeBackDefectLine('报废', transaction);
        await transaction.commit();
        res.json(success({ stock_in_number: stockInNumber }, `报废入库单已创建：${stockInNumber}，等待仓库管理员确认入库`));
        return;
      }

      // ==================== 来料检验 - 特采 ====================
      if (sourceType === '来料检验' && handlingMethod === '特采') {
        const specialQty = b.handling_quantity || unqualifiedQty;
        const specialWarehouse = b.special_warehouse || '';

        // 查询特采入库仓库名称
        let specialWhName = '';
        if (specialWarehouse) {
          const [whRows]: any = await sequelize.query(
            `SELECT TOP 1 warehouse_name FROM warehouse WHERE warehouse_number = :whNum`,
            { replacements: { whNum: specialWarehouse }, transaction }
          );
          if (whRows.length) specialWhName = whRows[0].warehouse_name;
        }

        // 创建特采入库单
        const stockInNumber = await generateStockInNumber(transaction);
        await sequelize.query(`
          INSERT INTO stock_in (stock_in_number, purchase_order_number, supplier_number, supplier_name,
            warehouse_number, warehouse_name, stock_in_date, stock_in_type, approval_status,
            [condition], operator, remark, creation_date, creation_man)
          VALUES (:stock_in_number, N'', N'', N'', :warehouse_number, :warehouse_name, :stock_in_date, N'特采入库', N'草稿',
            N'启用', :operator, :remark, :creation_date, :creation_man)
        `, {
          replacements: {
            stock_in_number: stockInNumber, warehouse_number: specialWarehouse,
            warehouse_name: specialWhName, stock_in_date: dayjs().format('YYYY/MM/DD'),
            operator, remark: `特采入库 - 来源不合格品单 ${ncId}`, creation_date: now, creation_man: operator
          }, transaction
        });

        await sequelize.query(`
          INSERT INTO stock_in_detail (stock_in_number, line_number, purchase_order_number, purchase_detail_id,
            item_number, item_name, specifications, basic_unit, order_quantity, received_quantity,
            stock_in_quantity, qualified_quantity, unqualified_quantity, batch_number, remark)
          VALUES (:stock_in_number, 10, N'', 0,
            :item_number, :item_name, :specifications, N'', 0, 0,
            :stock_in_quantity, :specialQty, 0, N'', :remark)
        `, {
          replacements: {
            stock_in_number: stockInNumber, item_number: record.item_number || '',
            item_name: record.item_name || '', specifications: record.specifications || '',
            stock_in_quantity: specialQty, specialQty, remark: `特采入库 - 不合格品单 ${ncId}`
          }, transaction
        });

        // 更新检验单
        await sequelize.query(`
          UPDATE purchase_quality_inspection SET
            defect_handling = N'特采',
            qualified_quantity = qualified_quantity + :specialQty,
            unqualified_quantity = CASE WHEN unqualified_quantity - :specialQty < 0 THEN 0 ELSE unqualified_quantity - :specialQty END,
            inspect_result = N'让步接收', handling_quantity = :specialQty,
            handling_remark = :handling_remark, special_warehouse = :special_warehouse
          WHERE inspection_number = :sourceNumber
        `, {
          replacements: {
            specialQty, handling_remark: b.handling_remark || '',
            special_warehouse: specialWarehouse, sourceNumber: record.source_number
          }, transaction
        });

        // 回写入库单明细
        const [inspRows]: any = await sequelize.query(
          `SELECT stock_in_number, item_number, qualified_quantity, unqualified_quantity FROM purchase_quality_inspection WHERE inspection_number = :sourceNumber`,
          { replacements: { sourceNumber: record.source_number }, transaction }
        );
        if (inspRows.length && inspRows[0].stock_in_number) {
          await sequelize.query(`
            UPDATE stock_in_detail SET
              qualified_quantity = :qualified_quantity, unqualified_quantity = :unqualified_quantity,
              inspect_status = N'已处理-特采'
            WHERE stock_in_number = :stock_in_number AND item_number = :item_number
          `, {
            replacements: {
              qualified_quantity: inspRows[0].qualified_quantity, unqualified_quantity: inspRows[0].unqualified_quantity,
              stock_in_number: inspRows[0].stock_in_number, item_number: inspRows[0].item_number
            }, transaction
          });
        }

        // 更新NC单
        await sequelize.query(`
          UPDATE nonconforming_product SET
            handling_method = N'特采', handling_quantity = :handlingQty,
            handling_status = N'已完成', special_warehouse = :special_warehouse,
            stock_in_number = :stockInNumber, operator = :operator,
            handling_date = :handlingDate, handling_remark = :remark
          WHERE nonconforming_number = :ncId
        `, { replacements: { handlingQty: specialQty, special_warehouse: specialWarehouse, stockInNumber, operator, handlingDate: now, remark: b.handling_remark || '', ncId }, transaction });

        await writeBackDefectLine('特采', transaction);
        await transaction.commit();
        res.json(success({ stock_in_number: stockInNumber }, `特采入库单已创建：${stockInNumber}，等待仓库管理员确认入库`));
        return;
      }

      // ==================== 来料检验 - 退货 ====================
      if (sourceType === '来料检验' && handlingMethod === '退货') {
        // 1. 查询采购检验单获取PO号、供应商、入库单号
        const [inspRows]: any = await sequelize.query(
          `SELECT stock_in_number, item_number, purchase_order_number, supplier_number, supplier_name FROM purchase_quality_inspection WHERE inspection_number = :sourceNumber`,
          { replacements: { sourceNumber: record.source_number }, transaction }
        );
        if (!inspRows.length) {
          await transaction.rollback();
          res.status(400).json({ success: false, message: '关联检验单不存在' });
          return;
        }
        const inspRow = inspRows[0];

        // 2. 查询采购订单明细获取单价
        let unitPrice = 0;
        if (inspRow.purchase_order_number) {
          const [poDetailRows]: any = await sequelize.query(
            `SELECT TOP 1 unit_price FROM purchase_order_detail WHERE purchase_order_number = :poNumber AND item_number = :itemNumber`,
            { replacements: { poNumber: inspRow.purchase_order_number, itemNumber: record.item_number }, transaction }
          );
          if (poDetailRows.length) unitPrice = parseFloat(poDetailRows[0].unit_price) || 0;
        }

        // 3. 生成采购退货单号并创建主表
        const returnNumber = await generateReturnNumber(transaction);
        const returnType = b.return_type || '退货退款';
        const retQty = handlingQty;
        const retAmt = retQty * unitPrice;
        const creationMan = operator;

        // 查询待检仓作为退货仓库
        const [inspWhRows]: any = await sequelize.query(
          `SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE warehouse_name = N'待检仓' OR warehouse_type = N'待检仓'`,
          { transaction }
        );
        const returnWhNumber = inspWhRows.length ? inspWhRows[0].warehouse_number : (record.warehouse_number || '');
        const returnWhName = inspWhRows.length ? inspWhRows[0].warehouse_name : (record.warehouse_name || '');
        const nowDate = dayjs().format('YYYY/MM/DD HH:mm');

        await sequelize.query(`
          INSERT INTO purchase_return (return_number, purchase_order_number, supplier_number, supplier_name,
            return_type, return_reason, warehouse_number, warehouse_name,
            approval_status, return_status, exchange_status, total_return_quantity, total_return_amount,
            remark, creation_date, creation_man)
          VALUES (:return_number, :purchase_order_number, :supplier_number, :supplier_name,
            :return_type, :return_reason, :warehouse_number, :warehouse_name,
            N'草稿', N'待退货', :exchange_status, :total_return_quantity, :total_return_amount,
            :remark, :creation_date, :creation_man)
        `, {
          replacements: {
            return_number: returnNumber,
            purchase_order_number: inspRow.purchase_order_number || '',
            supplier_number: inspRow.supplier_number || record.supplier_number || '',
            supplier_name: inspRow.supplier_name || record.supplier_name || '',
            return_type: returnType,
            return_reason: `不合格品退货 - ${ncId}`,
            warehouse_number: returnWhNumber,
            warehouse_name: returnWhName,
            exchange_status: returnType === '退货换货' ? '待换货' : '',
            total_return_quantity: retQty,
            total_return_amount: retAmt,
            remark: b.handling_remark || '',
            creation_date: nowDate,
            creation_man: creationMan
          },
          transaction
        });

        // 4. 创建退货明细行
        await sequelize.query(`
          INSERT INTO purchase_return_detail (return_number, line_number, purchase_detail_id, stock_in_number,
            item_number, item_name, specifications, basic_unit,
            received_quantity, return_quantity, unit_price, return_amount,
            exchange_quantity, exchange_status, remark)
          VALUES (:return_number, 10, 0, :stock_in_number,
            :item_number, :item_name, :specifications, :basic_unit,
            :received_quantity, :return_quantity, :unit_price, :return_amount,
            :exchange_quantity, :exchange_status, :remark)
        `, {
          replacements: {
            return_number: returnNumber,
            stock_in_number: inspRow.stock_in_number || '',
            item_number: record.item_number || '',
            item_name: record.item_name || '',
            specifications: record.specifications || '',
            basic_unit: record.basic_unit || '',
            received_quantity: parseFloat(record.unqualified_quantity) || 0,
            return_quantity: retQty,
            unit_price: unitPrice,
            return_amount: retAmt,
            exchange_quantity: returnType === '退货换货' ? retQty : 0,
            exchange_status: returnType === '退货换货' ? '待换货' : '',
            remark: `不合格品退货 - ${ncId}`
          },
          transaction
        });

        // 5. 更新检验单
        await sequelize.query(`
          UPDATE purchase_quality_inspection SET
            defect_handling = N'退货', handling_quantity = :handlingQty,
            handling_remark = :handling_remark, return_order_number = :return_order_number
          WHERE inspection_number = :sourceNumber
        `, {
          replacements: {
            handlingQty, handling_remark: b.handling_remark || '',
            return_order_number: returnNumber, sourceNumber: record.source_number
          }, transaction
        });

        // 6. 回写入库单明细
        if (inspRow.stock_in_number) {
          await sequelize.query(`
            UPDATE stock_in_detail SET inspect_status = N'已处理-退货'
            WHERE stock_in_number = :stock_in_number AND item_number = :item_number
          `, { replacements: { stock_in_number: inspRow.stock_in_number, item_number: inspRow.item_number }, transaction });
        }

        // 7. 更新NC单
        await sequelize.query(`
          UPDATE nonconforming_product SET
            handling_method = N'退货', handling_quantity = :handlingQty,
            handling_status = N'已完成', return_order_number = :returnOrderNumber,
            operator = :operator, handling_date = :handlingDate, handling_remark = :remark
          WHERE nonconforming_number = :ncId
        `, { replacements: { handlingQty, returnOrderNumber: returnNumber, operator, handlingDate: now, remark: b.handling_remark || '', ncId }, transaction });

        await writeBackDefectLine('退货', transaction);
        await transaction.commit();
        res.json(success({ return_number: returnNumber }, `退货处理完成，已创建采购退货单：${returnNumber}`));
        return;
      }

      // 委外检验 - 复用上述逻辑（根据处理方式匹配）
      await transaction.rollback();
      res.status(400).json({ success: false, message: '不支持的处理方式组合' });
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 撤销处理 ====================
export const cancelHandleNonconforming = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const ncId = String(id);

    const [records]: any = await sequelize.query(
      `SELECT * FROM nonconforming_product WHERE nonconforming_number = :ncId`,
      { replacements: { ncId } }
    );
    if (!records.length) { res.status(404).json({ success: false, message: '不合格品记录不存在' }); return; }

    const record = records[0];
    if (record.handling_status !== '已完成' && record.handling_status !== '处理中') {
      res.status(400).json({ success: false, message: `当前状态[${record.handling_status}]不允许撤销` });
      return;
    }

    const handlingMethod = record.handling_method;
    const sourceType = record.source_type;
    const unqualifiedQty = parseFloat(record.unqualified_quantity) || 0;

    const transaction = await sequelize.transaction();
    try {
      // 1. 重置NC单
      await sequelize.query(`
        UPDATE nonconforming_product SET
          handling_method = N'', handling_quantity = 0,
          handling_status = N'待处理', handling_remark = N'',
          handling_date = N'', operator = N'',
          scrap_type = N'', scrap_quantity = 0,
          concession_quantity = 0, qualified_quantity_after = 0,
          unqualified_quantity_after = 0,
          return_order_number = N'', special_warehouse = N'',
          rework_step_number = NULL, rework_order_number = N'',
          stock_in_number = N''
        WHERE nonconforming_number = :ncId
      `, { replacements: { ncId }, transaction });

      // 2. 删除关联的入库单（报废/特采，仅草稿状态）
      if (record.stock_in_number) {
        const [siRows]: any = await sequelize.query(
          `SELECT approval_status, stock_in_type FROM stock_in WHERE stock_in_number = :siNum`,
          { replacements: { siNum: record.stock_in_number }, transaction }
        );
        if (siRows.length && siRows[0].approval_status === '草稿') {
          await sequelize.query(`DELETE FROM stock_in_detail WHERE stock_in_number = :siNum`,
            { replacements: { siNum: record.stock_in_number }, transaction });
          await sequelize.query(`DELETE FROM stock_in WHERE stock_in_number = :siNum`,
            { replacements: { siNum: record.stock_in_number }, transaction });
        } else if (siRows.length && siRows[0].approval_status !== '草稿') {
          await transaction.rollback();
          res.status(400).json({ success: false, message: `入库单 ${record.stock_in_number} 已确认/审批，无法撤销，请先撤回入库单` });
          return;
        }
      }

      // 2b. 删除关联的采购退货单（仅草稿状态）
      if (handlingMethod === '退货' && record.return_order_number && record.return_order_number.startsWith('PRT-')) {
        const [returnRows]: any = await sequelize.query(
          `SELECT approval_status FROM purchase_return WHERE return_number = :rn`,
          { replacements: { rn: record.return_order_number }, transaction }
        );
        if (returnRows.length) {
          if (returnRows[0].approval_status !== '草稿') {
            await transaction.rollback();
            res.status(400).json({ success: false, message: `退货单 ${record.return_order_number} 已提交/审批，无法撤销，请先撤回退货单` });
            return;
          }
          await sequelize.query(`DELETE FROM purchase_return_detail WHERE return_number = :rn`,
            { replacements: { rn: record.return_order_number }, transaction });
          await sequelize.query(`DELETE FROM purchase_return WHERE return_number = :rn`,
            { replacements: { rn: record.return_order_number }, transaction });
        }
      }

      // 3. 根据来源类型回退检验单
      if (sourceType === '来料检验') {
        // 回退采购检验单
        const [inspRows]: any = await sequelize.query(
          `SELECT stock_in_number, item_number, qualified_quantity, unqualified_quantity, received_quantity FROM purchase_quality_inspection WHERE inspection_number = :srcNum`,
          { replacements: { srcNum: record.source_number }, transaction }
        );

        if (inspRows.length) {
          const insp = inspRows[0];
          // 恢复合格/不合格数量（特采和挑选会修改）
          let restoreQualified = insp.qualified_quantity;
          let restoreUnqualified = insp.unqualified_quantity;

          if (handlingMethod === '特采') {
            const specialQty = parseFloat(record.handling_quantity) || 0;
            restoreQualified = Math.max(0, restoreQualified - specialQty);
            restoreUnqualified = restoreUnqualified + specialQty;
          } else if (handlingMethod === '挑选') {
            restoreUnqualified = unqualifiedQty;
            restoreQualified = Math.max(0, (parseFloat(insp.received_quantity) || 0) - restoreUnqualified);
          }

          await sequelize.query(`
            UPDATE purchase_quality_inspection SET
              defect_handling = N'待处理',
              qualified_quantity = :qualifiedQty, unqualified_quantity = :unqualifiedQty,
              inspect_result = CASE WHEN :unqualifiedQty > 0 THEN N'不合格' ELSE N'合格' END,
              handling_quantity = 0, handling_remark = N'',
              return_order_number = N'', special_warehouse = N''
            WHERE inspection_number = :srcNum
          `, {
            replacements: {
              qualifiedQty: restoreQualified, unqualifiedQty: restoreUnqualified,
              srcNum: record.source_number
            }, transaction
          });

          // 回退入库明细
          if (insp.stock_in_number) {
            await sequelize.query(`
              UPDATE stock_in_detail SET
                qualified_quantity = :qualifiedQty, unqualified_quantity = :unqualifiedQty,
                inspect_status = N''
              WHERE stock_in_number = :siNum AND item_number = :itemNum
            `, {
              replacements: {
                qualifiedQty: restoreQualified, unqualifiedQty: restoreUnqualified,
                siNum: insp.stock_in_number, itemNum: insp.item_number
              }, transaction
            });
          }
        }
      } else if (sourceType === '生产检验') {
        // 回退生产检验单
        await sequelize.query(`
          UPDATE production_inspection SET
            defect_handling = N'待处理',
            concession_quantity = 0, scrap_type = N'', scrap_quantity = 0,
            rework_step_number = NULL, rework_order_number = N''
          WHERE inspection_number = :srcNum
        `, { replacements: { srcNum: record.source_number }, transaction });

        // 让步接收需恢复合格/不合格数量
        if (handlingMethod === '让步接收') {
          const concessionQty = parseFloat(record.concession_quantity) || 0;
          await sequelize.query(`
            UPDATE production_inspection SET
              qualified_quantity = CASE WHEN qualified_quantity - :concessionQty < 0 THEN 0 ELSE qualified_quantity - :concessionQty END,
              unqualified_quantity = unqualified_quantity + :concessionQty
            WHERE inspection_number = :srcNum
          `, { replacements: { concessionQty, srcNum: record.source_number }, transaction });
        }

        // 恢复工序状态
        const [taskRows]: any = await sequelize.query(
          `SELECT process_task_number FROM production_inspection WHERE inspection_number = :srcNum`,
          { replacements: { srcNum: record.source_number }, transaction }
        );
        if (taskRows.length && taskRows[0].process_task_number) {
          await sequelize.query(
            `UPDATE process_task SET inspect_status = N'待检' WHERE process_task_number = :taskNo`,
            { replacements: { taskNo: taskRows[0].process_task_number }, transaction }
          );
        }

        // 返修撤销：删除返修单，恢复工序数量
        if (handlingMethod === '返修' && record.rework_order_number) {
          await sequelize.query(`DELETE FROM rework_order WHERE rework_order_number = :rwNum`,
            { replacements: { rwNum: record.rework_order_number }, transaction });

          if (record.rework_step_number && record.production_order_number) {
            const step = parseInt(record.rework_step_number) || 0;
            await sequelize.query(`
              UPDATE process_task SET planned_quantity = CASE WHEN planned_quantity - :qty < 0 THEN 0 ELSE planned_quantity - :qty END
              WHERE production_order_number = :orderNo AND step_number = :step
            `, { replacements: { qty: unqualifiedQty, orderNo: record.production_order_number, step }, transaction });
          }
        }
      }

      // 4. 回写缺陷明细行：清除该NC单对应的缺陷行处理方式
      if (record.defect_line_id) {
        await sequelize.query(
          `UPDATE purchase_inspection_defect SET defect_handling = N'' WHERE id = :defectLineId`,
          { replacements: { defectLineId: record.defect_line_id }, transaction }
        );
      }

      await transaction.commit();
      res.json(success(null, '不合格品处理已撤销'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['nonconforming_number', 'source_type', 'source_number', 'item_number', 'item_name', 'specifications', 'unqualified_quantity', 'defect_class_name', 'defect_name', 'defect_reason_name', 'handling_method', 'handling_status', 'handling_date', 'operator'];
const exportHeaders = ['不合格品单号', '来源类型', '检验单号', '物料编号', '物料名称', '规格型号', '不合格数量', '缺陷分类', '缺陷名称', '缺陷原因', '处理方式', '处理状态', '处理日期', '处理人'];

export const exportNonconformingProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM nonconforming_product ORDER BY creation_date DESC`);
    exportToExcel(items, exportFields, exportHeaders, 'nonconforming_products', res);
  } catch (err) { next(err); }
};
