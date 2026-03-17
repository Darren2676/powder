import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

const mouldOwnFields = [
  'item_number', 'item_name', 'product_item_number', 'product_net_weight',
  'unit_consumption', 'formed_part_specifications', 'formed_part_materia_consumption',
  'formed_parts_number', 'design_cavities_number', 'actual_cavities_number',
  'actual_operation_frequency', 'design_operation_frequency',
  'design_production_number', 'actual_production_number', 'equipment_type'
];

const selectColumns = `
  m.item_number, m.item_name, m.product_item_number, m.product_net_weight,
  m.unit_consumption, m.formed_part_specifications, m.formed_part_materia_consumption,
  m.formed_parts_number, m.design_cavities_number, m.actual_cavities_number,
  m.actual_operation_frequency, m.design_operation_frequency,
  m.design_production_number, m.actual_production_number, m.equipment_type,
  im.item_number AS product_number, im.item_name AS product_name,
  im.item_class_number AS product_class_number, im.item_class_name AS product_class_name, im.item_properties AS product_properties,
  im.basic_unit, im.specifications, pe.product_drawing_number,
  pe.rubber_compound_number, pe.batch_production_quota, pe.standard_pass_rate
`;

const joinClause = `FROM mould m LEFT JOIN item_master im ON m.product_item_number = im.item_number LEFT JOIN product_ext pe ON im.item_number = pe.item_number`;

export const getMoulds = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';

    let whereClause = '';
    const replacements: any = {};

    if (search) {
      whereClause = `WHERE m.item_number LIKE :search OR m.item_name LIKE :search OR m.product_item_number LIKE :search OR im.item_name LIKE :search`;
      replacements.search = `%${search}%`;
    }

    const countSql = `SELECT COUNT(*) as total ${joinClause} ${whereClause}`;
    const [countResult]: any = await sequelize.query(countSql, { replacements });
    const total = countResult[0].total;

    const dataSql = `
      SELECT * FROM (
        SELECT ${selectColumns}, ROW_NUMBER() OVER (ORDER BY m.item_number) AS _row_num
        ${joinClause} ${whereClause}
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
    }, '获取模具列表成功'));
  } catch (err) {
    next(err);
  }
};

export const createMould = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body;
    const item_number = body.item_number;

    if (!item_number) {
      res.status(400).json({ success: false, message: '模具编号不能为空' });
      return;
    }

    const [existing]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM mould WHERE item_number = :item_number`,
      { replacements: { item_number } }
    );
    if (existing[0].cnt > 0) {
      res.status(400).json({ success: false, message: '模具编号已存在' });
      return;
    }

    const cols = mouldOwnFields.join(', ');
    const vals = mouldOwnFields.map(f => ':' + f).join(', ');
    const replacements: any = {};
    for (const f of mouldOwnFields) {
      replacements[f] = body[f] || '';
    }

    await sequelize.query(`INSERT INTO mould (${cols}) VALUES (${vals})`, { replacements });

    res.json(success(null, '创建模具成功'));
  } catch (err) {
    next(err);
  }
};

export const updateMould = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const body = req.body;

    const setClauses = mouldOwnFields.filter(f => f !== 'item_number').map(f => `${f} = :${f}`).join(', ');
    const replacements: any = { id };
    for (const f of mouldOwnFields) {
      if (f !== 'item_number') {
        replacements[f] = body[f] || '';
      }
    }

    await sequelize.query(`UPDATE mould SET ${setClauses} WHERE item_number = :id`, { replacements });

    res.json(success(null, '更新模具成功'));
  } catch (err) {
    next(err);
  }
};

export const deleteMould = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM mould WHERE item_number = :id`, {
      replacements: { id }
    });
    res.json(success(null, '删除模具成功'));
  } catch (err) {
    next(err);
  }
};

export const exportMoulds = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE m.item_number LIKE :search OR m.item_name LIKE :search OR m.product_item_number LIKE :search OR im.item_name LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const sql = `SELECT ${selectColumns} ${joinClause} ${whereClause} ORDER BY m.item_number`;
    const [items]: any = await sequelize.query(sql, { replacements });

    const exportFields = [
      'item_number', 'item_name', 'product_item_number', 'product_net_weight',
      'unit_consumption', 'formed_part_specifications', 'formed_part_materia_consumption',
      'formed_parts_number', 'design_cavities_number', 'actual_cavities_number',
      'actual_operation_frequency', 'design_operation_frequency',
      'design_production_number', 'actual_production_number', 'equipment_type',
      'product_name', 'product_class_number', 'product_class_name', 'product_properties',
      'basic_unit', 'specifications', 'product_drawing_number',
      'rubber_compound_number', 'batch_production_quota', 'standard_pass_rate'
    ];
    const exportHeaders = [
      '模具编号', '模具名称', '产品编号', '产品净重',
      '单耗', '成型件规格', '成型件单耗',
      '成型件数量', '设计模穴数', '实际模穴数',
      '实际模次', '设计模次',
      '理论班产', '实际班产', '设备类型',
      '产品名称', '产品分类编号', '产品分类名称', '产品属性',
      '基本单位', '规格', '产品图号',
      '胶料编号', '班产定额', '标准合格率'
    ];
    exportToExcel(items, exportFields, exportHeaders, 'moulds', res);
  } catch (err) { next(err); }
};

export const importMoulds = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const importHeaders = [
      '模具编号', '模具名称', '产品编号', '产品净重',
      '单耗', '成型件规格', '成型件单耗',
      '成型件数量', '设计模穴数', '实际模穴数',
      '实际模次', '设计模次',
      '理论班产', '实际班产', '设备类型'
    ];
    const rows = parseExcelFile(req.file.buffer, mouldOwnFields, importHeaders);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let imported = 0;
    for (const item of rows) {
      try {
        if (!item.item_number) continue;
        const [existing]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM mould WHERE item_number = :item_number`, { replacements: { item_number: item.item_number } });
        const setClauses = mouldOwnFields.filter(f => f !== 'item_number').map(f => `${f} = :${f}`).join(', ');
        if (existing[0].cnt > 0) {
          await sequelize.query(`UPDATE mould SET ${setClauses} WHERE item_number = :item_number`, { replacements: item });
        } else {
          const cols = mouldOwnFields.join(', ');
          const vals = mouldOwnFields.map(f => ':' + f).join(', ');
          await sequelize.query(`INSERT INTO mould (${cols}) VALUES (${vals})`, { replacements: item });
        }
        imported++;
      } catch (e) {}
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};
