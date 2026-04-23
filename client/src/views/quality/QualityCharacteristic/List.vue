<script setup lang="ts">
import { ref, reactive, onMounted, createVNode, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownloadOutlined, UploadOutlined, PlusOutlined, DownOutlined
} from '@ant-design/icons-vue'
import { getQualityCharacteristics, createQualityCharacteristic, updateQualityCharacteristic, deleteQualityCharacteristic, exportQualityCharacteristics, importQualityCharacteristics, approveQualityCharacteristic, withdrawQualityCharacteristic } from '@/api/quality/qualityCharacteristic'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { useTableList } from '@/composables/useTableList'
import { generateExportFilename } from '@/utils/exportFilename'

defineOptions({ name: 'QualityCharacteristicList' })

interface QualityCharacteristic {
  char_name: string
  data_type: string
  inspect_requirement: string
  allow_multiple: string
  upper_limit: number | null
  standard_value: number | null
  lower_limit: number | null
  single_options: string
  multi_options: string
  qualified_options: string
  default_value: string
}








const { loading, dataSource, searchText, pagination, selectedRowKeys, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getQualityCharacteristics)

const editModalVisible = ref(false)
const createModalVisible = ref(false)
const emptyForm = (): QualityCharacteristic => ({
  char_name: '', data_type: '', inspect_requirement: '', allow_multiple: '否',
  upper_limit: null, standard_value: null, lower_limit: null,
  single_options: '', multi_options: '', qualified_options: '', default_value: ''
})
const editForm = reactive<QualityCharacteristic>(emptyForm())
const createForm = reactive<QualityCharacteristic>(emptyForm())
const fileInputRef = ref<HTMLInputElement>()

const columns = [
  { title: '行号', key: 'rowIndex', width: 55 },
  { title: '质量特性', dataIndex: 'char_name', key: 'char_name', width: 150 },
  { title: '数据类型', dataIndex: 'data_type', key: 'data_type', width: 85 },
  { title: '检验要求', dataIndex: 'inspect_requirement', key: 'inspect_requirement', width: 160 },
  { title: '允许输入多项', dataIndex: 'allow_multiple', key: 'allow_multiple', width: 100 },
  { title: '上限', dataIndex: 'upper_limit', key: 'upper_limit', width: 80 },
  { title: '标准值', dataIndex: 'standard_value', key: 'standard_value', width: 80 },
  { title: '下限', dataIndex: 'lower_limit', key: 'lower_limit', width: 80 },
  { title: '单选项', dataIndex: 'single_options', key: 'single_options', width: 90 },
  { title: '多选项', dataIndex: 'multi_options', key: 'multi_options', width: 90 },
  { title: '合格项', dataIndex: 'qualified_options', key: 'qualified_options', width: 90 },
  { title: '默认值', dataIndex: 'default_value', key: 'default_value', width: 80 },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const }
]

const fmtNum = (v: any) => {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  return isNaN(n) ? v : String(parseFloat(n.toFixed(4)))
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveQualityCharacteristic(record.char_name)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消质量特性「${(record.char_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawQualityCharacteristic(record.char_name)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

const handleEditOk = async () => {
  try { await updateQualityCharacteristic(editForm.char_name, editForm); message.success('更新成功'); editModalVisible.value = false; fetchData() }
  catch { message.error('更新失败') }
}

const handleCreateOk = async () => {
  if (!createForm.char_name) { message.warning('请输入质量特性名称'); return }
  try {
    await createQualityCharacteristic(createForm)
    message.success('创建成功')
    createModalVisible.value = false
    Object.assign(createForm, emptyForm())
    fetchData()
  } catch { message.error('创建失败') }
}

const handleExport = async () => {
  try {
    const res = await exportQualityCharacteristics()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('quality_characteristics')
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
    await importQualityCharacteristics(formData)
    message.success('导入成功'); fetchData()
  } catch { message.error('导入失败') }
  finally { target.value = '' }
}

// 数据类型切换时清空计量型字段
watch(() => createForm.data_type, (val) => {
  if (val !== '计量型') { createForm.upper_limit = null; createForm.standard_value = null; createForm.lower_limit = null }
})
watch(() => editForm.data_type, (val) => {
  if (val !== '计量型') { editForm.upper_limit = null; editForm.standard_value = null; editForm.lower_limit = null }
})

onMounted(() => { fetchData() })
</script>

<template>
  <div>
    <a-card title="质量特性管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索质量特性" style="width: 200px" @search="handleSearch" />
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button @click="handleImportClick"><template #icon><UploadOutlined /></template>导入</a-button>
          <a-button type="primary" @click="createModalVisible = true"><template #icon><PlusOutlined /></template>新建</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>

      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :row-selection="rowSelection" row-key="char_name" :pagination="pagination" :scroll="{ x: 1400, y: 'calc(100vh - 280px)' }" @change="handleTableChange">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">{{ (pagination.current - 1) * pagination.pageSize + index + 1 }}</template>
          <template v-else-if="column.key === 'upper_limit'">{{ fmtNum(record.upper_limit) }}</template>
          <template v-else-if="column.key === 'standard_value'">{{ fmtNum(record.standard_value) }}</template>
          <template v-else-if="column.key === 'lower_limit'">{{ fmtNum(record.lower_limit) }}</template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="(record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (record.approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleEdit(record)">修改</a-button>
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

    <!-- 编辑模态框 -->
    <a-modal v-model:open="editModalVisible" title="编辑质量特性" @ok="handleEditOk" okText="确认" cancelText="取消" width="680px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="质量特性"><a-input v-model:value="editForm.char_name" disabled /></a-form-item>
        <a-form-item label="数据类型">
          <a-select v-model:value="editForm.data_type" placeholder="选择数据类型" allow-clear>
            <a-select-option value="文本型">文本型</a-select-option>
            <a-select-option value="计量型">计量型</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="检验要求"><a-input v-model:value="editForm.inspect_requirement" /></a-form-item>
        <a-form-item label="允许输入多项">
          <a-select v-model:value="editForm.allow_multiple" allow-clear>
            <a-select-option value="是">是</a-select-option>
            <a-select-option value="否">否</a-select-option>
          </a-select>
        </a-form-item>
        <template v-if="editForm.data_type === '计量型'">
          <a-form-item label="上限"><a-input-number v-model:value="editForm.upper_limit" style="width: 100%" :precision="4" /></a-form-item>
          <a-form-item label="标准值"><a-input-number v-model:value="editForm.standard_value" style="width: 100%" :precision="4" /></a-form-item>
          <a-form-item label="下限"><a-input-number v-model:value="editForm.lower_limit" style="width: 100%" :precision="4" /></a-form-item>
        </template>
        <a-form-item label="单选项"><a-input v-model:value="editForm.single_options" /></a-form-item>
        <a-form-item label="多选项"><a-input v-model:value="editForm.multi_options" /></a-form-item>
        <a-form-item label="合格项"><a-input v-model:value="editForm.qualified_options" /></a-form-item>
        <a-form-item label="默认值"><a-input v-model:value="editForm.default_value" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建模态框 -->
    <a-modal v-model:open="createModalVisible" title="新建质量特性" @ok="handleCreateOk" okText="确认" cancelText="取消" width="680px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="质量特性" required><a-input v-model:value="createForm.char_name" placeholder="请输入质量特性名称" /></a-form-item>
        <a-form-item label="数据类型">
          <a-select v-model:value="createForm.data_type" placeholder="选择数据类型" allow-clear>
            <a-select-option value="文本型">文本型</a-select-option>
            <a-select-option value="计量型">计量型</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="检验要求"><a-input v-model:value="createForm.inspect_requirement" placeholder="请输入检验要求" /></a-form-item>
        <a-form-item label="允许输入多项">
          <a-select v-model:value="createForm.allow_multiple" allow-clear>
            <a-select-option value="是">是</a-select-option>
            <a-select-option value="否">否</a-select-option>
          </a-select>
        </a-form-item>
        <template v-if="createForm.data_type === '计量型'">
          <a-form-item label="上限"><a-input-number v-model:value="createForm.upper_limit" style="width: 100%" :precision="4" placeholder="请输入上限" /></a-form-item>
          <a-form-item label="标准值"><a-input-number v-model:value="createForm.standard_value" style="width: 100%" :precision="4" placeholder="请输入标准值" /></a-form-item>
          <a-form-item label="下限"><a-input-number v-model:value="createForm.lower_limit" style="width: 100%" :precision="4" placeholder="请输入下限" /></a-form-item>
        </template>
        <a-form-item label="单选项"><a-input v-model:value="createForm.single_options" placeholder="请输入单选项" /></a-form-item>
        <a-form-item label="多选项"><a-input v-model:value="createForm.multi_options" placeholder="请输入多选项" /></a-form-item>
        <a-form-item label="合格项"><a-input v-model:value="createForm.qualified_options" placeholder="请输入合格项" /></a-form-item>
        <a-form-item label="默认值"><a-input v-model:value="createForm.default_value" placeholder="请输入默认值" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
</style>
