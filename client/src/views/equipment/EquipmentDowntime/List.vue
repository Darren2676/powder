<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, PlusOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownOutlined, DownloadOutlined, CheckOutlined, UndoOutlined, SettingOutlined
} from '@ant-design/icons-vue'
import {
  getEquipmentDowntimes, createEquipmentDowntime, updateEquipmentDowntime,
  deleteEquipmentDowntime, exportEquipmentDowntimes, approveEquipmentDowntime,
  withdrawEquipmentDowntime
} from '@/api/equipment/equipmentLife'
import { getEquipments } from '@/api/equipment/equipment'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

interface DowntimeRecord {
  id: number
  equipment_number: string
  equipment_name?: string
  downtime_type: string
  start_time: string
  end_time: string | null
  duration_minutes: number | null
  fault_reason: string
  treatment: string
  replaced_parts: string
  cost: number
  performed_by: string
  remark: string
  approval_status: string
}

// 查询参数
const filterEquipmentNumber = ref('')
const filterDowntimeType = ref('')
const filterDateFrom = ref<any>(null)
const filterDateTo = ref<any>(null)
const searchText = ref('')

const customFetch = async (params: any) => {
  return getEquipmentDowntimes({
    ...params,
    equipment_number: filterEquipmentNumber.value || undefined,
    downtime_type: filterDowntimeType.value || undefined,
    date_from: filterDateFrom.value ? dayjs(filterDateFrom.value).format('YYYY-MM-DD') : undefined,
    date_to: filterDateTo.value ? dayjs(filterDateTo.value).format('YYYY-MM-DD') : undefined,
    search: searchText.value || undefined
  })
}

const { loading, dataSource, pagination, fetchData, handleTableChange } = useTableList<DowntimeRecord>(customFetch)

// 设备列表下拉
const equipmentList = ref<any[]>([])
const fetchEquipments = async () => {
  try {
    const res = await getEquipments({ limit: 999 })
    if (res.success) equipmentList.value = res.data?.items || []
  } catch {}
}

const downtimeTypes = ['故障', '保养', '计划停机', '换模', '其他']

// 新建/编辑弹窗
const modalVisible = ref(false)
const modalLoading = ref(false)
const isEdit = ref(false)
const editId = ref(0)
const form = reactive({
  equipment_number: '',
  downtime_type: '故障',
  start_time: '',
  end_time: '',
  fault_reason: '',
  treatment: '',
  replaced_parts: '',
  cost: 0,
  performed_by: '',
  remark: ''
})
const formStartTime = ref<any>(null)
const formEndTime = ref<any>(null)

const defaultDataColumns: any[] = [
  { title: '设备编号', dataIndex: 'equipment_number', key: 'equipment_number', width: 120, sorter: (a: any, b: any) => (a.equipment_number || '').localeCompare(b.equipment_number || ''), resizable: true },
  { title: '设备名称', dataIndex: 'equipment_name', key: 'equipment_name', width: 140, resizable: true },
  { title: '停机类型', dataIndex: 'downtime_type', key: 'downtime_type', width: 90, resizable: true },
  { title: '开始时间', dataIndex: 'start_time', key: 'start_time', width: 160, resizable: true },
  { title: '结束时间', dataIndex: 'end_time', key: 'end_time', width: 160, resizable: true },
  { title: '持续(分钟)', dataIndex: 'duration_minutes', key: 'duration_minutes', width: 100, resizable: true },
  { title: '故障原因', dataIndex: 'fault_reason', key: 'fault_reason', width: 160, ellipsis: true, resizable: true },
  { title: '处理方式', dataIndex: 'treatment', key: 'treatment', width: 160, ellipsis: true, resizable: true },
  { title: '更换部件', dataIndex: 'replaced_parts', key: 'replaced_parts', width: 120, ellipsis: true, resizable: true },
  { title: '费用', dataIndex: 'cost', key: 'cost', width: 90, resizable: true },
  { title: '执行人', dataIndex: 'performed_by', key: 'performed_by', width: 80, resizable: true },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 90, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('equipment_downtime_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 150, fixed: 'right' as const }]
})

const formatDateTime = (dt: string | null) => {
  if (!dt) return '-'
  return dayjs(dt).format('YYYY-MM-DD HH:mm')
}

const handleCreate = () => {
  isEdit.value = false
  Object.assign(form, { equipment_number: '', downtime_type: '故障', start_time: '', end_time: '', fault_reason: '', treatment: '', replaced_parts: '', cost: 0, performed_by: '', remark: '' })
  formStartTime.value = null
  formEndTime.value = null
  modalVisible.value = true
}

const handleEdit = (record: DowntimeRecord) => {
  isEdit.value = true
  editId.value = record.id
  Object.assign(form, {
    equipment_number: record.equipment_number,
    downtime_type: record.downtime_type,
    start_time: record.start_time,
    end_time: record.end_time || '',
    fault_reason: record.fault_reason || '',
    treatment: record.treatment || '',
    replaced_parts: record.replaced_parts || '',
    cost: record.cost || 0,
    performed_by: record.performed_by || '',
    remark: record.remark || ''
  })
  formStartTime.value = record.start_time ? dayjs(record.start_time) : null
  formEndTime.value = record.end_time ? dayjs(record.end_time) : null
  modalVisible.value = true
}

const handleSubmit = async () => {
  if (!form.equipment_number) { message.warning('请选择设备'); return }
  if (!form.downtime_type) { message.warning('请选择停机类型'); return }
  if (!formStartTime.value) { message.warning('请选择开始时间'); return }

  modalLoading.value = true
  try {
    const data = {
      ...form,
      start_time: formStartTime.value ? dayjs(formStartTime.value).format('YYYY-MM-DD HH:mm:ss') : null,
      end_time: formEndTime.value ? dayjs(formEndTime.value).format('YYYY-MM-DD HH:mm:ss') : null
    }
    const res = isEdit.value
      ? await updateEquipmentDowntime(editId.value, data)
      : await createEquipmentDowntime(data)
    if (res.success) {
      message.success(isEdit.value ? '修改成功' : '创建成功')
      modalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '操作失败')
    }
  } catch { message.error('操作失败') }
  finally { modalLoading.value = false }
}

const handleDelete = (record: DowntimeRecord) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除此停机记录吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteEquipmentDowntime(record.id)
        if (res.success) { message.success('删除成功'); fetchData() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

const handleExport = async () => {
  try {
    const res = await exportEquipmentDowntimes({
      equipment_number: filterEquipmentNumber.value || undefined,
      downtime_type: filterDowntimeType.value || undefined
    })
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('equipment_downtimes')
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

const handleApprove = async (record: DowntimeRecord) => {
  try {
    const res = await approveEquipmentDowntime(record.id)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

const handleWithdraw = async (record: DowntimeRecord) => {
  try {
    const res = await withdrawEquipmentDowntime(record.id)
    if (res.success) { message.success('已撤消审核'); fetchData() }
    else { message.error(res.message || '撤消失败') }
  } catch { message.error('撤消失败') }
}

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => {
  filterEquipmentNumber.value = ''
  filterDowntimeType.value = ''
  filterDateFrom.value = null
  filterDateTo.value = null
  searchText.value = ''
  pagination.current = 1
  fetchData()
}

onMounted(() => {
  loadColumnPreference()
  fetchEquipments()
  fetchData()
})
</script>

<template>
  <div class="downtime-page">
    <a-card title="设备停机记录" :bordered="false">
      <template #extra>
        <a-space>
          <a-button @click="handleExport">
            <template #icon><DownloadOutlined /></template>
            导出
          </a-button>
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

      <!-- 筛选区 -->
      <div style="margin-bottom: 16px">
        <a-space wrap>
          <a-select v-model:value="filterEquipmentNumber" placeholder="设备编号" allow-clear style="width: 180px" show-search :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())">
            <a-select-option v-for="eq in equipmentList" :key="eq.equipment_number" :value="eq.equipment_number" :label="eq.equipment_number + ' - ' + eq.equipment_name">
              {{ eq.equipment_number }} - {{ eq.equipment_name }}
            </a-select-option>
          </a-select>
          <a-select v-model:value="filterDowntimeType" placeholder="停机类型" allow-clear style="width: 120px">
            <a-select-option v-for="t in downtimeTypes" :key="t" :value="t">{{ t }}</a-select-option>
          </a-select>
          <a-date-picker v-model:value="filterDateFrom" placeholder="开始日期" />
          <a-date-picker v-model:value="filterDateTo" placeholder="结束日期" />
          <a-input-search v-model:value="searchText" placeholder="搜索故障原因/处理方式" style="width: 200px" allow-clear @search="handleSearch" @pressEnter="handleSearch" />
          <a-button @click="handleReset">
            <template #icon><ReloadOutlined /></template>
            重置
          </a-button>
          <a-button type="primary" @click="handleSearch">查询</a-button>
        </a-space>
      </div>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 'max-content' }"
        row-key="id"
        size="middle"
        bordered
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-if="column.key === 'start_time'">
            {{ formatDateTime(record.start_time) }}
          </template>
          <template v-else-if="column.key === 'end_time'">
            <span v-if="record.end_time">{{ formatDateTime(record.end_time) }}</span>
            <a-tag v-else color="red">进行中</a-tag>
          </template>
          <template v-else-if="column.key === 'downtime_type'">
            <a-tag :color="record.downtime_type === '故障' ? 'red' : record.downtime_type === '保养' ? 'orange' : 'blue'">
              {{ record.downtime_type }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="record.approval_status === APPROVAL_STATUS.APPROVED ? 'green' : 'orange'">
              {{ record.approval_status || APPROVAL_STATUS.UNAPPROVED }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleEdit(record)">修改</a-button>
              <a-dropdown>
                <a-button type="link" size="small">
                  更多<DownOutlined />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="record.approval_status !== APPROVAL_STATUS.APPROVED" @click="handleApprove(record)">
                      <CheckOutlined /> 审核
                    </a-menu-item>
                    <a-menu-item v-if="record.approval_status === APPROVAL_STATUS.APPROVED" @click="handleWithdraw(record)">
                      <UndoOutlined /> 撤消
                    </a-menu-item>
                    <a-menu-item @click="handleDelete(record)">
                      <DeleteOutlined /> 删除
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

    <!-- 新建/编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="isEdit ? '编辑停机记录' : '新建停机记录'"
      :confirm-loading="modalLoading"
      @ok="handleSubmit"
      width="640px"
    >
      <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-form-item label="设备编号" required>
          <a-select v-if="!isEdit" v-model:value="form.equipment_number" placeholder="请选择设备" show-search :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())">
            <a-select-option v-for="eq in equipmentList" :key="eq.equipment_number" :value="eq.equipment_number" :label="eq.equipment_number + ' - ' + eq.equipment_name">
              {{ eq.equipment_number }} - {{ eq.equipment_name }}
            </a-select-option>
          </a-select>
          <span v-else>{{ form.equipment_number }}</span>
        </a-form-item>
        <a-form-item label="停机类型" required>
          <a-select v-model:value="form.downtime_type" placeholder="请选择停机类型">
            <a-select-option v-for="t in downtimeTypes" :key="t" :value="t">{{ t }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="开始时间" required>
          <a-date-picker v-model:value="formStartTime" show-time placeholder="请选择开始时间" style="width: 100%" />
        </a-form-item>
        <a-form-item label="结束时间">
          <a-date-picker v-model:value="formEndTime" show-time placeholder="请选择结束时间（可选）" style="width: 100%" />
        </a-form-item>
        <a-form-item label="故障原因">
          <a-textarea v-model:value="form.fault_reason" :rows="2" placeholder="请输入故障原因" />
        </a-form-item>
        <a-form-item label="处理方式">
          <a-textarea v-model:value="form.treatment" :rows="2" placeholder="请输入处理方式" />
        </a-form-item>
        <a-form-item label="更换部件">
          <a-input v-model:value="form.replaced_parts" placeholder="请输入更换部件" />
        </a-form-item>
        <a-form-item label="费用">
          <a-input-number v-model:value="form.cost" :min="0" :precision="2" style="width: 100%" />
        </a-form-item>
        <a-form-item label="执行人">
          <a-input v-model:value="form.performed_by" placeholder="请输入执行人" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="form.remark" :rows="2" placeholder="请输入备注" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.downtime-page {
  padding: 0;
}
</style>
