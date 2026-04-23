<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { SearchOutlined, SendOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { getPendingShipments, createShippingRequest } from '@/api/sales/shippingRequest'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import dayjs from 'dayjs'

interface PendingItem {
  id: number
  sales_order_number?: string
  order_number?: string
  line_number: number
  item_number: string
  item_name: string
  specifications: string
  basic_unit: string
  product_drawing_number: string
  order_quantity: number
  shipped_quantity: number
  delivery_date: string | null
  customer_number: string
  customer_name: string
  head_of_sales: string
  shipping_status: string
  status: string
}

const loading = ref(false)
const submitLoading = ref(false)
const dataSource = ref<PendingItem[]>([])
const searchText = ref('')
const selectedRowKeys = ref<number[]>([])
const shipModalVisible = ref(false)
const shipItems = ref<any[]>([])

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const defaultPendingColumns: any[] = [
  { title: '销售订单号', dataIndex: 'order_number', key: 'order_number', width: 170, resizable: true },
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 70 },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 150, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 160, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 130, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 70, resizable: true },
  { title: '订单数量', dataIndex: 'order_quantity', key: 'order_quantity', width: 100, resizable: true },
  { title: '已发数量', dataIndex: 'shipped_quantity', key: 'shipped_quantity', width: 100, resizable: true },
  { title: '已申请数量', dataIndex: 'applied_quantity', key: 'applied_quantity', width: 110, resizable: true },
  { title: '待发数量', key: 'pending_qty', width: 100, resizable: true },
  { title: '交货日期', dataIndex: 'delivery_date', key: 'delivery_date', width: 110, resizable: true },
  { title: '承诺交货日期', dataIndex: 'promised_delivery_date', key: 'promised_delivery_date', width: 115, resizable: true },
  { title: '发货状态', dataIndex: 'shipping_status', key: 'shipping_status', width: 100, resizable: true },
  { title: '负责人', dataIndex: 'head_of_sales', key: 'head_of_sales', width: 100, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('shipping_pending_list', defaultPendingColumns, { fixedLeft: [], fixedRight: [] })

const formatDate = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getPendingShipments({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取待发货列表失败')
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

const onSelectChange = (keys: number[]) => {
  selectedRowKeys.value = keys
}

// 生成发货申请
const handleCreateShippingRequest = () => {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先选择需要发货的明细行'); return
  }

  const selected = dataSource.value.filter(d => selectedRowKeys.value.includes(d.id))
  // 检查是否同一客户
  const customers = [...new Set(selected.map(d => d.customer_number))]
  if (customers.length > 1) {
    message.warning('请选择同一客户的订单明细行进行发货'); return
  }

  shipItems.value = selected.map(d => ({
    ...d,
    ship_quantity: Math.max(0, (Number(d.order_quantity) || 0) - (Number(d.refunded_quantity) || 0) - (Number(d.shipped_quantity) || 0) - (Number(d.applied_quantity) || 0))
  }))
  shipModalVisible.value = true
}

const shipColumns = [
  { title: '订单号', dataIndex: 'order_number', width: 160 },
  { title: '产品编号', dataIndex: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', width: 140 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', width: 60 },
  { title: '订单数量', dataIndex: 'order_quantity', width: 90 },
  { title: '已发数量', dataIndex: 'shipped_quantity', width: 90 },
  { title: '已申请数量', dataIndex: 'applied_quantity', width: 100 },
  { title: '本次发货', key: 'ship_quantity', width: 120 }
]

const shipRemark = ref('')

const handleShipSubmit = async () => {
  const invalidItems = shipItems.value.filter(d => !d.ship_quantity || d.ship_quantity <= 0)
  if (invalidItems.length > 0) {
    message.warning('请填写所有明细行的发货数量'); return
  }

  submitLoading.value = true
  try {
    const firstItem = shipItems.value[0]
    const res: any = await createShippingRequest({
      customer_number: firstItem.customer_number,
      customer_name: firstItem.customer_name,
      remark: shipRemark.value,
      details: shipItems.value.map(d => ({
        sales_order_number: d.order_number || d.sales_order_number,
        detail_id: d.id,
        item_number: d.item_number,
        item_name: d.item_name,
        specifications: d.specifications,
        basic_unit: d.basic_unit,
        product_drawing_number: d.product_drawing_number,
        order_quantity: d.order_quantity,
        shipped_quantity: d.shipped_quantity || 0,
        ship_quantity: d.ship_quantity,
        delivery_date: d.delivery_date,
        remark: d.remark || ''
      }))
    })
    if (res?.success) {
      message.success(`发货申请创建成功，编号: ${res.data.request_number}`)
      shipModalVisible.value = false
      shipRemark.value = ''
      selectedRowKeys.value = []
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '创建发货申请失败')
  } finally {
    submitLoading.value = false
  }
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
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索订单号/产品/客户"
          style="width: 280px"
          @search="handleSearch"
          @pressEnter="handleSearch"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
        <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
        <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
      </div>
      <div>
        <a-button type="primary" @click="handleCreateShippingRequest" :disabled="selectedRowKeys.length === 0">
          <SendOutlined /> 生成发货申请 ({{ selectedRowKeys.length }})
        </a-button>
      </div>
    </div>

    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      :row-selection="{ selectedRowKeys, onChange: onSelectChange }"
      row-key="id"
      :scroll="{ x: 1500 }"
      size="small"
      bordered
      @change="handleTableChange"
      @resizeColumn="handleResizeColumn"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'pending_qty'">
          <span style="color: #fa541c; font-weight: 600">{{ Math.max(0, (record.order_quantity || 0) - (record.refunded_quantity || 0) - (record.shipped_quantity || 0)) }}</span>
        </template>
        <template v-else-if="column.key === 'delivery_date'">
          {{ formatDate(record.delivery_date) }}
        </template>
        <template v-else-if="column.key === 'promised_delivery_date'">
          {{ formatDate(record.promised_delivery_date) }}
        </template>
        <template v-else-if="column.key === 'shipping_status'">
          <a-tag :color="record.shipping_status === '未发货' ? 'orange' : record.shipping_status === '部分发货' ? 'blue' : 'default'">
            {{ record.shipping_status || '未发货' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'shipped_quantity'">
          {{ record.shipped_quantity || 0 }}
        </template>
        <template v-else-if="column.key === 'applied_quantity'">
          <span :style="{ color: record.applied_quantity > 0 ? '#1677ff' : '' }">{{ record.applied_quantity || 0 }}</span>
        </template>
      </template>
    </a-table>

    <!-- 生成发货申请弹窗 -->
    <a-modal
      v-model:open="shipModalVisible"
      title="生成发货申请"
      width="1100px"
      :bodyStyle="{ maxHeight: '70vh', overflowY: 'auto' }"
      @ok="handleShipSubmit"
      :confirmLoading="submitLoading"
      okText="确认提交"
    >
      <a-alert
        :message="`客户: ${shipItems[0]?.customer_name || '-'} (${shipItems[0]?.customer_number || '-'})，共 ${shipItems.length} 条明细`"
        type="info"
        show-icon
        style="margin-bottom: 12px"
      />
      <a-table
        :columns="shipColumns"
        :data-source="shipItems"
        :pagination="false"
        row-key="id"
        size="small"
        bordered
        :scroll="{ x: 900 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'ship_quantity'">
            <a-input-number v-model:value="record.ship_quantity" :min="0" size="small" style="width: 100%" />
          </template>
        </template>
      </a-table>
      <div style="margin-top: 12px">
        <a-form-item label="备注">
          <a-input v-model:value="shipRemark" placeholder="可选填写备注信息" />
        </a-form-item>
      </div>
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
