import request from '@/utils/request'

// Demand Report
export const demandReport = (data: any) => request.post('/purchase-calc/demand-report', data)

// Generate Purchase Req
export const generatePurchaseReq = (data: any) => request.post('/purchase-calc/generate-purchase-req', data)
