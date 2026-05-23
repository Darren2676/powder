<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ExclamationCircleOutlined, PlusOutlined, DownloadOutlined, UploadOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined, EditOutlined, SettingOutlined, DownOutlined, HistoryOutlined } from '@ant-design/icons-vue'
import { getForecasts, getForecastDetail, createForecast, updateForecast, deleteForecast, getForecastConsumptionLog, exportForecasts, importForecasts } from '@/api/sales/forecast'
import { getCustomers } from '@/api/master-data/customer'
import { getItems } from '@/api/master-data/itemMaster'
import { getCustomerMaterialMappings, reverseLookupProduct } from '@/api/master-data/customerMaterialMapping'
import { reverseApproval } from '@/api/system/approval'
import { startWorkflow, withdrawWorkflow, getInstanceByRecord } from '@/api/system/workflow'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ApprovalLogModal from '@/components/Common/ApprovalLogModal.vue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { useModalDrag } from '@/composables/useModalDrag'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'

// ==================== State ====================



const approvalFilter = ref('')




// 客户和物料选项
const customerOptions = ref<any[]>([])
const itemOptions = ref<any[]>([])

// 导入导出
const fileInputRef = ref<HTMLInputElement>()
const importLoading = ref(false)

// 创建/编辑弹窗
const { loading, dataSource, searchText, pagination, selectedRowKeys, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getForecasts)

const createModalVisible = ref(false)
const editModalVisible = ref(false)
const createLoading = ref(false)
const editLoading = ref(false)
const createForm = reactive<any>({ customer_number: '', customer_name: '', forecast_date: null, remark: '', details: [] })
const editForm = reactive<any>({ forecast_number: '', customer_number: '', customer_name: '', forecast_date: null, remark: '', details: [] })

// 详情弹窗
const detailModalVisible = ref(false)
const detailData = ref<any>(null)
const detailTab = ref('details')
const { modalStyle: detailModalStyle, onDragStart: detailDragStart, resetDrag: detailResetDrag } = useModalDrag()
const { modalStyle: createModalStyle, onDragStart: createDragStart, resetDrag: createResetDrag } = useModalDrag()

// 消耗记录弹窗
const consumptionModalVisible = ref(false)
const consumptionLogs = ref<any[]>([])
const consumptionLoading = ref(false)

// 审批日志弹窗
const approvalLogVisible = ref(false)
const approvalLogModule = ref('')
const approvalLogRecordId = ref('')

// 列设置
const defaultColumns = [
  { title: '预测编号', dataIndex: 'forecast_number', key: 'forecast_number', width: 170, resizable: true },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 160, resizable: true },
  { title: '预测日期', dataIndex: 'forecast_date', key: 'forecast_date', width: 120, resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100, resizable: true },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 120, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('forecast_list', defaultColumns, {
  fixedRight: [{ title: '操作', key: 'action', width: 150, fixed: 'right' as const }]
})

// ==================== Data Loading ====================
const fetchCustomers = async () => {
  try {
    const res: any = await getCustomers({ limit: 9999 })
    if (res?.success) customerOptions.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

const fetchItems = async (search = '') => {
  try {
    const res: any = await getItems({ limit: 50, search, item_type: '成品' })
    if (res?.success) itemOptions.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

onMounted(() => { fetchData(); fetchCustomers(); fetchItems(); loadColumnPreference() })



const onSearch = () => { pagination.current = 1; fetchData() }

// ==================== 导入导出 ====================
const generateExportFilename = (prefix: string) => `${prefix}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.xlsx`

const handleExport = async () => {
  try {
    const res: any = await exportForecasts()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = generateExportFilename('sales_forecasts'); link.click()
    window.URL.revokeObjectURL(url)
  } catch { message.error('导出失败') }
}

const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  importLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res: any = await importForecasts(formData)
    if (res?.success) {
      message.success(res.message || '导入成功')
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '导入失败')
  } finally {
    importLoading.value = false
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
}

// ==================== CRUD ====================
const handleCreate = () => {
  Object.assign(createForm, { customer_number: '', customer_name: '', forecast_date: dayjs().format('YYYY-MM-DD'), remark: '', details: [emptyDetail()] })
  createResetDrag()
  createModalVisible.value = true
}

const emptyDetail = () => ({
  item_number: '', item_name: '', specifications: '', basic_unit: '', product_drawing_number: '',
  start_date: null, end_date: null, forecast_quantity: 0, remark: '',
  customer_item_number: '', customer_item_description: '', status: '未开始'
})

const handleCreateSubmit = async () => {
  if (!createForm.customer_number) { message.warning('请选择客户'); return }
  const validDetails = createForm.details.filter((d: any) => d.item_number && d.forecast_quantity > 0 && d.start_date && d.end_date)
  if (validDetails.length === 0) { message.warning('请至少添加一条有效的预测明细'); return }
  createLoading.value = true
  try {
    const res: any = await createForecast({ ...createForm, details: validDetails })
    if (res?.success) {
      message.success(`创建成功，预测编号: ${res.data?.forecast_number}`)
      createModalVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '创建失败')
  } finally { createLoading.value = false }
}

const handleEdit = async (record: any) => {
  try {
    const res: any = await getForecastDetail(record.forecast_number)
    if (res?.success) {
      const d = res.data
      Object.assign(editForm, {
        forecast_number: d.forecast_number,
        customer_number: d.customer_number,
        customer_name: d.customer_name,
        forecast_date: d.forecast_date ? dayjs(d.forecast_date).format('YYYY-MM-DD') : null,
        remark: d.remark || '',
        details: (d.details || []).map((dd: any) => ({
          ...dd,
          start_date: dd.start_date ? dayjs(dd.start_date).format('YYYY-MM-DD') : null,
          end_date: dd.end_date ? dayjs(dd.end_date).format('YYYY-MM-DD') : null
        }))
      })
      editModalVisible.value = true
    }
  } catch (err: any) { message.error(err.response?.data?.message || '获取详情失败') }
}

const handleEditSubmit = async () => {
  if (!editForm.customer_number) { message.warning('请选择客户'); return }
  const validDetails = editForm.details.filter((d: any) => d.item_number && d.forecast_quantity > 0 && d.start_date && d.end_date)
  if (validDetails.length === 0) { message.warning('请至少添加一条有效的预测明细'); return }
  editLoading.value = true
  try {
    const res: any = await updateForecast(editForm.forecast_number, { ...editForm, details: validDetails })
    if (res?.success) {
      message.success('更新成功')
      editModalVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '更新失败')
  } finally { editLoading.value = false }
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除', content: `确定删除预测单 ${record.forecast_number}？`,
    icon: () => ExclamationCircleOutlined, okType: 'danger', okText: '删除', cancelText: '取消',
    async onOk() {
      try {
        const res: any = await deleteForecast(record.forecast_number)
        if (res?.success) { message.success('删除成功'); fetchData() }
      } catch (err: any) { message.error(err.response?.data?.message || '删除失败') }
    }
  })
}

const handleViewDetail = async (record: any) => {
  try {
    const res: any = await getForecastDetail(record.forecast_number)
    if (res?.success) { detailData.value = res.data; detailTab.value = 'details'; detailResetDrag(); detailModalVisible.value = true }
  } catch (err: any) { message.error(err.response?.data?.message || '获取详情失败') }
}

const handleViewConsumption = async (forecastNumber: string) => {
  consumptionLoading.value = true
  consumptionModalVisible.value = true
  try {
    const res: any = await getForecastConsumptionLog(forecastNumber)
    if (res?.success) consumptionLogs.value = res.data || []
  } catch { consumptionLogs.value = [] }
  finally { consumptionLoading.value = false }
}

// ==================== 明细行操作 ====================
const addDetailRow = (details: any[]) => { details.push(emptyDetail()) }
const removeDetailRow = (details: any[], index: number) => { details.splice(index, 1) }

const onItemSelect = async (itemNumber: string, detail: any, customerNumber: string) => {
  const item = itemOptions.value.find((i: any) => i.item_number === itemNumber)
  if (item) {
    detail.item_name = item.item_name || ''
    detail.specifications = item.specifications || ''
    detail.basic_unit = item.basic_unit || ''
    detail.product_drawing_number = item.product_drawing_number || ''
  }
  // 正向查询客户物料信息
  if (customerNumber && itemNumber) {
    try {
      const res: any = await getCustomerMaterialMappings({ customer_number: customerNumber, item_number: itemNumber, limit: 1 })
      if (res?.success && res.data.items?.length > 0) {
        const cm = res.data.items[0]
        detail.customer_item_number = cm.customer_item_number || ''
        detail.customer_item_description = cm.customer_item_description || ''
      } else {
        detail.customer_item_number = ''
        detail.customer_item_description = ''
      }
    } catch {
      detail.customer_item_number = ''
      detail.customer_item_description = ''
    }
  }
}

// 反向查询：根据客户物料号查找产品
const onCustomerItemNumberChange = async (customerItemNumber: string, detail: any, customerNumber: string) => {
  if (!customerItemNumber || !customerNumber) return
  try {
    const res: any = await reverseLookupProduct({ customer_number: customerNumber, customer_item_number: customerItemNumber })
    if (res?.success && res.data) {
      const product = res.data
      detail.item_number = product.item_number || ''
      detail.item_name = product.item_name || ''
      detail.specifications = product.specifications || ''
      detail.basic_unit = product.basic_unit || ''
      detail.product_drawing_number = product.product_drawing_number || ''
      detail.customer_item_description = product.customer_item_description || ''
    }
  } catch {}
}

const onCustomerSelect = (customerNumber: string, form: any) => {
  const cust = customerOptions.value.find((c: any) => c.customer_number === customerNumber)
  if (cust) form.customer_name = cust.customer_name || ''
}

// ==================== 审批操作（工作流引擎） ====================
const handleSubmit = async (record: any) => {
  try {
    const res: any = await startWorkflow('sales_forecast', record.forecast_number)
    if (res?.success) { message.success('审批流程已启动'); fetchData() }
    else { message.error(res?.message || '启动流程失败') }
  } catch (err: any) { message.error(err.response?.data?.message || '启动流程失败') }
}

const handleWithdraw = async (record: any) => {
  try {
    const instRes: any = await getInstanceByRecord('sales_forecast', record.forecast_number)
    if (instRes?.success && instRes.data?.id) {
      const res: any = await withdrawWorkflow(instRes.data.id)
      if (res?.success) { message.success('撤回成功'); fetchData() }
      else { message.error(res?.message || '撤回失败') }
    } else {
      message.error('未找到对应的审批流程实例')
    }
  } catch (err: any) { message.error(err.response?.data?.message || '撤回失败') }
}

const handleReverse = async (record: any) => {
  try {
    const res: any = await reverseApproval('sales_forecast', record.forecast_number)
    if (res?.success) { message.success('反审成功'); fetchData() }
  } catch (err: any) { message.error(err.response?.data?.message || '反审失败') }
}

const handleBatchSubmit = async () => {
  if (!selectedRowKeys.value.length) { message.warning('请选择记录'); return }
  let successCount = 0
  for (const id of selectedRowKeys.value) {
    try {
      const res: any = await startWorkflow('sales_forecast', id)
      if (res?.success) successCount++
    } catch { /* skip */ }
  }
  message.success(`成功启动 ${successCount} 条审批流程`)
  selectedRowKeys.value = []
  fetchData()
}

const showApprovalLog = (record: any) => {
  approvalLogModule.value = 'sales_forecast'
  approvalLogRecordId.value = record.forecast_number
  approvalLogVisible.value = true
}

const formatDate = (val: any) => val ? dayjs(val).format('YYYY-MM-DD') : '-'

// 明细展开列
const detailColumns = [
  { title: '行号', dataIndex: 'line_number', width: 60 },
  { title: '物料编号', dataIndex: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', width: 130 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', width: 60 },
  { title: '客户物料号', dataIndex: 'customer_item_number', width: 120 },
  { title: '客户物料描述', dataIndex: 'customer_item_description', width: 140 },
  { title: '开始日期', dataIndex: 'start_date', width: 110 },
  { title: '结束日期', dataIndex: 'end_date', width: 110 },
  { title: '预测数量', dataIndex: 'forecast_quantity', width: 100 },
  { title: '已消耗', dataIndex: 'consumed_quantity', width: 90 },
  { title: '剩余量', dataIndex: 'remaining_quantity', width: 90 },
  { title: '消耗状态', dataIndex: 'consumption_status', width: 90 },
  { title: '计划状态', dataIndex: 'status', width: 90 }
]

const consumptionColumns = [
  { title: '销售订单号', dataIndex: 'sales_order_number', width: 170 },
  { title: '物料编号', dataIndex: 'item_number', width: 130 },
  { title: '消耗数量', dataIndex: 'consumed_quantity', width: 100 },
  { title: '消耗时间', dataIndex: 'consumed_date', width: 160 },
  { title: '消耗人', dataIndex: 'consumed_by', width: 100 }
]

// 展开行：加载明细
const expandedRowKeys = ref<string[]>([])
const expandedDetails = ref<Record<string, any[]>>({})

const onExpand = async (expanded: boolean, record: any) => {
  if (expanded) {
    try {
      const res: any = await getForecastDetail(record.forecast_number)
      if (res?.success) expandedDetails.value[record.forecast_number] = res.data?.details || []
    } catch { expandedDetails.value[record.forecast_number] = [] }
  }
}
</script>

<template>
  <div style="padding: 16px">
    <!-- 顶部工具栏 -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px">
      <span style="font-size: 18px; font-weight: 600; color: #1a1a2e; white-space: nowrap; margin-right: 4px">销售预测</span>
      <a-space wrap>
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索预测编号/客户名/创建人"
          style="width: 280px"
          allow-clear
          @search="onSearch"
          @pressEnter="onSearch"
        />
        <a-select v-model:value="approvalFilter" style="width: 120px" placeholder="审批状态" allowClear @change="onSearch">
          <a-select-option value="">全部</a-select-option>
          <a-select-option value="草稿">草稿</a-select-option>
          <a-select-option value="审批中">审批中</a-select-option>
          <a-select-option value="已审批">已审批</a-select-option>
        </a-select>
        <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
      </a-space>
      <a-space wrap>
        <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
        <a-button @click="handleImportClick" :loading="importLoading"><template #icon><UploadOutlined /></template>导入</a-button>
        <a-button type="primary" @click="handleCreate"><template #icon><PlusOutlined /></template>新建预测</a-button>
        <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
      </a-space>
      <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
    </div>

    <!-- 数据表格 -->
    <a-table
      :columns="columns" :data-source="dataSource" :loading="loading"
      :pagination="pagination" :row-key="(r: any) => r.forecast_number"
      :row-selection="{ selectedRowKeys, onChange: (keys: string[]) => selectedRowKeys = keys }"
      :scroll="{ x: 1100 }" size="small" bordered
      :expandedRowKeys="expandedRowKeys"
      @change="handleTableChange" @expand="onExpand"
      @resizeColumn="handleResizeColumn"
    >
      <template #expandedRowRender="{ record }">
        <a-table :columns="detailColumns" :data-source="expandedDetails[record.forecast_number] || []"
          :pagination="false" size="small" row-key="id">
          <template #bodyCell="{ column, text }">
            <template v-if="column.dataIndex === 'start_date' || column.dataIndex === 'end_date'">{{ formatDate(text) }}</template>
            <template v-else-if="column.dataIndex === 'consumption_status'">
              <a-tag :color="text === '已消耗' ? 'red' : text === '部分消耗' ? 'orange' : 'green'">{{ text }}</a-tag>
            </template>
            <template v-else-if="column.dataIndex === 'status'">
              <a-tag :color="text === '已完成' ? 'green' : text === '计划中' ? 'blue' : 'default'">{{ text || '未开始' }}</a-tag>
            </template>
          </template>
        </a-table>
      </template>
      <template #bodyCell="{ column, record, text }">
        <template v-if="column.dataIndex === 'forecast_date' || column.dataIndex === 'creation_date'">{{ formatDate(text) }}</template>
        <template v-else-if="column.dataIndex === 'approval_status'"><ApprovalStatusTag :status="text" /></template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="handleViewDetail(record)">
              <EyeOutlined /> 详情
            </a-button>
            <a-dropdown :trigger="['click']">
              <a @click.stop>更多<DownOutlined style="font-size: 10px; margin-left: 2px;" /></a>
              <template #overlay>
                <a-menu>
                  <a-menu-item v-if="record.approval_status === '草稿'" @click="handleEdit(record)">
                    <EditOutlined /> 编辑
                  </a-menu-item>
                  <a-menu-item v-if="record.approval_status === '草稿'" @click="handleSubmit(record)">
                    提交审核
                  </a-menu-item>
                  <a-menu-item v-if="record.approval_status === '审批中'" @click="handleWithdraw(record)">
                    撤回提交
                  </a-menu-item>
                  <a-menu-item v-if="record.approval_status === '已审批'" @click="handleReverse(record)">
                    <span style="color: #ff4d4f">反审退回</span>
                  </a-menu-item>
                  <a-menu-item v-if="record.approval_status === '已审批'" @click="handleViewConsumption(record.forecast_number)">
                    消耗记录
                  </a-menu-item>
                  <a-menu-item @click="showApprovalLog(record)">
                    <HistoryOutlined /> 审批历史
                  </a-menu-item>
                  <a-menu-divider />
                  <a-menu-item v-if="record.approval_status === '草稿'" @click="handleDelete(record)">
                    <span style="color: #ff4d4f"><DeleteOutlined /> 删除</span>
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 新建弹窗 -->
    <a-modal v-model:open="createModalVisible" :width="'90vw'" style="max-width: 1200px" :style="createModalStyle" :footer="null" destroyOnClose>
      <template #title>
        <div class="drag-handle" @mousedown="createDragStart">新建销售预测</div>
      </template>
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="客户">
              <a-select v-model:value="createForm.customer_number" show-search placeholder="搜索客户"
                :filter-option="(input: string, option: any) => (option?.label || '').toLowerCase().includes(input.toLowerCase())"
                @change="(v: string) => onCustomerSelect(v, createForm)">
                <a-select-option v-for="c in customerOptions" :key="c.customer_number" :value="c.customer_number" :label="`${c.customer_number} ${c.customer_name}`">
                  {{ c.customer_number }} - {{ c.customer_name }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="预测日期">
              <a-input type="date" v-model:value="createForm.forecast_date" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="备注">
              <a-input v-model:value="createForm.remark" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>

      <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center">
        <strong>预测明细</strong>
        <a-button size="small" type="dashed" @click="addDetailRow(createForm.details)"><PlusOutlined />添加行</a-button>
      </div>
      <a-table :data-source="createForm.details" :pagination="false" size="small" row-key="(r: any, i: number) => i" bordered :scroll="{ x: 1250 }">
        <a-table-column title="物料" :width="180">
          <template #default="{ record, index }">
            <a-select v-model:value="record.item_number" show-search placeholder="搜索物料" style="width: 100%"
              :filter-option="false" @search="fetchItems"
              @change="(v: string) => onItemSelect(v, record, createForm.customer_number)">
              <a-select-option v-for="it in itemOptions" :key="it.item_number" :value="it.item_number">
                {{ it.item_number }} - {{ it.item_name }}
              </a-select-option>
            </a-select>
          </template>
        </a-table-column>
        <a-table-column title="名称" data-index="item_name" :width="100" />
        <a-table-column title="规格" data-index="specifications" :width="100" />
        <a-table-column title="单位" data-index="basic_unit" :width="60" />
        <a-table-column title="客户物料号" :width="140">
          <template #default="{ record }">
            <a-input v-model:value="record.customer_item_number" size="small" placeholder="回车查询" @pressEnter="onCustomerItemNumberChange(record.customer_item_number, record, createForm.customer_number)" />
          </template>
        </a-table-column>
        <a-table-column title="客户物料描述" :width="140">
          <template #default="{ record }"><a-input v-model:value="record.customer_item_description" size="small" /></template>
        </a-table-column>
        <a-table-column title="开始日期" :width="140">
          <template #default="{ record }"><a-input type="date" v-model:value="record.start_date" size="small" /></template>
        </a-table-column>
        <a-table-column title="结束日期" :width="140">
          <template #default="{ record }"><a-input type="date" v-model:value="record.end_date" size="small" /></template>
        </a-table-column>
        <a-table-column title="预测数量" :width="110">
          <template #default="{ record }"><a-input-number v-model:value="record.forecast_quantity" :min="0" size="small" style="width: 100%" /></template>
        </a-table-column>
        <a-table-column title="操作" :width="60">
          <template #default="{ index }">
            <a-button size="small" danger type="link" @click="removeDetailRow(createForm.details, index)">删</a-button>
          </template>
        </a-table-column>
      </a-table>
      <div style="margin-top: 16px; text-align: right">
        <a-button @click="createModalVisible = false" style="margin-right: 8px">取消</a-button>
        <a-button type="primary" :loading="createLoading" @click="handleCreateSubmit">创建</a-button>
      </div>
    </a-modal>

    <!-- 编辑弹窗 -->
    <a-modal v-model:open="editModalVisible" title="编辑销售预测" :width="'90vw'" style="max-width: 1200px" :footer="null" destroyOnClose>
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="客户">
              <a-select v-model:value="editForm.customer_number" show-search placeholder="搜索客户"
                :filter-option="(input: string, option: any) => (option?.label || '').toLowerCase().includes(input.toLowerCase())"
                @change="(v: string) => onCustomerSelect(v, editForm)">
                <a-select-option v-for="c in customerOptions" :key="c.customer_number" :value="c.customer_number" :label="`${c.customer_number} ${c.customer_name}`">
                  {{ c.customer_number }} - {{ c.customer_name }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="预测日期">
              <a-input type="date" v-model:value="editForm.forecast_date" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="备注">
              <a-input v-model:value="editForm.remark" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>

      <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center">
        <strong>预测明细</strong>
        <a-button size="small" type="dashed" @click="addDetailRow(editForm.details)"><PlusOutlined />添加行</a-button>
      </div>
      <a-table :data-source="editForm.details" :pagination="false" size="small" row-key="(r: any, i: number) => i" bordered :scroll="{ x: 1250 }">
        <a-table-column title="物料" :width="180">
          <template #default="{ record }">
            <a-select v-model:value="record.item_number" show-search placeholder="搜索物料" style="width: 100%"
              :filter-option="false" @search="fetchItems"
              @change="(v: string) => onItemSelect(v, record, editForm.customer_number)">
              <a-select-option v-for="it in itemOptions" :key="it.item_number" :value="it.item_number">
                {{ it.item_number }} - {{ it.item_name }}
              </a-select-option>
            </a-select>
          </template>
        </a-table-column>
        <a-table-column title="名称" data-index="item_name" :width="100" />
        <a-table-column title="规格" data-index="specifications" :width="100" />
        <a-table-column title="单位" data-index="basic_unit" :width="60" />
        <a-table-column title="客户物料号" :width="140">
          <template #default="{ record }">
            <a-input v-model:value="record.customer_item_number" size="small" placeholder="回车查询" @pressEnter="onCustomerItemNumberChange(record.customer_item_number, record, editForm.customer_number)" />
          </template>
        </a-table-column>
        <a-table-column title="客户物料描述" :width="140">
          <template #default="{ record }"><a-input v-model:value="record.customer_item_description" size="small" /></template>
        </a-table-column>
        <a-table-column title="开始日期" :width="140">
          <template #default="{ record }"><a-input type="date" v-model:value="record.start_date" size="small" /></template>
        </a-table-column>
        <a-table-column title="结束日期" :width="140">
          <template #default="{ record }"><a-input type="date" v-model:value="record.end_date" size="small" /></template>
        </a-table-column>
        <a-table-column title="预测数量" :width="110">
          <template #default="{ record }"><a-input-number v-model:value="record.forecast_quantity" :min="0" size="small" style="width: 100%" /></template>
        </a-table-column>
        <a-table-column title="操作" :width="60">
          <template #default="{ index }">
            <a-button size="small" danger type="link" @click="removeDetailRow(editForm.details, index)">删</a-button>
          </template>
        </a-table-column>
      </a-table>
      <div style="margin-top: 16px; text-align: right">
        <a-button @click="editModalVisible = false" style="margin-right: 8px">取消</a-button>
        <a-button type="primary" :loading="editLoading" @click="handleEditSubmit">保存</a-button>
      </div>
    </a-modal>

    <!-- 详情弹窗 -->
    <a-modal v-model:open="detailModalVisible" :width="'90vw'" style="max-width: 1100px" :style="detailModalStyle" :footer="null">
      <template #title>
        <div class="drag-handle" @mousedown="detailDragStart">预测详情</div>
      </template>
      <template v-if="detailData">
        <a-descriptions bordered size="small" :column="{ xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }" style="margin-bottom: 16px">
          <a-descriptions-item label="预测编号">{{ detailData.forecast_number }}</a-descriptions-item>
          <a-descriptions-item label="客户">{{ detailData.customer_name }} ({{ detailData.customer_number }})</a-descriptions-item>
          <a-descriptions-item label="预测日期">{{ formatDate(detailData.forecast_date) }}</a-descriptions-item>
          <a-descriptions-item label="审批状态"><ApprovalStatusTag :status="detailData.approval_status" /></a-descriptions-item>
          <a-descriptions-item label="创建人">{{ detailData.creation_man }}</a-descriptions-item>
          <a-descriptions-item label="备注">{{ detailData.remark || '-' }}</a-descriptions-item>
        </a-descriptions>
        <a-table :columns="detailColumns" :data-source="detailData.details || []" :pagination="false" size="small" row-key="id" bordered :scroll="{ x: 1450 }">
          <template #bodyCell="{ column, text }">
            <template v-if="column.dataIndex === 'start_date' || column.dataIndex === 'end_date'">{{ formatDate(text) }}</template>
            <template v-else-if="column.dataIndex === 'consumption_status'">
              <a-tag :color="text === '已消耗' ? 'red' : text === '部分消耗' ? 'orange' : 'green'">{{ text }}</a-tag>
            </template>
            <template v-else-if="column.dataIndex === 'status'">
              <a-tag :color="text === '已完成' ? 'green' : text === '计划中' ? 'blue' : 'default'">{{ text || '未开始' }}</a-tag>
            </template>
          </template>
        </a-table>
      </template>
    </a-modal>

    <!-- 消耗记录弹窗 -->
    <a-modal v-model:open="consumptionModalVisible" title="预测消耗记录" :width="800" :footer="null">
      <a-table :columns="consumptionColumns" :data-source="consumptionLogs" :loading="consumptionLoading" :pagination="false" size="small" row-key="id" bordered>
        <template #bodyCell="{ column, text }">
          <template v-if="column.dataIndex === 'consumed_date'">{{ formatDate(text) }}</template>
        </template>
      </a-table>
    </a-modal>

    <!-- 审批日志 -->
    <ApprovalLogModal v-model:open="approvalLogVisible" :module="approvalLogModule" :recordId="approvalLogRecordId" />

    <!-- 列设置 -->
    <ColumnSettingDrawer v-model:visible="columnSettingVisible" :columns="columnSettingList" :saving="columnSettingSaving"
      @moveUp="moveColumnUp" @moveDown="moveColumnDown" @save="saveColumnSetting" @reset="resetColumnSetting" />
  </div>
</template>

<style scoped>
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
