<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined,
  PlusOutlined, DownloadOutlined, UploadOutlined, DownOutlined,
  SwapOutlined, SettingOutlined
} from '@ant-design/icons-vue'
import { getEquipments, createEquipment, updateEquipment, deleteEquipment, exportEquipments, importEquipments, approveEquipment, withdrawEquipment } from '@/api/equipment/equipment'
import { updateEquipmentStatus, updateEquipmentMaintenanceSettings } from '@/api/equipment/equipmentLife'
import { getFactories } from '@/api/system/factory'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

interface Equipment {
  equipment_number: string
  equipment_name: string
  record_date: string | null
  equipment_type: string
  equipment_model: string
  manufacture_date: string | null
  remark: string
  equipment_status?: string
  location?: string
  department?: string
  daily_running_hours?: number
  maintenance_cycle_days?: number
  last_maintenance_date?: string | null
  next_maintenance_date?: string | null
  total_running_hours?: number
  approval_status?: string
  factory_id?: number | null
  factory_short?: string
}

// 工厂筛选
const filterFactoryId = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch { /* ignore */ }
}

// 包装 getEquipments，自动注入 factory_id
const getEquipmentsWrapper = (params: any) => getEquipments({ ...params, factory_id: filterFactoryId.value })

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset: _handleReset } = useTableList<Equipment>(getEquipmentsWrapper)

const handleReset = () => {
  filterFactoryId.value = undefined
  _handleReset()
}

const emptyForm = (): Equipment => ({
  equipment_number: '',
  equipment_name: '',
  record_date: null,
  equipment_type: '',
  equipment_model: '',
  manufacture_date: null,
  remark: '',
  factory_id: null
})

// 编辑弹窗
const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<Equipment>(emptyForm())
const editRecordDate = ref<any>(null)
const editManufactureDate = ref<any>(null)

// 新建弹窗
const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<Equipment>(emptyForm())
const createRecordDate = ref<any>(null)
const createManufactureDate = ref<any>(null)

// 状态变更弹窗
const statusModalVisible = ref(false)
const statusLoading = ref(false)
const statusForm = reactive({ equipment_number: '', equipment_name: '', equipment_status: '', fault_reason: '' })

// 保养设置弹窗
const maintenanceSettingsModalVisible = ref(false)
const maintenanceSettingsLoading = ref(false)
const maintenanceSettingsForm = reactive({ equipment_number: '', equipment_name: '', maintenance_cycle_days: 30, daily_running_hours: 24 })

const statusOptions = [
  { label: '运行', value: '运行', color: 'green' },
  { label: '闲置', value: '闲置', color: 'blue' },
  { label: '故障', value: '故障', color: 'red' },
  { label: '保养', value: '保养', color: 'orange' },
  { label: '停用', value: '停用', color: 'default' },
]

const statusColorMap: Record<string, string> = {
  '运行': 'green',
  '闲置': 'blue',
  '故障': 'red',
  '保养': 'orange',
  '停用': 'default',
}

const defaultDataColumns: any[] = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '设备编号', dataIndex: 'equipment_number', key: 'equipment_number', width: 120, sorter: (a: any, b: any) => (a.equipment_number || '').localeCompare(b.equipment_number || ''), resizable: true },
  { title: '设备名称', dataIndex: 'equipment_name', key: 'equipment_name', width: 140, resizable: true },
  { title: '设备状态', dataIndex: 'equipment_status', key: 'equipment_status', width: 90, resizable: true },
  { title: '位置', dataIndex: 'location', key: 'location', width: 100, resizable: true },
  { title: '部门', dataIndex: 'department', key: 'department', width: 100, resizable: true },
  { title: '登记日期', dataIndex: 'record_date', key: 'record_date', width: 110, resizable: true },
  { title: '设备类型', dataIndex: 'equipment_type', key: 'equipment_type', width: 100, resizable: true },
  { title: '设备型号', dataIndex: 'equipment_model', key: 'equipment_model', width: 120, resizable: true },
  { title: '出厂日期', dataIndex: 'manufacture_date', key: 'manufacture_date', width: 110, resizable: true },
  { title: '日运行时长', dataIndex: 'daily_running_hours', key: 'daily_running_hours', width: 100, resizable: true },
  { title: '保养周期(天)', dataIndex: 'maintenance_cycle_days', key: 'maintenance_cycle_days', width: 110, resizable: true },
  { title: '上次保养', dataIndex: 'last_maintenance_date', key: 'last_maintenance_date', width: 110, resizable: true },
  { title: '下次保养', dataIndex: 'next_maintenance_date', key: 'next_maintenance_date', width: 110, resizable: true },
  { title: '累计运行(h)', dataIndex: 'total_running_hours', key: 'total_running_hours', width: 110, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true, resizable: true },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 90, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('equipment_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 120, fixed: 'right' as const }]
})

const formatDate = (date: string | null) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}

// 新建
const handleCreate = () => {
  Object.assign(createForm, emptyForm())
  createRecordDate.value = null
  createManufactureDate.value = null
  createModalVisible.value = true
}

const handleCreateSubmit = async () => {
  if (!createForm.equipment_number) {
    message.warning('请输入设备编号')
    return
  }
  createLoading.value = true
  try {
    const data = {
      ...createForm,
      record_date: createRecordDate.value ? dayjs(createRecordDate.value).format('YYYY-MM-DD') : null,
      manufacture_date: createManufactureDate.value ? dayjs(createManufactureDate.value).format('YYYY-MM-DD') : null
    }
    const res = await createEquipment(data)
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

// 编辑
const originalEditEquipmentNumber = ref('')
const handleEdit = (record: Equipment) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  originalEditEquipmentNumber.value = record.equipment_number
  Object.assign(editForm, record)
  editForm.factory_id = (record as any).factory_id ?? null
  editRecordDate.value = record.record_date ? dayjs(record.record_date) : null
  editManufactureDate.value = record.manufacture_date ? dayjs(record.manufacture_date) : null
  editModalVisible.value = true
}

const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const data = {
      ...editForm,
      record_date: editRecordDate.value ? dayjs(editRecordDate.value).format('YYYY-MM-DD') : null,
      manufacture_date: editManufactureDate.value ? dayjs(editManufactureDate.value).format('YYYY-MM-DD') : null
    }
    const res = await updateEquipment(originalEditEquipmentNumber.value, data)
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
const handleDelete = (record: Equipment) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除设备 "${record.equipment_name}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteEquipment(record.equipment_number)
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

const fileInputRef = ref<HTMLInputElement>()

const handleExport = async () => {
  try {
    const res = await exportEquipments(searchText.value || undefined, filterFactoryId.value)
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('equipments')
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
    const res = await importEquipments(formData)
    if (res.success) { message.success(res.message || '导入成功'); fetchData() }
    else { message.error(res.message || '导入失败') }
  } catch { message.error('导入失败') }
  finally { target.value = '' }
}

const handleApprove = async (record: Equipment) => {
  try {
    const res = await approveEquipment(record.equipment_number)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

const handleWithdraw = async (record: Equipment) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消设备「${(record.equipment_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await withdrawEquipment(record.equipment_number)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

// 状态变更
const handleStatusChange = (record: Equipment) => {
  statusForm.equipment_number = record.equipment_number
  statusForm.equipment_name = record.equipment_name || ''
  statusForm.equipment_status = record.equipment_status || '闲置'
  statusForm.fault_reason = ''
  statusModalVisible.value = true
}

const handleStatusSubmit = async () => {
  statusLoading.value = true
  try {
    const data: any = { equipment_status: statusForm.equipment_status }
    if (statusForm.equipment_status === '故障') {
      data.fault_reason = statusForm.fault_reason
    }
    const res = await updateEquipmentStatus(statusForm.equipment_number, data)
    if (res.success) {
      message.success('状态变更成功')
      statusModalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '状态变更失败')
    }
  } catch (err: any) {
    message.error('状态变更失败')
  } finally {
    statusLoading.value = false
  }
}

// 保养设置
const handleMaintenanceSettings = (record: Equipment) => {
  maintenanceSettingsForm.equipment_number = record.equipment_number
  maintenanceSettingsForm.equipment_name = record.equipment_name || ''
  maintenanceSettingsForm.maintenance_cycle_days = record.maintenance_cycle_days || 30
  maintenanceSettingsForm.daily_running_hours = record.daily_running_hours || 24
  maintenanceSettingsModalVisible.value = true
}

const handleMaintenanceSettingsSubmit = async () => {
  maintenanceSettingsLoading.value = true
  try {
    const res = await updateEquipmentMaintenanceSettings(maintenanceSettingsForm.equipment_number, {
      maintenance_cycle_days: maintenanceSettingsForm.maintenance_cycle_days,
      daily_running_hours: maintenanceSettingsForm.daily_running_hours
    })
    if (res.success) {
      message.success('保养设置更新成功')
      maintenanceSettingsModalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '更新失败')
    }
  } catch (err: any) {
    message.error('更新失败')
  } finally {
    maintenanceSettingsLoading.value = false
  }
}

onMounted(() => {
  loadColumnPreference()
  fetchData()
  loadFactories()
})
</script>

<template>
  <div class="equipment-page">
    <a-card title="设备台帐管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索设备编号/名称/类型/型号"
            style="width: 280px"
            allow-clear
            @search="handleSearch"
            @pressEnter="handleSearch"
          />
          <a-select
            v-model:value="filterFactoryId" placeholder="全部工厂" allow-clear
            style="width:120px" @change="handleSearch" v-if="factoryList.length > 0"
          >
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
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
        row-key="equipment_number"
        size="middle"
        bordered
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-if="column.key === 'record_date'">
            {{ formatDate(record.record_date) }}
          </template>
          <template v-else-if="column.key === 'manufacture_date'">
            {{ formatDate(record.manufacture_date) }}
          </template>
          <template v-else-if="column.key === 'last_maintenance_date'">
            {{ formatDate(record.last_maintenance_date) }}
          </template>
          <template v-else-if="column.key === 'next_maintenance_date'">
            <span :style="record.next_maintenance_date && dayjs(record.next_maintenance_date).isBefore(dayjs(), 'day') ? 'color: #f5222d; font-weight: 600' : ''">
              {{ formatDate(record.next_maintenance_date) }}
            </span>
          </template>
          <template v-else-if="column.key === 'equipment_status'">
            <a-tag :color="statusColorMap[record.equipment_status] || 'default'">
              {{ record.equipment_status || '闲置' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="record.approval_status === APPROVAL_STATUS.APPROVED ? 'green' : 'orange'">
              {{ record.approval_status || APPROVAL_STATUS.UNAPPROVED }}
            </a-tag>
          </template>
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
                    <a-menu-item @click="handleStatusChange(record)">
                      <SwapOutlined /> 状态
                    </a-menu-item>
                    <a-menu-item @click="handleMaintenanceSettings(record)">
                      <SettingOutlined /> 保养
                    </a-menu-item>
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

    <!-- 状态变更弹窗 -->
    <a-modal
      v-model:open="statusModalVisible"
      title="变更设备状态"
      :confirm-loading="statusLoading"
      @ok="handleStatusSubmit"
      width="480px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="设备编号">
          <span>{{ statusForm.equipment_number }}</span>
        </a-form-item>
        <a-form-item label="设备名称">
          <span>{{ statusForm.equipment_name }}</span>
        </a-form-item>
        <a-form-item label="设备状态" required>
          <a-radio-group v-model:value="statusForm.equipment_status">
            <a-radio-button v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </a-radio-button>
          </a-radio-group>
        </a-form-item>
        <a-form-item v-if="statusForm.equipment_status === '故障'" label="故障原因">
          <a-textarea v-model:value="statusForm.fault_reason" :rows="3" placeholder="请输入故障原因" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 保养设置弹窗 -->
    <a-modal
      v-model:open="maintenanceSettingsModalVisible"
      title="保养设置"
      :confirm-loading="maintenanceSettingsLoading"
      @ok="handleMaintenanceSettingsSubmit"
      width="480px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="设备编号">
          <span>{{ maintenanceSettingsForm.equipment_number }}</span>
        </a-form-item>
        <a-form-item label="设备名称">
          <span>{{ maintenanceSettingsForm.equipment_name }}</span>
        </a-form-item>
        <a-form-item label="保养周期(天)">
          <a-input-number v-model:value="maintenanceSettingsForm.maintenance_cycle_days" :min="0" :max="3650" style="width: 100%" />
        </a-form-item>
        <a-form-item label="日运行时长(h)">
          <a-input-number v-model:value="maintenanceSettingsForm.daily_running_hours" :min="0" :max="24" :step="0.5" style="width: 100%" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 编辑弹窗 -->
    <a-modal
      v-model:open="editModalVisible"
      title="修改设备"
      :confirm-loading="editLoading"
      @ok="handleEditSubmit"
      width="600px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="设备编号">
          <a-input v-model:value="editForm.equipment_number" />
        </a-form-item>
        <a-form-item label="设备名称">
          <a-input v-model:value="editForm.equipment_name" />
        </a-form-item>
        <a-form-item label="登记日期">
          <a-date-picker v-model:value="editRecordDate" style="width: 100%" />
        </a-form-item>
        <a-form-item label="设备类型">
          <a-input v-model:value="editForm.equipment_type" />
        </a-form-item>
        <a-form-item label="设备型号">
          <a-input v-model:value="editForm.equipment_model" />
        </a-form-item>
        <a-form-item label="出厂日期">
          <a-date-picker v-model:value="editManufactureDate" style="width: 100%" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="editForm.remark" :rows="3" />
        </a-form-item>
        <a-form-item label="所属工厂">
          <a-select v-model:value="editForm.factory_id" placeholder="请选择" allow-clear>
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建弹窗 -->
    <a-modal
      v-model:open="createModalVisible"
      title="新建设备"
      :confirm-loading="createLoading"
      @ok="handleCreateSubmit"
      width="600px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="设备编号" required>
          <a-input v-model:value="createForm.equipment_number" placeholder="请输入设备编号" />
        </a-form-item>
        <a-form-item label="设备名称">
          <a-input v-model:value="createForm.equipment_name" placeholder="请输入设备名称" />
        </a-form-item>
        <a-form-item label="登记日期">
          <a-date-picker v-model:value="createRecordDate" style="width: 100%" placeholder="请选择登记日期" />
        </a-form-item>
        <a-form-item label="设备类型">
          <a-input v-model:value="createForm.equipment_type" placeholder="请输入设备类型" />
        </a-form-item>
        <a-form-item label="设备型号">
          <a-input v-model:value="createForm.equipment_model" placeholder="请输入设备型号" />
        </a-form-item>
        <a-form-item label="出厂日期">
          <a-date-picker v-model:value="createManufactureDate" style="width: 100%" placeholder="请选择出厂日期" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="createForm.remark" :rows="3" placeholder="请输入备注" />
        </a-form-item>
        <a-form-item label="所属工厂">
          <a-select v-model:value="createForm.factory_id" placeholder="请选择" allow-clear>
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.equipment-page {
  padding: 0;
}
</style>
