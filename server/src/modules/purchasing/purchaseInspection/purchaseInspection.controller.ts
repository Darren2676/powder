import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';

/**
 * 生成检验单号 QI-YYYYMMDD-###
 */
async function generateInspectionNumber(): Promise<string> {
  const today = new Date();
  const dateStr = today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `QI-${dateStr}-`;

  const [rows]: any = await sequelize.query(`
    SELECT TOP 1 inspection_number
    FROM purchase_quality_inspection
    WHERE inspection_number LIKE :prefix
    ORDER BY inspection_number DESC
  `, { replacements: { prefix: prefix + '%' } });

  let seq = 1;
  if (rows.length > 0) {
    const lastNum = rows[0].inspection_number;
    const lastSeq = parseInt(lastNum.substring(lastNum.lastIndexOf('-') + 1));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return prefix + String(seq).padStart(3, '0');
}

/**
 * 创建采购质量检验单（自动匹配检验方案和规范）
 * POST /api/quality-report/purchase-inspection
 */
export const createPurchaseInspection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      stock_in_number,
      purchase_order_number,
      supplier_number,
      supplier_name,
      item_number,
      item_name,
      specifications,
      basic_unit,
      received_quantity,
      batch_number
    } = req.body;

    if (!item_number) {
      res.status(400).json({ success: false, message: '物料编号不能为空' });
      return;
    }

    const inspection_number = await generateInspectionNumber();
    const creation_man = (req as any).user?.username || '';

    // 匹配收料检验方案
    const [planRows]: any = await sequelize.query(`
      SELECT TOP 1 plan_name, inspector_name, inspect_method,
             sampling_method, sampling_quantity
      FROM incoming_inspect_plan
      WHERE plan_name = :item_number
    `, { replacements: { item_number } });

    let inspect_plan_name = '';
    let inspect_method = '';
    let inspector_name = '';
    let sample_quantity = received_quantity || 0;

    if (planRows.length > 0) {
      const plan = planRows[0];
      inspect_plan_name = plan.plan_name || '';
      inspect_method = plan.inspect_method || '';
      inspector_name = plan.inspector_name || '';
      if (plan.sampling_quantity && parseFloat(plan.sampling_quantity) > 0) {
        sample_quantity = parseFloat(plan.sampling_quantity);
      }
    }

    // 匹配来料检验规范
    const [specRows]: any = await sequelize.query(`
      SELECT TOP 1 spec_name
      FROM incoming_inspect_spec
      WHERE spec_name = :item_number
    `, { replacements: { item_number } });

    let inspect_spec_name = '';
    if (specRows.length > 0) {
      inspect_spec_name = specRows[0].spec_name || '';
    }

    // 创建检验单主表
    await sequelize.query(`
      INSERT INTO purchase_quality_inspection (
        inspection_number, stock_in_number, purchase_order_number,
        supplier_number, supplier_name,
        item_number, item_name, specifications, basic_unit,
        received_quantity, sample_quantity,
        qualified_quantity, unqualified_quantity,
        inspect_plan_name, inspect_method, inspect_spec_name,
        inspector_name, inspect_date,
        inspect_result, inspect_status,
        batch_number, creation_date, creation_man
      ) VALUES (
        :inspection_number, :stock_in_number, :purchase_order_number,
        :supplier_number, :supplier_name,
        :item_number, :item_name, :specifications, :basic_unit,
        :received_quantity, :sample_quantity,
        0, 0,
        :inspect_plan_name, :inspect_method, :inspect_spec_name,
        :inspector_name, GETDATE(),
        '', N'待检验',
        :batch_number, GETDATE(), :creation_man
      )
    `, {
      replacements: {
        inspection_number,
        stock_in_number: stock_in_number || '',
        purchase_order_number: purchase_order_number || '',
        supplier_number: supplier_number || '',
        supplier_name: supplier_name || '',
        item_number,
        item_name: item_name || '',
        specifications: specifications || '',
        basic_unit: basic_unit || '',
        received_quantity: received_quantity || 0,
        sample_quantity,
        inspect_plan_name,
        inspect_method,
        inspect_spec_name,
        inspector_name,
        batch_number: batch_number || '',
        creation_man
      }
    });

    // 自动加载质量特性明细行
    if (inspect_spec_name) {
      const [specItems]: any = await sequelize.query(`
        SELECT char_name, char_category, data_type,
               upper_limit, standard_value, lower_limit,
               inspect_requirement, sort_order
        FROM incoming_inspect_spec_item
        WHERE spec_name = :spec_name
        ORDER BY sort_order ASC
      `, { replacements: { spec_name: inspect_spec_name } });

      for (const item of specItems) {
        await sequelize.query(`
          INSERT INTO purchase_quality_inspection_detail (
            inspection_number, sort_order, char_name, char_category,
            data_type, upper_limit, standard_value, lower_limit,
            actual_value, is_qualified, inspect_requirement
          ) VALUES (
            :inspection_number, :sort_order, :char_name, :char_category,
            :data_type, :upper_limit, :standard_value, :lower_limit,
            '', '', :inspect_requirement
          )
        `, {
          replacements: {
            inspection_number,
            sort_order: item.sort_order || 0,
            char_name: item.char_name || '',
            char_category: item.char_category || '',
            data_type: item.data_type || '',
            upper_limit: item.upper_limit,
            standard_value: item.standard_value,
            lower_limit: item.lower_limit,
            inspect_requirement: item.inspect_requirement || ''
          }
        });
      }
    }

    res.json(success({ inspection_number, message: '检验单创建成功' }));
  } catch (err) {
    next(err);
  }
};

/**
 * 检验单列表
 * GET /api/quality-report/purchase-inspections
 */
export const getPurchaseInspections = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const offsetEnd = offset + limit;

    const { search, supplier_number, inspect_status, start_date, end_date } = req.query;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (qi.inspection_number LIKE :search OR qi.item_number LIKE :search OR qi.item_name LIKE :search OR qi.stock_in_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (supplier_number) {
      whereClause += ` AND qi.supplier_number = :supplier_number`;
      replacements.supplier_number = supplier_number;
    }
    if (inspect_status) {
      whereClause += ` AND qi.inspect_status = :inspect_status`;
      replacements.inspect_status = inspect_status;
    }
    if (start_date) {
      whereClause += ` AND qi.inspect_date >= :start_date`;
      replacements.start_date = start_date;
    }
    if (end_date) {
      whereClause += ` AND qi.inspect_date <= :end_date`;
      replacements.end_date = end_date;
    }

    // 计数
    const [countResult]: any = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM purchase_quality_inspection qi
      ${whereClause}
    `, { replacements });

    // 分页查询
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT
          qi.inspection_number, qi.stock_in_number, qi.purchase_order_number,
          qi.supplier_number, qi.supplier_name,
          qi.item_number, qi.item_name, qi.specifications, qi.basic_unit,
          qi.received_quantity, qi.sample_quantity,
          qi.qualified_quantity, qi.unqualified_quantity,
          qi.inspect_plan_name, qi.inspect_method, qi.inspect_spec_name,
          qi.inspector_name, qi.inspect_date,
          qi.inspect_result, qi.inspect_status,
          qi.batch_number, qi.defect_class_name, qi.defect_name, qi.defect_reason_name,
          qi.remark, qi.creation_date, qi.creation_man,
          ROW_NUMBER() OVER (ORDER BY qi.creation_date DESC) AS _row_num
        FROM purchase_quality_inspection qi
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    // 统计卡片数据
    const [statsResult]: any = await sequelize.query(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN qi.inspect_status = N'已完成' THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN qi.inspect_status = N'待检验' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN qi.inspect_status = N'检验中' THEN 1 ELSE 0 END) AS inspecting_count,
        ISNULL(SUM(qi.received_quantity), 0) AS total_received,
        ISNULL(SUM(qi.qualified_quantity), 0) AS total_qualified,
        ISNULL(SUM(qi.unqualified_quantity), 0) AS total_unqualified,
        CASE WHEN ISNULL(SUM(CASE WHEN qi.inspect_status = N'已完成' THEN qi.received_quantity ELSE 0 END), 0) > 0
             THEN CAST(SUM(CASE WHEN qi.inspect_status = N'已完成' THEN qi.qualified_quantity ELSE 0 END) * 100.0
                        / SUM(CASE WHEN qi.inspect_status = N'已完成' THEN qi.received_quantity ELSE 0 END) AS DECIMAL(5,2))
             ELSE 100 END AS pass_rate
      FROM purchase_quality_inspection qi
      ${whereClause}
    `, { replacements });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page,
      limit,
      stats: statsResult[0] || {}
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * 检验单详情（含检验特性明细行）
 * GET /api/quality-report/purchase-inspections/:inspection_number
 */
export const getPurchaseInspectionDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { inspection_number } = req.params;

    // 主表
    const [headerRows]: any = await sequelize.query(`
      SELECT * FROM purchase_quality_inspection
      WHERE inspection_number = :inspection_number
    `, { replacements: { inspection_number } });

    if (!headerRows.length) {
      res.status(404).json({ success: false, message: '检验单不存在' });
      return;
    }

    // 明细行
    const [detailRows]: any = await sequelize.query(`
      SELECT * FROM purchase_quality_inspection_detail
      WHERE inspection_number = :inspection_number
      ORDER BY sort_order ASC
    `, { replacements: { inspection_number } });

    // 获取缺陷分类/缺陷/缺陷原因 下拉选项
    const [defectClasses]: any = await sequelize.query(`SELECT defect_class_name FROM defect_class ORDER BY defect_class_name`);
    const [defects]: any = await sequelize.query(`SELECT defect_name, defect_class_name FROM defect ORDER BY defect_name`);
    const [defectReasons]: any = await sequelize.query(`SELECT defect_reason_name FROM defect_reason ORDER BY defect_reason_name`);

    res.json(success({
      header: headerRows[0],
      details: detailRows,
      options: {
        defect_classes: defectClasses.map((d: any) => d.defect_class_name),
        defects: defects,
        defect_reasons: defectReasons.map((d: any) => d.defect_reason_name)
      }
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * 更新检验单（填写实测值、缺陷信息、检验结论）
 * PUT /api/quality-report/purchase-inspections/:inspection_number
 */
export const updatePurchaseInspection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { inspection_number } = req.params;
    const {
      qualified_quantity,
      unqualified_quantity,
      inspect_result,
      defect_class_name,
      defect_name,
      defect_reason_name,
      remark,
      details // array of { id, actual_value, is_qualified, remark }
    } = req.body;

    // 更新主表
    await sequelize.query(`
      UPDATE purchase_quality_inspection SET
        qualified_quantity = :qualified_quantity,
        unqualified_quantity = :unqualified_quantity,
        inspect_result = :inspect_result,
        inspect_status = N'检验中',
        defect_class_name = :defect_class_name,
        defect_name = :defect_name,
        defect_reason_name = :defect_reason_name,
        remark = :remark
      WHERE inspection_number = :inspection_number
    `, {
      replacements: {
        inspection_number,
        qualified_quantity: qualified_quantity || 0,
        unqualified_quantity: unqualified_quantity || 0,
        inspect_result: inspect_result || '',
        defect_class_name: defect_class_name || '',
        defect_name: defect_name || '',
        defect_reason_name: defect_reason_name || '',
        remark: remark || ''
      }
    });

    // 更新明细行
    if (details && Array.isArray(details)) {
      for (const d of details) {
        if (d.id) {
          await sequelize.query(`
            UPDATE purchase_quality_inspection_detail SET
              actual_value = :actual_value,
              is_qualified = :is_qualified,
              remark = :remark
            WHERE id = :id AND inspection_number = :inspection_number
          `, {
            replacements: {
              id: d.id,
              inspection_number,
              actual_value: d.actual_value || '',
              is_qualified: d.is_qualified || '',
              remark: d.remark || ''
            }
          });
        }
      }
    }

    res.json(success({ message: '检验单更新成功' }));
  } catch (err) {
    next(err);
  }
};

/**
 * 完成检验
 * PUT /api/quality-report/purchase-inspections/:inspection_number/complete
 */
export const completePurchaseInspection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { inspection_number } = req.params;
    const { inspect_result, qualified_quantity, unqualified_quantity } = req.body;

    if (!inspect_result) {
      res.status(400).json({ success: false, message: '检验结论不能为空' });
      return;
    }

    // 更新检验单状态为已完成
    await sequelize.query(`
      UPDATE purchase_quality_inspection SET
        inspect_status = N'已完成',
        inspect_result = :inspect_result,
        qualified_quantity = :qualified_quantity,
        unqualified_quantity = :unqualified_quantity
      WHERE inspection_number = :inspection_number
    `, {
      replacements: {
        inspection_number,
        inspect_result,
        qualified_quantity: qualified_quantity || 0,
        unqualified_quantity: unqualified_quantity || 0
      }
    });

    // 回写入库单合格/不合格数量 (如果关联了入库单)
    const [inspRows]: any = await sequelize.query(`
      SELECT stock_in_number, item_number, qualified_quantity, unqualified_quantity
      FROM purchase_quality_inspection
      WHERE inspection_number = :inspection_number
    `, { replacements: { inspection_number } });

    if (inspRows.length > 0 && inspRows[0].stock_in_number) {
      const insp = inspRows[0];
      try {
        await sequelize.query(`
          UPDATE stock_in_detail SET
            qualified_quantity = :qualified_quantity,
            unqualified_quantity = :unqualified_quantity
          WHERE stock_in_number = :stock_in_number
            AND item_number = :item_number
        `, {
          replacements: {
            stock_in_number: insp.stock_in_number,
            item_number: insp.item_number,
            qualified_quantity: insp.qualified_quantity,
            unqualified_quantity: insp.unqualified_quantity
          }
        });
      } catch (e) {
        console.log('回写入库单合格数量失败（可能字段不存在）:', e);
      }
    }

    res.json(success({ message: '检验完成' }));
  } catch (err) {
    next(err);
  }
};

/**
 * 采购质量统计
 * GET /api/quality-report/purchase-inspection-summary
 */
export const getPurchaseInspectionSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start_date, end_date, supplier_number } = req.query;

    let whereClause = `WHERE qi.inspect_status = N'已完成'`;
    const replacements: any = {};

    if (start_date) {
      whereClause += ` AND qi.inspect_date >= :start_date`;
      replacements.start_date = start_date;
    }
    if (end_date) {
      whereClause += ` AND qi.inspect_date <= :end_date`;
      replacements.end_date = end_date;
    }
    if (supplier_number) {
      whereClause += ` AND qi.supplier_number = :supplier_number`;
      replacements.supplier_number = supplier_number;
    }

    // 按供应商汇总
    const [bySupplier]: any = await sequelize.query(`
      SELECT
        qi.supplier_number,
        qi.supplier_name,
        COUNT(*) AS inspection_count,
        SUM(qi.received_quantity) AS total_received,
        SUM(qi.qualified_quantity) AS total_qualified,
        SUM(qi.unqualified_quantity) AS total_unqualified,
        CASE WHEN SUM(qi.received_quantity) > 0
             THEN CAST(SUM(qi.qualified_quantity) * 100.0 / SUM(qi.received_quantity) AS DECIMAL(5,2))
             ELSE 100 END AS pass_rate,
        SUM(CASE WHEN qi.inspect_result = N'不合格' THEN 1 ELSE 0 END) AS reject_count
      FROM purchase_quality_inspection qi
      ${whereClause}
      GROUP BY qi.supplier_number, qi.supplier_name
      ORDER BY pass_rate ASC
    `, { replacements });

    // 按物料汇总
    const [byItem]: any = await sequelize.query(`
      SELECT
        qi.item_number,
        qi.item_name,
        qi.specifications,
        COUNT(*) AS inspection_count,
        SUM(qi.received_quantity) AS total_received,
        SUM(qi.qualified_quantity) AS total_qualified,
        SUM(qi.unqualified_quantity) AS total_unqualified,
        CASE WHEN SUM(qi.received_quantity) > 0
             THEN CAST(SUM(qi.qualified_quantity) * 100.0 / SUM(qi.received_quantity) AS DECIMAL(5,2))
             ELSE 100 END AS pass_rate
      FROM purchase_quality_inspection qi
      ${whereClause}
      GROUP BY qi.item_number, qi.item_name, qi.specifications
      ORDER BY pass_rate ASC
    `, { replacements });

    // 整体统计
    const [overallStats]: any = await sequelize.query(`
      SELECT
        COUNT(*) AS total_inspections,
        COUNT(DISTINCT qi.supplier_number) AS supplier_count,
        COUNT(DISTINCT qi.item_number) AS item_count,
        ISNULL(SUM(qi.received_quantity), 0) AS total_received,
        ISNULL(SUM(qi.qualified_quantity), 0) AS total_qualified,
        ISNULL(SUM(qi.unqualified_quantity), 0) AS total_unqualified,
        CASE WHEN ISNULL(SUM(qi.received_quantity), 0) > 0
             THEN CAST(SUM(qi.qualified_quantity) * 100.0 / SUM(qi.received_quantity) AS DECIMAL(5,2))
             ELSE 100 END AS pass_rate,
        SUM(CASE WHEN qi.inspect_result = N'合格' THEN 1 ELSE 0 END) AS pass_count,
        SUM(CASE WHEN qi.inspect_result = N'不合格' THEN 1 ELSE 0 END) AS reject_count,
        SUM(CASE WHEN qi.inspect_result = N'让步接收' THEN 1 ELSE 0 END) AS concession_count
      FROM purchase_quality_inspection qi
      ${whereClause}
    `, { replacements });

    res.json(success({
      by_supplier: bySupplier,
      by_item: byItem,
      overall: overallStats[0] || {}
    }));
  } catch (err) {
    next(err);
  }
};
