import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import {
  searchAfterInspectRecords,
  fetchAllInspectRecords,
  queryInspectRecords,
  queryInspectLines,
  fetchAllInspectLines,
  getAccessToken,
  queryInventoryDetail
} from '../../../services/xinheyun.service';
import type { InspectRecord, InspectLineRecord } from '../../../services/xinheyun.service';
import dayjs from 'dayjs';

// ==================== 分批查询检验记录（单次） ====================
export const searchAfterRecords = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { conditions, sorts, boundaryIds, length } = req.body;

    const result = await searchAfterInspectRecords({
      conditions: conditions || {},
      sorts: sorts || [{ sortOrder: 'DESC', sortFieldKey: 'createTime' }],
      boundaryIds: boundaryIds || [],
      length: length || 100
    });

    const entity = result.data.entity || result.data;

    res.json(success({
      list: entity.list,
      boundaryIds: entity.boundaryIds
    }, '分批查询检验记录成功'));
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || '查询新核云检验记录失败' });
  }
};

// ==================== 标准分页查询检验记录 ====================
export const queryRecords = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { conditions, sorts, start, length } = req.body;

    const result = await queryInspectRecords({
      conditions: conditions || {},
      sorts: sorts || [{ sortOrder: 'DESC', sortFieldKey: 'createTime' }],
      start: start || 0,
      length: length || 20
    });

    res.json(success({
      list: result.data.list,
      start: result.data.start,
      length: result.data.length,
      recordsTotal: result.data.recordsTotal
    }, '查询检验记录成功'));
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || '查询新核云检验记录失败' });
  }
};

// ==================== 同步检验记录到本地数据库 ====================
export const syncInspectRecords = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { conditions, batchSize, maxRecords } = req.body;

    // 确保本地表存在
    await ensureInspectTable();

    let insertedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    const result = await fetchAllInspectRecords(
      conditions || {},
      batchSize || 200,
      maxRecords || 10000,
      async (records: InspectRecord[], batchIndex: number, total: number) => {
        // 每批数据写入本地数据库
        for (const record of records) {
          try {
            const [existing]: any = await sequelize.query(
              `SELECT COUNT(*) as cnt FROM xhy_inspect_record WHERE code = :code`,
              { replacements: { code: record.code } }
            );

            if (existing[0].cnt > 0) {
              // 更新
              await sequelize.query(`
                UPDATE xhy_inspect_record SET
                  work_order_number = :work_order_number,
                  item_code = :item_code,
                  item_name = :item_name,
                  item_type = :item_type,
                  item_specification = :item_specification,
                  category_id = :category_id,
                  procedure_name = :procedure_name,
                  inspect_type = :inspect_type,
                  inspect_method = :inspect_method,
                  inspect_plan_name = :inspect_plan_name,
                  inspect_standard_name = :inspect_standard_name,
                  operator_id = :operator_id,
                  job_booking_time = :job_booking_time,
                  xhy_create_time = :xhy_create_time,
                  work_order_type = :work_order_type,
                  comment = :comment,
                  sync_time = :sync_time
                WHERE code = :code
              `, { replacements: buildReplacements(record) });
              updatedCount++;
            } else {
              // 插入
              await sequelize.query(`
                INSERT INTO xhy_inspect_record (
                  code, work_order_number, item_code, item_name, item_type, item_specification,
                  category_id, procedure_name, inspect_type, inspect_method, inspect_plan_name,
                  inspect_standard_name, operator_id, job_booking_time, xhy_create_time,
                  work_order_type, comment, sync_time
                ) VALUES (
                  :code, :work_order_number, :item_code, :item_name, :item_type, :item_specification,
                  :category_id, :procedure_name, :inspect_type, :inspect_method, :inspect_plan_name,
                  :inspect_standard_name, :operator_id, :job_booking_time, :xhy_create_time,
                  :work_order_type, :comment, :sync_time
                )
              `, { replacements: buildReplacements(record) });
              insertedCount++;
            }
          } catch (e: any) {
            errorCount++;
            console.error(`[同步] 记录 ${record.code} 处理失败:`, e.message);
          }
        }
      }
    );

    res.json(success({
      total: result.total,
      batches: result.batches,
      fetched: result.records.length,
      inserted: insertedCount,
      updated: updatedCount,
      errors: errorCount
    }, `同步完成: 获取${result.records.length}条, 新增${insertedCount}条, 更新${updatedCount}条`));
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || '同步检验记录失败' });
  }
};

// ==================== 获取本地已同步的检验记录 ====================
export const getLocalInspectRecords = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureInspectTable();

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const inspect_type = (req.query.inspect_type as string) || '';
    const inspect_method = (req.query.inspect_method as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(code LIKE :search OR work_order_number LIKE :search OR item_code LIKE :search OR item_name LIKE :search OR procedure_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (inspect_type) {
      conditions.push(`inspect_type = :inspect_type`);
      replacements.inspect_type = inspect_type;
    }
    if (inspect_method) {
      conditions.push(`inspect_method = :inspect_method`);
      replacements.inspect_method = inspect_method;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM xhy_inspect_record ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY xhy_create_time DESC) AS _row_num
        FROM xhy_inspect_record ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取检验记录列表成功'));
  } catch (err) {
    next(err);
  }
};

// ==================== 测试新核云连接 ====================
export const testConnection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = await getAccessToken();
    res.json(success({
      connected: true,
      tokenPreview: token.slice(0, 20) + '...',
      baseUrl: process.env.XHY_BASE_URL || 'https://c2.xinheyun.com'
    }, '新核云连接测试成功'));
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || '连接失败' });
  }
};

// ==================== 辅助函数 ====================

function buildReplacements(record: InspectRecord): any {
  return {
    code: record.code || '',
    work_order_number: record.workOrderNumber || '',
    item_code: record.itemCode || '',
    item_name: record.itemName || '',
    item_type: record.itemType || '',
    item_specification: record.itemSpecification ? JSON.stringify(record.itemSpecification) : '',
    category_id: record.categoryId || '',
    procedure_name: record.procedureName || '',
    inspect_type: record.inspectType || '',
    inspect_method: record.inspectMethod || '',
    inspect_plan_name: record.jbkInspectPlanName || '',
    inspect_standard_name: record.jbkInspectStandardName || '',
    operator_id: record.operator || 0,
    job_booking_time: record.jobBookingTime ? dayjs(record.jobBookingTime).format('YYYY-MM-DD HH:mm:ss') : null,
    xhy_create_time: record.createTime ? dayjs(record.createTime).format('YYYY-MM-DD HH:mm:ss') : null,
    work_order_type: record.workOrderType || '',
    comment: record.comment || '',
    sync_time: dayjs().format('YYYY-MM-DD HH:mm:ss')
  };
}

/** 确保本地检验记录表存在 */
async function ensureInspectTable() {
  // 检查表是否存在
  try {
    await sequelize.query(`SELECT TOP 1 1 FROM xhy_inspect_record`);
  } catch (err: any) {
    // 表不存在，创建
    console.log('[检验记录] 创建本地存储表 xhy_inspect_record...');
    await sequelize.query(`
      CREATE TABLE xhy_inspect_record (
        id INT IDENTITY(1,1) PRIMARY KEY,
        code NVARCHAR(100) NOT NULL UNIQUE,
        work_order_number NVARCHAR(100) DEFAULT '',
        item_code NVARCHAR(100) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        item_type NVARCHAR(50) DEFAULT '',
        item_specification NVARCHAR(500) DEFAULT '',
        category_id NVARCHAR(100) DEFAULT '',
        procedure_name NVARCHAR(200) DEFAULT '',
        inspect_type NVARCHAR(50) DEFAULT '',
        inspect_method NVARCHAR(50) DEFAULT '',
        inspect_plan_name NVARCHAR(200) DEFAULT '',
        inspect_standard_name NVARCHAR(200) DEFAULT '',
        operator_id BIGINT DEFAULT 0,
        job_booking_time DATETIME NULL,
        xhy_create_time DATETIME NULL,
        work_order_type NVARCHAR(50) DEFAULT '',
        comment NVARCHAR(500) DEFAULT '',
        sync_time DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('[检验记录] 表创建成功');
  }
}

// ==================== 检验明细行 ====================

/** 确保本地检验明细行表存在 */
async function ensureInspectLineTable() {
  try {
    await sequelize.query(`SELECT TOP 1 1 FROM xhy_inspect_line`);
  } catch (err: any) {
    console.log('[检验明细行] 创建本地存储表 xhy_inspect_line...');
    await sequelize.query(`
      CREATE TABLE xhy_inspect_line (
        id INT IDENTITY(1,1) PRIMARY KEY,
        code NVARCHAR(100) NOT NULL UNIQUE,
        record_id NVARCHAR(100) DEFAULT '',
        record_code NVARCHAR(100) DEFAULT '',
        work_order_number NVARCHAR(100) DEFAULT '',
        work_order_id NVARCHAR(100) DEFAULT '',
        item_code NVARCHAR(100) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        item_type NVARCHAR(50) DEFAULT '',
        specification NVARCHAR(MAX) DEFAULT '',
        category_id NVARCHAR(100) DEFAULT '',
        procedure_name NVARCHAR(200) DEFAULT '',
        inspect_type NVARCHAR(50) DEFAULT '',
        inspect_method NVARCHAR(50) DEFAULT '',
        inspect_plan_name NVARCHAR(200) DEFAULT '',
        lot_car_code NVARCHAR(200) DEFAULT '',
        quantity DECIMAL(18,4) DEFAULT 0,
        job_booking_quantity DECIMAL(18,4) DEFAULT 0,
        jbk_unit_name NVARCHAR(50) DEFAULT '',
        production_unit_name NVARCHAR(50) DEFAULT '',
        status NVARCHAR(50) DEFAULT '',
        abandoned BIT DEFAULT 0,
        defect_name NVARCHAR(200) DEFAULT '',
        defect_category_name NVARCHAR(200) DEFAULT '',
        defect_cause_name NVARCHAR(200) DEFAULT '',
        job_booking_time DATETIME NULL,
        xhy_create_time DATETIME NULL,
        sync_time DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('[检验明细行] 表创建成功');
  }
}

function buildLineReplacements(record: InspectLineRecord): any {
  return {
    code: record.code || '',
    record_id: record.recordId || '',
    record_code: record.recordCode || '',
    work_order_number: record.workOrderNumber || '',
    work_order_id: record.workOrderId || '',
    item_code: record.itemCode || '',
    item_name: record.itemName || '',
    item_type: record.itemType || '',
    specification: record.specification ? JSON.stringify(record.specification) : '',
    category_id: record.categoryId || '',
    procedure_name: record.procedureName || '',
    inspect_type: record.inspectType || '',
    inspect_method: record.inspectMethod || '',
    inspect_plan_name: record.jbkInspectPlanName || '',
    lot_car_code: record.lotCarCode || '',
    quantity: record.quantity || 0,
    job_booking_quantity: record.jobBookingQuantity || 0,
    jbk_unit_name: record.jbkUnitName || '',
    production_unit_name: record.productionUnitName || '',
    status: record.status || '',
    abandoned: record.abandoned ? 1 : 0,
    defect_name: record.defectName || '',
    defect_category_name: record.defectCategoryName || '',
    defect_cause_name: record.defectCauseName || '',
    job_booking_time: record.jobBookingTime ? dayjs(record.jobBookingTime).format('YYYY-MM-DD HH:mm:ss') : null,
    xhy_create_time: record.createTime ? dayjs(record.createTime).format('YYYY-MM-DD HH:mm:ss') : null,
    sync_time: dayjs().format('YYYY-MM-DD HH:mm:ss')
  };
}

// 标准分页查询明细行（直接从新核云查询）
export const queryLines = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { conditions, sorts, start, length } = req.body;
    const result = await queryInspectLines({
      conditions: conditions || {},
      sorts: sorts || [{ sortOrder: 'DESC', sortFieldKey: 'createTime' }],
      start: start || 0,
      length: length || 20
    });
    res.json(success({
      list: result.data.list,
      start: result.data.start,
      length: result.data.length,
      recordsTotal: result.data.recordsTotal
    }, '查询检验明细行成功'));
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || '查询检验明细行失败' });
  }
};

// 同步检验明细行到本地数据库
export const syncInspectLines = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { conditions, batchSize, maxRecords } = req.body;
    await ensureInspectLineTable();

    let insertedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    const result = await fetchAllInspectLines(
      conditions || {},
      batchSize || 200,
      maxRecords || 50000,
      async (records: InspectLineRecord[], batchIndex: number, total: number) => {
        for (const record of records) {
          try {
            const [existing]: any = await sequelize.query(
              `SELECT COUNT(*) as cnt FROM xhy_inspect_line WHERE code = :code`,
              { replacements: { code: record.code } }
            );
            const replacements = buildLineReplacements(record);
            if (existing[0].cnt > 0) {
              await sequelize.query(`
                UPDATE xhy_inspect_line SET
                  record_id = :record_id, record_code = :record_code,
                  work_order_number = :work_order_number, work_order_id = :work_order_id,
                  item_code = :item_code, item_name = :item_name, item_type = :item_type,
                  specification = :specification, category_id = :category_id,
                  procedure_name = :procedure_name, inspect_type = :inspect_type,
                  inspect_method = :inspect_method, inspect_plan_name = :inspect_plan_name,
                  lot_car_code = :lot_car_code, quantity = :quantity,
                  job_booking_quantity = :job_booking_quantity,
                  jbk_unit_name = :jbk_unit_name, production_unit_name = :production_unit_name,
                  status = :status, abandoned = :abandoned,
                  defect_name = :defect_name, defect_category_name = :defect_category_name,
                  defect_cause_name = :defect_cause_name,
                  job_booking_time = :job_booking_time, xhy_create_time = :xhy_create_time,
                  sync_time = :sync_time
                WHERE code = :code
              `, { replacements });
              updatedCount++;
            } else {
              await sequelize.query(`
                INSERT INTO xhy_inspect_line (
                  code, record_id, record_code, work_order_number, work_order_id,
                  item_code, item_name, item_type, specification, category_id,
                  procedure_name, inspect_type, inspect_method, inspect_plan_name,
                  lot_car_code, quantity, job_booking_quantity,
                  jbk_unit_name, production_unit_name,
                  status, abandoned, defect_name, defect_category_name, defect_cause_name,
                  job_booking_time, xhy_create_time, sync_time
                ) VALUES (
                  :code, :record_id, :record_code, :work_order_number, :work_order_id,
                  :item_code, :item_name, :item_type, :specification, :category_id,
                  :procedure_name, :inspect_type, :inspect_method, :inspect_plan_name,
                  :lot_car_code, :quantity, :job_booking_quantity,
                  :jbk_unit_name, :production_unit_name,
                  :status, :abandoned, :defect_name, :defect_category_name, :defect_cause_name,
                  :job_booking_time, :xhy_create_time, :sync_time
                )
              `, { replacements });
              insertedCount++;
            }
          } catch (e: any) {
            errorCount++;
            console.error(`[同步明细] 记录 ${record.code} 处理失败:`, e.message);
          }
        }
      }
    );

    res.json(success({
      batches: result.batches,
      fetched: result.records.length,
      inserted: insertedCount,
      updated: updatedCount,
      errors: errorCount
    }, `明细行同步完成: 获取${result.records.length}条, 新增${insertedCount}条, 更新${updatedCount}条`));
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || '同步检验明细行失败' });
  }
};

// 获取本地已同步的检验明细行
export const getLocalInspectLines = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureInspectLineTable();

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';
    const record_code = (req.query.record_code as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(code LIKE :search OR work_order_number LIKE :search OR item_code LIKE :search OR item_name LIKE :search OR procedure_name LIKE :search OR lot_car_code LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (status) {
      conditions.push(`status = :status`);
      replacements.status = status;
    }
    if (record_code) {
      conditions.push(`record_code = :record_code`);
      replacements.record_code = record_code;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM xhy_inspect_line ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY xhy_create_time DESC) AS _row_num
        FROM xhy_inspect_line ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取检验明细行列表成功'));
  } catch (err) {
    next(err);
  }
};

// ==================== 检验报工汇总（按生产单号聚合） ====================
export const getInspectSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureInspectLineTable();

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const startDate = (req.query.startDate as string) || '';
    const endDate = (req.query.endDate as string) || '';

    const replacements: any = {};

    // 时间范围子查询：筛选包装+自检+合格且报工时间在范围内的生产单号
    let dateSubQuery = '';
    if (startDate || endDate) {
      const dateConds: string[] = [
        `procedure_name = N'包装'`,
        `inspect_type = 'SELF'`,
        `status = 'QUALIFIED'`
      ];
      if (startDate) {
        dateConds.push(`job_booking_time >= :startDate`);
        replacements.startDate = startDate;
      }
      if (endDate) {
        dateConds.push(`job_booking_time <= :endDate`);
        replacements.endDate = endDate + ' 23:59:59';
      }
      dateSubQuery = `AND work_order_number IN (
        SELECT DISTINCT work_order_number FROM xhy_inspect_line WHERE ${dateConds.join(' AND ')}
      )`;
    }

    // 汇总查询：
    // 1. 包装+自检+合格 记录作为主驱动，报工时间取自该记录
    // 2. 硫化报工数、包装不合格数 通过同一 work_order_number 关联
    const summarySQL = `
      SELECT
        work_order_number,
        MAX(CASE WHEN procedure_name = N'包装' AND inspect_type = 'SELF' AND status = 'QUALIFIED' THEN item_code ELSE NULL END) AS item_code,
        MAX(CASE WHEN procedure_name = N'包装' AND inspect_type = 'SELF' AND status = 'QUALIFIED' THEN item_name ELSE NULL END) AS item_name,
        MAX(CASE WHEN procedure_name = N'包装' AND inspect_type = 'SELF' AND status = 'QUALIFIED' THEN job_booking_time ELSE NULL END) AS last_job_booking_time,
        SUM(CASE WHEN procedure_name = N'硫化' AND inspect_type = 'SELF' AND status = 'QUALIFIED' THEN quantity ELSE 0 END) AS vulcanization_qty,
        SUM(CASE WHEN procedure_name = N'包装' AND inspect_type = 'SELF' AND status = 'QUALIFIED' THEN quantity ELSE 0 END) AS packaging_qty,
        SUM(CASE WHEN procedure_name = N'包装' AND inspect_type = 'SELF' AND status = 'UN_QUALIFIED' THEN quantity ELSE 0 END) AS packaging_defect_qty
      FROM xhy_inspect_line
      WHERE work_order_number IS NOT NULL AND work_order_number != '' ${dateSubQuery}
      GROUP BY work_order_number
      HAVING SUM(CASE WHEN procedure_name = N'包装' AND inspect_type = 'SELF' AND status = 'QUALIFIED' THEN 1 ELSE 0 END) > 0
    `;

    // 先查总数
    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) AS total FROM (${summarySQL}) AS t`,
      { replacements }
    );
    const total = countResult[0].total;

    // 分页查询
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY work_order_number DESC) AS _row_num
        FROM (${summarySQL}) AS summary
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      // 计算包装合格率
      const totalPkg = (rest.packaging_qty || 0) + (rest.packaging_defect_qty || 0);
      rest.packaging_pass_rate = totalPkg > 0
        ? parseFloat(((rest.packaging_qty || 0) / totalPkg * 100).toFixed(2))
        : null;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取检验报工汇总成功'));
  } catch (err) {
    next(err);
  }
};

// ==================== 库存明细查询 ====================

export const queryInventory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemCodes, warehouseCodes, warehouseBinCodes, batchCodes, snCodes } = req.body;

    // 至少需要一个查询条件
    const hasCondition = [itemCodes, warehouseCodes, warehouseBinCodes, batchCodes, snCodes]
      .some(arr => Array.isArray(arr) && arr.length > 0);

    if (!hasCondition) {
      res.status(400).json({ success: false, message: '请至少提供一个查询条件（物料编码/仓库编码/库位编码/批次号/序列号）' });
      return;
    }

    const result = await queryInventoryDetail({
      itemCodes: itemCodes || [],
      warehouseCodes: warehouseCodes || [],
      warehouseBinCodes: warehouseBinCodes || [],
      batchCodes: batchCodes || [],
      snCodes: snCodes || []
    });

    // 提取数据列表
    const entity = result.data?.entity || result.data;
    const list = Array.isArray(entity) ? entity : (entity?.list || entity?.items || []);

    res.json(success({
      items: list,
      total: list.length,
      raw: result.data
    }, `查询到 ${list.length} 条库存明细`));
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('新核云查询库存明细失败')) {
      const match = msg.match(/message=(.+)$/);
      res.json({ success: false, message: match ? match[1] : msg });
      return;
    }
    next(err);
  }
};
