import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import {
  getPackingOrders,
  getPackingOrderDetail,
  getAvailableBatches,
  createPackingOrder,
  confirmPackingOrder,
  cancelPackingOrder,
  getBoxByNumber,
  getBagByNumber,
  assignLabelsToBox,
  removeLabelFromBox,
  regenerateBoxes,
  shippingBoxOutbound,
  getBoxInventory,
  unpackPackingOrder,
  unpackBoxes
} from './packingOrder.controller';

const router = Router();

// 装箱单列表
router.get('/', authenticate, getPackingOrders);

// 可用批次查询
router.get('/available-batches', authenticate, getAvailableBatches);

// 箱装库存查询
router.get('/box-inventory', authenticate, getBoxInventory);

// 扫箱码出库
router.post('/box-outbound', authenticate, shippingBoxOutbound);

// 装箱单详情
router.get('/:packingNumber', authenticate, getPackingOrderDetail);

// 创建装箱单
router.post('/', authenticate, createPackingOrder);

// 确认装箱单
router.post('/:packingNumber/confirm', authenticate, confirmPackingOrder);

// 取消装箱单
router.post('/:packingNumber/cancel', authenticate, cancelPackingOrder);

// 整单拆箱
router.post('/:packingNumber/unpack', authenticate, unpackPackingOrder);

// 逐箱拆箱
router.post('/box-unpack', authenticate, unpackBoxes);

// 箱内标签分配
router.post('/:packingNumber/assign-labels', authenticate, assignLabelsToBox);

// 从箱中移除标签
router.post('/:packingNumber/remove-labels', authenticate, removeLabelFromBox);

// 重新生成箱分配
router.post('/:packingNumber/regenerate-boxes', authenticate, regenerateBoxes);

// 扫码查询箱号
router.get('/box/:boxNumber', authenticate, getBoxByNumber);

// 扫码查询袋号（兼容旧接口）
router.get('/bag/:bagNumber', authenticate, getBagByNumber);

export default router;
