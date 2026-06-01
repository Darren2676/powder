<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined, SaveOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { useRouter, useRoute } from 'vue-router'
import { getProcessParameterDetail, createProcessParameter, updateProcessParameter } from '@/api/master-data/processParameter'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval } from '@/api/system/approval'
import request from '@/utils/request'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { getAllPlasticPowderParameters } from '@/api/master-data/plasticPowderParameter'
import { getAllPlasticProcessCategories } from '@/api/master-data/plasticProcessCategory'

const router = useRouter()
const route = useRoute()
const id = route.params.id as string
const isNew = id === 'new'

const loading = ref(false)
const saving = ref(false)

// 标准工序模糊搜索（工序号字段使用）
const procedureSearchOptions = ref<any[]>([])
const procedureSearchLoading = ref(false)

const handleProcedureSearch = async (searchValue: string) => {
  if (!searchValue || searchValue.length < 1) { procedureSearchOptions.value = []; return }
  procedureSearchLoading.value = true
  try {
    const res: any = await request({ url: '/procedures', method: 'GET', params: { search: searchValue, page: 1, limit: 20 } })
    if (res.success) procedureSearchOptions.value = res.data?.items || []
  } catch { /* ignore */ }
  procedureSearchLoading.value = false
}

const handleProcedureSelect = (value: string, record: any) => {
  // 选中标准工序编号后，自动带出工序名称
  const selected = procedureSearchOptions.value.find((p: any) => p.standard_process_number === value)
  if (selected) {
    record.step_name = selected.standard_process_name || ''
  }
}

interface ParamDetail {
  id?: number
  line_number: number
  step_number: string
  step_name: string
  param_name: string
  param_code: string
  process_category_code: string
  process_category_name: string
  param_value: string
  unit: string
  param_type: string
  min_value: string
  max_value: string
  is_required: string
  remark: string
}

const header = reactive({
  parameter_number: '',
  item_number: '',
  item_name: '',
  process_route_number: '',
  version: 1,
  description: '',
  approval_status: '草稿',
  remark: '',
})

const details = ref<ParamDetail[]>([])

const isReadonly = computed(() => header.approval_status !== '草稿')

// 物料搜索弹窗
const itemModalVisible = ref(false)
const itemSearch = ref('')
const itemSearchResults = ref<any[]>([])
const itemSearchLoading = ref(false)

const handleItemSearch = async () => {
  if (!itemSearch.value) return
  itemSearchLoading.value = true
  try {
    const res: any = await request({ url: '/item-masters', method: 'GET', params: { search: itemSearch.value, page: 1, limit: 20 } })
    if (res.success) itemSearchResults.value = res.data?.items || []
  } catch { /* ignore */ }
  itemSearchLoading.value = false
}

const handleItemSelect = (record: any) => {
  header.item_number = record.item_number
  header.item_name = record.item_name
  itemModalVisible.value = false
}

// 工艺路线搜索弹窗（与产品编号选择相同模式）
const routeModalVisible = ref(false)
const routeSearch = ref('')
const routeSearchResults = ref<any[]>([])
const routeSearchLoading = ref(false)

const handleRouteSearch = async () => {
  if (!routeSearch.value) return
  routeSearchLoading.value = true
  try {
    const res: any = await request({ url: '/routing-masters', method: 'GET', params: { search: routeSearch.value, page: 1, limit: 20 } })
    if (res.success) routeSearchResults.value = res.data?.items || []
  } catch { /* ignore */ }
  routeSearchLoading.value = false
}

const handleRouteSelect = (record: any) => {
  header.process_route_number = record.process_route_number
  routeModalVisible.value = false
}

const handleRouteClear = () => {
  header.process_route_number = ''
}

// 工艺分类下拉选项
const categoryOptions = ref<any[]>([])

const loadCategoryOptions = async () => {
  try {
    const res: any = await getAllPlasticProcessCategories()
    if (res.success) categoryOptions.value = res.data || []
  } catch { /* ignore */ }
}

const handleCategorySelect = (value: string, record: any) => {
  const selected = categoryOptions.value.find((c: any) => c.category_code === value)
  if (selected) {
    record.process_category_code = selected.category_code
    record.process_category_name = selected.category_name
  }
}

// 塑粉参数下拉选项（关联参数编码、参数名称、单位）
const powderParamOptions = ref<any[]>([])

const loadPowderParamOptions = async () => {
  try {
    const res: any = await getAllPlasticPowderParameters()
    if (res.success) powderParamOptions.value = res.data || []
  } catch { /* ignore */ }
}

const handlePowderParamSelect = (value: string, record: any) => {
  const selected = powderParamOptions.value.find((p: any) => p.param_code === value)
  if (selected) {
    record.param_code = selected.param_code
    record.param_name = selected.param_name
    record.unit = selected.unit || ''
  }
}

// 单位下拉选择（关联单位管理）
const unitOptions = ref<any[]>([])

const loadUnitOptions = async () => {
  try {
    const res: any = await request({ url: '/units/all', method: 'GET' })
    if (res.success) unitOptions.value = res.data || []
  } catch { /* ignore */ }
}

// 明细操作
const addDetailRow = () => {
  details.value.push({
    line_number: (details.value.length + 1) * 10,
    step_number: '', step_name: '', param_name: '', param_code: '',
    process_category_code: '', process_category_name: '',
    param_value: '', unit: '', param_type: '输入',
    min_value: '', max_value: '', is_required: 'Y', remark: '',
  })
}

const removeDetailRows = () => {
  details.value = details.value.filter(d => !selectedDetailKeys.value.includes(d))
}

const selectedDetailKeys = ref<ParamDetail[]>([])
const detailRowSelection = computed(() => ({
  selectedRowKeys: selectedDetailKeys.value,
  onChange: (keys: ParamDetail[]) => { selectedDetailKeys.value = keys },
}))

const defaultDetailDataColumns: any[] = [
  { title: '工序号(标准工序)', dataIndex: 'step_number', key: 'step_number', width: 150, resizable: true },
  { title: '工序名称', dataIndex: 'step_name', key: 'step_name', width: 120, resizable: true },
  { title: '参数名称', dataIndex: 'param_name', key: 'param_name', width: 140, resizable: true },
  { title: '参数编码', dataIndex: 'param_code', key: 'param_code', width: 120, resizable: true },
  { title: '工艺分类编码', dataIndex: 'process_category_code', key: 'process_category_code', width: 120, resizable: true },
  { title: '工艺分类名称', dataIndex: 'process_category_name', key: 'process_category_name', width: 120, resizable: true },
  { title: '参数值', dataIndex: 'param_value', key: 'param_value', width: 120, resizable: true },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 100, resizable: true },
  { title: '参数类型', dataIndex: 'param_type', key: 'param_type', width: 90, resizable: true },
  { title: '最小值', dataIndex: 'min_value', key: 'min_value', width: 80, resizable: true },
  { title: '最大值', dataIndex: 'max_value', key: 'max_value', width: 80, resizable: true },
  { title: '必填', dataIndex: 'is_required', key: 'is_required', width: 60, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, resizable: true },
]

const {
  columns: detailColumns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('process_parameter_detail', defaultDetailDataColumns, {
  fixedLeft: [{ title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60, fixed: 'left' as const }],
  fixedRight: []
})

// 加载数据
const loadData = async () => {
  if (isNew) return
  loading.value = true
  try {
    const res: any = await getProcessParameterDetail(id)
    if (res.success) {
      Object.assign(header, res.data.header)
      details.value = res.data.details || []
    }
  } catch { message.error('加载数据失败') }
  loading.value = false
}

// 保存
const handleSave = async () => {
  if (!header.item_number) { message.warning('请选择产品'); return }
  saving.value = true
  try {
    const payload = { ...header, details: details.value }
    let res: any
    if (isNew) {
      res = await createProcessParameter(payload)
    } else {
      res = await updateProcessParameter(id, payload)
    }
    if (res.success) {
      message.success('保存成功')
      if (isNew && res.data?.parameter_number) {
        router.replace({ name: 'ProcessParameterDetail', params: { id: res.data.parameter_number } })
      } else {
        loadData()
      }
    } else { message.error(res.message || '保存失败') }
  } catch { message.error('保存失败') }
  saving.value = false
}

// 审批
const handleSubmitApproval = async () => {
  try {
    const res: any = await submitForApproval('process_parameter_header', header.parameter_number)
    if (res.success) { message.success('提交审批成功'); loadData() }
    else { message.error(res.message || '提交失败') }
  } catch { message.error('提交审批失败') }
}

const handleApprove = async () => {
  try {
    const res: any = await approveRecord('process_parameter_header', header.parameter_number)
    if (res.success) { message.success('审批通过'); loadData() }
    else { message.error(res.message || '审批失败') }
  } catch { message.error('审批失败') }
}

const handleWithdraw = async () => {
  try {
    const res: any = await withdrawApproval('process_parameter_header', header.parameter_number)
    if (res.success) { message.success('已撤回'); loadData() }
    else { message.error(res.message || '撤回失败') }
  } catch { message.error('撤回失败') }
}

const handleReverse = async () => {
  try {
    const res: any = await reverseApproval('process_parameter_header', header.parameter_number)
    if (res.success) { message.success('反审成功'); loadData() }
    else { message.error(res.message || '反审失败') }
  } catch { message.error('反审失败') }
}

onMounted(() => { loadColumnPreference(); loadData(); loadUnitOptions(); loadPowderParamOptions(); loadCategoryOptions() })
</script>

<template>
  <div style="padding: 0;">
    <a-card :bordered="false" :body-style="{ padding: '16px' }">
      <!-- 顶部操作栏 -->
      <div style="display: flex; align-items: center; margin-bottom: 16px;">
        <a-button @click="router.push({ name: 'ProcessParameterList' })"><template #icon><ArrowLeftOutlined /></template>返回</a-button>
        <span style="font-size: 18px; font-weight: 600; margin-left: 12px; white-space: nowrap;">工艺参数详情</span>
        <span v-if="header.parameter_number" style="font-size: 14px; color: #999; margin-left: 8px;">{{ header.parameter_number }}</span>
        <div style="flex: 1;" />
        <a-space v-if="header.approval_status === '草稿'">
          <a-button type="primary" :loading="saving" @click="handleSave"><template #icon><SaveOutlined /></template>保存</a-button>
          <a-button @click="handleSubmitApproval">提交审批</a-button>
        </a-space>
        <a-space v-else-if="header.approval_status === '待审批'">
          <a-button @click="handleApprove">审批通过</a-button>
          <a-button @click="handleWithdraw">撤回</a-button>
        </a-space>
        <a-space v-else-if="header.approval_status === '已审批'">
          <a-button @click="handleReverse">反审</a-button>
        </a-space>
      </div>

      <a-spin :spinning="loading">
        <!-- 主表信息 -->
        <a-descriptions bordered :column="2" size="small" style="margin-bottom: 20px;">
          <a-descriptions-item label="参数编号">{{ header.parameter_number || '(自动生成)' }}</a-descriptions-item>
          <a-descriptions-item label="版本">{{ header.version }}</a-descriptions-item>
          <a-descriptions-item label="产品编号">
            <div v-if="isReadonly">{{ header.item_number }}</div>
            <div v-else style="display: flex; gap: 4px; align-items: center;">
              <a-input :value="header.item_number" readonly style="flex:1;" />
              <a-button size="small" @click="itemModalVisible = true">选择</a-button>
            </div>
          </a-descriptions-item>
          <a-descriptions-item label="产品名称">{{ header.item_name }}</a-descriptions-item>
          <a-descriptions-item label="工艺路线编号">
            <div v-if="isReadonly">
              <span v-if="header.process_route_number">{{ header.process_route_number }}</span>
              <a-tag v-else color="blue">产品级默认</a-tag>
            </div>
            <div v-else style="display: flex; gap: 4px; align-items: center;">
              <a-input :value="header.process_route_number || ''" readonly placeholder="留空=产品级默认" style="flex:1;" />
              <a-button size="small" @click="routeModalVisible = true">选择</a-button>
              <a-button v-if="header.process_route_number" size="small" @click="handleRouteClear">清除</a-button>
            </div>
          </a-descriptions-item>
          <a-descriptions-item label="审批状态">{{ header.approval_status }}</a-descriptions-item>
          <a-descriptions-item label="说明" :span="2">
            <a-textarea v-if="!isReadonly" v-model:value="header.description" :rows="2" />
            <span v-else>{{ header.description }}</span>
          </a-descriptions-item>
          <a-descriptions-item label="备注" :span="2">
            <a-textarea v-if="!isReadonly" v-model:value="header.remark" :rows="2" />
            <span v-else>{{ header.remark }}</span>
          </a-descriptions-item>
        </a-descriptions>

        <!-- 明细表 -->
        <div style="margin-bottom: 8px; display: flex; align-items: center;">
          <span style="font-weight: 600; font-size: 14px;">参数明细</span>
          <div style="flex: 1;" />
          <a-button @click="openColumnSetting" style="margin-right: 8px;"><template #icon><SettingOutlined /></template>列设置</a-button>
          <a-button v-if="!isReadonly" size="small" @click="addDetailRow" style="margin-right: 8px;"><template #icon><PlusOutlined /></template>新增行</a-button>
          <a-button v-if="!isReadonly" size="small" :disabled="!selectedDetailKeys.length" @click="removeDetailRows"><template #icon><DeleteOutlined /></template>删除行</a-button>
        </div>
        <a-table
          :columns="detailColumns"
          :data-source="details"
          :pagination="false"
          :scroll="{ x: 'max-content', y: 400 }"
          :row-selection="isReadonly ? undefined : detailRowSelection"
          row-key="line_number"
          size="small"
          bordered
          @resizeColumn="handleResizeColumn"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="!isReadonly">
              <template v-if="column.key === 'step_number'">
                <a-auto-complete
                  v-model:value="record.step_number"
                  :options="procedureSearchOptions.map((p: any) => ({ value: p.standard_process_number, label: `${p.standard_process_number} - ${p.standard_process_name || ''}` }))"
                  placeholder="输入/搜索工序号"
                  :filter-option="false"
                  @search="handleProcedureSearch"
                  @select="(value: string) => handleProcedureSelect(value, record)"
                  size="small"
                  style="width: 100%;"
                />
              </template>
              <template v-else-if="column.key === 'step_name'">
                <a-input v-model:value="record.step_name" size="small" />
              </template>
              <template v-else-if="column.key === 'param_name'">
                <a-input v-model:value="record.param_name" size="small" />
              </template>
              <template v-else-if="column.key === 'param_code'">
                <a-select
                  v-model:value="record.param_code"
                  placeholder="选择参数编码"
                  allow-clear
                  size="small"
                  style="width: 100%;"
                  show-search
                  :filter-option="(input: string, option: any) => option.key?.toLowerCase().includes(input.toLowerCase())"
                  option-label-prop="label"
                  @select="(value: string) => handlePowderParamSelect(value, record)"
                >
                  <a-select-option v-for="p in powderParamOptions" :key="p.param_code + '-' + p.param_name" :value="p.param_code" :label="p.param_code">
                    {{ p.param_code }} - {{ p.param_name }}
                  </a-select-option>
                </a-select>
              </template>
              <template v-else-if="column.key === 'process_category_code'">
                <a-select
                  v-model:value="record.process_category_code"
                  placeholder="选择分类"
                  allow-clear
                  size="small"
                  style="width: 100%;"
                  show-search
                  :filter-option="(input: string, option: any) => option.key?.toLowerCase().includes(input.toLowerCase())"
                  option-label-prop="label"
                  @select="(value: string) => handleCategorySelect(value, record)"
                >
                  <a-select-option v-for="c in categoryOptions" :key="c.category_code + '-' + c.category_name" :value="c.category_code" :label="c.category_code">
                    {{ c.category_code }} - {{ c.category_name }}
                  </a-select-option>
                </a-select>
              </template>
              <template v-else-if="column.key === 'process_category_name'">
                <span>{{ record.process_category_name }}</span>
              </template>
              <template v-else-if="column.key === 'param_value'">
                <a-input v-model:value="record.param_value" size="small" />
              </template>
              <template v-else-if="column.key === 'unit'">
                <a-select v-model:value="record.unit" placeholder="选择单位" allow-clear size="small" style="width: 100%;">
                  <a-select-option v-for="u in unitOptions" :key="u.unit_code" :value="u.unit_code">
                    {{ u.unit_code }} - {{ u.unit_name }}
                  </a-select-option>
                </a-select>
              </template>
              <template v-else-if="column.key === 'param_type'">
                <a-select v-model:value="record.param_type" size="small" style="width: 100%;">
                  <a-select-option value="输入">输入</a-select-option>
                  <a-select-option value="输出">输出</a-select-option>
                  <a-select-option value="约束">约束</a-select-option>
                </a-select>
              </template>
              <template v-else-if="column.key === 'min_value'">
                <a-input v-model:value="record.min_value" size="small" />
              </template>
              <template v-else-if="column.key === 'max_value'">
                <a-input v-model:value="record.max_value" size="small" />
              </template>
              <template v-else-if="column.key === 'is_required'">
                <a-select v-model:value="record.is_required" size="small" style="width: 60px;">
                  <a-select-option value="Y">Y</a-select-option>
                  <a-select-option value="N">N</a-select-option>
                </a-select>
              </template>
              <template v-else-if="column.key === 'remark'">
                <a-input v-model:value="record.remark" size="small" />
              </template>
            </template>
            <template v-else>
              <template v-if="column.key === 'process_category_name'">
                <span>{{ record.process_category_name }}</span>
              </template>
              <template v-else-if="column.key === 'param_type'">
                <a-tag :color="record.param_type === '输入' ? 'blue' : record.param_type === '输出' ? 'green' : 'orange'">{{ record.param_type }}</a-tag>
              </template>
              <template v-else-if="column.key === 'is_required'">
                <a-tag :color="record.is_required === 'Y' ? 'red' : 'default'">{{ record.is_required === 'Y' ? '是' : '否' }}</a-tag>
              </template>
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-card>

  <!-- 物料搜索弹窗 -->
    <a-modal v-model:open="itemModalVisible" title="选择产品" width="700px" @ok="itemModalVisible = false">
      <a-input-search v-model:value="itemSearch" placeholder="搜索产品编号/名称" @search="handleItemSearch" style="margin-bottom: 12px;" />
      <a-table :columns="[{ title: '产品编号', dataIndex: 'item_number' }, { title: '产品名称', dataIndex: 'item_name' }, { title: '规格', dataIndex: 'specifications' }]"
        :data-source="itemSearchResults" :loading="itemSearchLoading" :pagination="false" row-key="item_number" size="small"
        :customRow="(record: any) => ({ onClick: () => handleItemSelect(record), style: 'cursor: pointer;' })"
      />
    </a-modal>

    <!-- 工艺路线搜索弹窗 -->
    <a-modal v-model:open="routeModalVisible" title="选择工艺路线" width="750px" @ok="routeModalVisible = false">
      <a-input-search v-model:value="routeSearch" placeholder="搜索工艺路线编号/名称/产品编号" @search="handleRouteSearch" style="margin-bottom: 12px;" />
      <a-table :columns="[{ title: '工艺路线编号', dataIndex: 'process_route_number', width: 160 }, { title: '工艺路线名称', dataIndex: 'process_route_name', width: 140 }, { title: '产品编号', dataIndex: 'item_number', width: 120 }, { title: '产品名称', dataIndex: 'item_name', width: 120 }, { title: '状态', dataIndex: 'condition', width: 80 }]"
        :data-source="routeSearchResults" :loading="routeSearchLoading" :pagination="false" row-key="process_route_number" size="small"
        :customRow="(record: any) => ({ onClick: () => handleRouteSelect(record), style: 'cursor: pointer;' })"
      />
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
