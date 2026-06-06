/**
 * 生产完工自动入库服务
 * 当生产单状态变为"已完成"时，自动根据物品类型（成品/非成品）生成对应的入库单
 * - 成品 → 成品仓生产入库（productionInboundFinished）
 * - 非成品 → 原料仓半成品生产入库（productionInboundMaterial）
 */
import sequelize from '@/config/database';
import { productionInboundFinished } from '@/services/warehouse/finishedGoods';
import { productionInboundMaterial } from '@/services/warehouse/material';
import { createLogger } from '@/config/logger';

const log = createLogger('autoProductionInbound');

/**
 * 自动生成生产入库单
 * 在生产单变为"已完成"时触发
 * @param orderNo 生产单编号
 * @param transaction 数据库事务（可选）
 */
export const autoProductionInbound = async (orderNo: string, transaction?: any): Promise<void> => {
  const txOpt = transaction ? { transaction } : {};

  try {
    // 1. 获取生产单信息 + 物品类型 + 末道正品数 + factory_id
    const [orderRows]: any = await sequelize.query(
      `SELECT po.production_order_number, po.item_number, po.item_name, po.specifications,
              po.basic_unit, po.product_drawing_number, po.planned_quantity,
              ISNULL(po.inbound_quantity, 0) as current_inbound,
              po.production_date,
              po.factory_id,
              im.item_type
       FROM production_order po
       LEFT JOIN item_master im ON po.item_number = im.item_number
       WHERE po.production_order_number = :orderNo`,
      { replacements: { orderNo }, ...txOpt }
    );
    if (!orderRows.length) {
      log.warn({ orderNo }, '生产单不存在，跳过自动入库');
      return;
    }
    const order = orderRows[0];
    const itemType = (order.item_type || '').trim();
    const currentInbound = Number(order.current_inbound) || 0;
    const factoryId: number | null = order.factory_id ?? null;
    const factoryCond = factoryId ? ` AND factory_id = ${factoryId}` : '';

    // 2. 计算末道正品数（待入库数量）
    const [lastStepRows]: any = await sequelize.query(
      `SELECT ISNULL(SUM(ISNULL(qualified_quantity, 0)), 0) as total_qualified
       FROM work_report wr
       WHERE wr.production_order_number = :orderNo
         AND wr.step_number = (SELECT MAX(step_number) FROM work_report WHERE production_order_number = :orderNo)`,
      { replacements: { orderNo }, ...txOpt }
    );
    const lastStepQualified = Number(lastStepRows[0]?.total_qualified) || 0;
    const pendingQty = lastStepQualified - currentInbound;

    if (pendingQty <= 0) {
      log.info({ orderNo, lastStepQualified, currentInbound }, '无需入库（已全部入库或无待入库数量），跳过');
      return;
    }

    // 3. 根据物品类型确定入库仓库
    let warehouseNumber = '';
    let warehouseName = '';

    if (itemType === '成品') {
      // 成品 → 查成品仓库（优先按名称匹配，其次按类型匹配）
      const [whRows]: any = await sequelize.query(
        `SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE (warehouse_type = N'成品仓库' OR warehouse_name LIKE N'%成品%')${factoryCond} ORDER BY warehouse_number`,
        { ...txOpt }
      );
      if (whRows.length > 0) {
        warehouseNumber = whRows[0].warehouse_number;
        warehouseName = whRows[0].warehouse_name;
      }
    } else {
      // 非成品（半成品等） → 查原料仓库（排除成品仓、报废仓、待检仓、线边仓）
      const [whRows]: any = await sequelize.query(
        `SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE warehouse_type NOT IN (N'成品仓库', N'报废仓库', N'待检仓库', N'线边仓库') AND warehouse_name NOT LIKE N'%成品%' AND (is_in_balance = N'Y' OR is_in_balance = N'是')${factoryCond} ORDER BY warehouse_number`,
        { ...txOpt }
      );
      if (whRows.length > 0) {
        warehouseNumber = whRows[0].warehouse_number;
        warehouseName = whRows[0].warehouse_name;
      }
    }

    if (!warehouseNumber) {
      log.warn({ orderNo, itemType }, '未找到合适的入库仓库，跳过自动入库');
      return;
    }

    log.info({ orderNo, itemType, warehouseNumber, warehouseName, pendingQty }, '开始自动入库');

    // 4. 调用对应的入库服务
    const operator = 'system'; // 系统自动触发

    if (itemType === '成品') {
      await productionInboundFinished({
        items: [{
          item_number: order.item_number,
          item_name: order.item_name || '',
          specifications: order.specifications || '',
          basic_unit: order.basic_unit || '',
          product_drawing_number: order.product_drawing_number || '',
          inbound_qty: pendingQty,
          production_order_number: orderNo,
          inbound_quantity: currentInbound,
          planned_quantity: Number(order.planned_quantity) || 0,
          production_date: order.production_date || null,
        }],
        warehouse_number: warehouseNumber,
        warehouse_name: warehouseName,
        remark: `生产完工自动入库 ${orderNo}`,
      }, operator);
    } else {
      await productionInboundMaterial({
        items: [{
          item_number: order.item_number,
          item_name: order.item_name || '',
          specifications: order.specifications || '',
          basic_unit: order.basic_unit || '',
          inbound_qty: pendingQty,
          production_order_number: orderNo,
          inbound_quantity: currentInbound,
          planned_quantity: Number(order.planned_quantity) || 0,
          production_date: order.production_date || null,
        }],
        warehouse_number: warehouseNumber,
        warehouse_name: warehouseName,
        remark: `生产完工自动入库 ${orderNo}`,
      }, operator);
    }

    log.info({ orderNo, itemType, warehouseNumber, pendingQty }, '自动入库完成');
  } catch (err: any) {
    // 自动入库失败不应阻断主流程，记录错误即可
    log.error({ orderNo, error: err }, '自动入库失败（不影响主流程）');
  }
};