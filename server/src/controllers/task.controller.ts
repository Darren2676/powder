import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

const fields = ['production_task_number', 'production_number', 'item_number', 'item_name', 'basic_unit', 'specifications', 'product_drawing_number', 'rubber_compound_number', 'batch_production_quota', 'planned_quantity', 'planned_completion_time', 'plan_status', 'remark'];
const headers = ['生产任务单编号', '生产计划编号', '产品编号', '产品名称', '基本单位', '规格', '产品图号', '胶料编号', '班产定额', '计划数量', '计划完成时间', '任务状态', '备注'];

// 自动生成生产任务单编号: T + YYYYMMDD + 3位序号
const generateTaskNumber = async (): Promise<string> => {
  const today = new Date();
  const prefix = 'T' + today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');

  const [rows]: any = await sequelize.query(
    `SELECT MAX(production_task_number) as max_num FROM production_task WHERE production_task_number LIKE :prefix`,
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

export const getTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';
    const approval_status = (req.query.approval_status as string) || '';

    let whereClause = '';
    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(production_task_number LIKE :search OR production_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search OR plan_status LIKE :search)`);
      replacements.search = `%${search}%`;
    }

    if (status) {
      conditions.push(`plan_status = :status`);
      replacements.status = status;
    }

    if (approval_status) {
      conditions.push(`approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }

    if (conditions.length > 0) {
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }

    const countSql = `SELECT COUNT(*) as total FROM production_task ${whereClause}`;
    const [countResult]: any = await sequelize.query(countSql, { replacements });
    const total = countResult[0].total;

    const dataSql = `
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY production_task_number DESC) AS _row_num
        FROM production_task ${whereClause}
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
    }, '获取任务列表成功'));
  } catch (err) {
    next(err);
  }
};

export const createTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, planned_completion_time, plan_status, remark } = req.body;

    if (!item_number) {
      res.status(400).json({ success: false, message: '产品编号不能为空' });
      return;
    }

    const production_task_number = await generateTaskNumber();

    const insertSql = `
      INSERT INTO production_task (production_task_number, production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, planned_completion_time, plan_status, remark, approval_status)
      VALUES (:production_task_number, :production_number, :item_number, :item_name, :basic_unit, :specifications, :product_drawing_number, :rubber_compound_number, :batch_production_quota, :planned_quantity, :planned_completion_time, :plan_status, :remark, N'草稿')
    `;

    await sequelize.query(insertSql, {
      replacements: {
        production_task_number,
        production_number: production_number || '',
        item_number,
        item_name: item_name || '',
        basic_unit: basic_unit || '',
        specifications: specifications || '',
        product_drawing_number: product_drawing_number || '',
        rubber_compound_number: rubber_compound_number || '',
        batch_production_quota: batch_production_quota || '',
        planned_quantity: planned_quantity || 0,
        planned_completion_time: planned_completion_time || null,
        plan_status: plan_status || '待执行',
        remark: remark || ''
      }
    });

    res.json(success({ production_task_number }, '创建任务成功'));
  } catch (err) {
    next(err);
  }
};

export const updateTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // 审批状态校验：只有草稿状态可以编辑
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM production_task WHERE production_task_number = :id`, { replacements: { id } });
    if (chk.length && chk[0].approval_status !== '草稿') { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return; }
    const { production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, planned_completion_time, plan_status, remark } = req.body;

    const updateSql = `
      UPDATE production_task SET
        production_number = :production_number,
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
      WHERE production_task_number = :id
    `;

    await sequelize.query(updateSql, {
      replacements: {
        id, production_number, item_number, item_name, basic_unit, specifications,
        product_drawing_number, rubber_compound_number, batch_production_quota,
        planned_quantity, planned_completion_time, plan_status, remark
      }
    });

    res.json(success(null, '更新任务成功'));
  } catch (err) {
    next(err);
  }
};

export const deleteTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // 审批状态校验：只有草稿状态可以删除
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM production_task WHERE production_task_number = :id`, { replacements: { id } });
    if (chk.length && chk[0].approval_status !== '草稿') { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return; }
    await sequelize.query(`DELETE FROM production_task WHERE production_task_number = :id`, {
      replacements: { id }
    });
    res.json(success(null, '删除任务成功'));
  } catch (err) {
    next(err);
  }
};

export const exportTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT ${fields.join(', ')} FROM production_task ORDER BY production_task_number DESC`);
    exportToExcel(items, fields, headers, 'tasks', res);
  } catch (err) { next(err); }
};

export const importTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let imported = 0;
    for (const item of rows) {
      try {
        if (!item.production_task_number) {
          item.production_task_number = await generateTaskNumber();
        }
        const [existing]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM production_task WHERE production_task_number = :production_task_number`, { replacements: { production_task_number: item.production_task_number } });
        if (existing[0].cnt > 0) {
          await sequelize.query(`UPDATE production_task SET production_number = :production_number, item_number = :item_number, item_name = :item_name, basic_unit = :basic_unit, specifications = :specifications, product_drawing_number = :product_drawing_number, rubber_compound_number = :rubber_compound_number, batch_production_quota = :batch_production_quota, planned_quantity = :planned_quantity, planned_completion_time = :planned_completion_time, plan_status = :plan_status, remark = :remark WHERE production_task_number = :production_task_number`, { replacements: item });
        } else {
          await sequelize.query(`INSERT INTO production_task (${fields.join(', ')}) VALUES (${fields.map(f => ':' + f).join(', ')})`, { replacements: item });
        }
        imported++;
      } catch (e) {}
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};

// 从计划导入
export const importFromPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { production_numbers } = req.body;
    if (!production_numbers || !Array.isArray(production_numbers) || production_numbers.length === 0) {
      res.status(400).json({ success: false, message: '请选择要导入的计划' });
      return;
    }

    const placeholders = production_numbers.map((_: string, i: number) => `:pn${i}`).join(', ');
    const replacements: any = {};
    production_numbers.forEach((pn: string, i: number) => { replacements[`pn${i}`] = pn; });

    const [plans]: any = await sequelize.query(
      `SELECT production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, planned_completion_time, plan_status, remark FROM Production_plan WHERE production_number IN (${placeholders})`,
      { replacements }
    );

    if (plans.length === 0) {
      res.status(400).json({ success: false, message: '未找到对应的计划记录' });
      return;
    }

    let imported = 0;
    for (const plan of plans) {
      try {
        const production_task_number = await generateTaskNumber();
        await sequelize.query(
          `INSERT INTO production_task (production_task_number, production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, planned_completion_time, plan_status, remark)
           VALUES (:production_task_number, :production_number, :item_number, :item_name, :basic_unit, :specifications, :product_drawing_number, :rubber_compound_number, :batch_production_quota, :planned_quantity, :planned_completion_time, :plan_status, :remark)`,
          {
            replacements: {
              production_task_number,
              production_number: plan.production_number || '',
              item_number: plan.item_number || '',
              item_name: plan.item_name || '',
              basic_unit: plan.basic_unit || '',
              specifications: plan.specifications || '',
              product_drawing_number: plan.product_drawing_number || '',
              rubber_compound_number: plan.rubber_compound_number || '',
              batch_production_quota: plan.batch_production_quota || '',
              planned_quantity: plan.planned_quantity || 0,
              planned_completion_time: plan.planned_completion_time || null,
              plan_status: '未开始',
              remark: plan.remark || ''
            }
          }
        );
        imported++;
      } catch (e) {}
    }

    res.json(success({ imported, totalCount: plans.length }, `成功从计划导入 ${imported} 条任务`));
  } catch (err) {
    next(err);
  }
};
