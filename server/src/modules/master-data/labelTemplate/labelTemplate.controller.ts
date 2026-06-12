import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 列表查询 ====================
export const getList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', is_active = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (lt.template_name LIKE :search OR lt.template_code LIKE :search OR lt.description LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (is_active) {
      whereClause += ` AND lt.is_active = :is_active`;
      replacements.is_active = is_active;
    }

    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      whereClause += ` AND (lt.factory_id = :_factoryId OR lt.factory_id IS NULL)`;
      replacements._factoryId = _factoryId;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM label_template lt ${whereClause}`,
      { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT lt.*, f.factory_name,
          (SELECT COUNT(*) FROM label_template_field ltf WHERE ltf.template_id = lt.id) AS field_count,
          ROW_NUMBER() OVER (ORDER BY lt.creation_date DESC) AS _row_num
        FROM label_template lt
        LEFT JOIN factory f ON lt.factory_id = f.id
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({ items, total: countResult[0]?.total || 0, page: pageNum, limit: pageSize }));
  } catch (err) { next(err); }
};

// ==================== 详情（含字段列表） ====================
export const getDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(
      `SELECT lt.*, f.factory_name FROM label_template lt LEFT JOIN factory f ON lt.factory_id = f.id WHERE lt.id = :id`,
      { replacements: { id } }
    );
    if (!rows.length) {
      res.status(404).json({ success: false, message: '模板不存在' }); return;
    }

    const [fields]: any = await sequelize.query(
      `SELECT * FROM label_template_field WHERE template_id = :id ORDER BY display_order, id`,
      { replacements: { id } }
    );

    res.json(success({ ...rows[0], fields }));
  } catch (err) { next(err); }
};

// ==================== 新增 ====================
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.template_name || !b.template_code) {
      res.status(400).json({ success: false, message: '模板名称和编码为必填项' }); return;
    }

    // 检查编码唯一
    const [existing]: any = await sequelize.query(
      `SELECT id FROM label_template WHERE template_code = :code`,
      { replacements: { code: b.template_code } }
    );
    if (existing.length > 0) {
      res.status(400).json({ success: false, message: '模板编码已存在' }); return;
    }

    const _factoryId = getFactoryId(req);

    await sequelize.query(`
      INSERT INTO label_template (template_name, template_code, description, paper_width, paper_height,
        qr_format, qr_size, qr_position, is_active, factory_id, creation_man, creation_date, last_updater, last_updated)
      VALUES (:template_name, :template_code, :description, :paper_width, :paper_height,
        :qr_format, :qr_size, :qr_position, :is_active, :factory_id, :creation_man, GETDATE(), :creation_man, GETDATE())
    `, {
      replacements: {
        template_name: b.template_name,
        template_code: b.template_code,
        description: b.description || '',
        paper_width: b.paper_width || 100,
        paper_height: b.paper_height || 80,
        qr_format: b.qr_format || '{item_number}|{batch_number}|{production_date}|{box_number}|{net_weight}',
        qr_size: b.qr_size || 20,
        qr_position: b.qr_position || 'bottom-right',
        is_active: b.is_active || '是',
        factory_id: b.factory_id || _factoryId || null,
        creation_man: (req as any).user?.username || '',
      }
    });

    const [newRow]: any = await sequelize.query(
      `SELECT id FROM label_template WHERE template_code = :code`,
      { replacements: { code: b.template_code } }
    );
    const templateId = newRow[0]?.id;

    // 插入字段
    if (b.fields && Array.isArray(b.fields)) {
      for (let i = 0; i < b.fields.length; i++) {
        const f = b.fields[i];
        await sequelize.query(`
          INSERT INTO label_template_field (template_id, field_key, field_label, field_type, data_source,
            display_order, visible, is_in_qr, font_size, col_span, default_value)
          VALUES (:template_id, :field_key, :field_label, :field_type, :data_source,
            :display_order, :visible, :is_in_qr, :font_size, :col_span, :default_value)
        `, {
          replacements: {
            template_id: templateId,
            field_key: f.field_key,
            field_label: f.field_label,
            field_type: f.field_type || 'system',
            data_source: f.data_source || '',
            display_order: f.display_order ?? (i + 1),
            visible: f.visible || '是',
            is_in_qr: f.is_in_qr || '否',
            font_size: f.font_size || 9,
            col_span: f.col_span || 1,
            default_value: f.default_value || '',
          }
        });
      }
    }

    res.json(success(null, '标签模板创建成功'));
  } catch (err) { next(err); }
};

// ==================== 更新 ====================
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [existing]: any = await sequelize.query(
      `SELECT id FROM label_template WHERE id = :id`,
      { replacements: { id } }
    );
    if (!existing.length) {
      res.status(404).json({ success: false, message: '模板不存在' }); return;
    }

    await sequelize.query(`
      UPDATE label_template SET
        template_name = :template_name,
        description = :description,
        paper_width = :paper_width,
        paper_height = :paper_height,
        qr_format = :qr_format,
        qr_size = :qr_size,
        qr_position = :qr_position,
        is_active = :is_active,
        factory_id = :factory_id,
        last_updater = :last_updater,
        last_updated = GETDATE()
      WHERE id = :id
    `, {
      replacements: {
        id,
        template_name: b.template_name,
        description: b.description || '',
        paper_width: b.paper_width || 100,
        paper_height: b.paper_height || 80,
        qr_format: b.qr_format || '{item_number}|{batch_number}|{production_date}|{box_number}|{net_weight}',
        qr_size: b.qr_size || 20,
        qr_position: b.qr_position || 'bottom-right',
        is_active: b.is_active || '是',
        factory_id: b.factory_id || null,
        last_updater: (req as any).user?.username || '',
      }
    });

    // 更新字段：先删后插
    if (b.fields && Array.isArray(b.fields)) {
      await sequelize.query(`DELETE FROM label_template_field WHERE template_id = :id`, { replacements: { id } });
      for (let i = 0; i < b.fields.length; i++) {
        const f = b.fields[i];
        await sequelize.query(`
          INSERT INTO label_template_field (template_id, field_key, field_label, field_type, data_source,
            display_order, visible, is_in_qr, font_size, col_span, default_value)
          VALUES (:template_id, :field_key, :field_label, :field_type, :data_source,
            :display_order, :visible, :is_in_qr, :font_size, :col_span, :default_value)
        `, {
          replacements: {
            template_id: id,
            field_key: f.field_key,
            field_label: f.field_label,
            field_type: f.field_type || 'system',
            data_source: f.data_source || '',
            display_order: f.display_order ?? (i + 1),
            visible: f.visible || '是',
            is_in_qr: f.is_in_qr || '否',
            font_size: f.font_size || 9,
            col_span: f.col_span || 1,
            default_value: f.default_value || '',
          }
        });
      }
    }

    res.json(success(null, '标签模板更新成功'));
  } catch (err) { next(err); }
};

// ==================== 删除 ====================
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // 检查是否有方案引用
    const [refCheck]: any = await sequelize.query(
      `SELECT id FROM product_label_scheme WHERE template_id = :id`,
      { replacements: { id } }
    );
    if (refCheck.length > 0) {
      res.status(400).json({ success: false, message: '该模板已被标签方案引用，无法删除' }); return;
    }

    await sequelize.query(`DELETE FROM label_template_field WHERE template_id = :id`, { replacements: { id } });
    await sequelize.query(`DELETE FROM label_template WHERE id = :id`, { replacements: { id } });

    res.json(success(null, '标签模板已删除'));
  } catch (err) { next(err); }
};

// ==================== 获取系统预置字段定义 ====================
export const getPresetFields = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const presetFields = [
      { field_key: 'item_number', field_label: '产品编号', field_type: 'system', data_source: 'item_master.item_number', is_in_qr: '是', col_span: 1 },
      { field_key: 'item_name', field_label: '产品描述', field_type: 'system', data_source: 'item_master.item_name', is_in_qr: '否', col_span: 1 },
      { field_key: 'batch_number', field_label: '批号', field_type: 'system', data_source: 'finished_batch_inventory.batch_number', is_in_qr: '是', col_span: 1 },
      { field_key: 'production_date', field_label: '生产日期', field_type: 'system', data_source: 'finished_batch_inventory.production_date', is_in_qr: '是', col_span: 1 },
      { field_key: 'box_number', field_label: '箱号', field_type: 'system', data_source: 'packing_box.box_number', is_in_qr: '是', col_span: 1 },
      { field_key: 'net_weight', field_label: '净重', field_type: 'system', data_source: 'runtime', is_in_qr: '是', col_span: 1 },
      { field_key: 'remark', field_label: '备注', field_type: 'system', data_source: 'runtime', is_in_qr: '否', col_span: 2 },
      { field_key: 'specifications', field_label: '规格', field_type: 'system', data_source: 'item_master.specifications', is_in_qr: '否', col_span: 1 },
      { field_key: 'shelf_life', field_label: '保质期', field_type: 'system', data_source: 'calc:shelf_life_days', is_in_qr: '否', col_span: 1 },
      { field_key: 'reference_standard', field_label: '参考标准', field_type: 'system', data_source: 'runtime', is_in_qr: '否', col_span: 1 },
    ];
    res.json(success(presetFields));
  } catch (err) { next(err); }
};
