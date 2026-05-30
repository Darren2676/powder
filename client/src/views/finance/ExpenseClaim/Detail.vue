<script setup lang="ts">
import { ref, reactive, computed, onMounted, createVNode } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import {
  ArrowLeftOutlined, PlusOutlined, DeleteOutlined, UploadOutlined,
  ExclamationCircleOutlined, ReloadOutlined, SaveOutlined,
  CheckOutlined, CloseOutlined, RollbackOutlined, EditOutlined,
} from '@ant-design/icons-vue'
import {
  getExpenseClaimDetail, getClaimTypes, updateExpenseClaim,
  submitExpenseClaim, approveExpenseClaim, rejectExpenseClaim,
  withdrawExpenseClaim, reverseExpenseClaim,
  uploadAttachment, deleteAttachment,
  checkWorkflowActive,
} from '@/api/finance/expenseClaim'
import { getActiveDepartments } from '@/api/system/department'

defineOptions({ name: 'ExpenseClaimDetail' })

const route = useRoute()
const router = useRouter()
const claimId = computed(() => route.params.id as string)

const CLAIM_TYPE_OPTIONS = ref<string[]>([])
const EXPENSE_CATEGORY_OPTIONS = ref<string[]>([])
const departmentList = ref<{ id: number; dept_name: string }[]>([])

// ==================== 数据 ====================
interface Header {
  id?: number
  claim_number?: string
  claim_date?: string
  claim_type?: string
  applicant_name?: string
  department?: string
  purpose?: string
  total_amount?: number
  advance_amount?: number
  return_amount?: number
  supplement_amount?: number
  approval_status?: string
  current_step?: number
  remark?: string
  created_by?: string
  created_at?: string
  updated_by?: string
  updated_at?: string
}

interface Item {
  id?: number
  claim_number?: string
  expense_category?: string
  trip_from?: string
  trip_to?: string
  trip_start_date?: string
  trip_end_date?: string
  vehicle_type?: string
  receipt_count?: number
  person_count?: number
  days?: number
  subsidy_rate?: number
  amount?: number
  item_remark?: string
  sort_order?: number
}

interface Step {
  id?: number
  step_number?: number
  step_name?: string
  approver_id?: number
  approver_name?: string
  status?: string
  approved_at?: string
  remark?: string
}

interface Attachment {
  id?: number
  file_name?: string
  file_url?: string
  file_size?: number
  uploaded_by?: string
  uploaded_at?: string
}

const header = ref<Header>({})
const items = ref<Item[]>([])
const steps = ref<Step[]>([])
const attachments = ref<Attachment[]>([])
const loading = ref(false)
const saving = ref(false)

// 工作流状态
const workflowActive = ref(false)  // 是否有已发布的流程定义
const wfInstance = ref<any>(null)  // 工作流实例信息
const isWorkflowMode = computed(() => workflowActive.value && wfInstance.value && wfInstance.value.status === 'running')
const hasWorkflowHistory = computed(() => workflowActive.value && wfInstance.value && (wfInstance.value.history?.length > 0))

const isEditable = computed(() =>
  header.value.approval_status === '草稿' || header.value.approval_status === '已驳回'
)

// ==================== 加载详情 ====================
const fetchDetail = async () => {
  if (!claimId.value) return
  loading.value = true
  try {
    const res: any = await getExpenseClaimDetail(claimId.value)
    if (res?.success) {
      header.value = res.data.header || {}
      items.value = (res.data.items || []).map((it: any, idx: number) => ({ ...it, _key: idx }))
      steps.value = res.data.steps || []
      attachments.value = res.data.attachments || []
      // 工作流实例数据直接从详情接口获取
      wfInstance.value = res.data.workflowInstance || null
    } else {
      message.error(res?.message || '加载失败')
    }
  } catch (err: any) {
    message.error(err?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
  // 加载工作流状态
  fetchWorkflowStatus()
}

const fetchWorkflowStatus = async () => {
  try {
    const checkRes: any = await checkWorkflowActive()
    workflowActive.value = checkRes?.data?.hasWorkflow || false
    // wfInstance 已在 fetchDetail 中从详情接口获取，此处只更新 hasWorkflow 标志
  } catch {
    workflowActive.value = false
  }
}

// ==================== 基础信息编辑 ====================
const headerEditVisible = ref(false)
const headerForm = reactive<Header>({})

const openHeaderEdit = () => {
  Object.assign(headerForm, {
    claim_type: header.value.claim_type,
    department: header.value.department,
    purpose: header.value.purpose,
    advance_amount: header.value.advance_amount || 0,
    remark: header.value.remark,
  })
  headerEditVisible.value = true
}

const handleHeaderSave = async () => {
  try {
    const res: any = await updateExpenseClaim(claimId.value, headerForm)
    if (res?.success) {
      message.success('更新成功')
      headerEditVisible.value = false
      fetchDetail()
    } else {
      message.error(res?.message || '更新失败')
    }
  } catch (err: any) {
    message.error(err?.response?.data?.message || '更新失败')
  }
}

// ==================== 费用明细编辑 ====================
const editingItems = ref<Item[]>([])
const itemEditing = ref(false)

const startItemEdit = () => {
  editingItems.value = items.value.map(it => ({ ...it }))
  itemEditing.value = true
}

const addItemRow = () => {
  editingItems.value.push({
    expense_category: EXPENSE_CATEGORY_OPTIONS.value[0] || '交通费',
    receipt_count: 0,
    person_count: 1,
    days: 0,
    subsidy_rate: 0,
    amount: 0,
    sort_order: editingItems.value.length,
    _key: Date.now(),
  } as any)
}

const removeItemRow = (idx: number) => {
  editingItems.value.splice(idx, 1)
}

const cancelItemEdit = () => {
  itemEditing.value = false
  editingItems.value = []
}

const saveItemEdit = async () => {
  try {
    saving.value = true
    const cleanItems = editingItems.value.map((it, idx) => ({
      expense_category: it.expense_category,
      trip_from: it.trip_from || null,
      trip_to: it.trip_to || null,
      trip_start_date: it.trip_start_date || null,
      trip_end_date: it.trip_end_date || null,
      vehicle_type: it.vehicle_type || null,
      receipt_count: it.receipt_count || 0,
      person_count: it.person_count || 1,
      days: it.days || 0,
      subsidy_rate: it.subsidy_rate || 0,
      amount: it.amount || 0,
      item_remark: it.item_remark || null,
    }))
    const res: any = await updateExpenseClaim(claimId.value, { items: cleanItems })
    if (res?.success) {
      message.success('明细更新成功')
      itemEditing.value = false
      fetchDetail()
    } else {
      message.error(res?.message || '更新失败')
    }
  } catch (err: any) {
    message.error(err?.response?.data?.message || '更新失败')
  } finally {
    saving.value = false
  }
}

// ==================== 审批操作 ====================
const handleSubmit = () => {
  Modal.confirm({
    title: '确认提交',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定提交报销单「${header.value.claim_number}」进行审批？`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await submitExpenseClaim(claimId.value)
        if (res?.success) { message.success('提交成功'); fetchDetail() }
        else { message.error(res?.message || '提交失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '提交失败')
      }
    },
  })
}

const handleApprove = () => {
  let remark = ''
  Modal.confirm({
    title: '审批通过',
    icon: createVNode(ExclamationCircleOutlined),
    content: () => [
      createVNode('p', null, `确定通过报销单「${header.value.claim_number}」的审批？`),
      createVNode('textarea', {
        placeholder: '审批意见（可选）',
        style: 'width:100%;margin-top:8px;padding:4px 8px;border:1px solid #d9d9d9;border-radius:4px;min-height:60px',
        onInput: (e: Event) => { remark = (e.target as HTMLTextAreaElement).value },
      }),
    ],
    okText: '确认通过', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await approveExpenseClaim(claimId.value, { remark })
        if (res?.success) { message.success('审批通过'); fetchDetail() }
        else { message.error(res?.message || '审批失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '审批失败')
      }
    },
  })
}

const handleReject = () => {
  let remark = ''
  Modal.confirm({
    title: '驳回',
    icon: createVNode(ExclamationCircleOutlined),
    content: () => [
      createVNode('p', null, `确定驳回报销单「${header.value.claim_number}」？`),
      createVNode('textarea', {
        placeholder: '驳回原因（可选）',
        style: 'width:100%;margin-top:8px;padding:4px 8px;border:1px solid #d9d9d9;border-radius:4px;min-height:60px',
        onInput: (e: Event) => { remark = (e.target as HTMLTextAreaElement).value },
      }),
    ],
    okText: '确认驳回', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await rejectExpenseClaim(claimId.value, { remark })
        if (res?.success) { message.success('已驳回'); fetchDetail() }
        else { message.error(res?.message || '驳回失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '驳回失败')
      }
    },
  })
}

const handleWithdraw = () => {
  Modal.confirm({
    title: '确认撤回',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定撤回报销单「${header.value.claim_number}」？撤回后变为草稿状态。`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await withdrawExpenseClaim(claimId.value)
        if (res?.success) { message.success('已撤回'); fetchDetail() }
        else { message.error(res?.message || '撤回失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '撤回失败')
      }
    },
  })
}

const handleReverse = () => {
  let remark = ''
  Modal.confirm({
    title: '反审',
    icon: createVNode(ExclamationCircleOutlined),
    content: () => [
      createVNode('p', null, `确定对报销单「${header.value.claim_number}」进行反审？反审后变为草稿状态。`),
      createVNode('textarea', {
        placeholder: '反审原因（可选）',
        style: 'width:100%;margin-top:8px;padding:4px 8px;border:1px solid #d9d9d9;border-radius:4px;min-height:60px',
        onInput: (e: Event) => { remark = (e.target as HTMLTextAreaElement).value },
      }),
    ],
    okText: '确认反审', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await reverseExpenseClaim(claimId.value, { remark })
        if (res?.success) { message.success('反审成功'); fetchDetail() }
        else { message.error(res?.message || '反审失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '反审失败')
      }
    },
  })
}

// ==================== 附件 ====================
const fileList = ref<any[]>([])
const uploading = ref(false)

const handleUpload = async (options: any) => {
  const { file } = options
  uploading.value = true
  try {
    const res: any = await uploadAttachment(claimId.value, file)
    if (res?.success) {
      message.success('上传成功')
      fetchDetail()
    } else {
      message.error(res?.message || '上传失败')
    }
  } catch (err: any) {
    message.error(err?.response?.data?.message || '上传失败')
  } finally {
    uploading.value = false
  }
}

const handleDeleteAttachment = (record: Attachment) => {
  Modal.confirm({
    title: '确认删除附件',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除附件「${record.file_name}」吗？`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await deleteAttachment(claimId.value, record.id!)
        if (res?.success) { message.success('删除成功'); fetchDetail() }
        else { message.error(res?.message || '删除失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '删除失败')
      }
    },
  })
}

// ==================== 工具函数 ====================
const statusColor = (s?: string) => {
  const map: Record<string, string> = {
    '草稿': 'default', '待审批': 'orange', '审批中': 'processing',
    '已审批': 'success', '已驳回': 'error', '已撤回': 'warning',
  }
  return map[s || ''] || 'default'
}

const stepStatusColor = (s?: string) => {
  const map: Record<string, string> = { '待审批': 'wait', '已通过': 'finish', '已驳回': 'error' }
  return map[s || ''] || 'wait'
}

const formatDate = (v?: string) => v ? String(v).slice(0, 10) : '-'
const formatDateTime = (v?: string) => v ? String(v).slice(0, 19).replace('T', ' ') : '-'
const formatAmount = (v?: number) => v != null ? Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'

const isTravelRow = (cat?: string) => cat === '交通费' || cat === '住宿费' || cat === '出差补贴'

// ==================== 明细表列定义 ====================
const displayItemColumns = [
  { title: '费用类别', dataIndex: 'expense_category', key: 'expense_category', width: 100 },
  { title: '起点', dataIndex: 'trip_from', key: 'trip_from', width: 100 },
  { title: '终点', dataIndex: 'trip_to', key: 'trip_to', width: 100 },
  { title: '出发日期', dataIndex: 'trip_start_date', key: 'trip_start_date', width: 110 },
  { title: '返回日期', dataIndex: 'trip_end_date', key: 'trip_end_date', width: 110 },
  { title: '交通工具', dataIndex: 'vehicle_type', key: 'vehicle_type', width: 90 },
  { title: '单据张数', dataIndex: 'receipt_count', key: 'receipt_count', width: 80, align: 'right' as const },
  { title: '人数', dataIndex: 'person_count', key: 'person_count', width: 60, align: 'right' as const },
  { title: '天数', dataIndex: 'days', key: 'days', width: 60, align: 'right' as const },
  { title: '补贴标准', dataIndex: 'subsidy_rate', key: 'subsidy_rate', width: 90, align: 'right' as const },
  { title: '金额', dataIndex: 'amount', key: 'amount', width: 110, align: 'right' as const },
  { title: '备注', dataIndex: 'item_remark', key: 'item_remark', width: 150, ellipsis: true },
]

const editItemColumns = [
  { title: '费用类别', key: 'expense_category', width: 120 },
  { title: '起点', key: 'trip_from', width: 100 },
  { title: '终点', key: 'trip_to', width: 100 },
  { title: '出发日期', key: 'trip_start_date', width: 120 },
  { title: '返回日期', key: 'trip_end_date', width: 120 },
  { title: '交通工具', key: 'vehicle_type', width: 100 },
  { title: '单据张数', key: 'receipt_count', width: 80 },
  { title: '人数', key: 'person_count', width: 70 },
  { title: '天数', key: 'days', width: 70 },
  { title: '补贴标准', key: 'subsidy_rate', width: 100 },
  { title: '金额', key: 'amount', width: 110 },
  { title: '明细备注', key: 'item_remark', width: 140 },
  { title: '操作', key: 'action', width: 70, fixed: 'right' as const },
]

// ==================== 加载字典 ====================
const fetchDictionaries = async () => {
  try {
    const res: any = await getClaimTypes()
    if (res?.success) {
      CLAIM_TYPE_OPTIONS.value = res.data?.claim_types || []
      EXPENSE_CATEGORY_OPTIONS.value = res.data?.expense_categories || []
    }
  } catch {}
}

const loadDepartments = async () => {
  try {
    const res: any = await getActiveDepartments()
    if (res?.success) {
      departmentList.value = res.data || []
    }
  } catch {}
}

onMounted(() => {
  fetchDetail()
  fetchDictionaries()
  loadDepartments()
})
</script>

<template>
  <div>
    <a-card :bordered="false" :loading="loading">
      <!-- 顶部条 -->
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap">
        <a-space>
          <a-button @click="router.back()">
            <template #icon><ArrowLeftOutlined /></template>返回
          </a-button>
          <span style="font-size: 18px; font-weight: 600">报销单详情</span>
          <a-tag :color="statusColor(header.approval_status)">{{ header.approval_status || '-' }}</a-tag>
          <span v-if="header.claim_number" style="color: #888">{{ header.claim_number }}</span>
        </a-space>
        <a-space>
          <a-button @click="fetchDetail">
            <template #icon><ReloadOutlined /></template>刷新
          </a-button>
          <template v-if="isEditable">
            <a-button @click="openHeaderEdit">
              <template #icon><EditOutlined /></template>编辑基础信息
            </a-button>
            <a-button type="primary" @click="handleSubmit">
              <template #icon><CheckOutlined /></template>提交审批
            </a-button>
          </template>
          <template v-if="header.approval_status === '待审批' || header.approval_status === '审批中'">
            <template v-if="isWorkflowMode">
              <a-tooltip title="已进入工作流审批，请在流程管理-我的待办中操作">
                <a-button type="primary" disabled>
                  <template #icon><CheckOutlined /></template>审批通过
                </a-button>
              </a-tooltip>
              <a-tooltip title="已进入工作流审批，请在流程管理-我的待办中操作">
                <a-button danger disabled>
                  <template #icon><CloseOutlined /></template>驳回
                </a-button>
              </a-tooltip>
              <a-tooltip title="已进入工作流审批，请在流程管理中撤回">
                <a-button disabled>
                  <template #icon><RollbackOutlined /></template>撤回
                </a-button>
              </a-tooltip>
            </template>
            <template v-else>
              <a-button type="primary" @click="handleApprove">
                <template #icon><CheckOutlined /></template>审批通过
              </a-button>
              <a-button danger @click="handleReject">
                <template #icon><CloseOutlined /></template>驳回
              </a-button>
              <a-button @click="handleWithdraw">
                <template #icon><RollbackOutlined /></template>撤回
              </a-button>
            </template>
          </template>
          <a-button v-if="header.approval_status === '已审批'" danger @click="handleReverse">
            反审
          </a-button>
        </a-space>
      </div>

      <!-- 基础信息 -->
      <a-descriptions :column="3" bordered size="small" title="基础信息">
        <a-descriptions-item label="报销单号">{{ header.claim_number || '-' }}</a-descriptions-item>
        <a-descriptions-item label="报销日期">{{ formatDate(header.claim_date) }}</a-descriptions-item>
        <a-descriptions-item label="报销类型">{{ header.claim_type || '-' }}</a-descriptions-item>
        <a-descriptions-item label="申请人">{{ header.applicant_name || '-' }}</a-descriptions-item>
        <a-descriptions-item label="部门">{{ header.department || '-' }}</a-descriptions-item>
        <a-descriptions-item label="事由" :span="3">{{ header.purpose || '-' }}</a-descriptions-item>
      </a-descriptions>

      <a-divider />

      <!-- 结算区 -->
      <a-descriptions :column="4" bordered size="small" title="结算信息" style="background: #fafafa">
        <a-descriptions-item label="报销总额">
          <span style="font-size: 16px; font-weight: 600; color: #1890ff">{{ formatAmount(header.total_amount) }}</span>
        </a-descriptions-item>
        <a-descriptions-item label="预支金额">{{ formatAmount(header.advance_amount) }}</a-descriptions-item>
        <a-descriptions-item label="退回金额">
          <span :style="{ color: header.return_amount && header.return_amount > 0 ? '#f5222d' : '' }">{{ formatAmount(header.return_amount) }}</span>
        </a-descriptions-item>
        <a-descriptions-item label="补领金额">
          <span :style="{ color: header.supplement_amount && header.supplement_amount > 0 ? '#52c41a' : '' }">{{ formatAmount(header.supplement_amount) }}</span>
        </a-descriptions-item>
      </a-descriptions>

      <a-divider />

      <!-- 费用明细区 -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px">
        <span style="font-size: 16px; font-weight: 600">费用明细</span>
        <a-space v-if="isEditable">
          <a-button v-if="!itemEditing" type="primary" @click="startItemEdit">
            <template #icon><EditOutlined /></template>编辑明细
          </a-button>
          <template v-else>
            <a-button type="primary" @click="addItemRow">
              <template #icon><PlusOutlined /></template>新增行
            </a-button>
            <a-button type="primary" @click="saveItemEdit" :loading="saving">
              <template #icon><SaveOutlined /></template>保存
            </a-button>
            <a-button @click="cancelItemEdit">取消</a-button>
          </template>
        </a-space>
      </div>

      <!-- 只读表格 -->
      <a-table
        v-if="!itemEditing"
        :columns="displayItemColumns" :data-source="items" :pagination="false"
        :row-key="(record: any) => record.id || record._key" :scroll="{ x: 'max-content' }" size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'trip_start_date' || column.key === 'trip_end_date'">
            {{ record[column.dataIndex] ? String(record[column.dataIndex]).slice(0, 10) : (isTravelRow(record.expense_category) ? '-' : '') }}
          </template>
          <template v-else-if="column.key === 'amount'">
            {{ formatAmount(record.amount) }}
          </template>
          <template v-else-if="column.key === 'subsidy_rate'">
            {{ record.subsidy_rate > 0 ? formatAmount(record.subsidy_rate) : '-' }}
          </template>
          <template v-else-if="!isTravelRow(record.expense_category) && ['trip_from','trip_to','trip_start_date','trip_end_date','vehicle_type'].includes(column.key)">
            <!-- 非差旅行不显示差旅字段 -->
          </template>
        </template>
      </a-table>

      <!-- 编辑表格 -->
      <a-table
        v-else
        :columns="editItemColumns" :data-source="editingItems" :pagination="false"
        :row-key="(_: any, idx: number) => idx" :scroll="{ x: 'max-content' }" size="small"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'expense_category'">
            <a-select v-model:value="record.expense_category" style="width: 100%" size="small">
              <a-select-option v-for="c in EXPENSE_CATEGORY_OPTIONS" :key="c" :value="c">{{ c }}</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'trip_from'">
            <a-input v-if="isTravelRow(record.expense_category)" v-model:value="record.trip_from" size="small" />
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'trip_to'">
            <a-input v-if="isTravelRow(record.expense_category)" v-model:value="record.trip_to" size="small" />
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'trip_start_date'">
            <a-date-picker v-if="isTravelRow(record.expense_category)" v-model:value="record.trip_start_date" value-format="YYYY-MM-DD" size="small" style="width: 100%" />
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'trip_end_date'">
            <a-date-picker v-if="isTravelRow(record.expense_category)" v-model:value="record.trip_end_date" value-format="YYYY-MM-DD" size="small" style="width: 100%" />
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'vehicle_type'">
            <a-input v-if="isTravelRow(record.expense_category)" v-model:value="record.vehicle_type" size="small" placeholder="火车/飞机等" />
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'receipt_count'">
            <a-input-number v-model:value="record.receipt_count" :min="0" size="small" style="width: 100%" />
          </template>
          <template v-else-if="column.key === 'person_count'">
            <a-input-number v-model:value="record.person_count" :min="1" size="small" style="width: 100%" />
          </template>
          <template v-else-if="column.key === 'days'">
            <a-input-number v-model:value="record.days" :min="0" :precision="1" size="small" style="width: 100%" />
          </template>
          <template v-else-if="column.key === 'subsidy_rate'">
            <a-input-number v-model:value="record.subsidy_rate" :min="0" :precision="2" size="small" style="width: 100%" />
          </template>
          <template v-else-if="column.key === 'amount'">
            <a-input-number v-model:value="record.amount" :min="0" :precision="2" size="small" style="width: 100%" />
          </template>
          <template v-else-if="column.key === 'item_remark'">
            <a-input v-model:value="record.item_remark" size="small" />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" size="small" danger @click="removeItemRow(index)">
              <template #icon><DeleteOutlined /></template>
            </a-button>
          </template>
        </template>
      </a-table>

      <a-divider />

      <!-- 审批步骤区 -->
      <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between">
        <span style="font-size: 16px; font-weight: 600">审批步骤</span>
        <a-tag v-if="isWorkflowMode" color="blue">流程审批中</a-tag>
        <a-tag v-else-if="hasWorkflowHistory && wfInstance?.status === 'completed'" color="green">流程已结束</a-tag>
      </div>
      <template v-if="hasWorkflowHistory && wfInstance">
        <a-descriptions :column="2" bordered size="small">
          <a-descriptions-item label="流程名称">{{ wfInstance.definition_name || '报销单审批' }}</a-descriptions-item>
          <a-descriptions-item label="流程状态">
            <a-tag :color="wfInstance.status === 'completed' ? 'green' : wfInstance.status === 'running' ? 'blue' : 'orange'">
              {{ wfInstance.status === 'completed' ? '已完成' : wfInstance.status === 'running' ? '进行中' : wfInstance.status }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="发起人">{{ wfInstance.initiator_name || '-' }}</a-descriptions-item>
          <a-descriptions-item label="发起时间">{{ formatDateTime(wfInstance.started_at) }}</a-descriptions-item>
          <a-descriptions-item v-if="wfInstance.completed_at" label="完成时间">{{ formatDateTime(wfInstance.completed_at) }}</a-descriptions-item>
        </a-descriptions>
        <div v-if="wfInstance.pending_tasks && wfInstance.pending_tasks.length" style="margin-top: 8px">
          <span style="font-weight: 500">当前待办：</span>
          <a-tag v-for="task in wfInstance.pending_tasks" :key="task.id" color="orange">
            {{ task.assignee_name }} ({{ task.node_name }})
          </a-tag>
        </div>
        <!-- 审批历史时间线 -->
        <div style="margin-top: 12px">
          <span style="font-weight: 500">审批历史：</span>
          <a-timeline style="margin-top: 8px; padding-left: 4px">
            <a-timeline-item v-for="h in wfInstance.history" :key="h.id"
              :color="h.action === 'start' ? 'blue' : h.action === 'approve' ? 'green' : h.action === 'reject' ? 'red' : 'gray'"
            >
              <div>
                <span style="font-weight: 500">{{ h.node_name || '发起' }}</span>
                <a-tag v-if="h.action === 'start'" color="blue" style="margin-left: 6px">发起</a-tag>
                <a-tag v-else-if="h.action === 'approve'" color="green" style="margin-left: 6px">通过</a-tag>
                <a-tag v-else-if="h.action === 'reject'" color="red" style="margin-left: 6px">驳回</a-tag>
                <a-tag v-else style="margin-left: 6px">{{ h.action }}</a-tag>
                <span style="color: #888; margin-left: 8px">{{ h.operator_name || '-' }}</span>
                <span style="color: #bbb; margin-left: 8px">{{ formatDateTime(h.created_at) }}</span>
              </div>
              <div v-if="h.remark" style="color: #666; font-size: 12px; margin-top: 2px">意见: {{ h.remark }}</div>
            </a-timeline-item>
          </a-timeline>
        </div>
      </template>
      <template v-else-if="steps.length">
        <a-steps :current="steps.filter(s => s.status === '已通过').length" style="padding: 12px 0">
          <a-step v-for="step in steps" :key="step.id"
            :title="step.step_name || `第${step.step_number}步`"
            :description="`${step.approver_name || '-'}${step.approved_at ? ' · ' + formatDateTime(step.approved_at) : ''}${step.remark ? ' · ' + step.remark : ''}`"
            :status="stepStatusColor(step.status)"
          />
        </a-steps>
      </template>
      <template v-else>
        <a-empty description="暂无审批步骤（提交审批时创建）" />
      </template>

      <a-divider />

      <!-- 附件区 -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px">
        <span style="font-size: 16px; font-weight: 600">附件</span>
        <a-upload
          :customRequest="handleUpload"
          :showUploadList="false"
          :disabled="!isEditable && header.approval_status !== '待审批' && header.approval_status !== '审批中'"
        >
          <a-button type="primary" size="small" :loading="uploading">
            <template #icon><UploadOutlined /></template>上传附件
          </a-button>
        </a-upload>
      </div>
      <a-table
        v-if="attachments.length"
        :columns="[
          { title: '文件名', dataIndex: 'file_name', key: 'file_name', ellipsis: true },
          { title: '大小', dataIndex: 'file_size', key: 'file_size', width: 100 },
          { title: '上传人', dataIndex: 'uploaded_by', key: 'uploaded_by', width: 100 },
          { title: '上传时间', dataIndex: 'uploaded_at', key: 'uploaded_at', width: 170 },
          { title: '操作', key: 'action', width: 120 },
        ]"
        :data-source="attachments" :pagination="false" size="small" row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'file_size'">
            {{ record.file_size ? (record.file_size / 1024).toFixed(1) + ' KB' : '-' }}
          </template>
          <template v-else-if="column.key === 'uploaded_at'">
            {{ formatDateTime(record.uploaded_at) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a :href="record.file_url" target="_blank">预览</a>
              <a-divider type="vertical" />
              <a-button type="link" size="small" danger @click="handleDeleteAttachment(record)">删除</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
      <a-empty v-else description="暂无附件" />

      <a-divider />

      <!-- 审计信息 -->
      <a-descriptions :column="2" size="small">
        <a-descriptions-item label="创建人">{{ header.created_by || '-' }}</a-descriptions-item>
        <a-descriptions-item label="创建时间">{{ formatDateTime(header.created_at) }}</a-descriptions-item>
        <a-descriptions-item label="更新人">{{ header.updated_by || '-' }}</a-descriptions-item>
        <a-descriptions-item label="更新时间">{{ formatDateTime(header.updated_at) }}</a-descriptions-item>
        <a-descriptions-item label="备注" :span="2">{{ header.remark || '-' }}</a-descriptions-item>
      </a-descriptions>
    </a-card>

    <!-- 编辑基础信息弹窗 -->
    <a-modal v-model:open="headerEditVisible" title="编辑基础信息" width="600px"
      @ok="handleHeaderSave" okText="保存" cancelText="取消">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="报销类型">
          <a-select v-model:value="headerForm.claim_type">
            <a-select-option v-for="t in CLAIM_TYPE_OPTIONS" :key="t" :value="t">{{ t }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="部门">
          <a-select v-model:value="headerForm.department" placeholder="请选择部门" allowClear>
            <a-select-option v-for="dept in departmentList" :key="dept.id" :value="dept.dept_name" :label="dept.dept_name">{{ dept.dept_name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="事由">
          <a-textarea v-model:value="headerForm.purpose" :rows="2" />
        </a-form-item>
        <a-form-item label="预支金额">
          <a-input-number v-model:value="headerForm.advance_amount" :min="0" :precision="2" style="width: 100%" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="headerForm.remark" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>
