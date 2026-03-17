import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

// ==================== Header CRUD ====================

export const getRoutingHeaders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const condition = (req.query.condition as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    let whereClause = '';
    const conditions: string[] = [];
    const replacements: any = {};
    if (search) { conditions.push(`(process_route_number LIKE :search OR process_route_name LIKE :search OR item_number LIKE :search)`); replacements.search = `%${search}%`; }
    if (condition) { conditions.push(`[condition] = :condition`); replacements.condition = condition; }
    if (approval_status) { conditions.push(`approval_status = :approval_status`); replacements.approval_status = approval_status; }
    if (conditions.length) whereClause = 'WHERE ' + conditions.join(' AND ');
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM routing_header ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY process_route_number) AS _row_num FROM routing_header ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取工艺路线列表成功'));
  } catch (err) { next(err); }
};

export const getRoutingHeaderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(`SELECT * FROM routing_header WHERE process_route_number = :id`, { replacements: { id } });
    if (!headers.length) { res.status(404).json({ success: false, message: '工艺路线不存在' }); return; }
    const [details]: any = await sequelize.query(`SELECT * FROM routing_detail WHERE process_route_number = :id ORDER BY step_number`, { replacements: { id } });
    res.json(success({ header: headers[0], details }, '获取工艺路线详情成功'));
  } catch (err) { next(err); }
};

export const createRoutingHeader = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.process_route_number) { res.status(400).json({ success: false, message: '工艺路线编号不能为空' }); return; }
    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const creation_man = (req as any).user?.username || '';
    await sequelize.query(`INSERT INTO routing_header (process_route_number, process_route_name, item_number, item_name, production_automatic_inventory_entry_rules, [condition], creation_date, creation_man, approval_status) VALUES (:process_route_number, :process_route_name, :item_number, :item_name, :production_automatic_inventory_entry_rules, :condition, :creation_date, :creation_man, N'草稿')`, {
      replacements: {
        process_route_number: b.process_route_number,
        process_route_name: b.process_route_name || '',
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        production_automatic_inventory_entry_rules: b.production_automatic_inventory_entry_rules || '',
        condition: b.condition || '启用',
        creation_date,
        creation_man
      }
    });
    res.json(success(null, '创建工艺路线成功'));
  } catch (err) { next(err); }
};

export const updateRoutingHeader = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    // 审批状态校验：只有草稿状态可以编辑
    const [check]: any = await sequelize.query(`SELECT approval_status FROM routing_header WHERE process_route_number = :id`, { replacements: { id } });
    if (check.length && check[0].approval_status !== '草稿') { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return; }
    await sequelize.query(`UPDATE routing_header SET process_route_name = :process_route_name, item_number = :item_number, item_name = :item_name, production_automatic_inventory_entry_rules = :production_automatic_inventory_entry_rules, [condition] = :condition WHERE process_route_number = :id`, {
      replacements: {
        id,
        process_route_name: b.process_route_name || '',
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        production_automatic_inventory_entry_rules: b.production_automatic_inventory_entry_rules || '',
        condition: b.condition || '启用'
      }
    });
    res.json(success(null, '更新工艺路线成功'));
  } catch (err) { next(err); }
};

export const deleteRoutingHeader = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // 审批状态校验：只有草稿状态可以删除
    const [check]: any = await sequelize.query(`SELECT approval_status FROM routing_header WHERE process_route_number = :id`, { replacements: { id } });
    if (check.length && check[0].approval_status !== '草稿') { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return; }
    await sequelize.query(`DELETE FROM routing_header WHERE process_route_number = :id`, { replacements: { id } });
    res.json(success(null, '删除工艺路线成功'));
  } catch (err) { next(err); }
};

// ==================== Detail CRUD ====================

export const getRoutingDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    const [items]: any = await sequelize.query(`SELECT * FROM routing_detail WHERE process_route_number = :headerId ORDER BY step_number`, { replacements: { headerId } });
    res.json(success(items, '获取工序明细成功'));
  } catch (err) { next(err); }
};

export const addRoutingDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    const b = req.body;
    // 自动计算 step_number
    let step_number = b.step_number;
    if (!step_number) {
      const [maxResult]: any = await sequelize.query(`SELECT ISNULL(MAX(step_number), 0) as max_step FROM routing_detail WHERE process_route_number = :headerId`, { replacements: { headerId } });
      step_number = (maxResult[0].max_step || 0) + 10;
    }
    const [result]: any = await sequelize.query(`INSERT INTO routing_detail (process_route_number, step_number, standard_process_number, standard_process_name, post_processing_sequence_number, post_processing_sequence_name, work_center_number, work_center_name, excess_reporting_ratio, ingredient_addition_method, process_material_input_number, process_material_input_quantity, process_material_input_unit, material_wastage_rate, flowing_backward, default_repository) OUTPUT INSERTED.id VALUES (:process_route_number, :step_number, :standard_process_number, :standard_process_name, :post_processing_sequence_number, :post_processing_sequence_name, :work_center_number, :work_center_name, :excess_reporting_ratio, :ingredient_addition_method, :process_material_input_number, :process_material_input_quantity, :process_material_input_unit, :material_wastage_rate, :flowing_backward, :default_repository)`, {
      replacements: {
        process_route_number: headerId,
        step_number,
        standard_process_number: b.standard_process_number || '',
        standard_process_name: b.standard_process_name || '',
        post_processing_sequence_number: b.post_processing_sequence_number || '',
        post_processing_sequence_name: b.post_processing_sequence_name || '',
        work_center_number: b.work_center_number || '',
        work_center_name: b.work_center_name || '',
        excess_reporting_ratio: b.excess_reporting_ratio || '',
        ingredient_addition_method: b.ingredient_addition_method || '',
        process_material_input_number: b.process_material_input_number || '',
        process_material_input_quantity: b.process_material_input_quantity || '',
        process_material_input_unit: b.process_material_input_unit || '',
        material_wastage_rate: b.material_wastage_rate || '',
        flowing_backward: b.flowing_backward || '',
        default_repository: b.default_repository || ''
      }
    });
    const newId = result[0]?.id;
    res.json(success({ id: newId, step_number }, '新增工序成功'));
  } catch (err) { next(err); }
};

export const updateRoutingDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const b = req.body;
    await sequelize.query(`UPDATE routing_detail SET step_number = :step_number, standard_process_number = :standard_process_number, standard_process_name = :standard_process_name, post_processing_sequence_number = :post_processing_sequence_number, post_processing_sequence_name = :post_processing_sequence_name, work_center_number = :work_center_number, work_center_name = :work_center_name, excess_reporting_ratio = :excess_reporting_ratio, ingredient_addition_method = :ingredient_addition_method, process_material_input_number = :process_material_input_number, process_material_input_quantity = :process_material_input_quantity, process_material_input_unit = :process_material_input_unit, material_wastage_rate = :material_wastage_rate, flowing_backward = :flowing_backward, default_repository = :default_repository WHERE id = :detailId`, {
      replacements: {
        detailId,
        step_number: b.step_number || 10,
        standard_process_number: b.standard_process_number || '',
        standard_process_name: b.standard_process_name || '',
        post_processing_sequence_number: b.post_processing_sequence_number || '',
        post_processing_sequence_name: b.post_processing_sequence_name || '',
        work_center_number: b.work_center_number || '',
        work_center_name: b.work_center_name || '',
        excess_reporting_ratio: b.excess_reporting_ratio || '',
        ingredient_addition_method: b.ingredient_addition_method || '',
        process_material_input_number: b.process_material_input_number || '',
        process_material_input_quantity: b.process_material_input_quantity || '',
        process_material_input_unit: b.process_material_input_unit || '',
        material_wastage_rate: b.material_wastage_rate || '',
        flowing_backward: b.flowing_backward || '',
        default_repository: b.default_repository || ''
      }
    });
    res.json(success(null, '更新工序成功'));
  } catch (err) { next(err); }
};

export const deleteRoutingDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    await sequelize.query(`DELETE FROM routing_detail WHERE id = :detailId`, { replacements: { detailId } });
    res.json(success(null, '删除工序成功'));
  } catch (err) { next(err); }
};

// ==================== Export / Import ====================

const exportFields = ['process_route_number', 'process_route_name', 'item_number', 'item_name', 'production_automatic_inventory_entry_rules', 'condition', 'step_number', 'standard_process_number', 'standard_process_name', 'post_processing_sequence_number', 'post_processing_sequence_name', 'work_center_number', 'work_center_name', 'excess_reporting_ratio', 'ingredient_addition_method', 'process_material_input_number', 'process_material_input_quantity', 'process_material_input_unit', 'material_wastage_rate', 'flowing_backward', 'default_repository'];
const exportHeaders = ['工艺路线编号', '工艺路线名称', '产品编号', '产品名称', '生产自动入库规则', '状态', '工序序号', '标准工序编号', '标准工序名称', '后置工序编号', '后置工序名称', '工作中心编号', '工作中心名称', '超额报工比例', '配料方式', '工序物料投入编号', '工序物料投入数量', '工序物料投入单位', '物料损耗率', '倒冲', '默认仓库'];

export const exportRoutingHeaders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT h.process_route_number, h.process_route_name, h.item_number, h.item_name, h.production_automatic_inventory_entry_rules, h.[condition], d.step_number, d.standard_process_number, d.standard_process_name, d.post_processing_sequence_number, d.post_processing_sequence_name, d.work_center_number, d.work_center_name, d.excess_reporting_ratio, d.ingredient_addition_method, d.process_material_input_number, d.process_material_input_quantity, d.process_material_input_unit, d.material_wastage_rate, d.flowing_backward, d.default_repository FROM routing_header h LEFT JOIN routing_detail d ON h.process_route_number = d.process_route_number ORDER BY h.process_route_number, d.step_number`);
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, exportFields, exportHeaders, 'routing_masters', res, format);
  } catch (err) { next(err); }
};

export const importRoutingHeaders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, exportFields, exportHeaders);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }

    const creation_man = (req as any).user?.username || '';
    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 按 process_route_number 分组
    const grouped: Record<string, any[]> = {};
    for (const row of rows) {
      const key = row.process_route_number || '';
      if (!key) continue;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    }

    let headerCount = 0;
    let detailCount = 0;
    const transaction = await sequelize.transaction();
    try {
      for (const [routeNum, groupRows] of Object.entries(grouped)) {
        const first = groupRows[0];
        // 检查 header 是否已存在
        const [existing]: any = await sequelize.query(`SELECT process_route_number FROM routing_header WHERE process_route_number = :id`, { replacements: { id: routeNum }, transaction });
        if (!existing.length) {
          await sequelize.query(`INSERT INTO routing_header (process_route_number, process_route_name, item_number, item_name, production_automatic_inventory_entry_rules, [condition], creation_date, creation_man, approval_status) VALUES (:process_route_number, :process_route_name, :item_number, :item_name, :production_automatic_inventory_entry_rules, :condition, :creation_date, :creation_man, N'草稿')`, {
            replacements: {
              process_route_number: routeNum,
              process_route_name: first.process_route_name || '',
              item_number: first.item_number || '',
              item_name: first.item_name || '',
              production_automatic_inventory_entry_rules: first.production_automatic_inventory_entry_rules || '',
              condition: first.condition || '启用',
              creation_date,
              creation_man
            }, transaction
          });
          headerCount++;
        }
        // 插入 details
        for (const row of groupRows) {
          if (!row.standard_process_number && !row.step_number) continue;
          await sequelize.query(`INSERT INTO routing_detail (process_route_number, step_number, standard_process_number, standard_process_name, post_processing_sequence_number, post_processing_sequence_name, work_center_number, work_center_name, excess_reporting_ratio, ingredient_addition_method, process_material_input_number, process_material_input_quantity, process_material_input_unit, material_wastage_rate, flowing_backward, default_repository) VALUES (:process_route_number, :step_number, :standard_process_number, :standard_process_name, :post_processing_sequence_number, :post_processing_sequence_name, :work_center_number, :work_center_name, :excess_reporting_ratio, :ingredient_addition_method, :process_material_input_number, :process_material_input_quantity, :process_material_input_unit, :material_wastage_rate, :flowing_backward, :default_repository)`, {
            replacements: {
              process_route_number: routeNum,
              step_number: row.step_number || 10,
              standard_process_number: row.standard_process_number || '',
              standard_process_name: row.standard_process_name || '',
              post_processing_sequence_number: row.post_processing_sequence_number || '',
              post_processing_sequence_name: row.post_processing_sequence_name || '',
              work_center_number: row.work_center_number || '',
              work_center_name: row.work_center_name || '',
              excess_reporting_ratio: row.excess_reporting_ratio || '',
              ingredient_addition_method: row.ingredient_addition_method || '',
              process_material_input_number: row.process_material_input_number || '',
              process_material_input_quantity: row.process_material_input_quantity || '',
              process_material_input_unit: row.process_material_input_unit || '',
              material_wastage_rate: row.material_wastage_rate || '',
              flowing_backward: row.flowing_backward || '',
              default_repository: row.default_repository || ''
            }, transaction
          });
          detailCount++;
        }
      }
      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
    res.json(success({ headerCount, detailCount }, `成功导入 ${headerCount} 条工艺路线，${detailCount} 条工序明细`));
  } catch (err) { next(err); }
};
