import request from '@/utils/request';
import type { ApiResponse } from '@/types';

export interface CompletionCondition {
  field: string;
  operator: 'equals' | 'in' | 'all_lines';
  value: string | string[];
  scope: 'header' | 'detail';
  required: boolean;
  label: string;
}

export interface DocumentCompletionConfig {
  id: number;
  document_type: string;
  document_type_name: string;
  enabled: boolean;
  conditions: string; // JSON string
  tolerance_pct: number;
  completion_status: string;
  updated_by: string;
  updated_at: string;
}

/** 获取所有配置 */
export const getAllConfigs = () => {
  return request<ApiResponse<DocumentCompletionConfig[]>>({
    url: '/document-completion-config',
    method: 'GET',
  });
};

/** 获取指定类型配置 */
export const getConfigByType = (type: string) => {
  return request<ApiResponse<DocumentCompletionConfig>>({
    url: `/document-completion-config/${type}`,
    method: 'GET',
  });
};

/** 更新配置 */
export const updateConfig = (type: string, data: {
  enabled?: boolean;
  conditions?: string;
  tolerance_pct?: number;
}) => {
  return request<ApiResponse<void>>({
    url: `/document-completion-config/${type}`,
    method: 'PUT',
    data,
  });
};

/** 重置配置为默认值 */
export const resetConfig = (type: string) => {
  return request<ApiResponse<void>>({
    url: `/document-completion-config/${type}/reset`,
    method: 'PUT',
  });
};
