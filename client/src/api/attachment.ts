import request from '@/utils/request';
import type { ApiResponse, Attachment } from '@/types';

/**
 * 上传附件
 */
export const uploadAttachment = (ticketId: number, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  
  return request<ApiResponse<Attachment>>({
    url: `/tickets/${ticketId}/attachments`,
    method: 'POST',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};

/**
 * 下载附件
 */
export const downloadAttachment = (id: number) => {
  return request({
    url: `/attachments/${id}/download`,
    method: 'GET',
    responseType: 'blob'
  });
};

/**
 * 删除附件
 */
export const deleteAttachment = (id: number) => {
  return request<ApiResponse<void>>({
    url: `/attachments/${id}`,
    method: 'DELETE'
  });
};

/**
 * 获取工单的附件列表
 */
export const getAttachments = (ticketId: number) => {
  return request<ApiResponse<Attachment[]>>({
    url: `/tickets/${ticketId}/attachments`,
    method: 'GET'
  });
};
