import request from '@/utils/request';
import type { ApiResponse } from '@/types';

export interface BatchNumberRule {
  id: number;
  item_number: string;
  item_name: string;
  factory_id: number | null;
  factory_name?: string;
  batch_rule_mode: 'A' | 'B';
  batch_number_template: string;
  append_split_seq: boolean;
  is_active: string;
  approval_status: string;
  creation_date: string;
  creation_man: string;
  last_updated_at: string;
  last_updater: string;
}

/** 列表查询 */
export const getBatchNumberRules = (params: {
  keyword?: string;
  factory_id?: string;
  batch_rule_mode?: string;
  is_active?: string;
  page?: number;
  pageSize?: number;
}) => {
  return request<ApiResponse<{ rows: BatchNumberRule[]; total: number; page: number; pageSize: number }>>({
    url: '/batch-number-rules',
    method: 'GET',
    params,
  });
};

/** 详情 */
export const getBatchNumberRuleById = (id: number) => {
  return request<ApiResponse<BatchNumberRule>>({
    url: `/batch-number-rules/${id}`,
    method: 'GET',
  });
};

/** 创建 */
export const createBatchNumberRule = (data: {
  item_number: string;
  item_name?: string;
  factory_id?: number | null;
  batch_rule_mode: 'A' | 'B';
  batch_number_template?: string;
  append_split_seq?: boolean;
  is_active?: string;
}) => {
  return request<ApiResponse<void>>({
    url: '/batch-number-rules',
    method: 'POST',
    data,
  });
};

/** 更新 */
export const updateBatchNumberRule = (id: number, data: {
  item_number: string;
  item_name?: string;
  factory_id?: number | null;
  batch_rule_mode: 'A' | 'B';
  batch_number_template?: string;
  append_split_seq?: boolean;
  is_active?: string;
}) => {
  return request<ApiResponse<void>>({
    url: `/batch-number-rules/${id}`,
    method: 'PUT',
    data,
  });
};

/** 删除 */
export const deleteBatchNumberRule = (id: number) => {
  return request<ApiResponse<void>>({
    url: `/batch-number-rules/${id}`,
    method: 'DELETE',
  });
};

/** 审核 */
export const approveBatchNumberRule = (id: number) => {
  return request<ApiResponse<void>>({
    url: `/batch-number-rules/${id}/approve`,
    method: 'POST',
  });
};

/** 撤消审核 */
export const withdrawBatchNumberRule = (id: number) => {
  return request<ApiResponse<void>>({
    url: `/batch-number-rules/${id}/withdraw`,
    method: 'POST',
  });
};

/** 查询指定产品的生效规则 */
export const lookupBatchNumberRule = (itemNumber: string, factoryId?: number | null) => {
  return request<ApiResponse<{ mode: 'A' | 'B'; template: string; append_split_seq: boolean } | null>>({
    url: '/batch-number-rules/lookup',
    method: 'GET',
    params: { item_number: itemNumber, factory_id: factoryId },
  });
};
