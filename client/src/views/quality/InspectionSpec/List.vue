<template>
  <div>
    <a-card :bordered="false" :body-style="{ padding: '0 12px 8px' }">
      <a-tabs v-model:activeKey="pageTab" size="small">
        <!-- ========== Tab 1: 检验规范 ========== -->
        <a-tab-pane key="header" :tab="pageTitle">
          <div class="tab-toolbar">
            <div></div>
            <a-space>
              <a-input-search v-model:value="searchText" placeholder="搜索规范名/缺陷分类" style="width: 220px" @search="handleSearch" allowClear @change="(e: any) => { if (!e.target.value) handleSearch() }" />
              <a-button @click="handleReset"><ReloadOutlined />重置</a-button>
              <a-button @click="handleExport"><DownloadOutlined />导出</a-button>
              <a-button type="primary" @click="openCreateModal"><PlusOutlined />新建</a-button>
            </a-space>
          </div>

          <a-table
            :columns="headerColumns"
            :data-source="headerData"
            :loading="headerLoading"
            row-key="spec_name"
            :pagination="headerPagination"
            :scroll="{ y: 'calc(72vh - 200px)' }"
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
        </a-tab-pane>

        <!-- ========== Tab 2: 检验规范明细 ========== -->
        <a-tab-pane key="detail">
          <template #tab>
            <span>检验规范明细</span>
            <a-tag v-if="selectedSpecName" color="blue" style="margin-left: 8px">{{ selectedSpecName }}</a-tag>
          </template>
          <div v-if="!selectedSpecName" style="text-align: center; padding: 40px 0; color: #aaa;">
            <a-empty description="请在「检验规范」页签中点击一行以查看明细" />
          </div>
          <template v-else>
            <div class="tab-toolbar">
              <div>
                <a-tag v-if="selectedSpecApproved" color="orange" style="font-size: 12px;">只读（已审核）</a-tag>
              </div>
              <a-space>
                <a-button @click="pageTab = 'header'">返回主表</a-button>
                <a-button type="primary" size="small" :disabled="selectedSpecApproved" @click="openCreateItemModal"><PlusOutlined />新增明细</a-button>
              </a-space>
            </div>

            <a-table
              :columns="detailColumns"
              :data-source="detailData"
              :loading="detailLoading"
              row-key="id"
              :pagination="false"
              :scroll="{ x: 1600, y: 'calc(72vh - 240px)' }"
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
                  <a-space v-if="!selectedSpecApproved">
                    <a-button type="link" size="small" @click="handleEditItem(record)"><EditOutlined />编辑</a-button>
                    <a-button type="link" danger size="small" @click="handleDeleteItem(record)"><DeleteOutlined />删除</a-button>
                  </a-space>
                  <span v-else style="color: #999; font-size: 12px">已审核</span>
                </template>
              </template>
            </a-table>
          </template>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <!-- 主表 新建/编辑 Modal -->
    <a-modal v-model:open="specModalVisible" :title="specModalMode === 'create' ? '新建检验规范' : '编辑检验规范'" @ok="handleSpecOk" okText="确认" cancelText="取消" width="500px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="检验规范名" required>
          <a-input v-model:value="specForm.spec_name" :disabled="specModalMode === 'edit'" placeholder="请输入检验规范名" />
        </a-form-item>
        <a-form-item label="缺陷分类">
          <a-select
            v-model:value="specForm.defect_categories"
            mode="multiple"
            :options="defectClassOptions"
            :filter-option="filterDefectClassOption"
            placeholder="请选择缺陷分类（可多选）"
            allowClear
            style="width: 100%"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 明细 新建/编辑 Modal -->
    <a-modal v-model:open="itemModalVisible" :title="itemModalMode === 'create' ? '新增明细' : '编辑明细'" @ok="handleItemOk" okText="确认" cancelText="取消" width="720px">
      <a-form :label-col="{ span: 7 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="质量特性" required>
              <a-select
                v-model:value="itemForm.char_name"
                show-search
                :options="charOptions"
                :filter-option="filterCharOption"
                placeholder="请输入质量特性搜索"
                @change="onCharNameChange"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="分类">
              <a-select
                v-model:value="itemForm.char_category"
                show-search
                :options="defectClassOptions"
                :filter-option="filterDefectClassOption"
                placeholder="请输入分类搜索"
                allowClear
              />
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
import { ref, reactive, computed, onMounted, watch, createVNode } from 'vue'
import { useRoute } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, DownloadOutlined, PlusOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, DownOutlined } from '@ant-design/icons-vue'
import {
  getInspectionSpecs,
  getInspectionSpecItems,
  createInspectionSpec,
  updateInspectionSpec,
  deleteInspectionSpec,
  exportInspectionSpecs,
  addInspectionSpecItem,
  updateInspectionSpecItem,
  deleteInspectionSpecItem,
  approveInspectionSpec,
  withdrawInspectionSpec
} from '@/api/quality/inspectionSpec'
import { getQualityCharacteristics } from '@/api/quality/qualityCharacteristic'
import { getDefectClasses } from '@/api/quality/defectClass'
import { useTableList } from '@/composables/useTableList'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

// ===== 路由类型 =====
const route = useRoute()
const specType = computed(() => (route.meta.specType as string) || '')
const pageTitle = computed(() => specType.value === '生产' ? '生产检验规范' : specType.value === '来料' ? '来料检验规范' : '检验规范管理')

// ===== 主表 =====
const { loading: headerLoading, dataSource: headerData, searchText, pagination: headerPagination, fetchData: fetchList, handleTableChange: handleHeaderTableChange, handleSearch, handleReset } = useTableList(getInspectionSpecs)

// Override fetchHeaderList to pass spec_type
const fetchHeaderList = () => fetchList({ spec_type: specType.value })

const selectedSpecName = ref<string | null>(null)
const selectedSpecApproved = ref(false)
const pageTab = ref('header')

const handleSelectSpec = (record: any) => {
  selectedSpecName.value = record.spec_name
  selectedSpecApproved.value = (record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED
  fetchDetailList(record.spec_name)
  pageTab.value = 'detail'
}

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
    const res: any = await getInspectionSpecItems(specName)
    detailData.value = res.data
  } catch { message.error('获取明细列表失败') } finally { detailLoading.value = false }
}

const fmtNum = (v: any) => (v != null && v !== '' ? Number(v) : '')

// ===== 质量特性下拉选项 =====
const charList = ref<any[]>([])
const charOptions = computed(() => charList.value.map((c: any) => ({ label: c.char_name, value: c.char_name })))

const filterCharOption = (input: string, option: any) => {
  return option.label?.toLowerCase().includes(input.toLowerCase())
}

const onCharNameChange = (val: string) => {
  const found = charList.value.find((c: any) => c.char_name === val)
  if (found) {
    itemForm.data_type = found.data_type || '文本型'
    itemForm.inspect_requirement = found.inspect_requirement || ''
    itemForm.allow_multiple = found.allow_multiple || '否'
    itemForm.upper_limit = found.upper_limit != null ? Number(found.upper_limit) : null
    itemForm.standard_value = found.standard_value != null ? Number(found.standard_value) : null
    itemForm.lower_limit = found.lower_limit != null ? Number(found.lower_limit) : null
    itemForm.default_value = found.default_value || ''
  }
}

const fetchCharList = async () => {
  try {
    const res: any = await getQualityCharacteristics({ limit: 9999 })
    charList.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

// ===== 缺陷分类下拉选项 =====
const defectClassList = ref<any[]>([])
const defectClassOptions = computed(() => defectClassList.value.map((d: any) => ({ label: d.defect_class_name, value: d.defect_class_name })))

const filterDefectClassOption = (input: string, option: any) => {
  return option.label?.toLowerCase().includes(input.toLowerCase())
}

const fetchDefectClassList = async () => {
  try {
    const res: any = await getDefectClasses({ limit: 9999 })
    defectClassList.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

// ===== 主表 Modal =====
const specModalVisible = ref(false)
const specModalMode = ref<'create' | 'edit'>('create')
const specForm = reactive({ spec_name: '', defect_categories: [] as string[] })

const openCreateModal = () => {
  specModalMode.value = 'create'
  specForm.spec_name = ''
  specForm.defect_categories = []
  specModalVisible.value = true
}

const handleEditSpec = (record: any) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  specModalMode.value = 'edit'
  specForm.spec_name = record.spec_name
  specForm.defect_categories = (record.defect_categories || '').split(';').filter((s: string) => s.trim())
  specModalVisible.value = true
}

const handleSpecOk = async () => {
  if (!specForm.spec_name) { message.warning('请输入检验规范名'); return }
  try {
    if (specModalMode.value === 'create') {
      await createInspectionSpec({ spec_name: specForm.spec_name, defect_categories: specForm.defect_categories.join(';'), spec_type: specType.value || '来料' })
      message.success('创建成功')
    } else {
      await updateInspectionSpec(specForm.spec_name, { defect_categories: specForm.defect_categories.join(';') })
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
    content: `确定要删除检验规范"${record.spec_name}"及其所有明细吗?`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        await deleteInspectionSpec(record.spec_name)
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
  if (selectedSpecApproved.value) {
    message.warning('主表已审核，明细不允许编辑，请先撤消审核')
    return
  }
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
      await addInspectionSpecItem(selectedSpecName.value!, itemForm)
      message.success('新增明细成功')
    } else {
      await updateInspectionSpecItem(itemEditingId.value!, itemForm)
      message.success('更新明细成功')
    }
    itemModalVisible.value = false
    fetchDetailList(selectedSpecName.value!)
  } catch { message.error('操作失败') }
}

const handleDeleteItem = (record: any) => {
  if (selectedSpecApproved.value) {
    message.warning('主表已审核，明细不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除明细"${record.char_name}"吗?`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        await deleteInspectionSpecItem(record.id)
        message.success('删除明细成功')
        fetchDetailList(selectedSpecName.value!)
      } catch { message.error('删除失败') }
    }
  })
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveInspectionSpec(record.spec_name)
    if (res.success) { message.success('审核成功'); fetchHeaderList(); if (selectedSpecName.value === record.spec_name) selectedSpecApproved.value = true }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消检验规范「${(record.spec_name || '').trim()}」的审核吗？`,
    okText: '确定', cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawInspectionSpec(record.spec_name)
        if (res.success) { message.success('已撤消审核'); fetchHeaderList(); if (selectedSpecName.value === record.spec_name) selectedSpecApproved.value = false }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

// ===== 导出 =====
const handleExport = async () => {
  try {
    const res: any = await exportInspectionSpecs()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('inspection_specs')
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

onMounted(() => { fetchHeaderList(); fetchCharList(); fetchDefectClassList() })

// 路由切换时（同组件不同 specType）重新加载数据
watch(specType, () => {
  headerPagination.current = 1
  selectedSpecName.value = null
  detailData.value = []
  fetchHeaderList()
})
</script>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
:deep(.ant-table-row) { cursor: pointer; }
:deep(.ant-table-row-selected) td { background-color: #e6f7ff !important; }
.tab-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}
</style>
