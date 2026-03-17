<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { getMaterialClasses, createMaterialClass, updateMaterialClass, deleteMaterialClass, exportMaterialClasses, importMaterialClasses } from '@/api/materialClass'

interface MaterialClass {
  material_class_number: string
  material_class_name: string
  remark: string
}

const loading = ref(false)
const selectedRowKeys = ref<string[]>([])
const rowSelection = {
  selectedRowKeys,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}
const dataSource = ref<MaterialClass[]>([])
const searchText = ref('')

const emptyForm = (): MaterialClass => ({
  material_class_number: '',
  material_class_name: '',
  remark: ''
})

const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<MaterialClass>(emptyForm())

const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<MaterialClass>(emptyForm())

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const columns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '物料分类编号', dataIndex: 'material_class_number', key: 'material_class_number', width: 160 },
  { title: '物料分类名称', dataIndex: 'material_class_name', key: 'material_class_name', width: 200 },
  { title: '备注', dataIndex: 'remark', key: 'remark' },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const }
]

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getMaterialClasses({ page: pagination.current, limit: pagination.pageSize, search: searchText.value || undefined })
    if (res.success) {
      dataSource.value = res.data.items
      pagination.total = res.data.pagination.total
    }
  } catch { message.error('获取数据失败') } finally { loading.value = false }
}

const handleTableChange = (pag: any) => { pagination.current = pag.current; pagination.pageSize = pag.pageSize; fetchData() }
const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => { searchText.value = ''; pagination.current = 1; fetchData() }

const handleCreate = () => { Object.assign(createForm, emptyForm()); createModalVisible.value = true }
const handleCreateSubmit = async () => {
  if (!createForm.material_class_number) { message.warning('请输入物料分类编号'); return }
  createLoading.value = true
  try {
    const res = await createMaterialClass(createForm)
    if (res.success) { message.success('新建成功'); createModalVisible.value = false; fetchData() }
    else { message.error(res.message || '新建失败') }
  } catch { message.error('新建失败') } finally { createLoading.value = false }
}

const handleEdit = (record: MaterialClass) => { Object.assign(editForm, record); editModalVisible.value = true }
const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const res = await updateMaterialClass(editForm.material_class_number, editForm)
    if (res.success) { message.success('修改成功'); editModalVisible.value = false; fetchData() }
    else { message.error(res.message || '修改失败') }
  } catch { message.error('修改失败') } finally { editLoading.value = false }
}

const handleDelete = (record: MaterialClass) => {
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除物料分类 "${record.material_class_name}" 吗？`,
    okText: '确定', okType: 'danger', cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteMaterialClass(record.material_class_number)
        if (res.success) { message.success('删除成功'); fetchData() } else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

const fileInputRef = ref<HTMLInputElement>()
const handleExport = async () => {
  try {
    const res = await exportMaterialClasses(searchText.value || undefined)
    const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'material_class.xlsx'; link.click(); URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}
const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement; const file = target.files?.[0]; if (!file) return
  try {
    const formData = new FormData(); formData.append('file', file)
    const res = await importMaterialClasses(formData)
    if (res.success) { message.success(res.message || '导入成功'); fetchData() } else { message.error(res.message || '导入失败') }
  } catch { message.error('导入失败') } finally { target.value = '' }
}

onMounted(() => { fetchData() })
</script>

<template>
  <div>
    <a-card title="物料分类管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索编号/名称" style="width: 240px" allow-clear @search="handleSearch" @pressEnter="handleSearch" />
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button @click="handleImportClick"><template #icon><UploadOutlined /></template>导入</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
          <a-button type="primary" @click="handleCreate"><template #icon><PlusOutlined /></template>新建</a-button>
        </a-space>
      </template>

      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :pagination="pagination" :scroll="{ x: 700, y: 'calc(100vh - 280px)' }" row-key="material_class_number" :row-selection="rowSelection" size="middle" bordered @change="handleTableChange">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleEdit(record)"><template #icon><EditOutlined /></template>修改</a-button>
              <a-button type="link" danger size="small" @click="handleDelete(record)"><template #icon><DeleteOutlined /></template>删除</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:open="editModalVisible" title="修改物料分类" :confirm-loading="editLoading" @ok="handleEditSubmit" width="500px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="物料分类编号"><a-input v-model:value="editForm.material_class_number" disabled /></a-form-item>
        <a-form-item label="物料分类名称"><a-input v-model:value="editForm.material_class_name" /></a-form-item>
        <a-form-item label="备注"><a-textarea v-model:value="editForm.remark" :rows="3" /></a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="createModalVisible" title="新建物料分类" :confirm-loading="createLoading" @ok="handleCreateSubmit" width="500px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="物料分类编号" required><a-input v-model:value="createForm.material_class_number" placeholder="请输入物料分类编号" /></a-form-item>
        <a-form-item label="物料分类名称"><a-input v-model:value="createForm.material_class_name" placeholder="请输入物料分类名称" /></a-form-item>
        <a-form-item label="备注"><a-textarea v-model:value="createForm.remark" :rows="3" placeholder="请输入备注" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>
