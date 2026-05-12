import request from '@/utils/request'

// 获取装箱单列表
export const getPackingOrders = (params: any) => request.get('/packing-orders', { params })

// 获取装箱单详情
export const getPackingOrderDetail = (packingNumber: string) => request.get(`/packing-orders/${packingNumber}`)

// 获取可用批次
export const getAvailableBatches = (params: any) => request.get('/packing-orders/available-batches', { params })

// 创建装箱单
export const createPackingOrder = (data: any) => request.post('/packing-orders', data)

// 确认装箱单
export const confirmPackingOrder = (packingNumber: string) => request.post(`/packing-orders/${packingNumber}/confirm`)

// 取消装箱单
export const cancelPackingOrder = (packingNumber: string) => request.post(`/packing-orders/${packingNumber}/cancel`)

// 扫码查询箱号
export const getBoxByNumber = (boxNumber: string) => request.get(`/packing-orders/box/${boxNumber}`)

// 扫码查询袋号（兼容旧接口）
export const getBagByNumber = (bagNumber: string) => request.get(`/packing-orders/bag/${bagNumber}`)

// 箱内标签分配
export const assignLabelsToBox = (packingNumber: string, data: { label_ids: number[], box_number: string }) =>
  request.post(`/packing-orders/${packingNumber}/assign-labels`, data)

// 从箱中移除标签
export const removeLabelFromBox = (packingNumber: string, data: { label_ids: number[] }) =>
  request.post(`/packing-orders/${packingNumber}/remove-labels`, data)

// 重新生成箱分配
export const regenerateBoxes = (packingNumber: string, data: { outer_pack_qty?: number }) =>
  request.post(`/packing-orders/${packingNumber}/regenerate-boxes`, data)

// 箱装库存查询
export const getBoxInventory = (params: any) => request.get('/packing-orders/box-inventory', { params })

// 扫箱码出库
export const shippingBoxOutbound = (data: { box_numbers: string[], warehouse_number: string, shipping_order_number?: string, operator?: string, remark?: string }) =>
  request.post('/packing-orders/box-outbound', data)

// 整单拆箱
export const unpackPackingOrder = (packingNumber: string, data?: { remark?: string }) =>
  request.post(`/packing-orders/${packingNumber}/unpack`, data)

// 逐箱拆箱
export const unpackBoxes = (data: { box_numbers: string[], warehouse_number: string, remark?: string }) =>
  request.post('/packing-orders/box-unpack', data)
