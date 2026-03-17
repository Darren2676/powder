<script setup lang="ts">
import { ref, reactive, computed, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, DownloadOutlined, UploadOutlined, ImportOutlined, HistoryOutlined } from '@ant-design/icons-vue'
import { getTasks, createTask, updateTask, deleteTask, exportTasks, importTasks, importFromPlan } from '@/api/task'
import { getItems } from '@/api/itemMaster'
import { getPlans } from '@/api/plan'
import { useAuthStore } from '@/store/auth'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ApprovalActions from '@/components/Common/ApprovalActions.vue'
import ApprovalLogModal from '@/components/Common/ApprovalLogModal.vue'
import dayjs from 'dayjs'

interface Task {
  production_task_number: string
  production_number: string
  item_number: string
  item_name: string
  basic_unit: string
  specifications: string
  product_drawing_number: string
  rubber_compound_number: string
  batch_production_quota: string
  planned_quantity: number
  planned_completion_time: string | null
  plan_status: string
  remark: string
  approval_status: string
}

interface Product {
  item_number: string
  item_name: string
  basic_unit: string
  specifications: string
  product_drawing_number: string
  rubber_compound_number: string
  batch_production_quota: string
}

const loading = ref(false)
const dataSource = ref<Task[]>([])
const searchText = ref('')
const selectedRowKeys = ref<string[]>([])
const activeStatus = ref('')
const authStore = useAuthStore()
const approvalFilter = ref('')
const approvalLogVisible = ref(false)
const approvalLogRecordId = ref('')

const statusTabs = [
  { key: '', label: '全部' },
  { key: '未开始', label: '未开始' },
  { key: '已派发', label: '已派发' },
  { key: '已备料', label: '已备料' },
  { key: '生产中', label: '生产中' },
  { key: '已完成', label: '已完成' }
]

const rowSelection = {
  selectedRowKeys,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}

const emptyForm = (): Task => ({
  production_task_number: '',
  production_number: '',
  item_number: '',
  item_name: '',
  basic_unit: '',
  specifications: '',
  product_drawing_number: '',
  rubber_compound_number: '',
  batch_production_quota: '',
  planned_quantity: 0,
  planned_completion_time: null,
  plan_status: '未开始',
  remark: '',
  approval_status: '草稿'
})

// 编辑弹窗
const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<Task>(emptyForm())
const editDate = ref<any>(null)

// 新建弹窗
const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<Task>(emptyForm())
const createDate = ref<any>(null)

// 产品搜索
const productOptions = ref<Product[]>([])
const productSearchLoading = ref(false)

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const columns = [
  { title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const },
  { title: '生产任务单编号', dataIndex: 'production_task_number', key: 'production_task_number' },
  { title: '生产计划编号', dataIndex: 'production_number', key: 'production_number' },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number' },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name' },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit' },
  { title: '规格', dataIndex: 'specifications', key: 'specifications' },
  { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number' },
  { title: '胶料编号', dataIndex: 'rubber_compound_number', key: 'rubber_compound_number' },
  { title: '班产定额', dataIndex: 'batch_production_quota', key: 'batch_production_quota' },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity' },
  { title: '计划完成时间', dataIndex: 'planned_completion_time', key: 'planned_completion_time' },
  { title: '状态', dataIndex: 'plan_status', key: 'plan_status' },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
  { title: '操作', key: 'action', width: 280, fixed: 'right' as const }
]

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getTasks({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined,
      status: activeStatus.value || undefined,
      approval_status: approvalFilter.value || undefined
    })
    if (res.success) {
      dataSource.value = res.data.items
      pagination.total = res.data.pagination.total
    }
  } catch {
    message.error('获取任务数据失败')
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => { searchText.value = ''; activeStatus.value = ''; approvalFilter.value = ''; pagination.current = 1; fetchData() }
const handleStatusChange = (key: string) => { activeStatus.value = key; pagination.current = 1; fetchData() }

// 新建
const handleCreate = () => {
  Object.assign(createForm, emptyForm())
  createDate.value = null
  productOptions.value = []
  createModalVisible.value = true
}

// 产品搜索（AutoComplete）
let searchTimer: any = null
const handleProductSearch = (searchValue: string) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!searchValue) { productOptions.value = []; return }
  searchTimer = setTimeout(async () => {
    productSearchLoading.value = true
    try {
      const res = await getItems({ item_type: '成品', search: searchValue, limit: 20 })
      if (res.success) productOptions.value = res.data.items
    } catch { productOptions.value = [] }
    finally { productSearchLoading.value = false }
  }, 300)
}

const productAutoOptions = computed(() =>
  productOptions.value.map(p => ({
    value: p.item_number,
    label: p.item_number + ' - ' + p.item_name
  }))
)

const fillProductInfo = (product: Product) => {
  createForm.item_number = product.item_number
  createForm.item_name = product.item_name
  createForm.basic_unit = product.basic_unit?.trim() || ''
  createForm.specifications = product.specifications?.trim() || ''
  createForm.product_drawing_number = product.product_drawing_number?.trim() || ''
  createForm.rubber_compound_number = product.rubber_compound_number?.trim() || ''
  createForm.batch_production_quota = product.batch_production_quota?.trim() || ''
}

const handleProductAutoSelect = (value: string) => {
  const product = productOptions.value.find(p => p.item_number === value)
  if (product) fillProductInfo(product)
}

const handleProductAutoChange = (value: string) => {
  const product = productOptions.value.find(p => p.item_number === value)
  if (!product) {
    createForm.item_name = ''
    createForm.basic_unit = ''
    createForm.specifications = ''
    createForm.product_drawing_number = ''
    createForm.rubber_compound_number = ''
    createForm.batch_production_quota = ''
  }
}

const handleCreateSubmit = async () => {
  if (!createForm.item_number) { message.warning('请选择产品'); return }
  createLoading.value = true
  try {
    const data = {
      ...createForm,
      planned_completion_time: createDate.value ? dayjs(createDate.value).format('YYYY-MM-DD') : null
    }
    const res = await createTask(data)
    if (res.success) { message.success('新建成功'); createModalVisible.value = false; fetchData() }
    else { message.error(res.message || '新建失败') }
  } catch { message.error('新建失败') }
  finally { createLoading.value = false }
}

// 编辑
const handleEdit = (record: Task) => {
  Object.assign(editForm, record)
  editDate.value = record.planned_completion_time ? dayjs(record.planned_completion_time) : null
  editModalVisible.value = true
}

const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const data = {
      ...editForm,
      planned_completion_time: editDate.value ? dayjs(editDate.value).format('YYYY-MM-DD') : null
    }
    const res = await updateTask(editForm.production_task_number, data)
    if (res.success) { message.success('修改成功'); editModalVisible.value = false; fetchData() }
    else { message.error(res.message || '修改失败') }
  } catch { message.error('修改失败') }
  finally { editLoading.value = false }
}

// 删除
const handleDelete = (record: Task) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除任务 "${record.production_task_number}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteTask(record.production_task_number)
        if (res.success) { message.success('删除成功'); fetchData() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

const formatDate = (date: string | null) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}

const fileInputRef = ref<HTMLInputElement>()

const handleExport = async () => {
  try {
    const res = await exportTasks(searchText.value || undefined)
    const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'tasks.xlsx'
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

const handleImportClick = () => { fileInputRef.value?.click() }

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await importTasks(formData)
    if (res.success) { message.success(res.message || '导入成功'); fetchData() }
    else { message.error(res.message || '导入失败') }
  } catch { message.error('导入失败') }
  finally { target.value = '' }
}

// 从计划导入
const planModalVisible = ref(false)
const planLoading = ref(false)
const planDataSource = ref<any[]>([])
const planSearchText = ref('')
const planSelectedRowKeys = ref<string[]>([])
const planImportLoading = ref(false)

const planRowSelection = {
  selectedRowKeys: planSelectedRowKeys,
  onChange: (keys: string[]) => { planSelectedRowKeys.value = keys }
}

const planPagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条记录`
})

const planColumns = [
  { title: '行号', key: 'planRowIndex', width: 60 },
  { title: '生产计划编号', dataIndex: 'production_number', key: 'production_number' },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number' },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name' },
  { title: '规格', dataIndex: 'specifications', key: 'specifications' },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity' },
  { title: '计划完成时间', dataIndex: 'planned_completion_time', key: 'planned_completion_time' },
  { title: '状态', dataIndex: 'plan_status', key: 'plan_status' }
]

const fetchPlanData = async () => {
  planLoading.value = true
  try {
    const res = await getPlans({
      page: planPagination.current,
      limit: planPagination.pageSize,
      search: planSearchText.value || undefined
    })
    if (res.success) {
      planDataSource.value = res.data.items
      planPagination.total = res.data.pagination.total
    }
  } catch { message.error('获取计划列表失败') }
  finally { planLoading.value = false }
}

const handlePlanTableChange = (pag: any) => {
  planPagination.current = pag.current
  planPagination.pageSize = pag.pageSize
  fetchPlanData()
}

const handlePlanSearch = () => { planPagination.current = 1; fetchPlanData() }

const handleOpenPlanModal = () => {
  planSelectedRowKeys.value = []
  planSearchText.value = ''
  planPagination.current = 1
  planModalVisible.value = true
  fetchPlanData()
}

const handleImportFromPlan = async () => {
  if (planSelectedRowKeys.value.length === 0) {
    message.warning('请先勾选要导入的计划')
    return
  }
  planImportLoading.value = true
  try {
    const res = await importFromPlan(planSelectedRowKeys.value)
    if (res.success) {
      message.success(res.message || '导入成功')
      planModalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '导入失败')
    }
  } catch { message.error('从计划导入失败') }
  finally { planImportLoading.value = false }
}

onMounted(() => { fetchData() })
</script>

<template>
  <div class="task-page">
    <a-card title="生产任务单" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索任务编号/计划编号/产品编号/名称"
            style="width: 300px"
            allow-clear
            @search="handleSearch"
            @pressEnter="handleSearch"
          />
          <a-select v-model:value="approvalFilter" placeholder="审批状态" allow-clear style="width: 120px" @change="handleSearch">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="草稿">草稿</a-select-option>
            <a-select-option value="待审批">待审批</a-select-option>
            <a-select-option value="已审批">已审批</a-select-option>
          </a-select>
          <a-button @click="handleReset">
            <template #icon><ReloadOutlined /></template>
            重置
          </a-button>
          <a-button @click="handleExport">
            <template #icon><DownloadOutlined /></template>
            导出
          </a-button>
          <a-button @click="handleImportClick">
            <template #icon><UploadOutlined /></template>
            导入
          </a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
          <a-button @click="handleOpenPlanModal">
            <template #icon><ImportOutlined /></template>
            从计划导入
          </a-button>
          <a-button type="primary" @click="handleCreate">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
        </a-space>
      </template>

      <a-tabs v-model:activeKey="activeStatus" @change="handleStatusChange" style="margin-bottom: 16px;">
        <a-tab-pane v-for="tab in statusTabs" :key="tab.key" :tab="tab.label" />
      </a-tabs>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 'max-content' }"
        :row-selection="rowSelection"
        row-key="production_task_number"
        size="middle"
        bordered
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'planned_completion_time'">
            {{ formatDate(record.planned_completion_time) }}
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <ApprovalStatusTag :status="record.approval_status" />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="2">
              <a-button type="link" size="small" :disabled="record.approval_status !== '草稿'" @click="handleEdit(record)">
                <template #icon><EditOutlined /></template>
                修改
              </a-button>
              <a-button type="link" danger size="small" :disabled="record.approval_status !== '草稿'" @click="handleDelete(record)">
                <template #icon><DeleteOutlined /></template>
                删除
              </a-button>
              <ApprovalActions module="production_task" :record-id="record.production_task_number" :approval-status="record.approval_status || '草稿'" @status-changed="fetchData" />
              <a-button type="link" size="small" @click="approvalLogRecordId = record.production_task_number; approvalLogVisible = true">
                <template #icon><HistoryOutlined /></template>
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 编辑弹窗 -->
    <a-modal v-model:open="editModalVisible" title="修改任务" :confirm-loading="editLoading" @ok="handleEditSubmit" width="600px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="生产任务单编号">
          <a-input v-model:value="editForm.production_task_number" disabled />
        </a-form-item>
        <a-form-item label="生产计划编号">
          <a-input v-model:value="editForm.production_number" />
        </a-form-item>
        <a-form-item label="产品编号">
          <a-input v-model:value="editForm.item_number" disabled />
        </a-form-item>
        <a-form-item label="产品名称">
          <a-input v-model:value="editForm.item_name" disabled />
        </a-form-item>
        <a-form-item label="单位">
          <a-input v-model:value="editForm.basic_unit" disabled />
        </a-form-item>
        <a-form-item label="规格">
          <a-input v-model:value="editForm.specifications" disabled />
        </a-form-item>
        <a-form-item label="产品图号">
          <a-input v-model:value="editForm.product_drawing_number" disabled />
        </a-form-item>
        <a-form-item label="胶料编号">
          <a-input v-model:value="editForm.rubber_compound_number" disabled />
        </a-form-item>
        <a-form-item label="班产定额">
          <a-input v-model:value="editForm.batch_production_quota" disabled />
        </a-form-item>
        <a-form-item label="计划数量">
          <a-input-number v-model:value="editForm.planned_quantity" :min="0" style="width: 100%" />
        </a-form-item>
        <a-form-item label="计划完成时间">
          <a-date-picker v-model:value="editDate" style="width: 100%" />
        </a-form-item>
        <a-form-item label="状态">
          <a-select v-model:value="editForm.plan_status">
            <a-select-option value="未开始">未开始</a-select-option>
            <a-select-option value="已派发">已派发</a-select-option>
            <a-select-option value="已备料">已备料</a-select-option>
            <a-select-option value="生产中">生产中</a-select-option>
            <a-select-option value="已完成">已完成</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="editForm.remark" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建弹窗 -->
    <a-modal v-model:open="createModalVisible" title="新建任务" :confirm-loading="createLoading" @ok="handleCreateSubmit" width="600px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="生产计划编号">
          <a-input v-model:value="createForm.production_number" placeholder="请输入生产计划编号" />
        </a-form-item>
        <a-form-item label="产品编号" required>
          <a-auto-complete
            v-model:value="createForm.item_number"
            :options="productAutoOptions"
            placeholder="输入产品编号或名称搜索"
            @search="handleProductSearch"
            @select="handleProductAutoSelect"
            @change="handleProductAutoChange"
          />
        </a-form-item>
        <a-form-item label="产品名称">
          <a-input v-model:value="createForm.item_name" disabled />
        </a-form-item>
        <a-form-item label="单位">
          <a-input v-model:value="createForm.basic_unit" disabled />
        </a-form-item>
        <a-form-item label="规格">
          <a-input v-model:value="createForm.specifications" disabled />
        </a-form-item>
        <a-form-item label="产品图号">
          <a-input v-model:value="createForm.product_drawing_number" disabled />
        </a-form-item>
        <a-form-item label="胶料编号">
          <a-input v-model:value="createForm.rubber_compound_number" disabled />
        </a-form-item>
        <a-form-item label="班产定额">
          <a-input v-model:value="createForm.batch_production_quota" disabled />
        </a-form-item>
        <a-form-item label="计划数量">
          <a-input-number v-model:value="createForm.planned_quantity" :min="0" style="width: 100%" placeholder="请输入计划数量" />
        </a-form-item>
        <a-form-item label="计划完成时间">
          <a-date-picker v-model:value="createDate" style="width: 100%" placeholder="请选择计划完成时间" />
        </a-form-item>
        <a-form-item label="状态">
          <a-select v-model:value="createForm.plan_status" placeholder="请选择状态">
            <a-select-option value="未开始">未开始</a-select-option>
            <a-select-option value="已派发">已派发</a-select-option>
            <a-select-option value="已备料">已备料</a-select-option>
            <a-select-option value="生产中">生产中</a-select-option>
            <a-select-option value="已完成">已完成</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="createForm.remark" :rows="3" placeholder="请输入备注" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 从计划导入弹窗 -->
    <a-modal
      v-model:open="planModalVisible"
      title="从计划导入"
      width="900px"
      :footer="null"
    >
      <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
        <a-input-search
          v-model:value="planSearchText"
          placeholder="搜索计划编号/产品编号/名称"
          style="width: 300px"
          allow-clear
          @search="handlePlanSearch"
          @pressEnter="handlePlanSearch"
        />
        <a-button type="primary" :loading="planImportLoading" @click="handleImportFromPlan">
          <template #icon><ImportOutlined /></template>
          导入选中 ({{ planSelectedRowKeys.length }})
        </a-button>
      </div>
      <a-table
        :columns="planColumns"
        :data-source="planDataSource"
        :loading="planLoading"
        :pagination="planPagination"
        :row-selection="planRowSelection"
        row-key="production_number"
        size="small"
        bordered
        @change="handlePlanTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'planRowIndex'">
            {{ (planPagination.current - 1) * planPagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'planned_completion_time'">
            {{ formatDate(record.planned_completion_time) }}
          </template>
        </template>
      </a-table>
    </a-modal>

    <!-- 审批日志弹窗 -->
    <ApprovalLogModal v-model:open="approvalLogVisible" module="production_task" :record-id="approvalLogRecordId" />
  </div>
</template>

<style scoped>
.task-page {
  padding: 0;
}
</style>
