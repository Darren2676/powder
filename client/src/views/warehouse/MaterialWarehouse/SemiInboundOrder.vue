<script setup lang="ts">
import { ref, reactive, createVNode, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined, EyeOutlined, UndoOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { getSemiInboundOrderList, getSemiInboundOrderDetail, withdrawSemiInboundOrder } from '@/api/warehouse/materialWarehouse'
import { useModalDrag } from '@/composables/useModalDrag'
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
  { title: '入库单号', dataIndex: 'inbound_order_number', key: 'inbound_order_number', width: 180 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 130 },
  { title: '入库项数', dataIndex: 'total_items', key: 'total_items', width: 90, align: 'center' as const },
  { title: '入库总数量', dataIndex: 'total_quantity', key: 'total_quantity', width: 120, align: 'right' as const },
  { title: '会计期间', dataIndex: 'accounting_period', key: 'accounting_period', width: 100 },
  { title: '操作人', dataIndex: 'operator', key: 'operator', width: 100 },
  { title: '入库日期', dataIndex: 'inbound_date', key: 'inbound_date', width: 160 },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '操作', key: 'action', width: 120, fixed: 'right' as const }
]

const formatDateTime = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getSemiInboundOrderList({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取半成品入库单列表失败')
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

// ==================== 撤回 ====================
const handleWithdraw = (record: any) => {
  Modal.confirm({
    title: '确认撤回半成品生产入库',
    icon: createVNode(ExclamationCircleOutlined),
    content: `将撤回入库单「${record.inbound_order_number}」的所有入库操作，已入库的半成品批次将被清除，倒冲扣减的物料将被回退。此操作不可撤销，确定继续？`,
    okText: '确定撤回',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawSemiInboundOrder(record.inbound_order_number)
        if (res?.success) {
          message.success('撤回成功，库存已回退')
          fetchData()
        } else {
          message.error(res?.message || '撤回失败')
        }
      } catch (err: any) {
        message.error(err.response?.data?.message || '撤回失败')
      }
    }
  })
}

// ==================== 详情弹窗 ====================
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailHeader = ref<any>({})
const detailItems = ref<any[]>([])
const { modalStyle, onDragStart, resetDrag } = useModalDrag()

const detailColumns = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 50, align: 'center' as const },
  { title: '生产单编号', dataIndex: 'production_order_number', key: 'production_order_number', width: 160 },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 160 },
  { title: '物料类型', dataIndex: 'item_type', key: 'item_type', width: 90 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60 },
  { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 150 },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 100, align: 'right' as const },
  { title: '入库数量', dataIndex: 'inbound_quantity', key: 'inbound_quantity', width: 100, align: 'right' as const },
  { title: '流水号', dataIndex: 'transaction_number', key: 'transaction_number', width: 160 }
]

const handleView = async (record: any) => {
  detailLoading.value = true
  detailVisible.value = true
  resetDrag()
  try {
    const res: any = await getSemiInboundOrderDetail(record.inbound_order_number)
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
    <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
      <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">半成品生产入库单</span>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
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
      :scroll="{ x: 1300 }"
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
        <template v-else-if="column.key === 'status'">
          <a-tag :color="(record.status || '').trim() === '已撤回' ? 'red' : 'green'">
            {{ record.status || '正常' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="handleView(record)">
              <EyeOutlined /> 查看
            </a-button>
            <a-button
              v-if="(record.status || '').trim() !== '已撤回'"
              type="link" danger size="small"
              @click="handleWithdraw(record)"
            >
              <UndoOutlined /> 撤回
            </a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 详情弹窗 -->
    <a-modal
      v-model:open="detailVisible"
      width="1100px"
      :bodyStyle="{ maxHeight: '75vh', overflowY: 'auto' }"
      :footer="null"
      :style="modalStyle"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onDragStart">半成品生产入库单详情</div>
      </template>
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
          <a-descriptions-item label="状态">
            <a-tag :color="(detailHeader.status || '').trim() === '已撤回' ? 'red' : 'green'">
              {{ detailHeader.status || '正常' }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item v-if="(detailHeader.status || '').trim() === '已撤回'" label="撤回操作人">{{ detailHeader.withdraw_operator }}</a-descriptions-item>
          <a-descriptions-item v-if="(detailHeader.status || '').trim() === '已撤回'" label="撤回时间">{{ formatDateTime(detailHeader.withdraw_date) }}</a-descriptions-item>
          <a-descriptions-item v-if="(detailHeader.status || '').trim() !== '已撤回'" label="备注" :span="2">{{ detailHeader.remark || '-' }}</a-descriptions-item>
          <a-descriptions-item v-else label="备注">{{ detailHeader.remark || '-' }}</a-descriptions-item>
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
          </template>
        </a-table>
      </a-spin>
    </a-modal>
  </div>
</template>

<style scoped>
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
