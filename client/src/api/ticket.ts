import request from '@/utils/request';
import type { 
  ApiResponse, 
  PaginatedData, 
  Ticket, 
  TicketQueryParams,
  CreateTicketFormData,
  UpdateTicketFormData
} from '@/types';

/**
 * 获取工单列表
 */
export const getTickets = (params?: TicketQueryParams) => {
  return request<ApiResponse<PaginatedData<Ticket>>>({
    url: '/tickets',
    method: 'GET',
    params
  });
};

/**
 * 根据ID获取工单详情
 */
export const getTicketById = (id: number) => {
  return request<ApiResponse<Ticket>>({
    url: `/tickets/${id}`,
    method: 'GET'
  });
};

/**
 * 创建工单
 */
export const createTicket = (data: CreateTicketFormData) => {
  return request<ApiResponse<Ticket>>({
    url: '/tickets',
    method: 'POST',
    data
  });
};

/**
 * 更新工单
 */
export const updateTicket = (id: number, data: UpdateTicketFormData) => {
  return request<ApiResponse<Ticket>>({
    url: `/tickets/${id}`,
    method: 'PUT',
    data
  });
};

/**
 * 删除工单
 */
export const deleteTicket = (id: number) => {
  return request<ApiResponse<void>>({
    url: `/tickets/${id}`,
    method: 'DELETE'
  });
};

/**
 * 分配工单
 */
export const assignTicket = (id: number, assigneeId: number) => {
  return request<ApiResponse<Ticket>>({
    url: `/tickets/${id}/assign`,
    method: 'PUT',
    data: { assignee_id: assigneeId }
  });
};

/**
 * 更新工单状态
 */
export const updateTicketStatus = (id: number, status: string) => {
  return request<ApiResponse<Ticket>>({
    url: `/tickets/${id}/status`,
    method: 'PUT',
    data: { status }
  });
};

/**
 * 获取我创建的工单
 */
export const getMyCreatedTickets = (params?: TicketQueryParams) => {
  return request<ApiResponse<PaginatedData<Ticket>>>({
    url: '/tickets/my-created',
    method: 'GET',
    params
  });
};

/**
 * 获取分配给我的工单
 */
export const getMyAssignedTickets = (params?: TicketQueryParams) => {
  return request<ApiResponse<PaginatedData<Ticket>>>({
    url: '/tickets/my-assigned',
    method: 'GET',
    params
  });
};
