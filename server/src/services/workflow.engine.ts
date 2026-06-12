/**
 * Workflow Engine Core Service
 * Handles workflow execution, state transitions, and task management
 */

import sequelize from '../config/database'
import { Transaction } from 'sequelize'
import { executeModuleHook } from './workflow.hooks'
import { withTransaction } from '@/shared/db/withTransaction'
import { BusinessError } from '@/shared/errors/BusinessError'
import { createLogger } from '@/config/logger'

const log = createLogger('workflow')

// Module configuration - same pattern as approval.controller.ts
export const moduleConfig: Record<string, { tableName: string; primaryKey: string; displayName: string; hasFactoryId?: boolean }> = {
  'routing_header': { tableName: 'routing_header', primaryKey: 'process_route_number', displayName: '工艺路线', hasFactoryId: false },
  'Production_plan': { tableName: 'Production_plan', primaryKey: 'production_number', displayName: '生产计划', hasFactoryId: true },
  'bom_header': { tableName: 'bom_header', primaryKey: 'bom_number', displayName: 'BOM物料清单', hasFactoryId: false },
  'production_order': { tableName: 'production_order', primaryKey: 'production_order_number', displayName: '生产单', hasFactoryId: true },
  'process_task': { tableName: 'process_task', primaryKey: 'process_task_number', displayName: '工序任务单', hasFactoryId: true },
  'material_preparation': { tableName: 'material_preparation', primaryKey: 'preparation_number', displayName: '备料单', hasFactoryId: true },
  'work_report': { tableName: 'work_report', primaryKey: 'work_report_number', displayName: '报工单', hasFactoryId: true },
  'sales_order': { tableName: 'sales_order', primaryKey: 'sales_order_number', displayName: '销售订单', hasFactoryId: true },
  'sales_forecast': { tableName: 'sales_forecast', primaryKey: 'forecast_number', displayName: '销售预测', hasFactoryId: true },
  'purchase_req': { tableName: 'purchase_req', primaryKey: 'purchase_req_number', displayName: '采购申请单', hasFactoryId: true },
  'purchase_order': { tableName: 'purchase_order', primaryKey: 'purchase_order_number', displayName: '采购订单', hasFactoryId: true },
  'stock_in': { tableName: 'stock_in', primaryKey: 'stock_in_number', displayName: '入库单', hasFactoryId: true },
  'return_order': { tableName: 'return_order', primaryKey: 'return_order_number', displayName: '退货单', hasFactoryId: true },
  'expense_claim': { tableName: 'expense_claim', primaryKey: 'claim_number', displayName: '报销单', hasFactoryId: true }
}

export interface WorkflowUser {
  id: number
  username: string
  real_name?: string
}

/**
 * Check if a module has a published workflow definition
 */
export async function hasActiveWorkflow(module: string): Promise<boolean> {
  const [result]: any = await sequelize.query(`
    SELECT COUNT(*) as cnt FROM workflow_definitions
    WHERE module = :module AND status = N'published'
  `, { replacements: { module } })
  return result[0].cnt > 0
}

/**
 * Get the published workflow definition for a module
 */
export async function getPublishedDefinition(module: string): Promise<any | null> {
  const [definitions]: any = await sequelize.query(`
    SELECT * FROM workflow_definitions
    WHERE module = :module AND status = N'published'
    ORDER BY version DESC
  `, { replacements: { module } })
  return definitions.length > 0 ? definitions[0] : null
}

/**
 * Snapshot business data from the source table
 */
export async function snapshotBusinessData(module: string, recordId: string): Promise<Record<string, any>> {
  const config = moduleConfig[module]
  if (!config) {
    throw new Error(`Unknown module: ${module}`)
  }

  const [records]: any = await sequelize.query(`
    SELECT * FROM ${config.tableName} WHERE ${config.primaryKey} = :recordId
  `, { replacements: { recordId } })

  if (records.length === 0) {
    throw new Error(`Record not found: ${module}/${recordId}`)
  }

  return records[0]
}

/**
 * Resolve handlers for a node at runtime
 * Returns array of user objects { id, username, real_name }
 */
export async function resolveHandlers(
  nodeId: number,
  instanceId: number,
  transaction?: Transaction
): Promise<WorkflowUser[]> {
  // Get handler configuration
  const [handlers]: any = await sequelize.query(`
    SELECT handler_type, user_id, role, department_id
    FROM workflow_node_handlers
    WHERE node_id = :nodeId
  `, { replacements: { nodeId }, transaction })

  if (handlers.length === 0) {
    return []
  }

  const userSet = new Map<number, WorkflowUser>()

  for (const handler of handlers) {
    let users: any[] = []

    switch (handler.handler_type) {
      case 'user':
        if (handler.user_id) {
          const [userResult]: any = await sequelize.query(`
            SELECT id, username, real_name FROM users
            WHERE id = :userId AND status = N'active'
          `, { replacements: { userId: handler.user_id }, transaction })
          users = userResult
        }
        break

      case 'role':
        if (handler.role) {
          const [roleUsers]: any = await sequelize.query(`
            SELECT id, username, real_name FROM users
            WHERE role = :role AND status = N'active'
          `, { replacements: { role: handler.role }, transaction })
          users = roleUsers
        }
        break

      case 'department':
        if (handler.department_id) {
          const [deptUsers]: any = await sequelize.query(`
            SELECT id, username, real_name FROM users
            WHERE department_id = :deptId AND status = N'active'
          `, { replacements: { deptId: handler.department_id }, transaction })
          users = deptUsers
        }
        break

      case 'dept_role':
        if (handler.department_id && handler.role) {
          const [deptRoleUsers]: any = await sequelize.query(`
            SELECT id, username, real_name FROM users
            WHERE department_id = :deptId AND role = :role AND status = N'active'
          `, { replacements: { deptId: handler.department_id, role: handler.role }, transaction })
          users = deptRoleUsers
        }
        break

      case 'initiator':
        // Get the initiator from the instance
        const [instanceResult]: any = await sequelize.query(`
          SELECT initiator_id, initiator_name FROM workflow_instances WHERE id = :instanceId
        `, { replacements: { instanceId }, transaction })
        if (instanceResult.length > 0) {
          users = [{
            id: instanceResult[0].initiator_id,
            username: instanceResult[0].initiator_name,
            real_name: instanceResult[0].initiator_name
          }]
        }
        break
    }

    // Add to set (deduplicate by user ID)
    for (const user of users) {
      if (!userSet.has(user.id)) {
        userSet.set(user.id, {
          id: user.id,
          username: user.username,
          real_name: user.real_name || user.username
        })
      }
    }
  }

  return Array.from(userSet.values())
}

/**
 * Evaluate a condition expression against business data
 * Supports: ==, !=, >, >=, <, <=, contains, in
 * Compound: AND, OR
 */
export function evaluateCondition(expression: string | null, businessData: Record<string, any>): boolean {
  if (!expression || expression.trim() === '') {
    return true // No condition = default path
  }

  // Simple parser: split by AND/OR, evaluate each part
  const expr = expression.trim()

  // Handle OR first (lower precedence)
  if (expr.toUpperCase().includes(' OR ')) {
    const parts = expr.split(/\s+OR\s+/i)
    return parts.some(part => evaluateCondition(part.trim(), businessData))
  }

  // Handle AND
  if (expr.toUpperCase().includes(' AND ')) {
    const parts = expr.split(/\s+AND\s+/i)
    return parts.every(part => evaluateCondition(part.trim(), businessData))
  }

  // Parse single condition: field operator value
  const operators = ['>=', '<=', '!=', '==', '>', '<', ' contains ', ' in ']
  let field = '', operator = '', value = ''

  for (const op of operators) {
    const idx = expr.toLowerCase().indexOf(op.toLowerCase())
    if (idx !== -1) {
      field = expr.substring(0, idx).trim()
      operator = op.trim().toLowerCase()
      value = expr.substring(idx + op.length).trim()
      break
    }
  }

  if (!field || !operator) {
    log.warn({ expression }, 'Invalid condition expression');
    return true // Invalid expression = pass through
  }

  // Get field value from business data
  const fieldValue = businessData[field]

  // Parse value (remove quotes if string)
  let parsedValue: any = value
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    parsedValue = value.slice(1, -1)
  } else if (!isNaN(Number(value))) {
    parsedValue = Number(value)
  }

  // Compare
  switch (operator) {
    case '==':
      return fieldValue == parsedValue
    case '!=':
      return fieldValue != parsedValue
    case '>':
      return Number(fieldValue) > Number(parsedValue)
    case '>=':
      return Number(fieldValue) >= Number(parsedValue)
    case '<':
      return Number(fieldValue) < Number(parsedValue)
    case '<=':
      return Number(fieldValue) <= Number(parsedValue)
    case 'contains':
      return String(fieldValue).includes(String(parsedValue))
    case 'in':
      // Parse value as comma-separated list
      const list = String(parsedValue).split(',').map(s => s.trim())
      return list.includes(String(fieldValue))
    default:
      return true
  }
}

/**
 * Start a workflow for a business record
 */
export async function startWorkflow(
  module: string,
  recordId: string,
  user: { id: number; username: string },
  factory_id?: number
): Promise<{ instanceId: number; success: boolean; message: string }> {
  try {
    return await withTransaction(async (transaction) => {
      // 1. Get published definition
      const definition = await getPublishedDefinition(module)
      if (!definition) {
        throw new BusinessError(400, '该模块没有已发布的流程定义')
      }

      // 2. Check if there's already a running instance
      const [existingInstances]: any = await sequelize.query(`
        SELECT id FROM workflow_instances
        WHERE module = :module AND record_id = :recordId AND status = N'running'
      `, { replacements: { module, recordId }, transaction })

      if (existingInstances.length > 0) {
        throw new BusinessError(400, '该记录已有进行中的流程')
      }

      // 3. Snapshot business data
      const businessData = await snapshotBusinessData(module, recordId)
      const config = moduleConfig[module]

      // 多工厂隔离：校验记录所属工厂
      const fCond = (factory_id != null && config.hasFactoryId) ? ' AND factory_id = :factory_id' : ''
      const fReps = (factory_id != null && config.hasFactoryId) ? { factory_id } : {}
      if (factory_id != null && config.hasFactoryId && businessData.factory_id != null && businessData.factory_id !== factory_id) {
        return { instanceId: 0, success: false, message: '不能操作其他工厂的记录' }
      }

      const title = `${config.displayName} ${recordId} 审批`

      // 4. Create workflow instance
      await sequelize.query(`
        INSERT INTO workflow_instances (definition_id, module, record_id, title, status, initiator_id, initiator_name, business_data, started_at)
        VALUES (:definitionId, :module, :recordId, :title, N'running', :initiatorId, :initiatorName, :businessData, GETDATE())
      `, {
        replacements: {
          definitionId: definition.id,
          module,
          recordId,
          title,
          initiatorId: user.id,
          initiatorName: user.username,
          businessData: JSON.stringify(businessData)
        },
        transaction
      })

      // Get the new instance ID
      const [instanceResult]: any = await sequelize.query(
        `SELECT TOP 1 id FROM workflow_instances WHERE module = :module AND record_id = :recordId ORDER BY id DESC`,
        { replacements: { module, recordId }, transaction }
      )
      const instanceId = instanceResult[0].id

      // 5. Update business record status
      await sequelize.query(`
        UPDATE ${config.tableName}
        SET approval_status = N'审批中'
        WHERE ${config.primaryKey} = :recordId${fCond}
      `, { replacements: { recordId, ...fReps }, transaction })

      // 6. Create history entry for start
      await sequelize.query(`
        INSERT INTO workflow_history (instance_id, action, from_status, to_status, operator_id, operator_name, created_at)
        VALUES (:instanceId, N'start', N'草稿', N'审批中', :operatorId, :operatorName, GETDATE())
      `, {
        replacements: {
          instanceId,
          operatorId: user.id,
          operatorName: user.username
        },
        transaction
      })

      // 7. Find start node and advance
      const [startNodes]: any = await sequelize.query(`
        SELECT id, node_key FROM workflow_nodes
        WHERE definition_id = :definitionId AND node_type = N'start'
      `, { replacements: { definitionId: definition.id }, transaction })

      if (startNodes.length === 0) {
        throw new BusinessError(400, '流程定义缺少开始节点')
      }

      // Advance from start node
      await advanceWorkflow(instanceId, startNodes[0].id, 'approve', transaction, factory_id)

      return { instanceId, success: true, message: '流程已启动' }
    })
  } catch (error: any) {
    if (error instanceof BusinessError) {
      return { instanceId: 0, success: false, message: error.message }
    }
    log.error({ error }, 'startWorkflow error');
    return { instanceId: 0, success: false, message: error.message || '启动流程失败' }
  }
}

/**
 * Advance workflow from a completed node
 */
export async function advanceWorkflow(
  instanceId: number,
  fromNodeId: number,
  result: 'approve' | 'reject',
  transaction?: Transaction,
  factory_id?: number
): Promise<void> {
  const ownTransaction = !transaction
  if (ownTransaction) {
    transaction = await sequelize.transaction()
  }

  try {
    // Get instance and business data
    const [instances]: any = await sequelize.query(`
      SELECT * FROM workflow_instances WHERE id = :instanceId
    `, { replacements: { instanceId }, transaction })

    if (instances.length === 0) {
      throw new Error('Workflow instance not found')
    }

    const instance = instances[0]
    const businessData = instance.business_data ? JSON.parse(instance.business_data) : {}

    // Get outgoing edges from current node
    const [edges]: any = await sequelize.query(`
      SELECT e.*, tn.node_type as to_node_type, tn.node_key as to_node_key, tn.name as to_node_name
      FROM workflow_edges e
      INNER JOIN workflow_nodes tn ON e.to_node_id = tn.id
      WHERE e.from_node_id = :fromNodeId
      ORDER BY e.priority DESC
    `, { replacements: { fromNodeId }, transaction })

    if (edges.length === 0) {
      // No outgoing edges - check if this is normal (end node already handled)
      return
    }

    // Evaluate conditions and find next node
    let nextEdge = null
    for (const edge of edges) {
      if (evaluateCondition(edge.condition_expression, businessData)) {
        nextEdge = edge
        break
      }
    }

    // If no condition matched, use the default (null condition) edge
    if (!nextEdge) {
      nextEdge = edges.find((e: any) => !e.condition_expression)
    }

    if (!nextEdge) {
      log.warn({ fromNodeId }, 'No matching edge found');
      return
    }

    // Update instance current node
    await sequelize.query(`
      UPDATE workflow_instances SET current_node_id = :nodeId WHERE id = :instanceId
    `, { replacements: { nodeId: nextEdge.to_node_id, instanceId }, transaction })

    // Handle next node based on type
    const nextNodeType = nextEdge.to_node_type

    switch (nextNodeType) {
      case 'end':
        // Complete the workflow
        await completeWorkflow(instanceId, 'completed', transaction!, factory_id)
        break

      case 'condition':
        // Condition/gateway node - immediately advance
        await advanceWorkflow(instanceId, nextEdge.to_node_id, result, transaction, factory_id)
        break

      case 'notification':
        // Create notification tasks (auto-read) and advance
        await createTasksForNode(instanceId, nextEdge.to_node_id, transaction!)
        await advanceWorkflow(instanceId, nextEdge.to_node_id, result, transaction, factory_id)
        break

      case 'approval':
      case 'countersign':
        // Create tasks and wait
        await createTasksForNode(instanceId, nextEdge.to_node_id, transaction!)
        break

      default:
        log.warn({ nextNodeType }, 'Unknown node type');
    }

    if (ownTransaction) {
      await transaction!.commit()
    }

  } catch (error) {
    if (ownTransaction) {
      await transaction!.rollback()
    }
    throw error
  }
}

/**
 * Create tasks for a node and send notifications
 */
export async function createTasksForNode(
  instanceId: number,
  nodeId: number,
  transaction: Transaction
): Promise<void> {
  // Get node info
  const [nodes]: any = await sequelize.query(`
    SELECT * FROM workflow_nodes WHERE id = :nodeId
  `, { replacements: { nodeId }, transaction })

  if (nodes.length === 0) {
    throw new Error(`Node not found: ${nodeId}`)
  }

  const node = nodes[0]

  // Get instance info
  const [instances]: any = await sequelize.query(`
    SELECT * FROM workflow_instances WHERE id = :instanceId
  `, { replacements: { instanceId }, transaction })

  const instance = instances[0]

  // Resolve handlers
  const handlers = await resolveHandlers(nodeId, instanceId, transaction)

  if (handlers.length === 0) {
    // No handlers - auto-advance
    log.warn({ nodeId }, 'No handlers, auto-advancing');
    await sequelize.query(`
      INSERT INTO workflow_history (instance_id, node_id, node_name, action, operator_id, operator_name, remark, created_at)
      VALUES (:instanceId, :nodeId, :nodeName, N'auto_complete', 0, N'System', N'无处理人，自动跳过', GETDATE())
    `, {
      replacements: { instanceId, nodeId, nodeName: node.name },
      transaction
    })
    return
  }

  // Create tasks for each handler
  for (const handler of handlers) {
    const taskStatus = node.node_type === 'notification' ? 'read' : 'pending'

    await sequelize.query(`
      INSERT INTO workflow_tasks (instance_id, node_id, node_key, node_name, node_type, assignee_id, assignee_name, status, created_at)
      VALUES (:instanceId, :nodeId, :nodeKey, :nodeName, :nodeType, :assigneeId, :assigneeName, :status, GETDATE())
    `, {
      replacements: {
        instanceId,
        nodeId,
        nodeKey: node.node_key,
        nodeName: node.name,
        nodeType: node.node_type,
        assigneeId: handler.id,
        assigneeName: handler.real_name || handler.username,
        status: taskStatus
      },
      transaction
    })

    // Create notification
    const notificationType = node.node_type === 'notification' ? 'workflow_completed' : 'workflow_pending'
    const notificationTitle = node.node_type === 'notification'
      ? `[通知] ${instance.title}`
      : `[待办] ${instance.title} - ${node.name}`

    await sequelize.query(`
      INSERT INTO notifications (user_id, type, title, content, is_read, created_at)
      VALUES (:userId, :type, :title, :content, 0, GETDATE())
    `, {
      replacements: {
        userId: handler.id,
        type: notificationType,
        title: notificationTitle,
        content: `流程: ${instance.title}, 节点: ${node.name}`
      },
      transaction
    })
  }
}

/**
 * Process a task (approve/reject)
 */
export async function processTask(
  taskId: number,
  action: 'approve' | 'reject',
  user: { id: number; username: string },
  remark?: string,
  factory_id?: number
): Promise<{ success: boolean; message: string }> {
  // Capture instance info for deferred hook execution after transaction commit.
  // Hooks must run OUTSIDE the transaction because they use separate DB connections
  // that would block waiting for locks held by the uncommitted transaction.
  let deferredHook: { module: string; recordId: string; hookType: 'onApproved' | 'onRejected' } | null = null;

  try {
    const result = await withTransaction(async (transaction) => {
      // Get task with optimistic lock check
      const [tasks]: any = await sequelize.query(`
        SELECT t.*, i.status as instance_status, i.module, i.record_id, i.initiator_id,
               n.countersign_type, n.definition_id, n.config as node_config
        FROM workflow_tasks t
        INNER JOIN workflow_instances i ON t.instance_id = i.id
        INNER JOIN workflow_nodes n ON t.node_id = n.id
        WHERE t.id = :taskId
      `, { replacements: { taskId }, transaction })

      if (tasks.length === 0) {
        throw new BusinessError(404, '任务不存在')
      }

      const task = tasks[0]

      // Check task status
      if (task.status !== 'pending') {
        throw new BusinessError(400, '任务已被处理')
      }

      // Check instance status
      if (task.instance_status !== 'running') {
        throw new BusinessError(400, '流程已结束')
      }

      // Check assignee
      if (task.assignee_id !== user.id) {
        throw new BusinessError(403, '您不是此任务的处理人')
      }

      // Update task status
      const newStatus = action === 'approve' ? 'approved' : 'rejected'
      await sequelize.query(`
        UPDATE workflow_tasks
        SET status = :status, remark = :remark, completed_at = GETDATE()
        WHERE id = :taskId AND status = N'pending'
      `, {
        replacements: { taskId, status: newStatus, remark: remark || '' },
        transaction
      })

      // Create history entry
      await sequelize.query(`
        INSERT INTO workflow_history (instance_id, node_id, node_name, action, operator_id, operator_name, remark, created_at)
        VALUES (:instanceId, :nodeId, :nodeName, :action, :operatorId, :operatorName, :remark, GETDATE())
      `, {
        replacements: {
          instanceId: task.instance_id,
          nodeId: task.node_id,
          nodeName: task.node_name,
          action: task.node_type === 'countersign' ? `countersign_${action}` : action,
          operatorId: user.id,
          operatorName: user.username,
          remark: remark || ''
        },
        transaction
      })

      // Handle based on node type
      if (task.node_type === 'approval') {
        // Single approval - cancel other pending tasks for same node
        await sequelize.query(`
          UPDATE workflow_tasks
          SET status = N'cancelled', completed_at = GETDATE()
          WHERE instance_id = :instanceId AND node_id = :nodeId AND status = N'pending' AND id != :taskId
        `, { replacements: { instanceId: task.instance_id, nodeId: task.node_id, taskId }, transaction })

        if (action === 'approve') {
          // Advance to next node
          await advanceWorkflow(task.instance_id, task.node_id, 'approve', transaction, factory_id)
        } else {
          // Reject - use configured strategy
          await executeRejectStrategy(task.node_config, task.instance_id, task.node_id, user, remark || '', transaction, factory_id)
        }

      } else if (task.node_type === 'countersign') {
        // Check countersign progress
        const completed = await checkCountersignProgress(task.instance_id, task.node_id, task.countersign_type, transaction)

        if (completed.done) {
          if (completed.result === 'approved') {
            await advanceWorkflow(task.instance_id, task.node_id, 'approve', transaction, factory_id)
          } else {
            // Reject - use configured strategy
            await executeRejectStrategy(task.node_config, task.instance_id, task.node_id, user, remark || '', transaction, factory_id)
          }
        }
      }

      if (action === 'approve') {
        return { success: true, message: '审批通过' }
      }
      const strategy = parseRejectStrategy(task.node_config)
      const rejectMessages: Record<string, string> = {
        'end': '已驳回',
        'to_start': '已退回发起人',
        'to_previous': '已退回上一节点'
      }
      return { success: true, message: rejectMessages[strategy] || '已驳回' }
    })

    // === After transaction commit: check if workflow completed and fire hooks ===
    // Hooks run OUTSIDE the transaction to avoid ETIMEOUT caused by reading
    // locked rows from a separate DB connection while the transaction is pending.
    try {
      const [instances]: any = await sequelize.query(
        `SELECT module, record_id, status FROM workflow_instances
         WHERE id IN (SELECT instance_id FROM workflow_tasks WHERE id = :taskId)`,
        { replacements: { taskId } }
      )
      if (instances.length > 0) {
        const inst = instances[0]
        if (inst.status === 'completed') {
          deferredHook = { module: inst.module, recordId: inst.record_id, hookType: 'onApproved' }
        } else if (inst.status === 'rejected' || inst.status === 'returned') {
          deferredHook = { module: inst.module, recordId: inst.record_id, hookType: 'onRejected' }
        }
      }
    } catch (hookCheckErr) {
      log.error({ error: hookCheckErr }, 'Failed to check instance status for hook');
    }

    if (deferredHook) {
      try {
        await executeModuleHook(deferredHook.module, deferredHook.hookType, deferredHook.recordId)
      } catch (hookErr) {
        log.error({ error: hookErr, module: deferredHook.module, recordId: deferredHook.recordId },
          'Module hook execution failed (deferred)')
      }
    }

    return result
  } catch (error: any) {
    if (error instanceof BusinessError) {
      return { success: false, message: error.message }
    }
    log.error({ error }, 'processTask error');
    return { success: false, message: error.message || '处理失败' }
  }
}

/**
 * Check countersign progress and determine if node is complete
 */
async function checkCountersignProgress(
  instanceId: number,
  nodeId: number,
  countersignType: string,
  transaction: Transaction
): Promise<{ done: boolean; result: 'approved' | 'rejected' | null }> {
  const [stats]: any = await sequelize.query(`
    SELECT status, COUNT(*) as cnt
    FROM workflow_tasks
    WHERE instance_id = :instanceId AND node_id = :nodeId
    GROUP BY status
  `, { replacements: { instanceId, nodeId }, transaction })

  const counts: Record<string, number> = {}
  let total = 0
  for (const s of stats) {
    counts[s.status] = s.cnt
    total += s.cnt
  }

  const approved = counts['approved'] || 0
  const rejected = counts['rejected'] || 0
  const pending = counts['pending'] || 0

  switch (countersignType) {
    case 'all':
      // All must approve
      if (rejected > 0) {
        // Cancel remaining pending tasks
        await sequelize.query(`
          UPDATE workflow_tasks SET status = N'cancelled', completed_at = GETDATE()
          WHERE instance_id = :instanceId AND node_id = :nodeId AND status = N'pending'
        `, { replacements: { instanceId, nodeId }, transaction })
        return { done: true, result: 'rejected' }
      }
      if (pending === 0) {
        return { done: true, result: 'approved' }
      }
      return { done: false, result: null }

    case 'majority':
      // Majority wins
      const halfTotal = total / 2
      if (approved > halfTotal) {
        await sequelize.query(`
          UPDATE workflow_tasks SET status = N'cancelled', completed_at = GETDATE()
          WHERE instance_id = :instanceId AND node_id = :nodeId AND status = N'pending'
        `, { replacements: { instanceId, nodeId }, transaction })
        return { done: true, result: 'approved' }
      }
      if (rejected >= Math.ceil(halfTotal)) {
        await sequelize.query(`
          UPDATE workflow_tasks SET status = N'cancelled', completed_at = GETDATE()
          WHERE instance_id = :instanceId AND node_id = :nodeId AND status = N'pending'
        `, { replacements: { instanceId, nodeId }, transaction })
        return { done: true, result: 'rejected' }
      }
      return { done: false, result: null }

    case 'any':
    default:
      // First vote wins (like approval node)
      if (approved > 0) {
        await sequelize.query(`
          UPDATE workflow_tasks SET status = N'cancelled', completed_at = GETDATE()
          WHERE instance_id = :instanceId AND node_id = :nodeId AND status = N'pending'
        `, { replacements: { instanceId, nodeId }, transaction })
        return { done: true, result: 'approved' }
      }
      if (rejected > 0) {
        await sequelize.query(`
          UPDATE workflow_tasks SET status = N'cancelled', completed_at = GETDATE()
          WHERE instance_id = :instanceId AND node_id = :nodeId AND status = N'pending'
        `, { replacements: { instanceId, nodeId }, transaction })
        return { done: true, result: 'rejected' }
      }
      return { done: false, result: null }
  }
}

/**
 * Complete a workflow (approved or rejected)
 */
async function completeWorkflow(
  instanceId: number,
  status: 'completed' | 'rejected',
  transaction: Transaction,
  factory_id?: number
): Promise<void> {
  // Get instance
  const [instances]: any = await sequelize.query(`
    SELECT * FROM workflow_instances WHERE id = :instanceId
  `, { replacements: { instanceId }, transaction })

  if (instances.length === 0) return

  const instance = instances[0]
  const config = moduleConfig[instance.module]
  const fCond = (factory_id != null && config.hasFactoryId) ? ' AND factory_id = :factory_id' : ''
  const fReps = (factory_id != null && config.hasFactoryId) ? { factory_id } : {}

  // Update instance status
  await sequelize.query(`
    UPDATE workflow_instances
    SET status = :status, current_node_id = NULL, completed_at = GETDATE()
    WHERE id = :instanceId
  `, { replacements: { instanceId, status }, transaction })

  // Update business record status
  const newApprovalStatus = status === 'completed' ? '已审批' : '已驳回'
  await sequelize.query(`
    UPDATE ${config.tableName}
    SET approval_status = :status
    WHERE ${config.primaryKey} = :recordId${fCond}
  `, { replacements: { status: newApprovalStatus, recordId: instance.record_id, ...fReps }, transaction })

  // Cancel any remaining pending tasks
  await sequelize.query(`
    UPDATE workflow_tasks
    SET status = N'cancelled', completed_at = GETDATE()
    WHERE instance_id = :instanceId AND status = N'pending'
  `, { replacements: { instanceId }, transaction })

  // Notify initiator
  const notificationTitle = status === 'completed'
    ? `[已通过] ${instance.title}`
    : `[已驳回] ${instance.title}`

  await sequelize.query(`
    INSERT INTO notifications (user_id, type, title, content, is_read, created_at)
    VALUES (:userId, :type, :title, :content, 0, GETDATE())
  `, {
    replacements: {
      userId: instance.initiator_id,
      type: status === 'completed' ? 'workflow_completed' : 'workflow_rejected',
      title: notificationTitle,
      content: `您发起的流程 "${instance.title}" 已${status === 'completed' ? '审批通过' : '被驳回'}`
    },
    transaction
  })

  // Module hooks are now deferred to after transaction commit (see processTask).
  // This prevents ETIMEOUT caused by reading locked rows from a separate connection
  // while the calling transaction has not yet committed.
}

/**
 * Withdraw a running workflow (initiator only)
 */
export async function withdrawWorkflow(
  instanceId: number,
  user: { id: number; username: string },
  factory_id?: number
): Promise<{ success: boolean; message: string }> {
  try {
    return await withTransaction(async (transaction) => {
      // Get instance
      const [instances]: any = await sequelize.query(`
        SELECT * FROM workflow_instances WHERE id = :instanceId
      `, { replacements: { instanceId }, transaction })

      if (instances.length === 0) {
        throw new BusinessError(404, '流程实例不存在')
      }

      const instance = instances[0]

      // Check if user is initiator
      if (instance.initiator_id !== user.id) {
        throw new BusinessError(403, '只有发起人可以撤回流程')
      }

      // Check status
      if (instance.status !== 'running') {
        throw new BusinessError(400, '流程已结束，无法撤回')
      }

      const config = moduleConfig[instance.module]
      const fCond = (factory_id != null && config.hasFactoryId) ? ' AND factory_id = :factory_id' : ''
      const fReps = (factory_id != null && config.hasFactoryId) ? { factory_id } : {}

      // 多工厂隔离：校验记录所属工厂
      if (factory_id != null && config.hasFactoryId) {
        const [bizRec]: any = await sequelize.query(
          `SELECT factory_id FROM ${config.tableName} WHERE ${config.primaryKey} = :recordId`,
          { replacements: { recordId: instance.record_id }, transaction }
        )
        if (bizRec.length > 0 && bizRec[0].factory_id != null && bizRec[0].factory_id !== factory_id) {
          throw new BusinessError(403, '不能操作其他工厂的记录')
        }
      }

      // Update instance status
      await sequelize.query(`
        UPDATE workflow_instances
        SET status = N'cancelled', completed_at = GETDATE()
        WHERE id = :instanceId
      `, { replacements: { instanceId }, transaction })

      // Update business record status back to draft
      await sequelize.query(`
        UPDATE ${config.tableName}
        SET approval_status = N'草稿'
        WHERE ${config.primaryKey} = :recordId${fCond}
      `, { replacements: { recordId: instance.record_id, ...fReps }, transaction })

      // Cancel all pending tasks
      await sequelize.query(`
        UPDATE workflow_tasks
        SET status = N'cancelled', completed_at = GETDATE()
        WHERE instance_id = :instanceId AND status = N'pending'
      `, { replacements: { instanceId }, transaction })

      // Create history entry
      await sequelize.query(`
        INSERT INTO workflow_history (instance_id, action, from_status, to_status, operator_id, operator_name, remark, created_at)
        VALUES (:instanceId, N'withdraw', N'running', N'cancelled', :operatorId, :operatorName, N'发起人撤回', GETDATE())
      `, {
        replacements: {
          instanceId,
          operatorId: user.id,
          operatorName: user.username
        },
        transaction
      })

      return { success: true, message: '流程已撤回' }
    })
  } catch (error: any) {
    if (error instanceof BusinessError) {
      return { success: false, message: error.message }
    }
    log.error({ error }, 'withdrawWorkflow error');
    return { success: false, message: error.message || '撤回失败' }
  }
}

/**
 * Execute reject strategy based on node config
 */
async function executeRejectStrategy(
  nodeConfig: string | null,
  instanceId: number,
  nodeId: number,
  user: { id: number; username: string },
  remark: string,
  transaction: Transaction,
  factory_id?: number
): Promise<void> {
  const strategy = parseRejectStrategy(nodeConfig)
  switch (strategy) {
    case 'to_start':
      await returnToStart(instanceId, nodeId, user, remark, transaction, factory_id)
      break
    case 'to_previous':
      await returnToPrevious(instanceId, nodeId, user, remark, transaction, factory_id)
      break
    case 'end':
    default:
      await completeWorkflow(instanceId, 'rejected', transaction, factory_id)
      break
  }
}

/**
 * Parse reject strategy from node config JSON
 */
export function parseRejectStrategy(config: string | null | undefined): 'end' | 'to_start' | 'to_previous' {
  if (!config || config.trim() === '') return 'end'
  try {
    const parsed = JSON.parse(config)
    const strategy = parsed.reject_strategy
    if (['end', 'to_start', 'to_previous'].includes(strategy)) {
      return strategy
    }
  } catch (e) {
    // Invalid JSON, use default
  }
  return 'end'
}

/**
 * Return workflow to initiator (to_start strategy)
 */
async function returnToStart(
  instanceId: number,
  currentNodeId: number,
  user: { id: number; username: string },
  remark: string,
  transaction: Transaction,
  factory_id?: number
): Promise<void> {
  const [instances]: any = await sequelize.query(`
    SELECT * FROM workflow_instances WHERE id = :instanceId
  `, { replacements: { instanceId }, transaction })

  if (instances.length === 0) return

  const instance = instances[0]
  const config = moduleConfig[instance.module]
  const fCond = (factory_id != null && config.hasFactoryId) ? ' AND factory_id = :factory_id' : ''
  const fReps = (factory_id != null && config.hasFactoryId) ? { factory_id } : {}

  // Get current node name for history
  const [nodes]: any = await sequelize.query(`
    SELECT name FROM workflow_nodes WHERE id = :nodeId
  `, { replacements: { nodeId: currentNodeId }, transaction })
  const nodeName = nodes.length > 0 ? nodes[0].name : ''

  // Update instance status to 'returned'
  await sequelize.query(`
    UPDATE workflow_instances
    SET status = N'returned', current_node_id = NULL, completed_at = GETDATE()
    WHERE id = :instanceId
  `, { replacements: { instanceId }, transaction })

  // Update business record back to draft
  await sequelize.query(`
    UPDATE ${config.tableName}
    SET approval_status = N'草稿'
    WHERE ${config.primaryKey} = :recordId${fCond}
  `, { replacements: { recordId: instance.record_id, ...fReps }, transaction })

  // Cancel remaining pending tasks
  await sequelize.query(`
    UPDATE workflow_tasks
    SET status = N'cancelled', completed_at = GETDATE()
    WHERE instance_id = :instanceId AND status = N'pending'
  `, { replacements: { instanceId }, transaction })

  // Write history
  await sequelize.query(`
    INSERT INTO workflow_history (instance_id, node_id, node_name, action, operator_id, operator_name, remark, created_at)
    VALUES (:instanceId, :nodeId, :nodeName, N'return_to_start', :operatorId, :operatorName, :remark, GETDATE())
  `, {
    replacements: {
      instanceId,
      nodeId: currentNodeId,
      nodeName,
      operatorId: user.id,
      operatorName: user.username,
      remark: remark || '退回发起人'
    },
    transaction
  })

  // Notify initiator
  await sequelize.query(`
    INSERT INTO notifications (user_id, type, title, content, is_read, created_at)
    VALUES (:userId, N'workflow_rejected', :title, :content, 0, GETDATE())
  `, {
    replacements: {
      userId: instance.initiator_id,
      type: 'workflow_rejected',
      title: `[已退回] ${instance.title}`,
      content: `您发起的流程 "${instance.title}" 已被退回，请修改后重新提交`
    },
    transaction
  })

  // Module hook deferred to after transaction commit (see processTask).
}

/**
 * Return workflow to previous approval node (to_previous strategy)
 */
async function returnToPrevious(
  instanceId: number,
  currentNodeId: number,
  user: { id: number; username: string },
  remark: string,
  transaction: Transaction,
  factory_id?: number
): Promise<void> {
  // Find previous approval node from history
  const [prevHistory]: any = await sequelize.query(`
    SELECT TOP 1 node_id, node_name
    FROM workflow_history
    WHERE instance_id = :instanceId
      AND node_id IS NOT NULL
      AND node_id != :currentNodeId
      AND action IN (N'approve', N'countersign_approve')
    ORDER BY created_at DESC
  `, { replacements: { instanceId, currentNodeId }, transaction })

  // If no previous approval node, degrade to returnToStart
  if (prevHistory.length === 0) {
    await returnToStart(instanceId, currentNodeId, user, remark || '无上一审批节点，已退回发起人', transaction, factory_id)
    return
  }

  const previousNodeId = prevHistory[0].node_id
  const previousNodeName = prevHistory[0].node_name

  // Get current node name for history
  const [currentNodes]: any = await sequelize.query(`
    SELECT name FROM workflow_nodes WHERE id = :nodeId
  `, { replacements: { nodeId: currentNodeId }, transaction })
  const currentNodeName = currentNodes.length > 0 ? currentNodes[0].name : ''

  // Cancel current node's pending tasks
  await sequelize.query(`
    UPDATE workflow_tasks
    SET status = N'cancelled', completed_at = GETDATE()
    WHERE instance_id = :instanceId AND node_id = :nodeId AND status = N'pending'
  `, { replacements: { instanceId, nodeId: currentNodeId }, transaction })

  // Update instance current_node_id to previous node
  await sequelize.query(`
    UPDATE workflow_instances SET current_node_id = :nodeId WHERE id = :instanceId
  `, { replacements: { nodeId: previousNodeId, instanceId }, transaction })

  // Create new tasks for previous node (reuse existing function)
  await createTasksForNode(instanceId, previousNodeId, transaction)

  // Write history
  await sequelize.query(`
    INSERT INTO workflow_history (instance_id, node_id, node_name, action, operator_id, operator_name, remark, created_at)
    VALUES (:instanceId, :nodeId, :nodeName, N'return_to_previous', :operatorId, :operatorName, :remark, GETDATE())
  `, {
    replacements: {
      instanceId,
      nodeId: currentNodeId,
      nodeName: currentNodeName,
      operatorId: user.id,
      operatorName: user.username,
      remark: remark || `从 ${currentNodeName} 退回到 ${previousNodeName}`
    },
    transaction
  })

  // Notify initiator about the return
  const [instances]: any = await sequelize.query(`
    SELECT * FROM workflow_instances WHERE id = :instanceId
  `, { replacements: { instanceId }, transaction })

  if (instances.length > 0) {
    const instance = instances[0]
    await sequelize.query(`
      INSERT INTO notifications (user_id, type, title, content, is_read, created_at)
      VALUES (:userId, N'workflow_rejected', :title, :content, 0, GETDATE())
    `, {
      replacements: {
        userId: instance.initiator_id,
        title: `[已退回] ${instance.title}`,
        content: `流程 "${instance.title}" 已从 ${currentNodeName} 退回到 ${previousNodeName}`
      },
      transaction
    })
  }
}
