<template>
  <div style="padding: 0 0 20px 0;">
    <a-page-header title="物料流水记录" style="padding: 0; margin: 0 0 8px 0;" />

    <a-card :bordered="false" size="small" style="margin-bottom:8px;">
      <a-row :gutter="12" align="middle">
        <a-col :span="6">
          <a-input-search v-model:value="searchText" placeholder="搜索流水号/单号/物料" enter-button size="small" @search="handleSearch" />
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="filterTxnType" placeholder="出入库类型" allow-clear size="small" style="width:100%;" @change="handleSearch">
            <a-select-option value="入库">入库</a-select-option>
            <a-select-option value="出库">出库</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="filterSourceType" placeholder="来源类型" allow-clear size="small" style="width:100%;" @change="handleSearch">
            <a-select-option value="采购入库">采购入库</a-select-option>
            <a-select-option value="生产入库">生产入库</a-select-option>
            <a-select-option value="领料出库">领料出库</a-select-option>
            <a-select-option value="手动出库">手动出库</a-select-option>
            <a-select-option value="手动调整">手动调整</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="filterItemType" placeholder="物料类型" allow-clear size="small" style="width:100%;" @change="handleSearch">
            <a-select-option value="原材料">原材料</a-select-option>
            <a-select-option value="半成品">半成品</a-select-option>
          </a-select>
        </a-col>
      </a-row>
    </a-card>

    <a-table :columns="columns" :data-source="dataSource" :loading="loading" :pagination="pagination" size="small" bordered row-key="id" :scroll="{ x: 1800 }" @change="handleTableChange">
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
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { getTransactionList } from '@/api/warehouse/materialWarehouse'

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterTxnType = ref<string | undefined>(undefined)
const filterSourceType = ref<string | undefined>(undefined)
const filterItemType = ref<string | undefined>(undefined)

const pagination = reactive({ current: 1, pageSize: 10, total: 0, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` })

const columns = [
  { title: '流水号', dataIndex: 'transaction_number', width: 160 },
  { title: '类型', key: 'transaction_type', width: 70 },
  { title: '来源', key: 'source_type', width: 90 },
  { title: '来源单号', dataIndex: 'source_number', width: 160 },
  { title: '物料编号', dataIndex: 'item_number', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', width: 140 },
  { title: '物料类型', key: 'item_type', width: 80 },
  { title: '仓库', dataIndex: 'warehouse_name', width: 110 },
  { title: '数量', dataIndex: 'quantity', width: 80 },
  { title: '变前', dataIndex: 'before_quantity', width: 80 },
  { title: '变后', dataIndex: 'after_quantity', width: 80 },
  { title: '批次号', dataIndex: 'batch_number', width: 110 },
  { title: '供应商', dataIndex: 'supplier_name', width: 120 },
  { title: '操作人', dataIndex: 'operator', width: 80 },
  { title: '时间', dataIndex: 'operation_date', width: 150 }
]

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

onMounted(() => { fetchData() })
</script>
