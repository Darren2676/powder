<template>
  <a-card :bordered="false" style="margin:12px 24px">
    <!-- 标题栏 -->
    <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:nowrap;overflow-x:auto">
      <span style="font-size:18px;font-weight:600;white-space:nowrap;flex-shrink:0">有效期管理报告</span>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:nowrap">
        <a-select v-model:value="filterWarehouse" placeholder="仓库" allow-clear style="width:160px" @change="fetchData">
          <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number">{{ w.warehouse_name }}</a-select-option>
        </a-select>
        <a-select v-model:value="filterItemType" placeholder="物料类型" allow-clear style="width:120px" @change="fetchData">
          <a-select-option value="原材料">原材料</a-select-option>
          <a-select-option value="半成品">半成品</a-select-option>
          <a-select-option value="成品">成品</a-select-option>
        </a-select>
        <a-select v-model:value="filterExpireStatus" placeholder="到期状态" allow-clear style="width:120px" @change="fetchData">
          <a-select-option value="未到期">未到期</a-select-option>
          <a-select-option value="即将到期">即将到期</a-select-option>
          <a-select-option value="已到期">已到期</a-select-option>
        </a-select>
        <a-input v-model:value="searchText" placeholder="物料编号/名称" allow-clear style="width:180px" @pressEnter="fetchData" />
        <a-button type="primary" @click="fetchData">查询</a-button>
        <a-button @click="handleReset">重置</a-button>
      </div>
    </div>

    <!-- 表格 -->
    <a-table :columns="columns" :data-source="tableData" :loading="loading" row-key="batch_number"
      :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t:number) => `共 ${t} 条` }"
      @change="handleTableChange" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'expire_status'">
          <a-tag :color="record.expire_status === '已到期' ? 'red' : record.expire_status === '即将到期' ? 'orange' : 'green'">{{ record.expire_status }}</a-tag>
        </template>
        <template v-if="column.dataIndex === 'production_date'">
          {{ record.production_date ? record.production_date.substring(0, 10) : (record.inbound_date ? record.inbound_date.substring(0, 10) : '-') }}
        </template>
        <template v-if="column.dataIndex === 'expiry_date'">
          {{ record.expiry_date ? record.expiry_date.substring(0, 10) : '-' }}
        </template>
        <template v-if="column.dataIndex === 'quantity'">
          {{ Number(record.quantity || 0).toFixed(record.item_type === '成品' ? 0 : 2) }}
        </template>
      </template>
    </a-table>
  </a-card>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { getShelfLifeReport } from '@/api/warehouse/shelfLifeReport'
import { getWarehouses } from '@/api/master-data/warehouse'

const searchText = ref('')
const filterWarehouse = ref<string | undefined>(undefined)
const filterItemType = ref<string | undefined>(undefined)
const filterExpireStatus = ref<string | undefined>(undefined)
const loading = ref(false)
const tableData = ref<any[]>([])
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const warehouseOptions = ref<any[]>([])

const columns = [
  { title: '工厂', dataIndex: 'factory_short', width: 80, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '批次号', dataIndex: 'batch_number', width: 120 },
  { title: '物料编号', dataIndex: 'item_number', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', width: 140 },
  { title: '物料类型', dataIndex: 'item_type', width: 80 },
  { title: '仓库', dataIndex: 'warehouse_name', width: 120 },
  { title: '库存数量', dataIndex: 'quantity', width: 90 },
  { title: '生产日期', dataIndex: 'production_date', width: 110 },
  { title: '有效天数', dataIndex: 'shelf_life_days', width: 80 },
  { title: '到期日', dataIndex: 'expiry_date', width: 110 },
  { title: '到期状态', dataIndex: 'expire_status', width: 90 },
]

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getShelfLifeReport({
      page: pagination.current, limit: pagination.pageSize,
      warehouse_number: filterWarehouse.value || undefined,
      item_type: filterItemType.value || undefined,
      expire_status: filterExpireStatus.value || undefined,
      search: searchText.value || undefined,
    })
    tableData.value = res.data.items || []
    pagination.total = res.data.total || 0
  } catch { message.error('获取数据失败') }
  finally { loading.value = false }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleReset = () => {
  searchText.value = ''
  filterWarehouse.value = undefined
  filterItemType.value = undefined
  filterExpireStatus.value = undefined
  pagination.current = 1
  fetchData()
}

const loadWarehouses = async () => {
  try {
    const res = await getWarehouses({ limit: 999 })
    warehouseOptions.value = res.data?.items || []
  } catch { warehouseOptions.value = [] }
}

onMounted(() => { fetchData(); loadWarehouses() })
</script>
