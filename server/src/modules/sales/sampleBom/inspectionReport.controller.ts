import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { generateInspectionReportNumber, REPORT_STATUS } from './sampleBom.service';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

const success = (data: any, msg?: string) => ({ success: true, data, message: msg || '' });

// ==================== 检测报告 CRUD ====================

export const getInspectionReports = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';
    const bomNumber = (req.query.sample_bom_number as string) || '';
    const inspResult = (req.query.inspection_result as string) || '';
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const replacements: any = {};
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) { conditions.push(`r.factory_id = :_factoryId`); replacements._factoryId = _factoryId; }
    if (search) { conditions.push(`(r.report_number LIKE :search OR r.sample_bom_number LIKE :search)`); replacements.search = `%${search}%`; }
    if (status) { conditions.push(`r.status = :status`); replacements.status = status; }
    if (bomNumber) { conditions.push(`r.sample_bom_number = :bn`); replacements.bn = bomNumber; }
    if (inspResult) { conditions.push(`r.inspection_result = :inspResult`); replacements.inspResult = inspResult; }
    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM sample_inspection_report r ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offsetEnd = offset + limit;

    const [items]: any = await sequelize.query(
      `SELECT * FROM (SELECT r.*, ROW_NUMBER() OVER (ORDER BY r.created_at DESC) AS _rn FROM sample_inspection_report r ${whereClause}) AS t WHERE t._rn > :offset AND t._rn <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd } }
    );
    const cleanItems = items.map((i: any) => { const { _rn, ...rest } = i; return rest; });
    res.json(success({ items: cleanItems, total, page, limit }));
  } catch (err) { next(err); }
};

export const getInspectionReportDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rn = req.params.reportNumber as string;
    const [headers]: any = await sequelize.query(`SELECT * FROM sample_inspection_report WHERE report_number = :rn`, { replacements: { rn } });
    if (!headers.length) { res.status(404).json({ success: false, message: '检测报告不存在' }); return; }
    const [items]: any = await sequelize.query(
      `SELECT * FROM sample_inspection_report_item WHERE report_number = :rn ORDER BY sort_order`,
      { replacements: { rn } }
    );
    res.json(success({ report: headers[0], items }));
  } catch (err) { next(err); }
};

export const createInspectionReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const username = (req as any).user?.username || '';
    if (!b.sample_bom_number) { res.status(400).json({ success: false, message: '样件BOM编号不能为空' }); return; }
    if (!b.version_number) { res.status(400).json({ success: false, message: '版本号不能为空' }); return; }

    // 检查是否已有报告
    const [exist]: any = await sequelize.query(
      `SELECT report_number FROM sample_inspection_report WHERE sample_bom_number = :bn AND version_number = :ver`,
      { replacements: { bn: b.sample_bom_number, ver: b.version_number } }
    );
    if (exist.length > 0) { res.status(400).json({ success: false, message: '该版本已有检测报告' }); return; }

    const transaction = await sequelize.transaction();
    try {
      const factoryCode = await getFactoryCode(req);
      const _factoryId = getFactoryId(req);
      const reportNumber = await generateInspectionReportNumber(factoryCode, transaction);

      await sequelize.query(`
        INSERT INTO sample_inspection_report (report_number, sample_bom_number, version_number, inspection_date,
          inspector, inspection_result, conclusion, status, factory_id, created_by, created_at, updated_at)
        VALUES (:rn, :bn, :ver, :insp_date, :inspector, N'待定', :conclusion, N'草稿', :factory_id, :created_by, GETDATE(), GETDATE())
      `, {
        replacements: {
          rn: reportNumber, bn: b.sample_bom_number, ver: b.version_number,
          insp_date: b.inspection_date || null, inspector: b.inspector || username,
          conclusion: b.conclusion || '', factory_id: _factoryId, created_by: username,
        },
        transaction
      });

      await transaction.commit();
      res.json(success({ report_number: reportNumber }, '创建检测报告成功'));
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { next(err); }
};

export const updateInspectionReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rn = req.params.reportNumber as string;
    const b = req.body;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(`SELECT status FROM sample_inspection_report WHERE report_number = :rn` + factoryCond, { replacements: { rn, ...factoryReps } });
    if (!chk.length) { res.status(404).json({ success: false, message: '检测报告不存在' }); return; }
    if (chk[0].status === REPORT_STATUS.SUBMITTED) { res.status(400).json({ success: false, message: '已提交的报告不可编辑' }); return; }

    await sequelize.query(`
      UPDATE sample_inspection_report SET inspection_date = :insp_date, inspector = :inspector,
        inspection_result = :result, conclusion = :conclusion, updated_at = GETDATE()
      WHERE report_number = :rn${factoryCond}
    `, {
      replacements: {
        rn, insp_date: b.inspection_date || null, inspector: b.inspector || '',
        result: b.inspection_result || '待定', conclusion: b.conclusion || '',
        ...factoryReps,
      }
    });
    res.json(success(null, '更新检测报告成功'));
  } catch (err) { next(err); }
};

export const submitInspectionReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rn = req.params.reportNumber as string;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(`SELECT status, sample_bom_number, version_number, inspection_result FROM sample_inspection_report WHERE report_number = :rn` + factoryCond, { replacements: { rn, ...factoryReps } });
    if (!chk.length) { res.status(404).json({ success: false, message: '检测报告不存在' }); return; }
    if (chk[0].status !== REPORT_STATUS.DRAFT) { res.status(400).json({ success: false, message: '仅草稿可提交' }); return; }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`UPDATE sample_inspection_report SET status = N'已提交', updated_at = GETDATE() WHERE report_number = :rn${factoryCond}`,
        { replacements: { rn, ...factoryReps }, transaction });

      // 更新版本检测结论
      await sequelize.query(`UPDATE sample_bom_version SET status = N'已检测', inspection_result = :result WHERE sample_bom_number = :bn AND version_number = :ver`,
        { replacements: { bn: chk[0].sample_bom_number, ver: chk[0].version_number, result: chk[0].inspection_result }, transaction });

      await transaction.commit();
      res.json(success(null, '检测报告已提交'));
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { next(err); }
};

export const deleteInspectionReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rn = req.params.reportNumber as string;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(`SELECT status FROM sample_inspection_report WHERE report_number = :rn` + factoryCond, { replacements: { rn, ...factoryReps } });
    if (!chk.length) { res.status(404).json({ success: false, message: '检测报告不存在' }); return; }
    if (chk[0].status !== REPORT_STATUS.DRAFT) { res.status(400).json({ success: false, message: '仅草稿可删除' }); return; }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM sample_inspection_report_item WHERE report_number = :rn`, { replacements: { rn }, transaction });
      await sequelize.query(`DELETE FROM sample_inspection_report WHERE report_number = :rn${factoryCond}`, { replacements: { rn, ...factoryReps }, transaction });
      await transaction.commit();
      res.json(success(null, '删除检测报告成功'));
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { next(err); }
};

export const getReportByBomVersion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bn = req.params.bomNumber as string;
    const ver = parseInt(req.params.ver as string);
    const [headers]: any = await sequelize.query(
      `SELECT * FROM sample_inspection_report WHERE sample_bom_number = :bn AND version_number = :ver`,
      { replacements: { bn, ver } }
    );
    if (!headers.length) { res.json(success(null)); return; }
    const [items]: any = await sequelize.query(
      `SELECT * FROM sample_inspection_report_item WHERE report_number = :rn ORDER BY sort_order`,
      { replacements: { rn: headers[0].report_number } }
    );
    res.json(success({ report: headers[0], items }));
  } catch (err) { next(err); }
};

// ==================== 检测报告明细 ====================

export const addReportItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rn = req.params.reportNumber as string;
    const b = req.body;
    const [chk]: any = await sequelize.query(`SELECT status FROM sample_inspection_report WHERE report_number = :rn`, { replacements: { rn } });
    if (!chk.length) { res.status(404).json({ success: false, message: '检测报告不存在' }); return; }
    if (chk[0].status === REPORT_STATUS.SUBMITTED) { res.status(400).json({ success: false, message: '已提交的报告不可编辑' }); return; }

    const [maxResult]: any = await sequelize.query(
      `SELECT ISNULL(MAX(sort_order), 0) as max_sort FROM sample_inspection_report_item WHERE report_number = :rn`,
      { replacements: { rn } }
    );
    const sortOrder = maxResult[0].max_sort + 1;

    const [result]: any = await sequelize.query(`
      INSERT INTO sample_inspection_report_item (report_number, char_name, inspect_requirement, data_type,
        upper_limit, standard_value, lower_limit, measured_value, is_qualified, sort_order, remark)
      OUTPUT INSERTED.id
      VALUES (:rn, :char_name, :inspect_req, :data_type, :upper, :std_val, :lower, :measured, :qualified, :sort, :remark)
    `, {
      replacements: {
        rn, char_name: b.char_name || '', inspect_req: b.inspect_requirement || '',
        data_type: b.data_type || '数值', upper: b.upper_limit || null,
        std_val: b.standard_value || null, lower: b.lower_limit || null,
        measured: b.measured_value || null, qualified: b.is_qualified || null,
        sort: sortOrder, remark: b.remark || '',
      }
    });
    res.json(success({ id: result[0].id, sort_order: sortOrder }, '添加检测项成功'));
  } catch (err) { next(err); }
};

export const updateReportItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const itemId = parseInt(req.params.id as string);
    const b = req.body;
    await sequelize.query(`
      UPDATE sample_inspection_report_item SET char_name = :char_name, inspect_requirement = :inspect_req,
        data_type = :data_type, upper_limit = :upper, standard_value = :std_val, lower_limit = :lower,
        measured_value = :measured, is_qualified = :qualified, remark = :remark
      WHERE id = :id
    `, {
      replacements: {
        id: itemId, char_name: b.char_name || '', inspect_req: b.inspect_requirement || '',
        data_type: b.data_type || '数值', upper: b.upper_limit || null,
        std_val: b.standard_value || null, lower: b.lower_limit || null,
        measured: b.measured_value || null, qualified: b.is_qualified || null,
        remark: b.remark || '',
      }
    });
    res.json(success(null, '更新检测项成功'));
  } catch (err) { next(err); }
};

export const deleteReportItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const itemId = parseInt(req.params.id as string);
    await sequelize.query(`DELETE FROM sample_inspection_report_item WHERE id = :id`, { replacements: { id: itemId } });
    res.json(success(null, '删除检测项成功'));
  } catch (err) { next(err); }
};

export const batchImportReportItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rn = req.params.reportNumber as string;
    const [chk]: any = await sequelize.query(`SELECT status FROM sample_inspection_report WHERE report_number = :rn`, { replacements: { rn } });
    if (!chk.length) { res.status(404).json({ success: false, message: '检测报告不存在' }); return; }
    if (chk[0].status === REPORT_STATUS.SUBMITTED) { res.status(400).json({ success: false, message: '已提交的报告不可编辑' }); return; }

    // 从质量特性库获取数据
    const [chars]: any = await sequelize.query(`SELECT * FROM quality_characteristic ORDER BY char_name`);
    if (!chars.length) { res.status(400).json({ success: false, message: '质量特性库为空' }); return; }

    const [maxResult]: any = await sequelize.query(
      `SELECT ISNULL(MAX(sort_order), 0) as max_sort FROM sample_inspection_report_item WHERE report_number = :rn`,
      { replacements: { rn } }
    );
    let sortOrder = maxResult[0].max_sort;

    for (const c of chars) {
      sortOrder++;
      await sequelize.query(`
        INSERT INTO sample_inspection_report_item (report_number, char_name, inspect_requirement, data_type,
          upper_limit, standard_value, lower_limit, measured_value, is_qualified, sort_order, remark)
        VALUES (:rn, :char_name, :inspect_req, :data_type, :upper, :std_val, :lower, NULL, NULL, :sort, '')
      `, {
        replacements: {
          rn, char_name: c.char_name, inspect_req: c.inspect_requirement || '',
          data_type: c.data_type || '数值', upper: c.upper_limit || null,
          std_val: c.standard_value || null, lower: c.lower_limit || null,
          sort: sortOrder,
        }
      });
    }
    res.json(success({ count: chars.length }, '批量导入检测项成功'));
  } catch (err) { next(err); }
};
