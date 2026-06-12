import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';
import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import {
  generateSampleRequestNumber,
  REQUEST_STATUS,
  validateStatusTransition,
  DEFAULT_ITEM_TYPES,
} from './sampleRequest.service';

// ==================== 列表查询 ====================
export const getSampleRequests = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const replacements: any = { offset, offsetEnd: offset + limit };
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      conditions.push('factory_id = :_factoryId');
      replacements._factoryId = _factoryId;
    }

    if (search) {
      conditions.push('(request_number LIKE :search OR customer_name LIKE :search OR applicant LIKE :search)');
      replacements.search = `%${search}%`;
    }
    if (status) {
      const statusArr = status.split(',').filter(Boolean);
      if (statusArr.length === 1) {
        conditions.push('status = :status');
        replacements.status = statusArr[0];
      } else {
        const ph = statusArr.map((_: string, i: number) => `:s${i}`).join(',');
        conditions.push(`status IN (${ph})`);
        statusArr.forEach((s: string, i: number) => { replacements[`s${i}`] = s; });
      }
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM sample_request ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY request_number DESC) AS _row_num
        FROM sample_request ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total: countResult[0]?.total || 0, page, limit, totalPages: Math.ceil((countResult[0]?.total || 0) / limit) }
    }));
  } catch (err) { next(err); }
};

// ==================== 详情查询 ====================
export const getSampleRequestDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(
      'SELECT * FROM sample_request WHERE request_number = :id', { replacements: { id } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '样品申请不存在' }); return; }

    const [items]: any = await sequelize.query(
      'SELECT * FROM sample_request_item WHERE request_number = :id ORDER BY sort_order',
      { replacements: { id } }
    );
    const [lab]: any = await sequelize.query(
      'SELECT * FROM sample_request_lab WHERE request_number = :id',
      { replacements: { id } }
    );

    res.json(success({ header: headers[0], items, lab: lab.length ? lab[0] : null }));
  } catch (err) { next(err); }
};

// ==================== 新建 ====================
export const createSampleRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const b = req.body;
    const request_number = await generateSampleRequestNumber(factoryCode);
    const username = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO sample_request (request_number, request_date, deadline_date, applicant, urgency,
          customer_name, market, competitor, estimated_price, potential_usage, has_order,
          coating_workpiece, substrate, pretreatment, spray_gun_type, recovery_system, oven_type,
          color_spec, product_type, film_thickness, gloss_range, curing_condition, other_requirements,
          status, approval_status, factory_id, created_by, created_at, updated_at)
        VALUES (:request_number, :request_date, :deadline_date, :applicant, :urgency,
          :customer_name, :market, :competitor, :estimated_price, :potential_usage, :has_order,
          :coating_workpiece, :substrate, :pretreatment, :spray_gun_type, :recovery_system, :oven_type,
          :color_spec, :product_type, :film_thickness, :gloss_range, :curing_condition, :other_requirements,
          N'草稿', N'草稿', :factory_id, :created_by, GETDATE(), GETDATE())
      `, {
        replacements: {
          request_number,
          request_date: b.request_date || null,
          deadline_date: b.deadline_date || null,
          applicant: b.applicant || username,
          urgency: b.urgency || '一般',
          customer_name: b.customer_name || '',
          market: b.market || '',
          competitor: b.competitor || '',
          estimated_price: b.estimated_price || null,
          potential_usage: b.potential_usage || null,
          has_order: b.has_order || '',
          coating_workpiece: b.coating_workpiece || '',
          substrate: b.substrate || '',
          pretreatment: b.pretreatment || '',
          spray_gun_type: b.spray_gun_type || '',
          recovery_system: b.recovery_system || '',
          oven_type: b.oven_type || '',
          color_spec: b.color_spec || '',
          product_type: b.product_type || '',
          film_thickness: b.film_thickness || '',
          gloss_range: b.gloss_range || '',
          curing_condition: b.curing_condition || '',
          other_requirements: b.other_requirements || '',
          created_by: username,
          factory_id: _factoryId,
        },
        transaction
      });

      // 插入默认明细
      const itemList = b.items && b.items.length ? b.items : DEFAULT_ITEM_TYPES;
      for (const item of itemList) {
        await sequelize.query(`
          INSERT INTO sample_request_item (request_number, item_type, quantity, unit, is_requested, sort_order)
          VALUES (:request_number, :item_type, :quantity, :unit, :is_requested, :sort_order)
        `, {
          replacements: {
            request_number,
            item_type: item.item_type || '',
            quantity: item.quantity || null,
            unit: item.unit || '',
            is_requested: item.is_requested ? 1 : 0,
            sort_order: item.sort_order || 0,
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ request_number }, '创建样品申请成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 编辑 ====================
export const updateSampleRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [chk]: any = await sequelize.query(
      'SELECT status FROM sample_request WHERE request_number = :id' + factoryCond, { replacements: { id, ...factoryReps } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '样品申请不存在' }); return; }
    const currentStatus = chk[0].status;
    if (currentStatus !== REQUEST_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '仅草稿状态可编辑' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE sample_request SET
          request_date = :request_date, deadline_date = :deadline_date, applicant = :applicant,
          urgency = :urgency, customer_name = :customer_name, market = :market,
          competitor = :competitor, estimated_price = :estimated_price, potential_usage = :potential_usage,
          has_order = :has_order, coating_workpiece = :coating_workpiece, substrate = :substrate,
          pretreatment = :pretreatment, spray_gun_type = :spray_gun_type, recovery_system = :recovery_system,
          oven_type = :oven_type, color_spec = :color_spec, product_type = :product_type,
          film_thickness = :film_thickness, gloss_range = :gloss_range, curing_condition = :curing_condition,
          other_requirements = :other_requirements, updated_at = GETDATE()
        WHERE request_number = :id${factoryCond}
      `, {
        replacements: {
          id,
          ...factoryReps,
          request_date: b.request_date || null,
          deadline_date: b.deadline_date || null,
          applicant: b.applicant || '',
          urgency: b.urgency || '一般',
          customer_name: b.customer_name || '',
          market: b.market || '',
          competitor: b.competitor || '',
          estimated_price: b.estimated_price || null,
          potential_usage: b.potential_usage || null,
          has_order: b.has_order || '',
          coating_workpiece: b.coating_workpiece || '',
          substrate: b.substrate || '',
          pretreatment: b.pretreatment || '',
          spray_gun_type: b.spray_gun_type || '',
          recovery_system: b.recovery_system || '',
          oven_type: b.oven_type || '',
          color_spec: b.color_spec || '',
          product_type: b.product_type || '',
          film_thickness: b.film_thickness || '',
          gloss_range: b.gloss_range || '',
          curing_condition: b.curing_condition || '',
          other_requirements: b.other_requirements || '',
        },
        transaction
      });

      // 更新明细：先删后插
      if (b.items && Array.isArray(b.items)) {
        await sequelize.query(
          'DELETE FROM sample_request_item WHERE request_number = :id',
          { replacements: { id }, transaction }
        );
        for (const item of b.items) {
          await sequelize.query(`
            INSERT INTO sample_request_item (request_number, item_type, quantity, unit, is_requested, sort_order)
            VALUES (:request_number, :item_type, :quantity, :unit, :is_requested, :sort_order)
          `, {
            replacements: {
              request_number: id,
              item_type: item.item_type || '',
              quantity: item.quantity || null,
              unit: item.unit || '',
              is_requested: item.is_requested ? 1 : 0,
              sort_order: item.sort_order || 0,
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success(null, '更新样品申请成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 删除 ====================
export const deleteSampleRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(
      'SELECT status FROM sample_request WHERE request_number = :id' + factoryCond, { replacements: { id, ...factoryReps } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '样品申请不存在' }); return; }
    if (chk[0].status !== REQUEST_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '仅草稿状态可删除' }); return;
    }

    // CASCADE 自动删除子表
    await sequelize.query('DELETE FROM sample_request WHERE request_number = :id' + factoryCond, { replacements: { id, ...factoryReps } });
    res.json(success(null, '删除成功'));
  } catch (err) { next(err); }
};

// ==================== 提交（草稿→待研发） ====================
export const submitSampleRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(
      'SELECT status FROM sample_request WHERE request_number = :id' + factoryCond, { replacements: { id, ...factoryReps } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '样品申请不存在' }); return; }
    if (!validateStatusTransition(chk[0].status, REQUEST_STATUS.PENDING_RD)) {
      res.status(403).json({ success: false, message: '当前状态不可提交' }); return;
    }

    await sequelize.query(`
      UPDATE sample_request SET status = N'待研发', approval_status = N'待研发', updated_at = GETDATE()
      WHERE request_number = :id${factoryCond}
    `, { replacements: { id, ...factoryReps } });
    res.json(success(null, '提交成功，已通知技术部'));
  } catch (err) { next(err); }
};

// ==================== 撤回（待研发→草稿） ====================
export const withdrawSampleRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(
      'SELECT status FROM sample_request WHERE request_number = :id' + factoryCond, { replacements: { id, ...factoryReps } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '样品申请不存在' }); return; }
    if (!validateStatusTransition(chk[0].status, REQUEST_STATUS.DRAFT)) {
      res.status(403).json({ success: false, message: '当前状态不可撤回' }); return;
    }

    await sequelize.query(`
      UPDATE sample_request SET status = N'草稿', approval_status = N'草稿', updated_at = GETDATE()
      WHERE request_number = :id${factoryCond}
    `, { replacements: { id, ...factoryReps } });
    res.json(success(null, '撤回成功'));
  } catch (err) { next(err); }
};

// ==================== 接收（待研发→研发中） ====================
export const receiveSampleRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const username = (req as any).user?.username || '';
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(
      'SELECT status FROM sample_request WHERE request_number = :id' + factoryCond, { replacements: { id, ...factoryReps } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '样品申请不存在' }); return; }
    if (!validateStatusTransition(chk[0].status, REQUEST_STATUS.IN_RD)) {
      res.status(403).json({ success: false, message: '当前状态不可接收' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE sample_request SET status = N'研发中', approval_status = N'研发中', updated_at = GETDATE()
        WHERE request_number = :id${factoryCond}
      `, { replacements: { id, ...factoryReps }, transaction });

      // 创建/更新实验室记录（接收人）
      const [labExist]: any = await sequelize.query(
        'SELECT id FROM sample_request_lab WHERE request_number = :id',
        { replacements: { id }, transaction }
      );
      if (labExist.length) {
        await sequelize.query(`
          UPDATE sample_request_lab SET received_by = :username, received_at = GETDATE()
          WHERE request_number = :id
        `, { replacements: { id, username }, transaction });
      } else {
        await sequelize.query(`
          INSERT INTO sample_request_lab (request_number, received_by, received_at)
          VALUES (:id, :username, GETDATE())
        `, { replacements: { id, username }, transaction });
      }

      await transaction.commit();
      res.json(success(null, '接收成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 保存实验室数据（中途保存） ====================
export const updateLabData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(
      'SELECT status FROM sample_request WHERE request_number = :id' + factoryCond, { replacements: { id, ...factoryReps } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '样品申请不存在' }); return; }
    if (chk[0].status !== REQUEST_STATUS.IN_RD) {
      res.status(403).json({ success: false, message: '仅研发中状态可编辑实验室数据' }); return;
    }

    const [labExist]: any = await sequelize.query(
      'SELECT id FROM sample_request_lab WHERE request_number = :id', { replacements: { id } }
    );

    if (labExist.length) {
      await sequelize.query(`
        UPDATE sample_request_lab SET
          lab_panel_qty = :lab_panel_qty, lab_powder_qty = :lab_powder_qty,
          completion_date = :completion_date, product_number = :product_number,
          formula_cost = :formula_cost, lab_remark = :lab_remark
        WHERE request_number = :id
      `, {
        replacements: {
          id,
          lab_panel_qty: b.lab_panel_qty ?? null,
          lab_powder_qty: b.lab_powder_qty ?? null,
          completion_date: b.completion_date || null,
          product_number: b.product_number || '',
          formula_cost: b.formula_cost ?? null,
          lab_remark: b.lab_remark || '',
        },
      });
    } else {
      await sequelize.query(`
        INSERT INTO sample_request_lab (request_number, lab_panel_qty, lab_powder_qty,
          completion_date, product_number, formula_cost, lab_remark)
        VALUES (:id, :lab_panel_qty, :lab_powder_qty,
          :completion_date, :product_number, :formula_cost, :lab_remark)
      `, {
        replacements: {
          id,
          lab_panel_qty: b.lab_panel_qty ?? null,
          lab_powder_qty: b.lab_powder_qty ?? null,
          completion_date: b.completion_date || null,
          product_number: b.product_number || '',
          formula_cost: b.formula_cost ?? null,
          lab_remark: b.lab_remark || '',
        },
      });
    }

    res.json(success(null, '实验室数据已保存'));
  } catch (err) { next(err); }
};

// ==================== 完成（研发中→已完成） ====================
export const completeSampleRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const username = (req as any).user?.username || '';
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(
      'SELECT status FROM sample_request WHERE request_number = :id' + factoryCond, { replacements: { id, ...factoryReps } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '样品申请不存在' }); return; }
    if (!validateStatusTransition(chk[0].status, REQUEST_STATUS.COMPLETED)) {
      res.status(403).json({ success: false, message: '当前状态不可完成' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE sample_request SET status = N'已完成', approval_status = N'已完成', updated_at = GETDATE()
        WHERE request_number = :id${factoryCond}
      `, { replacements: { id, ...factoryReps }, transaction });

      // 更新实验室数据
      await sequelize.query(`
        UPDATE sample_request_lab SET
          lab_panel_qty = :lab_panel_qty, lab_powder_qty = :lab_powder_qty,
          completion_date = :completion_date, product_number = :product_number,
          formula_cost = :formula_cost, lab_remark = :lab_remark,
          completed_by = :username, completed_at = GETDATE()
        WHERE request_number = :id
      `, {
        replacements: {
          id,
          lab_panel_qty: b.lab_panel_qty || null,
          lab_powder_qty: b.lab_powder_qty || null,
          completion_date: b.completion_date || null,
          product_number: b.product_number || '',
          formula_cost: b.formula_cost || null,
          lab_remark: b.lab_remark || '',
          username,
        },
        transaction
      });

      await transaction.commit();
      res.json(success(null, '完成研发，已通知相关人员'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 转化订单（已完成→更新是否已有订单） ====================
export const convertToOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [chk]: any = await sequelize.query(
      'SELECT status, approval_status FROM sample_request WHERE request_number = :id' + factoryCond,
      { replacements: { id, ...factoryReps } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '样品申请不存在' }); return; }

    const currentStatus = (chk[0].status || '').trim();
    if (currentStatus !== REQUEST_STATUS.COMPLETED && currentStatus !== '已完成') {
      res.status(403).json({ success: false, message: '仅已完成状态可转化订单' }); return;
    }

    await sequelize.query(`
      UPDATE sample_request SET has_order = :has_order, updated_at = GETDATE()
      WHERE request_number = :id${factoryCond}
    `, { replacements: { id, ...factoryReps, has_order: b.has_order || '' } });

    res.json(success(null, '转化订单成功'));
  } catch (err) { next(err); }
};

// ==================== 转化率统计 ====================
export const getConversionRate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const applicant = (req.query.applicant as string) || '';
    const startDate = (req.query.startDate as string) || '';
    const endDate = (req.query.endDate as string) || '';
    const onlyCompleted = req.query.onlyCompleted !== 'false';
    const _factoryId = getFactoryId(req);

    const conditions: string[] = [];
    const replacements: any = {};

    if (_factoryId !== null) {
      conditions.push('factory_id = :_factoryId');
      replacements._factoryId = _factoryId;
    }
    if (applicant) {
      conditions.push('applicant LIKE :applicant');
      replacements.applicant = `%${applicant}%`;
    }
    if (startDate) {
      conditions.push('request_date >= :startDate');
      replacements.startDate = startDate;
    }
    if (endDate) {
      conditions.push('request_date <= :endDate');
      replacements.endDate = endDate;
    }
    if (onlyCompleted) {
      conditions.push("status = N'已完成'");
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // 总数
    const [totalRows]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM sample_request ${whereClause}`,
      { replacements }
    );
    const totalCount = totalRows[0]?.total || 0;

    // 已有订单数
    const orderedCond = [...conditions, "has_order = N'是'"].join(' AND ');
    const orderedWhere = 'WHERE ' + orderedCond;
    const [orderedRows]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM sample_request ${orderedWhere}`,
      { replacements }
    );
    const orderedCount = orderedRows[0]?.total || 0;

    const conversionRate = totalCount > 0 ? Math.round((orderedCount / totalCount) * 10000) / 100 : 0;

    // 明细列表（最多500条）
    const [items]: any = await sequelize.query(`
      SELECT TOP 500 request_number, request_date, customer_name, applicant, urgency, status, has_order, deadline_date
      FROM sample_request ${whereClause}
      ORDER BY request_date DESC
    `, { replacements });

    res.json(success({
      total_count: totalCount,
      ordered_count: orderedCount,
      conversion_rate: conversionRate,
      items,
    }));
  } catch (err) { next(err); }
};
