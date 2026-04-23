<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, ExclamationCircleOutlined, PlusOutlined,
  DownloadOutlined, UploadOutlined, DownOutlined
} from '@ant-design/icons-vue'
import {
  getMouldMaintenances, createMouldMaintenance, updateMouldMaintenance,
  deleteMouldMaintenance, exportMouldMaintenances, importMouldMaintenances
} from '@/api/equipment/mouldMaintenance'
import { getMoulds } from '@/api/equipment/mould'
import { generateExportFilename } from '@/utils/exportFilename'

defineOptions({ name: 'MouldMaintenanceList' })

interface MaintenanceRow {
  id: number
  mould_number: string
  mould_name: string
  maintenance_type: string
  maintenance_date: string
  description: string
  fault_reason: string
  replaced_parts: string
  cost: number
  performed_by: string
  strokes_at_maintenance: number
  strokes_reset: boolean
  reset_strokes_to: number
  remark: string
  created_by: string
  created_at: string
}

const searchText = ref('')
const filterMould = ref('')
const filterType = ref('')
const filterDateRange = ref<string[]>([])
const loading = ref(false)
const dataSource = ref<MaintenanceRow[]>([])
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const editModalVisible = ref(false)
const createModalVisible = ref(false)
const editLoading = ref(false)
const createLoading = ref(false)
const fileInputRef = ref<HTMLInputElement>()

const emptyForm = () => ({
  mould_number: '',
  maintenance_type: '保养',
  maintenance_date: '',
  description: '',
  fault_reason: '',
  replaced_parts: '',
  cost: 0,
  performed_by: '',
  strokes_reset: false,
  reset_strokes_to: 0,
  remark: ''
})
const editForm = reactive(emptyForm())
const createForm = reactive(emptyForm())
const currentStrokes = ref(0)

// 模具搜索
const mouldOptions = ref<{ value: string; label: string }[]>([])
const mouldSearchLoading = ref(false)
let mouldSearchTimer: any = null

const handleMouldSearch = (val: string) => {
  if (mouldSearchTimer) clearTimeout(mouldSearchTimer)
  if (!val) { mouldOptions.value = []; return }
  mouldSearchTimer = setTimeout(async () => {
    mouldSearchLoading.value = true
    try {
      const res = await getMoulds({ search: val, page: 1, limit: 20 })
      const items = res.data?.items || []
      mouldOptions.value = items.map((m: any) => ({
        value: m.item_number,
        label: `${m.item_number} - ${m.item_name || ''}`
      }))
    } catch { mouldOptions.value = [] }
    finally { mouldSearchLoading.value = false }
  }, 300)
}

const handleMouldSelect = async (val: string, form: any) => {
  form.mould_number = val
  // 获取当前模次
  try {
    const res = await getMoulds({ search: val, page: 1, limit: 1 })
    const items = res.data?.items || []
    if (items.length > 0) {
      currentStrokes.value = items[0].total_strokes || 0
    }
  } catch { currentStrokes.value = 0 }
}

const columns = [
  { title: '维修日期', dataIndex: 'maintenance_date', key: 'maintenance_date', width: 110 },
  { title: '模具编号', dataIndex: 'mould_number', key: 'mould_number', width: 120 },
  { title: '模具名称', dataIndex: 'mould_name', key: 'mould_name', width: 120 },
  { title: '维修类型', dataIndex: 'maintenance_type', key: 'maintenance_type', width: 90 },
  { title: '维修内容', dataIndex: 'description', key: 'description', ellipsis: true },
  { title: '故障原因', dataIndex: 'fault_reason', key: 'fault_reason', width: 150, ellipsis: true },
  { title: '更换部件', dataIndex: 'replaced_parts', key: 'replaced_parts', width: 120, ellipsis: true },
  { title: '费用', dataIndex: 'cost', key: 'cost', width: 90 },
  { title: '执行人', dataIndex: 'performed_by', key: 'performed_by', width: 90 },
  { title: '维修时模次', dataIndex: 'strokes_at_maintenance', key: 'strokes_at_maintenance', width: 110 },
  { title: '创建人', dataIndex: 'created_by', key: 'created_by', width: 90 },
  { title: '操作', key: 'action', width: 120, fixed: 'right' as const }
]

const fetchData = async () => {
  loading.value = true
  try {
    const params: any = {
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined,
      mould_number: filterMould.value || undefined,
      maintenance_type: filterType.value || undefined,
      date_from: filterDateRange.value?.[0] || undefined,
      date_to: filterDateRange.value?.[1] || undefined
    }
    const res = await getMouldMaintenances(params)
    dataSource.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { message.error('获取数据失败') }
  finally { loading.value = false }
}

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => {
  searchText.value = ''
  filterMould.value = ''
  filterType.value = ''
  filterDateRange.value = []
  pagination.current = 1
  fetchData()
}
const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleCreate = () => {
  Object.assign(createForm, emptyForm())
  mouldOptions.value = []
  currentStrokes.value = 0
  createModalVisible.value = true
}

const handleCreateSubmit = async () => {
  if (!createForm.mould_number) { message.warning('请选择模具编号'); return }
  if (!createForm.maintenance_type) { message.warning('请选择维修类型'); return }
  if (!createForm.maintenance_date) { message.warning('请选择维修日期'); return }
  createLoading.value = true
  try {
    const res = await createMouldMaintenance(createForm)
    if (res.success) { message.success('创建成功'); createModalVisible.value = false; fetchData() }
    else { message.error(res.message || '创建失败') }
  } catch { message.error('创建失败') }
  finally { createLoading.value = false }
}

const handleEdit = (record: MaintenanceRow) => {
  Object.assign(editForm, {
    mould_number: record.mould_number,
    maintenance_type: record.maintenance_type,
    maintenance_date: record.maintenance_date ? record.maintenance_date.substring(0, 10) : '',
    description: record.description || '',
    fault_reason: record.fault_reason || '',
    replaced_parts: record.replaced_parts || '',
    cost: record.cost || 0,
    performed_by: record.performed_by || '',
    strokes_reset: !!record.strokes_reset,
    reset_strokes_to: record.reset_strokes_to || 0,
    remark: record.remark || ''
  })
  mouldOptions.value = [{ value: record.mould_number, label: `${record.mould_number} - ${record.mould_name || ''}` }]
  currentStrokes.value = record.strokes_at_maintenance || 0
  ;(editForm as any)._id = record.id
  editModalVisible.value = true
}

const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const id = (editForm as any)._id
    const res = await updateMouldMaintenance(id, editForm)
    if (res.success) { message.success('更新成功'); editModalVisible.value = false; fetchData() }
    else { message.error(res.message || '更新失败') }
  } catch { message.error('更新失败') }
  finally { editLoading.value = false }
}

const handleDelete = (record: MaintenanceRow) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除模具「${record.mould_number}」的${record.maintenance_type}记录吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteMouldMaintenance(record.id)
        if (res.success) { message.success('删除成功'); fetchData() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

const handleExport = async () => {
  try {
    const res = await exportMouldMaintenances({
      mould_number: filterMould.value || undefined,
      maintenance_type: filterType.value || undefined
    })
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('mould_maintenances')
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
    const res = await importMouldMaintenances(formData)
    if (res.success) { message.success(res.message || '导入成功'); fetchData() }
    else { message.error(res.message || '导入失败') }
  } catch { message.error('导入失败') }
  finally { target.value = '' }
}

onMounted(() => { fetchData() })
</script>

<template>
  <div>
    <a-card title="模具维修记录管理" :bordered="false">
      <template #extra>
        <a-space wrap>
          <a-input-search v-model:value="searchText" placeholder="搜索内容/故障原因" style="width: 200px" @search="handleSearch" />
          <a-select v-model:value="filterMould" placeholder="筛选模具" style="width: 180px" allow-clear show-search
            :filter-option="false" :options="mouldOptions" @search="handleMouldSearch" @change="handleSearch" />
          <a-select v-model:value="filterType" placeholder="维修类型" style="width: 120px" allow-clear @change="handleSearch">
            <a-select-option value="保养">保养</a-select-option>
            <a-select-option value="维修">维修</a-select-option>
            <a-select-option value="翻新">翻新</a-select-option>
          </a-select>
          <a-range-picker v-model:value="filterDateRange" style="width: 220px" @change="handleSearch" />
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button @click="handleImportClick"><template #icon><UploadOutlined /></template>导入</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
          <a-button type="primary" @click="handleCreate"><template #icon><PlusOutlined /></template>新建</a-button>
        </a-space>
      </template>

      <a-table :columns="columns" :data-source="dataSource" :loading="loading"
        row-key="id" :pagination="pagination" :scroll="{ x: 1600, y: 'calc(100vh - 280px)' }"
        size="small" @change="handleTableChange">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'maintenance_type'">
            <a-tag :color="record.maintenance_type === '翻新' ? 'purple' : record.maintenance_type === '维修' ? 'orange' : 'blue'">{{ record.maintenance_type }}</a-tag>
          </template>
          <template v-else-if="column.key === 'cost'">
            {{ record.cost > 0 ? `¥${Number(record.cost).toFixed(2)}` : '-' }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleEdit(record)">编辑</a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>更多<DownOutlined style="font-size: 10px; margin-left: 2px;" /></a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item @click="handleDelete(record)"><span style="color: #ff4d4f">删除</span></a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新建弹窗 -->
    <a-modal v-model:open="createModalVisible" title="新建模具维修记录" :confirm-loading="createLoading" @ok="handleCreateSubmit" width="600px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="模具编号" required>
          <a-select v-model:value="createForm.mould_number" placeholder="搜索模具编号" show-search allow-clear
            :filter-option="false" :options="mouldOptions" :loading="mouldSearchLoading"
            @search="handleMouldSearch" @select="(val: string) => handleMouldSelect(val, createForm)" />
        </a-form-item>
        <a-form-item label="维修类型" required>
          <a-select v-model:value="createForm.maintenance_type">
            <a-select-option value="保养">保养</a-select-option>
            <a-select-option value="维修">维修</a-select-option>
            <a-select-option value="翻新">翻新</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="维修日期" required>
          <a-date-picker v-model:value="createForm.maintenance_date" style="width: 100%" value-format="YYYY-MM-DD" />
        </a-form-item>
        <a-form-item label="故障原因">
          <a-textarea v-model:value="createForm.fault_reason" :rows="2" />
        </a-form-item>
        <a-form-item label="维修内容">
          <a-textarea v-model:value="createForm.description" :rows="2" />
        </a-form-item>
        <a-form-item label="更换部件">
          <a-input v-model:value="createForm.replaced_parts" />
        </a-form-item>
        <a-form-item label="费用(元)">
          <a-input-number v-model:value="createForm.cost" :min="0" :step="100" style="width: 100%" />
        </a-form-item>
        <a-form-item label="执行人">
          <a-input v-model:value="createForm.performed_by" />
        </a-form-item>
        <a-form-item label="当前模次">
          <a-input :value="currentStrokes" disabled />
        </a-form-item>
        <template v-if="createForm.maintenance_type === '翻新'">
          <a-form-item label="重置模次">
            <a-checkbox v-model:checked="createForm.strokes_reset">翻新后重置模次</a-checkbox>
          </a-form-item>
          <a-form-item v-if="createForm.strokes_reset" label="重置为">
            <a-input-number v-model:value="createForm.reset_strokes_to" :min="0" style="width: 100%" />
          </a-form-item>
        </template>
        <a-form-item label="备注">
          <a-textarea v-model:value="createForm.remark" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 编辑弹窗 -->
    <a-modal v-model:open="editModalVisible" title="编辑模具维修记录" :confirm-loading="editLoading" @ok="handleEditSubmit" width="600px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="模具编号">
          <a-input :value="editForm.mould_number" disabled />
        </a-form-item>
        <a-form-item label="维修类型">
          <a-select v-model:value="editForm.maintenance_type">
            <a-select-option value="保养">保养</a-select-option>
            <a-select-option value="维修">维修</a-select-option>
            <a-select-option value="翻新">翻新</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="维修日期">
          <a-date-picker v-model:value="editForm.maintenance_date" style="width: 100%" value-format="YYYY-MM-DD" />
        </a-form-item>
        <a-form-item label="故障原因">
          <a-textarea v-model:value="editForm.fault_reason" :rows="2" />
        </a-form-item>
        <a-form-item label="维修内容">
          <a-textarea v-model:value="editForm.description" :rows="2" />
        </a-form-item>
        <a-form-item label="更换部件">
          <a-input v-model:value="editForm.replaced_parts" />
        </a-form-item>
        <a-form-item label="费用(元)">
          <a-input-number v-model:value="editForm.cost" :min="0" :step="100" style="width: 100%" />
        </a-form-item>
        <a-form-item label="执行人">
          <a-input v-model:value="editForm.performed_by" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="editForm.remark" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
</style>
