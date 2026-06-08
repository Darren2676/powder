<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined, SettingOutlined, DownloadOutlined, SendOutlined } from '@ant-design/icons-vue'
import { getPurchaseOrderDetailsPage, exportPurchaseOrderDetailsSelected } from '@/api/purchasing/purchaseOrder'
import { createReceivingNotice } from '@/api/purchasing/receivingNotice'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { getFactories } from '@/api/system/factory'
import { generateExportFilename } from '@/utils/exportFilename'
import dayjs from 'dayjs'

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterReceiveStatus = ref<string[]>([])
const filterApprovalStatus = ref<string[]>([])
const selectedRowKeys = ref<number[]>([])
const exportLoading = ref(false)

// 工厂筛选
const factoryList = ref<any[]>([])
const filterFactory = ref<number | undefined>(undefined)
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch { /* ignore */ }
}

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
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60, resizable: true },
  { title: '物料编码', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 160, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, resizable: true },
  { title: '订单数量', dataIndex: 'order_quantity', key: 'order_quantity', width: 100, resizable: true },
  { title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 90, resizable: true },
  { title: '金额', dataIndex: 'total_amount', key: 'total_amount', width: 100, resizable: true },
  { title: '已入库数量', dataIndex: 'received_quantity', key: 'received_quantity', width: 100, resizable: true },
  { title: '交货日期', dataIndex: 'delivery_date', key: 'delivery_date', width: 110, resizable: true },
  { title: '到货状态', dataIndex: 'receive_status', key: 'receive_status', width: 90, resizable: true },
  { title: '供应商名称', dataIndex: 'supplier_name', key: 'supplier_name', width: 130, resizable: true },
  { title: '采购负责人', dataIndex: 'procurement_manager', key: 'procurement_manager', width: 100, resizable: true },
  { title: '订单日期', dataIndex: 'order_date', key: 'order_date', width: 110, resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true },
  { title: '执行状态', dataIndex: 'order_status', key: 'order_status', width: 100, resizable: true },
  { title: '来源申请号', dataIndex: 'source_req_number', key: 'source_req_number', width: 150, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, ellipsis: true, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('purchase_order_details', defaultDataColumns, {
  fixedLeft: [{ title: '采购订单号', dataIndex: 'purchase_order_number', key: 'purchase_order_number', width: 170, fixed: 'left' as const, resizable: true }],
  fixedRight: []
})

const receiveStatusColors: Record<string, string> = {
  '未到货': 'default',
  '部分到货': 'blue',
  '已到货': 'green'
}

const orderStatusColors: Record<string, string> = {
  '待执行': 'default',
  '部分执行': 'blue',
  '已执行': 'green',
  '已关闭': 'orange'
}

const formatDate = (date: any) => date ? dayjs(date).format('YYYY-MM-DD') : '-'

// ==================== 采购收货通知 ====================
const rnVisible = ref(false)
const rnForm = reactive({ purchase_order_number: '', delivery_note: '', receiving_date: dayjs().format('YYYY-MM-DD'), remark: '' })
const rnDetails = ref<any[]>([])
const rnSaving = ref(false)

const openCreateReceivingNotice = () => {
  const selectedRows = dataSource.value.filter((r: any) => selectedRowKeys.value.includes(r.id))
  if (!selectedRows.length) { message.warning('请先勾选要创建收货通知的明细行'); return }

  // 校验：必须是同一个采购订单
  const poNumbers = [...new Set(selectedRows.map((r: any) => r.purchase_order_number))]
  if (poNumbers.length > 1) { message.warning('请选择同一个采购订单的明细行'); return }

  // 校验：必须已审批
  const notApproved = selectedRows.find((r: any) => (r.approval_status || '').trim() !== '已审批')
  if (notApproved) { message.warning('只有"已审批"状态的订单明细才能创建收货通知'); return }

  // 校验：不能全部已到货
  const allReceived = selectedRows.every((r: any) => (r.receive_status || '').trim() === '已到货')
  if (allReceived) { message.warning('所选明细已全部到货，无需再创建收货通知'); return }

  rnForm.purchase_order_number = poNumbers[0]
  rnForm.delivery_note = ''
  rnForm.receiving_date = dayjs().format('YYYY-MM-DD')
  rnForm.remark = ''

  rnDetails.value = selectedRows
    .filter((r: any) => (r.receive_status || '').trim() !== '已到货')
    .map((r: any) => ({
      ...r,
      remaining: parseFloat(r.order_quantity || 0) - parseFloat(r.received_quantity || 0),
      receiving_quantity: parseFloat(r.order_quantity || 0) - parseFloat(r.received_quantity || 0)
    }))

  rnVisible.value = true
}

const handleSaveReceivingNotice = async () => {
  const validItems = rnDetails.value.filter((d: any) => (parseFloat(d.receiving_quantity) || 0) > 0)
  if (!validItems.length) { message.warning('请填写收货数量'); return }

  Modal.confirm({
    title: '确认创建收货通知',
    icon: () => null,
    content: `将为采购订单 ${rnForm.purchase_order_number} 创建收货通知，共 ${validItems.length} 项物料。`,
    okText: '确认创建',
    cancelText: '取消',
    onOk: async () => {
      rnSaving.value = true
      try {
        await createReceivingNotice({
          purchase_order_number: rnForm.purchase_order_number,
          delivery_note: rnForm.delivery_note,
          receiving_date: rnForm.receiving_date,
          remark: rnForm.remark,
          details: validItems.map((d: any) => ({
            purchase_detail_id: d.id,
            item_number: d.item_number,
            item_name: d.item_name,
            specifications: d.specifications,
            basic_unit: d.basic_unit,
            order_quantity: d.order_quantity,
            received_quantity: d.received_quantity,
            receiving_quantity: d.receiving_quantity,
            remark: ''
          }))
        })
        message.success('创建收货通知成功')
        rnVisible.value = false
        selectedRowKeys.value = []
        fetchData()
      } catch {
        message.error('创建收货通知失败')
      } finally {
        rnSaving.value = false
      }
    }
  })
}

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getPurchaseOrderDetailsPage({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value,
      receive_status: filterReceiveStatus.value.length ? filterReceiveStatus.value.join(',') : '',
      approval_status: filterApprovalStatus.value.length ? filterApprovalStatus.value.join(',') : '',
      factory_id: filterFactory.value
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取采购订单明细失败')
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
    const res = await exportPurchaseOrderDetailsSelected({ ids: selectedRowKeys.value })
    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = generateExportFilename('purchase_order_details_selected')
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
  loadFactories()
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
      <h3 style="margin: 0; white-space: nowrap; flex-shrink: 0">采购订单明细</h3>
      <div style="display: flex; gap: 6px; align-items: center; flex-wrap: nowrap">
        <a-select v-model:value="filterFactory" placeholder="工厂" allow-clear style="width:120px;flex-shrink:0" size="small" @change="fetchData">
          <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
        </a-select>
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索订单号/物料/供应商"
          style="width: 260px; flex-shrink: 0"
          @search="handleSearch"
          @pressEnter="handleSearch"
          allow-clear
          size="small"
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
        <a-select
          v-model:value="filterReceiveStatus"
          mode="multiple"
          placeholder="到货状态"
          style="min-width: 120px; max-width: 180px; flex-shrink: 0"
          allow-clear
          :max-tag-count="1"
          size="small"
          @change="handleSearch"
        >
          <a-select-option value="未到货">未到货</a-select-option>
          <a-select-option value="部分到货">部分到货</a-select-option>
          <a-select-option value="已到货">已到货</a-select-option>
        </a-select>
        <a-select
          v-model:value="filterApprovalStatus"
          mode="multiple"
          placeholder="审批状态"
          style="min-width: 120px; max-width: 180px; flex-shrink: 0"
          allow-clear
          :max-tag-count="1"
          size="small"
          @change="handleSearch"
        >
          <a-select-option value="草稿">草稿</a-select-option>
          <a-select-option value="已提交">已提交</a-select-option>
          <a-select-option value="已审批">已审批</a-select-option>
          <a-select-option value="已撤回">已撤回</a-select-option>
        </a-select>
        <a-button size="small" @click="fetchData"><ReloadOutlined /> 刷新</a-button>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="exportLoading" @click="handleExportSelected">
          <DownloadOutlined /> 导出{{ selectedRowKeys.length ? `(${selectedRowKeys.length})` : '' }}
        </a-button>
        <a-button size="small" type="primary" :disabled="selectedRowKeys.length === 0" @click="openCreateReceivingNotice">
          <SendOutlined /> 收货通知{{ selectedRowKeys.length ? `(${selectedRowKeys.length})` : '' }}
        </a-button>
        <a-tooltip title="列设置"><a-button size="small" @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
      </div>
    </div>

    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      :row-selection="rowSelection"
      row-key="id"
      :scroll="{ x: 2600 }"
      size="small"
      bordered
      @change="handleTableChange"
      @resizeColumn="handleResizeColumn"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'order_quantity'">
          <span style="font-weight: 600">{{ record.order_quantity }}</span>
        </template>
        <template v-else-if="column.key === 'unit_price'">
          {{ record.unit_price ? Number(record.unit_price).toFixed(2) : '-' }}
        </template>
        <template v-else-if="column.key === 'total_amount'">
          <span style="font-weight: 600">{{ record.total_amount ? Number(record.total_amount).toFixed(2) : '-' }}</span>
        </template>
        <template v-else-if="column.key === 'received_quantity'">
          <span :style="{ color: Number(record.received_quantity) > 0 ? '#1890ff' : undefined, fontWeight: Number(record.received_quantity) > 0 ? '600' : 'normal' }">{{ record.received_quantity }}</span>
        </template>
        <template v-else-if="column.key === 'delivery_date'">
          {{ formatDate(record.delivery_date) }}
        </template>
        <template v-else-if="column.key === 'order_date'">
          {{ formatDate(record.order_date) }}
        </template>
        <template v-else-if="column.key === 'receive_status'">
          <a-tag :color="receiveStatusColors[record.receive_status] || 'default'">{{ record.receive_status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'approval_status'">
          <ApprovalStatusTag :status="record.approval_status" />
        </template>
        <template v-else-if="column.key === 'order_status'">
          <a-tag :color="orderStatusColors[record.order_status] || 'default'">{{ record.order_status }}</a-tag>
        </template>
      </template>
    </a-table>

    <div v-if="selectedRowKeys.length > 0" style="margin-top: 8px; padding: 6px 12px; background: #e6f7ff; border: 1px solid #91d5ff; border-radius: 4px; display: flex; align-items: center; gap: 8px;">
      <span style="color: #666;">已选 <b style="color: #1890ff;">{{ selectedRowKeys.length }}</b> 项</span>
      <a-button size="small" type="link" @click="selectedRowKeys = []">清除选择</a-button>
    </div>

    <!-- 采购收货通知弹窗 -->
    <a-modal v-model:open="rnVisible" title="创建采购收货通知" width="1000px" :confirm-loading="rnSaving" @ok="handleSaveReceivingNotice" ok-text="确认创建" cancel-text="取消">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="采购订单号">
              <a-input :value="rnForm.purchase_order_number" disabled />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="送货单号">
              <a-input v-model:value="rnForm.delivery_note" placeholder="供应商送货单号" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="收货日期">
              <a-date-picker v-model:value="rnForm.receiving_date" style="width:100%" value-format="YYYY-MM-DD" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="16">
            <a-form-item label="备注"><a-input v-model:value="rnForm.remark" /></a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <h4 style="margin:12px 0 8px">收货明细 (共 {{ rnDetails.length }} 项)</h4>
      <a-table
        :columns="[
          { title: '物料编码', dataIndex: 'item_number', width: 120 },
          { title: '物料名称', dataIndex: 'item_name', width: 130 },
          { title: '规格', dataIndex: 'specifications', width: 90 },
          { title: '单位', dataIndex: 'basic_unit', width: 50 },
          { title: '订单数量', dataIndex: 'order_quantity', width: 80 },
          { title: '已入库', dataIndex: 'received_quantity', width: 70 },
          { title: '可收货', key: 'remaining', width: 80 },
          { title: '本次收货', key: 'receiving_quantity', width: 100 }
        ]"
        :data-source="rnDetails"
        :pagination="false"
        row-key="id"
        size="small"
        :scroll="{ x: 800 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'remaining'">
            {{ record.remaining?.toFixed(2) }}
          </template>
          <template v-else-if="column.key === 'receiving_quantity'">
            <a-input-number v-model:value="record.receiving_quantity" :min="0" :max="record.remaining" style="width:100%" size="small" />
          </template>
        </template>
      </a-table>
    </a-modal>

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
