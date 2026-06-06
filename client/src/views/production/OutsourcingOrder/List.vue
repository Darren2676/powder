<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
      <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">工序委外管理</span>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
        <a-input-search v-model:value="searchText" placeholder="搜索订单号/生产单/供应商/产品/工序" style="width: 360px" allow-clear @search="fetchList" @pressEnter="fetchList" />
        <a-select v-model:value="approvalFilter" placeholder="审批状态" style="width: 120px" allow-clear @change="fetchList">
          <a-select-option value="">全部</a-select-option>
          <a-select-option value="草稿">草稿</a-select-option>
          <a-select-option value="待审批">待审批</a-select-option>
          <a-select-option value="已审批">已审批</a-select-option>
        </a-select>
        <a-select v-model:value="statusFilter" placeholder="执行状态" style="width: 120px" allow-clear @change="fetchList">
          <a-select-option value="">全部</a-select-option>
          <a-select-option value="待发出">待发出</a-select-option>
          <a-select-option value="已发出">已发出</a-select-option>
          <a-select-option value="部分收回">部分收回</a-select-option>
          <a-select-option value="已完成">已完成</a-select-option>
          <a-select-option value="已关闭">已关闭</a-select-option>
        </a-select>
        <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>新建委外订单</a-button>
        <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
      </div>
    </div>

      <a-table
        :columns="columns" :data-source="tableData" :loading="loading"
        :pagination="{ current: page, pageSize: limit, total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }"
        @change="handleTableChange"
        :scroll="{ x: 2200 }" row-key="outsourcing_order_number" size="small" bordered
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'approval_status'">
            <a-tag :color="record.approval_status === '已审批' ? 'green' : record.approval_status === '待审批' ? 'orange' : 'default'">{{ record.approval_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'order_status'">
            <a-tag :color="statusColor(record.order_status)">{{ record.order_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="0" wrap>
              <a-button type="link" size="small" @click="handleView(record)">查看</a-button>
              <a-button v-if="record.approval_status === '草稿'" type="link" size="small" @click="handleEdit(record)">编辑</a-button>
              <a-button v-if="record.approval_status === '草稿'" type="link" size="small" danger @click="handleDelete(record)">删除</a-button>
              <a-button v-if="record.approval_status === '草稿'" type="link" size="small" @click="handleSubmit(record)">提交</a-button>
              <a-button v-if="record.approval_status === '待审批'" type="link" size="small" style="color: green" @click="handleApprove(record)">审批</a-button>
              <a-button v-if="record.approval_status === '待审批'" type="link" size="small" @click="handleWithdraw(record)">撤回</a-button>
              <a-button v-if="record.approval_status === '已审批'" type="link" size="small" @click="handleReverse(record)">反审</a-button>
              <a-button v-if="record.approval_status === '已审批' && record.order_status === '待发出'" type="link" size="small" style="color: #1890ff" @click="handleSendOut(record)">发出</a-button>
              <a-button v-if="record.order_status === '已发出' || record.order_status === '部分收回'" type="link" size="small" style="color: #52c41a" @click="openReceipt(record)">收货</a-button>
              <a-button v-if="record.order_status !== '已关闭' && record.order_status !== '已完成'" type="link" size="small" style="color: #faad14" @click="handleClose(record)">关闭</a-button>
            </a-space>
          </template>
        </template>
      </a-table>

    <!-- 新建/编辑弹窗 -->
    <a-modal v-model:open="formVisible" :title="formMode === 'create' ? '新建委外订单' : formMode === 'edit' ? '编辑委外订单' : '查看委外订单'" :footer="formMode === 'view' ? null : undefined" @ok="handleFormOk" okText="确认" cancelText="取消" width="700px">
      <a-form :label-col="{ span: 7 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="24" v-if="formMode === 'create'">
            <a-form-item label="工序任务号" :label-col="{ span: 4 }" :wrapper-col="{ span: 19 }">
              <a-select v-model:value="form.process_task_number" show-search allow-clear placeholder="选择委外工序任务"
                :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())"
                :options="outsourcedTasks" @change="onTaskSelect" />
            </a-form-item>
          </a-col>
          <a-col :span="24" v-else>
            <a-form-item label="委外订单号" :label-col="{ span: 4 }" :wrapper-col="{ span: 19 }">
              <a-input :value="form.outsourcing_order_number" disabled />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="生产单号"><a-input :value="form.production_order_number" disabled /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工序名称"><a-input :value="form.standard_process_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="产品编号"><a-input :value="form.item_number" disabled /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="产品名称"><a-input :value="form.item_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="规格"><a-input :value="form.specifications" disabled /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="计划数量"><a-input-number :value="form.planned_quantity" disabled style="width: 100%" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="供应商">
              <a-select v-model:value="form.supplier_number" show-search allow-clear placeholder="请选择供应商" :disabled="formMode === 'view'"
                :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())"
                :options="supplierOptions" @change="onSupplierChange" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="供应商名称"><a-input :value="form.supplier_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="加工单价"><a-input-number v-model:value="form.unit_price" :min="0" :precision="4" style="width: 100%" :disabled="formMode === 'view'" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="预计回货日期"><a-input v-model:value="form.expected_return_date" placeholder="YYYY/MM/DD" :disabled="formMode === 'view'" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24"><a-form-item label="备注" :label-col="{ span: 4 }" :wrapper-col="{ span: 19 }"><a-textarea v-model:value="form.remark" :rows="2" :disabled="formMode === 'view'" /></a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- 收货确认弹窗 -->
    <a-modal v-model:open="receiptVisible" title="收货确认" @ok="handleReceiptOk" okText="确认收货" cancelText="取消" width="500px">
      <a-descriptions :column="1" bordered size="small" style="margin-bottom: 16px">
        <a-descriptions-item label="委外订单号">{{ receiptOrder.outsourcing_order_number }}</a-descriptions-item>
        <a-descriptions-item label="工序名称">{{ receiptOrder.standard_process_name }}</a-descriptions-item>
        <a-descriptions-item label="产品">{{ receiptOrder.item_number }} {{ receiptOrder.item_name }}</a-descriptions-item>
        <a-descriptions-item label="计划数量">{{ receiptOrder.planned_quantity }}</a-descriptions-item>
        <a-descriptions-item label="已收回数量">{{ receiptOrder.received_quantity }}</a-descriptions-item>
      </a-descriptions>
      <a-form-item label="本次收货数量" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-input-number v-model:value="receiptQty" :min="0.0001" :precision="4" style="width: 100%" placeholder="输入收货数量" />
      </a-form-item>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, DownloadOutlined } from '@ant-design/icons-vue'
import { getOutsourcingOrders, getOutsourcingOrderDetail, createOutsourcingOrder, updateOutsourcingOrder, deleteOutsourcingOrder, sendOutOrder, confirmReceipt, closeOutsourcingOrder, exportOutsourcingOrders } from '@/api/production/outsourcingOrder'
import { submitForApproval, approveRecord, withdrawApproval, reverseApproval } from '@/api/system/approval'
import { getSuppliers } from '@/api/master-data/supplier'
import request from '@/utils/request'
import { useTableList } from '@/composables/useTableList'

const MODULE = 'outsourcing_order'

const approvalFilter = ref('')
const statusFilter = ref('')

const tableData = ref<any[]>([])
const page = ref(1)
const limit = ref(20)
const total = ref(0)

const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getOutsourcingOrders)

const columns = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '委外订单号', dataIndex: 'outsourcing_order_number', key: 'outsourcing_order_number', width: 180, fixed: 'left' as const },
  { title: '工序任务号', dataIndex: 'process_task_number', key: 'process_task_number', width: 160 },
  { title: '生产单号', dataIndex: 'production_order_number', key: 'production_order_number', width: 160 },
  { title: '工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 120 },
  { title: '工序序号', dataIndex: 'step_number', key: 'step_number', width: 80 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
  { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', width: 140 },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 100 },
  { title: '已收回', dataIndex: 'received_quantity', key: 'received_quantity', width: 100 },
  { title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 90 },
  { title: '金额', dataIndex: 'total_amount', key: 'total_amount', width: 100 },
  { title: '预计回货', dataIndex: 'expected_return_date', key: 'expected_return_date', width: 120 },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '执行状态', dataIndex: 'order_status', key: 'order_status', width: 100 },
  { title: '操作', key: 'action', width: 350, fixed: 'right' as const }
]

const statusColor = (s: string) => {
  if (s === '已完成') return 'green'
  if (s === '已发出') return 'blue'
  if (s === '部分收回') return 'cyan'
  if (s === '已关闭') return 'default'
  return 'orange'
}

const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getOutsourcingOrders({ page: page.value, limit: limit.value, search: searchText.value, approval_status: approvalFilter.value, order_status: statusFilter.value })
    tableData.value = res.data.items
    total.value = res.data.pagination.total
  } catch { message.error('获取列表失败') }
  loading.value = false
}



// ==================== 供应商 ====================
const supplierOptions = ref<any[]>([])
const supplierMap = ref<Record<string, string>>({})
const loadSuppliers = async () => {
  try {
    const res: any = await getSuppliers({ limit: 9999 })
    const items = res.data?.items || res.data || []
    supplierOptions.value = items.map((s: any) => ({ value: s.supplier_number, label: `${s.supplier_number} - ${s.supplier_name}` }))
    supplierMap.value = {}
    items.forEach((s: any) => { supplierMap.value[s.supplier_number] = s.supplier_name })
  } catch {}
}

// ==================== 委外工序任务 ====================
const outsourcedTasks = ref<any[]>([])
const taskDetailMap = ref<Record<string, any>>({})
const loadOutsourcedTasks = async () => {
  try {
    const res: any = await request.get('/process-tasks', { params: { limit: 9999, is_outsourced: 1 } })
    const items = res.data?.items || res.data || []
    // 过滤掉已存在委外订单的任务
    const [ooRes]: any = await Promise.all([getOutsourcingOrders({ limit: 9999 })])
    const existingPtns = new Set((ooRes.data?.items || []).map((o: any) => o.process_task_number))
    const available = items.filter((t: any) => !existingPtns.has(t.process_task_number))
    outsourcedTasks.value = available.map((t: any) => ({ value: t.process_task_number, label: `${t.process_task_number} - ${t.standard_process_name || ''} (${t.item_number || ''})` }))
    taskDetailMap.value = {}
    available.forEach((t: any) => { taskDetailMap.value[t.process_task_number] = t })
  } catch {}
}

// ==================== 表单 ====================
const formVisible = ref(false)
const formMode = ref<'create' | 'edit' | 'view'>('create')
const form = reactive<any>({
  outsourcing_order_number: '', process_task_number: '',
  production_order_number: '', production_number: '', process_route_number: '',
  step_number: 0, standard_process_number: '', standard_process_name: '',
  work_center_number: '', work_center_name: '',
  item_number: '', item_name: '', specifications: '', basic_unit: '',
  planned_quantity: 0, supplier_number: '', supplier_name: '',
  unit_price: 0, expected_return_date: '', remark: ''
})

const resetForm = () => {
  Object.keys(form).forEach(k => { form[k] = typeof form[k] === 'number' ? 0 : '' })
}

const openCreate = () => {
  resetForm()
  formMode.value = 'create'
  formVisible.value = true
  loadOutsourcedTasks()
}

const onTaskSelect = (val: string) => {
  const task = taskDetailMap.value[val]
  if (task) {
    form.production_order_number = task.production_order_number || ''
    form.production_number = task.production_number || ''
    form.process_route_number = task.process_route_number || ''
    form.step_number = task.step_number || 0
    form.standard_process_number = task.standard_process_number || ''
    form.standard_process_name = task.standard_process_name || ''
    form.work_center_number = task.work_center_number || ''
    form.work_center_name = task.work_center_name || ''
    form.item_number = task.item_number || ''
    form.item_name = task.item_name || ''
    form.specifications = task.specifications || ''
    form.basic_unit = task.basic_unit || ''
    form.planned_quantity = task.planned_quantity || 0
  }
}

const onSupplierChange = (val: string) => {
  form.supplier_name = supplierMap.value[val] || ''
}

const handleView = async (record: any) => {
  try {
    const res: any = await getOutsourcingOrderDetail(record.outsourcing_order_number)
    Object.assign(form, res.data)
    formMode.value = 'view'
    formVisible.value = true
  } catch { message.error('获取详情失败') }
}

const handleEdit = async (record: any) => {
  try {
    const res: any = await getOutsourcingOrderDetail(record.outsourcing_order_number)
    Object.assign(form, res.data)
    formMode.value = 'edit'
    formVisible.value = true
  } catch { message.error('获取详情失败') }
}

const handleFormOk = async () => {
  try {
    if (formMode.value === 'create') {
      await createOutsourcingOrder(form)
      message.success('创建成功')
    } else if (formMode.value === 'edit') {
      await updateOutsourcingOrder(form.outsourcing_order_number, form)
      message.success('更新成功')
    }
    formVisible.value = false
    fetchList()
  } catch { message.error(formMode.value === 'create' ? '创建失败' : '更新失败') }
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除', content: `确定要删除委外订单 ${record.outsourcing_order_number} 吗？`,
    onOk: async () => {
      try { await deleteOutsourcingOrder(record.outsourcing_order_number); message.success('删除成功'); fetchList() } catch { message.error('删除失败') }
    }
  })
}

// ==================== 审批流 ====================
const handleSubmit = async (record: any) => { try { await submitForApproval(MODULE, record.outsourcing_order_number); message.success('提交成功'); fetchList() } catch { message.error('提交失败') } }
const handleApprove = async (record: any) => { try { await approveRecord(MODULE, record.outsourcing_order_number); message.success('审批通过'); fetchList() } catch { message.error('审批失败') } }
const handleWithdraw = async (record: any) => { try { await withdrawApproval(MODULE, record.outsourcing_order_number); message.success('撤回成功'); fetchList() } catch { message.error('撤回失败') } }
const handleReverse = async (record: any) => { try { await reverseApproval(MODULE, record.outsourcing_order_number); message.success('反审成功'); fetchList() } catch { message.error('反审失败') } }

// ==================== 发出 ====================
const handleSendOut = (record: any) => {
  Modal.confirm({
    title: '确认发出', content: `确定要发出委外订单 ${record.outsourcing_order_number} 吗？`,
    onOk: async () => { try { await sendOutOrder(record.outsourcing_order_number); message.success('发出成功'); fetchList() } catch { message.error('发出失败') } }
  })
}

// ==================== 收货确认 ====================
const receiptVisible = ref(false)
const receiptOrder = reactive<any>({})
const receiptQty = ref<number>(0)
const openReceipt = (record: any) => {
  Object.assign(receiptOrder, record)
  receiptQty.value = 0
  receiptVisible.value = true
}
const handleReceiptOk = async () => {
  if (!receiptQty.value || receiptQty.value <= 0) { message.warning('请输入有效的收货数量'); return }
  try {
    await confirmReceipt(receiptOrder.outsourcing_order_number, { received_quantity: receiptQty.value })
    message.success('收货确认成功')
    receiptVisible.value = false
    fetchList()
  } catch { message.error('收货确认失败') }
}

// ==================== 关闭 ====================
const handleClose = (record: any) => {
  Modal.confirm({
    title: '确认关闭', content: `确定要关闭委外订单 ${record.outsourcing_order_number} 吗？关闭后不可再操作。`,
    onOk: async () => { try { await closeOutsourcingOrder(record.outsourcing_order_number); message.success('关闭成功'); fetchList() } catch { message.error('关闭失败') } }
  })
}

// ==================== 导出 ====================
const handleExport = async () => {
  try {
    const res = await exportOutsourcingOrders(searchText.value)
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = url; link.setAttribute('download', 'outsourcing_orders.xlsx'); document.body.appendChild(link); link.click(); document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch { message.error('导出失败') }
}

onMounted(() => {
  fetchList()
  loadSuppliers()
})
</script>

<style scoped>
</style>
