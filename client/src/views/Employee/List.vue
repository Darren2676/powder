<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, DownloadOutlined, UploadOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { getEmployees, createEmployee, updateEmployee, deleteEmployee, exportEmployees, importEmployees } from '@/api/employee'
import dayjs, { Dayjs } from 'dayjs'

interface Employee {
  employee_number: string
  employee_name: string
  gender: string
  age: number | null
  date_on_board: string | null
}

const loading = ref(false)
const selectedRowKeys = ref<string[]>([])
const rowSelection = {
  selectedRowKeys,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}
const dataSource = ref<Employee[]>([])
const searchText = ref('')

const emptyForm = (): Employee & { date_on_board_dayjs?: Dayjs | null } => ({
  employee_number: '',
  employee_name: '',
  gender: '',
  age: null,
  date_on_board: null,
  date_on_board_dayjs: null
})

// 编辑弹窗
const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<Employee & { date_on_board_dayjs?: Dayjs | null }>(emptyForm())

// 新建弹窗
const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<Employee & { date_on_board_dayjs?: Dayjs | null }>(emptyForm())

// 导入
const importLoading = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

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
  { title: '员工编号', dataIndex: 'employee_number', key: 'employee_number', width: 120 },
  { title: '员工姓名', dataIndex: 'employee_name', key: 'employee_name', width: 120 },
  { title: '性别', dataIndex: 'gender', key: 'gender', width: 80 },
  { title: '年龄', dataIndex: 'age', key: 'age', width: 80 },
  { title: '入职日期', dataIndex: 'date_on_board', key: 'date_on_board', width: 120 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const }
]

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getEmployees({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined
    })
    if (res.success) {
      dataSource.value = res.data.items
      pagination.total = res.data.pagination.total
    }
  } catch (err: any) {
    message.error('获取员工数据失败')
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

// 新建
const handleCreate = () => {
  Object.assign(createForm, emptyForm())
  createModalVisible.value = true
}

const handleCreateSubmit = async () => {
  if (!createForm.employee_number) {
    message.warning('请输入员工编号')
    return
  }
  createLoading.value = true
  try {
    const submitData = { ...createForm }
    if (createForm.date_on_board_dayjs) {
      submitData.date_on_board = createForm.date_on_board_dayjs.format('YYYY-MM-DD')
    }
    delete submitData.date_on_board_dayjs

    const res = await createEmployee(submitData)
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
const handleEdit = (record: Employee) => {
  Object.assign(editForm, record)
  editForm.date_on_board_dayjs = record.date_on_board ? dayjs(record.date_on_board) : null
  editModalVisible.value = true
}

const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const submitData = { ...editForm }
    if (editForm.date_on_board_dayjs) {
      submitData.date_on_board = editForm.date_on_board_dayjs.format('YYYY-MM-DD')
    }
    delete submitData.date_on_board_dayjs

    const res = await updateEmployee(editForm.employee_number, submitData)
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
const handleDelete = (record: Employee) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除员工 "${record.employee_name}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteEmployee(record.employee_number)
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

// 导出
const handleExport = async () => {
  try {
    const res = await exportEmployees()
    const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'employees.xlsx'
    link.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch (err) {
    message.error('导出失败')
  }
}

// 导入
const handleImportClick = () => {
  fileInputRef.value?.click()
}

const handleFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    importLoading.value = true
    const formData = new FormData()
    formData.append('file', file)
    const res = await importEmployees(formData)
    if (res.success) {
      message.success(res.message || '导入成功')
      fetchData()
    } else {
      message.error(res.message || '导入失败')
    }
  } catch {
    message.error('导入失败')
  } finally {
    importLoading.value = false
    target.value = ''
  }
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="employee-page">
    <a-card title="员工管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索员工编号/姓名"
            style="width: 240px"
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
          <a-button @click="handleImportClick" :loading="importLoading">
            <template #icon><UploadOutlined /></template>
            导入
          </a-button>
          <a-button type="primary" @click="handleCreate">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :row-selection="rowSelection"
        :scroll="{ x: 800, y: 'calc(100vh - 280px)' }"
        row-key="employee_number"
        size="middle"
        bordered
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
      title="修改员工"
      :confirm-loading="editLoading"
      @ok="handleEditSubmit"
      width="600px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="员工编号">
          <a-input v-model:value="editForm.employee_number" disabled />
        </a-form-item>
        <a-form-item label="员工姓名">
          <a-input v-model:value="editForm.employee_name" />
        </a-form-item>
        <a-form-item label="性别">
          <a-select v-model:value="editForm.gender" placeholder="请选择性别">
            <a-select-option value="男">男</a-select-option>
            <a-select-option value="女">女</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="年龄">
          <a-input-number v-model:value="editForm.age" :min="1" :max="120" style="width: 100%" />
        </a-form-item>
        <a-form-item label="入职日期">
          <a-date-picker v-model:value="editForm.date_on_board_dayjs" style="width: 100%" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建弹窗 -->
    <a-modal
      v-model:open="createModalVisible"
      title="新建员工"
      :confirm-loading="createLoading"
      @ok="handleCreateSubmit"
      width="600px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="员工编号" required>
          <a-input v-model:value="createForm.employee_number" placeholder="请输入员工编号" />
        </a-form-item>
        <a-form-item label="员工姓名">
          <a-input v-model:value="createForm.employee_name" placeholder="请输入员工姓名" />
        </a-form-item>
        <a-form-item label="性别">
          <a-select v-model:value="createForm.gender" placeholder="请选择性别">
            <a-select-option value="男">男</a-select-option>
            <a-select-option value="女">女</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="年龄">
          <a-input-number v-model:value="createForm.age" :min="1" :max="120" style="width: 100%" placeholder="请输入年龄" />
        </a-form-item>
        <a-form-item label="入职日期">
          <a-date-picker v-model:value="createForm.date_on_board_dayjs" style="width: 100%" placeholder="请选择入职日期" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.employee-page {
  padding: 0;
}
</style>
