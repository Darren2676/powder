<template>
  <div>
    <!-- 上部: 主表 -->
    <a-card title="来料检验规范" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索规范名/缺陷分类" style="width: 220px" @search="handleSearch" allowClear @change="(e: any) => { if (!e.target.value) handleSearch() }" />
          <a-button @click="handleReset"><ReloadOutlined />重置</a-button>
          <a-button @click="handleExport"><DownloadOutlined />导出</a-button>
          <a-button type="primary" @click="openCreateModal"><PlusOutlined />新建</a-button>
        </a-space>
      </template>

      <a-table
        :columns="headerColumns"
        :data-source="headerData"
        :loading="headerLoading"
        row-key="spec_name"
        :pagination="headerPagination"
        :scroll="{ y: 'calc(38vh - 120px)' }"
        :row-class-name="(record: any) => record.spec_name === selectedSpecName ? 'ant-table-row-selected' : ''"
        :custom-row="(record: any) => ({ onClick: () => handleSelectSpec(record) })"
        @change="handleHeaderTableChange"
        size="small"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (headerPagination.current - 1) * headerPagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="(record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (record.approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click.stop="handleEditSpec(record)">编辑</a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>
                  更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="(record.approval_status || '').trim() !== APPROVAL_STATUS.APPROVED" @click="handleApprove(record)">审核</a-menu-item>
                    <a-menu-item v-else @click="handleWithdraw(record)">撤消</a-menu-item>
                    <a-menu-item @click="handleDeleteSpec(record)">删除</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 下部: 明细 -->
    <a-card :bordered="false" style="margin-top: 8px">
      <template #title>
        <span>来料检验规范明细</span>
        <a-tag v-if="selectedSpecName" color="blue" style="margin-left: 8px">{{ selectedSpecName }}</a-tag>
        <span v-else style="color: #999; font-size: 12px; margin-left: 8px">请选择上方检验规范</span>
      </template>
      <template #extra>
        <a-button type="primary" size="small" :disabled="!selectedSpecName" @click="openCreateItemModal"><PlusOutlined />新增明细</a-button>
      </template>

      <a-table
        :columns="detailColumns"
        :data-source="detailData"
        :loading="detailLoading"
        row-key="id"
        :pagination="false"
        :scroll="{ x: 1600, y: 'calc(42vh - 120px)' }"
        size="small"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">{{ index + 1 }}</template>
          <template v-else-if="column.key === 'upper_limit'">{{ fmtNum(record.upper_limit) }}</template>
          <template v-else-if="column.key === 'standard_value'">{{ fmtNum(record.standard_value) }}</template>
          <template v-else-if="column.key === 'lower_limit'">{{ fmtNum(record.lower_limit) }}</template>
          <template v-else-if="column.key === 'default_result'">
            <a-tag v-if="record.default_result === '合格'" color="green">合格</a-tag>
            <a-tag v-else-if="record.default_result === '不合格'" color="red">不合格</a-tag>
            <span v-else>{{ record.default_result }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleEditItem(record)"><EditOutlined />编辑</a-button>
              <a-button type="link" danger size="small" @click="handleDeleteItem(record)"><DeleteOutlined />删除</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 主表 新建/编辑 Modal -->
    <a-modal v-model:open="specModalVisible" :title="specModalMode === 'create' ? '新建来料检验规范' : '编辑来料检验规范'" @ok="handleSpecOk" okText="确认" cancelText="取消" width="500px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="检验规范名" required>
          <a-input v-model:value="specForm.spec_name" :disabled="specModalMode === 'edit'" placeholder="请输入检验规范名" />
        </a-form-item>
        <a-form-item label="缺陷分类">
          <a-input v-model:value="specForm.defect_categories" placeholder="多个用分号分隔，如: 尺寸;外观" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 明细 新建/编辑 Modal -->
    <a-modal v-model:open="itemModalVisible" :title="itemModalMode === 'create' ? '新增明细' : '编辑明细'" @ok="handleItemOk" okText="确认" cancelText="取消" width="720px">
      <a-form :label-col="{ span: 7 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="质量特性" required>
              <a-input v-model:value="itemForm.char_name" placeholder="请输入" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="分类">
              <a-input v-model:value="itemForm.char_category" placeholder="请输入" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="检验要求">
              <a-input v-model:value="itemForm.inspect_requirement" placeholder="请输入" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="数据类型">
              <a-select v-model:value="itemForm.data_type" placeholder="选择">
                <a-select-option value="文本型">文本型</a-select-option>
                <a-select-option value="计量型">计量型</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <template v-if="itemForm.data_type === '计量型'">
          <a-row :gutter="16">
            <a-col :span="8">
              <a-form-item label="上限" :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }">
                <a-input-number v-model:value="itemForm.upper_limit" style="width: 100%" :precision="4" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="标准值" :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }">
                <a-input-number v-model:value="itemForm.standard_value" style="width: 100%" :precision="4" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="下限" :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }">
                <a-input-number v-model:value="itemForm.lower_limit" style="width: 100%" :precision="4" />
              </a-form-item>
            </a-col>
          </a-row>
        </template>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="允许多项">
              <a-select v-model:value="itemForm.allow_multiple">
                <a-select-option value="否">否</a-select-option>
                <a-select-option value="是">是</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="默认结果">
              <a-select v-model:value="itemForm.default_result" allowClear placeholder="选择">
                <a-select-option value="合格">合格</a-select-option>
                <a-select-option value="不合格">不合格</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="默认值">
              <a-input v-model:value="itemForm.default_value" placeholder="请输入" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="必填">
              <a-select v-model:value="itemForm.is_required">
                <a-select-option value="是">是</a-select-option>
                <a-select-option value="否">否</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="必填范围">
              <a-input v-model:value="itemForm.required_range" placeholder="如: 仅次品必填" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="类型">
              <a-input v-model:value="itemForm.item_type" disabled />
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
import { ReloadOutlined, DownloadOutlined, PlusOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, DownOutlined } from '@ant-design/icons-vue'
import {
  getIncomingInspectSpecs,
  getIncomingInspectSpecItems,
  createIncomingInspectSpec,
  updateIncomingInspectSpec,
  deleteIncomingInspectSpec,
  exportIncomingInspectSpecs,
  addIncomingInspectSpecItem,
  updateIncomingInspectSpecItem,
  deleteIncomingInspectSpecItem,
  approveIncomingInspectSpec,
  withdrawIncomingInspectSpec
} from '@/api/quality/incomingInspectSpec'
import { useTableList } from '@/composables/useTableList'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'
const { loading: headerLoading, dataSource: headerData, searchText, pagination: headerPagination, fetchData: fetchHeaderList, handleTableChange: handleHeaderTableChange, handleSearch, handleReset } = useTableList(getIncomingInspectSpecs)

const selectedSpecName = ref<string | null>(null)

const headerColumns = [
  { title: '行号', key: 'rowIndex', width: 55 },
  { title: '检验规范名', dataIndex: 'spec_name', key: 'spec_name', width: 180 },
  { title: '缺陷分类', dataIndex: 'defect_categories', key: 'defect_categories', width: 200 },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 160 },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100 },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' as const }
]

// ===== 明细 =====
const detailLoading = ref(false)
const detailData = ref<any[]>([])

const detailColumns = [
  { title: '行号', key: 'rowIndex', width: 50 },
  { title: '类型', dataIndex: 'item_type', key: 'item_type', width: 80 },
  { title: '质量特性', dataIndex: 'char_name', key: 'char_name', width: 160 },
  { title: '分类', dataIndex: 'char_category', key: 'char_category', width: 80 },
  { title: '检验要求', dataIndex: 'inspect_requirement', key: 'inspect_requirement', width: 160 },
  { title: '数据类型', dataIndex: 'data_type', key: 'data_type', width: 80 },
  { title: '上限', dataIndex: 'upper_limit', key: 'upper_limit', width: 80, align: 'right' as const },
  { title: '标准值', dataIndex: 'standard_value', key: 'standard_value', width: 80, align: 'right' as const },
  { title: '下限', dataIndex: 'lower_limit', key: 'lower_limit', width: 80, align: 'right' as const },
  { title: '默认结果', dataIndex: 'default_result', key: 'default_result', width: 85 },
  { title: '默认值', dataIndex: 'default_value', key: 'default_value', width: 80 },
  { title: '必填', dataIndex: 'is_required', key: 'is_required', width: 55 },
  { title: '必填范围', dataIndex: 'required_range', key: 'required_range', width: 110 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' as const }
]

const fetchDetailList = async (specName: string) => {
  detailLoading.value = true
  try {
    const res: any = await getIncomingInspectSpecItems(specName)
    detailData.value = res.data
  } catch { message.error('获取明细列表失败') } finally { detailLoading.value = false }
}

const fmtNum = (v: any) => (v != null && v !== '' ? Number(v) : '')

// ===== 主表 Modal =====
const specModalVisible = ref(false)
const specModalMode = ref<'create' | 'edit'>('create')
const specForm = reactive({ spec_name: '', defect_categories: '' })

const openCreateModal = () => {
  specModalMode.value = 'create'
  specForm.spec_name = ''
  specForm.defect_categories = ''
  specModalVisible.value = true
}

const handleEditSpec = (record: any) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  specModalMode.value = 'edit'
  specForm.spec_name = record.spec_name
  specForm.defect_categories = record.defect_categories || ''
  specModalVisible.value = true
}

const handleSpecOk = async () => {
  if (!specForm.spec_name) { message.warning('请输入检验规范名'); return }
  try {
    if (specModalMode.value === 'create') {
      await createIncomingInspectSpec({ spec_name: specForm.spec_name, defect_categories: specForm.defect_categories })
      message.success('创建成功')
    } else {
      await updateIncomingInspectSpec(specForm.spec_name, { defect_categories: specForm.defect_categories })
      message.success('更新成功')
    }
    specModalVisible.value = false
    fetchHeaderList()
  } catch { message.error('操作失败') }
}

const handleDeleteSpec = (record: any) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除来料检验规范"${record.spec_name}"及其所有明细吗?`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        await deleteIncomingInspectSpec(record.spec_name)
        message.success('删除成功')
        if (selectedSpecName.value === record.spec_name) {
          selectedSpecName.value = null
          detailData.value = []
        }
        fetchHeaderList()
      } catch { message.error('删除失败') }
    }
  })
}

const handleApprove = async (record: any) => {
  try {
    const res: any = await approveIncomingInspectSpec(record.spec_name)
    if (res.success) { message.success('审核成功'); fetchHeaderList() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消来料检验规范「${(record.spec_name || '').trim()}」的审核吗？`,
    okText: '确定', cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawIncomingInspectSpec(record.spec_name)
        if (res.success) { message.success('已撤消审核'); fetchHeaderList() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

// ===== 明细 Modal =====
const itemModalVisible = ref(false)
const itemModalMode = ref<'create' | 'edit'>('create')
const itemEditingId = ref<number | null>(null)

const emptyItemForm = () => ({
  item_type: '质量特性', char_name: '', char_category: '', inspect_requirement: '',
  data_type: '文本型', allow_multiple: '否',
  upper_limit: null as number | null, standard_value: null as number | null, lower_limit: null as number | null,
  single_options: '', multi_options: '', qualified_options: '',
  default_result: '合格', default_value: '', is_required: '是', required_range: '仅次品必填'
})

const itemForm = reactive(emptyItemForm())

const openCreateItemModal = () => {
  itemModalMode.value = 'create'
  itemEditingId.value = null
  Object.assign(itemForm, emptyItemForm())
  itemModalVisible.value = true
}

const handleEditItem = (record: any) => {
  itemModalMode.value = 'edit'
  itemEditingId.value = record.id
  Object.assign(itemForm, {
    item_type: record.item_type || '质量特性',
    char_name: record.char_name || '',
    char_category: record.char_category || '',
    inspect_requirement: record.inspect_requirement || '',
    data_type: record.data_type || '文本型',
    allow_multiple: record.allow_multiple || '否',
    upper_limit: record.upper_limit != null ? Number(record.upper_limit) : null,
    standard_value: record.standard_value != null ? Number(record.standard_value) : null,
    lower_limit: record.lower_limit != null ? Number(record.lower_limit) : null,
    single_options: record.single_options || '',
    multi_options: record.multi_options || '',
    qualified_options: record.qualified_options || '',
    default_result: record.default_result || '',
    default_value: record.default_value || '',
    is_required: record.is_required || '否',
    required_range: record.required_range || ''
  })
  itemModalVisible.value = true
}

const handleItemOk = async () => {
  if (!itemForm.char_name) { message.warning('请输入质量特性名称'); return }
  try {
    if (itemModalMode.value === 'create') {
      await addIncomingInspectSpecItem(selectedSpecName.value!, itemForm)
      message.success('新增明细成功')
    } else {
      await updateIncomingInspectSpecItem(itemEditingId.value!, itemForm)
      message.success('更新明细成功')
    }
    itemModalVisible.value = false
    fetchDetailList(selectedSpecName.value!)
  } catch { message.error('操作失败') }
}

const handleDeleteItem = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除明细"${record.char_name}"吗?`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        await deleteIncomingInspectSpecItem(record.id)
        message.success('删除明细成功')
        fetchDetailList(selectedSpecName.value!)
      } catch { message.error('删除失败') }
    }
  })
}

// ===== 导出 =====
const handleExport = async () => {
  try {
    const res: any = await exportIncomingInspectSpecs()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('incoming_inspect_specs')
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

// ===== watch: 数据类型切换清空 =====
watch(() => itemForm.data_type, (val) => {
  if (val !== '计量型') {
    itemForm.upper_limit = null
    itemForm.standard_value = null
    itemForm.lower_limit = null
  }
})

onMounted(() => { fetchHeaderList() })
</script>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
:deep(.ant-table-row) { cursor: pointer; }
:deep(.ant-table-row-selected) td { background-color: #e6f7ff !important; }
</style>
