<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  DownloadOutlined,
  UploadOutlined,
  PlusOutlined
} from '@ant-design/icons-vue'
import { getWorkshops, createWorkshop, updateWorkshop, deleteWorkshop, exportWorkshops, importWorkshops } from '@/api/workshop'

interface Workshop {
  workshop_number?: number
  workshop_name: string
  remark: string
}

const searchText = ref('')
const loading = ref(false)
const selectedRowKeys = ref<string[]>([])
const rowSelection = {
  selectedRowKeys,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}
const dataSource = ref<Workshop[]>([])
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0
})

const editModalVisible = ref(false)
const createModalVisible = ref(false)
const editForm = reactive<Workshop>({
  workshop_number: undefined,
  workshop_name: '',
  remark: ''
})
const createForm = reactive<Workshop>({
  workshop_number: undefined,
  workshop_name: '',
  remark: ''
})

const fileInputRef = ref<HTMLInputElement>()

const columns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  {
    title: '车间编号',
    dataIndex: 'workshop_number',
    key: 'workshop_number',
    width: 100
  },
  {
    title: '车间名称',
    dataIndex: 'workshop_name',
    key: 'workshop_name'
  },
  {
    title: '备注',
    dataIndex: 'remark',
    key: 'remark'
  },
  {
    title: '操作',
    key: 'action',
    width: 150
  }
]

const fetchData = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value
    }
    const res = await getWorkshops(params)
    dataSource.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch (error) {
    message.error('获取数据失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  pagination.current = 1
  fetchData()
}

const handleReset = () => {
  searchText.value = ''
  pagination.current = 1
  fetchData()
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleEdit = (record: Workshop) => {
  editForm.workshop_number = record.workshop_number
  editForm.workshop_name = record.workshop_name
  editForm.remark = record.remark
  editModalVisible.value = true
}

const handleDelete = (record: Workshop) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除车间"${record.workshop_name}"吗?`,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      try {
        await deleteWorkshop(record.workshop_number!)
        message.success('删除成功')
        fetchData()
      } catch (error) {
        message.error('删除失败')
      }
    }
  })
}

const handleEditOk = async () => {
  try {
    await updateWorkshop(editForm.workshop_number!, editForm)
    message.success('更新成功')
    editModalVisible.value = false
    fetchData()
  } catch (error) {
    message.error('更新失败')
  }
}

const handleCreateOk = async () => {
  try {
    await createWorkshop(createForm)
    message.success('创建成功')
    createModalVisible.value = false
    Object.assign(createForm, {
      workshop_number: undefined,
      workshop_name: '',
      remark: ''
    })
    fetchData()
  } catch (error) {
    message.error('创建失败')
  }
}

const handleExport = async () => {
  try {
    const res = await exportWorkshops()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'workshops.xlsx'
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
    await importWorkshops(formData)
    message.success('导入成功')
    fetchData()
  } catch (error) {
    message.error('导入失败')
  } finally {
    target.value = ''
  }
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div>
    <a-card title="车间管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索车间名称"
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
        :row-key="(record: Workshop) => record.workshop_number!"
        :row-selection="rowSelection"
        :pagination="pagination"
        :scroll="{ y: 'calc(100vh - 280px)' }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleEdit(record)">
                <template #icon><EditOutlined /></template>
                编辑
              </a-button>
              <a-button type="link" danger size="small" @click="handleDelete(record)">
                <template #icon><DeleteOutlined /></template>
                删除
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 编辑模态框 -->
    <a-modal
      v-model:open="editModalVisible"
      title="编辑车间"
      @ok="handleEditOk"
      okText="确认"
      cancelText="取消"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="车间编号">
          <a-input v-model:value="editForm.workshop_number" disabled />
        </a-form-item>
        <a-form-item label="车间名称">
          <a-input v-model:value="editForm.workshop_name" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="editForm.remark" :rows="4" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建模态框 -->
    <a-modal
      v-model:open="createModalVisible"
      title="新建车间"
      @ok="handleCreateOk"
      okText="确认"
      cancelText="取消"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="车间编号">
          <a-input v-model:value="createForm.workshop_number" />
        </a-form-item>
        <a-form-item label="车间名称">
          <a-input v-model:value="createForm.workshop_name" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="createForm.remark" :rows="4" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) {
  padding: 0;
}
</style>
