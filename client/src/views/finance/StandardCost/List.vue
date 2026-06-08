<script setup lang="ts">
import { ref, reactive, computed, onMounted, createVNode, nextTick } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, DownloadOutlined, UploadOutlined, DownOutlined, ExclamationCircleOutlined, DeleteOutlined, SettingOutlined, ExportOutlined } from '@ant-design/icons-vue'
import { getStandardCosts, getStandardCostDetail, createStandardCost, updateStandardCost, deleteStandardCost, exportStandardCosts, importStandardCost, downloadImportTemplate } from '@/api/purchasing/standardCost'
import { getItems } from '@/api/master-data/itemMaster'
import { getFactories } from '@/api/system/factory'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval } from '@/api/system/approval'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { useTableList } from '@/composables/useTableList'
import { useModalDrag } from '@/composables/useModalDrag'
import { usePagePermission } from '@/composables/usePagePermission'

// ==================== 页签控制 ====================
const pageTab = ref('header')
const selectedHeaderKey = ref<string | null>(null)

// ==================== 数据 ====================
const dataList = ref<any[]>([])
const filterApproval = ref('')
const modalVisible = ref(false)
const { modalStyle, onDragStart, resetDrag } = useModalDrag()
const modalTitle = ref('新建标准成本单价表')
const isView = ref(false)
const formData = ref<any>({})
const detailRows = ref<any[]>([])
const detailLoading = ref(false)
const itemOptions = ref<any[]>([])
const importFileRef = ref<HTMLInputElement | null>(null)
const selectedRowKeys = ref<string[]>([])
const exportDropdownVisible = ref(false)
const filterFactoryId = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch { /* ignore */ }
}

// ==================== 字段权限 ====================
const { canViewField, filterColumns: filterPermColumns } = usePagePermission('standard-costs')

// ==================== 列定义 ====================
const { loading, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getStandardCosts)

const defaultDataColumns: any[] = [
  { title: '编号', dataIndex: 'cost_list_number', key: 'cost_list_number', width: 180, resizable: true },
  { title: '名称', dataIndex: 'cost_list_name', key: 'cost_list_name', width: 160, resizable: true },
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
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
} = useColumnPreference('standard_cost_list', filteredDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 120, fixed: 'right' as const }]
})

// 明细页签列定义（根据字段权限过滤）
const detailDisplayColumns = computed(() => {
  const base = [
    { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60, resizable: true },
    { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
    { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 120, resizable: true },
    { title: '物料分类', dataIndex: 'item_class_name', key: 'item_class_name', width: 100, resizable: true },
    { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100, resizable: true },
    { title: '基本单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 80, resizable: true },
    { title: '材质', dataIndex: 'material_type', key: 'material_type', width: 80, resizable: true },
    { title: '标准成本单价', dataIndex: 'standard_cost', key: 'standard_cost', width: 120, resizable: true, align: 'right' as const },
    { title: '实际成本', dataIndex: 'actual_cost', key: 'actual_cost', width: 100, resizable: true, align: 'right' as const },
    { title: '图号', dataIndex: 'drawing_number', key: 'drawing_number', width: 100, resizable: true },
    { title: '版本', dataIndex: 'version', key: 'version', width: 60, resizable: true },
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, resizable: true }
  ]
  return base.filter(col => {
    const key = col.dataIndex || col.key
    const sensitiveKeys = ['standard_cost', 'actual_cost']
    if (sensitiveKeys.includes(key) && !canViewField(key)) return false
    return true
  })
})

// 弹窗内编辑明细列（根据字段权限过滤）
const detailColumns = computed(() => {
  const base = [
    { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60 },
    { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130 },
    { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 120 },
    { title: '物料分类', dataIndex: 'item_class_name', key: 'item_class_name', width: 100 },
    { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100 },
    { title: '基本单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 80 },
    { title: '材质', dataIndex: 'material_type', key: 'material_type', width: 80 },
    { title: '标准成本单价', dataIndex: 'standard_cost', key: 'standard_cost', width: 120 },
    { title: '实际成本', dataIndex: 'actual_cost', key: 'actual_cost', width: 100 },
    { title: '图号', dataIndex: 'drawing_number', key: 'drawing_number', width: 100 },
    { title: '版本', dataIndex: 'version', key: 'version', width: 60 },
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 120 },
    { title: '操作', key: 'action', width: 60 }
  ]
  return base.filter(col => {
    const key = col.dataIndex || col.key
    const sensitiveKeys = ['standard_cost', 'actual_cost']
    if (sensitiveKeys.includes(key) && !canViewField(key)) return false
    return true
  })
})

// ==================== 选中行信息 ====================
const selectedHeaderRecord = computed(() => {
  if (!selectedHeaderKey.value) return null
  return dataList.value.find(h => h.cost_list_number === selectedHeaderKey.value) || null
})

const isDetailReadonly = computed(() => {
  const status = (selectedHeaderRecord.value?.approval_status || '').trim()
  return status !== '草稿'
})

// ==================== 行选择 ====================
const onSelectChange = (keys: string[]) => {
  selectedRowKeys.value = keys
}

// ==================== 加载 ====================
const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getStandardCosts({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value, approval_status: filterApproval.value,
      factory_id: filterFactoryId.value !== undefined && filterFactoryId.value !== null ? filterFactoryId.value : undefined
    })
    dataList.value = res.data?.items || []
    pagination.total = res.data?.pagination?.total || 0
  } finally { loading.value = false }
}

const loadDropdowns = async () => {
  try {
    const [itemRes]: any = await Promise.all([getItems({ limit: 9999 })])
    itemOptions.value = itemRes.data?.items || []
  } catch { /* ignore */ }
}

onMounted(() => { loadColumnPreference(); loadFactories(); fetchList(); loadDropdowns() })

// ==================== 刷新 ====================
const handleRefresh = () => { fetchList() }

// ==================== Header Row Click ====================
const handleHeaderRowClick = (record: any) => {
  selectedHeaderKey.value = record.cost_list_number
  nextTick(() => { pageTab.value = 'detail' })
  fetchDetails(record.cost_list_number)
}

const headerCustomRow = (record: any) => ({
  onClick: () => handleHeaderRowClick(record),
  style: selectedHeaderKey.value === record.cost_list_number ? 'background: #e6f7ff; cursor: pointer;' : 'cursor: pointer;'
})

// ==================== 明细加载 ====================
const fetchDetails = async (costListNumber?: string) => {
  const key = costListNumber || selectedHeaderKey.value
  if (!key) { detailRows.value = []; return }
  detailLoading.value = true
  try {
    const res: any = await getStandardCostDetail(key)
    detailRows.value = res.data?.details || []
  } catch { message.error('获取明细失败') }
  finally { detailLoading.value = false }
}

// ==================== CRUD ====================
const openCreate = () => {
  modalTitle.value = '新建标准成本单价表'
  isView.value = false
  formData.value = {}
  detailRows.value = []
  modalVisible.value = true
  resetDrag()
}

const openView = async (record: any) => {
  modalTitle.value = '查看标准成本单价表'
  isView.value = true
  const res: any = await getStandardCostDetail(record.cost_list_number)
  formData.value = res.data?.header || {}
  detailRows.value = res.data?.details || []
  modalVisible.value = true
  resetDrag()
}

const openEdit = async (record: any) => {
  modalTitle.value = '编辑标准成本单价表'
  isView.value = false
  const res: any = await getStandardCostDetail(record.cost_list_number)
  formData.value = res.data?.header || {}
  detailRows.value = res.data?.details || []
  modalVisible.value = true
  resetDrag()
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除标准成本单价表「${(record.cost_list_number || '').trim()}」吗？`,
    okText: '确定', okType: 'danger', cancelText: '取消',
    async onOk() {
      try {
        const res: any = await deleteStandardCost(record.cost_list_number)
        if (res.success) {
          message.success('删除成功')
          if (selectedHeaderKey.value === record.cost_list_number) {
            selectedHeaderKey.value = null
            detailRows.value = []
          }
          fetchList()
        }
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
    row.item_class_name = item.item_class_name || ''
    row.specifications = item.specifications || ''
    row.basic_unit = item.basic_unit || ''
  }
}

const addDetailRow = () => {
  const maxLine = detailRows.value.reduce((m: number, r: any) => Math.max(m, r.line_number || 0), 0)
  detailRows.value.push({
    line_number: maxLine + 10, item_number: '', item_name: '',
    item_class_name: '', specifications: '', basic_unit: '',
    material_type: '', standard_cost: 0, actual_cost: 0,
    drawing_number: '', version: '', remark: ''
  })
}

const removeDetailRow = (index: number) => { detailRows.value.splice(index, 1) }

// ==================== 保存 ====================
const handleSave = async () => {
  if (!formData.value.cost_list_name) { message.warning('请填写名称'); return }
  if (!formData.value.effective_date) { message.warning('请选择生效日期'); return }
  if (!formData.value.expiration_date) { message.warning('请选择失效日期'); return }

  const payload = { ...formData.value, details: detailRows.value, factory_id: formData.value.factory_id }
  if (formData.value.cost_list_number) {
    await updateStandardCost(formData.value.cost_list_number, payload)
    message.success('更新成功')
  } else {
    await createStandardCost(payload)
    message.success('创建成功')
  }
  modalVisible.value = false
  fetchList()
  // 刷新明细
  if (selectedHeaderKey.value) fetchDetails()
}

// ==================== 审批 ====================
const handleSubmitApproval = async (record: any) => {
  try {
    await submitForApproval('standard_cost_header', record.cost_list_number)
    message.success('提交审批成功'); fetchList()
  } catch { message.error('提交审批失败') }
}
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveRecord('standard_cost_header', record.cost_list_number)
    if (res.success) { message.success('审核成功'); fetchList() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}
const handleWithdrawAction = async (record: any) => {
  Modal.confirm({
    title: '确认撤回', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤回标准成本单价表「${(record.cost_list_number || '').trim()}」的审批吗？`,
    okText: '确定', cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawApproval('standard_cost_header', record.cost_list_number)
        if (res.success) { message.success('已撤回审批'); fetchList() }
        else { message.error(res.message || '撤回失败') }
      } catch { message.error('撤回失败') }
    }
  })
}
const handleReverse = async (record: any) => {
  Modal.confirm({
    title: '确认反审批', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要反审批标准成本单价表「${(record.cost_list_number || '').trim()}」吗？`,
    okText: '确定', cancelText: '取消',
    async onOk() {
      try {
        const res: any = await reverseApproval('standard_cost_header', record.cost_list_number)
        if (res.success) { message.success('反审批成功'); fetchList() }
        else { message.error(res.message || '反审批失败') }
      } catch { message.error('反审批失败') }
    }
  })
}

// ==================== 导出 ====================
const handleExport = async () => {
  exportDropdownVisible.value = false
  const res: any = await exportStandardCosts(searchText.value, filterApproval.value)
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'standard_costs.xlsx')
  document.body.appendChild(link)
  link.click()
  link.remove()
}

const handleExportSelected = async () => {
  exportDropdownVisible.value = false
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先勾选需要导出的记录'); return
  }
  const numbers = selectedRowKeys.value.join(',')
  const res: any = await exportStandardCosts('', '', numbers)
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', `standard_costs_selected_${selectedRowKeys.value.length}.xlsx`)
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// ==================== 导入 ====================
const triggerImport = () => { importFileRef.value?.click() }
const handleDownloadTemplate = async () => {
  try {
    const res: any = await downloadImportTemplate()
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', '标准成本单价导入模板.xlsx')
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
    const res: any = await importStandardCost(fd)
    message.success(res.message || '导入成功')
    fetchList()
  } catch { /* error handled by request interceptor */ }
  if (importFileRef.value) importFileRef.value.value = ''
}
</script>

<template>
  <div style="padding: 20px">
    <a-card :bordered="false" :body-style="{ padding: '0 12px 8px' }">
      <a-tabs v-model:activeKey="pageTab" size="small">
        <!-- ========== Tab 1: 标准成本单价（主表） ========== -->
        <a-tab-pane key="header" tab="标准成本单价（主表）">
          <div class="tab-toolbar">
            <div></div>
            <a-space :size="4" wrap>
              <a-input-search v-model:value="searchText" placeholder="搜索编号/名称" style="width:220px" @search="handleSearch" allow-clear />
              <a-select v-model:value="filterFactoryId" placeholder="全部工厂" style="width:120px" allow-clear @change="handleSearch" v-if="factoryList.length > 0">
                <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
              </a-select>
              <a-select v-model:value="filterApproval" placeholder="审批状态" style="width:110px" allow-clear @change="handleSearch">
                <a-select-option value="草稿">草稿</a-select-option>
                <a-select-option value="待审批">待审批</a-select-option>
                <a-select-option value="已审批">已审批</a-select-option>
              </a-select>
              <a-button @click="handleRefresh"><template #icon><ReloadOutlined /></template></a-button>
              <a-dropdown v-model:open="exportDropdownVisible">
                <a-button><template #icon><DownloadOutlined /></template>导出</a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item @click="handleExport"><ExportOutlined /> 导出全部</a-menu-item>
                    <a-menu-item @click="handleExportSelected" :disabled="selectedRowKeys.length === 0"><DownloadOutlined /> 导出钩选记录 ({{ selectedRowKeys.length }})</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
              <a-button @click="triggerImport"><template #icon><UploadOutlined /></template>导入</a-button>
              <a-button @click="handleDownloadTemplate"><template #icon><DownloadOutlined /></template>下载模板</a-button>
              <a-button @click="openColumnSetting"><template #icon><SettingOutlined /></template></a-button>
              <input ref="importFileRef" type="file" accept=".xlsx,.xls" style="display:none" @change="handleImportFile" />
              <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>新建</a-button>
            </a-space>
          </div>

          <a-table
            :columns="columns"
            :data-source="dataList"
            :loading="loading"
            :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }"
            @change="handleTableChange"
            @resizeColumn="handleResizeColumn"
            row-key="cost_list_number"
            :scroll="{ x: 'max-content' }"
            size="small"
            :customRow="headerCustomRow"
            :row-selection="{ selectedRowKeys, onChange: onSelectChange }"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'rowIndex'">
                {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
              </template>
              <template v-else-if="column.key === 'approval_status'">
                <ApprovalStatusTag :status="record.approval_status" />
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space :size="4">
                  <a-button type="link" size="small" @click.stop="openView(record)">查看</a-button>
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
        </a-tab-pane>

        <!-- ========== Tab 2: 标准成本单价明细 ========== -->
        <a-tab-pane key="detail">
          <template #tab>
            <span>标准成本单价明细</span>
            <span v-if="selectedHeaderKey" style="margin-left: 8px; font-size: 12px; color: #888;">{{ selectedHeaderKey }}</span>
          </template>
          <div v-if="!selectedHeaderKey" style="text-align: center; padding: 40px 0; color: #aaa;">
            <a-empty description="请在「标准成本单价（主表）」中点击一行以查看明细" />
          </div>
          <template v-else>
            <div class="tab-toolbar">
              <div>
                <a-tag v-if="selectedHeaderRecord" color="blue">{{ selectedHeaderRecord.cost_list_name }}</a-tag>
                <a-tag v-if="isDetailReadonly" color="orange" style="font-size: 12px;">只读（非草稿状态）</a-tag>
              </div>
              <a-space :size="4">
                <a-button @click="pageTab = 'header'">返回主表</a-button>
                <a-button type="primary" :disabled="isDetailReadonly" @click="openEdit(selectedHeaderRecord!)"><template #icon><PlusOutlined /></template>编辑</a-button>
              </a-space>
            </div>

            <!-- 明细信息栏 -->
            <div v-if="selectedHeaderRecord" style="display:flex;gap:24px;margin-bottom:12px;padding:8px 12px;background:#fafafa;border-radius:4px;font-size:13px;">
              <span>生效日期: <b>{{ selectedHeaderRecord.effective_date }}</b></span>
              <span>失效日期: <b>{{ selectedHeaderRecord.expiration_date }}</b></span>
              <span>审批状态: <ApprovalStatusTag :status="selectedHeaderRecord.approval_status" /></span>
              <span>备注: {{ selectedHeaderRecord.remark || '-' }}</span>
            </div>

            <a-table
              :columns="detailDisplayColumns"
              :data-source="detailRows"
              :loading="detailLoading"
              :pagination="false"
              row-key="line_number"
              :scroll="{ x: 1500 }"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'standard_cost'">
                  <span style="font-weight:500;">{{ record.standard_cost }}</span>
                </template>
                <template v-else-if="column.key === 'actual_cost'">
                  <span>{{ record.actual_cost }}</span>
                </template>
              </template>
            </a-table>
          </template>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <!-- 编辑/查看弹窗 -->
    <a-modal v-model:open="modalVisible" width="1200px" :style="modalStyle" @ok="handleSave" :ok-button-props="{ style: isView ? { display: 'none' } : {} }" :cancel-text="isView ? '关闭' : '取消'">
      <template #title>
        <div class="drag-handle" @mousedown="onDragStart">{{ modalTitle }}</div>
      </template>
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="名称" required>
            <a-input v-model:value="formData.cost_list_name" :disabled="isView" placeholder="输入名称" />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="所属工厂" v-if="factoryList.length > 0">
            <a-select v-model:value="formData.factory_id" :disabled="isView" placeholder="请选择" allow-clear>
              <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
            </a-select>
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
        <h4 style="margin:0">物料标准成本明细</h4>
        <a-button v-if="!isView" size="small" type="primary" @click="addDetailRow"><PlusOutlined /> 添加行</a-button>
      </div>
      <a-table :columns="detailColumns" :data-source="detailRows" :pagination="false" :row-key="(_r: any, i: number) => i" size="small" :scroll="{ x: 1800 }">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'item_number' && !isView">
            <a-select v-model:value="record.item_number" show-search option-filter-prop="label" style="width:100%" @change="(v: string) => onItemSelect(v, record)" placeholder="搜索物料">
              <a-select-option v-for="item in itemOptions" :key="item.item_number" :value="item.item_number" :label="item.item_number + ' ' + item.item_name">{{ item.item_number }} {{ item.item_name }}</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'standard_cost' && !isView">
            <a-input-number v-model:value="record.standard_cost" :min="0" :precision="4" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'actual_cost' && !isView">
            <a-input-number v-model:value="record.actual_cost" :min="0" :precision="4" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'material_type' && !isView">
            <a-input v-model:value="record.material_type" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'drawing_number' && !isView">
            <a-input v-model:value="record.drawing_number" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'version' && !isView">
            <a-input v-model:value="record.version" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'remark' && !isView">
            <a-input v-model:value="record.remark" style="width:100%" />
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
.tab-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 4px 0;
}
</style>
