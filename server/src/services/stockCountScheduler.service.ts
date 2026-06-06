/**
 * 成品仓自动盘点定时任务
 * 每天 00:30 检查当天是否为某个已开启会计期间的最后一天，
 * 若则自动为每个工厂的成品仓创建全盘盘点单。
 * 支持多工厂隔离：按 warehouse_type='成品仓库' 动态查询各工厂仓库。
 */
import cron, { ScheduledTask } from 'node-cron';
import sequelize from '@/config/database';
import { createLogger } from '@/config/logger';

const log = createLogger('stockCountScheduler');

const COUNT_TYPE = '全盘';
const COUNT_MAN = '系统';
const REMARK = '月末自动盘点';

let scheduledTask: ScheduledTask | null = null;

// ==================== 工具函数 ====================

function formatDateForSQL(date: any): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0');
}

async function generateCountNumber(factoryCode: string = ''): Promise<string> {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `IC${fc}-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(count_number) as max_num FROM stock_count WHERE count_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );

  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
}

// ==================== 获取所有工厂的成品仓库 ====================

async function getFinishedGoodsWarehouses(): Promise<Array<{ warehouse_number: string; warehouse_name: string; factory_id: number | null; factory_code: string }>> {
  const [whRows]: any = await sequelize.query(
    `SELECT w.warehouse_number, w.warehouse_name, w.factory_id,
       ISNULL(f.factory_code, '') as factory_code
     FROM warehouse w
     LEFT JOIN factory f ON w.factory_id = f.id
     WHERE w.warehouse_type = N'成品仓库'
       AND (w.[condition] = N'启用' OR w.[condition] IS NULL OR w.[condition] = N'')
     ORDER BY w.factory_id, w.warehouse_number`
  );
  return whRows;
}

// ==================== 去重检查 ====================

async function isDuplicate(warehouseNumber: string, periodCode: string): Promise<boolean> {
  const [rows]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM stock_count
     WHERE warehouse_number = :warehouse_number
       AND count_period = :count_period
       AND remark = :remark
       AND status != N'已作废'`,
    { replacements: { warehouse_number: warehouseNumber, count_period: periodCode, remark: REMARK } }
  );
  return (rows[0]?.cnt || 0) > 0;
}

// ==================== 查询今天到期的会计期间 ====================

async function getYesterdayEndedPeriods(): Promise<string[]> {
  const [rows]: any = await sequelize.query(
    `SELECT period_code FROM accounting_period
     WHERE status = N'已开启'
       AND CAST(end_date AS DATE) = DATEADD(DAY, -1, CAST(GETDATE() AS DATE))`
  );
  return rows.map((r: any) => r.period_code);
}

// ==================== 核心创建逻辑 ====================

async function createAutoStockCount(
  warehouseNumber: string,
  warehouseName: string,
  factoryCode: string,
  periodCode: string
): Promise<string> {
  const transaction = await sequelize.transaction();
  try {
    const count_number = await generateCountNumber(factoryCode);

    // 查询成品批次库存快照（散装）
    const [batches]: any = await sequelize.query(`
      SELECT id, item_number, item_name, specifications, basic_unit, product_drawing_number,
        batch_number, quantity, production_order_number, inbound_date, quality_status
      FROM finished_batch_inventory
      WHERE warehouse_number = :warehouse_number AND quantity > 0 AND status = N'正常'
      ORDER BY item_number, quality_status, inbound_date ASC, id ASC
    `, { replacements: { warehouse_number: warehouseNumber }, transaction });

    // 查询箱装库存快照
    const [boxRows]: any = await sequelize.query(`
      SELECT id, box_number, item_number, item_name, specifications, basic_unit,
        warehouse_number, warehouse_name, total_quantity, batch_numbers,
        inbound_date, status
      FROM packing_box_inventory
      WHERE warehouse_number = :warehouse_number AND status = N'在库'
      ORDER BY item_number, inbound_date ASC, id ASC
    `, { replacements: { warehouse_number: warehouseNumber }, transaction });

    const scatterDetails = batches.map((r: any) => ({ ...r, inventory_type: '散装' }));
    const boxDetails = boxRows.map((bx: any) => ({ ...bx, inventory_type: '箱装' }));
    const allDetails = [...scatterDetails, ...boxDetails];

    if (allDetails.length === 0) {
      await transaction.rollback();
      log.warn({ periodCode, warehouseNumber }, '成品仓无可盘点的库存，跳过自动盘点');
      return '';
    }

    // 写入明细
    for (let i = 0; i < allDetails.length; i++) {
      const detail = allDetails[i];
      if (detail.inventory_type === '箱装') {
        await sequelize.query(`
          INSERT INTO stock_count_detail (count_number, line_number, item_number, item_name, specifications,
            basic_unit, product_drawing_number, batch_number, batch_inventory_id, system_quantity,
            actual_quantity, difference_quantity, count_status, production_order_number, inbound_date, quality_status, remark)
          VALUES (:count_number, :line_number, :item_number, :item_name, :specifications,
            :basic_unit, :product_drawing_number, :batch_number, :batch_inventory_id, :system_quantity,
            NULL, 0, N'未盘', :production_order_number, :inbound_date, :quality_status, :remark)
        `, {
          replacements: {
            count_number,
            line_number: (i + 1) * 10,
            item_number: detail.item_number,
            item_name: detail.item_name || '',
            specifications: detail.specifications || '',
            basic_unit: detail.basic_unit || '',
            product_drawing_number: '',
            batch_number: detail.box_number,
            batch_inventory_id: detail.id,
            system_quantity: detail.total_quantity,
            production_order_number: '',
            inbound_date: formatDateForSQL(detail.inbound_date),
            quality_status: '合格品',
            remark: `箱装库存|${detail.batch_numbers || ''}|箱号:${detail.box_number}`
          }, transaction
        });
      } else {
        await sequelize.query(`
          INSERT INTO stock_count_detail (count_number, line_number, item_number, item_name, specifications,
            basic_unit, product_drawing_number, batch_number, batch_inventory_id, system_quantity,
            actual_quantity, difference_quantity, count_status, production_order_number, inbound_date, quality_status, remark)
          VALUES (:count_number, :line_number, :item_number, :item_name, :specifications,
            :basic_unit, :product_drawing_number, :batch_number, :batch_inventory_id, :system_quantity,
            NULL, 0, N'未盘', :production_order_number, :inbound_date, :quality_status, '')
        `, {
          replacements: {
            count_number,
            line_number: (i + 1) * 10,
            item_number: detail.item_number,
            item_name: detail.item_name || '',
            specifications: detail.specifications || '',
            basic_unit: detail.basic_unit || '',
            product_drawing_number: detail.product_drawing_number || '',
            batch_number: detail.batch_number,
            batch_inventory_id: detail.id,
            system_quantity: detail.quantity,
            production_order_number: detail.production_order_number || '',
            inbound_date: formatDateForSQL(detail.inbound_date),
            quality_status: detail.quality_status || '合格品'
          }, transaction
        });
      }
    }

    // 统计
    const itemSet = new Set(allDetails.map((d: any) => d.item_number));

    // 写入主表
    await sequelize.query(`
      INSERT INTO stock_count (count_number, count_period, warehouse_number, warehouse_name, count_type,
        status, total_items, total_batches, count_man, count_date, remark, created_time, creation_date, last_updated)
      VALUES (:count_number, :count_period, :warehouse_number, :warehouse_name, :count_type,
        N'盘点中', :total_items, :total_batches, :count_man, GETDATE(), :remark, GETDATE(), GETDATE(), GETDATE())
    `, {
      replacements: {
        count_number,
        count_period: periodCode,
        warehouse_number: warehouseNumber,
        warehouse_name: warehouseName,
        count_type: COUNT_TYPE,
        total_items: itemSet.size,
        total_batches: allDetails.length,
        count_man: COUNT_MAN,
        remark: REMARK
      }, transaction
    });

    await transaction.commit();
    return count_number;
  } catch (e: any) {
    try { await transaction.rollback(); } catch (_) {}
    throw e;
  }
}

// ==================== 定时任务执行逻辑 ====================

export async function executeAutoStockCount(): Promise<{ triggered: boolean; results: Array<{ periodCode: string; warehouseNumber?: string; countNumber?: string; skipped?: string; error?: string }> }> {
  const results: Array<{ periodCode: string; warehouseNumber?: string; countNumber?: string; skipped?: string; error?: string }> = [];

  try {
    const periods = await getYesterdayEndedPeriods();
    if (periods.length === 0) {
      log.debug('昨天不是任何已开启会计期间的最后一天，跳过');
      return { triggered: false, results };
    }

    // 查询所有工厂的成品仓库
    const warehouses = await getFinishedGoodsWarehouses();
    if (warehouses.length === 0) {
      log.warn('未找到成品仓库，跳过自动盘点');
      return { triggered: false, results };
    }

    for (const periodCode of periods) {
      for (const wh of warehouses) {
        try {
          if (await isDuplicate(wh.warehouse_number, periodCode)) {
            log.info({ periodCode, warehouseNumber: wh.warehouse_number }, '该期间已存在自动盘点单，跳过');
            results.push({ periodCode, warehouseNumber: wh.warehouse_number, skipped: '该期间已存在自动盘点单' });
            continue;
          }

          const countNumber = await createAutoStockCount(wh.warehouse_number, wh.warehouse_name, wh.factory_code, periodCode);
          if (countNumber) {
            log.info({ periodCode, warehouseNumber: wh.warehouse_number, countNumber }, '自动盘点单创建成功');
            results.push({ periodCode, warehouseNumber: wh.warehouse_number, countNumber });
          } else {
            results.push({ periodCode, warehouseNumber: wh.warehouse_number, skipped: '成品仓无可盘点的库存' });
          }
        } catch (err: any) {
          log.error({ periodCode, warehouseNumber: wh.warehouse_number, error: err?.message || err }, '自动盘点单创建失败');
          results.push({ periodCode, warehouseNumber: wh.warehouse_number, error: err?.message || '创建失败' });
        }
      }
    }
    return { triggered: true, results };
  } catch (err: any) {
    log.error({ error: err?.message || err }, '自动盘点定时任务执行异常');
    return { triggered: false, results };
  }
}

// ==================== 手动触发（测试用，不检查日期） ====================

export async function manualTriggerAutoStockCount(): Promise<{ triggered: boolean; results: Array<{ periodCode: string; warehouseNumber?: string; countNumber?: string; skipped?: string; error?: string }> }> {
  const results: Array<{ periodCode: string; warehouseNumber?: string; countNumber?: string; skipped?: string; error?: string }> = [];

  try {
    // 查找当前日期所在的已开启会计期间
    const [rows]: any = await sequelize.query(
      `SELECT period_code FROM accounting_period
       WHERE status = N'已开启'
         AND CAST(GETDATE() AS DATE) BETWEEN CAST(start_date AS DATE) AND CAST(end_date AS DATE)`
    );
    const periods: string[] = rows.map((r: any) => r.period_code);

    if (periods.length === 0) {
      log.info('当前日期无对应的已开启会计期间，手动触发跳过');
      return { triggered: false, results: [{ periodCode: '', skipped: '当前日期无对应的已开启会计期间' }] };
    }

    // 取当前日期所在的期间
    const periodCode = periods[0];

    // 查询所有工厂的成品仓库
    const warehouses = await getFinishedGoodsWarehouses();
    if (warehouses.length === 0) {
      log.warn('手动触发: 未找到成品仓库');
      return { triggered: false, results: [{ periodCode, skipped: '未找到成品仓库' }] };
    }

    for (const wh of warehouses) {
      if (await isDuplicate(wh.warehouse_number, periodCode)) {
        log.info({ periodCode, warehouseNumber: wh.warehouse_number }, '手动触发: 该期间已存在自动盘点单，跳过');
        results.push({ periodCode, warehouseNumber: wh.warehouse_number, skipped: '该期间已存在自动盘点单' });
        continue;
      }

      try {
        const countNumber = await createAutoStockCount(wh.warehouse_number, wh.warehouse_name, wh.factory_code, periodCode);
        if (countNumber) {
          log.info({ periodCode, warehouseNumber: wh.warehouse_number, countNumber }, '手动触发: 自动盘点单创建成功');
          results.push({ periodCode, warehouseNumber: wh.warehouse_number, countNumber });
        } else {
          results.push({ periodCode, warehouseNumber: wh.warehouse_number, skipped: '成品仓无可盘点的库存' });
        }
      } catch (err: any) {
        log.error({ periodCode, warehouseNumber: wh.warehouse_number, error: err?.message || err }, '手动触发: 自动盘点单创建失败');
        results.push({ periodCode, warehouseNumber: wh.warehouse_number, error: err?.message || '创建失败' });
      }
    }
    return { triggered: true, results };
  } catch (err: any) {
    log.error({ error: err?.message || err }, '手动触发自动盘点失败');
    return { triggered: false, results: [{ periodCode: '', error: err?.message || '执行失败' }] };
  }
}

// ==================== 启动补偿检查 ====================

async function handleStartupRecovery(): Promise<void> {
  try {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // 仅在 00:30 之后且 01:00 之前才执行补偿
    if (hour !== 0 || minute < 30) {
      return;
    }

    log.info('执行启动补偿检查（当前时间已过00:30）');
    await executeAutoStockCount();
  } catch (err: any) {
    log.error({ error: err?.message || err }, '启动补偿检查失败');
  }
}

// ==================== 公共接口 ====================

export function startStockCountScheduler(): void {
  if (scheduledTask) {
    log.warn('自动盘点定时任务已在运行中，跳过重复启动');
    return;
  }

  // 每天 00:30 执行（会计期间第一天00:30为上期做盘点）
  scheduledTask = cron.schedule('30 0 * * *', () => {
    executeAutoStockCount();
  });

  log.info('自动盘点定时任务已启动 (每天 00:30 检查)');

  // 启动补偿检查（异步，不阻塞启动流程）
  handleStartupRecovery();
}

export function stopStockCountScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    log.info('自动盘点定时任务已停止');
  }
}