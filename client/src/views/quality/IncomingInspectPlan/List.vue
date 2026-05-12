<template>
  <div>
    <a-card title="收料检验方案" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索方案名称" style="width: 200px" @search="handleSearch" allowClear @change="(e: any) => { if (!e.target.value) handleSearch() }" />
          <a-button @click="handleReset"><ReloadOutlined />重置</a-button>
          <a-button @click="handleExport"><DownloadOutlined />导出</a-button>
          <a-button @click="handleImportClick"><UploadOutlined />导入</a-button>
          <a-button type="primary" @click="openCreateModal"><PlusOutlined />新建</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        row-key="plan_name"
        :pagination="pagination"
        :scroll="{ x: 1400, y: 'calc(100vh - 280px)' }"
        @change="handleTableChange"
        size="small"
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
              <a-button type="link" size="small" @click="handleEdit(record)">编辑</a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>
                  更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="(record.approval_status || '').trim() !== APPROVAL_STATUS.APPROVED" @click="handleApprove(record)">审核</a-menu-item>
                    <a-menu-item v-else @click="handleWithdraw(record)">撤消</a-menu-item>
                    <a-menu-item @click="handleDelete(record)">删除</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新建/编辑 Modal -->
    <a-modal v-model:open="modalVisible" :title="modalMode === 'create' ? '新建收料检验方案' : '编辑收料检验方案'" @ok="handleOk" okText="确认" cancelText="取消" width="700px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 15 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="方案名称" required>
              <a-input v-model:value="form.plan_name" :disabled="modalMode === 'edit'" placeholder="请输入" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="检验员账号">
              <a-input v-model:value="form.inspector_id" placeholder="请输入" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="检验员姓名">
              <a-input v-model:value="form.inspector_name" placeholder="请输入" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="检验部门">
              <a-input v-model:value="form.inspect_department" placeholder="请输入" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="检验方法">
              <a-select v-model:value="form.inspect_method" placeholder="选择" allowClear>
                <a-select-option value="抽检">抽检</a-select-option>
                <a-select-option value="全检">全检</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="抽检方式">
              <a-select v-model:value="form.sampling_method" placeholder="选择" allowClear>
                <a-select-option value="按数量">按数量</a-select-option>
                <a-select-option value="按比例">按比例</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="抽检数">
              <a-input-number v-model:value="form.sampling_quantity" style="width: 100%" :min="0" :precision="0" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="小数处理方式">
              <a-select v-model:value="form.decimal_handling" placeholder="选择" allowClear>
                <a-select-option value="向上取整">向上取整</a-select-option>
                <a-select-option value="向下取整">向下取整</a-select-option>
                <a-select-option value="四舍五入">四舍五入</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="是否破坏性检验">
              <a-select v-model:value="form.is_destructive" placeholder="选择" allowClear>
                <a-select-option value="非破坏性检验">非破坏性检验</a-select-option>
                <a-select-option value="破坏性检验">破坏性检验</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="应用于分类">
              <a-input v-model:value="form.applied_category" placeholder="请输入" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, DownloadOutlined, UploadOutlined, PlusOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, DownOutlined } from '@ant-design/icons-vue'
import { APPROVAL_STATUS } from '@/constants/statuses'
import {
  getIncomingInspectPlans, createIncomingInspectPlan, updateIncomingInspectPlan,
  deleteIncomingInspectPlan, exportIncomingInspectPlans, importIncomingInspectPlans,
  approveIncomingInspectPlan, withdrawIncomingInspectPlan
} from '@/api/quality/incomingInspectPlan'
import { useTableList } from '@/composables/useTableList'
import { generateExportFilename } from '@/utils/exportFilename'

const fileInputRef = ref<HTMLInputElement | null>(null)

const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getIncomingInspectPlans)

// ===== Modal 状态 =====
const modalVisible = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const form = reactive({
  plan_name: '',
  inspector_id: '',
  inspector_name: '',
  inspect_department: '',
  inspect_method: '',
  sampling_method: '',
  sampling_quantity: 0,
  decimal_handling: '',
  is_destructive: '',
  applied_category: ''
})

const emptyForm = () => ({
  plan_name: '',
  inspector_id: '',
  inspector_name: '',
  inspect_department: '',
  inspect_method: '',
  sampling_method: '',
  sampling_quantity: 0,
  decimal_handling: '',
  is_destructive: '',
  applied_category: ''
})

const openCreateModal = () => {
  modalMode.value = 'create'
  Object.assign(form, emptyForm())
  modalVisible.value = true
}

const columns = [
  { title: '行号', key: 'rowIndex', width: 50 },
  { title: '方案名称', dataIndex: 'plan_name', key: 'plan_name', width: 130 },
  { title: '检验员账号', dataIndex: 'inspector_id', key: 'inspector_id', width: 160 },
  { title: '检验员姓名', dataIndex: 'inspector_name', key: 'inspector_name', width: 130 },
  { title: '检验部门', dataIndex: 'inspect_department', key: 'inspect_department', width: 100 },
  { title: '检验方法', dataIndex: 'inspect_method', key: 'inspect_method', width: 80 },
  { title: '抽检方式', dataIndex: 'sampling_method', key: 'sampling_method', width: 80 },
  { title: '抽检数', dataIndex: 'sampling_quantity', key: 'sampling_quantity', width: 70, align: 'right' as const },
  { title: '小数处理方式', dataIndex: 'decimal_handling', key: 'decimal_handling', width: 110 },
  { title: '是否破坏性检验', dataIndex: 'is_destructive', key: 'is_destructive', width: 120 },
  { title: '应用于分类', dataIndex: 'applied_category', key: 'applied_category', width: 100 },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' as const }
]

const handleEdit = (record: any) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  modalMode.value = 'edit'
  Object.assign(form, {
    plan_name: record.plan_name,
    inspector_id: record.inspector_id || '',
    inspector_name: record.inspector_name || '',
    inspect_department: record.inspect_department || '',
    inspect_method: record.inspect_method || '',
    sampling_method: record.sampling_method || '',
    sampling_quantity: record.sampling_quantity != null ? Number(record.sampling_quantity) : 0,
    decimal_handling: record.decimal_handling || '',
    is_destructive: record.is_destructive || '',
    applied_category: record.applied_category || ''
  })
  modalVisible.value = true
}

const handleOk = async () => {
  if (!form.plan_name) { message.warning('请输入方案名称'); return }
  try {
    if (modalMode.value === 'create') {
      await createIncomingInspectPlan(form)
      message.success('创建成功')
    } else {
      await updateIncomingInspectPlan(form.plan_name, form)
      message.success('更新成功')
    }
    modalVisible.value = false
    fetchData()
  } catch { message.error('操作失败') }
}

const handleDelete = (record: any) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除收料检验方案"${record.plan_name}"吗?`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        await deleteIncomingInspectPlan(record.plan_name)
        message.success('删除成功')
        fetchData()
      } catch { message.error('删除失败') }
    }
  })
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveIncomingInspectPlan(record.plan_name)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消来料检验方案「${(record.plan_name || '').trim()}」的审核吗？`,
    okText: '确定', cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawIncomingInspectPlan(record.plan_name)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

// ===== 导入导出 =====
const handleExport = async () => {
  try {
    const res: any = await exportIncomingInspectPlans()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('incoming_inspect_plans')
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
    const res: any = await importIncomingInspectPlans(formData)
    message.success(res.message || '导入成功')
    fetchData()
  } catch { message.error('导入失败') } finally { target.value = '' }
}

onMounted(() => { fetchData() })
</script>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
</style>
