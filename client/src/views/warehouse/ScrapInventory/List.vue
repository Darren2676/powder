<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { getScrapInventory, getScrapBatchDetail } from '@/api/warehouse/scrapDisposal'
import { getFactories } from '@/api/system/factory'
import { useModalDrag } from '@/composables/useModalDrag'
import dayjs from 'dayjs'

const { modalStyle: batchModalStyle, onDragStart: onBatchDragStart, resetDrag: resetBatchDrag } = useModalDrag()

const formatDateTime = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

// ==================== 库存列表 ====================
const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterFactory = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const warehouse = ref<any>(null)

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const columns = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 150 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 180 },
  { title: '规格型号', dataIndex: 'specifications', key: 'specifications', width: 150 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 70 },
  { title: '库存数量', dataIndex: 'total_quantity', key: 'total_quantity', width: 110 },
  { title: '批次数', dataIndex: 'batch_count', key: 'batch_count', width: 80 },
  {
    title: '最早入库',
    dataIndex: 'earliest_inbound',
    key: 'earliest_inbound',
    width: 150,
    customRender: ({ text }: { text: any }) => formatDateTime(text)
  },
  {
    title: '最近入库',
    dataIndex: 'latest_inbound',
    key: 'latest_inbound',
    width: 150,
    customRender: ({ text }: { text: any }) => formatDateTime(text)
  },
  { title: '操作', key: 'action', width: 100, fixed: 'right' as const }
]

const fetchInventory = async () => {
  loading.value = true
  try {
    const res: any = await getScrapInventory({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value,
      factory_id: filterFactory.value || undefined
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
      warehouse.value = res.data.warehouse || null
    }
  } catch {
    message.error('获取报废仓库存失败')
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchInventory()
}

const handleSearch = () => {
  pagination.current = 1
  fetchInventory()
}

const handleReset = () => {
  searchText.value = ''; filterFactory.value = undefined
  pagination.current = 1; fetchInventory()
}

// 加载工厂列表
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data?.items || [] }
  } catch (e) { /* ignore */ }
}

// ==================== 批次明细弹窗 ====================
const batchVisible = ref(false)
const batchItemNumber = ref('')
const batchItemName = ref('')
const batchLoading = ref(false)
const batchDataSource = ref<any[]>([])

const batchColumns = [
  { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 180 },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 150 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 180 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 70 },
  { title: '当前数量', dataIndex: 'quantity', key: 'quantity', width: 100 },
  { title: '初始数量', dataIndex: 'initial_quantity', key: 'initial_quantity', width: 100 },
  {
    title: '入库日期',
    dataIndex: 'inbound_date',
    key: 'inbound_date',
    width: 150,
    customRender: ({ text }: { text: any }) => formatDateTime(text)
  }
]

const showBatchDetail = async (record: any) => {
  batchItemNumber.value = record.item_number
  batchItemName.value = record.item_name
  batchLoading.value = true
  batchVisible.value = true
  resetBatchDrag()
  try {
    const res: any = await getScrapBatchDetail(record.item_number)
    if (res?.success) {
      batchDataSource.value = res.data.items || []
    }
  } catch {
    message.error('获取批次明细失败')
  } finally {
    batchLoading.value = false
  }
}

onMounted(() => {
  fetchInventory(); loadFactories()
})
</script>

<template>
  <div class="scrap-inventory-page">
    <a-card :bordered="false">
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
        <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">报废仓库存</span>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
          <a-input v-model:value="searchText" placeholder="搜索物料编号/名称" allow-clear style="width: 220px" @pressEnter="handleSearch">
            <template #prefix><SearchOutlined /></template>
          </a-input>
          <a-button @click="handleSearch"><SearchOutlined /> 查询</a-button>
          <a-button @click="handleReset"><ReloadOutlined /> 重置</a-button>
          <a-select v-model:value="filterFactory" placeholder="工厂" style="width: 120px" allowClear @change="handleSearch">
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
          <a-tag v-if="warehouse" color="blue">{{ warehouse.warehouse_name }} ({{ warehouse.warehouse_number }})</a-tag>
        </div>
      </div>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 1100 }"
        row-key="item_number"
        size="small"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'total_quantity'">
            <span :style="{ color: record.total_quantity > 0 ? '#1890ff' : '#999', fontWeight: 'bold' }">{{ record.total_quantity }}</span>
          </template>
          <template v-if="column.key === 'action'">
            <a-button type="link" size="small" @click="showBatchDetail(record)">批次明细</a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 批次明细弹窗 -->
    <a-modal
      v-model:open="batchVisible"
      width="800px"
      :style="batchModalStyle"
      :footer="null"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onBatchDragStart($event)">
          批次明细 - {{ batchItemName }} ({{ batchItemNumber }})
        </div>
      </template>
      <a-table
        :columns="batchColumns"
        :data-source="batchDataSource"
        :loading="batchLoading"
        :pagination="false"
        row-key="batch_number"
        size="small"
        :scroll="{ x: 900 }"
      />
    </a-modal>
  </div>
</template>

<style scoped>
.scrap-inventory-page {
  padding: 0;
}
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
