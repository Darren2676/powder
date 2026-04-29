/**
 * 仓库服务 - 桶导出（向后兼容）
 * 业务逻辑已拆分至 warehouse/ 子目录：
 *   - helpers.ts       内部辅助函数（库存Upsert/流水/FIFO批次扣减/追溯）
 *   - finishedGoods.ts  成品仓业务（生产入库/发货出库/退货入库/手动调整）
 *   - material.ts       物料仓业务（手工入库/生产入库/手工出库/手动调整）
 */
export { productionInboundFinished, shippingOutbound, returnInbound, adjustFinishedInventory } from './warehouse/finishedGoods';
export { manualInboundMaterial, productionInboundMaterial, manualOutboundMaterial, adjustMaterialInventory } from './warehouse/material';
