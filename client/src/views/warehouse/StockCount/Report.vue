<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { getReportSummary, getReportDiffDetail, getReportTrend } from '@/api/warehouse/stockCount'
import { getWarehouseOptions } from '@/api/warehouse/finishedGoods'
import dayjs from 'dayjs'

// ==================== 筛选条件 ====================
const startPeriod = ref('')
const endPeriod = ref('')
const filterWarehouse = ref('')
const warehouseOptions = ref<any[]>([])
const activeTab = ref('summary')

const formatDate = (date: any) => date ? dayjs(date).format('YYYY-MM-DD') : '-'

const fetchWarehouseOptions = async () => {
  try {
    const res: any = await getWarehouseOptions()
    warehouseOptions.value = res?.data || res || []
  } catch (e) {}
}

// ==================== KPI 数据 ====================
const kpi = ref<any>({})
const summaryLoading = ref(false)
const summaryData = ref<any[]>([])

const summaryColumns = [
  { title: '盘点单号', dataIndex: 'count_number', width: 160 },
  { title: '期间', dataIndex: 'count_period', width: 80 },
  { title: '仓库', dataIndex: 'warehouse_name', width: 120 },
  { title: '类型', dataIndex: 'count_type', width: 60 },
  { title: '物料数', dataIndex: 'total_items', width: 70, align: 'center' as const },
  { title: '批次数', dataIndex: 'total_batches', width: 70, align: 'center' as const },
  { title: '相符', dataIndex: 'matched_batches', width: 60, align: 'center' as const },
  { title: '盘盈', dataIndex: 'surplus_batches', width: 60, align: 'center' as const },
  { title: '盘亏', dataIndex: 'shortage_batches', width: 60, align: 'center' as const },
  { title: '盘盈量', dataIndex: 'total_surplus_qty', width: 80, align: 'right' as const },
  { title: '盘亏量', dataIndex: 'total_shortage_qty', width: 80, align: 'right' as const },
  { title: '准确率%', dataIndex: 'accuracy_rate', width: 80, align: 'center' as const },
  { title: '盘点人', dataIndex: 'count_man', width: 80 },
  { title: '完成日期', dataIndex: 'confirmed_date', width: 100 }
]

const fetchSummary = async () => {
  summaryLoading.value = true
  try {
    const params: any = {}
    if (startPeriod.value) params.start_period = startPeriod.value
    if (endPeriod.value) params.end_period = endPeriod.value
    if (filterWarehouse.value) params.warehouse_number = filterWarehouse.value

    const res: any = await getReportSummary(params)
    if (res?.success) {
      summaryData.value = res.data?.items || []
      kpi.value = res.data?.kpi || {}
    }
  } catch (err: any) {
    message.error('获取汇总报表失败')
  } finally { summaryLoading.value = false }
}

// ==================== 差异明细 ====================
const diffLoading = ref(false)
const diffData = ref<any[]>([])
const diffSearch = ref('')
const diffType = ref('')
const diffQualityStatus = ref('')

const diffPagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  pageSizeOptions: ['20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条`
})

const diffColumns = [
  { title: '盘点单号', dataIndex: 'count_number', width: 160 },
  { title: '期间', dataIndex: 'count_period', width: 80 },
  { title: '仓库', dataIndex: 'warehouse_name', width: 110 },
  { title: '物料编号', dataIndex: 'item_number', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', width: 130, ellipsis: true },
  { title: '规格', dataIndex: 'specifications', width: 100, ellipsis: true },
  { title: '批次号', dataIndex: 'batch_number', width: 150 },
  { title: '质量状态', dataIndex: 'quality_status', width: 80, align: 'center' as const },
  { title: '系统数量', dataIndex: 'system_quantity', width: 80, align: 'right' as const },
  { title: '实盘数量', dataIndex: 'actual_quantity', width: 80, align: 'right' as const },
  { title: '差异', dataIndex: 'difference_quantity', width: 80, align: 'right' as const },
  { title: '类型', dataIndex: 'count_status', width: 60, align: 'center' as const },
  { title: '盘点人', dataIndex: 'count_man', width: 80 }
]

const fetchDiffDetail = async () => {
  diffLoading.value = true
  try {
    const params: any = {
      page: diffPagination.current,
      limit: diffPagination.pageSize
    }
    if (startPeriod.value) params.start_period = startPeriod.value
    if (endPeriod.value) params.end_period = endPeriod.value
    if (filterWarehouse.value) params.warehouse_number = filterWarehouse.value
    if (diffSearch.value) params.search = diffSearch.value
    if (diffType.value) params.diff_type = diffType.value
    if (diffQualityStatus.value) params.quality_status = diffQualityStatus.value

    const res: any = await getReportDiffDetail(params)
    if (res?.success) {
      diffData.value = res.data?.items || []
      diffPagination.total = res.data?.total || 0
    }
  } catch (err: any) {
    message.error('获取差异明细失败')
  } finally { diffLoading.value = false }
}

const handleDiffTableChange = (pag: any) => {
  diffPagination.current = pag.current
  diffPagination.pageSize = pag.pageSize
  fetchDiffDetail()
}

// ==================== 趋势数据 ====================
const trendData = ref<any[]>([])
const trendLoading = ref(false)

const fetchTrend = async () => {
  trendLoading.value = true
  try {
    const params: any = { months: 12 }
    if (filterWarehouse.value) params.warehouse_number = filterWarehouse.value
    const res: any = await getReportTrend(params)
    if (res?.success) {
      trendData.value = res.data || []
    }
  } catch (err: any) {
    message.error('获取趋势数据失败')
  } finally { trendLoading.value = false }
}

// ==================== 查询和重置 ====================
const handleQuery = () => {
  fetchSummary()
  fetchDiffDetail()
  fetchTrend()
}

const handleReset = () => {
  startPeriod.value = ''
  endPeriod.value = ''
  filterWarehouse.value = ''
  diffSearch.value = ''
  diffType.value = ''
  diffQualityStatus.value = ''
  diffPagination.current = 1
  handleQuery()
}

onMounted(() => {
  fetchWarehouseOptions()
  handleQuery()
})
</script>

<template>
  <div style="padding: 20px">
    <!-- 筛选栏 -->
    <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
      <span style="color: #666">起始期间:</span>
      <a-month-picker v-model:value="startPeriod" placeholder="起始月" style="width: 130px" format="YYYY-MM" :valueFormat="'YYYY-MM'" />
      <span style="color: #666">~</span>
      <a-month-picker v-model:value="endPeriod" placeholder="结束月" style="width: 130px" format="YYYY-MM" :valueFormat="'YYYY-MM'" />
      <a-select v-model:value="filterWarehouse" placeholder="仓库" allow-clear style="width: 140px">
        <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number">
          {{ w.warehouse_name }}
        </a-select-option>
      </a-select>
      <a-button type="primary" @click="handleQuery"><SearchOutlined /> 查询</a-button>
      <a-button @click="handleReset"><ReloadOutlined /> 重置</a-button>
    </div>

    <!-- KPI 卡片 -->
    <div style="display: flex; gap: 12px; margin-bottom: 16px">
      <a-card size="small" style="flex: 1; text-align: center">
        <a-statistic title="盘点总次数" :value="kpi.total_count || 0" />
      </a-card>
      <a-card size="small" style="flex: 1; text-align: center">
        <a-statistic title="平均准确率" :value="kpi.avg_accuracy || 0" :precision="1" suffix="%" :value-style="{ color: Number(kpi.avg_accuracy || 0) >= 95 ? '#52c41a' : '#faad14' }" />
      </a-card>
      <a-card size="small" style="flex: 1; text-align: center">
        <a-statistic title="总盘盈量" :value="Number(kpi.total_surplus || 0)" :precision="2" :value-style="{ color: '#52c41a' }" />
      </a-card>
      <a-card size="small" style="flex: 1; text-align: center">
        <a-statistic title="总盘亏量" :value="Number(kpi.total_shortage || 0)" :precision="2" :value-style="{ color: '#f5222d' }" />
      </a-card>
    </div>

    <!-- 趋势图区域 -->
    <a-card size="small" title="月度盘点趋势" style="margin-bottom: 16px" :loading="trendLoading">
      <div v-if="trendData.length > 0">
        <a-table :data-source="trendData" :pagination="false" size="small" bordered row-key="count_period">
          <a-table-column title="月份" data-index="count_period" :width="80" />
          <a-table-column title="盘点次数" data-index="count_times" :width="80" align="center" />
          <a-table-column title="盘盈量" :width="100" align="right">
            <template #default="{ record }">
              <span style="color: #52c41a">{{ Number(record.surplus_qty || 0).toFixed(2) }}</span>
            </template>
          </a-table-column>
          <a-table-column title="盘亏量" :width="100" align="right">
            <template #default="{ record }">
              <span style="color: #f5222d">{{ Number(record.shortage_qty || 0).toFixed(2) }}</span>
            </template>
          </a-table-column>
          <a-table-column title="净差异" :width="100" align="right">
            <template #default="{ record }">
              <span :style="{ color: Number(record.net_diff) >= 0 ? '#52c41a' : '#f5222d' }">
                {{ Number(record.net_diff || 0).toFixed(2) }}
              </span>
            </template>
          </a-table-column>
          <a-table-column title="准确率" :width="100" align="center">
            <template #default="{ record }">
              <span :style="{ color: Number(record.accuracy_rate) >= 95 ? '#52c41a' : '#faad14' }">
                {{ Number(record.accuracy_rate || 0).toFixed(1) }}%
              </span>
            </template>
          </a-table-column>
          <a-table-column title="趋势" :width="200">
            <template #default="{ record }">
              <div style="display: flex; align-items: center; gap: 4px">
                <div :style="{ width: Math.min(Number(record.surplus_qty || 0) * 2, 80) + 'px', height: '12px', background: '#52c41a', borderRadius: '2px' }" />
                <div :style="{ width: Math.min(Number(record.shortage_qty || 0) * 2, 80) + 'px', height: '12px', background: '#f5222d', borderRadius: '2px' }" />
              </div>
            </template>
          </a-table-column>
        </a-table>
      </div>
      <a-empty v-else description="暂无趋势数据" />
    </a-card>

    <!-- Tab 切换 -->
    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="summary" tab="盘点汇总">
        <a-table :columns="summaryColumns" :data-source="summaryData" :loading="summaryLoading"
          :pagination="false" row-key="count_number" :scroll="{ x: 1400 }" size="small" bordered>
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'total_surplus_qty'">
              <span style="color: #52c41a">{{ Number(record.total_surplus_qty || 0).toFixed(2) }}</span>
            </template>
            <template v-else-if="column.dataIndex === 'total_shortage_qty'">
              <span style="color: #f5222d">{{ Number(record.total_shortage_qty || 0).toFixed(2) }}</span>
            </template>
            <template v-else-if="column.dataIndex === 'accuracy_rate'">
              <span :style="{ color: Number(record.accuracy_rate) >= 95 ? '#52c41a' : '#faad14', fontWeight: 'bold' }">
                {{ Number(record.accuracy_rate || 0).toFixed(1) }}%
              </span>
            </template>
            <template v-else-if="column.dataIndex === 'confirmed_date'">
              {{ formatDate(record.confirmed_date) }}
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <a-tab-pane key="diff" tab="差异明细">
        <div style="margin-bottom: 12px; display: flex; gap: 8px">
          <a-input-search v-model:value="diffSearch" placeholder="搜索物料编号/名称/批次号" style="width: 260px"
            @search="() => { diffPagination.current = 1; fetchDiffDetail() }" allow-clear />
          <a-select v-model:value="diffType" placeholder="差异类型" allow-clear style="width: 100px"
            @change="() => { diffPagination.current = 1; fetchDiffDetail() }">
            <a-select-option value="盈">盘盈</a-select-option>
            <a-select-option value="亏">盘亏</a-select-option>
          </a-select>
          <a-select v-model:value="diffQualityStatus" placeholder="质量状态" allow-clear style="width: 110px"
            @change="() => { diffPagination.current = 1; fetchDiffDetail() }">
            <a-select-option value="合格品">合格品</a-select-option>
            <a-select-option value="不合格品">不合格品</a-select-option>
          </a-select>
        </div>
        <a-table :columns="diffColumns" :data-source="diffData" :loading="diffLoading"
          :pagination="diffPagination" row-key="id" :scroll="{ x: 1300 }" size="small" bordered
          @change="handleDiffTableChange">
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'quality_status'">
              <a-tag :color="record.quality_status === '合格品' ? 'green' : 'red'" size="small">
                {{ record.quality_status || '合格品' }}
              </a-tag>
            </template>
            <template v-else-if="column.dataIndex === 'system_quantity'">
              {{ Number(record.system_quantity || 0).toFixed(2) }}
            </template>
            <template v-else-if="column.dataIndex === 'actual_quantity'">
              {{ Number(record.actual_quantity || 0).toFixed(2) }}
            </template>
            <template v-else-if="column.dataIndex === 'difference_quantity'">
              <span :style="{ color: Number(record.difference_quantity) > 0 ? '#52c41a' : '#f5222d', fontWeight: 'bold' }">
                {{ Number(record.difference_quantity || 0).toFixed(2) }}
              </span>
            </template>
            <template v-else-if="column.dataIndex === 'count_status'">
              <a-tag :color="record.count_status === '盈' ? 'green' : 'red'" size="small">{{ record.count_status }}</a-tag>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>
