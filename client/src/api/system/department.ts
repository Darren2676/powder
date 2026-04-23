import request from '@/utils/request'

export interface Department {
  id: number
  dept_code: string
  dept_name: string
  description: string
  status: 'active' | 'inactive'
  parent_id: number | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DepartmentTreeNode extends Department {
  children?: DepartmentTreeNode[]
}

export interface DepartmentUser {
  id: number
  username: string
  real_name: string
  email: string
  role: string
  status: string
}

// Get all departments with pagination
// 支持 parent_id 参数筛选：parent_id='' 或 'null' 表示根部门
export const getDepartments = (params?: {
  page?: number
  limit?: number
  search?: string
  status?: string
  parent_id?: string | number | null
}) => request.get('/departments', { params })

// Get all active departments (for dropdowns)
// tree=true 返回树形结构
export const getActiveDepartments = (tree?: boolean) => 
  request.get('/departments/active', { params: tree ? { tree: true } : undefined })

// Get department tree (full tree structure)
export const getDepartmentTree = (status?: string) => 
  request.get('/departments/tree', { params: status ? { status } : undefined })

// Get children departments by parent ID
// id='null' 或 0 表示获取根部门
export const getDepartmentChildren = (id: number | string | null) => {
  const parentId = id === null ? 'null' : id
  return request.get(`/departments/children/${parentId}`)
}

// Get department path (breadcrumb)
export const getDepartmentPath = (id: number) => request.get(`/departments/${id}/path`)

// Get department by ID
export const getDepartmentById = (id: number) => request.get(`/departments/${id}`)

// Get users in a department
export const getDepartmentUsers = (id: number) => request.get(`/departments/${id}/users`)

// Create department
export const createDepartment = (data: {
  dept_code: string
  dept_name: string
  description?: string
  parent_id?: number | null
  sort_order?: number
}) => request.post('/departments', data)

// Update department
export const updateDepartment = (id: number, data: {
  dept_code: string
  dept_name: string
  description?: string
  status?: string
  parent_id?: number | null
  sort_order?: number
}) => request.put(`/departments/${id}`, data)

// Delete department (soft delete)
export const deleteDepartment = (id: number) => request.delete(`/departments/${id}`)
