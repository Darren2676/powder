<template>
  <div style="padding: 0 0 20px 0;">
    <a-page-header title="生产单材料成本" style="padding: 0; margin: 0 0 8px 0;" />

    <!-- 汇总卡片 -->
    <a-row :gutter="12" style="margin-bottom: 12px;">
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #e6f7ff; border-left: 3px solid #1890ff;">
          <a-statistic title="材料成本总计" :value="summaryData.total_material_cost" :precision="2" prefix="¥" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #f6ffed; border-left: 3px solid #52c41a;">
          <a-statistic title="已领料生产单" :value="summaryData.total_orders" suffix="单" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #fff7e6; border-left: 3px solid #fa8c16;">
          <a-statistic title="未定价物料" :value="summaryData.total_unpriced_count" suffix="项" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #f9f0ff; border-left: 3px solid #722ed1;">
          <a-statistic title="定价覆盖率" :value="summaryData.priced_rate" :precision="1" suffix="%" />
        </a-card>
      </a-col>
    </a-row>

    <!-- 成本数据说明 -->
    <a-alert type="info" show-icon style="margin-bottom: 8px;" message="成本数据来自领料快照，领料时锁定标准成本单价，不受后续成本表变更影响" banner />

    <!-- 搜索栏 -->
    <a-card :bordered="false" size="small" style="margin-bottom: 8px;">
      <a-row :gutter="12" align="middle">
        <a-col :span="6">
          <a-input-search v-model:value="searchText" placeholder="搜索生产单号/产品编号/产品名称" enter-button size="small" @search="handleSearch" />
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="filterStatus" placeholder="生产状态" allow-clear size="small" style="width: 100%;" @change="handleSearch">
            <a-select-option value="已派发">已派发</a-select-option>
            <a-select-option value="已备料">已备料</a-select-option>
            <a-select-option value="生产中">生产中</a-select-option>
            <a-select-option value="已完成">已完成</a-select-option>
          </a-select>
        </a-col>
        <a-col>
          <a-button type="primary" :loading="exportLoading" size="small" @click="handleExport">
            <DownloadOutlined /> 导出
          </a-button>
        </a-col>
        <a-col>
          <a-button size="small" @click="openOrderSetting">
            <template #icon><SettingOutlined /></template>
            列设置
          </a-button>
        </a-col>
      </a-row>
    </a-card>

    <!-- 主表：生产单维度 -->
    <a-table
      :columns="orderColumns"
      :data-source="orderData"
      :loading="loading"
      :pagination="pagination"
      size="small"
      bordered
      row-key="production_order_number"
      :scroll="{ x: 'max-content' }"
      :expandedRowKeys="expandedKeys"
      @change="handleTableChange"
      @expand="handleExpand"
      @resizeColumn="handleOrderResize"
    >
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'rowIndex'">
          {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
        </template>
        <template v-if="column.key === 'plan_status'">
          <a-tag :color="statusColor(record.plan_status)">{{ record.plan_status }}</a-tag>
        </template>
        <template v-if="column.key === 'material_cost_total'">
          <span :style="{ color: record.material_cost_total > 0 ? '#cf1322' : '#999', fontWeight: 600 }">
            ¥{{ record.material_cost_total?.toFixed(2) }}
          </span>
        </template>
        <template v-if="column.key === 'unit_cost_avg'">
          <span :style="{ color: record.unit_cost_avg > 0 ? '#1890ff' : '#999' }">
            ¥{{ record.unit_cost_avg?.toFixed(2) }}
          </span>
        </template>
        <template v-if="column.key === 'unpriced_count'">
          <a-tag v-if="record.unpriced_count > 0" color="warning">{{ record.unpriced_count }}项未定价</a-tag>
          <a-tag v-else color="success">全部定价</a-tag>
        </template>
      </template>
      <!-- 展开行：材料明细 -->
      <template #expandedRowRender="{ record }">
        <a-table
          v-if="detailMap[record.production_order_number]"
          :columns="detailColumns"
          :data-source="detailMap[record.production_order_number]"
          :pagination="false"
          size="small"
          bordered
          row-key="id"
          :scroll="{ x: 'max-content' }"
          @resizeColumn="handleDetailResize"
        >
          <template #bodyCell="{ column, record: d }">
            <template v-if="column.key === 'standard_cost'">
              <span v-if="d.has_cost" style="color: #389e0d;">¥{{ d.standard_cost?.toFixed(4) }}</span>
              <span v-else style="color: #ff4d4f;">未定价</span>
            </template>
            <template v-if="column.key === 'material_cost'">
              <span :style="{ color: d.material_cost > 0 ? '#cf1322' : '#999', fontWeight: d.material_cost > 0 ? 600 : 400 }">
                ¥{{ d.material_cost?.toFixed(2) }}
              </span>
            </template>
            <template v-if="column.key === 'issued_quantity'">
              <span :style="{ color: d.issued_quantity > 0 ? '#389e0d' : '#999' }">{{ d.issued_quantity }}</span>
            </template>
            <template v-if="column.key === 'source_type'">
              <a-tag :color="d.source_type === '领料' ? 'blue' : d.source_type === '退料' ? 'red' : 'green'">{{ d.source_type }}</a-tag>
            </template>
          </template>
        </a-table>
        <a-spin v-else />
      </template>
    </a-table>

    <ColumnSettingDrawer
      :open="orderSettingVisible"
      :settingList="orderSettingList"
      :saving="orderSettingSaving"
      @update:open="orderSettingVisible = $event"
      @moveUp="moveOrderUp"
      @moveDown="moveOrderDown"
      @save="saveOrderSetting"
      @reset="resetOrderSetting"
    />

    <ColumnSettingDrawer
      :open="detailSettingVisible"
      :settingList="detailSettingList"
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
import { ref, computed, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { DownloadOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { getProductionMaterialCost, getProductionMaterialCostSummary, exportProductionMaterialCost } from '@/api/production/materialCost'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'

// === State ===
const loading = ref(false)
const exportLoading = ref(false)
const searchText = ref('')
const filterStatus = ref<string | undefined>(undefined)
const orderData = ref<any[]>([])
const detailMap = ref<Record<string, any[]>>({})
const expandedKeys = ref<string[]>([])
const summaryData = ref<any>({
  total_orders: 0,
  total_material_cost: 0,
  total_material_count: 0,
  total_unpriced_count: 0,
  priced_rate: 0,
  cost_list_number: ''
})

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`
})

// === 生产单列定义 ===
const defaultOrderColumns = [
  { title: '生产单编号', dataIndex: 'production_order_number', key: 'production_order_number', width: 160, resizable: true, fixed: 'left' as const },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 160, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, resizable: true },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 100, resizable: true },
  { title: '生产状态', dataIndex: 'plan_status', key: 'plan_status', width: 90, resizable: true },
  { title: '材料成本合计', dataIndex: 'material_cost_total', key: 'material_cost_total', width: 130, resizable: true },
  { title: '单位产品成本', dataIndex: 'unit_cost_avg', key: 'unit_cost_avg', width: 120, resizable: true },
  { title: '物料种数', dataIndex: 'material_count', key: 'material_count', width: 80, resizable: true },
  { title: '定价情况', dataIndex: 'unpriced_count', key: 'unpriced_count', width: 110, resizable: true },
]

const {
  columns: orderColumns, columnSettingVisible: orderSettingVisible, columnSettingList: orderSettingList, columnSettingSaving: orderSettingSaving,
  openColumnSetting: openOrderSetting, moveColumnUp: moveOrderUp, moveColumnDown: moveOrderDown, saveColumnSetting: saveOrderSetting, resetColumnSetting: resetOrderSetting,
  loadColumnPreference: loadOrderPref, handleResizeColumn: handleOrderResize
} = useColumnPreference('production_material_cost_order', defaultOrderColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
})

// === 材料明细列定义 ===
const defaultDetailColumns = [
  { title: '备料单号', dataIndex: 'preparation_number', key: 'preparation_number', width: 140, resizable: true },
  { title: '领料单号', dataIndex: 'issue_number', key: 'issue_number', width: 140, resizable: true },
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 120, resizable: true },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 160, resizable: true },
  { title: '物料类型', dataIndex: 'material_type', key: 'material_type', width: 80, resizable: true },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 60, resizable: true },
  { title: '领料数量', dataIndex: 'issued_quantity', key: 'issued_quantity', width: 90, resizable: true },
  { title: '标准成本单价', dataIndex: 'standard_cost', key: 'standard_cost', width: 120, resizable: true },
  { title: '材料成本', dataIndex: 'material_cost', key: 'material_cost', width: 110, resizable: true },
  { title: '成本表编号', dataIndex: 'cost_list_number', key: 'cost_list_number', width: 130, resizable: true },
  { title: '来源类型', dataIndex: 'source_type', key: 'source_type', width: 80, resizable: true },
  { title: '工序号', dataIndex: 'step_number', key: 'step_number', width: 70, resizable: true },
  { title: '工作中心', dataIndex: 'work_center_name', key: 'work_center_name', width: 120, resizable: true },
]

const {
  columns: detailColumns, columnSettingVisible: detailSettingVisible, columnSettingList: detailSettingList, columnSettingSaving: detailSettingSaving,
  openColumnSetting: openDetailSetting, moveColumnUp: moveDetailUp, moveColumnDown: moveDetailDown, saveColumnSetting: saveDetailSetting, resetColumnSetting: resetDetailSetting,
  loadColumnPreference: loadDetailPref, handleResizeColumn: handleDetailResize
} = useColumnPreference('production_material_cost_detail', defaultDetailColumns, {
  fixedLeft: [],
  fixedRight: [],
})

// === 方法 ===
const statusColor = (status: string) => {
  const map: Record<string, string> = {
    '已派发': 'blue', '已备料': 'cyan', '生产中': 'green',
    '已完成': '#999', '已关闭': 'default'
  }
  return map[status] || 'default'
}

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getProductionMaterialCost({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined,
      plan_status: filterStatus.value || undefined,
    })
    const d = res.data
    orderData.value = d.items || []
    detailMap.value = d.details || {}
    pagination.total = d.pagination?.total || 0
    if (d.summary) {
      summaryData.value = d.summary
    }
  } catch (e: any) {
    message.error(e.message || '获取数据失败')
  } finally {
    loading.value = false
  }
}

const fetchSummary = async () => {
  try {
    const res = await getProductionMaterialCostSummary()
    if (res.data) {
      summaryData.value = res.data
    }
  } catch (e: any) {
    // 静默失败
  }
}

const handleSearch = () => {
  pagination.current = 1
  fetchData()
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleExpand = (expanded: boolean, record: any) => {
  if (expanded) {
    expandedKeys.value = [...expandedKeys.value, record.production_order_number]
  } else {
    expandedKeys.value = expandedKeys.value.filter((k: string) => k !== record.production_order_number)
  }
}

const handleExport = async () => {
  exportLoading.value = true
  try {
    const res = await exportProductionMaterialCost({
      search: searchText.value || undefined,
      plan_status: filterStatus.value || undefined,
    })
    const blob = new Blob([res.data as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '生产单材料成本.xlsx'
    a.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch (e: any) {
    message.error(e.message || '导出失败')
  } finally {
    exportLoading.value = false
  }
}

onMounted(() => {
  loadOrderPref()
  loadDetailPref()
  fetchData()
  fetchSummary()
})
</script>
