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
  PlusOutlined,
  DownOutlined
} from '@ant-design/icons-vue'
import { getTeams, createTeam, updateTeam, deleteTeam, exportTeams, importTeams, approveTeam, withdrawTeam } from '@/api/master-data/team'
import { getEmployees } from '@/api/master-data/employee'
import { useTableList } from '@/composables/useTableList'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

interface Employee {
  employee_number: string
  employee_name: string
}

interface Team {
  team_number?: number
  team_name: string
  employee_number1: string
  employee_name1: string
  employee_number2: string
  employee_name2: string
  employee_number3: string
  employee_name3: string
  employee_number4: string
  employee_name4: string
  employee_number5: string
  employee_name5: string
}

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList<Team>(getTeams)

const editModalVisible = ref(false)
const createModalVisible = ref(false)

const employeeList = ref<Employee[]>([])
const employeeOptions = ref<{ label: string; value: string }[]>([])

const fetchEmployees = async () => {
  try {
    const res = await getEmployees({ pageSize: 9999 })
    const list = res.data.list || res.data.items || []
    employeeList.value = list
    employeeOptions.value = list.map((e: Employee) => ({
      label: `${e.employee_number} - ${e.employee_name}`,
      value: e.employee_number
    }))
  } catch (error) {
    message.error('获取员工列表失败')
  }
}

const getEmployeeName = (empNumber: string): string => {
  const emp = employeeList.value.find(e => e.employee_number === empNumber)
  return emp ? emp.employee_name : ''
}

const handleEmployeeChange = (form: Team, index: number, value: string) => {
  const numberKey = `employee_number${index}` as keyof Team
  const nameKey = `employee_name${index}` as keyof Team
  ;(form as any)[numberKey] = value
  ;(form as any)[nameKey] = getEmployeeName(value)
}

const handleEmployeeClear = (form: Team, index: number) => {
  const numberKey = `employee_number${index}` as keyof Team
  const nameKey = `employee_name${index}` as keyof Team
  ;(form as any)[numberKey] = ''
  ;(form as any)[nameKey] = ''
}

const editForm = reactive<Team>({
  team_number: undefined,
  team_name: '',
  employee_number1: '',
  employee_name1: '',
  employee_number2: '',
  employee_name2: '',
  employee_number3: '',
  employee_name3: '',
  employee_number4: '',
  employee_name4: '',
  employee_number5: '',
  employee_name5: ''
})
const createForm = reactive<Team>({
  team_number: undefined,
  team_name: '',
  employee_number1: '',
  employee_name1: '',
  employee_number2: '',
  employee_name2: '',
  employee_number3: '',
  employee_name3: '',
  employee_number4: '',
  employee_name4: '',
  employee_number5: '',
  employee_name5: ''
})

const fileInputRef = ref<HTMLInputElement>()

const columns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  {
    title: '班组编号',
    dataIndex: 'team_number',
    key: 'team_number',
    width: 120,
    fixed: 'left'
  },
  {
    title: '班组名称',
    dataIndex: 'team_name',
    key: 'team_name',
    width: 120,
    fixed: 'left'
  },
  {
    title: '员工编号1',
    dataIndex: 'employee_number1',
    key: 'employee_number1',
    width: 120
  },
  {
    title: '员工姓名1',
    dataIndex: 'employee_name1',
    key: 'employee_name1',
    width: 120
  },
  {
    title: '员工编号2',
    dataIndex: 'employee_number2',
    key: 'employee_number2',
    width: 120
  },
  {
    title: '员工姓名2',
    dataIndex: 'employee_name2',
    key: 'employee_name2',
    width: 120
  },
  {
    title: '员工编号3',
    dataIndex: 'employee_number3',
    key: 'employee_number3',
    width: 120
  },
  {
    title: '员工姓名3',
    dataIndex: 'employee_name3',
    key: 'employee_name3',
    width: 120
  },
  {
    title: '员工编号4',
    dataIndex: 'employee_number4',
    key: 'employee_number4',
    width: 120
  },
  {
    title: '员工姓名4',
    dataIndex: 'employee_name4',
    key: 'employee_name4',
    width: 120
  },
  {
    title: '员工编号5',
    dataIndex: 'employee_number5',
    key: 'employee_number5',
    width: 120
  },
  {
    title: '员工姓名5',
    dataIndex: 'employee_name5',
    key: 'employee_name5',
    width: 120
  },
  {
    title: '审核状态',
    dataIndex: 'approval_status',
    key: 'approval_status',
    width: 100
  },
  {
    title: '操作',
    key: 'action',
    width: 120,
    fixed: 'right' as const
  }
]

const handleEdit = (record: Team) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  editForm.team_number = record.team_number
  editForm.team_name = record.team_name
  editForm.employee_number1 = record.employee_number1
  editForm.employee_name1 = record.employee_name1
  editForm.employee_number2 = record.employee_number2
  editForm.employee_name2 = record.employee_name2
  editForm.employee_number3 = record.employee_number3
  editForm.employee_name3 = record.employee_name3
  editForm.employee_number4 = record.employee_number4
  editForm.employee_name4 = record.employee_name4
  editForm.employee_number5 = record.employee_number5
  editForm.employee_name5 = record.employee_name5
  editModalVisible.value = true
}

const handleDelete = (record: Team) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除班组"${record.team_name}"吗?`,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      try {
        await deleteTeam(record.team_number!)
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
    await updateTeam(editForm.team_number!, editForm)
    message.success('更新成功')
    editModalVisible.value = false
    fetchData()
  } catch (error) {
    message.error('更新失败')
  }
}

const handleCreateOk = async () => {
  try {
    await createTeam(createForm)
    message.success('创建成功')
    createModalVisible.value = false
    Object.assign(createForm, {
      team_number: undefined,
      team_name: '',
      employee_number1: '',
      employee_name1: '',
      employee_number2: '',
      employee_name2: '',
      employee_number3: '',
      employee_name3: '',
      employee_number4: '',
      employee_name4: '',
      employee_number5: '',
      employee_name5: ''
    })
    fetchData()
  } catch (error) {
    message.error('创建失败')
  }
}

const handleExport = async () => {
  try {
    const res = await exportTeams()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('groups')
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
    await importTeams(formData)
    message.success('导入成功')
    fetchData()
  } catch (error) {
    message.error('导入失败')
  } finally {
    target.value = ''
  }
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveTeam(record.team_number!)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消班组「${(record.team_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawTeam(record.team_number!)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

onMounted(() => {
  fetchData()
  fetchEmployees()
})
</script>

<template>
  <div>
    <a-card title="班组管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索班组名称"
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
        :row-key="(record: Team) => record.team_number!"
        :row-selection="rowSelection"
        :pagination="pagination"
        :scroll="{ x: 1600, y: 'calc(100vh - 280px)' }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
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
      title="编辑班组"
      @ok="handleEditOk"
      okText="确认"
      cancelText="取消"
      width="800px"
    >
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="班组编号">
              <a-input v-model:value="editForm.team_number" disabled />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="班组名称">
              <a-input v-model:value="editForm.team_name" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="员工编号1">
              <a-select
                v-model:value="editForm.employee_number1"
                show-search
                allow-clear
                placeholder="请选择员工"
                :options="employeeOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleEmployeeChange(editForm, 1, val)"
                @clear="handleEmployeeClear(editForm, 1)"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="员工姓名1">
              <a-input v-model:value="editForm.employee_name1" disabled />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="员工编号2">
              <a-select
                v-model:value="editForm.employee_number2"
                show-search
                allow-clear
                placeholder="请选择员工"
                :options="employeeOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleEmployeeChange(editForm, 2, val)"
                @clear="handleEmployeeClear(editForm, 2)"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="员工姓名2">
              <a-input v-model:value="editForm.employee_name2" disabled />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="员工编号3">
              <a-select
                v-model:value="editForm.employee_number3"
                show-search
                allow-clear
                placeholder="请选择员工"
                :options="employeeOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleEmployeeChange(editForm, 3, val)"
                @clear="handleEmployeeClear(editForm, 3)"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="员工姓名3">
              <a-input v-model:value="editForm.employee_name3" disabled />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="员工编号4">
              <a-select
                v-model:value="editForm.employee_number4"
                show-search
                allow-clear
                placeholder="请选择员工"
                :options="employeeOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleEmployeeChange(editForm, 4, val)"
                @clear="handleEmployeeClear(editForm, 4)"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="员工姓名4">
              <a-input v-model:value="editForm.employee_name4" disabled />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="员工编号5">
              <a-select
                v-model:value="editForm.employee_number5"
                show-search
                allow-clear
                placeholder="请选择员工"
                :options="employeeOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleEmployeeChange(editForm, 5, val)"
                @clear="handleEmployeeClear(editForm, 5)"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="员工姓名5">
              <a-input v-model:value="editForm.employee_name5" disabled />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- 新建模态框 -->
    <a-modal
      v-model:open="createModalVisible"
      title="新建班组"
      @ok="handleCreateOk"
      okText="确认"
      cancelText="取消"
      width="800px"
    >
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="班组编号">
              <a-input v-model:value="createForm.team_number" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="班组名称">
              <a-input v-model:value="createForm.team_name" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="员工编号1">
              <a-select
                v-model:value="createForm.employee_number1"
                show-search
                allow-clear
                placeholder="请选择员工"
                :options="employeeOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleEmployeeChange(createForm, 1, val)"
                @clear="handleEmployeeClear(createForm, 1)"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="员工姓名1">
              <a-input v-model:value="createForm.employee_name1" disabled />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="员工编号2">
              <a-select
                v-model:value="createForm.employee_number2"
                show-search
                allow-clear
                placeholder="请选择员工"
                :options="employeeOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleEmployeeChange(createForm, 2, val)"
                @clear="handleEmployeeClear(createForm, 2)"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="员工姓名2">
              <a-input v-model:value="createForm.employee_name2" disabled />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="员工编号3">
              <a-select
                v-model:value="createForm.employee_number3"
                show-search
                allow-clear
                placeholder="请选择员工"
                :options="employeeOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleEmployeeChange(createForm, 3, val)"
                @clear="handleEmployeeClear(createForm, 3)"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="员工姓名3">
              <a-input v-model:value="createForm.employee_name3" disabled />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="员工编号4">
              <a-select
                v-model:value="createForm.employee_number4"
                show-search
                allow-clear
                placeholder="请选择员工"
                :options="employeeOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleEmployeeChange(createForm, 4, val)"
                @clear="handleEmployeeClear(createForm, 4)"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="员工姓名4">
              <a-input v-model:value="createForm.employee_name4" disabled />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="员工编号5">
              <a-select
                v-model:value="createForm.employee_number5"
                show-search
                allow-clear
                placeholder="请选择员工"
                :options="employeeOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleEmployeeChange(createForm, 5, val)"
                @clear="handleEmployeeClear(createForm, 5)"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="员工姓名5">
              <a-input v-model:value="createForm.employee_name5" disabled />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) {
  padding: 0;
}
</style>
