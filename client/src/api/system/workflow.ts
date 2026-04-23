/**
 * Workflow Definition Management API
 */

import request from '@/utils/request'

// Types
export interface WorkflowModule {
  module: string
  displayName: string
}

export interface WorkflowHandler {
  id?: number
  node_id?: number
  handler_type: 'user' | 'role' | 'department' | 'dept_role' | 'initiator'
  user_id?: number | null
  user_name?: string
  role?: string | null
  department_id?: number | null
  department_name?: string
}

export interface WorkflowNode {
  id?: number
  definition_id?: number
  node_key: string
  name: string
  node_type: 'start' | 'end' | 'approval' | 'countersign' | 'notification' | 'condition'
  countersign_type?: 'all' | 'majority' | 'any' | null
  position_x?: number
  position_y?: number
  handlers?: WorkflowHandler[]
}

export interface WorkflowEdge {
  id?: number
  definition_id?: number
  from_node_id: number
  to_node_id: number
  from_node_name?: string
  to_node_name?: string
  condition_expression?: string | null
  label?: string
  priority?: number
}

export interface WorkflowDefinition {
  id?: number
  name: string
  module: string
  version?: number
  description?: string
  status?: 'draft' | 'published' | 'deprecated'
  created_by?: number
  created_at?: string
  updated_at?: string
  nodes?: WorkflowNode[]
  edges?: WorkflowEdge[]
}

// API Functions

export function getModules(): Promise<any> {
  return request.get('/workflows/modules')
}

export function getDefinitions(params?: {
  page?: number
  limit?: number
  search?: string
  module?: string
  status?: string
}): Promise<any> {
  return request.get('/workflows', { params })
}

export function getDefinitionById(id: number): Promise<any> {
  return request.get(`/workflows/${id}`)
}

export function createDefinition(data: {
  name: string
  module: string
  description?: string
}): Promise<any> {
  return request.post('/workflows', data)
}

export function updateDefinition(id: number, data: {
  name: string
  description?: string
}): Promise<any> {
  return request.put(`/workflows/${id}`, data)
}

export function deleteDefinition(id: number): Promise<any> {
  return request.delete(`/workflows/${id}`)
}

export function publishDefinition(id: number): Promise<any> {
  return request.post(`/workflows/${id}/publish`)
}

export function copyDefinition(id: number): Promise<any> {
  return request.post(`/workflows/${id}/copy`)
}

// Node API
export function createNode(definitionId: number, data: Partial<WorkflowNode>): Promise<any> {
  return request.post(`/workflows/${definitionId}/nodes`, data)
}

export function updateNode(nodeId: number, data: Partial<WorkflowNode>): Promise<any> {
  return request.put(`/workflows/nodes/${nodeId}`, data)
}

export function deleteNode(nodeId: number): Promise<any> {
  return request.delete(`/workflows/nodes/${nodeId}`)
}

export function setNodeHandlers(nodeId: number, handlers: WorkflowHandler[]): Promise<any> {
  return request.put(`/workflows/nodes/${nodeId}/handlers`, { handlers })
}

// Edge API
export function createEdge(definitionId: number, data: Partial<WorkflowEdge>): Promise<any> {
  return request.post(`/workflows/${definitionId}/edges`, data)
}

export function updateEdge(edgeId: number, data: Partial<WorkflowEdge>): Promise<any> {
  return request.put(`/workflows/edges/${edgeId}`, data)
}

export function deleteEdge(edgeId: number): Promise<any> {
  return request.delete(`/workflows/edges/${edgeId}`)
}

// ==================== Runtime API ====================

export interface WorkflowTask {
  id: number
  instance_id: number
  node_id: number
  node_key: string
  node_name: string
  node_type: string
  assignee_id: number
  assignee_name: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  remark?: string
  created_at: string
  completed_at?: string
  instance_title?: string
  module?: string
  record_id?: string
  instance_status?: string
  initiator_name?: string
}

export interface WorkflowInstance {
  id: number
  definition_id: number
  module: string
  record_id: string
  title: string
  status: 'running' | 'completed' | 'rejected' | 'cancelled'
  initiator_id: number
  initiator_name: string
  current_node_id?: number
  business_data?: any
  started_at: string
  completed_at?: string
  current_node?: WorkflowNode
  pending_tasks?: WorkflowTask[]
  history?: any[]
}

export function checkModuleWorkflow(module: string): Promise<any> {
  return request.get(`/workflow-runtime/check/${module}`)
}

export function startWorkflow(module: string, recordId: string): Promise<any> {
  return request.post('/workflow-runtime/start', { module, recordId })
}

export function processTask(taskId: number, action: 'approve' | 'reject', remark?: string): Promise<any> {
  return request.post(`/workflow-runtime/tasks/${taskId}/process`, { action, remark })
}

export function withdrawWorkflow(instanceId: number): Promise<any> {
  return request.post(`/workflow-runtime/instances/${instanceId}/withdraw`)
}

export function getMyTasks(params?: { page?: number; limit?: number; status?: string }): Promise<any> {
  return request.get('/workflow-runtime/my-tasks', { params })
}

export function getMyInitiated(params?: { page?: number; limit?: number; status?: string }): Promise<any> {
  return request.get('/workflow-runtime/my-initiated', { params })
}

export function getTaskDetail(taskId: number): Promise<any> {
  return request.get(`/workflow-runtime/tasks/${taskId}`)
}

export function getInstanceByRecord(module: string, recordId: string): Promise<any> {
  return request.get(`/workflow-runtime/instances/${module}/${recordId}`)
}

export function getBusinessDetail(module: string, recordId: string): Promise<any> {
  return request.get(`/workflow-runtime/business-detail/${module}/${recordId}`)
}

export function getWorkflowStats(): Promise<any> {
  return request.get('/workflow-runtime/stats')
}
