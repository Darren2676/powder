/**
 * 仓库服务 - 桶文件
 * 重新导出所有公共API，保持与原 warehouse.service.ts 完全兼容的导入路径
 */
export { productionInboundFinished, shippingOutbound, returnInbound, adjustFinishedInventory } from './finishedGoods';
export { manualInboundMaterial, productionInboundMaterial, manualOutboundMaterial, adjustMaterialInventory } from './material';
