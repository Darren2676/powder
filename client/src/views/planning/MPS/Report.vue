<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, DownloadOutlined, CalculatorOutlined, SettingOutlined, SearchOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { calculateMPS, getDemandSources, importFromDemandSources, importToPlan } from '@/api/planning/mps'
import { getCustomers } from '@/api/master-data/customer'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import dayjs from 'dayjs'

// ==================== State ====================
const loading = ref(false)
const dataSource = ref<any[]>([])
const customerOptions = ref<any[]>([])
const selectedRowKeys = ref<string[]>([])
const mpsImportLoading = ref(false)
const filterForm = reactive({
  start_date: '',
  end_date: '',
  customer_number: ''
})

const summaryInfo = reactive({
  total_items: 0,
  items_need_production: 0
})

// ==================== 列定义 ====================
const defaultDataColumns: any[] = [
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 150, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 130, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, resizable: true },
  { title: '预测需求', dataIndex: 'forecast_demand', key: 'forecast_demand', width: 100, align: 'right' as const, resizable: true },
  { title: '原始订单', dataIndex: 'total_order_quantity', key: 'total_order_quantity', width: 100, align: 'right' as const, resizable: true },
  { title: '已发数量', dataIndex: 'total_shipped_quantity', key: 'total_shipped_quantity', width: 100, align: 'right' as const, resizable: true },
  { title: '退货数量', dataIndex: 'total_refunded_quantity', key: 'total_refunded_quantity', width: 100, align: 'right' as const, resizable: true },
  { title: '订单需求', dataIndex: 'order_demand', key: 'order_demand', width: 100, align: 'right' as const, resizable: true },
  { title: '毛需求', dataIndex: 'gross_demand', key: 'gross_demand', width: 100, align: 'right' as const, resizable: true },
  { title: '库存现有', dataIndex: 'on_hand', key: 'on_hand', width: 100, align: 'right' as const, resizable: true },
  { title: '采购在途', dataIndex: 'in_transit', key: 'in_transit', width: 100, align: 'right' as const, resizable: true },
  { title: '生产在途', dataIndex: 'production_in_transit', key: 'production_in_transit', width: 100, align: 'right' as const, resizable: true },
  { title: '安全库存', dataIndex: 'safety_stock', key: 'safety_stock', width: 100, align: 'right' as const, resizable: true },
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('mps_report', defaultDataColumns, {
  fixedLeft: [
    { title: '行号', key: 'row_number', dataIndex: 'row_number', width: 60, align: 'center' as const, fixed: 'left' as const, resizable: true },
    { title: '物料编号', key: 'item_number', dataIndex: 'item_number', width: 130, fixed: 'left' as const, resizable: true }
  ],
  fixedRight: [{ title: '净需求', key: 'net_demand', dataIndex: 'net_demand', width: 110, align: 'right' as const, fixed: 'right' as const, resizable: true }]
})

// ==================== 加载客户选项 ====================
const loadCustomers = async () => {
  try {
    const res: any = await getCustomers({ page: 1, limit: 9999 })
    if (res?.success) {
      customerOptions.value = (res.data?.items || []).map((c: any) => ({
        label: `${c.customer_number} - ${c.customer_name}`,
        value: c.customer_number
      }))
    }
  } catch {}
}
loadCustomers()

onMounted(() => {
  loadColumnPreference()
})

// ==================== 计算 MPS ====================
const handleCalculate = async () => {
  loading.value = true
  try {
    const params: any = {}
    if (filterForm.start_date) params.start_date = filterForm.start_date
    if (filterForm.end_date) params.end_date = filterForm.end_date
    if (filterForm.customer_number) params.customer_number = filterForm.customer_number

    const res: any = await calculateMPS(params)
    if (res?.success) {
      dataSource.value = (res.data?.items || []).map((item: any, index: number) => ({ ...item, row_number: index + 1 }))
      summaryInfo.total_items = res.data?.summary?.total_items || 0
      summaryInfo.items_need_production = res.data?.summary?.items_need_production || 0
      selectedRowKeys.value = []
      message.success(`MPS计算完成，共 ${summaryInfo.total_items} 种物料，${summaryInfo.items_need_production} 种需要生产`)
    }
  } catch (e: any) {
    message.error(e?.response?.data?.message || 'MPS计算失败')
  } finally {
    loading.value = false
  }
}

// ==================== MPS 结果导入生产计划 ====================
const handleMpsImport = () => {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先选择一条物料'); return
  }
  const selected = dataSource.value.find(d => d.item_number === selectedRowKeys.value[0])
  if (!selected || selected.net_demand <= 0) {
    message.warning('请先选择一条净需求大于0的物料'); return
  }

  Modal.confirm({
    title: '确认导入生产计划',
    icon: createVNode(ExclamationCircleOutlined),
    content: `将为选中的物料【${selected.item_number}】创建生产计划，并更新对应预测明细状态为【计划中】，是否继续？`,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      mpsImportLoading.value = true
      try {
        const res: any = await importToPlan({ items: [selected] })
        if (res?.success) {
          message.success(res.message || `成功导入 ${res.data?.imported || 0} 条生产计划`)
          selectedRowKeys.value = []
          handleCalculate()
        }
      } catch (err: any) {
        message.error(err.response?.data?.message || '导入失败')
      } finally {
        mpsImportLoading.value = false
      }
    }
  })
}

// ==================== 从销售订单/预测导入 ====================
const soImportVisible = ref(false)
const soImportLoading = ref(false)
const soImportSubmitLoading = ref(false)
const soImportSearch = ref('')
const soImportData = ref<any[]>([])
const soImportSelectedKeys = ref<number[]>([])

const soImportColumns = [
  { title: '来源类型', dataIndex: 'source_type_name', key: 'source_type_name', width: 90, fixed: 'left' as const },
  { title: '源单号', dataIndex: 'source_number', key: 'source_number', width: 160, fixed: 'left' as const },
  { title: '行号', dataIndex: 'line_number', width: 60 },
  { title: '客户名称', dataIndex: 'customer_name', width: 130 },
  { title: '产品编号', dataIndex: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', width: 140, ellipsis: true },
  { title: '规格', dataIndex: 'specifications', width: 100, ellipsis: true },
  { title: '单位', dataIndex: 'basic_unit', width: 55 },
  { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right' as const },
  { title: '已发货数量', dataIndex: 'shipped_quantity', key: 'shipped_quantity', width: 90, align: 'right' as const },
  { title: '剩余数量', dataIndex: 'remaining_quantity', key: 'remaining_quantity', width: 90, align: 'right' as const },
  { title: '交货/结束日期', dataIndex: 'delivery_date', key: 'delivery_date', width: 110 },
  { title: '发货状态', dataIndex: 'shipping_status', key: 'shipping_status', width: 90 },
  { title: '生产状态', dataIndex: 'production_status', key: 'production_status', width: 90 },
]

const handleSoImportOpen = async () => {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先选择MPS结果表格中的一行'); return
  }
  soImportVisible.value = true
  soImportSelectedKeys.value = []
  soImportSearch.value = ''
  fetchSoImportData()
}

const fetchSoImportData = async () => {
  soImportLoading.value = true
  try {
    const itemNumber = dataSource.value.find(d => d.item_number === selectedRowKeys.value[0])?.item_number
    if (!itemNumber) {
      message.error('未找到选中的物料')
      return
    }
    const res: any = await getDemandSources(itemNumber)
    if (res?.success) {
      let data = res.data || []
      if (soImportSearch.value) {
        const s = soImportSearch.value.toLowerCase()
        data = data.filter((d: any) =>
          (d.source_number || '').toLowerCase().includes(s) ||
          (d.customer_name || '').toLowerCase().includes(s) ||
          (d.item_number || '').toLowerCase().includes(s) ||
          (d.item_name || '').toLowerCase().includes(s)
        )
      }
      soImportData.value = data
    }
  } catch {
    message.error('获取需求来源数据失败')
  } finally {
    soImportLoading.value = false
  }
}

const handleSoImportSubmit = async () => {
  if (soImportSelectedKeys.value.length === 0) {
    message.warning('请先选择需要导入的记录'); return
  }
  const selected = soImportData.value.filter(d => soImportSelectedKeys.value.includes(d.detail_id))

  soImportSubmitLoading.value = true
  try {
    const res: any = await importFromDemandSources({ items: selected })
    if (res?.success) {
      message.success(res.message || `成功导入 ${res.data?.imported || 0} 条生产计划`)
      soImportVisible.value = false
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '导入失败')
  } finally {
    soImportSubmitLoading.value = false
  }
}

// ==================== 工具 ====================
const handleDateChange = (dates: any) => {
  if (dates && dates.length === 2) {
    filterForm.start_date = dayjs(dates[0]).format('YYYY-MM-DD')
    filterForm.end_date = dayjs(dates[1]).format('YYYY-MM-DD')
  } else {
    filterForm.start_date = ''
    filterForm.end_date = ''
  }
}

const getNetDemandColor = (value: number) => {
  if (value > 0) return '#f5222d'
  return '#52c41a'
}

const getShippingStatusColor = (s: string) => {
  if (s === '部分发货') return 'blue'
  if (s === '未发货') return 'orange'
  return 'default'
}

const getProductionStatusColor = (s: string) => {
  if (s === '已加入计划') return 'blue'
  if (s === '生产中') return 'cyan'
  if (s === '生产完成') return 'green'
  return 'default'
}
</script>

<template>
  <div style="padding: 16px">
    <!-- 筛选条件 -->
    <a-card size="small" style="margin-bottom: 16px">
      <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center">
        <span style="font-weight: 500">筛选条件:</span>
        <a-range-picker style="width: 260px" @change="handleDateChange" allowClear />
        <a-select v-model:value="filterForm.customer_number" style="width: 240px" placeholder="客户 (可选)"
          show-search allowClear
          :filter-option="(input: string, option: any) => (option?.label || '').toLowerCase().includes(input.toLowerCase())"
          :options="customerOptions" />
        <a-button type="primary" @click="handleCalculate" :loading="loading">
          <CalculatorOutlined />计算 MPS
        </a-button>
        <a-button @click="handleCalculate" :loading="loading"><ReloadOutlined />刷新</a-button>
        <a-tooltip title="列设置">
          <a-button @click="openColumnSetting"><SettingOutlined /></a-button>
        </a-tooltip>
      </div>
    </a-card>

    <!-- 汇总信息 -->
    <div v-if="dataSource.length > 0" style="margin-bottom: 12px; display: flex; gap: 24px; align-items: center">
      <a-statistic title="物料种数" :value="summaryInfo.total_items" style="margin-right: 16px" />
      <a-statistic title="需生产种数" :value="summaryInfo.items_need_production"
        :value-style="{ color: summaryInfo.items_need_production > 0 ? '#f5222d' : '#52c41a' }" />
      <div style="flex: 1"></div>
      <a-button type="primary" @click="handleMpsImport" :loading="mpsImportLoading" :disabled="selectedRowKeys.length === 0">
        <DownloadOutlined />导入生产计划
      </a-button>
      <a-button type="primary" @click="handleSoImportOpen" :disabled="selectedRowKeys.length === 0">
        <DownloadOutlined />从销售订单导入
      </a-button>
    </div>

    <!-- MPS 结果表格 -->
    <a-table
      :columns="columns" :data-source="dataSource" :loading="loading"
      :pagination="false" :row-key="(r: any) => r.item_number"
      :row-selection="{ type: 'radio', selectedRowKeys: selectedRowKeys, onChange: (keys: string[]) => { selectedRowKeys = keys }, getCheckboxProps: (record: any) => ({ disabled: record.net_demand <= 0 }) }"
      :scroll="{ x: 1200, y: 600 }" size="small" bordered
    >
      <template #bodyCell="{ column, text }">
        <template v-if="column.dataIndex === 'net_demand'">
          <span :style="{ color: getNetDemandColor(text), fontWeight: 'bold' }">{{ text }}</span>
        </template>
        <template v-else-if="column.dataIndex === 'gross_demand'">
          <span style="font-weight: 500">{{ text }}</span>
        </template>
        <template v-else-if="column.dataIndex === 'forecast_demand' || column.dataIndex === 'order_demand'">
          <span>{{ text || 0 }}</span>
        </template>
      </template>
    </a-table>

    <!-- 空状态 -->
    <div v-if="dataSource.length === 0 && !loading" style="text-align: center; padding: 60px 0; color: #999">
      <CalculatorOutlined style="font-size: 48px; margin-bottom: 16px; color: #d9d9d9" />
      <div>请设置筛选条件后点击「计算 MPS」按钮</div>
      <div style="font-size: 12px; margin-top: 8px">
        MPS 将综合销售预测和销售订单的需求，减去库存和在途数量，计算出净生产需求
      </div>
    </div>

    <!-- 从销售订单/预测导入弹窗 -->
    <a-modal
      v-model:open="soImportVisible"
      title="从需求来源导入到生产计划"
      width="1400px"
      :bodyStyle="{ maxHeight: '70vh', overflowY: 'auto' }"
      @ok="handleSoImportSubmit"
      :confirmLoading="soImportSubmitLoading"
      :okText="`确认导入 (${soImportSelectedKeys.length})`"
      :okButtonProps="{ disabled: soImportSelectedKeys.length === 0 }"
    >
      <a-alert
        message="说明：显示当前选中物料的销售订单（未完成发货）和销售预测（未开始）混合列表。选择导入后，系统将自动创建生产计划，并回写对应源单状态。"
        type="info"
        show-icon
        style="margin-bottom: 12px"
      />
      <div style="margin-bottom: 12px">
        <a-input-search
          v-model:value="soImportSearch"
          placeholder="搜索订单号/客户/产品编号/名称"
          style="width: 320px"
          allow-clear
          @search="fetchSoImportData"
          @pressEnter="fetchSoImportData"
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
      </div>
      <a-table
        :columns="soImportColumns"
        :data-source="soImportData"
        :loading="soImportLoading"
        :row-selection="{ selectedRowKeys: soImportSelectedKeys, onChange: (keys: number[]) => { soImportSelectedKeys = keys } }"
        row-key="detail_id"
        :pagination="{ pageSize: 50, showTotal: (total: number) => `共 ${total} 条` }"
        :scroll="{ x: 1600, y: 400 }"
        size="small"
        bordered
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'delivery_date'">
            {{ record.delivery_date ? dayjs(record.delivery_date).format('YYYY-MM-DD') : '-' }}
          </template>
          <template v-else-if="column.key === 'unshipped_quantity'">
            <span :style="{ color: Number(record.unshipped_quantity) > 0 ? '#f5222d' : '', fontWeight: Number(record.unshipped_quantity) > 0 ? 'bold' : 'normal' }">
              {{ record.unshipped_quantity }}
            </span>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag>{{ record.status || '-' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'shipping_status'">
            <a-tag :color="getShippingStatusColor(record.shipping_status)">{{ record.shipping_status || '-' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'production_status'">
            <a-tag :color="getProductionStatusColor(record.production_status)">{{ record.production_status || '未加入计划' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'return_status'">
            <a-tag :color="record.return_status === '已申请' ? 'red' : 'default'">{{ record.return_status || '未申请' }}</a-tag>
          </template>
        </template>
      </a-table>
    </a-modal>

    <!-- 列设置 Drawer -->
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
