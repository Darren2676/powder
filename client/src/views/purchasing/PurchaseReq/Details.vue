<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined, SettingOutlined, DownloadOutlined } from '@ant-design/icons-vue'
import { getPurchaseReqDetailsPage, exportPurchaseReqDetailsSelected } from '@/api/purchasing/purchaseReq'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
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
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60, resizable: true },
  { title: '物料编码', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 160, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, resizable: true },
  { title: '申请数量', dataIndex: 'request_quantity', key: 'request_quantity', width: 100, resizable: true },
  { title: '已转单数量', dataIndex: 'ordered_quantity', key: 'ordered_quantity', width: 100, resizable: true },
  { title: '期望到货日', dataIndex: 'expected_date', key: 'expected_date', width: 110, resizable: true },
  { title: '建议供应商', dataIndex: 'suggested_supplier_name', key: 'suggested_supplier_name', width: 130, resizable: true },
  { title: '行状态', dataIndex: 'status', key: 'status', width: 90, resizable: true },
  { title: '申请人', dataIndex: 'requester', key: 'requester', width: 100, resizable: true },
  { title: '部门', dataIndex: 'request_department', key: 'request_department', width: 100, resizable: true },
  { title: '申请原因', dataIndex: 'request_reason', key: 'request_reason', width: 100, resizable: true },
  { title: '申请日期', dataIndex: 'request_date', key: 'request_date', width: 110, resizable: true },
  { title: '来源单号', dataIndex: 'source_number', key: 'source_number', width: 150, resizable: true },
  { title: '生产计划编号', dataIndex: 'production_number', key: 'production_number', width: 180, ellipsis: true, resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true },
  { title: '执行状态', dataIndex: 'order_status', key: 'order_status', width: 100, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, ellipsis: true, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('purchase_req_details', defaultDataColumns, {
  fixedLeft: [{ title: '采购申请号', dataIndex: 'purchase_req_number', key: 'purchase_req_number', width: 170, fixed: 'left' as const, resizable: true }],
  fixedRight: []
})

const statusColors: Record<string, string> = {
  '未执行': 'default',
  '部分转单': 'blue',
  '已转单': 'green'
}

const formatDate = (date: any) => date ? dayjs(date).format('YYYY-MM-DD') : '-'

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getPurchaseReqDetailsPage({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value,
      status: filterStatus.value.length ? filterStatus.value.join(',') : ''
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取采购申请明细失败')
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
    const res = await exportPurchaseReqDetailsSelected({ ids: selectedRowKeys.value })
    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = generateExportFilename('purchase_req_details_selected')
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
        placeholder="搜索采购申请号/物料编号/物料名称/建议供应商"
        style="width: 380px"
        @search="handleSearch"
        @pressEnter="handleSearch"
        allow-clear
      >
        <template #prefix><SearchOutlined /></template>
      </a-input-search>
      <a-select
        v-model:value="filterStatus"
        mode="multiple"
        placeholder="全部行状态"
        style="min-width: 160px"
        allow-clear
        :max-tag-count="2"
        @change="handleSearch"
      >
        <a-select-option value="未执行">未执行</a-select-option>
        <a-select-option value="部分转单">部分转单</a-select-option>
        <a-select-option value="已转单">已转单</a-select-option>
      </a-select>
      <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
      <a-button :disabled="selectedRowKeys.length === 0" :loading="exportLoading" @click="handleExportSelected">
        <DownloadOutlined /> 导出选中{{ selectedRowKeys.length ? ` (${selectedRowKeys.length})` : '' }}
      </a-button>
      <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
    </div>

    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      :row-selection="rowSelection"
      row-key="id"
      :scroll="{ x: 2400 }"
      size="small"
      bordered
      @change="handleTableChange"
      @resizeColumn="handleResizeColumn"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'request_quantity'">
          <span style="font-weight: 600">{{ record.request_quantity }}</span>
        </template>
        <template v-else-if="column.key === 'ordered_quantity'">
          <span :style="{ color: Number(record.ordered_quantity) > 0 ? '#1890ff' : undefined, fontWeight: Number(record.ordered_quantity) > 0 ? '600' : 'normal' }">{{ record.ordered_quantity }}</span>
        </template>
        <template v-else-if="column.key === 'expected_date'">
          {{ formatDate(record.expected_date) }}
        </template>
        <template v-else-if="column.key === 'request_date'">
          {{ formatDate(record.request_date) }}
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="statusColors[record.status] || 'default'">{{ record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'approval_status'">
          <ApprovalStatusTag :status="record.approval_status" />
        </template>
        <template v-else-if="column.key === 'order_status'">
          <a-tag :color="statusColors[record.order_status] || 'default'">{{ record.order_status }}</a-tag>
        </template>
      </template>
    </a-table>

    <div v-if="selectedRowKeys.length > 0" style="margin-top: 8px; padding: 6px 12px; background: #e6f7ff; border: 1px solid #91d5ff; border-radius: 4px; display: flex; align-items: center; gap: 8px;">
      <span style="color: #666;">已选 <b style="color: #1890ff;">{{ selectedRowKeys.length }}</b> 项</span>
      <a-button size="small" type="link" @click="selectedRowKeys = []">清除选择</a-button>
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
