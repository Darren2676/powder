import request from '@/utils/request';
import type { ApiResponse } from '@/types';

export interface FactoryOverview {
  factory: {
    id: number;
    factory_code: string;
    factory_name: string;
    factory_short?: string;
    status: string;
  };
  users: number;
  sales_30d: { orders: number; amount: number };
  purchase_30d: { orders: number; amount: number };
  production_active: { total: number; completed: number };
  inventory: { items: number; total_qty: number };
}

export interface HeadquartersOverview {
  factories: FactoryOverview[];
  summary: {
    total_factories: number;
    total_sales_amount: number;
    total_purchase_amount: number;
    active_production_orders: number;
  };
}

/**
 * 获取总部仪表盘概览
 */
export const getHeadquartersOverview = () => {
  return request<ApiResponse<HeadquartersOverview>>({
    url: '/headquarters/overview',
    method: 'GET'
  });
};

// ==================== 集团汇总报表 API ====================

export interface FactoryBase {
  id: number;
  factory_code: string;
  factory_name: string;
  factory_short?: string;
  status: string;
}

export interface DateRangeParams {
  dateFrom?: string;
  dateTo?: string;
}

// 集团销售汇总
export interface SalesSummaryRow {
  factory: FactoryBase;
  order_count: number;
  total_amount: number;
  completed_amount: number;
  completed_count: number;
  pending_count: number;
  cancelled_count: number;
  monthly_trend: { month: string; order_count: number; total_amount: number }[];
}
export interface SalesSummaryData {
  factories: SalesSummaryRow[];
  summary: {
    total_orders: number;
    total_amount: number;
    completed_amount: number;
    pending_count: number;
    cancelled_count: number;
  };
}
export const getHQSalesSummary = (params?: DateRangeParams) => {
  return request<ApiResponse<SalesSummaryData>>({ url: '/headquarters/sales-summary', method: 'GET', params });
};

// 集团生产汇总
export interface ProductionSummaryRow {
  factory: FactoryBase;
  total_orders: number;
  completed_count: number;
  inbound_count: number;
  in_progress_count: number;
  cancelled_count: number;
  total_planned_qty: number;
  total_completed_qty: number;
  total_inbound_qty: number;
  monthly_trend: { month: string; order_count: number; planned_qty: number; completed_qty: number }[];
}
export interface ProductionSummaryData {
  factories: ProductionSummaryRow[];
  summary: {
    total_orders: number;
    completed_count: number;
    in_progress_count: number;
    total_planned_qty: number;
    total_completed_qty: number;
    completion_rate: string;
  };
}
export const getHQProductionSummary = (params?: DateRangeParams) => {
  return request<ApiResponse<ProductionSummaryData>>({ url: '/headquarters/production-summary', method: 'GET', params });
};

// 集团采购汇总
export interface PurchaseSummaryRow {
  factory: FactoryBase;
  order_count: number;
  total_amount: number;
  completed_count: number;
  pending_count: number;
  completed_amount: number;
  monthly_trend: { month: string; order_count: number; total_amount: number }[];
}
export interface PurchaseSummaryData {
  factories: PurchaseSummaryRow[];
  summary: {
    total_orders: number;
    total_amount: number;
    completed_amount: number;
    pending_count: number;
  };
}
export const getHQPurchaseSummary = (params?: DateRangeParams) => {
  return request<ApiResponse<PurchaseSummaryData>>({ url: '/headquarters/purchase-summary', method: 'GET', params });
};

// 集团库存汇总
export interface InventorySummaryRow {
  factory: FactoryBase;
  material: { batch_count: number; total_qty: number };
  finished: { batch_count: number; total_qty: number };
  by_warehouse_type: { warehouse_type: string; batch_count: number; total_qty: number }[];
}
export interface InventorySummaryData {
  factories: InventorySummaryRow[];
  summary: {
    total_material_batches: number;
    total_material_qty: number;
    total_finished_batches: number;
    total_finished_qty: number;
  };
}
export const getHQInventorySummary = () => {
  return request<ApiResponse<InventorySummaryData>>({ url: '/headquarters/inventory-summary', method: 'GET' });
};

// 集团财务汇总
export interface FinanceSummaryRow {
  factory: FactoryBase;
  sales_amount: number;
  sales_order_count: number;
  purchase_amount: number;
  purchase_order_count: number;
  piece_rate_wage: number;
  wage_count: number;
  gross_margin: number;
}
export interface FinanceSummaryData {
  factories: FinanceSummaryRow[];
  summary: {
    total_sales_amount: number;
    total_purchase_amount: number;
    total_piece_rate_wage: number;
    total_gross_margin: number;
  };
}
export const getHQFinanceSummary = (params?: DateRangeParams) => {
  return request<ApiResponse<FinanceSummaryData>>({ url: '/headquarters/finance-summary', method: 'GET', params });
};

// 集团质量汇总
export interface QualitySummaryRow {
  factory: FactoryBase;
  inspection: {
    inspection_count: number;
    total_inspected_qty: number;
    total_qualified_qty: number;
    total_unqualified_qty: number;
    qualified_count: number;
    unqualified_count: number;
    pending_count: number;
  };
  qualified_rate: string;
  nonconforming: {
    nc_count: number;
    total_nc_qty: number;
    pending_handling: number;
    handled_count: number;
    rework_count: number;
    scrap_count: number;
    concession_count: number;
  };
}
export interface QualitySummaryData {
  factories: QualitySummaryRow[];
  summary: {
    total_inspection_count: number;
    total_inspected_qty: number;
    total_qualified_qty: number;
    total_unqualified_qty: number;
    overall_qualified_rate: string;
    total_nc_count: number;
  };
}
export const getHQQualitySummary = (params?: DateRangeParams) => {
  return request<ApiResponse<QualitySummaryData>>({ url: '/headquarters/quality-summary', method: 'GET', params });
};

// 集团出入库流水总表
export interface InventoryFlowRow {
  factory: FactoryBase;
  flows: { transaction_type: string; transaction_count: number; total_qty: number; category: string }[];
  inbound_total: number;
  outbound_total: number;
}
export interface InventoryFlowData {
  factories: InventoryFlowRow[];
  summary: {
    total_inbound: number;
    total_outbound: number;
    total_transactions: number;
  };
}
export const getHQInventoryFlow = (params?: DateRangeParams) => {
  return request<ApiResponse<InventoryFlowData>>({ url: '/headquarters/inventory-flow', method: 'GET', params });
};
