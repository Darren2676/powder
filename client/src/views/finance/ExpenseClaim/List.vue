<script setup lang="ts">
import { ref, onMounted, createVNode } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import {
  PlusOutlined, ReloadOutlined, SearchOutlined, EyeOutlined,
  ExclamationCircleOutlined, SettingOutlined, DownOutlined,
} from '@ant-design/icons-vue'
import {
  getExpenseClaims, getClaimTypes, createExpenseClaim,
  deleteExpenseClaim, submitExpenseClaim, approveExpenseClaim,
  rejectExpenseClaim, withdrawExpenseClaim, reverseExpenseClaim,
  checkWorkflowActive,
} from '@/api/finance/expenseClaim'
import { getActiveDepartments } from '@/api/system/department'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'

defineOptions({ name: 'ExpenseClaimList' })

const router = useRouter()

const APPROVAL_STATUS_OPTIONS = ['草稿', '待审批', '审批中', '已审批', '已驳回', '已撤回']
const CLAIM_TYPE_OPTIONS = ref<string[]>([])
const departmentList = ref<{ id: number; dept_name: string }[]>([])

interface ExpenseClaim {
  id?: number
  claim_number?: string
  claim_date?: string
  claim_type?: string
  applicant_name?: string
  department?: string
  total_amount?: number
  advance_amount?: number
  approval_status?: string
  current_step?: number
  purpose?: string
}

const filterStatus = ref<string | undefined>(undefined)
const filterClaimType = ref<string | undefined>(undefined)

const fetchListWrapper = (params: any) => {
  const merged: any = { ...params }
  if (filterStatus.value) merged.approval_status = filterStatus.value
  if (filterClaimType.value) merged.claim_type = filterClaimType.value
  return getExpenseClaims(merged)
}

const {
  loading, dataSource, searchText, pagination, fetchData,
  handleTableChange, handleSearch,
} = useTableList<ExpenseClaim>(fetchListWrapper)

// 重置时额外清除筛选条件
const handleReset = () => {
  filterStatus.value = undefined
  filterClaimType.value = undefined
  searchText.value = ''
  pagination.current = 1
  fetchData()
}

// 列定义
const defaultDataColumns: any[] = [
  { title: '报销单号', dataIndex: 'claim_number', key: 'claim_number', width: 160, resizable: true },
  { title: '报销日期', dataIndex: 'claim_date', key: 'claim_date', width: 120, resizable: true },
  { title: '类型', dataIndex: 'claim_type', key: 'claim_type', width: 100, resizable: true },
  { title: '申请人', dataIndex: 'applicant_name', key: 'applicant_name', width: 100, resizable: true },
  { title: '部门', dataIndex: 'department', key: 'department', width: 120, resizable: true },
  { title: '总额', dataIndex: 'total_amount', key: 'total_amount', width: 120, resizable: true, align: 'right' as const },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true },
  { title: '当前步骤', dataIndex: 'current_step', key: 'current_step', width: 100, resizable: true },
  { title: '事由', dataIndex: 'purpose', key: 'purpose', width: 200, resizable: true, ellipsis: true },
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting,
  resetColumnSetting, loadColumnPreference, handleResizeColumn,
} = useColumnPreference('expense_claim_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 200, fixed: 'right' as const }],
})

// 新建弹窗
const createModalVisible = ref(false)
const createForm = ref({
  claim_type: '差旅费',
  department: '',
  purpose: '',
  advance_amount: 0,
  remark: '',
})

const resetCreateForm = () => {
  createForm.value = {
    claim_type: '差旅费',
    department: '',
    purpose: '',
    advance_amount: 0,
    remark: '',
  }
}

const handleCreateOk = async () => {
  if (!createForm.value.claim_type) { message.error('请选择报销类型'); return }
  try {
    const res: any = await createExpenseClaim(createForm.value)
    if (res?.success) {
      message.success('创建成功')
      createModalVisible.value = false
      resetCreateForm()
      if (res.data?.id) {
        try { await router.push(`/expense-claims/${res.data.id}`) } catch { fetchData() }
      } else {
        fetchData()
      }
    } else {
      message.error(res?.message || '创建失败')
    }
  } catch (err: any) {
    message.error(err?.response?.data?.message || '创建失败')
  }
}

const handleView = (record: ExpenseClaim) => {
  router.push(`/expense-claims/${record.id}`)
}

// 审批操作
const handleSubmit = (record: ExpenseClaim) => {
  Modal.confirm({
    title: '确认提交',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定提交报销单「${record.claim_number}」进行审批？`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await submitExpenseClaim(record.id!)
        if (res?.success) { message.success('提交成功'); fetchData() }
        else { message.error(res?.message || '提交失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '提交失败')
      }
    },
  })
}

const handleApprove = (record: ExpenseClaim) => {
  let remark = ''
  Modal.confirm({
    title: '审批通过',
    icon: createVNode(ExclamationCircleOutlined),
    content: () => {
      return [
        createVNode('p', null, `确定通过报销单「${record.claim_number}」的审批？`),
        createVNode('textarea', {
          placeholder: '审批意见（可选）',
          style: 'width:100%;margin-top:8px;padding:4px 8px;border:1px solid #d9d9d9;border-radius:4px;min-height:60px',
          onInput: (e: Event) => { remark = (e.target as HTMLTextAreaElement).value },
        }),
      ]
    },
    okText: '确认通过', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await approveExpenseClaim(record.id!, { remark })
        if (res?.success) { message.success('审批通过'); fetchData() }
        else { message.error(res?.message || '审批失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '审批失败')
      }
    },
  })
}

const handleReject = (record: ExpenseClaim) => {
  let remark = ''
  Modal.confirm({
    title: '驳回',
    icon: createVNode(ExclamationCircleOutlined),
    content: () => {
      return [
        createVNode('p', null, `确定驳回报销单「${record.claim_number}」？`),
        createVNode('textarea', {
          placeholder: '驳回原因（可选）',
          style: 'width:100%;margin-top:8px;padding:4px 8px;border:1px solid #d9d9d9;border-radius:4px;min-height:60px',
          onInput: (e: Event) => { remark = (e.target as HTMLTextAreaElement).value },
        }),
      ]
    },
    okText: '确认驳回', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await rejectExpenseClaim(record.id!, { remark })
        if (res?.success) { message.success('已驳回'); fetchData() }
        else { message.error(res?.message || '驳回失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '驳回失败')
      }
    },
  })
}

const handleWithdraw = (record: ExpenseClaim) => {
  Modal.confirm({
    title: '确认撤回',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定撤回报销单「${record.claim_number}」？撤回后变为草稿状态。`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await withdrawExpenseClaim(record.id!)
        if (res?.success) { message.success('已撤回'); fetchData() }
        else { message.error(res?.message || '撤回失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '撤回失败')
      }
    },
  })
}

const handleReverse = (record: ExpenseClaim) => {
  let remark = ''
  Modal.confirm({
    title: '反审',
    icon: createVNode(ExclamationCircleOutlined),
    content: () => {
      return [
        createVNode('p', null, `确定对报销单「${record.claim_number}」进行反审？反审后变为草稿状态。`),
        createVNode('textarea', {
          placeholder: '反审原因（可选）',
          style: 'width:100%;margin-top:8px;padding:4px 8px;border:1px solid #d9d9d9;border-radius:4px;min-height:60px',
          onInput: (e: Event) => { remark = (e.target as HTMLTextAreaElement).value },
        }),
      ]
    },
    okText: '确认反审', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await reverseExpenseClaim(record.id!, { remark })
        if (res?.success) { message.success('反审成功'); fetchData() }
        else { message.error(res?.message || '反审失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '反审失败')
      }
    },
  })
}

const handleDelete = (record: ExpenseClaim) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除报销单「${record.claim_number}」吗？仅草稿状态可删除。`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await deleteExpenseClaim(record.id!)
        if (res?.success) { message.success('删除成功'); fetchData() }
        else { message.error(res?.message || '删除失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '删除失败')
      }
    },
  })
}

const statusColor = (s?: string) => {
  const map: Record<string, string> = {
    '草稿': 'default',
    '待审批': 'orange',
    '审批中': 'processing',
    '已审批': 'success',
    '已驳回': 'error',
    '已撤回': 'warning',
  }
  return map[s || ''] || 'default'
}

const canSubmit = (s?: string) => s === '草稿' || s === '已驳回'
const canApprove = (s?: string) => s === '待审批' || s === '审批中'
const canReject = (s?: string) => s === '待审批' || s === '审批中'
const canWithdraw = (s?: string) => s === '待审批' || s === '审批中'
const canReverse = (s?: string) => s === '已审批'
const canDelete = (s?: string) => s === '草稿'

const fetchClaimTypes = async () => {
  try {
    const res: any = await getClaimTypes()
    if (res?.success) {
      CLAIM_TYPE_OPTIONS.value = res.data?.claim_types || []
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
  loadColumnPreference()
  fetchData()
  fetchClaimTypes()
  loadDepartments()
})
</script>

<template>
  <div>
    <a-card :bordered="false">
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
        <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">报销单管理</span>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
          <a-input
            v-model:value="searchText" placeholder="单号/申请人/事由" allow-clear
            style="width: 200px" @pressEnter="handleSearch"
          />
          <a-select
            v-model:value="filterStatus" placeholder="审批状态" allow-clear
            style="width: 120px" @change="handleSearch"
          >
            <a-select-option v-for="s in APPROVAL_STATUS_OPTIONS" :key="s" :value="s">{{ s }}</a-select-option>
          </a-select>
          <a-select
            v-model:value="filterClaimType" placeholder="报销类型" allow-clear
            style="width: 120px" @change="handleSearch"
          >
            <a-select-option v-for="t in CLAIM_TYPE_OPTIONS" :key="t" :value="t">{{ t }}</a-select-option>
          </a-select>
          <a-button type="primary" @click="handleSearch">
            <template #icon><SearchOutlined /></template>搜索
          </a-button>
          <a-button @click="handleReset">
            <template #icon><ReloadOutlined /></template>重置
          </a-button>
          <a-button @click="openColumnSetting">
            <template #icon><SettingOutlined /></template>列设置
          </a-button>
          <a-button type="primary" @click="createModalVisible = true">
            <template #icon><PlusOutlined /></template>新建
          </a-button>
        </div>
      </div>

      <a-table
        :columns="columns" :data-source="dataSource" :loading="loading"
        :row-key="(record: ExpenseClaim) => record.id!"
        :pagination="pagination" :scroll="{ x: 'max-content' }"
        @change="handleTableChange" @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'claim_date'">
            {{ record.claim_date ? String(record.claim_date).slice(0, 10) : '-' }}
          </template>
          <template v-else-if="column.key === 'total_amount'">
            {{ record.total_amount != null ? Number(record.total_amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00' }}
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="statusColor(record.approval_status)">{{ record.approval_status || '-' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'current_step'">
            {{ record.current_step > 0 ? `第${record.current_step}步` : '-' }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleView(record)">
                <template #icon><EyeOutlined /></template>查看
              </a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>
                  更多<DownOutlined style="font-size: 10px; margin-left: 2px" />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="canSubmit(record.approval_status)" @click="handleSubmit(record)">提交审批</a-menu-item>
                    <a-menu-item v-if="canApprove(record.approval_status)" @click="handleApprove(record)">审批通过</a-menu-item>
                    <a-menu-item v-if="canReject(record.approval_status)" @click="handleReject(record)">驳回</a-menu-item>
                    <a-menu-item v-if="canWithdraw(record.approval_status)" @click="handleWithdraw(record)">撤回</a-menu-item>
                    <a-menu-item v-if="canReverse(record.approval_status)" @click="handleReverse(record)">反审</a-menu-item>
                    <a-menu-divider v-if="canDelete(record.approval_status)" />
                    <a-menu-item v-if="canDelete(record.approval_status)" danger @click="handleDelete(record)">删除</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新建弹窗 -->
    <a-modal
      v-model:open="createModalVisible" title="新建报销单"
      width="600px" @ok="handleCreateOk" okText="创建" cancelText="取消"
      @cancel="resetCreateForm"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="报销类型" required>
          <a-select v-model:value="createForm.claim_type" placeholder="请选择报销类型">
            <a-select-option v-for="t in CLAIM_TYPE_OPTIONS" :key="t" :value="t">{{ t }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="部门">
          <a-select v-model:value="createForm.department" placeholder="请选择部门" allowClear>
            <a-select-option v-for="dept in departmentList" :key="dept.id" :value="dept.dept_name" :label="dept.dept_name">{{ dept.dept_name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="事由">
          <a-textarea v-model:value="createForm.purpose" :rows="2" />
        </a-form-item>
        <a-form-item label="预支金额">
          <a-input-number v-model:value="createForm.advance_amount" :min="0" :precision="2" style="width: 100%" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="createForm.remark" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>

    <ColumnSettingDrawer
      :open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @update:open="columnSettingVisible = $event"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
</style>
