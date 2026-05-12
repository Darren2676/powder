import request from '@/utils/request';
import type { ApiResponse } from '@/types';

/** 异常检测 */
export const detectExceptions = (module: string, record_ids: string[]) => {
  return request<ApiResponse<any[]>>({
    url: '/manual-close/detect',
    method: 'POST',
    data: { module, record_ids },
  });
};

/** 提交关闭申请 */
export const submitManualClose = (module: string, record_ids: string[], close_reason: string, close_remark: string) => {
  return request<ApiResponse<any>>({
    url: '/manual-close/submit',
    method: 'POST',
    data: { module, record_ids, close_reason, close_remark },
  });
};

/** 审批通过 */
export const approveManualClose = (batch_group: string, remark?: string) => {
  return request<ApiResponse<any>>({
    url: '/manual-close/approve',
    method: 'PUT',
    data: { batch_group, remark },
  });
};

/** 拒绝关闭 */
export const rejectManualClose = (batch_group: string, remark?: string) => {
  return request<ApiResponse<any>>({
    url: '/manual-close/reject',
    method: 'PUT',
    data: { batch_group, remark },
  });
};

/** 撤回申请 */
export const withdrawManualClose = (batch_group: string) => {
  return request<ApiResponse<any>>({
    url: '/manual-close/withdraw',
    method: 'PUT',
    data: { batch_group },
  });
};

/** 获取待审批列表 */
export const getPendingManualCloses = (params?: { page?: number; limit?: number }) => {
  return request<ApiResponse<any>>({
    url: '/manual-close/pending',
    method: 'GET',
    params,
  });
};

/** 获取关闭原因选项 */
export const getCloseReasons = (module: string) => {
  return request<ApiResponse<any[]>>({
    url: `/manual-close/reasons/${module}`,
    method: 'GET',
  });
};
