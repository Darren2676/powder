import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { BusinessError } from '../../../shared/errors/BusinessError';
import { generateParameterNumber } from './processParameter.service';
import dayjs from 'dayjs';
import { getFactoryCode } from '../../../utils/factoryWhere.util';

const headerSelectCols = 'id, parameter_number, item_number, item_name, process_route_number, version, description, approval_status, [condition], creation_date, creation_man, remark';
const detailSelectCols = 'id, parameter_number, line_number, step_number, step_name, param_name, param_code, param_value, unit, param_type, min_value, max_value, is_required, remark, process_category_code, process_category_name';

// ==================== 列表查询 ====================
export const getProcessParameters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approvalStatus = (req.query.approval_status as string) || '';
    const itemNumber = (req.query.item_number as string) || '';
    const routeNumber = (req.query.process_route_number as string) || '';
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const replacements: any = { offset, offsetEnd: offset + limit };

    if (search) {
      conditions.push('(parameter_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search)');
      replacements.search = `%${search}%`;
    }
    if (approvalStatus) {
      conditions.push('approval_status = :approvalStatus');
      replacements.approvalStatus = approvalStatus;
    }
    if (itemNumber) {
      conditions.push('item_number = :itemNumber');
      replacements.itemNumber = itemNumber;
    }
    if (routeNumber) {
      conditions.push('process_route_number = :routeNumber');
      replacements.routeNumber = routeNumber;
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) AS total FROM process_parameter_header ${whereClause}`,
      { replacements }
    );

    const [items]: any = await sequelize.query(
      `SELECT * FROM (
         SELECT ${headerSelectCols}, ROW_NUMBER() OVER (ORDER BY id DESC) AS _row_num
         FROM process_parameter_header ${whereClause}
       ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements }
    );

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: {
        total: countResult[0]?.total || 0,
        page,
        limit,
        totalPages: Math.ceil((countResult[0]?.total || 0) / limit),
      },
    }));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getProcessParameterDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const isNumericId = /^\d+$/.test(id);
    const whereClause = isNumericId ? 'id = :id' : 'parameter_number = :id';
    const [headers]: any = await sequelize.query(
      `SELECT ${headerSelectCols} FROM process_parameter_header WHERE ${whereClause}`,
      { replacements: { id } }
    );
    if (!headers.length) {
      res.status(404).json({ success: false, message: '工艺参数记录不存在' });
      return;
    }

    const [details]: any = await sequelize.query(
      `SELECT ${detailSelectCols} FROM process_parameter_detail WHERE parameter_number = :pn ORDER BY line_number`,
      { replacements: { pn: headers[0].parameter_number } }
    );

    res.json(success({ header: headers[0], details }));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createProcessParameter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const b = req.body || {};
    const user = (req as any).user;

    if (!b.item_number) throw new BusinessError(400, '产品编号必填');

    const parameterNumber = await generateParameterNumber(factoryCode);
    const now = dayjs().format('YYYY/MM/DD HH:mm');

    await sequelize.query(
      `INSERT INTO process_parameter_header (parameter_number, item_number, item_name, process_route_number, version, description, approval_status, [condition], creation_date, creation_man, remark)
       VALUES (:parameter_number, :item_number, :item_name, :process_route_number, :version, :description, N'草稿', N'启用', :creation_date, :creation_man, :remark)`,
      {
        replacements: {
          parameter_number: parameterNumber,
          item_number: b.item_number,
          item_name: b.item_name || '',
          process_route_number: b.process_route_number || null,
          version: b.version || 1,
          description: b.description || '',
          creation_date: now,
          creation_man: user?.username || '',
          remark: b.remark || '',
        },
      }
    );

    // 插入明细行
    if (Array.isArray(b.details) && b.details.length > 0) {
      for (let i = 0; i < b.details.length; i++) {
        const d = b.details[i];
        await sequelize.query(
          `INSERT INTO process_parameter_detail (parameter_number, line_number, step_number, step_name, param_name, param_code, param_value, unit, param_type, min_value, max_value, is_required, remark, process_category_code, process_category_name)
           VALUES (:pn, :line_number, :step_number, :step_name, :param_name, :param_code, :param_value, :unit, :param_type, :min_value, :max_value, :is_required, :remark, :process_category_code, :process_category_name)`,
          {
            replacements: {
              pn: parameterNumber,
              line_number: (i + 1) * 10,
              step_number: d.step_number || null,
              step_name: d.step_name || '',
              param_name: d.param_name || '',
              param_code: d.param_code || '',
              param_value: d.param_value || '',
              unit: d.unit || '',
              param_type: d.param_type || '输入',
              min_value: d.min_value || '',
              max_value: d.max_value || '',
              is_required: d.is_required || 'Y',
              remark: d.remark || '',
              process_category_code: d.process_category_code || null,
              process_category_name: d.process_category_name || null,
            },
          }
        );
      }
    }

    res.json(success({ parameter_number: parameterNumber }, '创建成功'));
  } catch (err) { next(err); }
};

// ==================== 更新（草稿状态） ====================
export const updateProcessParameter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const b = req.body || {};

    const isNumericId = /^\d+$/.test(id);
    const whereClause = isNumericId ? 'id = :id' : 'parameter_number = :id';
    const [rows]: any = await sequelize.query(
      `SELECT id, parameter_number, approval_status FROM process_parameter_header WHERE ${whereClause}`,
      { replacements: { id } }
    );
    if (!rows.length) throw new BusinessError(404, '工艺参数记录不存在');
    if (rows[0].approval_status !== '草稿') throw new BusinessError(400, '仅草稿状态可编辑');

    const numericId = rows[0].id;
    const pn = rows[0].parameter_number;

    await sequelize.query(
      `UPDATE process_parameter_header SET
        item_number = :item_number, item_name = :item_name,
        process_route_number = :process_route_number, version = :version,
        description = :description, remark = :remark
       WHERE id = :id`,
      {
        replacements: {
          id: numericId,
          item_number: b.item_number,
          item_name: b.item_name || '',
          process_route_number: b.process_route_number || null,
          version: b.version || 1,
          description: b.description || '',
          remark: b.remark || '',
        },
      }
    );

    // 全量替换明细
    if (Array.isArray(b.details)) {
      await sequelize.query('DELETE FROM process_parameter_detail WHERE parameter_number = :pn', { replacements: { pn } });
      for (let i = 0; i < b.details.length; i++) {
        const d = b.details[i];
        await sequelize.query(
          `INSERT INTO process_parameter_detail (parameter_number, line_number, step_number, step_name, param_name, param_code, param_value, unit, param_type, min_value, max_value, is_required, remark, process_category_code, process_category_name)
           VALUES (:pn, :line_number, :step_number, :step_name, :param_name, :param_code, :param_value, :unit, :param_type, :min_value, :max_value, :is_required, :remark, :process_category_code, :process_category_name)`,
          {
            replacements: {
              pn,
              line_number: (i + 1) * 10,
              step_number: d.step_number || null,
              step_name: d.step_name || '',
              param_name: d.param_name || '',
              param_code: d.param_code || '',
              param_value: d.param_value || '',
              unit: d.unit || '',
              param_type: d.param_type || '输入',
              min_value: d.min_value || '',
              max_value: d.max_value || '',
              is_required: d.is_required || 'Y',
              remark: d.remark || '',
              process_category_code: d.process_category_code || null,
              process_category_name: d.process_category_name || null,
            },
          }
        );
      }
    }

    res.json(success(null, '更新成功'));
  } catch (err) { next(err); }
};

// ==================== 删除（草稿状态） ====================
export const deleteProcessParameter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const isNumericId = /^\d+$/.test(id);
    const whereClause = isNumericId ? 'id = :id' : 'parameter_number = :id';
    const [rows]: any = await sequelize.query(
      `SELECT id, parameter_number, approval_status FROM process_parameter_header WHERE ${whereClause}`,
      { replacements: { id } }
    );
    if (!rows.length) throw new BusinessError(404, '工艺参数记录不存在');
    if (rows[0].approval_status !== '草稿') throw new BusinessError(400, '仅草稿状态可删除');

    const numericId = rows[0].id;
    const pn = rows[0].parameter_number;
    await sequelize.query('DELETE FROM process_parameter_detail WHERE parameter_number = :pn', { replacements: { pn } });
    await sequelize.query('DELETE FROM process_parameter_header WHERE id = :id', { replacements: { id: numericId } });

    res.json(success(null, '删除成功'));
  } catch (err) { next(err); }
};

// ==================== 按产品查询生效参数 ====================
export const getParametersByItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemNumber } = req.params;
    // 产品级默认参数
    const [items]: any = await sequelize.query(
      `SELECT h.parameter_number, h.process_route_number, h.version, h.approval_status, d.line_number, d.step_number, d.step_name, d.param_name, d.param_code, d.param_value, d.unit, d.param_type, d.min_value, d.max_value, d.is_required
       FROM process_parameter_header h
       INNER JOIN process_parameter_detail d ON h.parameter_number = d.parameter_number
       WHERE h.item_number = :itemNumber AND h.approval_status = N'已审批' AND h.[condition] = N'启用'
         AND h.process_route_number IS NULL
       ORDER BY d.line_number`,
      { replacements: { itemNumber } }
    );
    res.json(success(items));
  } catch (err) { next(err); }
};

// ==================== 按产品+工艺路线查询生效参数 ====================
export const getParametersByRoute = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemNumber, routeNumber } = req.params;
    // 优先工艺路线级
    const [routeParams]: any = await sequelize.query(
      `SELECT h.parameter_number, h.process_route_number, h.version, h.approval_status, d.line_number, d.step_number, d.step_name, d.param_name, d.param_code, d.param_value, d.unit, d.param_type, d.min_value, d.max_value, d.is_required
       FROM process_parameter_header h
       INNER JOIN process_parameter_detail d ON h.parameter_number = d.parameter_number
       WHERE h.item_number = :itemNumber AND h.process_route_number = :routeNumber
         AND h.approval_status = N'已审批' AND h.[condition] = N'启用'
       ORDER BY d.line_number`,
      { replacements: { itemNumber, routeNumber } }
    );
    if (routeParams.length > 0) {
      res.json(success(routeParams));
      return;
    }
    // 回退到产品级
    const [itemParams]: any = await sequelize.query(
      `SELECT h.parameter_number, h.process_route_number, h.version, h.approval_status, d.line_number, d.step_number, d.step_name, d.param_name, d.param_code, d.param_value, d.unit, d.param_type, d.min_value, d.max_value, d.is_required
       FROM process_parameter_header h
       INNER JOIN process_parameter_detail d ON h.parameter_number = d.parameter_number
       WHERE h.item_number = :itemNumber AND h.process_route_number IS NULL
         AND h.approval_status = N'已审批' AND h.[condition] = N'启用'
       ORDER BY d.line_number`,
      { replacements: { itemNumber } }
    );
    res.json(success(itemParams));
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
export const exportProcessParameters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const XLSX = await import('xlsx');
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE h.parameter_number LIKE :search OR h.item_number LIKE :search OR h.item_name LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [headers]: any = await sequelize.query(
      `SELECT ${headerSelectCols} FROM process_parameter_header h ${whereClause} ORDER BY h.id`,
      { replacements }
    );

    const wb = XLSX.utils.book_new();
    for (const h of headers) {
      const [details]: any = await sequelize.query(
        `SELECT ${detailSelectCols} FROM process_parameter_detail WHERE parameter_number = :pn ORDER BY line_number`,
        { replacements: { pn: h.parameter_number } }
      );
      const wsData = [
        ['参数编号', '产品编号', '产品名称', '工艺路线编号', '版本', '说明', '备注'],
        [h.parameter_number, h.item_number, h.item_name, h.process_route_number || '', h.version, h.description, h.remark],
        [],
        ['工序号', '工序名称', '参数编码', '参数名称', '工艺分类编码', '工艺分类名称', '参数值', '单位', '参数类型', '最小值', '最大值', '必填', '备注'],
        ...details.map((d: any) => [d.step_number, d.step_name, d.param_code, d.param_name, d.process_category_code || '', d.process_category_name || '', d.param_value, d.unit, d.param_type, d.min_value, d.max_value, d.is_required, d.remark]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = wsData[3].map(() => ({ wch: 14 }));
      const sheetName = h.parameter_number.replace(/[\\/:*?"<>|]/g, '_').substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const encoded = encodeURIComponent('工艺参数导出.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
};

// ==================== 导入模板下载 ====================
const importDetailFields = ['step_number', 'step_name', 'param_code', 'param_name', 'process_category_code', 'process_category_name', 'param_value', 'unit', 'param_type', 'min_value', 'max_value', 'is_required', 'remark'];
const importDetailHeaders = ['工序号', '工序名称', '参数编码', '参数名称', '工艺分类编码', '工艺分类名称', '参数值', '单位', '参数类型', '最小值', '最大值', '必填', '备注'];

export const downloadImportTemplate = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const headerRows = [
      ['产品编号(*)', '产品名称', '工艺路线编号', '版本', '说明', '备注'],
      ['P100809', 'O型密封圈', '', '1', '', ''],
    ];
    const detailRows = [
      importDetailHeaders,
      ['SF', '混炼', 'HD001', '硬度', '01', '预混工艺', '70', 'ShA', '输出', '60', '80', 'Y', ''],
      ['EX', '挤出', 'MD001', '门尼粘度', '02', '挤出工艺', '50', 'MU', '输出', '40', '60', 'Y', ''],
    ];

    const allRows = [...headerRows, [], ...detailRows];
    const ws = XLSX.utils.aoa_to_sheet(allRows);
    ws['!cols'] = allRows[3].map(() => ({ wch: 14 }));

    XLSX.utils.book_append_sheet(wb, ws, '工艺参数导入');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const encoded = encodeURIComponent('工艺参数导入模板.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
};

// ==================== 导入 ====================
export const importProcessParameters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }

    const XLSX = await import('xlsx');
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // 读取主表字段（第2行）
    const headerValues = allData[1] || [];
    const excelItemNumber = String(headerValues[0] || '').trim();
    const excelItemName = String(headerValues[1] || '').trim();
    const excelRouteNumber = String(headerValues[2] || '').trim();
    const excelVersion = String(headerValues[3] || '').trim() || '1';
    const excelDescription = String(headerValues[4] || '').trim();
    const excelRemark = String(headerValues[5] || '').trim();

    if (!excelItemNumber) { res.status(400).json({ success: false, message: '产品编号不能为空，请在Excel第2行第1列填写' }); return; }

    // 解析明细行（跳过3行：主表标签、主表值、空行）
    const detailJsonData: any[] = XLSX.utils.sheet_to_json(ws, { range: 3 });
    const rows = detailJsonData.map((row: any) => {
      const item: any = {};
      importDetailFields.forEach((f, i) => {
        item[f] = String(row[importDetailHeaders[i]] ?? row[f] ?? '').trim();
      });
      return item;
    }).filter((r: any) => r.step_number || r.param_code || r.param_name);

    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件明细内容为空' }); return; }

    // 生成编号并创建
    const parameterNumber = await generateParameterNumber(factoryCode);
    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const user = (req as any).user;

    await sequelize.query(
      `INSERT INTO process_parameter_header (parameter_number, item_number, item_name, process_route_number, version, description, approval_status, [condition], creation_date, creation_man, remark)
       VALUES (:parameter_number, :item_number, :item_name, :process_route_number, :version, :description, N'草稿', N'启用', :creation_date, :creation_man, :remark)`,
      {
        replacements: {
          parameter_number: parameterNumber,
          item_number: excelItemNumber,
          item_name: excelItemName,
          process_route_number: excelRouteNumber || null,
          version: parseInt(excelVersion) || 1,
          description: excelDescription,
          creation_date: now,
          creation_man: user?.username || '',
          remark: excelRemark,
        },
      }
    );

    for (let i = 0; i < rows.length; i++) {
      const d = rows[i];
      await sequelize.query(
        `INSERT INTO process_parameter_detail (parameter_number, line_number, step_number, step_name, param_name, param_code, param_value, unit, param_type, min_value, max_value, is_required, remark, process_category_code, process_category_name)
         VALUES (:pn, :line_number, :step_number, :step_name, :param_name, :param_code, :param_value, :unit, :param_type, :min_value, :max_value, :is_required, :remark, :process_category_code, :process_category_name)`,
        {
          replacements: {
            pn: parameterNumber,
            line_number: (i + 1) * 10,
            step_number: d.step_number || null,
            step_name: d.step_name || '',
            param_name: d.param_name || '',
            param_code: d.param_code || '',
            param_value: d.param_value || '',
            unit: d.unit || '',
            param_type: d.param_type || '输入',
            min_value: d.min_value || '',
            max_value: d.max_value || '',
            is_required: d.is_required || 'Y',
            remark: d.remark || '',
            process_category_code: d.process_category_code || null,
            process_category_name: d.process_category_name || null,
          },
        }
      );
    }

    res.json(success({ parameter_number: parameterNumber }, `成功导入 ${rows.length} 条明细`));
  } catch (err) { next(err); }
};
