<template>
  <div style="padding: 0 0 20px 0;">
    <a-page-header title="半成品生产入库" style="padding: 0; margin: 0 0 8px 0;" />

    <a-card :bordered="false" size="small">
      <a-row :gutter="12" style="margin-bottom:12px;">
        <a-col :span="5">
          <a-input-search v-model:value="prodSearch" placeholder="搜索生产单" enter-button size="small" @search="fetchPending" />
        </a-col>
        <a-col :span="5">
          <a-select v-model:value="prodWarehouse" placeholder="选择入库仓库" size="small" style="width:100%;" label-in-value :options="warehouseOpts" :field-names="{ label: 'warehouse_name', value: 'warehouse_number' }" />
        </a-col>
        <a-col :span="4">
          <a-select v-model:value="prodAccountingPeriod" placeholder="会计期间" size="small" style="width:100%;" :loading="openPeriodLoading">
            <a-select-option v-for="opt in openPeriodOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</a-select-option>
            <a-select-option v-if="noOpenPeriod" disabled value="">无已开启期间</a-select-option>
          </a-select>
        </a-col>
        <a-col>
          <a-button type="primary" size="small" :loading="saving" :disabled="selectedProdKeys.length === 0" @click="handleProdSubmit">确认入库</a-button>
        </a-col>
      </a-row>

      <a-table :columns="prodColumns" :data-source="prodItems" :loading="prodLoading" :pagination="prodPagination" size="small" bordered row-key="production_order_number" :row-selection="{ selectedRowKeys: selectedProdKeys, onChange: (keys: any[]) => { selectedProdKeys = keys } }" @change="handleProdTableChange">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'inbound_input'">
            <a-input-number v-model:value="record._inbound_qty" :min="0" :max="record.pending_inbound_qty" size="small" style="width:100px;" />
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { getPendingInbound, productionInbound, getWarehouseOptions } from '@/api/warehouse/materialWarehouse'
import { useOpenAccountingPeriods } from '@/composables/useOpenAccountingPeriods'

const saving = ref(false)
const warehouseOpts = ref<any[]>([])

const { openPeriodOptions, openPeriodLoading, noOpenPeriod, fetchOpenPeriods, getDefaultPeriod } = useOpenAccountingPeriods()

// ==================== 半成品生产入库 ====================
const prodSearch = ref('')
const prodWarehouse = ref<any>(null)
const prodAccountingPeriod = ref('')
const prodItems = ref<any[]>([])
const prodLoading = ref(false)
let selectedProdKeys = ref<any[]>([])
const prodPagination = reactive({ current: 1, pageSize: 10, total: 0, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` })

const prodColumns = [
  { title: '生产单编号', dataIndex: 'production_order_number', width: 160 },
  { title: '产品编号', dataIndex: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', width: 150 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '计划数量', dataIndex: 'planned_quantity', width: 90 },
  { title: '已入库', dataIndex: 'inbound_qty', width: 80 },
  { title: '待入库', dataIndex: 'pending_inbound_qty', width: 80 },
  { title: '本次入库', key: 'inbound_input', width: 110 }
]

const fetchPending = async () => {
  prodLoading.value = true
  try {
    const res: any = await getPendingInbound({ page: prodPagination.current, limit: prodPagination.pageSize, search: prodSearch.value })
    const items = res?.data?.items || []
    prodItems.value = items.map((i: any) => ({ ...i, _inbound_qty: i.pending_inbound_qty }))
    prodPagination.total = res?.data?.total || 0
  } catch { message.error('查询失败') }
  finally { prodLoading.value = false }
}

const handleProdTableChange = (p: any) => { prodPagination.current = p.current; prodPagination.pageSize = p.pageSize; fetchPending() }

const handleProdSubmit = async () => {
  if (!prodWarehouse.value) { message.warning('请选择入库仓库'); return }
  if (!prodAccountingPeriod.value) { message.warning('请选择会计期间'); return }
  const selected = prodItems.value.filter(i => selectedProdKeys.value.includes(i.production_order_number) && (Number(i._inbound_qty) || 0) > 0)
  if (selected.length === 0) { message.warning('请选择至少一条有效入库记录'); return }

  saving.value = true
  try {
    await productionInbound({
      items: selected.map(i => ({ ...i, inbound_qty: i._inbound_qty, inbound_quantity: i.inbound_qty })),
      warehouse_number: prodWarehouse.value.value, warehouse_name: prodWarehouse.value.label, accounting_period: prodAccountingPeriod.value, remark: ''
    }).then((res: any) => {
      const orderNo = res?.data?.inboundOrderNumber
      message.success(orderNo ? `半成品入库成功，入库单号: ${orderNo}` : '半成品入库成功')
    })
    selectedProdKeys.value = []
    fetchPending()
  } catch (err: any) { message.error(err?.response?.data?.message || '入库失败') }
  finally { saving.value = false }
}

onMounted(async () => {
  fetchOpenPeriods()
  prodAccountingPeriod.value = getDefaultPeriod()
  try {
    const res: any = await getWarehouseOptions()
    warehouseOpts.value = res?.data || []
  } catch { /* ignore */ }
  fetchPending()
})
</script>