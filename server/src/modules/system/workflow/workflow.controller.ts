/**
 * Workflow Definition Management Controller
 * Handles CRUD for workflow definitions, nodes, edges, and handlers
 */

import { Request, Response, NextFunction } from 'express'
import sequelize from '../../../config/database'
import { success, paginate } from '../../../utils/response.util'
import { moduleConfig } from '../../../services/workflow.engine'

/**
 * Get all workflow definitions with optional filtering and pagination
 */
export const getDefinitions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 50
    const search = (req.query.search as string) || ''
    const module = req.query.module as string
    const status = req.query.status as string

    const conditions: string[] = []
    const replacements: Record<string, any> = {}

    if (search) {
      conditions.push(`(name LIKE :search OR description LIKE :search)`)
      replacements.search = `%${search}%`
    }

    if (module) {
      conditions.push(`module = :module`)
      replacements.module = module
    }

    if (status) {
      conditions.push(`status = :status`)
      replacements.status = status
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

    // Get total count
    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM workflow_definitions ${whereClause}`,
      { replacements }
    )
    const total = countResult[0].total

    // Get paginated data
    const offset = (page - 1) * limit
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY id DESC) AS _row_num
        FROM workflow_definitions ${whereClause}
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
 * Get available modules for workflow
 */
export const getModules = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const modules = Object.entries(moduleConfig).map(([key, config]) => ({
      module: key,
      displayName: config.displayName
    }))
    res.json(success(modules, '获取模块列表成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Get definition by ID with nodes, edges, and handlers
 */
export const getDefinitionById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params

    // Get definition
    const [definitions]: any = await sequelize.query(
      `SELECT * FROM workflow_definitions WHERE id = :id`,
      { replacements: { id } }
    )

    if (definitions.length === 0) {
      return res.status(404).json({ success: false, message: '流程定义不存在' })
    }

    const definition = definitions[0]

    // Get nodes
    const [nodes]: any = await sequelize.query(`
      SELECT * FROM workflow_nodes WHERE definition_id = :id ORDER BY id
    `, { replacements: { id } })

    // Get handlers for all nodes
    const nodeIds = nodes.map((n: any) => n.id)
    let handlers: any[] = []
    if (nodeIds.length > 0) {
      const [handlersResult]: any = await sequelize.query(`
        SELECT h.*, u.real_name as user_name, d.dept_name as department_name
        FROM workflow_node_handlers h
        LEFT JOIN users u ON h.user_id = u.id
        LEFT JOIN departments d ON h.department_id = d.id
        WHERE h.node_id IN (:nodeIds)
      `, { replacements: { nodeIds } })
      handlers = handlersResult
    }

    // Attach handlers to nodes
    const nodesWithHandlers = nodes.map((node: any) => ({
      ...node,
      handlers: handlers.filter((h: any) => h.node_id === node.id)
    }))

    // Get edges
    const [edges]: any = await sequelize.query(`
      SELECT e.*, fn.name as from_node_name, tn.name as to_node_name
      FROM workflow_edges e
      LEFT JOIN workflow_nodes fn ON e.from_node_id = fn.id
      LEFT JOIN workflow_nodes tn ON e.to_node_id = tn.id
      WHERE e.definition_id = :id
      ORDER BY e.id
    `, { replacements: { id } })

    res.json(success({
      ...definition,
      nodes: nodesWithHandlers,
      edges
    }, '获取流程定义成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Create a new workflow definition
 */
export const createDefinition = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body

    if (!b.name || !b.module) {
      return res.status(400).json({ success: false, message: '名称和模块不能为空' })
    }

    if (!moduleConfig[b.module]) {
      return res.status(400).json({ success: false, message: '无效的模块' })
    }

    // Get next version for this module
    const [versionResult]: any = await sequelize.query(`
      SELECT ISNULL(MAX(version), 0) + 1 as next_version
      FROM workflow_definitions WHERE module = :module
    `, { replacements: { module: b.module } })
    const version = versionResult[0].next_version

    const code = `WF-${b.module}-v${version}`

    await sequelize.query(`
      INSERT INTO workflow_definitions (code, name, module, version, description, status, created_by, created_at, updated_at)
      VALUES (:code, :name, :module, :version, :description, N'draft', :createdBy, GETDATE(), GETDATE())
    `, {
      replacements: {
        code,
        name: b.name,
        module: b.module,
        version,
        description: b.description || '',
        createdBy: (req as any).user?.id || 0
      }
    })

    // Get the new definition ID
    const [newDef]: any = await sequelize.query(`
      SELECT TOP 1 id FROM workflow_definitions WHERE module = :module ORDER BY id DESC
    `, { replacements: { module: b.module } })

    const definitionId = newDef[0].id

    // Create default start and end nodes
    await sequelize.query(`
      INSERT INTO workflow_nodes (definition_id, node_key, name, node_type, position_x, position_y)
      VALUES (:definitionId, N'start', N'开始', N'start', 100, 200)
    `, { replacements: { definitionId } })

    await sequelize.query(`
      INSERT INTO workflow_nodes (definition_id, node_key, name, node_type, position_x, position_y)
      VALUES (:definitionId, N'end', N'结束', N'end', 500, 200)
    `, { replacements: { definitionId } })

    res.json(success({ id: definitionId }, '创建流程定义成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Update workflow definition basic info
 */
export const updateDefinition = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params
    const b = req.body

    if (!b.name) {
      return res.status(400).json({ success: false, message: '名称不能为空' })
    }

    // Check if definition exists and is in draft status
    const [existing]: any = await sequelize.query(
      `SELECT id, status FROM workflow_definitions WHERE id = :id`,
      { replacements: { id } }
    )

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: '流程定义不存在' })
    }

    if (existing[0].status === 'published') {
      return res.status(400).json({ success: false, message: '已发布的流程定义不能修改，请创建新版本' })
    }

    await sequelize.query(`
      UPDATE workflow_definitions
      SET name = :name, description = :description, updated_at = GETDATE()
      WHERE id = :id
    `, {
      replacements: { id, name: b.name, description: b.description || '' }
    })

    res.json(success(null, '更新流程定义成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Delete workflow definition (only draft status)
 */
export const deleteDefinition = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params

    // Check status
    const [existing]: any = await sequelize.query(
      `SELECT id, status FROM workflow_definitions WHERE id = :id`,
      { replacements: { id } }
    )

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: '流程定义不存在' })
    }

    if (existing[0].status !== 'draft') {
      return res.status(400).json({ success: false, message: '只能删除草稿状态的流程定义' })
    }

    // Delete in order: handlers -> edges -> nodes -> definition
    const [nodeIds]: any = await sequelize.query(
      `SELECT id FROM workflow_nodes WHERE definition_id = :id`,
      { replacements: { id } }
    )

    if (nodeIds.length > 0) {
      const ids = nodeIds.map((n: any) => n.id)
      await sequelize.query(
        `DELETE FROM workflow_node_handlers WHERE node_id IN (:ids)`,
        { replacements: { ids } }
      )
    }

    await sequelize.query(`DELETE FROM workflow_edges WHERE definition_id = :id`, { replacements: { id } })
    await sequelize.query(`DELETE FROM workflow_nodes WHERE definition_id = :id`, { replacements: { id } })
    await sequelize.query(`DELETE FROM workflow_definitions WHERE id = :id`, { replacements: { id } })

    res.json(success(null, '删除流程定义成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Publish workflow definition
 */
export const publishDefinition = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params

    // Get definition
    const [definitions]: any = await sequelize.query(
      `SELECT * FROM workflow_definitions WHERE id = :id`,
      { replacements: { id } }
    )

    if (definitions.length === 0) {
      return res.status(404).json({ success: false, message: '流程定义不存在' })
    }

    const definition = definitions[0]

    if (definition.status === 'published') {
      return res.status(400).json({ success: false, message: '流程定义已发布' })
    }

    // Validate: must have start and end nodes
    const [nodes]: any = await sequelize.query(`
      SELECT node_type FROM workflow_nodes WHERE definition_id = :id
    `, { replacements: { id } })

    const nodeTypes = nodes.map((n: any) => n.node_type)
    if (!nodeTypes.includes('start')) {
      return res.status(400).json({ success: false, message: '流程定义缺少开始节点' })
    }
    if (!nodeTypes.includes('end')) {
      return res.status(400).json({ success: false, message: '流程定义缺少结束节点' })
    }

    // Validate: start node must have outgoing edge
    const [startNode]: any = await sequelize.query(`
      SELECT id FROM workflow_nodes WHERE definition_id = :id AND node_type = N'start'
    `, { replacements: { id } })

    const [startEdges]: any = await sequelize.query(`
      SELECT id FROM workflow_edges WHERE from_node_id = :nodeId
    `, { replacements: { nodeId: startNode[0].id } })

    if (startEdges.length === 0) {
      return res.status(400).json({ success: false, message: '开始节点必须连接到下一个节点' })
    }

    // Deprecate old published versions for the same module
    await sequelize.query(`
      UPDATE workflow_definitions
      SET status = N'deprecated'
      WHERE module = :module AND status = N'published'
    `, { replacements: { module: definition.module } })

    // Publish this version
    await sequelize.query(`
      UPDATE workflow_definitions
      SET status = N'published', updated_at = GETDATE()
      WHERE id = :id
    `, { replacements: { id } })

    res.json(success(null, '发布流程定义成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Copy workflow definition to create new version
 */
export const copyDefinition = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params

    // Get original definition
    const [originals]: any = await sequelize.query(
      `SELECT * FROM workflow_definitions WHERE id = :id`,
      { replacements: { id } }
    )

    if (originals.length === 0) {
      return res.status(404).json({ success: false, message: '流程定义不存在' })
    }

    const original = originals[0]

    // Get next version
    const [versionResult]: any = await sequelize.query(`
      SELECT ISNULL(MAX(version), 0) + 1 as next_version
      FROM workflow_definitions WHERE module = :module
    `, { replacements: { module: original.module } })
    const version = versionResult[0].next_version

    const copyCode = `WF-${original.module}-v${version}`

    // Create new definition
    await sequelize.query(`
      INSERT INTO workflow_definitions (code, name, module, version, description, status, created_by, created_at, updated_at)
      VALUES (:code, :name, :module, :version, :description, N'draft', :createdBy, GETDATE(), GETDATE())
    `, {
      replacements: {
        code: copyCode,
        name: original.name.replace(/\s*\(v\d+\)$/, ''),
        module: original.module,
        version,
        description: original.description || '',
        createdBy: (req as any).user?.id || 0
      }
    })

    // Get new definition ID
    const [newDef]: any = await sequelize.query(`
      SELECT TOP 1 id FROM workflow_definitions WHERE module = :module ORDER BY id DESC
    `, { replacements: { module: original.module } })
    const newId = newDef[0].id

    // Copy nodes
    const [originalNodes]: any = await sequelize.query(`
      SELECT * FROM workflow_nodes WHERE definition_id = :id
    `, { replacements: { id } })

    const nodeIdMap: Record<number, number> = {}

    for (const node of originalNodes) {
      await sequelize.query(`
        INSERT INTO workflow_nodes (definition_id, node_key, name, node_type, countersign_type, config, position_x, position_y)
        VALUES (:definitionId, :nodeKey, :name, :nodeType, :countersignType, :config, :positionX, :positionY)
      `, {
        replacements: {
          definitionId: newId,
          nodeKey: node.node_key,
          name: node.name,
          nodeType: node.node_type,
          countersignType: node.countersign_type,
          config: node.config || null,
          positionX: node.position_x,
          positionY: node.position_y
        }
      })

      // Get new node ID
      const [newNode]: any = await sequelize.query(`
        SELECT TOP 1 id FROM workflow_nodes WHERE definition_id = :definitionId ORDER BY id DESC
      `, { replacements: { definitionId: newId } })
      nodeIdMap[node.id] = newNode[0].id

      // Copy handlers
      const [handlers]: any = await sequelize.query(`
        SELECT * FROM workflow_node_handlers WHERE node_id = :nodeId
      `, { replacements: { nodeId: node.id } })

      for (const handler of handlers) {
        await sequelize.query(`
          INSERT INTO workflow_node_handlers (node_id, handler_type, user_id, role, department_id)
          VALUES (:nodeId, :handlerType, :userId, :role, :departmentId)
        `, {
          replacements: {
            nodeId: newNode[0].id,
            handlerType: handler.handler_type,
            userId: handler.user_id,
            role: handler.role,
            departmentId: handler.department_id
          }
        })
      }
    }

    // Copy edges with mapped node IDs
    const [originalEdges]: any = await sequelize.query(`
      SELECT * FROM workflow_edges WHERE definition_id = :id
    `, { replacements: { id } })

    for (const edge of originalEdges) {
      await sequelize.query(`
        INSERT INTO workflow_edges (definition_id, from_node_id, to_node_id, condition_expression, condition_label, priority)
        VALUES (:definitionId, :fromNodeId, :toNodeId, :condition, :label, :priority)
      `, {
        replacements: {
          definitionId: newId,
          fromNodeId: nodeIdMap[edge.from_node_id],
          toNodeId: nodeIdMap[edge.to_node_id],
          condition: edge.condition_expression,
          label: edge.condition_label,
          priority: edge.priority
        }
      })
    }

    res.json(success({ id: newId }, '复制流程定义成功'))
  } catch (err) {
    next(err)
  }
}

// ==================== Node Management ====================

/**
 * Create a new node
 */
export const createNode = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { definitionId } = req.params
    const b = req.body

    if (!b.node_key || !b.name || !b.node_type) {
      return res.status(400).json({ success: false, message: '节点标识、名称和类型不能为空' })
    }

    // Check definition status
    const [definitions]: any = await sequelize.query(
      `SELECT status FROM workflow_definitions WHERE id = :definitionId`,
      { replacements: { definitionId } }
    )

    if (definitions.length === 0) {
      return res.status(404).json({ success: false, message: '流程定义不存在' })
    }

    if (definitions[0].status === 'published') {
      return res.status(400).json({ success: false, message: '已发布的流程定义不能修改' })
    }

    // Check duplicate node_key
    const [existing]: any = await sequelize.query(`
      SELECT id FROM workflow_nodes WHERE definition_id = :definitionId AND node_key = :nodeKey
    `, { replacements: { definitionId, nodeKey: b.node_key } })

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '节点标识已存在' })
    }

    // Build config JSON for reject_strategy
    const nodeConfig = b.reject_strategy ? JSON.stringify({ reject_strategy: b.reject_strategy }) : null

    await sequelize.query(`
      INSERT INTO workflow_nodes (definition_id, node_key, name, node_type, countersign_type, config, position_x, position_y)
      VALUES (:definitionId, :nodeKey, :name, :nodeType, :countersignType, :config, :positionX, :positionY)
    `, {
      replacements: {
        definitionId,
        nodeKey: b.node_key,
        name: b.name,
        nodeType: b.node_type,
        countersignType: b.countersign_type || null,
        config: nodeConfig,
        positionX: b.position_x || 200,
        positionY: b.position_y || 200
      }
    })

    const [newNode]: any = await sequelize.query(`
      SELECT TOP 1 id FROM workflow_nodes WHERE definition_id = :definitionId ORDER BY id DESC
    `, { replacements: { definitionId } })

    res.json(success({ id: newNode[0].id }, '创建节点成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Update a node
 */
export const updateNode = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nodeId } = req.params
    const b = req.body

    // Get node and check definition status
    const [nodes]: any = await sequelize.query(`
      SELECT n.*, d.status as def_status
      FROM workflow_nodes n
      INNER JOIN workflow_definitions d ON n.definition_id = d.id
      WHERE n.id = :nodeId
    `, { replacements: { nodeId } })

    if (nodes.length === 0) {
      return res.status(404).json({ success: false, message: '节点不存在' })
    }

    if (nodes[0].def_status === 'published') {
      return res.status(400).json({ success: false, message: '已发布的流程定义不能修改' })
    }

    // Build config JSON - merge with existing config
    let nodeConfig = nodes[0].config || null
    if (b.reject_strategy !== undefined) {
      let existingConfig: any = {}
      if (nodeConfig) {
        try { existingConfig = JSON.parse(nodeConfig) } catch (e) {}
      }
      existingConfig.reject_strategy = b.reject_strategy
      nodeConfig = JSON.stringify(existingConfig)
    }

    await sequelize.query(`
      UPDATE workflow_nodes
      SET name = :name, node_type = :nodeType, countersign_type = :countersignType,
          config = :config, position_x = :positionX, position_y = :positionY
      WHERE id = :nodeId
    `, {
      replacements: {
        nodeId,
        name: b.name || nodes[0].name,
        nodeType: b.node_type || nodes[0].node_type,
        countersignType: b.countersign_type,
        config: nodeConfig,
        positionX: b.position_x ?? nodes[0].position_x,
        positionY: b.position_y ?? nodes[0].position_y
      }
    })

    res.json(success(null, '更新节点成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Delete a node
 */
export const deleteNode = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nodeId } = req.params

    // Get node and check definition status
    const [nodes]: any = await sequelize.query(`
      SELECT n.*, d.status as def_status
      FROM workflow_nodes n
      INNER JOIN workflow_definitions d ON n.definition_id = d.id
      WHERE n.id = :nodeId
    `, { replacements: { nodeId } })

    if (nodes.length === 0) {
      return res.status(404).json({ success: false, message: '节点不存在' })
    }

    if (nodes[0].def_status === 'published') {
      return res.status(400).json({ success: false, message: '已发布的流程定义不能修改' })
    }

    // Cannot delete start or end nodes
    if (['start', 'end'].includes(nodes[0].node_type)) {
      return res.status(400).json({ success: false, message: '不能删除开始或结束节点' })
    }

    // Delete handlers, edges, then node
    await sequelize.query(`DELETE FROM workflow_node_handlers WHERE node_id = :nodeId`, { replacements: { nodeId } })
    await sequelize.query(`DELETE FROM workflow_edges WHERE from_node_id = :nodeId OR to_node_id = :nodeId`, { replacements: { nodeId } })
    await sequelize.query(`DELETE FROM workflow_nodes WHERE id = :nodeId`, { replacements: { nodeId } })

    res.json(success(null, '删除节点成功'))
  } catch (err) {
    next(err)
  }
}

// ==================== Handler Management ====================

/**
 * Set handlers for a node (replace all)
 */
export const setNodeHandlers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nodeId } = req.params
    const b = req.body // Array of { handler_type, user_id?, role?, department_id? }

    // Get node and check definition status
    const [nodes]: any = await sequelize.query(`
      SELECT n.*, d.status as def_status
      FROM workflow_nodes n
      INNER JOIN workflow_definitions d ON n.definition_id = d.id
      WHERE n.id = :nodeId
    `, { replacements: { nodeId } })

    if (nodes.length === 0) {
      return res.status(404).json({ success: false, message: '节点不存在' })
    }

    if (nodes[0].def_status === 'published') {
      return res.status(400).json({ success: false, message: '已发布的流程定义不能修改' })
    }

    // Delete existing handlers
    await sequelize.query(`DELETE FROM workflow_node_handlers WHERE node_id = :nodeId`, { replacements: { nodeId } })

    // Insert new handlers
    if (Array.isArray(b.handlers)) {
      for (const handler of b.handlers) {
        await sequelize.query(`
          INSERT INTO workflow_node_handlers (node_id, handler_type, user_id, role, department_id)
          VALUES (:nodeId, :handlerType, :userId, :role, :departmentId)
        `, {
          replacements: {
            nodeId,
            handlerType: handler.handler_type,
            userId: handler.user_id || null,
            role: handler.role || null,
            departmentId: handler.department_id || null
          }
        })
      }
    }

    res.json(success(null, '设置处理人成功'))
  } catch (err) {
    next(err)
  }
}

// ==================== Edge Management ====================

/**
 * Create an edge
 */
export const createEdge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { definitionId } = req.params
    const b = req.body

    if (!b.from_node_id || !b.to_node_id) {
      return res.status(400).json({ success: false, message: '源节点和目标节点不能为空' })
    }

    // Check definition status
    const [definitions]: any = await sequelize.query(
      `SELECT status FROM workflow_definitions WHERE id = :definitionId`,
      { replacements: { definitionId } }
    )

    if (definitions.length === 0) {
      return res.status(404).json({ success: false, message: '流程定义不存在' })
    }

    if (definitions[0].status === 'published') {
      return res.status(400).json({ success: false, message: '已发布的流程定义不能修改' })
    }

    // Validate nodes belong to this definition
    const [nodeCheck]: any = await sequelize.query(`
      SELECT id FROM workflow_nodes
      WHERE id IN (:fromId, :toId) AND definition_id = :definitionId
    `, { replacements: { fromId: b.from_node_id, toId: b.to_node_id, definitionId } })

    if (nodeCheck.length !== 2) {
      return res.status(400).json({ success: false, message: '无效的节点' })
    }

    await sequelize.query(`
      INSERT INTO workflow_edges (definition_id, from_node_id, to_node_id, condition_expression, condition_label, priority)
      VALUES (:definitionId, :fromNodeId, :toNodeId, :condition, :label, :priority)
    `, {
      replacements: {
        definitionId,
        fromNodeId: b.from_node_id,
        toNodeId: b.to_node_id,
        condition: b.condition_expression || null,
        label: b.label || '',
        priority: b.priority || 0
      }
    })

    const [newEdge]: any = await sequelize.query(`
      SELECT TOP 1 id FROM workflow_edges WHERE definition_id = :definitionId ORDER BY id DESC
    `, { replacements: { definitionId } })

    res.json(success({ id: newEdge[0].id }, '创建连线成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Update an edge
 */
export const updateEdge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { edgeId } = req.params
    const b = req.body

    // Get edge and check definition status
    const [edges]: any = await sequelize.query(`
      SELECT e.*, d.status as def_status
      FROM workflow_edges e
      INNER JOIN workflow_definitions d ON e.definition_id = d.id
      WHERE e.id = :edgeId
    `, { replacements: { edgeId } })

    if (edges.length === 0) {
      return res.status(404).json({ success: false, message: '连线不存在' })
    }

    if (edges[0].def_status === 'published') {
      return res.status(400).json({ success: false, message: '已发布的流程定义不能修改' })
    }

    await sequelize.query(`
      UPDATE workflow_edges
      SET condition_expression = :condition, condition_label = :label, priority = :priority
      WHERE id = :edgeId
    `, {
      replacements: {
        edgeId,
        condition: b.condition_expression ?? edges[0].condition_expression,
        label: b.label ?? edges[0].condition_label,
        priority: b.priority ?? edges[0].priority
      }
    })

    res.json(success(null, '更新连线成功'))
  } catch (err) {
    next(err)
  }
}

/**
 * Delete an edge
 */
export const deleteEdge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { edgeId } = req.params

    // Get edge and check definition status
    const [edges]: any = await sequelize.query(`
      SELECT e.*, d.status as def_status
      FROM workflow_edges e
      INNER JOIN workflow_definitions d ON e.definition_id = d.id
      WHERE e.id = :edgeId
    `, { replacements: { edgeId } })

    if (edges.length === 0) {
      return res.status(404).json({ success: false, message: '连线不存在' })
    }

    if (edges[0].def_status === 'published') {
      return res.status(400).json({ success: false, message: '已发布的流程定义不能修改' })
    }

    await sequelize.query(`DELETE FROM workflow_edges WHERE id = :edgeId`, { replacements: { edgeId } })

    res.json(success(null, '删除连线成功'))
  } catch (err) {
    next(err)
  }
}
