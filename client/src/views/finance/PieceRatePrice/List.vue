<script setup lang="ts">
import { ref, computed, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, DownloadOutlined, UploadOutlined, DownOutlined, ExclamationCircleOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { getPieceRatePrices, getPieceRatePriceDetail, createPieceRatePrice, updatePieceRatePrice, deletePieceRatePrice, exportPieceRatePrices, exportPieceRatePricesSelected, importPieceRatePrice, downloadImportTemplate } from '@/api/purchasing/pieceRatePrice'
import { getItems } from '@/api/master-data/itemMaster'
import { getProcedures } from '@/api/master-data/procedure'
import { getEquipments } from '@/api/equipment/equipment'
import { getEmployees } from '@/api/master-data/employee'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval } from '@/api/system/approval'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import dayjs from 'dayjs'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { useTableList } from '@/composables/useTableList'
import { useModalDrag } from '@/composables/useModalDrag'
import { usePagePermission } from '@/composables/usePagePermission'

// ==================== 数据 ====================
const dataList = ref<any[]>([])
const filterApproval = ref('')
const modalVisible = ref(false)
const modalTitle = ref('新建计件单价表')
const isView = ref(false)
const formData = ref<any>({})
const detailRows = ref<any[]>([])

const itemOptions = ref<any[]>([])
const procedureOptions = ref<any[]>([])
const equipmentOptions = ref<any[]>([])
const employeeOptions = ref<any[]>([])

const importFileRef = ref<HTMLInputElement | null>(null)
const selectedRowKeys = ref<string[]>([])
const exportLoading = ref(false)
const { modalStyle, onDragStart, resetDrag } = useModalDrag()

// ==================== 字段权限 ====================
const { canViewField, filterColumns: filterPermColumns } = usePagePermission('piece-rate-prices')

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  preserveSelectedRowKeys: true,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}))

// ==================== 列定义 ====================
const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getPieceRatePrices)

const defaultDataColumns: any[] = [
  { title: '编号', dataIndex: 'price_list_number', key: 'price_list_number', width: 180, resizable: true },
  { title: '名称', dataIndex: 'price_list_name', key: 'price_list_name', width: 160, resizable: true },
  { title: '生效日期', dataIndex: 'effective_date', key: 'effective_date', width: 110, resizable: true },
  { title: '失效日期', dataIndex: 'expiration_date', key: 'expiration_date', width: 110, resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 90, resizable: true },
  { title: '明细行数', dataIndex: 'detail_count', key: 'detail_count', width: 90, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, resizable: true },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 150, resizable: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 90, resizable: true }
]

// 根据字段权限过滤主表列（主表本身无价格列，此处预留扩展）
const filteredDataColumns = filterPermColumns(defaultDataColumns).value

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('piece_rate_price_list', filteredDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 120, fixed: 'right' as const }]
})

const detailColumns = computed(() => {
  const base = [
    { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60 },
    { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130 },
    { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 120 },
    { title: '工序编号', dataIndex: 'standard_process_number', key: 'standard_process_number', width: 100 },
    { title: '工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 110 },
    { title: '物料分类', dataIndex: 'item_category', key: 'item_category', width: 100 },
    { title: '设备编号', dataIndex: 'equipment_number', key: 'equipment_number', width: 100 },
    { title: '设备名称', dataIndex: 'equipment_name', key: 'equipment_name', width: 100 },
    { title: '人员编号', dataIndex: 'employee_number', key: 'employee_number', width: 90 },
    { title: '人员名称', dataIndex: 'employee_name', key: 'employee_name', width: 90 },
    { title: '合格品单价', dataIndex: 'qualified_piece_rate', key: 'qualified_piece_rate', width: 110 },
    { title: '次品单价', dataIndex: 'defective_piece_rate', key: 'defective_piece_rate', width: 100 },
    { title: '自定义项', dataIndex: 'custom_field', key: 'custom_field', width: 100 },
    { title: '图号', dataIndex: 'drawing_number', key: 'drawing_number', width: 100 },
    { title: '版本', dataIndex: 'version', key: 'version', width: 60 },
    { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100 },
    { title: '材质', dataIndex: 'material_type', key: 'material_type', width: 100 },
    { title: '操作', key: 'action', width: 60 }
  ]
  // 根据字段权限过滤明细列中的敏感字段
  return base.filter(col => {
    const key = col.dataIndex || col.key
    const sensitiveKeys = ['qualified_piece_rate', 'defective_piece_rate']
    if (sensitiveKeys.includes(key) && !canViewField(key)) return false
    return true
  })
})

// ==================== 加载 ====================
const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getPieceRatePrices({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value, approval_status: filterApproval.value
    })
    dataList.value = res.data?.items || []
    pagination.total = res.data?.pagination?.total || 0
  } finally { loading.value = false }
}

const loadDropdowns = async () => {
  try {
    const [itemRes, procRes, equipRes, empRes]: any = await Promise.all([
      getItems({ limit: 9999 }), getProcedures({ limit: 9999 }),
      getEquipments({ limit: 9999 }), getEmployees({ limit: 9999 })
    ])
    itemOptions.value = itemRes.data?.items || []
    procedureOptions.value = procRes.data?.items || []
    equipmentOptions.value = equipRes.data?.items || []
    employeeOptions.value = empRes.data?.items || []
  } catch { /* ignore */ }
}

onMounted(() => { loadColumnPreference(); fetchList(); loadDropdowns() })

// ==================== 刷新 ====================
const handleRefresh = () => { fetchList() }

// ==================== CRUD ====================
const openCreate = () => {
  modalTitle.value = '新建计件单价表'
  isView.value = false
  formData.value = {}
  detailRows.value = []
  modalVisible.value = true
  resetDrag()
}

const openView = async (record: any) => {
  modalTitle.value = '查看计件单价表'
  isView.value = true
  const res: any = await getPieceRatePriceDetail(record.price_list_number)
  formData.value = res.data?.header || {}
  detailRows.value = res.data?.details || []
  modalVisible.value = true
  resetDrag()
}

const openEdit = async (record: any) => {
  modalTitle.value = '编辑计件单价表'
  isView.value = false
  const res: any = await getPieceRatePriceDetail(record.price_list_number)
  formData.value = res.data?.header || {}
  detailRows.value = res.data?.details || []
  modalVisible.value = true
  resetDrag()
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除计件单价表「${(record.price_list_number || '').trim()}」吗？`,
    okText: '确定', okType: 'danger', cancelText: '取消',
    async onOk() {
      try {
        const res: any = await deletePieceRatePrice(record.price_list_number)
        if (res.success) { message.success('删除成功'); fetchList() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

// ==================== 自动填充 ====================
const onItemSelect = (val: string, row: any) => {
  const item = itemOptions.value.find((i: any) => i.item_number === val)
  if (item) {
    row.item_number = item.item_number
    row.item_name = item.item_name || ''
    row.item_category = item.item_class_name || ''
    row.specifications = item.specifications || ''
  }
}

const onProcessSelect = (val: string, row: any) => {
  const proc = procedureOptions.value.find((p: any) => p.standard_process_number === val)
  if (proc) {
    row.standard_process_number = proc.standard_process_number
    row.standard_process_name = proc.standard_process_name || ''
  }
}

const onEquipmentSelect = (val: string, row: any) => {
  const eq = equipmentOptions.value.find((e: any) => e.equipment_number === val)
  if (eq) {
    row.equipment_number = eq.equipment_number
    row.equipment_name = eq.equipment_name || ''
  }
}

const onEmployeeSelect = (val: string, row: any) => {
  const emp = employeeOptions.value.find((e: any) => e.employee_number === val)
  if (emp) {
    row.employee_number = emp.employee_number
    row.employee_name = emp.employee_name || ''
  }
}

const addDetailRow = () => {
  const maxLine = detailRows.value.reduce((m: number, r: any) => Math.max(m, r.line_number || 0), 0)
  detailRows.value.push({
    line_number: maxLine + 10, item_number: '', item_name: '',
    standard_process_number: '', standard_process_name: '',
    item_category: '', equipment_number: '', equipment_name: '',
    employee_number: '', employee_name: '', custom_field: '',
    qualified_piece_rate: 0, defective_piece_rate: 0,
    drawing_number: '', version: '', specifications: '', material_type: ''
  })
}

const removeDetailRow = (index: number) => { detailRows.value.splice(index, 1) }

// ==================== 保存 ====================
const handleSave = async () => {
  if (!formData.value.price_list_name) { message.warning('请填写名称'); return }
  if (!formData.value.effective_date) { message.warning('请选择生效日期'); return }
  if (!formData.value.expiration_date) { message.warning('请选择失效日期'); return }

  const payload = { ...formData.value, details: detailRows.value }
  if (formData.value.price_list_number) {
    await updatePieceRatePrice(formData.value.price_list_number, payload)
    message.success('更新成功')
  } else {
    await createPieceRatePrice(payload)
    message.success('创建成功')
  }
  modalVisible.value = false
  fetchList()
}

// ==================== 审批 ====================
const handleSubmitApproval = async (record: any) => {
  try {
    await submitForApproval('piece_rate_price_header', record.price_list_number)
    message.success('提交审批成功'); fetchList()
  } catch { message.error('提交审批失败') }
}
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveRecord('piece_rate_price_header', record.price_list_number)
    if (res.success) { message.success('审核成功'); fetchList() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}
const handleWithdrawAction = async (record: any) => {
  Modal.confirm({
    title: '确认撤消', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消计件单价表「${(record.price_list_number || '').trim()}」的审核吗？`,
    okText: '确定', cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawApproval('piece_rate_price_header', record.price_list_number)
        if (res.success) { message.success('已撤消审核'); fetchList() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}
const handleReverse = async (record: any) => {
  Modal.confirm({
    title: '确认反审批', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要反审批计件单价表「${(record.price_list_number || '').trim()}」吗？`,
    okText: '确定', cancelText: '取消',
    async onOk() {
      try {
        const res: any = await reverseApproval('piece_rate_price_header', record.price_list_number)
        if (res.success) { message.success('反审批成功'); fetchList() }
        else { message.error(res.message || '反审批失败') }
      } catch { message.error('反审批失败') }
    }
  })
}

// ==================== 导出 ====================
const handleExport = async () => {
  const res: any = await exportPieceRatePrices(searchText.value, filterApproval.value)
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'piece_rate_prices.xlsx')
  document.body.appendChild(link)
  link.click()
  link.remove()
}

const handleExportSelected = async () => {
  if (!selectedRowKeys.value.length) {
    message.warning('请先勾选要导出的行')
    return
  }
  exportLoading.value = true
  try {
    const res = await exportPieceRatePricesSelected({ ids: selectedRowKeys.value })
    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'piece_rate_prices_selected.xlsx'
    link.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch {
    message.error('导出选中行失败')
  } finally {
    exportLoading.value = false
  }
}

// ==================== 导入 ====================
const triggerImport = () => { importFileRef.value?.click() }
const handleDownloadTemplate = async () => {
  try {
    const res: any = await downloadImportTemplate()
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', '计件单价导入模板.xlsx')
    document.body.appendChild(link)
    link.click()
    link.remove()
    message.success('模板下载成功')
  } catch { /* error handled by request interceptor */ }
}
const handleImportFile = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const fd = new FormData()
  fd.append('file', file)
  try {
    const res: any = await importPieceRatePrice(fd)
    message.success(res.message || '导入成功')
    fetchList()
  } catch { /* error handled by request interceptor */ }
  if (importFileRef.value) importFileRef.value.value = ''
}
</script>

<template>
  <div style="padding: 20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0">计件单价管理</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <a-input-search v-model:value="searchText" placeholder="搜索编号/名称" style="width:260px" @search="handleSearch" allow-clear />
        <a-select v-model:value="filterApproval" placeholder="审批状态" style="width:120px" allow-clear @change="handleSearch">
          <a-select-option value="草稿">草稿</a-select-option>
          <a-select-option value="待审批">待审批</a-select-option>
          <a-select-option value="已审批">已审批</a-select-option>
        </a-select>
        <a-button @click="handleRefresh"><template #icon><ReloadOutlined /></template></a-button>
        <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
        <a-button :disabled="selectedRowKeys.length === 0" :loading="exportLoading" @click="handleExportSelected"><DownloadOutlined /> 导出选中{{ selectedRowKeys.length ? ` (${selectedRowKeys.length})` : '' }}</a-button>
        <a-button @click="triggerImport"><template #icon><UploadOutlined /></template>导入</a-button>
                <a-button @click="handleDownloadTemplate"><template #icon><DownloadOutlined /></template>下载模板</a-button>
        <a-button @click="openColumnSetting"><template #icon><SettingOutlined /></template></a-button>
        <input ref="importFileRef" type="file" accept=".xlsx,.xls" style="display:none" @change="handleImportFile" />
        <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>新建</a-button>
      </div>
    </div>

    <a-table :columns="columns" :data-source="dataList" :loading="loading" :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }" @change="handleTableChange" @resizeColumn="handleResizeColumn" row-key="price_list_number" :row-selection="rowSelection" :scroll="{ x: 'max-content' }" size="small">
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'rowIndex'">
          {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
        </template>
        <template v-else-if="column.key === 'approval_status'">
          <ApprovalStatusTag :status="record.approval_status" />
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="openView(record)">查看</a-button>
            <a-divider type="vertical" />
            <a-dropdown :trigger="['click']">
              <a-button type="link" size="small" @click.stop>
                更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
              </a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '草稿'" @click="handleSubmitApproval(record)">提交</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '待审批'" @click="handleApprove(record)">审核</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '待审批'" @click="handleWithdrawAction(record)">撤回</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '已审批'" @click="handleReverse(record)">反审批</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '草稿'" @click="openEdit(record)">编辑</a-menu-item>
                  <a-menu-divider v-if="(record.approval_status || '').trim() === '草稿'" />
                  <a-menu-item v-if="(record.approval_status || '').trim() === '草稿'" @click="handleDelete(record)">
                    <span style="color: #ff4d4f">删除</span>
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>
    <div v-if="selectedRowKeys.length" style="margin-top:8px;color:#999;font-size:13px">
      已选择 <span style="color:#1890ff;font-weight:600">{{ selectedRowKeys.length }}</span> 条记录
      <a-button type="link" size="small" @click="selectedRowKeys = []">清空</a-button>
    </div>

    <!-- 编辑/查看弹窗 -->
    <a-modal v-model:open="modalVisible" width="1200px" :style="modalStyle" @ok="handleSave" :ok-button-props="{ style: isView ? { display: 'none' } : {} }" :cancel-text="isView ? '关闭' : '取消'">
      <template #title>
        <div class="drag-handle" @mousedown="onDragStart">{{ modalTitle }}</div>
      </template>
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="名称" required>
            <a-input v-model:value="formData.price_list_name" :disabled="isView" placeholder="输入名称" />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="生效日期" required>
            <a-date-picker v-model:value="formData.effective_date" :disabled="isView" style="width:100%" value-format="YYYY-MM-DD" />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="失效日期" required>
            <a-date-picker v-model:value="formData.expiration_date" :disabled="isView" style="width:100%" value-format="YYYY-MM-DD" />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="备注">
            <a-input v-model:value="formData.remark" :disabled="isView" />
          </a-form-item></a-col>
        </a-row>
      </a-form>

      <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 8px">
        <h4 style="margin:0">工序单价明细</h4>
        <a-button v-if="!isView" size="small" type="primary" @click="addDetailRow"><PlusOutlined /> 添加行</a-button>
      </div>
      <a-table :columns="detailColumns" :data-source="detailRows" :pagination="false" :row-key="(_r: any, i: number) => i" size="small" :scroll="{ x: 2000 }">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'item_number' && !isView">
            <a-select v-model:value="record.item_number" show-search option-filter-prop="label" style="width:100%" @change="(v: string) => onItemSelect(v, record)" placeholder="搜索物料">
              <a-select-option v-for="item in itemOptions" :key="item.item_number" :value="item.item_number" :label="item.item_number + ' ' + item.item_name">{{ item.item_number }} {{ item.item_name }}</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'standard_process_number' && !isView">
            <a-select v-model:value="record.standard_process_number" show-search option-filter-prop="label" style="width:100%" @change="(v: string) => onProcessSelect(v, record)" placeholder="搜索工序">
              <a-select-option v-for="p in procedureOptions" :key="p.standard_process_number" :value="p.standard_process_number" :label="p.standard_process_number + ' ' + p.standard_process_name">{{ p.standard_process_number }} {{ p.standard_process_name }}</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'equipment_number' && !isView">
            <a-select v-model:value="record.equipment_number" show-search option-filter-prop="label" style="width:100%" @change="(v: string) => onEquipmentSelect(v, record)" placeholder="搜索设备" allow-clear>
              <a-select-option v-for="eq in equipmentOptions" :key="eq.equipment_number" :value="eq.equipment_number" :label="eq.equipment_number + ' ' + eq.equipment_name">{{ eq.equipment_number }} {{ eq.equipment_name }}</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'employee_number' && !isView">
            <a-select v-model:value="record.employee_number" show-search option-filter-prop="label" style="width:100%" @change="(v: string) => onEmployeeSelect(v, record)" placeholder="搜索人员" allow-clear>
              <a-select-option v-for="emp in employeeOptions" :key="emp.employee_number" :value="emp.employee_number" :label="emp.employee_number + ' ' + emp.employee_name">{{ emp.employee_number }} {{ emp.employee_name }}</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'qualified_piece_rate' && !isView">
            <a-input-number v-model:value="record.qualified_piece_rate" :min="0" :precision="6" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'defective_piece_rate' && !isView">
            <a-input-number v-model:value="record.defective_piece_rate" :min="0" :precision="6" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'custom_field' && !isView">
            <a-input v-model:value="record.custom_field" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'drawing_number' && !isView">
            <a-input v-model:value="record.drawing_number" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'version' && !isView">
            <a-input v-model:value="record.version" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'specifications' && !isView">
            <a-input v-model:value="record.specifications" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'material_type' && !isView">
            <a-input v-model:value="record.material_type" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'action' && !isView">
            <a-button size="small" danger @click="removeDetailRow(index)"><DeleteOutlined /></a-button>
          </template>
        </template>
      </a-table>
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
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
