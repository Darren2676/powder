/**
 * Workflow Runtime Controller
 * Handles workflow execution: start, approve, reject, withdraw, task queries
 */

import { Request, Response, NextFunction } from 'express'
import sequelize from '../../../config/database'
import { success, paginate } from '../../../utils/response.util'
import { getFactoryId } from '../../../utils/factoryWhere.util'
import {
  startWorkflow,
  processTask,
  withdrawWorkflow,
  hasActiveWorkflow,
  moduleConfig
} from '../../../services/workflow.engine'

/**
 * Check if a module has an active workflow definition
 */
export const checkModuleWorkflow = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const module = req.params.module as string

    if (!moduleConfig[module]) {
      return res.status(400).json({ success: false, message: '无效的模块' })
    }

    const hasWorkflow = await hasActiveWorkflow(module)
    res.json(success({ hasWorkflow }, '查询成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Start a workflow for a business record
 */
export const startWorkflowForRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body
    const user = (req as any).user

    if (!b.module || !b.recordId) {
      return res.status(400).json({ success: false, message: '模块和记录ID不能为空' })
    }

    if (!moduleConfig[b.module]) {
      return res.status(400).json({ success: false, message: '无效的模块' })
    }

    const result = await startWorkflow(b.module, b.recordId, {
      id: user.id,
      username: user.username
    }, getFactoryId(req) ?? undefined)

    if (result.success) {
      res.json(success({ instanceId: result.instanceId }, result.message))
    } else {
      res.status(400).json({ success: false, message: result.message })
    }
  } catch (err) {
    next(err)
  }
}

/**
 * Process a task (approve or reject)
 */
export const processWorkflowTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.taskId as string
    const b = req.body
    const user = (req as any).user

    if (!['approve', 'reject'].includes(b.action)) {
      return res.status(400).json({ success: false, message: '无效的操作' })
    }

    const result = await processTask(
      parseInt(taskId, 10),
      b.action,
      { id: user.id, username: user.username },
      b.remark,
      getFactoryId(req) ?? undefined
    )

    if (result.success) {
      res.json(success(null, result.message))
    } else {
      res.status(400).json({ success: false, message: result.message })
    }
  } catch (err) {
    next(err)
  }
}

/**
 * Withdraw a workflow (initiator only)
 */
export const withdrawWorkflowInstance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instanceId = req.params.instanceId as string
    const user = (req as any).user

    const result = await withdrawWorkflow(
      parseInt(instanceId, 10),
      { id: user.id, username: user.username },
      getFactoryId(req) ?? undefined
    )

    if (result.success) {
      res.json(success(null, result.message))
    } else {
      res.status(400).json({ success: false, message: result.message })
    }
  } catch (err) {
    next(err)
  }
}

/**
 * Get my pending tasks
 */
export const getMyTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const status = (req.query.status as string) || 'pending'

    const conditions: string[] = ['t.assignee_id = :userId']
    const replacements: Record<string, any> = { userId: user.id }

    if (status === 'pending') {
      conditions.push(`t.status = N'pending'`)
    } else if (status === 'completed') {
      conditions.push(`t.status IN (N'approved', N'rejected')`)
    } else if (status === 'all') {
      // No filter
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ')

    // Get total count
    const [countResult]: any = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM workflow_tasks t
      INNER JOIN workflow_instances i ON t.instance_id = i.id
      ${whereClause}
    `, { replacements })
    const total = countResult[0].total

    // Get paginated data
    const offset = (page - 1) * limit
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT t.*, i.title as instance_title, i.module, i.record_id, i.status as instance_status,
               i.initiator_name, i.started_at,
               ROW_NUMBER() OVER (ORDER BY t.created_at DESC) AS _row_num
        FROM workflow_tasks t
        INNER JOIN workflow_instances i ON t.instance_id = i.id
        ${whereClause}
      ) AS sub
      WHERE sub._row_num > :offset AND sub._row_num <= :offsetEnd
      ORDER BY sub._row_num
    `, {
      replacements: { ...replacements, offset, offsetEnd: offset + limit }
    })

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item
      return rest
    })

    res.json(paginate(cleanItems, total, page, limit))
  } catch (err) {
    next(err)
  }
}

/**
 * Get task detail
 */
export const getTaskDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { taskId } = req.params
    const user = (req as any).user

    const [tasks]: any = await sequelize.query(`
      SELECT t.*, i.title as instance_title, i.module, i.record_id, i.status as instance_status,
             i.initiator_id, i.initiator_name, i.business_data, i.started_at
      FROM workflow_tasks t
      INNER JOIN workflow_instances i ON t.instance_id = i.id
      WHERE t.id = :taskId
    `, { replacements: { taskId } })

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: '任务不存在' })
    }

    const task = tasks[0]

    // Check if user can view this task
    if (task.assignee_id !== user.id && task.initiator_id !== user.id) {
      // Also allow admins
      if ((req as any).user.role !== 'admin') {
        return res.status(403).json({ success: false, message: '无权查看此任务' })
      }
    }

    // Parse business data
    if (task.business_data) {
      try {
        task.business_data = JSON.parse(task.business_data)
      } catch (e) {
        // Keep as string if parse fails
      }
    }

    // Get workflow history for this instance
    const [history]: any = await sequelize.query(`
      SELECT * FROM workflow_history
      WHERE instance_id = :instanceId
      ORDER BY created_at ASC
    `, { replacements: { instanceId: task.instance_id } })

    res.json(success({ ...task, history }, '获取成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Get workflow instance by module and record
 */
export const getInstanceByRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { module, recordId } = req.params

    const [instances]: any = await sequelize.query(`
      SELECT i.*, d.name as definition_name
      FROM workflow_instances i
      LEFT JOIN workflow_definitions d ON i.definition_id = d.id
      WHERE i.module = :module AND i.record_id = :recordId
      ORDER BY i.id DESC
    `, { replacements: { module, recordId } })

    if (instances.length === 0) {
      return res.json(success(null, '无流程实例'))
    }

    const instance = instances[0]

    // Get current node info
    if (instance.current_node_id) {
      const [nodes]: any = await sequelize.query(`
        SELECT id, node_key, name, node_type FROM workflow_nodes WHERE id = :nodeId
      `, { replacements: { nodeId: instance.current_node_id } })
      if (nodes.length > 0) {
        instance.current_node = nodes[0]
      }
    }

    // Get pending tasks
    const [tasks]: any = await sequelize.query(`
      SELECT t.id, t.node_name, t.assignee_id, t.assignee_name, t.status, t.created_at
      FROM workflow_tasks t
      WHERE t.instance_id = :instanceId AND t.status = N'pending'
    `, { replacements: { instanceId: instance.id } })
    instance.pending_tasks = tasks

    // Get history
    const [history]: any = await sequelize.query(`
      SELECT * FROM workflow_history
      WHERE instance_id = :instanceId
      ORDER BY created_at ASC
    `, { replacements: { instanceId: instance.id } })
    instance.history = history

    res.json(success(instance, '获取成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Get workflows initiated by current user
 */
export const getMyInitiated = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const status = req.query.status as string

    const conditions: string[] = ['initiator_id = :userId']
    const replacements: Record<string, any> = { userId: user.id }

    if (status && status !== 'all') {
      conditions.push(`status = :status`)
      replacements.status = status
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ')

    // Get total count
    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM workflow_instances ${whereClause}`,
      { replacements }
    )
    const total = countResult[0].total

    // Get paginated data
    const offset = (page - 1) * limit
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY id DESC) AS _row_num
        FROM workflow_instances ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
      ORDER BY t._row_num
    `, {
      replacements: { ...replacements, offset, offsetEnd: offset + limit }
    })

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item
      return rest
    })

    res.json(paginate(cleanItems, total, page, limit))
  } catch (err) {
    next(err)
  }
}

/**
 * Get workflow statistics for dashboard
 */
export const getWorkflowStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user

    // Pending tasks count
    const [pendingResult]: any = await sequelize.query(`
      SELECT COUNT(*) as cnt FROM workflow_tasks
      WHERE assignee_id = :userId AND status = N'pending'
    `, { replacements: { userId: user.id } })

    // Initiated running count
    const [runningResult]: any = await sequelize.query(`
      SELECT COUNT(*) as cnt FROM workflow_instances
      WHERE initiator_id = :userId AND status = N'running'
    `, { replacements: { userId: user.id } })

    // Processed today
    const [todayResult]: any = await sequelize.query(`
      SELECT COUNT(*) as cnt FROM workflow_tasks
      WHERE assignee_id = :userId
        AND status IN (N'approved', N'rejected')
        AND CAST(completed_at AS DATE) = CAST(GETDATE() AS DATE)
    `, { replacements: { userId: user.id } })

    res.json(success({
      pendingTasks: pendingResult[0].cnt,
      runningInitiated: runningResult[0].cnt,
      processedToday: todayResult[0].cnt
    }, '获取成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Get business detail data for a module record (header + detail lines)
 */
export const getBusinessDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const module = req.params.module as string
    const recordId = req.params.recordId as string

    const config = moduleConfig[module]
    if (!config) {
      return res.status(400).json({ success: false, message: '无效的模块' })
    }

    // Get header record
    const [headers]: any = await sequelize.query(
      `SELECT * FROM ${config.tableName} WHERE ${config.primaryKey} = :recordId`,
      { replacements: { recordId } }
    )

    if (headers.length === 0) {
      return res.status(404).json({ success: false, message: '记录不存在' })
    }

    const header = headers[0]
    let details: any[] = []

    // Module-specific detail queries
    const detailConfig: Record<string, { table: string; foreignKey: string; orderBy: string }> = {
      'sales_order': { table: 'sales_order_detail', foreignKey: 'sales_order_number', orderBy: 'line_number' },
      'sales_forecast': { table: 'sales_forecast_detail', foreignKey: 'forecast_number', orderBy: 'line_number' },
      'purchase_req': { table: 'purchase_req_detail', foreignKey: 'purchase_req_number', orderBy: 'line_number' },
      'purchase_order': { table: 'purchase_order_detail', foreignKey: 'purchase_order_number', orderBy: 'line_number' },
      'bom_header': { table: 'bom_detail', foreignKey: 'bom_number', orderBy: 'line_number' },
      'routing_header': { table: 'routing_detail', foreignKey: 'process_route_number', orderBy: 'step_number' },
      'return_order': { table: 'return_order_detail', foreignKey: 'return_order_number', orderBy: 'line_number' }
    }

    const dc = detailConfig[module]
    if (dc) {
      try {
        const [rows]: any = await sequelize.query(
          `SELECT * FROM ${dc.table} WHERE ${dc.foreignKey} = :recordId ORDER BY ${dc.orderBy}`,
          { replacements: { recordId } }
        )
        details = rows
      } catch { /* table might not exist, ignore */ }
    }

    res.json(success({ header, details, module, displayName: config.displayName }, '获取成功'))
  } catch (err) {
    next(err)
  }
}
