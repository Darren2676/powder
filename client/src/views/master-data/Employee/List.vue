<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, DownloadOutlined, UploadOutlined, PlusOutlined, DownOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { getEmployees, createEmployee, updateEmployee, deleteEmployee, exportEmployees, importEmployees, approveEmployee, withdrawEmployee, enableEmployee, disableEmployee } from '@/api/master-data/employee'
import { getFactories } from '@/api/system/factory'
import { getActiveDepartments } from '@/api/system/department'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import dayjs, { Dayjs } from 'dayjs'
import { APPROVAL_STATUS, EMPLOYEE_STATUS, EMPLOYEE_STATUS_COLORS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'
interface Employee {
  employee_number: string
  employee_name: string
  gender: string
  age: number | null
  date_on_board: string | null
  department: string
  status: string
  factory_id?: number | null
}

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList<Employee>(getEmployees)

const emptyForm = (): Employee & { date_on_board_dayjs?: Dayjs | null } => ({
  employee_number: '',
  employee_name: '',
  gender: '',
  age: null,
  date_on_board: null,
  department: '',
  status: EMPLOYEE_STATUS.INACTIVE,
  factory_id: null,
  date_on_board_dayjs: null
})

const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<Employee & { date_on_board_dayjs?: Dayjs | null }>(emptyForm())

const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<Employee & { date_on_board_dayjs?: Dayjs | null }>(emptyForm())

const importLoading = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const departmentList = ref<{ id: number; dept_name: string }[]>([])
const loadDepartments = async () => {
  try {
    const res: any = await getActiveDepartments()
    if (res.success) {
      departmentList.value = res.data
    }
  } catch (e) {
    console.error('Failed to load departments:', e)
  }
}

const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch (e) { /* ignore */ }
}

const defaultDataColumns: any[] = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '员工编号', dataIndex: 'employee_number', key: 'employee_number', width: 120, sorter: (a: any, b: any) => (a.employee_number || '').localeCompare(b.employee_number || ''), resizable: true },
  { title: '员工姓名', dataIndex: 'employee_name', key: 'employee_name', width: 120, resizable: true },
  { title: '性别', dataIndex: 'gender', key: 'gender', width: 80, resizable: true },
  { title: '年龄', dataIndex: 'age', key: 'age', width: 80, resizable: true },
  { title: '入职日期', dataIndex: 'date_on_board', key: 'date_on_board', width: 120, resizable: true },
  { title: '部门', dataIndex: 'department', key: 'department', width: 120, resizable: true },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100, resizable: true },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('employee_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 150, fixed: 'right' as const }]
})

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

const handleEdit = (record: Employee) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
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

const handleDelete = (record: Employee) => {
  const empStatus = ((record as any).status || '').trim()
  const approvalStatus = ((record as any).approval_status || '').trim()
  if (empStatus !== EMPLOYEE_STATUS.INACTIVE || approvalStatus !== APPROVAL_STATUS.UNAPPROVED) {
    message.warning('只有状态为"未激活"且审核状态为"未审核"的记录才允许删除')
    return
  }
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

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveEmployee(record.employee_number)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消员工「${(record.employee_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawEmployee(record.employee_number)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

// 启用
const handleEnable = async (record: any) => {
  try {
    const res: any = await enableEmployee(record.employee_number)
    if (res.success) { message.success('启用成功'); fetchData() }
    else { message.error(res.message || '启用失败') }
  } catch { message.error('启用失败') }
}

// 禁用
const handleDisable = async (record: any) => {
  Modal.confirm({
    title: '确认禁用',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要禁用员工「${(record.employee_name || '').trim()}」吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await disableEmployee(record.employee_number)
        if (res.success) { message.success('已禁用'); fetchData() }
        else { message.error(res.message || '禁用失败') }
      } catch { message.error('禁用失败') }
    }
  })
}

const handleExport = async () => {
  try {
    const res = await exportEmployees()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = generateExportFilename('employees')
    link.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch (err) {
    message.error('导出失败')
  }
}

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
  loadColumnPreference()
  fetchData()
  loadDepartments()
  loadFactories()
})
</script>

<template>
  <div class="employee-page">
    <a-card title="员工管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索员工编号/姓名" style="width: 240px" allow-clear @search="handleSearch" @pressEnter="handleSearch" />
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button @click="handleImportClick" :loading="importLoading"><template #icon><UploadOutlined /></template>导入</a-button>
          <a-button @click="openColumnSetting"><template #icon><SettingOutlined /></template>列设置</a-button>
          <a-button type="primary" @click="handleCreate"><template #icon><PlusOutlined /></template>新建</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>
      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :pagination="pagination" :row-selection="rowSelection" :scroll="{ x: 'max-content', y: 'calc(100vh - 280px)' }" row-key="employee_number" size="middle" bordered @change="handleTableChange" @resizeColumn="handleResizeColumn">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">{{ (pagination.current - 1) * pagination.pageSize + index + 1 }}</template>
          <template v-else-if="column.key === 'department'">{{ record.department || '-' }}</template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="EMPLOYEE_STATUS_COLORS[(record.status || '').trim()] || 'default'">{{ (record.status || '').trim() || EMPLOYEE_STATUS.INACTIVE }}</a-tag>
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
                    <a-menu-item v-if="(record.status || '').trim() !== EMPLOYEE_STATUS.ENABLED" @click="handleEnable(record)">启用</a-menu-item>
                    <a-menu-item v-if="(record.status || '').trim() !== EMPLOYEE_STATUS.DISABLED" @click="handleDisable(record)">禁用</a-menu-item>
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
    <a-modal v-model:open="editModalVisible" title="修改员工" :confirm-loading="editLoading" @ok="handleEditSubmit" width="600px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="员工编号"><a-input v-model:value="editForm.employee_number" disabled /></a-form-item>
        <a-form-item label="员工姓名"><a-input v-model:value="editForm.employee_name" /></a-form-item>
        <a-form-item label="性别">
          <a-select v-model:value="editForm.gender" placeholder="请选择性别">
            <a-select-option value="男">男</a-select-option>
            <a-select-option value="女">女</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="年龄"><a-input-number v-model:value="editForm.age" :min="1" :max="120" style="width: 100%" /></a-form-item>
        <a-form-item label="入职日期"><a-date-picker v-model:value="editForm.date_on_board_dayjs" style="width: 100%" /></a-form-item>
        <a-form-item label="部门">
          <a-select v-model:value="editForm.department" placeholder="请选择部门" allow-clear show-search :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())">
            <a-select-option v-for="dept in departmentList" :key="dept.id" :value="dept.dept_name" :label="dept.dept_name">{{ dept.dept_name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="所属工厂">
          <a-select v-model:value="editForm.factory_id" placeholder="请选择" allow-clear>
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
    <a-modal v-model:open="createModalVisible" title="新建员工" :confirm-loading="createLoading" @ok="handleCreateSubmit" width="600px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="员工编号" required><a-input v-model:value="createForm.employee_number" placeholder="请输入员工编号" /></a-form-item>
        <a-form-item label="员工姓名"><a-input v-model:value="createForm.employee_name" placeholder="请输入员工姓名" /></a-form-item>
        <a-form-item label="性别">
          <a-select v-model:value="createForm.gender" placeholder="请选择性别">
            <a-select-option value="男">男</a-select-option>
            <a-select-option value="女">女</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="年龄"><a-input-number v-model:value="createForm.age" :min="1" :max="120" style="width: 100%" placeholder="请输入年龄" /></a-form-item>
        <a-form-item label="入职日期"><a-date-picker v-model:value="createForm.date_on_board_dayjs" style="width: 100%" placeholder="请选择入职日期" /></a-form-item>
        <a-form-item label="部门">
          <a-select v-model:value="createForm.department" placeholder="请选择部门" allow-clear show-search :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())">
            <a-select-option v-for="dept in departmentList" :key="dept.id" :value="dept.dept_name" :label="dept.dept_name">{{ dept.dept_name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="所属工厂">
          <a-select v-model:value="createForm.factory_id" placeholder="请选择" allow-clear>
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
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
  </div>
</template>

<style scoped>
.employee-page {
  padding: 0;
}
</style>
