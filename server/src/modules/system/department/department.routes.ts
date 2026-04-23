import { Router } from 'express'
import { authenticate } from '../../../middleware/auth.middleware'
import { requireRole } from '../../../middleware/role.middleware'
import { validateCreateDepartment, validateUpdateDepartment } from '../../../validators/system.validator'
import {
  getDepartments,
  getActiveDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentUsers,
  getDepartmentTree,
  getDepartmentChildren,
  getDepartmentPath
} from './department.controller'

const router = Router()

// Get department tree (full tree structure)
router.get('/tree', authenticate, getDepartmentTree)

// Get all active departments (for dropdowns) - any authenticated user
// 支持 ?tree=true 参数返回树形结构
router.get('/active', authenticate, getActiveDepartments)

// Get all departments with pagination - any authenticated user
// 支持 ?parent_id= 参数筛选
router.get('/', authenticate, getDepartments)

// Get children departments by parent ID
// 使用 'null' 或 '0' 获取根部门
router.get('/children/:id', authenticate, getDepartmentChildren)

// Get department path (breadcrumb)
router.get('/:id/path', authenticate, getDepartmentPath)

// Get department by ID
router.get('/:id', authenticate, getDepartmentById)

// Get users in a department
router.get('/:id/users', authenticate, getDepartmentUsers)

// Admin only operations
router.post('/', authenticate, requireRole('admin'), validateCreateDepartment, createDepartment)
router.put('/:id', authenticate, requireRole('admin'), validateUpdateDepartment, updateDepartment)
router.delete('/:id', authenticate, requireRole('admin'), deleteDepartment)

export default router
