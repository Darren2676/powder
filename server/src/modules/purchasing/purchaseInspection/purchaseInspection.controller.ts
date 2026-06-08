import { Request, Response, NextFunction } from 'express';
import { Transaction } from 'sequelize';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { createNonconformingFromInspection } from '../../quality/nonconformingProduct/nonconformingProduct.controller';
import { generateMaterialTxnNumber } from '@/services/inventory.service';
import { checkAndAutoComplete } from '@/services/documentAutoComplete.service';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

/**
 * 生成检验单号 QI-YYYYMMDD-###
 */
async function generateInspectionNumber(factoryCode: string = '', transaction?: Transaction): Promise<string> {
  const today = new Date();
  const dateStr = today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `QI${fc}-${dateStr}-`;

  const [rows]: any = await sequelize.query(`
    SELECT TOP 1 inspection_number
    FROM purchase_quality_inspection
    WHERE inspection_number LIKE :prefix
    ORDER BY inspection_number DESC
  `, { replacements: { prefix: prefix + '%' }, ...(transaction ? { transaction } : {}) });

  let seq = 1;
  if (rows.length > 0) {
    const lastNum = rows[0].inspection_number;
    const lastSeq = parseInt(lastNum.substring(lastNum.lastIndexOf('-') + 1));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return prefix + String(seq).padStart(3, '0');
}

/**
 * 内部服务函数：为入库单自动创建检验单（可在事务中调用）
 * 返回 inspection_number，不操作 res
 */
export async function createInspectionForStockIn(params: {
  stock_in_number: string;
  purchase_order_number: string;
  supplier_number: string;
  supplier_name: string;
  item_number: string;
  item_name: string;
  specifications: string;
  basic_unit: string;
  received_quantity: number;
  batch_number: string;
  creation_man: string;
}, factoryCode: string = '', _factoryId: number | null = null, transaction?: Transaction): Promise<string> {
  const {
    stock_in_number, purchase_order_number, supplier_number, supplier_name,
    item_number, item_name, specifications, basic_unit,
    received_quantity, batch_number, creation_man
  } = params;

  const inspection_number = await generateInspectionNumber(factoryCode, transaction);

  // 查询物料主数据的 enable_quality_chars
  const [itemRows]: any = await sequelize.query(`
    SELECT TOP 1 enable_quality_chars FROM item_master WHERE item_number = :item_number
  `, { replacements: { item_number }, ...(transaction ? { transaction } : {}) });
  const itemEnableChars = (itemRows.length > 0 && itemRows[0].enable_quality_chars === 'Y') ? 'Y' : '';

  // 匹配收料检验方案：按物料编号精确匹配
  const [planRows]: any = await sequelize.query(`
    SELECT TOP 1 plan_name, inspector_name, inspect_method,
           sampling_method, sampling_quantity, sampling_ratio, enable_quality_chars
    FROM incoming_inspect_plan
    WHERE plan_name = :item_number
  `, { replacements: { item_number }, ...(transaction ? { transaction } : {}) });

  let inspect_plan_name = '';
  let inspect_method = '';
  let inspector_name = '';
  let sample_quantity = received_quantity || 0;
  let sampling_method = '';
  let sampling_ratio: number | null = null;

  let enable_quality_chars = itemEnableChars || (planRows.length > 0 && planRows[0].enable_quality_chars === 'Y' ? 'Y' : 'N');

  if (planRows.length > 0) {
    const plan = planRows[0];
    inspect_plan_name = plan.plan_name || '';
    inspect_method = plan.inspect_method || '';
    inspector_name = plan.inspector_name || '';
    sampling_method = plan.sampling_method || '';
    if (plan.sampling_ratio != null && parseFloat(plan.sampling_ratio) > 0) {
      sampling_ratio = parseFloat(plan.sampling_ratio);
      // 按比例：抽检数 = 到货数量 * 比例%
      sample_quantity = Math.ceil(received_quantity * sampling_ratio / 100);
    } else if (plan.sampling_quantity && parseFloat(plan.sampling_quantity) > 0) {
      sample_quantity = parseFloat(plan.sampling_quantity);
    }
    if (inspect_method === '全检') {
      sample_quantity = received_quantity || 0;
    }
  }

  // 匹配来料检验规范：按物料编号精确匹配
  const [specRows]: any = await sequelize.query(`
    SELECT TOP 1 spec_name, defect_categories
    FROM incoming_inspect_spec
    WHERE spec_name = :item_number
  `, { replacements: { item_number }, ...(transaction ? { transaction } : {}) });

  let inspect_spec_name = '';
  let defect_categories = '';
  if (specRows.length > 0) {
    inspect_spec_name = specRows[0].spec_name || '';
    defect_categories = specRows[0].defect_categories || '';
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
      sampling_method, sampling_ratio, defect_categories,
      inspector_name, inspect_date,
      inspect_result, inspect_status, enable_quality_chars,
      factory_id, batch_number, creation_date, creation_man
    ) VALUES (
      :inspection_number, :stock_in_number, :purchase_order_number,
      :supplier_number, :supplier_name,
      :item_number, :item_name, :specifications, :basic_unit,
      :received_quantity, :sample_quantity,
      0, 0,
      :inspect_plan_name, :inspect_method, :inspect_spec_name,
      :sampling_method, :sampling_ratio, :defect_categories,
      :inspector_name, GETDATE(),
      '', N'待检验', :enable_quality_chars,
      :factory_id, :batch_number, GETDATE(), :creation_man
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
      sampling_method,
      sampling_ratio,
      defect_categories,
      inspector_name,
      enable_quality_chars,
      batch_number: batch_number || '',
      factory_id: _factoryId,
      creation_man
    },
    ...(transaction ? { transaction } : {})
  });

  // 自动加载质量特性明细行（仅当启用质量特性时）
  if (inspect_spec_name && enable_quality_chars === 'Y') {
    const [specItems]: any = await sequelize.query(`
      SELECT char_name, char_category, data_type,
             upper_limit, standard_value, lower_limit,
             inspect_requirement, sort_order
      FROM incoming_inspect_spec_item
      WHERE spec_name = :spec_name
      ORDER BY sort_order ASC
    `, { replacements: { spec_name: inspect_spec_name }, ...(transaction ? { transaction } : {}) });

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
        },
        ...(transaction ? { transaction } : {})
      });
    }
  }

  return inspection_number;
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

    const creation_man = (req as any).user?.username || '';
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const inspection_number = await createInspectionForStockIn({
      stock_in_number, purchase_order_number,
      supplier_number, supplier_name,
      item_number, item_name, specifications, basic_unit,
      received_quantity, batch_number,
      creation_man
    }, factoryCode, _factoryId);

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
      whereClause += ` AND (qi.inspection_number LIKE :search OR qi.item_number LIKE :search OR qi.item_name LIKE :search OR qi.stock_in_number LIKE :search OR qi.purchase_order_number LIKE :search)`;
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

    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      whereClause += ' AND qi.factory_id = :_factoryId';
      replacements._factoryId = effectiveFactoryId;
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
          qi.sampling_method, qi.sampling_ratio, qi.defect_categories,
          qi.inspector_name, qi.inspect_date,
          qi.inspect_result, qi.inspect_status,
          qi.batch_number, qi.defect_class_name, qi.defect_name, qi.defect_reason_name,
          qi.defect_handling, qi.handling_quantity,
          qi.remark, qi.creation_date, qi.creation_man,
          f.factory_short, f.factory_name,
          ROW_NUMBER() OVER (ORDER BY qi.creation_date DESC) AS _row_num
        FROM purchase_quality_inspection qi
        LEFT JOIN factory f ON qi.factory_id = f.id
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

    // 缺陷明细行
    const [defectRows]: any = await sequelize.query(`
      SELECT * FROM purchase_inspection_defect
      WHERE inspection_number = :inspection_number
      ORDER BY line_number ASC
    `, { replacements: { inspection_number } });

    // 兼容旧数据：若子表无记录但主表有缺陷信息，从主表构建一条缺陷行
    let finalDefectRows = defectRows;
    if (defectRows.length === 0 && headerRows[0]) {
      const h = headerRows[0];
      if (h.defect_class_name || h.defect_name || h.defect_reason_name) {
        finalDefectRows = [{
          id: null,
          inspection_number,
          line_number: 1,
          defect_class_name: h.defect_class_name || '',
          defect_name: h.defect_name || '',
          defect_reason_name: h.defect_reason_name || '',
          unqualified_quantity: h.unqualified_quantity || 0,
          inspect_result: h.inspect_result || '',
          defect_handling: h.defect_handling || '',
          remark: h.remark || ''
        }];
      }
    }

    // 获取缺陷分类/缺陷/缺陷原因 下拉选项
    const [defectClasses]: any = await sequelize.query(`SELECT defect_class_name FROM defect_class ORDER BY defect_class_name`);
    const [defects]: any = await sequelize.query(`SELECT defect_name, defect_class_name FROM defect ORDER BY defect_name`);
    const [defectReasons]: any = await sequelize.query(`SELECT defect_reason_name FROM defect_reason ORDER BY defect_reason_name`);

    // 获取检验方案的检验员列表
    let planInspectors: string[] = [];
    if (headerRows[0].inspect_plan_name) {
      const [planRows]: any = await sequelize.query(
        `SELECT TOP 1 inspector_name FROM incoming_inspect_plan WHERE plan_name = :planName`,
        { replacements: { planName: headerRows[0].inspect_plan_name } }
      );
      if (planRows.length && planRows[0].inspector_name) {
        planInspectors = planRows[0].inspector_name.split(/[,;，；]/).map((s: string) => s.trim()).filter(Boolean);
      }
    }

    res.json(success({
      header: headerRows[0],
      details: detailRows,
      defects: finalDefectRows,
      options: {
        defect_classes: defectClasses.map((d: any) => d.defect_class_name),
        defects: defects,
        defect_reasons: defectReasons.map((d: any) => d.defect_reason_name),
        plan_inspectors: planInspectors
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
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const {
      qualified_quantity,
      unqualified_quantity,
      inspect_result,
      defect_class_name,
      defect_name,
      defect_reason_name,
      inspector_name,
      remark,
      details, // array of { id, actual_value, is_qualified, remark }
      defects  // array of { defect_class_name, defect_name, defect_reason_name, unqualified_quantity, inspect_result }
    } = req.body;

    // 计算主表不合格数量和检验结论（优先从缺陷行汇总）
    let headerUnqualified = unqualified_quantity || 0;
    let headerResult = inspect_result || '';
    let headerDefectClass = defect_class_name || '';
    let headerDefectName = defect_name || '';
    let headerDefectReason = defect_reason_name || '';

    if (defects && Array.isArray(defects) && defects.length > 0) {
      // 从缺陷行汇总不合格数量
      headerUnqualified = defects.reduce((sum: number, d: any) => sum + (parseFloat(d.unqualified_quantity) || 0), 0);
      // 如果任一缺陷行结论为不合格，整体结论为不合格
      if (defects.some((d: any) => d.inspect_result === '不合格')) {
        headerResult = '不合格';
      } else if (defects.every((d: any) => d.inspect_result === '合格')) {
        headerResult = '合格';
      }
      // 回写第一条缺陷信息到主表（兼容旧逻辑）
      headerDefectClass = defects[0].defect_class_name || '';
      headerDefectName = defects[0].defect_name || '';
      headerDefectReason = defects[0].defect_reason_name || '';
    }

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
        inspector_name = :inspector_name,
        remark = :remark
      WHERE inspection_number = :inspection_number${factoryCond}
    `, {
      replacements: {
        inspection_number,
        qualified_quantity: qualified_quantity || 0,
        unqualified_quantity: headerUnqualified,
        inspect_result: headerResult,
        defect_class_name: headerDefectClass,
        defect_name: headerDefectName,
        defect_reason_name: headerDefectReason,
        inspector_name: inspector_name || '',
        remark: remark || '',
        ...factoryReps
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
            WHERE id = :id AND inspection_number = :inspection_number${factoryCond}
          `, {
            replacements: {
              id: d.id,
              inspection_number,
              actual_value: d.actual_value || '',
              is_qualified: d.is_qualified || '',
              remark: d.remark || '',
              ...factoryReps
            }
          });
        }
      }
    }

    // 保存缺陷明细行（先删后插）
    if (defects && Array.isArray(defects)) {
      await sequelize.query(
        `DELETE FROM purchase_inspection_defect WHERE inspection_number = :inspection_number`,
        { replacements: { inspection_number } }
      );
      for (let i = 0; i < defects.length; i++) {
        const d = defects[i];
        if (!d.defect_name && !d.defect_class_name) continue; // 跳过空行
        await sequelize.query(`
          INSERT INTO purchase_inspection_defect
            (inspection_number, line_number, defect_class_name, defect_name, defect_reason_name, unqualified_quantity, inspect_result, remark)
          VALUES (:inspection_number, :line_number, :defect_class_name, :defect_name, :defect_reason_name, :unqualified_quantity, :inspect_result, :remark)
        `, {
          replacements: {
            inspection_number,
            line_number: i + 1,
            defect_class_name: d.defect_class_name || '',
            defect_name: d.defect_name || '',
            defect_reason_name: d.defect_reason_name || '',
            unqualified_quantity: parseFloat(d.unqualified_quantity) || 0,
            inspect_result: d.inspect_result || '',
            remark: d.remark || ''
          }
        });
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
    const { inspect_result, qualified_quantity, unqualified_quantity, inspector_name, defects } = req.body;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    if (!inspect_result) {
      res.status(400).json({ success: false, message: '检验结论不能为空' });
      return;
    }

    // 当启用质量特性时，检查必填特性行是否已填写
    const [headerRow]: any = await sequelize.query(
      `SELECT enable_quality_chars FROM purchase_quality_inspection WHERE inspection_number = :inspection_number`,
      { replacements: { inspection_number } }
    );
    if (headerRow.length > 0 && headerRow[0].enable_quality_chars === 'Y') {
      const [detailRows]: any = await sequelize.query(
        `SELECT id, char_name, actual_value, is_qualified FROM purchase_quality_inspection_detail WHERE inspection_number = :inspection_number`,
        { replacements: { inspection_number } }
      );
      const unfilled = detailRows.filter((d: any) => !d.actual_value || d.actual_value.trim() === '');
      if (unfilled.length > 0) {
        const names = unfilled.map((d: any) => d.char_name).join(', ');
        res.status(400).json({ success: false, message: `以下质量特性未填写实测值: ${names}` });
        return;
      }
    }

    // 更新检验单状态为已完成
    const inspectorUpdateField = inspector_name ? ', inspector_name = :inspector_name' : '';
    await sequelize.query(`
      UPDATE purchase_quality_inspection SET
        inspect_status = N'已完成',
        inspect_result = :inspect_result,
        qualified_quantity = :qualified_quantity,
        unqualified_quantity = :unqualified_quantity${inspectorUpdateField}
      WHERE inspection_number = :inspection_number${factoryCond}
    `, {
      replacements: {
        inspection_number,
        inspect_result,
        qualified_quantity: qualified_quantity || 0,
        unqualified_quantity: unqualified_quantity || 0,
        ...(inspector_name ? { inspector_name } : {}),
        ...factoryReps
      }
    });

    // 保存缺陷明细行（先删后插）
    if (defects && Array.isArray(defects)) {
      await sequelize.query(
        `DELETE FROM purchase_inspection_defect WHERE inspection_number = :inspection_number`,
        { replacements: { inspection_number } }
      );
      for (let i = 0; i < defects.length; i++) {
        const d = defects[i];
        if (!d.defect_name && !d.defect_class_name) continue;
        await sequelize.query(`
          INSERT INTO purchase_inspection_defect
            (inspection_number, line_number, defect_class_name, defect_name, defect_reason_name, unqualified_quantity, inspect_result, remark)
          VALUES (:inspection_number, :line_number, :defect_class_name, :defect_name, :defect_reason_name, :unqualified_quantity, :inspect_result, :remark)
        `, {
          replacements: {
            inspection_number,
            line_number: i + 1,
            defect_class_name: d.defect_class_name || '',
            defect_name: d.defect_name || '',
            defect_reason_name: d.defect_reason_name || '',
            unqualified_quantity: parseFloat(d.unqualified_quantity) || 0,
            inspect_result: d.inspect_result || '',
            remark: d.remark || ''
          }
        });
      }
    }

    // 回写入库单合格/不合格数量 (如果关联了入库单)
    const [inspRows]: any = await sequelize.query(`
      SELECT stock_in_number, item_number, qualified_quantity, unqualified_quantity, batch_number
      FROM purchase_quality_inspection
      WHERE inspection_number = :inspection_number
    `, { replacements: { inspection_number } });

    if (inspRows.length > 0 && inspRows[0].stock_in_number) {
      const insp = inspRows[0];
      const qQty = parseFloat(insp.qualified_quantity) || 0;

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

      console.log(`[转仓] inspect_result=${inspect_result}, qQty=${qQty}, batch_number="${insp.batch_number}"`);
      if ((inspect_result === '合格' || inspect_result === '让步接收') && qQty > 0) {
        const transaction = await sequelize.transaction();
        try {
          const factoryCode = await getFactoryCode(req);
          const _factoryId = getFactoryId(req);
          const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
          const factoryReps = _factoryId !== null ? { _factoryId } : {};
          // 查询待检仓中的批次库存
          const batchNoToSearch = insp.batch_number || '';
          const [batchRows]: any = await sequelize.query(`
            SELECT id, batch_number, warehouse_number, warehouse_name, quantity
            FROM material_batch_inventory
            WHERE item_number = :item_number AND batch_number = :batch_number
              AND quantity > 0 AND status = N'正常'
            ORDER BY inbound_date ASC
          `, {
            replacements: { item_number: insp.item_number, batch_number: batchNoToSearch },
            transaction
          });
          console.log(`[转仓] 找到 ${batchRows.length} 个批次`);

          // 查询目标仓库：使用入库单头中用户指定的目标仓库（而非模糊搜索"原料"）
          const [siHeaderRows]: any = await sequelize.query(
            `SELECT TOP 1 warehouse_number, warehouse_name FROM stock_in WHERE stock_in_number = :siNo`,
            { replacements: { siNo: insp.stock_in_number }, transaction }
          );
          const rawWhNumber = siHeaderRows.length > 0 ? siHeaderRows[0].warehouse_number : '';
          const rawWhName = siHeaderRows.length > 0 ? siHeaderRows[0].warehouse_name : '';
          const [inspWhRows]: any = await sequelize.query(
            `SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE warehouse_name = N'待检仓' OR warehouse_type LIKE N'%待检%'`,
            { transaction }
          );
          const inspWhNumber = inspWhRows.length > 0 ? inspWhRows[0].warehouse_number : '';
          const inspWhName = inspWhRows.length > 0 ? inspWhRows[0].warehouse_name : '待检仓';
          console.log(`[转仓] 目标仓库=${rawWhNumber}/${rawWhName}, 待检仓=${inspWhNumber}/${inspWhName}`);

          if (!rawWhNumber || !inspWhNumber) {
            console.log('未找到原料库或待检仓，跳过仓移');
            await transaction.rollback();
          } else {
            // FIFO 从待检仓出库
            let remaining = qQty;
            for (const b of batchRows) {
              if (remaining <= 0) break;
              const deductQty = Math.min(parseFloat(b.quantity) || 0, remaining);
              remaining -= deductQty;

              await sequelize.query(`
                UPDATE material_batch_inventory SET
                  quantity = quantity - :deductQty,
                  status = CASE WHEN quantity - :deductQty <= 0 THEN N'已用完' ELSE status END,
                  last_updated = GETDATE()
                WHERE id = :batchId
              `, { replacements: { deductQty, batchId: b.id }, transaction });

              // 同步待检仓汇总库存
              await sequelize.query(`
                UPDATE material_inventory SET quantity = quantity - :deductQty, last_updated = GETDATE()
                WHERE item_number = :item_number AND warehouse_number = :whNo
              `, {
                replacements: { deductQty, item_number: insp.item_number, whNo: inspWhNumber },
                transaction
              });

              // 记录待检仓出库流水
              const txnOut = await generateMaterialTxnNumber(factoryCode, transaction);

              const [invOut]: any = await sequelize.query(
                `SELECT quantity FROM material_inventory WHERE item_number = :itemNo AND warehouse_number = :whNo`,
                { replacements: { itemNo: insp.item_number, whNo: inspWhNumber }, transaction }
              );
              const afterOut = invOut.length ? parseFloat(invOut[0].quantity) : 0;
              const beforeOut = afterOut + deductQty;

              await sequelize.query(`
                INSERT INTO material_inventory_transaction (transaction_number, transaction_type, source_type, source_number,
                  item_number, item_name, item_type, specifications, basic_unit,
                  warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
                  batch_number, supplier_number, supplier_name, operator, operation_date, remark, creation_date)
                VALUES (:txnNo, N'出库', N'检验合格转出', :sourceNo,
                  :item_number, :item_name, N'原材料', :specifications, :basic_unit,
                  :warehouse_number, :warehouse_name, :quantity, :beforeQty, :afterQty,
                  :batchNo, '', '', :operator, GETDATE(), :remark, GETDATE())
              `, {
                replacements: {
                  txnNo: txnOut, sourceNo: inspection_number,
                  item_number: insp.item_number, item_name: insp.item_name || '',
                  specifications: insp.specifications || '', basic_unit: insp.basic_unit || '',
                  warehouse_number: inspWhNumber, warehouse_name: inspWhName,
                  quantity: deductQty, beforeQty: beforeOut, afterQty: afterOut,
                  batchNo: b.batch_number, operator: (req as any).user?.username || '',
                  remark: `检验单${inspection_number}合格转入原料库`
                },
                transaction
              });

              // 原料库入库（保持原批次号）
              await sequelize.query(`
                INSERT INTO material_batch_inventory (batch_number, item_number, item_name, item_type, specifications,
                  basic_unit, warehouse_number, warehouse_name, quantity, initial_quantity,
                  supplier_number, supplier_name, production_order_number, inbound_date, status, creation_date, last_updated, factory_id)
                VALUES (:batchNo, :item_number, :item_name, N'原材料', :specifications,
                  :basic_unit, :warehouse_number, :warehouse_name, :quantity, :quantity,
                  '', '', '', GETDATE(), N'正常', GETDATE(), GETDATE(), :factory_id)
              `, {
                replacements: {
                  batchNo: b.batch_number,
                  item_number: insp.item_number,
                  item_name: insp.item_name || '',
                  specifications: insp.specifications || '',
                  basic_unit: insp.basic_unit || '',
                  warehouse_number: rawWhNumber,
                  warehouse_name: rawWhName,
                  quantity: deductQty,
                  factory_id: _factoryId
                },
                transaction
              });

              // 同步原料库汇总库存
              await sequelize.query(`
                MERGE material_inventory AS t
                USING (SELECT :item_number AS item_number, :warehouse_number AS warehouse_number, :item_name AS item_name, N'原材料' AS item_type, :specifications AS specifications, :basic_unit AS basic_unit, :warehouse_name AS warehouse_name, :quantity AS quantity) AS s
                ON (t.item_number = s.item_number AND t.warehouse_number = s.warehouse_number)
                WHEN MATCHED THEN UPDATE SET quantity = t.quantity + s.quantity, last_updated = GETDATE()
                WHEN NOT MATCHED THEN INSERT (item_number, warehouse_number, item_name, item_type, specifications, basic_unit, warehouse_name, quantity, last_updated)
                VALUES (s.item_number, s.warehouse_number, s.item_name, s.item_type, s.specifications, s.basic_unit, s.warehouse_name, s.quantity, GETDATE());
              `, {
                replacements: {
                  item_number: insp.item_number,
                  warehouse_number: rawWhNumber,
                  item_name: insp.item_name || '',
                  specifications: insp.specifications || '',
                  basic_unit: insp.basic_unit || '',
                  warehouse_name: rawWhName,
                  quantity: deductQty
                },
                transaction
              });

              // 记录原料库入库流水
              const txnIn = await generateMaterialTxnNumber(factoryCode, transaction);

              const [invIn]: any = await sequelize.query(
                `SELECT quantity FROM material_inventory WHERE item_number = :itemNo AND warehouse_number = :whNo`,
                { replacements: { itemNo: insp.item_number, whNo: rawWhNumber }, transaction }
              );
              const afterIn = invIn.length ? parseFloat(invIn[0].quantity) : deductQty;
              const beforeIn = afterIn - deductQty;

              await sequelize.query(`
                INSERT INTO material_inventory_transaction (transaction_number, transaction_type, source_type, source_number,
                  item_number, item_name, item_type, specifications, basic_unit,
                  warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
                  batch_number, supplier_number, supplier_name, operator, operation_date, remark, creation_date)
                VALUES (:txnNo, N'入库', N'检验合格入库', :sourceNo,
                  :item_number, :item_name, N'原材料', :specifications, :basic_unit,
                  :warehouse_number, :warehouse_name, :quantity, :beforeQty, :afterQty,
                  :batchNo, '', '', :operator, GETDATE(), :remark, GETDATE())
              `, {
                replacements: {
                  txnNo: txnIn, sourceNo: inspection_number,
                  item_number: insp.item_number, item_name: insp.item_name || '',
                  specifications: insp.specifications || '', basic_unit: insp.basic_unit || '',
                  warehouse_number: rawWhNumber, warehouse_name: rawWhName,
                  quantity: deductQty, beforeQty: beforeIn, afterQty: afterIn,
                  batchNo: b.batch_number, operator: (req as any).user?.username || '',
                  remark: `检验单${inspection_number}合格转入原料库`
                },
                transaction
              });
            }

            // 更新 stock_in_detail: 仓库改为原料库
            await sequelize.query(`
              UPDATE stock_in_detail SET inspect_status = N'已完成'
              WHERE stock_in_number = :stock_in_number AND item_number = :item_number
            `, {
              replacements: { stock_in_number: insp.stock_in_number, item_number: insp.item_number },
              transaction
            });

            await transaction.commit();

            // 检验合格/让步接收 → 回写采购订单 received_quantity
            try {
              const [sidRows]: any = await sequelize.query(`
                SELECT purchase_detail_id, qualified_quantity
                FROM stock_in_detail
                WHERE stock_in_number = :stock_in_number AND item_number = :item_number
              `, { replacements: { stock_in_number: insp.stock_in_number, item_number: insp.item_number } });

              if (sidRows.length > 0 && sidRows[0].purchase_detail_id) {
                const writeQty = parseFloat(insp.qualified_quantity) || 0;
                if (writeQty > 0) {
                  await sequelize.query(`
                    UPDATE purchase_order_detail SET
                      received_quantity = received_quantity + :qty,
                      receive_status = CASE
                        WHEN received_quantity + :qty >= order_quantity THEN N'已到货'
                        ELSE N'部分到货'
                      END
                    WHERE id = :detailId AND factory_id = :_factoryId
                  `, { replacements: { qty: writeQty, detailId: sidRows[0].purchase_detail_id, _factoryId } });

                  const [siHeaderRows]: any = await sequelize.query(`
                    SELECT purchase_order_number FROM stock_in WHERE stock_in_number = :sin
                  `, { replacements: { sin: insp.stock_in_number } });
                  if (siHeaderRows.length > 0) {
                    const pon = siHeaderRows[0].purchase_order_number;
                    if (pon) {
                      const [poDetails]: any = await sequelize.query(
                        `SELECT receive_status FROM purchase_order_detail WHERE purchase_order_number = :pon`,
                        { replacements: { pon } }
                      );
                      const allReceived = poDetails.length > 0 && poDetails.every((r: any) => r.receive_status === '已到货');
                      const anyReceived = poDetails.some((r: any) => r.receive_status !== '未到货');
                      const newStatus = allReceived ? '已完成' : (anyReceived ? '执行中' : '待执行');
                      await sequelize.query(
                        `UPDATE purchase_order SET order_status = :newStatus WHERE purchase_order_number = :pon${factoryCond}`,
                        { replacements: { newStatus, pon, ...factoryReps } }
                      );
                      await checkAndAutoComplete('purchase_order', pon, null as any);
                    }
                  }
                }
              }
            } catch (e) {
              console.log('检验合格回写PO失败:', e);
            }
          }
        } catch (e) {
          await transaction.rollback();
          console.log('待检仓→原料库转移失败:', e);
        }
      } else if (inspect_result === '不合格') {
        // 不合格：更新状态，库存保留在待检仓等待缺陷处理
        try {
          await sequelize.query(`
            UPDATE stock_in_detail SET inspect_status = N'不合格'
            WHERE stock_in_number = :stock_in_number AND item_number = :item_number
          `, {
            replacements: { stock_in_number: insp.stock_in_number, item_number: insp.item_number }
          });
        } catch (e) { /* ignore */ }
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

    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      whereClause += ' AND qi.factory_id = :_factoryId';
      replacements._factoryId = effectiveFactoryId;
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

/**
 * 不合格品处理
 * PUT /api/quality-report/purchase-inspections/:inspection_number/defect-handling
 * 支持: 挑选 / 拒收 / 报废 / 特采 / 退货
 */
/**
 * 撤销不合格品处理
 * PUT /api/quality-report/purchase-inspections/:inspection_number/cancel-defect-handling
 */
export const cancelDefectHandlingPurchaseInspection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { inspection_number } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    // 查询检验单
    const [inspRows]: any = await sequelize.query(
      `SELECT * FROM purchase_quality_inspection WHERE inspection_number = :inspection_number${factoryCond}`,
      { replacements: { inspection_number, ...factoryReps } }
    );

    if (!inspRows.length) {
      res.status(404).json({ success: false, message: '检验单不存在' });
      return;
    }

    const insp = inspRows[0];
    if (!insp.defect_handling) {
      res.status(400).json({ success: false, message: '该检验单未进行过不合格品处理，无需撤销' });
      return;
    }

    // 查找该检验单的所有NC单（按缺陷行拆分后可能有多个）
    const [ncRows]: any = await sequelize.query(
      `SELECT nonconforming_number, handling_status FROM nonconforming_product WHERE source_number = :sourceNumber AND source_type = N'来料检验'`,
      { replacements: { sourceNumber: inspection_number } }
    );

    // 检查是否有已处理完成的NC单
    const completedNC = ncRows.filter((r: any) => r.handling_status === '已完成');
    if (completedNC.length > 0) {
      res.status(400).json({ success: false, message: `关联的不合格品单[${completedNC.map((r: any) => r.nonconforming_number).join(', ')}]已处理完成，请先在不合格品处理页面分别撤回` });
      return;
    }

    const transaction = await sequelize.transaction();
    try {
      // 1. 删除所有关联的待处理NC单
      for (const nc of ncRows) {
        if (nc.handling_status === '待处理' || nc.handling_status === '处理中') {
          await sequelize.query(
            `DELETE FROM nonconforming_product WHERE nonconforming_number = :ncNumber`,
            { replacements: { ncNumber: nc.nonconforming_number }, transaction }
          );
        }
      }

      // 2. 清除检验单的缺陷处理标记和NC单号
      await sequelize.query(
        `UPDATE purchase_quality_inspection SET defect_handling = N'', nonconforming_number = N'' WHERE inspection_number = :inspection_number${factoryCond}`,
        { replacements: { inspection_number, ...factoryReps }, transaction }
      );

      // 3. 清除缺陷明细行的处理方式
      await sequelize.query(
        `UPDATE purchase_inspection_defect SET defect_handling = N'' WHERE inspection_number = :inspection_number${factoryCond}`,
        { replacements: { inspection_number, ...factoryReps }, transaction }
      );

      await transaction.commit();
      res.json(success(null, '不合格品处理已撤销'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

export const defectHandlingPurchaseInspection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const { inspection_number } = req.params;

    // 查询检验单
    const [inspRows]: any = await sequelize.query(`
      SELECT * FROM purchase_quality_inspection
      WHERE inspection_number = :inspection_number${factoryCond}
    `, { replacements: { inspection_number, ...factoryReps } });

    if (!inspRows.length) {
      res.status(404).json({ success: false, message: '检验单不存在' });
      return;
    }

    const insp = inspRows[0];
    if (insp.inspect_status !== '已完成') {
      res.status(400).json({ success: false, message: '检验单尚未完成，无法进行不合格品处理' });
      return;
    }

    if (insp.defect_handling) {
      res.status(400).json({ success: false, message: `该检验单已进行过不合格品处理（${insp.defect_handling}），请先撤销` });
      return;
    }

    const transaction = await sequelize.transaction();
    try {
      // 查询缺陷明细行
      const [defectRows]: any = await sequelize.query(
        `SELECT * FROM purchase_inspection_defect WHERE inspection_number = :inspection_number ORDER BY line_number`,
        { replacements: { inspection_number }, transaction }
      );

      if (!defectRows.length) {
        await transaction.rollback();
        res.status(400).json({ success: false, message: '该检验单无缺陷明细行，无法进行不合格品处理' });
        return;
      }

      // 保存各缺陷行的处理方式（前端传入）
      const { defect_items } = req.body; // array of { id, defect_handling }
      if (defect_items && Array.isArray(defect_items)) {
        for (const item of defect_items) {
          if (item.id && item.defect_handling) {
            await sequelize.query(`
              UPDATE purchase_inspection_defect SET defect_handling = :defect_handling
              WHERE id = :id AND inspection_number = :inspection_number${factoryCond}
            `, {
              replacements: { id: item.id, inspection_number, defect_handling: item.defect_handling, ...factoryReps },
              transaction
            });
          }
        }
      }

      // 按缺陷行拆分创建NC单：仅对 inspect_result='不合格' 的行创建
      const ncNumbers: string[] = [];
      for (const defect of defectRows) {
        if (defect.inspect_result !== '不合格') continue;

        const ncNumber = await createNonconformingFromInspection({
          source_type: '来料检验',
          source_number: String(inspection_number),
          item_number: insp.item_number || '',
          item_name: insp.item_name || '',
          specifications: insp.specifications || '',
          basic_unit: insp.basic_unit || '',
          unqualified_quantity: parseFloat(defect.unqualified_quantity) || 0,
          defect_class_name: defect.defect_class_name || '',
          defect_name: defect.defect_name || '',
          defect_reason_name: defect.defect_reason_name || '',
          supplier_number: insp.supplier_number || '',
          supplier_name: insp.supplier_name || '',
          warehouse_number: insp.warehouse_number || '',
          warehouse_name: insp.warehouse_name || '',
          creation_man: (req as any).user?.username || '',
          inspection_table: 'purchase_quality_inspection',
          defect_line_id: defect.id
        }, factoryCode, _factoryId, transaction);

        // 回写NC单号到缺陷行
        await sequelize.query(
          `UPDATE purchase_inspection_defect SET defect_handling = :ncNumber WHERE id = :defectId`,
          { replacements: { ncNumber, defectId: defect.id }, transaction }
        );

        ncNumbers.push(ncNumber);
      }

      // 标记检验单缺陷处理为“待处理”
      await sequelize.query(
        `UPDATE purchase_quality_inspection SET defect_handling = N'待处理' WHERE inspection_number = :inspection_number${factoryCond}`,
        { replacements: { inspection_number, ...factoryReps }, transaction }
      );

      // 回写 nonconforming_number 到检验单（取第一个NC单号）
      if (ncNumbers.length > 0) {
        await sequelize.query(
          `UPDATE purchase_quality_inspection SET nonconforming_number = :ncNumber WHERE inspection_number = :inspection_number${factoryCond}`,
          { replacements: { ncNumber: ncNumbers[0], inspection_number, ...factoryReps }, transaction }
        );
      }

      await transaction.commit();
      res.json(success({ nonconforming_numbers: ncNumbers }, `已创建 ${ncNumbers.length} 个不合格品待处理单：${ncNumbers.join(', ')}，请在不合格品处理页面分别处理`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};
