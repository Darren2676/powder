import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

const fields = ['production_number', 'item_number', 'item_name', 'basic_unit', 'specifications', 'product_drawing_number', 'rubber_compound_number', 'batch_production_quota', 'planned_quantity', 'planned_completion_time', 'plan_status', 'remark'];
const headers = ['生产计划编号', '产品编号', '产品名称', '基本单位', '规格', '产品图号', '胶料编号', '班产定额', '计划数量', '计划完成时间', '计划状态', '备注'];

// 自动生成生产计划编号: M + YYYYMMDD + 3位序号
const generateProductionNumber = async (): Promise<string> => {
  const today = new Date();
  const prefix = 'M' + today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');

  const [rows]: any = await sequelize.query(
    `SELECT MAX(production_number) as max_num FROM Production_plan WHERE production_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }

  return prefix + String(seq).padStart(3, '0');
};

export const getPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';

    let whereClause = '';
    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(production_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search OR plan_status LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      conditions.push(`approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }
    if (conditions.length) whereClause = 'WHERE ' + conditions.join(' AND ');

    const countSql = `SELECT COUNT(*) as total FROM Production_plan ${whereClause}`;
    const [countResult]: any = await sequelize.query(countSql, { replacements });
    const total = countResult[0].total;

    const dataSql = `
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY production_number DESC) AS _row_num
        FROM Production_plan ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(dataSql, {
      replacements: { ...replacements, offset, offsetEnd: offset + limit }
    });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取计划列表成功'));
  } catch (err) {
    next(err);
  }
};

export const createPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, planned_completion_time, plan_status, remark } = req.body;

    if (!item_number) {
      res.status(400).json({ success: false, message: '产品编号不能为空' });
      return;
    }

    const production_number = await generateProductionNumber();

    const insertSql = `
      INSERT INTO Production_plan (production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, planned_completion_time, plan_status, remark, approval_status)
      VALUES (:production_number, :item_number, :item_name, :basic_unit, :specifications, :product_drawing_number, :rubber_compound_number, :batch_production_quota, :planned_quantity, :planned_completion_time, :plan_status, :remark, N'草稿')
    `;

    await sequelize.query(insertSql, {
      replacements: {
        production_number,
        item_number,
        item_name: item_name || '',
        basic_unit: basic_unit || '',
        specifications: specifications || '',
        product_drawing_number: product_drawing_number || '',
        rubber_compound_number: rubber_compound_number || '',
        batch_production_quota: batch_production_quota || '',
        planned_quantity: planned_quantity || 0,
        planned_completion_time: planned_completion_time || null,
        plan_status: plan_status || '',
        remark: remark || ''
      }
    });

    res.json(success({ production_number }, '创建计划成功'));
  } catch (err) {
    next(err);
  }
};

export const updatePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // 审批状态校验：只有草稿状态可以编辑
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM Production_plan WHERE production_number = :id`, { replacements: { id } });
    if (chk.length && chk[0].approval_status !== '草稿') { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return; }
    const { item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, planned_completion_time, plan_status, remark } = req.body;

    const updateSql = `
      UPDATE Production_plan SET
        item_number = :item_number,
        item_name = :item_name,
        basic_unit = :basic_unit,
        specifications = :specifications,
        product_drawing_number = :product_drawing_number,
        rubber_compound_number = :rubber_compound_number,
        batch_production_quota = :batch_production_quota,
        planned_quantity = :planned_quantity,
        planned_completion_time = :planned_completion_time,
        plan_status = :plan_status,
        remark = :remark
      WHERE production_number = :id
    `;

    await sequelize.query(updateSql, {
      replacements: {
        id,
        item_number,
        item_name,
        basic_unit,
        specifications,
        product_drawing_number,
        rubber_compound_number,
        batch_production_quota,
        planned_quantity,
        planned_completion_time,
        plan_status,
        remark
      }
    });

    res.json(success(null, '更新计划成功'));
  } catch (err) {
    next(err);
  }
};

export const deletePlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // 审批状态校验：只有草稿状态可以删除
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM Production_plan WHERE production_number = :id`, { replacements: { id } });
    if (chk.length && chk[0].approval_status !== '草稿') { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return; }
    await sequelize.query(`DELETE FROM Production_plan WHERE production_number = :id`, {
      replacements: { id }
    });
    res.json(success(null, '删除计划成功'));
  } catch (err) {
    next(err);
  }
};

export const exportPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT ${fields.join(', ')} FROM Production_plan ORDER BY production_number DESC`);
    exportToExcel(items, fields, headers, 'plans', res);
  } catch (err) { next(err); }
};

export const importPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let imported = 0;
    for (const item of rows) {
      try {
        if (!item.production_number) {
          item.production_number = await generateProductionNumber();
        }
        const [existing]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM Production_plan WHERE production_number = :production_number`, { replacements: { production_number: item.production_number } });
        if (existing[0].cnt > 0) {
          await sequelize.query(`UPDATE Production_plan SET item_number = :item_number, item_name = :item_name, basic_unit = :basic_unit, specifications = :specifications, product_drawing_number = :product_drawing_number, rubber_compound_number = :rubber_compound_number, batch_production_quota = :batch_production_quota, planned_quantity = :planned_quantity, planned_completion_time = :planned_completion_time, plan_status = :plan_status, remark = :remark WHERE production_number = :production_number`, { replacements: item });
        } else {
          await sequelize.query(`INSERT INTO Production_plan (${fields.join(', ')}) VALUES (${fields.map(f => ':' + f).join(', ')})`, { replacements: item });
        }
        imported++;
      } catch (e) {}
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};
