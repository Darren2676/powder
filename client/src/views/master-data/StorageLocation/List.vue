<script setup lang="ts">
import { ref, reactive, onMounted, createVNode, computed, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownloadOutlined, UploadOutlined, PlusOutlined, SearchOutlined, DownOutlined, SettingOutlined
} from '@ant-design/icons-vue'
import { getStorageLocations, createStorageLocation, updateStorageLocation, deleteStorageLocation, exportStorageLocations, importStorageLocations, toggleStorageLocationStatus, approveStorageLocation, withdrawStorageLocation } from '@/api/master-data/storageLocation'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { APPROVAL_STATUS, CONDITION_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'
import dayjs from 'dayjs'

defineOptions({ name: 'StorageLocationList' })

interface StorageLocation {
  id?: number
  location_number: string
  location_name: string
  warehouse_number: string
  warehouse_name: string
  zone: string
  cabinet: string
  layer: string
  grid: string
  location_column: string
  is_default: string
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

interface WarehouseOption {
  warehouse_number: string
  warehouse_name: string
}

const emptyForm = (): StorageLocation => ({
  location_number: '',
  location_name: '',
  warehouse_number: '',
  warehouse_name: '',
  zone: '',
  cabinet: '',
  layer: '',
  grid: '',
  location_column: '',
  is_default: '否',
  created_by: '',
  updated_by: '',
  created_at: '',
  updated_at: ''
})

const filterWarehouse = ref('')
const { loading, dataSource, searchText, pagination, rowSelection, fetchData, handleTableChange } = useTableList<StorageLocation>(getStorageLocations)
const warehouseOptions = ref<string[]>([])
const warehouseList = ref<WarehouseOption[]>([])

// Override fetchData to also populate warehouse options from the response
const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => { searchText.value = ''; filterWarehouse.value = ''; pagination.current = 1; fetchData() }

const editModalVisible = ref(false)
const createModalVisible = ref(false)
const editForm = reactive<StorageLocation>(emptyForm())
const createForm = reactive<StorageLocation>(emptyForm())
const fileInputRef = ref<HTMLInputElement>()

const defaultDataColumns: any[] = [
  { title: '库位编号', dataIndex: 'location_number', key: 'location_number', width: 120, resizable: true },
  { title: '库位名称', dataIndex: 'location_name', key: 'location_name', width: 120, resizable: true },
  { title: '仓库编号', dataIndex: 'warehouse_number', key: 'warehouse_number', width: 120, resizable: true },
  { title: '仓库名称', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120, resizable: true },
  { title: '区', dataIndex: 'zone', key: 'zone', width: 80, resizable: true },
  { title: '柜', dataIndex: 'cabinet', key: 'cabinet', width: 80, resizable: true },
  { title: '层', dataIndex: 'layer', key: 'layer', width: 80, resizable: true },
  { title: '格', dataIndex: 'grid', key: 'grid', width: 80, resizable: true },
  { title: '列', dataIndex: 'location_column', key: 'location_column', width: 80, resizable: true },
  { title: '默认库位', dataIndex: 'is_default', key: 'is_default', width: 90, resizable: true },
  { title: '启用状态', dataIndex: 'status', key: 'status', width: 90, resizable: true },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true },
  { title: '创建人', dataIndex: 'created_by', key: 'created_by', width: 100, resizable: true },
  { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 170, resizable: true },
  { title: '更新人', dataIndex: 'updated_by', key: 'updated_by', width: 100, resizable: true },
  { title: '更新时间', dataIndex: 'updated_at', key: 'updated_at', width: 170, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('storage_location_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 120, fixed: 'right' as const }]
})

const formatDateTime = (val: string) => {
  if (!val) return ''
  return dayjs(val).format('YYYY-MM-DD HH:mm:ss')
}

// 当仓库编号变化时自动带出仓库名称
const onCreateWarehouseChange = (val: string) => {
  const found = warehouseList.value.find(w => w.warehouse_number === val)
  createForm.warehouse_name = found ? found.warehouse_name : ''
}

const onEditWarehouseChange = (val: string) => {
  const found = warehouseList.value.find(w => w.warehouse_number === val)
  editForm.warehouse_name = found ? found.warehouse_name : ''
}

const handleEdit = (record: StorageLocation) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  Object.assign(editForm, { ...emptyForm(), ...record })
  editModalVisible.value = true
}

const handleDelete = (record: StorageLocation) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除库位"${record.location_number}"吗?`, okText: '确认', cancelText: '取消',
    onOk: async () => {
      try { await deleteStorageLocation(record.id!); message.success('删除成功'); fetchData() }
      catch { message.error('删除失败') }
    }
  })
}

const handleEditOk = async () => {
  if (!editForm.location_number) { message.warning('库位编号不能为空'); return }
  try { await updateStorageLocation(editForm.id!, editForm); message.success('更新成功'); editModalVisible.value = false; fetchData() }
  catch { message.error('更新失败') }
}

const handleCreateOk = async () => {
  if (!createForm.location_number) { message.warning('库位编号不能为空'); return }
  try {
    await createStorageLocation(createForm); message.success('创建成功'); createModalVisible.value = false
    Object.assign(createForm, emptyForm()); fetchData()
  } catch (e: any) {
    const msg = e?.response?.data?.message || '创建失败'
    message.error(msg)
  }
}

const handleExport = async (format: string = 'xlsx') => {
  try {
    const res = await exportStorageLocations(format)
    const ext = format === 'xls' ? 'xls' : 'xlsx'
    const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = generateExportFilename('storage_locations', ext); link.click(); URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement; const file = target.files?.[0]; if (!file) return
  try {
    const formData = new FormData(); formData.append('file', file)
    const res = await importStorageLocations(formData)
    message.success(res.data?.message || '导入成功')
    fetchData()
  } catch { message.error('导入失败') } finally { target.value = '' }
}

const handleToggleStatus = async (record: StorageLocation) => {
  try {
    await toggleStorageLocationStatus(record.id!)
    message.success('状态更新成功')
    fetchData()
  } catch (error) {
    message.error('状态更新失败')
  }
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveStorageLocation(record.id!)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消库位「${(record.location_number || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawStorageLocation(record.id!)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

onMounted(() => { loadColumnPreference(); fetchData() })
</script>

<template>
  <div>
    <a-card title="库位管理" :bordered="false">
      <template #extra>
        <a-space wrap>
          <a-input-search v-model:value="searchText" placeholder="搜索库位编号/名称/仓库编号" style="width: 220px" @search="handleSearch" />
          <a-select v-model:value="filterWarehouse" placeholder="筛选仓库" style="width: 140px" allow-clear @change="handleSearch">
            <a-select-option v-for="w in warehouseOptions" :key="w" :value="w">{{ w }}</a-select-option>
          </a-select>
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-dropdown>
            <a-button><template #icon><DownloadOutlined /></template>导出</a-button>
            <template #overlay>
              <a-menu @click="({ key }: any) => handleExport(key)">
                <a-menu-item key="xlsx">导出为 xlsx</a-menu-item>
                <a-menu-item key="xls">导出为 xls</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
          <a-button @click="handleImportClick"><template #icon><UploadOutlined /></template>导入</a-button>
          <a-button @click="openColumnSetting"><template #icon><SettingOutlined /></template></a-button>
          <a-button type="primary" @click="createModalVisible = true"><template #icon><PlusOutlined /></template>新建</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>
      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :row-key="(record: StorageLocation) => record.id!" :pagination="pagination" :scroll="{ x: 'max-content', y: 'calc(100vh - 280px)' }" @change="handleTableChange" @resizeColumn="handleResizeColumn" size="small">
        <template #bodyCell="{ column, index, record }">
          <template v-if="column.key === 'rowIndex'">{{ (pagination.current - 1) * pagination.pageSize + index + 1 }}</template>
          <template v-else-if="column.key === 'is_default'">
            <a-tag :color="record.is_default === '是' ? 'green' : 'default'">{{ record.is_default }}</a-tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="record.status === CONDITION_STATUS.ENABLED ? 'green' : 'default'" style="cursor: pointer" @click="handleToggleStatus(record)">{{ record.status || CONDITION_STATUS.ENABLED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="(record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (record.approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'created_at'">{{ formatDateTime(record.created_at) }}</template>
          <template v-else-if="column.key === 'updated_at'">{{ formatDateTime(record.updated_at) }}</template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleEdit(record)">
                编辑
              </a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>
                  更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="(record.approval_status || '').trim() !== APPROVAL_STATUS.APPROVED" @click="handleApprove(record)">审核</a-menu-item>
                    <a-menu-item v-else @click="handleWithdraw(record)">撤消</a-menu-item>
                    <a-menu-divider />
                    <a-menu-item @click="handleDelete(record)">
                      <span style="color: #ff4d4f">删除</span>
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 编辑弹窗 -->
    <a-modal v-model:open="editModalVisible" title="编辑库位" @ok="handleEditOk" okText="确认" cancelText="取消" width="600px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="库位编号"><a-input v-model:value="editForm.location_number" disabled /></a-form-item>
        <a-form-item label="库位名称"><a-input v-model:value="editForm.location_name" /></a-form-item>
        <a-form-item label="仓库编号">
          <a-select v-model:value="editForm.warehouse_number" placeholder="请选择仓库" allow-clear show-search :filter-option="(input: string, option: any) => (option?.label || '').toLowerCase().includes(input.toLowerCase())" @change="onEditWarehouseChange">
            <a-select-option v-for="w in warehouseList" :key="w.warehouse_number" :value="w.warehouse_number" :label="w.warehouse_number + ' ' + w.warehouse_name">{{ w.warehouse_number }} - {{ w.warehouse_name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="仓库名称"><a-input v-model:value="editForm.warehouse_name" disabled /></a-form-item>
        <a-form-item label="区"><a-input v-model:value="editForm.zone" /></a-form-item>
        <a-form-item label="柜"><a-input v-model:value="editForm.cabinet" /></a-form-item>
        <a-form-item label="层"><a-input v-model:value="editForm.layer" /></a-form-item>
        <a-form-item label="格"><a-input v-model:value="editForm.grid" /></a-form-item>
        <a-form-item label="列"><a-input v-model:value="editForm.location_column" /></a-form-item>
        <a-form-item label="默认库位">
          <a-select v-model:value="editForm.is_default">
            <a-select-option value="是">是</a-select-option>
            <a-select-option value="否">否</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建弹窗 -->
    <a-modal v-model:open="createModalVisible" title="新建库位" @ok="handleCreateOk" okText="确认" cancelText="取消" width="600px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="库位编号" required><a-input v-model:value="createForm.location_number" placeholder="请输入库位编号" /></a-form-item>
        <a-form-item label="库位名称"><a-input v-model:value="createForm.location_name" /></a-form-item>
        <a-form-item label="仓库编号">
          <a-select v-model:value="createForm.warehouse_number" placeholder="请选择仓库" allow-clear show-search :filter-option="(input: string, option: any) => (option?.label || '').toLowerCase().includes(input.toLowerCase())" @change="onCreateWarehouseChange">
            <a-select-option v-for="w in warehouseList" :key="w.warehouse_number" :value="w.warehouse_number" :label="w.warehouse_number + ' ' + w.warehouse_name">{{ w.warehouse_number }} - {{ w.warehouse_name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="仓库名称"><a-input v-model:value="createForm.warehouse_name" disabled /></a-form-item>
        <a-form-item label="区"><a-input v-model:value="createForm.zone" /></a-form-item>
        <a-form-item label="柜"><a-input v-model:value="createForm.cabinet" /></a-form-item>
        <a-form-item label="层"><a-input v-model:value="createForm.layer" /></a-form-item>
        <a-form-item label="格"><a-input v-model:value="createForm.grid" /></a-form-item>
        <a-form-item label="列"><a-input v-model:value="createForm.location_column" /></a-form-item>
        <a-form-item label="默认库位">
          <a-select v-model:value="createForm.is_default">
            <a-select-option value="是">是</a-select-option>
            <a-select-option value="否">否</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
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
:deep(.ant-card-extra) { padding: 0; }
</style>
