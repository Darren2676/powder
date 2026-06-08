<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import {
  SearchOutlined, ReloadOutlined, AppstoreOutlined, DatabaseOutlined,
  UnorderedListOutlined, ExclamationCircleOutlined, EyeOutlined
} from '@ant-design/icons-vue'
import { getScrapInventoryKPI, getScrapInventoryChartData, getScrapInventoryTableData } from '@/api/quality/scrapInventoryReport'
import { getFactories } from '@/api/system/factory'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, BarChart, PieChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const loading = ref(false)
const activeTab = ref('chart')
const searchText = ref('')

const statsData = reactive({ item_types: 0, total_qty: 0, batch_count: 0, overdue_count: 0 })
const chartData = ref<any>({})
const tableData = ref<any[]>([])
const detailVisible = ref(false)
const detailData = ref<any>(null)
const filterFactoryId = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch { /* ignore */ }
}

const pagination = reactive({
  current: 1, pageSize: 20, total: 0,
  showSizeChanger: true, showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `${total} 条`
})

const columns = [
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 150, ellipsis: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, align: 'center' as const },
  { title: '库存数量', dataIndex: 'total_quantity', key: 'total_quantity', width: 100, align: 'right' as const },
  { title: '批次数', dataIndex: 'batch_count', key: 'batch_count', width: 80, align: 'right' as const },
  { title: '最早入库', dataIndex: 'earliest_inbound', key: 'earliest_inbound', width: 110 },
  { title: '最近入库', dataIndex: 'latest_inbound', key: 'latest_inbound', width: 110 },
]

const getParams = () => {
  const params: any = {}
  if (filterFactoryId.value !== undefined && filterFactoryId.value !== null) params.factory_id = filterFactoryId.value
  return params
}

const fetchKPI = async () => {
  try { const res: any = await getScrapInventoryKPI(getParams()); if (res?.success) Object.assign(statsData, res.data) } catch { /* ignore */ }
}
const fetchChartData = async () => {
  try { const res: any = await getScrapInventoryChartData(getParams()); if (res?.success) chartData.value = res.data } catch { /* ignore */ }
}
const fetchTableData = async (page = 1, pageSize = pagination.pageSize) => {
  loading.value = true
  try {
    const params = { ...getParams(), page, limit: pageSize }
    if (searchText.value) params.search = searchText.value
    const res: any = await getScrapInventoryTableData(params)
    if (res?.success) { tableData.value = res.data.items || []; pagination.total = res.data.total || 0; pagination.current = page; pagination.pageSize = pageSize }
  } catch { message.error('获取数据失败') } finally { loading.value = false }
}

const handleSearch = () => { fetchKPI(); fetchChartData(); fetchTableData(1) }
const handleReset = () => { searchText.value = ''; handleSearch() }
const handleTableChange = (pag: any) => { fetchTableData(pag.current, pag.pageSize) }
const showDetail = (record: any) => { detailData.value = record; detailVisible.value = true }

const inventoryPieOption = computed(() => {
  const data = (chartData.value?.inventory_by_item || []).slice(0, 10)
  if (!data.length) return {}
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [{ type: 'pie', radius: ['35%', '60%'], center: ['50%', '45%'],
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{c}' },
      data: data.map((d: any) => ({ name: d.item_name || d.item_number, value: parseFloat(d.total_qty) || 0 }))
    }]
  }
})

const inboundBarOption = computed(() => {
  const data = chartData.value?.monthly_inbound || []
  if (!data.length) return {}
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
    xAxis: { type: 'category', data: data.map((d: any) => d.month) },
    yAxis: { type: 'value', name: '入库数量' },
    series: [{ type: 'bar', barMaxWidth: 24, data: data.map((d: any) => parseFloat(d.qty) || 0), itemStyle: { color: '#1890ff' } }]
  }
})

const backlogBarOption = computed(() => {
  const data = chartData.value?.backlog_items || []
  if (!data.length) return {}
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 100, right: 20, top: 20, bottom: 40 },
    xAxis: { type: 'value', name: '天数' },
    yAxis: { type: 'category', data: data.map((d: any) => d.item_name || d.item_number).reverse() },
    series: [{ type: 'bar', data: data.map((d: any) => parseInt(d.max_days) || 0).reverse(), itemStyle: { color: '#faad14' } }]
  }
})

onMounted(() => { loadFactories(); fetchKPI(); fetchChartData(); fetchTableData() })
</script>

<template>
  <div style="padding: 0;">
    <a-card size="small" :bordered="false" style="margin-bottom: 16px;">
      <a-form layout="inline" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
        <a-form-item label="所属工厂" style="margin-bottom: 0;" v-if="factoryList.length > 0">
          <a-select v-model:value="filterFactoryId" placeholder="全部工厂" allow-clear style="width: 140px;" @change="handleSearch">
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="搜索" style="margin-bottom: 0;">
          <a-input-search v-model:value="searchText" placeholder="物料编号/物料名称" style="width: 220px;" allow-clear @search="handleSearch" />
        </a-form-item>
        <a-form-item style="margin-bottom: 0;">
          <a-space>
            <a-button type="primary" @click="handleSearch"><template #icon><SearchOutlined /></template>查询</a-button>
            <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          </a-space>
        </a-form-item>
      </a-form>
    </a-card>

    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px;">
      <a-card size="small" :bordered="false" style="text-align: center;">
        <a-statistic title="物料种类数" :value="statsData.item_types" :value-style="{ color: '#1890ff', fontSize: '28px', fontWeight: 700 }"><template #prefix><AppstoreOutlined /></template></a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" style="text-align: center;">
        <a-statistic title="库存总量" :value="statsData.total_qty" :value-style="{ color: '#52c41a', fontSize: '28px', fontWeight: 700 }"><template #prefix><DatabaseOutlined /></template></a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" style="text-align: center;">
        <a-statistic title="批次总数" :value="statsData.batch_count" :value-style="{ color: '#faad14', fontSize: '28px', fontWeight: 700 }"><template #prefix><UnorderedListOutlined /></template></a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" style="text-align: center;">
        <a-statistic title="超期积压数" :value="statsData.overdue_count" :value-style="{ color: statsData.overdue_count > 0 ? '#ff4d4f' : '#999', fontSize: '28px', fontWeight: 700 }"><template #prefix><ExclamationCircleOutlined /></template></a-statistic>
      </a-card>
    </div>

    <a-card size="small" :bordered="false">
      <a-tabs v-model:activeKey="activeTab" size="small">
        <a-tab-pane key="chart" tab="图表概览">
          <a-row :gutter="16">
            <a-col :span="12">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">库存分布（按物料）</div>
              <v-chart v-if="chartData?.inventory_by_item?.length" :option="inventoryPieOption" style="height: 280px;" autoresize />
              <a-empty v-else description="暂无数据" />
            </a-col>
            <a-col :span="12">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">批次入库趋势</div>
              <v-chart v-if="chartData?.monthly_inbound?.length" :option="inboundBarOption" style="height: 280px;" autoresize />
              <a-empty v-else description="暂无数据" />
            </a-col>
          </a-row>
          <a-row :gutter="16" style="margin-top: 16px;">
            <a-col :span="24">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">库存积压分析（超7天）</div>
              <v-chart v-if="chartData?.backlog_items?.length" :option="backlogBarOption" style="height: 300px;" autoresize />
              <a-empty v-else description="暂无积压数据" />
            </a-col>
          </a-row>
        </a-tab-pane>
        <a-tab-pane key="detail" tab="库存明细">
          <a-table :columns="columns" :data-source="tableData" :loading="loading" :pagination="pagination" :scroll="{ x: 900 }" row-key="item_number" size="small" @change="handleTableChange">
            <template #bodyCell="{ column, record, text }">
              <template v-if="column.key === 'item_number'">
                <a style="color: #1890ff; cursor: pointer;" @click="showDetail(record)">{{ text }}</a>
              </template>
              <template v-else-if="column.key === 'earliest_inbound' || column.key === 'latest_inbound'">
                {{ text ? dayjs(text).format('YYYY-MM-DD') : '-' }}
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <a-modal v-model:open="detailVisible" :title="'库存详情 - ' + (detailData?.item_name || detailData?.item_number || '')" :width="700" :footer="null" :body-style="{ maxHeight: '70vh', overflowY: 'auto', padding: '16px' }">
      <template v-if="detailData">
        <a-descriptions size="small" :column="2" bordered>
          <a-descriptions-item label="物料编号">{{ detailData.item_number }}</a-descriptions-item>
          <a-descriptions-item label="物料名称">{{ detailData.item_name }}</a-descriptions-item>
          <a-descriptions-item label="规格">{{ detailData.specifications || '-' }}</a-descriptions-item>
          <a-descriptions-item label="单位">{{ detailData.basic_unit || '-' }}</a-descriptions-item>
          <a-descriptions-item label="库存数量">{{ detailData.total_quantity }}</a-descriptions-item>
          <a-descriptions-item label="批次数">{{ detailData.batch_count }}</a-descriptions-item>
          <a-descriptions-item label="最早入库">{{ detailData.earliest_inbound ? dayjs(detailData.earliest_inbound).format('YYYY-MM-DD') : '-' }}</a-descriptions-item>
          <a-descriptions-item label="最近入库">{{ detailData.latest_inbound ? dayjs(detailData.latest_inbound).format('YYYY-MM-DD') : '-' }}</a-descriptions-item>
        </a-descriptions>
      </template>
    </a-modal>
  </div>
</template>
