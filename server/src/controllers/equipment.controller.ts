import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

const fields = ['equipment_number', 'equipment_name', 'record_date', 'equipment_type', 'equipment_model', 'manufacture_date', 'remark'];
const headers = ['设备编号', '设备名称', '登记日期', '设备类型', '设备型号', '出厂日期', '备注'];

export const getEquipments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';

    let whereClause = '';
    const replacements: any = {};

    if (search) {
      whereClause = `WHERE equipment_number LIKE :search OR equipment_name LIKE :search OR equipment_type LIKE :search OR equipment_model LIKE :search`;
      replacements.search = `%${search}%`;
    }

    const countSql = `SELECT COUNT(*) as total FROM equipment ${whereClause}`;
    const [countResult]: any = await sequelize.query(countSql, { replacements });
    const total = countResult[0].total;

    const dataSql = `
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY equipment_number) AS _row_num
        FROM equipment ${whereClause}
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
    }, '获取设备列表成功'));
  } catch (err) {
    next(err);
  }
};

export const createEquipment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { equipment_number, equipment_name, record_date, equipment_type, equipment_model, manufacture_date, remark } = req.body;

    if (!equipment_number) {
      res.status(400).json({ success: false, message: '设备编号不能为空' });
      return;
    }

    const [existing]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM equipment WHERE equipment_number = :equipment_number`,
      { replacements: { equipment_number } }
    );
    if (existing[0].cnt > 0) {
      res.status(400).json({ success: false, message: '设备编号已存在' });
      return;
    }

    await sequelize.query(
      `INSERT INTO equipment (equipment_number, equipment_name, record_date, equipment_type, equipment_model, manufacture_date, remark)
       VALUES (:equipment_number, :equipment_name, :record_date, :equipment_type, :equipment_model, :manufacture_date, :remark)`,
      {
        replacements: {
          equipment_number,
          equipment_name: equipment_name || '',
          record_date: record_date || null,
          equipment_type: equipment_type || '',
          equipment_model: equipment_model || '',
          manufacture_date: manufacture_date || null,
          remark: remark || ''
        }
      }
    );

    res.json(success(null, '创建设备成功'));
  } catch (err) {
    next(err);
  }
};

export const updateEquipment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { equipment_name, record_date, equipment_type, equipment_model, manufacture_date, remark } = req.body;

    await sequelize.query(
      `UPDATE equipment SET
        equipment_name = :equipment_name,
        record_date = :record_date,
        equipment_type = :equipment_type,
        equipment_model = :equipment_model,
        manufacture_date = :manufacture_date,
        remark = :remark
      WHERE equipment_number = :id`,
      {
        replacements: { id, equipment_name, record_date, equipment_type, equipment_model, manufacture_date, remark }
      }
    );

    res.json(success(null, '更新设备成功'));
  } catch (err) {
    next(err);
  }
};

export const deleteEquipment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM equipment WHERE equipment_number = :id`, {
      replacements: { id }
    });
    res.json(success(null, '删除设备成功'));
  } catch (err) {
    next(err);
  }
};

export const exportEquipments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE equipment_number LIKE :search OR equipment_name LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [items]: any = await sequelize.query(`SELECT ${fields.join(', ')} FROM equipment ${whereClause} ORDER BY equipment_number`, { replacements });
    exportToExcel(items, fields, headers, 'equipments', res);
  } catch (err) { next(err); }
};

export const importEquipments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let imported = 0;
    for (const item of rows) {
      try {
        const [existing]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM equipment WHERE equipment_number = :equipment_number`, { replacements: { equipment_number: item.equipment_number } });
        if (existing[0].cnt > 0) {
          await sequelize.query(`UPDATE equipment SET equipment_name = :equipment_name, record_date = :record_date, equipment_type = :equipment_type, equipment_model = :equipment_model, manufacture_date = :manufacture_date, remark = :remark WHERE equipment_number = :equipment_number`, { replacements: item });
        } else {
          await sequelize.query(`INSERT INTO equipment (${fields.join(', ')}) VALUES (${fields.map(f => ':' + f).join(', ')})`, { replacements: item });
        }
        imported++;
      } catch (e) {}
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};
