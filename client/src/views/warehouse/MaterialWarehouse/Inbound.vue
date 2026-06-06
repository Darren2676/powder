<template>
  <div style="padding: 0 0 20px 0;">
    <a-page-header title="采购入库" style="padding: 0; margin: 0 0 8px 0;" />

    <a-card :bordered="false" size="small">
      <a-row :gutter="12" style="margin-bottom:12px;">
        <a-col :span="5">
          <a-select v-model:value="manualWarehouse" placeholder="选择入库仓库" size="small" style="width:100%;" label-in-value :options="warehouseOpts" :field-names="{ label: 'warehouse_name', value: 'warehouse_number' }" />
        </a-col>
        <a-col :span="4">
          <a-select v-model:value="manualAccountingPeriod" placeholder="会计期间" size="small" style="width:100%;" :loading="openPeriodLoading">
            <a-select-option v-for="opt in openPeriodOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</a-select-option>
            <a-select-option v-if="noOpenPeriod" disabled value="">无已开启期间</a-select-option>
          </a-select>
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
          <template v-if="column.key === 'production_date'">
            <a-date-picker v-model:value="record.production_date" size="small" style="width:100%;" value-format="YYYY-MM-DD" placeholder="生产日期" />
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { manualInbound, getItemOptions, getWarehouseOptions } from '@/api/warehouse/materialWarehouse'
import { useOpenAccountingPeriods } from '@/composables/useOpenAccountingPeriods'

const saving = ref(false)
const warehouseOpts = ref<any[]>([])

const { openPeriodOptions, openPeriodLoading, noOpenPeriod, fetchOpenPeriods, getDefaultPeriod } = useOpenAccountingPeriods()

// ==================== 原材料手工入库 ====================
let manualSeq = 0
const manualWarehouse = ref<any>(null)
const manualAccountingPeriod = ref('')
const manualRemark = ref('')
const manualItems = ref<any[]>([])

const manualColumns = [
  { title: '物料编号/名称', key: 'item_search', width: 220 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', width: 60 },
  { title: '数量', key: 'quantity', width: 100 },
  { title: '批次号', key: 'batch_number', width: 130 },
  { title: '生产日期', key: 'production_date', width: 130 },
  { title: '供应商', key: 'supplier', width: 140 },
  { title: '操作', key: 'action', width: 60 }
]

const addManualRow = () => {
  manualItems.value.push({ _key: ++manualSeq, item_number: '', item_name: '', item_type: '原材料', specifications: '', basic_unit: '', quantity: null, batch_number: '', supplier_number: '', supplier_name: '', item_keyword: '', _options: [], production_date: null })
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
    await manualInbound({ items: validItems, warehouse_number: manualWarehouse.value.value, warehouse_name: manualWarehouse.value.label, accounting_period: manualAccountingPeriod.value, remark: manualRemark.value })
    message.success('入库成功')
    manualItems.value = []
  } catch (err: any) { message.error(err?.response?.data?.message || '入库失败') }
  finally { saving.value = false }
}

onMounted(async () => {
  fetchOpenPeriods()
  try {
    const res: any = await getWarehouseOptions()
    warehouseOpts.value = res?.data || []
  } catch { /* ignore */ }
})
</script>