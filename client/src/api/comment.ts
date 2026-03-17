import request from '@/utils/request';
import type { ApiResponse, Comment } from '@/types';

/**
 * 获取工单的评论列表
 */
export const getComments = (ticketId: number) => {
  return request<ApiResponse<Comment[]>>({
    url: `/tickets/${ticketId}/comments`,
    method: 'GET'
  });
};

/**
 * 创建评论
 */
export const createComment = (ticketId: number, content: string) => {
  return request<ApiResponse<Comment>>({
    url: `/tickets/${ticketId}/comments`,
    method: 'POST',
    data: { content }
  });
};

/**
 * 更新评论
 */
export const updateComment = (id: number, content: string) => {
  return request<ApiResponse<Comment>>({
    url: `/comments/${id}`,
    method: 'PUT',
    data: { content }
  });
};

/**
 * 删除评论
 */
export const deleteComment = (id: number) => {
  return request<ApiResponse<void>>({
    url: `/comments/${id}`,
    method: 'DELETE'
  });
};
