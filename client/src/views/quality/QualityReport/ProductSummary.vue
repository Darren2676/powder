<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import {
  SearchOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SafetyCertificateOutlined,
  FileTextOutlined,
  ShoppingOutlined
} from '@ant-design/icons-vue'
import { getProductQualitySummary } from '@/api/quality/qualityReport'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components'
import VChart from 'vue-echarts'

use([
  CanvasRenderer,
  BarChart,
  PieChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
])

// ==================== 状态 ====================

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const dateRange = ref<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
const allDefectDetails = ref<any[]>([])

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `${total} 条`
})

const statsData = reactive({
  total_products: 0,
  total_orders: 0,
  total_reported: 0,
  total_qualified: 0,
  total_unqualified: 0,
  overall_pass_rate: 100
})

// 展开行
const expandedRowKeys = ref<string[]>([])

// ==================== 列定义 ====================

const columns = [
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 120 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 220, ellipsis: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, align: 'center' as const },
  { title: '生产单数', dataIndex: 'order_count', key: 'order_count', width: 90, align: 'right' as const },
  { title: '报工次数', dataIndex: 'report_count', key: 'report_count', width: 90, align: 'right' as const },
  { title: '报工总量', dataIndex: 'total_reported', key: 'total_reported', width: 90, align: 'right' as const },
  { title: '合格总量', dataIndex: 'total_qualified', key: 'total_qualified', width: 90, align: 'right' as const },
  { title: '不合格量', dataIndex: 'total_unqualified', key: 'total_unqualified', width: 90, align: 'right' as const },
  { title: '合格率', dataIndex: 'overall_pass_rate', key: 'overall_pass_rate', width: 90, align: 'right' as const },
  { title: '缺陷报工', dataIndex: 'defect_report_count', key: 'defect_report_count', width: 90, align: 'center' as const }
]

// 缺陷明细列
const defectColumns = [
  { title: '缺陷分类', dataIndex: 'defect_class_name', key: 'defect_class_name', width: 120 },
  { title: '缺陷名称', dataIndex: 'defect_name', key: 'defect_name', width: 120 },
  { title: '发生工序', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 120 },
  { title: '发生次数', dataIndex: 'occurrence_count', key: 'occurrence_count', width: 100, align: 'right' as const },
  { title: '不合格数', dataIndex: 'defect_qty', key: 'defect_qty', width: 100, align: 'right' as const },
  { title: '占比', key: 'ratio', width: 100, align: 'right' as const }
]

// ==================== 图表 ====================

const defectPieOption = computed(() => {
  if (!allDefectDetails.value?.length) return {}
  // 按 defect_class_name 汇总
  const classMap: Record<string, number> = {}
  for (const d of allDefectDetails.value) {
    const key = d.defect_class_name || '未分类'
    classMap[key] = (classMap[key] || 0) + (parseFloat(d.defect_qty) || 0)
  }
  const data = Object.entries(classMap).map(([name, value]) => ({ name, value }))
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c}件 ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [{
      type: 'pie',
      radius: ['35%', '60%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{c}件' },
      data
    }]
  }
})

const defectBarOption = computed(() => {
  if (!allDefectDetails.value?.length) return {}
  // 按 defect_name + process 展示
  const items = allDefectDetails.value.slice(0, 10)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 120, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: items.map((d: any) => `${d.defect_name}(${d.standard_process_name})`).reverse(),
      axisLabel: { fontSize: 11 }
    },
    series: [{
      type: 'bar',
      data: items.map((d: any) => parseFloat(d.defect_qty) || 0).reverse(),
      itemStyle: { color: '#ff4d4f', borderRadius: [0, 4, 4, 0] },
      barMaxWidth: 24
    }]
  }
})

// ==================== 数据加载 ====================

const fetchData = async (page = 1, pageSize = pagination.pageSize) => {
  loading.value = true
  try {
    const params: any = { page, limit: pageSize }
    if (searchText.value) params.search = searchText.value
    if (dateRange.value) {
      params.start_date = dateRange.value[0].format('YYYY-MM-DD')
      params.end_date = dateRange.value[1].format('YYYY-MM-DD')
    }

    const res: any = await getProductQualitySummary(params)
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
      pagination.current = page
      pagination.pageSize = pageSize
      allDefectDetails.value = res.data.all_defect_details || []

      if (res.data.stats) {
        const s = res.data.stats
        statsData.total_products = parseInt(s.total_products) || 0
        statsData.total_orders = parseInt(s.total_orders) || 0
        statsData.total_reported = parseInt(s.total_reported) || 0
        statsData.total_qualified = parseInt(s.total_qualified) || 0
        statsData.total_unqualified = parseInt(s.total_unqualified) || 0
        statsData.overall_pass_rate = parseFloat(s.overall_pass_rate) || 100
      }
    }
  } catch (e: any) {
    message.error('获取数据失败: ' + (e.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  fetchData(pag.current, pag.pageSize)
}

const handleSearch = () => {
  fetchData(1)
}

const handleReset = () => {
  searchText.value = ''
  dateRange.value = null
  fetchData(1)
}

// ==================== 工具函数 ====================

const getPassRateColor = (rate: number) => {
  if (rate >= 99) return '#52c41a'
  if (rate >= 95) return '#1890ff'
  if (rate >= 90) return '#faad14'
  return '#ff4d4f'
}

const getDefectRatio = (qty: number, record: any) => {
  const parentItem = dataSource.value.find((d: any) => d.item_number === record.item_number)
  const totalUnqualified = parentItem ? parseFloat(parentItem.total_unqualified) || 0 : 0
  if (totalUnqualified <= 0) return '-'
  return ((qty / totalUnqualified) * 100).toFixed(1) + '%'
}

// ==================== 初始化 ====================

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="product-quality-page">
    <!-- 搜索栏 -->
    <a-card size="small" :bordered="false" style="margin-bottom: 16px;">
      <a-form layout="inline" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
        <a-form-item label="搜索" style="margin-bottom: 0;">
          <a-input-search
            v-model:value="searchText"
            placeholder="产品编号/名称"
            style="width: 220px;"
            allow-clear
            @search="handleSearch"
          />
        </a-form-item>
        <a-form-item label="日期范围" style="margin-bottom: 0;">
          <a-range-picker
            v-model:value="dateRange"
            :placeholder="['开始日期', '结束日期']"
            style="width: 240px;"
            @change="handleSearch"
          />
        </a-form-item>
        <a-form-item style="margin-bottom: 0;">
          <a-space>
            <a-button type="primary" @click="handleSearch">
              <template #icon><SearchOutlined /></template>
              查询
            </a-button>
            <a-button @click="handleReset">
              <template #icon><ReloadOutlined /></template>
              重置
            </a-button>
          </a-space>
        </a-form-item>
      </a-form>
    </a-card>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="整体合格率"
          :value="statsData.overall_pass_rate"
          suffix="%"
          :value-style="{ color: getPassRateColor(statsData.overall_pass_rate), fontSize: '28px', fontWeight: 700 }"
        >
          <template #prefix><SafetyCertificateOutlined /></template>
        </a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="涉及产品数"
          :value="statsData.total_products"
          :value-style="{ color: '#1890ff', fontSize: '28px', fontWeight: 700 }"
        >
          <template #prefix><ShoppingOutlined /></template>
        </a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="报工总量 / 合格总量"
          :value="statsData.total_reported"
          :value-style="{ color: '#52c41a', fontSize: '28px', fontWeight: 700 }"
        >
          <template #prefix><CheckCircleOutlined /></template>
          <template #suffix>
            <span style="font-size: 14px; color: #999; margin-left: 4px;">/ {{ statsData.total_qualified }}</span>
          </template>
        </a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="不合格总量"
          :value="statsData.total_unqualified"
          :value-style="{ color: statsData.total_unqualified > 0 ? '#ff4d4f' : '#999', fontSize: '28px', fontWeight: 700 }"
        >
          <template #prefix><CloseCircleOutlined /></template>
        </a-statistic>
      </a-card>
    </div>

    <!-- 产品质量汇总表 -->
    <a-card size="small" :bordered="false" title="按产品质量汇总" style="margin-bottom: 16px;">
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 1300 }"
        row-key="item_number"
        size="small"
        :expandedRowKeys="expandedRowKeys"
        @update:expandedRowKeys="(keys: string[]) => expandedRowKeys = keys"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, text }">
          <template v-if="column.key === 'overall_pass_rate'">
            <span :style="{ color: getPassRateColor(parseFloat(text)), fontWeight: 600 }">
              {{ text }}%
            </span>
          </template>
          <template v-else-if="column.key === 'total_unqualified'">
            <a-tag v-if="parseFloat(text) > 0" color="error">{{ text }}</a-tag>
            <span v-else style="color: #999;">0</span>
          </template>
          <template v-else-if="column.key === 'defect_report_count'">
            <a-tag v-if="parseFloat(text) > 0" color="warning">{{ text }}</a-tag>
            <span v-else style="color: #999;">0</span>
          </template>
        </template>

        <!-- 展开行 - 缺陷分类明细 -->
        <template #expandedRowRender="{ record }">
          <div style="padding: 8px 0;">
            <template v-if="record.defect_details && record.defect_details.length > 0">
              <div style="font-weight: 600; margin-bottom: 8px; color: #333;">
                缺陷分类明细 - {{ record.item_name }}（{{ record.item_number }}）
              </div>
              <a-table
                :columns="defectColumns"
                :data-source="record.defect_details"
                :pagination="false"
                row-key="defect_name"
                size="small"
                :bordered="true"
              >
                <template #bodyCell="{ column, record: defectRecord, text }">
                  <template v-if="column.key === 'defect_qty'">
                    <span style="color: #ff4d4f; font-weight: 600;">{{ text }}</span>
                  </template>
                  <template v-else-if="column.key === 'ratio'">
                    {{ getDefectRatio(parseFloat(defectRecord.defect_qty) || 0, defectRecord) }}
                  </template>
                </template>
              </a-table>
            </template>
            <a-empty v-else description="该产品无缺陷记录" :image-style="{ height: '40px' }" />
          </div>
        </template>
      </a-table>
    </a-card>

    <!-- 缺陷分析图表 -->
    <a-row :gutter="16">
      <a-col :span="12">
        <a-card size="small" :bordered="false" title="缺陷分类分布">
          <v-chart
            v-if="allDefectDetails.length"
            :option="defectPieOption"
            style="height: 300px; width: 100%;"
            autoresize
          />
          <a-empty v-else description="暂无缺陷数据" style="padding: 40px 0;" />
        </a-card>
      </a-col>
      <a-col :span="12">
        <a-card size="small" :bordered="false" title="缺陷TOP排名">
          <v-chart
            v-if="allDefectDetails.length"
            :option="defectBarOption"
            style="height: 300px; width: 100%;"
            autoresize
          />
          <a-empty v-else description="暂无缺陷数据" style="padding: 40px 0;" />
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<style scoped>
.product-quality-page {
  padding: 0;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  text-align: center;
}
</style>
