<script setup lang="ts">
import { ref, reactive, computed, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, SearchOutlined, DownloadOutlined, UploadOutlined, HistoryOutlined, DownOutlined, ShoppingCartOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { getPlans, createPlan, updatePlan, deletePlan, exportPlans, importPlans, getSalesOrdersForImport, importFromSalesOrder } from '@/api/planning/plan'
import { getItems } from '@/api/master-data/itemMaster'
import { useAuthStore } from '@/store/auth'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ApprovalLogModal from '@/components/Common/ApprovalLogModal.vue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval, batchSubmitForApproval, batchApproveRecords, batchWithdrawApproval, batchReverseApproval } from '@/api/system/approval'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'
import { generateExportFilename } from '@/utils/exportFilename'

interface Plan {
  production_number: string
  item_number: string
  item_name: string
  basic_unit: string
  specifications: string
  product_drawing_number: string
  rubber_compound_number: string
  batch_production_quota: string
  planned_quantity: number
  shifts_number: number | null
  planned_completion_time: string | null
  plan_status: string
  remark: string
  approval_status: string
  mrp_status: string
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





const authStore = useAuthStore()
const approvalFilter = ref('')
const mrpStatusFilter = ref('')
const approvalLogVisible = ref(false)
const approvalLogRecordId = ref('')



const { loading, dataSource, searchText, pagination, selectedRowKeys, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getPlans)

const emptyForm = (): Plan => ({
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
  plan_status: '待加入任务',
  remark: '',
  approval_status: '草稿',
  mrp_status: ''
})

// 编辑弹窗
const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<Plan>(emptyForm())
const editDate = ref<any>(null)

// 新建弹窗
const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<Plan>(emptyForm())
const createDate = ref<any>(null)

// 产品搜索
const productOptions = ref<Product[]>([])
const productSearchLoading = ref(false)
const selectedProductKey = ref<string | undefined>(undefined)



// 台班数自动计算（计划数量 / 班产定额，向上取整）
const calcShifts = (qty: number, quota: string) => {
  const q = parseFloat(quota)
  if (!qty || !q || isNaN(q) || q === 0) return '-'
  return Math.ceil(qty / q)
}
const createShiftsNumber = computed(() => calcShifts(createForm.planned_quantity, createForm.batch_production_quota))
const editShiftsNumber = computed(() => calcShifts(editForm.planned_quantity, editForm.batch_production_quota))

// 默认数据列定义（不含行号和操作）
const defaultDataColumns: any[] = [
  { title: '生产计划编号', dataIndex: 'production_number', key: 'production_number', sorter: (a: any, b: any) => (a.production_number || '').localeCompare(b.production_number || ''), resizable: true },
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', sorter: (a: any, b: any) => (a.item_number || '').localeCompare(b.item_number || ''), resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', sorter: (a: any, b: any) => (a.item_name || '').localeCompare(b.item_name || ''), resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', resizable: true },
  { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number', resizable: true },
  { title: '胶料编号', dataIndex: 'rubber_compound_number', key: 'rubber_compound_number', sorter: (a: any, b: any) => (a.rubber_compound_number || '').localeCompare(b.rubber_compound_number || ''), resizable: true },
  { title: '班产定额', dataIndex: 'batch_production_quota', key: 'batch_production_quota', sorter: (a: any, b: any) => Number(a.batch_production_quota || 0) - Number(b.batch_production_quota || 0), resizable: true },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', sorter: (a: any, b: any) => (a.planned_quantity || 0) - (b.planned_quantity || 0), resizable: true },
  { title: '台班数', dataIndex: 'shifts_number', key: 'shifts_number', width: 80, sorter: (a: any, b: any) => (a.shifts_number || 0) - (b.shifts_number || 0), resizable: true },
  { title: '计划完成时间', dataIndex: 'planned_completion_time', key: 'planned_completion_time', sorter: (a: any, b: any) => (a.planned_completion_time || '').localeCompare(b.planned_completion_time || ''), resizable: true },
  { title: '状态', dataIndex: 'plan_status', key: 'plan_status', sorter: (a: any, b: any) => (a.plan_status || '').localeCompare(b.plan_status || ''), resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, sorter: (a: any, b: any) => (a.approval_status || '').localeCompare(b.approval_status || ''), resizable: true },
  { title: 'MRP状态', dataIndex: 'mrp_status', key: 'mrp_status', width: 100, sorter: (a: any, b: any) => (a.mrp_status || '').localeCompare(b.mrp_status || ''), resizable: true },
  { title: '源单号', dataIndex: 'source_order_number', key: 'source_order_number', width: 160, sorter: (a: any, b: any) => (a.source_order_number || '').localeCompare(b.source_order_number || ''), resizable: true },
  { title: '源单行号', dataIndex: 'source_line_number', key: 'source_line_number', width: 90, resizable: true },
  { title: '客户物料号', dataIndex: 'customer_item_number', key: 'customer_item_number', width: 120, resizable: true },
  { title: '客户物料描述', dataIndex: 'customer_item_description', key: 'customer_item_description', width: 140, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('plan_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 80, fixed: 'right' as const }]
})

// 新建
const handleCreate = () => {
  Object.assign(createForm, emptyForm())
  createDate.value = null
  selectedProductKey.value = undefined
  productOptions.value = []
  createModalVisible.value = true
}

// 产品搜索（AutoComplete）
let searchTimer: any = null
const handleProductSearch = (searchValue: string) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!searchValue) {
    productOptions.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    productSearchLoading.value = true
    try {
      const res = await getItems({ item_type: '成品', search: searchValue, limit: 20 })
      if (res.success) {
        productOptions.value = res.data.items
      }
    } catch (err) {
      productOptions.value = []
    } finally {
      productSearchLoading.value = false
    }
  }, 300)
}

// AutoComplete 选项
const productAutoOptions = computed(() =>
  productOptions.value.map(p => ({
    value: p.item_number,
    label: p.item_number + ' - ' + p.item_name
  }))
)

// 选择产品自动带入信息
const fillProductInfo = (product: Product) => {
  createForm.item_number = product.item_number
  createForm.item_name = product.item_name
  createForm.basic_unit = product.basic_unit?.trim() || ''
  createForm.specifications = product.specifications?.trim() || ''
  createForm.product_drawing_number = product.product_drawing_number?.trim() || ''
  createForm.rubber_compound_number = product.rubber_compound_number?.trim() || ''
  createForm.batch_production_quota = product.batch_production_quota?.trim() || ''
}

// 从 AutoComplete 选择产品
const handleProductAutoSelect = (value: string) => {
  const product = productOptions.value.find(p => p.item_number === value)
  if (product) {
    fillProductInfo(product)
  }
}

// 手工输入变化时清空关联字段
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
  if (!createForm.item_number) {
    message.warning('请选择产品')
    return
  }
  createLoading.value = true
  try {
    const data = {
      ...createForm,
      planned_completion_time: createDate.value ? dayjs(createDate.value).format('YYYY-MM-DD') : null
    }
    const res = await createPlan(data)
    if (res.success) {
      message.success('新建成功')
      createModalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '新建失败')
    }
  } catch (err: any) {
    message.error('新建失败')
  } finally {
    createLoading.value = false
  }
}

// ==================== More Actions (dropdown) ====================
const handleMoreAction = async (key: string, record: Plan) => {
  const id = record.production_number
  if (key === 'edit') {
    if (record.approval_status !== '草稿') return
    handleEdit(record)
  } else if (key === 'delete') {
    if (record.approval_status !== '草稿') return
    handleDelete(record)
  } else if (key === 'history') {
    approvalLogRecordId.value = id
    approvalLogVisible.value = true
  } else if (key === 'submit') {
    Modal.confirm({
      title: '提交审核', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要提交审核吗？提交后将不可编辑。', okText: '确认', cancelText: '取消',
      onOk: async () => { try { await submitForApproval('Production_plan', id); message.success('提交审核成功'); fetchData() } catch { message.error('提交审核失败') } }
    })
  } else if (key === 'approve') {
    Modal.confirm({
      title: '审核通过', icon: createVNode(ExclamationCircleOutlined),
      content: '确定审核通过吗？', okText: '通过', cancelText: '取消',
      onOk: async () => { try { await approveRecord('Production_plan', id); message.success('审核通过'); fetchData() } catch { message.error('审核失败') } }
    })
  } else if (key === 'withdraw') {
    Modal.confirm({
      title: '撤回提交', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要撤回审核提交吗？', okText: '撤回', cancelText: '取消',
      onOk: async () => { try { await withdrawApproval('Production_plan', id); message.success('撤回成功'); fetchData() } catch { message.error('撤回失败') } }
    })
  } else if (key === 'reverse') {
    Modal.confirm({
      title: '反审退回', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要执行反审吗？记录将退回草稿状态，可重新编辑。', okText: '确认反审', okType: 'danger', cancelText: '取消',
      onOk: async () => { try { await reverseApproval('Production_plan', id); message.success('反审成功，已退回草稿'); fetchData() } catch { message.error('反审失败') } }
    })
  }
}

// 编辑
const handleEdit = (record: Plan) => {
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
    const res = await updatePlan(editForm.production_number, data)
    if (res.success) {
      message.success('修改成功')
      editModalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '修改失败')
    }
  } catch (err: any) {
    message.error('修改失败')
  } finally {
    editLoading.value = false
  }
}

// 删除
const handleDelete = (record: Plan) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除计划 "${record.production_number}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deletePlan(record.production_number)
        if (res.success) {
          message.success('删除成功')
          fetchData()
        } else {
          message.error(res.message || '删除失败')
        }
      } catch (err: any) {
        message.error('删除失败')
      }
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
    const res = await exportPlans(searchText.value || undefined)
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('plans')
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
    const res = await importPlans(formData)
    if (res.success) { message.success(res.message || '导入成功'); fetchData() }
    else { message.error(res.message || '导入失败') }
  } catch { message.error('导入失败') }
  finally { target.value = '' }
}

// ==================== 从销售订单导入 ====================
const soImportVisible = ref(false)
const soImportLoading = ref(false)
const soImportSubmitLoading = ref(false)
const soImportSearch = ref('')
const soImportData = ref<any[]>([])
const soImportSelectedKeys = ref<number[]>([])

const soImportColumns = [
  { title: '销售订单号', dataIndex: 'sales_order_number', width: 160 },
  { title: '行号', dataIndex: 'line_number', width: 70 },
  { title: '客户名称', dataIndex: 'customer_name', width: 140 },
  { title: '产品编号', dataIndex: 'item_number', width: 130 },
  { title: '产品名称', dataIndex: 'item_name', width: 160 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', width: 60 },
  { title: '订单数量', dataIndex: 'order_quantity', width: 100 },
  { title: '交货日期', dataIndex: 'delivery_date', key: 'delivery_date', width: 110 },
  { title: '生产状态', dataIndex: 'production_status', key: 'production_status', width: 100 }
]

const handleSoImportOpen = async () => {
  soImportVisible.value = true
  soImportSelectedKeys.value = []
  soImportSearch.value = ''
  fetchSoImportData()
}

const fetchSoImportData = async () => {
  soImportLoading.value = true
  try {
    const res: any = await getSalesOrdersForImport({ search: soImportSearch.value })
    if (res?.success) {
      soImportData.value = res.data || []
    }
  } catch {
    message.error('获取销售订单数据失败')
  } finally {
    soImportLoading.value = false
  }
}

const handleSoImportSubmit = async () => {
  if (soImportSelectedKeys.value.length === 0) {
    message.warning('请先选择需要导入的销售订单明细'); return
  }
  const selected = soImportData.value.filter(d => soImportSelectedKeys.value.includes(d.detail_id))

  soImportSubmitLoading.value = true
  try {
    const res: any = await importFromSalesOrder({
      items: selected.map(d => ({
        detail_id: d.detail_id,
        sales_order_number: d.sales_order_number,
        line_number: d.line_number,
        item_number: d.item_number,
        item_name: d.item_name,
        specifications: d.specifications,
        basic_unit: d.basic_unit,
        product_drawing_number: d.product_drawing_number,
        rubber_compound_number: d.rubber_compound_number,
        batch_production_quota: d.batch_production_quota,
        order_quantity: d.order_quantity,
        delivery_date: d.delivery_date,
        header_delivery_date: d.header_delivery_date
      }))
    })
    if (res?.success) {
      message.success(res.message || `成功导入 ${res.data?.imported || 0} 条生产计划`)
      soImportVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '导入失败')
  } finally {
    soImportSubmitLoading.value = false
  }
}



// ==================== 批量审批操作 ====================
const batchLoading = ref(false)
const handleBatchAction = (action: string) => {
  if (selectedRowKeys.value.length === 0) { message.warning('请先勾选记录'); return }
  const count = selectedRowKeys.value.length
  const actionMap: Record<string, { title: string; desc: string; fn: () => Promise<any>; okType?: string }> = {
    'submit': { title: '批量提交审核', desc: `确定要批量提交 ${count} 条记录吗？仅草稿状态的记录会被提交。`, fn: () => batchSubmitForApproval('Production_plan', selectedRowKeys.value) },
    'approve': { title: '批量审核通过', desc: `确定要批量审核 ${count} 条记录吗？仅待审批状态的记录会被审批。`, fn: () => batchApproveRecords('Production_plan', selectedRowKeys.value) },
    'withdraw': { title: '批量撤回', desc: `确定要批量撤回 ${count} 条记录吗？仅待审批状态的记录会被撤回。`, fn: () => batchWithdrawApproval('Production_plan', selectedRowKeys.value) },
    'reverse': { title: '批量反审', desc: `确定要批量反审 ${count} 条记录吗？已审批的记录将退回草稿。`, fn: () => batchReverseApproval('Production_plan', selectedRowKeys.value), okType: 'danger' }
  }
  const cfg = actionMap[action]
  if (!cfg) return
  Modal.confirm({
    title: cfg.title, icon: createVNode(ExclamationCircleOutlined), content: cfg.desc,
    okText: '确认', okType: (cfg.okType as any) || 'primary', cancelText: '取消',
    onOk: async () => {
      batchLoading.value = true
      try {
        const res = await cfg.fn()
        if (res.success) {
          const d = res.data; message.success(`${cfg.title}完成：成功 ${d.succeeded.length} 条，失败 ${d.failed.length} 条`)
          if (d.failed.length > 0) d.failed.slice(0, 3).forEach((f: any) => message.warning(`${f.record_id}: ${f.message}`))
          selectedRowKeys.value = []; fetchData()
        } else { message.error(res.message || '操作失败') }
      } catch { message.error('批量操作失败') }
      finally { batchLoading.value = false }
    }
  })
}

onMounted(async () => {
  await loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
      <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">计划管理</span>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索计划编号/产品编号/名称/状态"
          style="width: 280px"
          allow-clear
          @search="handleSearch"
          @pressEnter="handleSearch"
        />
        <a-select v-model:value="approvalFilter" placeholder="审批状态" allow-clear style="width: 120px" @change="handleSearch">
          <a-select-option value="">全部</a-select-option>
          <a-select-option value="草稿">草稿</a-select-option>
          <a-select-option value="待审批">待审批</a-select-option>
          <a-select-option value="已审批">已审批</a-select-option>
          <a-select-option value="已驳回">已驳回</a-select-option>
        </a-select>
        <a-select v-model:value="mrpStatusFilter" placeholder="MRP状态" allow-clear style="width: 120px" @change="handleSearch">
          <a-select-option value="">全部</a-select-option>
          <a-select-option value="已分解">已分解</a-select-option>
          <a-select-option value="未分解">未分解</a-select-option>
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
        <a-button type="primary" @click="handleCreate">
          <template #icon><PlusOutlined /></template>
          新建
        </a-button>
        <a-tooltip title="列设置">
          <a-button @click="openColumnSetting">
            <template #icon><SettingOutlined /></template>
          </a-button>
        </a-tooltip>
        <a-button @click="handleSoImportOpen" type="dashed">
          <template #icon><ShoppingCartOutlined /></template>
          从销售订单导入
        </a-button>

      </div>
    </div>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 'max-content' }"
        :row-selection="rowSelection"
        row-key="production_number"
        size="middle"
        bordered
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'shifts_number'">
            <span v-if="record.shifts_number != null" style="font-weight: 600; color: #1890ff;">{{ record.shifts_number }}</span>
            <span v-else style="color: #ccc;">-</span>
          </template>
          <template v-else-if="column.key === 'planned_completion_time'">
            {{ formatDate(record.planned_completion_time) }}
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <ApprovalStatusTag :status="record.approval_status" />
          </template>
          <template v-else-if="column.key === 'mrp_status'">
            <a-tag v-if="record.mrp_status === '已分解'" color="blue">已分解</a-tag>
            <a-tag v-else-if="record.mrp_status" color="default">{{ record.mrp_status }}</a-tag>
            <a-tag v-else color="default" style="color: #999;">未分解</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-dropdown :trigger="['click']">
              <a-button type="link" size="small" @click.stop>更多<DownOutlined style="font-size: 10px; margin-left: 2px;" /></a-button>
              <template #overlay>
                <a-menu @click="({ key: k }: any) => handleMoreAction(k, record)">
                  <a-menu-item key="edit" :disabled="record.approval_status !== '草稿'"><EditOutlined /> 编辑</a-menu-item>
                  <a-menu-item key="submit" v-if="record.approval_status === '草稿'">提交审核</a-menu-item>
                  <a-menu-item key="approve" v-if="record.approval_status === '待审批'"><span style="color: #52c41a">审核通过</span></a-menu-item>
                  <a-menu-item key="withdraw" v-if="record.approval_status === '待审批'">撤回提交</a-menu-item>
                  <a-menu-item key="reverse" v-if="record.approval_status === '已审批'"><span style="color: #ff4d4f">反审退回</span></a-menu-item>
                  <a-menu-divider />
                  <a-menu-item key="history"><HistoryOutlined /> 审批历史</a-menu-item>
                  <a-menu-item key="delete" :disabled="record.approval_status !== '草稿'"><span style="color: #ff4d4f"><DeleteOutlined /> 删除</span></a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </template>
        </template>
      </a-table>

      <!-- 批量操作 + 分页 合并行 -->
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-top: 1px solid #f0f0f0; margin-top: 4px; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: #666;">已选 <b style="color: #1890ff;">{{ selectedRowKeys.length }}</b> 项</span>
          <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('submit')">批量提交</a-button>
          <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('approve')">批量审批</a-button>
          <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('withdraw')">批量撤回</a-button>
          <a-button size="small" danger :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('reverse')">批量反审</a-button>
          <a-button size="small" type="link" :disabled="selectedRowKeys.length === 0" @click="selectedRowKeys = []">清除选择</a-button>
        </div>
        <a-pagination
          v-model:current="pagination.current"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :show-size-changer="pagination.showSizeChanger"
          :show-quick-jumper="pagination.showQuickJumper"
          :page-size-options="pagination.pageSizeOptions"
          :show-total="pagination.showTotal"
          size="small"
          @change="(page: number, pageSize: number) => { pagination.current = page; pagination.pageSize = pageSize; fetchData() }"
        />
      </div>

    <!-- 编辑弹窗 -->
    <a-modal
      v-model:open="editModalVisible"
      title="修改计划"
      :confirm-loading="editLoading"
      @ok="handleEditSubmit"
      width="600px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="生产计划编号">
          <a-input v-model:value="editForm.production_number" disabled />
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
        <a-form-item label="台班数">
          <a-input :value="editShiftsNumber" disabled style="font-weight: 600; color: #1890ff;" />
        </a-form-item>
        <a-form-item label="计划完成时间">
          <a-date-picker v-model:value="editDate" style="width: 100%" />
        </a-form-item>
        <a-form-item label="状态">
          <a-select v-model:value="editForm.plan_status">
            <a-select-option value="待加入任务">待加入任务</a-select-option>
            <a-select-option value="已加入任务">已加入任务</a-select-option>
            <a-select-option value="已完成">已完成</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="MRP状态">
          <a-select v-model:value="editForm.mrp_status" allow-clear placeholder="请选择">
            <a-select-option value="">未分解</a-select-option>
            <a-select-option value="已分解">已分解</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="editForm.remark" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建弹窗 -->
    <a-modal
      v-model:open="createModalVisible"
      title="新建计划"
      :confirm-loading="createLoading"
      @ok="handleCreateSubmit"
      width="600px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
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
        <a-form-item label="台班数">
          <a-input :value="createShiftsNumber" disabled style="font-weight: 600; color: #1890ff;" />
        </a-form-item>
        <a-form-item label="计划完成时间">
          <a-date-picker v-model:value="createDate" style="width: 100%" placeholder="请选择计划完成时间" />
        </a-form-item>
        <a-form-item label="状态">
          <a-select v-model:value="createForm.plan_status" placeholder="请选择状态">
            <a-select-option value="待加入任务">待加入任务</a-select-option>
            <a-select-option value="已加入任务">已加入任务</a-select-option>
            <a-select-option value="已完成">已完成</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="MRP状态">
          <a-select v-model:value="createForm.mrp_status" placeholder="请选择">
            <a-select-option value="">未分解</a-select-option>
            <a-select-option value="已分解">已分解</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="createForm.remark" :rows="3" placeholder="请输入备注" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 审批日志弹窗 -->
    <ApprovalLogModal v-model:open="approvalLogVisible" module="Production_plan" :record-id="approvalLogRecordId" />

    <!-- 从销售订单导入弹窗 -->
    <a-modal
      v-model:open="soImportVisible"
      title="从销售订单导入到生产计划"
      width="1200px"
      :bodyStyle="{ maxHeight: '70vh', overflowY: 'auto' }"
      @ok="handleSoImportSubmit"
      :confirmLoading="soImportSubmitLoading"
      :okText="`确认导入 (${soImportSelectedKeys.length})`"
      :okButtonProps="{ disabled: soImportSelectedKeys.length === 0 }"
    >
      <a-alert
        message="说明：仅显示审批状态为【已审批】且订单状态为【待执行】的销售订单明细。选择导入后，系统将自动创建生产计划，并将对应销售订单状态更新为【生产中】。"
        type="info"
        show-icon
        style="margin-bottom: 12px"
      />
      <div style="margin-bottom: 12px">
        <a-input-search
          v-model:value="soImportSearch"
          placeholder="搜索订单号/客户/产品编号/名称"
          style="width: 320px"
          allow-clear
          @search="fetchSoImportData"
          @pressEnter="fetchSoImportData"
        />
      </div>
      <a-table
        :columns="soImportColumns"
        :data-source="soImportData"
        :loading="soImportLoading"
        :row-selection="{ selectedRowKeys: soImportSelectedKeys, onChange: (keys: number[]) => { soImportSelectedKeys = keys } }"
        row-key="detail_id"
        :pagination="{ pageSize: 50, showTotal: (total: number) => `共 ${total} 条` }"
        :scroll="{ x: 1200, y: 400 }"
        size="small"
        bordered
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'delivery_date'">
            {{ record.delivery_date ? dayjs(record.delivery_date).format('YYYY-MM-DD') : '-' }}
          </template>
          <template v-else-if="column.key === 'production_status'">
            <a-tag :color="record.production_status === '已加入计划' ? 'blue' : record.production_status === '生产中' ? 'cyan' : record.production_status === '生产完成' ? 'green' : 'default'">
              {{ record.production_status || '未加入计划' }}
            </a-tag>
          </template>
        </template>
      </a-table>
    </a-modal>



    <!-- 列设置 Drawer -->
    <ColumnSettingDrawer
      v-model:open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />
  </div>
</template>

<style scoped>
</style>
