import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import {
  LIFECYCLE_STATUS,
  LIFECYCLE_STATUS_VALUES,
  CHANGE_TYPES,
  validateLifecycleTransition,
  refreshLifecycleAggregates,
  nextChangeSeq,
} from './engineeringChange.service';

// ==================== 列表查询 ====================
export const getLifecycles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';
    const customer = (req.query.customer_number as string) || '';
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const replacements: any = { offset, offsetEnd: offset + limit };

    if (search) {
      conditions.push('(product_number LIKE :search OR product_name LIKE :search OR customer_name LIKE :search)');
      replacements.search = `%${search}%`;
    }
    if (status) {
      conditions.push('lifecycle_status = :status');
      replacements.status = status;
    }
    if (customer) {
      conditions.push('customer_number = :customer');
      replacements.customer = customer;
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) AS total FROM engineering_change_lifecycle ${whereClause}`,
      { replacements }
    );

    const [items]: any = await sequelize.query(
      `SELECT * FROM (
         SELECT *, ROW_NUMBER() OVER (ORDER BY updated_at DESC, id DESC) AS _row_num
         FROM engineering_change_lifecycle ${whereClause}
       ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements }
    );

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(
      success({
        items: cleanItems,
        pagination: {
          total: countResult[0]?.total || 0,
          page,
          limit,
          totalPages: Math.ceil((countResult[0]?.total || 0) / limit),
        },
      })
    );
  } catch (err) {
    next(err);
  }
};

// ==================== 详情：主表 + 履历 ====================
export const getLifecycleDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(
      'SELECT * FROM engineering_change_lifecycle WHERE id = :id',
      { replacements: { id } }
    );
    if (!headers.length) {
      res.status(404).json({ success: false, message: '工程更改记录不存在' });
      return;
    }

    const [logs]: any = await sequelize.query(
      `SELECT * FROM engineering_change_log
        WHERE lifecycle_id = :id
        ORDER BY change_date DESC, id DESC`,
      { replacements: { id } }
    );

    res.json(success({ header: headers[0], logs }));
  } catch (err) {
    next(err);
  }
};

// ==================== 新建 / Upsert（按 product_number） ====================
export const createLifecycle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body || {};
    const username = (req as any).user?.username || '';

    if (!b.product_number) {
      res.status(400).json({ success: false, message: '产品编号必填' });
      return;
    }

    // 已存在则返回原 id
    const [existing]: any = await sequelize.query(
      'SELECT id FROM engineering_change_lifecycle WHERE product_number = :pn',
      { replacements: { pn: b.product_number } }
    );
    if (existing.length) {
      res.json(success({ id: existing[0].id, existed: true }, '该产品已存在生命周期记录'));
      return;
    }

    const [result]: any = await sequelize.query(
      `INSERT INTO engineering_change_lifecycle
        (product_number, product_name, customer_number, customer_name,
         origin_sample_request_no, sample_pass_date, lifecycle_status, remark,
         created_by, updated_by)
       OUTPUT INSERTED.id
       VALUES (:product_number, :product_name, :customer_number, :customer_name,
               :origin_sample_request_no, :sample_pass_date, :lifecycle_status, :remark,
               :created_by, :updated_by)`,
      {
        replacements: {
          product_number: b.product_number,
          product_name: b.product_name || null,
          customer_number: b.customer_number || null,
          customer_name: b.customer_name || null,
          origin_sample_request_no: b.origin_sample_request_no || null,
          sample_pass_date: b.sample_pass_date || null,
          lifecycle_status: b.lifecycle_status || LIFECYCLE_STATUS.IN_PROGRESS,
          remark: b.remark || null,
          created_by: username,
          updated_by: username,
        },
      }
    );

    const newId = result?.[0]?.id;
    res.json(success({ id: newId, existed: false }, '创建成功'));
  } catch (err) {
    next(err);
  }
};

// ==================== 编辑主表（基础字段） ====================
export const updateLifecycle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body || {};
    const username = (req as any).user?.username || '';

    const [chk]: any = await sequelize.query(
      'SELECT id FROM engineering_change_lifecycle WHERE id = :id',
      { replacements: { id } }
    );
    if (!chk.length) {
      res.status(404).json({ success: false, message: '工程更改记录不存在' });
      return;
    }

    await sequelize.query(
      `UPDATE engineering_change_lifecycle
          SET product_name = :product_name,
              customer_number = :customer_number,
              customer_name = :customer_name,
              origin_sample_request_no = :origin_sample_request_no,
              sample_pass_date = :sample_pass_date,
              remark = :remark,
              updated_by = :updated_by,
              updated_at = GETDATE()
        WHERE id = :id`,
      {
        replacements: {
          id,
          product_name: b.product_name || null,
          customer_number: b.customer_number || null,
          customer_name: b.customer_name || null,
          origin_sample_request_no: b.origin_sample_request_no || null,
          sample_pass_date: b.sample_pass_date || null,
          remark: b.remark || null,
          updated_by: username,
        },
      }
    );

    res.json(success(null, '更新成功'));
  } catch (err) {
    next(err);
  }
};

// ==================== 状态流转 ====================
export const updateLifecycleStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const target = (req.body?.lifecycle_status || '').toString();
    const username = (req as any).user?.username || '';

    if (!LIFECYCLE_STATUS_VALUES.includes(target as any)) {
      res.status(400).json({ success: false, message: '无效的状态值' });
      return;
    }

    const [rows]: any = await sequelize.query(
      'SELECT lifecycle_status FROM engineering_change_lifecycle WHERE id = :id',
      { replacements: { id } }
    );
    if (!rows.length) {
      res.status(404).json({ success: false, message: '工程更改记录不存在' });
      return;
    }
    const current = rows[0].lifecycle_status;
    if (current === target) {
      res.json(success(null, '状态未变化'));
      return;
    }
    if (!validateLifecycleTransition(current, target)) {
      res.status(400).json({ success: false, message: `不允许从 ${current} 流转到 ${target}` });
      return;
    }

    await sequelize.query(
      `UPDATE engineering_change_lifecycle
          SET lifecycle_status = :target, updated_by = :u, updated_at = GETDATE()
        WHERE id = :id`,
      { replacements: { id, target, u: username } }
    );
    res.json(success(null, '状态更新成功'));
  } catch (err) {
    next(err);
  }
};

// ==================== 删除主表（仅在无变更日志时允许） ====================
export const deleteLifecycle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(
      'SELECT change_count FROM engineering_change_lifecycle WHERE id = :id',
      { replacements: { id } }
    );
    if (!rows.length) {
      res.status(404).json({ success: false, message: '工程更改记录不存在' });
      return;
    }
    if ((rows[0].change_count || 0) > 0) {
      res.status(403).json({ success: false, message: '存在变更日志，请先删除日志后再操作' });
      return;
    }
    await sequelize.query('DELETE FROM engineering_change_lifecycle WHERE id = :id', {
      replacements: { id },
    });
    res.json(success(null, '删除成功'));
  } catch (err) {
    next(err);
  }
};

// ==================== 变更日志：列表 ====================
export const getLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [logs]: any = await sequelize.query(
      `SELECT * FROM engineering_change_log
        WHERE lifecycle_id = :id
        ORDER BY change_date DESC, id DESC`,
      { replacements: { id } }
    );
    res.json(success(logs));
  } catch (err) {
    next(err);
  }
};

// ==================== 变更日志：新增 ====================
export const createLog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // lifecycle id
    const b = req.body || {};
    const username = (req as any).user?.username || '';

    if (!b.change_date) {
      res.status(400).json({ success: false, message: '变更日期必填' });
      return;
    }
    if (!b.change_type || !CHANGE_TYPES.includes(b.change_type)) {
      res.status(400).json({ success: false, message: '变更类型不合法' });
      return;
    }
    if (!b.change_summary) {
      res.status(400).json({ success: false, message: '变更摘要必填' });
      return;
    }

    const [headers]: any = await sequelize.query(
      'SELECT id, product_number FROM engineering_change_lifecycle WHERE id = :id',
      { replacements: { id } }
    );
    if (!headers.length) {
      res.status(404).json({ success: false, message: '工程更改记录不存在' });
      return;
    }

    const transaction = await sequelize.transaction();
    try {
      const seq = await nextChangeSeq(Number(id), transaction);

      const [insertResult]: any = await sequelize.query(
        `INSERT INTO engineering_change_log
          (lifecycle_id, product_number, change_seq, change_date, change_type,
           change_summary, change_detail, before_value, after_value,
           related_sample_request_no, related_routing_id, related_bom_id,
           handled_by, attachment_url, created_by)
         OUTPUT INSERTED.id
         VALUES (:lifecycle_id, :product_number, :change_seq, :change_date, :change_type,
                 :change_summary, :change_detail, :before_value, :after_value,
                 :related_sample_request_no, :related_routing_id, :related_bom_id,
                 :handled_by, :attachment_url, :created_by)`,
        {
          replacements: {
            lifecycle_id: id,
            product_number: headers[0].product_number,
            change_seq: seq,
            change_date: b.change_date,
            change_type: b.change_type,
            change_summary: b.change_summary,
            change_detail: b.change_detail || null,
            before_value: b.before_value || null,
            after_value: b.after_value || null,
            related_sample_request_no: b.related_sample_request_no || null,
            related_routing_id: b.related_routing_id || null,
            related_bom_id: b.related_bom_id || null,
            handled_by: b.handled_by || username,
            attachment_url: b.attachment_url || null,
            created_by: username,
          },
          transaction,
        }
      );

      await refreshLifecycleAggregates(Number(id), transaction);
      await transaction.commit();

      res.json(success({ id: insertResult?.[0]?.id, change_seq: seq }, '新增变更日志成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) {
    next(err);
  }
};

// ==================== 变更日志：编辑 ====================
export const updateLog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { logId } = req.params;
    const b = req.body || {};

    if (b.change_type && !CHANGE_TYPES.includes(b.change_type)) {
      res.status(400).json({ success: false, message: '变更类型不合法' });
      return;
    }

    const [rows]: any = await sequelize.query(
      'SELECT lifecycle_id FROM engineering_change_log WHERE id = :id',
      { replacements: { id: logId } }
    );
    if (!rows.length) {
      res.status(404).json({ success: false, message: '变更日志不存在' });
      return;
    }
    const lifecycleId = rows[0].lifecycle_id;

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(
        `UPDATE engineering_change_log
            SET change_date = :change_date,
                change_type = :change_type,
                change_summary = :change_summary,
                change_detail = :change_detail,
                before_value = :before_value,
                after_value = :after_value,
                related_sample_request_no = :related_sample_request_no,
                related_routing_id = :related_routing_id,
                related_bom_id = :related_bom_id,
                handled_by = :handled_by,
                attachment_url = :attachment_url
          WHERE id = :id`,
        {
          replacements: {
            id: logId,
            change_date: b.change_date,
            change_type: b.change_type,
            change_summary: b.change_summary,
            change_detail: b.change_detail || null,
            before_value: b.before_value || null,
            after_value: b.after_value || null,
            related_sample_request_no: b.related_sample_request_no || null,
            related_routing_id: b.related_routing_id || null,
            related_bom_id: b.related_bom_id || null,
            handled_by: b.handled_by || null,
            attachment_url: b.attachment_url || null,
          },
          transaction,
        }
      );

      await refreshLifecycleAggregates(lifecycleId, transaction);
      await transaction.commit();

      res.json(success(null, '更新变更日志成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) {
    next(err);
  }
};

// ==================== 变更日志：删除 ====================
export const deleteLog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { logId } = req.params;
    const [rows]: any = await sequelize.query(
      'SELECT lifecycle_id FROM engineering_change_log WHERE id = :id',
      { replacements: { id: logId } }
    );
    if (!rows.length) {
      res.status(404).json({ success: false, message: '变更日志不存在' });
      return;
    }
    const lifecycleId = rows[0].lifecycle_id;

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query('DELETE FROM engineering_change_log WHERE id = :id', {
        replacements: { id: logId },
        transaction,
      });
      await refreshLifecycleAggregates(lifecycleId, transaction);
      await transaction.commit();
      res.json(success(null, '删除变更日志成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) {
    next(err);
  }
};

// ==================== 元数据：变更类型字典 ====================
export const getChangeTypes = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(success(CHANGE_TYPES));
  } catch (err) {
    next(err);
  }
};
