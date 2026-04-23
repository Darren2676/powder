<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { ReloadOutlined, SearchOutlined, DownloadOutlined } from '@ant-design/icons-vue'
import { getInventoryTransactions, getInventoryTransactionStats } from '@/api/integration/xinheyunInventory'
import dayjs from 'dayjs'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

const loading = ref(false)
const exporting = ref(false)
const dataSource = ref<any[]>([])
const statsData = ref<any>(null)

const searchText = ref('')
const operationTypeFilter = ref('')
const dateRange = ref<[any, any] | null>(null)

const pagination = reactive({
  current: 1, pageSize: 10, total: 0, showSizeChanger: true, showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const operationTypeOptions = [
  { value: '', label: '全部类型' },
  { value: 'PRODUCE_IN', label: '生产入库' },
  { value: 'PRODUCE_OUT', label: '生产出库' },
  { value: 'PURCHASE_IN', label: '采购入库' },
  { value: 'PURCHASE_OUT', label: '采购出库' },
  { value: 'SALE_OUT', label: '销售出库' },
  { value: 'SALE_IN', label: '销售退回' },
  { value: 'TRANSFER_IN', label: '调拨入库' },
  { value: 'TRANSFER_OUT', label: '调拨出库' },
  { value: 'OTHER_IN', label: '其他入库' },
  { value: 'OTHER_OUT', label: '其他出库' },
  { value: 'SCRAP_OUT', label: '报废出库' },
  { value: 'OUTSOURCE_IN', label: '委外入库' },
  { value: 'OUTSOURCE_OUT', label: '委外出库' }
]

const columns = [
  { title: '行号', key: 'rowIndex', width: 55, fixed: 'left' as const },
  { title: '单据编号', dataIndex: 'code', key: 'code', width: 130 },
  { title: '操作类型', dataIndex: 'operation_type_name', key: 'operation_type_name', width: 95 },
  { title: '物料编码', dataIndex: 'item_code', key: 'item_code', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
  { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right' as const },
  { title: '合格数量', dataIndex: 'qualified_quantity', key: 'qualified_quantity', width: 90, align: 'right' as const },
  { title: '单位', dataIndex: 'item_unit', key: 'item_unit', width: 60 },
  { title: '仓库', dataIndex: 'warehouse_code', key: 'warehouse_code', width: 110 },
  { title: '库位', dataIndex: 'location_code', key: 'location_code', width: 100 },
  { title: '对方仓库', dataIndex: 'another_warehouse_code', key: 'another_warehouse_code', width: 110 },
  { title: '关联工单', dataIndex: 'relative_order_number', key: 'relative_order_number', width: 130 },
  { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 120 },
  { title: '流转卡号', dataIndex: 'lot_car_code', key: 'lot_car_code', width: 130 },
  { title: '操作员', dataIndex: 'staff_code', key: 'staff_code', width: 80 },
  { title: '申请人', dataIndex: 'applicant', key: 'applicant', width: 80 },
  { title: '申请部门', dataIndex: 'applicant_department', key: 'applicant_department', width: 130 },
  { title: '创建时间', dataIndex: 'xhy_create_time', key: 'xhy_create_time', width: 145 },
  { title: '接收时间', dataIndex: 'received_at', key: 'received_at', width: 145 }
]

const isInbound = (type: string) => type && type.endsWith('_IN')
const isOutbound = (type: string) => type && type.endsWith('_OUT')

const fetchData = async () => {
  loading.value = true
  try {
    const params: any = {
      page: pagination.current,
      limit: pagination.pageSize
    }
    if (searchText.value.trim()) params.search = searchText.value.trim()
    if (operationTypeFilter.value) params.operation_type = operationTypeFilter.value
    if (dateRange.value && dateRange.value[0]) {
      params.startDate = dayjs(dateRange.value[0]).format('YYYY-MM-DD')
      params.endDate = dayjs(dateRange.value[1]).format('YYYY-MM-DD')
    }

    const res = await getInventoryTransactions(params)
    if (res.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.pagination?.total || 0
    }
  } catch {
    message.error('查询出入库记录失败')
  } finally {
    loading.value = false
  }
}

const fetchStats = async () => {
  try {
    const res = await getInventoryTransactionStats()
    if (res.success) {
      statsData.value = res.data
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
  operationTypeFilter.value = ''
  dateRange.value = null
  pagination.current = 1
  fetchData()
}

const formatQty = (val: any): string => {
  if (val === null || val === undefined) return '-'
  const n = parseFloat(val)
  if (isNaN(n)) return '-'
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)
}

const formatTime = (val: any): string => {
  if (!val) return '-'
  return dayjs(val).format('YYYY-MM-DD HH:mm')
}

// 导出 Excel
const handleExport = async () => {
  if (dataSource.value.length === 0) {
    message.warning('没有数据可导出')
    return
  }
  exporting.value = true
  try {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('出入库记录')

    const headers = ['行号', '单据编号', '操作类型', '物料编码', '物料名称', '数量', '合格数量', '单位', '仓库', '库位', '对方仓库', '关联工单', '批次号', '流转卡号', '操作员', '申请人', '创建时间', '接收时间']
    const headerRow = ws.addRow(headers)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1890FF' } }
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
    headerRow.height = 24

    dataSource.value.forEach((row, idx) => {
      ws.addRow([
        idx + 1, row.code, row.operation_type_name,
        row.item_code, row.item_name,
        parseFloat(row.quantity) || 0, parseFloat(row.qualified_quantity) || 0,
        row.item_unit, row.warehouse_code, row.location_code,
        row.another_warehouse_code, row.relative_order_number,
        row.batch_number, row.lot_car_code,
        row.staff_code, row.applicant,
        row.xhy_create_time, formatTime(row.received_at)
      ])
    })

    ws.columns.forEach((col, i) => { col.width = i === 0 ? 6 : 15 })

    ws.eachRow(row => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
        }
      })
    })

    const buf = await wb.xlsx.writeBuffer()
    saveAs(new Blob([buf]), `新核云出入库记录_${new Date().toISOString().slice(0, 10)}.xlsx`)
    message.success('导出成功')
  } catch {
    message.error('导出失败')
  } finally {
    exporting.value = false
  }
}

// 汇总统计
const summaryInfo = computed(() => {
  if (!statsData.value?.summary) return null
  const s = statsData.value.summary
  return {
    totalTransactions: s.total_transactions || 0,
    totalDetails: s.total_details || 0,
    totalInQty: parseFloat(s.total_in_qty || 0).toFixed(0),
    totalOutQty: parseFloat(s.total_out_qty || 0).toFixed(0),
    itemCount: s.item_count || 0,
    warehouseCount: s.warehouse_count || 0
  }
})

onMounted(() => {
  fetchData()
  fetchStats()
})
</script>

<template>
  <div class="inventory-txn-page">
    <a-card title="出入库记录" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索单据编号/物料/仓库/工单"
            style="width: 260px"
            allow-clear
            @search="handleSearch"
            @pressEnter="handleSearch"
          />
          <a-select
            v-model:value="operationTypeFilter"
            :options="operationTypeOptions"
            style="width: 130px"
            @change="handleSearch"
          />
          <a-range-picker
            v-model:value="dateRange"
            style="width: 230px"
            :placeholder="['开始日期', '结束日期']"
            @change="handleSearch"
          />
          <a-button :icon="h(SearchOutlined)" type="primary" @click="handleSearch">查询</a-button>
          <a-button :icon="h(ReloadOutlined)" @click="handleReset">重置</a-button>
          <a-button :icon="h(DownloadOutlined)" :loading="exporting" :disabled="dataSource.length === 0" @click="handleExport">导出</a-button>
        </a-space>
      </template>

      <!-- 统计概览 -->
      <div v-if="summaryInfo" class="stats-bar">
        <a-row :gutter="16">
          <a-col :span="4">
            <a-statistic title="出入库单数" :value="summaryInfo.totalTransactions" :value-style="{ fontSize: '18px', fontWeight: 600 }" />
          </a-col>
          <a-col :span="4">
            <a-statistic title="明细行数" :value="summaryInfo.totalDetails" :value-style="{ fontSize: '18px', fontWeight: 600 }" />
          </a-col>
          <a-col :span="4">
            <a-statistic title="入库总量" :value="summaryInfo.totalInQty" :value-style="{ fontSize: '18px', fontWeight: 600, color: '#52c41a' }" />
          </a-col>
          <a-col :span="4">
            <a-statistic title="出库总量" :value="summaryInfo.totalOutQty" :value-style="{ fontSize: '18px', fontWeight: 600, color: '#ff4d4f' }" />
          </a-col>
          <a-col :span="4">
            <a-statistic title="物料种类" :value="summaryInfo.itemCount" suffix="种" :value-style="{ fontSize: '18px', fontWeight: 600 }" />
          </a-col>
          <a-col :span="4">
            <a-statistic title="涉及仓库" :value="summaryInfo.warehouseCount" suffix="个" :value-style="{ fontSize: '18px', fontWeight: 600 }" />
          </a-col>
        </a-row>
      </div>

      <!-- 数据表格 -->
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 2200, y: 'calc(100vh - 380px)' }"
        row-key="detail_id"
        size="small"
        bordered
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'operation_type_name'">
            <a-tag :color="isInbound(record.operation_type) ? 'green' : isOutbound(record.operation_type) ? 'red' : 'default'">
              {{ record.operation_type_name || record.operation_type || '-' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'quantity'">
            <span :style="{ fontWeight: 600, color: isInbound(record.operation_type) ? '#52c41a' : '#ff4d4f' }">
              {{ isInbound(record.operation_type) ? '+' : '-' }}{{ formatQty(record.quantity) }}
            </span>
          </template>
          <template v-else-if="column.key === 'qualified_quantity'">
            {{ formatQty(record.qualified_quantity) }}
          </template>
          <template v-else-if="column.key === 'received_at'">
            {{ formatTime(record.received_at) }}
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script lang="ts">
import { h } from 'vue'
export default { name: 'InventoryTransactions' }
</script>

<style scoped>
.inventory-txn-page {
  padding: 0;
}

.stats-bar {
  background: #f6f9fc;
  border-radius: 6px;
  padding: 14px 20px;
  margin-bottom: 14px;
  border: 1px solid #e8f0fe;
}
</style>
