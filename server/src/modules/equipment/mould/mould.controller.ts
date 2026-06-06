import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';
import { getFactoryId } from '../../../utils/factoryWhere.util';

const mouldOwnFields = [
  'item_number', 'item_name', 'product_item_number', 'product_net_weight',
  'unit_consumption', 'formed_part_number', 'formed_part_specifications', 'formed_part_materia_consumption',
  'formed_parts_number', 'design_cavities_number', 'actual_cavities_number',
  'actual_operation_frequency', 'design_operation_frequency',
  'design_production_number', 'actual_production_number', 'equipment_type', 'mfg_bom_number'
];

const selectColumns = `
  m.item_number, m.item_name, m.product_item_number, m.product_net_weight,
  m.unit_consumption, m.formed_part_number, m.formed_part_specifications, m.formed_part_materia_consumption,
  m.formed_parts_number, m.design_cavities_number, m.actual_cavities_number,
  m.actual_operation_frequency, m.design_operation_frequency,
  m.design_production_number, m.actual_production_number, m.equipment_type, m.mfg_bom_number,
  m.approval_status,
  m.total_strokes, m.max_strokes, m.life_status,
  m.last_maintenance_date, m.next_maintenance_date, m.maintenance_cycle_days,
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
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      whereClause = `WHERE m.factory_id = :_factoryId`;
      replacements._factoryId = _factoryId;
    }

    if (search) {
      whereClause = (whereClause ? whereClause + ' AND' : 'WHERE') + ` (m.item_number LIKE :search OR m.item_name LIKE :search OR m.product_item_number LIKE :search OR im.item_name LIKE :search OR m.mfg_bom_number LIKE :search)`;
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

    const _factoryId = getFactoryId(req);
    const cols = mouldOwnFields.join(', ') + ', factory_id';
    const vals = mouldOwnFields.map(f => ':' + f).join(', ') + ', :factory_id';
    const replacements: any = {};
    for (const f of mouldOwnFields) {
      replacements[f] = body[f] || '';
    }
    replacements.factory_id = _factoryId;

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

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM mould WHERE item_number = :id`,
      { replacements: { id } }
    );
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
      res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' });
      return;
    }

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

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM mould WHERE item_number = :id`,
      { replacements: { id } }
    );
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
      res.status(403).json({ success: false, message: '已审核的记录不允许删除，请先撤消审核' });
      return;
    }

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
    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      whereClause = `WHERE m.factory_id = :_factoryId`;
      replacements._factoryId = _factoryId;
    }
    if (search) {
      whereClause = (whereClause ? whereClause + ' AND' : 'WHERE') + ` (m.item_number LIKE :search OR m.item_name LIKE :search OR m.product_item_number LIKE :search OR im.item_name LIKE :search OR m.mfg_bom_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    const sql = `SELECT ${selectColumns} ${joinClause} ${whereClause} ORDER BY m.item_number`;
    const [items]: any = await sequelize.query(sql, { replacements });

    const exportFields = [
      'item_number', 'item_name', 'product_item_number', 'product_net_weight',
      'unit_consumption', 'formed_part_number', 'formed_part_specifications', 'formed_part_materia_consumption',
      'formed_parts_number', 'design_cavities_number', 'actual_cavities_number',
      'actual_operation_frequency', 'design_operation_frequency',
      'design_production_number', 'actual_production_number', 'equipment_type', 'mfg_bom_number',
      'product_name', 'product_class_number', 'product_class_name', 'product_properties',
      'basic_unit', 'specifications', 'product_drawing_number',
      'rubber_compound_number', 'batch_production_quota', 'standard_pass_rate'
    ];
    const exportHeaders = [
      '模具编号', '模具名称', '产品编号', '产品净重',
      '单耗', '成型件编号', '成型件规格', '成型件单耗',
      '成型件数量', '设计模穴数', '实际模穴数',
      '实际模次', '设计模次',
      '理论班产', '实际班产', '设备类型', '制造BOM编号',
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
      '单耗', '成型件编号', '成型件规格', '成型件单耗',
      '成型件数量', '设计模穴数', '实际模穴数',
      '实际模次', '设计模次',
      '理论班产', '实际班产', '设备类型', '制造BOM编号'
    ];
    const rows = parseExcelFile(req.file.buffer, mouldOwnFields, importHeaders);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    const _factoryId = getFactoryId(req);
    let imported = 0;
    for (const item of rows) {
      try {
        if (!item.item_number) continue;
        const [existing]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM mould WHERE item_number = :item_number`, { replacements: { item_number: item.item_number } });
        const setClauses = mouldOwnFields.filter(f => f !== 'item_number').map(f => `${f} = :${f}`).join(', ');
        if (existing[0].cnt > 0) {
          await sequelize.query(`UPDATE mould SET ${setClauses} WHERE item_number = :item_number`, { replacements: item });
        } else {
          const cols = mouldOwnFields.join(', ') + ', factory_id';
          const vals = mouldOwnFields.map(f => ':' + f).join(', ') + ', :factory_id';
          await sequelize.query(`INSERT INTO mould (${cols}) VALUES (${vals})`, { replacements: { ...item, factory_id: _factoryId } });
        }
        imported++;
      } catch (e) {}
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};

export const approveMould = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE mould SET approval_status = N'已审核' WHERE item_number = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawMould = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE mould SET approval_status = N'未审核' WHERE item_number = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};

// ===== 寿命跟踪 API =====

// 计算寿命状态的辅助函数
function calcLifeStatus(totalStrokes: number, maxStrokes: number): string {
  if (maxStrokes <= 0) return '正常';
  if (totalStrokes >= maxStrokes) return '到期';
  if (totalStrokes >= maxStrokes * 0.9) return '预警';
  return '正常';
}

// 更新累计模次（增量累加）
export const updateMouldStrokes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const addStrokes = parseInt(req.body.add_strokes) || 0;
    if (addStrokes <= 0) {
      res.status(400).json({ success: false, message: '新增模次必须大于0' });
      return;
    }
    // 原子累加
    await sequelize.query(
      `UPDATE mould SET total_strokes = total_strokes + :add WHERE item_number = :id`,
      { replacements: { add: addStrokes, id } }
    );
    // 获取当前值并自动判定寿命状态
    const [rows]: any = await sequelize.query(
      `SELECT total_strokes, max_strokes FROM mould WHERE item_number = :id`,
      { replacements: { id } }
    );
    if (rows.length > 0) {
      const newStatus = calcLifeStatus(rows[0].total_strokes, rows[0].max_strokes);
      await sequelize.query(
        `UPDATE mould SET life_status = :status WHERE item_number = :id`,
        { replacements: { status: newStatus, id } }
      );
    }
    res.json(success(null, '模次更新成功'));
  } catch (err) { next(err); }
};

// 设置寿命参数
export const updateMouldLifeSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const maxStrokes = parseInt(req.body.max_strokes) ?? 0;
    const cycleDays = parseInt(req.body.maintenance_cycle_days) ?? 90;

    await sequelize.query(
      `UPDATE mould SET max_strokes = :max, maintenance_cycle_days = :cycle WHERE item_number = :id`,
      { replacements: { max: maxStrokes, cycle: cycleDays, id } }
    );

    // 重新判定寿命状态
    const [rows]: any = await sequelize.query(
      `SELECT total_strokes, max_strokes FROM mould WHERE item_number = :id`,
      { replacements: { id } }
    );
    if (rows.length > 0) {
      const newStatus = calcLifeStatus(rows[0].total_strokes, rows[0].max_strokes);
      // 自动计算下次保养日期
      let nextMaintenanceSql = '';
      const nextReplacements: any = { status: newStatus, id };
      if (cycleDays > 0) {
        nextMaintenanceSql = `, next_maintenance_date = DATEADD(DAY, :cycle, ISNULL(last_maintenance_date, GETDATE()))`;
        nextReplacements.cycle = cycleDays;
      }
      await sequelize.query(
        `UPDATE mould SET life_status = :status${nextMaintenanceSql} WHERE item_number = :id`,
        { replacements: nextReplacements }
      );
    }
    res.json(success(null, '寿命设置更新成功'));
  } catch (err) { next(err); }
};

// 报废模具
export const scrapMould = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(
      `UPDATE mould SET life_status = N'报废' WHERE item_number = :id`,
      { replacements: { id } }
    );
    res.json(success(null, '模具已标记为报废'));
  } catch (err) { next(err); }
};
