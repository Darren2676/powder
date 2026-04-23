<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined, SettingOutlined, DownloadOutlined } from '@ant-design/icons-vue'
import { getForecastDetailsPage, exportForecastDetailsSelected } from '@/api/sales/forecast'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { generateExportFilename } from '@/utils/exportFilename'
import dayjs from 'dayjs'

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterStatus = ref<string[]>([])
const selectedRowKeys = ref<number[]>([])
const exportLoading = ref(false)

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  preserveSelectedRowKeys: true,
  onChange: (keys: number[]) => { selectedRowKeys.value = keys }
}))

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const defaultDataColumns: any[] = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60 },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 150, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 150, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, resizable: true },
  { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number', width: 110, resizable: true },
  { title: '预测数量', dataIndex: 'forecast_quantity', key: 'forecast_quantity', width: 90, resizable: true },
  { title: '已消耗', dataIndex: 'consumed_quantity', key: 'consumed_quantity', width: 80, resizable: true },
  { title: '剩余数量', dataIndex: 'remaining_quantity', key: 'remaining_quantity', width: 90, resizable: true },
  { title: '消耗状态', dataIndex: 'consumption_status', key: 'consumption_status', width: 90, resizable: true },
  { title: '计划状态', dataIndex: 'status', key: 'status', width: 90, resizable: true },
  { title: '开始日期', dataIndex: 'start_date', key: 'start_date', width: 110, resizable: true },
  { title: '结束日期', dataIndex: 'end_date', key: 'end_date', width: 110, resizable: true },
  { title: '预测日期', dataIndex: 'forecast_date', key: 'forecast_date', width: 110, resizable: true },
  { title: '客户物料号', dataIndex: 'customer_item_number', key: 'customer_item_number', width: 120, resizable: true },
  { title: '客户物料描述', dataIndex: 'customer_item_description', key: 'customer_item_description', width: 140, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, ellipsis: true, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('forecast_details', defaultDataColumns, {
  fixedLeft: [{ title: '预测单号', dataIndex: 'forecast_number', key: 'forecast_number', width: 150, fixed: 'left' as const, resizable: true }],
  fixedRight: []
})

const consumptionStatusColors: Record<string, string> = {
  '未消耗': 'default',
  '部分消耗': 'blue',
  '已消耗': 'green'
}

const formatDate = (date: any) => date ? dayjs(date).format('YYYY-MM-DD') : '-'

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getForecastDetailsPage({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value,
      consumption_status: filterStatus.value.length ? filterStatus.value.join(',') : ''
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取销售预测明细失败')
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleSearch = () => {
  pagination.current = 1
  fetchData()
}

const handleExportSelected = async () => {
  if (!selectedRowKeys.value.length) {
    message.warning('请先勾选要导出的行')
    return
  }
  exportLoading.value = true
  try {
    const res = await exportForecastDetailsSelected({ ids: selectedRowKeys.value })
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = generateExportFilename('forecast_details_selected')
    link.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch {
    message.error('导出选中行失败')
  } finally {
    exportLoading.value = false
  }
}

onMounted(async () => {
  await loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
      <a-input-search
        v-model:value="searchText"
        placeholder="搜索预测单号/产品编号/产品名称/客户名称"
        style="width: 360px"
        @search="handleSearch"
        @pressEnter="handleSearch"
        allow-clear
      >
        <template #prefix><SearchOutlined /></template>
      </a-input-search>
      <a-select
        v-model:value="filterStatus"
        mode="multiple"
        placeholder="全部消耗状态"
        style="min-width: 160px"
        allow-clear
        :max-tag-count="2"
        @change="handleSearch"
      >
        <a-select-option value="未消耗">未消耗</a-select-option>
        <a-select-option value="部分消耗">部分消耗</a-select-option>
        <a-select-option value="已消耗">已消耗</a-select-option>
      </a-select>
      <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
      <a-button type="primary" :loading="exportLoading" :disabled="!selectedRowKeys.length" @click="handleExportSelected"><DownloadOutlined /> 导出选中</a-button>
      <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
    </div>

    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      :row-selection="rowSelection"
      row-key="id"
      :scroll="{ x: 2150 }"
      size="small"
      bordered
      @change="handleTableChange"
      @resizeColumn="handleResizeColumn"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'consumption_status'">
          <a-tag :color="consumptionStatusColors[record.consumption_status] || 'default'">{{ record.consumption_status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="record.status === '已完成' ? 'green' : record.status === '计划中' ? 'blue' : 'default'">{{ record.status || '未开始' }}</a-tag>
        </template>
        <template v-else-if="column.key === 'forecast_quantity'">
          <span style="font-weight: 600">{{ record.forecast_quantity }}</span>
        </template>
        <template v-else-if="column.key === 'consumed_quantity'">
          <span :style="{ color: record.consumed_quantity > 0 ? '#1890ff' : undefined }">{{ record.consumed_quantity }}</span>
        </template>
        <template v-else-if="column.key === 'remaining_quantity'">
          <span :style="{ color: record.remaining_quantity <= 0 ? '#52c41a' : undefined }">{{ record.remaining_quantity }}</span>
        </template>
        <template v-else-if="column.key === 'start_date'">
          {{ formatDate(record.start_date) }}
        </template>
        <template v-else-if="column.key === 'end_date'">
          {{ formatDate(record.end_date) }}
        </template>
        <template v-else-if="column.key === 'forecast_date'">
          {{ formatDate(record.forecast_date) }}
        </template>
      </template>
    </a-table>

    <div v-if="selectedRowKeys.length" style="margin-top: 8px; color: #666; font-size: 13px">
      已选择 <span style="color: #1677ff; font-weight: 600">{{ selectedRowKeys.length }}</span> 条记录
      <a style="margin-left: 8px" @click="selectedRowKeys = []">清空选择</a>
    </div>

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
