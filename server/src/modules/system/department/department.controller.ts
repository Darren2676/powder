import { Request, Response, NextFunction } from 'express'
import sequelize from '../../../config/database'
import { success, paginate } from '../../../utils/response.util'

// 部门树节点接口
interface DepartmentNode {
  id: number
  dept_code: string
  dept_name: string
  description: string
  status: string
  parent_id: number | null
  sort_order: number
  created_at: Date
  updated_at: Date
  children?: DepartmentNode[]
}

// 将扁平部门列表转换为树形结构
// 使用 visited 集合防止环形数据导致无限递归
function buildDepartmentTree(
  departments: DepartmentNode[],
  parentId: number | null = null,
  visited: Set<number> = new Set()
): DepartmentNode[] {
  return departments
    .filter(d => d.parent_id === parentId)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(d => {
      // 防止环形数据导致无限递归，遇到已访问节点时截断
      if (visited.has(d.id)) {
        return { ...d, children: [] }
      }
      const nextVisited = new Set(visited)
      nextVisited.add(d.id)
      return {
        ...d,
        children: buildDepartmentTree(departments, d.id, nextVisited)
      }
    })
}

// 检测是否形成循环引用
async function hasCircularReference(deptId: number, newParentId: number | null): Promise<boolean> {
  if (!newParentId) return false
  
  let currentId: number | null = newParentId
  const visited = new Set<number>()
  
  while (currentId) {
    if (currentId === deptId) return true // 形成循环
    if (visited.has(currentId)) return true // 检测到循环
    visited.add(currentId)
    
    const [result]: any = await sequelize.query(
      `SELECT parent_id FROM departments WHERE id = :id`,
      { replacements: { id: currentId } }
    )
    currentId = result[0]?.parent_id || null
  }
  return false
}

/**
 * Get all departments with optional filtering and pagination
 * 支持按 parent_id 筛选
 */
export const getDepartments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 50
    const search = (req.query.search as string) || ''
    const status = req.query.status as string
    const parentId = req.query.parent_id as string

    const conditions: string[] = []
    const replacements: Record<string, any> = {}

    if (search) {
      conditions.push(`(d.dept_code LIKE :search OR d.dept_name LIKE :search)`)
      replacements.search = `%${search}%`
    }

    if (status) {
      conditions.push(`d.status = :status`)
      replacements.status = status
    }

    // 支持按 parent_id 筛选（包括 NULL 值）
    if (parentId !== undefined) {
      if (parentId === '' || parentId === 'null') {
        conditions.push(`d.parent_id IS NULL`)
      } else {
        conditions.push(`d.parent_id = :parent_id`)
        replacements.parent_id = parseInt(parentId)
      }
    }

    const filterClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

    // 使用递归CTE按树结构排序：先按 sort_order + id 构建路径，前序遍历
    const treeCTE = `
      WITH dept_tree AS (
        SELECT id, dept_code, dept_name, parent_id, sort_order, status, description, created_at, updated_at,
               CAST(RIGHT('0000' + CAST(ISNULL(sort_order, 0) AS VARCHAR), 4) + RIGHT('0000000' + CAST(id AS VARCHAR), 7) AS VARCHAR(4000)) AS tree_path
        FROM departments WHERE parent_id IS NULL
        UNION ALL
        SELECT c.id, c.dept_code, c.dept_name, c.parent_id, c.sort_order, c.status, c.description, c.created_at, c.updated_at,
               CAST(dt.tree_path + '.' + RIGHT('0000' + CAST(ISNULL(c.sort_order, 0) AS VARCHAR), 4) + RIGHT('0000000' + CAST(c.id AS VARCHAR), 7) AS VARCHAR(4000))
        FROM departments c
        JOIN dept_tree dt ON c.parent_id = dt.id
      )
    `

    // Get total count
    const [countResult]: any = await sequelize.query(
      `${treeCTE} SELECT COUNT(*) as total FROM dept_tree d ${filterClause}`,
      { replacements }
    )
    const total = countResult[0].total

    // Get paginated data — 按 tree_path 排序保证树结构顺序，LEFT JOIN 获取上级部门名称
    const offset = (page - 1) * limit
    const [items]: any = await sequelize.query(`
      ${treeCTE}
      SELECT * FROM (
        SELECT d.*, p.dept_name AS parent_dept_name, ROW_NUMBER() OVER (ORDER BY d.tree_path) AS _row_num
        FROM dept_tree d
        LEFT JOIN departments p ON d.parent_id = p.id
        ${filterClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
      ORDER BY t._row_num
    `, {
      replacements: { ...replacements, offset, offsetEnd: offset + limit }
    })

    const cleanItems = items.map((item: any) => {
      const { _row_num, tree_path, ...rest } = item
      return rest
    })

    res.json(paginate(cleanItems, total, page, limit))
  } catch (err) {
    next(err)
  }
}

/**
 * Get all active departments (for dropdowns)
 * 支持扁平列表或树形结构
 */
export const getActiveDepartments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const treeMode = req.query.tree === 'true'
    
    const [items]: any = await sequelize.query(`
      SELECT id, dept_code, dept_name, parent_id, sort_order
      FROM departments
      WHERE status = N'active'
      ORDER BY sort_order ASC, dept_name ASC
    `)

    // 如果请求树形结构，则转换
    if (treeMode) {
      const tree = buildDepartmentTree(items, null)
      res.json(success(tree, '获取部门树成功'))
    } else {
      res.json(success(items, '获取部门列表成功'))
    }
  } catch (err) {
    next(err)
  }
}

/**
 * Get department tree (完整树形结构)
 */
export const getDepartmentTree = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string
    
    let whereClause = ''
    const replacements: Record<string, any> = {}
    
    if (status) {
      whereClause = 'WHERE status = :status'
      replacements.status = status
    }

    const [departments]: any = await sequelize.query(`
      SELECT id, dept_code, dept_name, description, status, parent_id, sort_order, created_at, updated_at
      FROM departments
      ${whereClause}
      ORDER BY sort_order ASC, id ASC
    `, { replacements })

    const tree = buildDepartmentTree(departments, null)
    res.json(success(tree, '获取部门树成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Get children departments by parent ID
 */
export const getDepartmentChildren = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const parentId = id === 'null' || id === '0' ? null : parseInt(id)

    const [items]: any = await sequelize.query(`
      SELECT id, dept_code, dept_name, description, status, parent_id, sort_order, created_at, updated_at
      FROM departments
      WHERE parent_id ${parentId === null ? 'IS NULL' : '= :parentId'}
      ORDER BY sort_order ASC, id ASC
    `, parentId === null ? {} : { replacements: { parentId } })

    res.json(success(items, '获取子部门成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Get department path (breadcrumb)
 */
export const getDepartmentPath = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const deptId = parseInt(id)

    // 获取当前部门信息
    const [deptResult]: any = await sequelize.query(
      `SELECT * FROM departments WHERE id = :id`,
      { replacements: { id: deptId } }
    )

    if (deptResult.length === 0) {
      return res.status(404).json({ success: false, message: '部门不存在' })
    }

    // 递归获取父部门路径
    const path: DepartmentNode[] = []
    let currentId: number | null = deptId
    const visited = new Set<number>()

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      const [result]: any = await sequelize.query(
        `SELECT id, dept_code, dept_name, parent_id FROM departments WHERE id = :id`,
        { replacements: { id: currentId } }
      )
      if (result.length > 0) {
        path.unshift(result[0])
        currentId = result[0].parent_id
      } else {
        break
      }
    }

    res.json(success(path, '获取部门路径成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Get department by ID
 */
export const getDepartmentById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params

    const [items]: any = await sequelize.query(
      `SELECT * FROM departments WHERE id = :id`,
      { replacements: { id } }
    )

    if (items.length === 0) {
      return res.status(404).json({ success: false, message: '部门不存在' })
    }

    res.json(success(items[0], '获取部门成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Create a new department
 * 支持指定 parent_id
 */
export const createDepartment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body

    if (!b.dept_code || !b.dept_name) {
      return res.status(400).json({ success: false, message: '部门编码和名称不能为空' })
    }

    // Check if dept_code already exists
    const [existing]: any = await sequelize.query(
      `SELECT id FROM departments WHERE dept_code = :dept_code`,
      { replacements: { dept_code: b.dept_code } }
    )

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '部门编码已存在' })
    }

    // 如果指定了 parent_id，验证父部门是否存在
    if (b.parent_id) {
      const [parentResult]: any = await sequelize.query(
        `SELECT id FROM departments WHERE id = :parent_id`,
        { replacements: { parent_id: b.parent_id } }
      )
      if (parentResult.length === 0) {
        return res.status(400).json({ success: false, message: '指定的父部门不存在' })
      }
    }

    await sequelize.query(`
      INSERT INTO departments (dept_code, dept_name, description, parent_id, sort_order, status, created_at, updated_at)
      VALUES (:dept_code, :dept_name, :description, :parent_id, :sort_order, N'active', GETDATE(), GETDATE())
    `, {
      replacements: {
        dept_code: b.dept_code,
        dept_name: b.dept_name,
        description: b.description || '',
        parent_id: b.parent_id || null,
        sort_order: b.sort_order || 0
      }
    })

    res.json(success(null, '创建部门成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Update department
 * 支持修改 parent_id，需要检测循环引用
 */
export const updateDepartment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const deptId = parseInt(id)
    const b = req.body

    if (!b.dept_code || !b.dept_name) {
      return res.status(400).json({ success: false, message: '部门编码和名称不能为空' })
    }

    // Check if dept_code already used by another department
    const [existing]: any = await sequelize.query(
      `SELECT id FROM departments WHERE dept_code = :dept_code AND id != :id`,
      { replacements: { dept_code: b.dept_code, id: deptId } }
    )

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '部门编码已被其他部门使用' })
    }

    // 如果要修改 parent_id，检测循环引用
    if (b.parent_id !== undefined) {
      const newParentId = b.parent_id === null || b.parent_id === '' ? null : parseInt(b.parent_id)

      // 不能将自己设为自己的父部门
      if (newParentId === deptId) {
        return res.status(400).json({ success: false, message: '不能将部门设为自己的父部门' })
      }

      // 检测是否形成循环引用
      if (newParentId && await hasCircularReference(deptId, newParentId)) {
        return res.status(400).json({ success: false, message: '不能将部门设为其子部门的子部门，否则会形成循环引用' })
      }

      // 验证父部门是否存在
      if (newParentId) {
        const [parentResult]: any = await sequelize.query(
          `SELECT id FROM departments WHERE id = :parent_id`,
          { replacements: { parent_id: newParentId } }
        )
        if (parentResult.length === 0) {
          return res.status(400).json({ success: false, message: '指定的父部门不存在' })
        }
      }
    }

    // 动态构建 UPDATE 语句，只更新传入的字段，避免未传字段被意外重置
    const setClauses: string[] = [
      'dept_code = :dept_code',
      'dept_name = :dept_name',
      'description = :description',
      'status = :status',
      'updated_at = GETDATE()'
    ]
    const replacements: Record<string, any> = {
      id: deptId,
      dept_code: b.dept_code,
      dept_name: b.dept_name,
      description: b.description || '',
      status: b.status || 'active'
    }

    // 只在 parent_id 被明确传入时才更新
    if (b.parent_id !== undefined) {
      const parentIdValue = b.parent_id === null || b.parent_id === '' ? null : parseInt(b.parent_id)
      setClauses.push('parent_id = :parent_id')
      replacements.parent_id = parentIdValue
    }

    // 只在 sort_order 被明确传入时才更新
    if (b.sort_order !== undefined) {
      setClauses.push('sort_order = :sort_order')
      replacements.sort_order = parseInt(b.sort_order)
    }

    await sequelize.query(`
      UPDATE departments
      SET ${setClauses.join(',\n          ')}
      WHERE id = :id
    `, { replacements })

    res.json(success(null, '更新部门成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Delete department (hard delete - remove from database)
 * 检查是否有子部门
 */
export const deleteDepartment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const deptId = parseInt(id)

    // Check if department has children
    const [childrenCount]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM departments WHERE parent_id = :id`,
      { replacements: { id: deptId } }
    )

    if (childrenCount[0].cnt > 0) {
      return res.status(400).json({
        success: false,
        message: `该部门下有 ${childrenCount[0].cnt} 个子部门，无法删除。请先删除子部门。`
      })
    }

    // Check if department is used by any users
    const [usersCount]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM users WHERE department_id = :id`,
      { replacements: { id: deptId } }
    )

    if (usersCount[0].cnt > 0) {
      return res.status(400).json({
        success: false,
        message: `该部门下有 ${usersCount[0].cnt} 个用户，无法删除。请先将用户转移到其他部门。`
      })
    }

    await sequelize.query(
      `DELETE FROM departments WHERE id = :id`,
      { replacements: { id: deptId } }
    )

    res.json(success(null, '删除部门成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Get users by department ID
 */
export const getDepartmentUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params

    const [users]: any = await sequelize.query(`
      SELECT id, username, real_name, email, role, status
      FROM users
      WHERE department_id = :id
      ORDER BY real_name
    `, { replacements: { id } })

    res.json(success(users, '获取部门用户成功'))
  } catch (err) {
    next(err)
  }
}
