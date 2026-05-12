<template>
  <div style="padding: 20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:nowrap;overflow-x:auto">
      <h3 style="margin:0;white-space:nowrap;flex-shrink:0">物料流水记录</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:nowrap">
        <a-input-search v-model:value="searchText" placeholder="搜索流水号/单号/物料" style="width:260px;flex-shrink:0" size="small" @search="handleSearch" allow-clear />
        <a-select v-model:value="filterTxnType" placeholder="出入库类型" allow-clear size="small" style="width:120px;flex-shrink:0" @change="handleSearch">
          <a-select-option value="入库">入库</a-select-option>
          <a-select-option value="出库">出库</a-select-option>
        </a-select>
        <a-select v-model:value="filterSourceType" placeholder="来源类型" allow-clear size="small" style="width:120px;flex-shrink:0" @change="handleSearch">
          <a-select-option value="采购入库">采购入库</a-select-option>
          <a-select-option value="生产入库">生产入库</a-select-option>
          <a-select-option value="领料出库">领料出库</a-select-option>
          <a-select-option value="手动出库">手动出库</a-select-option>
          <a-select-option value="手动调整">手动调整</a-select-option>
        </a-select>
        <a-select v-model:value="filterItemType" placeholder="物料类型" allow-clear size="small" style="width:120px;flex-shrink:0" @change="handleSearch">
          <a-select-option value="原材料">原材料</a-select-option>
          <a-select-option value="半成品">半成品</a-select-option>
        </a-select>
        <a-tooltip title="列设置"><a-button size="small" @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
      </div>
    </div>

    <a-table :columns="columns" :data-source="dataSource" :loading="loading" :pagination="pagination" size="small" bordered row-key="id" :scroll="{ x: 'max-content' }" @change="handleTableChange" @resizeColumn="handleResizeColumn">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'transaction_type'">
          <a-tag :color="record.transaction_type === '入库' ? 'green' : 'orange'">{{ record.transaction_type }}</a-tag>
        </template>
        <template v-if="column.key === 'source_type'">
          <a-tag :color="sourceTypeColor(record.source_type)">{{ record.source_type }}</a-tag>
        </template>
        <template v-if="column.key === 'item_type'">
          <a-tag :color="record.item_type === '原材料' ? 'blue' : 'green'">{{ record.item_type }}</a-tag>
        </template>
        <template v-if="column.key === 'operation_date'">
          {{ record.operation_date ? dayjs(record.operation_date).format('YYYY-MM-DD HH:mm') : '-' }}
        </template>
      </template>
    </a-table>

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

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SettingOutlined } from '@ant-design/icons-vue'
import { getTransactionList } from '@/api/warehouse/materialWarehouse'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import dayjs from 'dayjs'

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterTxnType = ref<string | undefined>(undefined)
const filterSourceType = ref<string | undefined>(undefined)
const filterItemType = ref<string | undefined>(undefined)

const pagination = reactive({ current: 1, pageSize: 10, total: 0, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` })

const defaultDataColumns: any[] = [
  { title: '流水号', dataIndex: 'transaction_number', key: 'transaction_number', width: 160, resizable: true },
  { title: '类型', dataIndex: 'transaction_type', key: 'transaction_type', width: 70, resizable: true },
  { title: '来源', dataIndex: 'source_type', key: 'source_type', width: 90, resizable: true },
  { title: '来源单号', dataIndex: 'source_number', key: 'source_number', width: 160, resizable: true },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 120, resizable: true },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 140, resizable: true },
  { title: '物料类型', dataIndex: 'item_type', key: 'item_type', width: 80, resizable: true },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 110, resizable: true },
  { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80, resizable: true },
  { title: '变前', dataIndex: 'before_quantity', key: 'before_quantity', width: 80, resizable: true },
  { title: '变后', dataIndex: 'after_quantity', key: 'after_quantity', width: 80, resizable: true },
  { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 110, resizable: true },
  { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', width: 120, resizable: true },
  { title: '操作人', dataIndex: 'operator', key: 'operator', width: 80, resizable: true },
  { title: '时间', dataIndex: 'operation_date', key: 'operation_date', width: 150, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('mw_transactions', defaultDataColumns, {
  fixedLeft: [],
  fixedRight: []
})

const sourceTypeColor = (t: string) => {
  const map: Record<string, string> = { '采购入库': 'green', '生产入库': 'blue', '领料出库': 'orange', '手动出库': 'red', '手动调整': 'default' }
  return map[t] || 'default'
}

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getTransactionList({
      page: pagination.current, limit: pagination.pageSize, search: searchText.value,
      transaction_type: filterTxnType.value || '', source_type: filterSourceType.value || '',
      item_type: filterItemType.value || ''
    })
    dataSource.value = res?.data?.items || []
    pagination.total = res?.data?.total || 0
  } catch { message.error('查询失败') }
  finally { loading.value = false }
}

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleTableChange = (p: any) => { pagination.current = p.current; pagination.pageSize = p.pageSize; fetchData() }

onMounted(async () => {
  await loadColumnPreference()
  fetchData()
})
</script>
