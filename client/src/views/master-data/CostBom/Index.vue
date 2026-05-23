<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import {
  ReloadOutlined, DownloadOutlined, DollarOutlined,
  ApartmentOutlined, ExpandAltOutlined, ShrinkOutlined,
  SwapOutlined
} from '@ant-design/icons-vue'
import { getBomHeaders, getAvailableCostLists, getCostBom, exportCostBomData } from '@/api/master-data/bom'
import { usePagePermission } from '@/composables/usePagePermission'

// ==================== 权限 ====================
const { canViewField } = usePagePermission('cost-bom')

// ==================== BOM 列表 ====================
const bomList = ref<any[]>([])
const bomListLoading = ref(false)
const bomSearch = ref('')
const bomPagination = ref({ current: 1, pageSize: 20, total: 0 })
const selectedBom = ref<string>('')

const fetchBomList = async () => {
  bomListLoading.value = true
  try {
    const res: any = await getBomHeaders({
      page: bomPagination.value.current,
      limit: bomPagination.value.pageSize,
      search: bomSearch.value,
      approval_status: '已审批'
    })
    if (res?.success) {
      bomList.value = res.data.items || []
      bomPagination.value.total = res.data.pagination?.total || 0
    }
  } catch {
    message.error('获取BOM列表失败')
  } finally {
    bomListLoading.value = false
  }
}

const handleBomSearch = () => {
  bomPagination.value.current = 1
  fetchBomList()
}

const handleBomReset = () => {
  bomSearch.value = ''
  bomPagination.value.current = 1
  fetchBomList()
}

// ==================== 成本表选择 ====================
const costLists = ref<any[]>([])
const selectedCostList = ref<string>('')

const fetchCostLists = async () => {
  try {
    const res: any = await getAvailableCostLists()
    if (res?.success) costLists.value = res.data || []
  } catch { /* 静默 */ }
}

// ==================== 成本BOM数据 ====================
const costBomLoading = ref(false)
const costBomData = ref<any>(null)
const expandedRowKeys = ref<string[]>([])
const costViewMode = ref<'both' | 'material' | 'standard'>('both')

const assignCostBomKeys = (details: any[], prefix = ''): any[] => {
  return details.map((d: any, i: number) => {
    const key = prefix ? `${prefix}-${i}` : `${i}`
    const item = { ...d, _cost_key: key }
    if (d.children && d.children.length > 0) {
      item.children = assignCostBomKeys(d.children, key)
    }
    return item
  })
}

const allExpandableKeys = ref<string[]>([])
const collectAllKeys = (details: any[], prefix = ''): string[] => {
  const keys: string[] = []
  details.forEach((d: any, i: number) => {
    const key = prefix ? `${prefix}-${i}` : `${i}`
    keys.push(key)
    if (d.children && d.children.length > 0) {
      keys.push(...collectAllKeys(d.children, key))
    }
  })
  return keys
}

const loadCostBom = async () => {
  if (!selectedBom.value) {
    message.warning('请先选择一个BOM')
    return
  }
  costBomLoading.value = true
  costBomData.value = null
  try {
    const res: any = await getCostBom(selectedBom.value, selectedCostList.value || undefined)
    if (res?.success) {
      const data = res.data
      if (data.tree?.details) {
        data.tree.details = assignCostBomKeys(data.tree.details)
        allExpandableKeys.value = collectAllKeys(data.tree.details)
        expandedRowKeys.value = [...allExpandableKeys.value]
      }
      costBomData.value = data
      if (data.cost_list_number && !selectedCostList.value) {
        selectedCostList.value = data.cost_list_number
      }
    }
  } catch (e: any) {
    console.error('[成本BOM] 加载失败:', e)
    message.error('加载成本BOM失败')
  } finally {
    costBomLoading.value = false
  }
}

const handleExpandAll = () => { expandedRowKeys.value = [...allExpandableKeys.value] }
const handleCollapseAll = () => { expandedRowKeys.value = [] }

const handleExport = async () => {
  if (!selectedBom.value) return
  try {
    const res: any = await exportCostBomData(selectedBom.value, selectedCostList.value || undefined)
    const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `成本BOM_${selectedBom.value}.xlsx`
    a.click()
    window.URL.revokeObjectURL(url)
  } catch {
    message.error('导出成本BOM失败')
  }
}

// ==================== 列定义 ====================
const materialTypeColorMap: Record<string, string> = {
  '成品': 'blue', '半成品': 'cyan', '原材料': 'green',
  '包材': 'orange', '骨架': 'purple', '预成型件': 'magenta'
}

// 双成本对比列
const costBomColumnsBoth = [
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 130, fixed: 'left' as const },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 110 },
  { title: '物料类型', dataIndex: 'material_type', key: 'material_type', width: 80 },
  { title: '类型', dataIndex: 'is_semi_finished', key: 'is_semi_finished', width: 80 },
  { title: '累计用量', dataIndex: 'accumulated_quantity', key: 'accumulated_quantity', width: 85 },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 50 },
  { title: '材料单价', dataIndex: 'unit_cost', key: 'unit_cost', width: 90 },
  { title: '材料成本', dataIndex: 'material_cost', key: 'material_cost', width: 100 },
  { title: '标准单价', dataIndex: 'semi_standard_unit_cost', key: 'semi_standard_unit_cost', width: 90 },
  { title: '标准成本', dataIndex: 'standard_cost_total', key: 'standard_cost_total', width: 100 },
  { title: '加工成本', dataIndex: 'processing_cost', key: 'processing_cost', width: 100 },
  { title: '子BOM', dataIndex: 'matched_bom_number', key: 'matched_bom_number', width: 110 },
  { title: 'BOM路径', dataIndex: 'bom_path', key: 'bom_path', width: 180, ellipsis: true }
]

const costBomColumnsMaterial = [
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 150 },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 130 },
  { title: '物料类型', dataIndex: 'material_type', key: 'material_type', width: 90 },
  { title: '类型', dataIndex: 'is_semi_finished', key: 'is_semi_finished', width: 90 },
  { title: '累计用量', dataIndex: 'accumulated_quantity', key: 'accumulated_quantity', width: 100 },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
  { title: '标准单价', dataIndex: 'unit_cost', key: 'unit_cost', width: 100 },
  { title: '材料成本', dataIndex: 'material_cost', key: 'material_cost', width: 110 },
  { title: '成本占比', dataIndex: 'cost_ratio', key: 'cost_ratio', width: 140 },
  { title: '子BOM', dataIndex: 'matched_bom_number', key: 'matched_bom_number', width: 140 },
  { title: 'BOM路径', dataIndex: 'bom_path', key: 'bom_path', width: 200, ellipsis: true }
]

const costBomColumnsStandard = [
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 150 },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 130 },
  { title: '物料类型', dataIndex: 'material_type', key: 'material_type', width: 90 },
  { title: '类型', dataIndex: 'is_semi_finished', key: 'is_semi_finished', width: 90 },
  { title: '累计用量', dataIndex: 'accumulated_quantity', key: 'accumulated_quantity', width: 100 },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
  { title: '标准单价', dataIndex: 'semi_standard_unit_cost', key: 'semi_standard_unit_cost', width: 100 },
  { title: '标准成本', dataIndex: 'standard_cost_total', key: 'standard_cost_total', width: 110 },
  { title: '成本占比', dataIndex: 'cost_ratio', key: 'cost_ratio', width: 140 },
  { title: '子BOM', dataIndex: 'matched_bom_number', key: 'matched_bom_number', width: 140 },
  { title: 'BOM路径', dataIndex: 'bom_path', key: 'bom_path', width: 200, ellipsis: true }
]

const activeColumns = computed(() => {
  if (costViewMode.value === 'material') return costBomColumnsMaterial
  if (costViewMode.value === 'standard') return costBomColumnsStandard
  return costBomColumnsBoth
})

// ==================== 初始化 ====================
onMounted(() => {
  fetchBomList()
  fetchCostLists()
})
</script>

<template>
  <div style="padding: 0; height: 100%; display: flex; flex-direction: column;">
    <!-- 页面标题 -->
    <div style="padding: 12px 16px 0; display: flex; align-items: center; justify-content: space-between;">
      <span style="font-size: 16px; font-weight: 600;">成本BOM</span>
      <span style="color: #999; font-size: 13px;">基于设计BOM和标准成本单价，对比材料成本与标准成本（含加工费）</span>
    </div>

    <!-- 选择条件区域 -->
    <a-card size="small" style="margin: 8px 16px;" :bordered="true">
      <a-space :size="16" wrap>
        <span style="font-weight: 500; white-space: nowrap;">选择BOM：</span>
        <a-select
          v-model:value="selectedBom"
          show-search
          placeholder="搜索选择BOM编号/名称"
          style="width: 320px;"
          :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())"
          @change="() => { costBomData = null }"
        >
          <a-select-option
            v-for="b in bomList"
            :key="b.bom_number"
            :value="b.bom_number"
            :label="`${b.bom_number} - ${b.item_name}`"
          >
            {{ b.bom_number }} - {{ b.item_name }}
            <span style="color: #999; margin-left: 4px;">({{ b.bom_version }})</span>
          </a-select-option>
        </a-select>

        <span style="font-weight: 500; white-space: nowrap; margin-left: 8px;">标准成本单价表：</span>
        <a-select v-model:value="selectedCostList" placeholder="选择成本单价表" style="width: 260px;" allow-clear>
          <a-select-option v-for="cl in costLists" :key="cl.cost_list_number" :value="cl.cost_list_number">
            {{ cl.cost_list_number }} - {{ cl.effective_date?.substring(0, 10) }}
          </a-select-option>
        </a-select>

        <a-button type="primary" :loading="costBomLoading" @click="loadCostBom">
          <DollarOutlined /> 计算成本
        </a-button>
        <a-button @click="handleExport" :disabled="!costBomData">
          <DownloadOutlined /> 导出Excel
        </a-button>
      </a-space>
    </a-card>

    <!-- 成本BOM结果区域 -->
    <div style="flex: 1; overflow: auto; padding: 0 16px 16px;">
      <a-spin :spinning="costBomLoading">
        <template v-if="costBomData">
          <!-- 选中BOM基本信息 -->
          <a-card size="small" style="margin-bottom: 8px;" :bordered="true">
            <a-descriptions :column="6" size="small">
              <a-descriptions-item label="BOM编号">{{ costBomData.tree?.bom_number }}</a-descriptions-item>
              <a-descriptions-item label="产品名称">{{ costBomData.tree?.item_name }}</a-descriptions-item>
              <a-descriptions-item label="版本">{{ costBomData.tree?.bom_version }}</a-descriptions-item>
              <a-descriptions-item label="基本数量">{{ costBomData.tree?.base_quantity }} {{ costBomData.tree?.base_unit }}</a-descriptions-item>
              <a-descriptions-item label="成本表">{{ costBomData.cost_list_number }}</a-descriptions-item>
              <a-descriptions-item label="生效日期">{{ costBomData.effective_date }}</a-descriptions-item>
            </a-descriptions>
          </a-card>

          <!-- 双成本汇总卡片 -->
          <a-row :gutter="12" style="margin-bottom: 8px;">
            <a-col :span="4">
              <a-card size="small" :bordered="true">
                <a-statistic title="材料成本" :value="costBomData.total_material_cost ?? 0" :precision="2"
                  :value-style="{ fontSize: '18px', color: '#1890ff', fontWeight: 600 }">
                  <template #prefix><DollarOutlined /></template>
                </a-statistic>
              </a-card>
            </a-col>
            <a-col :span="4">
              <a-card size="small" :bordered="true">
                <a-statistic title="标准成本" :value="costBomData.total_standard_cost ?? 0" :precision="2"
                  :value-style="{ fontSize: '18px', color: '#cf1322', fontWeight: 600 }">
                  <template #prefix><DollarOutlined /></template>
                </a-statistic>
              </a-card>
            </a-col>
            <a-col :span="4">
              <a-card size="small" :bordered="true">
                <a-statistic title="加工成本" :value="costBomData.total_processing_cost ?? 0" :precision="2"
                  :value-style="{ fontSize: '18px', color: '#fa8c16', fontWeight: 600 }">
                  <template #prefix><SwapOutlined /></template>
                </a-statistic>
              </a-card>
            </a-col>
            <a-col :span="4">
              <a-card size="small" :bordered="true">
                <a-statistic title="加工占比" :value="costBomData.total_standard_cost > 0 ? (costBomData.total_processing_cost / costBomData.total_standard_cost * 100) : 0" :precision="1"
                  suffix="%"
                  :value-style="{ fontSize: '18px', color: costBomData.total_processing_cost / (costBomData.total_standard_cost || 1) > 0.3 ? '#cf1322' : '#389e0d' }" />
              </a-card>
            </a-col>
            <a-col :span="4">
              <a-card size="small" :bordered="true">
                <a-statistic title="物料种数" :value="costBomData.material_count ?? 0"
                  :value-style="{ fontSize: '18px' }" />
              </a-card>
            </a-col>
            <a-col :span="4">
              <a-card size="small" :bordered="true">
                <a-statistic title="已定价物料" :value="costBomData.priced_count ?? 0"
                  :value-style="{ fontSize: '18px', color: '#389e0d' }" />
              </a-card>
            </a-col>
          </a-row>

          <!-- 成本对比说明 -->
          <a-alert style="margin-bottom: 8px;" type="info" show-icon :closable="true">
            <template #message>
              <span style="font-size: 13px;">
                <b>材料成本</b>（蓝色）：半成品 = 子件材料成本汇总（Bottom-up，纯材料）
                &nbsp;|&nbsp;
                <b>标准成本</b>（红色）：半成品 = 累计用量 × 自身标准单价（含加工费，Top-down）
                &nbsp;|&nbsp;
                <b>加工成本</b>（橙色） = 标准成本 − 材料成本
              </span>
            </template>
          </a-alert>

          <!-- 视图切换 -->
          <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <a-radio-group v-model:value="costViewMode" size="small">
              <a-radio-button value="both">双成本对比</a-radio-button>
              <a-radio-button value="material">仅材料成本</a-radio-button>
              <a-radio-button value="standard">仅标准成本</a-radio-button>
            </a-radio-group>
            <a-space>
              <a-button size="small" @click="handleExpandAll"><ExpandAltOutlined /> 全部展开</a-button>
              <a-button size="small" @click="handleCollapseAll"><ShrinkOutlined /> 全部折叠</a-button>
            </a-space>
          </div>

          <!-- 成本BOM树形表格 -->
          <a-table
            :columns="activeColumns"
            :data-source="costBomData.tree?.details || []"
            childrenColumnName="children"
            v-model:expandedRowKeys="expandedRowKeys"
            rowKey="_cost_key"
            :pagination="false"
            :scroll="{ x: 1500, y: 420 }"
            size="small"
            bordered
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'material_type'">
                <a-tag :color="materialTypeColorMap[record.material_type] || 'default'">{{ record.material_type }}</a-tag>
              </template>
              <template v-else-if="column.key === 'accumulated_quantity'">
                <span style="font-weight: 500;">{{ record.accumulated_quantity }}</span>
              </template>
              <template v-else-if="column.key === 'is_semi_finished'">
                <a-tag v-if="record.is_semi_finished" color="blue"><ApartmentOutlined /> 半成品</a-tag>
                <a-tag v-else color="green">原材料</a-tag>
              </template>
              <!-- 双成本对比模式 -->
              <template v-else-if="column.key === 'unit_cost'">
                <span v-if="record.is_semi_finished" style="color: #ccc;">-</span>
                <span v-else-if="record.has_cost" style="color: #389e0d;">{{ record.unit_cost?.toFixed(2) }}</span>
                <span v-else style="color: #ff4d4f;">未定价</span>
              </template>
              <template v-else-if="column.key === 'material_cost'">
                <span v-if="record.has_cost || record.material_cost > 0" style="color: #1890ff; font-weight: 600;">{{ record.material_cost?.toFixed(2) }}</span>
                <span v-else style="color: #ff4d4f;">0.00</span>
              </template>
              <template v-else-if="column.key === 'semi_standard_unit_cost'">
                <span v-if="record.is_semi_finished && record.has_standard_cost" style="color: #cf1322;">{{ record.semi_standard_unit_cost?.toFixed(2) }}</span>
                <span v-else-if="record.is_semi_finished && !record.has_standard_cost" style="color: #999;">（未定价）</span>
                <span v-else-if="record.has_cost" style="color: #389e0d;">{{ record.unit_cost?.toFixed(2) }}</span>
                <span v-else style="color: #ff4d4f;">未定价</span>
              </template>
              <template v-else-if="column.key === 'standard_cost_total'">
                <span v-if="record.standard_cost_total > 0" style="color: #cf1322; font-weight: 600;">{{ record.standard_cost_total?.toFixed(2) }}</span>
                <span v-else style="color: #ff4d4f;">0.00</span>
              </template>
              <template v-else-if="column.key === 'processing_cost'">
                <template v-if="record.is_semi_finished">
                  <span v-if="record.processing_cost > 0" style="color: #fa8c16; font-weight: 600;">+{{ record.processing_cost?.toFixed(2) }}</span>
                  <span v-else-if="record.processing_cost < 0" style="color: #ff4d4f; font-weight: 600;">{{ record.processing_cost?.toFixed(2) }}</span>
                  <span v-else style="color: #999;">0.00</span>
                </template>
                <span v-else style="color: #ccc;">-</span>
              </template>
              <!-- 单成本模式 -->
              <template v-else-if="column.key === 'cost_ratio'">
                <template v-if="costViewMode === 'material' && costBomData.total_material_cost > 0 && record.material_cost > 0">
                  <a-progress :percent="Math.round(record.material_cost / costBomData.total_material_cost * 10000) / 100" :size="'small'"
                    :stroke-color="record.material_cost / costBomData.total_material_cost > 0.2 ? '#1890ff' : '#69c0ff'" />
                </template>
                <template v-else-if="costViewMode === 'standard' && costBomData.total_standard_cost > 0 && record.standard_cost_total > 0">
                  <a-progress :percent="Math.round(record.standard_cost_total / costBomData.total_standard_cost * 10000) / 100" :size="'small'"
                    :stroke-color="record.standard_cost_total / costBomData.total_standard_cost > 0.2 ? '#cf1322' : '#ff7875'" />
                </template>
                <span v-else style="color: #ccc;">-</span>
              </template>
            </template>
          </a-table>

          <!-- 按物料汇总表 -->
          <div v-if="costBomData.flat_summary && costBomData.flat_summary.length > 0" style="margin-top: 16px;">
            <span style="font-weight: 500; margin-bottom: 8px; display: block;">物料成本汇总（按物料编号聚合，仅叶子物料）</span>
            <a-table
              :columns="[
                { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 150 },
                { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 130 },
                { title: '物料类型', dataIndex: 'material_type', key: 'material_type', width: 90 },
                { title: '累计用量', dataIndex: 'accumulated_quantity', key: 'accumulated_quantity', width: 100 },
                { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
                { title: '标准单价', dataIndex: 'unit_cost', key: 'unit_cost', width: 100 },
                { title: '成本金额', dataIndex: 'total_cost', key: 'total_cost', width: 110 },
                { title: '成本占比(%)', dataIndex: 'cost_percentage', key: 'cost_percentage', width: 110 }
              ]"
              :data-source="costBomData.flat_summary"
              row-key="material_number"
              :pagination="false"
              :scroll="{ y: 300 }"
              size="small"
              bordered
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'material_type'">
                  <a-tag :color="materialTypeColorMap[record.material_type] || 'default'">{{ record.material_type }}</a-tag>
                </template>
                <template v-else-if="column.key === 'total_cost'">
                  <span v-if="record.has_cost" style="color: #cf1322; font-weight: 600;">{{ record.total_cost?.toFixed(2) }}</span>
                  <span v-else style="color: #ff4d4f;">0.00</span>
                </template>
                <template v-else-if="column.key === 'cost_percentage'">
                  <span v-if="record.cost_percentage > 0">{{ record.cost_percentage?.toFixed(2) }}%</span>
                  <span v-else style="color: #ccc;">-</span>
                </template>
              </template>
            </a-table>
          </div>
        </template>

        <a-empty v-else-if="!costBomLoading" description="请选择BOM和标准成本单价表后点击「计算成本」" style="margin-top: 80px;" />
      </a-spin>
    </div>
  </div>
</template>
