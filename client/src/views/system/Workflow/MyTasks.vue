<template>
  <div class="my-tasks">
    <!-- 审批待办 -->
    <a-card :bordered="false" size="small">
      <template #title>
        <a-space>
          <span>审批待办</span>
          <a-badge :count="approvalPagination.total" :overflow-count="99" />
        </a-space>
      </template>
      <template #extra>
        <a-space>
          <a-radio-group v-model:value="approvalStatus" size="small" button-style="solid" @change="loadApprovals">
            <a-radio-button value="pending">待审批</a-radio-button>
            <a-radio-button value="completed">已审批</a-radio-button>
            <a-radio-button value="all">全部</a-radio-button>
          </a-radio-group>
          <a-button size="small" @click="loadApprovals"><ReloadOutlined /> 刷新</a-button>
        </a-space>
      </template>

      <a-table
        :columns="approvalColumns"
        :data-source="approvalItems"
        :loading="approvalLoading"
        :pagination="approvalPagination"
        row-key="record_id"
        size="small"
        @change="handleApprovalTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'approval_status'">
            <a-tag :color="record.approval_status === '待审批' ? 'orange' : record.approval_status === '已审批' ? 'green' : 'default'">
              {{ record.approval_status }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'submit_time'">
            {{ record.submit_time ? new Date(record.submit_time).toLocaleString('zh-CN') : '' }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space v-if="record.approval_status === '待审批'">
              <a-popconfirm title="确定审批通过？" @confirm="handleApprovalApprove(record)">
                <a-button type="primary" size="small"><CheckOutlined /> 通过</a-button>
              </a-popconfirm>
            </a-space>
            <span v-else style="color: #999;">已处理</span>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 工作流待办 -->
    <a-card :bordered="false" size="small" style="margin-top: 8px">
      <template #title>
        <a-space>
          <span>我的待办</span>
          <a-badge :count="stats.pendingTasks" :overflow-count="99" />
        </a-space>
      </template>
      <template #extra>
        <a-space>
          <a-radio-group v-model:value="taskStatus" size="small" button-style="solid" @change="loadTasks">
            <a-radio-button value="pending">待处理</a-radio-button>
            <a-radio-button value="completed">已处理</a-radio-button>
            <a-radio-button value="all">全部</a-radio-button>
          </a-radio-group>
          <a-button size="small" @click="loadTasks">
            <ReloadOutlined /> 刷新
          </a-button>
        </a-space>
      </template>

      <a-table
        :columns="taskColumns"
        :data-source="tasks"
        :loading="loading"
        :pagination="taskPagination"
        row-key="id"
        size="small"
        @change="handleTaskTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'instance_title'">
            <a @click="showTaskDetail(record)">{{ record.instance_title }}</a>
          </template>
          <template v-else-if="column.key === 'node_type'">
            <a-tag :color="nodeTypeColors[record.node_type]">
              {{ nodeTypeLabels[record.node_type] }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="taskStatusColors[record.status]">
              {{ taskStatusLabels[record.status] }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'created_at'">
            {{ formatDate(record.created_at) }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space v-if="record.status === 'pending'">
              <a-button type="primary" size="small" @click="handleApprove(record)">
                <CheckOutlined /> 通过
              </a-button>
              <a-button danger size="small" @click="handleReject(record)">
                <CloseOutlined /> 驳回
              </a-button>
            </a-space>
            <span v-else class="text-muted">已处理</span>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- My Initiated Section -->
    <a-card title="我发起的" :bordered="false" size="small" style="margin-top: 8px">
      <template #extra>
        <a-select v-model:value="initiatedStatus" size="small" style="width: 100px" @change="loadInitiated">
          <a-select-option value="all">全部</a-select-option>
          <a-select-option value="running">进行中</a-select-option>
          <a-select-option value="completed">已完成</a-select-option>
          <a-select-option value="rejected">已驳回</a-select-option>
          <a-select-option value="returned">已退回</a-select-option>
          <a-select-option value="reversed">已反审</a-select-option>
        </a-select>
      </template>

      <a-table
        :columns="initiatedColumns"
        :data-source="initiated"
        :loading="loadingInitiated"
        :pagination="initiatedPagination"
        row-key="id"
        size="small"
        @change="handleInitiatedTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag :color="instanceStatusColors[record.status]">
              {{ instanceStatusLabels[record.status] }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'started_at'">
            {{ formatDate(record.started_at) }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button type="link" size="small" @click="showInstanceDetail(record)">
                查看
              </a-button>
              <a-popconfirm
                v-if="record.status === 'running'"
                title="确定要撤回此流程吗？"
                @confirm="handleWithdraw(record)"
              >
                <a-button type="link" size="small" danger>撤回</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- Task Detail Modal -->
    <a-modal
      v-model:open="taskDetailVisible"
      :title="currentTask?.instance_title"
      width="900px"
      :footer="null"
    >
      <template v-if="currentTask">
        <a-descriptions :column="2" bordered size="small">
          <a-descriptions-item label="任务节点">{{ currentTask.node_name }}</a-descriptions-item>
          <a-descriptions-item label="节点类型">
            <a-tag :color="nodeTypeColors[currentTask.node_type]">
              {{ nodeTypeLabels[currentTask.node_type] }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="发起人">{{ currentTask.initiator_name }}</a-descriptions-item>
          <a-descriptions-item label="发起时间">{{ formatDate(currentTask.started_at) }}</a-descriptions-item>
          <a-descriptions-item label="业务模块">{{ moduleDisplayNames[currentTask.module] || currentTask.module }}</a-descriptions-item>
          <a-descriptions-item label="业务单号">{{ currentTask.record_id }}</a-descriptions-item>
        </a-descriptions>

        <!-- Business Detail Section -->
        <a-divider>{{ businessData?.displayName || '业务' }}详情</a-divider>
        <a-spin :spinning="businessLoading">
          <template v-if="businessData">
            <a-descriptions :column="3" bordered size="small" style="margin-bottom: 12px">
              <a-descriptions-item v-for="(val, key) in filteredHeaderFields" :key="key" :label="headerFieldLabels[key as string] || key">
                {{ formatFieldValue(key as string, val) }}
              </a-descriptions-item>
            </a-descriptions>
            <a-table v-if="businessData.details?.length" :data-source="businessData.details" :pagination="false"
              size="small" bordered :scroll="{ x: 800 }" row-key="id"
              :columns="businessDetailColumns" style="margin-bottom: 12px">
              <template #bodyCell="{ column, text }">
                <template v-if="isDateField(column.dataIndex)">{{ formatShortDate(text) }}</template>
              </template>
            </a-table>
          </template>
          <a-empty v-else-if="!businessLoading" description="暂无业务数据" />
        </a-spin>

        <a-divider>审批历史</a-divider>
        <a-timeline>
          <a-timeline-item
            v-for="(h, idx) in currentTask.history"
            :key="idx"
            :color="getHistoryColor(h.action)"
          >
            <p>
              <strong>{{ h.node_name || h.action }}</strong>
              <span v-if="h.operator_name"> - {{ h.operator_name }}</span>
            </p>
            <p class="text-muted">{{ formatDate(h.created_at) }}</p>
            <p v-if="h.remark">备注: {{ h.remark }}</p>
          </a-timeline-item>
        </a-timeline>

        <div v-if="currentTask.status === 'pending'" style="margin-top: 16px">
          <a-divider>审批意见</a-divider>
          <a-textarea v-model:value="approvalRemark" :rows="3" placeholder="请输入审批意见（可选）" />
          <div style="margin-top: 12px; text-align: right">
            <a-space>
              <a-button type="primary" :loading="processing" @click="submitApproval('approve')">
                <CheckOutlined /> 通过
              </a-button>
              <a-button danger :loading="processing" @click="submitApproval('reject')">
                <CloseOutlined /> 驳回
              </a-button>
            </a-space>
          </div>
        </div>
      </template>
    </a-modal>

    <!-- Instance Detail Modal -->
    <a-modal
      v-model:open="instanceDetailVisible"
      :title="currentInstance?.title"
      width="700px"
      :footer="null"
    >
      <template v-if="currentInstance">
        <a-descriptions :column="2" bordered size="small">
          <a-descriptions-item label="状态">
            <a-tag :color="instanceStatusColors[currentInstance.status]">
              {{ instanceStatusLabels[currentInstance.status] }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="当前节点">
            {{ currentInstance.current_node?.name || '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="业务模块">{{ currentInstance.module }}</a-descriptions-item>
          <a-descriptions-item label="业务单号">{{ currentInstance.record_id }}</a-descriptions-item>
          <a-descriptions-item label="发起时间">{{ formatDate(currentInstance.started_at) }}</a-descriptions-item>
          <a-descriptions-item label="完成时间">{{ formatDate(currentInstance.completed_at) || '-' }}</a-descriptions-item>
        </a-descriptions>

        <div v-if="currentInstance.pending_tasks?.length" style="margin-top: 16px">
          <a-divider>待处理人</a-divider>
          <a-space>
            <a-tag v-for="t in currentInstance.pending_tasks" :key="t.id" color="blue">
              {{ t.assignee_name }} ({{ t.node_name }})
            </a-tag>
          </a-space>
        </div>

        <a-divider>审批历史</a-divider>
        <a-timeline>
          <a-timeline-item
            v-for="(h, idx) in currentInstance.history"
            :key="idx"
            :color="getHistoryColor(h.action)"
          >
            <p>
              <strong>{{ h.node_name || h.action }}</strong>
              <span v-if="h.operator_name"> - {{ h.operator_name }}</span>
            </p>
            <p class="text-muted">{{ formatDate(h.created_at) }}</p>
            <p v-if="h.remark">备注: {{ h.remark }}</p>
          </a-timeline-item>
        </a-timeline>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import {
  ReloadOutlined,
  CheckOutlined,
  CloseOutlined
} from '@ant-design/icons-vue'
import {
  getMyTasks,
  getMyInitiated,
  getTaskDetail,
  getInstanceByRecord,
  processTask,
  withdrawWorkflow,
  getWorkflowStats,
  getBusinessDetail,
  type WorkflowTask,
  type WorkflowInstance
} from '@/api/system/workflow'
import { getPendingApprovals, approveRecord } from '@/api/system/approval'

// ==================== 审批待办 ====================
const approvalLoading = ref(false)
const approvalStatus = ref('pending')
const approvalItems = ref<any[]>([])
const approvalPagination = reactive({
  current: 1,
  pageSize: 5,
  total: 0,
  showSizeChanger: true,
  pageSizeOptions: ['5', '10', '20'],
  showTotal: (total: number) => `共 ${total} 条`
})

const approvalColumns = [
  { title: '业务模块', dataIndex: 'module_name', key: 'module_name', width: 100 },
  { title: '单据编号', dataIndex: 'record_id', key: 'record_id' },
  { title: '状态', key: 'approval_status', width: 80 },
  { title: '提交人', dataIndex: 'submitter', key: 'submitter', width: 80 },
  { title: '提交时间', key: 'submit_time', width: 150 },
  { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
  { title: '操作', key: 'actions', width: 80 }
]

const loadApprovals = async () => {
  approvalLoading.value = true
  try {
    const res: any = await getPendingApprovals({
      page: approvalPagination.current,
      limit: approvalPagination.pageSize,
      status: approvalStatus.value
    })
    if (res.success) {
      approvalItems.value = res.data.items
      approvalPagination.total = res.data.total
    }
  } catch (err) {
    console.error('[MyTasks] loadApprovals error:', err)
    message.error('加载审批待办失败')
  } finally {
    approvalLoading.value = false
  }
}

const handleApprovalTableChange = (pag: any) => {
  approvalPagination.current = pag.current
  approvalPagination.pageSize = pag.pageSize
  loadApprovals()
}

const handleApprovalApprove = async (record: any) => {
  try {
    const res: any = await approveRecord(record.module, record.record_id)
    if (res?.success) {
      message.success('审批通过')
      loadApprovals()
    } else {
      message.error(res?.message || '审批失败')
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '审批失败')
  }
}

// ==================== 工作流待办 ====================
// State
const loading = ref(false)
const loadingInitiated = ref(false)
const processing = ref(false)
const taskStatus = ref('pending')
const initiatedStatus = ref('all')
const tasks = ref<WorkflowTask[]>([])
const initiated = ref<WorkflowInstance[]>([])
const stats = reactive({ pendingTasks: 0, runningInitiated: 0, processedToday: 0 })

// Modals
const taskDetailVisible = ref(false)
const instanceDetailVisible = ref(false)
const currentTask = ref<any>(null)
const currentInstance = ref<WorkflowInstance | null>(null)
const approvalRemark = ref('')

// Business detail
const businessData = ref<any>(null)
const businessLoading = ref(false)

// Pagination
const taskPagination = reactive({
  current: 1,
  pageSize: 5,
  total: 0,
  showSizeChanger: true,
  pageSizeOptions: ['5', '10', '20'],
  showTotal: (total: number) => `共 ${total} 条`
})

const initiatedPagination = reactive({
  current: 1,
  pageSize: 5,
  total: 0,
  showSizeChanger: true,
  pageSizeOptions: ['5', '10', '20'],
  showTotal: (total: number) => `共 ${total} 条`
})

// Columns
const taskColumns = [
  { title: '流程标题', key: 'instance_title' },
  { title: '任务节点', dataIndex: 'node_name', key: 'node_name', width: 100 },
  { title: '节点类型', key: 'node_type', width: 70 },
  { title: '发起人', dataIndex: 'initiator_name', key: 'initiator_name', width: 80 },
  { title: '状态', key: 'status', width: 70 },
  { title: '创建时间', key: 'created_at', width: 150 },
  { title: '操作', key: 'actions', width: 120 }
]

const initiatedColumns = [
  { title: '流程标题', dataIndex: 'title', key: 'title' },
  { title: '业务模块', dataIndex: 'module', key: 'module', width: 100 },
  { title: '业务单号', dataIndex: 'record_id', key: 'record_id', width: 140 },
  { title: '状态', key: 'status', width: 70 },
  { title: '发起时间', key: 'started_at', width: 150 },
  { title: '操作', key: 'actions', width: 100 }
]

// Labels
const nodeTypeLabels: Record<string, string> = {
  approval: '审批',
  countersign: '会签',
  notification: '通知'
}

const nodeTypeColors: Record<string, string> = {
  approval: 'green',
  countersign: 'purple',
  notification: 'cyan'
}

const taskStatusLabels: Record<string, string> = {
  pending: '待处理',
  approved: '已通过',
  rejected: '已驳回',
  cancelled: '已取消'
}

const taskStatusColors: Record<string, string> = {
  pending: 'blue',
  approved: 'green',
  rejected: 'red',
  cancelled: 'default'
}

const instanceStatusLabels: Record<string, string> = {
  running: '进行中',
  completed: '已完成',
  rejected: '已驳回',
  returned: '已退回',
  reversed: '已反审',
  cancelled: '已撤回'
}

const instanceStatusColors: Record<string, string> = {
  running: 'blue',
  completed: 'green',
  rejected: 'red',
  returned: 'orange',
  reversed: 'orange',
  cancelled: 'default'
}

// Methods
const formatDate = (date: string) => {
  if (!date) return ''
  return new Date(date).toLocaleString('zh-CN')
}

const getHistoryColor = (action: string) => {
  if (action === 'start') return 'blue'
  if (action === 'approve' || action === 'countersign_approve') return 'green'
  if (action === 'reject' || action === 'countersign_reject') return 'red'
  if (action === 'withdraw') return 'orange'
  if (action === 'return_to_start' || action === 'return_to_previous') return 'orange'
  return 'gray'
}

// Module display names
const moduleDisplayNames: Record<string, string> = {
  sales_order: '销售订单', sales_forecast: '销售预测', Production_plan: '生产计划',
  production_order: '生产单', process_task: '工序任务单', material_preparation: '备料单',
  work_report: '报工单', purchase_req: '采购申请单', purchase_order: '采购订单',
  bom_header: 'BOM物料清单', routing_header: '工艺路线', stock_in: '入库单',
  return_order: '退货单'
}

// Business detail helpers
const headerFieldLabels: Record<string, string> = {
  // 通用字段
  remark: '备注', approval_status: '审批状态', condition: '状态', creation_man: '创建人',
  creation_date: '创建日期', item_number: '物料编号', item_name: '物料名称',
  specifications: '规格', basic_unit: '单位', product_drawing_number: '产品图号',
  linkman: '联系人', contacts: '联系方式', operator: '操作员',
  // 销售订单
  sales_order_number: '订单编号', order_date: '订单日期', delivery_date: '交货日期',
  order_status: '订单状态', customer_po_number: '客户PO号', head_of_sales: '销售负责人',
  customer_number: '客户编号', customer_name: '客户名称',
  // 销售预测
  forecast_number: '预测编号', forecast_date: '预测日期',
  // 生产单
  production_number: '生产计划号', production_order_number: '生产单号',
  planned_quantity: '计划数量', planned_completion_time: '计划完成时间',
  plan_status: '计划状态', rubber_compound_number: '胶料编号',
  batch_production_quota: '批次生产定额', production_task_number: '生产任务号',
  equipment_number: '设备编号', equipment_name: '设备名称', mould_number: '模具编号',
  formed_part_specifications: '成型件规格', formed_part_unit_consumption: '成型件单耗',
  actual_cavity_count: '实际腔数', actual_hole_count: '实际穴数',
  actual_daily_output: '实际日产量', production_date: '生产日期',
  schedule_id: '排程ID', inbound_quantity: '入库数量', inbound_status: '入库状态',
  // 工序任务
  process_task_number: '工序任务号', step_number: '工序号',
  standard_process_number: '标准工序编号', standard_process_name: '标准工序名称',
  work_center_number: '工作中心编号', work_center_name: '工作中心名称',
  process_material_input_number: '工序投料编号', process_material_input_quantity: '工序投料数量',
  process_material_input_unit: '工序投料单位', material_wastage_rate: '物料损耗率',
  excess_reporting_ratio: '超额报工比例', ingredient_addition_method: '配料添加方式',
  planned_start_time: '计划开始时间', planned_end_time: '计划结束时间',
  actual_start_time: '实际开始时间', actual_end_time: '实际结束时间',
  task_status: '任务状态', completed_quantity: '完成数量',
  // 备料单
  preparation_number: '备料单号', bom_version: 'BOM版本',
  bom_base_quantity: 'BOM基础用量', total_material_types: '物料种类数',
  preparation_status: '备料状态',
  // 报工单
  work_report_number: '报工单号', report_date: '报工日期',
  schedules_id: '班次ID', schedules_name: '班次名称',
  team_number: '班组编号', team_name: '班组名称',
  operator_number: '操作员编号', operator_name: '操作员名称',
  actual_hours: '实际工时', qualified_quantity: '合格数量',
  unqualified_quantity: '不合格数量', total_quantity: '总数量',
  cumulative_quantity: '累计数量', unqualified_reason: '不合格原因',
  defect_class_number: '缺陷类别编号', defect_class_name: '缺陷类别名称',
  defect_number: '缺陷编号', defect_name: '缺陷名称',
  // 采购申请
  purchase_req_number: '采购申请号', request_date: '申请日期',
  request_department: '申请部门', requester: '申请人',
  request_reason: '申请原因', source_number: '来源单号',
  // 采购订单
  purchase_order_number: '采购订单号', supplier_number: '供应商编号',
  supplier_name: '供应商', procurement_manager: '采购负责人',
  total_amount: '总金额', source_req_number: '来源申请号',
  // BOM
  bom_number: 'BOM编号', bom_name: 'BOM名称', bom_type: 'BOM类型',
  base_quantity: '基础用量', base_unit: '基础单位',
  // 工艺路线
  process_route_number: '工艺路线号', process_route_name: '工艺路线名称',
  production_automatic_inventory_entry_rules: '自动入库规则',
  // 入库单
  stock_in_number: '入库单号', warehouse_number: '仓库编号', warehouse_name: '仓库名称',
  stock_in_date: '入库日期', stock_in_type: '入库类型',
  // 退货单
  return_order_number: '退货单号', type: '退货类型',
  shipping_order_number: '发货单号', status: '业务状态',
  reason: '退货原因', confirm_remark: '确认备注',
  confirmed_by: '确认人', confirmed_date: '确认日期'
}

const hiddenHeaderFields = new Set([
  'id', '_row_num', 'approval_status', 'created_at', 'updated_at'
])

const filteredHeaderFields = computed(() => {
  if (!businessData.value?.header) return {}
  const result: Record<string, any> = {}
  for (const [key, val] of Object.entries(businessData.value.header)) {
    if (hiddenHeaderFields.has(key)) continue
    if (val === null || val === undefined || val === '') continue
    result[key] = val
  }
  return result
})

const businessDetailColumns = computed(() => {
  if (!businessData.value?.details?.length) return []
  const first = businessData.value.details[0]
  const skipKeys = new Set(['id', '_row_num'])
  const labelMap: Record<string, string> = {
    // 通用
    line_number: '行号', item_number: '物料编号', item_name: '物料名称',
    specifications: '规格', basic_unit: '单位', product_drawing_number: '产品图号',
    remark: '备注', status: '状态',
    // 销售订单明细
    order_quantity: '订单数量', unit_price: '单价', total_amount: '总金额',
    delivery_date: '交货日期', shipping_status: '发货状态', production_status: '生产状态',
    return_status: '退货状态', shipped_quantity: '已发数量', refunded_quantity: '已退数量',
    promised_delivery_date: '承诺交期',
    // 销售预测明细
    start_date: '开始日期', end_date: '结束日期', forecast_quantity: '预测数量',
    consumed_quantity: '已消耗', remaining_quantity: '剩余量', consumption_status: '消耗状态',
    // 采购申请明细
    request_quantity: '需求数量', ordered_quantity: '已订数量', expected_date: '期望日期',
    suggested_supplier_number: '建议供应商编号', suggested_supplier_name: '建议供应商',
    // 采购订单明细
    received_quantity: '已收数量', receive_status: '收货状态',
    source_req_number: '来源申请号', source_req_detail_id: '来源申请行ID',
    // BOM明细
    material_number: '物料编号', material_name: '物料名称', material_type: '物料类型',
    standard_quantity: '标准用量', unit: '单位', wastage_rate: '损耗率',
    actual_quantity: '实际用量', is_key_material: '关键物料', substitute_group: '替代组',
    substitute_priority: '替代优先级', supply_type: '供应类型',
    default_warehouse: '默认仓库', child_bom_number: '子BOM编号',
    // 工艺路线明细
    step_number: '工序号', standard_process_number: '标准工序编号',
    standard_process_name: '标准工序名称', process_name: '工序名称',
    post_processing_sequence_number: '后处理序号', post_processing_sequence_name: '后处理名称',
    work_center_number: '工作中心编号', work_center_name: '工作中心名称',
    excess_reporting_ratio: '超额报工比例', ingredient_addition_method: '配料添加方式',
    process_material_input_number: '工序投料编号', process_material_input_quantity: '工序投料数量',
    process_material_input_unit: '工序投料单位', material_wastage_rate: '物料损耗率',
    flowing_backward: '倒流标识', default_repository: '默认仓库', operator: '操作员',
    process_route_number: '工艺路线号',
    // 退货单明细
    shipping_order_detail_id: '发货明细ID', sales_order_number: '销售订单号',
    sales_detail_id: '销售明细ID', return_quantity: '退货数量',
    shipped_quantity_detail: '发货数量',
    // 关联单号
    forecast_number: '预测编号', purchase_req_number: '采购申请号',
    purchase_order_number: '采购订单号', bom_number: 'BOM编号',
    return_order_number: '退货单号'
  }
  return Object.keys(first)
    .filter(k => !skipKeys.has(k) && first[k] !== null && first[k] !== undefined)
    .map(k => ({ title: labelMap[k] || k, dataIndex: k, key: k, width: 100, ellipsis: true }))
})

const isDateField = (field: string) => /date|time|_at$/i.test(field || '')

const formatShortDate = (val: any) => {
  if (!val) return '-'
  try {
    const d = new Date(val)
    if (isNaN(d.getTime())) return val
    return d.toLocaleDateString('zh-CN')
  } catch { return val }
}

const formatFieldValue = (key: string, val: any) => {
  if (val === null || val === undefined) return '-'
  if (isDateField(key)) return formatShortDate(val)
  return val
}

const loadStats = async () => {
  try {
    const res = await getWorkflowStats()
    if (res.success) {
      Object.assign(stats, res.data)
    }
  } catch (err) {
    console.error('Failed to load stats:', err)
  }
}

const loadTasks = async () => {
  loading.value = true
  try {
    const res = await getMyTasks({
      page: taskPagination.current,
      limit: taskPagination.pageSize,
      status: taskStatus.value
    })
    if (res.success) {
      tasks.value = res.data.items
      taskPagination.total = res.data.total
    }
  } catch (err) {
    message.error('加载任务失败')
  } finally {
    loading.value = false
  }
}

const loadInitiated = async () => {
  loadingInitiated.value = true
  try {
    const res = await getMyInitiated({
      page: initiatedPagination.current,
      limit: initiatedPagination.pageSize,
      status: initiatedStatus.value
    })
    if (res.success) {
      initiated.value = res.data.items
      initiatedPagination.total = res.data.total
    }
  } catch (err) {
    message.error('加载数据失败')
  } finally {
    loadingInitiated.value = false
  }
}

const handleTaskTableChange = (pag: any) => {
  taskPagination.current = pag.current
  taskPagination.pageSize = pag.pageSize
  loadTasks()
}

const handleInitiatedTableChange = (pag: any) => {
  initiatedPagination.current = pag.current
  initiatedPagination.pageSize = pag.pageSize
  loadInitiated()
}

const showTaskDetail = async (task: WorkflowTask) => {
  try {
    businessData.value = null
    const res = await getTaskDetail(task.id)
    if (res.success) {
      currentTask.value = res.data
      approvalRemark.value = ''
      taskDetailVisible.value = true
      // Fetch business detail in background
      if (res.data.module && res.data.record_id) {
        businessLoading.value = true
        try {
          const bizRes: any = await getBusinessDetail(res.data.module, res.data.record_id)
          if (bizRes?.success) businessData.value = bizRes.data
        } catch { /* ignore */ }
        finally { businessLoading.value = false }
      }
    }
  } catch (err) {
    message.error('加载详情失败')
  }
}

const showInstanceDetail = async (instance: WorkflowInstance) => {
  try {
    const res = await getInstanceByRecord(instance.module, instance.record_id)
    if (res.success && res.data) {
      currentInstance.value = res.data
      instanceDetailVisible.value = true
    }
  } catch (err) {
    message.error('加载详情失败')
  }
}

const handleApprove = (task: WorkflowTask) => {
  showTaskDetail(task)
}

const handleReject = (task: WorkflowTask) => {
  showTaskDetail(task)
}

const submitApproval = async (action: 'approve' | 'reject') => {
  if (!currentTask.value) return

  processing.value = true
  try {
    const res = await processTask(currentTask.value.id, action, approvalRemark.value)
    if (res.success) {
      message.success(res.message || (action === 'approve' ? '审批通过' : '已驳回'))
      taskDetailVisible.value = false
      loadTasks()
      loadStats()
    } else {
      message.error(res.message || '操作失败')
    }
  } catch (err) {
    message.error('操作失败')
  } finally {
    processing.value = false
  }
}

const handleWithdraw = async (instance: WorkflowInstance) => {
  try {
    const res = await withdrawWorkflow(instance.id)
    if (res.success) {
      message.success('已撤回')
      loadInitiated()
      loadStats()
    } else {
      message.error(res.message || '撤回失败')
    }
  } catch (err) {
    message.error('撤回失败')
  }
}

onMounted(() => {
  loadApprovals()
  loadStats()
  loadTasks()
  loadInitiated()
})
</script>

<style scoped>
.my-tasks {
  padding: 8px 12px;
  font-size: 13px;
}

.my-tasks :deep(.ant-card) {
  margin-bottom: 0;
}

.my-tasks :deep(.ant-card-head) {
  min-height: 36px;
  padding: 0 12px;
  font-size: 13px;
}

.my-tasks :deep(.ant-card-head-title) {
  padding: 6px 0;
  font-size: 13px;
}

.my-tasks :deep(.ant-card-extra) {
  padding: 4px 0;
}

.my-tasks :deep(.ant-card-body) {
  padding: 8px 12px;
}

.my-tasks :deep(.ant-table) {
  font-size: 12px;
}

.my-tasks :deep(.ant-table-thead > tr > th) {
  padding: 4px 8px;
  font-size: 12px;
}

.my-tasks :deep(.ant-table-tbody > tr > td) {
  padding: 3px 8px;
  font-size: 12px;
}

.my-tasks :deep(.ant-table-pagination) {
  margin: 6px 0 2px;
}

.my-tasks :deep(.ant-badge-count) {
  font-size: 11px;
}

.text-muted {
  color: #999;
  font-size: 11px;
}
</style>
