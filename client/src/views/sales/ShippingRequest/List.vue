<script setup lang="ts">
import { ref, reactive, computed, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  SearchOutlined, ReloadOutlined, DeleteOutlined,
  CheckCircleOutlined, CloseCircleOutlined, CarOutlined, EditOutlined, SettingOutlined,
  DownOutlined, ExclamationCircleOutlined, UndoOutlined
} from '@ant-design/icons-vue'
import { getShippingRequests, getShippingRequestDetail, updateShippingRequest, updateShippingRequestStatus, deleteShippingRequest, rollbackShippingOutbound } from '@/api/sales/shippingRequest'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { useTableList } from '@/composables/useTableList'
import { useModalDrag } from '@/composables/useModalDrag'
import dayjs from 'dayjs'
import { APPROVAL_STATUS } from '@/constants/statuses'

interface ShippingRequest {
  request_number: string
  customer_number: string
  customer_name: string
  request_date: string
  status: string
  remark: string
  creation_man: string
  creation_date: string
}




const statusFilter = ref('')
const { loading, dataSource, searchText, selectedRowKeys, pagination, fetchData: fetchList, handleTableChange, handleSearch, handleReset } = useTableList(getShippingRequests)

// Override fetchData to pass status filter
const fetchData = () => fetchList({ status: statusFilter.value || undefined })

const onSelectChange = (keys: string[]) => {
  selectedRowKeys.value = keys
}

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}))



// 详情弹窗
const detailVisible = ref(false)
const { modalStyle: detailModalStyle, onDragStart: detailDragStart, resetDrag: detailResetDrag } = useModalDrag()
const detailLoading = ref(false)
const detailHeader = ref<any>({})
const detailItems = ref<any[]>([])

// 编辑弹窗
const editVisible = ref(false)
const editLoading = ref(false)
const editSaving = ref(false)
const editHeader = ref<any>({})
const editItems = ref<any[]>([])

const editDetailColumns = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 70 },
  { title: '销售订单号', dataIndex: 'sales_order_number', key: 'sales_order_number', width: 150, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 140, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100, resizable: true },
  { title: '订单数量', dataIndex: 'order_quantity', key: 'order_quantity', width: 90, resizable: true },
  { title: '已发数量', dataIndex: 'shipped_quantity', key: 'shipped_quantity', width: 90, resizable: true },
  { title: '本次发货', dataIndex: 'ship_quantity', key: 'edit_ship_quantity', width: 110, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'edit_remark', width: 140, resizable: true }
]

const defaultDataColumns: any[] = [
  { title: '发货申请编号', dataIndex: 'request_number', key: 'request_number', width: 180, resizable: true },
  { title: '客户编号', dataIndex: 'customer_number', key: 'customer_number', width: 120, resizable: true },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 160, resizable: true },
  { title: '申请日期', dataIndex: 'request_date', key: 'request_date', width: 130, resizable: true },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100, resizable: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 160, ellipsis: true, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('shipping_request_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 120, fixed: 'right' as const }]
})

const detailColumns = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 70 },
  { title: '销售订单号', dataIndex: 'sales_order_number', key: 'sales_order_number', width: 170, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 150, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, resizable: true },
  { title: '订单数量', dataIndex: 'order_quantity', key: 'order_quantity', width: 90, resizable: true },
  { title: '已发数量', dataIndex: 'shipped_quantity', key: 'shipped_quantity', width: 90, resizable: true },
  { title: '本次发货', dataIndex: 'ship_quantity', key: 'ship_quantity', width: 90, resizable: true },
  { title: '交货日期', dataIndex: 'delivery_date', key: 'delivery_date', width: 110, resizable: true },
  { title: '承诺交货日期', dataIndex: 'promised_delivery_date', key: 'promised_delivery_date', width: 115, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, resizable: true }
]

const formatDate = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}

const formatDateTime = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}







const handleViewDetail = async (record: ShippingRequest) => {
  detailLoading.value = true
  detailResetDrag()
  detailVisible.value = true
  try {
    const res: any = await getShippingRequestDetail(record.request_number)
    if (res?.success) {
      detailHeader.value = res.data.header
      detailItems.value = res.data.details || []
    }
  } catch {
    message.error('获取发货申请详情失败')
  } finally {
    detailLoading.value = false
  }
}

const handleEditFromDetail = () => {
  detailVisible.value = false
  handleEdit(detailHeader.value as ShippingRequest)
}

const handleEdit = async (record: ShippingRequest) => {
  editLoading.value = true
  editVisible.value = true
  try {
    const res: any = await getShippingRequestDetail(record.request_number)
    if (res?.success) {
      editHeader.value = { ...res.data.header }
      editItems.value = (res.data.details || []).map((d: any) => ({ ...d }))
    }
  } catch {
    message.error('获取发货申请详情失败')
  } finally {
    editLoading.value = false
  }
}

const handleEditSave = async () => {
  editSaving.value = true
  try {
    const res: any = await updateShippingRequest(editHeader.value.request_number, {
      remark: editHeader.value.remark,
      details: editItems.value.map((d: any) => ({
        id: d.id,
        sales_detail_id: d.sales_detail_id,
        order_quantity: d.order_quantity,
        shipped_quantity: d.shipped_quantity,
        ship_quantity: d.ship_quantity,
        remark: d.remark
      }))
    })
    if (res?.success) {
      message.success('修改成功')
      editVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '修改失败')
  } finally {
    editSaving.value = false
  }
}

const handleUpdateStatus = (record: ShippingRequest, newStatus: string) => {
  Modal.confirm({
    title: `确认将状态更改为"${newStatus}"？`,
    content: `发货申请编号: ${record.request_number}`,
    async onOk() {
      try {
        const res: any = await updateShippingRequestStatus(record.request_number, newStatus)
        if (res?.success) {
          message.success('状态更新成功')
          fetchData()
        }
      } catch (err: any) {
        message.error(err.response?.data?.message || '状态更新失败')
      }
    }
  })
}

const handleDelete = (record: ShippingRequest) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除发货申请「${record.request_number}」吗？此操作不可撤回`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await deleteShippingRequest(record.request_number)
        if (res?.success) {
          message.success('删除成功')
          fetchData()
        } else {
          message.error(res.message || '删除失败')
        }
      } catch {
        message.error('删除失败')
      }
    }
  })
}

const handleRollbackOutbound = (record: ShippingRequest) => {
  Modal.confirm({
    title: '确认撤回出库',
    icon: createVNode(ExclamationCircleOutlined),
    content: `将撤回「${record.request_number}」的最近一次发货出库记录，库存将恢复至出库前状态。此操作不可撤销，确定继续？`,
    okText: '确定撤回',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await rollbackShippingOutbound(record.request_number)
        if (res?.success) {
          message.success('出库撤回成功')
          fetchData()
        } else {
          message.error(res.message || '撤回失败')
        }
      } catch (err: any) {
        message.error(err.response?.data?.message || '撤回失败')
      }
    }
  })
}

const getStatusColor = (status: string) => {
  switch (status) {
    case '待审核': return 'orange'
    case APPROVAL_STATUS.APPROVED: return 'blue'
    case '已发货': return 'green'
    case '已取消': return 'red'
    default: return 'default'
  }
}

// 批量操作
const handleBatchUpdateStatus = (newStatus: string) => {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先勾选需要操作的记录'); return
  }
  const selected = dataSource.value.filter(d => selectedRowKeys.value.includes(d.request_number))
  let invalidItems: string[] = []
  if (newStatus === APPROVAL_STATUS.APPROVED) {
    invalidItems = selected.filter(d => d.status !== '待审核').map(d => d.request_number)
  } else if (newStatus === '已发货') {
    invalidItems = selected.filter(d => d.status !== APPROVAL_STATUS.APPROVED).map(d => d.request_number)
  } else if (newStatus === '已取消') {
    invalidItems = selected.filter(d => d.status !== '待审核' && d.status !== APPROVAL_STATUS.APPROVED).map(d => d.request_number)
  }
  if (invalidItems.length > 0) {
    message.warning(`以下单据状态不符合操作条件: ${invalidItems.join(', ')}`); return
  }

  Modal.confirm({
    title: `确认将 ${selected.length} 条记录状态更改为"${newStatus}"？`,
    async onOk() {
      try {
        let successCount = 0
        for (const record of selected) {
          const res: any = await updateShippingRequestStatus(record.request_number, newStatus)
          if (res?.success) successCount++
        }
        message.success(`成功更新 ${successCount} 条记录`)
        selectedRowKeys.value = []
        fetchData()
      } catch (err: any) {
        message.error(err.response?.data?.message || '批量操作失败')
      }
    }
  })
}

const handleBatchDelete = () => {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先勾选需要删除的记录'); return
  }
  const selected = dataSource.value.filter(d => selectedRowKeys.value.includes(d.request_number))
  const invalidItems = selected.filter(d => d.status !== '待审核').map(d => d.request_number)
  if (invalidItems.length > 0) {
    message.warning(`只能删除"待审核"状态的记录，以下不符合: ${invalidItems.join(', ')}`); return
  }

  Modal.confirm({
    title: `确认删除 ${selected.length} 条发货申请？`,
    content: '此操作不可撤回',
    okType: 'danger',
    async onOk() {
      try {
        let successCount = 0
        for (const record of selected) {
          const res: any = await deleteShippingRequest(record.request_number)
          if (res?.success) successCount++
        }
        message.success(`成功删除 ${successCount} 条记录`)
        selectedRowKeys.value = []
        fetchData()
      } catch (err: any) {
        message.error(err.response?.data?.message || '批量删除失败')
      }
    }
  })
}

onMounted(async () => {
  await loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px">
      <div style="display: flex; gap: 8px; align-items: center;">
        <span style="font-size: 18px; font-weight: 600; color: #1a1a2e; margin-right: 4px; white-space: nowrap">发货申请</span>
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索申请编号/客户"
          style="width: 260px"
          @search="handleSearch"
          @pressEnter="handleSearch"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
        <a-select v-model:value="statusFilter" placeholder="筛选状态" style="width: 130px" allow-clear @change="handleSearch">
          <a-select-option value="">全部</a-select-option>
          <a-select-option value="待审核">待审核</a-select-option>
          <a-select-option :value="APPROVAL_STATUS.APPROVED">已审核</a-select-option>
          <a-select-option value="已发货">已发货</a-select-option>
          <a-select-option value="已取消">已取消</a-select-option>
        </a-select>
        <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
        <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <a-button type="primary" @click="handleBatchUpdateStatus(APPROVAL_STATUS.APPROVED)" :disabled="selectedRowKeys.length === 0">
          <CheckCircleOutlined /> 批量审核
        </a-button>
        <a-button @click="handleBatchUpdateStatus('已取消')" :disabled="selectedRowKeys.length === 0">
          <CloseCircleOutlined /> 批量取消
        </a-button>
        <a-button danger @click="handleBatchDelete" :disabled="selectedRowKeys.length === 0">
          <DeleteOutlined /> 批量删除
        </a-button>
      </div>
    </div>

    <a-alert v-if="selectedRowKeys.length > 0" style="margin-bottom: 12px" type="info" show-icon closable @close="selectedRowKeys = []">
      <template #message>已选择 <b>{{ selectedRowKeys.length }}</b> 条记录 <a style="margin-left: 12px" @click="selectedRowKeys = []">清空选择</a></template>
    </a-alert>

    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      :row-selection="rowSelection"
      row-key="request_number"
      :scroll="{ x: 1300 }"
      size="small"
      bordered
      @change="handleTableChange"
      @resizeColumn="handleResizeColumn"
    >
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'rowIndex'">
          {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
        </template>
        <template v-else-if="column.key === 'request_date'">
          {{ formatDateTime(record.request_date) }}
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="getStatusColor(record.status)">{{ record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="handleViewDetail(record)">
              查看
            </a-button>
            <a-divider type="vertical" />
            <a-dropdown :trigger="['click']">
              <a-button type="link" size="small" @click.stop>
                更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
              </a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item v-if="record.status === '待审核'" @click="handleUpdateStatus(record, APPROVAL_STATUS.APPROVED)">
                    <CheckCircleOutlined style="color: #52c41a; margin-right: 6px;" />审核通过
                  </a-menu-item>
                  <a-menu-item v-else-if="record.status === APPROVAL_STATUS.APPROVED" @click="handleUpdateStatus(record, '待审核')">撤消审核</a-menu-item>
                  <a-menu-item v-if="record.status === '待审核'" @click="handleEdit(record)">
                    <EditOutlined style="margin-right: 6px;" />编辑
                  </a-menu-item>
                  <a-menu-item v-if="record.status === APPROVAL_STATUS.APPROVED" @click="handleUpdateStatus(record, '已发货')">
                    <CarOutlined style="color: #52c41a; margin-right: 6px;" />确认发货
                  </a-menu-item>
                  <a-menu-item v-if="record.status === '已发货'" @click="handleRollbackOutbound(record)">
                    <UndoOutlined style="color: #ff4d4f; margin-right: 6px;" />撤回出库
                  </a-menu-item>
                  <a-menu-item v-if="record.status === '待审核' || record.status === APPROVAL_STATUS.APPROVED" @click="handleUpdateStatus(record, '已取消')">
                    <CloseCircleOutlined style="color: #faad14; margin-right: 6px;" />取消申请
                  </a-menu-item>
                  <a-menu-divider />
                  <a-menu-item v-if="record.status === '待审核'" @click="handleDelete(record)">
                    <span style="color: #ff4d4f">删除</span>
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 详情弹窗 -->
    <a-modal
      v-model:open="detailVisible"
      width="1100px"
      :style="detailModalStyle"
      :bodyStyle="{ maxHeight: '75vh', overflowY: 'auto' }"
    >
      <template #title>
        <div class="drag-handle" @mousedown="detailDragStart">发货申请详情</div>
      </template>
      <template #footer>
        <a-button v-if="detailHeader.status === '待审核'" type="primary" @click="handleEditFromDetail"><EditOutlined /> 修改</a-button>
        <a-button @click="detailVisible = false">关闭</a-button>
      </template>
      <a-spin :spinning="detailLoading">
        <a-descriptions bordered size="small" :column="3" style="margin-bottom: 16px">
          <a-descriptions-item label="申请编号">{{ detailHeader.request_number }}</a-descriptions-item>
          <a-descriptions-item label="客户编号">{{ detailHeader.customer_number }}</a-descriptions-item>
          <a-descriptions-item label="客户名称">{{ detailHeader.customer_name }}</a-descriptions-item>
          <a-descriptions-item label="申请日期">{{ formatDateTime(detailHeader.request_date) }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="getStatusColor(detailHeader.status)">{{ detailHeader.status }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="创建人">{{ detailHeader.creation_man }}</a-descriptions-item>
          <a-descriptions-item label="备注" :span="3">{{ detailHeader.remark || '-' }}</a-descriptions-item>
        </a-descriptions>
        <a-table
          :columns="detailColumns"
          :data-source="detailItems"
          :pagination="false"
          row-key="id"
          size="small"
          bordered
          :scroll="{ x: 1200 }"
        >
          <template #bodyCell="{ column, record: detailRecord }">
            <template v-if="column.key === 'delivery_date'">
              {{ formatDate(detailRecord.delivery_date) }}
            </template>
            <template v-else-if="column.key === 'promised_delivery_date'">
              {{ formatDate(detailRecord.promised_delivery_date) }}
            </template>
            <template v-else-if="column.key === 'ship_quantity'">
              <span style="color: #1677ff; font-weight: 600">{{ detailRecord.ship_quantity }}</span>
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-modal>

    <!-- 编辑弹窗 -->
    <a-modal
      v-model:open="editVisible"
      title="修改发货申请"
      width="1100px"
      :bodyStyle="{ maxHeight: '75vh', overflowY: 'auto' }"
      :confirmLoading="editSaving"
      okText="保存"
      @ok="handleEditSave"
    >
      <a-spin :spinning="editLoading">
        <a-form layout="inline" style="margin-bottom: 16px">
          <a-form-item label="申请编号">
            <a-input :value="editHeader.request_number" disabled style="width: 180px" />
          </a-form-item>
          <a-form-item label="客户名称">
            <a-input :value="editHeader.customer_name" disabled style="width: 180px" />
          </a-form-item>
          <a-form-item label="备注">
            <a-input v-model:value="editHeader.remark" placeholder="备注" style="width: 300px" />
          </a-form-item>
        </a-form>
        <a-table
          :columns="editDetailColumns"
          :data-source="editItems"
          :pagination="false"
          row-key="id"
          size="small"
          bordered
          :scroll="{ x: 1100 }"
        >
          <template #bodyCell="{ column, record: editRecord }">
            <template v-if="column.key === 'edit_ship_quantity'">
              <a-input-number v-model:value="editRecord.ship_quantity" :min="0" :precision="2" size="small" style="width: 100%" />
            </template>
            <template v-else-if="column.key === 'edit_remark'">
              <a-input v-model:value="editRecord.remark" size="small" />
            </template>
          </template>
        </a-table>
      </a-spin>
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

<style scoped>
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
