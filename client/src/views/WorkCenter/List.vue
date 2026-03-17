<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownloadOutlined, UploadOutlined, PlusOutlined
} from '@ant-design/icons-vue'
import { getWorkCenters, createWorkCenter, updateWorkCenter, deleteWorkCenter, exportWorkCenters, importWorkCenters } from '@/api/workCenter'

defineOptions({ name: 'WorkCenterList' })

interface WorkCenter {
  work_cente_number?: string
  work_cente_name: string
  condition: string
  remark: string
}

const searchText = ref('')
const loading = ref(false)
const selectedRowKeys = ref<string[]>([])
const rowSelection = {
  selectedRowKeys,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}
const dataSource = ref<WorkCenter[]>([])
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

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
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const }
]

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getWorkCenters({ page: pagination.current, limit: pagination.pageSize, search: searchText.value })
    dataSource.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { message.error('获取数据失败') }
  finally { loading.value = false }
}

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => { searchText.value = ''; pagination.current = 1; fetchData() }
const handleTableChange = (pag: any) => { pagination.current = pag.current; pagination.pageSize = pag.pageSize; fetchData() }

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
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `work_centers.${ext}`; link.click(); URL.revokeObjectURL(link.href)
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
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleEdit(dataSource[index])"><template #icon><EditOutlined /></template>编辑</a-button>
              <a-button type="link" danger size="small" @click="handleDelete(dataSource[index])"><template #icon><DeleteOutlined /></template>删除</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:open="editModalVisible" title="编辑工作中心" @ok="handleEditOk" okText="确认" cancelText="取消">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="工作中心编号"><a-input v-model:value="editForm.work_cente_number" disabled /></a-form-item>
        <a-form-item label="工作中心名称"><a-input v-model:value="editForm.work_cente_name" /></a-form-item>
        <a-form-item label="状态" required><a-select v-model:value="editForm.condition" placeholder="请选择"><a-select-option value="启用">启用</a-select-option><a-select-option value="禁用">禁用</a-select-option></a-select></a-form-item>
        <a-form-item label="备注"><a-textarea v-model:value="editForm.remark" :rows="4" /></a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="createModalVisible" title="新建工作中心" @ok="handleCreateOk" okText="确认" cancelText="取消">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="工作中心编号"><a-input v-model:value="createForm.work_cente_number" /></a-form-item>
        <a-form-item label="工作中心名称"><a-input v-model:value="createForm.work_cente_name" /></a-form-item>
        <a-form-item label="状态" required><a-select v-model:value="createForm.condition" placeholder="请选择"><a-select-option value="启用">启用</a-select-option><a-select-option value="禁用">禁用</a-select-option></a-select></a-form-item>
        <a-form-item label="备注"><a-textarea v-model:value="createForm.remark" :rows="4" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
</style>
