import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { createNonconformingFromInspection } from '../nonconformingProduct/nonconformingProduct.controller';
import dayjs from 'dayjs';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 编号生成 ====================
const generateInspectionNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `QI-${today}-`;
  const txOpt = transaction ? { transaction } : {};
  const [rows]: any = await sequelize.query(
    `SELECT MAX(inspection_number) as max_num FROM production_inspection WHERE inspection_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' }, ...txOpt }
  );
  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 分页列表 ====================
export const getProductionInspections = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const inspect_type = (req.query.inspect_type as string) || '';
    const inspection_result = (req.query.inspection_result as string) || '';
    const status = (req.query.status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      conditions.push(`factory_id = :_factoryId`);
      replacements._factoryId = _factoryId;
    }
    if (search) {
      conditions.push(`(inspection_number LIKE :search OR production_order_number LIKE :search OR process_task_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (inspect_type) { conditions.push(`inspect_type = :inspect_type`); replacements.inspect_type = inspect_type; }
    if (inspection_result) { conditions.push(`inspection_result = :inspection_result`); replacements.inspection_result = inspection_result; }
    if (status) { conditions.push(`status = :status`); replacements.status = status; }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM production_inspection ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC, inspection_number DESC) AS _row_num
        FROM production_inspection ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取生产检验列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情（含明细项） ====================
export const getProductionInspectionDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const [records]: any = await sequelize.query(`SELECT * FROM production_inspection WHERE inspection_number = :id${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`, { replacements: { id, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) } });
    if (!records.length) { res.status(404).json({ success: false, message: '检验记录不存在' }); return; }
    const [items]: any = await sequelize.query(`SELECT * FROM production_inspection_item WHERE inspection_number = :id ORDER BY sort_order`, { replacements: { id } });

    // 获取缺陷明细行（不启用质量特性时使用）
    const [defects]: any = await sequelize.query(`SELECT * FROM production_inspection_defect WHERE inspection_number = :id ORDER BY line_number`, { replacements: { id } });

    // 获取缺陷分类/缺陷/缺陷原因 下拉选项
    const [defectClasses]: any = await sequelize.query(`SELECT defect_class_name FROM defect_class ORDER BY defect_class_name`);
    const [defectsList]: any = await sequelize.query(`SELECT defect_name, defect_class_name FROM defect ORDER BY defect_name`);
    const [defectReasons]: any = await sequelize.query(`SELECT defect_reason_name FROM defect_reason ORDER BY defect_reason_name`);

    res.json(success({
      ...records[0], items, defects,
      options: {
        defect_classes: defectClasses.map((d: any) => d.defect_class_name),
        defects: defectsList,
        defect_reasons: defectReasons.map((d: any) => d.defect_reason_name)
      }
    }, '获取检验详情成功'));
  } catch (err) { next(err); }
};

// ==================== 按生产单查询 ====================
export const getInspectionsByOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderNo } = req.params;
    const _factoryId = getFactoryId(req);
    const [items]: any = await sequelize.query(
      `SELECT * FROM production_inspection WHERE production_order_number = :orderNo${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''} ORDER BY step_number, inspect_type`,
      { replacements: { orderNo, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) } }
    );
    res.json(success(items, '获取生产单检验记录成功'));
  } catch (err) { next(err); }
};

// ==================== 更新检验结果 ====================
export const updateProductionInspection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    // 检查状态
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(`SELECT status FROM production_inspection WHERE inspection_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    if (!chk.length) { res.status(404).json({ success: false, message: '检验记录不存在' }); return; }
    if (chk[0].status === '已完成') { res.status(403).json({ success: false, message: '已完成的检验记录不允许修改' }); return; }

    const transaction = await sequelize.transaction();
    try {
      // 更新主表
      await sequelize.query(`
        UPDATE production_inspection SET
          qualified_quantity = :qualified_quantity,
          unqualified_quantity = :unqualified_quantity,
          inspector_number = :inspector_number,
          inspector_name = :inspector_name,
          inspection_date = :inspection_date,
          status = N'检验中',
          remark = :remark
        WHERE inspection_number = :id${factoryCond}
      `, {
        replacements: {
          id,
          qualified_quantity: b.qualified_quantity != null ? Number(b.qualified_quantity) : 0,
          unqualified_quantity: b.unqualified_quantity != null ? Number(b.unqualified_quantity) : 0,
          inspector_number: b.inspector_number || '',
          inspector_name: b.inspector_name || '',
          inspection_date: b.inspection_date || dayjs().format('YYYY/MM/DD HH:mm'),
          remark: b.remark || '',
          ...factoryReps
        },
        transaction
      });

      // 更新明细项
      if (Array.isArray(b.items)) {
        for (const item of b.items) {
          if (!item.id) continue;
          await sequelize.query(`
            UPDATE production_inspection_item SET
              actual_value = :actual_value,
              item_result = :item_result,
              remark = :remark
            WHERE id = :id
          `, {
            replacements: {
              id: item.id,
              actual_value: item.actual_value || '',
              item_result: item.item_result || '',
              remark: item.remark || ''
            },
            transaction
          });
        }
      }

      // 保存缺陷明细行（不启用质量特性时使用）
      if (Array.isArray(b.defects)) {
        await sequelize.query(
          `DELETE FROM production_inspection_defect WHERE inspection_number = :id`,
          { replacements: { id }, transaction }
        );
        for (let i = 0; i < b.defects.length; i++) {
          const d = b.defects[i];
          if (!d.defect_name && !d.defect_class_name) continue;
          await sequelize.query(`
            INSERT INTO production_inspection_defect
              (inspection_number, line_number, defect_class_name, defect_name, defect_reason_name, unqualified_quantity, inspect_result, remark)
            VALUES (:inspection_number, :line_number, :defect_class_name, :defect_name, :defect_reason_name, :unqualified_quantity, :inspect_result, :remark)
          `, {
            replacements: {
              inspection_number: id,
              line_number: i + 1,
              defect_class_name: d.defect_class_name || '',
              defect_name: d.defect_name || '',
              defect_reason_name: d.defect_reason_name || '',
              unqualified_quantity: d.unqualified_quantity || 0,
              inspect_result: d.inspect_result || '',
              remark: d.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success(null, '更新检验记录成功'));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 完成检验 ====================
export const completeInspection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [records]: any = await sequelize.query(`SELECT * FROM production_inspection WHERE inspection_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    if (!records.length) { res.status(404).json({ success: false, message: '检验记录不存在' }); return; }
    const record = records[0];
    if (record.status === '已完成') { res.status(403).json({ success: false, message: '该检验记录已完成' }); return; }

    // 使用请求中的合格/不合格数量，或回退到记录中的值
    const qualifiedQty = b.qualified_quantity != null ? Number(b.qualified_quantity) : (parseFloat(record.qualified_quantity) || 0);
    const unqualifiedQty = b.unqualified_quantity != null ? Number(b.unqualified_quantity) : (parseFloat(record.unqualified_quantity) || 0);

    // 判定结果：如果不合格数量 > 0 则为不合格，否则合格
    const result = unqualifiedQty > 0 ? '不合格' : '合格';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE production_inspection SET
          inspection_result = :result,
          qualified_quantity = :qualified_quantity,
          unqualified_quantity = :unqualified_quantity,
          status = N'已完成',
          inspection_date = :inspection_date
        WHERE inspection_number = :id${factoryCond}
      `, {
        replacements: {
          id,
          result,
          qualified_quantity: qualifiedQty,
          unqualified_quantity: unqualifiedQty,
          inspection_date: dayjs().format('YYYY/MM/DD HH:mm'),
          ...factoryReps
        },
        transaction
      });

      // 保存缺陷明细行（先删后插）
      if (Array.isArray(b.defects)) {
        await sequelize.query(
          `DELETE FROM production_inspection_defect WHERE inspection_number = :id`,
          { replacements: { id }, transaction }
        );
        for (let i = 0; i < b.defects.length; i++) {
          const d = b.defects[i];
          if (!d.defect_name && !d.defect_class_name) continue;
          await sequelize.query(`
            INSERT INTO production_inspection_defect
              (inspection_number, line_number, defect_class_name, defect_name, defect_reason_name, unqualified_quantity, inspect_result, remark)
            VALUES (:inspection_number, :line_number, :defect_class_name, :defect_name, :defect_reason_name, :unqualified_quantity, :inspect_result, :remark)
          `, {
            replacements: {
              inspection_number: id,
              line_number: i + 1,
              defect_class_name: d.defect_class_name || '',
              defect_name: d.defect_name || '',
              defect_reason_name: d.defect_reason_name || '',
              unqualified_quantity: d.unqualified_quantity || 0,
              inspect_result: d.inspect_result || '',
              remark: d.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();

      // 回写工序任务检验状态
      const inspectStatus = result === '合格' ? '检验合格' : '检验不合格';
      await sequelize.query(
        `UPDATE process_task SET inspect_status = :inspectStatus WHERE process_task_number = :taskNo`,
        { replacements: { inspectStatus, taskNo: record.process_task_number } }
      );

      res.json(success({ inspection_result: result }, `检验完成，判定结果：${result}`));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 不合格品处理 ====================
export const defectHandling = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const { id } = req.params;
    const inspectionNumber = String(id);
    const _factoryId = getFactoryId(req);

    const [records]: any = await sequelize.query(`SELECT * FROM production_inspection WHERE inspection_number = :id${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`, { replacements: { id, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) } });
    if (!records.length) { res.status(404).json({ success: false, message: '检验记录不存在' }); return; }
    const record = records[0];
    if (record.inspection_result !== '不合格') { res.status(400).json({ success: false, message: '仅不合格的检验记录可进行不合格品处理' }); return; }
    if (record.defect_handling) { res.status(400).json({ success: false, message: `该检验记录已进行过不合格品处理（${record.defect_handling}），不可重复操作` }); return; }

    const unqualifiedQty = parseFloat(record.unqualified_quantity) || 0;
    const transaction = await sequelize.transaction();

    try {
      // 仅创建NC待处理单，不再同步执行处理动作
      // 处理方式由人工在"不合格品处理"页面选择
      const ncNumber = await createNonconformingFromInspection({
        source_type: '生产检验',
        source_number: inspectionNumber,
        item_number: record.item_number || '',
        item_name: record.item_name || '',
        specifications: record.specifications || '',
        unqualified_quantity: unqualifiedQty,
        production_order_number: record.production_order_number || '',
        step_number: record.step_number || 0,
        creation_man: (req as any).user?.username || '',
        inspection_table: 'production_inspection'
      }, factoryCode, _factoryId, transaction);

      // 标记检验单缺陷处理为"待处理"
      await sequelize.query(`
        UPDATE production_inspection SET defect_handling = N'待处理' WHERE inspection_number = :id
      `, { replacements: { id }, transaction });

      await transaction.commit();
      res.json(success({ nonconforming_number: ncNumber }, `不合格品待处理单已创建：${ncNumber}，请在不合格品处理页面选择处理方式`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['inspection_number', 'work_report_number', 'process_task_number', 'production_order_number', 'step_number', 'standard_process_name', 'item_number', 'item_name', 'inspect_type', 'inspection_plan_name', 'inspection_spec_name', 'total_quantity', 'qualified_quantity', 'unqualified_quantity', 'inspection_result', 'inspector_name', 'inspection_date', 'defect_handling', 'status', 'remark'];
const exportHeaders = ['检验单号', '报工单号', '工序任务号', '生产单号', '工序序号', '工序名称', '产品编号', '产品名称', '检验类型', '检验方案', '检验规范', '送检数量', '合格数量', '不合格数量', '检验结果', '检验员', '检验日期', '不合格处理', '状态', '备注'];

export const exportProductionInspections = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const factoryWhere = _factoryId !== null ? 'WHERE factory_id = :_factoryId' : '';
    const factoryReps: any = _factoryId !== null ? { _factoryId } : {};
    const [items]: any = await sequelize.query(`SELECT * FROM production_inspection ${factoryWhere} ORDER BY creation_date DESC`, { replacements: factoryReps });
    exportToExcel(items, exportFields, exportHeaders, 'production_inspections', res);
  } catch (err) { next(err); }
};

// ==================== 删除检验记录 ====================
export const deleteProductionInspection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const { id } = req.params;
    const inspectionNumber = String(id);
    const _factoryId = getFactoryId(req);

    const [records]: any = await sequelize.query(
      `SELECT * FROM production_inspection WHERE inspection_number = :id${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`,
      { replacements: { id: inspectionNumber, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) } }
    );
    if (!records.length) {
      res.status(404).json({ success: false, message: '检验记录不存在' });
      return;
    }
    const record = records[0];

    // 仅允许删除 待检/检验中 状态的记录；已完成 或 已处理 的不允许删除
    if (record.status === '已完成') {
      res.status(403).json({ success: false, message: '已完成的检验记录不允许删除。如需撤销，请使用连续报工页面的「撤销重报」功能。' });
      return;
    }

    // === 门控：只允许删除当前生产单最后工序的检验记录 ===
    const pon = record.production_order_number;
    const currentStep = record.step_number;
    if (pon) {
      // 查询同生产单中工序号更高的检验记录
      const [laterInspections]: any = await sequelize.query(
        `SELECT TOP 1 pi.inspection_number, pi.step_number, pi.standard_process_name FROM production_inspection pi WHERE pi.production_order_number = :pon AND pi.step_number > :currentStep`,
        { replacements: { pon, currentStep } }
      );
      if (laterInspections.length > 0) {
        const later = laterInspections[0];
        res.status(403).json({ success: false, message: `该生产单存在更高工序(${later.step_number} - ${later.standard_process_name || ''})的检验记录，只能从后道工序依次向前删除。请先删除工序 ${later.step_number} 的检验记录。` });
        return;
      }

      // 查询同工序中是否有创建时间更晚的检验记录
      const [laterSameStep]: any = await sequelize.query(
        `SELECT TOP 1 pi.inspection_number FROM production_inspection pi WHERE pi.production_order_number = :pon AND pi.step_number = :currentStep AND pi.creation_date > (SELECT creation_date FROM production_inspection WHERE inspection_number = :id)`,
        { replacements: { pon, currentStep, id: inspectionNumber } }
      );
      if (laterSameStep.length > 0) {
        res.status(403).json({ success: false, message: `该工序存在更晚的检验记录，只能删除最后一条检验记录。` });
        return;
      }
    }

    const transaction = await sequelize.transaction();
    try {
      // 删除检验明细项
      await sequelize.query(
        `DELETE FROM production_inspection_item WHERE inspection_number = :id`,
        { replacements: { id: inspectionNumber }, transaction }
      );

      // 删除缺陷明细
      await sequelize.query(
        `DELETE FROM production_inspection_defect WHERE inspection_number = :id`,
        { replacements: { id: inspectionNumber }, transaction }
      );

      // 删除检验主记录
      await sequelize.query(
        `DELETE FROM production_inspection WHERE inspection_number = :id${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`,
        { replacements: { id: inspectionNumber, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) }, transaction }
      );

      // 清除关联工序任务的 inspect_status
      if (record.process_task_number) {
        await sequelize.query(
          `UPDATE process_task SET inspect_status = NULL WHERE process_task_number = :taskNo`,
          { replacements: { taskNo: record.process_task_number }, transaction }
        );
      }

      await transaction.commit();
      res.json(success(null, `检验记录「${inspectionNumber}」已删除`));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 创建检验记录（供报工服务调用） ====================
export const createInspectionFromWorkReport = async (params: {
  work_report_number: string;
  process_task_number: string;
  production_order_number: string;
  step_number: number;
  standard_process_name: string;
  item_number: string;
  item_name: string;
  specifications: string;
  inspect_type: string;
  inspection_plan_name: string;
  inspection_spec_name: string;
  total_quantity: number;
  creation_man: string;
}, factoryCode: string = '', _factoryId: number | null = null, transaction?: any): Promise<string> => {
  const txOpt = transaction ? { transaction } : {};
  const inspectionNumber = await generateInspectionNumber(factoryCode, transaction);
  const now = dayjs().format('YYYY/MM/DD HH:mm');

  // 查询物料主数据的 enable_prod_quality_chars
  const [itemRows]: any = await sequelize.query(
    `SELECT TOP 1 enable_prod_quality_chars FROM item_master WHERE item_number = :item_number`,
    { replacements: { item_number: params.item_number }, ...txOpt }
  );
  const itemEnableChars = (itemRows.length > 0 && itemRows[0].enable_prod_quality_chars === 'Y') ? 'Y' : '';

  // 查询检验方案的 enable_quality_chars
  let planEnableChars = '';
  if (params.inspection_plan_name) {
    const [planRows]: any = await sequelize.query(
      `SELECT TOP 1 enable_quality_chars FROM inspection_plan WHERE plan_name = :plan_name`,
      { replacements: { plan_name: params.inspection_plan_name }, ...txOpt }
    );
    if (planRows.length > 0 && planRows[0].enable_quality_chars === 'Y') {
      planEnableChars = 'Y';
    }
  }

  // 查询检验规范的 enable_quality_chars 和 defect_categories
  let specEnableChars = '';
  let defect_categories = '';
  if (params.inspection_spec_name) {
    const [specRows]: any = await sequelize.query(
      `SELECT TOP 1 enable_quality_chars, defect_categories FROM inspection_spec WHERE spec_name = :spec_name`,
      { replacements: { spec_name: params.inspection_spec_name }, ...txOpt }
    );
    if (specRows.length > 0 && specRows[0].enable_quality_chars === 'Y') {
      specEnableChars = 'Y';
    }
    if (specRows.length > 0) {
      defect_categories = specRows[0].defect_categories || '';
    }
  }

  // 优先级：物料主数据 > 检验方案 > 检验规范
  const enable_quality_chars = itemEnableChars || planEnableChars || specEnableChars || 'N';

  await sequelize.query(`
    INSERT INTO production_inspection (inspection_number, work_report_number, process_task_number, production_order_number, step_number, standard_process_name, item_number, item_name, specifications, inspect_type, inspection_plan_name, inspection_spec_name, total_quantity, qualified_quantity, unqualified_quantity, inspection_result, status, creation_date, creation_man, enable_quality_chars, defect_categories, factory_id)
    VALUES (:inspection_number, :work_report_number, :process_task_number, :production_order_number, :step_number, :standard_process_name, :item_number, :item_name, :specifications, :inspect_type, :inspection_plan_name, :inspection_spec_name, :total_quantity, 0, 0, N'待检', N'待检', :creation_date, :creation_man, :enable_quality_chars, :defect_categories, :factory_id)
  `, {
    replacements: {
      inspection_number: inspectionNumber,
      work_report_number: params.work_report_number,
      process_task_number: params.process_task_number,
      production_order_number: params.production_order_number,
      step_number: params.step_number,
      standard_process_name: params.standard_process_name,
      item_number: params.item_number,
      item_name: params.item_name,
      specifications: params.specifications,
      inspect_type: params.inspect_type,
      inspection_plan_name: params.inspection_plan_name,
      inspection_spec_name: params.inspection_spec_name,
      total_quantity: params.total_quantity,
      creation_date: now,
      creation_man: params.creation_man,
      enable_quality_chars,
      defect_categories,
      factory_id: _factoryId
    },
    ...txOpt
  });

  // 仅在启用质量特性时，根据检验规范复制明细项
  if (enable_quality_chars === 'Y' && params.inspection_spec_name) {
    const [specItems]: any = await sequelize.query(
      `SELECT char_name, inspect_requirement, data_type, upper_limit, standard_value, lower_limit, sort_order FROM inspection_spec_item WHERE spec_name = :specName ORDER BY sort_order`,
      { replacements: { specName: params.inspection_spec_name }, ...txOpt }
    );
    for (const si of specItems) {
      await sequelize.query(`
        INSERT INTO production_inspection_item (inspection_number, char_name, inspect_requirement, data_type, upper_limit, standard_value, lower_limit, sort_order)
        VALUES (:inspection_number, :char_name, :inspect_requirement, :data_type, :upper_limit, :standard_value, :lower_limit, :sort_order)
      `, {
        replacements: {
          inspection_number: inspectionNumber,
          char_name: si.char_name || '',
          inspect_requirement: si.inspect_requirement || '',
          data_type: si.data_type || '',
          upper_limit: si.upper_limit,
          standard_value: si.standard_value,
          lower_limit: si.lower_limit,
          sort_order: si.sort_order || 0
        },
        ...txOpt
      });
    }
  }

  return inspectionNumber;
};
