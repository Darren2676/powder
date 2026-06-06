import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { generateSampleBomNumber, BOM_STATUS, VERSION_STATUS } from './sampleBom.service';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

const success = (data: any, msg?: string) => ({ success: true, data, message: msg || '' });

// ==================== 样件BOM 主表 ====================

export const getSampleBoms = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';
    const requestNumber = (req.query.sample_request_number as string) || '';
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const replacements: any = {};
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) { conditions.push(`h.factory_id = :_factoryId`); replacements._factoryId = _factoryId; }
    if (search) { conditions.push(`(h.sample_bom_number LIKE :search OR h.bom_name LIKE :search OR h.item_number LIKE :search OR h.item_name LIKE :search)`); replacements.search = `%${search}%`; }
    if (status) { conditions.push(`h.status = :status`); replacements.status = status; }
    if (requestNumber) { conditions.push(`h.sample_request_number = :rn`); replacements.rn = requestNumber; }
    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM sample_bom_header h ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offsetEnd = offset + limit;

    const [items]: any = await sequelize.query(
      `SELECT * FROM (SELECT h.*, ROW_NUMBER() OVER (ORDER BY h.created_at DESC) AS _rn FROM sample_bom_header h ${whereClause}) AS t WHERE t._rn > :offset AND t._rn <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd } }
    );
    const cleanItems = items.map((i: any) => { const { _rn, ...rest } = i; return rest; });
    res.json(success({ items: cleanItems, total, page, limit }));
  } catch (err) { next(err); }
};

export const getSampleBomDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const [headers]: any = await sequelize.query(`SELECT * FROM sample_bom_header WHERE id = :id`, { replacements: { id } });
    if (!headers.length) { res.status(404).json({ success: false, message: '样件BOM不存在' }); return; }
    const [versions]: any = await sequelize.query(
      `SELECT * FROM sample_bom_version WHERE sample_bom_number = :bn ORDER BY version_number`,
      { replacements: { bn: headers[0].sample_bom_number } }
    );
    res.json(success({ header: headers[0], versions }));
  } catch (err) { next(err); }
};

export const createSampleBom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const username = (req as any).user?.username || '';

    // 校验样品申请状态
    if (!b.sample_request_number) { res.status(400).json({ success: false, message: '样品申请编号不能为空' }); return; }
    const [sr]: any = await sequelize.query(
      `SELECT approval_status FROM sample_request WHERE request_number = :rn`,
      { replacements: { rn: b.sample_request_number } }
    );
    if (!sr.length) { res.status(400).json({ success: false, message: '样品申请不存在' }); return; }
    if (sr[0].approval_status !== '已审核') { res.status(400).json({ success: false, message: '样品申请必须已审核才能创建样件BOM' }); return; }

    const transaction = await sequelize.transaction();
    try {
      const factoryCode = await getFactoryCode(req);
      const _factoryId = getFactoryId(req);
      const sampleBomNumber = await generateSampleBomNumber(factoryCode, transaction);

      await sequelize.query(`
        INSERT INTO sample_bom_header (sample_bom_number, sample_request_number, bom_name, item_number, item_name,
          base_quantity, base_unit, status, factory_id, remark, created_by, created_at, updated_at)
        VALUES (:sample_bom_number, :sample_request_number, :bom_name, :item_number, :item_name,
          :base_quantity, :base_unit, N'试制中', :factory_id, :remark, :created_by, GETDATE(), GETDATE())
      `, {
        replacements: {
          sample_bom_number: sampleBomNumber, sample_request_number: b.sample_request_number,
          bom_name: b.bom_name || '', item_number: b.item_number || '', item_name: b.item_name || '',
          base_quantity: b.base_quantity || 1, base_unit: b.base_unit || '',
          factory_id: _factoryId,
          remark: b.remark || '', created_by: username,
        },
        transaction
      });

      await transaction.commit();
      res.json(success({ sample_bom_number: sampleBomNumber }, '创建样件BOM成功'));
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { next(err); }
};

export const updateSampleBom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const b = req.body;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(`SELECT status FROM sample_bom_header WHERE id = :id` + factoryCond, { replacements: { id, ...factoryReps } });
    if (!chk.length) { res.status(404).json({ success: false, message: '样件BOM不存在' }); return; }
    if (chk[0].status === BOM_STATUS.IMPORTED) { res.status(400).json({ success: false, message: '已导入的样件BOM不可编辑' }); return; }

    await sequelize.query(`
      UPDATE sample_bom_header SET bom_name = :bom_name, item_number = :item_number, item_name = :item_name,
        base_quantity = :base_quantity, base_unit = :base_unit, remark = :remark, updated_at = GETDATE()
      WHERE id = :id
    `, {
      replacements: {
        id, bom_name: b.bom_name || '', item_number: b.item_number || '', item_name: b.item_name || '',
        base_quantity: b.base_quantity || 1, base_unit: b.base_unit || '', remark: b.remark || '',
      }
    });
    res.json(success(null, '更新成功'));
  } catch (err) { next(err); }
};

export const deleteSampleBom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(`SELECT sample_bom_number, status FROM sample_bom_header WHERE id = :id` + factoryCond, { replacements: { id, ...factoryReps } });
    if (!chk.length) { res.status(404).json({ success: false, message: '样件BOM不存在' }); return; }
    if (chk[0].status !== BOM_STATUS.TRIAL) { res.status(400).json({ success: false, message: '仅试制中状态可删除' }); return; }

    const bn = chk[0].sample_bom_number;
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM sample_inspection_report_item WHERE report_number IN (SELECT report_number FROM sample_inspection_report WHERE sample_bom_number = :bn)`, { replacements: { bn }, transaction });
      await sequelize.query(`DELETE FROM sample_inspection_report WHERE sample_bom_number = :bn`, { replacements: { bn }, transaction });
      await sequelize.query(`DELETE FROM sample_bom_version_detail WHERE sample_bom_number = :bn`, { replacements: { bn }, transaction });
      await sequelize.query(`DELETE FROM sample_bom_version WHERE sample_bom_number = :bn`, { replacements: { bn }, transaction });
      await sequelize.query(`DELETE FROM sample_bom_header WHERE id = :id` + factoryCond, { replacements: { id, ...factoryReps }, transaction });
      await transaction.commit();
      res.json(success(null, '删除成功'));
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { next(err); }
};

export const getSampleBomsByRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rn = req.params.requestNumber;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [items]: any = await sequelize.query(
      `SELECT * FROM sample_bom_header WHERE sample_request_number = :rn` + factoryCond + ` ORDER BY created_at DESC`,
      { replacements: { rn, ...factoryReps } }
    );
    res.json(success(items));
  } catch (err) { next(err); }
};

// ==================== 样件BOM 版本 ====================

export const getVersions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bn = req.params.bomNumber;
    const [items]: any = await sequelize.query(
      `SELECT * FROM sample_bom_version WHERE sample_bom_number = :bn ORDER BY version_number`,
      { replacements: { bn } }
    );
    res.json(success(items));
  } catch (err) { next(err); }
};

export const getVersionDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bn = req.params.bomNumber as string;
    const ver = parseInt(req.params.ver as string);
    const [verRow]: any = await sequelize.query(
      `SELECT * FROM sample_bom_version WHERE sample_bom_number = :bn AND version_number = :ver`,
      { replacements: { bn, ver } }
    );
    if (!verRow.length) { res.status(404).json({ success: false, message: '版本不存在' }); return; }
    const [details]: any = await sequelize.query(
      `SELECT * FROM sample_bom_version_detail WHERE sample_bom_number = :bn AND version_number = :ver ORDER BY line_number`,
      { replacements: { bn, ver } }
    );
    res.json(success({ version: verRow[0], details }));
  } catch (err) { next(err); }
};

export const createVersion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bn = req.params.bomNumber;
    const b = req.body;
    const username = (req as any).user?.username || '';
    const _factoryId = getFactoryId(req);
    const _factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const _factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [hdr]: any = await sequelize.query(`SELECT current_version, status FROM sample_bom_header WHERE sample_bom_number = :bn` + _factoryCond, { replacements: { bn, ..._factoryReps } });
    if (!hdr.length) { res.status(404).json({ success: false, message: '样件BOM不存在' }); return; }
    if (hdr[0].status === BOM_STATUS.DETERMINED || hdr[0].status === BOM_STATUS.IMPORTED) {
      res.status(400).json({ success: false, message: '已确定或已导入的样件BOM不能创建新版本' }); return;
    }

    const newVer = hdr[0].current_version + 1;
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO sample_bom_version (sample_bom_number, version_number, version_remark, status, created_by, created_at)
        VALUES (:bn, :ver, :remark, N'草稿', :created_by, GETDATE())
      `, { replacements: { bn, ver: newVer, remark: b.version_remark || '', created_by: username }, transaction });

      await sequelize.query(`UPDATE sample_bom_header SET current_version = :ver, updated_at = GETDATE() WHERE sample_bom_number = :bn` + _factoryCond,
        { replacements: { bn, ver: newVer, ..._factoryReps }, transaction });

      await transaction.commit();
      res.json(success({ version_number: newVer }, '创建版本成功'));
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { next(err); }
};

export const copyVersion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bn = req.params.bomNumber as string;
    const srcVer = parseInt(req.params.ver as string);
    const b = req.body;
    const username = (req as any).user?.username || '';
    const _factoryId = getFactoryId(req);
    const _factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const _factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [hdr]: any = await sequelize.query(`SELECT current_version, status FROM sample_bom_header WHERE sample_bom_number = :bn` + _factoryCond, { replacements: { bn, ..._factoryReps } });
    if (!hdr.length) { res.status(404).json({ success: false, message: '样件BOM不存在' }); return; }
    if (hdr[0].status === BOM_STATUS.DETERMINED || hdr[0].status === BOM_STATUS.IMPORTED) {
      res.status(400).json({ success: false, message: '已确定或已导入的样件BOM不能创建新版本' }); return;
    }

    const [srcDetails]: any = await sequelize.query(
      `SELECT * FROM sample_bom_version_detail WHERE sample_bom_number = :bn AND version_number = :ver ORDER BY line_number`,
      { replacements: { bn, ver: srcVer } }
    );
    if (!srcDetails.length) { res.status(400).json({ success: false, message: '源版本无明细行' }); return; }

    const newVer = hdr[0].current_version + 1;
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO sample_bom_version (sample_bom_number, version_number, version_remark, status, created_by, created_at)
        VALUES (:bn, :ver, :remark, N'草稿', :created_by, GETDATE())
      `, { replacements: { bn, ver: newVer, remark: b.version_remark || `基于V${srcVer}复制`, created_by: username }, transaction });

      for (const d of srcDetails) {
        await sequelize.query(`
          INSERT INTO sample_bom_version_detail (sample_bom_number, version_number, line_number, material_number, material_name,
            material_type, standard_quantity, unit, wastage_rate, actual_quantity, step_number, is_key_material,
            substitute_group, substitute_priority, supply_type, default_warehouse, remark)
          VALUES (:bn, :ver, :ln, :mat_num, :mat_name, :mat_type, :std_qty, :unit, :wr, :act_qty,
            :step_num, :is_key, :sub_grp, :sub_pri, :supply, :def_wh, :remark)
        `, {
          replacements: {
            bn, ver: newVer, ln: d.line_number, mat_num: d.material_number, mat_name: d.material_name,
            mat_type: d.material_type, std_qty: d.standard_quantity, unit: d.unit,
            wr: d.wastage_rate, act_qty: d.actual_quantity,
            step_num: d.step_number || '', is_key: d.is_key_material || 0,
            sub_grp: d.substitute_group || '', sub_pri: d.substitute_priority || 0,
            supply: d.supply_type || '', def_wh: d.default_warehouse || '',
            remark: d.remark || '',
          },
          transaction
        });
      }

      await sequelize.query(`UPDATE sample_bom_header SET current_version = :ver, updated_at = GETDATE() WHERE sample_bom_number = :bn` + _factoryCond,
        { replacements: { bn, ver: newVer, ..._factoryReps }, transaction });

      await transaction.commit();
      res.json(success({ version_number: newVer }, '复制版本成功'));
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { next(err); }
};

export const submitVersion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bn = req.params.bomNumber as string;
    const ver = parseInt(req.params.ver as string);
    const [chk]: any = await sequelize.query(
      `SELECT status FROM sample_bom_version WHERE sample_bom_number = :bn AND version_number = :ver`,
      { replacements: { bn, ver } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '版本不存在' }); return; }
    if (chk[0].status !== VERSION_STATUS.DRAFT) { res.status(400).json({ success: false, message: '仅草稿可提交' }); return; }

    await sequelize.query(
      `UPDATE sample_bom_version SET status = N'已提交' WHERE sample_bom_number = :bn AND version_number = :ver`,
      { replacements: { bn, ver } }
    );
    res.json(success(null, '版本已提交'));
  } catch (err) { next(err); }
};

export const deleteVersion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bn = req.params.bomNumber as string;
    const ver = parseInt(req.params.ver as string);
    const [chk]: any = await sequelize.query(
      `SELECT status FROM sample_bom_version WHERE sample_bom_number = :bn AND version_number = :ver`,
      { replacements: { bn, ver } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '版本不存在' }); return; }
    if (chk[0].status !== VERSION_STATUS.DRAFT) { res.status(400).json({ success: false, message: '仅草稿版本可删除' }); return; }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM sample_bom_version_detail WHERE sample_bom_number = :bn AND version_number = :ver`, { replacements: { bn, ver }, transaction });
      await sequelize.query(`DELETE FROM sample_bom_version WHERE sample_bom_number = :bn AND version_number = :ver`, { replacements: { bn, ver }, transaction });
      await transaction.commit();
      res.json(success(null, '版本已删除'));
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { next(err); }
};

// ==================== 样件BOM 版本明细 ====================

export const addVersionDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bn = req.params.bomNumber as string;
    const ver = parseInt(req.params.ver as string);
    const b = req.body;

    const [chk]: any = await sequelize.query(
      `SELECT status FROM sample_bom_version WHERE sample_bom_number = :bn AND version_number = :ver`,
      { replacements: { bn, ver } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '版本不存在' }); return; }
    if (chk[0].status !== VERSION_STATUS.DRAFT) { res.status(400).json({ success: false, message: '仅草稿版本可添加明细' }); return; }

    const [maxResult]: any = await sequelize.query(
      `SELECT ISNULL(MAX(line_number), 0) as max_line FROM sample_bom_version_detail WHERE sample_bom_number = :bn AND version_number = :ver`,
      { replacements: { bn, ver } }
    );
    const lineNumber = maxResult[0].max_line + 1;

    const [result]: any = await sequelize.query(`
      INSERT INTO sample_bom_version_detail (sample_bom_number, version_number, line_number, material_number, material_name,
        material_type, standard_quantity, unit, wastage_rate, actual_quantity, step_number, is_key_material,
        substitute_group, substitute_priority, supply_type, default_warehouse, remark)
      OUTPUT INSERTED.id
      VALUES (:bn, :ver, :ln, :mat_num, :mat_name, :mat_type, :std_qty, :unit, :wr, :act_qty,
        :step_num, :is_key, :sub_grp, :sub_pri, :supply, :def_wh, :remark)
    `, {
      replacements: {
        bn, ver, ln: lineNumber,
        mat_num: b.material_number || '', mat_name: b.material_name || '', mat_type: b.material_type || '',
        std_qty: b.standard_quantity || 0, unit: b.unit || '', wr: b.wastage_rate || 0,
        act_qty: b.actual_quantity || 0,
        step_num: b.step_number || '', is_key: b.is_key_material || 0,
        sub_grp: b.substitute_group || '', sub_pri: b.substitute_priority || 0,
        supply: b.supply_type || '', def_wh: b.default_warehouse || '',
        remark: b.remark || '',
      }
    });
    res.json(success({ id: result[0].id, line_number: lineNumber }, '添加明细成功'));
  } catch (err) { next(err); }
};

export const updateVersionDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const detailId = parseInt(req.params.id as string);
    const b = req.body;
    await sequelize.query(`
      UPDATE sample_bom_version_detail SET material_number = :mat_num, material_name = :mat_name, material_type = :mat_type,
        standard_quantity = :std_qty, unit = :unit, wastage_rate = :wr, actual_quantity = :act_qty,
        step_number = :step_num, is_key_material = :is_key, substitute_group = :sub_grp,
        substitute_priority = :sub_pri, supply_type = :supply, default_warehouse = :def_wh, remark = :remark
      WHERE id = :id
    `, {
      replacements: {
        id: detailId,
        mat_num: b.material_number || '', mat_name: b.material_name || '', mat_type: b.material_type || '',
        std_qty: b.standard_quantity || 0, unit: b.unit || '', wr: b.wastage_rate || 0,
        act_qty: b.actual_quantity || 0,
        step_num: b.step_number || '', is_key: b.is_key_material || 0,
        sub_grp: b.substitute_group || '', sub_pri: b.substitute_priority || 0,
        supply: b.supply_type || '', def_wh: b.default_warehouse || '',
        remark: b.remark || '',
      }
    });
    res.json(success(null, '更新明细成功'));
  } catch (err) { next(err); }
};

export const deleteVersionDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const detailId = parseInt(req.params.id as string);
    await sequelize.query(`DELETE FROM sample_bom_version_detail WHERE id = :id`, { replacements: { id: detailId } });
    res.json(success(null, '删除明细成功'));
  } catch (err) { next(err); }
};

// ==================== 从设计BOM导入创建样件BOM ====================

export const importFromDesignBom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const username = (req as any).user?.username || '';

    // 校验必填参数
    if (!b.sample_request_number) { res.status(400).json({ success: false, message: '样品申请编号不能为空' }); return; }
    if (!b.design_bom_number) { res.status(400).json({ success: false, message: '设计BOM编号不能为空' }); return; }

    // 校验样品申请状态
    const [sr]: any = await sequelize.query(
      `SELECT approval_status FROM sample_request WHERE request_number = :rn`,
      { replacements: { rn: b.sample_request_number } }
    );
    if (!sr.length) { res.status(400).json({ success: false, message: '样品申请不存在' }); return; }
    if (sr[0].approval_status !== '已审核') { res.status(400).json({ success: false, message: '样品申请必须已审核才能创建样件BOM' }); return; }

    // 查询设计BOM
    const [designBom]: any = await sequelize.query(
      `SELECT * FROM bom_header WHERE bom_number = :bn`,
      { replacements: { bn: b.design_bom_number } }
    );
    if (!designBom.length) { res.status(400).json({ success: false, message: '设计BOM不存在' }); return; }
    if (designBom[0].approval_status !== '已审批') { res.status(400).json({ success: false, message: '设计BOM必须已审批' }); return; }

    // 查询设计BOM明细
    const [designDetails]: any = await sequelize.query(
      `SELECT * FROM bom_detail WHERE bom_number = :bn ORDER BY line_number`,
      { replacements: { bn: b.design_bom_number } }
    );

    const transaction = await sequelize.transaction();
    try {
      const factoryCode = await getFactoryCode(req);
      const _factoryId = getFactoryId(req);
      const sampleBomNumber = await generateSampleBomNumber(factoryCode, transaction);

      // 创建样件BOM主表
      await sequelize.query(`
        INSERT INTO sample_bom_header (sample_bom_number, sample_request_number, bom_name, item_number, item_name,
          base_quantity, base_unit, current_version, status, factory_id, source_design_bom_number, remark, created_by, created_at, updated_at)
        VALUES (:sample_bom_number, :sample_request_number, :bom_name, :item_number, :item_name,
          :base_quantity, :base_unit, 1, N'试制中', :factory_id, :source_bom, :remark, :created_by, GETDATE(), GETDATE())
      `, {
        replacements: {
          sample_bom_number: sampleBomNumber,
          sample_request_number: b.sample_request_number,
          bom_name: b.bom_name || designBom[0].bom_name || '',
          item_number: designBom[0].item_number || '',
          item_name: designBom[0].item_name || '',
          base_quantity: designBom[0].base_quantity || 1,
          base_unit: designBom[0].base_unit || '',
          source_bom: b.design_bom_number,
          remark: `从设计BOM ${b.design_bom_number} 导入`,
          factory_id: _factoryId,
          created_by: username,
        },
        transaction
      });

      // 创建V1版本
      await sequelize.query(`
        INSERT INTO sample_bom_version (sample_bom_number, version_number, version_remark, status, created_by, created_at)
        VALUES (:bn, 1, :remark, N'草稿', :created_by, GETDATE())
      `, {
        replacements: { bn: sampleBomNumber, remark: `从设计BOM ${b.design_bom_number} 导入`, created_by: username },
        transaction
      });

      // 将设计BOM明细映射为样件BOM版本明细
      for (const d of designDetails) {
        await sequelize.query(`
          INSERT INTO sample_bom_version_detail (sample_bom_number, version_number, line_number, material_number, material_name,
            material_type, standard_quantity, unit, wastage_rate, actual_quantity, step_number, is_key_material,
            substitute_group, substitute_priority, supply_type, default_warehouse, remark)
          VALUES (:bn, 1, :ln, :mat_num, :mat_name, :mat_type, :std_qty, :unit, :wr, :act_qty,
            :step_num, :is_key, :sub_grp, :sub_pri, :supply, :def_wh, :remark)
        `, {
          replacements: {
            bn: sampleBomNumber,
            ln: d.line_number || 0,
            mat_num: d.material_number || '',
            mat_name: d.material_name || '',
            mat_type: d.material_type || '',
            std_qty: d.standard_quantity || 0,
            unit: d.unit || '',
            wr: d.wastage_rate || 0,
            act_qty: d.actual_quantity || 0,
            step_num: d.step_number || '',
            is_key: d.is_key_material || 0,
            sub_grp: d.substitute_group || '',
            sub_pri: d.substitute_priority || 0,
            supply: d.supply_type || '',
            def_wh: d.default_warehouse || '',
            remark: d.remark || '',
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ sample_bom_number: sampleBomNumber, detail_count: designDetails.length }, '从设计BOM导入创建样件BOM成功'));
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { next(err); }
};

// ==================== 版本明细从设计BOM导入 ====================

export const importDetailsFromDesignBom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bn = req.params.bomNumber as string;
    const ver = parseInt(req.params.ver as string);
    const b = req.body;

    if (!b.design_bom_number) { res.status(400).json({ success: false, message: '设计BOM编号不能为空' }); return; }

    // 校验版本状态
    const [verRow]: any = await sequelize.query(
      `SELECT v.status FROM sample_bom_version v INNER JOIN sample_bom_header h ON v.sample_bom_number = h.sample_bom_number WHERE v.sample_bom_number = :bn AND v.version_number = :ver`,
      { replacements: { bn, ver } }
    );
    if (!verRow.length) { res.status(404).json({ success: false, message: '版本不存在' }); return; }
    if (verRow[0].status !== VERSION_STATUS.DRAFT) { res.status(400).json({ success: false, message: '仅草稿版本可导入明细' }); return; }

    // 查询设计BOM明细
    const [designDetails]: any = await sequelize.query(
      `SELECT * FROM bom_detail WHERE bom_number = :dbn ORDER BY line_number`,
      { replacements: { dbn: b.design_bom_number } }
    );
    if (!designDetails.length) { res.status(400).json({ success: false, message: '设计BOM无明细行' }); return; }

    // 获取当前最大行号
    const [maxResult]: any = await sequelize.query(
      `SELECT ISNULL(MAX(line_number), 0) as max_line FROM sample_bom_version_detail WHERE sample_bom_number = :bn AND version_number = :ver`,
      { replacements: { bn, ver } }
    );
    let nextLine = Math.ceil((maxResult[0].max_line + 1) / 10) * 10; // 按10递增

    const transaction = await sequelize.transaction();
    try {
      for (const d of designDetails) {
        nextLine += 10;
        await sequelize.query(`
          INSERT INTO sample_bom_version_detail (sample_bom_number, version_number, line_number, material_number, material_name,
            material_type, standard_quantity, unit, wastage_rate, actual_quantity, step_number, is_key_material,
            substitute_group, substitute_priority, supply_type, default_warehouse, remark)
          VALUES (:bn, :ver, :ln, :mat_num, :mat_name, :mat_type, :std_qty, :unit, :wr, :act_qty,
            :step_num, :is_key, :sub_grp, :sub_pri, :supply, :def_wh, :remark)
        `, {
          replacements: {
            bn, ver, ln: nextLine,
            mat_num: d.material_number || '',
            mat_name: d.material_name || '',
            mat_type: d.material_type || '',
            std_qty: d.standard_quantity || 0,
            unit: d.unit || '',
            wr: d.wastage_rate || 0,
            act_qty: d.actual_quantity || 0,
            step_num: d.step_number || '',
            is_key: d.is_key_material || 0,
            sub_grp: d.substitute_group || '',
            sub_pri: d.substitute_priority || 0,
            supply: d.supply_type || '',
            def_wh: d.default_warehouse || '',
            remark: d.remark || '',
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ added_count: designDetails.length }, `已导入 ${designDetails.length} 行明细`));
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { next(err); }
};

// ==================== 确定最终版本 & 导入设计BOM ====================

export const determineFinalVersion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bn = req.params.bomNumber;
    const finalVer = req.body.final_version;
    const _factoryId = getFactoryId(req);
    const _factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const _factoryReps = _factoryId !== null ? { _factoryId } : {};
    if (!finalVer) { res.status(400).json({ success: false, message: '请指定最终版本号' }); return; }

    const [hdr]: any = await sequelize.query(`SELECT status FROM sample_bom_header WHERE sample_bom_number = :bn` + _factoryCond, { replacements: { bn, ..._factoryReps } });
    if (!hdr.length) { res.status(404).json({ success: false, message: '样件BOM不存在' }); return; }
    if (hdr[0].status !== BOM_STATUS.TRIAL) { res.status(400).json({ success: false, message: '仅试制中可确定最终版本' }); return; }

    // 校验该版本是否有已提交的检测报告
    const [rpt]: any = await sequelize.query(
      `SELECT status FROM sample_inspection_report WHERE sample_bom_number = :bn AND version_number = :ver`,
      { replacements: { bn, ver: finalVer } }
    );
    if (!rpt.length || rpt[0].status !== '已提交') {
      res.status(400).json({ success: false, message: '最终版本必须有已提交的检测报告' }); return;
    }

    await sequelize.query(`
      UPDATE sample_bom_header SET final_version = :ver, status = N'已确定', updated_at = GETDATE()
      WHERE sample_bom_number = :bn${_factoryCond}
    `, { replacements: { bn, ver: finalVer, ..._factoryReps } });

    res.json(success(null, '确定最终版本成功'));
  } catch (err) { next(err); }
};

export const importToDesignBom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bn = req.params.bomNumber;
    const b = req.body;
    const username = (req as any).user?.username || '';
    const _factoryId = getFactoryId(req);
    const _factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const _factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [hdr]: any = await sequelize.query(`SELECT * FROM sample_bom_header WHERE sample_bom_number = :bn` + _factoryCond, { replacements: { bn, ..._factoryReps } });
    if (!hdr.length) { res.status(404).json({ success: false, message: '样件BOM不存在' }); return; }
    if (hdr[0].status !== BOM_STATUS.DETERMINED) { res.status(400).json({ success: false, message: '仅已确定状态可导入设计BOM' }); return; }

    const verNum = b.version_number || hdr[0].final_version;
    const bomNumber = b.bom_number || '';
    if (!bomNumber) { res.status(400).json({ success: false, message: '请指定设计BOM编号' }); return; }

    const [details]: any = await sequelize.query(
      `SELECT * FROM sample_bom_version_detail WHERE sample_bom_number = :bn AND version_number = :ver ORDER BY line_number`,
      { replacements: { bn, ver: verNum } }
    );

    const transaction = await sequelize.transaction();
    try {
      // 检查设计BOM是否已存在
      const [existBom]: any = await sequelize.query(`SELECT bom_number FROM bom_header WHERE bom_number = :bn`, { replacements: { bn: bomNumber }, transaction });
      if (existBom.length > 0) { res.status(400).json({ success: false, message: '设计BOM编号已存在' }); return; }

      // 插入 bom_header
      await sequelize.query(`
        INSERT INTO bom_header (bom_number, bom_name, item_number, item_name, bom_version, bom_type, base_quantity, base_unit,
          process_route_number, [condition], approval_status, remark, creation_date, creation_man)
        VALUES (:bom_number, :bom_name, :item_number, :item_name, N'V1', N'设计BOM', :base_quantity, :base_unit,
          '', N'启用', N'草稿', :remark, GETDATE(), :creation_man)
      `, {
        replacements: {
          bom_number: bomNumber, bom_name: hdr[0].bom_name || '',
          item_number: hdr[0].item_number || '', item_name: hdr[0].item_name || '',
          base_quantity: hdr[0].base_quantity || 1, base_unit: hdr[0].base_unit || '',
          remark: `由样件BOM ${bn} V${verNum} 导入`, creation_man: username,
        },
        transaction
      });

      // 插入 bom_detail
      for (const d of details) {
        await sequelize.query(`
          INSERT INTO bom_detail (bom_number, line_number, material_number, material_name, material_type,
            standard_quantity, unit, wastage_rate, actual_quantity, step_number, is_key_material,
            substitute_group, substitute_priority, supply_type, default_warehouse, child_bom_number, remark)
          VALUES (:bom_number, :ln, :mat_num, :mat_name, :mat_type, :std_qty, :unit, :wr, :act_qty,
            :step_num, :is_key, :sub_grp, :sub_pri, :supply, :def_wh, NULL, :remark)
        `, {
          replacements: {
            bom_number: bomNumber, ln: d.line_number,
            mat_num: d.material_number, mat_name: d.material_name, mat_type: d.material_type,
            std_qty: d.standard_quantity, unit: d.unit, wr: d.wastage_rate,
            act_qty: d.actual_quantity, step_num: d.step_number || '',
            is_key: d.is_key_material || 0,
            sub_grp: d.substitute_group || '', sub_pri: d.substitute_priority || 0,
            supply: d.supply_type || '', def_wh: d.default_warehouse || '',
            remark: d.remark || '',
          },
          transaction
        });
      }

      // 更新样件BOM状态
      await sequelize.query(`UPDATE sample_bom_header SET status = N'已导入', updated_at = GETDATE() WHERE sample_bom_number = :bn` + _factoryCond,
        { replacements: { bn, ..._factoryReps }, transaction });

      await transaction.commit();
      res.json(success({ bom_number: bomNumber }, '导入设计BOM成功'));
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { next(err); }
};
