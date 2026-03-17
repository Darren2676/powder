import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

// routing表实际字段: process_route_number, process_route_name, item_number, item_name, production_automatic_inventory_entry_rules, standard_process_number, standard_process_name, post_processing_sequence_number, post_processing_sequence_name, work_center_number, work_center_name, excess_reporting_ratio, ingredient_addition_method, process_material_input_number, process_material_input_quantity, process_material_input_unit, material_wastage_rate, flowing_backward, default_ repository

const fields = ['process_route_number', 'process_route_name', 'item_number', 'item_name', 'production_automatic_inventory_entry_rules', 'standard_process_number', 'standard_process_name', 'post_processing_sequence_number', 'post_processing_sequence_name', 'work_center_number', 'work_center_name', 'excess_reporting_ratio', 'ingredient_addition_method', 'process_material_input_number', 'process_material_input_quantity', 'process_material_input_unit', 'material_wastage_rate', 'flowing_backward', 'default_ repository'];
const headers = ['工艺路线编号', '工艺路线名称', '产品编号', '产品名称', '生产自动入库规则', '标准工序编号', '标准工序名称', '后置工序编号', '后置工序名称', '工作中心编号', '工作中心名称', '超额报工比例', '配料方式', '工序物料投入编号', '工序物料投入数量', '工序物料投入单位', '物料损耗率', '倒冲', '默认仓库'];

export const getRoutings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) { whereClause = `WHERE process_route_number LIKE :search OR process_route_name LIKE :search OR item_number LIKE :search`; replacements.search = `%${search}%`; }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM routing ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY process_route_number, post_processing_sequence_number) AS _row_num FROM routing ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取工艺路线列表成功'));
  } catch (err) { next(err); }
};

export const createRouting = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.process_route_number) { res.status(400).json({ success: false, message: '工艺路线编号不能为空' }); return; }
    await sequelize.query(`INSERT INTO routing (process_route_number, process_route_name, item_number, item_name, standard_process_number, standard_process_name, post_processing_sequence_number, post_processing_sequence_name, work_center_number, work_center_name, production_automatic_inventory_entry_rules, excess_reporting_ratio, ingredient_addition_method, process_material_input_number, process_material_input_quantity, process_material_input_unit, material_wastage_rate, flowing_backward, [default_ repository]) VALUES (:process_route_number, :process_route_name, :item_number, :item_name, :standard_process_number, :standard_process_name, :post_processing_sequence_number, :post_processing_sequence_name, :work_center_number, :work_center_name, :production_automatic_inventory_entry_rules, :excess_reporting_ratio, :ingredient_addition_method, :process_material_input_number, :process_material_input_quantity, :process_material_input_unit, :material_wastage_rate, :flowing_backward, :default_repository)`, {
      replacements: {
        process_route_number: b.process_route_number,
        process_route_name: b.process_route_name || '',
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        standard_process_number: b.standard_process_number || '',
        standard_process_name: b.standard_process_name || '',
        post_processing_sequence_number: b.post_processing_sequence_number || '',
        post_processing_sequence_name: b.post_processing_sequence_name || '',
        work_center_number: b.work_center_number || '',
        work_center_name: b.work_center_name || '',
        production_automatic_inventory_entry_rules: b.production_automatic_inventory_entry_rules || '',
        excess_reporting_ratio: b.excess_reporting_ratio || '',
        ingredient_addition_method: b.ingredient_addition_method || '',
        process_material_input_number: b.process_material_input_number || '',
        process_material_input_quantity: b.process_material_input_quantity || '',
        process_material_input_unit: b.process_material_input_unit || '',
        material_wastage_rate: b.material_wastage_rate || '',
        flowing_backward: b.flowing_backward || '',
        default_repository: b['default_ repository'] || ''
      }
    });
    res.json(success(null, '创建工艺路线成功'));
  } catch (err) { next(err); }
};

export const updateRouting = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    await sequelize.query(`UPDATE routing SET process_route_name = :process_route_name, item_number = :item_number, item_name = :item_name, standard_process_number = :standard_process_number, standard_process_name = :standard_process_name, post_processing_sequence_number = :post_processing_sequence_number, post_processing_sequence_name = :post_processing_sequence_name, work_center_number = :work_center_number, work_center_name = :work_center_name, production_automatic_inventory_entry_rules = :production_automatic_inventory_entry_rules, excess_reporting_ratio = :excess_reporting_ratio, ingredient_addition_method = :ingredient_addition_method, process_material_input_number = :process_material_input_number, process_material_input_quantity = :process_material_input_quantity, process_material_input_unit = :process_material_input_unit, material_wastage_rate = :material_wastage_rate, flowing_backward = :flowing_backward, [default_ repository] = :default_repository WHERE process_route_number = :id`, {
      replacements: {
        id,
        process_route_name: b.process_route_name || '',
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        standard_process_number: b.standard_process_number || '',
        standard_process_name: b.standard_process_name || '',
        post_processing_sequence_number: b.post_processing_sequence_number || '',
        post_processing_sequence_name: b.post_processing_sequence_name || '',
        work_center_number: b.work_center_number || '',
        work_center_name: b.work_center_name || '',
        production_automatic_inventory_entry_rules: b.production_automatic_inventory_entry_rules || '',
        excess_reporting_ratio: b.excess_reporting_ratio || '',
        ingredient_addition_method: b.ingredient_addition_method || '',
        process_material_input_number: b.process_material_input_number || '',
        process_material_input_quantity: b.process_material_input_quantity || '',
        process_material_input_unit: b.process_material_input_unit || '',
        material_wastage_rate: b.material_wastage_rate || '',
        flowing_backward: b.flowing_backward || '',
        default_repository: b['default_ repository'] || ''
      }
    });
    res.json(success(null, '更新工艺路线成功'));
  } catch (err) { next(err); }
};

export const deleteRouting = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM routing WHERE process_route_number = :id`, { replacements: { id } });
    res.json(success(null, '删除工艺路线成功'));
  } catch (err) { next(err); }
};

export const exportRoutings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM routing ORDER BY process_route_number, post_processing_sequence_number`);
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, fields, headers, 'routings', res, format);
  } catch (err) { next(err); }
};

export const importRoutings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let successCount = 0;
    for (const item of rows) {
      try {
        await sequelize.query(`INSERT INTO routing (process_route_number, process_route_name, item_number, item_name, standard_process_number, standard_process_name, post_processing_sequence_number, post_processing_sequence_name, work_center_number, work_center_name, production_automatic_inventory_entry_rules, excess_reporting_ratio, ingredient_addition_method, process_material_input_number, process_material_input_quantity, process_material_input_unit, material_wastage_rate, flowing_backward, [default_ repository]) VALUES (:process_route_number, :process_route_name, :item_number, :item_name, :standard_process_number, :standard_process_name, :post_processing_sequence_number, :post_processing_sequence_name, :work_center_number, :work_center_name, :production_automatic_inventory_entry_rules, :excess_reporting_ratio, :ingredient_addition_method, :process_material_input_number, :process_material_input_quantity, :process_material_input_unit, :material_wastage_rate, :flowing_backward, :default_repository)`, {
          replacements: {
            process_route_number: item.process_route_number || '',
            process_route_name: item.process_route_name || '',
            item_number: item.item_number || '',
            item_name: item.item_name || '',
            standard_process_number: item.standard_process_number || '',
            standard_process_name: item.standard_process_name || '',
            post_processing_sequence_number: item.post_processing_sequence_number || '',
            post_processing_sequence_name: item.post_processing_sequence_name || '',
            work_center_number: item.work_center_number || '',
            work_center_name: item.work_center_name || '',
            production_automatic_inventory_entry_rules: item.production_automatic_inventory_entry_rules || '',
            excess_reporting_ratio: item.excess_reporting_ratio || '',
            ingredient_addition_method: item.ingredient_addition_method || '',
            process_material_input_number: item.process_material_input_number || '',
            process_material_input_quantity: item.process_material_input_quantity || '',
            process_material_input_unit: item.process_material_input_unit || '',
            material_wastage_rate: item.material_wastage_rate || '',
            flowing_backward: item.flowing_backward || '',
            default_repository: item['default_ repository'] || ''
          }
        });
        successCount++;
      } catch (e) {}
    }
    res.json(success({ successCount, totalCount: rows.length }, `成功导入 ${successCount} 条记录`));
  } catch (err) { next(err); }
};
