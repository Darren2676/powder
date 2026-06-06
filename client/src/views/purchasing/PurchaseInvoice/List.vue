<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined, EyeOutlined,
  EditOutlined, DeleteOutlined, SettingOutlined, DownOutlined,
  CheckOutlined, UndoOutlined
} from '@ant-design/icons-vue'
import {
  getPurchaseInvoices, getPurchaseInvoiceDetail, createPurchaseInvoice,
  updatePurchaseInvoice, deletePurchaseInvoice, approvePurchaseInvoice,
  withdrawPurchaseInvoice, getAvailableStockInDetails
} from '@/api/purchasing/purchaseInvoice'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { useTableList } from '@/composables/useTableList'
import { useModalDrag } from '@/composables/useModalDrag'
import dayjs from 'dayjs'

// ==================== 供应商选项 ====================
import { getSuppliers } from '@/api/master-data/supplier'
const supplierOptions = ref<any[]>([])
const supplierLoading = ref(false)
const loadSuppliers = async (search?: string) => {
  supplierLoading.value = true
  try {
    const res: any = await getSuppliers({ limit: 50, search: search || '' })
    if (res?.success) supplierOptions.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
  finally { supplierLoading.value = false }
}

// ==================== 列表 ====================
const filterApprovalStatus = ref('')
const getInvoicesWithFilter = (params: any) => {
  if (filterApprovalStatus.value) params.approval_status = filterApprovalStatus.value
  return getPurchaseInvoices(params)
}
const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getInvoicesWithFilter)

const defaultDataColumns: any[] = [
{ title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '发票代码', dataIndex: 'invoice_code', key: 'invoice_code', width: 120, resizable: true },
  { title: '发票号码', dataIndex: 'invoice_no', key: 'invoice_no', width: 120, resizable: true },
  { title: '发票类型', dataIndex: 'invoice_type', key: 'invoice_type', width: 130, resizable: true },
  { title: '供应商名称', dataIndex: 'supplier_name', key: 'supplier_name', width: 160, resizable: true },
  { title: '开票日期', dataIndex: 'invoice_date', key: 'invoice_date', width: 110, resizable: true },
  { title: '税率(%)', dataIndex: 'tax_rate', key: 'tax_rate', width: 80, resizable: true },
  { title: '不含税金额', dataIndex: 'amount_without_tax', key: 'amount_without_tax', width: 120, resizable: true, align: 'right' as const },
  { title: '税额', dataIndex: 'tax_amount', key: 'tax_amount', width: 100, resizable: true, align: 'right' as const },
  { title: '价税合计', dataIndex: 'amount_with_tax', key: 'amount_with_tax', width: 120, resizable: true, align: 'right' as const },
  { title: '币种', dataIndex: 'currency_code', key: 'currency_code', width: 70, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 160, ellipsis: true, resizable: true },
  { title: '创建人', dataIndex: 'created_by', key: 'created_by', width: 90, resizable: true },
  { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 160, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('purchase_invoice_list', defaultDataColumns, {
  fixedLeft: [{ title: '发票编号', dataIndex: 'invoice_number', key: 'invoice_number', width: 180, fixed: 'left' as const, resizable: true }],
  fixedRight: [{ title: '操作', key: 'action', width: 150, fixed: 'right' as const }]
})

const formatDateTime = (date: any) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-'
const formatDate = (date: any) => date ? dayjs(date).format('YYYY-MM-DD') : '-'

// ==================== 新建/编辑弹窗 ====================
const formVisible = ref(false)
const formLoading = ref(false)
const isEditing = ref(false)
const { modalStyle: formModalStyle, onDragStart: formDragStart, resetDrag: formResetDrag } = useModalDrag()

const emptyForm = () => ({
  invoice_number: '',
  invoice_code: '',
  invoice_no: '',
  invoice_type: '增值税专用发票',
  supplier_number: '',
  supplier_name: '',
  invoice_title: '',
  tax_id: '',
  invoice_address: '',
  invoice_phone: '',
  bank_name: '',
  bank_account_number: '',
  invoice_date: dayjs().format('YYYY-MM-DD'),
  tax_rate: 13,
  amount_without_tax: 0,
  tax_amount: 0,
  amount_with_tax: 0,
  currency_code: 'CNY',
  remark: '',
  lines: [] as any[]
})

const formData = reactive(emptyForm())

// 选择供应商 → 自动带入开票信息
const handleSupplierChange = (value: string) => {
  const sup = supplierOptions.value.find((s: any) => s.supplier_number === value)
  if (sup) {
    formData.supplier_number = sup.supplier_number
    formData.supplier_name = sup.supplier_name
    formData.invoice_title = sup.invoice_title || sup.supplier_name
    formData.tax_id = sup.tax_id || ''
    formData.invoice_address = sup.invoice_address || ''
    formData.invoice_phone = sup.invoice_phone || ''
    formData.bank_name = sup.bank_name || ''
    formData.bank_account_number = sup.bank_account_number || ''
  }
  formData.lines = []
  availableDetails.value = []
}

// 可开票入库明细行
const availableDetails = ref<any[]>([])
const availableLoading = ref(false)
const loadAvailableDetails = async () => {
  if (!formData.supplier_number) { message.warning('请先选择供应商'); return }
  availableLoading.value = true
  try {
    const res: any = await getAvailableStockInDetails({
      supplier_number: formData.supplier_number,
      exclude_invoice: isEditing.value ? formData.invoice_number : ''
    })
    if (res?.success) availableDetails.value = res.data || []
  } catch { message.error('获取可开票明细行失败') }
  finally { availableLoading.value = false }
}

// 选择入库明细行弹窗
const selectDetailVisible = ref(false)
const selectedDetailKeys = ref<number[]>([])

const handleOpenSelectDetail = () => {
  loadAvailableDetails()
  selectedDetailKeys.value = []
  selectDetailVisible.value = true
}

const handleConfirmSelectDetails = () => {
  const selected = availableDetails.value.filter((d: any) => selectedDetailKeys.value.includes(d.id))
  for (const d of selected) {
    if (formData.lines.some((l: any) => l.stock_in_detail_id === d.id)) continue
    formData.lines.push({
      stock_in_number: d.stock_in_number,
      stock_in_detail_id: d.id,
      purchase_order_number: d.purchase_order_number || '',
      purchase_detail_id: d.purchase_detail_id || 0,
      item_number: d.item_number,
      item_name: d.item_name || '',
      specifications: d.specifications || '',
      basic_unit: d.basic_unit || '',
      stock_in_quantity: d.stock_in_quantity,
      invoice_quantity: d.available_qty,
      unit_price: 0,
      amount_without_tax: 0,
      tax_rate: formData.tax_rate,
      tax_amount: 0,
      amount_with_tax: 0,
      remark: ''
    })
  }
  selectDetailVisible.value = false
  recalcAllLines()
}

// 删除明细行
const handleRemoveLine = (index: number) => {
  formData.lines.splice(index, 1)
  recalcAllLines()
}

// 重新计算所有行金额
const recalcAllLines = () => {
  for (const line of formData.lines) {
    line.amount_without_tax = Number(((line.invoice_quantity || 0) * (line.unit_price || 0)).toFixed(2))
    line.tax_rate = formData.tax_rate
    line.tax_amount = Number((line.amount_without_tax * (line.tax_rate || 0) / 100).toFixed(2))
    line.amount_with_tax = Number((line.amount_without_tax + line.tax_amount).toFixed(2))
  }
  formData.amount_without_tax = Number(formData.lines.reduce((s: number, l: any) => s + (l.amount_without_tax || 0), 0).toFixed(2))
  formData.tax_amount = Number(formData.lines.reduce((s: number, l: any) => s + (l.tax_amount || 0), 0).toFixed(2))
  formData.amount_with_tax = Number(formData.lines.reduce((s: number, l: any) => s + (l.amount_with_tax || 0), 0).toFixed(2))
}

const handleTaxRateChange = () => { recalcAllLines() }

const handleLineQtyChange = (line: any) => {
  if (line.invoice_quantity > line.stock_in_quantity) {
    message.warning('开票数量不能超过入库数量')
    line.invoice_quantity = line.stock_in_quantity
  }
  recalcAllLines()
}
const handleLinePriceChange = (line: any) => { recalcAllLines() }

const handleOpenCreate = () => {
  isEditing.value = false
  Object.assign(formData, emptyForm())
  availableDetails.value = []
  loadSuppliers()
  formResetDrag()
  formVisible.value = true
}

const handleOpenEdit = async (record: any) => {
  if (record.approval_status === '已审批') {
    Modal.confirm({
      title: '编辑已审批发票',
      content: `发票 ${record.invoice_number} 已审批，编辑将自动撤消审批状态。是否继续？`,
      okText: '继续编辑',
      cancelText: '取消',
      onOk: () => doOpenEdit(record)
    })
  } else {
    doOpenEdit(record)
  }
}

const doOpenEdit = async (record: any) => {
  isEditing.value = true
  formResetDrag()
  formVisible.value = true
  loadSuppliers()
  try {
    const res: any = await getPurchaseInvoiceDetail(record.invoice_number)
    if (res?.success) {
      const data = res.data
      Object.assign(formData, {
        invoice_number: data.invoice_number,
        invoice_code: data.invoice_code || '',
        invoice_no: data.invoice_no || '',
        invoice_type: data.invoice_type || '',
        supplier_number: data.supplier_number || '',
        supplier_name: data.supplier_name || '',
        invoice_title: data.invoice_title || '',
        tax_id: data.tax_id || '',
        invoice_address: data.invoice_address || '',
        invoice_phone: data.invoice_phone || '',
        bank_name: data.bank_name || '',
        bank_account_number: data.bank_account_number || '',
        invoice_date: data.invoice_date ? dayjs(data.invoice_date).format('YYYY-MM-DD') : '',
        tax_rate: data.tax_rate || 0,
        amount_without_tax: data.amount_without_tax || 0,
        tax_amount: data.tax_amount || 0,
        amount_with_tax: data.amount_with_tax || 0,
        currency_code: data.currency_code || 'CNY',
        remark: data.remark || '',
        lines: (data.lines || []).map((l: any) => ({ ...l }))
      })
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '加载发票信息失败')
  }
}

const handleFormSubmit = async () => {
  if (!formData.supplier_number) { message.warning('请选择供应商'); return }
  if (!formData.invoice_date) { message.warning('请选择开票日期'); return }
  if (formData.lines.length === 0) { message.warning('请至少添加一条入库明细行'); return }

  for (const line of formData.lines) {
    if (!line.invoice_quantity || line.invoice_quantity <= 0) {
      message.warning(`物料 ${line.item_number} 的开票数量必须大于0`)
      return
    }
  }

  formLoading.value = true
  try {
    let res: any
    if (isEditing.value) {
      res = await updatePurchaseInvoice(formData.invoice_number, formData)
    } else {
      res = await createPurchaseInvoice(formData)
    }
    if (res?.success) {
      message.success(isEditing.value ? '发票更新成功' : `发票创建成功: ${res.data?.invoice_number || ''}`)
      formVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '操作失败')
  } finally {
    formLoading.value = false
  }
}

// ==================== 详情弹窗 ====================
const detailVisible = ref(false)
const { modalStyle: detailModalStyle, onDragStart: detailDragStart, resetDrag: detailResetDrag } = useModalDrag()
const detailLoading = ref(false)
const detailHeader = ref<any>({})
const detailLines = ref<any[]>([])

const handleViewDetail = async (record: any) => {
  detailResetDrag()
  detailVisible.value = true
  detailLoading.value = true
  try {
    const res: any = await getPurchaseInvoiceDetail(record.invoice_number)
    if (res?.success) {
      detailHeader.value = res.data
      detailLines.value = res.data.lines || []
    }
  } catch { message.error('获取发票详情失败') }
  finally { detailLoading.value = false }
}

// ==================== 审批/撤消 ====================
const handleApprove = (record: any) => {
  Modal.confirm({
    title: '审批确认',
    content: `审批发票 ${record.invoice_number} 后，关联的入库明细行开票状态将自动更新。确认审批？`,
    okText: '确认审批',
    cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await approvePurchaseInvoice(record.invoice_number)
        if (res?.success) { message.success('审批成功'); fetchData() }
      } catch (err: any) { message.error(err.response?.data?.message || '审批失败') }
    }
  })
}

const handleWithdraw = (record: any) => {
  Modal.confirm({
    title: '撤消审批',
    content: `撤消发票 ${record.invoice_number} 的审批后，关联的入库明细行开票状态将自动更新。确认撤消？`,
    okText: '撤消',
    cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await withdrawPurchaseInvoice(record.invoice_number)
        if (res?.success) { message.success('撤消成功'); fetchData() }
      } catch (err: any) { message.error(err.response?.data?.message || '撤消失败') }
    }
  })
}

// ==================== 删除 ====================
const handleDelete = (record: any) => {
  Modal.confirm({
    title: '删除确认',
    content: `确认删除发票 ${record.invoice_number}？`,
    okText: '删除',
    okType: 'danger' as any,
    cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await deletePurchaseInvoice(record.invoice_number)
        if (res?.success) { message.success('发票已删除'); fetchData() }
      } catch (err: any) { message.error(err.response?.data?.message || '删除失败') }
    }
  })
}

// ==================== 明细行表格列 ====================
const lineColumns = [
  { title: '入库单号', dataIndex: 'stock_in_number', width: 150 },
  { title: '采购订单号', dataIndex: 'purchase_order_number', width: 150 },
  { title: '物料编号', dataIndex: 'item_number', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', width: 140 },
  { title: '规格', dataIndex: 'specifications', width: 100 },
  { title: '单位', dataIndex: 'basic_unit', width: 60 },
  { title: '入库数量', dataIndex: 'stock_in_quantity', width: 90 },
  { title: '开票数量', dataIndex: 'invoice_quantity', width: 90 },
  { title: '单价', dataIndex: 'unit_price', width: 90 },
  { title: '不含税金额', dataIndex: 'amount_without_tax', width: 110 },
  { title: '税率(%)', dataIndex: 'tax_rate', width: 80 },
  { title: '税额', dataIndex: 'tax_amount', width: 90 },
  { title: '价税合计', dataIndex: 'amount_with_tax', width: 110 },
  { title: '备注', dataIndex: 'remark', width: 120 }
]

onMounted(async () => {
  await loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <!-- 工具栏 -->
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px">
      <div style="display: flex; gap: 8px; align-items: center">
        <span style="font-size: 18px; font-weight: 600; color: #1a1a2e; margin-right: 4px; white-space: nowrap">采购发票</span>
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索发票编号/代码/号码/供应商名称"
          style="width: 360px"
          @search="handleSearch"
          @pressEnter="handleSearch"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
        <a-select v-model:value="filterApprovalStatus" placeholder="审批状态" style="width: 120px" allow-clear @change="handleSearch">
          <a-select-option value="草稿">草稿</a-select-option>
          <a-select-option value="已审批">已审批</a-select-option>
        </a-select>
        <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
        <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
      </div>
      <a-button type="primary" @click="handleOpenCreate"><PlusOutlined /> 新建发票</a-button>
    </div>

    <!-- 列表 -->
    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      row-key="invoice_number"
      :scroll="{ x: 2000 }"
      size="small"
      bordered
      @change="handleTableChange"
      @resizeColumn="handleResizeColumn"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'approval_status'">
          <ApprovalStatusTag :status="record.approval_status" />
        </template>
        <template v-else-if="column.key === 'invoice_date'">
          {{ formatDate(record.invoice_date) }}
        </template>
        <template v-else-if="column.key === 'created_at'">
          {{ formatDateTime(record.created_at) }}
        </template>
        <template v-else-if="column.key === 'amount_without_tax' || column.key === 'tax_amount' || column.key === 'amount_with_tax'">
          {{ Number(record[column.dataIndex] || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="handleViewDetail(record)">
              <EyeOutlined /> 详情
            </a-button>
            <a-dropdown :trigger="['click']">
              <a @click.stop>更多 <DownOutlined style="font-size: 10px; margin-left: 2px;" /></a>
              <template #overlay>
                <a-menu>
                  <a-menu-item @click="handleOpenEdit(record)"><EditOutlined /> 编辑</a-menu-item>
                  <a-menu-item v-if="record.approval_status === '草稿'"
                    @click="handleApprove(record)"><CheckOutlined /> 审批</a-menu-item>
                  <a-menu-item v-if="record.approval_status === '已审批'"
                    @click="handleWithdraw(record)"><UndoOutlined /> 撤消审批</a-menu-item>
                  <a-menu-divider />
                  <a-menu-item v-if="record.approval_status === '草稿'"
                    @click="handleDelete(record)" style="color: #ff4d4f">
                    <DeleteOutlined /> 删除</a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 新建/编辑弹窗 -->
    <a-modal
      v-model:open="formVisible"
      width="1300px"
      :style="formModalStyle"
      :footer="null"
      :bodyStyle="{ maxHeight: '82vh', overflowY: 'auto' }"
    >
      <template #title>
        <div class="drag-handle" @mousedown="formDragStart">{{ isEditing ? '编辑采购发票' : '新建采购发票' }}</div>
      </template>
      <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 18 }" style="margin-top: 16px">
        <!-- 发票主信息 -->
        <a-divider orientation="left">发票信息</a-divider>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="发票代码">
              <a-input v-model:value="formData.invoice_code" placeholder="税务发票代码" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="发票号码">
              <a-input v-model:value="formData.invoice_no" placeholder="税务发票号码" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="发票类型">
              <a-select v-model:value="formData.invoice_type" placeholder="选择发票类型">
                <a-select-option value="增值税专用发票">增值税专用发票</a-select-option>
                <a-select-option value="增值税普通发票">增值税普通发票</a-select-option>
                <a-select-option value="电子发票">电子发票</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="供应商" required>
              <a-select
                v-model:value="formData.supplier_number"
                placeholder="搜索供应商"
                show-search
                :filter-option="false"
                :loading="supplierLoading"
                @search="loadSuppliers"
                @change="handleSupplierChange"
              >
                <a-select-option v-for="s in supplierOptions" :key="s.supplier_number" :value="s.supplier_number">
                  {{ s.supplier_name }} ({{ s.supplier_number }})
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="开票日期" required>
              <a-date-picker v-model:value="formData.invoice_date" valueFormat="YYYY-MM-DD" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="税率(%)">
              <a-input-number v-model:value="formData.tax_rate" :min="0" :max="100" :precision="2" style="width: 100%" @change="handleTaxRateChange" />
            </a-form-item>
          </a-col>
        </a-row>

        <!-- 开票信息（从供应商带入） -->
        <a-divider orientation="left">开票信息</a-divider>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="开票抬头">
              <a-input v-model:value="formData.invoice_title" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="纳税人识别号">
              <a-input v-model:value="formData.tax_id" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="开户银行">
              <a-input v-model:value="formData.bank_name" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="银行账号">
              <a-input v-model:value="formData.bank_account_number" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="开票地址">
              <a-input v-model:value="formData.invoice_address" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="开票电话">
              <a-input v-model:value="formData.invoice_phone" />
            </a-form-item>
          </a-col>
        </a-row>

        <!-- 入库明细行 -->
        <a-divider orientation="left">
          入库明细行
          <span style="font-size: 12px; color: #888; margin-left: 8px">
            (共 {{ formData.lines.length }} 行)
          </span>
        </a-divider>
        <div style="margin-bottom: 8px; display: flex; justify-content: space-between">
          <a-button type="dashed" @click="handleOpenSelectDetail" :disabled="!formData.supplier_number">
            <PlusOutlined /> 添加入库明细行
          </a-button>
          <div style="font-size: 13px; color: #666">
            不含税: <b>{{ formData.amount_without_tax.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}</b>
            &nbsp;|&nbsp; 税额: <b>{{ formData.tax_amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}</b>
            &nbsp;|&nbsp; 价税合计: <b style="color: #1890ff">{{ formData.amount_with_tax.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}</b>
          </div>
        </div>

        <a-table
          :data-source="formData.lines"
          :pagination="false"
          row-key="stock_in_detail_id"
          size="small"
          bordered
          :scroll="{ x: 1600 }"
        >
          <a-table-column title="入库单号" dataIndex="stock_in_number" :width="140" />
          <a-table-column title="物料编号" dataIndex="item_number" :width="110" />
          <a-table-column title="物料名称" dataIndex="item_name" :width="120" ellipsis />
          <a-table-column title="规格" dataIndex="specifications" :width="90" />
          <a-table-column title="单位" dataIndex="basic_unit" :width="55" />
          <a-table-column title="入库数量" dataIndex="stock_in_quantity" :width="80" />
          <a-table-column title="开票数量" :width="100">
            <template #default="{ record }">
              <a-input-number v-model:value="record.invoice_quantity" :min="0" :max="record.stock_in_quantity" :precision="2" size="small" style="width: 85px" @change="handleLineQtyChange(record)" />
            </template>
          </a-table-column>
          <a-table-column title="单价(未税)" :width="100">
            <template #default="{ record }">
              <a-input-number v-model:value="record.unit_price" :min="0" :precision="4" size="small" style="width: 90px" @change="handleLinePriceChange(record)" />
            </template>
          </a-table-column>
          <a-table-column title="不含税金额" dataIndex="amount_without_tax" :width="100" align="right">
            <template #default="{ record }">
              {{ Number(record.amount_without_tax || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}
            </template>
          </a-table-column>
          <a-table-column title="税额" dataIndex="tax_amount" :width="90" align="right">
            <template #default="{ record }">
              {{ Number(record.tax_amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}
            </template>
          </a-table-column>
          <a-table-column title="价税合计" dataIndex="amount_with_tax" :width="100" align="right">
            <template #default="{ record }">
              {{ Number(record.amount_with_tax || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}
            </template>
          </a-table-column>
          <a-table-column title="操作" :width="60" fixed="right">
            <template #default="{ index }">
              <a-button type="link" danger size="small" @click="handleRemoveLine(index)">删除</a-button>
            </template>
          </a-table-column>
        </a-table>

        <a-row :gutter="16" style="margin-top: 12px">
          <a-col :span="16">
            <a-form-item label="备注" :label-col="{ span: 2 }" :wrapper-col="{ span: 22 }">
              <a-textarea v-model:value="formData.remark" :rows="2" placeholder="备注说明" />
            </a-form-item>
          </a-col>
        </a-row>

        <!-- 提交按钮 -->
        <div style="text-align: right; margin-top: 12px">
          <a-space>
            <a-button @click="formVisible = false">取消</a-button>
            <a-button type="primary" @click="handleFormSubmit" :loading="formLoading" :disabled="formData.lines.length === 0">
              {{ isEditing ? '保存' : '创建发票' }}
            </a-button>
          </a-space>
        </div>
      </a-form>
    </a-modal>

    <!-- 选择入库明细行弹窗 -->
    <a-modal
      v-model:open="selectDetailVisible"
      width="1000px"
      title="选择入库明细行"
      @ok="handleConfirmSelectDetails"
      ok-text="确认选择"
      cancel-text="取消"
    >
      <a-table
        :data-source="availableDetails"
        :pagination="false"
        :row-selection="{ selectedRowKeys: selectedDetailKeys, onChange: (keys: any) => selectedDetailKeys = keys }"
        row-key="id"
        size="small"
        bordered
        :loading="availableLoading"
        :scroll="{ y: 400 }"
      >
        <a-table-column title="入库单号" dataIndex="stock_in_number" :width="150" />
        <a-table-column title="采购订单号" dataIndex="purchase_order_number" :width="150" />
        <a-table-column title="物料编号" dataIndex="item_number" :width="110" />
        <a-table-column title="物料名称" dataIndex="item_name" :width="130" ellipsis />
        <a-table-column title="规格" dataIndex="specifications" :width="100" />
        <a-table-column title="单位" dataIndex="basic_unit" :width="60" />
        <a-table-column title="入库数量" dataIndex="stock_in_quantity" :width="90" />
        <a-table-column title="可开票数量" dataIndex="available_qty" :width="100">
          <template #default="{ record }">
            <span style="color: #52c41a; font-weight: 600">{{ record.available_qty }}</span>
          </template>
        </a-table-column>
      </a-table>
    </a-modal>

    <!-- 详情弹窗 -->
    <a-modal v-model:open="detailVisible" width="1200px" :footer="null"
      :style="detailModalStyle"
      :bodyStyle="{ maxHeight: '80vh', overflowY: 'auto' }">
      <template #title>
        <div class="drag-handle" @mousedown="detailDragStart">采购发票详情</div>
      </template>
      <a-spin :spinning="detailLoading">
        <a-descriptions bordered :column="3" size="small" style="margin-bottom: 16px">
          <a-descriptions-item label="发票编号">{{ detailHeader.invoice_number }}</a-descriptions-item>
          <a-descriptions-item label="发票代码">{{ detailHeader.invoice_code || '-' }}</a-descriptions-item>
          <a-descriptions-item label="发票号码">{{ detailHeader.invoice_no || '-' }}</a-descriptions-item>
          <a-descriptions-item label="发票类型">{{ detailHeader.invoice_type || '-' }}</a-descriptions-item>
          <a-descriptions-item label="供应商名称">{{ detailHeader.supplier_name }}</a-descriptions-item>
          <a-descriptions-item label="开票日期">{{ formatDate(detailHeader.invoice_date) }}</a-descriptions-item>
          <a-descriptions-item label="开票抬头" :span="2">{{ detailHeader.invoice_title || '-' }}</a-descriptions-item>
          <a-descriptions-item label="审批状态">
            <ApprovalStatusTag :status="detailHeader.approval_status" />
          </a-descriptions-item>
          <a-descriptions-item label="纳税人识别号">{{ detailHeader.tax_id || '-' }}</a-descriptions-item>
          <a-descriptions-item label="开票地址">{{ detailHeader.invoice_address || '-' }}</a-descriptions-item>
          <a-descriptions-item label="开票电话">{{ detailHeader.invoice_phone || '-' }}</a-descriptions-item>
          <a-descriptions-item label="开户银行">{{ detailHeader.bank_name || '-' }}</a-descriptions-item>
          <a-descriptions-item label="银行账号">{{ detailHeader.bank_account_number || '-' }}</a-descriptions-item>
          <a-descriptions-item label="币种">{{ detailHeader.currency_code || 'CNY' }}</a-descriptions-item>
          <a-descriptions-item label="税率(%)">{{ detailHeader.tax_rate }}</a-descriptions-item>
          <a-descriptions-item label="不含税金额">
            <b>{{ Number(detailHeader.amount_without_tax || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}</b>
          </a-descriptions-item>
          <a-descriptions-item label="税额">
            {{ Number(detailHeader.tax_amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}
          </a-descriptions-item>
          <a-descriptions-item label="价税合计">
            <b style="color: #1890ff">{{ Number(detailHeader.amount_with_tax || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}</b>
          </a-descriptions-item>
          <a-descriptions-item label="创建人">{{ detailHeader.created_by || '-' }}</a-descriptions-item>
          <a-descriptions-item label="创建时间">{{ formatDateTime(detailHeader.created_at) }}</a-descriptions-item>
          <a-descriptions-item label="备注" :span="3">{{ detailHeader.remark || '-' }}</a-descriptions-item>
        </a-descriptions>

        <div style="font-weight: 600; margin-bottom: 8px">入库明细行</div>
        <a-table
          :columns="lineColumns"
          :data-source="detailLines"
          :pagination="false"
          row-key="id"
          size="small"
          bordered
          :scroll="{ x: 1600 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'amount_without_tax' || column.dataIndex === 'tax_amount' || column.dataIndex === 'amount_with_tax'">
              {{ Number(record[column.dataIndex] || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-modal>

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
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
