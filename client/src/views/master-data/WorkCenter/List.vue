<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownloadOutlined, UploadOutlined, PlusOutlined, DownOutlined
} from '@ant-design/icons-vue'
import { getWorkCenters, createWorkCenter, updateWorkCenter, deleteWorkCenter, exportWorkCenters, importWorkCenters, approveWorkCenter, withdrawWorkCenter } from '@/api/master-data/workCenter'
import { useTableList } from '@/composables/useTableList'
import { APPROVAL_STATUS, CONDITION_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

defineOptions({ name: 'WorkCenterList' })

interface WorkCenter {
  work_cente_number?: string
  work_cente_name: string
  condition: string
  remark: string
}

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList<WorkCenter>(getWorkCenters)

const editModalVisible = ref(false)
const createModalVisible = ref(false)
const editForm = reactive<WorkCenter>({ work_cente_number: undefined, work_cente_name: '', condition: '', remark: '' })
const createForm = reactive<WorkCenter>({ work_cente_number: undefined, work_cente_name: '', condition: '', remark: '' })
const fileInputRef = ref<HTMLInputElement>()

const columns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '工作中心编号', dataIndex: 'work_cente_number', key: 'work_cente_number', width: 140 },
  { title: '工作中心名称', dataIndex: 'work_cente_name', key: 'work_cente_name' },
  { title: '状态', dataIndex: 'condition', key: 'condition' },
  { title: '备注', dataIndex: 'remark', key: 'remark' },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const }
]

const handleEdit = (record: WorkCenter) => {
  editForm.work_cente_number = record.work_cente_number
  editForm.work_cente_name = record.work_cente_name
  editForm.condition = record.condition
  editForm.remark = record.remark
  editModalVisible.value = true
}

const handleDelete = (record: WorkCenter) => {
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除工作中心"${record.work_cente_name}"吗?`, okText: '确认', cancelText: '取消',
    onOk: async () => {
      try { await deleteWorkCenter(record.work_cente_number!); message.success('删除成功'); fetchData() }
      catch { message.error('删除失败') }
    }
  })
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveWorkCenter(record.work_cente_number)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消工作中心「${(record.work_cente_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawWorkCenter(record.work_cente_number)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

const handleEditOk = async () => {
  if (!editForm.condition) { message.warning('请选择状态'); return }
  try { await updateWorkCenter(editForm.work_cente_number!, editForm); message.success('更新成功'); editModalVisible.value = false; fetchData() }
  catch { message.error('更新失败') }
}

const handleCreateOk = async () => {
  if (!createForm.condition) { message.warning('请选择状态'); return }
  try {
    await createWorkCenter(createForm); message.success('创建成功'); createModalVisible.value = false
    Object.assign(createForm, { work_cente_number: undefined, work_cente_name: '', condition: '', remark: '' }); fetchData()
  } catch { message.error('创建失败') }
}

const handleExport = async (format: string = 'xlsx') => {
  try {
    const res = await exportWorkCenters(format)
    const ext = format === 'xls' ? 'xls' : 'xlsx'
    const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = generateExportFilename('work_centers', ext); link.click(); URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement; const file = target.files?.[0]; if (!file) return
  try { const formData = new FormData(); formData.append('file', file); await importWorkCenters(formData); message.success('导入成功'); fetchData() }
  catch { message.error('导入失败') } finally { target.value = '' }
}

onMounted(() => { fetchData() })
</script>

<template>
  <div>
    <a-card title="工作中心管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索工作中心编号/名称" style="width: 220px" @search="handleSearch" />
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
          <a-button type="primary" @click="createModalVisible = true"><template #icon><PlusOutlined /></template>新建</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>
      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :row-key="(record: WorkCenter) => record.work_cente_number!" :row-selection="rowSelection" :pagination="pagination" :scroll="{ y: 'calc(100vh - 280px)' }" @change="handleTableChange">
        <template #bodyCell="{ column, index }">
          <template v-if="column.key === 'rowIndex'">{{ (pagination.current - 1) * pagination.pageSize + index + 1 }}</template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="(dataSource[index].approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (dataSource[index].approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleEdit(dataSource[index])">编辑</a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>
                  更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="(dataSource[index].approval_status || '').trim() !== APPROVAL_STATUS.APPROVED" @click="handleApprove(dataSource[index])">审核</a-menu-item>
                    <a-menu-item v-else @click="handleWithdraw(dataSource[index])">撤消</a-menu-item>
                    <a-menu-item @click="handleDelete(dataSource[index])">删除</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:open="editModalVisible" title="编辑工作中心" @ok="handleEditOk" okText="确认" cancelText="取消">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="工作中心编号"><a-input v-model:value="editForm.work_cente_number" disabled /></a-form-item>
        <a-form-item label="工作中心名称"><a-input v-model:value="editForm.work_cente_name" /></a-form-item>
        <a-form-item label="状态" required><a-select v-model:value="editForm.condition" placeholder="请选择"><a-select-option :value="CONDITION_STATUS.ENABLED">启用</a-select-option><a-select-option :value="CONDITION_STATUS.DISABLED">禁用</a-select-option></a-select></a-form-item>
        <a-form-item label="备注"><a-textarea v-model:value="editForm.remark" :rows="4" /></a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="createModalVisible" title="新建工作中心" @ok="handleCreateOk" okText="确认" cancelText="取消">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="工作中心编号"><a-input v-model:value="createForm.work_cente_number" /></a-form-item>
        <a-form-item label="工作中心名称"><a-input v-model:value="createForm.work_cente_name" /></a-form-item>
        <a-form-item label="状态" required><a-select v-model:value="createForm.condition" placeholder="请选择"><a-select-option :value="CONDITION_STATUS.ENABLED">启用</a-select-option><a-select-option :value="CONDITION_STATUS.DISABLED">禁用</a-select-option></a-select></a-form-item>
        <a-form-item label="备注"><a-textarea v-model:value="createForm.remark" :rows="4" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
</style>
