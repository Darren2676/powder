import request from '@/utils/request'

// ==================== 入库单明细行级别对账 ====================

export function getPurchaseReconciliationPage(params?: {
  page?: number; limit?: number; search?: string; reconciliationStatus?: string; factory_id?: number
}) {
  return request.get('/stock-ins/reconciliation/page', { params })
}

export function updatePurchaseReconciliationStatus(data: { detailIds: number[]; reconciliationStatus: string }) {
  return request.put('/stock-ins/reconciliation/status', data)
}

export function getPurchaseReconciliationPrintData(detailIds: number[]) {
  return request.post('/stock-ins/reconciliation/print', { detailIds })
}

// ==================== 采购订单明细行级别对账 ====================

export function getPurchaseOrderReconciliationPage(params?: {
  page?: number; limit?: number; search?: string; reconciliationStatus?: string; factory_id?: number
}) {
  return request.get('/purchase-orders/reconciliation/page', { params })
}

export function updatePurchaseOrderReconciliationStatus(data: { detailIds: number[]; reconciliationStatus: string }) {
  return request.put('/purchase-orders/reconciliation/status', data)
}

export function getPurchaseOrderReconciliationPrintData(detailIds: number[]) {
  return request.post('/purchase-orders/reconciliation/print', { detailIds })
}
