<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined, DownloadOutlined, EyeOutlined, ProfileOutlined, DownOutlined, SettingOutlined, PrinterOutlined } from '@ant-design/icons-vue'
import { getInventoryList, getInventoryDetail, getFinishedBatchOptions, getWarehouseOptions } from '@/api/warehouse/finishedGoods'
import { getBoxInventory, shippingBoxOutbound } from '@/api/warehouse/packingOrder'
import { generateExportFilename } from '@/utils/exportFilename'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { useModalDrag } from '@/composables/useModalDrag'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import * as XLSX from 'xlsx'
import PrintModal from '@/views/master-data/LabelPrint/PrintModal.vue'
import dayjs from 'dayjs'

const { modalStyle: detailStyle, onDragStart: onDetailDragStart, resetDrag: resetDetailDrag } = useModalDrag()
const { modalStyle: batchStyle, onDragStart: onBatchDragStart, resetDrag: resetBatchDrag } = useModalDrag()

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const warehouseFilter = ref('')
const qualityStatusFilter = ref('')
const warehouseOptions = ref<any[]>([])
const summary = ref<any>({})

const pagination = reactive({
  current: 1,
  pageSize: 15,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '15', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const defaultDataColumns: any[] = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 150, resizable: true },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 180, resizable: true },
  { title: '库存类型', dataIndex: 'inventory_type', key: 'inventory_type', width: 90, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 140, resizable: true },
  { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number', width: 130, resizable: true },
  { title: '基本单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 80, resizable: true },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 140, resizable: true },
  { title: '质量状态', dataIndex: 'quality_status', key: 'quality_status', width: 100, resizable: true },
  { title: '库存数量', dataIndex: 'quantity', key: 'quantity', width: 120, align: 'right' as const, resizable: true },
  { title: '安全库存', dataIndex: 'safety_stock', key: 'safety_stock', width: 100, align: 'right' as const, resizable: true },
  { title: '最后更新', dataIndex: 'last_updated', key: 'last_updated', width: 160, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('inventory_query', defaultDataColumns, {
  fixedLeft: [],
  fixedRight: [{ title: '操作', key: 'action', width: 120, fixed: 'right' as const }]
})

const formatDate = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getInventoryList({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value,
      warehouse_number: warehouseFilter.value,
      quality_status: qualityStatusFilter.value
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
      summary.value = res.data.summary || {}
    }
  } catch {
    message.error('获取库存列表失败')
  } finally {
    loading.value = false
  }
}

const fetchWarehouseOptions = async () => {
  try {
    const res: any = await getWarehouseOptions()
    if (res?.success) {
      warehouseOptions.value = res.data || []
    }
  } catch { /* ignore */ }
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

const handleReset = () => {
  searchText.value = ''
  warehouseFilter.value = ''
  qualityStatusFilter.value = ''
  pagination.current = 1
  fetchData()
}

// ==================== 库存详情弹窗 ====================
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailInventory = ref<any[]>([])
const detailTransactions = ref<any[]>([])
const detailTitle = ref('')
const detailInventoryType = ref('成品')

const detailInventoryColumns = computed(() => {
  if (detailInventoryType.value === '原材料') {
    return [
      { title: '仓库', dataIndex: 'warehouse_name', width: 140 },
      { title: '当前数量', dataIndex: 'quantity', width: 120 },
      { title: '安全库存', dataIndex: 'safety_stock_quantity', width: 100 },
      { title: '最后更新', dataIndex: 'last_updated', key: 'last_updated', width: 160 }
    ]
  }
  return [
    { title: '仓库', dataIndex: 'warehouse_name', width: 140 },
    { title: '质量状态', dataIndex: 'quality_status', key: 'quality_status', width: 100 },
    { title: '当前数量', dataIndex: 'quantity', width: 120 },
    { title: '安全库存', dataIndex: 'safety_stock_quantity', width: 100 },
    { title: '最后更新', dataIndex: 'last_updated', key: 'last_updated', width: 160 }
  ]
})

const detailColumns = [
  { title: '流水编号', dataIndex: 'transaction_number', width: 160 },
  { title: '类型', dataIndex: 'transaction_type', key: 'transaction_type', width: 80 },
  { title: '来源', dataIndex: 'source_type', width: 100 },
  { title: '来源单号', dataIndex: 'source_number', width: 160 },
  { title: '批次号', dataIndex: 'batch_number', width: 150 },
  { title: '数量', dataIndex: 'quantity', width: 90 },
  { title: '变动前', dataIndex: 'before_quantity', width: 90 },
  { title: '变动后', dataIndex: 'after_quantity', width: 90 },
  { title: '操作人', dataIndex: 'operator', width: 100 },
  { title: '操作时间', dataIndex: 'operation_date', key: 'operation_date', width: 160 }
]

const handleViewDetail = async (record: any) => {
  resetDetailDrag()
  detailTitle.value = `${record.item_name} (${record.item_number}) - ${record.warehouse_name}`
  detailInventoryType.value = record.inventory_type || '成品'
  detailVisible.value = true
  detailLoading.value = true
  try {
    const res: any = await getInventoryDetail({
      item_number: record.item_number,
      warehouse_number: record.warehouse_number,
      inventory_type: record.inventory_type
    })
    if (res?.success) {
      detailInventory.value = res.data.inventory || []
      detailTransactions.value = res.data.transactions || []
    }
  } catch {
    message.error('获取库存详情失败')
  } finally {
    detailLoading.value = false
  }
}

// ==================== 批次明细弹窗 ====================
const batchVisible = ref(false)
const batchLoading = ref(false)
const batchData = ref<any[]>([])
const batchTitle = ref('')
const batchSummaryQty = ref(0)
const batchInventoryType = ref('成品')

const batchColumns = computed(() => {
  if (batchInventoryType.value === '原材料') {
    return [
      { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 170 },
      { title: '库存数量', dataIndex: 'quantity', key: 'quantity', width: 100 },
      { title: '初始数量', dataIndex: 'initial_quantity', key: 'initial_quantity', width: 100 },
      { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', width: 160 },
      { title: '生产日期', dataIndex: 'production_date', key: 'production_date', width: 120 },
      { title: '入库日期', dataIndex: 'inbound_date', key: 'inbound_date', width: 160 },
      { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 140 }
    ]
  }
  return [
    { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 170 },
    { title: '库存数量', dataIndex: 'quantity', key: 'quantity', width: 100 },
    { title: '初始数量', dataIndex: 'initial_quantity', key: 'initial_quantity', width: 100 },
    { title: '生产工单', dataIndex: 'production_order_number', key: 'production_order_number', width: 160 },
    { title: '生产日期', dataIndex: 'production_date', key: 'production_date', width: 120 },
    { title: '入库日期', dataIndex: 'inbound_date', key: 'inbound_date', width: 160 },
    { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 140 }
  ]
})

const handleViewBatch = async (record: any) => {
  resetBatchDrag()
  batchTitle.value = `${record.item_name} (${record.item_number}) - ${record.warehouse_name} - 批次明细`
  batchInventoryType.value = record.inventory_type || '成品'
  batchVisible.value = true
  batchLoading.value = true
  batchData.value = []
  batchSummaryQty.value = 0
  try {
    const res: any = await getFinishedBatchOptions({
      item_number: record.item_number,
      warehouse_number: record.warehouse_number,
      inventory_type: record.inventory_type
    })
    if (res?.success) {
      batchData.value = res.data || []
      batchSummaryQty.value = batchData.value.reduce((s: number, b: any) => s + (Number(b.quantity) || 0), 0)
    }
  } catch {
    message.error('获取批次明细失败')
  } finally {
    batchLoading.value = false
  }
}

// ==================== 导出 ====================
const exportLoading = ref(false)

const fetchAllData = async () => {
  const res: any = await getInventoryList({
    page: 1,
    limit: 99999,
    search: searchText.value,
    warehouse_number: warehouseFilter.value,
    quality_status: qualityStatusFilter.value
  })
  return res?.success ? (res.data?.items || []) : []
}

const handleExportExcel = async () => {
  exportLoading.value = true
  try {
    const items = await fetchAllData()
    if (!items.length) { message.warning('没有可导出的数据'); return }
    const headers = defaultDataColumns.map(c => c.title)
    const keys = defaultDataColumns.map(c => c.dataIndex as string)
    const rows = items.map((item: any) => keys.map((k: string) => item[k] ?? ''))
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = headers.map((_, i) => ({ wch: i < 2 ? 18 : 14 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '成品库存查询')
    XLSX.writeFile(wb, generateExportFilename('finished_goods_inventory_query') + '.xlsx')
    message.success(`成功导出 ${items.length} 条记录`)
  } catch {
    message.error('导出失败')
  } finally {
    exportLoading.value = false
  }
}

const handleExportCSV = async () => {
  try {
    const items = await fetchAllData()
    if (!items.length) { message.warning('没有可导出的数据'); return }
    const headers = defaultDataColumns.map(c => c.title)
    const keys = defaultDataColumns.map(c => c.dataIndex as string)
    const rows = items.map((item: any) => keys.map((k: string) => item[k] ?? ''))
    const csv = [headers.join(','), ...rows.map((r: any[]) => r.map((v: any) => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n')
    const bom = '\uFEFF'
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('finished_goods_inventory_query') + '.csv'
    link.click()
    URL.revokeObjectURL(link.href)
    message.success(`成功导出 ${items.length} 条记录`)
  } catch {
    message.error('导出失败')
  }
}

// ==================== 箱装库存 ====================
const activeTab = ref('bulk')
const boxLoading = ref(false)
const boxDataSource = ref<any[]>([])
const boxSearchText = ref('')
const boxWarehouseFilter = ref('')
const boxStatusFilter = ref('在库')
const boxPagination = reactive({
  current: 1,
  pageSize: 15,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '15', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const boxColumns = [
  { title: '箱号', dataIndex: 'box_number', key: 'box_number', width: 170 },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 160 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 70 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
  { title: '箱内数量', dataIndex: 'total_quantity', key: 'total_quantity', width: 100, align: 'right' as const },
  { title: '包含批次', dataIndex: 'batch_numbers', key: 'batch_numbers', width: 200 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 80 },
  { title: '入库时间', dataIndex: 'inbound_date', key: 'inbound_date', width: 150 },
  { title: '出库时间', dataIndex: 'outbound_date', key: 'outbound_date', width: 150 }
]

// 扫箱码出库
const outboundVisible = ref(false)
const outboundLoading = ref(false)
const outboundBoxNumbers = ref('')
const selectedBoxKeys = ref<string[]>([])

const fetchBoxData = async () => {
  boxLoading.value = true
  try {
    const res: any = await getBoxInventory({
      page: boxPagination.current,
      limit: boxPagination.pageSize,
      search: boxSearchText.value,
      warehouse_number: boxWarehouseFilter.value,
      status: boxStatusFilter.value
    })
    if (res?.success) {
      boxDataSource.value = res.data.items || []
      boxPagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取箱装库存失败')
  } finally {
    boxLoading.value = false
  }
}

const handleBoxTableChange = (pag: any) => {
  boxPagination.current = pag.current
  boxPagination.pageSize = pag.pageSize
  fetchBoxData()
}

const handleBoxSearch = () => {
  boxPagination.current = 1
  fetchBoxData()
}

const handleBoxReset = () => {
  boxSearchText.value = ''
  boxWarehouseFilter.value = ''
  boxStatusFilter.value = '在库'
  boxPagination.current = 1
  fetchBoxData()
}

const handleBoxOutbound = () => {
  if (selectedBoxKeys.value.length === 0) {
    message.warning('请选择要出库的箱')
    return
  }
  outboundBoxNumbers.value = selectedBoxKeys.value.join('\n')
  outboundVisible.value = true
}

const confirmOutbound = async () => {
  const boxNumbers = outboundBoxNumbers.value.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
  if (boxNumbers.length === 0) {
    message.warning('请输入箱号')
    return
  }
  outboundLoading.value = true
  try {
    const res: any = await shippingBoxOutbound({
      box_numbers: boxNumbers,
      warehouse_number: boxWarehouseFilter.value || '01'
    })
    if (res?.success) {
      message.success(`成功出库 ${res.data.outbound_boxes?.length || 0} 箱`)
      outboundVisible.value = false
      selectedBoxKeys.value = []
      fetchBoxData()
    }
  } catch {
    message.error('出库失败')
  } finally {
    outboundLoading.value = false
  }
}

const handleTabChange = (key: string) => {
  activeTab.value = key
  if (key === 'box') {
    fetchBoxData()
  }
}

// ==================== 标签打印 ====================
const printLabelVisible = ref(false)
const printLabelRecord = ref<any>(null)

const handlePrintLabel = (record: any) => {
  printLabelRecord.value = record
  printLabelVisible.value = true
}

onMounted(() => {
  loadColumnPreference()
  fetchWarehouseOptions()
  fetchData()
})
</script>

<template>
  <div class="page-header">
    <h2 style="margin: 0; font-size: 18px;">库存查询</h2>
  </div>
  <a-card :bordered="false" style="margin-top: 16px">
    <!-- Tab 切换 -->
    <a-tabs v-model:activeKey="activeTab" @change="handleTabChange">
      <!-- ==================== 散装库存 Tab ==================== -->
      <a-tab-pane key="bulk" tab="散装库存">
    <!-- 汇总统计 -->
    <a-row :gutter="16" style="margin-bottom: 16px">
      <a-col :span="6">
        <a-statistic title="库存总条目" :value="summary.total_items || 0" />
      </a-col>
      <a-col :span="6">
        <a-statistic title="库存总数量" :value="summary.total_quantity || 0" :precision="2" />
      </a-col>
      <a-col :span="6">
        <a-statistic title="涉及仓库数" :value="summary.total_warehouses || 0" />
      </a-col>
      <a-col :span="6">
        <a-statistic title="涉及物料数" :value="summary.total_items || 0" />
      </a-col>
    </a-row>

    <!-- 搜索过滤栏 -->
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px">
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索物料编号/名称/规格/图号"
          style="width: 280px"
          @search="handleSearch"
          @pressEnter="handleSearch"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
        <a-select
          v-model:value="warehouseFilter"
          placeholder="全部仓库"
          allow-clear
          style="width: 140px"
          @change="handleSearch"
        >
          <a-select-option value="">全部仓库</a-select-option>
          <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number">{{ w.warehouse_name }}</a-select-option>
        </a-select>
        <a-select
          v-model:value="qualityStatusFilter"
          placeholder="全部质量状态"
          allow-clear
          style="width: 140px"
          @change="handleSearch"
        >
          <a-select-option value="">全部</a-select-option>
          <a-select-option value="合格品">合格品</a-select-option>
          <a-select-option value="不合格品">不合格品</a-select-option>
          <a-select-option value="待检品">待检品</a-select-option>
        </a-select>
        <a-button @click="handleReset"><ReloadOutlined /> 重置</a-button>
      </div>
      <div style="display: flex; gap: 8px">
        <a-dropdown :trigger="['click']">
          <a-button :loading="exportLoading"><DownloadOutlined /> 导出 <DownOutlined /></a-button>
          <template #overlay>
            <a-menu @click="({ key }: any) => key === 'excel' ? handleExportExcel() : handleExportCSV()">
              <a-menu-item key="excel">导出 Excel (.xlsx)</a-menu-item>
              <a-menu-item key="csv">导出 CSV (.csv)</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
        <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
        <a-button @click="openColumnSetting"><SettingOutlined /> 列设置</a-button>
      </div>
    </div>

    <!-- 库存列表 -->
    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      row-key="id"
      :scroll="{ x: 'max-content' }"
      size="small"
      bordered
      @change="handleTableChange"
      @resizeColumn="handleResizeColumn"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'item_number'">
          <a @click="handleViewDetail(record)" style="color: #1890ff; cursor: pointer">{{ record.item_number }}</a>
        </template>
        <template v-else-if="column.key === 'inventory_type'">
          <a-tag :color="record.inventory_type === '成品' ? 'blue' : 'orange'">{{ record.inventory_type || '-' }}</a-tag>
        </template>
        <template v-else-if="column.key === 'quality_status'">
          <a-tag v-if="record.inventory_type === '原材料'" color="green">合格品</a-tag>
          <a-tag v-else :color="record.quality_status === '合格品' ? 'green' : record.quality_status === '不合格品' ? 'red' : 'orange'">
            {{ record.quality_status || '-' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'quantity'">
          <span :style="{ color: Number(record.quantity) <= Number(record.safety_stock || 0) ? '#ff4d4f' : '#52c41a', fontWeight: 600 }">
            {{ record.quantity }}
          </span>
        </template>
        <template v-else-if="column.key === 'last_updated'">
          {{ formatDate(record.last_updated) }}
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="handleViewDetail(record)"><EyeOutlined /> 详情</a-button>
            <a-button type="link" size="small" @click="handleViewBatch(record)"><ProfileOutlined /> 批次</a-button>
            <a-button type="link" size="small" @click="handlePrintLabel(record)"><PrinterOutlined /> 标签</a-button>
          </a-space>
        </template>
      </template>
    </a-table>
      </a-tab-pane>

      <!-- ==================== 箱装库存 Tab ==================== -->
      <a-tab-pane key="box" tab="箱装库存">
    <!-- 搜索过滤栏 -->
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px">
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
        <a-input-search
          v-model:value="boxSearchText"
          placeholder="搜索箱号/物料编号/名称/批次"
          style="width: 280px"
          @search="handleBoxSearch"
          @pressEnter="handleBoxSearch"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
        <a-select
          v-model:value="boxWarehouseFilter"
          placeholder="全部仓库"
          allow-clear
          style="width: 140px"
          @change="handleBoxSearch"
        >
          <a-select-option value="">全部仓库</a-select-option>
          <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number">{{ w.warehouse_name }}</a-select-option>
        </a-select>
        <a-select
          v-model:value="boxStatusFilter"
          placeholder="全部状态"
          allow-clear
          style="width: 120px"
          @change="handleBoxSearch"
        >
          <a-select-option value="">全部</a-select-option>
          <a-select-option value="在库">在库</a-select-option>
          <a-select-option value="已出库">已出库</a-select-option>
          <a-select-option value="已拆箱">已拆箱</a-select-option>
        </a-select>
        <a-button @click="handleBoxReset"><ReloadOutlined /> 重置</a-button>
      </div>
      <div style="display: flex; gap: 8px">
        <a-button type="primary" danger :disabled="selectedBoxKeys.length === 0" @click="handleBoxOutbound">扫箱码出库</a-button>
        <a-button @click="fetchBoxData"><ReloadOutlined /> 刷新</a-button>
      </div>
    </div>

    <!-- 箱装库存列表 -->
    <a-table
      :columns="boxColumns"
      :data-source="boxDataSource"
      :loading="boxLoading"
      :pagination="boxPagination"
      row-key="box_number"
      :scroll="{ x: 1400 }"
      size="small"
      bordered
      :row-selection="{ selectedRowKeys: selectedBoxKeys, onChange: (keys: any) => selectedBoxKeys = keys }"
      @change="handleBoxTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'box_number'">
          <span style="font-family: monospace; font-weight: 600">{{ record.box_number }}</span>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="record.status === '在库' ? 'green' : record.status === '已出库' ? 'red' : record.status === '已拆箱' ? 'orange' : 'blue'">{{ record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'total_quantity'">
          <span style="color: #52c41a; font-weight: 600">{{ record.total_quantity }}</span>
        </template>
        <template v-else-if="column.key === 'batch_numbers'">
          <span v-for="(bn, idx) in (record.batch_numbers || '').split(',')" :key="idx">
            <a-tag v-if="bn" style="margin-bottom: 2px">{{ bn }}</a-tag>
          </span>
        </template>
        <template v-else-if="column.key === 'inbound_date' || column.key === 'outbound_date'">
          {{ formatDate(record[column.dataIndex as string]) }}
        </template>
      </template>
    </a-table>
      </a-tab-pane>
    </a-tabs>

    <!-- 库存详情弹窗 -->
    <a-modal
      v-model:open="detailVisible"
      width="1100px"
      :bodyStyle="{ maxHeight: '75vh', overflowY: 'auto' }"
      :footer="null"
      :style="detailStyle"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onDetailDragStart">库存详情 - {{ detailTitle }}</div>
      </template>
      <a-spin :spinning="detailLoading">
        <div style="font-weight: 600; margin-bottom: 8px">汇总库存</div>
        <a-table
          :columns="detailInventoryColumns"
          :data-source="detailInventory"
          :pagination="false"
          row-key="id"
          size="small"
          bordered
          style="margin-bottom: 16px"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'quality_status'">
              <a-tag :color="record.quality_status === '合格品' ? 'green' : record.quality_status === '不合格品' ? 'red' : 'orange'">
                {{ record.quality_status || '-' }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'last_updated'">
              {{ formatDate(record.last_updated || record.update_date) }}
            </template>
          </template>
        </a-table>

        <div style="font-weight: 600; margin-bottom: 8px">最近流水记录</div>
        <a-table
          :columns="detailColumns"
          :data-source="detailTransactions"
          :pagination="false"
          row-key="id"
          size="small"
          bordered
          :scroll="{ x: 1300 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'transaction_type'">
              <a-tag :color="record.transaction_type === '入库' ? 'green' : record.transaction_type === '出库' ? 'red' : 'blue'">
                {{ record.transaction_type }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'operation_date'">
              {{ formatDate(record.operation_date) }}
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-modal>

    <!-- 批次明细弹窗 -->
    <a-modal
      v-model:open="batchVisible"
      width="1000px"
      :bodyStyle="{ maxHeight: '75vh', overflowY: 'auto' }"
      :footer="null"
      :style="batchStyle"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onBatchDragStart">批次明细 - {{ batchTitle }}</div>
      </template>
      <a-spin :spinning="batchLoading">
        <div style="margin-bottom: 16px; display: flex; gap: 32px">
          <a-statistic title="批次数量" :value="batchData.length" />
          <a-statistic title="批次库存合计" :value="batchSummaryQty" :precision="2" />
        </div>
        <a-table
          :columns="batchColumns"
          :data-source="batchData"
          :pagination="false"
          row-key="batch_number"
          size="small"
          bordered
          :scroll="{ x: 900 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'production_date'">
              {{ record.production_date ? dayjs(record.production_date).format('YYYY-MM-DD') : '-' }}
            </template>
            <template v-else-if="column.key === 'inbound_date'">
              {{ formatDate(record.inbound_date) }}
            </template>
            <template v-else-if="column.key === 'quantity'">
              <span :style="{ color: '#52c41a', fontWeight: 600 }">{{ record.quantity }}</span>
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-modal>

    <!-- 标签打印弹窗 -->
    <PrintModal v-model:visible="printLabelVisible" :record="printLabelRecord" />

    <ColumnSettingDrawer
      :open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @update:open="columnSettingVisible = $event"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />

    <!-- 扫箱码出库弹窗 -->
    <a-modal
      v-model:open="outboundVisible"
      title="扫箱码出库"
      width="500px"
      :confirm-loading="outboundLoading"
      @ok="confirmOutbound"
    >
      <a-form :label-col="{ span: 6 }">
        <a-form-item label="出库箱号">
          <a-textarea
            v-model:value="outboundBoxNumbers"
            placeholder="箱号列表，每行一个或用逗号分隔"
            :auto-size="{ minRows: 3, maxRows: 8 }"
          />
        </a-form-item>
      </a-form>
      <div style="color: #999; font-size: 12px; margin-top: 8px">
        已选择 {{ selectedBoxKeys.length }} 箱，出库后箱状态将变更为"已出库"，库存数量将同步扣减
      </div>
    </a-modal>
  </a-card>
</template>

<style scoped>
.page-header {
  padding: 0 0 4px 0;
}
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
