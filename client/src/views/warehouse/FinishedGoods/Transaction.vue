<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { getTransactionList } from '@/api/warehouse/finishedGoods'
import dayjs from 'dayjs'

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const typeFilter = ref('')
const sourceFilter = ref('')

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
  { title: '流水编号', dataIndex: 'transaction_number', key: 'transaction_number', width: 170 },
  { title: '类型', dataIndex: 'transaction_type', key: 'transaction_type', width: 80 },
  { title: '来源类型', dataIndex: 'source_type', key: 'source_type', width: 100 },
  { title: '来源单号', dataIndex: 'source_number', key: 'source_number', width: 170 },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 160 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 130 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 70 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 130 },
  { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 150 },
  { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 100 },
  { title: '变动前', dataIndex: 'before_quantity', key: 'before_quantity', width: 90 },
  { title: '变动后', dataIndex: 'after_quantity', key: 'after_quantity', width: 90 },
  { title: '操作人', dataIndex: 'operator', key: 'operator', width: 100 },
  { title: '操作时间', dataIndex: 'operation_date', key: 'operation_date', width: 160 },
  { title: '会计期间', dataIndex: 'accounting_period', key: 'accounting_period', width: 100 },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 150 }
]

const formatDate = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getTransactionList({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value,
      transaction_type: typeFilter.value,
      source_type: sourceFilter.value
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取流水记录失败')
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

onMounted(fetchData)
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
      <a-input-search
        v-model:value="searchText"
        placeholder="搜索流水号/来源单号/物料编号/名称"
        style="width: 320px"
        @search="handleSearch"
        @pressEnter="handleSearch"
        allow-clear
      >
        <template #prefix><SearchOutlined /></template>
      </a-input-search>
      <a-select
        v-model:value="typeFilter"
        placeholder="出入库类型"
        style="width: 140px"
        allow-clear
        @change="handleSearch"
      >
        <a-select-option value="入库">入库</a-select-option>
        <a-select-option value="出库">出库</a-select-option>
      </a-select>
      <a-select
        v-model:value="sourceFilter"
        placeholder="来源类型"
        style="width: 140px"
        allow-clear
        @change="handleSearch"
      >
        <a-select-option value="生产入库">生产入库</a-select-option>
        <a-select-option value="发货出库">发货出库</a-select-option>
        <a-select-option value="手动调整">手动调整</a-select-option>
      </a-select>
      <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
    </div>

    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      row-key="id"
      :scroll="{ x: 2050 }"
      size="small"
      bordered
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'transaction_type'">
          <a-tag :color="record.transaction_type === '入库' ? 'green' : 'red'">
            {{ record.transaction_type }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'source_type'">
          <a-tag :color="record.source_type === '生产入库' ? 'blue' : record.source_type === '发货出库' ? 'orange' : 'default'">
            {{ record.source_type }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'quantity'">
          <span :style="{ color: record.transaction_type === '入库' ? '#52c41a' : '#ff4d4f', fontWeight: 600 }">
            {{ record.transaction_type === '入库' ? '+' : '-' }}{{ record.quantity }}
          </span>
        </template>
        <template v-else-if="column.key === 'operation_date'">
          {{ formatDate(record.operation_date) }}
        </template>
      </template>
    </a-table>
  </div>
</template>
