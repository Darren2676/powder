<script setup lang="ts">
import { ref, reactive, onMounted, createVNode, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, DownloadOutlined, UploadOutlined, CopyOutlined, DownOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { getMoulds, createMould, updateMould, deleteMould, exportMoulds, importMoulds, approveMould, withdrawMould, updateMouldStrokes, updateMouldLifeSettings, scrapMould } from '@/api/equipment/mould'
import { getItems } from '@/api/master-data/itemMaster'
import { getMfgBomHeaders } from '@/api/master-data/mfgBom'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

interface Mould {
  item_number: string
  item_name: string
  product_item_number: string
  product_net_weight: string
  unit_consumption: string
  formed_part_number: string
  formed_part_specifications: string
  formed_part_materia_consumption: string
  formed_parts_number: string
  design_cavities_number: string
  actual_cavities_number: string
  actual_operation_frequency: string
  design_operation_frequency: string
  design_production_number: string
  actual_production_number: string
  equipment_type: string
  mfg_bom_number: string
}

interface MouldRow extends Mould {
  product_number: string
  product_name: string
  product_class_number: string
  product_class_name: string
  product_properties: string
  basic_unit: string
  specifications: string
  product_drawing_number: string
  rubber_compound_number: string
  batch_production_quota: string
  standard_pass_rate: string
  total_strokes: number
  max_strokes: number
  life_status: string
  last_maintenance_date: string | null
  next_maintenance_date: string | null
  maintenance_cycle_days: number
}

interface Product {
  item_number: string
  item_name: string
}

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList<MouldRow>(getMoulds)

// 产品搜索
const productOptions = ref<Product[]>([])
const productSearchLoading = ref(false)
let searchTimer: any = null

const handleProductSearch = (val: string) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!val) { productOptions.value = []; return }
  searchTimer = setTimeout(async () => {
    productSearchLoading.value = true
    try {
      const res = await getItems({ item_type: '成品', page: 1, limit: 20, search: val })
      if (res.success) productOptions.value = res.data.items
    } catch {}
    finally { productSearchLoading.value = false }
  }, 300)
}

const handleProductSelect = (val: string, form: Mould) => {
  form.product_item_number = val
}

// 成型件搜索
const formedPartOptions = ref<any[]>([])
const formedPartSearchLoading = ref(false)
let formedPartSearchTimer: any = null

const handleFormedPartSearch = (val: string) => {
  if (formedPartSearchTimer) clearTimeout(formedPartSearchTimer)
  if (!val) { formedPartOptions.value = []; return }
  formedPartSearchTimer = setTimeout(async () => {
    formedPartSearchLoading.value = true
    try {
      const res = await getItems({ item_type: '预成型件', page: 1, limit: 20, search: val })
      if (res.success) formedPartOptions.value = res.data.items
    } catch {}
    finally { formedPartSearchLoading.value = false }
  }, 300)
}

const handleFormedPartSelect = (val: string, form: Mould) => {
  form.formed_part_number = val
  // 自动带入成型件规格和成型件单耗
  const found = formedPartOptions.value.find((p: any) => p.item_number === val)
  if (found) {
    form.formed_part_specifications = found.specifications || ''
    form.formed_part_materia_consumption = found.formed_part_materia_consumption || ''
  }
}

// 制造BOM搜索
const mfgBomOptions = ref<{ value: string; label: string }[]>([])
const mfgBomSearchLoading = ref(false)
let mfgBomSearchTimer: any = null

const handleMfgBomSearch = (val: string) => {
  if (mfgBomSearchTimer) clearTimeout(mfgBomSearchTimer)
  if (!val) { mfgBomOptions.value = []; return }
  mfgBomSearchTimer = setTimeout(async () => {
    mfgBomSearchLoading.value = true
    try {
      const res = await getMfgBomHeaders({ search: val, page: 1, limit: 20 })
      const items = res.data?.items || []
      mfgBomOptions.value = items.map((h: any) => ({
        value: h.mfg_bom_number,
        label: `${h.mfg_bom_number} - ${h.mfg_bom_name || h.item_name || ''}`
      }))
    } catch { mfgBomOptions.value = [] }
    finally { mfgBomSearchLoading.value = false }
  }, 300)
}

const emptyForm = (): Mould => ({
  item_number: '',
  item_name: '',
  product_item_number: '',
  product_net_weight: '',
  unit_consumption: '',
  formed_part_number: '',
  formed_part_specifications: '',
  formed_part_materia_consumption: '',
  formed_parts_number: '',
  design_cavities_number: '',
  actual_cavities_number: '',
  actual_operation_frequency: '',
  design_operation_frequency: '',
  design_production_number: '',
  actual_production_number: '',
  equipment_type: '',
  mfg_bom_number: ''
})

const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<Mould>(emptyForm())

const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<Mould>(emptyForm())

const defaultDataColumns: any[] = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '模具编号', dataIndex: 'item_number', key: 'item_number', width: 120, sorter: (a: any, b: any) => (a.item_number || '').localeCompare(b.item_number || ''), resizable: true },
  { title: '模具名称', dataIndex: 'item_name', key: 'item_name', width: 140, resizable: true },
  { title: '产品编号', dataIndex: 'product_number', key: 'product_number', width: 120, resizable: true },
  { title: '制造BOM编号', dataIndex: 'mfg_bom_number', key: 'mfg_bom_number', width: 130, resizable: true },
  { title: '产品净重', dataIndex: 'product_net_weight', key: 'product_net_weight', width: 100, resizable: true },
  { title: '单耗', dataIndex: 'unit_consumption', key: 'unit_consumption', width: 80, resizable: true },
  { title: '成型件编号', dataIndex: 'formed_part_number', key: 'formed_part_number', width: 120, resizable: true },
  { title: '成型件规格', dataIndex: 'formed_part_specifications', key: 'formed_part_specifications', width: 120, resizable: true },
  { title: '成型件单耗', dataIndex: 'formed_part_materia_consumption', key: 'formed_part_materia_consumption', width: 100, resizable: true },
  { title: '成型件数量', dataIndex: 'formed_parts_number', key: 'formed_parts_number', width: 100, resizable: true },
  { title: '设计模穴数', dataIndex: 'design_cavities_number', key: 'design_cavities_number', width: 100, resizable: true },
  { title: '设计模次', dataIndex: 'design_operation_frequency', key: 'design_operation_frequency', width: 100, resizable: true },
  { title: '理论班产', dataIndex: 'design_production_number', key: 'design_production_number', width: 100, resizable: true },
  { title: '实际模穴数', dataIndex: 'actual_cavities_number', key: 'actual_cavities_number', width: 100, resizable: true },
  { title: '实际模次', dataIndex: 'actual_operation_frequency', key: 'actual_operation_frequency', width: 100, resizable: true },
  { title: '实际班产', dataIndex: 'actual_production_number', key: 'actual_production_number', width: 100, resizable: true },
  { title: '设备类型', dataIndex: 'equipment_type', key: 'equipment_type', width: 100, resizable: true },
  { title: '产品名称', dataIndex: 'product_name', key: 'product_name', width: 140, resizable: true },
  { title: '产品分类编号', dataIndex: 'product_class_number', key: 'product_class_number', width: 110, resizable: true },
  { title: '产品分类名称', dataIndex: 'product_class_name', key: 'product_class_name', width: 110, resizable: true },
  { title: '产品属性', dataIndex: 'product_properties', key: 'product_properties', width: 100, resizable: true },
  { title: '基本单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 80, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, resizable: true },
  { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number', width: 110, resizable: true },
  { title: '胶料编号', dataIndex: 'rubber_compound_number', key: 'rubber_compound_number', width: 110, resizable: true },
  { title: '班产定额', dataIndex: 'batch_production_quota', key: 'batch_production_quota', width: 100, resizable: true },
  { title: '标准合格率', dataIndex: 'standard_pass_rate', key: 'standard_pass_rate', width: 100, resizable: true },
  { title: '寿命进度', key: 'life_progress', width: 150, resizable: true },
  { title: '寿命状态', dataIndex: 'life_status', key: 'life_status', width: 90, resizable: true },
  { title: '下次保养', dataIndex: 'next_maintenance_date', key: 'next_maintenance_date', width: 110, resizable: true },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('mould_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 120, fixed: 'right' as const }]
})

const handleCreate = () => {
  Object.assign(createForm, emptyForm())
  productOptions.value = []
  formedPartOptions.value = []
  mfgBomOptions.value = []
  createModalVisible.value = true
}

const handleCreateSubmit = async () => {
  if (!createForm.item_number) { message.warning('请输入模具编号'); return }
  createLoading.value = true
  try {
    const res = await createMould(createForm)
    if (res.success) { message.success('新建成功'); createModalVisible.value = false; fetchData() }
    else { message.error(res.message || '新建失败') }
  } catch { message.error('新建失败') }
  finally { createLoading.value = false }
}

const handleEdit = (record: MouldRow) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  const form = emptyForm()
  for (const key of Object.keys(form) as (keyof Mould)[]) {
    (form as any)[key] = (record as any)[key] || ''
  }
  // product_item_number 可能来自 record.product_item_number 或 record.product_number
  if (!form.product_item_number && record.product_number) {
    form.product_item_number = record.product_number
  }
  Object.assign(editForm, form)
  if (record.product_number) {
    productOptions.value = [{ item_number: record.product_number, item_name: record.product_name || '' }]
  }
  if (form.formed_part_number) {
    formedPartOptions.value = [{ item_number: form.formed_part_number, item_name: '' }]
  } else {
    formedPartOptions.value = []
  }
  if (form.mfg_bom_number) {
    mfgBomOptions.value = [{ value: form.mfg_bom_number, label: form.mfg_bom_number }]
  } else {
    mfgBomOptions.value = []
  }
  editModalVisible.value = true
}

const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const res = await updateMould(editForm.item_number, editForm)
    if (res.success) { message.success('修改成功'); editModalVisible.value = false; fetchData() }
    else { message.error(res.message || '修改失败') }
  } catch { message.error('修改失败') }
  finally { editLoading.value = false }
}

const handleDelete = (record: MouldRow) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除模具 "${record.item_name}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteMould(record.item_number)
        if (res.success) { message.success('删除成功'); fetchData() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

const handleDuplicate = (record: MouldRow) => {
  // 解析原始编号：去掉已有的 -N 后缀，得到基础编号
  const baseMatch = record.item_number.match(/^(.+)-(\d+)$/)
  const baseNumber = baseMatch ? baseMatch[1] : record.item_number

  // 在当前列表中查找同基础编号的最大序号
  let maxSeq = 1
  dataSource.value.forEach((row: MouldRow) => {
    if (row.item_number === baseNumber) {
      maxSeq = Math.max(maxSeq, 1)
    }
    const m = row.item_number.match(/^(.+)-(\d+)$/)
    if (m && m[1] === baseNumber) {
      maxSeq = Math.max(maxSeq, parseInt(m[2]))
    }
  })
  const newNumber = `${baseNumber}-${maxSeq + 1}`

  const form = emptyForm()
  for (const key of Object.keys(form) as (keyof Mould)[]) {
    (form as any)[key] = (record as any)[key] || ''
  }
  form.item_number = newNumber
  if (!form.product_item_number && record.product_number) {
    form.product_item_number = record.product_number
  }

  Object.assign(createForm, form)
  if (record.product_number) {
    productOptions.value = [{ item_number: record.product_number, item_name: record.product_name || '' }]
  } else {
    productOptions.value = []
  }
  if (form.formed_part_number) {
    formedPartOptions.value = [{ item_number: form.formed_part_number, item_name: '' }]
  } else {
    formedPartOptions.value = []
  }
  if (form.mfg_bom_number) {
    mfgBomOptions.value = [{ value: form.mfg_bom_number, label: form.mfg_bom_number }]
  } else {
    mfgBomOptions.value = []
  }
  createModalVisible.value = true
}

// ===== 寿命跟踪 =====
const strokesModalVisible = ref(false)
const strokesLoading = ref(false)
const strokesForm = reactive({ item_number: '', add_strokes: 0 })
const lifeSettingsModalVisible = ref(false)
const lifeSettingsLoading = ref(false)
const lifeSettingsForm = reactive({ item_number: '', max_strokes: 0, maintenance_cycle_days: 90 })

const handleStrokesInput = (record: MouldRow) => {
  strokesForm.item_number = record.item_number
  strokesForm.add_strokes = 0
  strokesModalVisible.value = true
}

const handleStrokesSubmit = async () => {
  if (strokesForm.add_strokes <= 0) { message.warning('新增模次必须大于0'); return }
  strokesLoading.value = true
  try {
    const res = await updateMouldStrokes(strokesForm.item_number, strokesForm.add_strokes)
    if (res.success) { message.success('模次更新成功'); strokesModalVisible.value = false; fetchData() }
    else { message.error(res.message || '更新失败') }
  } catch { message.error('更新失败') }
  finally { strokesLoading.value = false }
}

const handleLifeSettings = (record: MouldRow) => {
  lifeSettingsForm.item_number = record.item_number
  lifeSettingsForm.max_strokes = record.max_strokes || 0
  lifeSettingsForm.maintenance_cycle_days = record.maintenance_cycle_days || 90
  lifeSettingsModalVisible.value = true
}

const handleLifeSettingsSubmit = async () => {
  lifeSettingsLoading.value = true
  try {
    const res = await updateMouldLifeSettings(lifeSettingsForm.item_number, {
      max_strokes: lifeSettingsForm.max_strokes,
      maintenance_cycle_days: lifeSettingsForm.maintenance_cycle_days
    })
    if (res.success) { message.success('寿命设置更新成功'); lifeSettingsModalVisible.value = false; fetchData() }
    else { message.error(res.message || '更新失败') }
  } catch { message.error('更新失败') }
  finally { lifeSettingsLoading.value = false }
}

const handleScrap = (record: MouldRow) => {
  Modal.confirm({
    title: '确认报废',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要将模具「${(record.item_name || '').trim()}」标记为报废吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await scrapMould(record.item_number)
        if (res.success) { message.success('已标记报废'); fetchData() }
        else { message.error(res.message || '操作失败') }
      } catch { message.error('操作失败') }
    }
  })
}

const getLifeStatusColor = (status: string) => {
  switch ((status || '').trim()) {
    case '正常': return 'green'
    case '预警': return 'orange'
    case '到期': return 'red'
    case '报废': return 'default'
    default: return 'green'
  }
}

const getLifeProgressPercent = (record: MouldRow) => {
  if (!record.max_strokes || record.max_strokes <= 0) return 0
  return Math.min(Math.round((record.total_strokes / record.max_strokes) * 100), 100)
}

const getLifeProgressColor = (record: MouldRow) => {
  const percent = getLifeProgressPercent(record)
  if (percent >= 100) return '#ff4d4f'
  if (percent >= 90) return '#fa8c16'
  return '#52c41a'
}

const fileInputRef = ref<HTMLInputElement>()

const handleExport = async () => {
  try {
    const res = await exportMoulds(searchText.value || undefined)
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('moulds')
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
    const res = await importMoulds(formData)
    if (res.success) { message.success(res.message || '导入成功'); fetchData() }
    else { message.error(res.message || '导入失败') }
  } catch { message.error('导入失败') }
  finally { target.value = '' }
}

const handleApprove = async (record: MouldRow) => {
  try {
    const res = await approveMould(record.item_number)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

const handleWithdraw = async (record: MouldRow) => {
  try {
    const res = await withdrawMould(record.item_number)
    if (res.success) { message.success('已撤消审核'); fetchData() }
    else { message.error(res.message || '撤消失败') }
  } catch { message.error('撤消失败') }
}

const calcDesignProduction = (form: Mould) => {
  const cavities = parseFloat(form.design_cavities_number)
  const frequency = parseFloat(form.design_operation_frequency)
  if (!isNaN(cavities) && !isNaN(frequency)) {
    form.design_production_number = String(cavities * frequency)
  } else {
    form.design_production_number = ''
  }
}

const calcActualProduction = (form: Mould) => {
  const cavities = parseFloat(form.actual_cavities_number)
  const frequency = parseFloat(form.actual_operation_frequency)
  if (!isNaN(cavities) && !isNaN(frequency)) {
    form.actual_production_number = String(cavities * frequency)
  } else {
    form.actual_production_number = ''
  }
}

watch(() => [createForm.design_cavities_number, createForm.design_operation_frequency], () => {
  calcDesignProduction(createForm)
})

watch(() => [editForm.design_cavities_number, editForm.design_operation_frequency], () => {
  calcDesignProduction(editForm)
})

watch(() => [createForm.actual_cavities_number, createForm.actual_operation_frequency], () => {
  calcActualProduction(createForm)
})

watch(() => [editForm.actual_cavities_number, editForm.actual_operation_frequency], () => {
  calcActualProduction(editForm)
})

onMounted(() => {
  loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div class="mould-page">
    <a-card title="模具管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索模具编号/名称/产品编号"
            style="width: 300px"
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
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
          <a-button type="primary" @click="handleCreate">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
          <a-button @click="openColumnSetting">
            <template #icon><SettingOutlined /></template>
            列设置
          </a-button>
        </a-space>
      </template>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 'max-content' }"
        :row-selection="rowSelection"
        row-key="item_number"
        size="middle"
        bordered
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-if="column.key === 'approval_status'">
            <a-tag :color="record.approval_status === APPROVAL_STATUS.APPROVED ? 'green' : 'orange'">
              {{ record.approval_status || APPROVAL_STATUS.UNAPPROVED }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'life_progress'">
            <a-progress
              :percent="getLifeProgressPercent(record)"
              :stroke-color="getLifeProgressColor(record)"
              :size="'small'"
              :format="() => `${record.total_strokes || 0}/${record.max_strokes || '-'}`"
            />
          </template>
          <template v-else-if="column.key === 'life_status'">
            <a-tag :color="getLifeStatusColor(record.life_status)">{{ record.life_status || '正常' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'next_maintenance_date'">
            <span :style="(record.next_maintenance_date && new Date(record.next_maintenance_date) < new Date()) ? 'color: #ff4d4f' : ''">{{ record.next_maintenance_date || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleEdit(record)">
                修改
              </a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>
                  更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="record.approval_status !== APPROVAL_STATUS.APPROVED" @click="handleApprove(record)">审核</a-menu-item>
                    <a-menu-item v-if="record.approval_status === APPROVAL_STATUS.APPROVED" @click="handleWithdraw(record)">撤消</a-menu-item>
                    <a-menu-item @click="handleStrokesInput(record)">模次录入</a-menu-item>
                    <a-menu-item @click="handleLifeSettings(record)">寿命设置</a-menu-item>
                    <a-menu-item v-if="(record.life_status || '').trim() !== '报废'" @click="handleScrap(record)">报废</a-menu-item>
                    <a-menu-item @click="handleDuplicate(record)">复制</a-menu-item>
                    <a-menu-divider />
                    <a-menu-item @click="handleDelete(record)"><span style="color: #ff4d4f">删除</span></a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 列设置抽屉 -->
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

    <!-- 编辑弹窗 -->
    <a-modal v-model:open="editModalVisible" title="修改模具" :confirm-loading="editLoading" @ok="handleEditSubmit" width="700px">
      <a-form :label-col="{ span: 7 }" :wrapper-col="{ span: 15 }">
        <a-form-item label="模具编号">
          <a-input v-model:value="editForm.item_number" disabled />
        </a-form-item>
        <a-form-item label="模具名称">
          <a-input v-model:value="editForm.item_name" />
        </a-form-item>
        <a-form-item label="产品编号">
          <a-auto-complete
            v-model:value="editForm.product_item_number"
            placeholder="输入产品编号搜索"
            :options="productOptions.map(p => ({ value: p.item_number, label: p.item_number + ' - ' + p.item_name }))"
            @search="handleProductSearch"
            @select="(val: string) => handleProductSelect(val, editForm)"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="产品净重">
          <a-input v-model:value="editForm.product_net_weight" />
        </a-form-item>
        <a-form-item label="单耗">
          <a-input v-model:value="editForm.unit_consumption" />
        </a-form-item>
        <a-form-item label="成型件编号">
          <a-auto-complete
            v-model:value="editForm.formed_part_number"
            placeholder="输入成型件编号搜索"
            :options="formedPartOptions.map(p => ({ value: p.item_number, label: p.item_number + ' - ' + p.item_name }))"
            @search="handleFormedPartSearch"
            @select="(val: string) => handleFormedPartSelect(val, editForm)"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="成型件规格">
          <a-input v-model:value="editForm.formed_part_specifications" />
        </a-form-item>
        <a-form-item label="成型件单耗">
          <a-input v-model:value="editForm.formed_part_materia_consumption" />
        </a-form-item>
        <a-form-item label="成型件数量">
          <a-input v-model:value="editForm.formed_parts_number" />
        </a-form-item>
        <a-form-item label="设计模穴数">
          <a-input v-model:value="editForm.design_cavities_number" />
        </a-form-item>
        <a-form-item label="设计模次">
          <a-input v-model:value="editForm.design_operation_frequency" />
        </a-form-item>
        <a-form-item label="理论班产">
          <a-input v-model:value="editForm.design_production_number" disabled />
        </a-form-item>
        <a-form-item label="实际模穴数">
          <a-input v-model:value="editForm.actual_cavities_number" />
        </a-form-item>
        <a-form-item label="实际模次">
          <a-input v-model:value="editForm.actual_operation_frequency" />
        </a-form-item>
        <a-form-item label="实际班产">
          <a-input v-model:value="editForm.actual_production_number" disabled />
        </a-form-item>
        <a-form-item label="设备类型">
          <a-input v-model:value="editForm.equipment_type" />
        </a-form-item>
        <a-form-item label="制造BOM编号">
          <a-select
            v-model:value="editForm.mfg_bom_number"
            show-search
            allow-clear
            placeholder="输入制造BOM编号搜索"
            :options="mfgBomOptions"
            :loading="mfgBomSearchLoading"
            :filter-option="false"
            @search="handleMfgBomSearch"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建弹窗 -->
    <a-modal v-model:open="createModalVisible" title="新建模具" :confirm-loading="createLoading" @ok="handleCreateSubmit" width="700px">
      <a-form :label-col="{ span: 7 }" :wrapper-col="{ span: 15 }">
        <a-form-item label="模具编号" required>
          <a-input v-model:value="createForm.item_number" placeholder="请输入模具编号" />
        </a-form-item>
        <a-form-item label="模具名称">
          <a-input v-model:value="createForm.item_name" placeholder="请输入模具名称" />
        </a-form-item>
        <a-form-item label="产品编号">
          <a-auto-complete
            v-model:value="createForm.product_item_number"
            placeholder="输入产品编号搜索"
            :options="productOptions.map(p => ({ value: p.item_number, label: p.item_number + ' - ' + p.item_name }))"
            @search="handleProductSearch"
            @select="(val: string) => handleProductSelect(val, createForm)"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="产品净重">
          <a-input v-model:value="createForm.product_net_weight" placeholder="请输入产品净重" />
        </a-form-item>
        <a-form-item label="单耗">
          <a-input v-model:value="createForm.unit_consumption" placeholder="请输入单耗" />
        </a-form-item>
        <a-form-item label="成型件编号">
          <a-auto-complete
            v-model:value="createForm.formed_part_number"
            placeholder="输入成型件编号搜索"
            :options="formedPartOptions.map(p => ({ value: p.item_number, label: p.item_number + ' - ' + p.item_name }))"
            @search="handleFormedPartSearch"
            @select="(val: string) => handleFormedPartSelect(val, createForm)"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="成型件规格">
          <a-input v-model:value="createForm.formed_part_specifications" placeholder="请输入成型件规格" />
        </a-form-item>
        <a-form-item label="成型件单耗">
          <a-input v-model:value="createForm.formed_part_materia_consumption" placeholder="请输入成型件单耗" />
        </a-form-item>
        <a-form-item label="成型件数量">
          <a-input v-model:value="createForm.formed_parts_number" placeholder="请输入成型件数量" />
        </a-form-item>
        <a-form-item label="设计模穴数">
          <a-input v-model:value="createForm.design_cavities_number" placeholder="请输入设计模穴数" />
        </a-form-item>
        <a-form-item label="设计模次">
          <a-input v-model:value="createForm.design_operation_frequency" placeholder="请输入设计模次" />
        </a-form-item>
        <a-form-item label="理论班产">
          <a-input v-model:value="createForm.design_production_number" disabled placeholder="自动计算" />
        </a-form-item>
        <a-form-item label="实际模穴数">
          <a-input v-model:value="createForm.actual_cavities_number" placeholder="请输入实际模穴数" />
        </a-form-item>
        <a-form-item label="实际模次">
          <a-input v-model:value="createForm.actual_operation_frequency" placeholder="请输入实际模次" />
        </a-form-item>
        <a-form-item label="实际班产">
          <a-input v-model:value="createForm.actual_production_number" disabled placeholder="自动计算" />
        </a-form-item>
        <a-form-item label="设备类型">
          <a-input v-model:value="createForm.equipment_type" placeholder="请输入设备类型" />
        </a-form-item>
        <a-form-item label="制造BOM编号">
          <a-select
            v-model:value="createForm.mfg_bom_number"
            show-search
            allow-clear
            placeholder="输入制造BOM编号搜索"
            :options="mfgBomOptions"
            :loading="mfgBomSearchLoading"
            :filter-option="false"
            @search="handleMfgBomSearch"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 模次录入弹窗 -->
    <a-modal v-model:open="strokesModalVisible" title="模次录入" :confirm-loading="strokesLoading" @ok="handleStrokesSubmit" width="400px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-form-item label="模具编号">
          <a-input :value="strokesForm.item_number" disabled />
        </a-form-item>
        <a-form-item label="新增模次" required>
          <a-input-number v-model:value="strokesForm.add_strokes" :min="1" :step="100" style="width: 100%" placeholder="请输入新增模次" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 寿命设置弹窗 -->
    <a-modal v-model:open="lifeSettingsModalVisible" title="寿命设置" :confirm-loading="lifeSettingsLoading" @ok="handleLifeSettingsSubmit" width="400px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-form-item label="模具编号">
          <a-input :value="lifeSettingsForm.item_number" disabled />
        </a-form-item>
        <a-form-item label="设计寿命模次">
          <a-input-number v-model:value="lifeSettingsForm.max_strokes" :min="0" :step="10000" style="width: 100%" placeholder="0表示不限制" />
        </a-form-item>
        <a-form-item label="保养周期(天)">
          <a-input-number v-model:value="lifeSettingsForm.maintenance_cycle_days" :min="0" :step="30" style="width: 100%" placeholder="0表示不启用定期保养" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.mould-page {
  padding: 0;
}
</style>
