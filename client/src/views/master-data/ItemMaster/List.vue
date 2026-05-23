<script setup lang="ts">
import { ref, reactive, computed, onMounted, createVNode, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, DownloadOutlined, UploadOutlined, CopyOutlined, EyeOutlined, PaperClipOutlined, FileImageOutlined, FolderOutlined, DownOutlined, InfoCircleOutlined } from '@ant-design/icons-vue'
import { getItems, getItemDetail, createItem, updateItem, deleteItem, exportItems, importItems, getItemAttachments, uploadItemAttachment, downloadItemAttachment, deleteItemAttachment, approveItem, withdrawItem } from '@/api/master-data/itemMaster'
import { getProductClasses } from '@/api/master-data/productClass'
import { getMaterialClasses } from '@/api/master-data/materialClass'
import { getMateriaProperties } from '@/api/master-data/materiaProperty'
import { getUnits } from '@/api/master-data/unit'
import { getWarehouses } from '@/api/master-data/warehouse'
import { useTableList } from '@/composables/useTableList'
import { useModalDrag } from '@/composables/useModalDrag'
import dayjs from 'dayjs'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

// ========== Tab定义 ==========
const tabs = [
  { key: '', label: '全部' },
  { key: '成品', label: '成品' },
  { key: '半成品', label: '半成品' },
  { key: '原材料', label: '原材料' },
  { key: '包材', label: '包材' },
  { key: '骨架', label: '骨架' },
  { key: '预成型件', label: '预成型件' }
]
const activeTab = ref('')

// ========== 基础状态 ==========
const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData: fetchList } = useTableList<any>(getItems)

// Custom handlers that pass activeTab as extra param
const fetchData = () => fetchList({ item_type: activeTab.value || undefined })
const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => { searchText.value = ''; pagination.current = 1; fetchData() }
const handleTableChange = (pag: any) => { pagination.current = pag.current; pagination.pageSize = pag.pageSize; fetchData() }

// ========== 下拉选项 ==========
const productClassOptions = ref<any[]>([])
const materialClassOptions = ref<any[]>([])
const materiaPropertyOptions = ref<{ label: string; value: string }[]>([])
const unitOptions = ref<{ label: string; value: string }[]>([])
const warehouseOptions = ref<any[]>([])

const fetchWarehouses = async () => {
  try {
    const res = await getWarehouses({ page: 1, limit: 9999 })
    warehouseOptions.value = res.data?.items || []
  } catch {}
}

// 默认仓库模糊搜索
const createWarehouseSearch = ref('')
const editWarehouseSearch = ref('')
const filteredWarehouseOptions = computed(() => {
  return warehouseOptions.value.map((w: any) => ({
    value: w.warehouse_number,
    label: `${w.warehouse_number} - ${w.warehouse_name}`
  }))
})
const filteredWarehouseForCreate = computed(() => {
  const search = createWarehouseSearch.value.toLowerCase()
  if (!search) return filteredWarehouseOptions.value
  return filteredWarehouseOptions.value.filter((o: any) => o.label.toLowerCase().includes(search))
})
const filteredWarehouseForEdit = computed(() => {
  const search = editWarehouseSearch.value.toLowerCase()
  if (!search) return filteredWarehouseOptions.value
  return filteredWarehouseOptions.value.filter((o: any) => o.label.toLowerCase().includes(search))
})

const fetchProductClasses = async () => {
  try {
    const res = await getProductClasses({ page: 1, limit: 9999 })
    productClassOptions.value = res.data?.items || []
  } catch {}
}
const fetchMaterialClasses = async () => {
  try {
    const res = await getMaterialClasses({ page: 1, limit: 9999 })
    materialClassOptions.value = res.data?.items || []
  } catch {}
}
const fetchMateriaProperties = async () => {
  try {
    const res = await getMateriaProperties({ page: 1, limit: 9999 })
    const list = res.data?.items || []
    materiaPropertyOptions.value = list.map((p: any) => ({
      label: `${p.materia_properties_number} - ${p.materia_properties_name}`,
      value: p.materia_properties_name
    }))
  } catch {}
}
const fetchUnits = async () => {
  try {
    const res = await getUnits({ page: 1, limit: 9999 })
    const list = res.data?.items || []
    unitOptions.value = list.map((u: any) => ({
      label: `${u.unit_code} - ${u.unit_name}`,
      value: u.unit_name
    }))
  } catch {}
}

// 根据item_type获取分类选项
const getClassOptions = (itemType: string) => {
  if (itemType === '成品') {
    return productClassOptions.value.map((c: any) => ({
      label: `${c.product_class_number} - ${c.product_class_name}`,
      value: c.product_class_number,
      name: c.product_class_name
    }))
  }
  if (itemType === '原材料') {
    return materialClassOptions.value.map((c: any) => ({
      label: `${c.material_class_number} - ${c.material_class_name}`,
      value: c.material_class_number,
      name: c.material_class_name
    }))
  }
  // 半成品/包材共用产品分类
  return productClassOptions.value.map((c: any) => ({
    label: `${c.product_class_number} - ${c.product_class_name}`,
    value: c.product_class_number,
    name: c.product_class_name
  }))
}

const handleClassChange = (val: string, form: any) => {
  const itemType = form.item_type || activeTab.value
  const options = getClassOptions(itemType)
  const found = options.find((o: any) => o.value === val)
  form.item_class_number = val
  form.item_class_name = found ? found.name : ''
}

// ========== 动态列 ==========
const baseColumns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 180 },
  { title: '物品类型', dataIndex: 'item_type', key: 'item_type', width: 90 },
  { title: '物料属性', dataIndex: 'item_properties', key: 'item_properties', width: 100 },
  { title: '基本单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 90 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 140, ellipsis: true },
  { title: '业务范围', dataIndex: 'business_scope', key: 'business_scope', width: 120 },
  { title: '安全库存管理', dataIndex: 'safety_stock_enabled', key: 'safety_stock_enabled', width: 110 },
  { title: '安全库存数', dataIndex: 'safety_stock_qty', key: 'safety_stock_qty', width: 100 },
  { title: '生产提前期(天)', dataIndex: 'lead_time_days', key: 'lead_time_days', width: 130 },
  { title: '采购提前期(天)', dataIndex: 'purchase_lead_time_days', key: 'purchase_lead_time_days', width: 130 },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, ellipsis: true },
  { title: '创建时间', dataIndex: 'creation_date', key: 'creation_date', width: 160 }
]

const extColumns: Record<string, any[]> = {
  '成品': [
    { title: '分类编号', dataIndex: 'item_class_number', key: 'item_class_number', width: 110 },
    { title: '分类名称', dataIndex: 'item_class_name', key: 'item_class_name', width: 110 },
    { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number', width: 120, ellipsis: true },
    { title: '胶料编号', dataIndex: 'rubber_compound_number', key: 'rubber_compound_number', width: 120 },
    { title: '批次产量定额', dataIndex: 'batch_production_quota', key: 'batch_production_quota', width: 120 },
    { title: '标准合格率', dataIndex: 'standard_pass_rate', key: 'standard_pass_rate', width: 110 }
  ],
  '原材料': [
    { title: '供应商编号', dataIndex: 'supplier_number', key: 'supplier_number', width: 120 },
    { title: '供应商名称', dataIndex: 'supplier_name', key: 'supplier_name', width: 160 }
  ],
  '半成品': [
    { title: '来源BOM编号', dataIndex: 'source_bom_number', key: 'source_bom_number', width: 140 }
  ],
  '包材': [
    { title: '包材备注', dataIndex: 'packaging_remark', key: 'packaging_remark', width: 160, ellipsis: true }
  ],
  '骨架': [
    { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number', width: 120, ellipsis: true },
    { title: '标准合格率', dataIndex: 'standard_pass_rate', key: 'standard_pass_rate', width: 110 }
  ],
  '预成型件': [
    { title: '胶料编号', dataIndex: 'rubber_compound_number', key: 'rubber_compound_number', width: 120 },
    { title: '标准合格率', dataIndex: 'standard_pass_rate', key: 'standard_pass_rate', width: 110 },
    { title: '成型件单耗', dataIndex: 'formed_part_materia_consumption', key: 'formed_part_materia_consumption', width: 110 }
  ]
}

const approvalStatusColumn = { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 }
const actionColumn = { title: '操作', key: 'action', width: 100, fixed: 'right' as const }

const columns = computed(() => {
  const cols = [...baseColumns]
  // 全部tab不显示item_type列以外的扩展列；特定tab隐藏item_type列并追加扩展列
  if (activeTab.value) {
    // 隐藏item_type列
    const filtered = cols.filter(c => c.key !== 'item_type')
    const ext = extColumns[activeTab.value] || []
    return [...filtered, ...ext, approvalStatusColumn, actionColumn]
  }
  return [...cols, approvalStatusColumn, actionColumn]
})

const scrollX = computed(() => {
  return columns.value.reduce((sum, c) => sum + (c.width || 100), 0)
})


const handleTabChange = (key: string) => {
  activeTab.value = key
  pagination.current = 1
  fetchData()
}

// ========== 业务范围多选转换 ==========
const scopeToArray = (val: any): string[] => {
  if (Array.isArray(val)) return val
  if (typeof val === 'string' && val) return val.split(',')
  return []
}
const scopeToString = (val: any): string => {
  if (Array.isArray(val)) return val.join(',')
  if (typeof val === 'string') return val
  return ''
}

// ========== 空表单 ==========
const emptyForm = () => ({
  item_number: '',
  item_name: '',
  item_type: activeTab.value || '成品',
  item_class_number: '',
  item_class_name: '',
  item_properties: '',
  basic_unit: '',
  specifications: '',
  business_scope: [] as string[],
  safety_stock_enabled: 'N',
  safety_stock_qty: 0,
  lead_time_days: 0,
  purchase_lead_time_days: 0,
  remark: '',
  product_drawing_number: '',
  rubber_compound_number: '',
  batch_production_quota: '',
  standard_pass_rate: '',
  inner_pack_qty: 0,
  outer_pack_qty: 0,
  inner_pack_unit: '袋',
  outer_pack_unit: '箱',
  // 原材料扩展"
  supplier_number: '',
  supplier_name: '',
  // 半成品扩展"
  source_bom_number: '',
  // 包材扩展
  packaging_remark: '',
  // 预成型件扩展
  formed_part_materia_consumption: '',
  // 库存分区字段
  batch_management: 'N',
  stagnation_days: 0,
  lock_inventory: 'N',
  default_warehouse: '',
  standard_cost: 0,
  actual_cost: 0,
  rounding_method: '',
  abc_class: '',
  inventory_unit: '',
  outbound_method: '',
  // 生产计划分区字段
  daily_capacity: 0,
  default_routing: '',
  defect_rate: 0,
  conversion_batch_size: 0,
  planning_strategy: '',
  increment_size: 0,
  planning_batch_size: 0,
  production_unit: '',
  // 供应链分区字段"
  configurable_item: 'N',
  market_price_tax: 0,
  sales_unit: '',
  sales_tax_rate: 0,
  sales_price_list: '',
  over_delivery_rate: 0,
  purchase_unit: '',
  // 质量检验分区字段"
  incoming_inspection: 'N',
  enable_quality_chars: 'N'
})

// ========== 新建弹窗 ==========
const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<any>(emptyForm())
const createCollapseKey = ref(['basic'])

const handleCreate = () => {
  Object.assign(createForm, emptyForm())
  createModalVisible.value = true
}

const handleCreateSubmit = async () => {
  if (!createForm.item_number) { message.warning('请输入物料编号'); return }
  if (!createForm.item_type) { message.warning('请选择物品类型'); return }
  createLoading.value = true
  try {
    const res = await createItem({ ...createForm, business_scope: scopeToString(createForm.business_scope) })
    if (res.success) {
      message.success('新建成功')
      createModalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '新建失败')
    }
  } catch {
    message.error('新建失败')
  } finally {
    createLoading.value = false
  }
}

// ========== 复制弹窗 ==========
const copyModalVisible = ref(false)
const copyLoading = ref(false)
const copyForm = reactive<any>(emptyForm())

const handleCopy = async (record: any) => {
  try {
    const res = await getItemDetail(record.item_number)
    if (res.success) {
      Object.assign(copyForm, emptyForm(), res.data)
      copyForm.item_number = ''
      copyForm.business_scope = scopeToArray(copyForm.business_scope)
    } else {
      Object.assign(copyForm, emptyForm(), record)
      copyForm.item_number = ''
      copyForm.business_scope = scopeToArray(copyForm.business_scope)
    }
  } catch {
    Object.assign(copyForm, emptyForm(), record)
    copyForm.item_number = ''
    copyForm.business_scope = scopeToArray(copyForm.business_scope)
  }
  copyModalVisible.value = true
}

const handleCopySubmit = async () => {
  if (!copyForm.item_number) { message.warning('请输入新的物料编号'); return }
  if (!copyForm.item_type) { message.warning('请选择物品类型'); return }
  copyLoading.value = true
  try {
    const res = await createItem({ ...copyForm, business_scope: scopeToString(copyForm.business_scope) })
    if (res.success) {
      message.success('复制成功')
      copyModalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '复制失败，物料编号可能已存在')
    }
  } catch {
    message.error('复制失败')
  } finally {
    copyLoading.value = false
  }
}

// ========== 编辑弹窗 ==========
const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<any>(emptyForm())

// ========== 详情 Drawer ==========
const detailDrawerVisible = ref(false)
const detailLoading = ref(false)
const detailData = ref<any>({})
const { modalStyle: detailModalStyle, onDragStart: detailOnDragStart, resetDrag: detailResetDrag } = useModalDrag()

const handleViewDetail = async (record: any) => {
  detailDrawerVisible.value = true
  detailResetDrag()
  detailLoading.value = true
  try {
    const res = await getItemDetail(record.item_number)
    if (res.success) {
      detailData.value = res.data
    } else {
      detailData.value = record
    }
  } catch {
    detailData.value = record
  } finally {
    detailLoading.value = false
  }
}

// ========== 附件管理 ==========
const editActiveTab = ref('basic')
const editCollapseKey = ref(['basic'])
const attachmentCategory = ref('')
const attachmentList = ref<any[]>([])
const attachmentLoading = ref(false)
const uploadLoading = ref(false)
const attachDesignInputRef = ref<HTMLInputElement>()
const attachOtherInputRef = ref<HTMLInputElement>()

const attachmentColumns = [
  { title: '文件名', dataIndex: 'original_name', key: 'original_name', ellipsis: true },
  { title: '分类', dataIndex: 'category', key: 'category', width: 90 },
  { title: '大小', dataIndex: 'file_size', key: 'file_size', width: 90 },
  { title: '上传者', dataIndex: 'uploader', key: 'uploader', width: 90 },
  { title: '上传时间', dataIndex: 'creation_date', key: 'creation_date', width: 160 },
  { title: '操作', key: 'action', width: 150 }
]

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const formatDate = (dateStr: string): string => {
  if (!dateStr) return ''
  return dayjs(dateStr).format('YYYY-MM-DD HH:mm')
}

const fetchAttachments = async () => {
  if (!editForm.item_number) return
  attachmentLoading.value = true
  try {
    const res = await getItemAttachments(editForm.item_number, attachmentCategory.value || undefined)
    attachmentList.value = res?.data || []
  } catch {
    attachmentList.value = []
  } finally {
    attachmentLoading.value = false
  }
}

const handleAttachmentTabChange = (key: string) => {
  if (key === 'attachment') {
    fetchAttachments()
  }
}

const handleCategoryChange = () => {
  fetchAttachments()
}

const handleUploadDesign = () => {
  attachDesignInputRef.value?.click()
}
const handleUploadOther = () => {
  attachOtherInputRef.value?.click()
}

const doUpload = async (event: Event, category: string) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  uploadLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('category', category)
    const res = await uploadItemAttachment(editForm.item_number, formData)
    if (res.success) {
      message.success('上传成功')
      fetchAttachments()
    } else {
      message.error(res.message || '上传失败')
    }
  } catch {
    message.error('上传失败')
  } finally {
    uploadLoading.value = false
    target.value = ''
  }
}

const canPreview = (mimeType: string): boolean => {
  return (mimeType || '').startsWith('image/') || mimeType === 'application/pdf' || (mimeType || '').startsWith('video/')
}

const handlePreview = (record: any) => {
  window.open('/uploads/' + record.stored_name, '_blank')
}

const handleDownload = async (record: any) => {
  try {
    const res = await downloadItemAttachment(editForm.item_number, record.id)
    const blob = new Blob([res.data], { type: record.mime_type || 'application/octet-stream' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = record.original_name || record.stored_name
    link.click()
    URL.revokeObjectURL(link.href)
  } catch {
    message.error('下载失败')
  }
}

const handleDeleteAttachment = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除附件 "${record.original_name}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteItemAttachment(editForm.item_number, record.id)
        if (res.success) {
          message.success('删除成功')
          fetchAttachments()
        } else {
          message.error(res.message || '删除失败')
        }
      } catch {
        message.error('删除失败')
      }
    }
  })
}

const handleEdit = async (record: any) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  editActiveTab.value = 'basic'
  attachmentCategory.value = ''
  attachmentList.value = []
  try {
    const res = await getItemDetail(record.item_number)
    const detail = res.data || record
    Object.assign(editForm, emptyForm(), detail)
    editForm.business_scope = scopeToArray(editForm.business_scope)
    editModalVisible.value = true
  } catch {
    Object.assign(editForm, emptyForm(), record)
    editForm.business_scope = scopeToArray(editForm.business_scope)
    editModalVisible.value = true
  }
}

const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const res = await updateItem(editForm.item_number, { ...editForm, business_scope: scopeToString(editForm.business_scope) })
    if (res.success) {
      message.success('修改成功')
      editModalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '修改失败')
    }
  } catch {
    message.error('修改失败')
  } finally {
    editLoading.value = false
  }
}

// ========== 删除 ==========
const handleDelete = (record: any) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除 "${record.item_name}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteItem(record.item_number)
        if (res.success) {
          message.success('删除成功')
          fetchData()
        } else {
          message.error(res.message || '删除失败')
        }
      } catch {
        message.error('删除失败')
      }
    }
  })
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveItem(record.item_number)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消物料「${(record.item_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawItem(record.item_number)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

// ========== 导入导出 ==========
const fileInputRef = ref<HTMLInputElement>()

const handleExport = async () => {
  try {
    const params: any = { search: searchText.value || undefined }
    if (activeTab.value) params.item_type = activeTab.value
    const res = await exportItems(params)
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename(`items_${activeTab.value || 'all'}`)
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch {
    message.error('导出失败')
  }
}

const handleImportClick = () => {
  if (!activeTab.value) {
    message.warning('请先选择具体的物品类型Tab后再导入')
    return
  }
  fileInputRef.value?.click()
}

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await importItems(formData, activeTab.value)
    if (res.success) {
      message.success(res.message || '导入成功')
      fetchData()
    } else {
      message.error(res.message || '导入失败')
    }
  } catch {
    message.error('导入失败')
  } finally {
    target.value = ''
  }
}

// ========== 初始化 ==========
onMounted(() => {
  fetchData()
  fetchProductClasses()
  fetchMaterialClasses()
  fetchMateriaProperties()
  fetchUnits()
  fetchWarehouses()
})
</script>

<template>
  <div class="item-master-page">
    <a-card title="物料主数据管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索编号/名称/分类"
            style="width: 260px"
            allow-clear
            @search="handleSearch"
            @pressEnter="handleSearch"
          />
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
          <input
            ref="fileInputRef"
            type="file"
            accept=".xlsx,.xls"
            style="display: none"
            @change="handleFileChange"
          />
          <a-button type="primary" @click="handleCreate">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
        </a-space>
      </template>

      <!-- Tab切换 -->
      <a-tabs v-model:activeKey="activeTab" @change="handleTabChange" style="margin-bottom: 8px">
        <a-tab-pane v-for="tab in tabs" :key="tab.key" :tab="tab.label" />
      </a-tabs>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :row-selection="rowSelection"
        :scroll="{ x: scrollX, y: 'calc(100vh - 340px)' }"
        row-key="item_number"
        size="middle"
        bordered
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'item_type'">
            <a-tag :color="record.item_type === '成品' ? 'blue' : record.item_type === '原材料' ? 'green' : record.item_type === '半成品' ? 'orange' : record.item_type === '骨架' ? 'cyan' : record.item_type === '预成型件' ? 'geekblue' : 'purple'">
              {{ record.item_type }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'business_scope'">
            <template v-if="record.business_scope">
              <a-tag v-for="s in record.business_scope.split(',')" :key="s" color="blue" style="margin: 1px; font-size: 11px; padding: 0 4px; line-height: 18px">{{ s }}</a-tag>
            </template>
          </template>
          <template v-else-if="column.key === 'safety_stock_enabled'">
            <a-tag :color="record.safety_stock_enabled === 'Y' ? 'green' : 'default'">
              {{ record.safety_stock_enabled || 'N' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'creation_date'">
            {{ record.creation_date ? formatDate(record.creation_date) : '-' }}
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="(record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (record.approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-tooltip title="查看详情">
                <a-button type="link" size="small" @click="handleViewDetail(record)">
                  <template #icon><InfoCircleOutlined /></template>
                </a-button>
              </a-tooltip>
              <a-tooltip title="修改">
                <a-button type="link" size="small" @click="handleEdit(record)">
                  <template #icon><EditOutlined /></template>
                </a-button>
              </a-tooltip>
              <a-tooltip title="复制">
                <a-button type="link" size="small" @click="handleCopy(record)">
                  <template #icon><CopyOutlined /></template>
                </a-button>
              </a-tooltip>
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>
                  更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="(record.approval_status || '').trim() !== APPROVAL_STATUS.APPROVED" @click="handleApprove(record)">审核</a-menu-item>
                    <a-menu-item v-else @click="handleWithdraw(record)">撤消</a-menu-item>
                    <a-menu-item @click="handleDelete(record)">删除</a-menu-item>
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
      v-model:open="createModalVisible"
      title="新建物料"
      :confirm-loading="createLoading"
      @ok="handleCreateSubmit"
      width="960px"
      centered
      class="item-modal"
    >
      <a-collapse v-model:activeKey="createCollapseKey" :bordered="false" style="background: transparent">
        <!-- 基本信息 -->
        <a-collapse-panel key="basic" header="基本信息">
          <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 15 }">
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="物料编号" required>
                <a-input v-model:value="createForm.item_number" placeholder="请输入物料编号" />
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="物料名称">
                <a-input v-model:value="createForm.item_name" placeholder="请输入物料名称" />
              </a-form-item></a-col>
            </a-row>
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="物品类型" required>
                <a-select v-model:value="createForm.item_type" :disabled="!!activeTab">
                  <a-select-option value="成品">成品</a-select-option>
                  <a-select-option value="半成品">半成品</a-select-option>
                  <a-select-option value="原材料">原材料</a-select-option>
                  <a-select-option value="包材">包材</a-select-option>
                  <a-select-option value="骨架">骨架</a-select-option>
                  <a-select-option value="预成型件">预成型件</a-select-option>
                </a-select>
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="物料属性">
                <a-select
                  v-model:value="createForm.item_properties"
                  placeholder="请选择物料属性"
                  show-search allow-clear
                  :options="materiaPropertyOptions"
                  :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                />
              </a-form-item></a-col>
            </a-row>
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="基本单位">
                <a-select
                  v-model:value="createForm.basic_unit"
                  placeholder="请选择单位"
                  show-search allow-clear
                  :options="unitOptions"
                  :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                />
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="规格">
                <a-input v-model:value="createForm.specifications" placeholder="请输入规格" />
              </a-form-item></a-col>
            </a-row>
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="业务范围">
                <a-select v-model:value="createForm.business_scope" placeholder="请选择业务范围" mode="multiple" allow-clear>
                  <a-select-option value="销售">销售</a-select-option>
                  <a-select-option value="生产">生产</a-select-option>
                  <a-select-option value="采购">采购</a-select-option>
                  <a-select-option value="委外">委外</a-select-option>
                </a-select>
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="备注">
                <a-input v-model:value="createForm.remark" placeholder="请输入备注" />
              </a-form-item></a-col>
            </a-row>
            <!-- 类型特定扩展字段 -->
            <template v-if="createForm.item_type === '成品'">
              <a-row :gutter="8">
                <a-col :span="12"><a-form-item label="分类编号">
                  <a-select
                    :value="createForm.item_class_number"
                    placeholder="请选择分类"
                    show-search allow-clear
                    :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                    @change="(val: string) => handleClassChange(val, createForm)"
                  >
                    <a-select-option
                      v-for="opt in getClassOptions(createForm.item_type)"
                      :key="opt.value"
                      :value="opt.value"
                      :label="opt.label"
                    >{{ opt.label }}</a-select-option>
                  </a-select>
                </a-form-item></a-col>
                <a-col :span="12"><a-form-item label="分类名称">
                  <a-input v-model:value="createForm.item_class_name" disabled />
                </a-form-item></a-col>
              </a-row>
              <a-row :gutter="8">
                <a-col :span="12"><a-form-item label="产品图号">
                  <a-input v-model:value="createForm.product_drawing_number" placeholder="请输入产品图号" />
                </a-form-item></a-col>
                <a-col :span="12"><a-form-item label="胶料编号">
                  <a-input v-model:value="createForm.rubber_compound_number" placeholder="请输入胶料编号" />
                </a-form-item></a-col>
              </a-row>
              <a-row :gutter="8">
                <a-col :span="12"><a-form-item label="批次产量定额">
                  <a-input v-model:value="createForm.batch_production_quota" placeholder="请输入批次产量定额" />
                </a-form-item></a-col>
                <a-col :span="12"><a-form-item label="标准合格率">
                  <a-input v-model:value="createForm.standard_pass_rate" placeholder="请输入标准合格率" />
                </a-form-item></a-col>
              </a-row>
              <a-row :gutter="8">
                <a-col :span="12"><a-form-item label="内包装数量(每袋)">
                  <a-input-number v-model:value="createForm.inner_pack_qty" :min="0" :precision="0" placeholder="每袋标准数量" style="width:100%" />
                </a-form-item></a-col>
                <a-col :span="12"><a-form-item label="外包装数量(每箱袋数)">
                  <a-input-number v-model:value="createForm.outer_pack_qty" :min="0" :precision="0" placeholder="每箱装几袋" style="width:100%" />
                </a-form-item></a-col>
              </a-row>
            </template>
            <template v-if="createForm.item_type === '原材料'">
              <a-row :gutter="8">
                <a-col :span="12"><a-form-item label="供应商编号">
                  <a-input v-model:value="createForm.supplier_number" placeholder="请输入供应商编号" />
                </a-form-item></a-col>
                <a-col :span="12"><a-form-item label="供应商名称">
                  <a-input v-model:value="createForm.supplier_name" placeholder="请输入供应商名称" />
                </a-form-item></a-col>
              </a-row>
            </template>
            <template v-if="createForm.item_type === '半成品'">
              <a-row :gutter="8">
                <a-col :span="12"><a-form-item label="来源BOM编号">
                  <a-input v-model:value="createForm.source_bom_number" placeholder="请输入来源BOM编号" />
                </a-form-item></a-col>
              </a-row>
            </template>
            <template v-if="createForm.item_type === '包材'">
              <a-row :gutter="8">
                <a-col :span="12"><a-form-item label="包材备注">
                  <a-input v-model:value="createForm.packaging_remark" placeholder="请输入包材备注" />
                </a-form-item></a-col>
              </a-row>
            </template>
            <template v-if="createForm.item_type === '骨架'">
              <a-row :gutter="8">
                <a-col :span="12"><a-form-item label="产品图号">
                  <a-input v-model:value="createForm.product_drawing_number" placeholder="请输入产品图号" />
                </a-form-item></a-col>
                <a-col :span="12"><a-form-item label="标准合格率">
                  <a-input v-model:value="createForm.standard_pass_rate" placeholder="请输入标准合格率" />
                </a-form-item></a-col>
              </a-row>
            </template>
            <template v-if="createForm.item_type === '预成型件'">
              <a-row :gutter="8">
                <a-col :span="12"><a-form-item label="胶料编号">
                  <a-input v-model:value="createForm.rubber_compound_number" placeholder="请输入胶料编号" />
                </a-form-item></a-col>
                <a-col :span="12"><a-form-item label="标准合格率">
                  <a-input v-model:value="createForm.standard_pass_rate" placeholder="请输入标准合格率" />
                </a-form-item></a-col>
              </a-row>
              <a-row :gutter="8">
                <a-col :span="12"><a-form-item label="成型件单耗">
                  <a-input v-model:value="createForm.formed_part_materia_consumption" placeholder="请输入成型件单耗" />
                </a-form-item></a-col>
              </a-row>
            </template>
          </a-form>
        </a-collapse-panel>

        <!-- 库存信息 -->
        <a-collapse-panel key="inventory" header="库存信息">
          <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 15 }">
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="批次管理">
                <a-select v-model:value="createForm.batch_management">
                  <a-select-option value="Y">是</a-select-option>
                  <a-select-option value="N">否</a-select-option>
                </a-select>
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="呆滞天数">
                <a-input-number v-model:value="createForm.stagnation_days" :min="0" style="width: 100%" />
              </a-form-item></a-col>
            </a-row>
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="锁定库存">
                <a-select v-model:value="createForm.lock_inventory">
                  <a-select-option value="Y">是</a-select-option>
                  <a-select-option value="N">否</a-select-option>
                </a-select>
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="默认仓库">
                <a-auto-complete v-model:value="createForm.default_warehouse" :options="filteredWarehouseForCreate" @search="createWarehouseSearch = $event" placeholder="输入仓库编号或名称搜索" allow-clear />
              </a-form-item></a-col>
            </a-row>
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="标准成本">
                <a-input-number v-model:value="createForm.standard_cost" :min="0" :precision="2" style="width: 100%" />
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="实际成本">
                <a-input-number v-model:value="createForm.actual_cost" :min="0" :precision="2" style="width: 100%" />
              </a-form-item></a-col>
            </a-row>
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="舍入方法">
                <a-select v-model:value="createForm.rounding_method" placeholder="请选择舍入方法" allow-clear>
                  <a-select-option value="四舍五入">四舍五入</a-select-option>
                  <a-select-option value="向上取整">向上取整</a-select-option>
                  <a-select-option value="向下取整">向下取整</a-select-option>
                </a-select>
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="ABC分类">
                <a-select v-model:value="createForm.abc_class" placeholder="请选择ABC分类" allow-clear>
                  <a-select-option value="A">A类</a-select-option>
                  <a-select-option value="B">B类</a-select-option>
                  <a-select-option value="C">C类</a-select-option>
                </a-select>
              </a-form-item></a-col>
            </a-row>
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="库存单位">
                <a-select
                  v-model:value="createForm.inventory_unit"
                  placeholder="请选择库存单位"
                  show-search allow-clear
                  :options="unitOptions"
                  :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                />
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="出库方法">
                <a-select v-model:value="createForm.outbound_method" placeholder="请选择出库方法" allow-clear>
                  <a-select-option value="先进先出">先进先出</a-select-option>
                  <a-select-option value="后进先出">后进先出</a-select-option>
                  <a-select-option value="加权平均">加权平均</a-select-option>
                </a-select>
              </a-form-item></a-col>
            </a-row>
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="安全库存管理">
                <a-select v-model:value="createForm.safety_stock_enabled">
                  <a-select-option value="Y">是</a-select-option>
                  <a-select-option value="N">否</a-select-option>
                </a-select>
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="安全库存数" v-if="createForm.safety_stock_enabled === 'Y'">
                <a-input-number v-model:value="createForm.safety_stock_qty" :min="0" style="width: 100%" />
              </a-form-item></a-col>
            </a-row>
          </a-form>
        </a-collapse-panel>

        <!-- 生产与计划'-->
        <a-collapse-panel key="production" header="生产与计划">
          <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 15 }">
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="日产能">
                <a-input-number v-model:value="createForm.daily_capacity" :min="0" style="width: 100%" />
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="默认工艺路线">
                <a-input v-model:value="createForm.default_routing" placeholder="请输入默认工艺路线" />
              </a-form-item></a-col>
            </a-row>
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="缺陷率(%)">
                <a-input-number v-model:value="createForm.defect_rate" :min="0" :max="100" :precision="2" style="width: 100%" />
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="转换批量">
                <a-input-number v-model:value="createForm.conversion_batch_size" :min="0" style="width: 100%" />
              </a-form-item></a-col>
            </a-row>
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="计划策略">
                <a-input v-model:value="createForm.planning_strategy" placeholder="请输入计划策略" />
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="增量大小">
                <a-input-number v-model:value="createForm.increment_size" :min="0" style="width: 100%" />
              </a-form-item></a-col>
            </a-row>
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="计划批量">
                <a-input-number v-model:value="createForm.planning_batch_size" :min="0" style="width: 100%" />
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="生产单位">
                <a-select
                  v-model:value="createForm.production_unit"
                  placeholder="请选择生产单位"
                  show-search allow-clear
                  :options="unitOptions"
                  :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                />
              </a-form-item></a-col>
            </a-row>
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="生产提前期(天)">
                <a-input-number v-model:value="createForm.lead_time_days" :min="0" :precision="0" style="width: 100%" />
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="采购提前期(天)">
                <a-input-number v-model:value="createForm.purchase_lead_time_days" :min="0" :precision="0" style="width: 100%" />
              </a-form-item></a-col>
            </a-row>
          </a-form>
        </a-collapse-panel>

        <!-- 供应链'-->
        <a-collapse-panel key="supply" header="供应链">
          <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 15 }">
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="可配置物料">
                <a-select v-model:value="createForm.configurable_item">
                  <a-select-option value="Y">是</a-select-option>
                  <a-select-option value="N">否</a-select-option>
                </a-select>
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="市场价(含税)">
                <a-input-number v-model:value="createForm.market_price_tax" :min="0" :precision="2" style="width: 100%" />
              </a-form-item></a-col>
            </a-row>
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="销售单位">
                <a-select
                  v-model:value="createForm.sales_unit"
                  placeholder="请选择销售单位"
                  show-search allow-clear
                  :options="unitOptions"
                  :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                />
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="销售税率(%)">
                <a-input-number v-model:value="createForm.sales_tax_rate" :min="0" :max="100" :precision="2" style="width: 100%" />
              </a-form-item></a-col>
            </a-row>
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="销售价格表">
                <a-input v-model:value="createForm.sales_price_list" placeholder="请输入销售价格表" />
              </a-form-item></a-col>
              <a-col :span="12"><a-form-item label="超交率(%)">
                <a-input-number v-model:value="createForm.over_delivery_rate" :min="0" :max="100" :precision="2" style="width: 100%" />
              </a-form-item></a-col>
            </a-row>
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="采购单位">
                <a-select
                  v-model:value="createForm.purchase_unit"
                  placeholder="请选择采购单位"
                  show-search allow-clear
                  :options="unitOptions"
                  :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                />
              </a-form-item></a-col>
            </a-row>
          </a-form>
        </a-collapse-panel>

        <!-- 质量检验'-->
        <a-collapse-panel key="quality" header="质量检验">
          <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 15 }">
            <a-row :gutter="8">
              <a-col :span="12"><a-form-item label="来料检验">
                <a-select v-model:value="createForm.incoming_inspection">
                  <a-select-option value="Y">需要</a-select-option>
                  <a-select-option value="N">不需要</a-select-option>
                </a-select>
              </a-form-item></a-col>
              <a-col v-if="createForm.incoming_inspection === 'Y'" :span="12"><a-form-item label="启用质量特性">
                <a-select v-model:value="createForm.enable_quality_chars">
                  <a-select-option value="Y">启用</a-select-option>
                  <a-select-option value="N">不启用</a-select-option>
                </a-select>
              </a-form-item></a-col>
            </a-row>
          </a-form>
        </a-collapse-panel>
      </a-collapse>
    </a-modal>

    <!-- 编辑弹窗 -->
    <a-modal
      v-model:open="editModalVisible"
      title="修改物料"
      :confirm-loading="editLoading"
      @ok="handleEditSubmit"
      width="960px"
      centered
      class="item-modal"
    >
      <a-tabs v-model:activeKey="editActiveTab" @change="handleAttachmentTabChange" size="small">
        <a-tab-pane key="basic" tab="基本信息">
          <a-collapse v-model:activeKey="editCollapseKey" :bordered="false" style="background: transparent">
            <!-- 基本信息 -->
            <a-collapse-panel key="basic" header="基本信息">
              <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 15 }">
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="物料编号">
                    <a-input v-model:value="editForm.item_number" disabled />
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="物料名称">
                    <a-input v-model:value="editForm.item_name" />
                  </a-form-item></a-col>
                </a-row>
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="物品类型">
                    <a-select v-model:value="editForm.item_type" disabled>
                      <a-select-option value="成品">成品</a-select-option>
                      <a-select-option value="半成品">半成品</a-select-option>
                      <a-select-option value="原材料">原材料</a-select-option>
                      <a-select-option value="包材">包材</a-select-option>
                      <a-select-option value="骨架">骨架</a-select-option>
                      <a-select-option value="预成型件">预成型件</a-select-option>
                    </a-select>
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="物料属性">
                    <a-select
                      v-model:value="editForm.item_properties"
                      placeholder="请选择物料属性"
                      show-search allow-clear
                      :options="materiaPropertyOptions"
                      :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                    />
                  </a-form-item></a-col>
                </a-row>
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="基本单位">
                    <a-select
                      v-model:value="editForm.basic_unit"
                      placeholder="请选择单位"
                      show-search allow-clear
                      :options="unitOptions"
                      :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                    />
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="规格">
                    <a-input v-model:value="editForm.specifications" />
                  </a-form-item></a-col>
                </a-row>
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="业务范围">
                    <a-select v-model:value="editForm.business_scope" placeholder="请选择业务范围" mode="multiple" allow-clear>
                      <a-select-option value="销售">销售</a-select-option>
                      <a-select-option value="生产">生产</a-select-option>
                      <a-select-option value="采购">采购</a-select-option>
                      <a-select-option value="委外">委外</a-select-option>
                    </a-select>
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="备注">
                    <a-input v-model:value="editForm.remark" />
                  </a-form-item></a-col>
                </a-row>
                <!-- 类型特定扩展字段 -->
                <template v-if="editForm.item_type === '成品'">
                  <a-row :gutter="8">
                    <a-col :span="12"><a-form-item label="分类编号">
                      <a-select
                        :value="editForm.item_class_number"
                        placeholder="请选择分类"
                        show-search allow-clear
                        :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                        @change="(val: string) => handleClassChange(val, editForm)"
                      >
                        <a-select-option
                          v-for="opt in getClassOptions(editForm.item_type)"
                          :key="opt.value"
                          :value="opt.value"
                          :label="opt.label"
                        >{{ opt.label }}</a-select-option>
                      </a-select>
                    </a-form-item></a-col>
                    <a-col :span="12"><a-form-item label="分类名称">
                      <a-input v-model:value="editForm.item_class_name" disabled />
                    </a-form-item></a-col>
                  </a-row>
                  <a-row :gutter="8">
                    <a-col :span="12"><a-form-item label="产品图号">
                      <a-input v-model:value="editForm.product_drawing_number" />
                    </a-form-item></a-col>
                    <a-col :span="12"><a-form-item label="胶料编号">
                      <a-input v-model:value="editForm.rubber_compound_number" />
                    </a-form-item></a-col>
                  </a-row>
                  <a-row :gutter="8">
                    <a-col :span="12"><a-form-item label="批次产量定额">
                      <a-input v-model:value="editForm.batch_production_quota" />
                    </a-form-item></a-col>
                    <a-col :span="12"><a-form-item label="标准合格率">
                      <a-input v-model:value="editForm.standard_pass_rate" />
                    </a-form-item></a-col>
                  </a-row>
                  <a-row :gutter="8">
                    <a-col :span="12"><a-form-item label="内包装数量(每袋)">
                      <a-input-number v-model:value="editForm.inner_pack_qty" :min="0" :precision="0" placeholder="每袋标准数量" style="width:100%" />
                    </a-form-item></a-col>
                    <a-col :span="12"><a-form-item label="外包装数量(每箱袋数)">
                      <a-input-number v-model:value="editForm.outer_pack_qty" :min="0" :precision="0" placeholder="每箱装几袋" style="width:100%" />
                    </a-form-item></a-col>
                  </a-row>
                </template>
                <template v-if="editForm.item_type === '原材料'">
                  <a-row :gutter="8">
                    <a-col :span="12"><a-form-item label="供应商编号">
                      <a-input v-model:value="editForm.supplier_number" />
                    </a-form-item></a-col>
                    <a-col :span="12"><a-form-item label="供应商名称">
                      <a-input v-model:value="editForm.supplier_name" />
                    </a-form-item></a-col>
                  </a-row>
                </template>
                <template v-if="editForm.item_type === '半成品'">
                  <a-row :gutter="8">
                    <a-col :span="12"><a-form-item label="来源BOM编号">
                      <a-input v-model:value="editForm.source_bom_number" />
                    </a-form-item></a-col>
                  </a-row>
                </template>
                <template v-if="editForm.item_type === '包材'">
                  <a-row :gutter="8">
                    <a-col :span="12"><a-form-item label="包材备注">
                      <a-input v-model:value="editForm.packaging_remark" />
                    </a-form-item></a-col>
                  </a-row>
                </template>
                <template v-if="editForm.item_type === '骨架'">
                  <a-row :gutter="8">
                    <a-col :span="12"><a-form-item label="产品图号">
                      <a-input v-model:value="editForm.product_drawing_number" />
                    </a-form-item></a-col>
                    <a-col :span="12"><a-form-item label="标准合格率">
                      <a-input v-model:value="editForm.standard_pass_rate" />
                    </a-form-item></a-col>
                  </a-row>
                </template>
                <template v-if="editForm.item_type === '预成型件'">
                  <a-row :gutter="8">
                    <a-col :span="12"><a-form-item label="胶料编号">
                      <a-input v-model:value="editForm.rubber_compound_number" />
                    </a-form-item></a-col>
                    <a-col :span="12"><a-form-item label="标准合格率">
                      <a-input v-model:value="editForm.standard_pass_rate" />
                    </a-form-item></a-col>
                  </a-row>
                  <a-row :gutter="8">
                    <a-col :span="12"><a-form-item label="成型件单耗">
                      <a-input v-model:value="editForm.formed_part_materia_consumption" />
                    </a-form-item></a-col>
                  </a-row>
                </template>
              </a-form>
            </a-collapse-panel>

            <!-- 库存信息 -->
            <a-collapse-panel key="inventory" header="库存信息">
              <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 15 }">
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="批次管理">
                    <a-select v-model:value="editForm.batch_management">
                      <a-select-option value="Y">是</a-select-option>
                      <a-select-option value="N">否</a-select-option>
                    </a-select>
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="呆滞天数">
                    <a-input-number v-model:value="editForm.stagnation_days" :min="0" style="width: 100%" />
                  </a-form-item></a-col>
                </a-row>
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="锁定库存">
                    <a-select v-model:value="editForm.lock_inventory">
                      <a-select-option value="Y">是</a-select-option>
                      <a-select-option value="N">否</a-select-option>
                    </a-select>
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="默认仓库">
                    <a-auto-complete v-model:value="editForm.default_warehouse" :options="filteredWarehouseForEdit" @search="editWarehouseSearch = $event" placeholder="输入仓库编号或名称搜索" allow-clear />
                  </a-form-item></a-col>
                </a-row>
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="标准成本">
                    <a-input-number v-model:value="editForm.standard_cost" :min="0" :precision="2" style="width: 100%" />
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="实际成本">
                    <a-input-number v-model:value="editForm.actual_cost" :min="0" :precision="2" style="width: 100%" />
                  </a-form-item></a-col>
                </a-row>
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="舍入方法">
                    <a-select v-model:value="editForm.rounding_method" placeholder="请选择舍入方法" allow-clear>
                      <a-select-option value="四舍五入">四舍五入</a-select-option>
                      <a-select-option value="向上取整">向上取整</a-select-option>
                      <a-select-option value="向下取整">向下取整</a-select-option>
                    </a-select>
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="ABC分类">
                    <a-select v-model:value="editForm.abc_class" placeholder="请选择ABC分类" allow-clear>
                      <a-select-option value="A">A类</a-select-option>
                      <a-select-option value="B">B类</a-select-option>
                      <a-select-option value="C">C类</a-select-option>
                    </a-select>
                  </a-form-item></a-col>
                </a-row>
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="库存单位">
                    <a-select
                      v-model:value="editForm.inventory_unit"
                      placeholder="请选择库存单位"
                      show-search allow-clear
                      :options="unitOptions"
                      :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                    />
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="出库方法">
                    <a-select v-model:value="editForm.outbound_method" placeholder="请选择出库方法" allow-clear>
                      <a-select-option value="先进先出">先进先出</a-select-option>
                      <a-select-option value="后进先出">后进先出</a-select-option>
                      <a-select-option value="加权平均">加权平均</a-select-option>
                    </a-select>
                  </a-form-item></a-col>
                </a-row>
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="安全库存管理">
                    <a-select v-model:value="editForm.safety_stock_enabled">
                      <a-select-option value="Y">是</a-select-option>
                      <a-select-option value="N">否</a-select-option>
                    </a-select>
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="安全库存数" v-if="editForm.safety_stock_enabled === 'Y'">
                    <a-input-number v-model:value="editForm.safety_stock_qty" :min="0" style="width: 100%" />
                  </a-form-item></a-col>
                </a-row>
              </a-form>
            </a-collapse-panel>

            <!-- 生产与计划'-->
            <a-collapse-panel key="production" header="生产与计划">
              <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 15 }">
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="日产能">
                    <a-input-number v-model:value="editForm.daily_capacity" :min="0" style="width: 100%" />
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="默认工艺路线">
                    <a-input v-model:value="editForm.default_routing" placeholder="请输入默认工艺路线" />
                  </a-form-item></a-col>
                </a-row>
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="缺陷率(%)">
                    <a-input-number v-model:value="editForm.defect_rate" :min="0" :max="100" :precision="2" style="width: 100%" />
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="转换批量">
                    <a-input-number v-model:value="editForm.conversion_batch_size" :min="0" style="width: 100%" />
                  </a-form-item></a-col>
                </a-row>
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="计划策略">
                    <a-input v-model:value="editForm.planning_strategy" placeholder="请输入计划策略" />
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="增量大小">
                    <a-input-number v-model:value="editForm.increment_size" :min="0" style="width: 100%" />
                  </a-form-item></a-col>
                </a-row>
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="计划批量">
                    <a-input-number v-model:value="editForm.planning_batch_size" :min="0" style="width: 100%" />
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="生产单位">
                    <a-select
                      v-model:value="editForm.production_unit"
                      placeholder="请选择生产单位"
                      show-search allow-clear
                      :options="unitOptions"
                      :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                    />
                  </a-form-item></a-col>
                </a-row>
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="生产提前期(天)">
                    <a-input-number v-model:value="editForm.lead_time_days" :min="0" :precision="0" style="width: 100%" />
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="采购提前期(天)">
                    <a-input-number v-model:value="editForm.purchase_lead_time_days" :min="0" :precision="0" style="width: 100%" />
                  </a-form-item></a-col>
                </a-row>
              </a-form>
            </a-collapse-panel>

            <!-- 供应链'-->
            <a-collapse-panel key="supply" header="供应链">
              <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 15 }">
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="可配置物料">
                    <a-select v-model:value="editForm.configurable_item">
                      <a-select-option value="Y">是</a-select-option>
                      <a-select-option value="N">否</a-select-option>
                    </a-select>
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="市场价(含税)">
                    <a-input-number v-model:value="editForm.market_price_tax" :min="0" :precision="2" style="width: 100%" />
                  </a-form-item></a-col>
                </a-row>
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="销售单位">
                    <a-select
                      v-model:value="editForm.sales_unit"
                      placeholder="请选择销售单位"
                      show-search allow-clear
                      :options="unitOptions"
                      :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                    />
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="销售税率(%)">
                    <a-input-number v-model:value="editForm.sales_tax_rate" :min="0" :max="100" :precision="2" style="width: 100%" />
                  </a-form-item></a-col>
                </a-row>
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="销售价格表">
                    <a-input v-model:value="editForm.sales_price_list" placeholder="请输入销售价格表" />
                  </a-form-item></a-col>
                  <a-col :span="12"><a-form-item label="超交率(%)">
                    <a-input-number v-model:value="editForm.over_delivery_rate" :min="0" :max="100" :precision="2" style="width: 100%" />
                  </a-form-item></a-col>
                </a-row>
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="采购单位">
                    <a-select
                      v-model:value="editForm.purchase_unit"
                      placeholder="请选择采购单位"
                      show-search allow-clear
                      :options="unitOptions"
                      :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                    />
                  </a-form-item></a-col>
                </a-row>
              </a-form>
            </a-collapse-panel>

            <!-- 质量检验'-->
            <a-collapse-panel key="quality" header="质量检验">
              <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 15 }">
                <a-row :gutter="8">
                  <a-col :span="12"><a-form-item label="来料检验">
                    <a-select v-model:value="editForm.incoming_inspection">
                      <a-select-option value="Y">需要</a-select-option>
                      <a-select-option value="N">不需要</a-select-option>
                    </a-select>
                  </a-form-item></a-col>
                  <a-col v-if="editForm.incoming_inspection === 'Y'" :span="12"><a-form-item label="启用质量特性">
                    <a-select v-model:value="editForm.enable_quality_chars">
                      <a-select-option value="Y">启用</a-select-option>
                      <a-select-option value="N">不启用</a-select-option>
                    </a-select>
                  </a-form-item></a-col>
                </a-row>
              </a-form>
            </a-collapse-panel>
          </a-collapse>
        </a-tab-pane>

        <a-tab-pane key="attachment" tab="附件管理">
          <div class="attachment-toolbar">
            <a-radio-group v-model:value="attachmentCategory" button-style="solid" size="small" @change="handleCategoryChange">
              <a-radio-button value="">全部</a-radio-button>
              <a-radio-button value="设计图纸">设计图纸</a-radio-button>
              <a-radio-button value="其他文件">其他文件</a-radio-button>
            </a-radio-group>
            <a-space style="margin-left: auto">
              <a-button size="small" :loading="uploadLoading" @click="handleUploadDesign">
                <template #icon><FileImageOutlined /></template>
                上传设计图纸
              </a-button>
              <a-button size="small" :loading="uploadLoading" @click="handleUploadOther">
                <template #icon><FolderOutlined /></template>
                上传其他文件
              </a-button>
            </a-space>
            <input ref="attachDesignInputRef" type="file" accept=".png,.jpg,.jpeg,.pdf" style="display:none" @change="(e: Event) => doUpload(e, '设计图纸')" />
            <input ref="attachOtherInputRef" type="file" accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.zip,.txt,.mp4,.webm,.avi,.mov,.wmv" style="display:none" @change="(e: Event) => doUpload(e, '其他文件')" />
          </div>
          <a-table
            :columns="attachmentColumns"
            :data-source="attachmentList"
            :loading="attachmentLoading"
            :pagination="false"
            row-key="id"
            size="small"
            :scroll="{ y: 320 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'original_name'">
                <PaperClipOutlined style="margin-right: 4px; color: #999" />
                {{ record.original_name }}
              </template>
              <template v-else-if="column.key === 'category'">
                <a-tag :color="record.category === '设计图纸' ? 'blue' : 'green'" style="font-size: 11px">
                  {{ record.category }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'file_size'">
                {{ formatFileSize(record.file_size) }}
              </template>
              <template v-else-if="column.key === 'creation_date'">
                {{ formatDate(record.creation_date) }}
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space :size="2">
                  <a-tooltip title="预览" v-if="canPreview(record.mime_type)">
                    <a-button type="link" size="small" @click="handlePreview(record)">
                      <template #icon><EyeOutlined /></template>
                    </a-button>
                  </a-tooltip>
                  <a-tooltip title="下载">
                    <a-button type="link" size="small" @click="handleDownload(record)">
                      <template #icon><DownloadOutlined /></template>
                    </a-button>
                  </a-tooltip>
                  <a-tooltip title="删除">
                    <a-button type="link" danger size="small" @click="handleDeleteAttachment(record)">
                      <template #icon><DeleteOutlined /></template>
                    </a-button>
                  </a-tooltip>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-modal>
    <a-modal
      v-model:open="copyModalVisible"
      title="复制物料"
      :confirm-loading="copyLoading"
      @ok="handleCopySubmit"
      width="720px"
      centered
      class="item-modal"
    >
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 15 }">
        <a-row :gutter="8">
          <a-col :span="12"><a-form-item label="物料编号" required>
            <a-input v-model:value="copyForm.item_number" placeholder="请输入新的物料编号" />
          </a-form-item></a-col>
          <a-col :span="12"><a-form-item label="物料名称">
            <a-input v-model:value="copyForm.item_name" />
          </a-form-item></a-col>
        </a-row>
        <a-row :gutter="8">
          <a-col :span="12"><a-form-item label="物品类型">
            <a-select v-model:value="copyForm.item_type" disabled>
              <a-select-option value="成品">成品</a-select-option>
              <a-select-option value="半成品">半成品</a-select-option>
              <a-select-option value="原材料">原材料</a-select-option>
              <a-select-option value="包材">包材</a-select-option>
              <a-select-option value="骨架">骨架</a-select-option>
              <a-select-option value="预成型件">预成型件</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="12"><a-form-item label="物料属性">
            <a-select
              v-model:value="copyForm.item_properties"
              placeholder="请选择物料属性"
              show-search allow-clear
              :options="materiaPropertyOptions"
              :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
            />
          </a-form-item></a-col>
        </a-row>
        <a-row :gutter="8">
          <a-col :span="12"><a-form-item label="基本单位">
            <a-select
              v-model:value="copyForm.basic_unit"
              placeholder="请选择单位"
              show-search allow-clear
              :options="unitOptions"
              :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
            />
          </a-form-item></a-col>
          <a-col :span="12"><a-form-item label="规格">
            <a-input v-model:value="copyForm.specifications" />
          </a-form-item></a-col>
        </a-row>
        <a-row :gutter="8">
          <a-col :span="12"><a-form-item label="业务范围">
            <a-select v-model:value="copyForm.business_scope" placeholder="请选择业务范围" mode="multiple" allow-clear>
              <a-select-option value="销售">销售</a-select-option>
              <a-select-option value="生产">生产</a-select-option>
              <a-select-option value="采购">采购</a-select-option>
              <a-select-option value="委外">委外</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="12"><a-form-item label="备注">
            <a-input v-model:value="copyForm.remark" />
          </a-form-item></a-col>
        </a-row>
        <a-row :gutter="8">
          <a-col :span="12"><a-form-item label="安全库存管理">
            <a-select v-model:value="copyForm.safety_stock_enabled">
              <a-select-option value="Y">Y</a-select-option>
              <a-select-option value="N">N</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="12"><a-form-item label="安全库存数" v-if="copyForm.safety_stock_enabled === 'Y'">
            <a-input-number v-model:value="copyForm.safety_stock_qty" :min="0" style="width: 100%" placeholder="请输入安全库存数" />
          </a-form-item></a-col>
        </a-row>
        <a-row :gutter="8">
          <a-col :span="12"><a-form-item label="生产提前期(天)">
            <a-input-number v-model:value="copyForm.lead_time_days" :min="0" :precision="0" style="width: 100%" placeholder="生产提前期" />
          </a-form-item></a-col>
          <a-col :span="12"><a-form-item label="采购提前期(天)">
            <a-input-number v-model:value="copyForm.purchase_lead_time_days" :min="0" :precision="0" style="width: 100%" placeholder="采购提前期" />
          </a-form-item></a-col>
        </a-row>
        <!-- 成品扩展字段 -->
        <template v-if="copyForm.item_type === '成品'">
          <a-row :gutter="8">
            <a-col :span="12"><a-form-item label="分类编号">
              <a-select
                :value="copyForm.item_class_number"
                placeholder="请选择分类"
                show-search allow-clear
                :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleClassChange(val, copyForm)"
              >
                <a-select-option
                  v-for="opt in getClassOptions(copyForm.item_type)"
                  :key="opt.value"
                  :value="opt.value"
                  :label="opt.label"
                >{{ opt.label }}</a-select-option>
              </a-select>
            </a-form-item></a-col>
            <a-col :span="12"><a-form-item label="分类名称">
              <a-input v-model:value="copyForm.item_class_name" disabled />
            </a-form-item></a-col>
          </a-row>
          <a-row :gutter="8">
            <a-col :span="12"><a-form-item label="产品图号">
              <a-input v-model:value="copyForm.product_drawing_number" />
            </a-form-item></a-col>
            <a-col :span="12"><a-form-item label="胶料编号">
              <a-input v-model:value="copyForm.rubber_compound_number" />
            </a-form-item></a-col>
          </a-row>
          <a-row :gutter="8">
            <a-col :span="12"><a-form-item label="批次产量定额">
              <a-input v-model:value="copyForm.batch_production_quota" />
            </a-form-item></a-col>
            <a-col :span="12"><a-form-item label="标准合格率">
              <a-input v-model:value="copyForm.standard_pass_rate" />
            </a-form-item></a-col>
          </a-row>
        </template>
        <!-- 原材料扩展字段'-->
        <template v-if="copyForm.item_type === '原材料'">
          <a-row :gutter="8">
            <a-col :span="12"><a-form-item label="供应商编号">
              <a-input v-model:value="copyForm.supplier_number" />
            </a-form-item></a-col>
            <a-col :span="12"><a-form-item label="供应商名称">
              <a-input v-model:value="copyForm.supplier_name" />
            </a-form-item></a-col>
          </a-row>
        </template>
        <!-- 半成品扩展字段'-->
        <template v-if="copyForm.item_type === '半成品'">
          <a-row :gutter="8">
            <a-col :span="12"><a-form-item label="来源BOM编号">
              <a-input v-model:value="copyForm.source_bom_number" />
            </a-form-item></a-col>
          </a-row>
        </template>
        <!-- 包材扩展字段 -->
        <template v-if="copyForm.item_type === '包材'">
          <a-row :gutter="8">
            <a-col :span="12"><a-form-item label="包材备注">
              <a-input v-model:value="copyForm.packaging_remark" />
            </a-form-item></a-col>
          </a-row>
        </template>
        <!-- 骨架扩展字段 -->
        <template v-if="copyForm.item_type === '骨架'">
          <a-row :gutter="8">
            <a-col :span="12"><a-form-item label="产品图号">
              <a-input v-model:value="copyForm.product_drawing_number" />
            </a-form-item></a-col>
            <a-col :span="12"><a-form-item label="标准合格率">
              <a-input v-model:value="copyForm.standard_pass_rate" />
            </a-form-item></a-col>
          </a-row>
        </template>
        <!-- 预成型件扩展字段 -->
        <template v-if="copyForm.item_type === '预成型件'">
          <a-row :gutter="8">
            <a-col :span="12"><a-form-item label="胶料编号">
              <a-input v-model:value="copyForm.rubber_compound_number" />
            </a-form-item></a-col>
            <a-col :span="12"><a-form-item label="标准合格率">
              <a-input v-model:value="copyForm.standard_pass_rate" />
            </a-form-item></a-col>
          </a-row>
          <a-row :gutter="8">
            <a-col :span="12"><a-form-item label="成型件单耗">
              <a-input v-model:value="copyForm.formed_part_materia_consumption" />
            </a-form-item></a-col>
          </a-row>
        </template>
      </a-form>
    </a-modal>

    <!-- 详情 Drawer -->
    <a-drawer
      v-model:open="detailDrawerVisible"
      placement="right"
      width="1080"
      :destroy-on-close="true"
      :style="detailModalStyle"
    >
      <template #title>
        <div class="drag-handle" @mousedown="detailOnDragStart">物料详情</div>
      </template>
      <a-spin :spinning="detailLoading">
        <a-descriptions v-if="detailData.item_number" :column="3" bordered size="small">
          <a-descriptions-item label="物料编号" :span="1">{{ detailData.item_number }}</a-descriptions-item>
          <a-descriptions-item label="物料名称" :span="1">{{ detailData.item_name }}</a-descriptions-item>
          <a-descriptions-item label="物品类型" :span="1">
            <a-tag :color="detailData.item_type === '成品' ? 'blue' : detailData.item_type === '原材料' ? 'green' : detailData.item_type === '半成品' ? 'orange' : detailData.item_type === '骨架' ? 'cyan' : detailData.item_type === '预成型件' ? 'geekblue' : 'purple'">
              {{ detailData.item_type }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="物料属性" :span="1">{{ detailData.item_properties || '-' }}</a-descriptions-item>
          <a-descriptions-item label="基本单位" :span="1">{{ detailData.basic_unit || '-' }}</a-descriptions-item>
          <a-descriptions-item label="规格" :span="1">{{ detailData.specifications || '-' }}</a-descriptions-item>
          <a-descriptions-item label="业务范围" :span="3">
            <template v-if="detailData.business_scope">
              <a-tag v-for="s in detailData.business_scope.split(',')" :key="s" color="blue" style="margin: 1px">{{ s }}</a-tag>
            </template>
            <span v-else>-</span>
          </a-descriptions-item>
          <a-descriptions-item label="备注" :span="3">{{ detailData.remark || '-' }}</a-descriptions-item>
        </a-descriptions>

        <template v-if="detailData.item_type === '成品'">
          <a-divider orientation="left">产品扩展信息</a-divider>
          <a-descriptions :column="3" bordered size="small">
            <a-descriptions-item label="分类编号">{{ detailData.item_class_number || '-' }}</a-descriptions-item>
            <a-descriptions-item label="分类名称">{{ detailData.item_class_name || '-' }}</a-descriptions-item>
            <a-descriptions-item label="产品图号">{{ detailData.product_drawing_number || '-' }}</a-descriptions-item>
            <a-descriptions-item label="胶料编号">{{ detailData.rubber_compound_number || '-' }}</a-descriptions-item>
            <a-descriptions-item label="批次产量定额">{{ detailData.batch_production_quota || '-' }}</a-descriptions-item>
          </a-descriptions>
          <a-divider orientation="left">包装规格</a-divider>
          <a-descriptions :column="4" bordered size="small">
            <a-descriptions-item label="内包装数量(每袋)">{{ detailData.inner_pack_qty || 0 }}</a-descriptions-item>
            <a-descriptions-item label="内包装单位">{{ detailData.inner_pack_unit || '-' }}</a-descriptions-item>
            <a-descriptions-item label="外包装数量(每箱袋数)">{{ detailData.outer_pack_qty || 0 }}</a-descriptions-item>
            <a-descriptions-item label="外包装单位">{{ detailData.outer_pack_unit || '-' }}</a-descriptions-item>
          </a-descriptions>
        </template>

        <template v-if="detailData.item_type === '原材料'">
          <a-divider orientation="left">原材料扩展信息</a-divider>
          <a-descriptions :column="3" bordered size="small">
            <a-descriptions-item label="供应商名称">{{ detailData.supplier_name || '-' }}</a-descriptions-item>
          </a-descriptions>
        </template>

        <template v-if="detailData.item_type === '半成品'">
          <a-divider orientation="left">半成品扩展信息</a-divider>
          <a-descriptions :column="3" bordered size="small">
            <a-descriptions-item label="来源BOM编号">{{ detailData.source_bom_number || '-' }}</a-descriptions-item>
          </a-descriptions>
        </template>

        <template v-if="detailData.item_type === '包材'">
          <a-divider orientation="left">包材扩展信息</a-divider>
          <a-descriptions :column="3" bordered size="small">
            <a-descriptions-item label="包材备注">{{ detailData.packaging_remark || '-' }}</a-descriptions-item>
          </a-descriptions>
        </template>

        <template v-if="detailData.item_type === '骨架'">
          <a-divider orientation="left">骨架扩展信息</a-divider>
          <a-descriptions :column="3" bordered size="small">
            <a-descriptions-item label="产品图号">{{ detailData.product_drawing_number || '-' }}</a-descriptions-item>
          </a-descriptions>
        </template>

        <template v-if="detailData.item_type === '预成型件'">
          <a-divider orientation="left">预成型件扩展信息</a-divider>
          <a-descriptions :column="3" bordered size="small">
            <a-descriptions-item label="胶料编号">{{ detailData.rubber_compound_number || '-' }}</a-descriptions-item>
            <a-descriptions-item label="成型件单耗">{{ detailData.formed_part_materia_consumption || '-' }}</a-descriptions-item>
          </a-descriptions>
        </template>

        <a-divider orientation="left">库存信息</a-divider>
        <a-descriptions :column="3" bordered size="small">
          <a-descriptions-item label="批次管理">{{ detailData.batch_management === 'Y' ? '是' : '否' }}</a-descriptions-item>
          <a-descriptions-item label="呆滞天数">{{ detailData.stagnation_days || 0 }}</a-descriptions-item>
          <a-descriptions-item label="锁定库存">{{ detailData.lock_inventory === 'Y' ? '是' : '否' }}</a-descriptions-item>
          <a-descriptions-item label="默认仓库">{{ detailData.default_warehouse ? (() => { const w = warehouseOptions.find((w: any) => w.warehouse_number === detailData.default_warehouse); return w ? `${w.warehouse_number} - ${w.warehouse_name}` : detailData.default_warehouse })() : '-' }}</a-descriptions-item>
          <a-descriptions-item label="标准成本">{{ detailData.standard_cost || 0 }}</a-descriptions-item>
          <a-descriptions-item label="实际成本">{{ detailData.actual_cost || 0 }}</a-descriptions-item>
          <a-descriptions-item label="舍入方法">{{ detailData.rounding_method || '-' }}</a-descriptions-item>
          <a-descriptions-item label="ABC分类">{{ detailData.abc_class || '-' }}</a-descriptions-item>
          <a-descriptions-item label="库存单位">{{ detailData.inventory_unit || '-' }}</a-descriptions-item>
          <a-descriptions-item label="出库方法">{{ detailData.outbound_method || '-' }}</a-descriptions-item>
          <a-descriptions-item label="安全库存管理">{{ detailData.safety_stock_enabled === 'Y' ? '是' : '否' }}</a-descriptions-item>
          <a-descriptions-item label="安全库存数">{{ detailData.safety_stock_qty || 0 }}</a-descriptions-item>
        </a-descriptions>

        <a-divider orientation="left">生产与计划</a-divider>
        <a-descriptions :column="3" bordered size="small">
          <a-descriptions-item label="日产能">{{ detailData.daily_capacity || 0 }}</a-descriptions-item>
          <a-descriptions-item label="默认工艺路线">{{ detailData.default_routing || '-' }}</a-descriptions-item>
          <a-descriptions-item label="缺陷率(%)">{{ detailData.defect_rate || 0 }}</a-descriptions-item>
          <a-descriptions-item label="转换批量">{{ detailData.conversion_batch_size || 0 }}</a-descriptions-item>
          <a-descriptions-item label="计划策略">{{ detailData.planning_strategy || '-' }}</a-descriptions-item>
          <a-descriptions-item label="增量大小">{{ detailData.increment_size || 0 }}</a-descriptions-item>
          <a-descriptions-item label="计划批量">{{ detailData.planning_batch_size || 0 }}</a-descriptions-item>
          <a-descriptions-item label="生产单位">{{ detailData.production_unit || '-' }}</a-descriptions-item>
          <a-descriptions-item label="生产提前期(天)">{{ detailData.lead_time_days || 0 }}</a-descriptions-item>
          <a-descriptions-item label="采购提前期(天)">{{ detailData.purchase_lead_time_days || 0 }}</a-descriptions-item>
        </a-descriptions>

        <a-divider orientation="left">供应链</a-divider>
        <a-descriptions :column="3" bordered size="small">
          <a-descriptions-item label="可配置物料">{{ detailData.configurable_item === 'Y' ? '是' : '否' }}</a-descriptions-item>
          <a-descriptions-item label="市场价(含税)">{{ detailData.market_price_tax || 0 }}</a-descriptions-item>
          <a-descriptions-item label="销售单位">{{ detailData.sales_unit || '-' }}</a-descriptions-item>
          <a-descriptions-item label="销售税率(%)">{{ detailData.sales_tax_rate || 0 }}</a-descriptions-item>
          <a-descriptions-item label="销售价格表">{{ detailData.sales_price_list || '-' }}</a-descriptions-item>
          <a-descriptions-item label="超交率(%)">{{ detailData.over_delivery_rate || 0 }}</a-descriptions-item>
          <a-descriptions-item label="采购单位">{{ detailData.purchase_unit || '-' }}</a-descriptions-item>
          <a-descriptions-item label="供应商编号">{{ detailData.supplier_number || '-' }}</a-descriptions-item>
        </a-descriptions>

        <a-divider orientation="left">质量检验</a-divider>
        <a-descriptions :column="3" bordered size="small">
          <a-descriptions-item label="来料检验">{{ detailData.incoming_inspection === 'Y' ? '需要' : '不需要' }}</a-descriptions-item>
          <a-descriptions-item label="标准合格率">{{ detailData.standard_pass_rate || '-' }}</a-descriptions-item>
        </a-descriptions>

        <a-divider orientation="left">系统信息</a-divider>
        <a-descriptions :column="3" bordered size="small">
          <a-descriptions-item label="创建时间">{{ detailData.creation_date ? formatDate(detailData.creation_date) : '-' }}</a-descriptions-item>
          <a-descriptions-item label="审核状态">
            <a-tag :color="(detailData.approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (detailData.approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag>
          </a-descriptions-item>
        </a-descriptions>
      </a-spin>
    </a-drawer>
  </div>
</template>

<style scoped>
.item-master-page {
  padding: 0;
}
.attachment-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  gap: 8px;
}
.drag-handle { cursor: move; user-select: none; }
</style>

<style>
.item-modal .ant-form-item {
  margin-bottom: 8px;
}
.item-modal .ant-collapse-header {
  padding: 8px 12px !important;
}
.item-modal .ant-collapse-content-box {
  padding: 8px 12px !important;
}
.item-modal .ant-tabs-nav {
  margin-bottom: 8px;
}
</style>
