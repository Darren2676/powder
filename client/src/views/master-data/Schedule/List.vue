<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined,
  ExclamationCircleOutlined,
  DownloadOutlined,
  UploadOutlined,
  PlusOutlined,
  SettingOutlined,
  DownOutlined
} from '@ant-design/icons-vue'
import { getSchedules, createSchedule, updateSchedule, deleteSchedule, exportSchedules, importSchedules, toggleScheduleStatus, approveSchedule, withdrawSchedule } from '@/api/master-data/schedule'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { useTableList } from '@/composables/useTableList'
import { APPROVAL_STATUS, CONDITION_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'
interface Schedule {
  schedules_id: string
  schedules_name: string
  remark: string
}

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList<Schedule>(getSchedules)

const editModalVisible = ref(false)
const createModalVisible = ref(false)
const editForm = reactive<Schedule>({
  schedules_id: '',
  schedules_name: '',
  remark: ''
})
const createForm = reactive<Schedule>({
  schedules_id: '',
  schedules_name: '',
  remark: ''
})

const fileInputRef = ref<HTMLInputElement>()

const defaultDataColumns: any[] = [
  { title: '班次编号', dataIndex: 'schedules_id', key: 'schedules_id', width: 100, resizable: true },
  { title: '班次名称', dataIndex: 'schedules_name', key: 'schedules_name', resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', resizable: true },
  { title: '启用状态', dataIndex: 'status', key: 'status', width: 90, resizable: true },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('schedule_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60 }],
  fixedRight: [{ title: '操作', key: 'action', width: 120 }]
})

const handleEdit = (record: Schedule) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  editForm.schedules_id = record.schedules_id
  editForm.schedules_name = record.schedules_name
  editForm.remark = record.remark
  editModalVisible.value = true
}

const handleDelete = (record: Schedule) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除班次「${(record.schedules_name || '').trim()}」吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        await deleteSchedule(record.schedules_id)
        message.success('删除成功')
        fetchData()
      } catch {
        message.error('删除失败')
      }
    }
  })
}

const handleEditOk = async () => {
  try {
    await updateSchedule(editForm.schedules_id, editForm)
    message.success('更新成功')
    editModalVisible.value = false
    fetchData()
  } catch (error) {
    message.error('更新失败')
  }
}

const handleCreateOk = async () => {
  if (!createForm.schedules_id) {
    message.warning('请输入班次编号')
    return
  }
  try {
    await createSchedule(createForm)
    message.success('创建成功')
    createModalVisible.value = false
    Object.assign(createForm, {
      schedules_id: '',
      schedules_name: '',
      remark: ''
    })
    fetchData()
  } catch (error) {
    message.error('创建失败')
  }
}

const handleExport = async () => {
  try {
    const res = await exportSchedules()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('schedules')
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch (error) {
    message.error('导出失败')
  }
}

const handleImportClick = () => {
  fileInputRef.value?.click()
}

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    const formData = new FormData()
    formData.append('file', file)
    await importSchedules(formData)
    message.success('导入成功')
    fetchData()
  } catch (error) {
    message.error('导入失败')
  } finally {
    target.value = ''
  }
}

const handleToggleStatus = async (record: any) => {
  const current = (record.status || '').trim()
  const newStatus = current === CONDITION_STATUS.ENABLED ? CONDITION_STATUS.DISABLED : CONDITION_STATUS.ENABLED
  Modal.confirm({
    title: `确认${newStatus}`,
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要${newStatus}班次「${(record.schedules_name || '').trim()}」吗？`,
    okText: '确定',
    okType: newStatus === CONDITION_STATUS.DISABLED ? 'danger' : 'primary',
    cancelText: '取消',
    async onOk() {
      try {
        await toggleScheduleStatus(record.schedules_id)
        message.success(`已${newStatus}`)
        fetchData()
      } catch {
        message.error('操作失败')
      }
    }
  })
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveSchedule(record.schedules_id)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消班次「${(record.schedules_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawSchedule(record.schedules_id)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

onMounted(async () => {
  await loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div>
    <a-card title="班次管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索班次名称"
            style="width: 200px"
            @search="handleSearch"
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
          <a-button type="primary" @click="createModalVisible = true">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
          <a-tooltip title="列设置">
            <a-button @click="openColumnSetting">
              <SettingOutlined />
            </a-button>
          </a-tooltip>
          <input
            ref="fileInputRef"
            type="file"
            accept=".xlsx,.xls"
            style="display: none"
            @change="handleFileChange"
          />
        </a-space>
      </template>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :row-selection="rowSelection"
        row-key="schedules_id"
        :pagination="pagination"
        :scroll="{ y: 'calc(100vh - 280px)' }"
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="(record.status || '').trim() === CONDITION_STATUS.ENABLED ? 'green' : 'default'">{{ record.status || CONDITION_STATUS.ENABLED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="(record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (record.approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag>
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
                    <a-menu-divider />
                    <a-menu-item @click="handleToggleStatus(record)">
                      {{ (record.status || '').trim() === CONDITION_STATUS.ENABLED ? CONDITION_STATUS.DISABLED : CONDITION_STATUS.ENABLED }}
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

    <!-- 编辑模态框 -->
    <a-modal
      v-model:open="editModalVisible"
      title="编辑班次"
      @ok="handleEditOk"
      okText="确认"
      cancelText="取消"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="班次编号">
          <a-input v-model:value="editForm.schedules_id" disabled />
        </a-form-item>
        <a-form-item label="班次名称">
          <a-input v-model:value="editForm.schedules_name" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="editForm.remark" :rows="4" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建模态框 -->
    <a-modal
      v-model:open="createModalVisible"
      title="新建班次"
      @ok="handleCreateOk"
      okText="确认"
      cancelText="取消"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="班次编号" required>
          <a-input v-model:value="createForm.schedules_id" placeholder="请输入班次编号" />
        </a-form-item>
        <a-form-item label="班次名称">
          <a-input v-model:value="createForm.schedules_name" placeholder="请输入班次名称" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="createForm.remark" :rows="4" placeholder="请输入备注" />
        </a-form-item>
      </a-form>
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
:deep(.ant-card-extra) {
  padding: 0;
}
</style>
