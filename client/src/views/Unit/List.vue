<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownloadOutlined, UploadOutlined, PlusOutlined
} from '@ant-design/icons-vue'
import { getUnits, createUnit, updateUnit, deleteUnit, exportUnits, importUnits } from '@/api/unit'

defineOptions({ name: 'UnitList' })

interface Unit {
  unit_code: string
  unit_name: string
  remark: string
}

const searchText = ref('')
const loading = ref(false)
const selectedRowKeys = ref<string[]>([])
const rowSelection = {
  selectedRowKeys,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}
const dataSource = ref<Unit[]>([])
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const editModalVisible = ref(false)
const createModalVisible = ref(false)
const editForm = reactive<Unit>({ unit_code: '', unit_name: '', remark: '' })
const createForm = reactive<Unit>({ unit_code: '', unit_name: '', remark: '' })
const fileInputRef = ref<HTMLInputElement>()

const columns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '单位编码', dataIndex: 'unit_code', key: 'unit_code', width: 100 },
  { title: '单位名称', dataIndex: 'unit_name', key: 'unit_name' },
  { title: '备注', dataIndex: 'remark', key: 'remark' },
  { title: '操作', key: 'action', width: 150 }
]

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getUnits({ page: pagination.current, limit: pagination.pageSize, search: searchText.value })
    dataSource.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { message.error('获取数据失败') }
  finally { loading.value = false }
}

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => { searchText.value = ''; pagination.current = 1; fetchData() }
const handleTableChange = (pag: any) => { pagination.current = pag.current; pagination.pageSize = pag.pageSize; fetchData() }

const handleEdit = (record: Unit) => {
  Object.assign(editForm, record)
  editModalVisible.value = true
}
const handleDelete = (record: Unit) => {
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除单位"${record.unit_name}"吗?`, okText: '确认', cancelText: '取消',
    onOk: async () => {
      try { await deleteUnit(record.unit_code); message.success('删除成功'); fetchData() }
      catch { message.error('删除失败') }
    }
  })
}
const handleEditOk = async () => {
  try { await updateUnit(editForm.unit_code, editForm); message.success('更新成功'); editModalVisible.value = false; fetchData() }
  catch { message.error('更新失败') }
}
const handleCreateOk = async () => {
  if (!createForm.unit_code) { message.warning('请输入单位编码'); return }
  try {
    await createUnit(createForm); message.success('创建成功'); createModalVisible.value = false
    Object.assign(createForm, { unit_code: '', unit_name: '', remark: '' }); fetchData()
  } catch { message.error('创建失败') }
}
const handleExport = async () => {
  try {
    const res = await exportUnits()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'units.xlsx'; link.click(); URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}
const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement; const file = target.files?.[0]; if (!file) return
  try {
    const formData = new FormData(); formData.append('file', file)
    await importUnits(formData); message.success('导入成功'); fetchData()
  } catch { message.error('导入失败') }
  finally { target.value = '' }
}

onMounted(() => { fetchData() })
</script>

<template>
  <div>
    <a-card title="单位管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索单位编码/名称" style="width: 200px" @search="handleSearch" />
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button @click="handleImportClick"><template #icon><UploadOutlined /></template>导入</a-button>
          <a-button type="primary" @click="createModalVisible = true"><template #icon><PlusOutlined /></template>新建</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>

      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :row-selection="rowSelection"
        row-key="unit_code" :pagination="pagination" :scroll="{ y: 'calc(100vh - 280px)' }" @change="handleTableChange">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">{{ (pagination.current - 1) * pagination.pageSize + index + 1 }}</template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleEdit(record)"><template #icon><EditOutlined /></template>编辑</a-button>
              <a-button type="link" danger size="small" @click="handleDelete(record)"><template #icon><DeleteOutlined /></template>删除</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 编辑模态框 -->
    <a-modal v-model:open="editModalVisible" title="编辑单位" @ok="handleEditOk" okText="确认" cancelText="取消">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="单位编码"><a-input v-model:value="editForm.unit_code" disabled /></a-form-item>
        <a-form-item label="单位名称"><a-input v-model:value="editForm.unit_name" /></a-form-item>
        <a-form-item label="备注"><a-textarea v-model:value="editForm.remark" :rows="4" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建模态框 -->
    <a-modal v-model:open="createModalVisible" title="新建单位" @ok="handleCreateOk" okText="确认" cancelText="取消">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="单位编码" required><a-input v-model:value="createForm.unit_code" placeholder="请输入单位编码" /></a-form-item>
        <a-form-item label="单位名称"><a-input v-model:value="createForm.unit_name" placeholder="请输入单位名称" /></a-form-item>
        <a-form-item label="备注"><a-textarea v-model:value="createForm.remark" :rows="4" placeholder="请输入备注" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
</style>
