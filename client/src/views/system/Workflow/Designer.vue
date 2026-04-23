<template>
  <div class="workflow-designer">
    <a-spin :spinning="loading">
      <!-- Header -->
      <div class="designer-header">
        <div class="header-left">
          <a-button @click="goBack">
            <ArrowLeftOutlined /> 返回
          </a-button>
          <a-divider type="vertical" />
          <span class="def-name">{{ definition?.name || '加载中...' }}</span>
          <a-tag v-if="definition" :color="statusColors[definition.status || 'draft']">
            {{ statusLabels[definition.status || 'draft'] }}
          </a-tag>
        </div>
        <div class="header-right">
          <a-space>
            <a-button @click="showEditModal">
              <EditOutlined /> 编辑基本信息
            </a-button>
            <a-button
              v-if="definition?.status === 'draft'"
              type="primary"
              @click="handlePublish"
              :loading="publishing"
            >
              <CheckOutlined /> 发布
            </a-button>
          </a-space>
        </div>
      </div>

      <!-- Main Content -->
      <div class="designer-body" v-if="definition">
        <a-row :gutter="16">
          <!-- Nodes Panel -->
          <a-col :span="12">
            <a-card title="节点列表" size="small">
              <template #extra>
                <a-button
                  v-if="definition.status === 'draft'"
                  type="link"
                  size="small"
                  @click="showNodeModal()"
                >
                  <PlusOutlined /> 添加节点
                </a-button>
              </template>

              <a-table
                :columns="nodeColumns"
                :data-source="definition.nodes"
                :pagination="false"
                size="small"
                row-key="id"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'node_type'">
                    <a-tag :color="nodeTypeColors[record.node_type]">
                      {{ nodeTypeLabels[record.node_type] }}
                    </a-tag>
                  </template>
                  <template v-else-if="column.key === 'handlers'">
                    <span v-if="['approval', 'countersign', 'notification'].includes(record.node_type)">
                      {{ getHandlerSummary(record.handlers) }}
                    </span>
                    <span v-else class="text-muted">-</span>
                  </template>
                  <template v-else-if="column.key === 'actions'">
                    <a-space v-if="definition.status === 'draft'">
                      <a-button type="link" size="small" @click="showNodeModal(record)">
                        编辑
                      </a-button>
                      <a-button
                        v-if="['approval', 'countersign', 'notification'].includes(record.node_type)"
                        type="link"
                        size="small"
                        @click="showHandlerModal(record)"
                      >
                        处理人
                      </a-button>
                      <a-popconfirm
                        v-if="!['start', 'end'].includes(record.node_type)"
                        title="确定要删除此节点吗？"
                        @confirm="handleDeleteNode(record.id)"
                      >
                        <a-button type="link" size="small" danger>删除</a-button>
                      </a-popconfirm>
                    </a-space>
                    <span v-else class="text-muted">只读</span>
                  </template>
                </template>
              </a-table>
            </a-card>
          </a-col>

          <!-- Edges Panel -->
          <a-col :span="12">
            <a-card title="连线列表" size="small">
              <template #extra>
                <a-button
                  v-if="definition.status === 'draft'"
                  type="link"
                  size="small"
                  @click="showEdgeModal()"
                >
                  <PlusOutlined /> 添加连线
                </a-button>
              </template>

              <a-table
                :columns="edgeColumns"
                :data-source="definition.edges"
                :pagination="false"
                size="small"
                row-key="id"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'path'">
                    {{ record.from_node_name }} → {{ record.to_node_name }}
                  </template>
                  <template v-else-if="column.key === 'condition'">
                    <span v-if="record.condition_expression">
                      <code>{{ record.condition_expression }}</code>
                    </span>
                    <span v-else class="text-muted">默认</span>
                  </template>
                  <template v-else-if="column.key === 'actions'">
                    <a-space v-if="definition.status === 'draft'">
                      <a-button type="link" size="small" @click="showEdgeModal(record)">
                        编辑
                      </a-button>
                      <a-popconfirm
                        title="确定要删除此连线吗？"
                        @confirm="handleDeleteEdge(record.id)"
                      >
                        <a-button type="link" size="small" danger>删除</a-button>
                      </a-popconfirm>
                    </a-space>
                    <span v-else class="text-muted">只读</span>
                  </template>
                </template>
              </a-table>
            </a-card>
          </a-col>
        </a-row>

        <!-- Flow Preview -->
        <a-card title="流程预览" size="small" style="margin-top: 16px">
          <div class="flow-preview">
            <template v-for="(step, index) in flowSteps" :key="index">
              <div class="flow-step">
                <a-popover
                  v-if="['approval', 'countersign', 'notification'].includes(step.node_type)"
                  trigger="click"
                  :title="step.name + ' - 处理人'"
                >
                  <template #content>
                    <div v-if="step.handlers && step.handlers.length > 0" class="handler-list">
                      <div v-for="(h, i) in step.handlers" :key="i" class="handler-item">
                        <template v-if="h.handler_type === 'user'">
                          <a-tag color="blue">指定用户</a-tag> {{ h.user_name || getUserName(h.user_id) }}
                        </template>
                        <template v-else-if="h.handler_type === 'role'">
                          <a-tag color="green">角色</a-tag> {{ roleLabels[h.role || ''] || h.role }}
                        </template>
                        <template v-else-if="h.handler_type === 'department'">
                          <a-tag color="orange">部门</a-tag> {{ h.department_name || getDeptName(h.department_id) }}
                        </template>
                        <template v-else-if="h.handler_type === 'dept_role'">
                          <a-tag color="purple">部门+角色</a-tag> {{ h.department_name || getDeptName(h.department_id) }} / {{ roleLabels[h.role || ''] || h.role }}
                        </template>
                        <template v-else-if="h.handler_type === 'initiator'">
                          <a-tag color="cyan">发起人</a-tag>
                        </template>
                      </div>
                    </div>
                    <span v-else class="text-muted">未设置处理人</span>
                  </template>
                  <a-tag :color="nodeTypeColors[step.node_type]" style="cursor: pointer">
                    {{ step.name }}
                  </a-tag>
                </a-popover>
                <a-tag v-else :color="nodeTypeColors[step.node_type]">
                  {{ step.name }}
                </a-tag>
              </div>
              <div v-if="index < flowSteps.length - 1" class="flow-arrow">
                →
              </div>
            </template>
          </div>
        </a-card>
      </div>
    </a-spin>

    <!-- Edit Definition Modal -->
    <a-modal
      v-model:open="editModalVisible"
      title="编辑流程定义"
      @ok="handleUpdateDefinition"
      :confirm-loading="saving"
    >
      <a-form :model="editForm" layout="vertical">
        <a-form-item label="流程名称" required>
          <a-input v-model:value="editForm.name" placeholder="请输入流程名称" />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model:value="editForm.description" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Node Modal -->
    <a-modal
      v-model:open="nodeModalVisible"
      :title="editingNode ? '编辑节点' : '添加节点'"
      @ok="handleSaveNode"
      :confirm-loading="savingNode"
    >
      <a-form :model="nodeForm" layout="vertical">
        <a-form-item label="节点标识" required>
          <a-input
            v-model:value="nodeForm.node_key"
            placeholder="如: approval_1"
            :disabled="!!editingNode"
          />
        </a-form-item>
        <a-form-item label="节点名称" required>
          <a-input v-model:value="nodeForm.name" placeholder="如: 部门经理审批" />
        </a-form-item>
        <a-form-item label="节点类型" required>
          <a-select v-model:value="nodeForm.node_type" :disabled="!!editingNode">
            <a-select-option value="approval">审批节点</a-select-option>
            <a-select-option value="countersign">会签节点</a-select-option>
            <a-select-option value="notification">通知节点</a-select-option>
            <a-select-option value="condition">条件网关</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="nodeForm.node_type === 'countersign'" label="会签类型">
          <a-select v-model:value="nodeForm.countersign_type">
            <a-select-option value="all">全部通过</a-select-option>
            <a-select-option value="majority">多数通过</a-select-option>
            <a-select-option value="any">任一通过</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="['approval', 'countersign'].includes(nodeForm.node_type)" label="驳回策略">
          <a-select v-model:value="nodeForm.reject_strategy">
            <a-select-option value="end">终止流程（默认）</a-select-option>
            <a-select-option value="to_start">退回发起人</a-select-option>
            <a-select-option value="to_previous">退回上一节点</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Handler Modal -->
    <a-modal
      v-model:open="handlerModalVisible"
      title="设置处理人"
      @ok="handleSaveHandlers"
      :confirm-loading="savingHandlers"
      width="700px"
    >
      <div class="handler-editor">
        <div v-for="(handler, index) in handlerForm.handlers" :key="index" class="handler-row">
          <a-select
            v-model:value="handler.handler_type"
            style="width: 120px"
            @change="() => clearHandlerFields(handler)"
          >
            <a-select-option value="user">指定用户</a-select-option>
            <a-select-option value="role">按角色</a-select-option>
            <a-select-option value="department">按部门</a-select-option>
            <a-select-option value="dept_role">部门+角色</a-select-option>
            <a-select-option value="initiator">发起人</a-select-option>
          </a-select>

          <a-select
            v-if="handler.handler_type === 'user'"
            v-model:value="handler.user_id"
            style="width: 200px"
            show-search
            option-filter-prop="label"
            placeholder="选择用户"
          >
            <a-select-option v-for="u in users" :key="u.id" :value="u.id" :label="u.real_name || u.username">
              {{ u.real_name || u.username }}
            </a-select-option>
          </a-select>

          <a-select
            v-if="handler.handler_type === 'role'"
            v-model:value="handler.role"
            style="width: 200px"
            placeholder="选择角色"
          >
            <a-select-option value="admin">管理员</a-select-option>
            <a-select-option value="manager">主管</a-select-option>
            <a-select-option value="staff">员工</a-select-option>
          </a-select>

          <a-select
            v-if="handler.handler_type === 'department'"
            v-model:value="handler.department_id"
            style="width: 200px"
            placeholder="选择部门"
          >
            <a-select-option v-for="d in departments" :key="d.id" :value="d.id">
              {{ d.dept_name }}
            </a-select-option>
          </a-select>

          <template v-if="handler.handler_type === 'dept_role'">
            <a-select
              v-model:value="handler.department_id"
              style="width: 150px"
              placeholder="选择部门"
            >
              <a-select-option v-for="d in departments" :key="d.id" :value="d.id">
                {{ d.dept_name }}
              </a-select-option>
            </a-select>
            <a-select
              v-model:value="handler.role"
              style="width: 100px"
              placeholder="选择角色"
            >
              <a-select-option value="admin">管理员</a-select-option>
              <a-select-option value="manager">主管</a-select-option>
              <a-select-option value="staff">员工</a-select-option>
            </a-select>
          </template>

          <span v-if="handler.handler_type === 'initiator'" class="text-muted">
            (自动分配给流程发起人)
          </span>

          <a-button type="text" danger @click="removeHandler(index)">
            <DeleteOutlined />
          </a-button>
        </div>

        <a-button type="dashed" block @click="addHandler">
          <PlusOutlined /> 添加处理人规则
        </a-button>
      </div>
    </a-modal>

    <!-- Edge Modal -->
    <a-modal
      v-model:open="edgeModalVisible"
      :title="editingEdge ? '编辑连线' : '添加连线'"
      @ok="handleSaveEdge"
      :confirm-loading="savingEdge"
    >
      <a-form :model="edgeForm" layout="vertical">
        <a-form-item label="源节点" required>
          <a-select
            v-model:value="edgeForm.from_node_id"
            placeholder="选择源节点"
            :disabled="!!editingEdge"
          >
            <a-select-option
              v-for="n in definition?.nodes?.filter(x => x.node_type !== 'end')"
              :key="n.id"
              :value="n.id"
            >
              {{ n.name }} ({{ nodeTypeLabels[n.node_type] }})
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="目标节点" required>
          <a-select
            v-model:value="edgeForm.to_node_id"
            placeholder="选择目标节点"
            :disabled="!!editingEdge"
          >
            <a-select-option
              v-for="n in definition?.nodes?.filter(x => x.node_type !== 'start')"
              :key="n.id"
              :value="n.id"
            >
              {{ n.name }} ({{ nodeTypeLabels[n.node_type] }})
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="条件表达式">
          <a-input
            v-model:value="edgeForm.condition_expression"
            placeholder="如: amount > 10000 AND dept == '销售部'"
          />
          <div class="form-help">
            留空表示默认路径。支持: ==, !=, >, >=, <, <=, contains, in, AND, OR
          </div>
        </a-form-item>
        <a-form-item label="标签">
          <a-input v-model:value="edgeForm.label" placeholder="如: 金额大于1万" />
        </a-form-item>
        <a-form-item label="优先级">
          <a-input-number v-model:value="edgeForm.priority" :min="0" />
          <div class="form-help">数值越大优先级越高</div>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  ArrowLeftOutlined,
  EditOutlined,
  CheckOutlined,
  PlusOutlined,
  DeleteOutlined
} from '@ant-design/icons-vue'
import {
  getDefinitionById,
  updateDefinition,
  publishDefinition,
  createNode,
  updateNode,
  deleteNode,
  setNodeHandlers,
  createEdge,
  updateEdge,
  deleteEdge,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowHandler
} from '@/api/system/workflow'
import { getUsers } from '@/api/system/user'
import { getActiveDepartments } from '@/api/system/department'

const route = useRoute()
const router = useRouter()
const definitionId = computed(() => Number(route.params.id))

// State
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const savingNode = ref(false)
const savingHandlers = ref(false)
const savingEdge = ref(false)

const definition = ref<WorkflowDefinition | null>(null)
const users = ref<any[]>([])
const departments = ref<any[]>([])

// Modals
const editModalVisible = ref(false)
const nodeModalVisible = ref(false)
const handlerModalVisible = ref(false)
const edgeModalVisible = ref(false)

const editForm = reactive({ name: '', description: '' })
const editingNode = ref<WorkflowNode | null>(null)
const nodeForm = reactive({
  node_key: '',
  name: '',
  node_type: 'approval' as string,
  countersign_type: 'all' as string,
  reject_strategy: 'end' as string
})

const editingHandlerNode = ref<WorkflowNode | null>(null)
const handlerForm = reactive({
  handlers: [] as WorkflowHandler[]
})

const editingEdge = ref<WorkflowEdge | null>(null)
const edgeForm = reactive({
  from_node_id: undefined as number | undefined,
  to_node_id: undefined as number | undefined,
  condition_expression: '',
  label: '',
  priority: 0
})

// Constants
const statusLabels: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  deprecated: '已停用'
}

const statusColors: Record<string, string> = {
  draft: 'default',
  published: 'green',
  deprecated: 'orange'
}

const nodeTypeLabels: Record<string, string> = {
  start: '开始',
  end: '结束',
  approval: '审批',
  countersign: '会签',
  notification: '通知',
  condition: '条件'
}

const nodeTypeColors: Record<string, string> = {
  start: 'blue',
  end: 'blue',
  approval: 'green',
  countersign: 'purple',
  notification: 'cyan',
  condition: 'orange'
}

// Columns
const nodeColumns = [
  { title: '节点标识', dataIndex: 'node_key', key: 'node_key', width: 120 },
  { title: '节点名称', dataIndex: 'name', key: 'name' },
  { title: '类型', dataIndex: 'node_type', key: 'node_type', width: 80 },
  { title: '处理人', key: 'handlers' },
  { title: '操作', key: 'actions', width: 150 }
]

const edgeColumns = [
  { title: '路径', key: 'path' },
  { title: '条件', key: 'condition' },
  { title: '标签', dataIndex: 'label', key: 'label', width: 100 },
  { title: '优先级', dataIndex: 'priority', key: 'priority', width: 80 },
  { title: '操作', key: 'actions', width: 120 }
]

// Computed: simple flow preview
const flowSteps = computed(() => {
  if (!definition.value?.nodes || !definition.value?.edges) return []

  const nodes = definition.value.nodes
  const edges = definition.value.edges
  const steps: WorkflowNode[] = []

  // Start from start node
  let currentNode = nodes.find(n => n.node_type === 'start')
  const visited = new Set<number>()

  while (currentNode && !visited.has(currentNode.id!)) {
    visited.add(currentNode.id!)
    steps.push(currentNode)

    // Find next node (follow first edge for simplicity)
    const nextEdge = edges.find(e => e.from_node_id === currentNode!.id)
    if (nextEdge) {
      currentNode = nodes.find(n => n.id === nextEdge.to_node_id)
    } else {
      break
    }
  }

  return steps
})

// Methods
const roleLabels: Record<string, string> = { admin: '管理员', manager: '主管', staff: '员工' }
const getUserName = (userId?: number | null) => {
  if (!userId) return '-'
  const u = users.value.find(x => x.id === userId)
  return u ? (u.real_name || u.username) : String(userId)
}
const getDeptName = (deptId?: number | null) => {
  if (!deptId) return '-'
  const d = departments.value.find(x => x.id === deptId)
  return d ? d.dept_name : String(deptId)
}

const loadData = async () => {
  loading.value = true
  try {
    const [defRes, usersRes, deptsRes] = await Promise.all([
      getDefinitionById(definitionId.value),
      getUsers({ limit: 1000 }),
      getActiveDepartments()
    ])

    if (defRes.success) {
      definition.value = defRes.data
    }
    if (usersRes.success) {
      users.value = usersRes.data?.items || usersRes.data || []
    }
    if (deptsRes.success) {
      departments.value = deptsRes.data || []
    }
  } catch (err) {
    message.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

const goBack = () => {
  router.push('/workflow')
}

const getHandlerSummary = (handlers?: WorkflowHandler[]) => {
  if (!handlers || handlers.length === 0) return '未设置'
  return `${handlers.length} 条规则`
}

// Edit definition
const showEditModal = () => {
  if (!definition.value) return
  editForm.name = definition.value.name
  editForm.description = definition.value.description || ''
  editModalVisible.value = true
}

const handleUpdateDefinition = async () => {
  if (!editForm.name) {
    message.warning('请输入流程名称')
    return
  }
  saving.value = true
  try {
    const res = await updateDefinition(definitionId.value, {
      name: editForm.name,
      description: editForm.description
    })
    if (res.success) {
      message.success('更新成功')
      editModalVisible.value = false
      loadData()
    } else {
      message.error(res.message || '更新失败')
    }
  } catch (err) {
    message.error('更新失败')
  } finally {
    saving.value = false
  }
}

const handlePublish = async () => {
  publishing.value = true
  try {
    const res = await publishDefinition(definitionId.value)
    if (res.success) {
      message.success('发布成功')
      loadData()
    } else {
      message.error(res.message || '发布失败')
    }
  } catch (err) {
    message.error('发布失败')
  } finally {
    publishing.value = false
  }
}

// Node operations
const showNodeModal = (node?: WorkflowNode) => {
  editingNode.value = node || null
  if (node) {
    nodeForm.node_key = node.node_key
    nodeForm.name = node.name
    nodeForm.node_type = node.node_type
    nodeForm.countersign_type = node.countersign_type || 'all'
    // Parse reject_strategy from config JSON
    let rs = 'end'
    if ((node as any).config) {
      try {
        const cfg = JSON.parse((node as any).config)
        if (cfg.reject_strategy) rs = cfg.reject_strategy
      } catch (e) {}
    }
    nodeForm.reject_strategy = rs
  } else {
    nodeForm.node_key = ''
    nodeForm.name = ''
    nodeForm.node_type = 'approval'
    nodeForm.countersign_type = 'all'
    nodeForm.reject_strategy = 'end'
  }
  nodeModalVisible.value = true
}

const handleSaveNode = async () => {
  if (!nodeForm.node_key || !nodeForm.name) {
    message.warning('请填写节点标识和名称')
    return
  }
  savingNode.value = true
  try {
    let res
    const rejectStrategy = ['approval', 'countersign'].includes(nodeForm.node_type) ? nodeForm.reject_strategy : undefined
    if (editingNode.value) {
      res = await updateNode(editingNode.value.id!, {
        name: nodeForm.name,
        node_type: nodeForm.node_type as any,
        countersign_type: nodeForm.node_type === 'countersign' ? nodeForm.countersign_type as any : null,
        reject_strategy: rejectStrategy
      })
    } else {
      res = await createNode(definitionId.value, {
        node_key: nodeForm.node_key,
        name: nodeForm.name,
        node_type: nodeForm.node_type as any,
        countersign_type: nodeForm.node_type === 'countersign' ? nodeForm.countersign_type as any : undefined,
        reject_strategy: rejectStrategy
      })
    }
    if (res.success) {
      message.success(editingNode.value ? '更新成功' : '创建成功')
      nodeModalVisible.value = false
      loadData()
    } else {
      message.error(res.message || '操作失败')
    }
  } catch (err) {
    message.error('操作失败')
  } finally {
    savingNode.value = false
  }
}

const handleDeleteNode = async (nodeId: number) => {
  try {
    const res = await deleteNode(nodeId)
    if (res.success) {
      message.success('删除成功')
      loadData()
    } else {
      message.error(res.message || '删除失败')
    }
  } catch (err) {
    message.error('删除失败')
  }
}

// Handler operations
const showHandlerModal = (node: WorkflowNode) => {
  editingHandlerNode.value = node
  handlerForm.handlers = (node.handlers || []).map(h => ({ ...h }))
  if (handlerForm.handlers.length === 0) {
    handlerForm.handlers.push({ handler_type: 'user' })
  }
  handlerModalVisible.value = true
}

const addHandler = () => {
  handlerForm.handlers.push({ handler_type: 'user' })
}

const removeHandler = (index: number) => {
  handlerForm.handlers.splice(index, 1)
}

const clearHandlerFields = (handler: WorkflowHandler) => {
  handler.user_id = undefined
  handler.role = undefined
  handler.department_id = undefined
}

const handleSaveHandlers = async () => {
  if (!editingHandlerNode.value) return

  // Filter out empty handlers
  const validHandlers = handlerForm.handlers.filter(h => {
    if (h.handler_type === 'user') return !!h.user_id
    if (h.handler_type === 'role') return !!h.role
    if (h.handler_type === 'department') return !!h.department_id
    if (h.handler_type === 'dept_role') return !!h.department_id && !!h.role
    if (h.handler_type === 'initiator') return true
    return false
  })

  savingHandlers.value = true
  try {
    const res = await setNodeHandlers(editingHandlerNode.value.id!, validHandlers)
    if (res.success) {
      message.success('设置成功')
      handlerModalVisible.value = false
      loadData()
    } else {
      message.error(res.message || '设置失败')
    }
  } catch (err) {
    message.error('设置失败')
  } finally {
    savingHandlers.value = false
  }
}

// Edge operations
const showEdgeModal = (edge?: WorkflowEdge) => {
  editingEdge.value = edge || null
  if (edge) {
    edgeForm.from_node_id = edge.from_node_id
    edgeForm.to_node_id = edge.to_node_id
    edgeForm.condition_expression = edge.condition_expression || ''
    edgeForm.label = edge.label || ''
    edgeForm.priority = edge.priority || 0
  } else {
    edgeForm.from_node_id = undefined
    edgeForm.to_node_id = undefined
    edgeForm.condition_expression = ''
    edgeForm.label = ''
    edgeForm.priority = 0
  }
  edgeModalVisible.value = true
}

const handleSaveEdge = async () => {
  if (!edgeForm.from_node_id || !edgeForm.to_node_id) {
    message.warning('请选择源节点和目标节点')
    return
  }
  savingEdge.value = true
  try {
    let res
    if (editingEdge.value) {
      res = await updateEdge(editingEdge.value.id!, {
        condition_expression: edgeForm.condition_expression || undefined,
        label: edgeForm.label,
        priority: edgeForm.priority
      })
    } else {
      res = await createEdge(definitionId.value, {
        from_node_id: edgeForm.from_node_id,
        to_node_id: edgeForm.to_node_id,
        condition_expression: edgeForm.condition_expression || undefined,
        label: edgeForm.label,
        priority: edgeForm.priority
      })
    }
    if (res.success) {
      message.success(editingEdge.value ? '更新成功' : '创建成功')
      edgeModalVisible.value = false
      loadData()
    } else {
      message.error(res.message || '操作失败')
    }
  } catch (err) {
    message.error('操作失败')
  } finally {
    savingEdge.value = false
  }
}

const handleDeleteEdge = async (edgeId: number) => {
  try {
    const res = await deleteEdge(edgeId)
    if (res.success) {
      message.success('删除成功')
      loadData()
    } else {
      message.error(res.message || '删除失败')
    }
  } catch (err) {
    message.error('删除失败')
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.workflow-designer {
  padding: 16px;
}

.designer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 4px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.def-name {
  font-size: 16px;
  font-weight: 500;
}

.text-muted {
  color: #999;
}

.handler-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.handler-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-help {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.flow-preview {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.flow-step {
  display: flex;
  align-items: center;
}

.flow-arrow {
  color: #999;
  font-size: 16px;
}

.handler-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 160px;
}

.handler-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
</style>
