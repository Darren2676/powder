import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 列表查询 ====================
export const getList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', item_number = '', customer_number = '', is_active = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (pls.scheme_name LIKE :search OR pls.item_number LIKE :search OR pls.customer_number LIKE :search OR pls.customer_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (item_number) {
      whereClause += ` AND pls.item_number = :item_number`;
      replacements.item_number = item_number;
    }
    if (customer_number) {
      whereClause += ` AND pls.customer_number = :customer_number`;
      replacements.customer_number = customer_number;
    }
    if (is_active) {
      whereClause += ` AND pls.is_active = :is_active`;
      replacements.is_active = is_active;
    }

    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      whereClause += ` AND (pls.factory_id = :_factoryId OR pls.factory_id IS NULL)`;
      replacements._factoryId = _factoryId;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM product_label_scheme pls ${whereClause}`,
      { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT pls.*, lt.template_name, lt.template_code, f.factory_name, im.item_name,
          ROW_NUMBER() OVER (ORDER BY pls.item_number, pls.customer_number) AS _row_num
        FROM product_label_scheme pls
        LEFT JOIN label_template lt ON pls.template_id = lt.id
        LEFT JOIN factory f ON pls.factory_id = f.id
        LEFT JOIN item_master im ON pls.item_number = im.item_number
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({ items, total: countResult[0]?.total || 0, page: pageNum, limit: pageSize }));
  } catch (err) { next(err); }
};

// ==================== 详情（含自定义字段） ====================
export const getDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(`
      SELECT pls.*, lt.template_name, lt.template_code, f.factory_name, im.item_name
      FROM product_label_scheme pls
      LEFT JOIN label_template lt ON pls.template_id = lt.id
      LEFT JOIN factory f ON pls.factory_id = f.id
      LEFT JOIN item_master im ON pls.item_number = im.item_number
      WHERE pls.id = :id
    `, { replacements: { id } });

    if (!rows.length) {
      res.status(404).json({ success: false, message: '方案不存在' }); return;
    }

    const [customFields]: any = await sequelize.query(
      `SELECT * FROM product_label_custom_field WHERE scheme_id = :id ORDER BY display_order, id`,
      { replacements: { id } }
    );

    // 获取模板字段
    const [templateFields]: any = await sequelize.query(
      `SELECT * FROM label_template_field WHERE template_id = :tid ORDER BY display_order, id`,
      { replacements: { tid: rows[0].template_id } }
    );

    res.json(success({ ...rows[0], custom_fields: customFields, template_fields: templateFields }));
  } catch (err) { next(err); }
};

// ==================== 匹配方案 ====================
export const matchScheme = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number, customer_number } = req.query;
    if (!item_number) {
      res.status(400).json({ success: false, message: '产品编号为必填项' }); return;
    }

    const _factoryId = getFactoryId(req);
    let factoryFilter = '';
    const replacements: any = { item_number: item_number as string };
    if (_factoryId !== null) {
      factoryFilter = ` AND (pls.factory_id = :_factoryId OR pls.factory_id IS NULL)`;
      replacements._factoryId = _factoryId;
    }

    // 1. 精确匹配
    if (customer_number) {
      replacements.customer_number = customer_number as string;
      const [exact]: any = await sequelize.query(`
        SELECT pls.*, lt.template_name, lt.template_code
        FROM product_label_scheme pls
        LEFT JOIN label_template lt ON pls.template_id = lt.id
        WHERE pls.item_number = :item_number AND pls.customer_number = :customer_number
          AND pls.is_active = N'是'${factoryFilter}
      `, { replacements });
      if (exact.length > 0) {
        const [customFields]: any = await sequelize.query(
          `SELECT * FROM product_label_custom_field WHERE scheme_id = :sid ORDER BY display_order, id`,
          { replacements: { sid: exact[0].id } }
        );
        const [templateFields]: any = await sequelize.query(
          `SELECT * FROM label_template_field WHERE template_id = :tid ORDER BY display_order, id`,
          { replacements: { tid: exact[0].template_id } }
        );
        res.json(success({ ...exact[0], custom_fields: customFields, template_fields: templateFields, match_type: '精确匹配' }));
        return;
      }
    }

    // 2. 默认匹配
    const [defaultScheme]: any = await sequelize.query(`
      SELECT pls.*, lt.template_name, lt.template_code
      FROM product_label_scheme pls
      LEFT JOIN label_template lt ON pls.template_id = lt.id
      WHERE pls.item_number = :item_number AND pls.customer_number IS NULL
        AND pls.is_default = N'是' AND pls.is_active = N'是'${factoryFilter}
    `, { replacements });
    if (defaultScheme.length > 0) {
      const [customFields]: any = await sequelize.query(
        `SELECT * FROM product_label_custom_field WHERE scheme_id = :sid ORDER BY display_order, id`,
        { replacements: { sid: defaultScheme[0].id } }
      );
      const [templateFields]: any = await sequelize.query(
        `SELECT * FROM label_template_field WHERE template_id = :tid ORDER BY display_order, id`,
        { replacements: { tid: defaultScheme[0].template_id } }
      );
      res.json(success({ ...defaultScheme[0], custom_fields: customFields, template_fields: templateFields, match_type: '默认匹配' }));
      return;
    }

    // 3. 全局默认：返回标准成品标签模板
    const [globalTpl]: any = await sequelize.query(
      `SELECT * FROM label_template WHERE template_code = N'STANDARD_PRODUCT_LABEL' AND is_active = N'是'`
    );
    if (globalTpl.length > 0) {
      const [templateFields]: any = await sequelize.query(
        `SELECT * FROM label_template_field WHERE template_id = :tid ORDER BY display_order, id`,
        { replacements: { tid: globalTpl[0].id } }
      );
      res.json(success({
        id: null,
        scheme_name: '全局默认',
        item_number: item_number as string,
        customer_number: null,
        template_id: globalTpl[0].id,
        template_name: globalTpl[0].template_name,
        template_code: globalTpl[0].template_code,
        is_default: '是',
        custom_fields: [],
        template_fields: templateFields,
        match_type: '全局默认',
        ...globalTpl[0],
      }));
      return;
    }

    res.status(404).json({ success: false, message: '未找到匹配的标签方案' });
  } catch (err) { next(err); }
};

// ==================== 新增 ====================
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.scheme_name || !b.item_number || !b.template_id) {
      res.status(400).json({ success: false, message: '方案名称、产品编号和模板为必填项' }); return;
    }

    const _factoryId = getFactoryId(req);

    // 唯一性校验：同一产品+客户只能一个方案
    if (b.customer_number) {
      const [dup]: any = await sequelize.query(
        `SELECT id FROM product_label_scheme WHERE item_number = :item_number AND customer_number = :customer_number`,
        { replacements: { item_number: b.item_number, customer_number: b.customer_number } }
      );
      if (dup.length > 0) {
        res.status(400).json({ success: false, message: '该产品+客户已有标签方案，不可重复' }); return;
      }
    } else {
      // 无客户时，检查同一产品是否已有无客户的方案
      const [dupNoCust]: any = await sequelize.query(
        `SELECT id FROM product_label_scheme WHERE item_number = :item_number AND customer_number IS NULL`,
        { replacements: { item_number: b.item_number } }
      );
      if (dupNoCust.length > 0) {
        res.status(400).json({ success: false, message: '该产品已有默认标签方案（无客户），不可重复' }); return;
      }
    }

    // 默认方案唯一性
    if (b.is_default === '是' && !b.customer_number) {
      const [dupDefault]: any = await sequelize.query(
        `SELECT id FROM product_label_scheme WHERE item_number = :item_number AND customer_number IS NULL AND is_default = N'是'`,
        { replacements: { item_number: b.item_number } }
      );
      if (dupDefault.length > 0) {
        res.status(400).json({ success: false, message: '该产品已有默认方案，请先取消原有默认' }); return;
      }
    }

    await sequelize.query(`
      INSERT INTO product_label_scheme (scheme_name, item_number, customer_number, customer_name, template_id,
        is_default, is_active, factory_id, creation_man, creation_date, last_updater, last_updated)
      VALUES (:scheme_name, :item_number, :customer_number, :customer_name, :template_id,
        :is_default, :is_active, :factory_id, :creation_man, GETDATE(), :creation_man, GETDATE())
    `, {
      replacements: {
        scheme_name: b.scheme_name,
        item_number: b.item_number,
        customer_number: b.customer_number || null,
        customer_name: b.customer_name || '',
        template_id: b.template_id,
        is_default: b.is_default || '否',
        is_active: b.is_active || '是',
        factory_id: b.factory_id || _factoryId || null,
        creation_man: (req as any).user?.username || '',
      }
    });

    const [newRow]: any = await sequelize.query(
      `SELECT TOP 1 id FROM product_label_scheme WHERE scheme_name = :scheme_name AND item_number = :item_number ORDER BY id DESC`,
      { replacements: { scheme_name: b.scheme_name, item_number: b.item_number } }
    );
    const schemeId = newRow[0]?.id;

    // 插入自定义字段
    if (b.custom_fields && Array.isArray(b.custom_fields)) {
      for (let i = 0; i < b.custom_fields.length; i++) {
        const f = b.custom_fields[i];
        await sequelize.query(`
          INSERT INTO product_label_custom_field (scheme_id, field_key, field_label, field_value, display_order, is_in_qr)
          VALUES (:scheme_id, :field_key, :field_label, :field_value, :display_order, :is_in_qr)
        `, {
          replacements: {
            scheme_id: schemeId,
            field_key: f.field_key || `custom_${i + 1}`,
            field_label: f.field_label,
            field_value: f.field_value || '',
            display_order: f.display_order ?? (i + 1),
            is_in_qr: f.is_in_qr || '否',
          }
        });
      }
    }

    res.json(success(null, '产品标签方案创建成功'));
  } catch (err) { next(err); }
};

// ==================== 更新 ====================
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [existing]: any = await sequelize.query(
      `SELECT id FROM product_label_scheme WHERE id = :id`,
      { replacements: { id } }
    );
    if (!existing.length) {
      res.status(404).json({ success: false, message: '方案不存在' }); return;
    }

    // 默认方案唯一性
    if (b.is_default === '是' && (!b.customer_number || b.customer_number === '')) {
      const [dupDefault]: any = await sequelize.query(
        `SELECT id FROM product_label_scheme WHERE item_number = :item_number AND customer_number IS NULL AND is_default = N'是' AND id != :id`,
        { replacements: { item_number: b.item_number, id } }
      );
      if (dupDefault.length > 0) {
        res.status(400).json({ success: false, message: '该产品已有默认方案，请先取消原有默认' }); return;
      }
    }

    await sequelize.query(`
      UPDATE product_label_scheme SET
        scheme_name = :scheme_name,
        item_number = :item_number,
        customer_number = :customer_number,
        customer_name = :customer_name,
        template_id = :template_id,
        is_default = :is_default,
        is_active = :is_active,
        factory_id = :factory_id,
        last_updater = :last_updater,
        last_updated = GETDATE()
      WHERE id = :id
    `, {
      replacements: {
        id,
        scheme_name: b.scheme_name,
        item_number: b.item_number,
        customer_number: b.customer_number || null,
        customer_name: b.customer_name || '',
        template_id: b.template_id,
        is_default: b.is_default || '否',
        is_active: b.is_active || '是',
        factory_id: b.factory_id || null,
        last_updater: (req as any).user?.username || '',
      }
    });

    // 更新自定义字段：先删后插
    if (b.custom_fields && Array.isArray(b.custom_fields)) {
      await sequelize.query(`DELETE FROM product_label_custom_field WHERE scheme_id = :id`, { replacements: { id } });
      for (let i = 0; i < b.custom_fields.length; i++) {
        const f = b.custom_fields[i];
        await sequelize.query(`
          INSERT INTO product_label_custom_field (scheme_id, field_key, field_label, field_value, display_order, is_in_qr)
          VALUES (:scheme_id, :field_key, :field_label, :field_value, :display_order, :is_in_qr)
        `, {
          replacements: {
            scheme_id: id,
            field_key: f.field_key || `custom_${i + 1}`,
            field_label: f.field_label,
            field_value: f.field_value || '',
            display_order: f.display_order ?? (i + 1),
            is_in_qr: f.is_in_qr || '否',
          }
        });
      }
    }

    res.json(success(null, '产品标签方案更新成功'));
  } catch (err) { next(err); }
};

// ==================== 删除 ====================
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // 检查是否有打印日志引用
    const [refCheck]: any = await sequelize.query(
      `SELECT id FROM label_print_log WHERE scheme_id = :id`,
      { replacements: { id } }
    );
    if (refCheck.length > 0) {
      // 不阻止删除，只清理自定义字段
    }

    await sequelize.query(`DELETE FROM product_label_custom_field WHERE scheme_id = :id`, { replacements: { id } });
    await sequelize.query(`DELETE FROM product_label_scheme WHERE id = :id`, { replacements: { id } });

    res.json(success(null, '产品标签方案已删除'));
  } catch (err) { next(err); }
};
