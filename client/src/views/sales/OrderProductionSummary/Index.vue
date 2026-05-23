<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import request from '@/utils/request'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import {
  BarChartOutlined,
  SearchOutlined,
  ReloadOutlined,
  SettingOutlined,
  CalendarOutlined
} from '@ant-design/icons-vue'

const dateRange = ref<[Dayjs, Dayjs]>([dayjs().subtract(3, 'month'), dayjs()])

const fetchDataFn = async (params: any) => {
  const res: any = await request.get('/sales-report/order-production-summary', {
    params: {
      ...params,
      start_date: dateRange.value[0].format('YYYY-MM-DD'),
      end_date: dateRange.value[1].format('YYYY-MM-DD')
    }
  })
  return res
}

const {
  loading, dataSource, searchText, pagination,
  fetchData, handleTableChange, handleSearch, handleReset
} = useTableList(fetchDataFn)

const defaultColumns: any[] = [
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 140, resizable: true },
  { title: '订单日期', dataIndex: 'order_date', key: 'order_date', width: 110, resizable: true },
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 70, resizable: true, align: 'center' },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 150, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 110, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, resizable: true },
  { title: '订单数量', dataIndex: 'order_quantity', key: 'order_quantity', width: 100, resizable: true, align: 'right' },
  { title: '生产计划号', dataIndex: 'production_number', key: 'production_number', width: 150, resizable: true },
  { title: '计划数', dataIndex: 'plan_planned_quantity', key: 'plan_planned_quantity', width: 100, resizable: true, align: 'right' },
  { title: '生产工单号', dataIndex: 'production_order_number', key: 'production_order_number', width: 160, resizable: true },
  { title: '工单物料编号', dataIndex: 'po_item_number', key: 'po_item_number', width: 130, resizable: true },
  { title: '工单物料名称', dataIndex: 'po_item_name', key: 'po_item_name', width: 150, resizable: true },
  { title: '工单计划数', dataIndex: 'po_planned_quantity', key: 'po_planned_quantity', width: 100, resizable: true, align: 'right' },
  { title: '工单状态', dataIndex: 'po_plan_status', key: 'po_plan_status', width: 90, resizable: true },
  { title: '工单在制品数', dataIndex: 'po_wip_quantity', key: 'po_wip_quantity', width: 110, resizable: true, align: 'right' },
  { title: '工单入库数', dataIndex: 'po_inbound_quantity', key: 'po_inbound_quantity', width: 110, resizable: true, align: 'right' },
  { title: '未完成计划数', dataIndex: 'uncompleted_quantity', key: 'uncompleted_quantity', width: 120, resizable: true, align: 'right' }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('order_production_summary', defaultColumns, {
  fixedLeft: [{ key: 'sales_order_number', title: '销售订单号', dataIndex: 'sales_order_number', width: 160, resizable: true, fixed: 'left' }],
  fixedRight: []
})

const formatDate = (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-'

const getUncompletedColor = (qty: number) => {
  if (qty <= 0) return 'success'
  return 'error'
}

const getPoStatusColor = (status: string) => {
  const map: Record<string, string> = {
    '已完成': 'green',
    '生产中': 'processing',
    '已派发': 'blue',
    '已备料': 'cyan',
    '未开始': 'default'
  }
  return map[status] || 'default'
}

const handleDateChange = () => {
  pagination.current = 1
  fetchData()
}

onMounted(async () => {
  await loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">
        <BarChartOutlined style="color: #1677ff; margin-right: 8px" />
        订单维度生产单报表
      </h2>
    </div>

    <a-card :bodyStyle="{ padding: '0' }">
      <template #title>
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px">
          <span style="font-weight: 600">汇总明细</span>
          <div style="display: flex; gap: 8px; align-items: center">
            <a-range-picker
              v-model:value="dateRange"
              :allow-clear="false"
              format="YYYY-MM-DD"
              style="width: 220px"
              size="small"
              @change="handleDateChange"
            >
              <template #suffixIcon><CalendarOutlined /></template>
            </a-range-picker>
            <a-input
              v-model:value="searchText"
              placeholder="搜索订单号/客户/物料/计划号/工单号"
              style="width: 220px"
              size="small"
              allow-clear
              @pressEnter="handleSearch"
            >
              <template #prefix><SearchOutlined /></template>
            </a-input>
            <a-button type="primary" size="small" @click="handleSearch"><SearchOutlined /> 搜索</a-button>
            <a-button size="small" @click="handleReset"><ReloadOutlined /> 重置</a-button>
            <a-tooltip title="列设置"><a-button size="small" @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
          </div>
        </div>
      </template>
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        row-key="_row_num"
        :scroll="{ x: 2200 }"
        size="small"
        bordered
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'order_date'">
            {{ formatDate(record.order_date) }}
          </template>
          <template v-else-if="column.key === 'order_quantity'">
            <span style="font-weight: 600">{{ record.order_quantity }}</span>
          </template>
          <template v-else-if="column.key === 'plan_planned_quantity'">
            <span style="font-weight: 600">{{ record.plan_planned_quantity }}</span>
          </template>
          <template v-else-if="column.key === 'production_order_number'">
            <span v-if="record.production_order_number" style="color: #1677ff">{{ record.production_order_number }}</span>
            <span v-else style="color: #bfbfbf">-</span>
          </template>
          <template v-else-if="column.key === 'po_plan_status'">
            <a-tag v-if="record.po_plan_status" :color="getPoStatusColor(record.po_plan_status)" size="small">{{ record.po_plan_status }}</a-tag>
            <span v-else style="color: #bfbfbf">-</span>
          </template>
          <template v-else-if="column.key === 'po_wip_quantity'">
            <span :style="{ color: record.po_wip_quantity > 0 ? '#fa8c16' : '#8c8c8c', fontWeight: record.po_wip_quantity > 0 ? '600' : '400' }">{{ record.po_wip_quantity }}</span>
          </template>
          <template v-else-if="column.key === 'po_inbound_quantity'">
            <span style="color: #52c41a; font-weight: 600">{{ record.po_inbound_quantity }}</span>
          </template>
          <template v-else-if="column.key === 'uncompleted_quantity'">
            <a-tag :color="getUncompletedColor(Number(record.uncompleted_quantity))">
              {{ record.uncompleted_quantity }}
            </a-tag>
          </template>
        </template>
      </a-table>
    </a-card>

    <ColumnSettingDrawer
      v-model:open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />
  </div>
</template>

<style scoped>
.page-container {
  background: #f7f8fa;
}
.page-header {
  margin-bottom: 12px;
}
.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #1d2129;
  margin: 0;
}
</style>
