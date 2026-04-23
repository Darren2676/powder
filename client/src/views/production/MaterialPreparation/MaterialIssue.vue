<template>
  <div class="material-issue-page">
    <a-page-header title="按生产单备料清单备料" style="padding: 0; margin: 0;" />

    <!-- 顶部：搜索 + 生产单信息 -->
    <a-card :bordered="false" size="small" class="top-card">
      <a-row :gutter="12" align="middle">
        <a-col :span="8">
          <a-input-search
            ref="scanInputRef"
            v-model:value="orderInput"
            placeholder="扫码或输入生产单编号"
            enter-button="查询"
            :loading="loading"
            @search="handleSearch"
            size="small"
          />
        </a-col>
        <a-col :span="14">
          <template v-if="orderInfo">
            <span class="info-item"><b>{{ orderInfo.production_order_number }}</b></span>
            <a-divider type="vertical" />
            <span class="info-item">{{ orderInfo.item_number }}</span>
            <a-divider type="vertical" />
            <span class="info-item">{{ orderInfo.item_name }}</span>
            <a-divider type="vertical" />
            <span class="info-item">{{ orderInfo.specifications }}</span>
            <a-divider type="vertical" />
            <span class="info-item">计划: <b style="color:#1890ff;">{{ orderInfo.planned_quantity }}</b> {{ orderInfo.basic_unit }}</span>
            <a-tag v-if="orderInfo.plan_status" :color="orderInfo.plan_status === '已派发' ? 'green' : 'blue'" size="small" style="margin-left:4px;">{{ orderInfo.plan_status }}</a-tag>
          </template>
        </a-col>
        <a-col :span="2" style="text-align:right;">
          <a-button size="small" @click="handleReset"><ReloadOutlined /></a-button>
        </a-col>
      </a-row>
    </a-card>

    <!-- 备料单信息摘要 -->
    <a-card v-if="preparationHeader" :bordered="false" size="small" class="prep-card">
      <a-row :gutter="16" align="middle">
        <a-col :flex="'auto'">
          <a-space :size="12">
            <span class="info-item">备料单: <b>{{ preparationHeader.preparation_number }}</b></span>
            <span class="info-item">BOM: {{ preparationHeader.bom_number }} ({{ preparationHeader.bom_version }})</span>
            <span class="info-item">物料种类: <b>{{ preparationHeader.total_material_types }}</b></span>
            <a-tag :color="prepStatusColor">{{ preparationHeader.preparation_status }}</a-tag>
          </a-space>
        </a-col>
        <a-col>
          <a-space>
            <span v-if="previousIssues.length > 0" class="info-item" style="color:#888;">已领料 {{ previousIssues.length }} 次</span>
            <a-button type="primary" size="small" @click="openIssueModal">开始备料</a-button>
          </a-space>
        </a-col>
      </a-row>
    </a-card>

    <!-- 无数据提示 -->
    <a-card v-if="orderInfo && !preparationHeader && !loading" :bordered="false" size="small" style="margin-top:8px;text-align:center;">
      <a-alert message="该生产单尚未生成备料单，请先派发生产单" type="warning" show-icon />
    </a-card>

    <!-- 候选生产单选择弹窗 -->
    <a-modal
      v-model:open="candidateVisible"
      :width="900"
      :footer="null"
      destroy-on-close
    >
      <template #title>
        <span>请选择生产单</span>
        <a-button type="text" size="small" @click="openCandidateSetting" style="margin-left:8px;">
          <SettingOutlined />
        </a-button>
      </template>
      <a-table
        :columns="candidateCols"
        :data-source="candidateList"
        :pagination="false"
        :scroll="{ y: 400 }"
        size="small"
        row-key="production_order_number"
        :row-class-name="() => 'candidate-row'"
        :custom-row="(record: any) => ({ onClick: () => selectCandidate(record) })"
        @resizeColumn="handleCandidateResize"
      />
    </a-modal>

    <!-- 备料弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :width="1300"
      :footer="null"
      :mask-closable="false"
      destroy-on-close
    >
      <template #title>
        <span>按生产单备料清单备料 - {{ preparationHeader?.preparation_number || '' }}</span>
        <a-button type="text" size="small" @click="openDetailSetting" style="margin-left:8px;">
          <SettingOutlined />
        </a-button>
      </template>
      <!-- 头信息 -->
      <a-descriptions :column="4" bordered size="small" style="margin-bottom:12px;">
        <a-descriptions-item label="生产单编号">{{ orderInfo?.production_order_number }}</a-descriptions-item>
        <a-descriptions-item label="产品编号">{{ orderInfo?.item_number }}</a-descriptions-item>
        <a-descriptions-item label="产品名称">{{ orderInfo?.item_name }}</a-descriptions-item>
        <a-descriptions-item label="规格">{{ orderInfo?.specifications }}</a-descriptions-item>
        <a-descriptions-item label="计划数量">{{ orderInfo?.planned_quantity }} {{ orderInfo?.basic_unit }}</a-descriptions-item>
        <a-descriptions-item label="模具编号">{{ orderInfo?.mould_number || '-' }}</a-descriptions-item>
        <a-descriptions-item label="实际模腔">{{ orderInfo?.actual_cavity_count || '-' }}</a-descriptions-item>
        <a-descriptions-item label="实际模次">{{ orderInfo?.actual_hole_count || '-' }}</a-descriptions-item>
        <a-descriptions-item label="实际班产">{{ orderInfo?.actual_daily_output || '-' }}</a-descriptions-item>
        <a-descriptions-item label="成型件规格">{{ orderInfo?.formed_part_specifications || '-' }}</a-descriptions-item>
        <a-descriptions-item label="成型件单耗">{{ orderInfo?.formed_part_unit_consumption || '-' }}</a-descriptions-item>
        <a-descriptions-item label="BOM编号">{{ preparationHeader?.bom_number }}</a-descriptions-item>
        <a-descriptions-item label="BOM版本">{{ preparationHeader?.bom_version }}</a-descriptions-item>
        <a-descriptions-item label="备料状态">
          <a-tag :color="prepStatusColor">{{ preparationHeader?.preparation_status }}</a-tag>
        </a-descriptions-item>
      </a-descriptions>

      <!-- 备料明细表格 -->
      <a-table
        :columns="detailCols"
        :data-source="detailList"
        :pagination="false"
        :scroll="{ y: 400 }"
        size="small"
        row-key="_uid"
        bordered
        @resizeColumn="handleDetailResize"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'remaining'">
            <span v-if="!record.is_added" :style="{ color: record.remaining_quantity <= 0 ? '#52c41a' : '#fa8c16', fontWeight: 600 }">
              {{ record.remaining_quantity }}
            </span>
            <span v-else style="color:#ccc;">-</span>
          </template>
          <template v-if="column.key === 'is_key_material'">
            <a-tag v-if="record.is_key_material === 1" color="red">是</a-tag>
            <span v-else>-</span>
          </template>
          <template v-if="column.key === 'input_actual_quantity'">
            <a-input-number
              v-model:value="record.input_actual_quantity"
              :min="0"
              size="small"
              placeholder="数量"
              style="width:100px;"
            />
          </template>
          <template v-if="column.key === 'input_batch_number'">
            <a-input
              v-model:value="record.input_batch_number"
              size="small"
              placeholder="批次号"
              style="width:130px;"
            />
          </template>
          <template v-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="addBatchRow(index)" style="padding:0;"><PlusOutlined /></a-button>
              <a-button v-if="record.is_added" type="link" size="small" danger @click="removeBatchRow(index)" style="padding:0;"><DeleteOutlined /></a-button>
            </a-space>
          </template>
        </template>
      </a-table>

      <!-- 底部操作 -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
        <a-space>
          <span style="font-size:12px;color:#888;">备注:</span>
          <a-input v-model:value="issueRemark" size="small" placeholder="本次领料备注" style="width:300px;" />
        </a-space>
        <a-space>
          <a-button size="small" @click="fillRemaining">填充未领量</a-button>
          <a-button size="small" @click="modalVisible = false">取消</a-button>
          <a-button type="primary" size="small" :loading="saving" :disabled="totalInputActual <= 0" @click="handleSave">
            保存领料 ({{ filledCount }} 项)
          </a-button>
        </a-space>
      </div>
    </a-modal>

    <!-- 候选表格列设置抽屉 -->
    <ColumnSettingDrawer
      :open="candidateSettingVisible"
      :setting-list="candidateSettingList"
      :saving="candidateSettingSaving"
      @update:open="candidateSettingVisible = $event"
      @moveUp="moveCandidateUp"
      @moveDown="moveCandidateDown"
      @save="saveCandidateSetting"
      @reset="resetCandidateSetting"
    />

    <!-- 明细表格列设置抽屉 -->
    <ColumnSettingDrawer
      :open="detailSettingVisible"
      :setting-list="detailSettingList"
      :saving="detailSettingSaving"
      @update:open="detailSettingVisible = $event"
      @moveUp="moveDetailUp"
      @moveDown="moveDetailDown"
      @save="saveDetailSetting"
      @reset="resetDetailSetting"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import { ReloadOutlined, PlusOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { queryByOrder, createMaterialIssue } from '@/api/production/materialIssue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'

interface DetailWithInput {
  _uid: number
  is_added?: boolean
  id: number
  preparation_number: string
  line_number: number
  material_number: string
  material_name: string
  material_type: string
  unit: string
  required_quantity: number
  adjusted_quantity: number
  issued_quantity: number
  remaining_quantity: number
  step_number: number | null
  work_center_name: string
  is_key_material: number
  default_warehouse: string
  bom_path: string
  remark: string
  input_actual_quantity: number | null
  input_batch_number: string
}

let uidSeq = 0

const scanInputRef = ref<any>(null)
const orderInput = ref('')
const loading = ref(false)
const saving = ref(false)
const modalVisible = ref(false)
const issueRemark = ref('')
const candidateVisible = ref(false)
const candidateList = ref<any[]>([])

const defaultCandidateColumns: any[] = [
  { title: '生产单编号', dataIndex: 'production_order_number', key: 'production_order_number', width: 160, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 140, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, resizable: true },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 90, resizable: true },
  { title: '状态', dataIndex: 'plan_status', key: 'plan_status', width: 80, resizable: true },
]

const {
  columns: candidateCols, columnSettingVisible: candidateSettingVisible,
  columnSettingList: candidateSettingList, columnSettingSaving: candidateSettingSaving,
  openColumnSetting: openCandidateSetting, moveColumnUp: moveCandidateUp,
  moveColumnDown: moveCandidateDown, saveColumnSetting: saveCandidateSetting,
  resetColumnSetting: resetCandidateSetting,
  loadColumnPreference: loadCandidatePref, handleResizeColumn: handleCandidateResize
} = useColumnPreference('material_issue_candidates', defaultCandidateColumns, {
  fixedLeft: [], fixedRight: []
})

const orderInfo = ref<any>(null)
const preparationHeader = ref<any>(null)
const detailList = ref<DetailWithInput[]>([])
const previousIssues = ref<any[]>([])

const prepStatusColor = computed(() => {
  const s = preparationHeader.value?.preparation_status
  if (s === '已领料') return 'green'
  if (s === '部分领料') return 'orange'
  return 'blue'
})

const defaultDetailColumns: any[] = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60, resizable: true },
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 120, resizable: true },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 140, resizable: true },
  { title: '类型', dataIndex: 'material_type', key: 'material_type', width: 80, resizable: true },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 60, resizable: true },
  { title: '需求数量', dataIndex: 'required_quantity', key: 'required_quantity', width: 90, resizable: true },
  { title: '已领量', dataIndex: 'issued_quantity', key: 'issued_quantity', width: 80, resizable: true },
  { title: '未领量', key: 'remaining', width: 80, resizable: true },
  { title: '实际备料数量', key: 'input_actual_quantity', width: 120, resizable: true },
  { title: '批次号', key: 'input_batch_number', width: 150, resizable: true },
  { title: '工序', dataIndex: 'step_number', key: 'step_number', width: 60, resizable: true },
  { title: '工作中心', dataIndex: 'work_center_name', key: 'work_center_name', width: 110, resizable: true },
  { title: '关键', key: 'is_key_material', width: 60, resizable: true }
]

const {
  columns: detailCols, columnSettingVisible: detailSettingVisible,
  columnSettingList: detailSettingList, columnSettingSaving: detailSettingSaving,
  openColumnSetting: openDetailSetting, moveColumnUp: moveDetailUp,
  moveColumnDown: moveDetailDown, saveColumnSetting: saveDetailSetting,
  resetColumnSetting: resetDetailSetting,
  loadColumnPreference: loadDetailPref, handleResizeColumn: handleDetailResize
} = useColumnPreference('material_issue_details', defaultDetailColumns, {
  fixedLeft: [],
  fixedRight: [{ title: '操作', key: 'action', width: 70, fixed: 'right' as const }]
})

const totalInputActual = computed(() => detailList.value.reduce((s, d) => s + (d.input_actual_quantity || 0), 0))
const filledCount = computed(() => detailList.value.filter(d => (d.input_actual_quantity || 0) > 0).length)

const handleSearch = async (value: string) => {
  const keyword = (value || orderInput.value || '').trim()
  if (!keyword) { message.warning('请输入生产单编号'); return }
  loading.value = true
  try {
    const res: any = await queryByOrder(keyword)
    const data = res?.data
    if (!data) { message.error('查询失败'); return }

    // 多条匹配 → 弹出候选列表
    if (data.matchType === 'multiple') {
      candidateList.value = data.candidates || []
      candidateVisible.value = true
      return
    }

    loadOrderData(data)
  } catch (err: any) {
    message.error(err?.response?.data?.message || '查询失败')
  } finally { loading.value = false }
}

const loadOrderData = (data: any) => {
  orderInfo.value = data.order
  previousIssues.value = data.previousIssues || []

  if (!data.preparation) {
    preparationHeader.value = null
    detailList.value = []
    message.warning('该生产单尚未生成备料单，请先派发生产单')
    return
  }

  preparationHeader.value = data.preparation
  detailList.value = (data.details || []).map((d: any) => {
    const required = parseFloat(d.required_quantity) || 0
    const issued = parseFloat(d.issued_quantity) || 0
    return {
      ...d,
      _uid: ++uidSeq,
      remaining_quantity: Math.max(Math.round((required - issued) * 10000) / 10000, 0),
      input_actual_quantity: null,
      input_batch_number: ''
    }
  })

  // 自动弹出备料窗口
  modalVisible.value = true
  issueRemark.value = ''
}

const selectCandidate = async (record: any) => {
  candidateVisible.value = false
  orderInput.value = record.production_order_number
  loading.value = true
  try {
    const res: any = await queryByOrder(record.production_order_number)
    const data = res?.data
    if (!data) { message.error('查询失败'); return }
    // 精确匹配单条时直接加载
    if (data.matchType === 'multiple') {
      // 从候选中找到精确匹配的那条，直接用它查备料
      const exact = (data.candidates || []).find((c: any) => c.production_order_number === record.production_order_number)
      if (exact) {
        // 用精确编号再查一次（不应再多匹配）
        message.info('请使用完整的生产单编号查询')
        return
      }
    }
    loadOrderData(data)
  } catch (err: any) {
    message.error(err?.response?.data?.message || '查询失败')
  } finally { loading.value = false }
}

const handleReset = () => {
  orderInput.value = ''
  orderInfo.value = null
  preparationHeader.value = null
  detailList.value = []
  previousIssues.value = []
  modalVisible.value = false
  candidateVisible.value = false
  candidateList.value = []
  nextTick(() => { scanInputRef.value?.focus?.() })
}

const addBatchRow = (index: number) => {
  const source = detailList.value[index]
  // 找同一物料（同 id）所有行中的最大行号，+1 作为新行号
  const maxLineNo = detailList.value
    .filter(d => d.id === source.id)
    .reduce((max, d) => Math.max(max, d.line_number), 0)
  const newRow: DetailWithInput = {
    ...source,
    _uid: ++uidSeq,
    is_added: true,
    line_number: maxLineNo + 1,
    remaining_quantity: 0,
    input_actual_quantity: null,
    input_batch_number: ''
  }
  detailList.value.splice(index + 1, 0, newRow)
}

const removeBatchRow = (index: number) => {
  detailList.value.splice(index, 1)
}

const fillRemaining = () => {
  let count = 0
  for (const d of detailList.value) {
    if (!d.is_added && d.remaining_quantity > 0) {
      d.input_actual_quantity = d.remaining_quantity
      count++
    }
  }
  message.success(`已填充 ${count} 项未领量`)
}

const openIssueModal = () => {
  // 移除所有新增的批次行，恢复原始行
  detailList.value = detailList.value.filter(d => !d.is_added)
  for (const d of detailList.value) {
    d.input_actual_quantity = null
    d.input_batch_number = ''
  }
  issueRemark.value = ''
  modalVisible.value = true
}

const handleSave = async () => {
  const validItems = detailList.value.filter(d => (d.input_actual_quantity || 0) > 0)
  if (validItems.length === 0) {
    message.warning('至少需要一行实际备料数量大于0')
    return
  }

  saving.value = true
  try {
    const payload = {
      preparation_number: preparationHeader.value.preparation_number,
      production_order_number: orderInfo.value.production_order_number,
      remark: issueRemark.value,
      items: validItems.map(d => ({
        preparation_detail_id: d.id,
        material_number: d.material_number,
        material_name: d.material_name,
        material_type: d.material_type,
        unit: d.unit,
        required_quantity: d.required_quantity,
        actual_quantity: d.input_actual_quantity,
        batch_number: d.input_batch_number,
        step_number: d.step_number,
        work_center_name: d.work_center_name,
        is_key_material: d.is_key_material,
        default_warehouse: d.default_warehouse
      }))
    }

    const res: any = await createMaterialIssue(payload)
    message.success(`领料保存成功，领料单号: ${res?.data?.issue_number || ''}`)
    modalVisible.value = false

    // 刷新数据
    await handleSearch(orderInput.value)
  } catch (err: any) {
    message.error(err?.response?.data?.message || '保存失败')
  } finally { saving.value = false }
}

onMounted(async () => {
  await Promise.all([loadCandidatePref(), loadDetailPref()])
  nextTick(() => { scanInputRef.value?.focus?.() })
})
</script>

<style scoped>
.material-issue-page {
  padding: 0 0 20px 0;
}
.top-card { margin-bottom: 6px; }
.top-card :deep(.ant-card-body) { padding: 8px 12px; }
.prep-card { margin-bottom: 6px; }
.prep-card :deep(.ant-card-body) { padding: 8px 12px; }
.info-item { font-size: 13px; color: #333; }
:deep(.candidate-row) { cursor: pointer; }
:deep(.candidate-row:hover td) { background: #e6f7ff !important; }
</style>
