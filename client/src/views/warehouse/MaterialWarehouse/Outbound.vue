<template>
  <div style="padding: 0 0 20px 0;">
    <a-page-header title="物料出库" style="padding: 0; margin: 0 0 8px 0;" />

    <a-alert message="生产领料时系统会自动扣减库存，此页面用于手动出库或调整。" type="info" show-icon style="margin-bottom:8px;" />

    <a-card :bordered="false" size="small">
      <a-form layout="vertical" style="max-width:600px;">
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="物料">
              <a-auto-complete v-model:value="itemKeyword" :options="itemOpts" size="small" style="width:100%;" placeholder="输入物料编号搜索" @search="onSearch" @select="onSelect">
                <template #option="{ label }">{{ label }}</template>
              </a-auto-complete>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="仓库">
              <a-select v-model:value="form.warehouse_number" placeholder="选择仓库" size="small" style="width:100%;" @change="onWarehouseChange">
                <a-select-option v-for="w in warehouseOpts" :key="w.warehouse_number" :value="w.warehouse_number">{{ w.warehouse_name }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6">
            <a-form-item label="当前库存">
              <span style="font-size:16px;font-weight:600;color:#1890ff;">{{ currentStock }}</span> {{ form.basic_unit }}
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="出库数量">
              <a-input-number v-model:value="form.quantity" :min="0.0001" :max="currentStock" size="small" style="width:100%;" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="批次号">
              <a-input v-model:value="form.batch_number" size="small" placeholder="可选" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="会计期间">
              <a-select v-model:value="form.accounting_period" placeholder="请选择" size="small" style="width:100%;" :loading="openPeriodLoading">
                <a-select-option v-for="opt in openPeriodOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</a-select-option>
                <a-select-option v-if="noOpenPeriod" disabled value="">无已开启期间</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="备注">
          <a-input v-model:value="form.remark" size="small" placeholder="出库原因" />
        </a-form-item>
        <a-form-item>
          <a-button type="primary" :loading="saving" :disabled="!form.item_number || !form.warehouse_number || !form.quantity" @click="handleSubmit">确认出库</a-button>
        </a-form-item>
      </a-form>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { manualOutbound, getItemOptions, getWarehouseOptions, getInventoryList } from '@/api/warehouse/materialWarehouse'
import { useOpenAccountingPeriods } from '@/composables/useOpenAccountingPeriods'

const saving = ref(false)
const warehouseOpts = ref<any[]>([])
const itemKeyword = ref('')
const itemOpts = ref<any[]>([])
const currentStock = ref(0)

const { openPeriodOptions, openPeriodLoading, noOpenPeriod, fetchOpenPeriods, getDefaultPeriod } = useOpenAccountingPeriods()

const form = reactive({ item_number: '', item_name: '', basic_unit: '', warehouse_number: '', quantity: null as number | null, batch_number: '', accounting_period: '', remark: '' })

const onSearch = async (val: string) => {
  if (!val || val.length < 1) { itemOpts.value = []; return }
  try {
    const res: any = await getItemOptions({ keyword: val })
    const items = res?.data || []
    itemOpts.value = items.map((i: any) => ({ value: i.item_number, label: `${i.item_number} - ${i.item_name}`, raw: i }))
  } catch { /* ignore */ }
}

const onSelect = (val: string) => {
  const opt = itemOpts.value.find((o: any) => o.value === val)
  if (opt?.raw) {
    form.item_number = opt.raw.item_number
    form.item_name = opt.raw.item_name
    form.basic_unit = opt.raw.basic_unit
    itemKeyword.value = `${opt.raw.item_number} - ${opt.raw.item_name}`
    loadStock()
  }
}

const onWarehouseChange = () => { loadStock() }

const loadStock = async () => {
  if (!form.item_number || !form.warehouse_number) { currentStock.value = 0; return }
  try {
    const res: any = await getInventoryList({ search: form.item_number, warehouse_number: form.warehouse_number, limit: 1 })
    const items = res?.data?.items || []
    const match = items.find((i: any) => i.item_number === form.item_number)
    currentStock.value = match ? Number(match.quantity) : 0
  } catch { currentStock.value = 0 }
}

const handleSubmit = async () => {
  saving.value = true
  try {
    await manualOutbound(form)
    message.success('出库成功')
    form.quantity = null
    form.batch_number = ''
    form.remark = ''
    form.accounting_period = getDefaultPeriod()
    loadStock()
  } catch (err: any) { message.error(err?.response?.data?.message || '出库失败') }
  finally { saving.value = false }
}

onMounted(async () => {
  fetchOpenPeriods()
  form.accounting_period = getDefaultPeriod()
  try {
    const res: any = await getWarehouseOptions()
    warehouseOpts.value = res?.data || []
  } catch { /* ignore */ }
})
</script>
