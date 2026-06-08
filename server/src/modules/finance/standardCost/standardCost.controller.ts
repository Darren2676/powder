import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import dayjs from 'dayjs';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 编号生成 ====================
const generateCostListNumber = async (factoryCode: string = ''): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `SC-${today}-`;
  const result: any = await sequelize.query(
    `SELECT MAX(cost_list_number) as max_num FROM standard_cost_header WHERE cost_list_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );
  const rows = result[0];
  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 列表 ====================
export const getStandardCosts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      conditions.push(`h.factory_id = :_factoryId`);
      replacements._factoryId = effectiveFactoryId;
    }

    if (search) {
      conditions.push(`(h.cost_list_number LIKE :search OR h.cost_list_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      conditions.push(`h.approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM standard_cost_header h ${whereClause}`, { replacements }
    );
    const total = countResult[0][0].total;

    const offset = (page - 1) * limit;
    const itemsResult: any = await sequelize.query(`
      SELECT * FROM (
        SELECT h.cost_list_number, h.cost_list_name,
               CONVERT(VARCHAR(10), h.effective_date, 23) as effective_date,
               CONVERT(VARCHAR(10), h.expiration_date, 23) as expiration_date,
               h.approval_status, h.remark, h.creation_date, h.creation_man,
               (SELECT COUNT(*) FROM standard_cost_detail d WHERE d.cost_list_number = h.cost_list_number) as detail_count,
               f.factory_name, f.factory_short,
               ROW_NUMBER() OVER (ORDER BY h.creation_date DESC, h.cost_list_number DESC) AS _row_num
        FROM standard_cost_header h
        LEFT JOIN factory f ON h.factory_id = f.id
        ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const items = itemsResult[0].map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({
      items,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取标准成本单价列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getStandardCostDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const headersResult: any = await sequelize.query(
      `SELECT cost_list_number, cost_list_name,
              CONVERT(VARCHAR(10), effective_date, 23) as effective_date,
              CONVERT(VARCHAR(10), expiration_date, 23) as expiration_date,
              approval_status, remark, creation_date, creation_man
       FROM standard_cost_header WHERE cost_list_number = :id${_factoryId !== null ? ' AND factory_id = :_factoryId' : ''}`, { replacements: { id, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) } }
    );
    if (!headersResult[0].length) { res.status(404).json({ success: false, message: '标准成本单价表不存在' }); return; }
    const detailsResult: any = await sequelize.query(
      `SELECT * FROM standard_cost_detail WHERE cost_list_number = :id ORDER BY line_number, item_number`,
      { replacements: { id } }
    );
    res.json(success({ header: headersResult[0][0], details: detailsResult[0] }, '获取标准成本单价详情成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createStandardCost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const b = req.body;
    if (!b.cost_list_name) { res.status(400).json({ success: false, message: '名称不能为空' }); return; }
    if (!b.effective_date) { res.status(400).json({ success: false, message: '生效日期不能为空' }); return; }
    if (!b.expiration_date) { res.status(400).json({ success: false, message: '失效日期不能为空' }); return; }

    const cost_list_number = await generateCostListNumber(factoryCode);
    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO standard_cost_header (cost_list_number, cost_list_name, effective_date, expiration_date,
          approval_status, remark, creation_date, creation_man, factory_id)
        VALUES (:cost_list_number, :cost_list_name, :effective_date, :expiration_date,
          N'草稿', :remark, :creation_date, :creation_man, :factory_id)
      `, {
        replacements: {
          cost_list_number,
          cost_list_name: b.cost_list_name || '',
          effective_date: b.effective_date || null,
          expiration_date: b.expiration_date || null,
          remark: b.remark || '',
          creation_date: now,
          creation_man,
          factory_id: _factoryId
        },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO standard_cost_detail (cost_list_number, line_number,
              item_number, item_name, item_class_name, specifications, basic_unit,
              material_type, standard_cost, actual_cost, drawing_number, version, remark)
            VALUES (:cost_list_number, :line_number,
              :item_number, :item_name, :item_class_name, :specifications, :basic_unit,
              :material_type, :standard_cost, :actual_cost, :drawing_number, :version, :remark)
          `, {
            replacements: {
              cost_list_number,
              line_number: d.line_number || (i + 1) * 10,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              item_class_name: d.item_class_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              material_type: d.material_type || '',
              standard_cost: d.standard_cost || 0,
              actual_cost: d.actual_cost || 0,
              drawing_number: d.drawing_number || '',
              version: d.version || '',
              remark: d.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success({ cost_list_number }, '创建标准成本单价表成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 更新 ====================
export const updateStandardCost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const chkResult: any = await sequelize.query(
      `SELECT approval_status FROM standard_cost_header WHERE cost_list_number = :id`, { replacements: { id } }
    );
    if (!chkResult[0].length) { res.status(404).json({ success: false, message: '标准成本单价表不存在' }); return; }
    if (chkResult[0][0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE standard_cost_header SET
          cost_list_name = :cost_list_name,
          effective_date = :effective_date, expiration_date = :expiration_date,
          remark = :remark, factory_id = :factory_id
        WHERE cost_list_number = :id
      `, {
        replacements: {
          id,
          cost_list_name: b.cost_list_name || '',
          effective_date: b.effective_date || null,
          expiration_date: b.expiration_date || null,
          remark: b.remark || '',
          factory_id: b.factory_id || null
        },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        await sequelize.query(
          `DELETE FROM standard_cost_detail WHERE cost_list_number = :id`,
          { replacements: { id }, transaction }
        );
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO standard_cost_detail (cost_list_number, line_number,
              item_number, item_name, item_class_name, specifications, basic_unit,
              material_type, standard_cost, actual_cost, drawing_number, version, remark)
            VALUES (:cost_list_number, :line_number,
              :item_number, :item_name, :item_class_name, :specifications, :basic_unit,
              :material_type, :standard_cost, :actual_cost, :drawing_number, :version, :remark)
          `, {
            replacements: {
              cost_list_number: id,
              line_number: d.line_number || (i + 1) * 10,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              item_class_name: d.item_class_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              material_type: d.material_type || '',
              standard_cost: d.standard_cost || 0,
              actual_cost: d.actual_cost || 0,
              drawing_number: d.drawing_number || '',
              version: d.version || '',
              remark: d.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success(null, '更新标准成本单价表成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 删除 ====================
export const deleteStandardCost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const chkResult: any = await sequelize.query(
      `SELECT approval_status FROM standard_cost_header WHERE cost_list_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (chkResult[0].length && chkResult[0][0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return;
    }
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM standard_cost_detail WHERE cost_list_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM standard_cost_header WHERE cost_list_number = :id${factoryCond}`, { replacements: { id, ...factoryReps }, transaction });
      await transaction.commit();
      res.json(success(null, '删除标准成本单价表成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['cost_list_number', 'cost_list_name', 'item_number', 'item_name', 'item_class_name', 'specifications', 'basic_unit', 'material_type', 'standard_cost', 'actual_cost', 'drawing_number', 'version', 'remark', 'approval_status', 'factory_short'];
const exportHeaders = ['价目表编号', '价目表名称', '物料编号', '物料名称', '物料分类', '规格', '基本单位', '材质', '标准成本单价', '实际成本', '图号', '版本', '备注', '审批状态', '工厂'];

export const exportStandardCosts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const costListNumbers = (req.query.cost_list_numbers as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (costListNumbers) {
      const nums = costListNumbers.split(',').map((n: string) => n.trim()).filter(Boolean);
      if (nums.length > 0) {
        const placeholders = nums.map((_: any, i: number) => `:n${i}`).join(',');
        whereClause = `WHERE h.cost_list_number IN (${placeholders})`;
        nums.forEach((n: any, i: number) => { replacements[`n${i}`] = n; });
      }
    }
    const itemsResult: any = await sequelize.query(`
      SELECT h.cost_list_number, h.cost_list_name,
             d.item_number, d.item_name, d.item_class_name, d.specifications, d.basic_unit,
             d.material_type, d.standard_cost, d.actual_cost, d.drawing_number, d.version, d.remark,
             h.approval_status, f.factory_short
      FROM standard_cost_header h
      INNER JOIN standard_cost_detail d ON d.cost_list_number = h.cost_list_number
      LEFT JOIN factory f ON h.factory_id = f.id
      ${whereClause}
      ORDER BY h.cost_list_number, d.line_number
    `, { replacements });
    exportToExcel(itemsResult[0], exportFields, exportHeaders, 'standard_costs', res);
  } catch (err) { next(err); }
};

// ==================== 导入模板下载 ====================
const importDetailFields = ['item_number', 'item_name', 'item_class_name', 'specifications', 'basic_unit', 'material_type', 'standard_cost', 'actual_cost', 'drawing_number', 'version', 'remark'];
const importDetailHeaders = ['物料编号', '物料名称', '物料分类', '规格', '基本单位', '材质', '标准成本单价', '实际成本', '图号', '版本', '备注'];

export const downloadImportTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // 第1行：主表字段标签
    // 第2行：主表字段值（示例）
    const headerRows = [
      ['价目表名称(*)', '生效日期(*)', '失效日期(*)', '备注'],
      ['2026年标准成本单价表', '2026-01-01', '2026-12-31', ''],
    ];

    // 第3行：空行分隔
    // 第4行：明细列头
    // 第5行+：示例明细数据
    const detailRows = [
      importDetailHeaders,
      ['C100809', 'O型密封圈', '成品', '50×3.5', '个', 'NBR', '0.85', '0.72', 'DWG-001', 'V1.0', ''],
      ['C100810', '油封', '成品', '80×60×10', '个', 'FKM', '1.20', '1.05', 'DWG-002', 'V1.0', ''],
    ];

    const allRows = [...headerRows, [], ...detailRows];
    const ws = XLSX.utils.aoa_to_sheet(allRows);

    // 设置列宽
    ws['!cols'] = [
      { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 16 },
      { wch: 14 }, { wch: 10 }, { wch: 14 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, '标准成本单价导入');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fullName = '标准成本单价导入模板.xlsx';
    const encoded = encodeURIComponent(fullName);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
};

export const importStandardCost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }

    // 解析Excel：前2行为主表信息，第3行空行，第4行起为明细列头+数据
    const XLSX = await import('xlsx');
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // 读取主表信息（第1行标签，第2行值）
    const headerValues = allData[1] || [];
    const excelCostListName = String(headerValues[0] || '').trim();
    const excelEffectiveDate = String(headerValues[1] || '').trim();
    const excelExpirationDate = String(headerValues[2] || '').trim();
    const excelRemark = String(headerValues[3] || '').trim();

    // 从第4行开始解析明细（跳过：行1=主表标签, 行2=主表值, 行3=空行, 行4=明细列头）
    const detailJsonData: any[] = XLSX.utils.sheet_to_json(ws, { range: 3 });
    const rows = detailJsonData.map((row: any) => {
      const item: any = {};
      importDetailFields.forEach((f, i) => {
        item[f] = String(row[importDetailHeaders[i]] ?? row[f] ?? '').trim();
      });
      return item;
    }).filter((r: any) => r.item_number);

    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件明细内容为空' }); return; }
    if (!excelCostListName) { res.status(400).json({ success: false, message: '价目表名称不能为空，请在Excel第2行第1列填写' }); return; }
    if (!excelEffectiveDate) { res.status(400).json({ success: false, message: '生效日期不能为空，请在Excel第2行第2列填写' }); return; }
    if (!excelExpirationDate) { res.status(400).json({ success: false, message: '失效日期不能为空，请在Excel第2行第3列填写' }); return; }

    const cost_list_number = await generateCostListNumber(factoryCode);
    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO standard_cost_header (cost_list_number, cost_list_name, effective_date, expiration_date,
          approval_status, remark, creation_date, creation_man, factory_id)
        VALUES (:cost_list_number, :cost_list_name, :effective_date, :expiration_date,
          N'草稿', :remark, :creation_date, :creation_man, :factory_id)
      `, {
        replacements: {
          cost_list_number,
          cost_list_name: excelCostListName,
          effective_date: excelEffectiveDate || null,
          expiration_date: excelExpirationDate || null,
          remark: excelRemark,
          creation_date: now,
          creation_man,
          factory_id: _factoryId
        },
        transaction
      });

      for (let i = 0; i < rows.length; i++) {
        const d = rows[i];
        await sequelize.query(`
          INSERT INTO standard_cost_detail (cost_list_number, line_number,
            item_number, item_name, item_class_name, specifications, basic_unit,
            material_type, standard_cost, actual_cost, drawing_number, version, remark)
          VALUES (:cost_list_number, :line_number,
            :item_number, :item_name, :item_class_name, :specifications, :basic_unit,
            :material_type, :standard_cost, :actual_cost, :drawing_number, :version, :remark)
        `, {
          replacements: {
            cost_list_number,
            line_number: (i + 1) * 10,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            item_class_name: d.item_class_name || '',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            material_type: d.material_type || '',
            standard_cost: parseFloat(d.standard_cost) || 0,
            actual_cost: parseFloat(d.actual_cost) || 0,
            drawing_number: d.drawing_number || '',
            version: d.version || '',
            remark: d.remark || ''
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ cost_list_number, imported: rows.length }, `成功导入 ${rows.length} 条明细到标准成本单价表 ${cost_list_number}`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};