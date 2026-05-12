import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';

// ==================== 正向追溯：成品批次 → 原材料批次 ====================
export const forwardTrace = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { batch_number } = req.query;
    if (!batch_number) {
      res.status(400).json({ success: false, message: '请提供成品批次号' }); return;
    }

    // 查询成品批次信息
    const [finishedBatch]: any = await sequelize.query(`
      SELECT * FROM finished_batch_inventory WHERE batch_number = :bn
    `, { replacements: { bn: batch_number } });

    // 查询追溯关联的原材料批次
    const [traceLinks]: any = await sequelize.query(`
      SELECT bt.*, mbi.quantity as current_stock, mbi.inbound_date as material_inbound_date, mbi.status as material_status
      FROM batch_traceability bt
      LEFT JOIN material_batch_inventory mbi ON bt.material_batch_number = mbi.batch_number
        AND bt.material_item_number = mbi.item_number
      WHERE bt.finished_batch_number = :bn
      ORDER BY bt.creation_date
    `, { replacements: { bn: batch_number } });

    // 查询相关的生产单信息
    const productionOrderNumbers = [...new Set(traceLinks.map((t: any) => t.production_order_number).filter(Boolean))];
    let productionOrders: any[] = [];
    if (productionOrderNumbers.length > 0) {
      const placeholders = productionOrderNumbers.map((_: any, i: number) => `:pon${i}`).join(',');
      const ponReplacements: any = {};
      productionOrderNumbers.forEach((pon: any, i: number) => { ponReplacements[`pon${i}`] = pon; });

      const [orders]: any = await sequelize.query(
        `SELECT production_order_number, item_number, item_name, planned_quantity, inbound_quantity, plan_status, production_date
         FROM production_order WHERE production_order_number IN (${placeholders})`,
        { replacements: ponReplacements }
      );
      productionOrders = orders;
    }

    // 查询报工记录
    let workReports: any[] = [];
    if (productionOrderNumbers.length > 0) {
      const placeholders = productionOrderNumbers.map((_: any, i: number) => `:pon${i}`).join(',');
      const ponReplacements: any = {};
      productionOrderNumbers.forEach((pon: any, i: number) => { ponReplacements[`pon${i}`] = pon; });
      const [wr]: any = await sequelize.query(
        `SELECT work_report_number, production_order_number, step_number,
                standard_process_name, qualified_quantity, unqualified_quantity,
                cumulative_quantity, report_date, operator_name, approval_status
         FROM work_report WHERE production_order_number IN (${placeholders})
         ORDER BY production_order_number, step_number, report_date`,
        { replacements: ponReplacements }
      );
      workReports = wr;
    }

    // 查询原材料来料检验记录
    const materialBatchNumbers = [...new Set(traceLinks.map((t: any) => t.material_batch_number).filter(Boolean))];
    let purchaseInspections: any[] = [];
    if (materialBatchNumbers.length > 0) {
      const mbPlaceholders = materialBatchNumbers.map((_: any, i: number) => `:mbn${i}`).join(',');
      const mbReplacements: any = {};
      materialBatchNumbers.forEach((bn: any, i: number) => { mbReplacements[`mbn${i}`] = bn; });
      const [pi]: any = await sequelize.query(
        `SELECT inspection_number, batch_number, item_number, item_name,
                supplier_name, received_quantity, qualified_quantity,
                unqualified_quantity, inspect_result, inspector_name,
                inspect_date, inspect_status
         FROM purchase_quality_inspection WHERE batch_number IN (${mbPlaceholders})
         ORDER BY inspect_date`,
        { replacements: mbReplacements }
      );
      purchaseInspections = pi;
    }

    // 查询生产检验记录
    let productionInspections: any[] = [];
    if (productionOrderNumbers.length > 0) {
      const placeholders = productionOrderNumbers.map((_: any, i: number) => `:ppon${i}`).join(',');
      const ppiReplacements: any = {};
      productionOrderNumbers.forEach((pon: any, i: number) => { ppiReplacements[`ppon${i}`] = pon; });
      const [pIns]: any = await sequelize.query(
        `SELECT inspection_number, production_order_number, work_report_number,
                step_number, standard_process_name, inspect_type,
                inspection_result, inspector_name, inspection_date, status
         FROM production_inspection WHERE production_order_number IN (${placeholders})
         ORDER BY production_order_number, step_number, inspection_date`,
        { replacements: ppiReplacements }
      );
      productionInspections = pIns;
    }

    res.json(success({
      finishedBatch: finishedBatch[0] || null,
      materialBatches: traceLinks,
      productionOrders,
      workReports,
      purchaseInspections,
      productionInspections
    }));
  } catch (err) { next(err); }
};

// ==================== 反向追溯：原材料批次 → 成品批次 ====================
export const reverseTrace = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { batch_number } = req.query;
    if (!batch_number) {
      res.status(400).json({ success: false, message: '请提供原材料批次号' }); return;
    }

    // 查询原材料批次信息
    const [materialBatch]: any = await sequelize.query(`
      SELECT * FROM material_batch_inventory WHERE batch_number = :bn
    `, { replacements: { bn: batch_number } });

    // 查询追溯关联的成品批次
    const [traceLinks]: any = await sequelize.query(`
      SELECT bt.*, fbi.quantity as current_stock, fbi.inbound_date as finished_inbound_date, fbi.status as finished_status
      FROM batch_traceability bt
      LEFT JOIN finished_batch_inventory fbi ON bt.finished_batch_number = fbi.batch_number
        AND bt.finished_item_number = fbi.item_number
      WHERE bt.material_batch_number = :bn
      ORDER BY bt.creation_date
    `, { replacements: { bn: batch_number } });

    // 查询相关的生产单信息
    const productionOrderNumbers = [...new Set(traceLinks.map((t: any) => t.production_order_number).filter(Boolean))];
    let productionOrders: any[] = [];
    if (productionOrderNumbers.length > 0) {
      const placeholders = productionOrderNumbers.map((_: any, i: number) => `:pon${i}`).join(',');
      const ponReplacements: any = {};
      productionOrderNumbers.forEach((pon: any, i: number) => { ponReplacements[`pon${i}`] = pon; });

      const [orders]: any = await sequelize.query(
        `SELECT production_order_number, item_number, item_name, planned_quantity, inbound_quantity, plan_status, production_date
         FROM production_order WHERE production_order_number IN (${placeholders})`,
        { replacements: ponReplacements }
      );
      productionOrders = orders;
    }

    // 查询报工记录
    let workReports: any[] = [];
    if (productionOrderNumbers.length > 0) {
      const placeholders = productionOrderNumbers.map((_: any, i: number) => `:wrpon${i}`).join(',');
      const wrReplacements: any = {};
      productionOrderNumbers.forEach((pon: any, i: number) => { wrReplacements[`wrpon${i}`] = pon; });
      const [wr]: any = await sequelize.query(
        `SELECT work_report_number, production_order_number, step_number,
                standard_process_name, qualified_quantity, unqualified_quantity,
                cumulative_quantity, report_date, operator_name, approval_status
         FROM work_report WHERE production_order_number IN (${placeholders})
         ORDER BY production_order_number, step_number, report_date`,
        { replacements: wrReplacements }
      );
      workReports = wr;
    }

    // 查询原材料来料检验记录（直接用输入的批次号）
    const [purchaseInspections]: any = await sequelize.query(
      `SELECT inspection_number, batch_number, item_number, item_name,
              supplier_name, received_quantity, qualified_quantity,
              unqualified_quantity, inspect_result, inspector_name,
              inspect_date, inspect_status
       FROM purchase_quality_inspection WHERE batch_number = :bn
       ORDER BY inspect_date`,
      { replacements: { bn: batch_number } }
    );

    // 查询生产检验记录
    let productionInspections: any[] = [];
    if (productionOrderNumbers.length > 0) {
      const placeholders = productionOrderNumbers.map((_: any, i: number) => `:pipon${i}`).join(',');
      const piReplacements: any = {};
      productionOrderNumbers.forEach((pon: any, i: number) => { piReplacements[`pipon${i}`] = pon; });
      const [pIns]: any = await sequelize.query(
        `SELECT inspection_number, production_order_number, work_report_number,
                step_number, standard_process_name, inspect_type,
                inspection_result, inspector_name, inspection_date, status
         FROM production_inspection WHERE production_order_number IN (${placeholders})
         ORDER BY production_order_number, step_number, inspection_date`,
        { replacements: piReplacements }
      );
      productionInspections = pIns;
    }

    res.json(success({
      materialBatch: materialBatch[0] || null,
      finishedBatches: traceLinks,
      productionOrders,
      workReports,
      purchaseInspections,
      productionInspections
    }));
  } catch (err) { next(err); }
};

// ==================== 批次搜索（统一搜索入口） ====================
export const searchBatch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { keyword = '', type = '' } = req.query;
    if (!keyword) {
      res.status(400).json({ success: false, message: '请输入搜索关键字' }); return;
    }

    const results: any = { materialBatches: [], finishedBatches: [] };

    if (!type || type === 'material') {
      const [mBatches]: any = await sequelize.query(`
        SELECT TOP 20 batch_number, item_number, item_name, specifications, warehouse_number, warehouse_name,
               quantity, initial_quantity, production_order_number, inbound_date, status, N'原材料' as batch_type
        FROM material_batch_inventory
        WHERE batch_number LIKE :kw OR item_number LIKE :kw OR item_name LIKE :kw OR production_order_number LIKE :kw
        ORDER BY inbound_date DESC
      `, { replacements: { kw: `%${keyword}%` } });
      results.materialBatches = mBatches;
    }

    if (!type || type === 'finished') {
      const [fBatches]: any = await sequelize.query(`
        SELECT TOP 20 batch_number, item_number, item_name, specifications, warehouse_number, warehouse_name,
               quantity, initial_quantity, production_order_number, inbound_date, status, N'成品' as batch_type
        FROM finished_batch_inventory
        WHERE batch_number LIKE :kw OR item_number LIKE :kw OR item_name LIKE :kw OR production_order_number LIKE :kw
        ORDER BY inbound_date DESC
      `, { replacements: { kw: `%${keyword}%` } });
      results.finishedBatches = fBatches;
    }

    res.json(success(results));
  } catch (err) { next(err); }
};

// ==================== 批次详情 ====================
export const getBatchDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { batch_number, type } = req.query;
    if (!batch_number) {
      res.status(400).json({ success: false, message: '请提供批次号' }); return;
    }

    const tableName = type === 'finished' ? 'finished_batch_inventory' : 'material_batch_inventory';
    const txTable = type === 'finished' ? 'inventory_transaction' : 'material_inventory_transaction';

    // 批次信息
    const [batchInfo]: any = await sequelize.query(
      `SELECT * FROM ${tableName} WHERE batch_number = :bn`,
      { replacements: { bn: batch_number } }
    );

    // 相关流水
    const [transactions]: any = await sequelize.query(
      `SELECT TOP 50 * FROM ${txTable} WHERE batch_number LIKE :bn ORDER BY creation_date DESC`,
      { replacements: { bn: `%${batch_number}%` } }
    );

    // 追溯关联
    const traceField = type === 'finished' ? 'finished_batch_number' : 'material_batch_number';
    const [traceLinks]: any = await sequelize.query(
      `SELECT * FROM batch_traceability WHERE ${traceField} = :bn ORDER BY creation_date`,
      { replacements: { bn: batch_number } }
    );

    res.json(success({
      batch: batchInfo[0] || null,
      transactions,
      traceLinks
    }));
  } catch (err) { next(err); }
};

// ==================== 按生产单追溯 ====================
export const traceByProductionOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { production_order_number } = req.query;
    if (!production_order_number) {
      res.status(400).json({ success: false, message: '请提供生产单号' }); return;
    }

    // 查询生产单信息
    const [orderInfo]: any = await sequelize.query(
      `SELECT * FROM production_order WHERE production_order_number = :pon`,
      { replacements: { pon: production_order_number } }
    );

    // 相关成品批次（从finished_batch_inventory查）
    const [finishedBatches]: any = await sequelize.query(`
      SELECT * FROM finished_batch_inventory WHERE production_order_number = :pon ORDER BY inbound_date
    `, { replacements: { pon: production_order_number } });

    // 相关半成品/原材料批次（从material_batch_inventory查）
    const [materialBatches]: any = await sequelize.query(`
      SELECT * FROM material_batch_inventory WHERE production_order_number = :pon ORDER BY inbound_date
    `, { replacements: { pon: production_order_number } });

    // 领料记录
    const [issueRecords]: any = await sequelize.query(`
      SELECT mi.issue_number, mi.production_order_number, mi.issue_date, mi.status,
             mid.material_number, mid.material_name, mid.actual_quantity, mid.batch_number, mid.unit
      FROM material_issue mi
      INNER JOIN material_issue_detail mid ON mi.issue_number = mid.issue_number
      WHERE mi.production_order_number = :pon
      ORDER BY mi.issue_date
    `, { replacements: { pon: production_order_number } });

    // 追溯关联
    const [traceLinks]: any = await sequelize.query(`
      SELECT * FROM batch_traceability WHERE production_order_number = :pon ORDER BY creation_date
    `, { replacements: { pon: production_order_number } });

    // 报工记录
    const [workReports]: any = await sequelize.query(`
      SELECT work_report_number, production_order_number, step_number,
             standard_process_name, qualified_quantity, unqualified_quantity,
             cumulative_quantity, report_date, operator_name, approval_status
      FROM work_report WHERE production_order_number = :pon
      ORDER BY step_number, report_date
    `, { replacements: { pon: production_order_number } });

    // 来料检验记录（通过该生产单耗用的原材料批次关联）
    const [purchaseInspections]: any = await sequelize.query(`
      SELECT pqi.inspection_number, pqi.batch_number, pqi.item_number,
             pqi.item_name, pqi.supplier_name, pqi.received_quantity,
             pqi.qualified_quantity, pqi.unqualified_quantity,
             pqi.inspect_result, pqi.inspector_name, pqi.inspect_date,
             pqi.inspect_status
      FROM purchase_quality_inspection pqi
      INNER JOIN material_batch_inventory mbi
        ON pqi.batch_number = mbi.batch_number AND pqi.item_number = mbi.item_number
      WHERE mbi.production_order_number = :pon
      ORDER BY pqi.inspect_date
    `, { replacements: { pon: production_order_number } });

    // 生产检验记录
    const [productionInspections]: any = await sequelize.query(`
      SELECT inspection_number, production_order_number, work_report_number,
             step_number, standard_process_name, inspect_type,
             inspection_result, inspector_name, inspection_date, status
      FROM production_inspection WHERE production_order_number = :pon
      ORDER BY step_number, inspection_date
    `, { replacements: { pon: production_order_number } });

    res.json(success({
      productionOrder: orderInfo[0] || null,
      finishedBatches,
      materialBatches,
      issueRecords,
      traceLinks,
      workReports,
      purchaseInspections,
      productionInspections
    }));
  } catch (err) { next(err); }
};
