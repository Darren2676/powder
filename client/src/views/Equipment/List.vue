<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { getEquipments, createEquipment, updateEquipment, deleteEquipment, exportEquipments, importEquipments } from '@/api/equipment'
import dayjs from 'dayjs'

interface Equipment {
  equipment_number: string
  equipment_name: string
  record_date: string | null
  equipment_type: string
  equipment_model: string
  manufacture_date: string | null
  remark: string
}

const loading = ref(false)
const selectedRowKeys = ref<string[]>([])
const rowSelection = {
  selectedRowKeys,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}
const dataSource = ref<Equipment[]>([])
const searchText = ref('')

const emptyForm = (): Equipment => ({
  equipment_number: '',
  equipment_name: '',
  record_date: null,
  equipment_type: '',
  equipment_model: '',
  manufacture_date: null,
  remark: ''
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
  { title: '设备编号', dataIndex: 'equipment_number', key: 'equipment_number' },
  { title: '设备名称', dataIndex: 'equipment_name', key: 'equipment_name' },
  { title: '登记日期', dataIndex: 'record_date', key: 'record_date' },
  { title: '设备类型', dataIndex: 'equipment_type', key: 'equipment_type' },
  { title: '设备型号', dataIndex: 'equipment_model', key: 'equipment_model' },
  { title: '出厂日期', dataIndex: 'manufacture_date', key: 'manufacture_date' },
  { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const }
]

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getEquipments({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined
    })
    if (res.success) {
      dataSource.value = res.data.items
      pagination.total = res.data.pagination.total
    }
  } catch (err: any) {
    message.error('获取设备数据失败')
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
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
const handleEdit = (record: Equipment) => {
  Object.assign(editForm, record)
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
    const res = await updateEquipment(editForm.equipment_number, data)
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
    const res = await exportEquipments(searchText.value || undefined)
    const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'equipments.xlsx'
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

onMounted(() => {
  fetchData()
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
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'record_date'">
            {{ formatDate(record.record_date) }}
          </template>
          <template v-else-if="column.key === 'manufacture_date'">
            {{ formatDate(record.manufacture_date) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleEdit(record)">
                <template #icon><EditOutlined /></template>
                修改
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
          <a-input v-model:value="editForm.equipment_number" disabled />
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
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.equipment-page {
  padding: 0;
}
</style>
