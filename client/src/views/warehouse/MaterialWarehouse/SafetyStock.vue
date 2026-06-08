<template>
  <div style="padding: 0 0 20px 0;">
    <a-page-header title="安全库存预警" style="padding: 0; margin: 0 0 8px 0;" />

    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <a-select v-model:value="factoryFilter" placeholder="选择工厂" allow-clear size="small" style="width:130px" @change="handleFactoryChange">
        <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
      </a-select>
    </div>

    <a-alert v-if="pagination.total > 0" :message="`当前共有 ${pagination.total} 项物料低于安全库存`" type="warning" show-icon style="margin-bottom:8px;" />

    <a-table :columns="columns" :data-source="dataSource" :loading="loading" :pagination="pagination" size="small" bordered row-key="id" @change="handleTableChange">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'item_type'">
          <a-tag :color="record.item_type === '原材料' ? 'blue' : 'green'">{{ record.item_type }}</a-tag>
        </template>
        <template v-if="column.key === 'quantity'">
          <span style="color:#cf1322;font-weight:600;">{{ record.quantity }}</span>
        </template>
        <template v-if="column.key === 'shortage'">
          <span style="color:#cf1322;font-weight:600;">{{ record.shortage }}</span>
        </template>
        <template v-if="column.key === 'safety_edit'">
          <a-input-number v-model:value="record._safety_qty" :min="0" size="small" style="width:90px;" />
          <a-button type="link" size="small" :loading="record._saving" @click="handleSave(record)">保存</a-button>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { getSafetyStockAlerts, updateSafetyStock } from '@/api/warehouse/materialWarehouse'
import { getFactories } from '@/api/system/factory'

const loading = ref(false)
const dataSource = ref<any[]>([])
const factoryFilter = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch { /* ignore */ }
}
const pagination = reactive({ current: 1, pageSize: 10, total: 0, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` })

const columns = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80,
    customRender: ({ record }: any) => record.factory_short || record.factory_name_val || record.factory_name || '-' },
  { title: '物料编号', dataIndex: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', width: 150 },
  { title: '类型', key: 'item_type', width: 80 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', width: 60 },
  { title: '仓库', dataIndex: 'warehouse_name', width: 120 },
  { title: '安全库存', dataIndex: 'safety_stock_quantity', width: 90 },
  { title: '当前库存', key: 'quantity', width: 90 },
  { title: '差额', key: 'shortage', width: 80 },
  { title: '调整安全库存', key: 'safety_edit', width: 180 }
]

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getSafetyStockAlerts({ page: pagination.current, limit: pagination.pageSize, factory_id: factoryFilter.value || undefined })
    const items = (res?.data?.items || []).map((i: any) => ({ ...i, _safety_qty: i.safety_stock_quantity, _saving: false }))
    dataSource.value = items
    pagination.total = res?.data?.total || 0
  } catch { message.error('查询失败') }
  finally { loading.value = false }
}

const handleTableChange = (p: any) => { pagination.current = p.current; pagination.pageSize = p.pageSize; fetchData() }

const handleFactoryChange = () => { pagination.current = 1; fetchData() }

const handleSave = async (record: any) => {
  record._saving = true
  try {
    await updateSafetyStock({ item_number: record.item_number, warehouse_number: record.warehouse_number, safety_stock_quantity: record._safety_qty })
    message.success('保存成功')
    fetchData()
  } catch { message.error('保存失败') }
  finally { record._saving = false }
}

onMounted(() => { loadFactories(); fetchData() })
</script>
