/**
 * 报废入库单管理控制器
 *
 * 数据来源: stock_in (stock_in_type='报废入库') + stock_in_detail
 * 审批流程复用 approval.service.ts (module='stock_in')
 * 审批回调: scrapInventoryHandler.onStockInApproved / onStockInReversed
 */
import { Request, Response } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 列表查询 ====================
export const getScrapInboundOrders = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, search = '', approval_status = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const limitNum = Number(limit);

    let whereClause = `WHERE h.stock_in_type = N'报废入库'`;
    const replacements: any = {};
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      whereClause += ` AND h.factory_id = :_factoryId`;
      replacements._factoryId = _factoryId;
    }

    if (search) {
      whereClause += ` AND (h.stock_in_number LIKE :search OR d.item_number LIKE :search OR d.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      whereClause += ` AND h.approval_status = :status`;
      replacements.status = approval_status;
    }

    // 统计
    const [statsResult]: any = await sequelize.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN h.approval_status = N'草稿' THEN 1 ELSE 0 END) as draft_count,
        SUM(CASE WHEN h.approval_status = N'待审批' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN h.approval_status = N'已审批' THEN 1 ELSE 0 END) as approved_count
      FROM stock_in h
      ${whereClause.replace('OR d.item_number LIKE :search OR d.item_name LIKE :search', '')}
    `, { replacements: { ...replacements, search: search || undefined } });

    // 分页查询 (LEFT JOIN stock_in_detail 用于搜索物料编号/名称，用 DISTINCT 去重)
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT DISTINCT h.stock_in_number, h.warehouse_number, h.warehouse_name,
          h.stock_in_type, h.stock_in_date, h.approval_status, h.accounting_period,
          h.operator, h.remark, h.creation_date, h.creation_man,
          ROW_NUMBER() OVER (ORDER BY h.creation_date DESC) AS _row_num
        FROM stock_in h
        LEFT JOIN stock_in_detail d ON h.stock_in_number = d.stock_in_number
        ${whereClause}
      ) t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
      ORDER BY t._row_num
    `, {
      replacements: { ...replacements, offset, offsetEnd: offset + limitNum },
    });

    // 清除 _row_num
    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    const stats = statsResult[0] || { total: 0, draft_count: 0, pending_count: 0, approved_count: 0 };

    res.json(success({
      items: cleanItems,
      pagination: { total: stats.total, page: Number(page), limit: limitNum },
      stats
    }));
  } catch (err) {
    console.error('获取报废入库单列表失败', err);
    res.status(500).json({ success: false, message: '获取报废入库单列表失败' });
  }
};

// ==================== 详情查询 ====================
export const getScrapInboundOrderDetail = async (req: Request, res: Response) => {
  try {
    const { stock_in_number } = req.params;
    const _factoryId = getFactoryId(req);

    const [headers]: any = await sequelize.query(
      `SELECT * FROM stock_in WHERE stock_in_number = :number AND stock_in_type = N'报废入库'${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`,
      { replacements: { number: stock_in_number, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) } }
    );

    if (!headers.length) {
      res.status(404).json({ success: false, message: '报废入库单不存在' });
      return;
    }

    const [details]: any = await sequelize.query(
      `SELECT * FROM stock_in_detail WHERE stock_in_number = :number ORDER BY line_number`,
      { replacements: { number: stock_in_number } }
    );

    // 查找关联的不合格品记录
    const [ncRecords]: any = await sequelize.query(
      `SELECT nonconforming_number, source_type, source_number, unqualified_quantity, handling_method
       FROM nonconforming_product WHERE stock_in_number = :number`,
      { replacements: { number: stock_in_number } }
    );

    res.json(success({
      header: headers[0],
      details,
      nonconforming: ncRecords
    }));
  } catch (err) {
    console.error('获取报废入库单详情失败', err);
    res.status(500).json({ success: false, message: '获取报废入库单详情失败' });
  }
};

// ==================== 生成入库单号 ====================
const generateStockInNumber = async (factoryCode: string = ''): Promise<string> => {
  const today = new Date();
  const fc = factoryCode ? factoryCode.toUpperCase() : '';
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `SI${fc}-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(stock_in_number) as max_num FROM stock_in WHERE stock_in_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );

  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 新建报废入库单 ====================
export const createScrapInboundOrder = async (req: Request, res: Response) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const { details, accounting_period, remark } = req.body;
    const username = (req as any).user?.username || '';

    // 校验
    if (!details || !Array.isArray(details) || details.length === 0) {
      res.status(400).json({ success: false, message: '请添加至少一条明细' });
      return;
    }

    for (const d of details) {
      if (!d.item_number) {
        res.status(400).json({ success: false, message: '物料编码不能为空' });
        return;
      }
      if (!d.stock_in_quantity || Number(d.stock_in_quantity) <= 0) {
        res.status(400).json({ message: '报废数量必须大于0', success: false });
        return;
      }
    }

    // 查询报废仓库
    const [scrapWarehouses]: any = await sequelize.query(
      `SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE warehouse_type = N'报废仓库' OR warehouse_number LIKE 'SCRAP%' ORDER BY warehouse_number`
    );
    if (!scrapWarehouses.length) {
      res.status(400).json({ success: false, message: '未找到报废仓库，请先在仓库管理中创建类型为"报废仓库"的仓库' });
      return;
    }
    const scrapWarehouse = scrapWarehouses[0];

    const stockInNumber = await generateStockInNumber(factoryCode);

    const transaction = await sequelize.transaction();
    try {
      // 插入头
      await sequelize.query(`
        INSERT INTO stock_in (
          stock_in_number, purchase_order_number, supplier_number, supplier_name,
          warehouse_number, warehouse_name, stock_in_date, stock_in_type,
          approval_status, [condition], operator, remark,
          creation_date, creation_man, accounting_period, factory_id
        ) VALUES (
          :stock_in_number, N'', N'', N'',
          :warehouse_number, :warehouse_name, CAST(GETDATE() AS DATE), N'报废入库',
          N'草稿', N'启用', :operator, :remark,
          GETDATE(), :creation_man, :accounting_period, :factory_id
        )
      `, {
        replacements: {
          stock_in_number: stockInNumber,
          warehouse_number: scrapWarehouse.warehouse_number,
          warehouse_name: scrapWarehouse.warehouse_name,
          operator: username,
          remark: remark || '',
          creation_man: username,
          accounting_period: accounting_period || '',
          factory_id: _factoryId
        },
        transaction
      });

      // 插入明细
      for (let i = 0; i < details.length; i++) {
        const d = details[i];
        await sequelize.query(`
          INSERT INTO stock_in_detail (
            stock_in_number, line_number, purchase_order_number, purchase_detail_id,
            item_number, item_name, specifications, basic_unit,
            order_quantity, received_quantity, stock_in_quantity,
            qualified_quantity, unqualified_quantity, batch_number,
            warehouse_number, warehouse_name, remark
          ) VALUES (
            :stock_in_number, :line_number, N'', 0,
            :item_number, :item_name, :specifications, :basic_unit,
            0, 0, :stock_in_quantity,
            0, :unqualified_quantity, N'',
            :warehouse_number, :warehouse_name, N''
          )
        `, {
          replacements: {
            stock_in_number: stockInNumber,
            line_number: (i + 1) * 10,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            stock_in_quantity: Number(d.stock_in_quantity),
            unqualified_quantity: Number(d.stock_in_quantity),
            warehouse_number: scrapWarehouse.warehouse_number,
            warehouse_name: scrapWarehouse.warehouse_name
          },
          transaction
        });
      }

      await transaction.commit();
      console.log('报废入库单创建成功:', stockInNumber);
      res.json(success({ stock_in_number: stockInNumber }, '报废入库单创建成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err: any) {
    console.error('创建报废入库单失败', err);
    res.status(500).json({ success: false, message: err.message || '创建报废入库单失败' });
  }
};

// ==================== 删除报废入库单 ====================
export const deleteScrapInboundOrder = async (req: Request, res: Response) => {
  try {
    const { stock_in_number } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    // 校验状态
    const [existing]: any = await sequelize.query(
      `SELECT approval_status FROM stock_in WHERE stock_in_number = :number AND stock_in_type = N'报废入库'${factoryCond}`,
      { replacements: { number: stock_in_number, ...factoryReps } }
    );

    if (!existing.length) {
      res.status(404).json({ success: false, message: '报废入库单不存在' });
      return;
    }
    if (existing[0].approval_status !== '草稿') {
      res.status(400).json({ success: false, message: '只能删除草稿状态的报废入库单' });
      return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(
        `DELETE FROM stock_in_detail WHERE stock_in_number = :number`,
        { replacements: { number: stock_in_number }, transaction }
      );
      await sequelize.query(
        `DELETE FROM stock_in WHERE stock_in_number = :number${factoryCond}`,
        { replacements: { number: stock_in_number, ...factoryReps }, transaction }
      );
      await transaction.commit();
      console.log('报废入库单删除成功:', stock_in_number);
      res.json(success(null, '删除成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) {
    console.error('删除报废入库单失败', err);
    res.status(500).json({ success: false, message: '删除报废入库单失败' });
  }
};
