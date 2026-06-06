<script setup lang="ts">
import { ref, reactive, computed, h, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ExclamationCircleOutlined, PlusOutlined, ReloadOutlined, DownloadOutlined, UploadOutlined, DeleteOutlined, EyeOutlined, EditOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { getSalesOrders, getSalesOrderDetail, createSalesOrder, updateSalesOrder, deleteSalesOrder, exportSalesOrders, importSalesOrders, addSalesOrderDetail, updateSalesOrderDetail, deleteSalesOrderDetail } from '@/api/sales/salesOrder'
import { getCustomers } from '@/api/master-data/customer'
import { getItems } from '@/api/master-data/itemMaster'
import { getCustomerMaterialMappings, reverseLookupProduct } from '@/api/master-data/customerMaterialMapping'
import { getSalesPriceForOrder } from '@/api/sales/salesPrice'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval, batchSubmitForApproval, batchApproveRecords, batchWithdrawApproval, batchReverseApproval } from '@/api/system/approval'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ApprovalLogModal from '@/components/Common/ApprovalLogModal.vue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import ManualCloseModal from '@/components/Common/ManualCloseModal.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import dayjs from 'dayjs'
import { CONDITION_STATUS } from '@/constants/statuses'
import { useTableList } from '@/composables/useTableList'
import { generateExportFilename } from '@/utils/exportFilename'
import { useModalDrag } from '@/composables/useModalDrag'

// ==================== 类型定义 ====================
interface SalesOrderHeader {
  sales_order_number: string
  customer_number: string
  customer_name: string
  head_of_sales: string
  head_of_sales_id?: number | null
  linkman: string
  contacts: string
  order_date: string | null
  delivery_date: string | null
  order_status: string
  condition: string
  approval_status: string
  remark: string
  creation_date: string
  creation_man: string
  customer_po_number: string
  factory_id?: number | null
  factory_name?: string
  factory_short?: string
}

interface SalesOrderDetail {
  id?: number
  sales_order_number?: string
  line_number: number
  item_number: string
  item_name: string
  specifications: string
  basic_unit: string
  product_drawing_number: string
  order_quantity: number
  unit_price: number
  tax_rate: number
  total_amount: number
  delivery_date: string | null
  promised_delivery_date: string | null
  remark: string
  status: string
  shipping_status: string
  production_status: string
  return_status: string
  customer_item_number?: string
  customer_item_description?: string
}

const emptyHeader = (): SalesOrderHeader => ({
  sales_order_number: '',
  customer_number: '',
  customer_name: '',
  head_of_sales: '',
  head_of_sales_id: null,
  linkman: '',
  contacts: '',
  order_date: null,
  delivery_date: null,
  order_status: '待执行',
  condition: CONDITION_STATUS.ENABLED,
  approval_status: '草稿',
  remark: '',
  creation_date: '',
  creation_man: '',
  customer_po_number: ''
})

const emptyDetail = (): SalesOrderDetail => ({
  line_number: 0,
  item_number: '',
  item_name: '',
  specifications: '',
  basic_unit: '',
  product_drawing_number: '',
  order_quantity: 0,
  unit_price: 0,
  tax_rate: 0,
  total_amount: 0,
  delivery_date: null,
  promised_delivery_date: null,
  remark: '',
  status: '未开始',
  shipping_status: '未申请',
  production_status: '未加入计划',
  return_status: '未申请',
  customer_item_number: '',
  customer_item_description: ''
})

// ==================== 状态 ====================

const editLoading = ref(false)
const createLoading = ref(false)
const importLoading = ref(false)


const approvalFilter = ref('')

const fileInputRef = ref<HTMLInputElement | null>(null)

// 分页


// 审批日志弹窗
const approvalLogVisible = ref(false)
const approvalLogModule = ref('')
const approvalLogRecordId = ref('')

// 新建弹窗
const { loading, dataSource, searchText, pagination, selectedRowKeys, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getSalesOrders)

const createModalVisible = ref(false)
const createForm = reactive<SalesOrderHeader>(emptyHeader())
const createDetails = ref<SalesOrderDetail[]>([])
const createOrderDate = ref<any>(null)
const createDeliveryDate = ref<any>(null)

// 编辑弹窗
const editModalVisible = ref(false)
const editForm = reactive<SalesOrderHeader>(emptyHeader())
const editDetails = ref<SalesOrderDetail[]>([])
const editOrderDate = ref<any>(null)
const editDeliveryDate = ref<any>(null)

// 头部交货日期是否失效（任一明细行有自己的交货日期时变灰）
const createHeaderDeliveryDisabled = computed(() => createDetails.value.some(d => !!d.delivery_date))
const editHeaderDeliveryDisabled = computed(() => editDetails.value.some(d => !!d.delivery_date))
const editIsApproved = computed(() => editForm.approval_status === '已审批')

// 详情弹窗中：头部交货日期与明细行交货日期是否存在不一致
const detailViewHasMultiDelivery = computed(() => {
  const headerDate = detailViewRecord.value.delivery_date ? dayjs(detailViewRecord.value.delivery_date).format('YYYY-MM-DD') : null
  if (!headerDate || detailViewDetails.value.length === 0) return false
  return detailViewDetails.value.some(d => {
    if (!d.delivery_date) return false
    const detailDate = dayjs(d.delivery_date).format('YYYY-MM-DD')
    return detailDate !== headerDate
  })
})

// 客户搜索
const customerOptions = ref<any[]>([])
let customerSearchTimer: any = null

// 产品搜索
const productOptions = ref<any[]>([])
let productSearchTimer: any = null

// 详情弹窗
const detailViewVisible = ref(false)
const detailViewLoading = ref(false)
const detailViewRecord = ref<SalesOrderHeader>(emptyHeader())
const detailViewDetails = ref<SalesOrderDetail[]>([])
const detailViewTab = ref('info')
const { modalStyle: detailModalStyle, onDragStart: detailDragStart, resetDrag: detailResetDrag } = useModalDrag()
const { modalStyle: createModalStyle, onDragStart: createDragStart, resetDrag: createResetDrag } = useModalDrag()

// 详情弹窗 - 明细编辑（草稿和已审批状态可用）
const detailViewEditable = computed(() => detailViewRecord.value.approval_status === '草稿' || detailViewRecord.value.approval_status === '已审批')
const detailViewIsApproved = computed(() => detailViewRecord.value.approval_status === '已审批')
const dvDetailCreateVisible = ref(false)
const dvDetailEditVisible = ref(false)
const dvDetailCreateForm = reactive<SalesOrderDetail>(emptyDetail())
const dvDetailEditForm = reactive<SalesOrderDetail>(emptyDetail())
const dvDetailSaving = ref(false)
const dvCreateDeliveryDate = ref<any>(null)
const dvEditDeliveryDate = ref<any>(null)
const dvCreatePromisedDeliveryDate = ref<any>(null)
const dvEditPromisedDeliveryDate = ref<any>(null)

// ==================== 表格列定义 ====================
const defaultDataColumns: any[] = [
  { title: '销售订单编号', dataIndex: 'sales_order_number', key: 'sales_order_number', width: 130, resizable: true },
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '客户编号', dataIndex: 'customer_number', key: 'customer_number', width: 120, resizable: true },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 160, resizable: true },
  { title: '销售负责人', dataIndex: 'head_of_sales', key: 'head_of_sales', width: 110, resizable: true },
  { title: '联系人', dataIndex: 'linkman', key: 'linkman', width: 100, resizable: true },
  { title: '订单日期', dataIndex: 'order_date', key: 'order_date', width: 110, resizable: true },
  { title: '交货日期', dataIndex: 'delivery_date', key: 'delivery_date', width: 110, resizable: true },
  { title: '客户采购订单号', dataIndex: 'customer_po_number', key: 'customer_po_number', width: 140, resizable: true },
  { title: '订单状态', dataIndex: 'order_status', key: 'order_status', width: 100, resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('sales_order_list', defaultDataColumns)

// 明细列（可排序数据列，不含固定的行号和操作列）
const defaultDetailDataColumns = [
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 120, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 80, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 55, resizable: true },
  { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number', width: 110, resizable: true },
  { title: '订单数量', dataIndex: 'order_quantity', key: 'order_quantity', width: 80, resizable: true },
  { title: '含税单价', dataIndex: 'unit_price', key: 'unit_price', width: 65, resizable: true },
  { title: '税率(%)', dataIndex: 'tax_rate', key: 'tax_rate', width: 55, resizable: true },
  { title: '金额', dataIndex: 'total_amount', key: 'total_amount', width: 90, resizable: true },
  { title: '交货日期', dataIndex: 'delivery_date', key: 'delivery_date', width: 115, resizable: true },
  { title: '承诺交货日期', dataIndex: 'promised_delivery_date', key: 'promised_delivery_date', width: 115, resizable: true },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90, resizable: true },
  { title: '发货状态', dataIndex: 'shipping_status', key: 'shipping_status', width: 100, resizable: true },
  { title: '生产状态', dataIndex: 'production_status', key: 'production_status', width: 110, resizable: true },
  { title: '退货状态', dataIndex: 'return_status', key: 'return_status', width: 90, resizable: true },
  { title: '开票状态', dataIndex: 'invoice_status', key: 'invoice_status', width: 90, resizable: true },
  { title: '客户物料号', dataIndex: 'customer_item_number', key: 'customer_item_number', width: 120, resizable: true },
  { title: '客户物料描述', dataIndex: 'customer_item_description', key: 'customer_item_description', width: 140, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 100, resizable: true },
]

const {
  columns: detailColumns,
  columnSettingVisible: detailColumnSettingVisible,
  columnSettingList: detailColumnSettingList,
  columnSettingSaving: detailColumnSettingSaving,
  openColumnSetting: openDetailColumnSetting,
  moveColumnUp: moveDetailColumnUp,
  moveColumnDown: moveDetailColumnDown,
  saveColumnSetting: saveDetailColumnSetting,
  resetColumnSetting: resetDetailColumnSetting,
  loadColumnPreference: loadDetailColumnPreference,
  handleResizeColumn: handleDetailResizeColumn
} = useColumnPreference('sales_order_detail', defaultDetailDataColumns, {
  fixedLeft: [{ title: '行号', dataIndex: 'line_number', key: 'line_number', width: 50, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 50, fixed: 'right' as const }]
})

// 详情弹窗明细列（草稿状态时自动追加操作列）
const detailViewBaseColumns = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 50 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 140, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 160, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 140, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 70, resizable: true },
  { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number', width: 120, resizable: true },
  { title: '订单数量', dataIndex: 'order_quantity', key: 'order_quantity', width: 100, resizable: true },
  { title: '含税单价', dataIndex: 'unit_price', key: 'unit_price', width: 100, resizable: true },
  { title: '税率(%)', dataIndex: 'tax_rate', key: 'tax_rate', width: 70, resizable: true },
  { title: '金额', dataIndex: 'total_amount', key: 'total_amount', width: 120, resizable: true },
  { title: '交货日期', dataIndex: 'delivery_date', key: 'delivery_date', width: 130, resizable: true },
  { title: '承诺交货日期', dataIndex: 'promised_delivery_date', key: 'promised_delivery_date', width: 130, resizable: true },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90, resizable: true },
  { title: '发货状态', dataIndex: 'shipping_status', key: 'shipping_status', width: 100, resizable: true },
  { title: '生产状态', dataIndex: 'production_status', key: 'production_status', width: 110, resizable: true },
  { title: '退货状态', dataIndex: 'return_status', key: 'return_status', width: 100, resizable: true },
  { title: '开票状态', dataIndex: 'invoice_status', key: 'invoice_status', width: 100, resizable: true },
  { title: '客户物料号', dataIndex: 'customer_item_number', key: 'customer_item_number', width: 130, resizable: true },
  { title: '客户物料描述', dataIndex: 'customer_item_description', key: 'customer_item_description', width: 150, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, resizable: true }
]
const detailViewColumns = computed(() => {
  if (detailViewEditable.value) {
    return [...detailViewBaseColumns, { title: '操作', key: 'dv_action', width: 90, fixed: 'right' as const }]
  }
  return detailViewBaseColumns
})

// ==================== 数据获取 ====================

onMounted(async () => {
  await loadColumnPreference()
  await loadDetailColumnPreference()
  fetchData()
})





const handleCustomerSearch = async (val: string) => {
  if (customerSearchTimer) clearTimeout(customerSearchTimer)
  if (!val || val.length < 1) { customerOptions.value = []; return }
  customerSearchTimer = setTimeout(async () => {
    try {
      const res: any = await getCustomers({ search: val, limit: 20 })
      if (res?.success) {
        customerOptions.value = res.data.items.map((c: any) => ({
          value: c.customer_number,
          label: `${c.customer_number} - ${c.customer_name}`,
          raw: c
        }))
      }
    } catch {}
  }, 300)
}

const handleCustomerSelect = (val: string, form: SalesOrderHeader) => {
  form.customer_number = val
  const found = customerOptions.value.find(o => o.value === val)
  if (found) {
    form.customer_name = found.raw.customer_name || ''
    form.head_of_sales = found.raw.head_of_sales || ''
    form.head_of_sales_id = found.raw.head_of_sales_id || null
    form.linkman = found.raw.linkman || ''
    form.contacts = found.raw.contacts || ''
    // 客户税率带入明细行
    const customerTaxRate = found.raw.sales_tax_rate
    if (customerTaxRate !== undefined && customerTaxRate !== null) {
      const details = form === createForm ? createDetails.value : editDetails.value
      details.forEach(d => {
        if (!d.tax_rate) d.tax_rate = customerTaxRate
      })
    }
  }
}

// ==================== 产品自动完成（明细行） ====================
const handleProductSearch = (val: string) => {
  if (productSearchTimer) clearTimeout(productSearchTimer)
  if (!val || val.length < 1) { productOptions.value = []; return }
  productSearchTimer = setTimeout(async () => {
    try {
      const res: any = await getItems({ search: val, item_type: '成品', limit: 20 })
      if (res?.success) {
        productOptions.value = res.data.items.map((p: any) => ({
          value: p.item_number,
          label: `${p.item_number} - ${p.item_name}`,
          raw: p
        }))
      }
    } catch {}
  }, 300)
}

const handleProductSelect = async (val: string, detail: SalesOrderDetail) => {
  detail.item_number = val
  const found = productOptions.value.find(o => o.value === val)
  if (found) {
    detail.item_name = found.raw.item_name || ''
    detail.specifications = found.raw.specifications || ''
    detail.basic_unit = found.raw.basic_unit || ''
    detail.product_drawing_number = found.raw.product_drawing_number || ''
  }
  // 自动查询客户物料对照信息
  const customerNumber = detailViewRecord.value.customer_number || createForm.customer_number || editForm.customer_number
  if (customerNumber && val) {
    try {
      const res: any = await getCustomerMaterialMappings({ customer_number: customerNumber, item_number: val, approval_status: '已审核', limit: 1 })
      if (res?.success && res.data.items?.length > 0) {
        const cm = res.data.items[0]
        ;(detail as any).customer_item_number = cm.customer_item_number || ''
        ;(detail as any).customer_item_description = cm.customer_item_description || ''
      } else {
        ;(detail as any).customer_item_number = ''
        ;(detail as any).customer_item_description = ''
      }
    } catch {
      ;(detail as any).customer_item_number = ''
      ;(detail as any).customer_item_description = ''
    }
    // 自动查询销售价目表价格
    try {
      const priceRes: any = await getSalesPriceForOrder({ customer_number: customerNumber, item_number: val })
      if (priceRes?.success && priceRes.data) {
        detail.unit_price = priceRes.data.unit_price || 0
        detail.tax_rate = priceRes.data.tax_rate || 0
        calcAmount(detail)
      } else {
        detail.unit_price = 0
        detail.tax_rate = 0
        calcAmount(detail)
      }
    } catch {
      detail.unit_price = 0
      detail.tax_rate = 0
      calcAmount(detail)
    }
  }
}

// 反向查询：根据客户物料号查找产品信息
const handleCustomerItemNumberChange = async (customerItemNumber: string, detail: SalesOrderDetail) => {
  if (!customerItemNumber) return
  const customerNumber = detailViewRecord.value.customer_number || createForm.customer_number || editForm.customer_number
  if (!customerNumber) return
  
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

// 金额自动计算
const calcAmount = (detail: SalesOrderDetail) => {
  const qty = parseFloat(String(detail.order_quantity)) || 0
  const price = parseFloat(String(detail.unit_price)) || 0
  detail.total_amount = Math.round(qty * price * 100) / 100
}

// ==================== 日期工具 ====================
const formatDate = (date: string | null) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}

// ==================== 新建 ====================
const handleCreate = () => {
  Object.assign(createForm, emptyHeader())
  createDetails.value = []
  createOrderDate.value = null
  createDeliveryDate.value = null
  createResetDrag()
  createModalVisible.value = true
}

const handleAddCreateDetail = () => {
  const maxLine = createDetails.value.length > 0
    ? Math.max(...createDetails.value.map(d => d.line_number))
    : 0
  const defaultDelivery = createDeliveryDate.value ? dayjs(createDeliveryDate.value).format('YYYY-MM-DD') : null
  const newLine = { ...emptyDetail(), line_number: maxLine + 10, delivery_date: defaultDelivery }
  // 已选客户时，新行带入客户税率
  if (createForm.customer_number && !newLine.tax_rate) {
    const found = customerOptions.value.find(o => o.value === createForm.customer_number)
    if (found?.raw?.sales_tax_rate) newLine.tax_rate = found.raw.sales_tax_rate
  }
  createDetails.value.push(newLine)
}

const handleRemoveCreateDetail = (index: number) => {
  createDetails.value.splice(index, 1)
}

const handleCreateSubmit = async () => {
  if (!createForm.customer_number) { message.warning('请选择客户'); return }
  // 校验明细行单价
  const emptyPriceDetails = createDetails.value.filter(d => !d.item_number || (d.unit_price || 0) <= 0)
  if (emptyPriceDetails.length > 0) {
    const lines = emptyPriceDetails.map(d => d.line_number).join(', ')
    message.warning(`明细行行号 ${lines} 未录入含税单价，请手工录入价格信息后保存`)
    return
  }
  createLoading.value = true
  try {
    const data = {
      ...createForm,
      order_date: createOrderDate.value ? dayjs(createOrderDate.value).format('YYYY-MM-DD') : null,
      delivery_date: createDeliveryDate.value ? dayjs(createDeliveryDate.value).format('YYYY-MM-DD') : null,
      details: createDetails.value
    }
    const res: any = await createSalesOrder(data)
    if (res?.success) {
      message.success(`创建成功，编号: ${res.data.sales_order_number}`)
      createModalVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '创建失败')
  } finally {
    createLoading.value = false
  }
}

// ==================== 详情查看 ====================
const handleViewDetail = async (record: SalesOrderHeader) => {
  detailViewRecord.value = { ...record }
  detailViewTab.value = 'info'
  detailViewDetails.value = []
  detailViewVisible.value = true
  detailResetDrag()
  detailViewLoading.value = true
  try {
    const res: any = await getSalesOrderDetail(record.sales_order_number)
    if (res?.success) {
      detailViewRecord.value = { ...res.data.header }
      detailViewDetails.value = (res.data.details || []).map((d: any, i: number) => ({ ...d, _idx: i + 1 }))
    }
  } catch {
    message.error('获取订单详情失败')
  } finally {
    detailViewLoading.value = false
  }
}

// 刷新详情弹窗中的明细数据
const refreshDetailViewDetails = async () => {
  if (!detailViewRecord.value.sales_order_number) return
  try {
    const res: any = await getSalesOrderDetail(detailViewRecord.value.sales_order_number)
    if (res?.success) {
      detailViewDetails.value = (res.data.details || []).map((d: any, i: number) => ({ ...d, _idx: i + 1 }))
    }
  } catch {
    message.error('刷新明细失败')
  }
}

// 详情弹窗中 - 新增明细行
const handleDvDetailCreate = () => {
  Object.assign(dvDetailCreateForm, emptyDetail())
  const maxLine = detailViewDetails.value.length > 0
    ? Math.max(...detailViewDetails.value.map((d: any) => d.line_number || 0))
    : 0
  dvDetailCreateForm.line_number = maxLine + 10
  dvCreateDeliveryDate.value = detailViewRecord.value.delivery_date ? dayjs(detailViewRecord.value.delivery_date) : null
  dvCreatePromisedDeliveryDate.value = null
  dvDetailCreateVisible.value = true
}
const handleDvDetailCreateOk = async () => {
  if (!dvDetailCreateForm.item_number) { message.warning('请选择产品'); return }
  if ((dvDetailCreateForm.unit_price || 0) <= 0) { message.warning('产品未录入含税单价，请手工录入价格信息后保存'); return }
  dvDetailSaving.value = true
  try {
    const submitData = { ...dvDetailCreateForm, delivery_date: dvCreateDeliveryDate.value ? dayjs(dvCreateDeliveryDate.value).format('YYYY-MM-DD') : null, promised_delivery_date: dvCreatePromisedDeliveryDate.value ? dayjs(dvCreatePromisedDeliveryDate.value).format('YYYY-MM-DD') : null }
    const res: any = await addSalesOrderDetail(detailViewRecord.value.sales_order_number, submitData)
    if (res?.success) {
      message.success('新增明细行成功')
      dvDetailCreateVisible.value = false
      refreshDetailViewDetails()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '新增明细失败')
  } finally {
    dvDetailSaving.value = false
  }
}

// 详情弹窗中 - 编辑明细行
const handleDvDetailEdit = (record: any) => {
  Object.assign(dvDetailEditForm, { ...emptyDetail(), ...record })
  dvEditDeliveryDate.value = record.delivery_date ? dayjs(record.delivery_date) : null
  dvEditPromisedDeliveryDate.value = record.promised_delivery_date ? dayjs(record.promised_delivery_date) : null
  dvDetailEditVisible.value = true
}
const handleDvDetailEditOk = async () => {
  if (!dvDetailEditForm.id) return
  if (!detailViewIsApproved.value && (dvDetailEditForm.unit_price || 0) <= 0) { message.warning('产品未录入含税单价，请手工录入价格信息后保存'); return }
  dvDetailSaving.value = true
  try {
    const submitData = { ...dvDetailEditForm, delivery_date: dvEditDeliveryDate.value ? dayjs(dvEditDeliveryDate.value).format('YYYY-MM-DD') : null, promised_delivery_date: dvEditPromisedDeliveryDate.value ? dayjs(dvEditPromisedDeliveryDate.value).format('YYYY-MM-DD') : null }
    const res: any = await updateSalesOrderDetail(dvDetailEditForm.id, submitData)
    if (res?.success) {
      message.success('更新明细行成功')
      dvDetailEditVisible.value = false
      refreshDetailViewDetails()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '更新明细失败')
  } finally {
    dvDetailSaving.value = false
  }
}

// 详情弹窗中 - 删除明细行
const handleDvDetailDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    icon: h(ExclamationCircleOutlined),
    content: `确定要删除明细行 ${record.line_number}（${record.item_number}）吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await deleteSalesOrderDetail(record.id)
        if (res?.success) {
          message.success('删除成功')
          refreshDetailViewDetails()
        }
      } catch (err: any) {
        message.error(err.response?.data?.message || '删除失败')
      }
    }
  })
}

// 详情弹窗中明细金额自动计算
const dvCalcAmount = (form: SalesOrderDetail) => {
  const qty = parseFloat(String(form.order_quantity)) || 0
  const price = parseFloat(String(form.unit_price)) || 0
  form.total_amount = Math.round(qty * price * 100) / 100
}

// ==================== 编辑 ====================
const handleEdit = async (record: SalesOrderHeader) => {
  try {
    const res: any = await getSalesOrderDetail(record.sales_order_number)
    if (res?.success) {
      const header = res.data.header
      Object.assign(editForm, header)
      editDetails.value = res.data.details || []
      editOrderDate.value = header.order_date ? dayjs(header.order_date) : null
      editDeliveryDate.value = header.delivery_date ? dayjs(header.delivery_date) : null
      editModalVisible.value = true
    }
  } catch {
    message.error('获取订单详情失败')
  }
}

const handleAddEditDetail = () => {
  const maxLine = editDetails.value.length > 0
    ? Math.max(...editDetails.value.map(d => d.line_number))
    : 0
  const defaultDelivery = editDeliveryDate.value ? dayjs(editDeliveryDate.value).format('YYYY-MM-DD') : null
  const newLine = { ...emptyDetail(), line_number: maxLine + 10, delivery_date: defaultDelivery }
  // 已选客户时，新行带入客户税率
  if (editForm.customer_number && !newLine.tax_rate) {
    const found = customerOptions.value.find(o => o.value === editForm.customer_number)
    if (found?.raw?.sales_tax_rate) newLine.tax_rate = found.raw.sales_tax_rate
  }
  editDetails.value.push(newLine)
}

const handleRemoveEditDetail = (index: number) => {
  editDetails.value.splice(index, 1)
}

const handleEditSubmit = async () => {
  // 校验明细行单价
  const emptyPriceDetails = editDetails.value.filter(d => !d.item_number || (d.unit_price || 0) <= 0)
  if (emptyPriceDetails.length > 0) {
    const lines = emptyPriceDetails.map(d => d.line_number).join(', ')
    message.warning(`明细行行号 ${lines} 未录入含税单价，请手工录入价格信息后保存`)
    return
  }
  editLoading.value = true
  try {
    const data = {
      ...editForm,
      order_date: editOrderDate.value ? dayjs(editOrderDate.value).format('YYYY-MM-DD') : null,
      delivery_date: editDeliveryDate.value ? dayjs(editDeliveryDate.value).format('YYYY-MM-DD') : null,
      details: editDetails.value
    }
    const res: any = await updateSalesOrder(editForm.sales_order_number, data)
    if (res?.success) {
      message.success('更新成功')
      editModalVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '更新失败')
  } finally {
    editLoading.value = false
  }
}

// ==================== 删除 ====================
const handleDelete = (record: SalesOrderHeader) => {
  Modal.confirm({
    title: '确认删除',
    icon: h(ExclamationCircleOutlined),
    content: `确定要删除销售订单 "${record.sales_order_number}" 吗？将同时删除所有明细行。`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await deleteSalesOrder(record.sales_order_number)
        if (res?.success) { message.success('删除成功'); fetchData() }
      } catch (err: any) {
        message.error(err.response?.data?.message || '删除失败')
      }
    }
  })
}

// ==================== 导入导出 ====================
const handleExport = async () => {
  try {
    const res = await exportSalesOrders(searchText.value)
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = generateExportFilename('sales_orders'); link.click()
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
    const res: any = await importSalesOrders(formData)
    if (res?.success) {
      message.success(res.message)
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '导入失败')
  } finally {
    importLoading.value = false
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
}

// ==================== 审批操作 ====================
const MODULE_NAME = 'sales_order'

const handleSubmitApproval = async (record: SalesOrderHeader) => {
  try {
    const res: any = await submitForApproval(MODULE_NAME, record.sales_order_number)
    if (res?.success) { message.success('提交审核成功'); fetchData() }
  } catch (err: any) { message.error(err.response?.data?.message || '提交审核失败') }
}

const handleApprove = async (record: SalesOrderHeader) => {
  try {
    const res: any = await approveRecord(MODULE_NAME, record.sales_order_number)
    if (res?.success) { message.success('审核通过'); fetchData() }
  } catch (err: any) { message.error(err.response?.data?.message || '审核失败') }
}

const handleWithdraw = async (record: SalesOrderHeader) => {
  try {
    const res: any = await withdrawApproval(MODULE_NAME, record.sales_order_number)
    if (res?.success) { message.success('撤回成功'); fetchData() }
  } catch (err: any) { message.error(err.response?.data?.message || '撤回失败') }
}

const handleReverse = async (record: SalesOrderHeader) => {
  try {
    const res: any = await reverseApproval(MODULE_NAME, record.sales_order_number)
    if (res?.success) { message.success('反审退回成功'); fetchData() }
  } catch (err: any) { message.error(err.response?.data?.message || '反审失败') }
}

const handleShowApprovalLog = (record: SalesOrderHeader) => {
  approvalLogModule.value = MODULE_NAME
  approvalLogRecordId.value = record.sales_order_number
  approvalLogVisible.value = true
}

// 批量操作
const batchLoading = ref(false)
const manualCloseRef = ref()
const handleBatchAction = (action: string) => {
  if (selectedRowKeys.value.length === 0) { message.warning('请先勾选记录'); return }
  const count = selectedRowKeys.value.length
  const actionMap: Record<string, { title: string; desc: string; fn: () => Promise<any>; okType?: string }> = {
    'submit': { title: '批量提交审核', desc: `确定要批量提交 ${count} 条记录吗？仅草稿状态的记录会被提交。`, fn: () => batchSubmitForApproval(MODULE_NAME, selectedRowKeys.value) },
    'approve': { title: '批量审核通过', desc: `确定要批量审核 ${count} 条记录吗？仅待审批状态的记录会被审批。`, fn: () => batchApproveRecords(MODULE_NAME, selectedRowKeys.value) },
    'withdraw': { title: '批量撤回', desc: `确定要批量撤回 ${count} 条记录吗？仅待审批状态的记录会被撤回。`, fn: () => batchWithdrawApproval(MODULE_NAME, selectedRowKeys.value) },
    'reverse': { title: '批量反审', desc: `确定要批量反审 ${count} 条记录吗？已审批的记录将退回草稿。`, fn: () => batchReverseApproval(MODULE_NAME, selectedRowKeys.value), okType: 'danger' }
  }
  const cfg = actionMap[action]
  if (!cfg) return
  Modal.confirm({
    title: cfg.title, icon: h(ExclamationCircleOutlined), content: cfg.desc,
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
</script>

<template>
  <div style="padding: 16px">
    <!-- 搜索栏 -->
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px">
      <span style="font-size: 18px; font-weight: 600; color: #1a1a2e; white-space: nowrap; margin-right: 4px">销售订单</span>
      <a-space wrap>
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索订单编号/客户编号/客户名称/销售负责人/客户采购订单号"
          style="width: 340px"
          allow-clear
          @search="handleSearch"
          @pressEnter="handleSearch"
        />
        <a-select v-model:value="approvalFilter" placeholder="审批状态" style="width: 120px" allow-clear @change="handleSearch">
          <a-select-option value="">全部</a-select-option>
          <a-select-option value="草稿">草稿</a-select-option>
          <a-select-option value="待审批">待审批</a-select-option>
          <a-select-option value="已审批">已审批</a-select-option>
        </a-select>
        <a-button @click="handleReset"><ReloadOutlined /> 重置</a-button>
      </a-space>
      <a-space wrap>
        <a-button @click="handleExport"><DownloadOutlined /> 导出</a-button>
        <a-button @click="handleImportClick" :loading="importLoading"><UploadOutlined /> 导入</a-button>
        <a-button type="primary" @click="handleCreate"><PlusOutlined /> 新建</a-button>
        <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
      </a-space>
      <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
    </div>

    <!-- 主表格 -->
    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="false"
      :row-selection="rowSelection"
      row-key="sales_order_number"
      size="middle"
      bordered
      :scroll="{ x: 1500, y: 'calc(100vh - 320px)' }"
      @change="handleTableChange"
      @resizeColumn="handleResizeColumn"
    >
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'rowIndex'">
          {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
        </template>
        <template v-else-if="column.key === 'order_date'">
          {{ formatDate(record.order_date) }}
        </template>
        <template v-else-if="column.key === 'delivery_date'">
          <a-tooltip v-if="record.has_multi_delivery" title="多交期：明细行存在不同的交货日期" placement="top">
            <span style="color: #ff4d4f; cursor: pointer;">{{ formatDate(record.delivery_date) }}</span>
          </a-tooltip>
          <span v-else>{{ formatDate(record.delivery_date) }}</span>
        </template>
        <template v-else-if="column.key === 'approval_status'">
          <ApprovalStatusTag :status="record.approval_status" />
        </template>
        <template v-else-if="column.key === 'order_status'">
          <a-tag :color="record.order_status === '已完成' ? 'green' : record.order_status === '生产中' ? 'blue' : record.order_status === '已取消' ? 'red' : 'default'">
            {{ record.order_status }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="handleViewDetail(record)"><EyeOutlined /> 详情</a-button>
            <a-dropdown>
              <a>更多</a>
              <template #overlay>
                <a-menu>
                  <a-menu-item v-if="record.approval_status === '草稿'" @click="handleEdit(record)">编辑</a-menu-item>
                  <a-menu-item v-if="record.approval_status === '已审批'" @click="handleEdit(record)">修改</a-menu-item>
                  <a-menu-item v-if="record.approval_status === '草稿'" @click="handleSubmitApproval(record)">提交审核</a-menu-item>
                  <a-menu-item v-if="record.approval_status === '待审批'" @click="handleApprove(record)">审核通过</a-menu-item>
                  <a-menu-item v-if="record.approval_status === '待审批'" @click="handleWithdraw(record)">撤回提交</a-menu-item>
                  <a-menu-item v-if="record.approval_status === '已审批'" @click="handleReverse(record)">反审退回</a-menu-item>
                  <a-menu-item @click="handleShowApprovalLog(record)">审批历史</a-menu-item>
                  <a-menu-item v-if="record.approval_status === '草稿'" @click="handleDelete(record)" style="color: #ff4d4f">删除</a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 批量操作栏 + 分页（合并一行） -->
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; gap: 8px; padding: 8px 0; border-top: 1px solid #f0f0f0; margin-top: 4px;">
      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; white-space: nowrap;">
        <span style="color: #666; margin-right: 2px; flex-shrink: 0;">已选 <b style="color: #1890ff;">{{ selectedRowKeys.length }}</b> 项</span>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('submit')">批量提交</a-button>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('approve')">批量审批</a-button>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('withdraw')">批量撤回</a-button>
        <a-button size="small" danger :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('reverse')">批量反审</a-button>
        <a-button size="small" danger :disabled="selectedRowKeys.length === 0" @click="manualCloseRef?.open()">批量关闭</a-button>
        <a-button size="small" type="link" :disabled="selectedRowKeys.length === 0" @click="selectedRowKeys = []">清除选择</a-button>
      </div>
      <a-pagination
        size="small"
        :current="pagination.current"
        :page-size="pagination.pageSize"
        :total="pagination.total"
        show-quick-jumper
        :show-size-changer="true"
        :show-total="(total: number) => `共 ${total} 条记录`"
        @change="(page: number, pageSize: number) => { pagination.current = page; pagination.pageSize = pageSize; fetchData() }"
      />
    </div>

    <!-- ==================== 新建弹窗 ==================== -->
    <a-modal
      v-model:open="createModalVisible"
      :confirm-loading="createLoading"
      @ok="handleCreateSubmit"
      width="1200px"
      :style="createModalStyle"
      :bodyStyle="{ maxHeight: '78vh', overflowY: 'auto' }"
    >
      <template #title>
        <div class="drag-handle" @mousedown="createDragStart">新建销售订单</div>
      </template>
      <a-divider orientation="left" style="margin-top: 0; margin-bottom: 2px; font-size: 13px;">客户信息</a-divider>
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }" class="compact-form">
        <a-row :gutter="12">
          <a-col :span="8">
            <a-form-item label="客户编号" required>
              <a-select
                v-model:value="createForm.customer_number"
                show-search
                option-filter-prop="label"
                style="width: 100%"
                placeholder="输入搜索客户"
                size="small"
                @search="handleCustomerSearch"
                @change="(val: string) => handleCustomerSelect(val, createForm)"
                allow-clear
              >
                <a-select-option v-for="opt in customerOptions" :key="opt.value" :value="opt.value" :label="opt.label">{{ opt.label }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="客户名称">
              <a-input v-model:value="createForm.customer_name" disabled size="small" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="销售负责人">
              <a-input v-model:value="createForm.head_of_sales" size="small" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="联系人">
              <a-input v-model:value="createForm.linkman" size="small" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="联系方式">
              <a-input v-model:value="createForm.contacts" size="small" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <a-divider orientation="left" style="margin-top: 0; margin-bottom: 2px; font-size: 13px;">订单信息</a-divider>
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }" class="compact-form">
        <a-row :gutter="12">
          <a-col :span="8">
            <a-form-item label="订单日期">
              <a-date-picker v-model:value="createOrderDate" style="width: 100%" size="small" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="交货日期">
              <a-tooltip v-if="createHeaderDeliveryDisabled" title="明细行已设置交货日期，以明细行为准" placement="top">
                <a-date-picker v-model:value="createDeliveryDate" style="width: 100%; opacity: 0.45;" size="small" disabled />
              </a-tooltip>
              <a-date-picker v-else v-model:value="createDeliveryDate" style="width: 100%" size="small" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="订单状态">
              <a-select v-model:value="createForm.order_status" size="small">
                <a-select-option value="待执行">待执行</a-select-option>
                <a-select-option value="生产中">生产中</a-select-option>
                <a-select-option value="已完成">已完成</a-select-option>
                <a-select-option value="已取消">已取消</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="客户采购订单号">
              <a-input v-model:value="createForm.customer_po_number" size="small" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="备注">
              <a-input v-model:value="createForm.remark" size="small" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <a-divider orientation="left" style="margin-top: 0; margin-bottom: 2px; font-size: 13px;">产品明细</a-divider>
      <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <a-button size="small" type="dashed" @click="handleAddCreateDetail">
          <PlusOutlined /> 添加产品行
        </a-button>
        <a-tooltip title="列设置">
          <a-button size="small" @click="openDetailColumnSetting">
            <SettingOutlined />
          </a-button>
        </a-tooltip>
      </div>
      <a-table
        :columns="detailColumns"
        :data-source="createDetails"
        :pagination="false"
        size="small"
        bordered
        row-key="line_number"
        :scroll="{ x: 1450 }"
        @resizeColumn="handleDetailResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'item_number'">
            <a-auto-complete
              v-model:value="record.item_number"
              :options="productOptions"
              :filter-option="false"
              placeholder="搜索产品"
              size="small"
              @search="handleProductSearch"
              @select="(val: string) => handleProductSelect(val, record)"
              style="width: 100%"
            />
          </template>
          <template v-else-if="column.key === 'item_name'">
            <a-input v-model:value="record.item_name" size="small" disabled />
          </template>
          <template v-else-if="column.key === 'specifications'">
            <a-input v-model:value="record.specifications" size="small" disabled />
          </template>
          <template v-else-if="column.key === 'basic_unit'">
            <a-input v-model:value="record.basic_unit" size="small" disabled />
          </template>
          <template v-else-if="column.key === 'product_drawing_number'">
            <a-input v-model:value="record.product_drawing_number" size="small" disabled />
          </template>
          <template v-else-if="column.key === 'order_quantity'">
            <a-input-number v-model:value="record.order_quantity" size="small" :min="0" style="width: 100%" @change="calcAmount(record)" />
          </template>
          <template v-else-if="column.key === 'unit_price'">
            <a-input-number v-model:value="record.unit_price" size="small" :min="0" :precision="2" style="width: 100%" @change="calcAmount(record)" />
          </template>
          <template v-else-if="column.key === 'tax_rate'">
            <a-input-number v-model:value="record.tax_rate" size="small" :min="0" :max="100" :precision="2" style="width: 100%" />
          </template>
          <template v-else-if="column.key === 'total_amount'">
            <span style="color: #1677ff; font-weight: 600">{{ record.total_amount?.toFixed(2) || '0.00' }}</span>
          </template>
          <template v-else-if="column.key === 'delivery_date'">
            <a-input v-model:value="record.delivery_date" size="small" placeholder="YYYY-MM-DD" />
          </template>
          <template v-else-if="column.key === 'promised_delivery_date'">
            <a-date-picker v-model:value="record.promised_delivery_date" size="small" placeholder="选择日期" style="width: 100%" valueFormat="YYYY-MM-DD" />
          </template>
          <template v-else-if="column.key === 'status'">
            <a-select v-model:value="record.status" size="small" style="width: 100%">
              <a-select-option value="未开始">未开始</a-select-option>
              <a-select-option value="进行中">进行中</a-select-option>
              <a-select-option value="已完成">已完成</a-select-option>
              <a-select-option value="已作废">已作废</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'shipping_status'">
            <a-select v-model:value="record.shipping_status" size="small" style="width: 100%">
              <a-select-option value="未申请">未申请</a-select-option>
              <a-select-option value="未发货">未发货</a-select-option>
              <a-select-option value="部分发货">部分发货</a-select-option>
              <a-select-option value="全部发货">全部发货</a-select-option>
              <a-select-option value="超额发货">超额发货</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'production_status'">
            <a-select v-model:value="record.production_status" size="small" style="width: 100%">
              <a-select-option value="未加入计划">未加入计划</a-select-option>
              <a-select-option value="待排产">待排产</a-select-option>
              <a-select-option value="计划中">计划中</a-select-option>
              <a-select-option value="待生产">待生产</a-select-option>
              <a-select-option value="生产中">生产中</a-select-option>
              <a-select-option value="生产完成">生产完成</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'return_status'">
            <a-select v-model:value="record.return_status" size="small" style="width: 100%">
              <a-select-option value="未申请">未申请</a-select-option>
              <a-select-option value="未退货">未退货</a-select-option>
              <a-select-option value="部分退货">部分退货</a-select-option>
              <a-select-option value="全部退货">全部退货</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'invoice_status'">
            <a-tag :color="record.invoice_status === '已开票' ? 'green' : record.invoice_status === '部分开票' ? 'orange' : 'default'">{{ record.invoice_status || '未开票' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'remark'">
            <a-input v-model:value="record.remark" size="small" />
          </template>
          <template v-else-if="column.key === 'customer_item_number'">
            <a-input v-model:value="record.customer_item_number" size="small" placeholder="输入后按回车查询产品" @pressEnter="handleCustomerItemNumberChange(record.customer_item_number, record)" />
          </template>
          <template v-else-if="column.key === 'customer_item_description'">
            <a-input v-model:value="record.customer_item_description" size="small" />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" danger size="small" @click="handleRemoveCreateDetail(index)">
              <DeleteOutlined />
            </a-button>
          </template>
        </template>
      </a-table>
    </a-modal>

    <!-- ==================== 编辑弹窗 ==================== -->
    <a-modal
      v-model:open="editModalVisible"
      :title="editIsApproved ? '修改销售订单（已审批）' : '编辑销售订单'"
      :confirm-loading="editLoading"
      @ok="handleEditSubmit"
      width="1200px"
      :bodyStyle="{ maxHeight: '78vh', overflowY: 'auto' }"
    >
      <a-alert v-if="editIsApproved" type="warning" banner message="当前订单已审批，仅允许修改：销售负责人、联系人、联系方式、交货日期、客户采购订单号、备注" style="margin-bottom: 12px" />
      <a-divider orientation="left" style="margin-top: 0; margin-bottom: 2px; font-size: 13px;">客户信息</a-divider>
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }" class="compact-form">
        <a-row :gutter="12">
          <a-col :span="8">
            <a-form-item label="订单编号">
              <a-input :value="editForm.sales_order_number" disabled size="small" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="客户编号">
              <a-select
                v-model:value="editForm.customer_number"
                show-search
                option-filter-prop="label"
                style="width: 100%"
                placeholder="输入搜索客户"
                size="small"
                :disabled="editIsApproved"
                @search="handleCustomerSearch"
                @change="(val: string) => handleCustomerSelect(val, editForm)"
                allow-clear
              >
                <a-select-option v-for="opt in customerOptions" :key="opt.value" :value="opt.value" :label="opt.label">{{ opt.label }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="客户名称">
              <a-input v-model:value="editForm.customer_name" disabled size="small" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="销售负责人">
              <a-input v-model:value="editForm.head_of_sales" size="small" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="联系人">
              <a-input v-model:value="editForm.linkman" size="small" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="联系方式">
              <a-input v-model:value="editForm.contacts" size="small" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <a-divider orientation="left" style="margin-top: 0; margin-bottom: 2px; font-size: 13px;">订单信息</a-divider>
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }" class="compact-form">
        <a-row :gutter="12">
          <a-col :span="8">
            <a-form-item label="订单日期">
              <a-date-picker v-model:value="editOrderDate" style="width: 100%" size="small" :disabled="editIsApproved" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="交货日期">
              <a-tooltip v-if="editHeaderDeliveryDisabled" title="明细行已设置交货日期，以明细行为准" placement="top">
                <a-date-picker v-model:value="editDeliveryDate" style="width: 100%; opacity: 0.45;" size="small" disabled />
              </a-tooltip>
              <a-date-picker v-else v-model:value="editDeliveryDate" style="width: 100%" size="small" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="订单状态">
              <a-select v-model:value="editForm.order_status" size="small" :disabled="editIsApproved">
                <a-select-option value="待执行">待执行</a-select-option>
                <a-select-option value="生产中">生产中</a-select-option>
                <a-select-option value="已完成">已完成</a-select-option>
                <a-select-option value="已取消">已取消</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="客户采购订单号">
              <a-input v-model:value="editForm.customer_po_number" size="small" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="备注">
              <a-input v-model:value="editForm.remark" size="small" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <a-divider orientation="left" style="margin-top: 0; margin-bottom: 2px; font-size: 13px;">产品明细</a-divider>
      <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <a-button v-if="!editIsApproved" size="small" type="dashed" @click="handleAddEditDetail">
          <PlusOutlined /> 添加产品行
        </a-button>
        <span v-else></span>
        <a-tooltip title="列设置">
          <a-button size="small" @click="openDetailColumnSetting">
            <SettingOutlined />
          </a-button>
        </a-tooltip>
      </div>
      <a-table
        :columns="detailColumns"
        :data-source="editDetails"
        :pagination="false"
        size="small"
        bordered
        row-key="line_number"
        :scroll="{ x: 1450 }"
        @resizeColumn="handleDetailResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'item_number'">
            <a-auto-complete
              v-model:value="record.item_number"
              :options="productOptions"
              :filter-option="false"
              placeholder="搜索产品"
              size="small"
              :disabled="editIsApproved"
              @search="handleProductSearch"
              @select="(val: string) => handleProductSelect(val, record)"
              style="width: 100%"
            />
          </template>
          <template v-else-if="column.key === 'item_name'">
            <a-input v-model:value="record.item_name" size="small" disabled />
          </template>
          <template v-else-if="column.key === 'specifications'">
            <a-input v-model:value="record.specifications" size="small" disabled />
          </template>
          <template v-else-if="column.key === 'basic_unit'">
            <a-input v-model:value="record.basic_unit" size="small" disabled />
          </template>
          <template v-else-if="column.key === 'product_drawing_number'">
            <a-input v-model:value="record.product_drawing_number" size="small" disabled />
          </template>
          <template v-else-if="column.key === 'order_quantity'">
            <a-input-number v-model:value="record.order_quantity" size="small" :min="0" :disabled="editIsApproved" style="width: 100%" @change="calcAmount(record)" />
          </template>
          <template v-else-if="column.key === 'unit_price'">
            <a-input-number v-model:value="record.unit_price" size="small" :min="0" :precision="2" :disabled="editIsApproved" style="width: 100%" @change="calcAmount(record)" />
          </template>
          <template v-else-if="column.key === 'tax_rate'">
            <a-input-number v-model:value="record.tax_rate" size="small" :min="0" :max="100" :precision="2" :disabled="editIsApproved" style="width: 100%" />
          </template>
          <template v-else-if="column.key === 'total_amount'">
            <span style="color: #1677ff; font-weight: 600">{{ record.total_amount?.toFixed(2) || '0.00' }}</span>
          </template>
          <template v-else-if="column.key === 'delivery_date'">
            <a-input v-model:value="record.delivery_date" size="small" placeholder="YYYY-MM-DD" />
          </template>
          <template v-else-if="column.key === 'promised_delivery_date'">
            <a-date-picker v-model:value="record.promised_delivery_date" size="small" placeholder="选择日期" style="width: 100%" valueFormat="YYYY-MM-DD" :disabled="editIsApproved" />
          </template>
          <template v-else-if="column.key === 'status'">
            <a-select v-model:value="record.status" size="small" :disabled="editIsApproved" style="width: 100%">
              <a-select-option value="未开始">未开始</a-select-option>
              <a-select-option value="进行中">进行中</a-select-option>
              <a-select-option value="已完成">已完成</a-select-option>
              <a-select-option value="已作废">已作废</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'shipping_status'">
            <a-select v-model:value="record.shipping_status" size="small" :disabled="editIsApproved" style="width: 100%">
              <a-select-option value="未申请">未申请</a-select-option>
              <a-select-option value="未发货">未发货</a-select-option>
              <a-select-option value="部分发货">部分发货</a-select-option>
              <a-select-option value="全部发货">全部发货</a-select-option>
              <a-select-option value="超额发货">超额发货</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'production_status'">
            <a-select v-model:value="record.production_status" size="small" :disabled="editIsApproved" style="width: 100%">
              <a-select-option value="未加入计划">未加入计划</a-select-option>
              <a-select-option value="待排产">待排产</a-select-option>
              <a-select-option value="计划中">计划中</a-select-option>
              <a-select-option value="待生产">待生产</a-select-option>
              <a-select-option value="生产中">生产中</a-select-option>
              <a-select-option value="生产完成">生产完成</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'return_status'">
            <a-select v-model:value="record.return_status" size="small" :disabled="editIsApproved" style="width: 100%">
              <a-select-option value="未申请">未申请</a-select-option>
              <a-select-option value="未退货">未退货</a-select-option>
              <a-select-option value="部分退货">部分退货</a-select-option>
              <a-select-option value="全部退货">全部退货</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'invoice_status'">
            <a-tag :color="record.invoice_status === '已开票' ? 'green' : record.invoice_status === '部分开票' ? 'orange' : 'default'">{{ record.invoice_status || '未开票' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'remark'">
            <a-input v-model:value="record.remark" size="small" />
          </template>
          <template v-else-if="column.key === 'customer_item_number'">
            <a-input v-model:value="record.customer_item_number" size="small" :disabled="editIsApproved" placeholder="输入后按回车查询产品" @pressEnter="handleCustomerItemNumberChange(record.customer_item_number, record)" />
          </template>
          <template v-else-if="column.key === 'customer_item_description'">
            <a-input v-model:value="record.customer_item_description" size="small" :disabled="editIsApproved" />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button v-if="!editIsApproved" type="link" danger size="small" @click="handleRemoveEditDetail(index)">
              <DeleteOutlined />
            </a-button>
          </template>
        </template>
      </a-table>
    </a-modal>

    <!-- 审批日志弹窗 -->
    <ApprovalLogModal v-model:open="approvalLogVisible" :module="approvalLogModule" :recordId="approvalLogRecordId" />

    <!-- 批量关闭弹窗 -->
    <ManualCloseModal ref="manualCloseRef" module="sales_order" :record-ids="selectedRowKeys" @success="fetchData" />

    <!-- ==================== 详情弹窗 ==================== -->
    <a-modal
      v-model:open="detailViewVisible"
      :footer="null"
      width="1300px"
      :style="detailModalStyle"
      :bodyStyle="{ padding: '12px 16px', maxHeight: '82vh', overflowY: 'auto' }"
    >
      <template #title>
        <div class="drag-handle" @mousedown="detailDragStart">销售订单详情 - {{ detailViewRecord.sales_order_number }}</div>
      </template>
      <a-spin :spinning="detailViewLoading">
        <a-tabs v-model:activeKey="detailViewTab" :animated="false">
          <!-- Tab 1: 基本信息 -->
          <a-tab-pane key="info" tab="基本信息">
            <a-descriptions :column="2" bordered size="small" :labelStyle="{ fontWeight: 'bold', width: '120px' }">
              <a-descriptions-item label="订单编号">{{ detailViewRecord.sales_order_number }}</a-descriptions-item>
              <a-descriptions-item label="订单状态">
                <a-tag :color="detailViewRecord.order_status === '已完成' ? 'green' : detailViewRecord.order_status === '生产中' ? 'blue' : detailViewRecord.order_status === '已取消' ? 'red' : 'default'">
                  {{ detailViewRecord.order_status }}
                </a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="客户编号">{{ detailViewRecord.customer_number }}</a-descriptions-item>
              <a-descriptions-item label="客户名称">{{ detailViewRecord.customer_name }}</a-descriptions-item>
              <a-descriptions-item label="所属工厂">{{ detailViewRecord.factory_short || detailViewRecord.factory_name || '-' }}</a-descriptions-item>
              <a-descriptions-item label="销售负责人">{{ detailViewRecord.head_of_sales || '-' }}</a-descriptions-item>
              <a-descriptions-item label="联系人">{{ detailViewRecord.linkman || '-' }}</a-descriptions-item>
              <a-descriptions-item label="联系方式">{{ detailViewRecord.contacts || '-' }}</a-descriptions-item>
              <a-descriptions-item label="审批状态"><ApprovalStatusTag :status="detailViewRecord.approval_status" /></a-descriptions-item>
              <a-descriptions-item label="订单日期">{{ formatDate(detailViewRecord.order_date) }}</a-descriptions-item>
              <a-descriptions-item label="交货日期">
                <a-tooltip v-if="detailViewHasMultiDelivery" title="多交期：明细行存在不同的交货日期" placement="top">
                  <span style="color: #ff4d4f; cursor: pointer;">{{ formatDate(detailViewRecord.delivery_date) }}</span>
                </a-tooltip>
                <span v-else>{{ formatDate(detailViewRecord.delivery_date) }}</span>
              </a-descriptions-item>
              <a-descriptions-item label="创建人">{{ detailViewRecord.creation_man || '-' }}</a-descriptions-item>
              <a-descriptions-item label="创建日期">{{ detailViewRecord.creation_date ? formatDate(detailViewRecord.creation_date) : '-' }}</a-descriptions-item>
              <a-descriptions-item label="客户采购订单号">{{ detailViewRecord.customer_po_number || '-' }}</a-descriptions-item>
              <a-descriptions-item label="备注">{{ detailViewRecord.remark || '-' }}</a-descriptions-item>
            </a-descriptions>
          </a-tab-pane>

          <!-- Tab 2: 产品明细 -->
          <a-tab-pane key="details" :tab="`产品明细 (${detailViewDetails.length})`">
            <div v-if="detailViewEditable" style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
              <a-tag v-if="detailViewIsApproved" color="orange">已审批状态 - 可修改交货日期、承诺交货日期和备注</a-tag>
              <a-tag v-else color="blue">草稿状态 - 可编辑明细</a-tag>
              <a-button v-if="!detailViewIsApproved" type="primary" size="small" @click="handleDvDetailCreate"><PlusOutlined /> 新增明细</a-button>
            </div>
            <a-tag v-else color="orange" style="margin-bottom: 8px;">非草稿状态 - 仅查看</a-tag>
            <a-table
              :columns="detailViewColumns"
              :data-source="detailViewDetails"
              row-key="_idx"
              :pagination="false"
              :scroll="{ x: 1260, y: 520 }"
              size="small"
              bordered
            >
              <template #bodyCell="{ column, record: detailRecord }">
                <template v-if="column.key === 'total_amount'">
                  <span style="color: #1677ff; font-weight: 600">{{ detailRecord.total_amount?.toFixed(2) || '0.00' }}</span>
                </template>
                <template v-else-if="column.key === 'unit_price'">
                  {{ detailRecord.unit_price?.toFixed(4) || '0.0000' }}
                </template>
                <template v-else-if="column.key === 'delivery_date'">
                  <a-tooltip v-if="detailRecord.delivery_date && detailViewRecord.delivery_date && dayjs(detailRecord.delivery_date).format('YYYY-MM-DD') !== dayjs(detailViewRecord.delivery_date).format('YYYY-MM-DD')" title="多交期：与订单交货日期不一致" placement="top">
                    <span style="color: #ff4d4f; cursor: pointer;">{{ formatDate(detailRecord.delivery_date) }}</span>
                  </a-tooltip>
                  <span v-else>{{ formatDate(detailRecord.delivery_date) }}</span>
                </template>
                <template v-else-if="column.key === 'promised_delivery_date'">
                  {{ formatDate(detailRecord.promised_delivery_date) }}
                </template>
                <template v-else-if="column.key === 'status'">
                  <a-tag :color="detailRecord.status === '已完成' ? 'green' : detailRecord.status === '进行中' ? 'blue' : detailRecord.status === '已作废' ? 'red' : 'default'">{{ detailRecord.status || '未开始' }}</a-tag>
                </template>
                <template v-else-if="column.key === 'shipping_status'">
                  <a-tag :color="detailRecord.shipping_status === '全部发货' ? 'green' : detailRecord.shipping_status === '部分发货' ? 'blue' : detailRecord.shipping_status === '超额发货' ? 'orange' : 'default'">{{ detailRecord.shipping_status || '未申请' }}</a-tag>
                </template>
                <template v-else-if="column.key === 'production_status'">
                  <a-tag :color="detailRecord.production_status === '生产完成' ? 'green' : detailRecord.production_status === '生产中' ? 'blue' : detailRecord.production_status === '待生产' || detailRecord.production_status === '计划中' ? 'cyan' : detailRecord.production_status === '待排产' ? 'orange' : 'default'">{{ detailRecord.production_status || '未加入计划' }}</a-tag>
                </template>
                <template v-else-if="column.key === 'return_status'">
                  <a-tag :color="detailRecord.return_status === '全部退货' ? 'red' : detailRecord.return_status === '部分退货' ? 'orange' : detailRecord.return_status === '未退货' ? 'blue' : 'default'">{{ detailRecord.return_status || '未申请' }}</a-tag>
                </template>
                <template v-else-if="column.key === 'invoice_status'">
                  <a-tag :color="detailRecord.invoice_status === '已开票' ? 'green' : detailRecord.invoice_status === '部分开票' ? 'orange' : 'default'">{{ detailRecord.invoice_status || '未开票' }}</a-tag>
                </template>
                <template v-else-if="column.key === 'dv_action'">
                  <a-space :size="2">
                    <a-tooltip title="编辑"><a-button type="link" size="small" @click="handleDvDetailEdit(detailRecord)"><EditOutlined /></a-button></a-tooltip>
                    <a-tooltip v-if="!detailViewIsApproved" title="删除"><a-button type="link" danger size="small" @click="handleDvDetailDelete(detailRecord)"><DeleteOutlined /></a-button></a-tooltip>
                  </a-space>
                </template>
              </template>
              <template #summary>
                <a-table-summary fixed>
                  <a-table-summary-row>
                    <a-table-summary-cell :index="0" :col-span="6" style="text-align: right; font-weight: bold;">合计</a-table-summary-cell>
                    <a-table-summary-cell :index="6" style="font-weight: bold;">
                      {{ detailViewDetails.reduce((sum: number, d: any) => sum + (parseFloat(d.order_quantity) || 0), 0) }}
                    </a-table-summary-cell>
                    <a-table-summary-cell :index="7" />
                    <a-table-summary-cell :index="8" style="color: #1677ff; font-weight: bold;">
                      {{ detailViewDetails.reduce((sum: number, d: any) => sum + (parseFloat(d.total_amount) || 0), 0).toFixed(2) }}
                    </a-table-summary-cell>
                    <a-table-summary-cell :index="9" :col-span="detailViewEditable ? 3 : 2" />
                  </a-table-summary-row>
                </a-table-summary>
              </template>
            </a-table>
          </a-tab-pane>
        </a-tabs>
      </a-spin>
    </a-modal>

    <!-- ==================== 详情弹窗 - 新增明细子弹窗 ==================== -->
    <a-modal
      v-model:open="dvDetailCreateVisible"
      title="新增产品明细"
      :confirm-loading="dvDetailSaving"
      @ok="handleDvDetailCreateOk"
      width="800px"
      okText="确认"
      cancelText="取消"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="行号"><a-input-number v-model:value="dvDetailCreateForm.line_number" :min="0" :step="10" style="width: 100%" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="产品编号" required>
              <a-auto-complete
                v-model:value="dvDetailCreateForm.item_number"
                :options="productOptions"
                :filter-option="false"
                placeholder="输入搜索产品"
                @search="handleProductSearch"
                @select="(val: string) => handleProductSelect(val, dvDetailCreateForm)"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="产品名称"><a-input v-model:value="dvDetailCreateForm.item_name" disabled /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="规格"><a-input v-model:value="dvDetailCreateForm.specifications" disabled /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="单位"><a-input v-model:value="dvDetailCreateForm.basic_unit" disabled /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="产品图号"><a-input v-model:value="dvDetailCreateForm.product_drawing_number" disabled /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="订单数量"><a-input-number v-model:value="dvDetailCreateForm.order_quantity" :min="0" style="width: 100%" @change="dvCalcAmount(dvDetailCreateForm)" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="单价"><a-input-number v-model:value="dvDetailCreateForm.unit_price" :min="0" :precision="2" style="width: 100%" @change="dvCalcAmount(dvDetailCreateForm)" /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="金额"><a-input-number :value="dvDetailCreateForm.total_amount" :precision="2" disabled style="width: 100%" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="交货日期"><a-date-picker v-model:value="dvCreateDeliveryDate" style="width: 100%" /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="承诺交货日期"><a-date-picker v-model:value="dvCreatePromisedDeliveryDate" style="width: 100%" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="状态">
              <a-select v-model:value="dvDetailCreateForm.status" style="width: 100%">
                <a-select-option value="未开始">未开始</a-select-option>
                <a-select-option value="进行中">进行中</a-select-option>
                <a-select-option value="已完成">已完成</a-select-option>
                <a-select-option value="已作废">已作废</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="发货状态">
              <a-select v-model:value="dvDetailCreateForm.shipping_status" style="width: 100%">
                <a-select-option value="未申请">未申请</a-select-option>
                <a-select-option value="未发货">未发货</a-select-option>
                <a-select-option value="部分发货">部分发货</a-select-option>
                <a-select-option value="全部发货">全部发货</a-select-option>
                <a-select-option value="超额发货">超额发货</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="生产状态">
              <a-select v-model:value="dvDetailCreateForm.production_status" style="width: 100%">
                <a-select-option value="未加入计划">未加入计划</a-select-option>
                <a-select-option value="待排产">待排产</a-select-option>
                <a-select-option value="计划中">计划中</a-select-option>
                <a-select-option value="待生产">待生产</a-select-option>
                <a-select-option value="生产中">生产中</a-select-option>
                <a-select-option value="生产完成">生产完成</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="退货状态">
              <a-select v-model:value="dvDetailCreateForm.return_status" style="width: 100%">
                <a-select-option value="未申请">未申请</a-select-option>
                <a-select-option value="未退货">未退货</a-select-option>
                <a-select-option value="部分退货">部分退货</a-select-option>
                <a-select-option value="全部退货">全部退货</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="客户物料号"><a-input v-model:value="(dvDetailCreateForm as any).customer_item_number" placeholder="输入后按回车反向查询产品" @pressEnter="handleCustomerItemNumberChange((dvDetailCreateForm as any).customer_item_number, dvDetailCreateForm)" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="客户物料描述"><a-input v-model:value="(dvDetailCreateForm as any).customer_item_description" /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item label="备注" :label-col="{ span: 3 }" :wrapper-col="{ span: 20 }"><a-input v-model:value="dvDetailCreateForm.remark" /></a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- ==================== 详情弹窗 - 编辑明细子弹窗 ==================== -->
    <a-modal
      v-model:open="dvDetailEditVisible"
      :title="detailViewIsApproved ? '修改产品明细（交货日期、承诺交货日期和备注）' : '编辑产品明细'"
      :confirm-loading="dvDetailSaving"
      @ok="handleDvDetailEditOk"
      width="800px"
      okText="确认"
      cancelText="取消"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="行号"><a-input-number v-model:value="dvDetailEditForm.line_number" :min="0" :step="10" :disabled="detailViewIsApproved" style="width: 100%" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="产品编号" required>
              <a-auto-complete
                v-model:value="dvDetailEditForm.item_number"
                :options="productOptions"
                :filter-option="false"
                placeholder="输入搜索产品"
                :disabled="detailViewIsApproved"
                @search="handleProductSearch"
                @select="(val: string) => handleProductSelect(val, dvDetailEditForm)"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="产品名称"><a-input v-model:value="dvDetailEditForm.item_name" disabled /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="规格"><a-input v-model:value="dvDetailEditForm.specifications" disabled /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="单位"><a-input v-model:value="dvDetailEditForm.basic_unit" disabled /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="产品图号"><a-input v-model:value="dvDetailEditForm.product_drawing_number" disabled /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="订单数量"><a-input-number v-model:value="dvDetailEditForm.order_quantity" :min="0" :disabled="detailViewIsApproved" style="width: 100%" @change="dvCalcAmount(dvDetailEditForm)" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="单价"><a-input-number v-model:value="dvDetailEditForm.unit_price" :min="0" :precision="2" :disabled="detailViewIsApproved" style="width: 100%" @change="dvCalcAmount(dvDetailEditForm)" /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="金额"><a-input-number :value="dvDetailEditForm.total_amount" :precision="2" disabled style="width: 100%" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="交货日期"><a-date-picker v-model:value="dvEditDeliveryDate" style="width: 100%" /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="承诺交货日期"><a-date-picker v-model:value="dvEditPromisedDeliveryDate" style="width: 100%" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="状态">
              <a-select v-model:value="dvDetailEditForm.status" :disabled="detailViewIsApproved" style="width: 100%">
                <a-select-option value="未开始">未开始</a-select-option>
                <a-select-option value="进行中">进行中</a-select-option>
                <a-select-option value="已完成">已完成</a-select-option>
                <a-select-option value="已作废">已作废</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="发货状态">
              <a-select v-model:value="dvDetailEditForm.shipping_status" :disabled="detailViewIsApproved" style="width: 100%">
                <a-select-option value="未申请">未申请</a-select-option>
                <a-select-option value="未发货">未发货</a-select-option>
                <a-select-option value="部分发货">部分发货</a-select-option>
                <a-select-option value="全部发货">全部发货</a-select-option>
                <a-select-option value="超额发货">超额发货</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="生产状态">
              <a-select v-model:value="dvDetailEditForm.production_status" :disabled="detailViewIsApproved" style="width: 100%">
                <a-select-option value="未加入计划">未加入计划</a-select-option>
                <a-select-option value="待排产">待排产</a-select-option>
                <a-select-option value="计划中">计划中</a-select-option>
                <a-select-option value="待生产">待生产</a-select-option>
                <a-select-option value="生产中">生产中</a-select-option>
                <a-select-option value="生产完成">生产完成</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="退货状态">
              <a-select v-model:value="dvDetailEditForm.return_status" :disabled="detailViewIsApproved" style="width: 100%">
                <a-select-option value="未申请">未申请</a-select-option>
                <a-select-option value="未退货">未退货</a-select-option>
                <a-select-option value="部分退货">部分退货</a-select-option>
                <a-select-option value="全部退货">全部退货</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="客户物料号"><a-input v-model:value="(dvDetailEditForm as any).customer_item_number" :disabled="detailViewIsApproved" placeholder="输入后按回车反向查询产品" @pressEnter="handleCustomerItemNumberChange((dvDetailEditForm as any).customer_item_number, dvDetailEditForm)" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="客户物料描述"><a-input v-model:value="(dvDetailEditForm as any).customer_item_description" :disabled="detailViewIsApproved" /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item label="备注" :label-col="{ span: 3 }" :wrapper-col="{ span: 20 }"><a-input v-model:value="dvDetailEditForm.remark" /></a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- 列设置 -->
    <ColumnSettingDrawer v-model:open="columnSettingVisible" :settingList="columnSettingList" :saving="columnSettingSaving" @moveUp="moveColumnUp" @moveDown="moveColumnDown" @save="saveColumnSetting" @reset="resetColumnSetting" />
    <!-- 明细列设置 -->
    <ColumnSettingDrawer v-model:open="detailColumnSettingVisible" :settingList="detailColumnSettingList" :saving="detailColumnSettingSaving" @moveUp="moveDetailColumnUp" @moveDown="moveDetailColumnDown" @save="saveDetailColumnSetting" @reset="resetDetailColumnSetting" />
  </div>
</template>

<style scoped>
.drag-handle {
  cursor: move;
  user-select: none;
}
.compact-form :deep(.ant-form-item) {
  margin-bottom: 2px;
}
.compact-form :deep(.ant-form-item-label) {
  padding-bottom: 0;
}
:deep(.ant-table-thead > tr > th) {
  white-space: nowrap;
}
:deep(.ant-table-tbody > tr > td) {
  white-space: nowrap;
}
</style>
