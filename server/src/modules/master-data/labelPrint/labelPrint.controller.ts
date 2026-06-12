import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { getFactoryId } from '../../../utils/factoryWhere.util';

/**
 * 构建QR码内容：替换 {field_key} 占位符
 */
function buildQrContent(qrFormat: string, fieldValues: Record<string, string>): string {
  return qrFormat.replace(/\{(\w+)\}/g, (_match, key) => fieldValues[key] || '');
}

/**
 * 解析模板字段 + 自定义字段 → 合并字段值映射
 */
function buildFieldMap(
  templateFields: any[],
  customFields: any[],
  runtimeValues: Record<string, string>
): Record<string, string> {
  const map: Record<string, string> = {};
  // 系统字段
  for (const f of templateFields) {
    if (runtimeValues[f.field_key] !== undefined) {
      map[f.field_key] = runtimeValues[f.field_key];
    } else if (f.default_value) {
      map[f.field_key] = f.default_value;
    }
  }
  // 自定义字段
  for (const f of customFields) {
    if (runtimeValues[f.field_key] !== undefined) {
      map[f.field_key] = runtimeValues[f.field_key];
    } else if (f.field_value) {
      map[f.field_key] = f.field_value;
    }
  }
  // 运行时值直接覆盖
  for (const [k, v] of Object.entries(runtimeValues)) {
    map[k] = v;
  }
  return map;
}

// ==================== 预览标签 ====================
export const preview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number, customer_number, batch_number, production_date, box_number, net_weight, remark, custom_values, template_id, scheme_id } = req.body;
    if (!item_number) {
      res.status(400).json({ success: false, message: '产品编号为必填项' }); return;
    }

    let templateData: any = null;
    let customFields: any[] = [];
    let templateFields: any[] = [];

    // 如果指定了方案ID，直接用
    if (scheme_id) {
      const [schemeRows]: any = await sequelize.query(`SELECT * FROM product_label_scheme WHERE id = :sid`, { replacements: { sid: scheme_id } });
      if (schemeRows.length > 0) {
        templateData = (await sequelize.query(`SELECT * FROM label_template WHERE id = :tid`, { replacements: { tid: schemeRows[0].template_id } }))[0][0];
        templateFields = (await sequelize.query(`SELECT * FROM label_template_field WHERE template_id = :tid ORDER BY display_order, id`, { replacements: { tid: schemeRows[0].template_id } }))[0];
        customFields = (await sequelize.query(`SELECT * FROM product_label_custom_field WHERE scheme_id = :sid ORDER BY display_order, id`, { replacements: { sid: scheme_id } }))[0];
      }
    }

    // 如果指定了模板ID，直接用
    if (!templateData && template_id) {
      templateData = (await sequelize.query(`SELECT * FROM label_template WHERE id = :tid`, { replacements: { tid: template_id } }))[0][0];
      if (templateData) {
        templateFields = (await sequelize.query(`SELECT * FROM label_template_field WHERE template_id = :tid ORDER BY display_order, id`, { replacements: { tid: template_id } }))[0];
      }
    }

    // 匹配方案
    if (!templateData) {
      const _factoryId = getFactoryId(req);
      let scheme: any = null;

      // 精确匹配
      if (customer_number) {
        const [exact]: any = await sequelize.query(`
          SELECT * FROM product_label_scheme
          WHERE item_number = :item_number AND customer_number = :customer_number AND is_active = N'是'
        `, { replacements: { item_number, customer_number } });
        if (exact.length > 0) scheme = exact[0];
      }

      // 默认匹配
      if (!scheme) {
        const [defaultScheme]: any = await sequelize.query(`
          SELECT * FROM product_label_scheme
          WHERE item_number = :item_number AND customer_number IS NULL AND is_default = N'是' AND is_active = N'是'
        `, { replacements: { item_number } });
        if (defaultScheme.length > 0) scheme = defaultScheme[0];
      }

      if (scheme) {
        templateData = (await sequelize.query(`SELECT * FROM label_template WHERE id = :tid`, { replacements: { tid: scheme.template_id } }))[0][0];
        templateFields = (await sequelize.query(`SELECT * FROM label_template_field WHERE template_id = :tid ORDER BY display_order, id`, { replacements: { tid: scheme.template_id } }))[0];
        customFields = (await sequelize.query(`SELECT * FROM product_label_custom_field WHERE scheme_id = :sid ORDER BY display_order, id`, { replacements: { sid: scheme.id } }))[0];
      } else {
        // 全局默认
        templateData = (await sequelize.query(`SELECT * FROM label_template WHERE template_code = N'STANDARD_PRODUCT_LABEL' AND is_active = N'是'`))[0][0];
        if (templateData) {
          templateFields = (await sequelize.query(`SELECT * FROM label_template_field WHERE template_id = :tid ORDER BY display_order, id`, { replacements: { tid: templateData.id } }))[0];
        }
      }
    }

    if (!templateData) {
      res.status(404).json({ success: false, message: '未找到标签模板' }); return;
    }

    // 查询产品信息
    const [itemRows]: any = await sequelize.query(
      `SELECT item_number, item_name, specifications, shelf_life_days FROM item_master WHERE item_number = :item_number`,
      { replacements: { item_number } }
    );
    const item = itemRows[0] || {};

    // 构建字段值
    const runtimeValues: Record<string, string> = {
      item_number,
      item_name: item.item_name || '',
      batch_number: batch_number || '',
      production_date: production_date || '',
      box_number: box_number || '',
      net_weight: net_weight || '',
      remark: remark || '',
      specifications: item.specifications || '',
      shelf_life: item.shelf_life_days ? `${item.shelf_life_days}天` : '',
      reference_standard: '',
    };

    // 合并自定义字段值
    if (custom_values && typeof custom_values === 'object') {
      Object.assign(runtimeValues, custom_values);
    }

    const fieldMap = buildFieldMap(templateFields, customFields, runtimeValues);
    const qrContent = buildQrContent(templateData.qr_format, fieldMap);

    // 构建标签HTML预览
    const labelHtml = generateLabelHtml(templateData, templateFields, customFields, fieldMap, qrContent);

    res.json(success({
      template: templateData,
      template_fields: templateFields,
      custom_fields: customFields,
      field_values: fieldMap,
      qr_content: qrContent,
      label_html: labelHtml,
    }));
  } catch (err) { next(err); }
};

/**
 * 生成标签HTML
 */
function generateLabelHtml(
  template: any,
  templateFields: any[],
  customFields: any[],
  fieldMap: Record<string, string>,
  qrContent: string
): string {
  const width = template.paper_width || 100;
  const height = template.paper_height || 80;
  const qrSize = template.qr_size || 20;
  const qrPosition = template.qr_position || 'bottom-right';

  // 合并所有字段（模板字段 + 自定义字段）
  const allFields = [
    ...templateFields.map(f => ({ ...f, field_value: fieldMap[f.field_key] || f.default_value || '' })),
    ...customFields.map(f => ({ ...f, field_value: fieldMap[f.field_key] || f.field_value || '' })),
  ].filter(f => f.visible !== '否').sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  // 单元格样式生成辅助函数
  const cellStyleOf = (fontSize: number) => `font-size:${fontSize}pt;padding:1px 4px;white-space:nowrap;color:#333;`;

  // QR码图片
  const qrImg = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=${qrSize * 3}x${qrSize * 3}&data=${encodeURIComponent(qrContent)}" style="width:${qrSize}mm;height:${qrSize}mm;" />`;

  if (qrPosition === 'top-right') {
    // ============================================================
    // top-right 布局：上部左侧单列+右侧二维码(rowspan)，下部全宽双列
    // ============================================================

    // 计算二维码跨几行（9pt字体≈4.5mm行高）
    const avgRowHeightMm = 4.5;
    const qrRows = Math.max(1, Math.ceil(qrSize / avgRowHeightMm));

    // 分割字段：上部字段(与二维码同行，单列) + 下部字段(二维码下方，双列)
    const topFieldCount = Math.min(qrRows, allFields.length);
    const topFields = allFields.slice(0, topFieldCount);
    const bottomFields = allFields.slice(topFieldCount);

    const rows: string[] = [];

    // 上部：每个字段一行，第一个字段行带 rowspan 二维码
    topFields.forEach((f, idx) => {
      const cs = cellStyleOf(f.font_size || 9);
      if (idx === 0) {
        // 第一行：左列文字 + 右列二维码(rowspan)
        rows.push(`<tr><td style="${cs}">${f.field_label}：${f.field_value}</td><td rowspan="${qrRows}" style="vertical-align:top;text-align:right;padding:0;">${qrImg}</td></tr>`);
      } else {
        // 后续行：仅左列文字（右列被rowspan占位）
        rows.push(`<tr><td style="${cs}">${f.field_label}：${f.field_value}</td></tr>`);
      }
    });

    // 下部：双列布局（rowspan结束，恢复2列）
    let j = 0;
    while (j < bottomFields.length) {
      const f = bottomFields[j];
      const cs = cellStyleOf(f.font_size || 9);
      if (f.col_span === 2) {
        rows.push(`<tr><td colspan="2" style="${cs}">${f.field_label}：${f.field_value}</td></tr>`);
        j++;
      } else if (j + 1 < bottomFields.length && bottomFields[j + 1].col_span !== 2) {
        const f2 = bottomFields[j + 1];
        const cs2 = cellStyleOf(f2.font_size || 9);
        rows.push(`<tr><td style="${cs}">${f.field_label}：${f.field_value}</td><td style="${cs2}">${f2.field_label}：${f2.field_value}</td></tr>`);
        j += 2;
      } else {
        rows.push(`<tr><td style="${cs}">${f.field_label}：${f.field_value}</td><td style="${cs}"></td></tr>`);
        j++;
      }
    }

    return `
      <div style="width:${width}mm;height:${height}mm;border:1px solid #ccc;padding:3mm;font-family:SimSun,serif;box-sizing:border-box;overflow:hidden;">
        <table style="border-collapse:collapse;width:100%;">
          ${rows.join('\n')}
        </table>
      </div>
    `;
  }

  // ============================================================
  // 非 top-right 布局：统一双列
  // ============================================================
  const fieldRows: string[] = [];
  let i = 0;
  while (i < allFields.length) {
    const f = allFields[i];
    const fontSize = f.font_size || 9;
    const colSpan = f.col_span === 2;
    const cellStyle = cellStyleOf(fontSize);

    if (colSpan) {
      fieldRows.push(`<tr><td colspan="2" style="${cellStyle}">${f.field_label}：${f.field_value}</td></tr>`);
      i++;
    } else if (i + 1 < allFields.length && allFields[i + 1].col_span !== 2) {
      const f2 = allFields[i + 1];
      const cellStyle2 = cellStyleOf(f2.font_size || 9);
      fieldRows.push(`<tr><td style="${cellStyle}">${f.field_label}：${f.field_value}</td><td style="${cellStyle2}">${f2.field_label}：${f2.field_value}</td></tr>`);
      i += 2;
    } else {
      fieldRows.push(`<tr><td colspan="2" style="${cellStyle}">${f.field_label}：${f.field_value}</td></tr>`);
      i++;
    }
  }

  const fieldRowsHtml = fieldRows.join('\n');
  let layoutStyle = '';
  let qrHtml = '';

  if (qrPosition === 'bottom-right') {
    layoutStyle = 'display:flex;justify-content:space-between;align-items:flex-end;';
    qrHtml = `<div style="flex-shrink:0;">${qrImg}</div>`;
  } else if (qrPosition === 'bottom-center') {
    layoutStyle = 'display:flex;flex-direction:column;align-items:center;';
    qrHtml = `<div style="margin-top:4px;">${qrImg}</div>`;
  }

  return `
    <div style="width:${width}mm;height:${height}mm;border:1px solid #ccc;padding:3mm;font-family:SimSun,serif;box-sizing:border-box;overflow:hidden;${layoutStyle}">
      <table style="border-collapse:collapse;width:100%;">
        ${fieldRowsHtml}
      </table>
      ${qrHtml}
    </div>
  `;
}

// ==================== 打印标签（记录日志） ====================
export const printLabel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.item_number) {
      res.status(400).json({ success: false, message: '产品编号为必填项' }); return;
    }

    // 先预览生成内容
    const _factoryId = getFactoryId(req);

    // 查找方案
    let schemeId = b.scheme_id || null;
    if (!schemeId) {
      const [schemes]: any = await sequelize.query(`
        SELECT TOP 1 id FROM product_label_scheme
        WHERE item_number = :item_number AND is_active = N'是'
        ORDER BY CASE WHEN customer_number = :cn THEN 0 WHEN customer_number IS NULL AND is_default = N'是' THEN 1 ELSE 2 END
      `, { replacements: { item_number: b.item_number, cn: b.customer_number || '' } });
      schemeId = schemes[0]?.id || null;
    }

    // 查产品信息
    const [itemRows]: any = await sequelize.query(
      `SELECT item_number, item_name FROM item_master WHERE item_number = :item_number`,
      { replacements: { item_number: b.item_number } }
    );
    const itemName = itemRows[0]?.item_name || '';

    // 插入打印日志
    await sequelize.query(`
      INSERT INTO label_print_log (scheme_id, item_number, item_name, batch_number, production_date, box_number,
        net_weight, remark, custom_fields_json, qr_content, print_time, operator, factory_id)
      VALUES (:scheme_id, :item_number, :item_name, :batch_number, :production_date, :box_number,
        :net_weight, :remark, :custom_fields_json, :qr_content, GETDATE(), :operator, :factory_id)
    `, {
      replacements: {
        scheme_id: schemeId,
        item_number: b.item_number,
        item_name: itemName,
        batch_number: b.batch_number || '',
        production_date: b.production_date || '',
        box_number: b.box_number || '',
        net_weight: b.net_weight || '',
        remark: b.remark || '',
        custom_fields_json: b.custom_values ? JSON.stringify(b.custom_values) : '',
        qr_content: b.qr_content || '',
        operator: (req as any).user?.username || '',
        factory_id: _factoryId || b.factory_id || null,
      }
    });

    res.json(success(null, '标签打印成功，日志已记录'));
  } catch (err) { next(err); }
};

// ==================== 打印日志查询 ====================
export const getLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', item_number = '', start_date = '', end_date = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (lpl.item_number LIKE :search OR lpl.item_name LIKE :search OR lpl.batch_number LIKE :search OR lpl.operator LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (item_number) {
      whereClause += ` AND lpl.item_number = :item_number`;
      replacements.item_number = item_number;
    }
    if (start_date) {
      whereClause += ` AND lpl.print_time >= :start_date`;
      replacements.start_date = start_date;
    }
    if (end_date) {
      whereClause += ` AND lpl.print_time <= :end_date`;
      replacements.end_date = end_date;
    }

    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      whereClause += ` AND lpl.factory_id = :_factoryId`;
      replacements._factoryId = _factoryId;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM label_print_log lpl ${whereClause}`,
      { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT lpl.*, f.factory_name, pls.scheme_name,
          ROW_NUMBER() OVER (ORDER BY lpl.print_time DESC) AS _row_num
        FROM label_print_log lpl
        LEFT JOIN factory f ON lpl.factory_id = f.id
        LEFT JOIN product_label_scheme pls ON lpl.scheme_id = pls.id
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({ items, total: countResult[0]?.total || 0, page: pageNum, limit: pageSize }));
  } catch (err) { next(err); }
};
