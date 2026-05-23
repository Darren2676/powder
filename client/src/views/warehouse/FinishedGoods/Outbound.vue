<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons-vue'
import { getPendingOutbound, shippingOutbound, getWarehouseOptions, getFinishedBatchOptions } from '@/api/warehouse/finishedGoods'
import { useOpenAccountingPeriods } from '@/composables/useOpenAccountingPeriods'
import dayjs from 'dayjs'

const loading = ref(false)
const submitLoading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const selectedRowKeys = ref<number[]>([])
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
  { title: '发货申请号', dataIndex: 'request_number', key: 'request_number', width: 170 },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 150 },
  { title: '销售订单号', dataIndex: 'sales_order_number', key: 'sales_order_number', width: 160 },
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 70 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 130 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 160 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 130 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 70 },
  { title: '发货数量', dataIndex: 'ship_quantity', key: 'ship_quantity', width: 100 },
  { title: '交货日期', dataIndex: 'delivery_date', key: 'delivery_date', width: 110 },
  { title: '申请日期', dataIndex: 'request_date', key: 'request_date', width: 110 }
]

const formatDate = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getPendingOutbound({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取待出库列表失败')
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

const onSelectChange = (keys: number[]) => {
  selectedRowKeys.value = keys
}

// ==================== 出库弹窗 ====================
const outboundVisible = ref(false)
const outboundItems = ref<any[]>([])
const outboundWarehouse = reactive({ warehouse_number: '', warehouse_name: '' })
const outboundRemark = ref('')
const outboundAccountingPeriod = ref('')
const batchLoading = ref(false)

const { openPeriodOptions, openPeriodLoading, noOpenPeriod, fetchOpenPeriods, getDefaultPeriod } = useOpenAccountingPeriods()

const handleOutbound = () => {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先选择需要出库的发货明细'); return
  }
  const selected = dataSource.value.filter(d => selectedRowKeys.value.includes(d.id))
  outboundItems.value = selected.map(d => ({ ...d, _batches: [], _selectedQty: 0 }))
  outboundWarehouse.warehouse_number = ''
  outboundWarehouse.warehouse_name = ''
  outboundRemark.value = ''
  outboundAccountingPeriod.value = getDefaultPeriod()
  if (noOpenPeriod.value) {
    message.warning('当前没有已开启的会计期间，请联系财务开启后再操作')
  }
  outboundVisible.value = true
}

// 选择仓库后加载批次
const handleWarehouseChange = async (value: string) => {
  const w = warehouseOptions.value.find((o: any) => o.warehouse_number === value)
  if (w) {
    outboundWarehouse.warehouse_number = w.warehouse_number
    outboundWarehouse.warehouse_name = w.warehouse_name
  }
  await loadBatchesForItems()
}

const loadBatchesForItems = async () => {
  if (!outboundWarehouse.warehouse_number) return

  batchLoading.value = true
  try {
    // 收集去重的 item_number
    const itemNumbers = [...new Set(outboundItems.value.map(d => d.item_number))]

    // 批量加载批次数据
    const batchMap: Record<string, any[]> = {}
    await Promise.all(itemNumbers.map(async (itemNo) => {
      try {
        const res: any = await getFinishedBatchOptions({
          item_number: itemNo,
          warehouse_number: outboundWarehouse.warehouse_number
        })
        if (res?.success) {
          batchMap[itemNo] = res.data || []
        }
      } catch { /* ignore */ }
    }))

    // 将批次数据挂到每个 outboundItem 上，并按 FIFO 自动预填
    for (const item of outboundItems.value) {
      const rawBatches = batchMap[item.item_number] || []
      const batches = rawBatches.map((b: any) => ({
        batch_number: b.batch_number,
        available_qty: Number(b.quantity) || 0,
        inbound_date: b.inbound_date,
        production_order_number: b.production_order_number || '',
        _checked: false,
        _outQty: 0
      }))

      // FIFO 自动预填
      let remaining = Number(item.ship_quantity) || 0
      for (const b of batches) {
        if (remaining <= 0) break
        if (b.available_qty <= 0) continue
        b._checked = true
        b._outQty = Math.min(remaining, b.available_qty)
        remaining -= b._outQty
      }

      item._batches = batches
      recalcSelectedQty(item)
    }
  } finally {
    batchLoading.value = false
  }
}

// 重新计算已选数量
const recalcSelectedQty = (item: any) => {
  let total = 0
  for (const b of item._batches) {
    if (b._checked && b._outQty > 0) {
      total += b._outQty
    }
  }
  item._selectedQty = total
}

// 批次勾选变化
const onBatchCheck = (item: any, batch: any, checked: boolean) => {
  batch._checked = checked
  if (!checked) {
    batch._outQty = 0
  } else if (batch._outQty === 0) {
    // 勾选时如果数量为0，自动填入可用量（不超过剩余需求量）
    const needMore = (Number(item.ship_quantity) || 0) - item._selectedQty
    batch._outQty = Math.min(batch.available_qty, Math.max(needMore, 0))
  }
  recalcSelectedQty(item)
}

// 批次数量变化
const onBatchQtyChange = (item: any, batch: any, val: number | null) => {
  batch._outQty = Math.min(Math.max(val || 0, 0), batch.available_qty)
  if (batch._outQty > 0) {
    batch._checked = true
  }
  recalcSelectedQty(item)
}

// 弹窗表格列定义
const outboundColumns = [
  { title: '发货申请号', dataIndex: 'request_number', key: 'request_number', width: 140 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 110 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 55 },
  { title: '申请数量', dataIndex: 'ship_quantity', key: 'ship_quantity', width: 90 },
  { title: '已选数量', dataIndex: '_selectedQty', key: '_selectedQty', width: 110 },
  { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 120 }
]

// 所有出库项是否都有批次数据
const allItemsHaveBatches = computed(() => {
  return outboundItems.value.every(d => d._batches && d._batches.length > 0)
})

// 展开行的 keys（默认全部展开）
const expandedKeys = computed(() => outboundItems.value.map(d => d.id))

// 提交出库
const handleOutboundSubmit = async () => {
  if (!outboundWarehouse.warehouse_number) {
    message.warning('请选择出库仓库'); return
  }

  // 校验每个出库项都有选择批次
  for (const item of outboundItems.value) {
    if (!item._batches || item._batches.length === 0) {
      message.warning(`产品 ${item.item_number} (${item.item_name}) 在该仓库无可用库存`); return
    }
    if (!item._selectedQty || item._selectedQty <= 0) {
      message.warning(`产品 ${item.item_number} (${item.item_name}) 未选择出库批次`); return
    }
    // 校验单批次不超可用量
    for (const b of item._batches) {
      if (b._checked && b._outQty > b.available_qty) {
        message.warning(`产品 ${item.item_number} 批次 ${b.batch_number} 出库数量超过可用量`); return
      }
    }
  }

  submitLoading.value = true
  try {
    const res: any = await shippingOutbound({
      warehouse_number: outboundWarehouse.warehouse_number,
      warehouse_name: outboundWarehouse.warehouse_name,
      remark: outboundRemark.value,
      accounting_period: outboundAccountingPeriod.value,
      items: outboundItems.value.map(d => ({
        request_number: d.request_number,
        detail_id: d.id,
        sales_detail_id: d.sales_detail_id,
        item_number: d.item_number,
        item_name: d.item_name,
        specifications: d.specifications,
        basic_unit: d.basic_unit,
        product_drawing_number: d.product_drawing_number,
        ship_quantity: d._selectedQty,
        batch_items: d._batches
          .filter((b: any) => b._checked && b._outQty > 0)
          .map((b: any) => ({ batch_number: b.batch_number, quantity: b._outQty }))
      }))
    })
    if (res?.success) {
      const soNum = res.data?.shippingOrderNumber
      if (soNum) {
        message.success(`出库成功，已自动生成发货单：${soNum}`)
      } else {
        message.success('出库成功，发货申请已自动更新为"已发货"状态')
      }
      outboundVisible.value = false
      selectedRowKeys.value = []
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '出库操作失败')
  } finally {
    submitLoading.value = false
  }
}

onMounted(() => {
  fetchOpenPeriods()
  fetchWarehouseOptions()
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px">
      <div style="display: flex; gap: 8px; align-items: center">
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索发货申请号/客户/产品"
          style="width: 300px"
          @search="handleSearch"
          @pressEnter="handleSearch"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
        <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
      </div>
      <div>
        <a-button type="primary" danger @click="handleOutbound" :disabled="selectedRowKeys.length === 0">
          <ExportOutlined /> 确认出库 ({{ selectedRowKeys.length }})
        </a-button>
      </div>
    </div>

    <a-alert
      message="出库说明：选择待出库明细后，指定出库仓库，系统将按先进先出(FIFO)自动分配批次并显示明细，您可手动调整批次和数量后确认出库。"
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
      row-key="id"
      :scroll="{ x: 1500 }"
      size="small"
      bordered
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'ship_quantity'">
          <span style="color: #fa541c; font-weight: 600">{{ record.ship_quantity }}</span>
        </template>
        <template v-else-if="column.key === 'delivery_date'">
          {{ formatDate(record.delivery_date) }}
        </template>
        <template v-else-if="column.key === 'request_date'">
          {{ formatDate(record.request_date) }}
        </template>
      </template>
    </a-table>

    <!-- 出库弹窗 -->
    <a-modal
      v-model:open="outboundVisible"
      title="发货出库确认"
      width="1100px"
      :bodyStyle="{ maxHeight: '75vh', overflowY: 'auto' }"
      @ok="handleOutboundSubmit"
      :confirmLoading="submitLoading"
      okText="确认出库"
    >
      <a-form layout="inline" style="margin-bottom: 16px">
        <a-form-item label="出库仓库" required>
          <a-select
            v-model:value="outboundWarehouse.warehouse_number"
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
          <a-input v-model:value="outboundRemark" placeholder="可选" style="width: 300px" />
        </a-form-item>
        <a-form-item label="会计期间">
          <a-select v-model:value="outboundAccountingPeriod" style="width: 150px"
            :loading="openPeriodLoading" placeholder="请选择会计期间">
            <a-select-option v-for="opt in openPeriodOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</a-select-option>
            <a-select-option v-if="noOpenPeriod" disabled value="">无已开启期间</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>

      <a-spin :spinning="batchLoading">
        <a-table
          :columns="outboundColumns"
          :data-source="outboundItems"
          :pagination="false"
          row-key="id"
          size="small"
          bordered
          :scroll="{ x: 900 }"
          :expandedRowKeys="expandedKeys"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'ship_quantity'">
              <span style="font-weight: 600">{{ record.ship_quantity }}</span>
            </template>
            <template v-else-if="column.key === '_selectedQty'">
              <span v-if="!record._batches || record._batches.length === 0" style="color: #999">
                {{ outboundWarehouse.warehouse_number ? '无库存' : '请选仓库' }}
              </span>
              <span v-else>
                <span :style="{ color: record._selectedQty < record.ship_quantity ? '#ff4d4f' : '#52c41a', fontWeight: 600 }">
                  {{ record._selectedQty }}
                </span>
                <span style="color: #999"> / {{ record.ship_quantity }}</span>
                <span v-if="record._selectedQty < record.ship_quantity" style="color: #ff4d4f; font-size: 11px; margin-left: 4px">
                  (不足)
                </span>
              </span>
            </template>
          </template>
          <template #expandedRowRender="{ record }">
            <div v-if="record._batches && record._batches.length > 0" style="padding: 4px 0">
              <table style="width: 100%; border-collapse: collapse; font-size: 12px">
                <thead>
                  <tr style="background: #fafafa">
                    <th style="padding: 6px 8px; border: 1px solid #f0f0f0; width: 40px; text-align: center">选择</th>
                    <th style="padding: 6px 8px; border: 1px solid #f0f0f0; width: 150px">批次号</th>
                    <th style="padding: 6px 8px; border: 1px solid #f0f0f0; width: 100px; text-align: right">可用数量</th>
                    <th style="padding: 6px 8px; border: 1px solid #f0f0f0; width: 110px">入库日期</th>
                    <th style="padding: 6px 8px; border: 1px solid #f0f0f0; width: 130px">生产订单号</th>
                    <th style="padding: 6px 8px; border: 1px solid #f0f0f0; width: 140px">本次出库数量</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(batch, bi) in record._batches" :key="bi"
                    :style="{ background: batch._checked ? '#e6f7ff' : '' }">
                    <td style="padding: 4px 8px; border: 1px solid #f0f0f0; text-align: center">
                      <a-checkbox
                        :checked="batch._checked"
                        @change="(e: any) => onBatchCheck(record, batch, e.target.checked)"
                      />
                    </td>
                    <td style="padding: 4px 8px; border: 1px solid #f0f0f0">{{ batch.batch_number }}</td>
                    <td style="padding: 4px 8px; border: 1px solid #f0f0f0; text-align: right; color: #1890ff; font-weight: 600">
                      {{ batch.available_qty }}
                    </td>
                    <td style="padding: 4px 8px; border: 1px solid #f0f0f0">{{ formatDate(batch.inbound_date) }}</td>
                    <td style="padding: 4px 8px; border: 1px solid #f0f0f0">{{ batch.production_order_number || '-' }}</td>
                    <td style="padding: 4px 8px; border: 1px solid #f0f0f0">
                      <a-input-number
                        :value="batch._outQty"
                        :min="0"
                        :max="batch.available_qty"
                        :precision="4"
                        size="small"
                        style="width: 120px"
                        :disabled="!batch._checked"
                        @change="(val: number | null) => onBatchQtyChange(record, batch, val)"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else style="padding: 8px; color: #999; text-align: center">
              {{ outboundWarehouse.warehouse_number ? '该产品在此仓库无可用批次库存' : '请先选择出库仓库' }}
            </div>
          </template>
        </a-table>
      </a-spin>
    </a-modal>
  </div>
</template>
