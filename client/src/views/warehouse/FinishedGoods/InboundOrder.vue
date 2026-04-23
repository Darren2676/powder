<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons-vue'
import { getInboundOrderList, getInboundOrderDetail } from '@/api/warehouse/finishedGoods'
import dayjs from 'dayjs'

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')

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
  { title: '入库单号', dataIndex: 'inbound_order_number', key: 'inbound_order_number', width: 170 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 130 },
  { title: '入库项数', dataIndex: 'total_items', key: 'total_items', width: 90, align: 'center' as const },
  { title: '入库总数量', dataIndex: 'total_quantity', key: 'total_quantity', width: 120, align: 'right' as const },
  { title: '会计期间', dataIndex: 'accounting_period', key: 'accounting_period', width: 100 },
  { title: '操作人', dataIndex: 'operator', key: 'operator', width: 100 },
  { title: '入库日期', dataIndex: 'inbound_date', key: 'inbound_date', width: 160 },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true },
  { title: '操作', key: 'action', width: 80, fixed: 'right' as const }
]

const formatDateTime = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getInboundOrderList({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取生产入库单列表失败')
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

// ==================== 详情弹窗 ====================
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailHeader = ref<any>({})
const detailItems = ref<any[]>([])

const detailColumns = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 50, align: 'center' as const },
  { title: '生产单编号', dataIndex: 'production_order_number', key: 'production_order_number', width: 160 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 130 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 160 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60 },
  { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 150 },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 100, align: 'right' as const },
  { title: '入库数量', dataIndex: 'inbound_quantity', key: 'inbound_quantity', width: 100, align: 'right' as const },
  { title: '质量状态', dataIndex: 'quality_status', key: 'quality_status', width: 90 },
  { title: '流水号', dataIndex: 'transaction_number', key: 'transaction_number', width: 160 }
]

const handleView = async (record: any) => {
  detailLoading.value = true
  detailVisible.value = true
  try {
    const res: any = await getInboundOrderDetail(record.inbound_order_number)
    if (res?.success) {
      detailHeader.value = res.data.header
      detailItems.value = res.data.details || []
    }
  } catch {
    message.error('获取入库单详情失败')
  } finally {
    detailLoading.value = false
  }
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px">
      <div style="display: flex; gap: 8px; align-items: center">
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索入库单号/仓库/操作人"
          style="width: 300px"
          @search="handleSearch"
          @pressEnter="handleSearch"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
        <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
      </div>
    </div>

    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      row-key="id"
      :scroll="{ x: 1200 }"
      size="small"
      bordered
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'inbound_order_number'">
          <a @click="handleView(record)" style="color: #1890ff; cursor: pointer">{{ record.inbound_order_number }}</a>
        </template>
        <template v-else-if="column.key === 'total_quantity'">
          <span style="color: #52c41a; font-weight: 600">{{ record.total_quantity }}</span>
        </template>
        <template v-else-if="column.key === 'inbound_date'">
          {{ formatDateTime(record.inbound_date) }}
        </template>
        <template v-else-if="column.key === 'action'">
          <a-button type="link" size="small" @click="handleView(record)">
            <EyeOutlined /> 查看
          </a-button>
        </template>
      </template>
    </a-table>

    <!-- 详情弹窗 -->
    <a-modal
      v-model:open="detailVisible"
      title="生产入库单详情"
      width="1100px"
      :bodyStyle="{ maxHeight: '75vh', overflowY: 'auto' }"
      :footer="null"
    >
      <a-spin :spinning="detailLoading">
        <a-descriptions bordered size="small" :column="3" style="margin-bottom: 16px">
          <a-descriptions-item label="入库单号">
            <span style="font-weight: 600">{{ detailHeader.inbound_order_number }}</span>
          </a-descriptions-item>
          <a-descriptions-item label="仓库">{{ detailHeader.warehouse_name }}</a-descriptions-item>
          <a-descriptions-item label="会计期间">{{ detailHeader.accounting_period || '-' }}</a-descriptions-item>
          <a-descriptions-item label="入库项数">{{ detailHeader.total_items }}</a-descriptions-item>
          <a-descriptions-item label="入库总数量">
            <span style="color: #52c41a; font-weight: 600">{{ detailHeader.total_quantity }}</span>
          </a-descriptions-item>
          <a-descriptions-item label="操作人">{{ detailHeader.operator }}</a-descriptions-item>
          <a-descriptions-item label="入库日期">{{ formatDateTime(detailHeader.inbound_date) }}</a-descriptions-item>
          <a-descriptions-item label="备注" :span="2">{{ detailHeader.remark || '-' }}</a-descriptions-item>
        </a-descriptions>

        <div style="font-weight: 600; margin-bottom: 8px">入库明细</div>
        <a-table
          :columns="detailColumns"
          :data-source="detailItems"
          :pagination="false"
          row-key="id"
          size="small"
          bordered
          :scroll="{ x: 1300 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'inbound_quantity'">
              <span style="color: #52c41a; font-weight: 600">{{ record.inbound_quantity }}</span>
            </template>
            <template v-else-if="column.key === 'quality_status'">
              <a-tag :color="record.quality_status === '合格品' ? 'green' : 'red'">{{ record.quality_status }}</a-tag>
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-modal>
  </div>
</template>
