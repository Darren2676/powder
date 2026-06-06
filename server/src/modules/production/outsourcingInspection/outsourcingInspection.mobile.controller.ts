/**
 * 移动端质检控制器
 */
import { Request, Response } from 'express';
import { sequelize } from '../../../models';
import { getFactoryId } from '../../../utils/factoryWhere.util';

/**
 * 获取任务单详情（移动端质检用）
 * GET /api/mobile/inspection/task/:task_number
 */
export const getInspectionTask = async (req: Request, res: Response) => {
  try {
    const { task_number } = req.params;
    const _factoryId = getFactoryId(req);

    // 查询工序任务
    const [tasks]: any = await sequelize.query(`
      SELECT TOP 1
        pt.task_number,
        pt.production_order_number,
        pt.process_number,
        pt.process_name,
        po.item_number,
        im.item_name,
        im.specifications,
        pt.planned_quantity,
        ISNULL(pt.reported_quantity, 0) AS reported_quantity
      FROM process_task pt
      LEFT JOIN production_order po ON pt.production_order_number = po.production_order_number
      LEFT JOIN item_master im ON po.item_number = im.item_number
      WHERE pt.task_number = :task_number ${_factoryId !== null ? 'AND po.factory_id = :_factoryId' : ''}
    `, {
      replacements: { task_number, ...(_factoryId !== null ? { _factoryId } : {}) }
    });

    if (!tasks || tasks.length === 0) {
      return res.status(404).json({
        success: false,
        message: '任务单不存在'
      });
    }

    res.json({
      success: true,
      data: tasks[0]
    });
  } catch (error: any) {
    console.error('获取任务单失败:', error);
    res.status(500).json({
      success: false,
      message: '获取任务单失败',
      error: error.message
    });
  }
};

/**
 * 提交质检结果（移动端）
 * POST /api/mobile/inspection
 */
export const submitInspection = async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();
  try {
    const _factoryId = getFactoryId(req);
    const {
      task_number,
      production_order_number,
      process_number,
      item_number,
      qualified_quantity,
      unqualified_quantity,
      defect_description,
      remark,
      judgment,
    } = req.body;

    if (!task_number) {
      return res.status(400).json({
        success: false,
        message: '任务单号不能为空'
      });
    }

    // 生成质检单号
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [maxResult]: any = await sequelize.query(
      `SELECT TOP 1 inspection_number FROM production_inspection 
       WHERE inspection_number LIKE :prefix ${_factoryId !== null ? 'AND factory_id = :_factoryId' : ''}
       ORDER BY inspection_number DESC`,
      {
        replacements: { prefix: `QI${dateStr}%`, ...(_factoryId !== null ? { _factoryId } : {}) },
        transaction
      }
    );

    let seq = 1;
    if (maxResult && maxResult.length > 0) {
      const lastNumber = maxResult[0].inspection_number;
      const lastSeq = parseInt(lastNumber.slice(-3));
      seq = lastSeq + 1;
    }
    const inspection_number = `QI${dateStr}${String(seq).padStart(3, '0')}`;

    // 插入质检记录
    await sequelize.query(`
      INSERT INTO production_inspection (
        inspection_number,
        task_number,
        production_order_number,
        process_number,
        item_number,
        qualified_quantity,
        unqualified_quantity,
        defect_description,
        judgment,
        status,
        remark,
        inspection_date,
        inspector,
        factory_id,
        creation_date
      ) VALUES (
        :inspection_number,
        :task_number,
        :production_order_number,
        :process_number,
        :item_number,
        :qualified_quantity,
        :unqualified_quantity,
        :defect_description,
        :judgment,
        N'待审核',
        :remark,
        GETDATE(),
        N'移动端质检',
        :factory_id,
        GETDATE()
      )
    `, {
      replacements: {
        inspection_number,
        task_number,
        production_order_number,
        process_number,
        item_number,
        qualified_quantity,
        unqualified_quantity,
        defect_description: defect_description || '',
        judgment: judgment || '合格',
        remark: remark || '',
        factory_id: _factoryId,
      },
      transaction
    });

    await transaction.commit();
    res.json({
      success: true,
      message: '质检提交成功',
      data: { inspection_number }
    });
  } catch (error: any) {
    await transaction.rollback();
    console.error('提交质检失败:', error);
    res.status(500).json({
      success: false,
      message: '提交质检失败',
      error: error.message
    });
  }
};
