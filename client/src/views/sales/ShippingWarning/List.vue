<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import request from '@/utils/request'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import {
  WarningOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  ReloadOutlined,
  SettingOutlined,
  ExclamationCircleOutlined,
  AlertOutlined
} from '@ant-design/icons-vue'

const route = useRoute()
const isOverdueMode = computed(() => route.path === '/overdue-shipping')

const warningDays = ref(isOverdueMode.value ? -1 : 2)
const kpi = ref<any>({ total: 0, todayCount: 0, tomorrowCount: 0, dayAfterCount: 0 })

const pageTitle = computed(() => isOverdueMode.value ? '逾期发货报告' : '销售发货预警报告')
const pageIconColor = computed(() => isOverdueMode.value ? '#ff4d4f' : '#faad14')

const fetchWarningData = async (params: any) => {
  const res: any = await request.get('/sales-report/shipping-warning', {
    params: { ...params, days: warningDays.value }
  })
  if (res?.success) {
    kpi.value = res.data.kpi || {}
  }
  return res
}

const {
  loading, dataSource, searchText, pagination,
  fetchData, handleTableChange, handleSearch, handleReset
} = useTableList(fetchWarningData)

const defaultColumns: any[] = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 70, resizable: true, align: 'center' },
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 140, resizable: true },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 150, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 110, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, resizable: true },
  { title: '订单数量', dataIndex: 'order_quantity', key: 'order_quantity', width: 100, resizable: true, align: 'right' },
  { title: '已发数量', dataIndex: 'shipped_quantity', key: 'shipped_quantity', width: 100, resizable: true, align: 'right' },
  { title: '待发数量', dataIndex: 'pending_quantity', key: 'pending_quantity', width: 100, resizable: true, align: 'right' },
  { title: '发货状态', dataIndex: 'shipping_status', key: 'shipping_status', width: 100, resizable: true },
  { title: '生产状态', dataIndex: 'production_status', key: 'production_status', width: 110, resizable: true },
  { title: '行状态', dataIndex: 'status', key: 'status', width: 90, resizable: true },
  { title: '承诺交付日期', dataIndex: 'promised_delivery_date', key: 'promised_delivery_date', width: 130, resizable: true },
  { title: '剩余天数', dataIndex: 'remaining_days', key: 'remaining_days', width: 90, resizable: true, align: 'center', fixed: 'right' }
]

const prefKey = computed(() => isOverdueMode.value ? 'overdue_shipping' : 'shipping_warning')
const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference(prefKey.value, defaultColumns, {
  fixedLeft: [{ key: 'sales_order_number', title: '销售订单号', dataIndex: 'sales_order_number', width: 160, resizable: true, fixed: 'left' }],
  fixedRight: [{ key: 'remaining_days', title: '剩余天数', dataIndex: 'remaining_days', width: 90, resizable: true, align: 'center', fixed: 'right' }]
})

const formatDate = (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-'

const getShippingStatusColor = (status: string) => {
  const map: Record<string, string> = { '未申请': 'default', '部分发货': 'processing', '全部发货': 'success', '超额发货': 'warning' }
  return map[status] || 'default'
}

const getProductionStatusColor = (status: string) => {
  const map: Record<string, string> = { '未加入计划': 'default', '已计划': 'processing', '生产中': 'blue', '已完工': 'success' }
  return map[status] || 'default'
}

const getRowClassName = (record: any) => {
  const days = Number(record.remaining_days)
  if (isOverdueMode.value) {
    if (days <= -3) return 'row-danger'
    if (days <= -1) return 'row-warning'
    return ''
  }
  if (days === 0) return 'row-danger'
  if (days === 1) return 'row-warning'
  return ''
}

const handleDaysChange = () => {
  pagination.current = 1
  fetchData()
}

onMounted(async () => {
  await loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div class="warning-container">
    <div class="page-header">
      <h2 class="page-title">
        <component :is="isOverdueMode ? AlertOutlined : WarningOutlined" :style="{ color: pageIconColor, marginRight: '8px' }" />
        {{ pageTitle }}
      </h2>
    </div>

    <!-- KPI 卡片 -->
    <a-row :gutter="[12, 12]" style="margin-bottom: 12px">
      <template v-if="isOverdueMode">
        <a-col :xs="12" :sm="6">
          <a-card hoverable :bodyStyle="{ padding: '12px 16px' }" class="stat-card">
            <a-statistic title="逾期总数" :value="kpi.total || 0" :value-style="{ color: '#ff4d4f', fontSize: '24px', fontWeight: 700 }">
              <template #prefix><ExclamationCircleOutlined /></template>
              <template #suffix><span class="stat-suffix">行</span></template>
            </a-statistic>
          </a-card>
        </a-col>
        <a-col :xs="12" :sm="6">
          <a-card hoverable :bodyStyle="{ padding: '12px 16px' }" class="stat-card stat-danger">
            <a-statistic title="今天到期" :value="kpi.todayCount || 0" :value-style="{ color: '#ff4d4f', fontSize: '24px', fontWeight: 700 }">
              <template #prefix><ClockCircleOutlined /></template>
              <template #suffix><span class="stat-suffix">行</span></template>
            </a-statistic>
          </a-card>
        </a-col>
        <a-col :xs="12" :sm="6">
          <a-card hoverable :bodyStyle="{ padding: '12px 16px' }" class="stat-card stat-warning">
            <a-statistic title="逾期1天" :value="kpi.tomorrowCount || 0" :value-style="{ color: '#fa8c16', fontSize: '24px', fontWeight: 700 }">
              <template #prefix><ClockCircleOutlined /></template>
              <template #suffix><span class="stat-suffix">行</span></template>
            </a-statistic>
          </a-card>
        </a-col>
        <a-col :xs="12" :sm="6">
          <a-card hoverable :bodyStyle="{ padding: '12px 16px' }" class="stat-card">
            <a-statistic title="逾期2-3天" :value="kpi.dayAfterCount || 0" :value-style="{ color: '#1677ff', fontSize: '24px', fontWeight: 700 }">
              <template #prefix><ClockCircleOutlined /></template>
              <template #suffix><span class="stat-suffix">行</span></template>
            </a-statistic>
          </a-card>
        </a-col>
      </template>
      <template v-else>
        <a-col :xs="12" :sm="6">
          <a-card hoverable :bodyStyle="{ padding: '12px 16px' }" class="stat-card">
            <a-statistic title="预警总数" :value="kpi.total || 0" :value-style="{ color: '#faad14', fontSize: '24px', fontWeight: 700 }">
              <template #prefix><ExclamationCircleOutlined /></template>
              <template #suffix><span class="stat-suffix">行</span></template>
            </a-statistic>
          </a-card>
        </a-col>
        <a-col :xs="12" :sm="6">
          <a-card hoverable :bodyStyle="{ padding: '12px 16px' }" class="stat-card stat-danger">
            <a-statistic title="今天到期" :value="kpi.todayCount || 0" :value-style="{ color: '#ff4d4f', fontSize: '24px', fontWeight: 700 }">
              <template #prefix><ClockCircleOutlined /></template>
              <template #suffix><span class="stat-suffix">行</span></template>
            </a-statistic>
          </a-card>
        </a-col>
        <a-col :xs="12" :sm="6">
          <a-card hoverable :bodyStyle="{ padding: '12px 16px' }" class="stat-card stat-warning">
            <a-statistic title="明天到期" :value="kpi.tomorrowCount || 0" :value-style="{ color: '#fa8c16', fontSize: '24px', fontWeight: 700 }">
              <template #prefix><ClockCircleOutlined /></template>
              <template #suffix><span class="stat-suffix">行</span></template>
            </a-statistic>
          </a-card>
        </a-col>
        <a-col :xs="12" :sm="6">
          <a-card hoverable :bodyStyle="{ padding: '12px 16px' }" class="stat-card">
            <a-statistic title="后天到期" :value="kpi.dayAfterCount || 0" :value-style="{ color: '#1677ff', fontSize: '24px', fontWeight: 700 }">
              <template #prefix><ClockCircleOutlined /></template>
              <template #suffix><span class="stat-suffix">行</span></template>
            </a-statistic>
          </a-card>
        </a-col>
      </template>
    </a-row>

    <!-- 数据表 -->
    <a-card :bodyStyle="{ padding: '0' }">
      <template #title>
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px">
          <span style="font-weight: 600">{{ isOverdueMode ? '逾期明细' : '预警明细' }}</span>
          <div style="display: flex; gap: 8px; align-items: center">
            <a-input
              v-model:value="searchText"
              placeholder="搜索订单号/客户/物料"
              style="width: 200px"
              size="small"
              allow-clear
              @pressEnter="handleSearch"
            >
              <template #prefix><SearchOutlined /></template>
            </a-input>
            <a-select v-if="!isOverdueMode" v-model:value="warningDays" size="small" style="width: 100px" @change="handleDaysChange">
              <a-select-option :value="0">今天</a-select-option>
              <a-select-option :value="2">未来3天</a-select-option>
              <a-select-option :value="6">未来7天</a-select-option>
            </a-select>
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
        row-key="detail_id"
        :scroll="{ x: 1600 }"
        size="small"
        bordered
        :row-class-name="getRowClassName"
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'promised_delivery_date'">
            {{ formatDate(record.promised_delivery_date) }}
          </template>
          <template v-else-if="column.key === 'remaining_days'">
            <a-tag :color="record.remaining_days === 0 ? 'red' : record.remaining_days === 1 ? 'orange' : 'blue'">
              {{ record.remaining_days === 0 ? '今天' : record.remaining_days + '天' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'shipped_quantity'">
            <span style="color: #52c41a; font-weight: 600">{{ record.shipped_quantity }}</span>
          </template>
          <template v-else-if="column.key === 'pending_quantity'">
            <span style="color: #ff4d4f; font-weight: 600">{{ record.pending_quantity }}</span>
          </template>
          <template v-else-if="column.key === 'shipping_status'">
            <a-tag :color="getShippingStatusColor(record.shipping_status)">{{ record.shipping_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'production_status'">
            <a-tag :color="getProductionStatusColor(record.production_status)">{{ record.production_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'order_quantity'">
            <span style="font-weight: 600">{{ record.order_quantity }}</span>
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
.warning-container {
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
.stat-card {
  height: 100%;
}
.stat-suffix {
  font-size: 12px;
  color: #8c8c8c;
}
:deep(.row-danger) {
  background-color: #fff2f0 !important;
}
:deep(.row-danger:hover > td) {
  background-color: #ffccc7 !important;
}
:deep(.row-warning) {
  background-color: #fff7e6 !important;
}
:deep(.row-warning:hover > td) {
  background-color: #ffe7ba !important;
}
</style>
