<template>
  <div>
    <a-card title="生产检验方案" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索方案名称" style="width: 200px" @search="handleSearch" allowClear @change="(e: any) => { if (!e.target.value) handleSearch() }" />
          <a-select v-model:value="filterType" placeholder="检验类型" style="width: 110px" allowClear @change="handleSearch">
            <a-select-option value="专检">专检</a-select-option>
            <a-select-option value="自检">自检</a-select-option>
          </a-select>
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
        :scroll="{ x: 1800, y: 'calc(100vh - 280px)' }"
        @change="handleTableChange"
        size="small"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'is_full_inspect'">
            <a-tag :color="record.is_full_inspect === '是' ? 'green' : ''">{{ record.is_full_inspect }}</a-tag>
          </template>
          <template v-else-if="column.key === 'is_sampling'">
            <a-tag :color="record.is_sampling === '是' ? 'blue' : ''">{{ record.is_sampling }}</a-tag>
          </template>
          <template v-else-if="column.key === 'sampling_ratio'">
            {{ record.sampling_ratio ? Number(record.sampling_ratio) + '%' : '' }}
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
    <a-modal v-model:open="modalVisible" :title="modalMode === 'create' ? '新建检验方案' : '编辑检验方案'" @ok="handleOk" okText="确认" cancelText="取消" width="750px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 15 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="方案名称" required>
              <a-input v-model:value="form.plan_name" :disabled="modalMode === 'edit'" placeholder="请输入" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="检验类型" required>
              <a-select v-model:value="form.inspect_type" placeholder="选择">
                <a-select-option value="专检">专检</a-select-option>
                <a-select-option value="自检">自检</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="是否全检">
              <a-select v-model:value="form.is_full_inspect">
                <a-select-option value="是">是</a-select-option>
                <a-select-option value="否">否</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="是否抽检">
              <a-select v-model:value="form.is_sampling">
                <a-select-option value="是">是</a-select-option>
                <a-select-option value="否">否</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <template v-if="form.is_sampling === '是'">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="抽检触发方式">
                <a-select v-model:value="form.sampling_trigger" allowClear placeholder="选择">
                  <a-select-option value="自动">自动</a-select-option>
                  <a-select-option value="手动">手动</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="抽检类型">
                <a-select v-model:value="form.sampling_type" allowClear placeholder="选择">
                  <a-select-option value="按比例">按比例</a-select-option>
                  <a-select-option value="按数量">按数量</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="抽检比例(%)">
                <a-input-number v-model:value="form.sampling_ratio" style="width: 100%" :min="0" :max="100" :precision="2" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="小数位处理">
                <a-select v-model:value="form.decimal_handling" allowClear placeholder="选择">
                  <a-select-option value="向上取整">向上取整</a-select-option>
                  <a-select-option value="向下取整">向下取整</a-select-option>
                  <a-select-option value="四舍五入">四舍五入</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="抽检数量">
                <a-input-number v-model:value="form.sampling_quantity" style="width: 100%" :min="0" :precision="0" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="抽检范围类型">
                <a-select v-model:value="form.sampling_range_type" allowClear placeholder="选择">
                  <a-select-option value="按批量">按批量</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="抽检数量范围">
                <a-input-number v-model:value="form.sampling_quantity_range" style="width: 100%" :min="0" :precision="0" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="抽检批量范围">
                <a-input-number v-model:value="form.sampling_batch_range" style="width: 100%" :min="0" :precision="0" />
              </a-form-item>
            </a-col>
          </a-row>
        </template>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="是否首检">
              <a-select v-model:value="form.is_first_inspect">
                <a-select-option value="是">是</a-select-option>
                <a-select-option value="否">否</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="首检数量">
              <a-input-number v-model:value="form.first_inspect_quantity" style="width: 100%" :min="0" :precision="0" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="是否末检">
              <a-select v-model:value="form.is_last_inspect">
                <a-select-option value="是">是</a-select-option>
                <a-select-option value="否">否</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="末检数量">
              <a-input-number v-model:value="form.last_inspect_quantity" style="width: 100%" :min="0" :precision="0" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, DownloadOutlined, UploadOutlined, PlusOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, DownOutlined } from '@ant-design/icons-vue'
import { APPROVAL_STATUS } from '@/constants/statuses'
import {
  getInspectionPlans, createInspectionPlan, updateInspectionPlan,
  deleteInspectionPlan, exportInspectionPlans, importInspectionPlans,
  approveInspectionPlan, withdrawInspectionPlan
} from '@/api/quality/inspectionPlan'
import { useTableList } from '@/composables/useTableList'
import { generateExportFilename } from '@/utils/exportFilename'


const filterType = ref<string | undefined>(undefined)



const fileInputRef = ref<HTMLInputElement | null>(null)

const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getInspectionPlans)

// ===== Modal 状态 =====
const modalVisible = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const form = reactive({
  plan_name: '',
  inspect_type: '专检',
  is_full_inspect: '否',
  is_sampling: '否',
  sampling_trigger: '',
  sampling_type: '',
  sampling_ratio: 0,
  decimal_handling: '',
  sampling_quantity: 0,
  sampling_range_type: '',
  sampling_quantity_range: 0,
  sampling_batch_range: 0,
  is_first_inspect: '否',
  first_inspect_time: '',
  first_inspect_quantity: 0,
  is_last_inspect: '否',
  last_inspect_quantity: 0
})

const emptyForm = () => ({
  plan_name: '',
  inspect_type: '专检',
  is_full_inspect: '否',
  is_sampling: '否',
  sampling_trigger: '',
  sampling_type: '',
  sampling_ratio: 0,
  decimal_handling: '',
  sampling_quantity: 0,
  sampling_range_type: '',
  sampling_quantity_range: 0,
  sampling_batch_range: 0,
  is_first_inspect: '否',
  first_inspect_time: '',
  first_inspect_quantity: 0,
  is_last_inspect: '否',
  last_inspect_quantity: 0
})

const openCreateModal = () => {
  modalMode.value = 'create'
  Object.assign(form, emptyForm())
  modalVisible.value = true
}

const columns = [
  { title: '行号', key: 'rowIndex', width: 50 },
  { title: '方案名称', dataIndex: 'plan_name', key: 'plan_name', width: 140 },
  { title: '检验类型', dataIndex: 'inspect_type', key: 'inspect_type', width: 80 },
  { title: '是否全检', dataIndex: 'is_full_inspect', key: 'is_full_inspect', width: 80 },
  { title: '是否抽检', dataIndex: 'is_sampling', key: 'is_sampling', width: 80 },
  { title: '抽检触发', dataIndex: 'sampling_trigger', key: 'sampling_trigger', width: 85 },
  { title: '抽检类型', dataIndex: 'sampling_type', key: 'sampling_type', width: 85 },
  { title: '抽检比例', dataIndex: 'sampling_ratio', key: 'sampling_ratio', width: 80, align: 'right' as const },
  { title: '小数处理', dataIndex: 'decimal_handling', key: 'decimal_handling', width: 90 },
  { title: '抽检数量', dataIndex: 'sampling_quantity', key: 'sampling_quantity', width: 80, align: 'right' as const },
  { title: '范围类型', dataIndex: 'sampling_range_type', key: 'sampling_range_type', width: 85 },
  { title: '数量范围', dataIndex: 'sampling_quantity_range', key: 'sampling_quantity_range', width: 80, align: 'right' as const },
  { title: '批量范围', dataIndex: 'sampling_batch_range', key: 'sampling_batch_range', width: 80, align: 'right' as const },
  { title: '是否首检', dataIndex: 'is_first_inspect', key: 'is_first_inspect', width: 80 },
  { title: '首检数量', dataIndex: 'first_inspect_quantity', key: 'first_inspect_quantity', width: 80, align: 'right' as const },
  { title: '是否末检', dataIndex: 'is_last_inspect', key: 'is_last_inspect', width: 80 },
  { title: '末检数量', dataIndex: 'last_inspect_quantity', key: 'last_inspect_quantity', width: 80, align: 'right' as const },
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
    inspect_type: record.inspect_type || '专检',
    is_full_inspect: record.is_full_inspect || '否',
    is_sampling: record.is_sampling || '否',
    sampling_trigger: record.sampling_trigger || '',
    sampling_type: record.sampling_type || '',
    sampling_ratio: record.sampling_ratio != null ? Number(record.sampling_ratio) : 0,
    decimal_handling: record.decimal_handling || '',
    sampling_quantity: record.sampling_quantity != null ? Number(record.sampling_quantity) : 0,
    sampling_range_type: record.sampling_range_type || '',
    sampling_quantity_range: record.sampling_quantity_range != null ? Number(record.sampling_quantity_range) : 0,
    sampling_batch_range: record.sampling_batch_range != null ? Number(record.sampling_batch_range) : 0,
    is_first_inspect: record.is_first_inspect || '否',
    first_inspect_time: record.first_inspect_time || '',
    first_inspect_quantity: record.first_inspect_quantity != null ? Number(record.first_inspect_quantity) : 0,
    is_last_inspect: record.is_last_inspect || '否',
    last_inspect_quantity: record.last_inspect_quantity != null ? Number(record.last_inspect_quantity) : 0
  })
  modalVisible.value = true
}

const handleOk = async () => {
  if (!form.plan_name) { message.warning('请输入方案名称'); return }
  if (!form.inspect_type) { message.warning('请选择检验类型'); return }
  try {
    if (modalMode.value === 'create') {
      await createInspectionPlan(form)
      message.success('创建成功')
    } else {
      await updateInspectionPlan(form.plan_name, form)
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
    content: `确定要删除检验方案"${record.plan_name}"吗?`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        await deleteInspectionPlan(record.plan_name)
        message.success('删除成功')
        fetchData()
      } catch { message.error('删除失败') }
    }
  })
}

const handleApprove = async (record: any) => {
  try {
    const res: any = await approveInspectionPlan(record.plan_name)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消生产检验方案「${(record.plan_name || '').trim()}」的审核吗？`,
    okText: '确定', cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawInspectionPlan(record.plan_name)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

// ===== 导入导出 =====
const handleExport = async () => {
  try {
    const res: any = await exportInspectionPlans()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('inspection_plans')
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
    const res: any = await importInspectionPlans(formData)
    message.success(res.message || '导入成功')
    fetchData()
  } catch { message.error('导入失败') } finally { target.value = '' }
}

// 抽检切换时清空抽检相关字段
watch(() => form.is_sampling, (val) => {
  if (val !== '是') {
    form.sampling_trigger = ''
    form.sampling_type = ''
    form.sampling_ratio = 0
    form.decimal_handling = ''
    form.sampling_quantity = 0
    form.sampling_range_type = ''
    form.sampling_quantity_range = 0
    form.sampling_batch_range = 0
  }
})

onMounted(() => { fetchData() })
</script>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
</style>
