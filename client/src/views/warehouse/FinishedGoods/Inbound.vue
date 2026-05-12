<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined, ImportOutlined } from '@ant-design/icons-vue'
import { getPendingInbound, productionInbound, getWarehouseOptions } from '@/api/warehouse/finishedGoods'
import dayjs from 'dayjs'

const loading = ref(false)
const submitLoading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const selectedRowKeys = ref<string[]>([])
const warehouseOptions = ref<any[]>([])

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const columns = [
  { title: '生产单编号', dataIndex: 'production_order_number', key: 'production_order_number', width: 160 },
  { title: '生产计划编号', dataIndex: 'production_number', key: 'production_number', width: 150 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 130 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 180 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 130 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 70 },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 100 },
  { title: '已入库数量', dataIndex: 'inbound_qty', key: 'inbound_qty', width: 110 },
  { title: '待入库数量', dataIndex: 'pending_inbound_qty', key: 'pending_inbound_qty', width: 110 },
  { title: '入库状态', dataIndex: 'inbound_status', key: 'inbound_status', width: 100 },
  { title: '生产日期', dataIndex: 'production_date', key: 'production_date', width: 110 },
  { title: '生产状态', dataIndex: 'plan_status', key: 'plan_status', width: 100 }
]

const formatDate = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getPendingInbound({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取待入库列表失败')
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

const onSelectChange = (keys: string[]) => {
  selectedRowKeys.value = keys
}

// 入库弹窗
const inboundVisible = ref(false)
const inboundItems = ref<any[]>([])
const inboundWarehouse = reactive({ warehouse_number: '', warehouse_name: '' })
const inboundRemark = ref('')
const inboundAccountingPeriod = ref('')

const handleInbound = () => {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先选择需要入库的生产单'); return
  }
  const selected = dataSource.value.filter(d => selectedRowKeys.value.includes(d.production_order_number))
  inboundItems.value = selected.map(d => ({
    ...d,
    inbound_qty: Number(d.pending_inbound_qty) || (Number(d.planned_quantity) - (Number(d.inbound_quantity) || 0))
  }))
  inboundWarehouse.warehouse_number = ''
  inboundWarehouse.warehouse_name = ''
  inboundRemark.value = ''
  const now = new Date()
  inboundAccountingPeriod.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  inboundVisible.value = true
}

const handleWarehouseChange = (value: string) => {
  const w = warehouseOptions.value.find((o: any) => o.warehouse_number === value)
  if (w) {
    inboundWarehouse.warehouse_number = w.warehouse_number
    inboundWarehouse.warehouse_name = w.warehouse_name
  }
}

const inboundColumns = [
  { title: '生产单编号', dataIndex: 'production_order_number', width: 160 },
  { title: '产品编号', dataIndex: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', width: 160 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', width: 60 },
  { title: '计划数量', dataIndex: 'planned_quantity', width: 100 },
  { title: '已入库', dataIndex: 'inbound_qty_old', key: 'inbound_qty_old', width: 90 },
  { title: '本次入库', key: 'inbound_qty', width: 120 }
]

const handleInboundSubmit = async () => {
  if (!inboundWarehouse.warehouse_number) {
    message.warning('请选择入库仓库'); return
  }
  const invalidItems = inboundItems.value.filter(d => !d.inbound_qty || d.inbound_qty <= 0)
  if (invalidItems.length > 0) {
    message.warning('请填写所有入库数量'); return
  }

  submitLoading.value = true
  try {
    const res: any = await productionInbound({
      warehouse_number: inboundWarehouse.warehouse_number,
      warehouse_name: inboundWarehouse.warehouse_name,
      remark: inboundRemark.value,
      accounting_period: inboundAccountingPeriod.value,
      items: inboundItems.value.map(d => ({
        production_order_number: d.production_order_number,
        item_number: d.item_number,
        item_name: d.item_name,
        specifications: d.specifications,
        basic_unit: d.basic_unit,
        product_drawing_number: d.product_drawing_number,
        planned_quantity: d.planned_quantity,
        inbound_quantity: Number(d.inbound_quantity) || 0,
        inbound_qty: d.inbound_qty
      }))
    })
    if (res?.success) {
      const orderNo = res.data?.inboundOrderNumber
      const batchNos = res.data?.batchNumbers
      if (orderNo) {
        message.success(`入库成功，入库单号: ${orderNo}${batchNos?.length ? '，批次号: ' + batchNos.join(', ') : ''}`)
      } else if (batchNos && batchNos.length > 0) {
        message.success(`入库成功，生成批次号: ${batchNos.join(', ')}`)
      } else {
        message.success('入库成功')
      }
      inboundVisible.value = false
      selectedRowKeys.value = []
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '入库操作失败')
  } finally {
    submitLoading.value = false
  }
}

onMounted(() => {
  fetchWarehouseOptions()
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:nowrap;overflow-x:auto">
      <span style="font-size:18px;font-weight:600;white-space:nowrap;flex-shrink:0">生产入库</span>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:nowrap">
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索生产单号/产品编号/名称"
          style="width: 300px"
          @search="handleSearch"
          @pressEnter="handleSearch"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
        <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
        <a-button type="primary" @click="handleInbound" :disabled="selectedRowKeys.length === 0">
          <ImportOutlined /> 确认入库 ({{ selectedRowKeys.length }})
        </a-button>
      </div>
    </div>

    <a-alert
      message="入库说明：此列表显示已完成且已审批的生产单，选择需要入库的生产单，指定入库仓库后确认即可。"
      type="info"
      show-icon
      style="margin-bottom: 12px"
    />

    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      :row-selection="{ selectedRowKeys, onChange: onSelectChange }"
      row-key="production_order_number"
      :scroll="{ x: 1600 }"
      size="small"
      bordered
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'pending_inbound_qty'">
          <span style="color: #fa541c; font-weight: 600">{{ record.pending_inbound_qty }}</span>
        </template>
        <template v-else-if="column.key === 'inbound_qty'">
          {{ record.inbound_qty || 0 }}
        </template>
        <template v-else-if="column.key === 'inbound_status'">
          <a-tag :color="record.inbound_status === '未入库' ? 'default' : record.inbound_status === '部分入库' ? 'orange' : 'green'">
            {{ record.inbound_status || '未入库' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'plan_status'">
          <a-tag color="green">{{ record.plan_status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'production_date'">
          {{ formatDate(record.production_date) }}
        </template>
      </template>
    </a-table>

    <!-- 入库弹窗 -->
    <a-modal
      v-model:open="inboundVisible"
      title="生产完工入库"
      width="1100px"
      :bodyStyle="{ maxHeight: '70vh', overflowY: 'auto' }"
      @ok="handleInboundSubmit"
      :confirmLoading="submitLoading"
      okText="确认入库"
    >
      <a-form layout="inline" style="margin-bottom: 16px">
        <a-form-item label="入库仓库" required>
          <a-select
            v-model:value="inboundWarehouse.warehouse_number"
            placeholder="请选择仓库"
            style="width: 250px"
            @change="handleWarehouseChange"
          >
            <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number">
              {{ w.warehouse_name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="备注">
          <a-input v-model:value="inboundRemark" placeholder="可选" style="width: 300px" />
        </a-form-item>
        <a-form-item label="会计期间">
          <a-input v-model:value="inboundAccountingPeriod" placeholder="YYYY-MM" style="width: 150px" />
        </a-form-item>
      </a-form>

      <a-table
        :columns="inboundColumns"
        :data-source="inboundItems"
        :pagination="false"
        row-key="production_order_number"
        size="small"
        bordered
        :scroll="{ x: 950 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'inbound_qty'">
            <a-input-number v-model:value="record.inbound_qty" :min="0" size="small" style="width: 100%" />
          </template>
          <template v-else-if="column.key === 'inbound_qty_old'">
            {{ Number(record.inbound_quantity) || 0 }}
          </template>
        </template>
      </a-table>
    </a-modal>
  </div>
</template>
