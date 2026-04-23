<template>
  <div style="padding: 0 0 20px 0;">
    <a-page-header title="物料入库" style="padding: 0; margin: 0 0 8px 0;" />

    <a-tabs v-model:activeKey="activeTab">
      <!-- Tab1: 原材料采购入库 -->
      <a-tab-pane key="manual" tab="原材料采购入库">
        <a-card :bordered="false" size="small">
          <a-row :gutter="12" style="margin-bottom:12px;">
            <a-col :span="6">
              <a-select v-model:value="manualWarehouse" placeholder="选择入库仓库" size="small" style="width:100%;" label-in-value :options="warehouseOpts" :field-names="{ label: 'warehouse_name', value: 'warehouse_number' }" />
            </a-col>
            <a-col :span="4">
              <a-input v-model:value="manualRemark" placeholder="入库备注" size="small" />
            </a-col>
            <a-col>
              <a-space>
                <a-button size="small" @click="addManualRow">添加物料行</a-button>
                <a-button type="primary" size="small" :loading="saving" :disabled="manualItems.length === 0" @click="handleManualSubmit">提交入库</a-button>
              </a-space>
            </a-col>
          </a-row>

          <a-table :columns="manualColumns" :data-source="manualItems" :pagination="false" size="small" bordered row-key="_key">
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'item_search'">
                <a-auto-complete v-model:value="record.item_keyword" :options="record._options" size="small" style="width:100%;" placeholder="输入编号搜索" @search="(v: string) => onItemSearch(v, index)" @select="(v: string) => onItemSelect(v, index)">
                  <template #option="{ label }">{{ label }}</template>
                </a-auto-complete>
              </template>
              <template v-if="column.key === 'quantity'">
                <a-input-number v-model:value="record.quantity" :min="0.0001" size="small" style="width:100%;" />
              </template>
              <template v-if="column.key === 'batch_number'">
                <a-input v-model:value="record.batch_number" size="small" placeholder="批次号" />
              </template>
              <template v-if="column.key === 'supplier'">
                <a-input v-model:value="record.supplier_name" size="small" placeholder="供应商" />
              </template>
              <template v-if="column.key === 'action'">
                <a-button type="link" size="small" danger @click="manualItems.splice(index, 1)">删除</a-button>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>

      <!-- Tab2: 半成品生产入库 -->
      <a-tab-pane key="production" tab="半成品生产入库">
        <a-card :bordered="false" size="small">
          <a-row :gutter="12" style="margin-bottom:12px;">
            <a-col :span="6">
              <a-input-search v-model:value="prodSearch" placeholder="搜索生产单" enter-button size="small" @search="fetchPending" />
            </a-col>
            <a-col :span="6">
              <a-select v-model:value="prodWarehouse" placeholder="选择入库仓库" size="small" style="width:100%;" label-in-value :options="warehouseOpts" :field-names="{ label: 'warehouse_name', value: 'warehouse_number' }" />
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
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { manualInbound, getPendingInbound, productionInbound, getItemOptions, getWarehouseOptions } from '@/api/warehouse/materialWarehouse'

const activeTab = ref('manual')
const saving = ref(false)
const warehouseOpts = ref<any[]>([])

// ==================== 原材料手工入库 ====================
let manualSeq = 0
const manualWarehouse = ref<any>(null)
const manualRemark = ref('')
const manualItems = ref<any[]>([])

const manualColumns = [
  { title: '物料编号/名称', key: 'item_search', width: 220 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', width: 60 },
  { title: '数量', key: 'quantity', width: 100 },
  { title: '批次号', key: 'batch_number', width: 130 },
  { title: '供应商', key: 'supplier', width: 140 },
  { title: '操作', key: 'action', width: 60 }
]

const addManualRow = () => {
  manualItems.value.push({ _key: ++manualSeq, item_number: '', item_name: '', item_type: '原材料', specifications: '', basic_unit: '', quantity: null, batch_number: '', supplier_number: '', supplier_name: '', item_keyword: '', _options: [] })
}

const onItemSearch = async (val: string, index: number) => {
  if (!val || val.length < 1) { manualItems.value[index]._options = []; return }
  try {
    const res: any = await getItemOptions({ keyword: val, item_type: '原材料' })
    const items = res?.data || []
    manualItems.value[index]._options = items.map((i: any) => ({ value: i.item_number, label: `${i.item_number} - ${i.item_name} (${i.specifications || ''})`, raw: i }))
  } catch { /* ignore */ }
}

const onItemSelect = (val: string, index: number) => {
  const opt = manualItems.value[index]._options.find((o: any) => o.value === val)
  if (opt?.raw) {
    const r = opt.raw
    Object.assign(manualItems.value[index], { item_number: r.item_number, item_name: r.item_name, item_type: r.item_type, specifications: r.specifications, basic_unit: r.basic_unit, item_keyword: `${r.item_number} - ${r.item_name}` })
  }
}

const handleManualSubmit = async () => {
  if (!manualWarehouse.value) { message.warning('请选择入库仓库'); return }
  const validItems = manualItems.value.filter(i => i.item_number && (Number(i.quantity) || 0) > 0)
  if (validItems.length === 0) { message.warning('请添加有效的入库物料'); return }

  saving.value = true
  try {
    await manualInbound({ items: validItems, warehouse_number: manualWarehouse.value.value, warehouse_name: manualWarehouse.value.label, remark: manualRemark.value })
    message.success('入库成功')
    manualItems.value = []
  } catch (err: any) { message.error(err?.response?.data?.message || '入库失败') }
  finally { saving.value = false }
}

// ==================== 半成品生产入库 ====================
const prodSearch = ref('')
const prodWarehouse = ref<any>(null)
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
  const selected = prodItems.value.filter(i => selectedProdKeys.value.includes(i.production_order_number) && (Number(i._inbound_qty) || 0) > 0)
  if (selected.length === 0) { message.warning('请选择至少一条有效入库记录'); return }

  saving.value = true
  try {
    await productionInbound({
      items: selected.map(i => ({ ...i, inbound_qty: i._inbound_qty, inbound_quantity: i.inbound_qty })),
      warehouse_number: prodWarehouse.value.value, warehouse_name: prodWarehouse.value.label, remark: ''
    })
    message.success('半成品入库成功')
    selectedProdKeys.value = []
    fetchPending()
  } catch (err: any) { message.error(err?.response?.data?.message || '入库失败') }
  finally { saving.value = false }
}

onMounted(async () => {
  try {
    const res: any = await getWarehouseOptions()
    warehouseOpts.value = res?.data || []
  } catch { /* ignore */ }
  fetchPending()
})
</script>
