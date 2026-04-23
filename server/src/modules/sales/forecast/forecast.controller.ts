import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { generateForecastNumber } from '@/services/documentNumber.service';
import { consumeForecastOnOrderApproval, recoverForecastOnOrderReversal } from '@/services/forecast.service';

// Re-export from service for backward compatibility
export { consumeForecastOnOrderApproval, recoverForecastOnOrderReversal } from '@/services/forecast.service';

// ==================== 分页列表 ====================
export const getForecasts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const customer_number = (req.query.customer_number as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(forecast_number LIKE :search OR customer_name LIKE :search OR creation_man LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      conditions.push(`approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }
    if (customer_number) {
      conditions.push(`customer_number = :customer_number`);
      replacements.customer_number = customer_number;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM sales_forecast ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC, forecast_number DESC) AS _row_num
        FROM sales_forecast ${whereClause}
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
    }, '获取销售预测列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情(主表+明细) ====================
export const getForecastDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const [headers]: any = await sequelize.query(
      `SELECT * FROM sales_forecast WHERE forecast_number = :id`,
      { replacements: { id } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '预测单不存在' }); return; }

    const customerNumber = headers[0].customer_number;
    const [details]: any = await sequelize.query(
      `SELECT d.id, d.forecast_number, d.line_number, d.item_number, d.item_name, d.specifications,
              d.basic_unit, d.product_drawing_number, d.start_date, d.end_date,
              d.forecast_quantity, d.consumed_quantity, d.remaining_quantity, d.consumption_status, d.remark, d.status,
              COALESCE(NULLIF(d.customer_item_number, ''), cm.customer_item_number) as customer_item_number,
              COALESCE(NULLIF(d.customer_item_description, ''), cm.customer_item_description) as customer_item_description
       FROM sales_forecast_detail d
       LEFT JOIN customer_material_mapping cm ON cm.customer_number = :customerNumber AND cm.item_number = d.item_number
       WHERE d.forecast_number = :id ORDER BY d.line_number`,
      { replacements: { id, customerNumber } }
    );

    res.json(success({ ...headers[0], details }, '获取预测详情成功'));
  } catch (err) { next(err); }
};

// ==================== 新建 ====================
export const createForecast = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.customer_number) { res.status(400).json({ success: false, message: '客户不能为空' }); return; }
    if (!b.details || !Array.isArray(b.details) || b.details.length === 0) {
      res.status(400).json({ success: false, message: '预测明细不能为空' }); return;
    }

    const forecast_number = await generateForecastNumber();
    const creation_man = (req as any).user?.real_name || (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO sales_forecast (forecast_number, customer_number, customer_name, forecast_date, approval_status, [condition], remark, creation_date, creation_man)
        VALUES (:forecast_number, :customer_number, :customer_name, :forecast_date, N'草稿', N'启用', :remark, GETDATE(), :creation_man)
      `, {
        replacements: {
          forecast_number,
          customer_number: b.customer_number,
          customer_name: b.customer_name || '',
          forecast_date: b.forecast_date || null,
          remark: b.remark || '',
          creation_man
        }, transaction
      });

      for (let i = 0; i < b.details.length; i++) {
        const d = b.details[i];
        const qty = Number(d.forecast_quantity) || 0;
        await sequelize.query(`
          INSERT INTO sales_forecast_detail (forecast_number, line_number, item_number, item_name, specifications, basic_unit, product_drawing_number, start_date, end_date, forecast_quantity, consumed_quantity, remaining_quantity, consumption_status, remark, customer_item_number, customer_item_description, status)
          VALUES (:forecast_number, :line_number, :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number, :start_date, :end_date, :forecast_quantity, 0, :remaining_quantity, N'未消耗', :remark, :customer_item_number, :customer_item_description, N'未开始')
        `, {
          replacements: {
            forecast_number,
            line_number: d.line_number || (i + 1) * 10,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            product_drawing_number: d.product_drawing_number || '',
            start_date: d.start_date,
            end_date: d.end_date,
            forecast_quantity: qty,
            remaining_quantity: qty,
            remark: d.remark || '',
            customer_item_number: d.customer_item_number || '',
            customer_item_description: d.customer_item_description || ''
          }, transaction
        });
      }

      await transaction.commit();
      res.json(success({ forecast_number }, '创建销售预测成功'));
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

// ==================== 更新(仅草稿) ====================
export const updateForecast = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM sales_forecast WHERE forecast_number = :id`,
      { replacements: { id } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '预测单不存在' }); return; }
    if (chk[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '只有草稿状态可以编辑' }); return; }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE sales_forecast SET customer_number = :customer_number, customer_name = :customer_name,
          forecast_date = :forecast_date, remark = :remark
        WHERE forecast_number = :id
      `, {
        replacements: {
          id,
          customer_number: b.customer_number || '',
          customer_name: b.customer_name || '',
          forecast_date: b.forecast_date || null,
          remark: b.remark || ''
        }, transaction
      });

      // 保存各行的 status 值（delete-then-reinsert 模式需保留）
      const [oldDetails]: any = await sequelize.query(
        `SELECT line_number, item_number, status FROM sales_forecast_detail WHERE forecast_number = :id`,
        { replacements: { id }, transaction }
      );
      const statusMap = new Map<string, string>();
      for (const od of oldDetails) {
        statusMap.set(`${od.line_number}_${od.item_number}`, od.status || '未开始');
      }

      // 删除旧明细，重新插入
      await sequelize.query(`DELETE FROM sales_forecast_detail WHERE forecast_number = :id`, { replacements: { id }, transaction });

      if (b.details && Array.isArray(b.details)) {
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          const qty = Number(d.forecast_quantity) || 0;
          const lineNum = d.line_number || (i + 1) * 10;
          const restoredStatus = d.status || statusMap.get(`${lineNum}_${d.item_number}`) || '未开始';
          await sequelize.query(`
            INSERT INTO sales_forecast_detail (forecast_number, line_number, item_number, item_name, specifications, basic_unit, product_drawing_number, start_date, end_date, forecast_quantity, consumed_quantity, remaining_quantity, consumption_status, remark, customer_item_number, customer_item_description, status)
            VALUES (:forecast_number, :line_number, :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number, :start_date, :end_date, :forecast_quantity, 0, :remaining_quantity, N'未消耗', :remark, :customer_item_number, :customer_item_description, :status)
          `, {
            replacements: {
              forecast_number: id,
              line_number: lineNum,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              product_drawing_number: d.product_drawing_number || '',
              start_date: d.start_date,
              end_date: d.end_date,
              forecast_quantity: qty,
              remaining_quantity: qty,
              remark: d.remark || '',
              customer_item_number: d.customer_item_number || '',
              customer_item_description: d.customer_item_description || '',
              status: restoredStatus
            }, transaction
          });
        }
      }

      await transaction.commit();
      res.json(success(null, '更新销售预测成功'));
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

// ==================== 删除(仅草稿) ====================
export const deleteForecast = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM sales_forecast WHERE forecast_number = :id`,
      { replacements: { id } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '预测单不存在' }); return; }
    if (chk[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '只有草稿状态可以删除' }); return; }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM sales_forecast_detail WHERE forecast_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM sales_forecast WHERE forecast_number = :id`, { replacements: { id }, transaction });
      await transaction.commit();
      res.json(success(null, '删除销售预测成功'));
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

// ==================== 消耗记录查询 ====================
export const getForecastConsumptionLog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [logs]: any = await sequelize.query(
      `SELECT * FROM forecast_consumption WHERE forecast_number = :id ORDER BY consumed_date DESC`,
      { replacements: { id } }
    );
    res.json(success(logs, '获取消耗记录成功'));
  } catch (err) { next(err); }
};
// ==================== 阶段4: 订单反审批恢复预测 ====================
// ==================== 明细分页列表 ====================
export const getForecastDetailsPage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', consumption_status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = `WHERE h.approval_status = N'已审批'`;
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (h.forecast_number LIKE :search OR d.item_number LIKE :search OR d.item_name LIKE :search OR h.customer_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (consumption_status) {
      const statusArr = String(consumption_status).split(',').filter(Boolean);
      if (statusArr.length === 1) {
        whereClause += ` AND d.consumption_status = :consumption_status`;
        replacements.consumption_status = statusArr[0];
      } else if (statusArr.length > 1) {
        const placeholders = statusArr.map((_: string, i: number) => `:cs${i}`).join(', ');
        whereClause += ` AND d.consumption_status IN (${placeholders})`;
        statusArr.forEach((s: string, i: number) => { replacements[`cs${i}`] = s; });
      }
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM sales_forecast_detail d
       INNER JOIN sales_forecast h ON h.forecast_number = d.forecast_number
       ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT d.id, d.forecast_number, d.line_number, d.item_number, d.item_name, d.specifications,
               d.basic_unit, d.product_drawing_number, d.start_date, d.end_date,
               d.forecast_quantity, d.consumed_quantity, d.remaining_quantity, d.consumption_status, d.remark, d.status,
               h.customer_number, h.customer_name, h.forecast_date, h.approval_status,
               COALESCE(NULLIF(d.customer_item_number, ''), cm.customer_item_number) as customer_item_number,
               COALESCE(NULLIF(d.customer_item_description, ''), cm.customer_item_description) as customer_item_description,
               ROW_NUMBER() OVER (ORDER BY h.forecast_number, d.line_number) AS _row_num
        FROM sales_forecast_detail d
        INNER JOIN sales_forecast h ON h.forecast_number = d.forecast_number
        LEFT JOIN customer_material_mapping cm ON cm.customer_number = h.customer_number AND cm.item_number = d.item_number
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: pageSize
    }));
  } catch (err) { next(err); }
};

// ==================== 导出选中销售预测明细 ====================
export const exportForecastDetailsSelected = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      res.status(400).json({ success: false, message: '请选择要导出的记录' }); return;
    }
    if (ids.length > 1000) {
      res.status(400).json({ success: false, message: '单次导出不能超过1000条' }); return;
    }
    const replacements: any = {};
    ids.forEach((id: any, i: number) => { replacements[`id${i}`] = id; });
    const placeholders = ids.map((_: any, i: number) => `:id${i}`).join(', ');

    const [items]: any = await sequelize.query(`
      SELECT d.forecast_number, d.line_number, d.item_number, d.item_name, d.specifications,
             d.basic_unit, d.product_drawing_number, d.start_date, d.end_date,
             d.forecast_quantity, d.consumed_quantity, d.remaining_quantity, d.consumption_status, d.status, d.remark,
             h.customer_name, h.forecast_date
      FROM sales_forecast_detail d
      INNER JOIN sales_forecast h ON h.forecast_number = d.forecast_number
      WHERE d.id IN (${placeholders})
      ORDER BY d.forecast_number, d.line_number
    `, { replacements });

    const fields = [
      'forecast_number', 'line_number', 'customer_name', 'item_number', 'item_name',
      'specifications', 'basic_unit', 'product_drawing_number',
      'forecast_quantity', 'consumed_quantity', 'remaining_quantity',
      'consumption_status', 'status', 'start_date', 'end_date', 'forecast_date', 'remark'
    ];
    const headers = [
      '预测单号', '行号', '客户名称', '产品编号', '产品名称',
      '规格', '单位', '产品图号',
      '预测数量', '已消耗', '剩余数量',
      '消耗状态', '计划状态', '开始日期', '结束日期', '预测日期', '备注'
    ];
    exportToExcel(items, fields, headers, 'forecast_details_selected', res);
  } catch (err) { next(err); }
};

// ==================== 新建单条明细 ====================
export const addForecastDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const forecastNumber = req.params.id as string;
    const b = req.body;

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM sales_forecast WHERE forecast_number = :id`,
      { replacements: { id: forecastNumber } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '预测单不存在' }); return; }
    if (chk[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '只有草稿状态可以新增明细' }); return; }

    // 获取当前最大行号
    const [maxRow]: any = await sequelize.query(
      `SELECT MAX(line_number) as max_ln FROM sales_forecast_detail WHERE forecast_number = :id`,
      { replacements: { id: forecastNumber } }
    );
    const nextLine = (maxRow[0]?.max_ln || 0) + 10;

    const qty = Number(b.forecast_quantity) || 0;
    await sequelize.query(`
      INSERT INTO sales_forecast_detail (forecast_number, line_number, item_number, item_name, specifications, basic_unit, product_drawing_number, start_date, end_date, forecast_quantity, consumed_quantity, remaining_quantity, consumption_status, remark, status)
      VALUES (:forecast_number, :line_number, :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number, :start_date, :end_date, :forecast_quantity, 0, :remaining_quantity, N'未消耗', :remark, N'未开始')
    `, {
      replacements: {
        forecast_number: forecastNumber,
        line_number: b.line_number || nextLine,
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        specifications: b.specifications || '',
        basic_unit: b.basic_unit || '',
        product_drawing_number: b.product_drawing_number || '',
        start_date: b.start_date || null,
        end_date: b.end_date || null,
        forecast_quantity: qty,
        remaining_quantity: qty,
        remark: b.remark || ''
      }
    });

    res.json(success(null, '新增预测明细成功'));
  } catch (err) { next(err); }
};

// ==================== 更新单条明细 ====================
export const updateForecastDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const detailId = req.params.detailId as string;
    const b = req.body;

    // 检查明细存在且主表状态
    const [detail]: any = await sequelize.query(
      `SELECT d.id, d.forecast_number, d.consumed_quantity, h.approval_status
       FROM sales_forecast_detail d
       INNER JOIN sales_forecast h ON h.forecast_number = d.forecast_number
       WHERE d.id = :id`,
      { replacements: { id: detailId } }
    );
    if (!detail.length) { res.status(404).json({ success: false, message: '明细不存在' }); return; }
    if (detail[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '只有草稿状态可以编辑明细' }); return; }

    const qty = Number(b.forecast_quantity) || 0;
    const consumed = Number(detail[0].consumed_quantity) || 0;

    await sequelize.query(`
      UPDATE sales_forecast_detail SET
        item_number = :item_number, item_name = :item_name, specifications = :specifications,
        basic_unit = :basic_unit, product_drawing_number = :product_drawing_number,
        start_date = :start_date, end_date = :end_date,
        forecast_quantity = :forecast_quantity, remaining_quantity = :remaining_quantity,
        remark = :remark, customer_item_number = :customer_item_number, customer_item_description = :customer_item_description
      WHERE id = :id
    `, {
      replacements: {
        id: detailId,
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        specifications: b.specifications || '',
        basic_unit: b.basic_unit || '',
        product_drawing_number: b.product_drawing_number || '',
        start_date: b.start_date || null,
        end_date: b.end_date || null,
        forecast_quantity: qty,
        remaining_quantity: qty - consumed,
        remark: b.remark || '',
        customer_item_number: b.customer_item_number || '',
        customer_item_description: b.customer_item_description || ''
      }
    });

    res.json(success(null, '更新预测明细成功'));
  } catch (err) { next(err); }
};

export const deleteForecastDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const [detail]: any = await sequelize.query(
      `SELECT d.id, h.approval_status
       FROM sales_forecast_detail d
       INNER JOIN sales_forecast h ON h.forecast_number = d.forecast_number
       WHERE d.id = :id`,
      { replacements: { id: detailId } }
    );
    if (!detail.length) { res.status(404).json({ success: false, message: '明细不存在' }); return; }
    if (detail[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '只有草稿状态可以删除明细' }); return; }

    await sequelize.query(`DELETE FROM sales_forecast_detail WHERE id = :id`, { replacements: { id: detailId } });
    res.json(success(null, '删除预测明细成功'));
  } catch (err) { next(err); }
};
