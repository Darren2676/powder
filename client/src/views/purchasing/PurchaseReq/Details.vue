<script setup lang="ts">
import { ref, computed, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined, SettingOutlined, DownloadOutlined, SwapOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { getPurchaseReqDetailsPage, exportPurchaseReqDetailsSelected, toOrder } from '@/api/purchasing/purchaseReq'
import { queryPurchasePrice } from '@/api/purchasing/purchasePrice'
import { getSuppliers } from '@/api/master-data/supplier'
import { getAssignableUsers } from '@/api/system/user'
import { useAuthStore } from '@/store/auth'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { useModalDrag } from '@/composables/useModalDrag'
import { generateExportFilename } from '@/utils/exportFilename'
import dayjs from 'dayjs'

const authStore = useAuthStore()

// 转采购订单弹窗拖拽
const { modalStyle: toOrderModalStyle, onDragStart: toOrderDragStart, resetDrag: toOrderResetDrag } = useModalDrag()

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

// ==================== 转采购订单 ====================
const toOrderVisible = ref(false)
const toOrderLoading = ref(false)
const toOrderSelectedRows = ref<any[]>([])
const mergeSameItems = ref(false)
const toOrderUnitPrices = ref<Record<number, number>>({})
const toOrderForm = reactive({ supplier_number: '', supplier_name: '', delivery_date: null as string | null, procurement_manager: '', linkman: '', contacts: '' })
const supplierOptions = ref<any[]>([])
const userOptions = ref<any[]>([])

// 按申请单号分组
const toOrderGrouped = computed(() => {
  const map = new Map<string, any[]>()
  for (const row of toOrderSelectedRows.value) {
    const key = row.purchase_req_number
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(row)
  }
  return [...map.entries()].map(([reqNumber, rows]) => ({
    reqNumber,
    rows: mergeSameItems.value ? mergeRows(rows) : rows
  }))
})

// 合并相同物料编码的行
const mergeRows = (rows: any[]) => {
  const map = new Map<string, any>()
  for (const row of rows) {
    const key = row.item_number
    if (!map.has(key)) {
      map.set(key, { ...row, _sourceIds: [row.id], _sourceRows: [row] })
    } else {
      const existing = map.get(key)!
      const existingReq = parseFloat(existing.request_quantity) || 0
      const existingOrdered = parseFloat(existing.ordered_quantity) || 0
      const rowReq = parseFloat(row.request_quantity) || 0
      const rowOrdered = parseFloat(row.ordered_quantity) || 0
      existing.request_quantity = existingReq + rowReq
      existing.ordered_quantity = existingOrdered + rowOrdered
      existing._sourceIds.push(row.id)
      existing._sourceRows.push(row)
    }
  }
  return [...map.values()]
}

const fetchSuppliers = async () => {
  if (supplierOptions.value.length) return
  try {
    const res: any = await getSuppliers({ limit: 9999 })
    if (res?.success) supplierOptions.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

const fetchUsers = async () => {
  if (userOptions.value.length) return
  try {
    const res: any = await getAssignableUsers()
    if (res?.success) userOptions.value = res.data || []
  } catch { /* ignore */ }
}

const onToOrderSupplierSelect = async (val: string) => {
  const sup = supplierOptions.value.find((s: any) => s.supplier_number === val)
  if (sup) {
    toOrderForm.supplier_number = sup.supplier_number
    toOrderForm.supplier_name = sup.supplier_name
    toOrderForm.procurement_manager = sup.procurement_manager || ''
    toOrderForm.linkman = sup.linkman || ''
    toOrderForm.contacts = sup.contacts || ''
  }
  // 自动从采购价目表查询单价
  await fetchToOrderPrices()
}

const fetchToOrderPrices = async () => {
  if (!toOrderForm.supplier_number || !toOrderSelectedRows.value.length) return
  const itemNumbers = [...new Set(toOrderSelectedRows.value.map((r: any) => r.item_number).filter(Boolean))]
  if (!itemNumbers.length) return
  try {
    const res: any = await queryPurchasePrice({
      supplier_number: toOrderForm.supplier_number,
      item_numbers: itemNumbers.join(',')
    })
    const priceData = res.data || {}
    for (const row of toOrderSelectedRows.value) {
      const priceInfo = priceData[row.item_number]
      if (priceInfo && priceInfo.unit_price > 0) {
        toOrderUnitPrices.value[row.id] = priceInfo.unit_price
      }
    }
  } catch { /* 忽略查价失败 */ }
}

const handleOpenToOrder = async () => {
  if (!selectedRowKeys.value.length) { message.warning('请先勾选要转单的行'); return }
  const selected = dataSource.value.filter((r: any) => selectedRowKeys.value.includes(r.id))
  // 过滤：仅已审批且尚有未转单数量的行
  const valid = selected.filter((r: any) => r.approval_status === '已审批' && (parseFloat(r.request_quantity) || 0) > (parseFloat(r.ordered_quantity) || 0))
  if (!valid.length) { message.warning('选中行中没有可转单的明细（需已审批且有剩余数量）'); return }

  // 检查是否有相同物料编码的行
  const itemMap = new Map<string, number>()
  for (const row of valid) {
    itemMap.set(row.item_number, (itemMap.get(row.item_number) || 0) + 1)
  }
  const duplicateItems = [...itemMap.entries()].filter(([, count]) => count > 1)

  if (duplicateItems.length > 0) {
    const itemNames = duplicateItems.map(([item]) => item).join('、')
    Modal.confirm({
      title: '检测到相同物料编码',
      icon: createVNode(ExclamationCircleOutlined),
      content: `以下物料编码存在多条明细：${itemNames}。是否合并相同物料的数量？`,
      okText: '合并',
      cancelText: '不合并',
      onOk: () => { openToOrderModal(valid, true) },
      onCancel: () => { openToOrderModal(valid, false) }
    })
  } else {
    openToOrderModal(valid, false)
  }
}

const openToOrderModal = async (valid: any[], merge: boolean) => {
  mergeSameItems.value = merge
  toOrderSelectedRows.value = valid
  toOrderUnitPrices.value = {}
  toOrderForm.supplier_number = ''
  toOrderForm.supplier_name = ''
  toOrderForm.delivery_date = null
  toOrderForm.procurement_manager = authStore.user?.real_name || authStore.user?.username || ''
  toOrderForm.linkman = ''
  toOrderForm.contacts = ''
  toOrderVisible.value = true
  toOrderResetDrag()
  await Promise.all([fetchSuppliers(), fetchUsers()])
}

// 采购负责人模糊搜索选项
const procurementManagerOptions = computed(() => {
  const search = toOrderForm.procurement_manager?.toLowerCase() || ''
  if (!search) return userOptions.value.map(u => ({ value: u.real_name || u.username }))
  return userOptions.value
    .filter(u => (u.real_name || '').toLowerCase().includes(search) || (u.username || '').toLowerCase().includes(search))
    .map(u => ({ value: u.real_name || u.username }))
})

const handleToOrder = async () => {
  if (!toOrderForm.supplier_number) { message.warning('请选择供应商'); return }
  toOrderLoading.value = true
  try {
    // 按申请单号分组，每组生成一个采购订单
    for (const group of toOrderGrouped.value) {
      await toOrder(group.reqNumber, {
        supplier_number: toOrderForm.supplier_number,
        supplier_name: toOrderForm.supplier_name,
        procurement_manager: toOrderForm.procurement_manager,
        linkman: toOrderForm.linkman,
        contacts: toOrderForm.contacts,
        delivery_date: toOrderForm.delivery_date,
        detail_ids: group.rows.flatMap((r: any) => r._sourceIds || [r.id]),
        merge_same_items: mergeSameItems.value,
        unit_prices: toOrderUnitPrices.value
      })
    }
    message.success(`转采购订单成功，共处理 ${toOrderGrouped.value.length} 个申请单`)
    toOrderVisible.value = false
    selectedRowKeys.value = []
    fetchData()
  } catch (e: any) {
    message.error(e?.response?.data?.message || e?.message || '转采购订单失败')
  } finally {
    toOrderLoading.value = false
  }
}

onMounted(async () => {
  await loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
      <h3 style="margin: 0; white-space: nowrap; flex-shrink: 0">采购申请明细</h3>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索采购申请号/物料编号/物料名称/建议供应商"
          style="width: 380px; flex-shrink: 0"
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
          style="min-width: 160px; flex-shrink: 0"
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
        <a-button type="primary" :disabled="selectedRowKeys.length === 0" @click="handleOpenToOrder">
          <SwapOutlined /> 转采购订单{{ selectedRowKeys.length ? ` (${selectedRowKeys.length})` : '' }}
        </a-button>
        <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
      </div>
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

    <!-- 转采购订单弹窗 -->
    <a-modal v-model:open="toOrderVisible" width="900px" :style="toOrderModalStyle" :confirm-loading="toOrderLoading" @ok="handleToOrder" ok-text="确认转单">
      <template #title>
        <div class="drag-handle" @mousedown="toOrderDragStart">转采购订单</div>
      </template>
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8"><a-form-item label="供应商" required>
            <a-select v-model:value="toOrderForm.supplier_number" show-search option-filter-prop="label" style="width:100%" @change="onToOrderSupplierSelect" placeholder="选择供应商">
              <a-select-option v-for="s in supplierOptions" :key="s.supplier_number" :value="s.supplier_number" :label="s.supplier_number + ' ' + s.supplier_name">{{ s.supplier_name }}</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="8"><a-form-item label="交货日期"><a-date-picker v-model:value="toOrderForm.delivery_date" style="width:100%" value-format="YYYY-MM-DD" /></a-form-item></a-col>
          <a-col :span="8"><a-form-item label="采购负责人"><a-auto-complete v-model:value="toOrderForm.procurement_manager" :options="procurementManagerOptions" placeholder="输入姓名搜索或直接录入" style="width:100%" allow-clear /></a-form-item></a-col>
        </a-row>
      </a-form>
      <div v-if="mergeSameItems" style="margin-bottom: 8px">
        <a-alert type="info" show-icon message="已启用合并模式：相同物料编码的明细行数量已合并" />
      </div>
      <h4>将转单的明细行 (按申请单号分组，每组生成一个采购订单)</h4>
      <div v-for="group in toOrderGrouped" :key="group.reqNumber" style="margin-bottom: 12px">
        <a-tag color="blue" style="margin-bottom: 4px">{{ group.reqNumber }} ({{ group.rows.length }} 行)</a-tag>
        <a-table
          :columns="[
            { title: '物料编码', dataIndex: 'item_number', width: 130 },
            { title: '物料名称', dataIndex: 'item_name', width: 150 },
            { title: '规格', dataIndex: 'specifications', width: 100 },
            { title: '单位', dataIndex: 'basic_unit', width: 60 },
            { title: '申请数量', dataIndex: 'request_quantity', width: 90 },
            { title: '已转单', dataIndex: 'ordered_quantity', width: 80 },
            { title: '可转数量', key: 'remaining', width: 90 },
            { title: '单价', key: 'unit_price', width: 110 },
            { title: '金额', key: 'amount', width: 110 }
          ]"
          :data-source="group.rows"
          :pagination="false"
          row-key="id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'remaining'">
              {{ ((parseFloat(record.request_quantity) || 0) - (parseFloat(record.ordered_quantity) || 0)).toFixed(2) }}
            </template>
            <template v-else-if="column.key === 'unit_price'">
              <a-input-number v-model:value="toOrderUnitPrices[record.id]" :min="0" :precision="2" size="small" style="width:100%" placeholder="自动" />
            </template>
            <template v-else-if="column.key === 'amount'">
              {{ (((parseFloat(record.request_quantity) || 0) - (parseFloat(record.ordered_quantity) || 0)) * (toOrderUnitPrices[record.id] || 0)).toFixed(2) }}
            </template>
          </template>
        </a-table>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
